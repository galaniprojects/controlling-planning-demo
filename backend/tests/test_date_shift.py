"""Unit tests for the living-demo date-shift transform (``seed/date_shift.py``).

The committed ``seed.sql`` is anchored on the canonical demo month
(``CANONICAL_BASE == "2026-04"``). At load / reset time every quoted date or
datetime literal is shifted forward by ``month_delta(CANONICAL_BASE,
current_period)`` months so the seeded narrative always reflects the present.

These tests pin the transform's contract:
  * ``YYYY-MM`` month literals shift by whole months.
  * ``YYYY-MM-DD`` date literals shift by whole months with day-of-month
    preserved and clamped to the target month's length (Jan-31 + 1 -> Feb-28).
  * ``YYYY-MM-DD HH:MM:SS`` datetime literals shift the date, preserve the time.
  * Non-date tokens (dotted decimal amounts, prefixed ids) are never touched.
  * ``delta == 0`` is a byte-exact no-op.
  * ``month_delta`` computes the signed whole-month difference.
"""
from __future__ import annotations

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from seed.date_shift import CANONICAL_BASE, month_delta, shift_sql_dates


# ---------------------------------------------------------------------------
# month_delta
# ---------------------------------------------------------------------------

class TestMonthDelta:
    def test_same_month_is_zero(self):
        assert month_delta("2026-04", "2026-04") == 0

    def test_forward_within_year(self):
        assert month_delta("2026-04", "2026-09") == 5

    def test_forward_across_year(self):
        assert month_delta("2026-04", "2027-06") == 14

    def test_backward_is_negative(self):
        assert month_delta("2026-04", "2026-01") == -3

    def test_multi_year_span(self):
        assert month_delta("2026-04", "2029-04") == 36

    def test_canonical_base_constant(self):
        # Guard against an accidental re-anchor of the seed generators.
        assert CANONICAL_BASE == "2026-04"


# ---------------------------------------------------------------------------
# shift_sql_dates — month literals (YYYY-MM)
# ---------------------------------------------------------------------------

class TestShiftMonthLiterals:
    def test_simple_forward_shift(self):
        assert shift_sql_dates("'2026-04'", 2) == "'2026-06'"

    def test_year_rollover(self):
        assert shift_sql_dates("'2026-11'", 3) == "'2027-02'"

    def test_multi_year_shift(self):
        assert shift_sql_dates("'2026-04'", 14) == "'2027-06'"

    def test_backward_shift(self):
        assert shift_sql_dates("'2026-02'", -3) == "'2025-11'"

    def test_december_boundary(self):
        assert shift_sql_dates("'2026-12'", 1) == "'2027-01'"

    def test_january_boundary_backward(self):
        assert shift_sql_dates("'2026-01'", -1) == "'2025-12'"


# ---------------------------------------------------------------------------
# shift_sql_dates — date literals (YYYY-MM-DD) with day clamp
# ---------------------------------------------------------------------------

class TestShiftDateLiterals:
    def test_simple_date_shift(self):
        assert shift_sql_dates("'2026-04-15'", 2) == "'2026-06-15'"

    def test_day_preserved_when_target_has_room(self):
        assert shift_sql_dates("'2026-01-30'", 2) == "'2026-03-30'"

    def test_jan31_clamps_to_feb28(self):
        # Feb 2026 is not a leap year -> 28 days.
        assert shift_sql_dates("'2026-01-31'", 1) == "'2026-02-28'"

    def test_jan31_clamps_to_feb29_leap_year(self):
        # 2028 is a leap year -> Feb has 29 days.
        assert shift_sql_dates("'2027-01-31'", 13) == "'2028-02-29'"

    def test_31st_clamps_to_30day_month(self):
        # Mar-31 + 1 month -> April has 30 days.
        assert shift_sql_dates("'2026-03-31'", 1) == "'2026-04-30'"

    def test_date_year_rollover(self):
        assert shift_sql_dates("'2026-12-20'", 2) == "'2027-02-20'"

    def test_first_of_month_unaffected_by_clamp(self):
        assert shift_sql_dates("'2026-01-01'", 1) == "'2026-02-01'"


# ---------------------------------------------------------------------------
# shift_sql_dates — datetime literals (YYYY-MM-DD HH:MM:SS) preserve time
# ---------------------------------------------------------------------------

class TestShiftDatetimeLiterals:
    def test_time_preserved_verbatim(self):
        assert shift_sql_dates("'2026-04-08 16:20:00'", 2) == "'2026-06-08 16:20:00'"

    def test_datetime_day_clamp_preserves_time(self):
        assert shift_sql_dates("'2026-01-31 09:30:45'", 1) == "'2026-02-28 09:30:45'"

    def test_datetime_year_rollover(self):
        assert shift_sql_dates("'2026-12-31 23:59:59'", 1) == "'2027-01-31 23:59:59'"


# ---------------------------------------------------------------------------
# shift_sql_dates — non-date tokens untouched
# ---------------------------------------------------------------------------

class TestNonDateTokensUntouched:
    def test_dotted_decimal_amount_untouched(self):
        # European-style amount must not be mistaken for a date.
        sql = "INSERT INTO t (amount_eur) VALUES (14400.00);"
        assert shift_sql_dates(sql, 5) == sql

    def test_prefixed_ids_untouched(self):
        sql = "VALUES ('proj-predmaint', 'p-sharma', 'cc-muc-apd')"
        assert shift_sql_dates(sql, 5) == sql

    def test_integer_columns_untouched(self):
        sql = "VALUES (4, 100, -1280, 95)"
        assert shift_sql_dates(sql, 7) == sql

    def test_mixed_row_only_dates_move(self):
        sql = (
            "(4, 'proj-predmaint', 'end_month', '2027-06', NULL, "
            "'2026-04-08 16:20:00')"
        )
        expected = (
            "(4, 'proj-predmaint', 'end_month', '2027-08', NULL, "
            "'2026-06-08 16:20:00')"
        )
        assert shift_sql_dates(sql, 2) == expected


# ---------------------------------------------------------------------------
# shift_sql_dates — delta == 0 no-op
# ---------------------------------------------------------------------------

class TestZeroDeltaNoOp:
    def test_zero_delta_is_byte_exact(self):
        sql = (
            "INSERT INTO scenarios VALUES "
            "(4, 'x', '2026-04-08 16:20:00', '2027-06', 14400.00, 'p-sharma');"
        )
        assert shift_sql_dates(sql, 0) == sql

    def test_zero_delta_leaves_all_literals(self):
        assert shift_sql_dates("'2026-04' '2026-04-15' '2026-04-15 10:00:00'", 0) == (
            "'2026-04' '2026-04-15' '2026-04-15 10:00:00'"
        )


# ---------------------------------------------------------------------------
# Multiple literals in a single string
# ---------------------------------------------------------------------------

class TestMultipleLiterals:
    def test_all_three_shapes_in_one_pass(self):
        sql = "'2026-04', '2026-04-15', '2026-04-15 10:00:00'"
        expected = "'2026-06', '2026-06-15', '2026-06-15 10:00:00'"
        assert shift_sql_dates(sql, 2) == expected

    def test_repeated_literal_all_shift(self):
        sql = "'2026-04' and '2026-04' and '2026-04'"
        assert shift_sql_dates(sql, 1) == "'2026-05' and '2026-05' and '2026-05'"
