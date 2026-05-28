"""Unit tests for ``services/depth_validation.py``.

Covers the five public helpers (Service Workbench S1):

* :func:`get_max_allocation_depth` — PlanningParameter accessor.
* :func:`compute_chain_depths_for_version` — bulk per-edge cache.
* :func:`compute_longest_path_for_version` — (length, sample_path).
* :func:`assert_within_max_depth` — save-time assertion that raises
  ``DistributionValidationError`` with a ``violating_path`` attribute.
* :func:`validate_param_change` — admin-PUT pre-flight check.

These tests deliberately build their own synthetic Distribution graphs so
they don't depend on the production seed shape — they only need the
``planning_parameters`` row from the conftest's empty schema. Each test
seeds the ``max_allocation_depth`` row inline where needed.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

from models.charging import (
    ChargeableEntity, Distribution, DistributionVersion,
)
from models.scenarios import Scenario
from models.system import PlanningParameter
from services.depth_validation import (
    assert_within_max_depth,
    compute_chain_depths_for_version,
    compute_longest_path_for_version,
    get_max_allocation_depth,
    validate_param_change,
)
from services.distribution_service import DistributionValidationError


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _seed_max_depth_param(db, value: str = "6") -> PlanningParameter:
    """Insert (or replace) the ``max_allocation_depth`` PlanningParameter."""
    existing = (
        db.query(PlanningParameter)
        .filter(PlanningParameter.key == "max_allocation_depth")
        .first()
    )
    if existing:
        existing.current_value = value
        db.flush()
        return existing
    p = PlanningParameter(
        key="max_allocation_depth",
        name="Max Allocation Depth",
        description="Maximum Stage 1 distribution chain length",
        current_value=value,
        default_value="6",
        data_type="integer",
        param_group="limits",
    )
    db.add(p)
    db.flush()
    return p


def _make_entity(db, entity_id: str) -> ChargeableEntity:
    e = ChargeableEntity(
        id=entity_id,
        entity_type="InternalService",
        identifier=f"ITF-{entity_id}",
        name=f"Entity {entity_id}",
        to_business_pct=0.0,
        annual_cost=100_000.0,
    )
    db.add(e)
    return e


def _make_version(
    db, *, status: str = "active",
    active_from: date | None = date(2025, 1, 1),
    scenario_id: int | None = None,
    rationale: str = "test seed",
) -> DistributionVersion:
    v = DistributionVersion(
        active_from=active_from, status=status,
        origin="seed", rationale=rationale, scenario_id=scenario_id,
    )
    db.add(v)
    db.flush()
    return v


def _make_edge(
    db, version: DistributionVersion, src: str, dst: str,
    pct: float = 100.0,
) -> Distribution:
    e = Distribution(
        version_id=version.id,
        source_entity_id=src,
        destination_entity_id=dst,
        percentage=Decimal(str(pct)),
    )
    db.add(e)
    db.flush()
    return e


def _make_chain(
    db, version: DistributionVersion, node_ids: list[str], pct: float = 100.0,
) -> list[Distribution]:
    """Create a linear chain ``n0 → n1 → n2 → ...``.

    Entities are created on the fly if they don't already exist.
    """
    for nid in node_ids:
        existing = db.query(ChargeableEntity).filter_by(id=nid).first()
        if existing is None:
            _make_entity(db, nid)
    db.flush()
    edges = []
    for src, dst in zip(node_ids, node_ids[1:]):
        edges.append(_make_edge(db, version, src, dst, pct))
    return edges


# ---------------------------------------------------------------------------
# get_max_allocation_depth
# ---------------------------------------------------------------------------


class TestGetMaxAllocationDepth:
    def test_returns_seeded_value(self, db):
        _seed_max_depth_param(db, "6")
        assert get_max_allocation_depth(db) == 6

    def test_returns_custom_value(self, db):
        _seed_max_depth_param(db, "4")
        assert get_max_allocation_depth(db) == 4

    def test_raises_if_param_missing(self, db):
        # No PlanningParameter seeded — should error loudly.
        with pytest.raises(ValueError, match="max_allocation_depth"):
            get_max_allocation_depth(db)

    def test_raises_if_unparseable(self, db):
        _seed_max_depth_param(db, "not-an-int")
        with pytest.raises(ValueError, match="not an integer"):
            get_max_allocation_depth(db)


# ---------------------------------------------------------------------------
# compute_chain_depths_for_version
# ---------------------------------------------------------------------------


class TestComputeChainDepthsForVersion:
    def test_linear_chain_depths(self, db):
        """A→B→C → edge A→B carries depth 2 (longest path A→B→C has 2
        edges); edge B→C carries depth 2 too. Wait — definition is
        longest *root-to-leaf path through this edge*, which is the
        SAME for every edge on a single-chain graph: it's the chain
        length. Both edges in A→B→C carry depth 2.
        """
        v = _make_version(db)
        edges = _make_chain(db, v, ["A", "B", "C"])
        depths = compute_chain_depths_for_version(db, v.id)
        # 2-edge linear chain: every edge sits on the unique root-to-leaf
        # walk of length 2.
        assert depths[edges[0].id] == 2
        assert depths[edges[1].id] == 2

    def test_single_edge_depth_one(self, db):
        v = _make_version(db)
        edges = _make_chain(db, v, ["X", "Y"])
        depths = compute_chain_depths_for_version(db, v.id)
        assert depths[edges[0].id] == 1

    def test_branched_fan_out(self, db):
        """R → A, R → B → C. Edge R→A is on a 1-edge walk; edges R→B and
        B→C are on a 2-edge walk."""
        v = _make_version(db)
        _make_entity(db, "R"); _make_entity(db, "A")
        _make_entity(db, "B"); _make_entity(db, "C")
        db.flush()
        e_ra = _make_edge(db, v, "R", "A")
        e_rb = _make_edge(db, v, "R", "B")
        e_bc = _make_edge(db, v, "B", "C")
        depths = compute_chain_depths_for_version(db, v.id)
        assert depths[e_ra.id] == 1  # R→A is a leaf chain of length 1
        assert depths[e_rb.id] == 2  # R→B→C
        assert depths[e_bc.id] == 2  # R→B→C

    def test_multi_root_independent_subgraphs(self, db):
        """Two disjoint linear chains share a version. Each edge carries
        its own subgraph's chain length, independently."""
        v = _make_version(db)
        e1 = _make_chain(db, v, ["A1", "A2", "A3"])  # depth 2
        e2 = _make_chain(db, v, ["B1", "B2"])         # depth 1
        depths = compute_chain_depths_for_version(db, v.id)
        for e in e1:
            assert depths[e.id] == 2
        for e in e2:
            assert depths[e.id] == 1

    def test_empty_version_returns_empty_dict(self, db):
        v = _make_version(db)
        assert compute_chain_depths_for_version(db, v.id) == {}

    def test_diamond_pattern(self, db):
        """R → A, A → B, A → C, B → C. Longest path is R → A → B → C
        (3 edges). Every edge on the diamond participates in that walk."""
        v = _make_version(db)
        _make_entity(db, "R"); _make_entity(db, "A")
        _make_entity(db, "B"); _make_entity(db, "C")
        db.flush()
        e_ra = _make_edge(db, v, "R", "A")
        e_ab = _make_edge(db, v, "A", "B")
        e_ac = _make_edge(db, v, "A", "C")
        e_bc = _make_edge(db, v, "B", "C")
        depths = compute_chain_depths_for_version(db, v.id)
        # Longest path through R→A is R→A→B→C (depth 3)
        assert depths[e_ra.id] == 3
        # Longest path through A→B is R→A→B→C (depth 3)
        assert depths[e_ab.id] == 3
        # Longest path through A→C is R→A→C (depth 2)
        assert depths[e_ac.id] == 2
        # Longest path through B→C is R→A→B→C (depth 3)
        assert depths[e_bc.id] == 3


# ---------------------------------------------------------------------------
# compute_longest_path_for_version
# ---------------------------------------------------------------------------


class TestComputeLongestPathForVersion:
    def test_empty_version(self, db):
        v = _make_version(db)
        length, path = compute_longest_path_for_version(db, v.id)
        assert length == 0
        assert path is None

    def test_single_edge(self, db):
        v = _make_version(db)
        _make_chain(db, v, ["X", "Y"])
        length, path = compute_longest_path_for_version(db, v.id)
        assert length == 1
        assert path == ["X", "Y"]

    def test_linear_chain_length_and_path(self, db):
        v = _make_version(db)
        _make_chain(db, v, ["A", "B", "C", "D"])
        length, path = compute_longest_path_for_version(db, v.id)
        assert length == 3
        assert path == ["A", "B", "C", "D"]

    def test_sample_path_is_valid_root_to_leaf_walk(self, db):
        """The returned sample path must correspond to a real walk through
        the graph (consecutive node pairs must be edges in the version)."""
        v = _make_version(db)
        _make_entity(db, "R"); _make_entity(db, "A")
        _make_entity(db, "B"); _make_entity(db, "C")
        db.flush()
        _make_edge(db, v, "R", "A")
        _make_edge(db, v, "A", "B")
        _make_edge(db, v, "B", "C")
        # Plus a shorter branch from R that shouldn't be picked.
        _make_entity(db, "Z")
        db.flush()
        _make_edge(db, v, "R", "Z")
        length, path = compute_longest_path_for_version(db, v.id)
        assert length == 3
        assert path == ["R", "A", "B", "C"]
        # Validate each consecutive pair is an edge.
        for src, dst in zip(path, path[1:]):
            edge = (
                db.query(Distribution)
                .filter(
                    Distribution.version_id == v.id,
                    Distribution.source_entity_id == src,
                    Distribution.destination_entity_id == dst,
                )
                .first()
            )
            assert edge is not None, f"Edge {src}→{dst} not in version"


# ---------------------------------------------------------------------------
# assert_within_max_depth
# ---------------------------------------------------------------------------


class TestAssertWithinMaxDepth:
    def test_passes_when_safe(self, db):
        """3-edge chain under cap of 6 passes silently."""
        v = _make_version(db)
        _make_chain(db, v, ["A", "B", "C", "D"])  # length 3
        # Should not raise
        assert_within_max_depth(db, v.id, max_depth=6)

    def test_passes_at_boundary(self, db):
        """Length exactly equal to max passes (cap is inclusive)."""
        v = _make_version(db)
        _make_chain(db, v, ["A", "B", "C", "D"])  # length 3
        assert_within_max_depth(db, v.id, max_depth=3)

    def test_passes_for_empty_version(self, db):
        v = _make_version(db)
        # Empty version, no edges, trivially safe regardless of cap.
        assert_within_max_depth(db, v.id, max_depth=1)

    def test_raises_with_violating_path_when_exceeded(self, db):
        """Cap of 3 with a 4-edge chain raises with violating_path set."""
        v = _make_version(db)
        _make_chain(db, v, ["A", "B", "C", "D", "E"])  # length 4
        with pytest.raises(DistributionValidationError) as exc_info:
            assert_within_max_depth(db, v.id, max_depth=3)
        err = exc_info.value
        assert "Allocation depth violation" in str(err)
        assert "4 edges" in str(err)
        # violating_path is set dynamically (the field may or may not be
        # declared on the class depending on whether C has landed yet —
        # the contract is that the attribute exists on the instance).
        assert getattr(err, "violating_path", None) == ["A", "B", "C", "D", "E"]


# ---------------------------------------------------------------------------
# validate_param_change
# ---------------------------------------------------------------------------


class TestValidateParamChange:
    def test_safe_when_higher(self, db):
        """Raising the cap is always safe — empty violations list."""
        v = _make_version(db)
        _make_chain(db, v, ["A", "B", "C", "D"])  # length 3
        assert validate_param_change(db, new_max=10) == []

    def test_safe_when_equal_to_longest(self, db):
        v = _make_version(db)
        _make_chain(db, v, ["A", "B", "C", "D"])  # length 3
        assert validate_param_change(db, new_max=3) == []

    def test_lists_violators_when_new_cap_too_low(self, db):
        """Build a 5-deep active production version; lowering to 4 must
        surface the version + a sample path of length 6."""
        v = _make_version(db)
        # 6 nodes = 5 edges = "5 deep"
        _make_chain(db, v, ["N0", "N1", "N2", "N3", "N4", "N5"])
        result = validate_param_change(db, new_max=4)
        assert len(result) == 1
        version_id, path = result[0]
        assert version_id == v.id
        assert path == ["N0", "N1", "N2", "N3", "N4", "N5"]

    def test_empty_versions_excluded(self, db):
        """An active production version with no edges is depth 0 → safe."""
        _make_version(db)
        assert validate_param_change(db, new_max=1) == []

    def test_only_checks_active_production_drafts_excluded(self, db):
        """A 10-deep draft must NOT trigger a violation — drafts are
        work-in-progress and excluded from production-cap enforcement."""
        v_draft = _make_version(
            db, status="draft", active_from=None, rationale="",
        )
        chain_nodes = [f"D{i}" for i in range(11)]  # 10 edges
        _make_chain(db, v_draft, chain_nodes)
        assert validate_param_change(db, new_max=3) == []

    def test_only_checks_active_production_scenarios_excluded(
        self, db, seed_org_base,
    ):
        """A 10-deep scenario-scoped version must NOT trigger a violation
        either — scenario sandboxes are intentionally off-policy."""
        sc = Scenario(
            name="Test scenario",
            author_id=seed_org_base["person_ids"][0],
        )
        db.add(sc)
        db.flush()
        v_sc = _make_version(
            db, status="draft", active_from=None,
            scenario_id=sc.id, rationale="",
        )
        chain_nodes = [f"S{i}" for i in range(11)]  # 10 edges
        _make_chain(db, v_sc, chain_nodes)
        assert validate_param_change(db, new_max=3) == []

    def test_multiple_violators_each_reported(self, db):
        """Two active production versions each exceed the cap — both
        surface in the result list."""
        v1 = _make_version(db, active_from=date(2025, 1, 1))
        v2 = _make_version(db, active_from=date(2025, 6, 1))
        _make_chain(db, v1, ["A0", "A1", "A2", "A3", "A4"])  # 4 edges
        _make_chain(db, v2, ["B0", "B1", "B2", "B3", "B4", "B5"])  # 5 edges
        result = validate_param_change(db, new_max=3)
        result_by_id = {vid: path for vid, path in result}
        assert v1.id in result_by_id
        assert v2.id in result_by_id
        assert result_by_id[v1.id] == ["A0", "A1", "A2", "A3", "A4"]
        assert result_by_id[v2.id] == ["B0", "B1", "B2", "B3", "B4", "B5"]
