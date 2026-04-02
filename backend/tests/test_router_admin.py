"""Integration tests for routers/admin.py."""

import pytest

from models.system import PlanningParameter


HEADERS_CTRL = {"X-Current-User": "persona-controller"}
HEADERS_PL = {"X-Current-User": "persona-pl"}


class TestAdminRouter:
    def test_get_context(self, test_client, seed_personas):
        resp = test_client.get("/api/admin/context", headers=HEADERS_CTRL)
        assert resp.status_code == 200
        data = resp.json()
        assert "cost_center_count" in data

    def test_context_forbidden_for_pl(self, test_client, seed_personas):
        resp = test_client.get("/api/admin/context", headers=HEADERS_PL)
        assert resp.status_code == 403

    def test_get_parameters(self, test_client, seed_personas):
        resp = test_client.get("/api/admin/parameters", headers=HEADERS_CTRL)
        assert resp.status_code == 200

    def test_update_parameter(self, test_client, db, seed_personas):
        db.add(PlanningParameter(
            key="standard_hours_global", name="Standard Hours",
            current_value="160", default_value="160",
            data_type="integer", param_group="planning",
        ))
        db.commit()
        resp = test_client.put("/api/admin/parameters", headers=HEADERS_CTRL, json={
            "changes": [{"key": "standard_hours_global", "new_value": "170"}],
        })
        assert resp.status_code == 200

    def test_get_audit_log(self, test_client, seed_personas):
        resp = test_client.get("/api/admin/audit-log", headers=HEADERS_CTRL)
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data

    def test_create_location(self, test_client, seed_personas):
        resp = test_client.post("/api/admin/locations", headers=HEADERS_CTRL, json={
            "city": "Berlin",
            "country": "Germany",
        })
        assert resp.status_code == 200
        assert resp.json()["city"] == "Berlin"
