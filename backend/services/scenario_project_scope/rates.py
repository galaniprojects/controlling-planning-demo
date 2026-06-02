"""Shared effective-rate helper for the project-scope core.

Leaf module (depends only on ``models.people.RateTable``) so both the resolver
(``resolution.py``) and the write paths (``routing.py``) can keep €-from-hours
coherent using one rate function, without importing each other.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from models.people import RateTable

# Demo fallback hourly rate when a role has no RateTable entry — mirrors the
# legacy aggregate engine so €-coherence stays consistent across the app.
FALLBACK_HOURLY_RATE = 85.0


def effective_hourly_rate(db: Session, role_key: Optional[str]) -> float:
    """Return the **latest**-effective-date hourly rate for a role, falling back
    to ``FALLBACK_HOURLY_RATE`` when the role is unknown/unset.

    NOTE: this takes the most recent ``RateTable`` row by ``effective_date`` —
    NOT the rate in force at any particular cell's month. Per-cell
    effective-date resolution is a known latent gap shared with the legacy
    aggregate engine (``scenario_engine._apply_project_action`` change_allocation
    uses the identical latest-wins query); unifying both is out of scope here.

    ``role_key`` is a ``role_type_id`` (or, for legacy internal lines that carry
    the role in ``sub_category`` with a NULL ``role_type_id``, the sub_category).
    """
    if not role_key:
        return FALLBACK_HOURLY_RATE
    entry = (
        db.query(RateTable)
        .filter(RateTable.role_type_id == role_key)
        .order_by(RateTable.effective_date.desc())
        .first()
    )
    return float(entry.hourly_rate) if entry else FALLBACK_HOURLY_RATE
