"""Progress tracker service [E-04c].

Orchestrates the milestone-anchored progress tracking layer added in v5
Cluster E Session E1. Responsibilities:

- Read effective state per project (current milestone derivation, checklist
  rollup, effective percentage when no manual override is set).
- Validate updates to the live progress fields (confidence enum,
  confidence reason for at_risk/blocked, manual-override semantics).
- Capture immutable progress snapshots at forecast cycle completion (called
  alongside ``services.forecast_versioning.capture_versions_for_cycle`` from
  ``routers/workbench.py::submit_forecast_cycle``).
- Compute portfolio-level progress indicators for the Backlog and Portfolio
  inline indicator per [E-04d].

Spec references: [E-04c], [E-04d], [E-05a], [E-05d].
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from models.financial import Forecast
from models.people import Person
from models.projects import (
    MilestoneDeliverable, ProgressSnapshot, Project, ProjectMilestone,
)
from schemas.common import CurrentUser

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MAX_CHECKLIST_ITEMS = 10
"""Hard cap on deliverable checklist items per milestone per [E-04c]."""

VALID_CONFIDENCE = ("on_track", "at_risk", "blocked")
"""Three-value enum for ``next_milestone_confidence``."""

CONFIDENCE_REASON_REQUIRED_VALUES = ("at_risk", "blocked")
"""Confidence levels that require ``confidence_reason`` to be non-empty per
[E-04c]: 'on track' is enough on its own; 'at risk' / 'blocked' need a
one-line reason."""


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


def _normalize_confidence(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    v = value.strip().lower().replace(" ", "_").replace("-", "_")
    if v not in VALID_CONFIDENCE:
        raise ValueError(
            f"next_milestone_confidence must be one of {VALID_CONFIDENCE}; got '{value}'"
        )
    return v


def _validate_pct(value: Optional[float]) -> Optional[float]:
    if value is None:
        return None
    try:
        f = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"progress_pct must be numeric: {value!r}") from exc
    if f < 0 or f > 100:
        raise ValueError(f"progress_pct must be in [0, 100]; got {f}")
    return round(f, 2)


# ---------------------------------------------------------------------------
# Current milestone derivation
# ---------------------------------------------------------------------------


def derive_current_milestone(
    project: Project, demo_date: str,
) -> Optional[ProjectMilestone]:
    """Pick the milestone whose forecast window contains ``demo_date``.

    Falls back to the last milestone strictly before the demo date if no
    window contains it (project past last milestone), then to the first
    milestone if the demo date precedes all windows. Returns ``None`` only
    when the project has no milestones.

    The ORM relationship is ``order_by="ProjectMilestone.sequence_number"``
    so we trust the iteration order.
    """
    milestones = list(project.milestones)
    if not milestones:
        return None

    # In-window match (forecast_start <= demo_date <= forecast_end, lexical
    # comparison works for YYYY-MM strings).
    for ms in milestones:
        if ms.forecast_start <= demo_date <= ms.forecast_end:
            return ms

    # Demo date is past the final milestone — pick the last one.
    if demo_date > milestones[-1].forecast_end:
        return milestones[-1]

    # Demo date precedes the first milestone — pick the first.
    return milestones[0]


def resolve_current_milestone(
    db: Session, project: Project, demo_date: str,
) -> Optional[ProjectMilestone]:
    """Return the explicit ``current_milestone_id`` if set, else derive."""
    if project.current_milestone_id is not None:
        ms = db.query(ProjectMilestone).filter(
            ProjectMilestone.id == project.current_milestone_id,
            ProjectMilestone.project_id == project.id,
        ).first()
        if ms is not None:
            return ms
        # Stored ID is stale (milestone was deleted) — fall through to derive.
        logger.warning(
            "Project %s has stale current_milestone_id=%s; deriving",
            project.id, project.current_milestone_id,
        )
    return derive_current_milestone(project, demo_date)


# ---------------------------------------------------------------------------
# Checklist rollup
# ---------------------------------------------------------------------------


def compute_checklist_completion(
    db: Session, milestone_id: Optional[int],
) -> dict:
    """Return ``{total_items, completed_items, completion_pct}``.

    ``completion_pct`` is None when total_items == 0 (no checklist defined),
    matching the [E-04c] semantics: when no deliverables, the percentage
    is purely manual.
    """
    if milestone_id is None:
        return {"total_items": 0, "completed_items": 0, "completion_pct": None}

    items = db.query(MilestoneDeliverable).filter(
        MilestoneDeliverable.milestone_id == milestone_id
    ).all()
    total = len(items)
    if total == 0:
        return {"total_items": 0, "completed_items": 0, "completion_pct": None}

    completed = sum(1 for d in items if d.is_complete)
    pct = round((completed / total) * 100.0, 2)
    return {
        "total_items": total,
        "completed_items": completed,
        "completion_pct": pct,
    }


def effective_progress_pct(
    db: Session, project: Project, current_milestone_id: Optional[int],
) -> Optional[float]:
    """Return the effective progress percentage to display.

    When ``progress_pct_manual_override`` is True OR the current milestone
    has no deliverables, return the stored ``progress_pct``. Otherwise
    return the auto-computed checklist completion percentage.
    """
    rollup = compute_checklist_completion(db, current_milestone_id)
    if not project.progress_pct_manual_override and rollup["completion_pct"] is not None:
        return rollup["completion_pct"]
    if project.progress_pct is None:
        return None
    return float(project.progress_pct)


# ---------------------------------------------------------------------------
# Update path
# ---------------------------------------------------------------------------


def apply_progress_update(
    db: Session,
    project: Project,
    user: CurrentUser,
    *,
    current_milestone_id: Optional[int] = None,
    progress_pct: Optional[float] = None,
    progress_pct_manual_override: Optional[bool] = None,
    status_narrative: Optional[str] = None,
    next_milestone_confidence: Optional[str] = None,
    confidence_reason: Optional[str] = None,
    set_explicit: Optional[set[str]] = None,
) -> dict[str, tuple]:
    """Mutate the live progress fields on ``project`` and return a delta map.

    The delta map ``{field: (old_value, new_value)}`` is used by the router
    layer to emit one audit-log entry per changed field. The caller is
    responsible for ``db.commit()``.

    ``set_explicit`` is the set of field names the client actually included
    in the request body (so we can distinguish "not provided" from
    "provided as None"). Routers populate this from
    ``ProgressUpdateRequest.model_dump(exclude_unset=True)``.
    """
    explicit = set_explicit or set()
    deltas: dict[str, tuple] = {}

    # current_milestone_id
    if "current_milestone_id" in explicit:
        if current_milestone_id is not None:
            ms = db.query(ProjectMilestone).filter(
                ProjectMilestone.id == current_milestone_id,
                ProjectMilestone.project_id == project.id,
            ).first()
            if ms is None:
                raise ValueError(
                    f"current_milestone_id={current_milestone_id} is not a "
                    f"milestone of project {project.id}"
                )
        if project.current_milestone_id != current_milestone_id:
            deltas["current_milestone_id"] = (
                project.current_milestone_id, current_milestone_id,
            )
            project.current_milestone_id = current_milestone_id

    # progress_pct + manual override semantics
    if "progress_pct_manual_override" in explicit:
        new_flag = bool(progress_pct_manual_override)
        if project.progress_pct_manual_override != new_flag:
            deltas["progress_pct_manual_override"] = (
                project.progress_pct_manual_override, new_flag,
            )
            project.progress_pct_manual_override = new_flag

    if "progress_pct" in explicit:
        validated = _validate_pct(progress_pct)
        old = (
            float(project.progress_pct) if project.progress_pct is not None else None
        )
        if old != validated:
            deltas["progress_pct"] = (old, validated)
            project.progress_pct = (
                Decimal(str(validated)) if validated is not None else None
            )

    # confidence + reason — validate enum, enforce reason for at_risk/blocked
    new_conf = project.next_milestone_confidence
    new_reason = project.confidence_reason

    if "next_milestone_confidence" in explicit:
        new_conf = _normalize_confidence(next_milestone_confidence)
    if "confidence_reason" in explicit:
        new_reason = (confidence_reason or "").strip() or None

    if new_conf in CONFIDENCE_REASON_REQUIRED_VALUES and not (new_reason or "").strip():
        raise ValueError(
            f"confidence_reason is required when next_milestone_confidence "
            f"is '{new_conf}' per [E-04c]"
        )

    if new_conf != project.next_milestone_confidence:
        deltas["next_milestone_confidence"] = (
            project.next_milestone_confidence, new_conf,
        )
        project.next_milestone_confidence = new_conf
    if new_reason != project.confidence_reason:
        deltas["confidence_reason"] = (project.confidence_reason, new_reason)
        project.confidence_reason = new_reason

    # status_narrative
    if "status_narrative" in explicit:
        new_text = (status_narrative or "").strip() or None
        if new_text != project.status_narrative:
            deltas["status_narrative"] = (project.status_narrative, new_text)
            project.status_narrative = new_text

    if deltas:
        project.progress_updated_at = datetime.utcnow()
        project.progress_updated_by_id = user.person_id

    return deltas


# ---------------------------------------------------------------------------
# Snapshot serialisation
# ---------------------------------------------------------------------------


def serialize_checklist_for_snapshot(db: Session, project: Project) -> list[dict]:
    """Build the full per-milestone deliverable snapshot for ProgressSnapshot."""
    out: list[dict] = []
    milestones = sorted(project.milestones, key=lambda m: m.sequence_number)
    for ms in milestones:
        items = (
            db.query(MilestoneDeliverable)
            .filter(MilestoneDeliverable.milestone_id == ms.id)
            .order_by(MilestoneDeliverable.sequence)
            .all()
        )
        if not items:
            continue
        out.append({
            "milestone_id": ms.id,
            "milestone_name": ms.name,
            "sequence_number": ms.sequence_number,
            "items": [
                {
                    "id": d.id,
                    "sequence": d.sequence,
                    "text": d.text,
                    "is_complete": d.is_complete,
                    "completed_at": (
                        d.completed_at.isoformat() if d.completed_at else None
                    ),
                }
                for d in items
            ],
        })
    return out


def capture_progress_snapshot(
    db: Session,
    project: Project,
    user: CurrentUser,
    *,
    cycle_label: Optional[str] = None,
    cycle_id: Optional[str] = None,
    demo_date: str = "2026-04",
) -> ProgressSnapshot:
    """Create and add (NOT commit) a ProgressSnapshot for ``project``.

    Captures denormalised milestone descriptors so the History view can
    render without re-walking FKs even after a milestone is renamed/deleted.
    """
    from config import DEMO_DATE as _DEMO_DATE
    effective_demo_date = demo_date if demo_date != "2026-04" else _DEMO_DATE

    current = resolve_current_milestone(db, project, effective_demo_date)
    checklist = serialize_checklist_for_snapshot(db, project)

    snap = ProgressSnapshot(
        project_id=project.id,
        cycle_label=cycle_label,
        cycle_id=cycle_id,
        snapshot_at=datetime.utcnow(),
        created_by_id=user.person_id if user else None,
        current_milestone_id=current.id if current else None,
        current_milestone_name=current.name if current else None,
        current_milestone_sequence=current.sequence_number if current else None,
        progress_pct=project.progress_pct,
        progress_pct_manual_override=bool(project.progress_pct_manual_override),
        status_narrative=project.status_narrative,
        next_milestone_confidence=project.next_milestone_confidence,
        confidence_reason=project.confidence_reason,
        checklist_payload_json=json.dumps(checklist) if checklist else None,
    )
    db.add(snap)
    return snap


def capture_progress_for_cycle(
    db: Session,
    user: CurrentUser,
    cycle_label: str,
    cycle_id: Optional[str] = None,
    demo_date: Optional[str] = None,
) -> list[ProgressSnapshot]:
    """Fan-out: one ProgressSnapshot per active project at cycle completion.

    Mirrors ``services.forecast_versioning.capture_versions_for_cycle``:
    runs best-effort, skips projects with no forecast rows, and rolls back
    on a per-project basis without aborting the cycle.
    """
    from config import DEMO_DATE as _DEMO_DATE
    effective_demo_date = demo_date or _DEMO_DATE

    projects = db.query(Project).filter(Project.is_active.is_(True)).all()
    created: list[ProgressSnapshot] = []

    for project in projects:
        # Skip projects with no forecast rows — those have nothing to snapshot.
        # Mirrors C1's policy in capture_versions_for_cycle.
        has_forecast = (
            db.query(Forecast)
            .filter(Forecast.project_id == project.id)
            .limit(1)
            .first()
        )
        if not has_forecast:
            continue

        try:
            snap = capture_progress_snapshot(
                db=db,
                project=project,
                user=user,
                cycle_label=cycle_label,
                cycle_id=cycle_id,
                demo_date=effective_demo_date,
            )
            db.flush()
            created.append(snap)
        except Exception as exc:  # noqa: BLE001 — best-effort
            logger.warning(
                "capture_progress_for_cycle: skipped project %s: %s",
                project.id, exc,
            )
            db.rollback()

    return created


# ---------------------------------------------------------------------------
# Portfolio aggregation [E-04d]
# ---------------------------------------------------------------------------


def compute_portfolio_progress_indicators(
    db: Session,
    *,
    demo_date: Optional[str] = None,
    project_ids: Optional[list[str]] = None,
) -> dict:
    """Build the inline-indicator payload for Backlog/Portfolio views.

    Returns ``{"items": [...], "total": N, "summary": {...}}`` shape per
    project. Filters to active projects; ``project_ids`` further restricts
    for the PL role.
    """
    from config import DEMO_DATE as _DEMO_DATE
    effective_demo_date = demo_date or _DEMO_DATE

    query = db.query(Project).filter(Project.is_active.is_(True))
    if project_ids is not None:
        if not project_ids:
            return {
                "items": [], "total": 0,
                "summary": {"on_track": 0, "at_risk": 0, "blocked": 0, "unreported": 0},
            }
        query = query.filter(Project.id.in_(project_ids))

    projects = query.order_by(Project.name).all()

    items = []
    counts = {"on_track": 0, "at_risk": 0, "blocked": 0, "unreported": 0}

    for p in projects:
        current = resolve_current_milestone(db, p, effective_demo_date)
        eff_pct = effective_progress_pct(db, p, current.id if current else None)
        has_data = (
            p.progress_pct is not None
            or p.status_narrative is not None
            or p.next_milestone_confidence is not None
            or eff_pct is not None
        )

        confidence = p.next_milestone_confidence
        bucket = confidence if confidence in counts else "unreported"
        counts[bucket] += 1

        items.append({
            "project_id": p.id,
            "project_name": p.name,
            "pipeline_stage": p.pipeline_stage,
            "rag_status": p.rag_status,
            "current_milestone_name": current.name if current else None,
            "current_milestone_sequence": current.sequence_number if current else None,
            "progress_pct": eff_pct,
            "next_milestone_confidence": confidence,
            "has_progress_data": has_data,
        })

    return {"items": items, "total": len(items), "summary": counts}


# ---------------------------------------------------------------------------
# Helper for response building
# ---------------------------------------------------------------------------


def build_progress_response_payload(
    db: Session, project: Project, *, demo_date: Optional[str] = None,
) -> dict:
    """Assemble the dict consumed by ``ProgressResponse``."""
    from config import DEMO_DATE as _DEMO_DATE
    effective_demo_date = demo_date or _DEMO_DATE

    current = resolve_current_milestone(db, project, effective_demo_date)
    rollup = compute_checklist_completion(db, current.id if current else None)
    eff_pct = effective_progress_pct(db, project, current.id if current else None)

    deliverables = []
    if current is not None:
        items = (
            db.query(MilestoneDeliverable)
            .filter(MilestoneDeliverable.milestone_id == current.id)
            .order_by(MilestoneDeliverable.sequence)
            .all()
        )
        deliverables = [
            {
                "id": d.id,
                "milestone_id": d.milestone_id,
                "sequence": d.sequence,
                "text": d.text,
                "is_complete": d.is_complete,
                "completed_at": d.completed_at,
                "completed_by_id": d.completed_by_id,
            }
            for d in items
        ]

    updated_by_name = None
    if project.progress_updated_by_id:
        person = db.query(Person).filter(
            Person.id == project.progress_updated_by_id
        ).first()
        if person:
            updated_by_name = person.name

    return {
        "project_id": project.id,
        "project_name": project.name,
        "current_milestone": (
            {
                "id": current.id,
                "name": current.name,
                "sequence_number": current.sequence_number,
                "forecast_start": current.forecast_start,
                "forecast_end": current.forecast_end,
            } if current else None
        ),
        "progress_pct": (
            float(project.progress_pct) if project.progress_pct is not None else None
        ),
        "effective_progress_pct": eff_pct,
        "progress_pct_manual_override": bool(project.progress_pct_manual_override),
        "status_narrative": project.status_narrative,
        "next_milestone_confidence": project.next_milestone_confidence,
        "confidence_reason": project.confidence_reason,
        "progress_updated_at": project.progress_updated_at,
        "progress_updated_by_id": project.progress_updated_by_id,
        "progress_updated_by_name": updated_by_name,
        "checklist": rollup,
        "deliverables": deliverables,
    }
