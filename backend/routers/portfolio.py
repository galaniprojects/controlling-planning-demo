"""Portfolio Overview endpoints (Section 10.3) — 14 endpoints."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from config import DEMO_DATE
from database import get_db
from dependencies import get_current_user, require_role
from models.change_requests import ChangeRequest, CRChangeDetail
from models.financial import Actuals, Baseline, Forecast
from models.projects import Project
from models.users import DemoPersona
from schemas.common import CurrentUser
from schemas.portfolio import (
    ApprovalAction,
    ApprovalItem,
    BudgetSnapshot,
    CRChangeDetailResponse,
    CRDetailResponse,
    DetailViewGridData,
    DetailViewKPISchema,
    DetailViewLineItemSchema,
    DetailViewMonthValue,
    IntakeDetail,
    IntakeItem,
    ProjectSummary,
    RejectAction,
    SendBackAction,
    TimelineInfo,
)
from services.portfolio_service import (
    build_portfolio_tree,
    compute_portfolio_kpis,
    compute_project_financials,
)

router = APIRouter(prefix="/api/portfolio", tags=["Portfolio Overview"])


# ---------------------------------------------------------------------------
# Dashboard (4 endpoints)
# ---------------------------------------------------------------------------

@router.get("/kpis")
def get_portfolio_kpis(
    lob: str | None = None,
    grouping_entity: str | None = None,
    status: str | None = None,
    rag: str | None = None,
    type: str | None = None,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """Get portfolio-level KPI summary (optionally filtered)."""
    filters = {}
    if grouping_entity:
        filters["grouping_entity"] = grouping_entity
    elif lob:
        filters["lob"] = lob
    if status:
        filters["status"] = status
    if rag:
        filters["rag"] = rag
    if type:
        filters["type"] = type

    kpis = compute_portfolio_kpis(db, filters)

    # Build project filter for CapEx/OpEx split
    proj_filter = [Project.is_active.is_(True)]
    if grouping_entity:
        from services.portfolio_service import _get_projects_for_entity_recursive
        ge_pids = _get_projects_for_entity_recursive(db, grouping_entity)
        if ge_pids:
            proj_filter.append(Project.id.in_(ge_pids))
    elif lob:
        proj_filter.append(Project.lob_id == lob)
    if status:
        proj_filter.append(Project.status == status)
    if rag:
        proj_filter.append(Project.rag_status == rag)
    if type:
        if type == "service":
            proj_filter.append(Project.is_service.is_(True))
        elif type == "project":
            proj_filter.append(Project.is_service.is_(False))

    # CY-scoped CapEx/OpEx split
    cy_start, cy_end = "2026-01", "2026-12"
    total_forecast = (
        db.query(func.coalesce(func.sum(Forecast.amount_eur), 0))
        .join(Project, Forecast.project_id == Project.id)
        .filter(*proj_filter, Forecast.month >= cy_start, Forecast.month <= cy_end)
        .scalar()
    )

    capex_forecast = (
        db.query(func.coalesce(func.sum(Forecast.amount_eur), 0))
        .join(Project, Forecast.project_id == Project.id)
        .filter(*proj_filter, Project.capex_opex == "capex",
                Forecast.month >= cy_start, Forecast.month <= cy_end)
        .scalar()
    )
    opex_forecast = float(total_forecast) - float(capex_forecast)

    capex_val = round(float(capex_forecast), 2)
    opex_val = round(opex_forecast, 2)
    total_co = capex_val + opex_val
    capex_pct = round(capex_val / total_co * 100) if total_co > 0 else 0
    opex_pct = 100 - capex_pct

    return {
        "baseline": kpis["baseline"],
        "current_forecast": kpis["current_forecast"],
        "ytd_actuals": kpis["ytd_actuals"],
        "plan_drift_amount": kpis["plan_drift_amount"],
        "plan_drift_pct": kpis["plan_drift_pct"],
        "capex_total": capex_val,
        "opex_total": opex_val,
        "capex_pct": capex_pct,
        "opex_pct": opex_pct,
        "run_total": kpis["run_total"],
        "change_total": kpis["change_total"],
        "run_pct": kpis["run_pct"],
        "change_pct": kpis["change_pct"],
        "lifetime_baseline": kpis["lifetime_baseline"],
        "lifetime_forecast": kpis["lifetime_forecast"],
        "lifetime_actuals": kpis["lifetime_actuals"],
        "active_project_count": kpis["active_project_count"],
    }


@router.get("/projects")
def get_portfolio_tree(
    lob: str | None = None,
    grouping_entity: str | None = None,
    status: str | None = None,
    rag: str | None = None,
    type: str | None = None,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Get hierarchical portfolio tree (LoB -> Program -> Project)."""
    filters = {}
    if grouping_entity:
        filters["grouping_entity"] = grouping_entity
    elif lob:
        filters["lob"] = lob
    if status:
        filters["status"] = status
    if rag:
        filters["rag"] = rag
    if type:
        filters["type"] = type

    tree = build_portfolio_tree(db, filters)
    return {"items": tree, "total": len(tree)}


@router.get("/projects/{project_id}/summary")
def get_project_summary(
    project_id: str,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """Get project summary panel data."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")

    fins = compute_project_financials(db, project_id)

    # Last CR summary
    last_cr = (
        db.query(ChangeRequest)
        .filter(ChangeRequest.project_id == project_id)
        .order_by(ChangeRequest.submission_timestamp.desc())
        .first()
    )
    last_cr_summary = None
    if last_cr:
        last_cr_summary = f"{last_cr.change_category}: {last_cr.summary} ({last_cr.status})"

    # Forecast sparkline (monthly forecast amounts)
    sparkline_rows = (
        db.query(Forecast.month, func.sum(Forecast.amount_eur).label("total"))
        .filter(Forecast.project_id == project_id)
        .group_by(Forecast.month)
        .order_by(Forecast.month)
        .all()
    )
    sparkline = [{"month": r.month, "amount": round(float(r.total), 2)} for r in sparkline_rows]

    return ProjectSummary(
        id=project.id,
        name=project.name,
        rag=project.rag_status,
        budget_snapshot=BudgetSnapshot(
            baseline=fins["baseline_total"],
            forecast=fins["forecast_total"],
            actuals_ytd=fins["actuals_ytd"],
            plan_drift_pct=fins["plan_drift_pct"],
        ),
        timeline=TimelineInfo(
            start=project.start_month,
            end=project.end_month,
            projected_end=project.projected_end_month,
        ),
        last_cr_summary=last_cr_summary,
        forecast_sparkline=sparkline,
    )


@router.get("/charts")
def get_dashboard_charts(
    lob: str | None = None,
    grouping_entity: str | None = None,
    status: str | None = None,
    rag: str | None = None,
    cost_center: str | None = None,
    project_type: str | None = None,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """Get chart data for portfolio dashboard."""
    from models.organization import LineOfBusiness
    from models.people import Person
    from models.capacity import Allocation

    # Build set of project IDs matching all filters
    pq = db.query(Project.id).filter(Project.is_active.is_(True))
    if grouping_entity:
        from services.portfolio_service import _get_projects_for_entity_recursive
        ge_pids = _get_projects_for_entity_recursive(db, grouping_entity)
        if ge_pids:
            pq = pq.filter(Project.id.in_(ge_pids))
        else:
            pq = pq.filter(False)
    elif lob:
        pq = pq.filter(Project.lob_id == lob)
    if status:
        pq = pq.filter(Project.status == status)
    if rag:
        pq = pq.filter(Project.rag_status == rag)
    if project_type:
        pq = pq.filter(Project.project_type == project_type)
    if cost_center:
        person_ids = [r[0] for r in db.query(Person.id).filter(Person.cost_center_id == cost_center).all()]
        if person_ids:
            alloc_pids = [r[0] for r in db.query(Allocation.project_id).filter(Allocation.person_id.in_(person_ids)).distinct().all()]
            pq = pq.filter(Project.id.in_(alloc_pids))
        else:
            pq = pq.filter(False)  # no matches
    filtered_pids = [r[0] for r in pq.all()]

    # Forecast by LoB (current fiscal year)
    cy_prefix = "2026"
    lobs = db.query(LineOfBusiness).all()
    forecast_by_lob = []
    for l in lobs:
        lob_pids = [r[0] for r in db.query(Project.id).filter(Project.lob_id == l.id, Project.id.in_(filtered_pids)).all()]
        if not lob_pids:
            forecast_by_lob.append({"lob_id": l.id, "lob_name": l.name, "forecast": 0, "baseline": 0})
            continue
        fc_total = float(db.query(func.coalesce(func.sum(Forecast.amount_eur), 0)).filter(
            Forecast.project_id.in_(lob_pids),
            func.substr(Forecast.month, 1, 4) == cy_prefix,
        ).scalar())
        bl_total = float(db.query(func.coalesce(func.sum(Baseline.amount_eur), 0)).filter(
            Baseline.project_id.in_(lob_pids),
            func.substr(Baseline.month, 1, 4) == cy_prefix,
        ).scalar())
        forecast_by_lob.append({"lob_id": l.id, "lob_name": l.name, "forecast": round(fc_total, 2), "baseline": round(bl_total, 2)})

    # Forecast trajectory (cumulative baseline + forecast + actuals)
    fc_q = db.query(Forecast.month, func.sum(Forecast.amount_eur).label("total")).filter(Forecast.project_id.in_(filtered_pids)).group_by(Forecast.month).order_by(Forecast.month)
    bl_q = db.query(Baseline.month, func.sum(Baseline.amount_eur).label("total")).filter(Baseline.project_id.in_(filtered_pids)).group_by(Baseline.month).order_by(Baseline.month)
    ac_q = db.query(Actuals.month, func.sum(Actuals.amount_eur).label("total")).filter(Actuals.month <= DEMO_DATE, Actuals.project_id.in_(filtered_pids)).group_by(Actuals.month).order_by(Actuals.month)
    fc_map = {r.month: float(r.total) for r in fc_q.all()}
    bl_map = {r.month: float(r.total) for r in bl_q.all()}
    ac_map = {r.month: float(r.total) for r in ac_q.all()}
    all_months = sorted(set(fc_map) | set(bl_map) | set(ac_map))
    cum_bl = cum_fc = cum_ac = 0.0
    forecast_trajectory = []
    for m in all_months:
        cum_bl += bl_map.get(m, 0)
        cum_fc += fc_map.get(m, 0)
        point = {"month": m, "baseline": round(cum_bl, 2), "forecast": round(cum_fc, 2)}
        if m in ac_map:
            cum_ac += ac_map[m]
            point["actuals"] = round(cum_ac, 2)
        else:
            point["actuals"] = None
        forecast_trajectory.append(point)

    # RAG distribution
    rag_dist = (
        db.query(Project.rag_status, func.count(Project.id))
        .filter(Project.id.in_(filtered_pids), Project.rag_status.isnot(None))
        .group_by(Project.rag_status)
        .all()
    )
    rag_distribution = {status: count for status, count in rag_dist}

    return {
        "forecast_by_lob": forecast_by_lob,
        "forecast_trajectory": forecast_trajectory,
        "rag_distribution": rag_distribution,
    }


# ---------------------------------------------------------------------------
# Intake Queue (5 endpoints)
# ---------------------------------------------------------------------------

@router.get("/intake")
def get_intake_queue(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Get pending project submissions (includes changes_requested)."""
    query = db.query(Project).filter(
        Project.status.in_(["pending_approval", "changes_requested"])
    )

    # PL sees only own submissions
    if user.role == "project_lead":
        query = query.filter(Project.pl_person_id == user.person_id)

    projects = query.all()
    items = [
        IntakeItem(
            project_id=p.id,
            name=p.name,
            submitted_by=p.pl.name if p.pl else None,
            lob=p.lob.name if p.lob else p.lob_id,
            estimated_budget=float(p.total_budget) if p.total_budget else None,
            submission_date=str(p.created_at) if p.created_at else None,
            status=p.status,
        )
        for p in projects
    ]
    return {"items": items, "total": len(items)}


@router.get("/intake/{project_id}")
def get_intake_detail(
    project_id: str,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """Get full detail of a pending submission including resource/cost plans."""
    from models.people import RoleType
    from models.financial import ExternalCostType

    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")

    # Resource plan: internal forecast rows grouped by role
    internal_rows = (
        db.query(Forecast.sub_category, Forecast.month, Forecast.hours, Forecast.amount_eur)
        .filter(Forecast.project_id == project_id, Forecast.category == "internal")
        .order_by(Forecast.sub_category, Forecast.month)
        .all()
    )
    resource_plan: dict[str, dict] = {}
    for row in internal_rows:
        role = db.query(RoleType).filter(RoleType.id == row.sub_category).first()
        role_name = role.name if role else row.sub_category
        if row.sub_category not in resource_plan:
            resource_plan[row.sub_category] = {
                "role_id": row.sub_category, "role_name": role_name,
                "months": [], "total_hours": 0, "total_amount": 0,
            }
        resource_plan[row.sub_category]["months"].append({
            "month": row.month, "hours": float(row.hours or 0),
            "amount": round(float(row.amount_eur), 2),
        })
        resource_plan[row.sub_category]["total_hours"] += float(row.hours or 0)
        resource_plan[row.sub_category]["total_amount"] += float(row.amount_eur)
    for rp in resource_plan.values():
        rp["total_hours"] = round(rp["total_hours"], 1)
        rp["total_amount"] = round(rp["total_amount"], 2)

    # External cost plan
    external_rows = (
        db.query(Forecast.sub_category, Forecast.month, Forecast.amount_eur)
        .filter(Forecast.project_id == project_id, Forecast.category == "external")
        .order_by(Forecast.sub_category, Forecast.month)
        .all()
    )
    external_plan: dict[str, dict] = {}
    for row in external_rows:
        ct = db.query(ExternalCostType).filter(ExternalCostType.id == row.sub_category).first()
        ct_name = ct.name if ct else row.sub_category
        if row.sub_category not in external_plan:
            external_plan[row.sub_category] = {
                "cost_type_id": row.sub_category, "cost_type_name": ct_name,
                "months": [], "total_amount": 0,
            }
        external_plan[row.sub_category]["months"].append({
            "month": row.month, "amount": round(float(row.amount_eur), 2),
        })
        external_plan[row.sub_category]["total_amount"] += float(row.amount_eur)
    for ep in external_plan.values():
        ep["total_amount"] = round(ep["total_amount"], 2)

    # Budget summary
    internal_total = sum(rp["total_amount"] for rp in resource_plan.values())
    external_total = sum(ep["total_amount"] for ep in external_plan.values())

    # Build grid_data for detail view
    all_grid_months: set[str] = set()
    grid_line_items = []

    for rp in resource_plan.values():
        month_values = []
        for m in rp["months"]:
            all_grid_months.add(m["month"])
            month_values.append(DetailViewMonthValue(
                month=m["month"],
                proposed=m["hours"],
                proposed_eur=m["amount"],
            ))
        month_values.sort(key=lambda mv: mv.month)
        grid_line_items.append(DetailViewLineItemSchema(
            id=rp["role_id"],
            name=rp["role_name"],
            category="internal",
            unit="hours",
            months=month_values,
            proposed_total=rp["total_hours"],
            proposed_total_eur=rp["total_amount"],
        ))

    for ep in external_plan.values():
        month_values = []
        for m in ep["months"]:
            all_grid_months.add(m["month"])
            month_values.append(DetailViewMonthValue(
                month=m["month"],
                proposed=m["amount"],
                proposed_eur=m["amount"],
            ))
        month_values.sort(key=lambda mv: mv.month)
        grid_line_items.append(DetailViewLineItemSchema(
            id=ep["cost_type_id"],
            name=ep["cost_type_name"],
            category="external",
            unit="eur",
            months=month_values,
            proposed_total=ep["total_amount"],
            proposed_total_eur=ep["total_amount"],
        ))

    grid_kpis = [
        DetailViewKPISchema(label="Total Internal", value=round(internal_total, 2), format="currency", color="#334155"),
        DetailViewKPISchema(label="Total External", value=round(external_total, 2), format="currency", color="#334155"),
        DetailViewKPISchema(label="Grand Total", value=round(internal_total + external_total, 2), format="currency", color="#1e40af"),
    ]

    grid_data = DetailViewGridData(
        months=sorted(all_grid_months),
        line_items=grid_line_items,
        kpis=grid_kpis,
    )

    return {
        "project_id": project.id,
        "name": project.name,
        "description": project.description,
        "lob_id": project.lob_id,
        "lob_name": project.lob.name if project.lob else "",
        "start_month": project.start_month,
        "end_month": project.end_month,
        "estimated_budget": float(project.total_budget) if project.total_budget else None,
        "capex_opex": project.capex_opex,
        "status": project.status,
        "pl_name": project.pl.name if project.pl else None,
        "resource_plan": list(resource_plan.values()),
        "external_cost_plan": list(external_plan.values()),
        "budget_summary": {
            "internal_total": round(internal_total, 2),
            "external_total": round(external_total, 2),
            "grand_total": round(internal_total + external_total, 2),
            "capex_opex": project.capex_opex,
        },
        "grid_data": grid_data.model_dump(),
    }


@router.put("/intake/{project_id}/approve")
def approve_project(
    project_id: str,
    body: ApprovalAction | None = None,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Approve a pending project submission."""
    from models.system import Notification

    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    if project.status != "pending_approval":
        raise HTTPException(409, f"Project status is '{project.status}', expected 'pending_approval'")

    # 1. Change status to active
    project.status = "active"
    project.rag_status = "green"  # New projects start green

    # 2. Generate baseline values from submitted forecast data
    forecasts = db.query(Forecast).filter(Forecast.project_id == project_id).all()
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

    # Calculate total budget from baselines
    total_budget = sum(float(f.amount_eur or 0) for f in forecasts)
    if total_budget > 0:
        project.total_budget = round(total_budget, 2)

    # 3. Create notification for the submitting PL (action type #8)
    if project.pl_person_id:
        notification = Notification(
            user_person_id=project.pl_person_id,
            message=f"Your project \"{project.name}\" has been approved and is now active.",
            severity="info",
            deep_link_module="project_workbench",
            deep_link_entity_id=project.id,
        )
        db.add(notification)

    db.commit()
    db.refresh(project)

    return {"id": project.id, "name": project.name, "status": project.status}


@router.put("/intake/{project_id}/reject")
def reject_project(
    project_id: str,
    body: RejectAction,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Reject a pending project submission."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    if project.status != "pending_approval":
        raise HTTPException(409, f"Project status is '{project.status}', expected 'pending_approval'")

    project.status = "rejected"
    db.commit()
    db.refresh(project)

    return {"id": project.id, "name": project.name, "status": project.status}


@router.put("/intake/{project_id}/send-back")
def send_back_project(
    project_id: str,
    body: SendBackAction,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Send a pending project submission back for revision with feedback."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    if project.status not in ("pending_approval",):
        raise HTTPException(409, f"Project status is '{project.status}', expected 'pending_approval'")

    project.status = "changes_requested"
    # Store controller feedback as description suffix (simple approach for demo)
    if body.comments:
        project.description = (project.description or "") + f"\n\n--- Controller Feedback ---\n{body.comments}"

    # Create notification for the PL
    if project.pl_person_id:
        from models.system import Notification
        notification = Notification(
            user_person_id=project.pl_person_id,
            message=f"Your submission '{project.name}' has been sent back for revision.",
            severity="action",
            deep_link_module="portfolio",
            deep_link_entity_id=project.id,
        )
        db.add(notification)

    db.commit()
    db.refresh(project)

    return {"id": project.id, "name": project.name, "status": project.status}


@router.put("/intake/{project_id}/resubmit")
def resubmit_project(
    project_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("project_lead")),
):
    """PL resubmits a project after addressing controller feedback."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    if project.status != "changes_requested":
        raise HTTPException(409, f"Project status is '{project.status}', expected 'changes_requested'")

    project.status = "pending_approval"

    # Notify controller
    from models.system import Notification
    # Find any controller persona's person_id
    controller = db.query(DemoPersona).filter(DemoPersona.role == "controller").first()
    if controller:
        notification = Notification(
            user_person_id=controller.person_id,
            message=f"Project '{project.name}' has been resubmitted for approval.",
            severity="action",
            deep_link_module="portfolio",
            deep_link_entity_id=project.id,
        )
        db.add(notification)

    db.commit()
    db.refresh(project)

    return {"id": project.id, "name": project.name, "status": project.status}


# ---------------------------------------------------------------------------
# Approvals (5 endpoints)
# ---------------------------------------------------------------------------

def _build_cr_grid_data(cr: ChangeRequest, db: Session) -> DetailViewGridData | None:
    """Transform CR change details into detail view grid data.

    Identifies numeric value changes by checking that line_item_type and month
    are set and old_value/new_value are parseable as numbers. Groups changes by
    line_item_type to produce one DetailViewLineItem per affected line item.
    """
    from collections import defaultdict
    from models.people import RoleType, RateTable
    from models.financial import ExternalCostType

    # Filter to numeric monthly value changes only
    value_changes = [
        d for d in cr.change_details
        if d.line_item_type and d.month and _is_numeric(d.old_value, d.new_value)
    ]
    if not value_changes:
        return None

    # Group by line_item_type for multi-line-item CRs
    groups: dict[str, list] = defaultdict(list)
    for d in value_changes:
        groups[d.line_item_type].append(d)

    # Cache label lookups
    role_names: dict[str, str] = {}
    ext_names: dict[str, str] = {}

    all_months: set[str] = set()
    line_items: list[DetailViewLineItemSchema] = []
    total_current_eur = 0.0
    total_proposed_eur = 0.0

    for lit, details in groups.items():
        is_resource = lit.startswith("role-")

        # Resolve display name
        if is_resource:
            if lit not in role_names:
                role = db.query(RoleType).filter(RoleType.id == lit).first()
                role_names[lit] = role.name if role else lit.replace("role-", "").replace("-", " ").title()
            label = role_names[lit]
        else:
            if lit not in ext_names:
                ct = db.query(ExternalCostType).filter(ExternalCostType.id == lit).first()
                ext_names[lit] = ct.name if ct else lit.replace("ext-", "").replace("-", " ").title()
            label = ext_names[lit]

        # Look up hourly rate for resource line items
        hourly_rate = 120.0
        if is_resource:
            rate_row = (
                db.query(RateTable)
                .filter(RateTable.role_type_id == lit)
                .order_by(RateTable.effective_date.desc())
                .first()
            )
            if rate_row:
                hourly_rate = float(rate_row.hourly_rate)

        # Build month values for this line item
        month_values: list[DetailViewMonthValue] = []
        for d in details:
            old_v = _parse_numeric(d.old_value)
            new_v = _parse_numeric(d.new_value)
            all_months.add(d.month)

            if is_resource:
                month_values.append(DetailViewMonthValue(
                    month=d.month,
                    proposed=new_v,
                    proposed_eur=new_v * hourly_rate,
                    current=old_v,
                    current_eur=old_v * hourly_rate,
                    is_changed=old_v != new_v,
                ))
            else:
                month_values.append(DetailViewMonthValue(
                    month=d.month,
                    proposed=new_v,
                    proposed_eur=new_v,
                    current=old_v,
                    current_eur=old_v,
                    is_changed=old_v != new_v,
                ))

        month_values.sort(key=lambda mv: mv.month)

        proposed_total = sum(mv.proposed for mv in month_values)
        current_total = sum((mv.current or 0) for mv in month_values)
        proposed_total_eur = sum(mv.proposed_eur for mv in month_values)
        current_total_eur = sum((mv.current_eur or 0) for mv in month_values)

        total_current_eur += current_total_eur
        total_proposed_eur += proposed_total_eur

        line_items.append(DetailViewLineItemSchema(
            id=lit,
            name=label,
            category="internal" if is_resource else "external",
            unit="hours" if is_resource else "eur",
            months=month_values,
            proposed_total=round(proposed_total, 1),
            proposed_total_eur=round(proposed_total_eur, 2),
            current_total=round(current_total, 1),
            current_total_eur=round(current_total_eur, 2),
        ))

    # KPIs
    delta_eur = total_proposed_eur - total_current_eur
    delta_color = "#059669" if delta_eur < 0 else "#dc2626" if delta_eur > 0 else "#334155"
    delta_pct = (
        round((delta_eur / total_current_eur) * 100, 1)
        if total_current_eur != 0 else 0.0
    )
    kpis = [
        DetailViewKPISchema(
            label="Affected Lines (Current)",
            value=round(total_current_eur, 2),
            format="currency",
            color="#334155",
        ),
        DetailViewKPISchema(
            label="Affected Lines (Proposed)",
            value=round(total_proposed_eur, 2),
            format="currency",
            color="#1e40af",
        ),
        DetailViewKPISchema(
            label="Total Impact",
            value=round(delta_eur, 2),
            format="currency_delta",
            color=delta_color,
            secondary_label=f"{'+' if delta_pct > 0 else ''}{str(delta_pct).replace('.', ',')}%",
        ),
    ]

    sorted_months = sorted(all_months)
    return DetailViewGridData(
        months=sorted_months,
        line_items=line_items,
        kpis=kpis,
    )


def _is_numeric(old_val: str | None, new_val: str | None) -> bool:
    """Check if at least one of old/new values is parseable as a number."""
    for v in (old_val, new_val):
        if v and v != "NULL":
            try:
                float(v.replace("€", "").replace(",", "").replace(" ", "").strip())
                return True
            except (ValueError, AttributeError):
                continue
    return False


def _parse_numeric(val: str | None) -> float:
    """Parse a string value to float, handling common formats."""
    if not val or val == "NULL":
        return 0.0
    try:
        cleaned = val.replace("€", "").replace(",", "").replace(" ", "").strip()
        return float(cleaned)
    except (ValueError, AttributeError):
        return 0.0


def _build_cr_detail(cr: ChangeRequest, db: Session | None = None) -> CRDetailResponse:
    """Build a full CR detail response."""
    grid_data = _build_cr_grid_data(cr, db) if db else None
    return CRDetailResponse(
        id=cr.id,
        project_id=cr.project_id,
        project_name=cr.project.name if cr.project else "",
        status=cr.status,
        change_category=cr.change_category,
        summary=cr.summary,
        justification=cr.justification,
        is_system_suggested=cr.is_system_suggested,
        submitted_by=cr.submitted_by.name if cr.submitted_by else "",
        submission_date=str(cr.submission_timestamp),
        cc_owner=cr.cc_owner.name if cr.cc_owner else None,
        cc_status=cr.cc_status,
        cc_comments=cr.cc_comments,
        controller=cr.controller.name if cr.controller else None,
        controller_status=cr.controller_status,
        controller_comments=cr.controller_comments,
        changes=[
            CRChangeDetailResponse(
                field_changed=d.field_changed,
                old_value=d.old_value,
                new_value=d.new_value,
                delta=d.delta,
                line_item_type=d.line_item_type,
                month=d.month,
            )
            for d in cr.change_details
        ],
        grid_data=grid_data,
    )


@router.get("/approvals")
def get_pending_approvals(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Get CRs pending controller approval (Stage 2 only)."""
    crs = (
        db.query(ChangeRequest)
        .filter(ChangeRequest.status == "pending_controller_approval")
        .order_by(ChangeRequest.submission_timestamp.desc())
        .all()
    )

    from routers.workbench import _compute_cr_impact_eur

    items = []
    for cr in crs:
        items.append(
            ApprovalItem(
                cr_id=cr.id,
                project_id=cr.project_id,
                project_name=cr.project.name if cr.project else "",
                summary=cr.summary,
                submitted_by=cr.submitted_by.name if cr.submitted_by else "",
                confirmed_by_cc_owner=cr.cc_owner.name if cr.cc_owner else None,
                impact_eur_delta=_compute_cr_impact_eur(cr, db),
                submission_date=str(cr.submission_timestamp),
                system_suggested=cr.is_system_suggested,
            )
        )
    return {"items": items, "total": len(items)}


@router.get("/approvals/{cr_id}")
def get_approval_detail(
    cr_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Get full CR detail for approval."""
    cr = db.query(ChangeRequest).filter(ChangeRequest.id == cr_id).first()
    if not cr:
        raise HTTPException(404, "Change request not found")
    return _build_cr_detail(cr, db)


@router.put("/approvals/{cr_id}/approve")
def approve_cr(
    cr_id: int,
    body: ApprovalAction | None = None,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Approve a change request (updates forecast)."""
    cr = db.query(ChangeRequest).filter(ChangeRequest.id == cr_id).first()
    if not cr:
        raise HTTPException(404, "Change request not found")
    if cr.status != "pending_controller_approval":
        raise HTTPException(409, f"CR status is '{cr.status}', expected 'pending_controller_approval'")

    cr.status = "approved"
    cr.controller_id = user.person_id
    cr.controller_status = "approved"
    cr.controller_approval_timestamp = datetime.utcnow()
    if body and body.comments:
        cr.controller_comments = body.comments

    # Update forecast rows from change details
    for detail in cr.change_details:
        if detail.month and detail.new_value:
            row = (
                db.query(Forecast)
                .filter(
                    Forecast.project_id == cr.project_id,
                    Forecast.month == detail.month,
                    Forecast.sub_category == detail.field_changed,
                )
                .first()
            )
            if row:
                try:
                    row.amount_eur = float(detail.new_value.replace("€", "").replace(",", "").strip())
                except (ValueError, AttributeError):
                    pass

    db.commit()
    return _build_cr_detail(cr, db)


@router.put("/approvals/{cr_id}/reject")
def reject_cr(
    cr_id: int,
    body: RejectAction,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Reject a change request."""
    cr = db.query(ChangeRequest).filter(ChangeRequest.id == cr_id).first()
    if not cr:
        raise HTTPException(404, "Change request not found")
    if cr.status != "pending_controller_approval":
        raise HTTPException(409, f"CR status is '{cr.status}', expected 'pending_controller_approval'")

    cr.status = "rejected"
    cr.controller_id = user.person_id
    cr.controller_status = "rejected"
    cr.controller_approval_timestamp = datetime.utcnow()
    cr.controller_comments = body.reason
    db.commit()
    return _build_cr_detail(cr, db)


@router.put("/approvals/{cr_id}/send-back")
def send_back_cr(
    cr_id: int,
    body: SendBackAction,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Send a change request back for revision."""
    cr = db.query(ChangeRequest).filter(ChangeRequest.id == cr_id).first()
    if not cr:
        raise HTTPException(404, "Change request not found")
    if cr.status != "pending_controller_approval":
        raise HTTPException(409, f"CR status is '{cr.status}', expected 'pending_controller_approval'")

    cr.status = "sent_back_by_controller"
    cr.controller_id = user.person_id
    cr.controller_status = "sent_back"
    cr.controller_comments = body.comments
    db.commit()
    return _build_cr_detail(cr, db)
