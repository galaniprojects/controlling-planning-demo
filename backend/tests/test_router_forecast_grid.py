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

    # ------------------------------------------------------------------
    # v5.1 C-08 — three-point cell payload (baseline + forecast + actuals)
    # ------------------------------------------------------------------

    def _make_project_with_three_series(
        self, db, seed_personas, create_test_project, project_id="proj-alpha"
    ):
        """Variant that also seeds actuals so the C-08 overlay is exercised."""
        from models.system import PlanningParameter
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
        # Pass actuals_amt so create_test_project also seeds Actuals rows.
        return create_test_project(
            project_id,
            months=["2026-04", "2026-05", "2026-06"],
            baseline_amt=900,
            forecast_amt=1100,
            actuals_amt=950,
        )

    def test_grid_cells_carry_three_point_overlay_keys(
        self, test_client, seed_personas, create_test_project, db,
    ):
        """Live grid response must include the C-08 overlay fields on every cell."""
        self._make_project_with_three_series(db, seed_personas, create_test_project)
        resp = test_client.get(
            "/api/projects/proj-alpha/forecast/grid?granularity=monthly",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        data = resp.json()
        rows = data["rows"]
        assert rows
        first_cell = rows[0]["cells"][0]
        for key in (
            "baseline_amount_eur", "baseline_hours",
            "actuals_amount_eur", "actuals_hours",
            "actuals_partial",
        ):
            assert key in first_cell

    def test_grid_demo_month_marks_partial_actuals(
        self, test_client, seed_personas, create_test_project, db,
    ):
        """The demo month (2026-04) must report actuals_partial=True."""
        self._make_project_with_three_series(db, seed_personas, create_test_project)
        resp = test_client.get(
            "/api/projects/proj-alpha/forecast/grid?granularity=monthly",
            headers=HEADERS_CTRL,
        )
        data = resp.json()
        row = data["rows"][0]
        demo_cell = next(c for c in row["cells"] if c["key"] == "2026-04")
        assert demo_cell["actuals_amount_eur"] == 950.0
        assert demo_cell["baseline_amount_eur"] == 900.0
        assert demo_cell["amount_eur"] == 1100.0
        assert demo_cell["actuals_partial"] is True

    def test_grid_future_months_have_no_actuals(
        self, test_client, seed_personas, create_test_project, db,
    ):
        """Months strictly after the demo date must omit actuals."""
        self._make_project_with_three_series(db, seed_personas, create_test_project)
        resp = test_client.get(
            "/api/projects/proj-alpha/forecast/grid?granularity=monthly",
            headers=HEADERS_CTRL,
        )
        data = resp.json()
        row = data["rows"][0]
        future_cell = next(c for c in row["cells"] if c["key"] == "2026-05")
        # Future month: forecast + baseline only, no actuals.
        assert future_cell["actuals_amount_eur"] is None
        assert future_cell["actuals_hours"] is None
        assert future_cell["baseline_amount_eur"] == 900.0
        assert future_cell["amount_eur"] == 1100.0

    # ------------------------------------------------------------------
    # v5.1 W3 — lookback_months query parameter
    # ------------------------------------------------------------------

    def _make_project_with_history(
        self, db, seed_personas, create_test_project, project_id="proj-alpha"
    ):
        """Project with baseline + forecast + actuals from 2026-01 through 2026-06."""
        from models.system import PlanningParameter
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
            project_id,
            months=[
                "2026-01", "2026-02", "2026-03",  # past (lookback target)
                "2026-04",                         # current
                "2026-05", "2026-06",              # future
            ],
            baseline_amt=900,
            forecast_amt=1100,
            actuals_amt=950,
        )

    def test_grid_default_lookback_renders_past_months(
        self, test_client, seed_personas, create_test_project, db,
    ):
        """Default lookback (12 months) means past months render alongside future."""
        self._make_project_with_history(db, seed_personas, create_test_project)
        resp = test_client.get(
            "/api/projects/proj-alpha/forecast/grid?granularity=monthly",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        data = resp.json()
        keys = [c["key"] for c in data["columns"]]
        assert "2026-01" in keys
        assert "2026-03" in keys
        assert "2026-04" in keys

    def test_grid_lookback_zero_starts_at_demo(
        self, test_client, seed_personas, create_test_project, db,
    ):
        """lookback_months=0 reverts to the v5 column model (start at demo_date)."""
        self._make_project_with_history(db, seed_personas, create_test_project)
        resp = test_client.get(
            "/api/projects/proj-alpha/forecast/grid?granularity=monthly&lookback_months=0",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        data = resp.json()
        keys = [c["key"] for c in data["columns"]]
        assert keys[0] == "2026-04"
        assert "2026-03" not in keys

    def test_grid_lookback_three_yields_three_past_months(
        self, test_client, seed_personas, create_test_project, db,
    ):
        """lookback_months=3 surfaces 2026-01..2026-03."""
        self._make_project_with_history(db, seed_personas, create_test_project)
        resp = test_client.get(
            "/api/projects/proj-alpha/forecast/grid?granularity=monthly&lookback_months=3",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        data = resp.json()
        monthly_keys = [c["key"] for c in data["columns"] if c["cell_type"] == "monthly"]
        assert monthly_keys[:4] == ["2026-01", "2026-02", "2026-03", "2026-04"]

    def test_grid_past_cells_carry_actuals_overlay(
        self, test_client, seed_personas, create_test_project, db,
    ):
        """Past months carry baseline + forecast + actuals so the C-08
        three-point past-month layout has data to render."""
        self._make_project_with_history(db, seed_personas, create_test_project)
        resp = test_client.get(
            "/api/projects/proj-alpha/forecast/grid?granularity=monthly&lookback_months=3",
            headers=HEADERS_CTRL,
        )
        data = resp.json()
        row = data["rows"][0]
        past_cell = next(c for c in row["cells"] if c["key"] == "2026-02")
        assert past_cell["baseline_amount_eur"] == 900.0
        assert past_cell["amount_eur"] == 1100.0
        assert past_cell["actuals_amount_eur"] == 950.0
        # Past months are fully closed — not partial.
        assert past_cell["actuals_partial"] in (None, False)

    def test_grid_lookback_above_max_rejected(
        self, test_client, seed_personas, create_test_project, db,
    ):
        """lookback_months is bounded to 36 — anything larger is a 422."""
        self._make_project_with_history(db, seed_personas, create_test_project)
        resp = test_client.get(
            "/api/projects/proj-alpha/forecast/grid?lookback_months=120",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 422

    def test_grid_lookback_negative_rejected(
        self, test_client, seed_personas, create_test_project, db,
    ):
        """Negative lookback_months must be rejected by the FastAPI Query gate."""
        self._make_project_with_history(db, seed_personas, create_test_project)
        resp = test_client.get(
            "/api/projects/proj-alpha/forecast/grid?lookback_months=-1",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 422

    # -----------------------------------------------------------------
    # v5.1 W4 C-06 / C-07 — vendor breakdown query param threading
    # -----------------------------------------------------------------

    def test_grid_endpoint_threads_vendor_breakdown_flag(
        self, test_client, seed_personas, create_test_project, db,
    ):
        """The router accepts include_vendor_breakdown and the response
        carries sub_rows on external rows when the flag is True (default)
        and omits them when explicitly set to False.
        """
        from models.financial import Forecast
        self._make_project_with_forecast(db, seed_personas, create_test_project)
        # Add an external Forecast row so there's something for the
        # vendor breakdown to chew on.
        db.add(Forecast(
            project_id="proj-alpha", month="2026-04", category="external",
            sub_category="ect-cloud", amount_eur=4000.0,
            vendor="AWS", po_number="PO-1",
        ))
        db.commit()

        # Default — flag True → external rows carry sub_rows
        resp = test_client.get(
            "/api/projects/proj-alpha/forecast/grid",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        data = resp.json()
        ext_rows = [r for r in data["rows"] if r["category"] == "external"]
        assert len(ext_rows) == 1
        assert ext_rows[0].get("sub_rows") is not None
        assert any(s["vendor"] == "AWS" for s in ext_rows[0]["sub_rows"])

        # Explicit False → sub_rows absent (or null)
        resp2 = test_client.get(
            "/api/projects/proj-alpha/forecast/grid?include_vendor_breakdown=false",
            headers=HEADERS_CTRL,
        )
        data2 = resp2.json()
        ext_rows2 = [r for r in data2["rows"] if r["category"] == "external"]
        assert len(ext_rows2) == 1
        # Pydantic excludes None by default — accept both None and missing
        assert ext_rows2[0].get("sub_rows") in (None, [])
