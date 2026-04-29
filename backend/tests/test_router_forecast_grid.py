"""Router tests for GET /api/projects/{id}/forecast/grid [C-FG-02..08]."""
from __future__ import annotations

from unittest.mock import patch
import pytest

HEADERS_CTRL = {"X-Current-User": "persona-controller"}
HEADERS_PL = {"X-Current-User": "persona-pl"}
HEADERS_EXEC = {"X-Current-User": "persona-exec"}


@patch("routers.workbench.DEMO_DATE", "2026-04")
@patch("config.DEMO_DATE", "2026-04")
class TestForecastGrid:
    """Integration tests for the mixed-granularity grid endpoint."""

    def _make_project_with_forecast(self, db, seed_personas, create_test_project, project_id="proj-alpha"):
        """Helper: create a project visible to PL (persona-pl owns proj-alpha/proj-beta)."""
        from models.system import PlanningParameter
        # Add planning parameters if missing
        existing_keys = {r.key for r in db.query(PlanningParameter).all()}
        if "granularity_boundary_months" not in existing_keys:
            db.add(PlanningParameter(
                key="granularity_boundary_months", name="Boundary",
                description="", current_value="12", default_value="12",
                data_type="integer", param_group="planning",
            ))
        if "planning_horizon_months" not in existing_keys:
            db.add(PlanningParameter(
                key="planning_horizon_months", name="Horizon",
                description="", current_value="60", default_value="60",
                data_type="integer", param_group="planning",
            ))
        db.commit()

        return create_test_project(
            project_id, months=["2026-04", "2026-05", "2026-06",
                                 "2027-01", "2027-07", "2028-01"]
        )

    def test_grid_returns_200(self, test_client, seed_personas, create_test_project, db):
        self._make_project_with_forecast(db, seed_personas, create_test_project)
        resp = test_client.get("/api/projects/proj-alpha/forecast/grid", headers=HEADERS_CTRL)
        assert resp.status_code == 200

    def test_grid_has_expected_keys(self, test_client, seed_personas, create_test_project, db):
        self._make_project_with_forecast(db, seed_personas, create_test_project)
        resp = test_client.get("/api/projects/proj-alpha/forecast/grid", headers=HEADERS_CTRL)
        data = resp.json()
        assert "project_id" in data
        assert "granularity" in data
        assert "boundary_month" in data
        assert "horizon_end_month" in data
        assert "columns" in data
        assert "rows" in data
        assert "totals_by_column" in data
        assert "grand_total" in data

    def test_grid_default_granularity_is_mixed(self, test_client, seed_personas, create_test_project, db):
        self._make_project_with_forecast(db, seed_personas, create_test_project)
        resp = test_client.get("/api/projects/proj-alpha/forecast/grid", headers=HEADERS_CTRL)
        assert resp.json()["granularity"] == "mixed"

    def test_grid_monthly_param(self, test_client, seed_personas, create_test_project, db):
        self._make_project_with_forecast(db, seed_personas, create_test_project)
        resp = test_client.get(
            "/api/projects/proj-alpha/forecast/grid?granularity=monthly",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["granularity"] == "monthly"
        cell_types = {col["cell_type"] for col in data["columns"]}
        assert cell_types == {"monthly"}

    def test_grid_configurable_boundary(self, test_client, seed_personas, create_test_project, db):
        self._make_project_with_forecast(db, seed_personas, create_test_project)
        resp = test_client.get(
            "/api/projects/proj-alpha/forecast/grid?boundary_months=3",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["granularity_boundary_months"] == 3
        # boundary_month should be 2026-06 (3 months after 2026-04 - 1 = 2026-06)
        assert data["boundary_month"] == "2026-06"

    def test_grid_pl_own_project_allowed(self, test_client, seed_personas, create_test_project, db):
        """PL can access their own projects [C-FG-02]."""
        self._make_project_with_forecast(db, seed_personas, create_test_project, "proj-alpha")
        resp = test_client.get("/api/projects/proj-alpha/forecast/grid", headers=HEADERS_PL)
        assert resp.status_code == 200

    def test_grid_pl_other_project_denied(self, test_client, seed_personas, create_test_project, db):
        """PL cannot access other people's projects."""
        self._make_project_with_forecast(db, seed_personas, create_test_project, "proj-other")
        resp = test_client.get("/api/projects/proj-other/forecast/grid", headers=HEADERS_PL)
        assert resp.status_code == 403

    def test_grid_invalid_granularity(self, test_client, seed_personas, create_test_project, db):
        self._make_project_with_forecast(db, seed_personas, create_test_project)
        resp = test_client.get(
            "/api/projects/proj-alpha/forecast/grid?granularity=invalid",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 422

    def test_grid_project_not_found(self, test_client, seed_personas, db):
        resp = test_client.get("/api/projects/nonexistent/forecast/grid", headers=HEADERS_CTRL)
        assert resp.status_code == 404

    def test_grid_is_provisional_in_response(self, test_client, seed_personas, create_test_project, db):
        """is_provisional flag must appear on cells [C-FG-07]."""
        self._make_project_with_forecast(db, seed_personas, create_test_project)
        resp = test_client.get(
            "/api/projects/proj-alpha/forecast/grid?granularity=monthly",
            headers=HEADERS_CTRL,
        )
        data = resp.json()
        rows = data.get("rows", [])
        if rows:
            cells = rows[0].get("cells", [])
            if cells:
                assert "is_provisional" in cells[0]

    def test_v4_forecast_endpoint_unchanged(self, test_client, seed_personas, create_test_project, db):
        """Existing v4 endpoint must still return v4 shape (backwards compat)."""
        self._make_project_with_forecast(db, seed_personas, create_test_project)
        resp = test_client.get("/api/projects/proj-alpha/forecast", headers=HEADERS_CTRL)
        assert resp.status_code == 200
        data = resp.json()
        # v4 shape has 'items' key, not 'rows' or 'columns'
        assert "items" in data
        assert "rows" not in data

    def test_totals_by_column_sums_to_grand_total(self, test_client, seed_personas, create_test_project, db):
        self._make_project_with_forecast(db, seed_personas, create_test_project)
        resp = test_client.get("/api/projects/proj-alpha/forecast/grid", headers=HEADERS_CTRL)
        data = resp.json()
        col_sum = round(sum(data["totals_by_column"].values()), 2)
        assert col_sum == data["grand_total"]
