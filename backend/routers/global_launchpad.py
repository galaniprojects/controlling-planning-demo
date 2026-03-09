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
from models.system import Notification
from models.users import DemoPersona
from schemas.common import CurrentUser
from schemas.global_launchpad import (
    ModuleTile,
    NotificationResponse,
    ProjectCreate,
    RoleContext,
    RoleInfo,
)
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
    {"id": "reporting", "name": "Reporting", "description": "Cross-cutting analytical reports with export and saved view capabilities."},
    {"id": "admin", "name": "Administration", "description": "System configuration: organizational structure, rates, and planning parameters."},
]

MODULE_VISIBILITY = {
    "controller": ["portfolio", "workbench", "capacity", "simulator", "reporting", "admin"],
    "cost_center_owner": ["portfolio", "workbench", "capacity", "reporting"],
    "project_lead": ["portfolio", "workbench", "reporting"],
    "executive": ["portfolio", "simulator", "reporting"],
}

MODULE_SORT = {
    "controller": {"portfolio": 1, "workbench": 2, "capacity": 3, "simulator": 4, "reporting": 5, "admin": 6},
    "cost_center_owner": {"capacity": 1, "workbench": 2, "portfolio": 3, "reporting": 4},
    "project_lead": {"workbench": 1, "portfolio": 2, "reporting": 3},
    "executive": {"portfolio": 1, "simulator": 2, "reporting": 3},
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

    elif module_id == "reporting":
        return "5 standard reports"

    elif module_id == "admin":
        return "System configuration"

    return ""


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
