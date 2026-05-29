"""Pipeline stage / DoI API [A-PS-04] [A-DOI-03].

Endpoints (all mounted at /api/projects):

- GET  /{id}/pipeline                — read full state (any authenticated role).
- POST /{id}/pipeline/transition     — move stage / DoI; controller anywhere,
  PL on own project for self-driven gates (DoI 0->1, 1->2). Override path
  bypasses missing-field checks and audit-logs the reason.
- PUT  /{id}/pipeline/ai-council     — set the AI Council flag + doc URL
  (controller only).
- PUT  /{id}/pipeline/within-cutoff  — manual setter for A2; A3 replaces with
  computed value (controller only).

Audit log entries live under ``entity_type='pipeline'`` for stage / DoI
changes and ``entity_type='ai_council'`` / ``'within_cutoff'`` for the
dedicated endpoints. Each changed field emits its own audit row to mirror
the A1 Tech Navigator pattern.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from config import DEMO_DATE
from database import get_db
from dependencies import get_current_user
from models.charging import ChargeableEntity
from models.projects import Project
from routers.admin import _log_audit
from schemas.common import CurrentUser
from schemas.pipeline import (
    AICouncilUpdate,
    GateStatus,
    PipelineStateResponse,
    StageTransitionRequest,
    WithinCutoffSet,
)
from services.pipeline import (
    OFF_PATH_STAGES,
    compute_pipeline_state,
    doi_for_stage,
    is_transition_allowed,
    validate_doi_gate,
)


router = APIRouter(prefix="/api/projects", tags=["Pipeline"])


# ---------------------------------------------------------------------------
# Authorization helpers
# ---------------------------------------------------------------------------

def _is_pl_for_project(user: CurrentUser, project: Project) -> bool:
    """PL is allowed if assigned to the project or in their static seed list.

    Mirrors the convention used by ``pl_project_filter`` and the A1
    Tech Navigator router.
    """
    if user.role != "project_lead":
        return False
    if project.pl_person_id == user.person_id:
        return True
    if project.id in user.project_ids:
        return True
    return False


def _can_modify_pipeline(
    user: CurrentUser,
    project: Project,
    transition: StageTransitionRequest | None,
) -> bool:
    """Authorisation gate for transitions, AI Council, and within_cutoff.

    Rules per [A-BK-25] / [A-BK-28]:

    - Controller: always permitted.
    - Project Lead on own project: permitted only when the request is a
      forward DoI move within the PL-driven range (0->1 self-set, 1->2 submit
      for review). Encoded as: ``target_doi`` (or stage-default DoI) <= 2 AND
      target is a forward step from current DoI.
    - All other roles: forbidden.

    AI Council and within_cutoff endpoints pass ``transition=None``; only the
    controller branch hits ``True`` for those.
    """
    if user.role == "controller":
        return True
    if transition is None:
        return False
    if not _is_pl_for_project(user, project):
        return False

    target_doi = transition.target_doi
    if target_doi is None:
        target_doi = doi_for_stage(transition.target_stage)
    if target_doi is None:
        # PL cannot move a project to an off-path stage (no DoI digit).
        return False

    current_doi = project.doi if project.doi is not None else 0
    if target_doi > 2:
        return False
    if target_doi < current_doi:
        # PLs cannot rewind a project's DoI; controller-only operation.
        return False
    return True


# ---------------------------------------------------------------------------
# Response builder
# ---------------------------------------------------------------------------

def _build_response(project: Project, db: Session) -> PipelineStateResponse:
    state = compute_pipeline_state(project, db)
    return PipelineStateResponse(
        project_id=state["project_id"],
        pipeline_stage=state["pipeline_stage"],
        doi=state["doi"],
        frozen_doi=state["frozen_doi"],
        ai_council_approved=state["ai_council_approved"],
        ai_council_doc_url=state["ai_council_doc_url"],
        within_cutoff=state["within_cutoff"],
        transitions_available=state["transitions_available"],
        gate_status=GateStatus(**state["gate_status"]),
    )


# ---------------------------------------------------------------------------
# GET — read full pipeline state
# ---------------------------------------------------------------------------

@router.get("/{project_id}/pipeline", response_model=PipelineStateResponse)
def get_pipeline(
    project_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Return pipeline stage, DoI, gate status, and available transitions.

    Open to all authenticated roles. Empty stage / DoI for unscored projects
    is reflected as nulls in the response.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return _build_response(project, db)


# ---------------------------------------------------------------------------
# POST — stage transition
# ---------------------------------------------------------------------------

@router.post("/{project_id}/pipeline/transition", response_model=PipelineStateResponse)
def transition_pipeline(
    project_id: str,
    body: StageTransitionRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Move the project to a new stage and optionally update its DoI.

    Behaviour:

    1. Reject unknown projects (404).
    2. Reject unauthorised callers (403).
    3. Reject structurally invalid transitions per
       :func:`is_transition_allowed` (409 with the graph error message).
    4. Run :func:`validate_doi_gate` against the resolved target DoI. If any
       fields are missing AND no ``override_reason`` is supplied, return 409
       with the missing-field list. If override_reason is supplied, proceed
       and audit-log the override.
    5. Apply stage + DoI changes, manage ``frozen_doi`` for off-path stages,
       and write an audit row per changed field. Commit and return the new
       state.

    Off-path frozen-DoI logic per [A-PS-03]:

    - Entering Paused or Cancelled freezes the current DoI into ``frozen_doi``
      and clears ``doi`` (the project no longer has a live DoI).
    - Leaving Paused / Cancelled restores ``doi`` from ``frozen_doi`` if the
      caller did not supply ``target_doi``; ``frozen_doi`` is then cleared.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not _can_modify_pipeline(user, project, body):
        raise HTTPException(
            status_code=403,
            detail=(
                "Only controllers (any project) or the assigned project lead "
                "(own project, forward DoI 0->1 or 1->2) can transition this "
                "pipeline stage."
            ),
        )

    # 1. Structural transition check.
    ok, edge_err = is_transition_allowed(
        project.pipeline_stage, body.target_stage, body.override_reason,
    )
    if not ok:
        raise HTTPException(status_code=409, detail=edge_err)

    # 1b. Run-entity-link invariant (VIPER §2.4 / Wave 3). A move to the
    #     terminal "Run entity spawned" stage must name the ChargeableEntity
    #     the project hands off to. The entity must exist and be an Offering or
    #     InternalService — handing a project off to another Project is not a
    #     spawn. Enforced here, after the structural edge check, so the 409s
    #     mirror the style of the DoI-gate detail dict below.
    #     Note: a spawn with no explicit target_doi resolves to DoI 5 (step 2),
    #     so it is also subject to the existing DoI-5 gate (requires end_month).
    #     There is no UI wiring run_entity_id today — this path is API/seed-only
    #     until a spawn UI lands in a later wave.
    run_entity: ChargeableEntity | None = None
    if body.target_stage == "Run entity spawned":
        if not body.run_entity_id:
            raise HTTPException(
                status_code=409,
                detail={
                    "error": "run_entity_required",
                    "detail": (
                        "Transitioning to 'Run entity spawned' requires "
                        "run_entity_id naming the Offering or InternalService "
                        "the project hands off to."
                    ),
                },
            )
        run_entity = (
            db.query(ChargeableEntity)
            .filter(ChargeableEntity.id == body.run_entity_id)
            .first()
        )
        if run_entity is None:
            raise HTTPException(
                status_code=404,
                detail=f"Run entity not found: {body.run_entity_id}",
            )
        if run_entity.entity_type == "Project":
            raise HTTPException(
                status_code=409,
                detail={
                    "error": "invalid_run_entity",
                    "detail": (
                        "run_entity_id must reference an Offering or "
                        "InternalService, not a Project."
                    ),
                },
            )

    # 2. Resolve target DoI: explicit value, restored from frozen_doi when
    #    leaving an off-path stage, or default for the target stage.
    leaving_off_path = (
        project.pipeline_stage in OFF_PATH_STAGES
        and body.target_stage not in OFF_PATH_STAGES
    )
    if body.target_doi is not None:
        target_doi: int | None = body.target_doi
    elif leaving_off_path and project.frozen_doi is not None:
        target_doi = project.frozen_doi
    elif body.target_stage in OFF_PATH_STAGES:
        target_doi = None
    else:
        target_doi = doi_for_stage(body.target_stage)

    # 3. DoI gate validation. The gate represents a forward maturity bar, so
    #    we enforce it only when the move advances DoI (target > current).
    #    Backwards moves per [A-PS-11] do not require gate fields to be met.
    #    Off-path moves and controller overrides also skip the check.
    current_doi = project.doi if project.doi is not None else -1
    is_forward = target_doi is not None and target_doi > current_doi
    if (
        is_forward
        and body.target_stage not in OFF_PATH_STAGES
        and not body.override_reason
    ):
        missing = validate_doi_gate(project, target_doi, db)
        if missing:
            raise HTTPException(
                status_code=409,
                detail={
                    "error": "doi_gate_unmet",
                    "target_doi": target_doi,
                    "missing_fields": missing,
                },
            )

    # 4. Apply the change. Audit each modified attribute.
    old_stage = project.pipeline_stage
    old_doi = project.doi
    old_frozen = project.frozen_doi
    old_run_entity_id = project.run_entity_id

    project.pipeline_stage = body.target_stage

    # Run-entity-link: only the spawn transition stamps the link + handover
    # month. No other target stage touches these fields (per requirement 5).
    if body.target_stage == "Run entity spawned":
        project.run_entity_id = body.run_entity_id
        project.handover_month = DEMO_DATE[:7]

    if body.target_stage in OFF_PATH_STAGES:
        # Freeze the live DoI before clearing it.
        if project.doi is not None and project.frozen_doi != project.doi:
            project.frozen_doi = project.doi
        project.doi = None
    else:
        if leaving_off_path:
            project.frozen_doi = None
        project.doi = target_doi

    if old_stage != project.pipeline_stage:
        _log_audit(
            db, user,
            entity_type="pipeline",
            entity_id=project.id,
            entity_name=project.name,
            action="update",
            field_changed="pipeline_stage",
            old_value=str(old_stage) if old_stage is not None else None,
            new_value=str(project.pipeline_stage),
            category="pipeline_transitions",
        )
    if old_doi != project.doi:
        _log_audit(
            db, user,
            entity_type="pipeline",
            entity_id=project.id,
            entity_name=project.name,
            action="update",
            field_changed="doi",
            old_value=str(old_doi) if old_doi is not None else None,
            new_value=str(project.doi) if project.doi is not None else None,
            category="pipeline_transitions",
        )
    if old_frozen != project.frozen_doi:
        _log_audit(
            db, user,
            entity_type="pipeline",
            entity_id=project.id,
            entity_name=project.name,
            action="update",
            field_changed="frozen_doi",
            old_value=str(old_frozen) if old_frozen is not None else None,
            new_value=str(project.frozen_doi) if project.frozen_doi is not None else None,
            category="pipeline_transitions",
        )
    if old_run_entity_id != project.run_entity_id:
        _log_audit(
            db, user,
            entity_type="pipeline",
            entity_id=project.id,
            entity_name=project.name,
            action="update",
            field_changed="run_entity_id",
            old_value=str(old_run_entity_id) if old_run_entity_id is not None else None,
            # Enrich with the resolved entity name (in scope from the validation
            # block) so the audit trail is readable without a join. Old value
            # stays the bare prior id — no cheap name lookup for it.
            new_value=(
                f"{project.run_entity_id} ({run_entity.name})"
                if project.run_entity_id is not None and run_entity is not None
                else (str(project.run_entity_id) if project.run_entity_id is not None else None)
            ),
            category="pipeline_transitions",
        )

    if body.override_reason:
        _log_audit(
            db, user,
            entity_type="pipeline",
            entity_id=project.id,
            entity_name=project.name,
            action="override",
            field_changed="pipeline_stage",
            old_value=str(old_stage) if old_stage is not None else None,
            new_value=f"{project.pipeline_stage} (reason: {body.override_reason})",
            category="pipeline_transitions",
        )

    db.commit()

    # [A-BK-14] Stage change → recompute within_cutoff across the backlog.
    # Best-effort: a recompute failure must not surface as a 500 on the
    # transition itself, so we swallow exceptions but let the project state
    # already committed above stand.
    try:
        from services.ranking import recompute_within_cutoff_for_backlog
        recompute_within_cutoff_for_backlog(db)
    except Exception:  # noqa: BLE001 — defensive: trigger best-effort.
        db.rollback()

    db.refresh(project)
    return _build_response(project, db)


# ---------------------------------------------------------------------------
# PUT — AI Council flag + doc URL
# ---------------------------------------------------------------------------

@router.put("/{project_id}/pipeline/ai-council", response_model=PipelineStateResponse)
def set_ai_council(
    project_id: str,
    body: AICouncilUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Controller-only setter for the AI Council screening flag + doc link.

    Per [A-DOI-03] AI Council screening is modelled as a flag plus an
    attachment URL, not a workflow. Each changed field emits an audit row
    under ``entity_type='ai_council'``.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if user.role != "controller":
        raise HTTPException(
            status_code=403,
            detail="Only controllers can update AI Council screening.",
        )

    old_flag = project.ai_council_approved
    old_url = project.ai_council_doc_url

    if old_flag != body.ai_council_approved:
        project.ai_council_approved = body.ai_council_approved
        _log_audit(
            db, user,
            entity_type="ai_council",
            entity_id=project.id,
            entity_name=project.name,
            action="update",
            field_changed="ai_council_approved",
            old_value=str(old_flag),
            new_value=str(body.ai_council_approved),
            category="pipeline_transitions",
        )
    if old_url != body.ai_council_doc_url:
        project.ai_council_doc_url = body.ai_council_doc_url
        _log_audit(
            db, user,
            entity_type="ai_council",
            entity_id=project.id,
            entity_name=project.name,
            action="update",
            field_changed="ai_council_doc_url",
            old_value=old_url,
            new_value=body.ai_council_doc_url,
            category="pipeline_transitions",
        )

    db.commit()
    db.refresh(project)
    return _build_response(project, db)


# ---------------------------------------------------------------------------
# PUT — manual within_cutoff setter (A2 stub; A3 replaces with computed)
# ---------------------------------------------------------------------------

@router.put("/{project_id}/pipeline/within-cutoff", response_model=PipelineStateResponse)
def set_within_cutoff(
    project_id: str,
    body: WithinCutoffSet,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Controller-only manual setter for ``within_cutoff``.

    Replaced by the ranking-engine recomputation in Session A3 per [A-PS-06].
    Until then this endpoint exists so the demo can flip the flag explicitly.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if user.role != "controller":
        raise HTTPException(
            status_code=403,
            detail="Only controllers can set within_cutoff manually.",
        )

    old_value = project.within_cutoff
    if old_value != body.within_cutoff:
        project.within_cutoff = body.within_cutoff
        new_value_label = str(body.within_cutoff)
        if body.reason:
            new_value_label = f"{new_value_label} (reason: {body.reason})"
        _log_audit(
            db, user,
            entity_type="within_cutoff",
            entity_id=project.id,
            entity_name=project.name,
            action="update",
            field_changed="within_cutoff",
            old_value=str(old_value) if old_value is not None else None,
            new_value=new_value_label,
            category="pipeline_transitions",
        )

    db.commit()
    db.refresh(project)
    return _build_response(project, db)
