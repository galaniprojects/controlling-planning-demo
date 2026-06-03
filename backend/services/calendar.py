"""Fiscal-year helper utilities for VIPER.

KB's fiscal year is calendar-aligned (January–December), so the fiscal year
of any month string ``YYYY-MM`` is simply the four-digit year prefix.

See spec §8 (VIPER Portfolio & Backlog Restructuring Spec).
"""
from __future__ import annotations

from config import DEMO_DATE, get_current_period
from services.calculations import add_months

__all__ = [
    "current_fiscal_year",
    "fiscal_year_of",
    "current_period",
    "open_forecast_month",
]


def current_period() -> str:
    """Return the current planning month (``"YYYY-MM"``) — the in-progress month.

    Thin alias of :func:`config.get_current_period`, re-exported here so the
    calendar module is the single import site for VIPER's temporal helpers.
    Months strictly before this are closed actuals; this month is in progress
    (partial actuals) and **locked** for forecast editing.
    """
    return get_current_period()


def open_forecast_month() -> str:
    """Return the first month open for forecast editing (``"YYYY-MM"``).

    The in-progress current month is locked, so the open forecast month is the
    **next** month after :data:`config.DEMO_DATE`. This is the editable boundary:
    a month is editable iff ``month >= open_forecast_month()`` (equivalently
    ``month > current_period``).
    """
    return add_months(DEMO_DATE, 1)


def current_fiscal_year() -> int:
    """Return the current fiscal year derived from the demo-date anchor.

    KB fiscal year is calendar-aligned (Jan–Dec), so FY == calendar year.
    The demo date is sourced from ``config.DEMO_DATE`` (e.g. ``"2026-04"``),
    giving FY 2026 at the reference date used throughout the application.

    Returns:
        int: The four-digit fiscal year (e.g. 2026).
    """
    return int(DEMO_DATE[:4])


def fiscal_year_of(month: str) -> int:
    """Return the fiscal year that contains *month*.

    *month* must be a ``YYYY-MM`` string (a longer ``YYYY-MM-DD`` is also
    accepted — only the ``YYYY-MM`` prefix is read). KB fiscal year is
    calendar-aligned (Jan–Dec), so the year prefix is the fiscal year.

    Args:
        month: A month string in ``YYYY-MM`` format.

    Returns:
        int: The four-digit fiscal year (e.g. 2027).

    Raises:
        ValueError: If *month* is ``None``, empty, not in ``YYYY-MM`` shape
            (4-digit year + ``-`` separator), or its year prefix cannot be
            parsed as an integer. A bare year like ``"2026"`` is rejected.
    """
    if not month:
        raise ValueError(f"fiscal_year_of: month must be a non-empty string, got {month!r}")
    if len(month) < 7 or month[4] != "-":
        raise ValueError(
            f"fiscal_year_of: expected YYYY-MM shape, got {month!r}"
        )
    try:
        return int(month[:4])
    except (ValueError, TypeError) as exc:
        raise ValueError(
            f"fiscal_year_of: cannot parse year from {month!r}"
        ) from exc
