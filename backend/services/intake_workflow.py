"""v5 intake workflow service [A-BK-26..A-BK-29] [A-PS-13] [A-DOI-04..A-DOI-05].

Encodes the greenfield intake workflow that replaces the v4 intake queue:

1. ``create_intake_project`` — admit a new project at DoI 0 (Proposed) with
   only the lightweight metadata required by [A-DOI-04]. Returns the
   ORM ``Project`` row; the router commits.
2. ``approve_intake_project`` — controller-only "Approve (Pitch Board)"
   per [A-BK-27]. Transitions ``Under Evaluation -> Approved (DoI 3)``.
3. ``send_back_intake_project`` — controller-only "Send Back" per
   [A-BK-27]/[A-BK-29]. Returns the project to ``Proposed (DoI 1)`` with
   the controller's comments persisted on ``Project.submission_feedback``
   and a ``ProjectSubmissionSnapshot`` row of type ``controller_sent_back``
   captured for the diff view.
4. ``reject_intake_project`` — controller-only "Reject" per [A-BK-27]. Moves
   the project to ``Cancelled``, freezing the live DoI per [A-PS-03], and
   stores the reason on ``submission_feedback``.
5. ``resubmit_intake_project`` — PL-driven "Resubmit" after Send Back per
   [A-BK-29]. Captures a ``pl_resubmitted`` snapshot and moves the project
   back to ``Under Evaluation (DoI 2)``.
6. ``compute_intake_diff`` — assembles the structured diff payload that
   drives the before/after view per [A-BK-29].

All mutations call ``_log_audit`` with the appropriate D2 category:
- ``master_data`` for project create.
- ``pipeline_transitions`` for stage / DoI movements.

The service does NOT call ``db.commit()`` itself; the router owns the
transaction boundary so multiple operations can compose. Each mutating
helper does call ``db.flush()`` where needed so subsequent reads in the
same call see uncommitted state (matches the existing convention in the
v4 launchpad helpers).
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Optional
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models.financial import Baseline, Forecast
from models.organization import ProjectGroupingAssignment
from models.projects import Project, ProjectMilestone
from models.submissions import ProjectSubmissionSnapshot
from models.system import Notification
from routers.admin import _log_audit
from services.chargeable_entity import ensure_project_chargeable_entity
from schemas.common import CurrentUser
from schemas.intake import (
    IntakeDiffField,
    IntakeDiffResponse,
    IntakeProjectCreate,
)


# ---------------------------------------------------------------------------
# Pipeline state constants for v5 intake (mirror services/pipeline.py)
# ---------------------------------------------------------------------------

# Stages that anchor the controller review queue per [A-BK-26].
UNDER_EVALUATION = "Under Evaluation"
PROPOSED = "Proposed"
APPROVED = "Approved"
CANCELLED = "Cancelled"

# Snapshot types used by the intake workflow. Reused from
# ``ProjectSubmissionSnapshot`` for diff view per [A-BK-29].
SNAPSHOT_CONTROLLER_SENT_BACK = "controller_sent_back"
SNAPSHOT_PL_RESUBMITTED = "pl_resubmitted"


# ---------------------------------------------------------------------------
# Diffable field map. Each entry: (attribute, human label).
# Used by both the snapshot capture (to store the before/after payload) and
# the diff computation (to render rows). Keep label text aligned with the
# Tech Navigator UI from A1 — frontend will reuse the same vocabulary.
# ---------------------------------------------------------------------------

DIFFABLE_FIELDS: list[tuple[str, str]] = [
    ("name", "Project name"),
    ("description", "Description"),
    ("project_type", "Project type"),
    ("transformation_level", "Transformation level"),
    ("capex_opex", "CapEx/OpEx"),
    ("start_month", "Start month"),
    ("end_month", "End month"),
    ("total_budget", "Total budget (EUR)"),
    ("tshirt_size", "Budget t-shirt"),
    ("composite_score", "Composite score"),
    ("complexity_score", "Complexity score"),
    ("value_creation_score", "Value creation score"),
    ("tn_standardization", "TN: Standardization"),
    ("tn_usage", "TN: Usage"),
    ("tn_maintenance", "TN: Maintenance"),
    ("tn_financial_benefit", "TN: Financial benefit"),
    ("tn_payback", "TN: Payback"),
    ("tn_competitive_advantage", "TN: Competitive advantage"),
    ("ai_council_approved", "AI Council approved"),
    ("ai_council_doc_url", "AI Council doc URL"),
    ("milestone_count", "Milestone count"),
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _gen_project_id() -> str:
    return f"proj-{uuid4().hex[:8]}"


def _stringify(value: Any) -> Optional[str]:
    """Render a model value as a string for the diff payload.

    Returns None for None/empty so the UI can show an empty cell. Booleans
    become ``"true"`` / ``"false"``; numerics use ``str(...)`` to preserve
    integer vs decimal display.
    """
    if value is None:
        return None
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    return str(value)


def _project_state_dict(project: Project, db: Session) -> dict[str, Optional[str]]:
    """Capture the diffable subset of the project's current state.

    Includes the milestone count as a derived field — useful for the diff
    view because PLs commonly add milestones during a Send Back revision.
    """
    state: dict[str, Optional[str]] = {}
    for attr, _label in DIFFABLE_FIELDS:
        if attr == "milestone_count":
            count = (
                db.query(ProjectMilestone)
                .filter(ProjectMilestone.project_id == project.id)
                .count()
            )
            state[attr] = str(count)
        else:
            state[attr] = _stringify(getattr(project, attr, None))
    return state


def _capture_intake_snapshot(
    db: Session,
    project: Project,
    snapshot_type: str,
    user: CurrentUser,
    comments: Optional[str] = None,
) -> ProjectSubmissionSnapshot:
    """Persist a project-state snapshot for diff computation.

    Reuses ``ProjectSubmissionSnapshot`` rather than a new table — the row's
    ``snapshot_type`` is the discriminator. Previous snapshots of the same
    type are deactivated (set ``is_active=False``) so only the latest is
    surfaced by the diff endpoint. The state dict is JSON-encoded and stored
    in ``forecast_data_json`` (the column name is a v4 vestige; we put the
    full state JSON there).
    """
    db.query(ProjectSubmissionSnapshot).filter(
        ProjectSubmissionSnapshot.project_id == project.id,
        ProjectSubmissionSnapshot.snapshot_type == snapshot_type,
        ProjectSubmissionSnapshot.is_active.is_(True),
    ).update({"is_active": False})

    state = _project_state_dict(project, db)
    snap = ProjectSubmissionSnapshot(
        project_id=project.id,
        snapshot_type=snapshot_type,
        created_by_id=user.person_id,
        forecast_data_json=json.dumps(state),
        comments=comments,
    )
    db.add(snap)
    db.flush()
    return snap


def _trigger_within_cutoff_recompute(db: Session) -> None:
    """Best-effort within_cutoff recompute hook per [A-BK-14].

    Wrapped in try/except so a recompute failure cannot mask the parent
    transaction's success. Mirrors the pattern already used by
    ``routers/portfolio.py::approve_project``.
    """
    try:
        from services.ranking import recompute_within_cutoff_for_backlog
        recompute_within_cutoff_for_backlog(db)
    except Exception:  # noqa: BLE001 — defensive: trigger best-effort.
        db.rollback()


def _notify(
    db: Session,
    person_id: str,
    message: str,
    *,
    severity: str = "action",
    module: str = "portfolio",
    entity_id: Optional[str] = None,
    tab: Optional[str] = None,
) -> None:
    """Append a Notification row. Caller commits."""
    notif = Notification(
        user_person_id=person_id,
        message=message,
        severity=severity,
        deep_link_module=module,
        deep_link_entity_id=entity_id,
        deep_link_tab=tab,
    )
    db.add(notif)


# ---------------------------------------------------------------------------
# 1. Create project at DoI 0 (Proposed)
# ---------------------------------------------------------------------------

def create_intake_project(
    db: Session,
    body: IntakeProjectCreate,
    user: CurrentUser,
) -> Project:
    """Admit a new project at DoI 0 per [A-BK-26] / [A-DOI-04].

    Sets ``pipeline_stage='Proposed'``, ``doi=0``, ``status='draft'`` (back-
    compat for v4 modules that still query ``Project.status``). Composite
    score is left null — A3's ranking engine slots null-score projects at
    the bottom of the list per [A-BK-26]. The within_cutoff recompute is
    triggered as a best-effort post-commit hook by the router.

    PL on own: ``pl_person_id`` defaults to ``user.person_id`` if not given.
    Controllers must pass ``pl_person_id`` explicitly when creating on
    behalf of a PL — leaving it null on a controller-driven create stores
    the project as un-assigned (legitimate for some demo scenarios).

    Raises :class:`HTTPException` 422 on validation failures that Pydantic
    cannot catch (e.g. ``end_month`` earlier than ``start_month``).
    """
    if body.end_month is not None and body.end_month < body.start_month:
        raise HTTPException(
            status_code=422,
            detail="end_month must be >= start_month",
        )

    pl_person_id = body.pl_person_id
    if pl_person_id is None and user.role == "project_lead":
        pl_person_id = user.person_id

    project = Project(
        id=_gen_project_id(),
        name=body.name,
        description=body.description,
        status="draft",  # back-compat with v4 launchpad / workbench filters
        capex_opex=body.capex_opex,
        start_month=body.start_month,
        end_month=body.end_month,
        pl_person_id=pl_person_id,
        is_service=body.is_service,
        project_type=body.project_type,
        pipeline_stage=PROPOSED,
        doi=0,
        ai_council_approved=False,
        within_cutoff=None,
        is_active=True,
    )
    db.add(project)
    db.flush()  # secure project.id before assignment row

    # LoB / hierarchy assignment — required input.
    assignment = ProjectGroupingAssignment(
        project_id=project.id,
        grouping_entity_id=body.lob_id,
    )
    db.add(assignment)

    # Mint the 1:1 ChargeableEntity so the intake project surfaces in the
    # Workbench / Charging / rollup modules like seeded projects do.
    ensure_project_chargeable_entity(
        db, project, hierarchy_node_id=body.lob_id,
    )

    _log_audit(
        db, user,
        entity_type="project",
        entity_id=project.id,
        entity_name=project.name,
        action="create",
        field_changed=None,
        old_value=None,
        new_value=f"DoI 0 / Proposed (intake)",
        category="master_data",
    )

    return project


# ---------------------------------------------------------------------------
# 2. Approve from Under Evaluation
# ---------------------------------------------------------------------------

def _generate_baseline_from_forecast(db: Session, project: Project) -> None:
    """Generate baseline rows from existing forecast at approval time.

    No-op when the project has no forecast rows yet. Mirrors the v4 logic
    in ``routers/portfolio.py::approve_project`` so the post-approval grid
    behaves identically.
    """
    forecasts = (
        db.query(Forecast)
        .filter(Forecast.project_id == project.id)
        .all()
    )
    if not forecasts:
        return

    for f in forecasts:
        baseline = Baseline(
            project_id=f.project_id,
            month=f.month,
            category=f.category,
            sub_category=f.sub_category,
            hours=f.hours,
            amount_eur=f.amount_eur,
            capex_opex=f.capex_opex,
        )
        db.add(baseline)

    total = sum(float(f.amount_eur or 0) for f in forecasts)
    if total > 0 and not project.total_budget:
        project.total_budget = round(total, 2)


def approve_intake_project(
    db: Session,
    project: Project,
    user: CurrentUser,
    comments: Optional[str] = None,
) -> Project:
    """Controller-only Approve from Under Evaluation per [A-BK-27].

    Side effects:

    - ``pipeline_stage = 'Approved'``, ``doi = 3``, ``status = 'active'``
      (back-compat) and ``rag_status`` defaulted to green when null.
    - Baseline rows generated from any existing forecast (no-op if empty).
    - Notification to PL with deep link to workbench.
    - Audit row under ``category='pipeline_transitions'``.

    Raises 409 when the project is not in ``Under Evaluation``.
    """
    if project.pipeline_stage != UNDER_EVALUATION:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Project pipeline_stage is '{project.pipeline_stage}', "
                f"expected '{UNDER_EVALUATION}'."
            ),
        )

    # === F3 hook: BTC gate per [A-PL-06] ===
    # Inserted here with local imports to keep the A5 file's import-block diff at zero.
    from models.charging import ChargeableEntity  # local import — avoids cross-module cycle
    from services.btc_service import BTCValidationError, assert_btc_required  # local import
    ce = db.query(ChargeableEntity).filter_by(project_id=project.id).first()
    if ce is not None and float(ce.to_business_pct or 0) > 0:
        try:
            assert_btc_required(db, ce.id, 2026)  # demo year hardcoded per CLAUDE.md
        except BTCValidationError as _btc_err:
            raise HTTPException(status_code=409, detail=_btc_err.message)
    # === end F3 hook ===

    old_stage = project.pipeline_stage
    old_doi = project.doi
    old_status = project.status

    project.pipeline_stage = APPROVED
    project.doi = 3
    project.status = "active"
    if project.rag_status is None:
        project.rag_status = "green"

    # Clear any prior send-back feedback once approved.
    project.submission_feedback = None

    _generate_baseline_from_forecast(db, project)

    _log_audit(
        db, user,
        entity_type="pipeline",
        entity_id=project.id,
        entity_name=project.name,
        action="approve",
        field_changed="pipeline_stage",
        old_value=old_stage,
        new_value=APPROVED,
        category="pipeline_transitions",
    )
    _log_audit(
        db, user,
        entity_type="pipeline",
        entity_id=project.id,
        entity_name=project.name,
        action="approve",
        field_changed="doi",
        old_value=str(old_doi) if old_doi is not None else None,
        new_value="3",
        category="pipeline_transitions",
    )
    if comments:
        _log_audit(
            db, user,
            entity_type="pipeline",
            entity_id=project.id,
            entity_name=project.name,
            action="approve",
            field_changed="comments",
            old_value=None,
            new_value=comments,
            category="pipeline_transitions",
        )

    if project.pl_person_id:
        _notify(
            db, project.pl_person_id,
            f"Project '{project.name}' approved at Pitch Board.",
            severity="info",
            module="workbench",
            entity_id=project.id,
        )

    return project


# ---------------------------------------------------------------------------
# 3. Send Back from Under Evaluation
# ---------------------------------------------------------------------------

def send_back_intake_project(
    db: Session,
    project: Project,
    user: CurrentUser,
    comments: str,
) -> Project:
    """Controller-only Send Back per [A-BK-27] / [A-BK-29].

    Side effects:

    - ``pipeline_stage = 'Proposed'``, ``doi = 1``.
    - ``submission_feedback = comments`` so the project card surfaces "why".
    - ``status = 'changes_requested'`` (back-compat for v4 modules).
    - ``ProjectSubmissionSnapshot`` of type ``controller_sent_back`` is
      captured at the *current* state — that's the "before" half of the
      diff view per [A-BK-29].
    - Notification to PL with deep link to workbench.
    - Audit rows under ``category='pipeline_transitions'``.

    Raises 409 when the project is not in ``Under Evaluation``.
    """
    if project.pipeline_stage != UNDER_EVALUATION:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Project pipeline_stage is '{project.pipeline_stage}', "
                f"expected '{UNDER_EVALUATION}'."
            ),
        )

    # Snapshot BEFORE mutating fields — the snapshot must capture the state
    # the controller saw at the moment of Send Back.
    _capture_intake_snapshot(
        db, project, SNAPSHOT_CONTROLLER_SENT_BACK, user, comments=comments,
    )

    old_stage = project.pipeline_stage
    old_doi = project.doi

    project.pipeline_stage = PROPOSED
    project.doi = 1
    project.status = "changes_requested"
    project.submission_feedback = comments

    _log_audit(
        db, user,
        entity_type="pipeline",
        entity_id=project.id,
        entity_name=project.name,
        action="send_back",
        field_changed="pipeline_stage",
        old_value=old_stage,
        new_value=PROPOSED,
        category="pipeline_transitions",
    )
    _log_audit(
        db, user,
        entity_type="pipeline",
        entity_id=project.id,
        entity_name=project.name,
        action="send_back",
        field_changed="doi",
        old_value=str(old_doi) if old_doi is not None else None,
        new_value="1",
        category="pipeline_transitions",
    )
    _log_audit(
        db, user,
        entity_type="pipeline",
        entity_id=project.id,
        entity_name=project.name,
        action="send_back",
        field_changed="comments",
        old_value=None,
        new_value=comments,
        category="pipeline_transitions",
    )

    if project.pl_person_id:
        _notify(
            db, project.pl_person_id,
            f"Project '{project.name}' sent back: {comments[:80]}",
            severity="action",
            module="workbench",
            entity_id=project.id,
            tab="diff",
        )

    return project


# ---------------------------------------------------------------------------
# 4. Reject from Under Evaluation
# ---------------------------------------------------------------------------

def reject_intake_project(
    db: Session,
    project: Project,
    user: CurrentUser,
    reason: str,
) -> Project:
    """Controller-only Reject per [A-BK-27].

    Cancellation is "nearly one-way" per [A-PS-10] — un-cancel requires the
    explicit ``override_reason`` path on the existing pipeline endpoint.
    Side effects:

    - ``pipeline_stage = 'Cancelled'``. ``frozen_doi`` captures the current
      ``doi`` per [A-PS-03] before clearing the live DoI.
    - ``status = 'rejected'`` (back-compat).
    - ``submission_feedback = reason`` so the rejected card surfaces why.
    - Notification to PL.

    Raises 409 when the project is not in ``Under Evaluation``.
    """
    if project.pipeline_stage != UNDER_EVALUATION:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Project pipeline_stage is '{project.pipeline_stage}', "
                f"expected '{UNDER_EVALUATION}'."
            ),
        )

    old_stage = project.pipeline_stage
    old_doi = project.doi

    project.pipeline_stage = CANCELLED
    if project.doi is not None:
        project.frozen_doi = project.doi
    project.doi = None
    project.status = "rejected"
    project.submission_feedback = reason
    project.within_cutoff = None

    _log_audit(
        db, user,
        entity_type="pipeline",
        entity_id=project.id,
        entity_name=project.name,
        action="reject",
        field_changed="pipeline_stage",
        old_value=old_stage,
        new_value=CANCELLED,
        category="pipeline_transitions",
    )
    _log_audit(
        db, user,
        entity_type="pipeline",
        entity_id=project.id,
        entity_name=project.name,
        action="reject",
        field_changed="frozen_doi",
        old_value=None,
        new_value=str(old_doi) if old_doi is not None else None,
        category="pipeline_transitions",
    )
    _log_audit(
        db, user,
        entity_type="pipeline",
        entity_id=project.id,
        entity_name=project.name,
        action="reject",
        field_changed="reason",
        old_value=None,
        new_value=reason,
        category="pipeline_transitions",
    )

    if project.pl_person_id:
        _notify(
            db, project.pl_person_id,
            f"Project '{project.name}' rejected: {reason[:80]}",
            severity="action",
            module="portfolio",
            entity_id=project.id,
        )

    return project


# ---------------------------------------------------------------------------
# 5. Resubmit (PL-driven, after Send Back)
# ---------------------------------------------------------------------------

def resubmit_intake_project(
    db: Session,
    project: Project,
    user: CurrentUser,
    notes: Optional[str] = None,
) -> Project:
    """PL Resubmit after Send Back per [A-BK-29].

    Validates that the project is in the sent-back state (``Proposed`` with
    ``submission_feedback`` non-null and ``status='changes_requested'``).
    Side effects:

    - Captures a ``pl_resubmitted`` snapshot of the project's *current* state
      — that's the "after" half of the diff view.
    - ``pipeline_stage = 'Under Evaluation'``, ``doi = 2``,
      ``status = 'pending_approval'`` (back-compat).
    - ``submission_feedback`` cleared.
    - Notification to controller persona ``persona-controller`` (or any
      caller of the PL's choice — for v5 we keep the convention used in v4
      launchpad).
    - Audit rows under ``category='pipeline_transitions'``.

    Raises 409 when the project is not in the sent-back state.
    """
    is_sent_back = (
        project.pipeline_stage == PROPOSED
        and project.submission_feedback is not None
    )
    if not is_sent_back:
        raise HTTPException(
            status_code=409,
            detail=(
                "Project is not in a sent-back state. Resubmit requires "
                f"pipeline_stage='{PROPOSED}' AND submission_feedback set."
            ),
        )

    # Capture snapshot BEFORE mutating — the resubmission snapshot is the
    # PL's "this is what I changed since you sent it back" view.
    _capture_intake_snapshot(
        db, project, SNAPSHOT_PL_RESUBMITTED, user, comments=notes,
    )

    old_stage = project.pipeline_stage
    old_doi = project.doi

    project.pipeline_stage = UNDER_EVALUATION
    project.doi = 2
    project.status = "pending_approval"
    project.submission_feedback = None

    _log_audit(
        db, user,
        entity_type="pipeline",
        entity_id=project.id,
        entity_name=project.name,
        action="resubmit",
        field_changed="pipeline_stage",
        old_value=old_stage,
        new_value=UNDER_EVALUATION,
        category="pipeline_transitions",
    )
    _log_audit(
        db, user,
        entity_type="pipeline",
        entity_id=project.id,
        entity_name=project.name,
        action="resubmit",
        field_changed="doi",
        old_value=str(old_doi) if old_doi is not None else None,
        new_value="2",
        category="pipeline_transitions",
    )
    if notes:
        _log_audit(
            db, user,
            entity_type="pipeline",
            entity_id=project.id,
            entity_name=project.name,
            action="resubmit",
            field_changed="resubmission_notes",
            old_value=None,
            new_value=notes,
            category="pipeline_transitions",
        )

    # Notify any active controller persona — lookup by role to avoid a
    # hardcoded persona ID (D1 added a User table; for v5-stage demos the
    # legacy DemoPersona table still drives notifications).
    from models.users import DemoPersona  # local import to avoid cycle
    controller_personas = (
        db.query(DemoPersona)
        .filter(DemoPersona.role == "controller")
        .all()
    )
    msg = (
        f"Project '{project.name}' resubmitted by {user.name} for review."
        if notes is None
        else f"Project '{project.name}' resubmitted: {notes[:80]}"
    )
    for cp in controller_personas:
        if cp.person_id:
            _notify(
                db, cp.person_id, msg,
                severity="action",
                module="portfolio",
                entity_id=project.id,
            )

    return project


# ---------------------------------------------------------------------------
# 6. Diff view computation
# ---------------------------------------------------------------------------

@dataclass
class _SnapshotPair:
    before: Optional[ProjectSubmissionSnapshot]
    after: Optional[ProjectSubmissionSnapshot]


def _load_snapshot_pair(db: Session, project: Project) -> _SnapshotPair:
    """Find the most recent ``controller_sent_back`` and ``pl_resubmitted``
    snapshots, or None if absent. Active flag respected.
    """
    before = (
        db.query(ProjectSubmissionSnapshot)
        .filter(
            ProjectSubmissionSnapshot.project_id == project.id,
            ProjectSubmissionSnapshot.snapshot_type == SNAPSHOT_CONTROLLER_SENT_BACK,
            ProjectSubmissionSnapshot.is_active.is_(True),
        )
        .order_by(ProjectSubmissionSnapshot.created_at.desc())
        .first()
    )
    after = (
        db.query(ProjectSubmissionSnapshot)
        .filter(
            ProjectSubmissionSnapshot.project_id == project.id,
            ProjectSubmissionSnapshot.snapshot_type == SNAPSHOT_PL_RESUBMITTED,
            ProjectSubmissionSnapshot.is_active.is_(True),
        )
        .order_by(ProjectSubmissionSnapshot.created_at.desc())
        .first()
    )
    return _SnapshotPair(before=before, after=after)


def compute_intake_diff(
    db: Session,
    project: Project,
    diff_type: str = "resubmit",
) -> IntakeDiffResponse:
    """Build the structured before/after diff per [A-BK-29].

    ``diff_type`` controls what the "after" side is:

    - ``"resubmit"`` (default) — compare ``controller_sent_back`` snapshot
      against ``pl_resubmitted`` snapshot. If only the sent-back snapshot
      exists, fall back to the project's current state (the PL has
      modified state but not yet pressed Resubmit).
    - ``"current"`` — compare the sent-back snapshot against the project's
      current live state explicitly. Useful for the controller's "preview
      edits in flight" view.

    Returns 404 (raised by the router) if no sent-back snapshot exists at
    all — the project has never been sent back, so there is nothing to
    diff.
    """
    if diff_type not in ("resubmit", "current"):
        raise HTTPException(
            status_code=422,
            detail="diff_type must be 'resubmit' or 'current'",
        )

    snapshots = _load_snapshot_pair(db, project)
    if snapshots.before is None:
        raise HTTPException(
            status_code=404,
            detail=(
                "No 'controller_sent_back' snapshot found for project "
                f"'{project.id}'. Diff view is only available after Send Back."
            ),
        )

    before_state = json.loads(snapshots.before.forecast_data_json)

    # Resolve the after-state per diff_type rules.
    after_source: str
    after_state: dict[str, Optional[str]]
    resubmitted_at: Optional[str] = None
    resubmission_notes: Optional[str] = None
    if diff_type == "resubmit" and snapshots.after is not None:
        after_state = json.loads(snapshots.after.forecast_data_json)
        after_source = "pl_resubmitted"
        resubmitted_at = (
            snapshots.after.created_at.isoformat()
            if snapshots.after.created_at else None
        )
        resubmission_notes = snapshots.after.comments
    else:
        after_state = _project_state_dict(project, db)
        after_source = "current"

    fields: list[IntakeDiffField] = []
    for attr, label in DIFFABLE_FIELDS:
        before_val = before_state.get(attr)
        after_val = after_state.get(attr)
        fields.append(IntakeDiffField(
            field=attr,
            label=label,
            before=before_val,
            after=after_val,
            changed=before_val != after_val,
        ))

    return IntakeDiffResponse(
        project_id=project.id,
        project_name=project.name,
        diff_type=after_source,
        has_baseline=any(f.changed for f in fields),
        fields=fields,
        sent_back_at=(
            snapshots.before.created_at.isoformat()
            if snapshots.before.created_at else None
        ),
        resubmitted_at=resubmitted_at,
        sent_back_comments=snapshots.before.comments,
        resubmission_notes=resubmission_notes,
    )
