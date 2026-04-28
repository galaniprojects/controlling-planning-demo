"""Scheduled change endpoints — Cluster D Session D2.

Implements the lifecycle described at spec lines ~1592–1610:

- Create a scheduled change (defaults to ``pending_review``).
- Approve / reject (controller acts as second admin).
- Cancel (creator withdraws prior to activation).
- List with filters.
- Manual ``POST /api/admin/apply-scheduled-changes`` to run the activation
  engine — production cron wiring is a deployment concern (see PROGRESS.md).

D3 will ship the approval UI; D2 surfaces the data and the trigger only.

All endpoints require the ``controller`` role.
"""

from __future__ import annotations

import json
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from dependencies import require_role
from models.scheduled_changes import SCHEDULED_CHANGE_STATES, ScheduledChange
from routers.admin import _log_audit
from schemas.common import CurrentUser
from services.scheduled_change_activation import APPLY_HANDLERS, apply_due_changes


router = APIRouter(prefix="/api/admin", tags=["Scheduled Changes"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ScheduledChangeCreate(BaseModel):
    entity_type: str = Field(..., min_length=1, max_length=50)
    entity_id: str = Field(..., min_length=1, max_length=60)
    description: Optional[str] = Field(None, max_length=255)
    pending_values: dict
    activation_date: date


class ScheduledChangeReview(BaseModel):
    review_comments: Optional[str] = None


class ScheduledChangeResponse(BaseModel):
    id: int
    entity_type: str
    entity_id: str
    description: Optional[str]
    pending_values: dict
    activation_date: str
    review_status: str
    created_by_person_id: str
    created_at: str
    reviewed_by_person_id: Optional[str]
    reviewed_at: Optional[str]
    review_comments: Optional[str]
    activated_at: Optional[str]
    activation_error: Optional[str]


# ---------------------------------------------------------------------------
# Serialization
# ---------------------------------------------------------------------------

def _to_response(change: ScheduledChange) -> dict:
    try:
        values = json.loads(change.pending_values_json)
    except (json.JSONDecodeError, TypeError):
        values = {}
    return ScheduledChangeResponse(
        id=change.id,
        entity_type=change.entity_type,
        entity_id=change.entity_id,
        description=change.description,
        pending_values=values,
        activation_date=change.activation_date.isoformat(),
        review_status=change.review_status,
        created_by_person_id=change.created_by_person_id,
        created_at=change.created_at.isoformat() if change.created_at else "",
        reviewed_by_person_id=change.reviewed_by_person_id,
        reviewed_at=change.reviewed_at.isoformat() if change.reviewed_at else None,
        review_comments=change.review_comments,
        activated_at=change.activated_at.isoformat() if change.activated_at else None,
        activation_error=change.activation_error,
    ).model_dump()


# ---------------------------------------------------------------------------
# GET /scheduled-changes
# ---------------------------------------------------------------------------

@router.get("/scheduled-changes")
def list_scheduled_changes(
    review_status: Optional[str] = Query(default=None),
    entity_type: Optional[str] = None,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role("controller")),
):
    """List scheduled changes with optional filters."""
    if review_status and review_status not in SCHEDULED_CHANGE_STATES:
        raise HTTPException(
            status_code=400,
            detail=f"review_status must be one of {SCHEDULED_CHANGE_STATES}",
        )
    q = db.query(ScheduledChange)
    if review_status:
        q = q.filter(ScheduledChange.review_status == review_status)
    if entity_type:
        q = q.filter(ScheduledChange.entity_type == entity_type)
    rows = q.order_by(
        ScheduledChange.activation_date.asc(), ScheduledChange.id.asc()
    ).all()
    return {"items": [_to_response(r) for r in rows], "total": len(rows)}


# ---------------------------------------------------------------------------
# GET /scheduled-changes/{id}
# ---------------------------------------------------------------------------

@router.get("/scheduled-changes/{change_id}")
def get_scheduled_change(
    change_id: int,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role("controller")),
):
    change = db.query(ScheduledChange).filter(ScheduledChange.id == change_id).first()
    if not change:
        raise HTTPException(status_code=404, detail="Scheduled change not found")
    return _to_response(change)


# ---------------------------------------------------------------------------
# POST /scheduled-changes
# ---------------------------------------------------------------------------

@router.post("/scheduled-changes")
def create_scheduled_change(
    body: ScheduledChangeCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Create a new scheduled change in ``pending_review`` state.

    Activation date must be today or future per spec line ~1592 ("today-or-future
    only — no retroactive scheduling"). Past corrections are immediate edits
    via the existing CRUD surfaces, not scheduled changes.
    """
    if body.activation_date < date.today():
        raise HTTPException(
            status_code=400,
            detail="activation_date must be today or future. Use direct CRUD for retroactive edits.",
        )

    change = ScheduledChange(
        entity_type=body.entity_type,
        entity_id=body.entity_id,
        description=body.description,
        pending_values_json=json.dumps(body.pending_values),
        activation_date=body.activation_date,
        review_status="pending_review",
        created_by_person_id=user.person_id,
    )
    db.add(change)
    db.flush()

    _log_audit(
        db, user, "scheduled_change", str(change.id),
        change.description or f"{change.entity_type} {change.entity_id}",
        action="create",
        category="scheduled_change_lifecycle",
    )
    db.commit()
    db.refresh(change)

    if change.entity_type not in APPLY_HANDLERS:
        # Soft warning — surface in PROGRESS.md "Notes for follow-on sessions".
        # Activation will record a no-op for this entity type until a handler is wired.
        pass

    return _to_response(change)


# ---------------------------------------------------------------------------
# POST /scheduled-changes/{id}/approve
# ---------------------------------------------------------------------------

@router.post("/scheduled-changes/{change_id}/approve")
def approve_scheduled_change(
    change_id: int,
    body: ScheduledChangeReview = ScheduledChangeReview(),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Approve a pending scheduled change. Sets ``review_status='approved'``."""
    change = _load_or_404(db, change_id)
    if change.review_status != "pending_review":
        raise HTTPException(
            status_code=409,
            detail=f"Cannot approve change in status '{change.review_status}'",
        )
    _log_audit(
        db, user, "scheduled_change", str(change.id),
        change.description or f"{change.entity_type} {change.entity_id}",
        action="update", field_changed="review_status",
        old_value="pending_review", new_value="approved",
        category="scheduled_change_lifecycle",
    )
    change.review_status = "approved"
    change.reviewed_by_person_id = user.person_id
    change.reviewed_at = datetime.utcnow()
    change.review_comments = body.review_comments
    db.commit()
    db.refresh(change)
    return _to_response(change)


# ---------------------------------------------------------------------------
# POST /scheduled-changes/{id}/reject
# ---------------------------------------------------------------------------

@router.post("/scheduled-changes/{change_id}/reject")
def reject_scheduled_change(
    change_id: int,
    body: ScheduledChangeReview,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Reject a pending scheduled change. ``review_comments`` recommended."""
    change = _load_or_404(db, change_id)
    if change.review_status != "pending_review":
        raise HTTPException(
            status_code=409,
            detail=f"Cannot reject change in status '{change.review_status}'",
        )
    _log_audit(
        db, user, "scheduled_change", str(change.id),
        change.description or f"{change.entity_type} {change.entity_id}",
        action="update", field_changed="review_status",
        old_value="pending_review", new_value="rejected",
        category="scheduled_change_lifecycle",
    )
    change.review_status = "rejected"
    change.reviewed_by_person_id = user.person_id
    change.reviewed_at = datetime.utcnow()
    change.review_comments = body.review_comments
    db.commit()
    db.refresh(change)
    return _to_response(change)


# ---------------------------------------------------------------------------
# POST /scheduled-changes/{id}/cancel
# ---------------------------------------------------------------------------

@router.post("/scheduled-changes/{change_id}/cancel")
def cancel_scheduled_change(
    change_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Cancel a pending or approved change before activation."""
    change = _load_or_404(db, change_id)
    if change.review_status not in ("pending_review", "approved"):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot cancel change in status '{change.review_status}'",
        )
    old_status = change.review_status
    _log_audit(
        db, user, "scheduled_change", str(change.id),
        change.description or f"{change.entity_type} {change.entity_id}",
        action="update", field_changed="review_status",
        old_value=old_status, new_value="cancelled",
        category="scheduled_change_lifecycle",
    )
    change.review_status = "cancelled"
    change.reviewed_by_person_id = user.person_id
    change.reviewed_at = datetime.utcnow()
    db.commit()
    db.refresh(change)
    return _to_response(change)


# ---------------------------------------------------------------------------
# POST /apply-scheduled-changes — manual trigger for the activation engine
# ---------------------------------------------------------------------------

@router.post("/apply-scheduled-changes")
def trigger_scheduled_change_activation(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Run the activation engine for all approved + due scheduled changes.

    Manual trigger only in v5 (production wiring is a deployment concern —
    see PROGRESS.md "Working assumptions"). Returns a summary listing
    applied / skipped / errored changes.
    """
    return apply_due_changes(db, user)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_or_404(db: Session, change_id: int) -> ScheduledChange:
    change = db.query(ScheduledChange).filter(ScheduledChange.id == change_id).first()
    if not change:
        raise HTTPException(status_code=404, detail="Scheduled change not found")
    return change
