"""Integration tests for routers/capacity.py."""

from unittest.mock import patch

import pytest


HEADERS_CCO = {"X-Current-User": "persona-cc-owner"}
HEADERS_CTRL = {"X-Current-User": "persona-controller"}


@patch("routers.capacity.DEMO_DATE", "2026-04")
class TestCapacityRouter:
    def test_get_context(self, test_client, seed_personas):
        resp = test_client.get("/api/capacity/context", headers=HEADERS_CCO)
        assert resp.status_code == 200
        data = resp.json()
        assert "default_tab" in data
        assert "managed_cost_center_id" in data

    def test_get_context_controller(self, test_client, seed_personas):
        resp = test_client.get("/api/capacity/context", headers=HEADERS_CTRL)
        assert resp.status_code == 200

    def test_get_team_summary(self, test_client, seed_personas):
        resp = test_client.get("/api/capacity/my-team/cc-muc-dev/summary",
                               headers=HEADERS_CCO)
        assert resp.status_code == 200
        data = resp.json()
        assert "headcount" in data

    def test_get_team_heatmap(self, test_client, seed_personas):
        resp = test_client.get("/api/capacity/my-team/cc-muc-dev/heatmap",
                               headers=HEADERS_CCO)
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "total" in data

    def test_get_requests(self, test_client, seed_personas):
        resp = test_client.get("/api/capacity/requests/cc-muc-dev",
                               headers=HEADERS_CCO)
        assert resp.status_code == 200

    def test_no_auth(self, test_client, seed_personas):
        resp = test_client.get("/api/capacity/context")
        assert resp.status_code == 422

    def test_org_summary(self, test_client, seed_personas):
        resp = test_client.get("/api/capacity/org/summary", headers=HEADERS_CTRL)
        assert resp.status_code == 200

    def test_org_heatmap(self, test_client, seed_personas):
        resp = test_client.get("/api/capacity/org/heatmap", headers=HEADERS_CTRL)
        assert resp.status_code == 200

    def test_project_confirmation_pending(self, test_client, seed_personas):
        resp = test_client.get("/api/capacity/project-confirmation/pending",
                               headers=HEADERS_CCO)
        assert resp.status_code == 200
