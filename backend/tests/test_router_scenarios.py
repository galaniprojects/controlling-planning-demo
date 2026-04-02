"""Integration tests for routers/scenarios.py."""

import json
from unittest.mock import patch

import pytest

from models.organization import ProjectGroupingAssignment


HEADERS_CTRL = {"X-Current-User": "persona-controller"}
HEADERS_PL = {"X-Current-User": "persona-pl"}


@patch("services.scenario_engine.DEMO_DATE", "2026-04")
@patch("services.portfolio_service.DEMO_DATE", "2026-04")
class TestScenariosRouter:
    def test_list_scenarios(self, test_client, seed_personas):
        resp = test_client.get("/api/scenarios", headers=HEADERS_CTRL)
        assert resp.status_code == 200
        data = resp.json()
        assert "my_scenarios" in data
        assert "published_scenarios" in data

    def test_list_scenarios_forbidden_for_pl(self, test_client, seed_personas):
        resp = test_client.get("/api/scenarios", headers=HEADERS_PL)
        assert resp.status_code == 403

    def test_create_scenario(self, test_client, seed_personas):
        resp = test_client.post("/api/scenarios", headers=HEADERS_CTRL, json={
            "name": "Test Scenario",
            "description": "Created in integration test",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Test Scenario"

    def test_create_scenario_forbidden(self, test_client, seed_personas):
        resp = test_client.post("/api/scenarios", headers=HEADERS_PL, json={
            "name": "Should Fail",
        })
        assert resp.status_code == 403

    def test_get_nonexistent_scenario(self, test_client, seed_personas):
        resp = test_client.get("/api/scenarios/9999", headers=HEADERS_CTRL)
        assert resp.status_code == 404

    def test_scenario_crud_lifecycle(self, test_client, db, seed_personas,
                                     seed_hierarchy, create_test_project):
        create_test_project("proj-1")
        db.add(ProjectGroupingAssignment(
            project_id="proj-1", grouping_entity_id=seed_hierarchy["prog_one_id"],
        ))
        db.commit()

        # Create
        resp = test_client.post("/api/scenarios", headers=HEADERS_CTRL, json={
            "name": "Lifecycle Test",
        })
        assert resp.status_code == 200
        scenario_id = resp.json()["id"]

        # Add action
        resp = test_client.post(
            f"/api/scenarios/{scenario_id}/actions",
            headers=HEADERS_CTRL,
            json={
                "scope": "project",
                "action_type": "reduce_budget",
                "project_id": "proj-1",
                "parameters": {"percentage": 10},
            },
        )
        assert resp.status_code == 200

        # Get scenario state
        resp = test_client.get(f"/api/scenarios/{scenario_id}", headers=HEADERS_CTRL)
        assert resp.status_code == 200
        data = resp.json()
        assert "impact_dashboard" in data
        assert "project_states" in data

        # Delete
        resp = test_client.delete(f"/api/scenarios/{scenario_id}", headers=HEADERS_CTRL)
        assert resp.status_code == 200
