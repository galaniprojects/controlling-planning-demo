"""Router tests for v5 Session F2 ChargeableEntity admin CRUD [F-DM-01..04]."""

from __future__ import annotations

import pytest

from models.charging import ChargeableEntity
from models.organization import GroupingEntity, GroupingEntityType
from models.projects import Project


@pytest.fixture
def seed_chargeable_entities(db, seed_org_base, seed_personas):
    """Seed a small ChargeableEntity set + the GroupingEntity master rows
    needed for hierarchy_node_id FK resolution in router tests.
    """
    et = GroupingEntityType(id="get-lob", name="LoB")
    n = GroupingEntity(id="lob-1", entity_type_id="get-lob", name="LoB One")
    db.add_all([et, n])

    p = Project(
        id="proj-x", name="Project X", status="active", capex_opex="opex",
        start_month="2025-01", is_service=True, annual_budget=100000,
    )
    db.add(p)
    db.flush()

    rows = [
        ChargeableEntity(
            id="ce-proj-x", entity_type="Project", identifier="IT012999",
            name="Project X", project_id="proj-x", to_business_pct=10.0,
            hierarchy_node_id="lob-1",
        ),
        ChargeableEntity(
            id="ce-off-test", entity_type="Offering", identifier="IT00TEST",
            name="Test Offering", to_business_pct=80.0,
            hierarchy_node_id="lob-1",
        ),
        ChargeableEntity(
            id="ce-svc-test", entity_type="InternalService", identifier="ITF99999",
            name="Test InternalService", to_business_pct=0.0,
            hierarchy_node_id="lob-1",
        ),
    ]
    db.add_all(rows)
    db.commit()


# ---------------------------------------------------------------------------
# List + filter + detail
# ---------------------------------------------------------------------------


class TestListChargeableEntities:
    def test_returns_all_active(self, test_client, seed_chargeable_entities):
        r = test_client.get(
            "/api/admin/chargeable-entities",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["total"] == 3
        types = {item["entity_type"] for item in data["items"]}
        assert types == {"Project", "Offering", "InternalService"}

    def test_filter_by_entity_type(self, test_client, seed_chargeable_entities):
        r = test_client.get(
            "/api/admin/chargeable-entities?entity_type=Offering",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) == 1
        assert items[0]["entity_type"] == "Offering"

    def test_filter_by_hierarchy_node(self, test_client, seed_chargeable_entities):
        r = test_client.get(
            "/api/admin/chargeable-entities?hierarchy_node_id=lob-1",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 200
        assert r.json()["total"] == 3

    def test_invalid_entity_type_rejected(self, test_client, seed_chargeable_entities):
        r = test_client.get(
            "/api/admin/chargeable-entities?entity_type=Bogus",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 422

    def test_pl_role_can_read(self, test_client, seed_chargeable_entities):
        # [A-05]: Charging reads are open to all four roles — mutations remain
        # controller-only. PL must succeed on the GET.
        r = test_client.get(
            "/api/admin/chargeable-entities",
            headers={"X-Current-User": "persona-pl"},
        )
        assert r.status_code == 200

    def test_response_includes_is_change_or_run(self, test_client, seed_chargeable_entities):
        r = test_client.get(
            "/api/admin/chargeable-entities",
            headers={"X-Current-User": "persona-controller"},
        )
        for item in r.json()["items"]:
            assert "is_change_or_run" in item
            assert item["is_change_or_run"] in ("Change", "Run")


class TestGetChargeableEntity:
    def test_returns_entity(self, test_client, seed_chargeable_entities):
        r = test_client.get(
            "/api/admin/chargeable-entities/ce-off-test",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["id"] == "ce-off-test"
        assert data["entity_type"] == "Offering"
        assert data["identifier"] == "IT00TEST"

    def test_404_for_unknown(self, test_client, seed_chargeable_entities):
        r = test_client.get(
            "/api/admin/chargeable-entities/no-such",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


class TestCreateChargeableEntity:
    def test_creates_offering(self, test_client, seed_chargeable_entities):
        r = test_client.post(
            "/api/admin/chargeable-entities",
            headers={"X-Current-User": "persona-controller"},
            json={
                "entity_type": "Offering",
                "identifier": "IT00NEW1",
                "name": "New Offering",
                "hierarchy_node_id": "lob-1",
                "to_business_pct": 50.0,
            },
        )
        assert r.status_code == 201
        assert r.json()["identifier"] == "IT00NEW1"

    def test_creates_internal_service(self, test_client, seed_chargeable_entities):
        r = test_client.post(
            "/api/admin/chargeable-entities",
            headers={"X-Current-User": "persona-controller"},
            json={
                "entity_type": "InternalService",
                "identifier": "ITF55555",
                "name": "New Internal Service",
                "to_business_pct": 0.0,
            },
        )
        assert r.status_code == 201

    def test_rejects_bad_identifier_for_type(self, test_client, seed_chargeable_entities):
        # Project format on an Offering type → 422.
        r = test_client.post(
            "/api/admin/chargeable-entities",
            headers={"X-Current-User": "persona-controller"},
            json={
                "entity_type": "Offering",
                "identifier": "IT012001",  # PPM format
                "name": "Bad",
                "to_business_pct": 0.0,
            },
        )
        assert r.status_code == 422

    def test_project_subtype_requires_project_id(self, test_client, seed_chargeable_entities):
        r = test_client.post(
            "/api/admin/chargeable-entities",
            headers={"X-Current-User": "persona-controller"},
            json={
                "entity_type": "Project",
                "identifier": "IT012998",
                "name": "Orphan",
                "to_business_pct": 0.0,
            },
        )
        assert r.status_code == 422

    def test_offering_rejects_project_id(self, test_client, seed_chargeable_entities):
        r = test_client.post(
            "/api/admin/chargeable-entities",
            headers={"X-Current-User": "persona-controller"},
            json={
                "entity_type": "Offering",
                "identifier": "IT00MISC",
                "name": "Bad",
                "project_id": "proj-x",
                "to_business_pct": 0.0,
            },
        )
        assert r.status_code == 422

    def test_duplicate_identifier_409(self, test_client, seed_chargeable_entities):
        r = test_client.post(
            "/api/admin/chargeable-entities",
            headers={"X-Current-User": "persona-controller"},
            json={
                "entity_type": "Offering",
                "identifier": "IT00TEST",  # already exists
                "name": "Dup",
                "to_business_pct": 0.0,
            },
        )
        assert r.status_code == 409

    def test_duplicate_project_link_409(self, test_client, seed_chargeable_entities):
        r = test_client.post(
            "/api/admin/chargeable-entities",
            headers={"X-Current-User": "persona-controller"},
            json={
                "entity_type": "Project",
                "identifier": "IT012997",
                "name": "Dup project link",
                "project_id": "proj-x",  # already linked
                "to_business_pct": 0.0,
            },
        )
        assert r.status_code == 409

    def test_unknown_hierarchy_node_404(self, test_client, seed_chargeable_entities):
        r = test_client.post(
            "/api/admin/chargeable-entities",
            headers={"X-Current-User": "persona-controller"},
            json={
                "entity_type": "Offering",
                "identifier": "IT00MISC",
                "name": "Bad",
                "hierarchy_node_id": "lob-nope",
                "to_business_pct": 0.0,
            },
        )
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# Update + Deactivate
# ---------------------------------------------------------------------------


class TestUpdateChargeableEntity:
    def test_updates_name(self, test_client, seed_chargeable_entities):
        r = test_client.put(
            "/api/admin/chargeable-entities/ce-off-test",
            headers={"X-Current-User": "persona-controller"},
            json={"name": "Renamed Offering"},
        )
        assert r.status_code == 200
        assert r.json()["name"] == "Renamed Offering"

    def test_updates_to_business_pct(self, test_client, seed_chargeable_entities):
        r = test_client.put(
            "/api/admin/chargeable-entities/ce-off-test",
            headers={"X-Current-User": "persona-controller"},
            json={"to_business_pct": 25.0},
        )
        assert r.status_code == 200
        assert r.json()["to_business_pct"] == 25.0

    def test_404_for_unknown(self, test_client, seed_chargeable_entities):
        r = test_client.put(
            "/api/admin/chargeable-entities/no-such",
            headers={"X-Current-User": "persona-controller"},
            json={"name": "x"},
        )
        assert r.status_code == 404


class TestDeactivateChargeableEntity:
    def test_sets_inactive(self, test_client, seed_chargeable_entities, db):
        r = test_client.put(
            "/api/admin/chargeable-entities/ce-off-test/deactivate",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 200
        assert r.json()["is_active"] is False

    def test_404_for_unknown(self, test_client, seed_chargeable_entities):
        r = test_client.put(
            "/api/admin/chargeable-entities/no-such/deactivate",
            headers={"X-Current-User": "persona-controller"},
        )
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# is_change_or_run derivation
# ---------------------------------------------------------------------------


class TestIsChangeOrRunDerivation:
    def test_offering_is_run(self, db, seed_org_base):
        ce = ChargeableEntity(
            id="x", entity_type="Offering", identifier="IT00X", name="X",
        )
        db.add(ce)
        db.commit()
        assert ce.is_change_or_run == "Run"

    def test_internal_service_is_run(self, db, seed_org_base):
        ce = ChargeableEntity(
            id="y", entity_type="InternalService", identifier="ITF99000",
            name="Y",
        )
        db.add(ce)
        db.commit()
        assert ce.is_change_or_run == "Run"

    def test_project_in_doi_3_is_change(self, db, seed_org_base):
        p = Project(
            id="proj-c", name="C", status="active", capex_opex="opex",
            start_month="2025-01", doi=3,
        )
        db.add(p)
        db.flush()
        ce = ChargeableEntity(
            id="ce-c", entity_type="Project", identifier="IT099900",
            name="C", project_id="proj-c",
        )
        db.add(ce)
        db.commit()
        assert ce.is_change_or_run == "Change"

    def test_project_in_doi_5_is_run(self, db, seed_org_base):
        p = Project(
            id="proj-r", name="R", status="active", capex_opex="opex",
            start_month="2025-01", doi=5,
        )
        db.add(p)
        db.flush()
        ce = ChargeableEntity(
            id="ce-r", entity_type="Project", identifier="IT099901",
            name="R", project_id="proj-r",
        )
        db.add(ce)
        db.commit()
        assert ce.is_change_or_run == "Run"

    def test_project_with_null_doi_is_run_fallback(self, db, seed_org_base):
        p = Project(
            id="proj-n", name="N", status="active", capex_opex="opex",
            start_month="2025-01",
        )
        db.add(p)
        db.flush()
        ce = ChargeableEntity(
            id="ce-n", entity_type="Project", identifier="IT099902",
            name="N", project_id="proj-n",
        )
        db.add(ce)
        db.commit()
        assert ce.is_change_or_run == "Run"
