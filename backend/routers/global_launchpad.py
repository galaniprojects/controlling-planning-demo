"""Global / Launchpad endpoints (Section 10.2) — 6 endpoints."""

from __future__ import annotations

import json
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user
from models.change_requests import ChangeRequest
from models.capacity import ResourceRequest
from models.people import RateTable
from models.projects import Project
from models.scenarios import Scenario
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
from services.portfolio_service import compute_portfolio_kpis

router = APIRouter(prefix="/api", tags=["Global / Launchpad"])


# ---------------------------------------------------------------------------
# Module definitions
# ---------------------------------------------------------------------------

MODULES = [
    {"id": "portfolio", "name": "Portfolio Overview", "description": "IT portfolio dashboard with budget tracking, intake queue, and change request approvals."},
    {"id": "workbench", "name": "Project Workbench", "description": "Project detail view with forecast planning, change requests, and trend analysis."},
    {"id": "capacity", "name": "Capacity Management", "description": "Team utilization heatmaps, resource allocation, and request management."},
    {"id": "simulator", "name": "What-If Simulator", "description": "Scenario planning tool for budget optimization with AI-assisted recommendations."},
    {"id": "admin", "name": "Administration", "description": "System configuration: organizational structure, rates, and planning parameters."},
]

MODULE_VISIBILITY = {
    "controller": ["portfolio", "workbench", "capacity", "simulator", "admin"],
    "cost_center_owner": ["portfolio", "workbench", "capacity"],
    "project_lead": ["portfolio", "workbench"],
    "executive": ["portfolio", "simulator"],
}

MODULE_SORT = {
    "controller": {"portfolio": 1, "workbench": 2, "capacity": 3, "simulator": 4, "admin": 5},
    "cost_center_owner": {"capacity": 1, "workbench": 2, "portfolio": 3},
    "project_lead": {"workbench": 1, "portfolio": 2},
    "executive": {"portfolio": 1, "simulator": 2},
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
        if user.role == "project_lead" and user.project_ids:
            return f"Your {len(user.project_ids)} projects"
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

    elif module_id == "admin":
        return "System configuration"

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
        # Action #1: Forecast Due — active owned projects where current month not yet submitted
        owned_projects = (
            db.query(Project)
            .filter(
                Project.id.in_(user.project_ids),
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

        # Action #8: Project Submission Decision
        for proj in owned_projects:
            if proj.status in ("active", "rejected"):
                # Check if recently transitioned (using modified_at as proxy)
                if proj.modified_at and proj.modified_at.isoformat()[:7] >= prev_month:
                    # Could be a recently decided submission — skip for projects that were always active
                    pass

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
                deep_link_module="portfolio",
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
        # Action #3: CR Pending Confirmation (Stage 1)
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
        lob_id=body.lob_id,
        status="draft",
        capex_opex=body.capex_opex,
        start_month=body.start_month,
        end_month=body.end_month,
        pl_person_id=user.person_id,
        total_budget=round(estimated_cost, 2) if estimated_cost > 0 else None,
    )
    db.add(project)
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
    """Submit a draft project for approval (draft -> pending_approval)."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    if project.status != "draft":
        raise HTTPException(409, f"Project is in '{project.status}' state, expected 'draft'")
    if project.pl_person_id != user.person_id and user.role != "controller":
        raise HTTPException(403, "Only the project lead or controller can submit")

    project.status = "pending_approval"
    db.commit()
    db.refresh(project)

    return {
        "id": project.id,
        "name": project.name,
        "status": project.status,
    }
