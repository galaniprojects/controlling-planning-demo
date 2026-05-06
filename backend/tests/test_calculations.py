"""Unit tests for services/calculations.py — pure math and month utilities."""

from unittest.mock import MagicMock

import pytest

from services.calculations import (
    FTE_HOURS,
    add_months,
    aggregate_financial_rows,
    compute_budget_rag,
    compute_combined_rag,
    compute_execution_variance,
    compute_plan_drift,
    compute_timeline_rag,
    compute_total_variance,
    compute_utilization_pct,
    generate_month_range,
    get_standard_hours,
    month_diff,
    month_to_str,
    parse_month,
    utilization_color_bucket,
)


# ---------------------------------------------------------------------------
# Month utilities
# ---------------------------------------------------------------------------

class TestParseMonth:
    def test_normal(self):
        assert parse_month("2026-04") == (2026, 4)

    def test_january(self):
        assert parse_month("2025-01") == (2025, 1)

    def test_december(self):
        assert parse_month("2099-12") == (2099, 12)


class TestMonthToStr:
    def test_normal(self):
        assert month_to_str(2026, 4) == "2026-04"

    def test_padding(self):
        assert month_to_str(2026, 1) == "2026-01"

    def test_december(self):
        assert month_to_str(2026, 12) == "2026-12"


class TestMonthDiff:
    def test_same_month(self):
        assert month_diff("2026-04", "2026-04") == 0

    def test_positive(self):
        assert month_diff("2026-01", "2026-04") == 3

    def test_negative(self):
        assert month_diff("2026-04", "2026-01") == -3

    def test_cross_year(self):
        assert month_diff("2025-10", "2026-02") == 4

    def test_multi_year(self):
        assert month_diff("2024-01", "2026-01") == 24


class TestAddMonths:
    def test_forward(self):
        assert add_months("2026-01", 3) == "2026-04"

    def test_backward(self):
        assert add_months("2026-04", -3) == "2026-01"

    def test_year_wrap_forward(self):
        assert add_months("2026-11", 3) == "2027-02"

    def test_year_wrap_backward(self):
        assert add_months("2026-02", -3) == "2025-11"

    def test_zero(self):
        assert add_months("2026-06", 0) == "2026-06"

    def test_large_jump(self):
        assert add_months("2026-01", 24) == "2028-01"


class TestGenerateMonthRange:
    def test_single_month(self):
        assert generate_month_range("2026-04", "2026-04") == ["2026-04"]

    def test_normal_range(self):
        result = generate_month_range("2026-01", "2026-03")
        assert result == ["2026-01", "2026-02", "2026-03"]

    def test_cross_year(self):
        result = generate_month_range("2025-11", "2026-02")
        assert result == ["2025-11", "2025-12", "2026-01", "2026-02"]

    def test_empty_when_start_after_end(self):
        assert generate_month_range("2026-05", "2026-03") == []


# ---------------------------------------------------------------------------
# Variance calculations
# ---------------------------------------------------------------------------

class TestComputePlanDrift:
    def test_positive_drift(self):
        assert compute_plan_drift(1100, 1000) == pytest.approx(10.0)

    def test_negative_drift(self):
        assert compute_plan_drift(900, 1000) == pytest.approx(-10.0)

    def test_zero_baseline(self):
        assert compute_plan_drift(1000, 0) == 0.0

    def test_equal(self):
        assert compute_plan_drift(500, 500) == 0.0


class TestComputeExecutionVariance:
    def test_over_budget(self):
        assert compute_execution_variance(1200, 1000) == 200

    def test_under_budget(self):
        assert compute_execution_variance(800, 1000) == -200


class TestComputeTotalVariance:
    def test_over(self):
        assert compute_total_variance(1100, 1000) == 100

    def test_under(self):
        assert compute_total_variance(900, 1000) == -100


# ---------------------------------------------------------------------------
# RAG status
# ---------------------------------------------------------------------------

class TestComputeBudgetRag:
    def test_green_low(self):
        assert compute_budget_rag(2.0) == "green"

    def test_green_negative(self):
        assert compute_budget_rag(-3.0) == "green"

    def test_amber_at_5(self):
        assert compute_budget_rag(5.0) == "amber"

    def test_amber_at_10(self):
        assert compute_budget_rag(10.0) == "amber"

    def test_red_above_10(self):
        assert compute_budget_rag(11.0) == "red"

    def test_red_negative_large(self):
        assert compute_budget_rag(-15.0) == "red"

    def test_green_at_zero(self):
        assert compute_budget_rag(0.0) == "green"


class TestComputeTimelineRag:
    def test_green_no_slippage(self):
        assert compute_timeline_rag("2026-12", "2026-12", "2026-01") == "green"

    def test_green_none_projected(self):
        assert compute_timeline_rag(None, "2026-12", "2026-01") == "green"

    def test_green_none_baseline(self):
        assert compute_timeline_rag("2026-12", None, "2026-01") == "green"

    def test_green_zero_duration(self):
        # start == baseline_end means zero-length project
        assert compute_timeline_rag("2026-06", "2026-01", "2026-01") == "green"

    def test_amber_moderate_slip(self):
        # 12-month project, 1 month slip = 8.3%
        assert compute_timeline_rag("2027-02", "2027-01", "2026-01") == "amber"

    def test_red_large_slip(self):
        # 12-month project, 3 month slip = 25%
        assert compute_timeline_rag("2027-04", "2027-01", "2026-01") == "red"

    def test_green_early_finish(self):
        # projected_end before baseline_end → negative slippage → green
        assert compute_timeline_rag("2026-10", "2026-12", "2026-01") == "green"


class TestComputeCombinedRag:
    def test_both_green(self):
        assert compute_combined_rag("green", "green") == "green"

    def test_green_and_red(self):
        assert compute_combined_rag("green", "red") == "red"

    def test_red_and_green(self):
        assert compute_combined_rag("red", "green") == "red"

    def test_amber_and_red(self):
        assert compute_combined_rag("amber", "red") == "red"

    def test_amber_and_green(self):
        assert compute_combined_rag("amber", "green") == "amber"


# ---------------------------------------------------------------------------
# Utilization
# ---------------------------------------------------------------------------

class TestComputeUtilizationPct:
    def test_full_utilization(self):
        assert compute_utilization_pct(160) == 100.0

    def test_half(self):
        assert compute_utilization_pct(80) == 50.0

    def test_zero(self):
        assert compute_utilization_pct(0) == 0.0

    def test_over(self):
        assert compute_utilization_pct(200) == 125.0


class TestUtilizationColorBucket:
    def test_under_70_amber(self):
        assert utilization_color_bucket(50) == "amber"

    def test_at_70_green(self):
        assert utilization_color_bucket(70) == "green"

    def test_at_89_green(self):
        assert utilization_color_bucket(89) == "green"

    def test_at_90_amber(self):
        assert utilization_color_bucket(90) == "amber"

    def test_at_100_amber(self):
        assert utilization_color_bucket(100) == "amber"

    def test_over_100_red(self):
        assert utilization_color_bucket(101) == "red"

    def test_zero_amber(self):
        assert utilization_color_bucket(0) == "amber"


# ---------------------------------------------------------------------------
# Financial aggregation
# ---------------------------------------------------------------------------

class TestAggregateFinancialRows:
    def test_empty(self):
        result = aggregate_financial_rows([])
        assert result["total"] == 0.0
        assert result["ytd"] == 0.0
        assert result["remaining"] == 0.0
        assert result["by_category"] == {}

    def test_basic_aggregation(self):
        rows = [
            {"month": "2026-01", "category": "internal", "amount_eur": 1000},
            {"month": "2026-01", "category": "external", "amount_eur": 500},
            {"month": "2026-03", "category": "internal", "amount_eur": 2000},
        ]
        result = aggregate_financial_rows(rows, demo_date="2026-02")
        assert result["total"] == 3500.0
        assert result["by_category"]["internal"] == 3000.0
        assert result["by_category"]["external"] == 500.0
        assert result["ytd"] == 1500.0  # Jan rows only
        assert result["remaining"] == 2000.0  # Mar row

    def test_ytd_boundary(self):
        rows = [
            {"month": "2026-02", "category": "internal", "amount_eur": 100},
            {"month": "2026-03", "category": "internal", "amount_eur": 200},
        ]
        result = aggregate_financial_rows(rows, demo_date="2026-02")
        assert result["ytd"] == 100.0
        assert result["remaining"] == 200.0

    def test_handles_none_amount(self):
        rows = [{"month": "2026-01", "category": "internal", "amount_eur": None}]
        result = aggregate_financial_rows(rows)
        assert result["total"] == 0.0


# ---------------------------------------------------------------------------
# get_standard_hours (DB-dependent — uses mock)
# ---------------------------------------------------------------------------

class TestGetStandardHours:
    def _mock_db(self, params: dict):
        """Build a mock db that returns PlanningParameter-like objects."""
        from unittest.mock import MagicMock

        def query_filter_first(key_value):
            if key_value in params:
                obj = MagicMock()
                obj.current_value = str(params[key_value])
                return obj
            return None

        db = MagicMock()
        query_mock = db.query.return_value
        filter_mock = query_mock.filter.return_value
        filter_mock.first.side_effect = lambda: None  # default

        # Chain: db.query(PP).filter(PP.key == X).first()
        # We need to intercept the filter call to check what key is being looked up
        def filter_side_effect(condition):
            # Extract the compared value from the BinaryExpression
            mock_result = MagicMock()
            # We'll use a simpler approach: just track calls
            mock_result.first.return_value = None
            for k, v in params.items():
                # Check if this key appears in the condition string
                pass
            return mock_result

        # Simpler approach: mock at a higher level
        return db

    def test_returns_hardcoded_fallback(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        assert get_standard_hours(db) == FTE_HOURS

    def test_returns_global_param(self):
        mock_param = MagicMock()
        mock_param.current_value = "170.0"
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = mock_param
        assert get_standard_hours(db) == 170.0

    def test_location_override(self):
        mock_param = MagicMock()
        mock_param.current_value = "150.0"
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = mock_param
        assert get_standard_hours(db, location_id="loc-muc") == 150.0


# ---------------------------------------------------------------------------
# resolve_hourly_rate (v5.1 W4 pre-work)
# ---------------------------------------------------------------------------

class TestResolveHourlyRate:
    """resolve_hourly_rate centralises the latest-effective-on-or-before lookup
    so the C-05 per-employee aggregator and the C-07 capacity FTE-equivalent
    calc share one rate-resolution pattern.
    """

    @pytest.fixture
    def db_with_rates(self):
        """In-memory DB seeded with two rate rows for one role."""
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker

        from database import Base
        from models.organization import CompetenceCenter
        from models.people import RateTable, RoleType

        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        Session = sessionmaker(bind=engine)
        s = Session()
        s.add(RoleType(id="role-dev", name="Developer"))
        s.add(CompetenceCenter(id="cc-apd", name="APD"))
        s.add(CompetenceCenter(id="cc-bso", name="BSO"))
        s.add(RateTable(
            role_type_id="role-dev", competence_center_id="cc-apd",
            hourly_rate=100, effective_date="2024-01-01",
        ))
        s.add(RateTable(
            role_type_id="role-dev", competence_center_id="cc-apd",
            hourly_rate=110, effective_date="2026-01-01",
        ))
        s.add(RateTable(
            role_type_id="role-dev", competence_center_id="cc-bso",
            hourly_rate=130, effective_date="2024-01-01",
        ))
        s.commit()
        return s

    def test_effective_date_lookup(self, db_with_rates):
        """The 2026-01-01 rate applies from January 2026 onwards."""
        from decimal import Decimal
        from services.calculations import resolve_hourly_rate

        # Cell month before the new rate effective date → old rate
        assert resolve_hourly_rate(
            db_with_rates, "role-dev", "cc-apd", "2025-12"
        ) == Decimal("100.00")
        # Cell month at the effective date → new rate
        assert resolve_hourly_rate(
            db_with_rates, "role-dev", "cc-apd", "2026-01"
        ) == Decimal("110.00")
        # Cell month after the effective date → new rate
        assert resolve_hourly_rate(
            db_with_rates, "role-dev", "cc-apd", "2026-04"
        ) == Decimal("110.00")

    def test_competence_center_filter(self, db_with_rates):
        """Different CC → different rate even on the same day."""
        from decimal import Decimal
        from services.calculations import resolve_hourly_rate

        assert resolve_hourly_rate(
            db_with_rates, "role-dev", "cc-bso", "2026-04"
        ) == Decimal("130.00")
        # No CC → falls back to any rate for the role (latest by effective date)
        # In this seed the latest rate overall is the cc-apd 2026-01-01 row
        # (110), but cc-bso also has 2024-01-01 (130). With effective <= 2026-04
        # the candidates are 100 (apd, 2024-01-01), 130 (bso, 2024-01-01), and
        # 110 (apd, 2026-01-01). Latest by effective_date is cc-apd 110.
        assert resolve_hourly_rate(
            db_with_rates, "role-dev", None, "2026-04"
        ) == Decimal("110.00")

    def test_fallback_to_default_when_no_rate(self, db_with_rates):
        """Unknown role → DEFAULT_HOURLY_RATE (€120.00)."""
        from decimal import Decimal
        from services.calculations import resolve_hourly_rate

        assert resolve_hourly_rate(
            db_with_rates, "role-unknown", "cc-apd", "2026-04"
        ) == Decimal("120.00")
        # And when no row exists with effective_date <= target month
        assert resolve_hourly_rate(
            db_with_rates, "role-dev", "cc-apd", "2023-06"
        ) == Decimal("120.00")
