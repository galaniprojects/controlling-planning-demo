"""Tests for services/forecast_versioning.py — C1 Mixed-Granularity Forecast + Versioning.

Spec: [C-FG-01..08], [C-FV-01..07], [C-RH-01..05]
"""
from __future__ import annotations

import json
import pytest
from decimal import Decimal

from models.financial import Actuals, Baseline, Forecast, ForecastVersion
from models.projects import Project
from models.people import RoleType, Person
from models.organization import Location, CompetenceCenter, CostCenter
from models.system import PlanningParameter
from schemas.common import CurrentUser
from services.forecast_versioning import (
    get_horizon_params,
    compute_boundary_month,
    compute_horizon_end_month,
    bucket_to_quarter,
    quarter_constituent_months,
    distribute_quarterly_value,
    build_mixed_grid,
    serialize_forecast_payload,
    capture_version,
    capture_versions_for_cycle,
    list_versions,
    get_version,
    compute_diff,
    mark_cells_provisional,
    _next_version_number,
    _first_quarter_start,
)
from services.calculations import month_to_quarter_key, quarter_to_months


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def controller() -> CurrentUser:
    return CurrentUser(
        user_id="persona-controller",
        person_id="p-ctrl",
        name="Anna Meier",
        role="controller",
        cost_center_id=None,
        project_ids=[],
    )


@pytest.fixture
def seeded_project(db):
    """Insert minimal org + one project + forecast rows."""
    loc = Location(id="loc-muc", city="Munich", country="Germany")
    cc = CompetenceCenter(id="comp-dev", name="Dev")
    cost_c = CostCenter(id="cc-muc-dev", name="Munich Dev",
                        location_id="loc-muc", competence_center_id="comp-dev")
    role = RoleType(id="role-dev", name="Developer")
    person = Person(id="p-ctrl", name="Anna Meier", role_type_id="role-dev",
                    cost_center_id="cc-muc-dev", competence_center_id="comp-dev")
    project = Project(
        id="proj-alpha", name="Alpha Project",
        status="active", capex_opex="capex",
        start_month="2026-04", is_service=False, is_active=True,
    )
    db.add_all([loc, cc, cost_c, role, person, project])
    db.commit()

    # Add forecast rows: 2 months × 2 line items
    for month in ["2026-04", "2026-05", "2026-06", "2026-07",
                  "2027-01", "2027-04", "2027-07", "2027-10", "2028-01"]:
        db.add(Forecast(
            project_id="proj-alpha", month=month,
            category="internal", sub_category="role-dev",
            hours=80, amount_eur=8000.00, capex_opex="capex",
        ))
        db.add(Forecast(
            project_id="proj-alpha", month=month,
            category="external", sub_category="ext-hw",
            hours=None, amount_eur=2000.00, capex_opex="capex",
        ))
    db.commit()
    return {"project_id": "proj-alpha", "person_id": "p-ctrl"}


@pytest.fixture
def horizon_params(db):
    """Insert planning parameters for boundary=12, horizon=60."""
    db.add(PlanningParameter(
        key="granularity_boundary_months", name="Boundary",
        description="", current_value="12", default_value="12",
        data_type="integer", param_group="planning",
    ))
    db.add(PlanningParameter(
        key="planning_horizon_months", name="Horizon",
        description="", current_value="60", default_value="60",
        data_type="integer", param_group="planning",
    ))
    db.commit()


# ---------------------------------------------------------------------------
# 1. Boundary / horizon math
# ---------------------------------------------------------------------------

class TestBoundaryMath:
    """[C-FG-05] Boundary and horizon month calculations."""

    def test_compute_boundary_month_default(self):
        # 12 boundary months from April 2026 → March 2027
        assert compute_boundary_month("2026-04", 12) == "2027-03"

    def test_compute_boundary_month_6(self):
        # 6 boundary months from April 2026 → September 2026
        assert compute_boundary_month("2026-04", 6) == "2026-09"

    def test_compute_horizon_end_month(self):
        # 60 months from April 2026 → March 2031
        assert compute_horizon_end_month("2026-04", 60) == "2031-03"

    def test_compute_horizon_end_month_12(self):
        assert compute_horizon_end_month("2026-04", 12) == "2027-03"

    def test_get_horizon_params_fallback(self, db):
        """Returns fallback (12, 60) when parameters missing."""
        b, h = get_horizon_params(db)
        assert b == 12
        assert h == 60

    def test_get_horizon_params_from_db(self, db, horizon_params):
        b, h = get_horizon_params(db)
        assert b == 12
        assert h == 60


# ---------------------------------------------------------------------------
# 2. Quarter math
# ---------------------------------------------------------------------------

class TestQuarterMath:
    """[C-FG-02..04] Quarter bucketing and distribution."""

    @pytest.mark.parametrize("month,expected_key", [
        ("2026-01", "2026-Q1"),
        ("2026-04", "2026-Q2"),
        ("2026-07", "2026-Q3"),
        ("2026-10", "2026-Q4"),
        ("2027-01", "2027-Q1"),
        ("2027-12", "2027-Q4"),
    ])
    def test_month_to_quarter_key(self, month, expected_key):
        assert month_to_quarter_key(month) == expected_key

    @pytest.mark.parametrize("quarter_key,expected_months", [
        ("2026-Q1", ["2026-01", "2026-02", "2026-03"]),
        ("2026-Q2", ["2026-04", "2026-05", "2026-06"]),
        ("2026-Q4", ["2026-10", "2026-11", "2026-12"]),
        ("2027-Q1", ["2027-01", "2027-02", "2027-03"]),
    ])
    def test_quarter_to_months(self, quarter_key, expected_months):
        assert quarter_to_months(quarter_key) == expected_months

    @pytest.mark.parametrize("month,boundary,expected_bucket", [
        ("2026-04", "2027-03", None),           # within boundary → monthly
        ("2027-03", "2027-03", None),           # at boundary → monthly
        ("2027-04", "2027-03", "2027-Q2"),      # just past boundary → quarterly
        ("2027-10", "2027-03", "2027-Q4"),      # well past boundary → quarterly
    ])
    def test_bucket_to_quarter(self, month, boundary, expected_bucket):
        assert bucket_to_quarter(month, boundary) == expected_bucket

    def test_quarter_constituent_months_full(self):
        months = quarter_constituent_months("2027-Q1", "2031-03")
        assert months == ["2027-01", "2027-02", "2027-03"]

    def test_quarter_constituent_months_clipped_by_horizon(self):
        # horizon ends in January 2027 → Q1 2027 only has Jan
        months = quarter_constituent_months("2027-Q1", "2027-01")
        assert months == ["2027-01"]

    def test_first_quarter_start_march_boundary(self):
        """boundary_month='2027-03' → first quarter beyond starts at 2027-04."""
        first = _first_quarter_start("2027-03")
        assert first == "2027-04"

    def test_first_quarter_start_mid_quarter(self):
        """boundary_month='2027-05' → Q2 2027 starts 2027-04 but 2027-05 > 2027-04,
        so next quarter past boundary is Q3 2027 → 2027-07."""
        first = _first_quarter_start("2027-05")
        assert first == "2027-07"

    def test_first_quarter_start_december(self):
        """boundary_month='2027-12' → first quarterly key 2028-Q1, start 2028-01."""
        first = _first_quarter_start("2027-12")
        assert first == "2028-01"


# ---------------------------------------------------------------------------
# 3. distribute_quarterly_value — cent remainder
# ---------------------------------------------------------------------------

class TestDistributeQuarterlyValue:
    """[C-FG-03] Cent-remainder applied to last month."""

    def test_even_division(self):
        dist = distribute_quarterly_value(300.0, ["2027-01", "2027-02", "2027-03"])
        assert dist == {"2027-01": 100.0, "2027-02": 100.0, "2027-03": 100.0}

    def test_cent_remainder_to_last(self):
        # 100.0 / 3 = 33.33, 33.33 * 2 = 66.66, remainder = 33.34
        dist = distribute_quarterly_value(100.0, ["2027-01", "2027-02", "2027-03"])
        assert dist["2027-01"] == 33.33
        assert dist["2027-02"] == 33.33
        assert round(dist["2027-03"], 2) == 33.34
        assert round(sum(dist.values()), 2) == 100.0

    def test_single_month(self):
        dist = distribute_quarterly_value(500.0, ["2027-01"])
        assert dist == {"2027-01": 500.0}

    def test_empty_months(self):
        dist = distribute_quarterly_value(500.0, [])
        assert dist == {}

    def test_zero_total(self):
        dist = distribute_quarterly_value(0.0, ["2027-01", "2027-02", "2027-03"])
        assert all(v == 0.0 for v in dist.values())


# ---------------------------------------------------------------------------
# 4. build_mixed_grid
# ---------------------------------------------------------------------------

class TestBuildMixedGrid:
    """[C-FG-01..06] Grid construction."""

    def test_returns_expected_keys(self, db, seeded_project, horizon_params):
        grid = build_mixed_grid(db, "proj-alpha", "2026-04")
        assert "project_id" in grid
        assert "columns" in grid
        assert "rows" in grid
        assert "totals_by_column" in grid
        assert "grand_total" in grid
        assert grid["granularity"] == "mixed"

    def test_monthly_only_granularity(self, db, seeded_project, horizon_params):
        grid = build_mixed_grid(db, "proj-alpha", "2026-04", granularity="monthly")
        # All columns should be monthly
        cell_types = {col["cell_type"] for col in grid["columns"]}
        assert cell_types == {"monthly"}

    def test_quarterly_only_granularity(self, db, seeded_project, horizon_params):
        grid = build_mixed_grid(db, "proj-alpha", "2026-04", granularity="quarterly")
        cell_types = {col["cell_type"] for col in grid["columns"]}
        assert cell_types == {"quarterly"}

    def test_mixed_has_both_types(self, db, seeded_project, horizon_params):
        grid = build_mixed_grid(db, "proj-alpha", "2026-04",
                                boundary_months=3, horizon_months=12)
        cell_types = {col["cell_type"] for col in grid["columns"]}
        assert "monthly" in cell_types
        assert "quarterly" in cell_types

    def test_boundary_month_correct(self, db, seeded_project, horizon_params):
        grid = build_mixed_grid(db, "proj-alpha", "2026-04", boundary_months=3)
        assert grid["boundary_month"] == "2026-06"  # 3 months: Apr=1, May=2, Jun=3

    def test_totals_by_column_is_sum(self, db, seeded_project, horizon_params):
        grid = build_mixed_grid(db, "proj-alpha", "2026-04")
        grand_from_columns = round(sum(grid["totals_by_column"].values()), 2)
        assert grand_from_columns == grid["grand_total"]

    def test_no_forecast_rows_returns_empty(self, db, seeded_project, horizon_params):
        # Create new project with no forecast
        db.add(Project(id="proj-empty", name="Empty", status="active",
                       capex_opex="capex", start_month="2026-04", is_active=True))
        db.commit()
        grid = build_mixed_grid(db, "proj-empty", "2026-04")
        assert grid["rows"] == []
        assert grid["grand_total"] == 0.0

    def test_configurable_boundary_override(self, db, seeded_project, horizon_params):
        grid = build_mixed_grid(db, "proj-alpha", "2026-04", boundary_months=6)
        assert grid["granularity_boundary_months"] == 6
        assert grid["boundary_month"] == "2026-09"


# ---------------------------------------------------------------------------
# 4b. build_mixed_grid with include_baseline_actuals=True (v5.1 C-08)
# ---------------------------------------------------------------------------

@pytest.fixture
def seeded_project_with_history(db):
    """Project with baseline + forecast + actuals across past, current, future months.

    Demo date is 2026-04. Months span 2026-01..2026-08 to cover:
      - Past months (2026-01..2026-03): all three series populated
      - Current month (2026-04): forecast + baseline + partial actuals
      - Future months (2026-05..2026-08): forecast + baseline only

    Includes one month where actuals exceed forecast so the warm-tint case
    is exercisable.
    """
    loc = Location(id="loc-muc", city="Munich", country="Germany")
    cc = CompetenceCenter(id="comp-dev", name="Dev")
    cost_c = CostCenter(id="cc-muc-dev", name="Munich Dev",
                        location_id="loc-muc", competence_center_id="comp-dev")
    role = RoleType(id="role-dev", name="Developer")
    person = Person(id="p-ctrl", name="Anna Meier", role_type_id="role-dev",
                    cost_center_id="cc-muc-dev", competence_center_id="comp-dev")
    project = Project(
        id="proj-c08", name="C-08 Test", status="active", capex_opex="capex",
        start_month="2026-01", is_service=False, is_active=True,
    )
    db.add_all([loc, cc, cost_c, role, person, project])
    db.commit()

    months = [
        ("2026-01", "past"),
        ("2026-02", "past"),
        ("2026-03", "past_overrun"),  # actuals > forecast
        ("2026-04", "current"),
        ("2026-05", "future"),
        ("2026-06", "future"),
        ("2026-07", "future"),
        ("2026-08", "future"),
    ]
    for month, kind in months:
        # Internal hours row — same line item across all series.
        db.add(Baseline(
            project_id="proj-c08", month=month,
            category="internal", sub_category="role-dev",
            hours=100, amount_eur=10000, capex_opex="capex",
        ))
        db.add(Forecast(
            project_id="proj-c08", month=month,
            category="internal", sub_category="role-dev",
            hours=110, amount_eur=11000, capex_opex="capex",
        ))
        if kind == "past":
            db.add(Actuals(
                project_id="proj-c08", month=month,
                category="internal", sub_category="role-dev",
                hours=105, amount_eur=10500, capex_opex="capex",
            ))
        elif kind == "past_overrun":
            db.add(Actuals(
                project_id="proj-c08", month=month,
                category="internal", sub_category="role-dev",
                hours=130, amount_eur=13500, capex_opex="capex",
            ))
        elif kind == "current":
            # Partial — half of forecast already booked.
            db.add(Actuals(
                project_id="proj-c08", month=month,
                category="internal", sub_category="role-dev",
                hours=55, amount_eur=5500, capex_opex="capex",
            ))
    db.commit()
    return {"project_id": "proj-c08"}


class TestBuildMixedGridBaselineActuals:
    """v5.1 C-08: include_baseline_actuals overlay shape + temporal rules."""

    def test_default_omits_overlays(self, db, seeded_project, horizon_params):
        """Default call leaves snapshots forecast-only; new fields stay None
        (or absent) so existing version_payload consumers don't see drift."""
        grid = build_mixed_grid(db, "proj-alpha", "2026-04")
        for row in grid["rows"]:
            for cell in row["cells"]:
                assert cell.get("baseline_amount_eur") is None
                assert cell.get("actuals_amount_eur") is None

    def test_flag_populates_three_series_on_demo_month(
        self, db, seeded_project_with_history, horizon_params,
    ):
        """The demo month carries baseline, forecast and (partial) actuals."""
        grid = build_mixed_grid(
            db, "proj-c08", "2026-04",
            include_baseline_actuals=True,
            boundary_months=12, horizon_months=12,
        )
        row = next(r for r in grid["rows"]
                   if r["category"] == "internal" and r["sub_category"] == "role-dev")
        cell = next(c for c in row["cells"] if c["key"] == "2026-04")
        assert cell["baseline_amount_eur"] == 10000.0
        assert cell["baseline_hours"] == 100.0
        assert cell["actuals_amount_eur"] == 5500.0
        assert cell["actuals_hours"] == 55.0
        assert cell["amount_eur"] == 11000.0  # forecast still primary
        # demo month → partial
        assert cell["actuals_partial"] is True

    def test_current_month_marks_actuals_partial(
        self, db, seeded_project_with_history, horizon_params,
    ):
        # demo_date == current month
        grid = build_mixed_grid(
            db, "proj-c08", "2026-04",
            include_baseline_actuals=True,
            boundary_months=12, horizon_months=12,
        )
        row = next(r for r in grid["rows"] if r["sub_category"] == "role-dev")
        cell = next(c for c in row["cells"] if c["key"] == "2026-04")
        assert cell["actuals_amount_eur"] == 5500.0
        assert cell["actuals_partial"] is True
        assert cell["amount_eur"] == 11000.0  # forecast remains primary
        assert cell["baseline_amount_eur"] == 10000.0

    def test_future_month_has_no_actuals(
        self, db, seeded_project_with_history, horizon_params,
    ):
        grid = build_mixed_grid(
            db, "proj-c08", "2026-04",
            include_baseline_actuals=True,
            boundary_months=12, horizon_months=12,
        )
        row = next(r for r in grid["rows"] if r["sub_category"] == "role-dev")
        # 2026-05 is one month past the demo date — no actuals.
        cell = next(c for c in row["cells"] if c["key"] == "2026-05")
        assert cell["actuals_amount_eur"] is None
        assert cell["actuals_hours"] is None
        # actuals_partial is None when no actuals exist
        assert cell["actuals_partial"] in (None, False)
        # Baseline + forecast still present
        assert cell["baseline_amount_eur"] == 10000.0
        assert cell["amount_eur"] == 11000.0

    def test_actuals_exceed_forecast_visible(
        self, db, seeded_project_with_history, horizon_params,
    ):
        """Warm-tint scenario: month with actuals > forecast surfaces both."""
        # demo_date == 2026-03 places the overrun cell at the start of the
        # column window (current month) so we can read both series.
        grid = build_mixed_grid(
            db, "proj-c08", "2026-03",
            include_baseline_actuals=True,
            boundary_months=12, horizon_months=12,
        )
        row = next(r for r in grid["rows"] if r["sub_category"] == "role-dev")
        cell = next(c for c in row["cells"] if c["key"] == "2026-03")
        assert cell["actuals_amount_eur"] == 13500.0
        assert cell["amount_eur"] == 11000.0
        assert cell["actuals_amount_eur"] > cell["amount_eur"]

    def test_quarterly_aggregates_baseline_and_actuals(
        self, db, seeded_project_with_history, horizon_params,
    ):
        """Quarterly cells sum the underlying months for each series.

        Demo date is 2026-04 with boundary=1 → 2026-04 is the only monthly
        column, then 2026-Q3 (Jul/Aug/Sep) appears as a quarterly column.
        2026-Q3 has forecasts for Jul + Aug, baselines for Jul + Aug, and
        no actuals (all future months).
        """
        grid = build_mixed_grid(
            db, "proj-c08", "2026-04",
            include_baseline_actuals=True,
            boundary_months=1, horizon_months=12,
        )
        row = next(r for r in grid["rows"] if r["sub_category"] == "role-dev")
        # 2026-Q3: Jul + Aug forecast/baseline (Sep has no rows in the fixture)
        q_cell = next(c for c in row["cells"] if c["key"] == "2026-Q3")
        assert q_cell["cell_type"] == "quarterly"
        # 2 months × 10000 baseline = 20000
        assert q_cell["baseline_amount_eur"] == 20000.0
        # 2 months × 11000 forecast = 22000
        assert q_cell["amount_eur"] == 22000.0
        # All months in Q3 are future → no actuals
        assert q_cell["actuals_amount_eur"] is None
        assert q_cell["actuals_partial"] in (None, False)

    def test_baseline_only_line_still_creates_row(
        self, db, seeded_project_with_history, horizon_params,
    ):
        """A line item with baseline but no forecast (e.g., scope removed) still
        appears in the grid so the user sees the planned-but-not-forecast value."""
        # Add a Baseline-only line item
        db.add(Baseline(
            project_id="proj-c08", month="2026-04",
            category="external", sub_category="ext-removed",
            hours=None, amount_eur=2000, capex_opex="capex",
        ))
        db.commit()
        grid = build_mixed_grid(
            db, "proj-c08", "2026-04",
            include_baseline_actuals=True,
            boundary_months=12, horizon_months=12,
        )
        row = next(
            (r for r in grid["rows"] if r["sub_category"] == "ext-removed"),
            None,
        )
        assert row is not None
        cell = next(c for c in row["cells"] if c["key"] == "2026-04")
        assert cell["baseline_amount_eur"] == 2000.0
        # Forecast is zero (no forecast row)
        assert cell["amount_eur"] == 0.0


# ---------------------------------------------------------------------------
# 4c. build_mixed_grid with lookback_months (v5.1 W3 pre-work)
# ---------------------------------------------------------------------------

class TestBuildMixedGridLookback:
    """v5.1 W3: lookback_months extends the inner monthly window backwards
    so past months render alongside future ones. Capture-version snapshots
    keep the v5 column model (lookback defaults to None).
    """

    def test_default_starts_at_demo_date(self, db, seeded_project_with_history, horizon_params):
        """No lookback → first column == demo_date (v5 behaviour preserved)."""
        grid = build_mixed_grid(
            db, "proj-c08", "2026-04",
            include_baseline_actuals=True,
            boundary_months=12, horizon_months=12,
        )
        first_monthly = next(c for c in grid["columns"] if c["cell_type"] == "monthly")
        assert first_monthly["key"] == "2026-04"
        assert "2026-03" not in {c["key"] for c in grid["columns"]}

    def test_lookback_zero_equivalent_to_default(
        self, db, seeded_project_with_history, horizon_params,
    ):
        """lookback_months=0 must be byte-identical to the no-lookback path."""
        baseline = build_mixed_grid(
            db, "proj-c08", "2026-04",
            include_baseline_actuals=True,
            boundary_months=12, horizon_months=12,
        )
        explicit = build_mixed_grid(
            db, "proj-c08", "2026-04",
            include_baseline_actuals=True,
            boundary_months=12, horizon_months=12,
            lookback_months=0,
        )
        assert [c["key"] for c in baseline["columns"]] == [c["key"] for c in explicit["columns"]]
        assert baseline["grand_total"] == explicit["grand_total"]

    def test_lookback_three_adds_three_past_columns(
        self, db, seeded_project_with_history, horizon_params,
    ):
        """lookback_months=3 surfaces 2026-01..2026-03 ahead of demo_date."""
        grid = build_mixed_grid(
            db, "proj-c08", "2026-04",
            include_baseline_actuals=True,
            boundary_months=12, horizon_months=12,
            lookback_months=3,
        )
        keys = [c["key"] for c in grid["columns"] if c["cell_type"] == "monthly"]
        assert keys[:4] == ["2026-01", "2026-02", "2026-03", "2026-04"]
        # All of the lookback columns are monthly — quarterly outer zone
        # only ever sits beyond boundary_month.
        for k in ["2026-01", "2026-02", "2026-03"]:
            col = next(c for c in grid["columns"] if c["key"] == k)
            assert col["cell_type"] == "monthly"

    def test_past_columns_carry_forecast_baseline_actuals(
        self, db, seeded_project_with_history, horizon_params,
    ):
        """Each past month surfaces all three series — the C-08 frontend
        decides which is primary based on the cell key vs demo_date."""
        grid = build_mixed_grid(
            db, "proj-c08", "2026-04",
            include_baseline_actuals=True,
            boundary_months=12, horizon_months=12,
            lookback_months=3,
        )
        row = next(r for r in grid["rows"] if r["sub_category"] == "role-dev")
        for k in ["2026-01", "2026-02"]:
            cell = next(c for c in row["cells"] if c["key"] == k)
            assert cell["baseline_amount_eur"] == 10000.0
            assert cell["actuals_amount_eur"] == 10500.0  # past kind
            assert cell["amount_eur"] == 11000.0
            # Past months are fully closed → not partial.
            assert cell["actuals_partial"] in (None, False)

    def test_past_overrun_month_visible(
        self, db, seeded_project_with_history, horizon_params,
    ):
        """The seeded 2026-03 overrun (actuals > forecast) surfaces in
        the lookback window so the warm-tint cell can render."""
        grid = build_mixed_grid(
            db, "proj-c08", "2026-04",
            include_baseline_actuals=True,
            boundary_months=12, horizon_months=12,
            lookback_months=3,
        )
        row = next(r for r in grid["rows"] if r["sub_category"] == "role-dev")
        cell = next(c for c in row["cells"] if c["key"] == "2026-03")
        assert cell["actuals_amount_eur"] == 13500.0
        assert cell["amount_eur"] == 11000.0
        assert cell["actuals_amount_eur"] > cell["amount_eur"]

    def test_lookback_does_not_create_quarterly_past(
        self, db, seeded_project_with_history, horizon_params,
    ):
        """Quarterly outer zone must remain forward-only even with lookback."""
        grid = build_mixed_grid(
            db, "proj-c08", "2026-04",
            include_baseline_actuals=True,
            boundary_months=3, horizon_months=12,
            lookback_months=3,
        )
        for col in grid["columns"]:
            if col["cell_type"] == "quarterly":
                # Quarter key is YYYY-QN — extract the year and quarter.
                year, q = col["key"].split("-Q")
                # First quarter past boundary_month=2026-06 → 2026-Q3.
                assert (int(year), int(q)) >= (2026, 3)

    def test_capture_version_unaffected_by_lookback_default(
        self, db, seeded_project, horizon_params, controller,
    ):
        """capture_version doesn't pass lookback_months — payloads stay v5."""
        from services.forecast_versioning import capture_version
        fv = capture_version(db, "proj-alpha", controller, version_type="manual")
        db.commit()
        payload = json.loads(fv.payload_json)
        # All cells in the snapshot should sit at or after demo_date.
        for row in payload["rows"]:
            for cell in row["cells"]:
                key = cell["key"]
                if cell["cell_type"] == "monthly":
                    assert key >= "2026-04"
                else:
                    # Quarter key like 2027-Q1 — first month must be >= demo.
                    year, q = key.split("-Q")
                    first_month = f"{year}-{(int(q) - 1) * 3 + 1:02d}"
                    assert first_month >= "2026-04"


# ---------------------------------------------------------------------------
# Wave 4 pre-work — sub-row plumbing regression guards
# ---------------------------------------------------------------------------

class TestBuildMixedGridSubRowsDefault:
    """The new C-05 / C-06 kwargs default to False so existing callers and
    ForecastVersion snapshots are byte-identical to Wave 3.
    """

    def test_default_kwargs_omit_sub_rows(self, db, seeded_project, horizon_params):
        """Without the flags, rows do not carry sub_rows."""
        grid = build_mixed_grid(db, "proj-alpha", "2026-04")
        for row in grid["rows"]:
            assert "sub_rows" not in row, (
                f"row {row['category']}/{row['sub_category']} carried sub_rows "
                f"with default kwargs — should be opt-in"
            )
            assert "role_name" not in row

    def test_capture_version_payload_omits_sub_rows(
        self, db, seeded_project, horizon_params, controller,
    ):
        """capture_version doesn't pass sub-row flags — snapshot stays
        forecast-only and byte-identical to Wave 3."""
        from services.forecast_versioning import capture_version
        fv = capture_version(db, "proj-alpha", controller, version_type="manual")
        db.commit()
        payload = json.loads(fv.payload_json)
        for row in payload["rows"]:
            assert "sub_rows" not in row
            assert "role_name" not in row

    def test_flags_on_with_stub_collectors_attach_empty_sub_rows(
        self, db, seeded_project, horizon_params,
    ):
        """When the flags ARE set, the stubs return empty sub_rows so the
        response shape is stable. Teammates A/B fill the bodies without
        touching this contract.
        """
        grid = build_mixed_grid(
            db, "proj-alpha", "2026-04",
            include_person_breakdown=True,
            include_vendor_breakdown=True,
        )
        for row in grid["rows"]:
            if row["category"] == "internal":
                # C-05 stub → empty list
                assert row.get("sub_rows") == []
            elif row["category"] == "external":
                # C-06 stub → empty list, role_name still null
                assert row.get("sub_rows") == []
                assert row.get("role_name") is None


# ---------------------------------------------------------------------------
# 5. serialize_forecast_payload
# ---------------------------------------------------------------------------

class TestSerializeForecastPayload:
    def test_schema_version(self, db, seeded_project, horizon_params):
        grid = build_mixed_grid(db, "proj-alpha", "2026-04")
        payload_str = serialize_forecast_payload("proj-alpha", grid, "2026-04-01T00:00:00")
        payload = json.loads(payload_str)
        assert payload["schema_version"] == 1
        assert payload["project_id"] == "proj-alpha"
        assert "rows" in payload
        assert "totals_by_column" in payload
        assert "grand_total" in payload

    def test_totals_by_category_present(self, db, seeded_project, horizon_params):
        grid = build_mixed_grid(db, "proj-alpha", "2026-04")
        payload_str = serialize_forecast_payload("proj-alpha", grid, "2026-04-01T00:00:00")
        payload = json.loads(payload_str)
        assert "totals_by_category" in payload
        assert "internal" in payload["totals_by_category"]


# ---------------------------------------------------------------------------
# 6. capture_version
# ---------------------------------------------------------------------------

class TestCaptureVersion:
    """[C-FV-02, C-FV-03] Version capture."""

    def test_creates_version_row(self, db, seeded_project, horizon_params, controller):
        fv = capture_version(db, "proj-alpha", controller, version_type="manual")
        db.commit()
        assert fv.id is not None
        assert fv.project_id == "proj-alpha"
        assert fv.version_type == "manual"
        assert fv.version_number == 1
        assert fv.payload_json is not None
        assert fv.cell_count is not None

    def test_cr_approval_type(self, db, seeded_project, horizon_params, controller):
        fv = capture_version(
            db, "proj-alpha", controller,
            version_type="cr_approval", change_request_id=99,
        )
        db.commit()
        assert fv.version_type == "cr_approval"
        assert fv.change_request_id == 99

    def test_cycle_type_with_label(self, db, seeded_project, horizon_params, controller):
        fv = capture_version(
            db, "proj-alpha", controller,
            version_type="cycle", cycle_label="Q2 2026 Cycle", cycle_id="abc123",
        )
        db.commit()
        assert fv.cycle_label == "Q2 2026 Cycle"
        assert fv.cycle_id == "abc123"

    def test_sequential_version_numbers(self, db, seeded_project, horizon_params, controller):
        fv1 = capture_version(db, "proj-alpha", controller, version_type="manual")
        db.flush()
        fv2 = capture_version(db, "proj-alpha", controller, version_type="manual")
        db.flush()
        fv3 = capture_version(db, "proj-alpha", controller, version_type="manual")
        db.commit()
        assert fv1.version_number == 1
        assert fv2.version_number == 2
        assert fv3.version_number == 3


# ---------------------------------------------------------------------------
# 7. capture_versions_for_cycle
# ---------------------------------------------------------------------------

class TestCaptureVersionsForCycle:
    """[C-FV-05] Fan-out: one version per active project."""

    def test_creates_one_per_project_with_forecasts(self, db, seeded_project, horizon_params, controller):
        created = capture_versions_for_cycle(
            db, controller, "Q2 2026 Cycle", cycle_id="test-cycle"
        )
        db.commit()
        # Should create 1 version for proj-alpha
        assert len(created) == 1
        assert created[0].project_id == "proj-alpha"
        assert created[0].version_type == "cycle"
        assert created[0].cycle_label == "Q2 2026 Cycle"

    def test_skips_project_without_forecast(self, db, seeded_project, horizon_params, controller):
        # Add a project with no forecast rows
        db.add(Project(id="proj-nof", name="No Forecast", status="active",
                       capex_opex="capex", start_month="2026-04", is_active=True))
        db.commit()
        created = capture_versions_for_cycle(db, controller, "Q2 2026 Cycle")
        db.commit()
        project_ids = {fv.project_id for fv in created}
        assert "proj-nof" not in project_ids
        assert "proj-alpha" in project_ids

    def test_fan_out_multiple_projects(self, db, seeded_project, horizon_params, controller):
        # Add second project with forecast
        db.add(Project(id="proj-beta", name="Beta", status="active",
                       capex_opex="capex", start_month="2026-04", is_active=True))
        db.commit()
        for month in ["2026-04", "2026-05"]:
            db.add(Forecast(project_id="proj-beta", month=month,
                            category="internal", sub_category="role-dev",
                            hours=40, amount_eur=4000.00, capex_opex="capex"))
        db.commit()

        created = capture_versions_for_cycle(db, controller, "Q2 2026 Cycle")
        db.commit()
        assert len(created) == 2


# ---------------------------------------------------------------------------
# 8. list_versions / get_version
# ---------------------------------------------------------------------------

class TestListGetVersions:
    """[C-RH-01..02]"""

    def test_list_versions_empty(self, db, seeded_project, controller):
        versions, total = list_versions(db, "proj-alpha")
        assert total == 0
        assert versions == []

    def test_list_versions_newest_first(self, db, seeded_project, horizon_params, controller):
        capture_version(db, "proj-alpha", controller, version_type="manual")
        db.flush()
        capture_version(db, "proj-alpha", controller, version_type="manual")
        db.commit()
        versions, total = list_versions(db, "proj-alpha")
        assert total == 2
        assert versions[0].version_number == 2
        assert versions[1].version_number == 1

    def test_get_version_by_id(self, db, seeded_project, horizon_params, controller):
        fv = capture_version(db, "proj-alpha", controller, version_type="manual")
        db.commit()
        fetched = get_version(db, fv.id)
        assert fetched is not None
        assert fetched.id == fv.id

    def test_get_version_not_found(self, db):
        result = get_version(db, 99999)
        assert result is None


# ---------------------------------------------------------------------------
# 9. compute_diff
# ---------------------------------------------------------------------------

class TestComputeDiff:
    """[C-RH-05]"""

    def test_happy_path_modified(self, db, seeded_project, horizon_params, controller):
        fv1 = capture_version(db, "proj-alpha", controller, version_type="manual")
        db.flush()

        # Modify a forecast row, then capture v2
        row = db.query(Forecast).filter(
            Forecast.project_id == "proj-alpha",
            Forecast.month == "2026-04",
            Forecast.sub_category == "role-dev",
        ).first()
        row.amount_eur = 10000.0
        db.flush()

        fv2 = capture_version(db, "proj-alpha", controller, version_type="manual")
        db.commit()

        diff = compute_diff(db, fv1.id, fv2.id)
        assert diff["version_a_id"] == fv1.id
        assert diff["version_b_id"] == fv2.id
        assert diff["summary"]["modified_count"] > 0 or diff["summary"]["total_changes"] > 0

    def test_all_unchanged(self, db, seeded_project, horizon_params, controller):
        fv1 = capture_version(db, "proj-alpha", controller, version_type="manual")
        db.flush()
        fv2 = capture_version(db, "proj-alpha", controller, version_type="manual")
        db.commit()

        diff = compute_diff(db, fv1.id, fv2.id)
        assert diff["summary"]["total_changes"] == 0
        assert diff["summary"]["modified_count"] == 0

    def test_cross_project_diff(self, db, seeded_project, horizon_params, controller):
        """Cross-project diff is valid [C-RH-05]."""
        db.add(Project(id="proj-beta", name="Beta", status="active",
                       capex_opex="capex", start_month="2026-04", is_active=True))
        db.commit()
        for month in ["2026-04"]:
            db.add(Forecast(project_id="proj-beta", month=month,
                            category="internal", sub_category="role-dev",
                            hours=40, amount_eur=5000.00, capex_opex="capex"))
        db.commit()

        fv_a = capture_version(db, "proj-alpha", controller, version_type="manual")
        db.flush()
        fv_b = capture_version(db, "proj-beta", controller, version_type="manual")
        db.commit()

        diff = compute_diff(db, fv_a.id, fv_b.id)
        assert diff["version_a_project_id"] == "proj-alpha"
        assert diff["version_b_project_id"] == "proj-beta"

    def test_version_a_not_found(self, db, seeded_project, horizon_params, controller):
        fv = capture_version(db, "proj-alpha", controller, version_type="manual")
        db.commit()
        with pytest.raises(ValueError, match="99999"):
            compute_diff(db, 99999, fv.id)

    def test_removed_line_item(self, db, seeded_project, horizon_params, controller):
        """Forecast row present in v1 but deleted before v2 → shows as 'removed'."""
        fv1 = capture_version(db, "proj-alpha", controller, version_type="manual")
        db.flush()

        # Remove all external rows from forecast
        db.query(Forecast).filter(
            Forecast.project_id == "proj-alpha",
            Forecast.sub_category == "ext-hw",
        ).delete()
        db.flush()

        fv2 = capture_version(db, "proj-alpha", controller, version_type="manual")
        db.commit()

        diff = compute_diff(db, fv1.id, fv2.id)
        removed = [d for d in diff["line_deltas"] if d["status"] == "removed"]
        assert len(removed) > 0


# ---------------------------------------------------------------------------
# 10. mark_cells_provisional
# ---------------------------------------------------------------------------

class TestMarkCellsProvisional:
    """[C-FG-07] Provisional flag on outer-zone cells."""

    def test_marks_beyond_boundary(self, db, seeded_project, horizon_params):
        count = mark_cells_provisional(db, "proj-alpha", "2026-04", boundary_months=3)
        db.commit()
        # Rows beyond 2026-06 should be provisional
        beyond = db.query(Forecast).filter(
            Forecast.project_id == "proj-alpha",
            Forecast.month > "2026-06",
        ).all()
        assert all(f.is_provisional for f in beyond)
        within = db.query(Forecast).filter(
            Forecast.project_id == "proj-alpha",
            Forecast.month <= "2026-06",
        ).all()
        assert all(not f.is_provisional for f in within)

    def test_returns_updated_count(self, db, seeded_project, horizon_params):
        count = mark_cells_provisional(db, "proj-alpha", "2026-04", boundary_months=12)
        # Months after 2027-03 should be marked (2027-04, 2027-07, 2027-10, 2028-01 = 4 months × 2 rows = 8)
        assert count == 8
