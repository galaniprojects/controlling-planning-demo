"""Reusable Change-Request creation capability.

The Rolling Forecast Review wizard (``routers/workbench.py::submit_forecast_cycle``)
has always created Change Requests inline: one CR per cost centre, ``CRChangeDetail``
rows per changed line, and ``ResourceRequest`` rows for internal-resource lines so the
CC Owner has something to act on. The What-If Simulator now reuses that exact path:

- **Promote (F8):** the controller promoting an other-PL forecast diff creates a
  ``draft`` CR per cost centre, authored by that project's PL.
- **Apply-to-forecast:** a PL applying a scenario to their own project creates a
  ``draft`` CR per cost centre, authored by themselves.

This module owns the shared persistence (CR + details + resource requests + re-run
dedupe). Callers own grid resolution and diffing; they hand us already-grouped,
already-diffed input via :class:`CRGroupInput` / :class:`CRDetailInput`. The CR
``status`` is a parameter so the wizard keeps its ``pending_*`` flow while the
simulator passes ``"draft"``.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from models.capacity import Allocation, ResourceRequest
from models.change_requests import ChangeRequest, CRChangeDetail
from models.organization import CostCenter
from models.people import Person

# Fallback cost centre for resource requests when a group has no resolved CC.
# Preserves the historical wizard default (was hard-coded in portfolio.py).
DEFAULT_RR_COST_CENTER_ID = "cc-muc-apd"


@dataclass
class CRDetailInput:
    """One changed forecast cell, destined for a ``CRChangeDetail`` row.

    ``category`` drives cost-centre grouping and the resource-request gate.
    Internal lines carry **hours** in ``old_value``/``new_value``; external lines
    carry **€** — matching the wizard so the resource-request delta math is
    identical across callers.
    """

    category: str  # "internal" | "external"
    field_changed: str
    old_value: str
    new_value: str
    delta: str
    line_item_type: Optional[str]  # role_type_id (internal) or cost-type id (external)
    month: Optional[str]  # YYYY-MM


@dataclass
class CRGroupInput:
    """One cost centre's worth of changes — becomes exactly one ChangeRequest."""

    cost_center_id: Optional[str]
    cost_center_name: str
    change_category: str  # "resource" if any internal else "external_cost"
    summary: str
    justification: Optional[str]
    details: list[CRDetailInput]
    is_system_suggested: bool = False
    # Per-group status override. The wizard sets a per-cost-centre status
    # (internal -> pending_cc_confirmation, external -> pending_controller_approval);
    # the simulator leaves this None and relies on the call-level initial_status.
    status: Optional[str] = None


def create_change_requests(
    db: Session,
    *,
    project_id: str,
    submitted_by_id: str,
    groups: list[CRGroupInput],
    initial_status: str,
    source_scenario_id: Optional[int] = None,
    create_resource_requests: bool = True,
    submission_timestamp: Optional[datetime] = None,
) -> list[ChangeRequest]:
    """Create one ChangeRequest per group, with details and resource requests.

    Args:
        project_id: the affected project.
        submitted_by_id: the CR author (the project's PL for promote, the
            applying PL for apply, the submitting user for the wizard).
        groups: pre-grouped, pre-diffed changes (one CR per group).
        initial_status: ``"draft"`` (simulator) or ``"pending_*"`` (wizard).
        source_scenario_id: provenance + dedupe key. When set, existing **draft**
            CRs for ``(source_scenario_id, project_id)`` are replaced (their
            details + resource requests deleted first); CRs already past draft are
            left untouched.
        create_resource_requests: build ResourceRequest rows for internal groups.

    Returns the created CRs (flushed, not committed — the caller commits).
    """
    if source_scenario_id is not None:
        _delete_prior_draft_crs(db, source_scenario_id, project_id)

    ts = submission_timestamp or datetime.utcnow()
    created: list[ChangeRequest] = []

    for group in groups:
        # Skip groups with no material change (e.g. an edit-then-restore that
        # nets to zero) so we never persist an empty CR.
        if not group.details:
            continue

        cr = ChangeRequest(
            project_id=project_id,
            submitted_by_id=submitted_by_id,
            submission_timestamp=ts,
            status=group.status or initial_status,
            change_category=group.change_category,
            summary=group.summary,
            justification=group.justification,
            is_system_suggested=group.is_system_suggested,
            source_scenario_id=source_scenario_id,
        )
        db.add(cr)
        db.flush()  # assign cr.id before children

        for d in group.details:
            db.add(
                CRChangeDetail(
                    change_request_id=cr.id,
                    field_changed=d.field_changed,
                    old_value=d.old_value,
                    new_value=d.new_value,
                    delta=d.delta,
                    line_item_type=d.line_item_type,
                    month=d.month,
                )
            )
        db.flush()  # make details visible via cr.change_details

        has_internal = any(d.category == "internal" for d in group.details)
        if create_resource_requests and has_internal:
            create_resource_requests_from_cr(
                cr, db, cost_center_id=group.cost_center_id or DEFAULT_RR_COST_CENTER_ID
            )

        created.append(cr)

    return created


def _delete_prior_draft_crs(db: Session, source_scenario_id: int, project_id: str) -> None:
    """Remove this scenario's prior *draft* CRs for a project (re-run dedupe).

    Children (ResourceRequest, CRChangeDetail) are deleted first to respect FKs.
    CRs that have moved past ``draft`` (already in the CC/Controller pipeline) are
    intentionally left alone.
    """
    prior = (
        db.query(ChangeRequest)
        .filter(
            ChangeRequest.source_scenario_id == source_scenario_id,
            ChangeRequest.project_id == project_id,
            ChangeRequest.status == "draft",
        )
        .all()
    )
    for cr in prior:
        db.query(ResourceRequest).filter(
            ResourceRequest.change_request_id == cr.id
        ).delete()
        db.query(CRChangeDetail).filter(
            CRChangeDetail.change_request_id == cr.id
        ).delete()
        db.delete(cr)
    if prior:
        db.flush()


def group_details_by_cost_center(
    db: Session,
    project_id: str,
    details: list[CRDetailInput],
    *,
    summary_label: str = "Forecast update",
    justification: Optional[str] = None,
) -> list[CRGroupInput]:
    """Group changed cells into one :class:`CRGroupInput` per cost centre.

    Mirrors the wizard's grouping (``workbench.py`` get_review) byte-for-byte:
    internal lines map to their role's cost centre via Allocation -> Person; the
    most-common such CC is the default for externals. ``change_category`` is
    ``"resource"`` when the group has any internal line, else ``"external_cost"``.
    """
    sub_cat_to_cc, default_cc_id, cc_names = _project_cost_center_map(db, project_id)

    grouped: dict[str, list[CRDetailInput]] = defaultdict(list)
    for d in details:
        if d.category == "internal":
            cc_id = sub_cat_to_cc.get(d.line_item_type or "", default_cc_id or "unknown")
        else:
            cc_id = default_cc_id or "external"
        grouped[cc_id].append(d)

    groups: list[CRGroupInput] = []
    for cc_id, group_details in grouped.items():
        cc_name = cc_names.get(cc_id, cc_id)
        has_internal = any(d.category == "internal" for d in group_details)
        groups.append(
            CRGroupInput(
                cost_center_id=cc_id,
                cost_center_name=cc_name,
                change_category="resource" if has_internal else "external_cost",
                summary=f"{summary_label}: {cc_name}",
                justification=justification,
                details=group_details,
            )
        )
    return groups


def _project_cost_center_map(
    db: Session, project_id: str
) -> tuple[dict[str, str], Optional[str], dict[str, str]]:
    """(role_type_id -> cost_center_id, default_cc_id, cost_center_id -> name).

    Extracted verbatim from the wizard's get_review grouping prelude.
    """
    sub_cat_to_cc: dict[str, str] = {}
    person_ids = [
        a.person_id
        for a in db.query(Allocation.person_id)
        .filter(Allocation.project_id == project_id)
        .distinct()
        .all()
    ]
    if person_ids:
        for p in db.query(Person).filter(Person.id.in_(person_ids)).all():
            if p.cost_center_id and p.role_type_id:
                sub_cat_to_cc[p.role_type_id] = p.cost_center_id

    cc_names: dict[str, str] = {}
    all_cc_ids = set(sub_cat_to_cc.values())
    if all_cc_ids:
        for cc in db.query(CostCenter).filter(CostCenter.id.in_(all_cc_ids)).all():
            cc_names[cc.id] = cc.name

    default_cc_id: Optional[str] = None
    if sub_cat_to_cc:
        default_cc_id = Counter(sub_cat_to_cc.values()).most_common(1)[0][0]

    return sub_cat_to_cc, default_cc_id, cc_names


def create_resource_requests_from_cr(
    cr: ChangeRequest,
    db: Session,
    *,
    cost_center_id: str = DEFAULT_RR_COST_CENTER_ID,
) -> None:
    """Create ResourceRequest rows from a CR's internal resource change details.

    Groups by role type, computes period + average hours, creates one pending
    request per role directed at ``cost_center_id``. (Relocated from
    ``routers/portfolio.py`` and parameterized on the cost centre — it was
    previously hard-coded to ``cc-muc-apd``, which mis-targeted any role whose
    cost centre differs.)
    """
    # Resolve to a REAL cost centre. group_details_by_cost_center yields a
    # synthetic id ("unknown"/"external") when a project has no allocations
    # mapping its roles to a CC; that string would create a ResourceRequest with
    # a dangling cost_center_id (SQLite FK enforcement is off) that no CC Owner
    # inbox surfaces. Fall back to the default seed CC for any unresolvable id.
    if not db.query(CostCenter.id).filter(CostCenter.id == cost_center_id).first():
        cost_center_id = DEFAULT_RR_COST_CENTER_ID

    # Delete any existing pending CR-linked requests (idempotent re-run).
    db.query(ResourceRequest).filter(
        ResourceRequest.change_request_id == cr.id,
        ResourceRequest.status == "pending",
    ).delete()

    groups: dict[str, list] = defaultdict(list)
    for detail in cr.change_details:
        if detail.line_item_type and detail.line_item_type.startswith("role-") and detail.month:
            groups[detail.line_item_type].append(detail)

    for role_id, role_details in groups.items():
        sorted_details = sorted(role_details, key=lambda d: d.month)
        delta_values: list[float] = []
        old_values: list[float] = []
        for d in sorted_details:
            try:
                new_val = float(d.new_value.replace("€", "").replace(",", "").strip()) if d.new_value else 0.0
                old_val = float(d.old_value.replace("€", "").replace(",", "").strip()) if d.old_value else 0.0
                delta_values.append(new_val - old_val)
                old_values.append(old_val)
            except (ValueError, AttributeError):
                delta_values.append(0)
                old_values.append(0)

        avg_delta = sum(delta_values) / len(delta_values) if delta_values else 0
        avg_old = sum(old_values) / len(old_values) if old_values else 0

        if abs(avg_delta) < 0.01:
            continue

        db.add(
            ResourceRequest(
                project_id=cr.project_id,
                change_request_id=cr.id,
                cost_center_id=cost_center_id,
                request_type="resource",
                role_type_id=role_id,
                hours_or_amount_per_month=round(abs(avg_delta), 2),
                original_hours_per_month=round(avg_old, 2),
                change_direction="increase" if avg_delta > 0 else "decrease",
                period_start=sorted_details[0].month,
                period_end=sorted_details[-1].month,
                priority="medium",
                status="pending",
            )
        )
