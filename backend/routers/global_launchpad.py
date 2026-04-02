"""Global / Launchpad endpoints (Section 10.2) — 6 endpoints."""

from __future__ import annotations

import json
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user
from collections import defaultdict

from models.change_requests import ChangeRequest
from models.capacity import Allocation, ResourceRequest, ResourceRequestAssignment
from models.financial import Forecast
from models.people import RateTable, RoleType
from models.projects import Project
from models.scenarios import Scenario
from models.submissions import ProjectSubmissionSnapshot
from models.system import Notification
from models.users import DemoPersona
from schemas.common import CurrentUser
from config import DEMO_DATE
from schemas.global_launchpad import (
    ModuleTile,
    NotificationResponse,
    PendingAction,
    ProjectCreate,
    RoleContext,
    RoleInfo,
)
from services.calculations import add_months
from services.portfolio_service import compute_portfolio_kpis, get_project_entity_info, get_top_level_entity_type_id

router = APIRouter(prefix="/api", tags=["Global / Launchpad"])


def _get_project_lob_name(db: Session, project_id: str) -> str:
    """Get the top-level entity name (LoB) for a project."""
    top_type = get_top_level_entity_type_id(db)
    info = get_project_entity_info(db, project_id, top_type)
    return info["name"] if info else "Unassigned"


def _get_project_entity_id(db: Session, project_id: str) -> str:
    """Get the top-level entity ID for a project."""
    top_type = get_top_level_entity_type_id(db)
    info = get_project_entity_info(db, project_id, top_type)
    return info["id"] if info else ""


# ---------------------------------------------------------------------------
# Module definitions
# ---------------------------------------------------------------------------

MODULES = [
    {"id": "portfolio", "name": "Portfolio Overview", "description": "IT portfolio dashboard with budget tracking, intake queue, and change request approvals."},
    {"id": "workbench", "name": "Project Workbench", "description": "Project detail view with forecast planning, change requests, and trend analysis."},
    {"id": "capacity", "name": "Capacity Management", "description": "Team utilization heatmaps, resource allocation, and request management."},
    {"id": "simulator", "name": "What-If Simulator", "description": "Scenario planning tool for budget optimization with AI-assisted recommendations."},
    {"id": "reporting", "name": "Reporting", "description": "Cross-cutting analytical reports with export and saved view capabilities."},
    {"id": "admin", "name": "Administration", "description": "System configuration: organizational structure, rates, and planning parameters."},
    {"id": "documentation", "name": "Documentation", "description": "Application guides, API reference, data model overview, and frequently asked questions."},
]

MODULE_VISIBILITY = {
    "controller": ["portfolio", "workbench", "capacity", "simulator", "reporting", "admin", "documentation"],
    "cost_center_owner": ["portfolio", "workbench", "capacity", "reporting", "documentation"],
    "project_lead": ["portfolio", "workbench", "reporting", "documentation"],
    "executive": ["portfolio", "simulator", "reporting", "documentation"],
}

MODULE_SORT = {
    "controller": {"portfolio": 1, "workbench": 2, "capacity": 3, "simulator": 4, "reporting": 5, "admin": 6, "documentation": 7},
    "cost_center_owner": {"capacity": 1, "workbench": 2, "portfolio": 3, "reporting": 4, "documentation": 5},
    "project_lead": {"workbench": 1, "portfolio": 2, "reporting": 3, "documentation": 4},
    "executive": {"portfolio": 1, "simulator": 2, "reporting": 3, "documentation": 4},
}


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/roles")
def get_roles(db: Session = Depends(get_db)):
    """Get all available demo personas/roles."""
    personas = db.query(DemoPersona).all()
    items = [
        RoleInfo(
            id=p.id,
            name=p.role,
            user_name=p.display_name,
            user_title=p.title,
            default_module=p.default_module,
        )
        for p in personas
    ]
    return {"items": items, "total": len(items)}


@router.get("/roles/{role_id}/context")
def get_role_context(
    role_id: str,
    db: Session = Depends(get_db),
):
    """Get context for a specific role (accessible modules, owned projects, etc.)."""
    persona = db.query(DemoPersona).filter(DemoPersona.id == role_id).first()
    if not persona:
        raise HTTPException(404, f"Role not found: {role_id}")

    project_ids = json.loads(persona.owned_project_ids_json) if persona.owned_project_ids_json else []
    accessible = MODULE_VISIBILITY.get(persona.role, [])

    return RoleContext(
        role=persona.role,
        user_name=persona.display_name,
        user_title=persona.title,
        accessible_modules=accessible,
        owned_project_ids=project_ids,
        managed_cost_center_id=persona.managed_cost_center_id,
    )


@router.get("/notifications")
def get_notifications(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Get notifications for the current user."""
    notifs = (
        db.query(Notification)
        .filter(Notification.user_person_id == user.person_id)
        .order_by(Notification.created_at.desc())
        .all()
    )
    items = [
        NotificationResponse(
            id=n.id,
            message=n.message,
            severity=n.severity,
            deep_link_module=n.deep_link_module,
            deep_link_entity_id=n.deep_link_entity_id,
            deep_link_tab=n.deep_link_tab,
            is_read=n.is_read,
        )
        for n in notifs
    ]
    return {"items": items, "total": len(items)}


@router.get("/kpis/portfolio-summary")
def get_portfolio_summary(
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """Get portfolio-level KPI summary for the launchpad."""
    return compute_portfolio_kpis(db)


@router.get("/modules")
def get_modules(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Get module tiles with role-dependent visibility and contextual metrics."""
    visible_ids = MODULE_VISIBILITY.get(user.role, [])
    sort_map = MODULE_SORT.get(user.role, {})

    items = []
    for mod in MODULES:
        visible = mod["id"] in visible_ids
        sort_order = sort_map.get(mod["id"], 99)
        metric = _compute_module_metric(db, mod["id"], user)
        items.append(
            ModuleTile(
                id=mod["id"],
                name=mod["name"],
                description=mod["description"],
                contextual_metric=metric,
                visible=visible,
                sort_order=sort_order,
            )
        )
    items.sort(key=lambda m: m.sort_order)
    return {"items": items, "total": len(items)}


def _compute_module_metric(db: Session, module_id: str, user: CurrentUser) -> str:
    """Compute a contextual metric string for a module tile."""
    if module_id == "portfolio":
        count = db.query(func.count(Project.id)).filter(Project.is_active.is_(True)).scalar()
        pending = db.query(func.count(Project.id)).filter(Project.status == "pending_approval").scalar()
        if pending > 0:
            return f"{count} projects, {pending} pending approval"
        return f"{count} active projects"

    elif module_id == "workbench":
        if user.role == "project_lead":
            from dependencies import pl_project_filter
            count = db.query(func.count(Project.id)).filter(
                Project.is_active.is_(True), pl_project_filter(user)
            ).scalar()
            return f"Your {count} projects"
        count = db.query(func.count(Project.id)).filter(Project.is_active.is_(True), Project.is_service.is_(False)).scalar()
        return f"{count} projects"

    elif module_id == "capacity":
        if user.role == "cost_center_owner" and user.cost_center_id:
            pending = (
                db.query(func.count(ResourceRequest.id))
                .filter(ResourceRequest.cost_center_id == user.cost_center_id, ResourceRequest.status == "pending")
                .scalar()
            )
            return f"{pending} pending requests"
        return "Team utilization overview"

    elif module_id == "simulator":
        return "What-if scenario planning"

    elif module_id == "reporting":
        return "5 standard reports"

    elif module_id == "admin":
        return "System configuration"

    elif module_id == "documentation":
        return "Guides, API reference & FAQ"

    return ""


@router.get("/launchpad/pending-actions")
def get_pending_actions(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Get dynamically computed pending actions for the current user's role."""
    actions: list[PendingAction] = []
    prev_month = add_months(DEMO_DATE, -1)

    if user.role == "project_lead":
        from dependencies import pl_project_filter
        # Action #1: Forecast Due — active owned projects where current month not yet submitted
        owned_projects = (
            db.query(Project)
            .filter(
                pl_project_filter(user),
                Project.status == "active",
                Project.is_service.is_(False),
            )
            .all()
        )
        for proj in owned_projects:
            lfsm = proj.last_forecast_submitted_month
            if lfsm is None or lfsm < DEMO_DATE:
                # Check if it's overdue (previous month also not submitted)
                if lfsm is None or lfsm < prev_month:
                    # Action #2: Forecast Overdue
                    actions.append(PendingAction(
                        id=f"forecast-overdue-{proj.id}",
                        type="forecast_overdue",
                        title="Monthly forecast overdue",
                        description=f"{proj.name} — {prev_month} forecast was not submitted",
                        urgency="urgent",
                        deep_link_module="workbench",
                        deep_link_entity_id=proj.id,
                        deep_link_tab="forecast",
                    ))
                else:
                    # Action #1: Forecast Due (current month)
                    actions.append(PendingAction(
                        id=f"forecast-due-{proj.id}",
                        type="forecast_due",
                        title="Monthly forecast due",
                        description=f"{proj.name} — submit {DEMO_DATE} forecast",
                        urgency="info",
                        deep_link_module="workbench",
                        deep_link_entity_id=proj.id,
                        deep_link_tab="forecast",
                    ))

        # Action #6: CR Feedback Received
        feedback_crs = (
            db.query(ChangeRequest)
            .join(Project, ChangeRequest.project_id == Project.id)
            .filter(
                ChangeRequest.submitted_by_id == user.person_id,
                ChangeRequest.status.in_(["sent_back_by_cc", "sent_back_by_controller", "sent_back"]),
            )
            .all()
        )
        for cr in feedback_crs:
            actions.append(PendingAction(
                id=f"cr-feedback-{cr.id}",
                type="cr_feedback",
                title="Change request returned with feedback",
                description=f"CR #{cr.id} for {cr.project.name}",
                urgency="info",
                deep_link_module="workbench",
                deep_link_entity_id=cr.project_id,
                deep_link_tab="history",
                timestamp=cr.created_at.isoformat() if cr.created_at else None,
            ))

        # Action #7: CR Decision (approved/rejected in last 14 days)
        decided_crs = (
            db.query(ChangeRequest)
            .join(Project, ChangeRequest.project_id == Project.id)
            .filter(
                ChangeRequest.submitted_by_id == user.person_id,
                ChangeRequest.status.in_(["approved", "rejected"]),
            )
            .all()
        )
        for cr in decided_crs:
            ts = cr.controller_approval_timestamp or cr.cc_confirmation_timestamp or cr.created_at
            decision = "approved" if cr.status == "approved" else "rejected"
            actions.append(PendingAction(
                id=f"cr-decision-{cr.id}",
                type="cr_decision",
                title=f"Change request {decision}",
                description=f"CR #{cr.id} for {cr.project.name}",
                urgency="info",
                deep_link_module="workbench",
                deep_link_entity_id=cr.project_id,
                deep_link_tab="history",
                timestamp=ts.isoformat() if ts else None,
            ))

        # Action: Project changes requested by controller/CC Owner
        changes_requested_projects = (
            db.query(Project)
            .filter(
                pl_project_filter(user),
                Project.status == "changes_requested",
            )
            .all()
        )
        for proj in changes_requested_projects:
            actions.append(PendingAction(
                id=f"project-changes-{proj.id}",
                type="project_changes_requested",
                title=f"Changes requested on '{proj.name}'",
                description=proj.submission_feedback[:80] if proj.submission_feedback else "Review requested changes",
                urgency="urgent",
                deep_link_module="workbench",
                deep_link_entity_id=proj.id,
                deep_link_tab="diff",
                timestamp=proj.modified_at.isoformat() if proj.modified_at else None,
            ))

        # Action: Project awaiting CC confirmation (info)
        cc_pending_projects = (
            db.query(Project)
            .filter(
                pl_project_filter(user),
                Project.status == "pending_cc_confirmation",
            )
            .all()
        )
        for proj in cc_pending_projects:
            actions.append(PendingAction(
                id=f"project-in-cc-{proj.id}",
                type="project_in_cc_review",
                title=f"'{proj.name}' awaiting resource confirmation",
                description="CC Owner is reviewing resource requests",
                urgency="info",
                deep_link_module="workbench",
                deep_link_entity_id=proj.id,
                timestamp=proj.modified_at.isoformat() if proj.modified_at else None,
            ))

        # Action: Project in intake queue (info)
        intake_projects = (
            db.query(Project)
            .filter(
                pl_project_filter(user),
                Project.status == "pending_approval",
            )
            .all()
        )
        for proj in intake_projects:
            actions.append(PendingAction(
                id=f"project-in-intake-{proj.id}",
                type="project_in_intake",
                title=f"'{proj.name}' is in the intake queue",
                description="Controller will review the project",
                urgency="info",
                deep_link_module="portfolio",
                deep_link_entity_id=proj.id,
                deep_link_tab="intake",
                timestamp=proj.modified_at.isoformat() if proj.modified_at else None,
            ))

        # Action #8: Project Submission Decision
        for proj in owned_projects:
            if proj.status in ("active", "rejected"):
                # Check if recently transitioned (modified_at != created_at means a status change)
                if (proj.modified_at and proj.created_at
                        and proj.modified_at > proj.created_at
                        and proj.modified_at.isoformat()[:7] >= prev_month):
                    decision = "approved" if proj.status == "active" else "returned"
                    actions.append(PendingAction(
                        id=f"project-decision-{proj.id}",
                        type="project_decision",
                        title=f"Project submission {decision}",
                        description=proj.name,
                        urgency="info",
                        deep_link_module="workbench",
                        deep_link_entity_id=proj.id,
                        deep_link_tab=None,
                        timestamp=proj.modified_at.isoformat(),
                    ))

    elif user.role == "controller":
        # Action #2 (info): Forecast overdue projects
        overdue_projects = (
            db.query(Project)
            .filter(
                Project.status == "active",
                Project.is_service.is_(False),
                (Project.last_forecast_submitted_month.is_(None))
                | (Project.last_forecast_submitted_month < prev_month),
            )
            .all()
        )
        if overdue_projects:
            names = ", ".join(p.name for p in overdue_projects[:3])
            suffix = f" and {len(overdue_projects) - 3} more" if len(overdue_projects) > 3 else ""
            actions.append(PendingAction(
                id="forecast-overdue-controller",
                type="forecast_overdue",
                title="Projects with overdue forecasts",
                description=f"{names}{suffix}",
                urgency="info",
                deep_link_module="workbench",
                deep_link_entity_id=overdue_projects[0].id,
                deep_link_tab="forecast",
            ))

        # Action #4: CR Pending Approval (Stage 2)
        pending_crs = (
            db.query(ChangeRequest)
            .join(Project, ChangeRequest.project_id == Project.id)
            .filter(ChangeRequest.status == "pending_controller_approval")
            .all()
        )
        for cr in pending_crs:
            actions.append(PendingAction(
                id=f"cr-approval-{cr.id}",
                type="cr_pending_approval",
                title="Change request awaiting approval",
                description=f"CR #{cr.id} for {cr.project.name} — {cr.summary[:60]}",
                urgency="urgent",
                deep_link_module="portfolio",
                deep_link_entity_id=str(cr.id),
                deep_link_tab="approvals",
                timestamp=cr.submission_timestamp.isoformat() if cr.submission_timestamp else None,
            ))

        # Action #5: New Project Pending Review
        pending_projects = (
            db.query(Project)
            .filter(Project.status == "pending_approval")
            .all()
        )
        for proj in pending_projects:
            actions.append(PendingAction(
                id=f"project-review-{proj.id}",
                type="project_pending_review",
                title="New project pending review",
                description=proj.name,
                urgency="urgent",
                deep_link_module="portfolio",
                deep_link_entity_id=proj.id,
                deep_link_tab="intake",
                timestamp=proj.created_at.isoformat() if proj.created_at else None,
            ))

        # Action #9: Scenario Published (controller sees)
        published_scenarios = (
            db.query(Scenario)
            .filter(Scenario.status == "published")
            .all()
        )
        for sc in published_scenarios:
            actions.append(PendingAction(
                id=f"scenario-published-{sc.id}",
                type="scenario_published",
                title="New scenario published",
                description=sc.name,
                urgency="info",
                deep_link_module="simulator",
                deep_link_entity_id=str(sc.id),
                timestamp=sc.modified_at.isoformat() if sc.modified_at else None,
            ))

    elif user.role == "cost_center_owner":
        # Action: Projects pending CC confirmation (new submission workflow)
        pending_cc_projects = (
            db.query(Project)
            .filter(Project.status == "pending_cc_confirmation")
            .all()
        )
        for proj in pending_cc_projects:
            actions.append(PendingAction(
                id=f"project-cc-confirm-{proj.id}",
                type="project_cc_confirmation",
                title="Resource confirmation needed",
                description=proj.name,
                urgency="urgent",
                deep_link_module="capacity",
                deep_link_entity_id=proj.id,
                deep_link_tab="requests",
                timestamp=proj.modified_at.isoformat() if proj.modified_at else None,
            ))

        # Action: CR Pending CC Confirmation (final stage after controller approval)
        # Show CRs where cc_owner_id matches OR is NULL (not yet assigned, routed to the CC owner)
        pending_crs = (
            db.query(ChangeRequest)
            .join(Project, ChangeRequest.project_id == Project.id)
            .filter(
                ChangeRequest.status == "pending_cc_confirmation",
                (ChangeRequest.cc_owner_id == user.person_id)
                | (ChangeRequest.cc_owner_id.is_(None)),
            )
            .all()
        )
        for cr in pending_crs:
            actions.append(PendingAction(
                id=f"cr-confirm-{cr.id}",
                type="cr_pending_confirmation",
                title="Change request pending confirmation",
                description=f"CR #{cr.id} for {cr.project.name} — {cr.summary[:60]}",
                urgency="urgent",
                deep_link_module="capacity",
                deep_link_entity_id=str(cr.id),
                deep_link_tab="requests",
                timestamp=cr.submission_timestamp.isoformat() if cr.submission_timestamp else None,
            ))

    elif user.role == "executive":
        # Action #9: Scenario Published (executive sees)
        published_scenarios = (
            db.query(Scenario)
            .filter(Scenario.status == "published")
            .all()
        )
        for sc in published_scenarios:
            actions.append(PendingAction(
                id=f"scenario-published-{sc.id}",
                type="scenario_published",
                title="New scenario published",
                description=sc.name,
                urgency="info",
                deep_link_module="simulator",
                deep_link_entity_id=str(sc.id),
                timestamp=sc.modified_at.isoformat() if sc.modified_at else None,
            ))

    # Sort: urgent first, then by timestamp descending
    def sort_key(a: PendingAction) -> tuple:
        urgency_rank = 0 if a.urgency == "urgent" else 1
        ts = a.timestamp or ""
        return (urgency_rank, ts)

    actions.sort(key=sort_key)
    # Reverse within urgency groups so newest first
    urgent = [a for a in actions if a.urgency == "urgent"]
    info = [a for a in actions if a.urgency == "info"]
    urgent.sort(key=lambda a: a.timestamp or "", reverse=True)
    info.sort(key=lambda a: a.timestamp or "", reverse=True)
    actions = urgent + info

    return {"items": [a.model_dump() for a in actions], "total": len(actions)}


# ---------------------------------------------------------------------------
# Helpers for submission workflow
# ---------------------------------------------------------------------------

def _cleanup_previous_resource_data(db: Session, project: Project):
    """Delete all ResourceRequest (with cascaded assignments) and Allocation rows for a project.

    Uses ORM-level deletes so that the cascade="all, delete-orphan" on
    ResourceRequest.assignments fires correctly, removing ResourceRequestAssignment rows.
    """
    old_requests = db.query(ResourceRequest).filter(
        ResourceRequest.project_id == project.id,
    ).all()
    for req in old_requests:
        db.delete(req)
    # Also clean up Allocation records from any previous CC confirmation
    db.query(Allocation).filter(Allocation.project_id == project.id).delete()
    # Flush to ensure deletions are visible to subsequent queries (autoflush=False)
    db.flush()


def _create_resource_requests_from_forecast(db: Session, project: Project):
    """Create ResourceRequest rows from the project's Forecast data.

    Groups forecast by (category, sub_category) to create one request per
    internal role + one per external cost type. All directed to cc-muc-apd.
    """
    # Delete all previous requests (any status) and allocations for a clean slate
    _cleanup_previous_resource_data(db, project)

    forecasts = db.query(Forecast).filter(Forecast.project_id == project.id).all()

    groups: dict[tuple[str, str], list] = defaultdict(list)
    for f in forecasts:
        groups[(f.category, f.sub_category)].append(f)

    # Route to the CC that owns the internal resources — for demo, use cc-muc-apd
    # which is where the CC Owner (Thomas Brenner) and all dev team members reside
    CC_ID = "cc-muc-apd"

    for (category, sub_cat), items in groups.items():
        sorted_items = sorted(items, key=lambda x: x.month)
        if category == "internal":
            avg_value = sum(float(i.hours or 0) for i in items) / len(items)
        else:
            avg_value = sum(float(i.amount_eur or 0) for i in items) / len(items)

        req = ResourceRequest(
            project_id=project.id,
            cost_center_id=CC_ID,
            request_type="resource" if category == "internal" else "external_cost",
            role_type_id=sub_cat if category == "internal" else None,
            cost_type_id=sub_cat if category == "external" else None,
            hours_or_amount_per_month=round(avg_value, 2),
            period_start=sorted_items[0].month,
            period_end=sorted_items[-1].month,
            priority="medium",
            status="pending",
        )
        db.add(req)


def _reconcile_resource_requests_from_forecast(db: Session, project: Project):
    """Reconcile ResourceRequest rows with the project's current Forecast data.

    Unlike _create_resource_requests_from_forecast (which deletes everything),
    this function preserves existing requests and their assignments when the
    project is resubmitted after a send-back cycle.  It detects increases and
    decreases and populates original_hours_per_month / change_direction so the
    CC Owner's UI can highlight what changed.
    """
    from services.calculations import generate_month_range

    # 1. Index existing requests by natural key
    existing_requests = db.query(ResourceRequest).filter(
        ResourceRequest.project_id == project.id,
    ).all()

    existing_map: dict[tuple[str, str | None, str | None], ResourceRequest] = {}
    for req in existing_requests:
        key = (req.request_type, req.role_type_id, req.cost_type_id)
        existing_map[key] = req

    # 2. Build new specs from current forecast (same grouping as _create_...)
    forecasts = db.query(Forecast).filter(Forecast.project_id == project.id).all()
    groups: dict[tuple[str, str], list] = defaultdict(list)
    for f in forecasts:
        groups[(f.category, f.sub_category)].append(f)

    CC_ID = "cc-muc-apd"
    seen_keys: set[tuple[str, str | None, str | None]] = set()

    for (category, sub_cat), items in groups.items():
        sorted_items = sorted(items, key=lambda x: x.month)
        request_type = "resource" if category == "internal" else "external_cost"
        role_type_id = sub_cat if category == "internal" else None
        cost_type_id = sub_cat if category == "external" else None
        key = (request_type, role_type_id, cost_type_id)
        seen_keys.add(key)

        if category == "internal":
            new_avg = sum(float(i.hours or 0) for i in items) / len(items)
        else:
            new_avg = sum(float(i.amount_eur or 0) for i in items) / len(items)
        new_avg = round(new_avg, 2)
        new_start = sorted_items[0].month
        new_end = sorted_items[-1].month

        if key in existing_map:
            req = existing_map[key]
            old_avg = round(float(req.hours_or_amount_per_month), 2)

            # Detect change direction
            if abs(new_avg - old_avg) < 0.01:
                req.change_direction = None
                req.original_hours_per_month = None
            elif new_avg > old_avg:
                req.original_hours_per_month = old_avg
                req.change_direction = "increase"
            else:
                req.original_hours_per_month = old_avg
                req.change_direction = "decrease"

            req.hours_or_amount_per_month = new_avg
            req.period_start = new_start
            req.period_end = new_end
            req.status = "pending"

            # Prune assignments outside the new period
            new_months = set(generate_month_range(new_start, new_end))
            for assignment in list(req.assignments):
                if assignment.month not in new_months:
                    db.delete(assignment)
        else:
            # Brand-new role/cost type — create fresh request
            db.add(ResourceRequest(
                project_id=project.id,
                cost_center_id=CC_ID,
                request_type=request_type,
                role_type_id=role_type_id,
                cost_type_id=cost_type_id,
                hours_or_amount_per_month=new_avg,
                period_start=new_start,
                period_end=new_end,
                priority="medium",
                status="pending",
            ))

    # 3. Delete requests that no longer have forecast data (cascades to assignments)
    for key, req in existing_map.items():
        if key not in seen_keys:
            db.delete(req)

    # 4. Clean up Allocations — they'll be recreated when CC confirms again
    db.query(Allocation).filter(Allocation.project_id == project.id).delete()
    db.flush()


def _save_forecast_snapshot(db: Session, project: Project, snapshot_type: str, person_id: str, comments: str | None = None):
    """Save a snapshot of the project's current forecast data."""
    forecasts = db.query(Forecast).filter(Forecast.project_id == project.id).all()
    data = [
        {
            "category": f.category,
            "sub_category": f.sub_category,
            "month": f.month,
            "hours": float(f.hours) if f.hours is not None else None,
            "amount_eur": float(f.amount_eur) if f.amount_eur is not None else 0,
        }
        for f in forecasts
    ]
    # Deactivate previous snapshots of same type for this project
    db.query(ProjectSubmissionSnapshot).filter(
        ProjectSubmissionSnapshot.project_id == project.id,
        ProjectSubmissionSnapshot.snapshot_type == snapshot_type,
        ProjectSubmissionSnapshot.is_active.is_(True),
    ).update({"is_active": False})

    snapshot = ProjectSubmissionSnapshot(
        project_id=project.id,
        snapshot_type=snapshot_type,
        created_by_id=person_id,
        forecast_data_json=json.dumps(data),
        comments=comments,
    )
    db.add(snapshot)
    return snapshot


def _create_notification(db: Session, person_id: str, message: str, severity: str = "action",
                         module: str | None = None, entity_id: str | None = None, tab: str | None = None):
    """Create a notification for a user."""
    notif = Notification(
        user_person_id=person_id,
        message=message,
        severity=severity,
        deep_link_module=module,
        deep_link_entity_id=entity_id,
        deep_link_tab=tab,
    )
    db.add(notif)
    return notif


@router.post("/projects")
def create_project(
    body: ProjectCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Create a new draft project. System auto-calculates estimated cost from blended rates."""
    # Calculate estimated cost from resource plan
    estimated_cost = 0.0
    for item in body.resource_plan:
        # Look up blended rate for this role
        rates = db.query(RateTable).filter(RateTable.role_type_id == item.role_type_id).all()
        if rates:
            avg_rate = sum(float(r.hourly_rate) for r in rates) / len(rates)
        else:
            avg_rate = 80.0  # fallback
        from services.calculations import month_diff
        months = month_diff(item.period_start, item.period_end) + 1
        estimated_cost += avg_rate * item.hours_per_month * months

    # Add external costs
    for item in body.external_costs:
        from services.calculations import month_diff
        months = month_diff(item.period_start, item.period_end) + 1
        estimated_cost += item.amount_per_month * months

    project = Project(
        id=f"proj-{uuid4().hex[:8]}",
        name=body.name,
        description=body.description,
        status="draft",
        capex_opex=body.capex_opex,
        start_month=body.start_month,
        end_month=body.end_month,
        pl_person_id=user.person_id,
        total_budget=round(estimated_cost, 2) if estimated_cost > 0 else None,
    )
    db.add(project)
    db.flush()  # Get project.id before creating assignment

    # Create entity assignment (lob_id now refers to a GroupingEntity)
    from models.organization import ProjectGroupingAssignment
    if body.lob_id:
        assignment = ProjectGroupingAssignment(
            project_id=project.id,
            grouping_entity_id=body.lob_id,
        )
        db.add(assignment)

    # Generate Forecast rows from resource plan and external costs
    from models.financial import Forecast
    from services.calculations import month_diff as _month_diff

    end = body.end_month or add_months(body.start_month, 11)
    num_months = _month_diff(body.start_month, end) + 1

    if body.resource_plan:
        for item in body.resource_plan:
            rates = db.query(RateTable).filter(RateTable.role_type_id == item.role_type_id).all()
            avg_rate = (sum(float(r.hourly_rate) for r in rates) / len(rates)) if rates else 80.0
            item_months = _month_diff(item.period_start, item.period_end) + 1
            for i in range(item_months):
                m = add_months(item.period_start, i)
                db.add(Forecast(
                    project_id=project.id, month=m, category="internal",
                    sub_category=item.role_type_id,
                    hours=item.hours_per_month,
                    amount_eur=round(item.hours_per_month * avg_rate, 2),
                    capex_opex=body.capex_opex,
                ))
    else:
        # No resource plan provided — generate placeholder forecast using a default role
        default_rate = 80.0
        default_hours = 40.0
        for i in range(num_months):
            m = add_months(body.start_month, i)
            db.add(Forecast(
                project_id=project.id, month=m, category="internal",
                sub_category="role-dev",
                hours=default_hours,
                amount_eur=round(default_hours * default_rate, 2),
                capex_opex=body.capex_opex,
            ))
        estimated_cost = default_hours * default_rate * num_months
        project.total_budget = round(estimated_cost, 2)

    for item in body.external_costs:
        item_months = _month_diff(item.period_start, item.period_end) + 1
        for i in range(item_months):
            m = add_months(item.period_start, i)
            db.add(Forecast(
                project_id=project.id, month=m, category="external",
                sub_category=item.cost_type_id,
                hours=None,
                amount_eur=round(item.amount_per_month, 2),
                capex_opex=body.capex_opex,
            ))

    db.commit()
    db.refresh(project)

    return {
        "id": project.id,
        "name": project.name,
        "status": project.status,
        "estimated_cost": round(estimated_cost, 2),
    }


@router.put("/projects/{project_id}/submit")
def submit_project(
    project_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Submit a project for CC confirmation (draft -> pending_cc_confirmation)."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    if project.status not in ("draft",):
        raise HTTPException(409, f"Project is in '{project.status}' state, expected 'draft'")
    if project.pl_person_id != user.person_id and user.role != "controller":
        raise HTTPException(403, "Only the project lead or controller can submit")

    # Save original snapshot
    _save_forecast_snapshot(db, project, "original", user.person_id)

    # Create resource requests from forecast data
    _create_resource_requests_from_forecast(db, project)

    # Update status
    project.status = "pending_cc_confirmation"
    project.submission_feedback = None

    # Notify CC Owner (Thomas Brenner = p-brenner)
    _create_notification(
        db, "p-brenner",
        f"Project '{project.name}' needs resource confirmation",
        severity="action",
        module="capacity",
        entity_id=project.id,
        tab="requests",
    )

    db.commit()
    db.refresh(project)

    return {
        "id": project.id,
        "name": project.name,
        "status": project.status,
    }


@router.get("/projects/{project_id}")
def get_project_draft(
    project_id: str,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """Fetch a project's metadata for the resource plan page."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    return {
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "lob_id": _get_project_entity_id(db, project.id),
        "lob_name": _get_project_lob_name(db, project.id),
        "start_month": project.start_month,
        "end_month": project.end_month,
        "status": project.status,
        "capex_opex": project.capex_opex,
        "submission_feedback": project.submission_feedback,
    }


@router.get("/projects/{project_id}/resource-plan")
def get_project_forecast_for_edit(
    project_id: str,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """Return forecast rows grouped by line item for the resource plan grid."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")

    forecasts = db.query(Forecast).filter(Forecast.project_id == project_id).all()

    # Collect all months
    all_months = sorted(set(f.month for f in forecasts))

    # Group by (category, sub_category)
    groups: dict[tuple[str, str], list] = defaultdict(list)
    for f in forecasts:
        groups[(f.category, f.sub_category)].append(f)

    # Resolve names
    from models.financial import ExternalCostType
    role_names = {r.id: r.name for r in db.query(RoleType).all()}
    cost_type_names = {c.id: c.name for c in db.query(ExternalCostType).all()}

    # Get rates for EUR calculation
    rate_map: dict[str, float] = {}
    for role_id in set(k[1] for k in groups if k[0] == "internal"):
        rates = db.query(RateTable).filter(RateTable.role_type_id == role_id).all()
        rate_map[role_id] = (sum(float(r.hourly_rate) for r in rates) / len(rates)) if rates else 80.0

    rows = []
    for (category, sub_cat), items in groups.items():
        if category == "internal":
            name = role_names.get(sub_cat, sub_cat)
            unit = "hours"
            rate = rate_map.get(sub_cat, 80.0)
        else:
            name = cost_type_names.get(sub_cat, sub_cat)
            unit = "eur"
            rate = 1.0

        month_map = {f.month: f for f in items}
        months_data = []
        total = 0.0
        total_eur = 0.0
        for m in all_months:
            f = month_map.get(m)
            if f:
                val = float(f.hours or 0) if category == "internal" else float(f.amount_eur or 0)
                val_eur = float(f.amount_eur or 0)
            else:
                val = 0.0
                val_eur = 0.0
            months_data.append({"month": m, "value": val, "value_eur": val_eur})
            total += val
            total_eur += val_eur

        rows.append({
            "id": f"{category}:{sub_cat}",
            "name": name,
            "category": category,
            "sub_category": sub_cat,
            "unit": unit,
            "rate": rate,
            "months": months_data,
            "total": round(total, 2),
            "total_eur": round(total_eur, 2),
        })

    return {"months": all_months, "rows": rows}
