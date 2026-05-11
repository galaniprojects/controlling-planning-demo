"""Define-page API surface — name-only create, identity Save, Approval &
Milestones Save, baseline-grid Save, and a single canonical project read.

Endpoints (all mounted at ``/api/projects``):

- ``POST /define``                              — name-only create at DoI 0.
- ``GET  /{project_id}/define``                 — full project read.
- ``PUT  /{project_id}/identity``               — Identity tab Save.
- ``PUT  /{project_id}/approval-milestones``    — Approval tab Save.
- ``PUT  /{project_id}/baseline-grid``          — Financials tab Save.

The Tech Navigator (``PUT /api/projects/{id}/tech-navigator``), milestone
CRUD (``/api/projects/{id}/milestones``), and pipeline GET endpoints are
reused as-is from their existing routers.

Authorization mirrors the Tech Navigator + Pipeline pattern:

- Controller: full access everywhere.
- Project Lead: only on their own projects (``pl_person_id`` match OR
  ``project.id`` in the persona's static seed list). 403 otherwise.
- Executive / CC Owner: writes are 403. Read (GET /define) is open to any
  authenticated role, but the PL filter still applies to PLs reading other
  PLs' projects.

The ``POST /api/intake/projects`` endpoint and the legacy intake flow are
deliberately untouched — they remain the canonical "submit-for-review"
path for the legacy popup.
"""

from __future__ import annotations

from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from config import DEMO_DATE
from database import get_db
from dependencies import get_current_user
from models.financial import Baseline, ExternalCostType
from models.organization import GroupingEntity, ProjectGroupingAssignment
from models.people import Person, RoleType
from models.projects import Project
from routers.admin import _log_audit
from schemas.common import CurrentUser
from schemas.projects_define import (
    BaselineGridResponse,
    BaselineGridResponseRow,
    BaselineGridRow,
    ProjectApprovalMilestonesUpdate,
    ProjectDefineCreate,
    ProjectDefineResponse,
    ProjectFinancialsResponse,
    ProjectFinancialsUpdate,
    ProjectIdentityUpdate,
)
from services.pipeline import (
    OFF_PATH_STAGES,
    is_transition_allowed,
    validate_doi_gate,
)
from services.tech_navigator import load_weights, recompute_project


router = APIRouter(prefix="/api/projects", tags=["Define (Project Workflow)"])


# ---------------------------------------------------------------------------
# Authorization helpers
# ---------------------------------------------------------------------------

def _is_pl_for_project(user: CurrentUser, project: Project) -> bool:
    """PL is allowed if assigned to the project or in their static seed list.

    Mirrors ``pl_project_filter`` semantics so dynamically-created and
    pre-seeded projects both resolve correctly.
    """
    if user.role != "project_lead":
        return False
    if project.pl_person_id == user.person_id:
        return True
    if project.id in user.project_ids:
        return True
    return False


def _can_edit_project(user: CurrentUser, project: Project) -> bool:
    """Edit gate shared by every write endpoint: controller or PL-on-own."""
    if user.role == "controller":
        return True
    return _is_pl_for_project(user, project)


def _can_read_project(user: CurrentUser, project: Project) -> bool:
    """Read gate for GET /define.

    Controllers / executives / CC owners: any project. PLs: only their own
    projects (matches the Workbench's PL filtering convention).
    """
    if user.role in ("controller", "executive", "cost_center_owner"):
        return True
    if user.role == "project_lead":
        return _is_pl_for_project(user, project)
    return False


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _gen_project_id() -> str:
    return f"proj-{uuid4().hex[:8]}"


def _resolve_lob_id(db: Session, project: Project) -> Optional[str]:
    """Return the first grouping-entity id mapped to this project.

    Several legacy seed paths pin the LoB to a ``ProjectGroupingAssignment``
    row keyed by LoB-typed grouping entity. Returning ``None`` when no
    assignment exists matches the create-with-name-only path.
    """
    assignment = (
        db.query(ProjectGroupingAssignment)
        .filter(ProjectGroupingAssignment.project_id == project.id)
        .order_by(ProjectGroupingAssignment.id.asc())
        .first()
    )
    return assignment.grouping_entity_id if assignment else None


def _assign_lob(db: Session, project: Project, lob_id: Optional[str]) -> None:
    """Idempotent LoB assignment.

    Deletes existing ``ProjectGroupingAssignment`` rows for the project and
    inserts a fresh one when ``lob_id`` is non-null. Passing ``None`` clears
    the assignment. Callers should flush before reading
    :func:`_resolve_lob_id` on the same project.
    """
    db.query(ProjectGroupingAssignment).filter(
        ProjectGroupingAssignment.project_id == project.id,
    ).delete(synchronize_session=False)
    if lob_id:
        # Validate the grouping entity exists to surface a clear 404 instead
        # of a downstream FK violation.
        ge = (
            db.query(GroupingEntity)
            .filter(GroupingEntity.id == lob_id)
            .first()
        )
        if not ge:
            raise HTTPException(
                status_code=422,
                detail=f"Unknown grouping entity (lob_id): {lob_id}",
            )
        db.add(ProjectGroupingAssignment(
            project_id=project.id,
            grouping_entity_id=lob_id,
        ))


def _build_response(db: Session, project: Project) -> ProjectDefineResponse:
    """Render the canonical Define-page response."""
    return ProjectDefineResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        status=project.status,
        capex_opex=project.capex_opex,
        start_month=project.start_month,
        end_month=project.end_month,
        pl_person_id=project.pl_person_id,
        is_service=project.is_service,
        project_type=project.project_type,
        transformation_level=project.transformation_level,
        total_budget=(
            float(project.total_budget)
            if project.total_budget is not None else None
        ),
        tshirt_size=project.tshirt_size,
        complexity_score=(
            float(project.complexity_score)
            if project.complexity_score is not None else None
        ),
        value_creation_score=(
            float(project.value_creation_score)
            if project.value_creation_score is not None else None
        ),
        composite_score=(
            float(project.composite_score)
            if project.composite_score is not None else None
        ),
        pipeline_stage=project.pipeline_stage,
        doi=project.doi,
        frozen_doi=project.frozen_doi,
        ai_council_approved=project.ai_council_approved,
        ai_council_doc_url=project.ai_council_doc_url,
        rag_status=project.rag_status,
        lob_id=_resolve_lob_id(db, project),
        # Structured pitch fields — for now only ``description`` is real; the
        # other two are reserved (always None) until the columns ship.
        problem_statement=project.description,
        business_driver=None,
        expected_outcome=None,
    )


def _project_or_404(db: Session, project_id: str) -> Project:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def _ensure_edit_authorized(user: CurrentUser, project: Project) -> None:
    """Raise 403 unless ``user`` is permitted to edit ``project``."""
    if not _can_edit_project(user, project):
        raise HTTPException(
            status_code=403,
            detail=(
                "Only controllers or the assigned project lead "
                "can edit this project."
            ),
        )


def _ensure_read_authorized(user: CurrentUser, project: Project) -> None:
    """Raise 403 unless ``user`` is permitted to read ``project``."""
    if not _can_read_project(user, project):
        raise HTTPException(
            status_code=403,
            detail=(
                "This project is not visible to your role/persona."
            ),
        )


# ---------------------------------------------------------------------------
# 1. POST /define — name-only create
# ---------------------------------------------------------------------------

@router.post(
    "/define",
    response_model=ProjectDefineResponse,
    status_code=201,
)
def create_define_project(
    body: ProjectDefineCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Create a project from name only (Define page entry point).

    The endpoint supplies defaults for every NOT-NULL column on the Project
    model — ``status='draft'``, ``capex_opex='opex'``,
    ``start_month=config.DEMO_DATE``, ``pipeline_stage='Proposed'``,
    ``doi=0``, ``ai_council_approved=False``, ``is_service=False`` — so a
    drafting PL can land on ``/define/{id}`` with just a name typed and
    iterate from there. ``project_type`` is already nullable on the model;
    no schema change is required.

    Authorization mirrors the intake flow: project_lead / controller /
    executive may create. CC owners get 403. PL on own: when
    ``pl_person_id`` is omitted and the caller is a Project Lead, the
    service substitutes ``current_user.person_id``.
    """
    if user.role not in ("project_lead", "controller", "executive"):
        raise HTTPException(
            status_code=403,
            detail=(
                f"Role '{user.role}' cannot create projects via the Define "
                "page. Allowed: project_lead, controller, executive."
            ),
        )

    pl_person_id = body.pl_person_id
    if pl_person_id is None and user.role == "project_lead":
        pl_person_id = user.person_id

    if pl_person_id is not None:
        # Surface a 422 instead of a downstream FK violation when the caller
        # passes an unknown person id (e.g. typo). Keep create path tolerant
        # when omitted altogether (un-assigned project is legitimate for
        # controller-created scaffolds).
        person = db.query(Person).filter(Person.id == pl_person_id).first()
        if not person:
            raise HTTPException(
                status_code=422,
                detail=f"Unknown pl_person_id: {pl_person_id}",
            )

    project = Project(
        id=_gen_project_id(),
        name=body.name,
        description=body.description,
        status="draft",
        capex_opex="opex",
        start_month=DEMO_DATE,
        end_month=None,
        pl_person_id=pl_person_id,
        is_service=False,
        project_type=None,
        pipeline_stage="Proposed",
        doi=0,
        ai_council_approved=False,
        within_cutoff=None,
        is_active=True,
    )
    db.add(project)
    db.flush()  # secure project.id before downstream rows

    if body.lob_id:
        _assign_lob(db, project, body.lob_id)

    _log_audit(
        db, user,
        entity_type="project",
        entity_id=project.id,
        entity_name=project.name,
        action="create",
        field_changed=None,
        old_value=None,
        new_value="DoI 0 / Proposed (define)",
        category="master_data",
    )

    db.commit()
    db.refresh(project)
    return _build_response(db, project)


# ---------------------------------------------------------------------------
# 2. GET /{id}/define — full project read
# ---------------------------------------------------------------------------

@router.get(
    "/{project_id}/define",
    response_model=ProjectDefineResponse,
)
def get_define_project(
    project_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Return the canonical Define-page payload for a project.

    Open to any authenticated user except PLs viewing other PLs' projects
    (those get 403 to match the Workbench filter behaviour).
    """
    project = _project_or_404(db, project_id)
    _ensure_read_authorized(user, project)
    return _build_response(db, project)


# ---------------------------------------------------------------------------
# 3. PUT /{id}/identity — Identity tab Save
# ---------------------------------------------------------------------------

_IDENTITY_AUDIT_FIELDS = (
    "name",
    "description",
    "project_type",
    "capex_opex",
    "pl_person_id",
    "start_month",
    "end_month",
    "is_service",
)


@router.put(
    "/{project_id}/identity",
    response_model=ProjectDefineResponse,
)
def update_identity(
    project_id: str,
    body: ProjectIdentityUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Patch the Identity-tab fields.

    Partial update — only fields in the request body are written. Each
    changed field emits an ``audit_log`` row under ``entity_type='project'``.
    Cross-field validation: ``end_month`` must be >= ``start_month`` when
    both are set (either pre-existing or in the patch).

    ``lob_id`` is handled separately — it lives on
    ``ProjectGroupingAssignment``, not on the Project row.
    """
    project = _project_or_404(db, project_id)
    _ensure_edit_authorized(user, project)

    payload = body.model_dump(exclude_unset=True)

    # Cross-field check: end_month >= start_month (using new values where
    # the patch supplies them, else the current row).
    new_start = payload.get("start_month", project.start_month)
    new_end = payload.get("end_month", project.end_month)
    if new_end is not None and new_start is not None and new_end < new_start:
        raise HTTPException(
            status_code=422,
            detail="end_month must be >= start_month",
        )

    # Validate FK-style values up front so we surface 422 rather than a
    # downstream IntegrityError on commit.
    if "pl_person_id" in payload and payload["pl_person_id"] is not None:
        person = (
            db.query(Person)
            .filter(Person.id == payload["pl_person_id"])
            .first()
        )
        if not person:
            raise HTTPException(
                status_code=422,
                detail=f"Unknown pl_person_id: {payload['pl_person_id']}",
            )

    for field_name in _IDENTITY_AUDIT_FIELDS:
        if field_name not in payload:
            continue
        new_value = payload[field_name]
        old_value = getattr(project, field_name)
        if old_value == new_value:
            continue
        setattr(project, field_name, new_value)
        _log_audit(
            db, user,
            entity_type="project",
            entity_id=project.id,
            entity_name=project.name,
            action="update",
            field_changed=field_name,
            old_value=str(old_value) if old_value is not None else None,
            new_value=str(new_value) if new_value is not None else None,
            category="master_data",
        )

    if "lob_id" in payload:
        old_lob = _resolve_lob_id(db, project)
        new_lob = payload["lob_id"]
        if old_lob != new_lob:
            _assign_lob(db, project, new_lob)
            _log_audit(
                db, user,
                entity_type="project",
                entity_id=project.id,
                entity_name=project.name,
                action="update",
                field_changed="lob_id",
                old_value=old_lob,
                new_value=new_lob,
                category="master_data",
            )

    db.commit()
    db.refresh(project)
    return _build_response(db, project)


# ---------------------------------------------------------------------------
# 4. PUT /{id}/approval-milestones — Approval & Milestones tab Save
# ---------------------------------------------------------------------------

_APPROVAL_AUDIT_FIELDS = (
    "ai_council_approved",
    "ai_council_doc_url",
    "transformation_level",
)


def _apply_doi_advance(
    db: Session,
    project: Project,
    user: CurrentUser,
    target_doi: int,
    override_reason: Optional[str],
) -> None:
    """Validate and apply a forward DoI advance during the approval Save.

    Mirrors the gate logic in ``routers/pipeline.py::transition_pipeline``
    but is scoped to forward moves only (the Approval tab cannot rewind
    DoI; backward moves continue to flow through the pipeline router).

    - PLs may target DoI <= 2 only (mirrors ``_can_modify_pipeline`` in the
      pipeline router).
    - Forward moves that fail :func:`validate_doi_gate` without an
      ``override_reason`` raise 409 with the missing-field list.
    - The new stage is derived from the new DoI via :func:`doi_for_stage`
      so the project's pipeline_stage column stays consistent.
    """
    current_doi = project.doi if project.doi is not None else 0
    if target_doi < current_doi:
        raise HTTPException(
            status_code=400,
            detail=(
                "approval-milestones cannot rewind DoI; use the pipeline "
                "transition endpoint for backward moves."
            ),
        )
    if target_doi == current_doi:
        return  # No-op forward move.

    # Authorization: PL forward limit is DoI 2.
    if user.role == "project_lead" and target_doi > 2:
        raise HTTPException(
            status_code=403,
            detail=(
                "Project Leads can advance their project up to DoI 2 only. "
                "DoI 3+ requires controller approval."
            ),
        )

    # Gate validation (unless controller override).
    missing: list[str] = []
    if not override_reason:
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

    # Map DoI -> stage. DoI 0 = Proposed, DoI 1/2 = Under Evaluation,
    # DoI 3 = Approved (default; controllers may transition to Active via
    # the pipeline router), DoI 4/5 = Active (matches doi_for_stage's
    # reverse mapping).
    target_stage_by_doi = {
        0: "Proposed",
        1: "Under Evaluation",
        2: "Under Evaluation",
        3: "Approved",
        4: "Active",
        5: "Active",
    }
    target_stage = target_stage_by_doi.get(target_doi, project.pipeline_stage)

    # Validate the stage transition (the graph may already accept it; for
    # same-stage forward DoI we skip the edge check).
    if target_stage != project.pipeline_stage:
        ok, err = is_transition_allowed(
            project.pipeline_stage, target_stage, override_reason,
        )
        if not ok:
            raise HTTPException(status_code=409, detail=err)

    old_stage = project.pipeline_stage
    old_doi = project.doi

    project.pipeline_stage = target_stage
    project.doi = target_doi
    if target_stage in OFF_PATH_STAGES:
        # Unreachable via the DoI-mapping above, but keep the frozen_doi
        # bookkeeping consistent with the pipeline router.
        if project.doi is not None and project.frozen_doi != project.doi:
            project.frozen_doi = project.doi
        project.doi = None

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
    if override_reason:
        _log_audit(
            db, user,
            entity_type="pipeline",
            entity_id=project.id,
            entity_name=project.name,
            action="override",
            field_changed="doi",
            old_value=str(old_doi) if old_doi is not None else None,
            new_value=(
                f"{project.doi} (reason: {override_reason})"
            ),
            category="pipeline_transitions",
        )


@router.put(
    "/{project_id}/approval-milestones",
    response_model=ProjectDefineResponse,
)
def update_approval_milestones(
    project_id: str,
    body: ProjectApprovalMilestonesUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Bundle Save for the Approval & Milestones tab.

    Applies AI Council screening + transformation level + optional DoI
    advance in one round trip. Milestone CRUD continues to flow through
    the dedicated ``/api/projects/{id}/milestones`` router.

    Errors:
    - 404 unknown project.
    - 403 unauthorized (PL on other PL's project, or PL trying to advance
      to DoI > 2).
    - 409 ``doi_gate_unmet`` when ``advance_to_doi`` set but the gate
      fails and no override is supplied.
    """
    project = _project_or_404(db, project_id)
    _ensure_edit_authorized(user, project)

    payload = body.model_dump(exclude_unset=True)

    for field_name in _APPROVAL_AUDIT_FIELDS:
        if field_name not in payload:
            continue
        new_value = payload[field_name]
        old_value = getattr(project, field_name)
        if old_value == new_value:
            continue
        setattr(project, field_name, new_value)
        # AI Council and transformation level changes are pipeline-adjacent
        # — they unlock DoI gates — so we tag them under pipeline_transitions
        # to mirror the dedicated AI-Council endpoint's audit category.
        category = (
            "pipeline_transitions"
            if field_name in ("ai_council_approved", "ai_council_doc_url")
            else "master_data"
        )
        _log_audit(
            db, user,
            entity_type=(
                "ai_council"
                if field_name in ("ai_council_approved", "ai_council_doc_url")
                else "project"
            ),
            entity_id=project.id,
            entity_name=project.name,
            action="update",
            field_changed=field_name,
            old_value=str(old_value) if old_value is not None else None,
            new_value=str(new_value) if new_value is not None else None,
            category=category,
        )

    # Recompute Tech-Navigator-derived scores if transformation_level moved
    # (it's a composite-score input). load_weights is cheap.
    if "transformation_level" in payload:
        weights = load_weights(db)
        recompute_project(project, weights)

    if "advance_to_doi" in payload and payload["advance_to_doi"] is not None:
        _apply_doi_advance(
            db, project, user,
            target_doi=int(payload["advance_to_doi"]),
            override_reason=payload.get("override_reason"),
        )

    db.commit()
    db.refresh(project)
    return _build_response(db, project)


# ---------------------------------------------------------------------------
# 5. PUT /{id}/baseline-grid — Financials tab Save
# ---------------------------------------------------------------------------

def _validate_sub_category(
    db: Session, category: str, sub_category: str,
) -> None:
    """Surface a 422 with a clear message when sub_category is unknown.

    Internal rows must reference ``role_types.id``; external rows must
    reference ``external_cost_types.id``. Anything else is a typo.
    """
    if category == "internal":
        role = db.query(RoleType).filter(RoleType.id == sub_category).first()
        if not role:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Unknown role_type_id for internal baseline row: "
                    f"{sub_category}"
                ),
            )
    else:  # external
        ct = (
            db.query(ExternalCostType)
            .filter(ExternalCostType.id == sub_category)
            .first()
        )
        if not ct:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Unknown external_cost_type_id for external baseline "
                    f"row: {sub_category}"
                ),
            )


def _resolve_sub_category_name(
    db: Session, category: str, sub_category: str,
) -> Optional[str]:
    """Return the display name for a (category, sub_category) pair."""
    if category == "internal":
        row = db.query(RoleType).filter(RoleType.id == sub_category).first()
        return row.name if row else None
    row = (
        db.query(ExternalCostType)
        .filter(ExternalCostType.id == sub_category)
        .first()
    )
    return row.name if row else None


def _build_baseline_grid_response(
    db: Session, project: Project,
) -> BaselineGridResponse:
    """Pivot Baseline rows into ``(category, sub_category)`` row groups."""
    rows = (
        db.query(Baseline)
        .filter(Baseline.project_id == project.id)
        .order_by(Baseline.category, Baseline.sub_category, Baseline.month)
        .all()
    )
    grouped: dict[tuple[str, str], dict] = {}
    for r in rows:
        key = (r.category, r.sub_category)
        if key not in grouped:
            grouped[key] = {
                "category": r.category,
                "sub_category": r.sub_category,
                "sub_category_name": _resolve_sub_category_name(
                    db, r.category, r.sub_category,
                ),
                "capex_opex": r.capex_opex,
                "description": r.description,
                "vendor": r.vendor,
                "role_type_id": r.role_type_id,
                "months": [],
            }
        grouped[key]["months"].append({
            "month": r.month,
            "amount_eur": float(r.amount_eur),
            "hours": float(r.hours) if r.hours is not None else None,
        })

    items = [BaselineGridResponseRow(**g) for g in grouped.values()]
    return BaselineGridResponse(items=items, total=len(items))


def _replace_baseline_rows(
    db: Session,
    project: Project,
    rows: list[BaselineGridRow],
) -> None:
    """Delete-then-insert the Baseline rows for each (category, sub_category)
    pair present in ``rows``. Pairs not in the payload are untouched.

    The grid Save is conservative — the client always sends the full set
    of months it wants for a given row. Backend deletes existing rows for
    each (category, sub_category) pair, then re-inserts from the payload.
    """
    for row in rows:
        _validate_sub_category(db, row.category, row.sub_category)
        db.query(Baseline).filter(
            Baseline.project_id == project.id,
            Baseline.category == row.category,
            Baseline.sub_category == row.sub_category,
        ).delete(synchronize_session=False)

        for cell in row.months:
            baseline = Baseline(
                project_id=project.id,
                month=cell.month,
                category=row.category,
                sub_category=row.sub_category,
                hours=cell.hours,
                amount_eur=cell.amount_eur,
                capex_opex=row.capex_opex or project.capex_opex,
                description=row.description,
                vendor=row.vendor,
                role_type_id=row.role_type_id,
            )
            db.add(baseline)


@router.put(
    "/{project_id}/baseline-grid",
    response_model=ProjectFinancialsResponse,
)
def update_baseline_grid(
    project_id: str,
    body: ProjectFinancialsUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Save the Financials tab — Quick Sizing block + optional baseline grid.

    Both surfaces are optional. The Quick Sizing block (``total_budget`` +
    ``capex_opex``) writes directly to the Project row and triggers a
    Tech-Navigator recompute (``tshirt_size`` is derived from
    ``total_budget``). The baseline grid (``rows``) does a delete-then-
    insert per (category, sub_category) pair the client supplies; pairs
    not in the payload are left untouched.

    Returns the refreshed project AND the hydrated baseline grid so the
    frontend can re-render without a second round trip.
    """
    project = _project_or_404(db, project_id)
    _ensure_edit_authorized(user, project)

    payload = body.model_dump(exclude_unset=True)

    # 1. Quick-sizing block.
    if "total_budget" in payload:
        old_value = (
            float(project.total_budget)
            if project.total_budget is not None else None
        )
        new_value = payload["total_budget"]
        if old_value != new_value:
            project.total_budget = new_value
            _log_audit(
                db, user,
                entity_type="project",
                entity_id=project.id,
                entity_name=project.name,
                action="update",
                field_changed="total_budget",
                old_value=str(old_value) if old_value is not None else None,
                new_value=str(new_value) if new_value is not None else None,
                category="master_data",
            )

    if "capex_opex" in payload and payload["capex_opex"] is not None:
        old_value = project.capex_opex
        new_value = payload["capex_opex"]
        if old_value != new_value:
            project.capex_opex = new_value
            _log_audit(
                db, user,
                entity_type="project",
                entity_id=project.id,
                entity_name=project.name,
                action="update",
                field_changed="capex_opex",
                old_value=old_value,
                new_value=new_value,
                category="master_data",
            )

    # 2. Baseline grid rows (delete-then-insert per category, sub_category).
    if body.rows is not None:
        _replace_baseline_rows(db, project, body.rows)

    # 3. Recompute Tech-Navigator-derived scores (tshirt_size depends on
    # total_budget; composite recompute is cheap).
    weights = load_weights(db)
    recompute_project(project, weights)

    db.commit()
    db.refresh(project)

    return ProjectFinancialsResponse(
        project=_build_response(db, project),
        baseline_rows=_build_baseline_grid_response(db, project),
    )
