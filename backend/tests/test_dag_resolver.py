"""Unit tests for the Stage 1 DAG resolver (v5 Session F2 [F-S1-02][F-S1-05])."""

from __future__ import annotations

import pytest

from models.charging import ChargeableEntity, Distribution
from models.organization import GroupingEntity, GroupingEntityType
from models.projects import Project
from services.dag_resolver import (
    EdgeKey, compute_effective_cost, detect_cycle, detect_cycle_db,
    get_own_cost, get_upstream_chain,
)


# ---------------------------------------------------------------------------
# Pure-function cycle detection
# ---------------------------------------------------------------------------


class TestDetectCyclePure:
    """Pure-function cycle detection works without a DB."""

    def test_no_cycle_in_empty_graph(self):
        assert detect_cycle([], "A", "B") is None

    def test_no_cycle_when_edge_is_safe(self):
        edges = [EdgeKey("A", "B"), EdgeKey("C", "D")]
        assert detect_cycle(edges, "B", "C") is None

    def test_simple_two_node_cycle(self):
        edges = [EdgeKey("A", "B")]
        chain = detect_cycle(edges, "B", "A")
        assert chain is not None
        # Chain renders as A -> B -> A (the proposed source, then the path back to it).
        assert chain[0] == "B"
        assert chain[-1] == "B"
        assert "A" in chain

    def test_three_node_cycle(self):
        edges = [EdgeKey("A", "B"), EdgeKey("B", "C")]
        chain = detect_cycle(edges, "C", "A")
        assert chain is not None
        # Path A -> B -> C closing with C -> A.
        assert chain[0] == "C"
        assert chain[-1] == "C"
        assert "A" in chain and "B" in chain

    def test_self_loop_detected(self):
        chain = detect_cycle([], "A", "A")
        assert chain == ["A", "A"]

    def test_no_cycle_with_branch(self):
        # A -> B, A -> C; new edge B -> D should be safe even with multiple branches.
        edges = [EdgeKey("A", "B"), EdgeKey("A", "C")]
        assert detect_cycle(edges, "B", "D") is None

    def test_diamond_no_false_positive(self):
        # A -> B, A -> C, B -> D, C -> D — adding A -> D should not register
        # as a cycle (no path from D back to A exists).
        edges = [EdgeKey("A", "B"), EdgeKey("A", "C"),
                 EdgeKey("B", "D"), EdgeKey("C", "D")]
        assert detect_cycle(edges, "A", "D") is None

    def test_cycle_via_long_path(self):
        # A -> B -> C -> D -> E; new E -> A should close a 5-cycle.
        edges = [
            EdgeKey("A", "B"), EdgeKey("B", "C"),
            EdgeKey("C", "D"), EdgeKey("D", "E"),
        ]
        chain = detect_cycle(edges, "E", "A")
        assert chain is not None
        assert "A" in chain and "B" in chain and "C" in chain
        assert "D" in chain and "E" in chain


# ---------------------------------------------------------------------------
# DB-backed wrappers
# ---------------------------------------------------------------------------


@pytest.fixture
def chargeable_graph(db):
    """Seed a small ChargeableEntity graph used by the DB-backed tests.

    Creates four entities: A (InternalService), B (InternalService),
    C (Offering), D (Offering). Outgoing: A -> B, A -> C, B -> D.
    """
    # Hierarchy node so FKs resolve.
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
    db.add_all([
        Distribution(year=2026, version="forecast",
                     source_entity_id="A", destination_entity_id="B",
                     percentage=40.0),
        Distribution(year=2026, version="forecast",
                     source_entity_id="A", destination_entity_id="C",
                     percentage=30.0),
        Distribution(year=2026, version="forecast",
                     source_entity_id="B", destination_entity_id="D",
                     percentage=50.0),
    ])
    db.commit()
    return {"a": a, "b": b, "c": c, "d": d}


class TestDetectCycleDB:
    def test_no_cycle_for_safe_edge(self, db, chargeable_graph):
        # C -> D is safe (D has no outgoing edges).
        assert detect_cycle_db(db, 2026, "forecast", "C", "D") is None

    def test_cycle_detected(self, db, chargeable_graph):
        # D -> A would close A -> B -> D -> A (3-cycle).
        chain = detect_cycle_db(db, 2026, "forecast", "D", "A")
        assert chain is not None
        assert chain[0] == "D"
        assert chain[-1] == "D"

    def test_exclude_edge_id_skips_self(self, db, chargeable_graph):
        # Updating an existing edge should not register itself as a cycle.
        edge = db.query(Distribution).filter_by(
            source_entity_id="A", destination_entity_id="B",
        ).first()
        assert edge is not None
        # Pretend we are *updating* A -> B with a new percentage. The cycle
        # check should ignore that edge — it is not a real cycle.
        chain = detect_cycle_db(
            db, 2026, "forecast", "A", "B", exclude_edge_id=edge.id,
        )
        assert chain is None

    def test_different_year_does_not_trigger(self, db, chargeable_graph):
        # Existing edges are on year=2026; year=2027 graph is empty so no cycle.
        assert detect_cycle_db(db, 2027, "forecast", "B", "A") is None


# ---------------------------------------------------------------------------
# Effective-cost computation
# ---------------------------------------------------------------------------


class TestComputeEffectiveCost:
    def test_unknown_entity_returns_zero(self, db):
        result = compute_effective_cost(db, 2026, "forecast", "no-such-entity")
        assert result.entity_name == "<unknown>"
        assert result.effective_cost == 0.0

    def test_no_inflows_means_only_own_cost(self, db, chargeable_graph):
        # A has no inflows — own_cost (0 since no Project) + 0 = 0.
        result = compute_effective_cost(db, 2026, "forecast", "A")
        assert result.inflows == []
        assert result.inflow_total == 0.0
        assert result.effective_cost == 0.0

    def test_single_inflow(self, db, chargeable_graph):
        # B receives 40% of A. A's own_cost is 0, so B's inflow is 0.
        result = compute_effective_cost(db, 2026, "forecast", "B")
        assert len(result.inflows) == 1
        assert result.inflows[0].source_entity_id == "A"
        assert result.inflows[0].percentage == 40.0

    def test_multi_step_inflow_chain(self, db, chargeable_graph):
        # D receives 50% of B which receives 40% of A. Tree walk visits A through B.
        result = compute_effective_cost(db, 2026, "forecast", "D")
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
        db.commit()

        result = compute_effective_cost(db, 2026, "forecast", "ce-x")
        assert result.own_cost == 100000.0
        assert result.effective_cost == 100000.0


class TestGetOwnCost:
    def test_offering_returns_zero(self, db, chargeable_graph):
        c = chargeable_graph["c"]
        assert get_own_cost(c) == 0.0

    def test_internal_service_returns_zero(self, db, chargeable_graph):
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
        """F3: Offering with annual_cost should return that value [F-DG-03]."""
        from models.organization import GroupingEntityType, GroupingEntity
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
        """F3: InternalService with annual_cost should return that value [F-DG-03]."""
        from models.organization import GroupingEntityType, GroupingEntity
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
        """F3: Project CE with no annual_budget/total_budget falls back to annual_cost [F-DG-03]."""
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
        # A has no inflows — only path is [A] alone (the source itself).
        paths = get_upstream_chain(db, 2026, "forecast", "A")
        assert paths == [["A"]]

    def test_paths_for_intermediate_node(self, db, chargeable_graph):
        # B receives only from A — path is [A, B].
        paths = get_upstream_chain(db, 2026, "forecast", "B")
        assert paths == [["A", "B"]]

    def test_multi_step_path(self, db, chargeable_graph):
        # D receives from B which receives from A — path is [A, B, D].
        paths = get_upstream_chain(db, 2026, "forecast", "D")
        assert paths == [["A", "B", "D"]]

    def test_multiple_paths_when_branches(self, db, chargeable_graph):
        # C receives only from A — single path [A, C].
        paths = get_upstream_chain(db, 2026, "forecast", "C")
        assert paths == [["A", "C"]]
