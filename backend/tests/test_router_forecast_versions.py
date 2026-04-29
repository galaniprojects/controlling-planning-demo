"""Router tests for forecast versions endpoints [C-FV-01..07, C-RH-01..04]."""
from __future__ import annotations

from unittest.mock import patch
import pytest

HEADERS_CTRL = {"X-Current-User": "persona-controller"}
HEADERS_PL = {"X-Current-User": "persona-pl"}


def _setup_params(db):
    from models.system import PlanningParameter
    existing = {r.key for r in db.query(PlanningParameter).all()}
    if "granularity_boundary_months" not in existing:
        db.add(PlanningParameter(
            key="granularity_boundary_months", name="Boundary",
            description="", current_value="12", default_value="12",
            data_type="integer", param_group="planning",
        ))
    if "planning_horizon_months" not in existing:
        db.add(PlanningParameter(
            key="planning_horizon_months", name="Horizon",
            description="", current_value="60", default_value="60",
            data_type="integer", param_group="planning",
        ))
    db.commit()


@patch("routers.workbench.DEMO_DATE", "2026-04")
@patch("config.DEMO_DATE", "2026-04")
class TestListForecastVersions:
    def test_list_empty(self, test_client, seed_personas, create_test_project, db):
        _setup_params(db)
        create_test_project("proj-alpha")
        resp = test_client.get("/api/projects/proj-alpha/forecast/versions",
                               headers=HEADERS_CTRL)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["items"] == []

    def test_list_after_manual_create(self, test_client, seed_personas, create_test_project, db):
        _setup_params(db)
        create_test_project("proj-alpha")
        # Create a manual version
        resp_create = test_client.post(
            "/api/projects/proj-alpha/forecast/versions",
            json={"label": "test"},
            headers=HEADERS_CTRL,
        )
        assert resp_create.status_code == 200

        resp = test_client.get("/api/projects/proj-alpha/forecast/versions",
                               headers=HEADERS_CTRL)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["version_type"] == "manual"

    def test_list_newest_first_sequencing(self, test_client, seed_personas, create_test_project, db):
        _setup_params(db)
        create_test_project("proj-alpha")
        test_client.post("/api/projects/proj-alpha/forecast/versions",
                         json={"label": "v1"}, headers=HEADERS_CTRL)
        test_client.post("/api/projects/proj-alpha/forecast/versions",
                         json={"label": "v2"}, headers=HEADERS_CTRL)
        resp = test_client.get("/api/projects/proj-alpha/forecast/versions",
                               headers=HEADERS_CTRL)
        items = resp.json()["items"]
        assert items[0]["version_number"] == 2
        assert items[1]["version_number"] == 1

    def test_pl_can_list_own_project(self, test_client, seed_personas, create_test_project, db):
        _setup_params(db)
        create_test_project("proj-alpha")
        resp = test_client.get("/api/projects/proj-alpha/forecast/versions",
                               headers=HEADERS_PL)
        assert resp.status_code == 200

    def test_pl_denied_other_project(self, test_client, seed_personas, create_test_project, db):
        _setup_params(db)
        create_test_project("proj-other")
        resp = test_client.get("/api/projects/proj-other/forecast/versions",
                               headers=HEADERS_PL)
        assert resp.status_code == 403

    def test_project_not_found(self, test_client, seed_personas, db):
        resp = test_client.get("/api/projects/nonexistent/forecast/versions",
                               headers=HEADERS_CTRL)
        assert resp.status_code == 404


@patch("routers.workbench.DEMO_DATE", "2026-04")
@patch("config.DEMO_DATE", "2026-04")
class TestGetForecastVersion:
    def test_get_version_detail(self, test_client, seed_personas, create_test_project, db):
        _setup_params(db)
        create_test_project("proj-alpha")
        create_resp = test_client.post(
            "/api/projects/proj-alpha/forecast/versions",
            json={"label": "smoke"},
            headers=HEADERS_CTRL,
        )
        version_id = create_resp.json()["id"]
        resp = test_client.get(
            f"/api/projects/proj-alpha/forecast/versions/{version_id}",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "meta" in data
        assert "payload" in data

    def test_get_version_not_found(self, test_client, seed_personas, create_test_project, db):
        _setup_params(db)
        create_test_project("proj-alpha")
        resp = test_client.get(
            "/api/projects/proj-alpha/forecast/versions/99999",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 404

    def test_get_version_wrong_project(self, test_client, seed_personas, create_test_project, db):
        """Version exists but under different project → 404."""
        _setup_params(db)
        create_test_project("proj-alpha")
        create_test_project("proj-beta")
        create_resp = test_client.post(
            "/api/projects/proj-alpha/forecast/versions",
            json={"label": "x"},
            headers=HEADERS_CTRL,
        )
        version_id = create_resp.json()["id"]
        resp = test_client.get(
            f"/api/projects/proj-beta/forecast/versions/{version_id}",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 404


@patch("routers.workbench.DEMO_DATE", "2026-04")
@patch("config.DEMO_DATE", "2026-04")
class TestManualSnapshot:
    def test_controller_creates_version(self, test_client, seed_personas, create_test_project, db):
        _setup_params(db)
        create_test_project("proj-alpha")
        resp = test_client.post(
            "/api/projects/proj-alpha/forecast/versions",
            json={"label": "smoke"},
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["version_type"] == "manual"
        assert data["cycle_label"] == "smoke"
        assert data["version_number"] == 1

    def test_non_controller_denied(self, test_client, seed_personas, create_test_project, db):
        _setup_params(db)
        create_test_project("proj-alpha")
        resp = test_client.post(
            "/api/projects/proj-alpha/forecast/versions",
            json={"label": "x"},
            headers=HEADERS_PL,
        )
        assert resp.status_code == 403

    def test_no_label_allowed(self, test_client, seed_personas, create_test_project, db):
        _setup_params(db)
        create_test_project("proj-alpha")
        resp = test_client.post(
            "/api/projects/proj-alpha/forecast/versions",
            json={},
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        assert resp.json()["cycle_label"] is None

    def test_project_not_found(self, test_client, seed_personas, db):
        resp = test_client.post(
            "/api/projects/nonexistent/forecast/versions",
            json={"label": "x"},
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 404
