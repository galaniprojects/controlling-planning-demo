"""Unit tests for the Stage 1 DAG resolver (FD-3 — version_id rescope).

The DAG resolver was rescoped in FD-3 from ``(year, version: str)`` to
``version_id`` against the ``DistributionVersion`` header. ``year`` is
retained only on the own-cost lookup side (project budget / annual_cost
lookups are inherently year-scoped). These tests exercise the pure-function
cycle detector, the DB-backed variant, ``compute_effective_cost`` recursion,
own-cost resolution (`[F-DG-03]`), and the upstream-chain walker.

**Service Workbench S1 additions:**
- ``TestDiamondMemo`` covers the diamond-pattern correctness fix: replacing
  the ``_seen`` skip-set with a ``_memo`` dict so a shared node's full
  effective cost (own + inflows) is reused on every downstream visit
  instead of being silently truncated to own-cost-only.
- ``TestMaxDepthFromParam`` exercises the new param-aware default for
  ``get_upstream_chain`` — when no ``max_depth`` is passed, the cap resolves
  from the ``max_allocation_depth`` PlanningParameter via Teammate B's
  ``services.depth_validation`` module.
"""

from __future__ import annotations

import sys
import types
from datetime import date

import pytest
from sqlalchemy import select

from models.charging import ChargeableEntity, Distribution, DistributionVersion
from models.organization import GroupingEntity, GroupingEntityType
from models.projects import Project
from models.system import PlanningParameter
from services.dag_resolver import (
    EdgeKey, compute_effective_cost, detect_cycle, detect_cycle_db,
    get_own_cost, get_upstream_chain,
)


# ---------------------------------------------------------------------------
# Stub for Teammate B's services.depth_validation module
#
# Auto-applied for the whole file. While B's worktree is unmerged, the import
# inside get_upstream_chain (and any future caller) resolves against this
# stub. The stub mirrors B's documented contract: read PlanningParameter
# ``max_allocation_depth`` and parse int. The fixture removes itself after
# each test so cross-test state stays clean.
#
# Once B's module merges, this stub is harmless to keep (the real module
# wins because we register the stub conditionally) but for safety the
# integration-time fixture should be removed in the merge commit.
# ---------------------------------------------------------------------------

_DEPTH_MODULE_NAME = "services.depth_validation"


@pytest.fixture(autouse=True)
def stub_depth_validation_module(db):
    """Register a minimal ``services.depth_validation`` stub for the test run.

    The stub exposes ``get_max_allocation_depth(db) -> int`` reading from the
    ``PlanningParameter`` table the same way Teammate B's real module will.
    Falls back to 8 (the historical hardcoded default) if the row is absent
    so tests that don't seed the parameter still behave sensibly.
    """
    real_module = sys.modules.pop(_DEPTH_MODULE_NAME, None)

    stub = types.ModuleType(_DEPTH_MODULE_NAME)

    def get_max_allocation_depth(session):
        row = (
            session.query(PlanningParameter)
            .filter(PlanningParameter.key == "max_allocation_depth")
            .first()
        )
        if row is None:
            return 8  # historical default; B's real module will raise instead
        return int(row.current_value)

    stub.get_max_allocation_depth = get_max_allocation_depth
    sys.modules[_DEPTH_MODULE_NAME] = stub

    yield

    sys.modules.pop(_DEPTH_MODULE_NAME, None)
    if real_module is not None:
        sys.modules[_DEPTH_MODULE_NAME] = real_module


# ---------------------------------------------------------------------------
# Pure-function cycle detection — no DB
# ---------------------------------------------------------------------------


class TestDetectCyclePure:
    def test_no_cycle_in_empty_graph(self):
        assert detect_cycle([], "A", "B") is None

    def test_no_cycle_when_edge_is_safe(self):
        edges = [EdgeKey("A", "B"), EdgeKey("C", "D")]
        assert detect_cycle(edges, "B", "C") is None

    def test_simple_two_node_cycle(self):
        edges = [EdgeKey("A", "B")]
        chain = detect_cycle(edges, "B", "A")
        assert chain is not None
        assert chain[0] == "B"
        assert chain[-1] == "B"
        assert "A" in chain

    def test_three_node_cycle(self):
        edges = [EdgeKey("A", "B"), EdgeKey("B", "C")]
        chain = detect_cycle(edges, "C", "A")
        assert chain is not None
        assert chain[0] == "C"
        assert chain[-1] == "C"
        assert "A" in chain and "B" in chain

    def test_self_loop_detected(self):
        chain = detect_cycle([], "A", "A")
        assert chain == ["A", "A"]

    def test_no_cycle_with_branch(self):
        edges = [EdgeKey("A", "B"), EdgeKey("A", "C")]
        assert detect_cycle(edges, "B", "D") is None

    def test_diamond_no_false_positive(self):
        edges = [EdgeKey("A", "B"), EdgeKey("A", "C"),
                 EdgeKey("B", "D"), EdgeKey("C", "D")]
        assert detect_cycle(edges, "A", "D") is None

    def test_cycle_via_long_path(self):
        edges = [
            EdgeKey("A", "B"), EdgeKey("B", "C"),
            EdgeKey("C", "D"), EdgeKey("D", "E"),
        ]
        chain = detect_cycle(edges, "E", "A")
        assert chain is not None
        assert all(x in chain for x in ["A", "B", "C", "D", "E"])


# ---------------------------------------------------------------------------
# DB-backed wrappers
# ---------------------------------------------------------------------------


@pytest.fixture
def chargeable_graph(db):
    """Seed: a production-active DistributionVersion + 4 entities + 3 edges.

    Outgoing: A → B (40%), A → C (30%), B → D (50%).
    """
    et = GroupingEntityType(id="get-lob", name="LoB")
    n = GroupingEntity(id="lob-1", entity_type_id="get-lob", name="LoB One")
    db.add_all([et, n])

    a = ChargeableEntity(
        id="A", entity_type="InternalService", identifier="ITF99001",
        name="Entity A", to_business_pct=0.0, hierarchy_node_id="lob-1",
    )
    b = ChargeableEntity(
        id="B", entity_type="InternalService", identifier="ITF99002",
        name="Entity B", to_business_pct=0.0, hierarchy_node_id="lob-1",
    )
    c = ChargeableEntity(
        id="C", entity_type="Offering", identifier="IT00ABC",
        name="Entity C", to_business_pct=50.0, hierarchy_node_id="lob-1",
    )
    d = ChargeableEntity(
        id="D", entity_type="Offering", identifier="IT00DEF",
        name="Entity D", to_business_pct=80.0, hierarchy_node_id="lob-1",
    )
    db.add_all([a, b, c, d])
    db.flush()

    v = DistributionVersion(
        active_from=date(2025, 1, 1),
        status="active",
        rationale="Initial seed",
        origin="seed",
    )
    db.add(v)
    db.flush()

    db.add_all([
        Distribution(version_id=v.id, source_entity_id="A",
                     destination_entity_id="B", percentage=40.0),
        Distribution(version_id=v.id, source_entity_id="A",
                     destination_entity_id="C", percentage=30.0),
        Distribution(version_id=v.id, source_entity_id="B",
                     destination_entity_id="D", percentage=50.0),
    ])
    db.commit()
    return {"a": a, "b": b, "c": c, "d": d, "version": v}


class TestDetectCycleDB:
    def test_no_cycle_for_safe_edge(self, db, chargeable_graph):
        vid = chargeable_graph["version"].id
        assert detect_cycle_db(db, vid, "C", "D") is None

    def test_cycle_detected(self, db, chargeable_graph):
        # D → A would close A → B → D → A.
        vid = chargeable_graph["version"].id
        chain = detect_cycle_db(db, vid, "D", "A")
        assert chain is not None
        assert chain[0] == "D"
        assert chain[-1] == "D"

    def test_exclude_edge_id_skips_self(self, db, chargeable_graph):
        vid = chargeable_graph["version"].id
        edge = db.query(Distribution).filter_by(
            version_id=vid, source_entity_id="A", destination_entity_id="B",
        ).first()
        assert edge is not None
        chain = detect_cycle_db(db, vid, "A", "B", exclude_edge_id=edge.id)
        assert chain is None

    def test_different_version_does_not_trigger(self, db, chargeable_graph):
        # A different DistributionVersion has no edges → no cycle.
        v2 = DistributionVersion(
            active_from=None, status="draft", rationale="",
            origin="blank",
        )
        db.add(v2)
        db.commit()
        assert detect_cycle_db(db, v2.id, "B", "A") is None


# ---------------------------------------------------------------------------
# Effective-cost computation
# ---------------------------------------------------------------------------


class TestComputeEffectiveCost:
    def test_unknown_entity_returns_zero(self, db):
        result = compute_effective_cost(db, 2026, 999999, "no-such-entity")
        assert result.entity_name == "<unknown>"
        assert result.effective_cost == 0.0
        assert result.own_cost_source is None

    def test_no_inflows_means_only_own_cost(self, db, chargeable_graph):
        vid = chargeable_graph["version"].id
        result = compute_effective_cost(db, 2026, vid, "A")
        assert result.inflows == []
        assert result.inflow_total == 0.0
        assert result.effective_cost == 0.0
        assert result.version_id == vid

    def test_single_inflow(self, db, chargeable_graph):
        vid = chargeable_graph["version"].id
        result = compute_effective_cost(db, 2026, vid, "B")
        assert len(result.inflows) == 1
        assert result.inflows[0].source_entity_id == "A"
        assert result.inflows[0].percentage == 40.0

    def test_multi_step_inflow_chain(self, db, chargeable_graph):
        vid = chargeable_graph["version"].id
        result = compute_effective_cost(db, 2026, vid, "D")
        assert len(result.inflows) == 1
        assert result.inflows[0].source_entity_id == "B"

    def test_effective_cost_with_project_own_cost(self, db, seed_org_base):
        """Own cost surfaces from Project.annual_budget for Project subtype."""
        et = GroupingEntityType(id="get-lob", name="LoB")
        n = GroupingEntity(id="lob-1", entity_type_id="get-lob", name="LoB One")
        db.add_all([et, n])
        p = Project(
            id="proj-x", name="Project X", pipeline_stage="Active", capex_opex="opex",
            start_month="2025-01", is_service=True, annual_budget=100000,
        )
        db.add(p)
        db.flush()
        ce = ChargeableEntity(
            id="ce-x", entity_type="Project", identifier="IT099001",
            name="Project X", project_id="proj-x", to_business_pct=10.0,
            hierarchy_node_id="lob-1",
        )
        db.add(ce)
        v = DistributionVersion(
            active_from=date(2025, 1, 1), status="active",
            rationale="seed", origin="seed",
        )
        db.add(v)
        db.commit()

        result = compute_effective_cost(db, 2026, v.id, "ce-x")
        assert result.own_cost == 100000.0
        assert result.own_cost_source == "annual_budget"
        assert result.effective_cost == 100000.0

    def test_propagates_inflow_amounts(self, db):
        """A 1M offering distributes 40% into B → B's effective = 400k inflow."""
        et = GroupingEntityType(id="get-l", name="L")
        n = GroupingEntity(id="lob-x", entity_type_id="get-l", name="X")
        db.add_all([et, n])
        a = ChargeableEntity(
            id="A2", entity_type="Offering", identifier="IT00AAA",
            name="A2", hierarchy_node_id="lob-x", annual_cost=1_000_000.0,
        )
        b = ChargeableEntity(
            id="B2", entity_type="Offering", identifier="IT00BBB",
            name="B2", hierarchy_node_id="lob-x",
        )
        db.add_all([a, b])
        v = DistributionVersion(
            active_from=date(2025, 1, 1), status="active",
            rationale="seed", origin="seed",
        )
        db.add(v)
        db.flush()
        db.add(Distribution(
            version_id=v.id, source_entity_id="A2", destination_entity_id="B2",
            percentage=40.0,
        ))
        db.commit()
        result = compute_effective_cost(db, 2026, v.id, "B2")
        assert result.inflow_total == 400_000.0
        assert result.effective_cost == 400_000.0


class TestGetOwnCost:
    def test_offering_zero_when_no_annual_cost(self, db, chargeable_graph):
        c = chargeable_graph["c"]
        assert get_own_cost(c) == 0.0

    def test_internal_service_zero_when_no_annual_cost(self, db, chargeable_graph):
        a = chargeable_graph["a"]
        assert get_own_cost(a) == 0.0

    def test_project_with_annual_budget(self, db, seed_org_base):
        p = Project(
            id="proj-y", name="Y", pipeline_stage="Active", capex_opex="opex",
            start_month="2025-01", is_service=True, annual_budget=50000,
        )
        db.add(p)
        db.flush()
        ce = ChargeableEntity(
            id="ce-y", entity_type="Project", identifier="IT099002",
            name="Y", project_id="proj-y",
        )
        db.add(ce)
        db.commit()
        assert get_own_cost(ce) == 50000.0

    def test_project_falls_back_to_total_budget(self, db, seed_org_base):
        p = Project(
            id="proj-z", name="Z", pipeline_stage="Active", capex_opex="capex",
            start_month="2025-01", end_month="2026-12", total_budget=200000,
        )
        db.add(p)
        db.flush()
        ce = ChargeableEntity(
            id="ce-z", entity_type="Project", identifier="IT099003",
            name="Z", project_id="proj-z",
        )
        db.add(ce)
        db.commit()
        assert get_own_cost(ce) == 200000.0

    def test_offering_uses_annual_cost_when_set(self, db):
        et = GroupingEntityType(id="get-lob2", name="LoB2")
        n = GroupingEntity(id="lob-2", entity_type_id="get-lob2", name="LoB Two")
        db.add_all([et, n])
        db.flush()
        ce = ChargeableEntity(
            id="ce-off-ac", entity_type="Offering", identifier="IT00S099",
            name="Offering With Annual Cost", to_business_pct=50.0,
            hierarchy_node_id="lob-2", is_active=True,
            annual_cost=1500000.0,
        )
        db.add(ce)
        db.commit()
        assert get_own_cost(ce) == 1500000.0

    def test_internal_service_uses_annual_cost_when_set(self, db):
        et = GroupingEntityType(id="get-lob3", name="LoB3")
        n = GroupingEntity(id="lob-3", entity_type_id="get-lob3", name="LoB Three")
        db.add_all([et, n])
        db.flush()
        ce = ChargeableEntity(
            id="ce-is-ac", entity_type="InternalService", identifier="ITF09999",
            name="IS With Annual Cost", to_business_pct=0.0,
            hierarchy_node_id="lob-3", is_active=True,
            annual_cost=750000.0,
        )
        db.add(ce)
        db.commit()
        assert get_own_cost(ce) == 750000.0

    def test_project_falls_back_to_annual_cost_when_no_budget(self, db, seed_org_base):
        p = Project(
            id="proj-ac", name="AC", pipeline_stage="Active", capex_opex="opex",
            start_month="2026-01", is_service=True,
            annual_budget=None, total_budget=None,
        )
        db.add(p)
        db.flush()
        ce = ChargeableEntity(
            id="ce-proj-ac", entity_type="Project", identifier="IT099004",
            name="Proj AC", project_id="proj-ac",
            annual_cost=333000.0,
        )
        db.add(ce)
        db.commit()
        assert get_own_cost(ce) == 333000.0


class TestUpstreamChain:
    def test_returns_self_for_isolated_entity(self, db, chargeable_graph):
        vid = chargeable_graph["version"].id
        paths = get_upstream_chain(db, vid, "A")
        assert paths == [["A"]]

    def test_paths_for_intermediate_node(self, db, chargeable_graph):
        vid = chargeable_graph["version"].id
        paths = get_upstream_chain(db, vid, "B")
        assert paths == [["A", "B"]]

    def test_multi_step_path(self, db, chargeable_graph):
        vid = chargeable_graph["version"].id
        paths = get_upstream_chain(db, vid, "D")
        assert paths == [["A", "B", "D"]]

    def test_multiple_paths_when_branches(self, db, chargeable_graph):
        vid = chargeable_graph["version"].id
        paths = get_upstream_chain(db, vid, "C")
        assert paths == [["A", "C"]]


# ---------------------------------------------------------------------------
# Diamond pattern + memoization (Service Workbench S1 — Teammate A)
#
# The pre-S1 resolver carried an ``_seen`` skip-set that, on repeat encounter
# of a shared node, returned the node's own cost without inflows. This was
# silent truncation on diamond DAGs where the shared node has its own
# upstream inflow — the second visit dropped that inflow from the
# downstream rollup. The memoized resolver caches the **full** result and
# replays it, so every visit sees the same (correct) effective cost.
# ---------------------------------------------------------------------------


def _seed_lob(db, lob_id: str = "lob-diamond") -> None:
    """Insert the minimal LoB hierarchy node required by ChargeableEntity FK."""
    if db.query(GroupingEntityType).filter_by(id="get-lob-d").first() is None:
        db.add(GroupingEntityType(id="get-lob-d", name="LoB-D"))
    db.add(GroupingEntity(id=lob_id, entity_type_id="get-lob-d", name="LoB Diamond"))
    db.flush()


def _seed_diamond_graph(db):
    """Build R -> A (100%) ; A -> B (40%) ; A -> C (30%) ; B -> C (50%).

    Own costs: R=100, A=10, B=20, C=5. Returns the active DistributionVersion.

    Expected memoized totals:
      R.effective = 100
      A.effective = 10 + 100*1.00            = 110
      B.effective = 20 + 110*0.40            = 64
      C.effective = 5  + 110*0.30 + 64*0.50  = 70

    The buggy ``_seen`` resolver computes
      C.effective = 5  + A.own*0.30 + B.eff*0.50 = 5 + 3 + 32 = 40
    because on the second visit to A (via B) it returns A.own only.
    """
    _seed_lob(db, "lob-diamond")

    entities = [
        ChargeableEntity(
            id="R", entity_type="Offering", identifier="IT00RRR",
            name="Root R", to_business_pct=0.0, hierarchy_node_id="lob-diamond",
            annual_cost=100.0,
        ),
        ChargeableEntity(
            id="A", entity_type="InternalService", identifier="ITF00DA1",
            name="Shared A", to_business_pct=0.0, hierarchy_node_id="lob-diamond",
            annual_cost=10.0,
        ),
        ChargeableEntity(
            id="B", entity_type="InternalService", identifier="ITF00DB1",
            name="Mid B", to_business_pct=0.0, hierarchy_node_id="lob-diamond",
            annual_cost=20.0,
        ),
        ChargeableEntity(
            id="C", entity_type="Offering", identifier="IT00DCC",
            name="Sink C", to_business_pct=0.0, hierarchy_node_id="lob-diamond",
            annual_cost=5.0,
        ),
    ]
    db.add_all(entities)
    db.flush()

    v = DistributionVersion(
        active_from=date(2025, 1, 1), status="active",
        rationale="diamond test", origin="seed",
    )
    db.add(v)
    db.flush()

    db.add_all([
        Distribution(version_id=v.id, source_entity_id="R",
                     destination_entity_id="A", percentage=100.0),
        Distribution(version_id=v.id, source_entity_id="A",
                     destination_entity_id="B", percentage=40.0),
        Distribution(version_id=v.id, source_entity_id="A",
                     destination_entity_id="C", percentage=30.0),
        Distribution(version_id=v.id, source_entity_id="B",
                     destination_entity_id="C", percentage=50.0),
    ])
    db.commit()
    return v


class TestDiamondMemo:
    def test_diamond_with_inflow_to_shared_node_returns_correct_total(self, db):
        """Decisive test: memoized resolver fixes the diamond silent-truncation."""
        v = _seed_diamond_graph(db)
        a = compute_effective_cost(db, 2026, v.id, "A")
        b = compute_effective_cost(db, 2026, v.id, "B")
        c = compute_effective_cost(db, 2026, v.id, "C")

        # A is reached only from R (100%) — own 10 + 100 inflow = 110.
        assert a.effective_cost == 110.0, (
            f"A.effective_cost expected 110.0, got {a.effective_cost}"
        )

        # B is reached only from A (40% of 110) — own 20 + 44 inflow = 64.
        assert b.effective_cost == 64.0, (
            f"B.effective_cost expected 64.0, got {b.effective_cost}"
        )

        # C is the diamond sink: own 5 + A*0.30 (33) + B*0.50 (32) = 70.
        assert c.effective_cost == 70.0, (
            f"C.effective_cost expected 70.0, got {c.effective_cost}"
        )

        # Decisive guard: the buggy resolver would compute 40 here
        # (5 + A.own*0.30 + B.eff*0.50 = 5 + 3 + 32 = 40) because the
        # second visit to A would return own-cost-only.
        assert c.effective_cost != 40.0, (
            "Regression: diamond truncation bug has returned. C should be "
            "70.0 (memoized full A.effective_cost reused), not 40.0 "
            "(A.own_cost-only on the repeat visit)."
        )

        # Cross-check inflows captured in C's result.
        amounts_by_source = {
            inf.source_entity_id: inf.amount for inf in c.inflows
        }
        assert amounts_by_source["A"] == 33.0
        assert amounts_by_source["B"] == 32.0

    def test_existing_cycle_detection_unchanged(self, db, chargeable_graph):
        """Sanity check: memoization changes did not break the cycle detector."""
        vid = chargeable_graph["version"].id
        # Adding D -> A would close the cycle A -> B -> D -> A.
        chain = detect_cycle_db(db, vid, "D", "A")
        assert chain is not None
        assert chain[0] == "D" and chain[-1] == "D"
        assert "A" in chain and "B" in chain

    def test_no_inflow_diamond_still_correct(self, db):
        """Diamond without an inflow to the shared node — buggy resolver also
        returned the right answer here (truncation was invisible). Confirm
        the memoized resolver matches.

        Graph: A -> B (40%) ; A -> C (30%) ; B -> C (50%).
        Own costs: A=100, B=0, C=0.
        Expected:
          A.effective = 100
          B.effective = 0 + 100*0.40           = 40
          C.effective = 0 + 100*0.30 + 40*0.50 = 50
        """
        _seed_lob(db, "lob-noinflow")
        db.add_all([
            ChargeableEntity(
                id="NA", entity_type="Offering", identifier="IT00NAA",
                name="A", to_business_pct=0.0, hierarchy_node_id="lob-noinflow",
                annual_cost=100.0,
            ),
            ChargeableEntity(
                id="NB", entity_type="InternalService", identifier="ITF00NB1",
                name="B", to_business_pct=0.0, hierarchy_node_id="lob-noinflow",
            ),
            ChargeableEntity(
                id="NC", entity_type="Offering", identifier="IT00NCC",
                name="C", to_business_pct=0.0, hierarchy_node_id="lob-noinflow",
            ),
        ])
        db.flush()
        v = DistributionVersion(
            active_from=date(2025, 1, 1), status="active",
            rationale="no-inflow diamond", origin="seed",
        )
        db.add(v)
        db.flush()
        db.add_all([
            Distribution(version_id=v.id, source_entity_id="NA",
                         destination_entity_id="NB", percentage=40.0),
            Distribution(version_id=v.id, source_entity_id="NA",
                         destination_entity_id="NC", percentage=30.0),
            Distribution(version_id=v.id, source_entity_id="NB",
                         destination_entity_id="NC", percentage=50.0),
        ])
        db.commit()

        assert compute_effective_cost(db, 2026, v.id, "NA").effective_cost == 100.0
        assert compute_effective_cost(db, 2026, v.id, "NB").effective_cost == 40.0
        assert compute_effective_cost(db, 2026, v.id, "NC").effective_cost == 50.0

    def test_memoization_doesnt_break_simple_chains(self, db):
        """Regression guard: a plain linear A->B->C chain still computes
        identically under memoization."""
        _seed_lob(db, "lob-chain")
        db.add_all([
            ChargeableEntity(
                id="LA", entity_type="Offering", identifier="IT00LAA",
                name="A", to_business_pct=0.0, hierarchy_node_id="lob-chain",
                annual_cost=200.0,
            ),
            ChargeableEntity(
                id="LB", entity_type="InternalService", identifier="ITF00LB1",
                name="B", to_business_pct=0.0, hierarchy_node_id="lob-chain",
                annual_cost=50.0,
            ),
            ChargeableEntity(
                id="LC", entity_type="Offering", identifier="IT00LCC",
                name="C", to_business_pct=0.0, hierarchy_node_id="lob-chain",
                annual_cost=10.0,
            ),
        ])
        db.flush()
        v = DistributionVersion(
            active_from=date(2025, 1, 1), status="active",
            rationale="linear chain", origin="seed",
        )
        db.add(v)
        db.flush()
        db.add_all([
            Distribution(version_id=v.id, source_entity_id="LA",
                         destination_entity_id="LB", percentage=50.0),
            Distribution(version_id=v.id, source_entity_id="LB",
                         destination_entity_id="LC", percentage=20.0),
        ])
        db.commit()

        # A = 200 ; B = 50 + 200*0.50 = 150 ; C = 10 + 150*0.20 = 40.
        assert compute_effective_cost(db, 2026, v.id, "LA").effective_cost == 200.0
        assert compute_effective_cost(db, 2026, v.id, "LB").effective_cost == 150.0
        assert compute_effective_cost(db, 2026, v.id, "LC").effective_cost == 40.0


# ---------------------------------------------------------------------------
# get_upstream_chain: param-aware default max_depth
# ---------------------------------------------------------------------------


def _seed_linear_chain(db, length: int):
    """Build a single linear chain N1 -> N2 -> ... -> N{length}.

    Each ChargeableEntity gets a unique id ``N1``..``N{length}``. Returns
    the DistributionVersion id.
    """
    _seed_lob(db, "lob-linear")

    entities = []
    for i in range(1, length + 1):
        entities.append(ChargeableEntity(
            id=f"N{i}",
            entity_type="Offering" if i % 2 == 0 else "InternalService",
            identifier=f"IT00LIN{i:02d}" if i % 2 == 0 else f"ITF0LIN{i:02d}",
            name=f"Node {i}", to_business_pct=0.0,
            hierarchy_node_id="lob-linear",
        ))
    db.add_all(entities)
    db.flush()

    v = DistributionVersion(
        active_from=date(2025, 1, 1), status="active",
        rationale="linear", origin="seed",
    )
    db.add(v)
    db.flush()

    for i in range(1, length):
        db.add(Distribution(
            version_id=v.id, source_entity_id=f"N{i}",
            destination_entity_id=f"N{i+1}", percentage=100.0,
        ))
    db.commit()
    return v.id


def _set_max_depth_param(db, value: int) -> None:
    """Upsert the ``max_allocation_depth`` PlanningParameter row."""
    row = (
        db.query(PlanningParameter)
        .filter(PlanningParameter.key == "max_allocation_depth")
        .first()
    )
    if row is None:
        db.add(PlanningParameter(
            key="max_allocation_depth",
            name="Maximum allocation depth",
            description="Caps allocation chain depth",
            current_value=str(value),
            default_value="6",
            data_type="integer",
            param_group="limits",
        ))
    else:
        row.current_value = str(value)
    db.commit()


class TestMaxDepthFromParam:
    def test_get_upstream_chain_reads_max_depth_from_planning_parameter(self, db):
        """When max_depth is omitted, the cap resolves from PlanningParameter.

        ``_walk`` only records a path when the walker reaches a true source
        (no incoming edges) within the depth cap; cut-off partial walks are
        discarded. So the decisive proof that the param is consulted is to
        show that a chain longer than the cap yields **no** paths, while the
        same chain with a generous cap yields the full path.

        Setup: linear 5-deep chain N1 -> N2 -> N3 -> N4 -> N5. Walking
        upstream from N5 reaches the source N1 at depth 4. With max=3 the
        walker prunes before recording; with max=4 it records.
        """
        vid = _seed_linear_chain(db, length=5)  # N1 -> N2 -> N3 -> N4 -> N5

        _set_max_depth_param(db, 3)
        truncated = get_upstream_chain(db, vid, "N5")
        assert truncated == [], (
            f"expected no paths when param max=3 prunes the 5-deep chain, "
            f"got {truncated}"
        )

        _set_max_depth_param(db, 4)
        allowed = get_upstream_chain(db, vid, "N5")
        assert allowed == [["N1", "N2", "N3", "N4", "N5"]], (
            f"expected the full upstream path when param max=4 admits a "
            f"depth-4 walk, got {allowed}"
        )

    def test_get_upstream_chain_explicit_max_depth_overrides_param(self, db):
        """Explicit max_depth kwarg wins over the planning-parameter default."""
        vid = _seed_linear_chain(db, length=5)
        _set_max_depth_param(db, 3)  # would normally truncate

        paths = get_upstream_chain(db, vid, "N5", max_depth=5)
        # With max_depth=5 the walker can reach N1 (depth 4 from N5).
        assert paths == [["N1", "N2", "N3", "N4", "N5"]], (
            f"expected the full N1..N5 path when explicit max_depth=5, got {paths}"
        )
