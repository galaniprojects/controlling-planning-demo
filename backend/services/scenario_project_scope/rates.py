"""Shared effective-rate helper for the project-scope core.

Leaf module so both the resolver (``resolution.py``) and the write paths
(``routing.py``) can keep €-from-hours coherent using one rate function,
without importing each other. Delegates to the canonical effective-date lookup
in ``services.calculations.resolve_hourly_rate`` so the simulator prices hours
at the rate **in force at each cell's month** — matching the live
forecast/promote target (CLAUDE.md: "historical cost calculations use the rate
in effect at the time"). The delegate is imported lazily to keep this a leaf at
import time.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session


def effective_hourly_rate(db: Session, role_key: Optional[str], month: str) -> float:
    """Return the hourly rate for ``role_key`` in force at ``month`` (``YYYY-MM``).

    Picks the ``RateTable`` row with the latest ``effective_date`` on-or-before
    the first day of ``month`` (rate-at-month, not latest-wins). Scenario
    project-scope cells carry no competence-centre, so the lookup falls back to
    any CC for the role (mirrors the capacity router). Falls back to
    ``DEFAULT_HOURLY_RATE`` when the role is unknown/unset or has no rate yet in
    force at ``month``.

    ``role_key`` is a ``role_type_id`` (or, for legacy internal lines that carry
    the role in ``sub_category`` with a NULL ``role_type_id``, the sub_category).
    """
    from services.calculations import DEFAULT_HOURLY_RATE, resolve_hourly_rate

    if not role_key:
        return float(DEFAULT_HOURLY_RATE)
    return float(resolve_hourly_rate(db, role_key, None, month))
