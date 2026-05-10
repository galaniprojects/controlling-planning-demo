"""Integration tests for v5.2 closeout planning-parameter endpoint.

GET /api/capacity/planning-parameters returns a trimmed read-only view of
PlanningParameter rows, optionally filtered by ``param_group``. Used by the
project-view UnassignedSummary thresholds (and any future capacity-side
threshold consumer) to avoid hardcoding values that admins can edit.

Authorization: any authenticated demo persona.
"""

from __future__ import annotations

import pytest


HEADERS_CTRL = {"X-Current-User": "persona-controller"}
HEADERS_CCO = {"X-Current-User": "persona-cc-owner"}
HEADERS_EXEC = {"X-Current-User": "persona-exec"}
HEADERS_PL = {"X-Current-User": "persona-pl"}


@pytest.fixture
def seed_params(db, seed_org_base, seed_personas):
    """Seed three PlanningParameter rows across two groups."""
    from models.system import PlanningParameter

    rows = [
        PlanningParameter(
            key="capacity.unassigned_summary.warn_threshold_hours",
            name="Capacity warn threshold",
            description="hrs",
            current_value="1",
            default_value="1",
            data_type="integer",
            param_group="thresholds",
        ),
        PlanningParameter(
            key="capacity.unassigned_summary.danger_threshold_hours",
            name="Capacity danger threshold",
            description="hrs",
            current_value="200",
            default_value="200",
            data_type="integer",
            param_group="thresholds",
        ),
        PlanningParameter(
            key="planning_horizon",
            name="Planning Horizon",
            description="months",
            current_value="36",
            default_value="36",
            data_type="integer",
            param_group="planning",
        ),
    ]
    db.add_all(rows)
    db.commit()


class TestPlanningParametersShape:
    def test_envelope(self, test_client, seed_params):
        resp = test_client.get(
            "/api/capacity/planning-parameters", headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert set(body.keys()) == {"items", "total"}
        assert body["total"] == len(body["items"])
        assert body["total"] == 3, (
            "seed_params adds exactly 3 rows; tighten this if you change the fixture"
        )
        sample = body["items"][0]
        assert set(sample.keys()) == {"key", "current_value", "data_type"}


class TestPlanningParametersGroupFilter:
    def test_group_thresholds_returns_only_thresholds(self, test_client, seed_params):
        resp = test_client.get(
            "/api/capacity/planning-parameters?group=thresholds",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        body = resp.json()
        keys = {it["key"] for it in body["items"]}
        assert "capacity.unassigned_summary.warn_threshold_hours" in keys
        assert "capacity.unassigned_summary.danger_threshold_hours" in keys
        assert "planning_horizon" not in keys

    def test_unknown_group_returns_empty(self, test_client, seed_params):
        resp = test_client.get(
            "/api/capacity/planning-parameters?group=nonexistent",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body == {"items": [], "total": 0}


class TestPlanningParametersAuthorization:
    """All four personas can read; this is a display-data feed, not admin."""

    def test_controller_200(self, test_client, seed_params):
        resp = test_client.get(
            "/api/capacity/planning-parameters", headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200

    def test_cc_owner_200(self, test_client, seed_params):
        resp = test_client.get(
            "/api/capacity/planning-parameters", headers=HEADERS_CCO,
        )
        assert resp.status_code == 200

    def test_executive_200(self, test_client, seed_params):
        resp = test_client.get(
            "/api/capacity/planning-parameters", headers=HEADERS_EXEC,
        )
        assert resp.status_code == 200

    def test_pl_200(self, test_client, seed_params):
        resp = test_client.get(
            "/api/capacity/planning-parameters", headers=HEADERS_PL,
        )
        assert resp.status_code == 200

    def test_missing_persona_header_rejected(self, test_client, seed_params):
        # FastAPI validates the required X-Current-User header → 422.
        # The point: the endpoint isn't anonymously readable.
        resp = test_client.get("/api/capacity/planning-parameters")
        assert resp.status_code in (401, 403, 422)
