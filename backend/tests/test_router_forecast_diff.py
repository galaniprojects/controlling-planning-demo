"""Router tests for GET /api/forecast/versions/{a}/diff/{b} [C-RH-05]."""
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
class TestForecastVersionDiff:
    def _create_version(self, db, project_id="proj-alpha"):
        """Seed a ForecastVersion via the service (cycle type) — the manual
        snapshot endpoint was removed, so tests instantiate versions directly.
        """
        from schemas.common import CurrentUser
        from services.forecast_versioning import capture_version
        user = CurrentUser(
            user_id="persona-controller", person_id="p-controller",
            name="Anna Meier", role="controller",
            cost_center_id=None, project_ids=[],
        )
        fv = capture_version(
            db=db, project_id=project_id, user=user,
            version_type="cycle", cycle_label="v",
        )
        db.commit()
        db.refresh(fv)
        return fv.id

    def test_happy_path(self, test_client, seed_personas, create_test_project, db):
        _setup_params(db)
        create_test_project("proj-alpha")
        vid_a = self._create_version(db)
        vid_b = self._create_version(db)

        resp = test_client.get(
            f"/api/forecast/versions/{vid_a}/diff/{vid_b}",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "summary" in data
        assert "grand_totals" in data
        assert "line_deltas" in data

    def test_all_unchanged_same_snapshot(self, test_client, seed_personas, create_test_project, db):
        _setup_params(db)
        create_test_project("proj-alpha")
        vid_a = self._create_version(db)
        vid_b = self._create_version(db)

        resp = test_client.get(
            f"/api/forecast/versions/{vid_a}/diff/{vid_b}",
            headers=HEADERS_CTRL,
        )
        data = resp.json()
        # Two consecutive snapshots of unchanged data should show 0 changes
        assert data["summary"]["total_changes"] == 0

    def test_cross_project_diff(self, test_client, seed_personas, create_test_project, db):
        _setup_params(db)
        create_test_project("proj-alpha")
        create_test_project("proj-beta")
        vid_a = self._create_version(db, "proj-alpha")
        vid_b = self._create_version(db, "proj-beta")

        resp = test_client.get(
            f"/api/forecast/versions/{vid_a}/diff/{vid_b}",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["version_a_project_id"] == "proj-alpha"
        assert data["version_b_project_id"] == "proj-beta"

    def test_version_a_not_found(self, test_client, seed_personas, create_test_project, db):
        _setup_params(db)
        create_test_project("proj-alpha")
        vid_b = self._create_version(db)
        resp = test_client.get(
            f"/api/forecast/versions/99999/diff/{vid_b}",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 404

    def test_version_b_not_found(self, test_client, seed_personas, create_test_project, db):
        _setup_params(db)
        create_test_project("proj-alpha")
        vid_a = self._create_version(db)
        resp = test_client.get(
            f"/api/forecast/versions/{vid_a}/diff/99999",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 404
