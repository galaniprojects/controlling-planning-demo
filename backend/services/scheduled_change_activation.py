"""Scheduled change activation engine — Cluster D Session D2.

Spec lines ~1608–1610 ("daily activation job") and ~2456 ("scheduled change
activation"). At demo time the engine is invoked manually via
``POST /api/admin/apply-scheduled-changes``; production wiring to a daily cron
is a deployment concern (working assumption logged in PROGRESS.md).

Activation lifecycle: ``approved`` rows whose ``activation_date`` is today or
earlier are applied to the live entity, marked ``activated``, and audit-logged
under category ``scheduled_change_lifecycle``.

D2 ships an explicit dispatcher for ``planning_parameter`` (the simplest
target). Other entity types are accepted at create time but activate as
**no-op** with a recorded note — they will be wired in follow-on sessions
(see PROGRESS.md "Notes for follow-on sessions").
"""

from __future__ import annotations

import json
from datetime import date, datetime
from typing import Callable, Optional

from sqlalchemy.orm import Session

from models.scheduled_changes import ScheduledChange
from models.system import PlanningParameter
from routers.admin import _log_audit
from schemas.common import CurrentUser


# ---------------------------------------------------------------------------
# Per-entity-type apply functions
# ---------------------------------------------------------------------------

ApplyFn = Callable[[Session, ScheduledChange, dict], str]


def _apply_planning_parameter(db: Session, change: ScheduledChange, values: dict) -> str:
    """Apply a scheduled change to a ``PlanningParameter`` row.

    ``entity_id`` matches the parameter's ``key``. ``values`` should contain
    a ``current_value`` field; other keys are ignored for safety.
    Returns a short human-readable summary line for the router response.
    """
    param = (
        db.query(PlanningParameter)
        .filter(PlanningParameter.key == change.entity_id)
        .first()
    )
    if not param:
        raise ValueError(f"PlanningParameter not found: key={change.entity_id}")

    if "current_value" not in values:
        raise ValueError("planning_parameter activation requires 'current_value'")

    old_value = param.current_value
    new_value = str(values["current_value"])
    param.current_value = new_value
    return f"planning_parameter {param.key}: {old_value!r} → {new_value!r}"


# Registry of supported entity types. Other types fall through to a noop
# documented in PROGRESS.md.
APPLY_HANDLERS: dict[str, ApplyFn] = {
    "planning_parameter": _apply_planning_parameter,
}


# ---------------------------------------------------------------------------
# Activation engine
# ---------------------------------------------------------------------------

def apply_due_changes(
    db: Session,
    user: CurrentUser,
    *,
    today: Optional[date] = None,
) -> dict:
    """Find and apply all approved + due ``ScheduledChange`` rows.

    Returns a summary dict::

        {
          "applied": [{id, entity_type, entity_id, summary}, ...],
          "skipped": [{id, reason}, ...],
          "errors":  [{id, error}, ...],
        }

    Each successful activation flips ``review_status='activated'``, sets
    ``activated_at=now``, and writes an audit row under the
    ``scheduled_change_lifecycle`` category.
    """
    if today is None:
        today = date.today()

    due = (
        db.query(ScheduledChange)
        .filter(
            ScheduledChange.review_status == "approved",
            ScheduledChange.activation_date <= today,
        )
        .order_by(ScheduledChange.activation_date.asc(), ScheduledChange.id.asc())
        .all()
    )

    applied: list[dict] = []
    skipped: list[dict] = []
    errors: list[dict] = []

    for change in due:
        try:
            values = json.loads(change.pending_values_json or "{}")
        except json.JSONDecodeError as exc:
            change.activation_error = f"Invalid pending_values_json: {exc}"
            errors.append({"id": change.id, "error": change.activation_error})
            continue

        handler = APPLY_HANDLERS.get(change.entity_type)
        try:
            if handler is None:
                summary = (
                    f"{change.entity_type} {change.entity_id}: activation recorded as no-op "
                    f"(D2 ships planning_parameter dispatcher only)"
                )
                skipped.append({"id": change.id, "reason": summary})
            else:
                summary = handler(db, change, values)
                applied.append({
                    "id": change.id,
                    "entity_type": change.entity_type,
                    "entity_id": change.entity_id,
                    "summary": summary,
                })

            change.review_status = "activated"
            change.activated_at = datetime.utcnow()
            change.activation_error = None

            _log_audit(
                db, user,
                entity_type="scheduled_change",
                entity_id=str(change.id),
                entity_name=change.description or f"{change.entity_type} {change.entity_id}",
                action="activate",
                field_changed="review_status",
                old_value="approved",
                new_value="activated",
                category="scheduled_change_lifecycle",
            )
        except Exception as exc:  # pylint: disable=broad-except
            change.activation_error = str(exc)
            errors.append({"id": change.id, "error": str(exc)})

    db.commit()

    return {
        "as_of": today.isoformat(),
        "applied": applied,
        "skipped": skipped,
        "errors": errors,
    }
