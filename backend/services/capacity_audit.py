"""Capacity audit log helper.

Writes entries to the ``CapacityActionLog`` table introduced in v5.2 W1 per
spec §12.10. Distinct from the system-wide ``AuditLog`` (8 categories,
``models/system.py``): capacity actions get their own table because the
dashboard/history surface needs richer per-action structured data
(roles affected, people assigned, CR info, decline reason) than the generic
audit log carries.

Pattern reference: ``routers/admin._log_audit()`` (lines 52–73) — same
session-per-write + commit shape, different target table.

Spec references:
- §12.10 (CapacityActionLog DDL + write triggers + detail_payload schema)
- §12.14 (server-side scope enforcement on history reads — implemented in
  the router, not here)
- §12.15 (history endpoint contract)

Implementation note: this module is loaded as part of the wave's "routes"
ownership stream and lands BEFORE Teammate A (schema) commits the
``CapacityActionLog`` model. The import is therefore done lazily inside
``log_capacity_action`` so the route module itself can import this file
without raising. Once the schema lands, every call site succeeds.
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Optional

from sqlalchemy.orm import Session

from schemas.common import CurrentUser

# Action-type vocabulary per spec §12.10 — kept here as a tuple so the
# router and tests can import it for type-checking and exhaustiveness
# assertions without re-stringing the values.
ACTION_TYPES: tuple[str, ...] = (
    "confirm",
    "partial_confirm",
    "decline",
    "decline_request",
    "assign_draft",
    "reassign",
    "cr_reconfirm",
)


def _resolve_log_model():
    """Return the CapacityActionLog ORM class, or None if not yet defined.

    Teammate A's schema commit registers the model in ``models/__init__.py``;
    until then this returns None and writes become no-ops. This lets the
    routes ship in parallel with the schema work without an import cycle.
    """
    try:
        from models.capacity import CapacityActionLog  # noqa: WPS433
        return CapacityActionLog
    except ImportError:
        return None
    except AttributeError:
        return None


def log_capacity_action(
    db: Session,
    user: CurrentUser,
    *,
    action_type: str,
    project_id: str,
    cost_center_id: str,
    summary: str,
    detail_payload: Optional[dict[str, Any]] = None,
    change_request_id: Optional[int] = None,
) -> None:
    """Insert a CapacityActionLog row for a capacity workflow action.

    Called from the four mutating handlers in ``routers/capacity.py`` per
    spec §12.10:
      - PUT /project-confirmation/{pid}/confirm  → 'confirm' or 'partial_confirm'
      - PUT /project-confirmation/{pid}/decline  → 'decline'
      - PUT /requests/{cc}/{rid}/assignments     → 'assign_draft'
      - PUT /requests/{cc}/{rid}/partially-fulfill → 'partial_confirm'

    ``detail_payload`` shape per spec §12.10 — must include enough structured
    detail for the history page's expandable detail rows (roles affected,
    people assigned, CR info, decline reason). Stored as JSON text.

    The function does NOT commit — callers are expected to commit alongside
    their own state changes so log writes are atomic with the action they
    record. It also does NOT raise on a missing model: while Teammate A's
    schema commit is in flight, calls become no-ops so the wave's parallel
    work streams stay unblocked.
    """
    if action_type not in ACTION_TYPES:
        raise ValueError(
            f"Unknown capacity action_type '{action_type}'. "
            f"Allowed: {', '.join(ACTION_TYPES)}"
        )

    model = _resolve_log_model()
    if model is None:
        # Schema not yet landed; skip persistence rather than crash. Once
        # task #1 ("schema") merges, every subsequent call will persist.
        return

    payload_json = json.dumps(detail_payload, default=str) if detail_payload else None

    entry = model(
        timestamp=datetime.utcnow(),
        action_type=action_type,
        acting_user_id=user.person_id,
        project_id=project_id,
        cost_center_id=cost_center_id,
        summary=summary,
        detail_payload=payload_json,
        cr_id=change_request_id,
    )
    db.add(entry)
