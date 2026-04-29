"""External cost category verification tests [E-08e] [E-08f].

D1 shipped the ExternalCostType admin CRUD; this file confirms the entity
behaves correctly against the v5 spec [E-08e] (default demo set,
admin-configurable taxonomy) and [E-08f] (admin module master data browser
with standard CRUD per Cluster D pattern). Existing partial coverage lives
in ``test_router_admin_d1_extensions.py``; this module adds the additional
edge cases the E1 spec requires.
"""

from __future__ import annotations

import pytest

from models.financial import ExternalCostType
from models.system import AuditLog


HEADERS_CTRL = {"X-Current-User": "persona-controller"}
HEADERS_PL = {"X-Current-User": "persona-pl"}
HEADERS_EXEC = {"X-Current-User": "persona-exec"}
HEADERS_CC = {"X-Current-User": "persona-cc-owner"}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def default_demo_set(db):
    """Seed the default demo set per [E-08e]:
    Consulting, Cloud/Infrastructure, Licenses, Hardware, Other.
    """
    rows = [
        ExternalCostType(id="ext-consulting", name="Consulting"),
        ExternalCostType(id="ext-cloud-infra", name="Cloud/Infrastructure"),
        ExternalCostType(id="ext-licenses", name="Licenses"),
        ExternalCostType(id="ext-hardware", name="Hardware"),
        ExternalCostType(id="ext-other", name="Other"),
    ]
    db.add_all(rows)
    db.commit()
    return rows


# ---------------------------------------------------------------------------
# [E-08e] Default demo set
# ---------------------------------------------------------------------------


class TestDefaultDemoSet:
    """Verify the [E-08e] default demo taxonomy can round-trip via the API."""

    def test_default_set_has_five_canonical_entries(
        self, test_client, seed_personas, default_demo_set,
    ):
        resp = test_client.get(
            "/api/admin/external-cost-types", headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        body = resp.json()
        names = {item["name"] for item in body["items"]}
        # Per [E-08e]: Consulting, Cloud/Infrastructure, Licenses, Hardware, Other
        assert names == {
            "Consulting", "Cloud/Infrastructure", "Licenses",
            "Hardware", "Other",
        }
        assert body["total"] == 5

    def test_response_shape_matches_list_contract(
        self, test_client, seed_personas, default_demo_set,
    ):
        resp = test_client.get(
            "/api/admin/external-cost-types", headers=HEADERS_CTRL,
        )
        body = resp.json()
        assert "items" in body
        assert "total" in body
        for item in body["items"]:
            assert set(item.keys()) == {"id", "name"}

    def test_list_returns_alphabetical(
        self, test_client, seed_personas, default_demo_set,
    ):
        resp = test_client.get(
            "/api/admin/external-cost-types", headers=HEADERS_CTRL,
        )
        names = [item["name"] for item in resp.json()["items"]]
        assert names == sorted(names)


# ---------------------------------------------------------------------------
# [E-08f] Standard CRUD per Cluster D browser pattern
# ---------------------------------------------------------------------------


class TestCRUDLifecycle:
    """End-to-end CRUD lifecycle per [E-08f]: list → create → update."""

    def test_create_returns_id_and_name(self, test_client, seed_personas):
        resp = test_client.post(
            "/api/admin/external-cost-types", headers=HEADERS_CTRL,
            json={"name": "Training"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["name"] == "Training"
        assert body["id"].startswith("ext-")

    def test_created_row_appears_in_list(self, test_client, seed_personas):
        test_client.post(
            "/api/admin/external-cost-types", headers=HEADERS_CTRL,
            json={"name": "Travel"},
        )
        resp = test_client.get(
            "/api/admin/external-cost-types", headers=HEADERS_CTRL,
        )
        names = {i["name"] for i in resp.json()["items"]}
        assert "Travel" in names

    def test_create_audit_logged_master_data(
        self, test_client, db, seed_personas,
    ):
        resp = test_client.post(
            "/api/admin/external-cost-types", headers=HEADERS_CTRL,
            json={"name": "Procurement Fees"},
        )
        new_id = resp.json()["id"]
        log = db.query(AuditLog).filter(
            AuditLog.entity_type == "external_cost_type",
            AuditLog.entity_id == new_id,
            AuditLog.action == "create",
        ).first()
        assert log is not None
        assert log.category == "master_data"

    def test_update_name_persists_and_audits(
        self, test_client, db, seed_personas, default_demo_set,
    ):
        resp = test_client.put(
            "/api/admin/external-cost-types/ext-other",
            headers=HEADERS_CTRL,
            json={"name": "Other Third Party Services"},
        )
        assert resp.status_code == 200
        # Re-list confirms the rename
        all_rows = test_client.get(
            "/api/admin/external-cost-types", headers=HEADERS_CTRL,
        ).json()
        names = {i["name"] for i in all_rows["items"]}
        assert "Other Third Party Services" in names
        assert "Other" not in names

        log = db.query(AuditLog).filter(
            AuditLog.entity_type == "external_cost_type",
            AuditLog.action == "update",
            AuditLog.field_changed == "name",
        ).first()
        assert log is not None
        assert log.old_value == "Other"
        assert log.new_value == "Other Third Party Services"
        assert log.category == "master_data"

    def test_update_unchanged_name_no_audit(
        self, test_client, db, seed_personas, default_demo_set,
    ):
        # Same name → no-op (Cluster D pattern is to skip audit when no change)
        resp = test_client.put(
            "/api/admin/external-cost-types/ext-consulting",
            headers=HEADERS_CTRL,
            json={"name": "Consulting"},
        )
        assert resp.status_code == 200
        # No audit log entry written because nothing changed
        logs = db.query(AuditLog).filter(
            AuditLog.entity_type == "external_cost_type",
            AuditLog.entity_id == "ext-consulting",
            AuditLog.action == "update",
        ).all()
        assert logs == []


# ---------------------------------------------------------------------------
# Constraints
# ---------------------------------------------------------------------------


class TestConstraints:
    def test_create_duplicate_name_409(
        self, test_client, seed_personas, default_demo_set,
    ):
        resp = test_client.post(
            "/api/admin/external-cost-types", headers=HEADERS_CTRL,
            json={"name": "Consulting"},
        )
        assert resp.status_code == 409
        assert "already exists" in resp.json()["detail"].lower()

    def test_update_to_existing_name_409(
        self, test_client, seed_personas, default_demo_set,
    ):
        resp = test_client.put(
            "/api/admin/external-cost-types/ext-hardware",
            headers=HEADERS_CTRL,
            json={"name": "Consulting"},  # already taken
        )
        assert resp.status_code == 409

    def test_update_unknown_id_404(self, test_client, seed_personas):
        resp = test_client.put(
            "/api/admin/external-cost-types/ext-nope",
            headers=HEADERS_CTRL,
            json={"name": "Whatever"},
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Authorization — Cluster D admin pattern: controller-only writes
# ---------------------------------------------------------------------------


class TestAuthorization:
    def test_pl_cannot_list(self, test_client, seed_personas, default_demo_set):
        resp = test_client.get(
            "/api/admin/external-cost-types", headers=HEADERS_PL,
        )
        assert resp.status_code == 403

    def test_exec_cannot_list(self, test_client, seed_personas, default_demo_set):
        resp = test_client.get(
            "/api/admin/external-cost-types", headers=HEADERS_EXEC,
        )
        assert resp.status_code == 403

    def test_cc_owner_cannot_list(self, test_client, seed_personas, default_demo_set):
        resp = test_client.get(
            "/api/admin/external-cost-types", headers=HEADERS_CC,
        )
        assert resp.status_code == 403

    def test_pl_cannot_create(self, test_client, seed_personas):
        resp = test_client.post(
            "/api/admin/external-cost-types", headers=HEADERS_PL,
            json={"name": "Hijack"},
        )
        assert resp.status_code == 403

    def test_pl_cannot_update(
        self, test_client, seed_personas, default_demo_set,
    ):
        resp = test_client.put(
            "/api/admin/external-cost-types/ext-licenses",
            headers=HEADERS_PL,
            json={"name": "Hijacked"},
        )
        assert resp.status_code == 403

    def test_missing_header_422(self, test_client, seed_personas, default_demo_set):
        resp = test_client.get("/api/admin/external-cost-types")
        assert resp.status_code == 422
