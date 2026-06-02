"""Router tests for Stage 1 Distribution endpoints (FD-3 — version_id rescope).

Covers the edge CRUD endpoints (rescoped to ``version_id``) and the eight
new version-management endpoints (`[F-S1-02..07]`):

- ``GET /api/charging/distribution-versions`` — list (status / include_scenario filters)
- ``POST /api/charging/distribution-versions`` — create draft (blank / copy_active / copy_prior)
- ``GET /api/charging/distribution-versions/{id}`` — detail (header + edges)
- ``PUT /api/charging/distribution-versions/{id}`` — update draft rationale
- ``POST /api/charging/distribution-versions/{id}/activate`` — activate (production-only)
- ``DELETE /api/charging/distribution-versions/{id}`` — delete draft
- ``GET /api/charging/distribution-versions/{id}/diff`` — version diff
- ``GET /api/charging/stage1/entities/{id}`` — per-entity Stage 1 view per [F-S1-06]
"""

from __future__ import annotations

from datetime import date

import pytest

from models.charging import (
    ChargeableEntity, ChargingLocation, Distribution, DistributionVersion,
)
from models.organization import GroupingEntity, GroupingEntityType
from models.projects import Project
from models.scenarios import Scenario


@pytest.fixture
def seed_distribution_graph(db, seed_org_base, seed_personas):
    """Seed: 4 entities + 1 active production version + 2 edges.

    A (InternalService, to_business=0), B (Offering, to_business=50),
    C (Offering, to_business=0), D (Project with annual_budget=100k).

    Edges: A → B (40%), B → C (30%). One active production version
    ``active_from=2025-01-01``.
    """
    et = GroupingEntityType(id="get-lob", name="LoB")
    n = GroupingEntity(id="lob-1", entity_type_id="get-lob", name="LoB One")
    db.add_all([et, n])

    cl = ChargingLocation(id="cl-de-muc", code="DE-MUC-001", name="Munich")
    db.add(cl)

    p = Project(
        id="proj-d", name="D Project", pipeline_stage="Active", capex_opex="opex",
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

    v_active = DistributionVersion(
        active_from=date(2025, 1, 1), status="active",
        rationale="Initial seed", origin="seed",
    )
    db.add(v_active)
    db.flush()

    db.add_all([
        Distribution(
            version_id=v_active.id, source_entity_id="A",
            destination_entity_id="B", percentage=40.0,
        ),
        Distribution(
            version_id=v_active.id, source_entity_id="B",
            destination_entity_id="C", percentage=30.0,
        ),
    ])
    db.commit()
    return {"v_active_id": v_active.id}


@pytest.fixture
def seed_with_draft(db, seed_distribution_graph):
    """Add a draft sibling so write tests have a mutable target."""
    v = DistributionVersion(
        status="draft", origin="blank", rationale="",
    )
    db.add(v)
    db.commit()
    return {**seed_distribution_graph, "v_draft_id": v.id}


# ---------------------------------------------------------------------------
# Distribution edge endpoints
# ---------------------------------------------------------------------------


class TestListDistributions:
    def test_returns_all_edges(self, test_client, seed_distribution_graph):
        r = test_client.get(
            "/api/charging/distributions",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 200
        assert r.json()["total"] == 2

    def test_filter_by_version_id(self, test_client, seed_distribution_graph):
        vid = seed_distribution_graph["v_active_id"]
        r = test_client.get(
            f"/api/charging/distributions?version_id={vid}",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.json()["total"] == 2
        r2 = test_client.get(
            "/api/charging/distributions?version_id=99999",
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
        assert data["version_id"] == seed_distribution_graph["v_active_id"]

    def test_404(self, test_client, seed_distribution_graph):
        r = test_client.get(
            "/api/charging/distributions/99999",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 404


class TestCreateDistribution:
    def test_creates_valid_edge_on_draft(self, test_client, seed_with_draft):
        r = test_client.post(
            "/api/charging/distributions",
            headers={"X-Current-User": "persona-controller"},
            json={
                "version_id": seed_with_draft["v_draft_id"],
                "source_entity_id": "A", "destination_entity_id": "C",
                "percentage": 20.0, "rationale": "test",
            },
        )
        assert r.status_code == 201
        assert r.json()["rationale"] == "test"

    def test_rejects_self_loop_at_schema_level(self, test_client, seed_with_draft):
        r = test_client.post(
            "/api/charging/distributions",
            headers={"X-Current-User": "persona-controller"},
            json={
                "version_id": seed_with_draft["v_draft_id"],
                "source_entity_id": "A", "destination_entity_id": "A",
                "percentage": 5.0,
            },
        )
        assert r.status_code == 422

    def test_rejects_writes_to_active_version(
        self, test_client, seed_distribution_graph,
    ):
        r = test_client.post(
            "/api/charging/distributions",
            headers={"X-Current-User": "persona-controller"},
            json={
                "version_id": seed_distribution_graph["v_active_id"],
                "source_entity_id": "A", "destination_entity_id": "D",
                "percentage": 5.0,
            },
        )
        assert r.status_code == 409
        assert "immutable" in r.json()["detail"]["message"]

    def test_rejects_cycle_with_chain(self, test_client, seed_with_draft, db):
        # Seed A → B on the draft, then try C → A which doesn't close a cycle.
        # Instead seed B → A as a setup, then C → ? — actually closing A→B→A
        # via C requires a chain. Easier: set up a draft A→B, then attempt B→A.
        db.add(Distribution(
            version_id=seed_with_draft["v_draft_id"],
            source_entity_id="A", destination_entity_id="B", percentage=10.0,
        ))
        db.commit()
        r = test_client.post(
            "/api/charging/distributions",
            headers={"X-Current-User": "persona-controller"},
            json={
                "version_id": seed_with_draft["v_draft_id"],
                "source_entity_id": "B", "destination_entity_id": "A",
                "percentage": 10.0,
            },
        )
        assert r.status_code == 409
        body = r.json()["detail"]
        assert "cycle_chain" in body
        assert body["cycle_chain"][0] == "B"

    def test_rejects_sum_overflow(self, test_client, seed_with_draft, db):
        # B has to_business=50; add a 60% edge on the draft → grand 110 → 409.
        r = test_client.post(
            "/api/charging/distributions",
            headers={"X-Current-User": "persona-controller"},
            json={
                "version_id": seed_with_draft["v_draft_id"],
                "source_entity_id": "B", "destination_entity_id": "D",
                "percentage": 60.0,
            },
        )
        assert r.status_code == 409
        assert "Sum rule" in r.json()["detail"]["message"]

    def test_rejects_unknown_source(self, test_client, seed_with_draft):
        r = test_client.post(
            "/api/charging/distributions",
            headers={"X-Current-User": "persona-controller"},
            json={
                "version_id": seed_with_draft["v_draft_id"],
                "source_entity_id": "no-such", "destination_entity_id": "B",
                "percentage": 5.0,
            },
        )
        assert r.status_code == 409

    def test_pl_cannot_write(self, test_client, seed_with_draft):
        r = test_client.post(
            "/api/charging/distributions",
            headers={"X-Current-User": "persona-pl"},
            json={
                "version_id": seed_with_draft["v_draft_id"],
                "source_entity_id": "A", "destination_entity_id": "C",
                "percentage": 5.0,
            },
        )
        assert r.status_code == 403


class TestUpdateDistribution:
    def test_updates_percentage(self, test_client, seed_with_draft, db):
        # Move the existing edge onto the draft for mutability.
        db.add(Distribution(
            version_id=seed_with_draft["v_draft_id"],
            source_entity_id="A", destination_entity_id="B", percentage=20.0,
        ))
        db.commit()
        edge = db.query(Distribution).filter_by(
            version_id=seed_with_draft["v_draft_id"], source_entity_id="A",
        ).first()
        r = test_client.put(
            f"/api/charging/distributions/{edge.id}",
            headers={"X-Current-User": "persona-controller"},
            json={"percentage": 25.0, "rationale": "tweaked"},
        )
        assert r.status_code == 200
        assert r.json()["percentage"] == 25.0
        assert r.json()["rationale"] == "tweaked"

    def test_rejects_on_active_version(self, test_client, seed_distribution_graph, db):
        edge = db.query(Distribution).filter_by(source_entity_id="A").first()
        r = test_client.put(
            f"/api/charging/distributions/{edge.id}",
            headers={"X-Current-User": "persona-controller"},
            json={"percentage": 25.0},
        )
        assert r.status_code == 409


class TestDeleteDistribution:
    def test_deletes_on_draft(self, test_client, seed_with_draft, db):
        db.add(Distribution(
            version_id=seed_with_draft["v_draft_id"],
            source_entity_id="A", destination_entity_id="B", percentage=10.0,
        ))
        db.commit()
        edge = db.query(Distribution).filter_by(
            version_id=seed_with_draft["v_draft_id"],
        ).first()
        r = test_client.delete(
            f"/api/charging/distributions/{edge.id}",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 200
        assert r.json()["deleted"] is True

    def test_rejects_on_active_version(self, test_client, seed_distribution_graph, db):
        edge = db.query(Distribution).filter_by(source_entity_id="A").first()
        r = test_client.delete(
            f"/api/charging/distributions/{edge.id}",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 409

    def test_404(self, test_client, seed_distribution_graph):
        r = test_client.delete(
            "/api/charging/distributions/99999",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# Per-entity legacy surfaces
# ---------------------------------------------------------------------------


class TestEntityDistributionSummary:
    def test_returns_to_business_edges_and_residual(
        self, test_client, seed_distribution_graph,
    ):
        vid = seed_distribution_graph["v_active_id"]
        r = test_client.get(
            f"/api/charging/entities/B/distribution-summary?version_id={vid}",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["to_business_pct"] == 50.0
        assert len(data["distributions"]) == 1
        assert data["self_retained_pct"] == 20.0
        assert data["sums_within_100"] is True

    def test_default_resolves_in_force(
        self, test_client, seed_distribution_graph,
    ):
        # No version_id, no evaluated_date — should resolve today's in-force.
        # Seed's active_from=2025-01-01 ≤ today, so resolves to v_active.
        r = test_client.get(
            "/api/charging/entities/B/distribution-summary",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 200
        assert r.json()["version_id"] == seed_distribution_graph["v_active_id"]

    def test_404_for_unknown(self, test_client, seed_distribution_graph):
        r = test_client.get(
            "/api/charging/entities/nope/distribution-summary",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 404


class TestUpdateToBusiness:
    def test_updates_field_on_draft(self, test_client, seed_with_draft):
        vid = seed_with_draft["v_draft_id"]
        r = test_client.put(
            f"/api/charging/entities/A/to-business-pct?new_pct=30&version_id={vid}",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 200
        assert r.json()["to_business_pct"] == 30.0

    def test_rejects_on_active_version(self, test_client, seed_distribution_graph):
        vid = seed_distribution_graph["v_active_id"]
        r = test_client.put(
            f"/api/charging/entities/A/to-business-pct?new_pct=30&version_id={vid}",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 409


class TestEffectiveCost:
    def test_no_inflows_returns_only_own(
        self, test_client, seed_distribution_graph,
    ):
        vid = seed_distribution_graph["v_active_id"]
        r = test_client.get(
            f"/api/charging/entities/A/effective-cost?year=2026&version_id={vid}",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["own_cost"] == 0.0
        assert data["effective_cost"] == 0.0
        assert data["inflows"] == []

    def test_project_subtype_has_own_cost(
        self, test_client, seed_distribution_graph,
    ):
        vid = seed_distribution_graph["v_active_id"]
        r = test_client.get(
            f"/api/charging/entities/D/effective-cost?year=2026&version_id={vid}",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["own_cost"] == 100000.0
        assert data["own_cost_source"] == "annual_budget"
        assert data["effective_cost"] == 100000.0


class TestUpstreamChain:
    def test_returns_paths(self, test_client, seed_distribution_graph):
        vid = seed_distribution_graph["v_active_id"]
        r = test_client.get(
            f"/api/charging/entities/C/upstream-chain?version_id={vid}",
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
        assert r.json()["wbs_element"] == "IT00BBB-64-99-DE-MUC-001"

    def test_404_unknown_entity(self, test_client, seed_distribution_graph):
        r = test_client.get(
            "/api/charging/entities/no-such/wbs/cl-de-muc",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 404

    def test_404_unknown_charging_location(
        self, test_client, seed_distribution_graph,
    ):
        r = test_client.get(
            "/api/charging/entities/B/wbs/cl-no-such",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# DistributionVersion endpoints (new — FD-3 [F-S1-02..07])
# ---------------------------------------------------------------------------


class TestListDistributionVersions:
    def test_lists_production_only_by_default(
        self, test_client, seed_distribution_graph, db, seed_personas,
    ):
        # Add a scenario-scoped version that must NOT appear by default.
        sc = Scenario(name="Sc", author_id="persona-pl")
        db.add(sc)
        db.flush()
        v_sc = DistributionVersion(
            scenario_id=sc.id, status="draft", origin="blank", rationale="",
        )
        db.add(v_sc)
        db.commit()
        r = test_client.get(
            "/api/charging/distribution-versions",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 200
        ids = {v["id"] for v in r.json()["items"]}
        assert seed_distribution_graph["v_active_id"] in ids
        assert v_sc.id not in ids

    def test_include_scenario(
        self, test_client, seed_distribution_graph, db, seed_personas,
    ):
        sc = Scenario(name="Sc", author_id="persona-pl")
        db.add(sc)
        db.flush()
        v_sc = DistributionVersion(
            scenario_id=sc.id, status="draft", origin="blank", rationale="",
        )
        db.add(v_sc)
        db.commit()
        r = test_client.get(
            "/api/charging/distribution-versions?include_scenario=true",
            headers={"X-Current-User": "persona-controller"},
        )
        ids = {v["id"] for v in r.json()["items"]}
        assert v_sc.id in ids

    def test_status_filter(self, test_client, seed_with_draft):
        r = test_client.get(
            "/api/charging/distribution-versions?status=draft",
            headers={"X-Current-User": "persona-controller"},
        )
        items = r.json()["items"]
        assert all(v["status"] == "draft" for v in items)
        # No active in this filter.
        assert all(v["id"] != seed_with_draft["v_active_id"] for v in items)

    def test_open_to_pl_role(self, test_client, seed_distribution_graph):
        r = test_client.get(
            "/api/charging/distribution-versions",
            headers={"X-Current-User": "persona-pl"},
        )
        assert r.status_code == 200

    def test_edge_count_reported(
        self, test_client, seed_distribution_graph,
    ):
        r = test_client.get(
            "/api/charging/distribution-versions",
            headers={"X-Current-User": "persona-controller"},
        )
        v = next(
            x for x in r.json()["items"]
            if x["id"] == seed_distribution_graph["v_active_id"]
        )
        assert v["edge_count"] == 2


class TestCreateDistributionVersion:
    def test_creates_blank_draft(self, test_client, seed_distribution_graph):
        r = test_client.post(
            "/api/charging/distribution-versions",
            headers={"X-Current-User": "persona-controller"},
            json={"origin": "blank", "rationale": "experimenting"},
        )
        assert r.status_code == 201
        body = r.json()
        assert body["version"]["status"] == "draft"
        assert body["version"]["origin"] == "blank"
        assert body["version"]["rationale"] == "experimenting"
        assert body["total_edges"] == 0

    def test_creates_copy_active_draft_with_edges(
        self, test_client, seed_distribution_graph,
    ):
        r = test_client.post(
            "/api/charging/distribution-versions",
            headers={"X-Current-User": "persona-controller"},
            json={"origin": "copy_active"},
        )
        assert r.status_code == 201
        body = r.json()
        assert body["version"]["status"] == "draft"
        assert body["version"]["origin"] == "copy_active"
        # Copied A→B and B→C from the seeded active.
        assert body["total_edges"] == 2
        assert body["version"]["copied_from_version_id"] == seed_distribution_graph["v_active_id"]

    def test_creates_copy_prior_draft(
        self, test_client, seed_distribution_graph,
    ):
        vid = seed_distribution_graph["v_active_id"]
        r = test_client.post(
            "/api/charging/distribution-versions",
            headers={"X-Current-User": "persona-controller"},
            json={
                "origin": "copy_prior",
                "copied_from_version_id": vid,
            },
        )
        assert r.status_code == 201
        body = r.json()
        assert body["version"]["copied_from_version_id"] == vid
        assert body["total_edges"] == 2

    def test_copy_prior_without_id_returns_409(
        self, test_client, seed_distribution_graph,
    ):
        r = test_client.post(
            "/api/charging/distribution-versions",
            headers={"X-Current-User": "persona-controller"},
            json={"origin": "copy_prior"},
        )
        assert r.status_code == 409

    def test_invalid_origin_returns_422(
        self, test_client, seed_distribution_graph,
    ):
        r = test_client.post(
            "/api/charging/distribution-versions",
            headers={"X-Current-User": "persona-controller"},
            json={"origin": "scenario"},
        )
        assert r.status_code == 422

    def test_pl_forbidden(self, test_client, seed_distribution_graph):
        r = test_client.post(
            "/api/charging/distribution-versions",
            headers={"X-Current-User": "persona-pl"},
            json={"origin": "blank"},
        )
        assert r.status_code == 403


class TestGetDistributionVersion:
    def test_returns_detail(self, test_client, seed_distribution_graph):
        vid = seed_distribution_graph["v_active_id"]
        r = test_client.get(
            f"/api/charging/distribution-versions/{vid}",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["version"]["id"] == vid
        assert body["total_edges"] == 2
        assert len(body["edges"]) == 2

    def test_404(self, test_client, seed_distribution_graph):
        r = test_client.get(
            "/api/charging/distribution-versions/99999",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 404


class TestUpdateDistributionVersion:
    def test_updates_draft_rationale(
        self, test_client, seed_with_draft,
    ):
        vid = seed_with_draft["v_draft_id"]
        r = test_client.put(
            f"/api/charging/distribution-versions/{vid}",
            headers={"X-Current-User": "persona-controller"},
            json={"rationale": "explanation for the draft"},
        )
        assert r.status_code == 200
        assert r.json()["rationale"] == "explanation for the draft"

    def test_rejects_active(self, test_client, seed_distribution_graph):
        vid = seed_distribution_graph["v_active_id"]
        r = test_client.put(
            f"/api/charging/distribution-versions/{vid}",
            headers={"X-Current-User": "persona-controller"},
            json={"rationale": "should fail"},
        )
        assert r.status_code == 409
        assert "immutable" in r.json()["detail"]["message"]

    def test_pl_forbidden(self, test_client, seed_with_draft):
        vid = seed_with_draft["v_draft_id"]
        r = test_client.put(
            f"/api/charging/distribution-versions/{vid}",
            headers={"X-Current-User": "persona-pl"},
            json={"rationale": "x"},
        )
        assert r.status_code == 403


class TestActivateDistributionVersion:
    def test_activates_draft(self, test_client, seed_with_draft):
        vid = seed_with_draft["v_draft_id"]
        r = test_client.post(
            f"/api/charging/distribution-versions/{vid}/activate",
            headers={"X-Current-User": "persona-controller"},
            json={
                "active_from": "2026-06-01",
                "rationale": "Q2 2026 distribution agreed by SteerCo",
            },
        )
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "active"
        assert body["active_from"] == "2026-06-01"
        assert body["rationale"] == "Q2 2026 distribution agreed by SteerCo"
        assert body["activated_at"] is not None

    def test_rejects_duplicate_active_from(
        self, test_client, seed_with_draft,
    ):
        # The seeded active is 2025-01-01.
        vid = seed_with_draft["v_draft_id"]
        r = test_client.post(
            f"/api/charging/distribution-versions/{vid}/activate",
            headers={"X-Current-User": "persona-controller"},
            json={"active_from": "2025-01-01", "rationale": "x"},
        )
        assert r.status_code == 409
        assert "active_from" in r.json()["detail"]["message"]

    def test_rejects_empty_rationale_via_schema(
        self, test_client, seed_with_draft,
    ):
        vid = seed_with_draft["v_draft_id"]
        r = test_client.post(
            f"/api/charging/distribution-versions/{vid}/activate",
            headers={"X-Current-User": "persona-controller"},
            json={"active_from": "2026-07-01", "rationale": ""},
        )
        # Pydantic's min_length=1 catches this at the schema layer.
        assert r.status_code == 422

    def test_rejects_already_active(self, test_client, seed_distribution_graph):
        vid = seed_distribution_graph["v_active_id"]
        r = test_client.post(
            f"/api/charging/distribution-versions/{vid}/activate",
            headers={"X-Current-User": "persona-controller"},
            json={"active_from": "2027-01-01", "rationale": "redo"},
        )
        assert r.status_code == 409

    def test_pl_forbidden(self, test_client, seed_with_draft):
        vid = seed_with_draft["v_draft_id"]
        r = test_client.post(
            f"/api/charging/distribution-versions/{vid}/activate",
            headers={"X-Current-User": "persona-pl"},
            json={"active_from": "2026-06-01", "rationale": "x"},
        )
        assert r.status_code == 403


class TestDeleteDistributionVersion:
    def test_deletes_draft(self, test_client, seed_with_draft):
        vid = seed_with_draft["v_draft_id"]
        r = test_client.delete(
            f"/api/charging/distribution-versions/{vid}",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 200
        assert r.json()["deleted"] is True

    def test_rejects_active(self, test_client, seed_distribution_graph):
        vid = seed_distribution_graph["v_active_id"]
        r = test_client.delete(
            f"/api/charging/distribution-versions/{vid}",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 409

    def test_pl_forbidden(self, test_client, seed_with_draft):
        vid = seed_with_draft["v_draft_id"]
        r = test_client.delete(
            f"/api/charging/distribution-versions/{vid}",
            headers={"X-Current-User": "persona-pl"},
        )
        assert r.status_code == 403


class TestDiffDistributionVersion:
    def test_explicit_compared_to(
        self, test_client, seed_distribution_graph, db,
    ):
        v_active = seed_distribution_graph["v_active_id"]
        # Build a draft with one added, one changed, one removed edge.
        v2 = DistributionVersion(
            status="draft", origin="copy_prior",
            copied_from_version_id=v_active, rationale="",
        )
        db.add(v2)
        db.flush()
        db.add_all([
            Distribution(
                version_id=v2.id, source_entity_id="A",
                destination_entity_id="B", percentage=50.0,  # 40 → 50
                rationale="tuned",
            ),
            Distribution(
                version_id=v2.id, source_entity_id="A",
                destination_entity_id="C", percentage=10.0,  # added
            ),
            # B → C is omitted → 'removed' from the diff.
        ])
        db.commit()
        r = test_client.get(
            f"/api/charging/distribution-versions/{v2.id}/diff"
            f"?compared_to_version_id={v_active}",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["added_count"] == 1
        assert body["removed_count"] == 1
        assert body["changed_count"] == 1
        # Diff names should be populated.
        for c in body["changes"]:
            assert c["source_entity_name"] is not None
            assert c["destination_entity_name"] is not None

    def test_default_compared_to_resolves(
        self, test_client, seed_distribution_graph, db,
    ):
        v1_id = seed_distribution_graph["v_active_id"]
        v2 = DistributionVersion(
            status="active", active_from=date(2026, 1, 1),
            rationale="2026 split", origin="copy_active",
            copied_from_version_id=v1_id,
        )
        db.add(v2)
        db.commit()
        r = test_client.get(
            f"/api/charging/distribution-versions/{v2.id}/diff",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 200
        assert r.json()["compared_to_version"]["id"] == v1_id

    def test_no_default_partner_returns_422(
        self, test_client, seed_distribution_graph,
    ):
        # Only one version seeded — no prior to compare against.
        vid = seed_distribution_graph["v_active_id"]
        r = test_client.get(
            f"/api/charging/distribution-versions/{vid}/diff",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 422

    def test_unknown_version_returns_404(
        self, test_client, seed_distribution_graph,
    ):
        r = test_client.get(
            "/api/charging/distribution-versions/99999/diff",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 404


class TestEntityStage1View:
    def test_returns_full_payload(self, test_client, seed_distribution_graph):
        r = test_client.get(
            "/api/charging/stage1/entities/B?evaluated_date=2026-04-01",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["entity_id"] == "B"
        assert data["to_business_pct"] == 50.0
        # B has one outbound (B→C, 30%); to_business=50, distributed=30 → self=20.
        assert len(data["outbound_edges"]) == 1
        assert data["outbound_edges"][0]["destination_entity_id"] == "C"
        assert data["self_retained_pct"] == 20.0
        assert data["sums_within_100"] is True
        assert data["version"]["id"] == seed_distribution_graph["v_active_id"]
        assert data["evaluated_date"] == "2026-04-01"

    def test_history_marks_in_force(self, test_client, seed_distribution_graph):
        r = test_client.get(
            "/api/charging/stage1/entities/A?evaluated_date=2026-04-01",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 200
        history = r.json()["history"]
        assert any(
            h["is_in_force"] for h in history
            if h["version_id"] == seed_distribution_graph["v_active_id"]
        )

    def test_explicit_version_id_overrides_date(
        self, test_client, seed_with_draft,
    ):
        vid = seed_with_draft["v_draft_id"]
        r = test_client.get(
            f"/api/charging/stage1/entities/A?version_id={vid}",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 200
        assert r.json()["version"]["id"] == vid
        # Draft has no edges sourced at A.
        assert r.json()["outbound_edges"] == []

    def test_open_to_pl_role(self, test_client, seed_distribution_graph):
        r = test_client.get(
            "/api/charging/stage1/entities/A?evaluated_date=2026-04-01",
            headers={"X-Current-User": "persona-pl"},
        )
        assert r.status_code == 200

    def test_404_for_unknown_entity(self, test_client, seed_distribution_graph):
        r = test_client.get(
            "/api/charging/stage1/entities/no-such?evaluated_date=2026-04-01",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 404

    def test_404_when_no_version_in_force(
        self, test_client, seed_distribution_graph,
    ):
        # Active was active_from=2025-01-01; evaluating 2024 → no in-force.
        r = test_client.get(
            "/api/charging/stage1/entities/A?evaluated_date=2024-01-01",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 404
