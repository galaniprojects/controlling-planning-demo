"""Unit tests for the Stage 1 DAG resolver (FD-3 — version_id rescope).

The DAG resolver was rescoped in FD-3 from ``(year, version: str)`` to
``version_id`` against the ``DistributionVersion`` header. ``year`` is
retained only on the own-cost lookup side (project budget / annual_cost
lookups are inherently year-scoped). These tests exercise the pure-function
cycle detector, the DB-backed variant, ``compute_effective_cost`` recursion,
own-cost resolution (`[F-DG-03]`), and the upstream-chain walker.
"""

from __future__ import annotations

from datetime import date

import pytest

from models.charging import ChargeableEntity, Distribution, DistributionVersion
from models.organization import GroupingEntity, GroupingEntityType
from models.projects import Project
from services.dag_resolver import (
    EdgeKey, compute_effective_cost, detect_cycle, detect_cycle_db,
    get_own_cost, get_upstream_chain,
)


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
            id="proj-x", name="Project X", status="active", capex_opex="opex",
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
            id="proj-y", name="Y", status="active", capex_opex="opex",
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
            id="proj-z", name="Z", status="active", capex_opex="capex",
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
            id="proj-ac", name="AC", status="active", capex_opex="opex",
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
