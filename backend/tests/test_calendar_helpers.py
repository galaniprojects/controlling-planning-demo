"""Unit tests for services/calendar.py — fiscal-year helpers.

KB fiscal year is calendar-aligned (Jan–Dec), so fiscal_year_of("YYYY-MM")
== int("YYYY"). current_fiscal_year() reads DEMO_DATE from config.
"""
from __future__ import annotations

import pytest

from services.calendar import current_fiscal_year, fiscal_year_of


class TestCurrentFiscalYear:
    def test_returns_2026_from_demo_date(self):
        """DEMO_DATE is '2026-04', so the current FY must be 2026."""
        assert current_fiscal_year() == 2026

    def test_returns_int(self):
        result = current_fiscal_year()
        assert isinstance(result, int)


class TestFiscalYearOf:
    def test_year_2027_january(self):
        assert fiscal_year_of("2027-01") == 2027

    def test_year_2026_december(self):
        assert fiscal_year_of("2026-12") == 2026

    def test_year_2026_april(self):
        assert fiscal_year_of("2026-04") == 2026

    def test_year_2025(self):
        assert fiscal_year_of("2025-06") == 2025

    def test_returns_int(self):
        result = fiscal_year_of("2027-03")
        assert isinstance(result, int)

    # Edge-case guards
    def test_none_raises_value_error(self):
        with pytest.raises(ValueError):
            fiscal_year_of(None)  # type: ignore[arg-type]

    def test_empty_string_raises_value_error(self):
        with pytest.raises(ValueError):
            fiscal_year_of("")

    def test_non_numeric_prefix_raises_value_error(self):
        with pytest.raises(ValueError):
            fiscal_year_of("ABCD-01")

    def test_bare_year_raises_value_error(self):
        # A bare year (no month) is not a valid YYYY-MM month string.
        with pytest.raises(ValueError):
            fiscal_year_of("2026")

    def test_short_numeric_raises_value_error(self):
        with pytest.raises(ValueError):
            fiscal_year_of("12")

    def test_full_date_prefix_accepted(self):
        # A longer YYYY-MM-DD is fine — only the YYYY-MM prefix is read.
        assert fiscal_year_of("2026-04-15") == 2026
