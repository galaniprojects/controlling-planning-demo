"""Living-demo date shifting for the seed.

The seed generators (``generate_seed_v5/*``) emit SQL anchored on a fixed
canonical demo month (:data:`CANONICAL_BASE` = ``"2026-04"``). VIPER's notion of
"today" is now dynamic (``config.DEMO_DATE`` = the real current month), so at
seed time we shift every date token in the assembled canonical SQL forward by
``DELTA = month_diff(CANONICAL_BASE, current_period)`` months. All narrative
relationships move together (actuals still end last month, forecasts still open
next month, scheduled changes keep their relative offsets), so the demo always
reflects the present without re-hand-editing ~237 literals across the stages.

This is a *generation-time* transform over the canonical SQL string — not a
column-aware mutation of live rows. It matches only fully-quoted date / datetime
literals (``'YYYY-MM'``, ``'YYYY-MM-DD'``, ``'YYYY-MM-DD HH:MM:SS'``), which in
the seed are always date columns; amounts (dotted decimals) and ids (prefixed)
never match.
"""
from __future__ import annotations

import re
from datetime import date

# The month every seed generator is authored against. Keep in sync with the
# stage modules' internal anchors (e.g. s13_financials.DEMO_DATE).
CANONICAL_BASE = "2026-04"

# Matches a single-quoted date or datetime literal in the SQL:
#   'YYYY-MM'  |  'YYYY-MM-DD'  |  'YYYY-MM-DD HH:MM:SS'
_DATE_TOKEN_RE = re.compile(
    r"'(\d{4})-(\d{2})(?:-(\d{2}))?( \d{2}:\d{2}:\d{2})?'"
)


def _shift_year_month(year: int, month: int, delta_months: int) -> tuple[int, int]:
    total = year * 12 + (month - 1) + delta_months
    return total // 12, total % 12 + 1


def _days_in_month(year: int, month: int) -> int:
    nxt = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    return (nxt - date(year, month, 1)).days


def month_delta(from_ym: str, to_ym: str) -> int:
    """Whole-month difference ``to - from`` for two ``"YYYY-MM"`` strings."""
    fy, fm = int(from_ym[:4]), int(from_ym[5:7])
    ty, tm = int(to_ym[:4]), int(to_ym[5:7])
    return (ty - fy) * 12 + (tm - fm)


def shift_sql_dates(sql: str, delta_months: int) -> str:
    """Shift every quoted date/datetime literal in *sql* by *delta_months*.

    Day-of-month is preserved and clamped to the target month's length (e.g. a
    31st shifted into a 30-day month becomes the 30th). The time component, if
    present, is preserved verbatim. ``delta_months == 0`` is a no-op.
    """
    if delta_months == 0:
        return sql

    def _repl(m: re.Match) -> str:
        year, month = int(m.group(1)), int(m.group(2))
        day, time = m.group(3), m.group(4) or ""
        ny, nm = _shift_year_month(year, month, delta_months)
        if day is None:
            return f"'{ny:04d}-{nm:02d}'"
        nd = min(int(day), _days_in_month(ny, nm))
        return f"'{ny:04d}-{nm:02d}-{nd:02d}{time}'"

    return _DATE_TOKEN_RE.sub(_repl, sql)
