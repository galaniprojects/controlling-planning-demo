"""Project Milestones API [A-MS-02] [A-MS-03] [A-BK-34].

Two router prefixes are exported:
- ``project_router`` mounted at ``/api/projects`` for per-project milestone
  endpoints.
- ``admin_router`` mounted at ``/api/admin`` for the read-only milestone-type
  catalogue.

Authorization:
- GETs: any authenticated user.
- POST / PUT / DELETE on ``/projects/{id}/milestones``: controller (any
  project) or PL on a project they own. Mirrors the Tech Navigator gate.
- Baseline-date edits (``baseline_start`` / ``baseline_end``) on PUT are
  controller-only AND require ``override_reason`` per [A-MS-03]. The
  override path emits one ``audit_log`` entry per changed field with the
  reason embedded in ``new_value`` — no schema changes to AuditLog.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user
from models.projects import MilestoneType, Project, ProjectMilestone
from routers.admin import _log_audit
from schemas.common import CurrentUser
from schemas.milestones import (
    MilestoneCreate,
    MilestoneListResponse,
    MilestoneResponse,
    MilestoneTypeListResponse,
    MilestoneTypeResponse,
    MilestoneUpdate,
)

project_router = APIRouter(prefix="/api/projects", tags=["Project Milestones"])
admin_router = APIRouter(prefix="/api/admin", tags=["Project Milestones"])


# ---------------------------------------------------------------------------
# Authorization + helpers
# ---------------------------------------------------------------------------


def _can_edit_milestones(user: CurrentUser, project: Project) -> bool:
    """Controller can edit any project; PL can edit own projects."""
    if user.role == "controller":
        return True
    if user.role == "project_lead":
        if project.pl_person_id == user.person_id:
            return True
        if project.id in user.project_ids:
            return True
    return False


def _month_diff(a: str, b: str) -> int:
    """Return the number of months between two YYYY-MM strings (a - b)."""
    ay, am = int(a[:4]), int(a[5:7])
    by, bm = int(b[:4]), int(b[5:7])
    return (ay - by) * 12 + (am - bm)


def _resolve_color(milestone: ProjectMilestone, type_lookup: dict[str, MilestoneType]) -> str | None:
    """Return per-milestone override colour or fallback to the type default."""
    if milestone.color:
        return milestone.color
    if milestone.milestone_type_id:
        mt = type_lookup.get(milestone.milestone_type_id)
        if mt is not None:
            return mt.default_color
    return None


def _build_response(
    milestone: ProjectMilestone, type_lookup: dict[str, MilestoneType],
) -> MilestoneResponse:
    return MilestoneResponse(
        id=milestone.id,
        project_id=milestone.project_id,
        sequence_number=milestone.sequence_number,
        name=milestone.name,
        milestone_type_id=milestone.milestone_type_id,
        baseline_start=milestone.baseline_start,
        baseline_end=milestone.baseline_end,
        forecast_start=milestone.forecast_start,
        forecast_end=milestone.forecast_end,
        color=_resolve_color(milestone, type_lookup),
        slip_months=_month_diff(milestone.forecast_end, milestone.baseline_end),
        baseline_locked_at=milestone.baseline_locked_at,
    )


def _load_type_lookup(db: Session) -> dict[str, MilestoneType]:
    """One-shot fetch of the type catalogue keyed by id for cheap lookups."""
    return {mt.id: mt for mt in db.query(MilestoneType).all()}


# ---------------------------------------------------------------------------
# /api/projects/{project_id}/milestones — list / create / update / delete
# ---------------------------------------------------------------------------


@project_router.get(
    "/{project_id}/milestones",
    response_model=MilestoneListResponse,
)
def list_milestones(
    project_id: str,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """List all milestones for a project. Empty list is valid per [A-MS-04]."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    rows = (
        db.query(ProjectMilestone)
        .filter(ProjectMilestone.project_id == project_id)
        .order_by(ProjectMilestone.sequence_number)
        .all()
    )
    type_lookup = _load_type_lookup(db)
    items = [_build_response(m, type_lookup) for m in rows]
    return MilestoneListResponse(items=items, total=len(items))


@project_router.post(
    "/{project_id}/milestones",
    response_model=MilestoneResponse,
)
def create_milestone(
    project_id: str,
    body: MilestoneCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Create a milestone. Sets ``baseline_locked_at`` to now."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not _can_edit_milestones(user, project):
        raise HTTPException(
            status_code=403,
            detail="Only controllers or the assigned project lead can create milestones",
        )

    # Validate milestone_type_id when provided.
    if body.milestone_type_id is not None:
        mt = db.query(MilestoneType).filter(MilestoneType.id == body.milestone_type_id).first()
        if not mt:
            raise HTTPException(status_code=400, detail="Unknown milestone_type_id")

    # Sequence-number uniqueness within the project.
    collision = (
        db.query(ProjectMilestone)
        .filter(
            ProjectMilestone.project_id == project_id,
            ProjectMilestone.sequence_number == body.sequence_number,
        )
        .first()
    )
    if collision:
        raise HTTPException(
            status_code=409,
            detail=f"Milestone sequence_number {body.sequence_number} already exists for this project",
        )

    milestone = ProjectMilestone(
        project_id=project_id,
        sequence_number=body.sequence_number,
        name=body.name,
        milestone_type_id=body.milestone_type_id,
        baseline_start=body.baseline_start,
        baseline_end=body.baseline_end,
        forecast_start=body.forecast_start,
        forecast_end=body.forecast_end,
        color=body.color,
        baseline_locked_at=datetime.utcnow(),
    )
    db.add(milestone)
    db.flush()
    _log_audit(
        db, user,
        entity_type="milestone",
        entity_id=str(milestone.id),
        entity_name=milestone.name,
        action="create",
        category="forecast_actions",
    )
    db.commit()
    db.refresh(milestone)

    return _build_response(milestone, _load_type_lookup(db))


_BASELINE_FIELDS = {"baseline_start", "baseline_end"}
_UPDATABLE_FIELDS = (
    "sequence_number",
    "name",
    "milestone_type_id",
    "baseline_start",
    "baseline_end",
    "forecast_start",
    "forecast_end",
    "color",
)


@project_router.put(
    "/{project_id}/milestones/{milestone_id}",
    response_model=MilestoneResponse,
)
def update_milestone(
    project_id: str,
    milestone_id: int,
    body: MilestoneUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Update a milestone.

    Forecast-only field changes always allowed for controller / PL on own
    project. Baseline-date changes require controller role AND
    ``override_reason`` per [A-MS-03]; on the override path one
    ``audit_log`` row per changed field is written with the reason
    embedded in ``new_value``.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    milestone = (
        db.query(ProjectMilestone)
        .filter(
            ProjectMilestone.id == milestone_id,
            ProjectMilestone.project_id == project_id,
        )
        .first()
    )
    if not milestone:
        raise HTTPException(status_code=404, detail="Milestone not found")

    if not _can_edit_milestones(user, project):
        raise HTTPException(
            status_code=403,
            detail="Only controllers or the assigned project lead can update milestones",
        )

    payload = body.model_dump(exclude_unset=True)
    override_reason = payload.pop("override_reason", None)

    # Detect baseline-date intent.
    touching_baseline = any(
        field in payload and payload[field] != getattr(milestone, field)
        for field in _BASELINE_FIELDS
    )
    if touching_baseline:
        if user.role != "controller":
            raise HTTPException(
                status_code=403,
                detail="Only controllers can change baseline dates",
            )
        if not override_reason:
            raise HTTPException(
                status_code=403,
                detail="override_reason is required when changing baseline dates",
            )

    # Validate milestone_type_id when supplied.
    if "milestone_type_id" in payload and payload["milestone_type_id"] is not None:
        mt = (
            db.query(MilestoneType)
            .filter(MilestoneType.id == payload["milestone_type_id"])
            .first()
        )
        if not mt:
            raise HTTPException(status_code=400, detail="Unknown milestone_type_id")

    # Validate sequence_number uniqueness if changing it.
    if "sequence_number" in payload and payload["sequence_number"] != milestone.sequence_number:
        collision = (
            db.query(ProjectMilestone)
            .filter(
                ProjectMilestone.project_id == project_id,
                ProjectMilestone.sequence_number == payload["sequence_number"],
                ProjectMilestone.id != milestone.id,
            )
            .first()
        )
        if collision:
            raise HTTPException(
                status_code=409,
                detail=f"Milestone sequence_number {payload['sequence_number']} already exists for this project",
            )

    for field_name in _UPDATABLE_FIELDS:
        if field_name not in payload:
            continue
        new_value = payload[field_name]
        old_value = getattr(milestone, field_name)
        if old_value == new_value:
            continue
        setattr(milestone, field_name, new_value)

        if field_name in _BASELINE_FIELDS:
            audit_new = (
                f"{new_value} (override: {override_reason})"
                if new_value is not None else f"None (override: {override_reason})"
            )
            _log_audit(
                db, user,
                entity_type="milestone",
                entity_id=str(milestone.id),
                entity_name=milestone.name,
                action="update",
                field_changed=field_name,
                old_value=str(old_value) if old_value is not None else None,
                new_value=audit_new,
                category="forecast_actions",
            )

    db.commit()
    db.refresh(milestone)
    return _build_response(milestone, _load_type_lookup(db))


@project_router.delete("/{project_id}/milestones/{milestone_id}")
def delete_milestone(
    project_id: str,
    milestone_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Delete a milestone. Allowed regardless of baseline-locked state for now.

    Working assumption logged in PROGRESS.md: delete-after-baseline-lock
    will be revisited when the milestones admin UI ships in D1/D3.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    milestone = (
        db.query(ProjectMilestone)
        .filter(
            ProjectMilestone.id == milestone_id,
            ProjectMilestone.project_id == project_id,
        )
        .first()
    )
    if not milestone:
        raise HTTPException(status_code=404, detail="Milestone not found")

    if not _can_edit_milestones(user, project):
        raise HTTPException(
            status_code=403,
            detail="Only controllers or the assigned project lead can delete milestones",
        )

    _log_audit(
        db, user,
        entity_type="milestone",
        entity_id=str(milestone.id),
        entity_name=milestone.name,
        action="delete",
        category="forecast_actions",
    )
    db.delete(milestone)
    db.commit()
    return {"deleted": True, "id": milestone_id}


# ---------------------------------------------------------------------------
# /api/admin/milestone-types — read-only catalogue [A-BK-34]
# ---------------------------------------------------------------------------


@admin_router.get(
    "/milestone-types",
    response_model=MilestoneTypeListResponse,
)
def list_milestone_types(
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """Read-only catalogue for the milestone picker UI per [A-BK-34]."""
    rows = (
        db.query(MilestoneType)
        .order_by(MilestoneType.suggested_ordering)
        .all()
    )
    items = [
        MilestoneTypeResponse(
            id=mt.id,
            name=mt.name,
            default_color=mt.default_color,
            suggested_ordering=mt.suggested_ordering,
            is_active=mt.is_active,
        )
        for mt in rows
    ]
    return MilestoneTypeListResponse(items=items, total=len(items))
