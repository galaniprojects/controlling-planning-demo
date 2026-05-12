"""Router tests for forecast versions endpoints [C-FV-01..07, C-RH-01..04].

Manual-snapshot creation was removed; versions are now created only via
forecast-cycle close and CR approval. These tests seed versions directly via
``services.forecast_versioning.capture_version`` to exercise the read paths.
"""
from __future__ import annotations

from unittest.mock import patch


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


def _seed_version(db, project_id: str, label: str | None = None):
    """Seed a ForecastVersion via the service (cycle type) for read-path tests."""
    from schemas.common import CurrentUser
    from services.forecast_versioning import capture_version

    user = CurrentUser(
        user_id="persona-controller", person_id="p-controller",
        name="Anna Meier", role="controller",
        cost_center_id=None, project_ids=[],
    )
    fv = capture_version(
        db=db, project_id=project_id, user=user,
        version_type="cycle", cycle_label=label,
    )
    db.commit()
    db.refresh(fv)
    return fv


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

    def test_list_with_seeded_version(self, test_client, seed_personas, create_test_project, db):
        _setup_params(db)
        create_test_project("proj-alpha")
        _seed_version(db, "proj-alpha", label="Q1 cycle")

        resp = test_client.get("/api/projects/proj-alpha/forecast/versions",
                               headers=HEADERS_CTRL)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["version_type"] == "cycle"

    def test_list_newest_first_sequencing(self, test_client, seed_personas, create_test_project, db):
        _setup_params(db)
        create_test_project("proj-alpha")
        _seed_version(db, "proj-alpha", label="v1")
        _seed_version(db, "proj-alpha", label="v2")

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
        fv = _seed_version(db, "proj-alpha", label="smoke")

        resp = test_client.get(
            f"/api/projects/proj-alpha/forecast/versions/{fv.id}",
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
        fv = _seed_version(db, "proj-alpha", label="x")

        resp = test_client.get(
            f"/api/projects/proj-beta/forecast/versions/{fv.id}",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 404


@patch("routers.workbench.DEMO_DATE", "2026-04")
@patch("config.DEMO_DATE", "2026-04")
class TestManualSnapshotRemoved:
    """Manual snapshot endpoint was removed; POST must no longer succeed."""

    def test_post_not_allowed(self, test_client, seed_personas, create_test_project, db):
        _setup_params(db)
        create_test_project("proj-alpha")
        resp = test_client.post(
            "/api/projects/proj-alpha/forecast/versions",
            json={"label": "x"},
            headers=HEADERS_CTRL,
        )
        # FastAPI responds 405 when only GET is registered for a path.
        assert resp.status_code in (404, 405)
