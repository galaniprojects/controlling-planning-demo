"""Integration tests for routers/portfolio.py."""

from unittest.mock import patch

import pytest


HEADERS_CTRL = {"X-Current-User": "persona-controller"}


@patch("services.portfolio_service.DEMO_DATE", "2026-04")
@patch("routers.portfolio.DEMO_DATE", "2026-04")
class TestPortfolioRouter:
    def test_get_kpis(self, test_client, seed_personas, create_test_project):
        # Portfolio KPIs serve the Change population (VIPER §3.2) — an
        # execution-stage project qualifies.
        create_test_project("proj-1", pipeline_stage="Active")
        resp = test_client.get("/api/portfolio/kpis", headers=HEADERS_CTRL)
        assert resp.status_code == 200
        data = resp.json()
        assert "baseline" in data
        assert "current_forecast" in data
        assert data["active_project_count"] >= 1

    def test_get_kpis_no_auth(self, test_client, seed_personas):
        resp = test_client.get("/api/portfolio/kpis")
        assert resp.status_code == 422

    def test_get_projects_tree(self, test_client, seed_personas, create_test_project):
        create_test_project("proj-1", pipeline_stage="Active")
        resp = test_client.get("/api/portfolio/projects", headers=HEADERS_CTRL)
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "total" in data
        assert data["total"] >= 1

    def test_get_projects_tree_with_status_filter(self, test_client, seed_personas, create_test_project):
        create_test_project("proj-1", status="active", pipeline_stage="Active")
        resp = test_client.get("/api/portfolio/projects?status=active", headers=HEADERS_CTRL)
        assert resp.status_code == 200

    def test_get_project_summary(self, test_client, seed_personas, create_test_project):
        create_test_project("proj-1")
        resp = test_client.get("/api/portfolio/projects/proj-1/summary",
                               headers=HEADERS_CTRL)
        assert resp.status_code == 200

    def test_get_project_summary_not_found(self, test_client, seed_personas):
        resp = test_client.get("/api/portfolio/projects/nonexistent/summary",
                               headers=HEADERS_CTRL)
        assert resp.status_code == 404

    def test_get_intake_queue_deprecated(self, test_client, seed_personas):
        """v5: /api/portfolio/intake is 410 Gone per [A-BK-26]/[A-PS-13]."""
        resp = test_client.get("/api/portfolio/intake", headers=HEADERS_CTRL)
        assert resp.status_code == 410
        body = resp.json()
        assert body["detail"]["error"] == "v4_intake_removed"
        assert "GET /api/intake/queue" in body["detail"]["replacements"]["list_review_queue"]

    def test_kpis_filtered_by_status(self, test_client, seed_personas, create_test_project):
        # `status` filter now matches the lifecycle pipeline_stage.
        create_test_project("proj-1", pipeline_stage="Active")
        create_test_project("proj-2", name="Proposed", pipeline_stage="Proposed")
        resp = test_client.get("/api/portfolio/kpis?status=Active", headers=HEADERS_CTRL)
        assert resp.status_code == 200
        assert resp.json()["active_project_count"] == 1
