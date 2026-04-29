"""Router tests for v5 Session F2 Distribution + DAG endpoints [F-S1-01..05]."""

from __future__ import annotations

import pytest

from models.charging import ChargeableEntity, ChargingLocation, Distribution
from models.organization import GroupingEntity, GroupingEntityType
from models.projects import Project


@pytest.fixture
def seed_distribution_graph(db, seed_org_base, seed_personas):
    """Seed: A (InternalService), B (Offering w/ to_business=50), C (Offering),
    D (Offering with own_cost via Project)."""
    et = GroupingEntityType(id="get-lob", name="LoB")
    n = GroupingEntity(id="lob-1", entity_type_id="get-lob", name="LoB One")
    db.add_all([et, n])

    # Charging location for WBS test
    cl = ChargingLocation(id="cl-de-muc", code="DE-MUC-001", name="Munich")
    db.add(cl)

    # Project for Project-subtype effective-cost coverage
    p = Project(
        id="proj-d", name="D Project", status="active", capex_opex="opex",
        start_month="2025-01", is_service=True, annual_budget=100000,
    )
    db.add(p)
    db.flush()

    db.add_all([
        ChargeableEntity(
            id="A", entity_type="InternalService", identifier="ITF99001",
            name="A", to_business_pct=0.0, hierarchy_node_id="lob-1",
        ),
        ChargeableEntity(
            id="B", entity_type="Offering", identifier="IT00BBB",
            name="B", to_business_pct=50.0, hierarchy_node_id="lob-1",
        ),
        ChargeableEntity(
            id="C", entity_type="Offering", identifier="IT00CCC",
            name="C", to_business_pct=0.0, hierarchy_node_id="lob-1",
        ),
        ChargeableEntity(
            id="D", entity_type="Project", identifier="IT012999",
            name="D", project_id="proj-d", to_business_pct=10.0,
            hierarchy_node_id="lob-1",
        ),
    ])
    db.flush()

    # Two existing edges: A -> B (40%), B -> C (30%) — graph A → B → C → ?
    db.add_all([
        Distribution(
            year=2026, version="forecast",
            source_entity_id="A", destination_entity_id="B", percentage=40.0,
        ),
        Distribution(
            year=2026, version="forecast",
            source_entity_id="B", destination_entity_id="C", percentage=30.0,
        ),
    ])
    db.commit()


# ---------------------------------------------------------------------------
# Distribution list / get
# ---------------------------------------------------------------------------


class TestListDistributions:
    def test_returns_all_edges(self, test_client, seed_distribution_graph):
        r = test_client.get(
            "/api/charging/distributions",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["total"] == 2

    def test_filter_by_year(self, test_client, seed_distribution_graph):
        r = test_client.get(
            "/api/charging/distributions?year=2026",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.json()["total"] == 2
        r2 = test_client.get(
            "/api/charging/distributions?year=2027",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r2.json()["total"] == 0

    def test_filter_by_source(self, test_client, seed_distribution_graph):
        r = test_client.get(
            "/api/charging/distributions?source_entity_id=A",
            headers={"X-Current-User": "persona-controller"},
        )
        items = r.json()["items"]
        assert len(items) == 1
        assert items[0]["source_entity_id"] == "A"

    def test_open_to_pl_role(self, test_client, seed_distribution_graph):
        # Reads are open to all authenticated roles per [F-UM-04] / [F-AC-01].
        r = test_client.get(
            "/api/charging/distributions",
            headers={"X-Current-User": "persona-pl"},
        )
        assert r.status_code == 200


class TestGetDistribution:
    def test_returns_edge(self, test_client, seed_distribution_graph, db):
        edge = db.query(Distribution).filter_by(source_entity_id="A").first()
        r = test_client.get(
            f"/api/charging/distributions/{edge.id}",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["id"] == edge.id
        assert data["source_entity_id"] == "A"

    def test_404(self, test_client, seed_distribution_graph):
        r = test_client.get(
            "/api/charging/distributions/99999",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# Distribution create / update / delete
# ---------------------------------------------------------------------------


class TestCreateDistribution:
    def test_creates_valid_edge(self, test_client, seed_distribution_graph):
        r = test_client.post(
            "/api/charging/distributions",
            headers={"X-Current-User": "persona-controller"},
            json={
                "year": 2026, "version": "forecast",
                "source_entity_id": "A", "destination_entity_id": "C",
                "percentage": 20.0,
            },
        )
        assert r.status_code == 201

    def test_rejects_self_loop_at_schema_level(self, test_client, seed_distribution_graph):
        r = test_client.post(
            "/api/charging/distributions",
            headers={"X-Current-User": "persona-controller"},
            json={
                "year": 2026, "version": "forecast",
                "source_entity_id": "A", "destination_entity_id": "A",
                "percentage": 5.0,
            },
        )
        assert r.status_code == 422  # Pydantic validator catches self-loop early

    def test_rejects_cycle_with_chain(self, test_client, seed_distribution_graph):
        # A -> B -> C exists; adding C -> A would close a 3-cycle.
        r = test_client.post(
            "/api/charging/distributions",
            headers={"X-Current-User": "persona-controller"},
            json={
                "year": 2026, "version": "forecast",
                "source_entity_id": "C", "destination_entity_id": "A",
                "percentage": 10.0,
            },
        )
        assert r.status_code == 409
        # FastAPI nests HTTPException detail one level when detail is a dict.
        body = r.json()["detail"]
        assert "cycle_chain" in body
        assert body["cycle_chain"][0] == "C"

    def test_rejects_when_sum_exceeds(self, test_client, seed_distribution_graph):
        # B already has to_business=50 + edge B→C (30%) = 80. Adding 25% more
        # to D would push grand to 105.
        r = test_client.post(
            "/api/charging/distributions",
            headers={"X-Current-User": "persona-controller"},
            json={
                "year": 2026, "version": "forecast",
                "source_entity_id": "B", "destination_entity_id": "D",
                "percentage": 25.0,
            },
        )
        assert r.status_code == 409
        body = r.json()["detail"]
        assert "Sum rule" in body["detail"]

    def test_rejects_unknown_source(self, test_client, seed_distribution_graph):
        r = test_client.post(
            "/api/charging/distributions",
            headers={"X-Current-User": "persona-controller"},
            json={
                "year": 2026, "version": "forecast",
                "source_entity_id": "no-such", "destination_entity_id": "B",
                "percentage": 5.0,
            },
        )
        assert r.status_code == 409  # Service raises validation error → 409

    def test_pl_cannot_write(self, test_client, seed_distribution_graph):
        r = test_client.post(
            "/api/charging/distributions",
            headers={"X-Current-User": "persona-pl"},
            json={
                "year": 2026, "version": "forecast",
                "source_entity_id": "A", "destination_entity_id": "C",
                "percentage": 5.0,
            },
        )
        assert r.status_code == 403


class TestUpdateDistribution:
    def test_updates_percentage(self, test_client, seed_distribution_graph, db):
        edge = db.query(Distribution).filter_by(source_entity_id="A").first()
        r = test_client.put(
            f"/api/charging/distributions/{edge.id}",
            headers={"X-Current-User": "persona-controller"},
            json={"percentage": 25.0},
        )
        assert r.status_code == 200
        assert r.json()["percentage"] == 25.0


class TestDeleteDistribution:
    def test_deletes(self, test_client, seed_distribution_graph, db):
        edge = db.query(Distribution).filter_by(source_entity_id="B").first()
        r = test_client.delete(
            f"/api/charging/distributions/{edge.id}",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 200
        assert r.json()["deleted"] is True

    def test_404(self, test_client, seed_distribution_graph):
        r = test_client.delete(
            "/api/charging/distributions/99999",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# Per-entity surfaces
# ---------------------------------------------------------------------------


class TestEntityDistributionSummary:
    def test_returns_to_business_edges_and_residual(self, test_client, seed_distribution_graph):
        r = test_client.get(
            "/api/charging/entities/B/distribution-summary?year=2026&version=forecast",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 200
        data = r.json()
        # B: to_business=50, one outgoing 30% edge (B→C), self-retained=20.
        assert data["to_business_pct"] == 50.0
        assert len(data["distributions"]) == 1
        assert data["self_retained_pct"] == 20.0
        assert data["sums_within_100"] is True

    def test_404_for_unknown(self, test_client, seed_distribution_graph):
        r = test_client.get(
            "/api/charging/entities/nope/distribution-summary?year=2026",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 404


class TestUpdateToBusiness:
    def test_updates_field(self, test_client, seed_distribution_graph):
        r = test_client.put(
            "/api/charging/entities/A/to-business-pct?new_pct=30&year=2026&version=forecast",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 200
        # A had to_business=0, edge A→B=40. New grand=70, valid.
        assert r.json()["to_business_pct"] == 30.0

    def test_rejects_when_overflows(self, test_client, seed_distribution_graph):
        # B already has to_business=50, edge=30. Raising to 80 → grand=110.
        r = test_client.put(
            "/api/charging/entities/B/to-business-pct?new_pct=80&year=2026&version=forecast",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 409


class TestEffectiveCost:
    def test_no_inflows_returns_only_own(self, test_client, seed_distribution_graph):
        # A has no inflows, no project → 0.
        r = test_client.get(
            "/api/charging/entities/A/effective-cost?year=2026&version=forecast",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["own_cost"] == 0.0
        assert data["effective_cost"] == 0.0
        assert data["inflows"] == []

    def test_project_subtype_has_own_cost(self, test_client, seed_distribution_graph):
        # D is a Project with annual_budget=100000.
        r = test_client.get(
            "/api/charging/entities/D/effective-cost?year=2026&version=forecast",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["own_cost"] == 100000.0
        assert data["effective_cost"] == 100000.0


class TestUpstreamChain:
    def test_returns_paths(self, test_client, seed_distribution_graph):
        # C inherits from B which inherits from A → path [A, B, C].
        r = test_client.get(
            "/api/charging/entities/C/upstream-chain?year=2026&version=forecast",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["paths"] == [["A", "B", "C"]]


class TestWBSPreview:
    def test_renders_wbs(self, test_client, seed_distribution_graph):
        r = test_client.get(
            "/api/charging/entities/B/wbs/cl-de-muc",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["wbs_element"] == "IT00BBB-64-99-DE-MUC-001"

    def test_404_unknown_entity(self, test_client, seed_distribution_graph):
        r = test_client.get(
            "/api/charging/entities/no-such/wbs/cl-de-muc",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 404

    def test_404_unknown_charging_location(self, test_client, seed_distribution_graph):
        r = test_client.get(
            "/api/charging/entities/B/wbs/cl-no-such",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 404
