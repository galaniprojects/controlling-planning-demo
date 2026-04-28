"""v5 intake workflow API [A-BK-26..A-BK-29] [A-PS-13] [A-DOI-04..A-DOI-05].

Endpoints (all mounted under ``/api/intake``):

- ``POST   /projects``                          — create at DoI 0 (Proposed).
- ``POST   /projects/{id}/approve``             — controller-only Approve.
- ``POST   /projects/{id}/send-back``           — controller-only Send Back.
- ``POST   /projects/{id}/reject``              — controller-only Reject.
- ``POST   /projects/{id}/resubmit``            — PL-driven Resubmit after Send Back.
- ``GET    /projects/{id}/diff``                — before/after diff view.
- ``GET    /queue``                             — review queue (Under Evaluation).

Replaces the v4 ``/api/portfolio/intake*`` family which is 410 Gone'd in
``routers/portfolio.py`` per [A-BK-26]. The CR Approvals endpoints
(``/api/portfolio/approvals*``) remain unchanged for now per the spec note
"change requests are a separate workflow from intake".

Authorisation:

- Create: any authenticated role (PL or controller). Controllers may pass
  ``pl_person_id`` to create on behalf of a PL.
- Approve / Send Back / Reject: controller-only via :func:`require_role`.
- Resubmit: PL on own project OR controller anywhere. PL on someone else's
  project returns 403.
- Diff: any authenticated role for the project — frontend will show the
  controller's review and the PL's revision side by side.
- Queue: any authenticated role; thin wrapper over the existing ranking
  endpoint filtered to ``Under Evaluation``.
"""

from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user, require_role
from models.projects import Project
from schemas.common import CurrentUser
from schemas.intake import (
    IntakeApproveAction,
    IntakeDiffResponse,
    IntakeProjectCreate,
    IntakeProjectResponse,
    IntakeRejectAction,
    IntakeResubmitAction,
    IntakeSendBackAction,
)
from services.intake_workflow import (
    UNDER_EVALUATION,
    approve_intake_project,
    compute_intake_diff,
    create_intake_project,
    reject_intake_project,
    resubmit_intake_project,
    send_back_intake_project,
    _trigger_within_cutoff_recompute,
)


router = APIRouter(prefix="/api/intake", tags=["Intake (v5)"])


# ---------------------------------------------------------------------------
# Authorisation helpers (mirror the pattern in routers/pipeline.py)
# ---------------------------------------------------------------------------

def _is_pl_for_project(user: CurrentUser, project: Project) -> bool:
    if user.role != "project_lead":
        return False
    if project.pl_person_id == user.person_id:
        return True
    return project.id in user.project_ids


def _project_or_404(db: Session, project_id: str) -> Project:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def _build_project_response(project: Project) -> IntakeProjectResponse:
    """Render a project as the intake-friendly response shape."""
    return IntakeProjectResponse(
        id=project.id,
        name=project.name,
        pipeline_stage=project.pipeline_stage or "",
        doi=project.doi if project.doi is not None else 0,
        status=project.status,
        pl_person_id=project.pl_person_id,
        project_type=project.project_type or 0,
        composite_score=(
            float(project.composite_score)
            if project.composite_score is not None else None
        ),
        total_budget=(
            float(project.total_budget)
            if project.total_budget is not None else None
        ),
    )


# ---------------------------------------------------------------------------
# 1. Create at DoI 0 (Proposed) per [A-BK-26]
# ---------------------------------------------------------------------------

@router.post("/projects", response_model=IntakeProjectResponse, status_code=201)
def create_project(
    body: IntakeProjectCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Admit a new project at DoI 0 (Proposed) per [A-BK-26] / [A-DOI-04].

    Required body fields are minimal — name, description, lob_id,
    project_type, capex_opex, start_month. The project appears in the
    backlog immediately at the bottom of the ranked list (composite_score
    null → ranked last per A3 logic).

    PL-on-self: when the caller's role is ``project_lead`` and
    ``pl_person_id`` is omitted, the service substitutes the caller's
    person ID. Controllers must pass ``pl_person_id`` explicitly when
    creating on behalf of a PL.
    """
    if user.role not in ("project_lead", "controller", "executive"):
        raise HTTPException(
            status_code=403,
            detail=(
                f"Role '{user.role}' cannot create intake projects. "
                "Allowed: project_lead, controller, executive."
            ),
        )

    project = create_intake_project(db, body, user)
    db.commit()
    db.refresh(project)

    # [A-BK-14] new project enters backlog → recompute within_cutoff.
    _trigger_within_cutoff_recompute(db)
    db.refresh(project)

    return _build_project_response(project)


# ---------------------------------------------------------------------------
# 2. Approve from Under Evaluation per [A-BK-27]
# ---------------------------------------------------------------------------

@router.post("/projects/{project_id}/approve", response_model=IntakeProjectResponse)
def approve_project(
    project_id: str,
    body: IntakeApproveAction | None = None,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Controller-only Approve (Pitch Board) per [A-BK-27].

    Transitions ``Under Evaluation -> Approved (DoI 3)``, sets
    ``status='active'``, generates baseline rows from any existing forecast,
    notifies the PL, and triggers a within_cutoff recompute.
    """
    project = _project_or_404(db, project_id)
    comments = body.comments if body else None
    approve_intake_project(db, project, user, comments=comments)
    db.commit()
    db.refresh(project)

    _trigger_within_cutoff_recompute(db)
    db.refresh(project)

    return _build_project_response(project)


# ---------------------------------------------------------------------------
# 3. Send Back from Under Evaluation per [A-BK-27] / [A-BK-29]
# ---------------------------------------------------------------------------

@router.post("/projects/{project_id}/send-back", response_model=IntakeProjectResponse)
def send_back_project(
    project_id: str,
    body: IntakeSendBackAction,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Controller-only Send Back per [A-BK-27].

    Transitions ``Under Evaluation -> Proposed (DoI 1)``, persists the
    controller's comments on ``submission_feedback`` and a
    ``controller_sent_back`` snapshot for the diff view, then notifies the
    PL with a deep link to the workbench Diff tab.
    """
    project = _project_or_404(db, project_id)
    send_back_intake_project(db, project, user, comments=body.comments)
    db.commit()
    db.refresh(project)
    return _build_project_response(project)


# ---------------------------------------------------------------------------
# 4. Reject from Under Evaluation per [A-BK-27]
# ---------------------------------------------------------------------------

@router.post("/projects/{project_id}/reject", response_model=IntakeProjectResponse)
def reject_project(
    project_id: str,
    body: IntakeRejectAction,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Controller-only Reject per [A-BK-27].

    Transitions ``Under Evaluation -> Cancelled``, freezes the live DoI
    into ``frozen_doi`` per [A-PS-03], and notifies the PL.

    Cancellation is "nearly one-way" per [A-PS-10]; reverting requires the
    explicit override path on the existing pipeline endpoint.
    """
    project = _project_or_404(db, project_id)
    reject_intake_project(db, project, user, reason=body.reason)
    db.commit()
    db.refresh(project)

    _trigger_within_cutoff_recompute(db)
    db.refresh(project)

    return _build_project_response(project)


# ---------------------------------------------------------------------------
# 5. PL Resubmit after Send Back per [A-BK-29]
# ---------------------------------------------------------------------------

@router.post("/projects/{project_id}/resubmit", response_model=IntakeProjectResponse)
def resubmit_project(
    project_id: str,
    body: IntakeResubmitAction | None = None,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """PL Resubmit after Send Back per [A-BK-29].

    PLs may resubmit their own projects; controllers may resubmit any
    project (admin/curation use case). Other roles are 403.
    """
    project = _project_or_404(db, project_id)

    if user.role == "controller":
        pass  # controller may always resubmit
    elif _is_pl_for_project(user, project):
        pass  # PL on own project
    else:
        raise HTTPException(
            status_code=403,
            detail=(
                "Resubmit requires controller or the assigned project lead "
                "on their own project."
            ),
        )

    notes = body.resubmission_notes if body else None
    resubmit_intake_project(db, project, user, notes=notes)
    db.commit()
    db.refresh(project)
    return _build_project_response(project)


# ---------------------------------------------------------------------------
# 6. Diff view per [A-BK-29]
# ---------------------------------------------------------------------------

@router.get("/projects/{project_id}/diff", response_model=IntakeDiffResponse)
def get_intake_diff(
    project_id: str,
    type: Literal["resubmit", "current"] = "resubmit",
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """Return the structured before/after diff for a sent-back project per
    [A-BK-29]. ``type=resubmit`` (default) compares the sent-back snapshot
    against the resubmitted snapshot (or the project's current state when
    the PL has not pressed Resubmit yet). ``type=current`` always compares
    against the live state.

    Returns 404 when no Send Back has occurred for this project — there is
    nothing to diff against.
    """
    project = _project_or_404(db, project_id)
    return compute_intake_diff(db, project, diff_type=type)


# ---------------------------------------------------------------------------
# 7. Review queue (Under Evaluation) per [A-BK-26]
# ---------------------------------------------------------------------------

@router.get("/queue")
def get_intake_queue(
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """List projects awaiting controller review (Under Evaluation).

    Per [A-BK-26] there is no dedicated intake queue UI in v5; the controller
    filters to "Under Evaluation" within the backlog. This endpoint is a
    convenience wrapper for that filter — frontend can hit it directly to
    avoid loading the full backlog when only the review queue is needed.

    Response shape mirrors ``GET /api/portfolio/backlog`` for consistency.
    """
    projects = (
        db.query(Project)
        .filter(
            Project.is_active.is_(True),
            Project.pipeline_stage == UNDER_EVALUATION,
        )
        .order_by(Project.composite_score.desc().nullslast(), Project.name.asc())
        .all()
    )

    items = []
    for p in projects:
        items.append({
            "id": p.id,
            "name": p.name,
            "pipeline_stage": p.pipeline_stage,
            "doi": p.doi,
            "project_type": p.project_type,
            "composite_score": (
                float(p.composite_score) if p.composite_score is not None else None
            ),
            "total_budget": (
                float(p.total_budget) if p.total_budget is not None else None
            ),
            "tshirt_size": p.tshirt_size,
            "pl_person_id": p.pl_person_id,
            "submission_feedback": p.submission_feedback,
            "ai_council_approved": p.ai_council_approved,
        })
    return {"items": items, "total": len(items)}
