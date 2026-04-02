"""Integration tests for routers/workbench.py."""

from unittest.mock import patch

import pytest


HEADERS_CTRL = {"X-Current-User": "persona-controller"}
HEADERS_PL = {"X-Current-User": "persona-pl"}


@patch("routers.workbench.DEMO_DATE", "2026-04")
@patch("services.portfolio_service.DEMO_DATE", "2026-04")
class TestWorkbenchRouter:
    def test_get_project_list(self, test_client, seed_personas, create_test_project):
        create_test_project("proj-1")
        resp = test_client.get("/api/projects", headers=HEADERS_CTRL)
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "total" in data
        assert data["total"] >= 1

    def test_get_project_overview(self, test_client, seed_personas, create_test_project):
        create_test_project("proj-1")
        resp = test_client.get("/api/projects/proj-1/overview", headers=HEADERS_CTRL)
        assert resp.status_code == 200
        data = resp.json()
        assert "metadata" in data

    def test_get_project_overview_not_found(self, test_client, seed_personas):
        resp = test_client.get("/api/projects/nonexistent/overview", headers=HEADERS_CTRL)
        assert resp.status_code == 404

    def test_start_forecast_cycle(self, test_client, seed_personas, create_test_project):
        create_test_project("proj-1")
        resp = test_client.post("/api/projects/proj-1/forecast-cycle/start",
                                headers=HEADERS_CTRL)
        assert resp.status_code == 200
        data = resp.json()
        assert "cycle_id" in data
        assert data["phase"] == 1

    def test_project_list_role_filtering(self, test_client, seed_personas, create_test_project):
        create_test_project("proj-alpha", name="Alpha", pl_person_id="p-pm-1")
        create_test_project("proj-other", name="Other")
        resp = test_client.get("/api/projects", headers=HEADERS_PL)
        assert resp.status_code == 200
        data = resp.json()
        ids = [item["id"] for item in data["items"]]
        assert "proj-alpha" in ids

    def test_get_cr_history(self, test_client, seed_personas, create_test_project):
        create_test_project("proj-1")
        resp = test_client.get("/api/projects/proj-1/change-requests",
                               headers=HEADERS_CTRL)
        assert resp.status_code == 200

    def test_no_auth(self, test_client, seed_personas):
        resp = test_client.get("/api/projects")
        assert resp.status_code == 422
