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
    status: str | None = None,
    rag: str | None = None,
    type: str | None = None,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """Get portfolio-level KPI summary (optionally filtered)."""
    filters = {}
    if lob:
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
    if lob:
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

    total_forecast = (
        db.query(func.coalesce(func.sum(Forecast.amount_eur), 0))
        .join(Project, Forecast.project_id == Project.id)
        .filter(*proj_filter)
        .scalar()
    )

    # CapEx/OpEx split
    capex_forecast = (
        db.query(func.coalesce(func.sum(Forecast.amount_eur), 0))
        .join(Project, Forecast.project_id == Project.id)
        .filter(*proj_filter, Project.capex_opex == "capex")
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
    }


@router.get("/projects")
def get_portfolio_tree(
    lob: str | None = None,
    status: str | None = None,
    rag: str | None = None,
    type: str | None = None,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Get hierarchical portfolio tree (LoB -> Program -> Project)."""
    filters = {}
    if lob:
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
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """Get chart data for portfolio dashboard."""
    from models.organization import LineOfBusiness

    # Budget by LoB
    lobs = db.query(LineOfBusiness).all()
    budget_by_lob = []
    for l in lobs:
        query = db.query(func.coalesce(func.sum(Project.total_budget), 0)).filter(
            Project.lob_id == l.id, Project.is_active.is_(True)
        )
        budget = float(query.scalar())
        budget_by_lob.append({"lob_id": l.id, "lob_name": l.name, "budget": round(budget, 2)})

    # Forecast trajectory (cumulative baseline + forecast + actuals)
    fc_q = db.query(Forecast.month, func.sum(Forecast.amount_eur).label("total")).group_by(Forecast.month).order_by(Forecast.month)
    bl_q = db.query(Baseline.month, func.sum(Baseline.amount_eur).label("total")).group_by(Baseline.month).order_by(Baseline.month)
    ac_q = db.query(Actuals.month, func.sum(Actuals.amount_eur).label("total")).filter(Actuals.month <= DEMO_DATE).group_by(Actuals.month).order_by(Actuals.month)
    if lob:
        fc_q = fc_q.join(Project, Forecast.project_id == Project.id).filter(Project.lob_id == lob)
        bl_q = bl_q.join(Project, Baseline.project_id == Project.id).filter(Project.lob_id == lob)
        ac_q = ac_q.join(Project, Actuals.project_id == Project.id).filter(Project.lob_id == lob)
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
        .filter(Project.is_active.is_(True), Project.rag_status.isnot(None))
        .group_by(Project.rag_status)
        .all()
    )
    rag_distribution = {status: count for status, count in rag_dist}

    return {
        "budget_by_lob": budget_by_lob,
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
    """Get pending project submissions."""
    query = db.query(Project).filter(Project.status == "pending_approval")

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
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    if project.status != "pending_approval":
        raise HTTPException(409, f"Project status is '{project.status}', expected 'pending_approval'")

    project.status = "active"
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
    """Send a pending project submission back for revision."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    if project.status != "pending_approval":
        raise HTTPException(409, f"Project status is '{project.status}', expected 'pending_approval'")

    project.status = "draft"
    db.commit()
    db.refresh(project)

    return {"id": project.id, "name": project.name, "status": project.status}


# ---------------------------------------------------------------------------
# Approvals (5 endpoints)
# ---------------------------------------------------------------------------

def _build_cr_grid_data(cr: ChangeRequest, db: Session) -> DetailViewGridData | None:
    """Transform CR change details into detail view grid data."""
    from models.people import RoleType
    from models.financial import ExternalCostType

    # Filter to monthly value changes only
    value_changes = [
        d for d in cr.change_details
        if d.month and d.field_changed in ("hours_per_month", "amount_per_month")
    ]
    if not value_changes:
        return None

    # Find companion metadata rows to identify the line item
    meta_rows = [
        d for d in cr.change_details
        if d.field_changed in ("role_added", "cost_type")
    ]
    # Determine line item label from metadata or CR category
    line_item_label = cr.summary  # fallback
    line_item_id = f"cr-{cr.id}"
    is_resource = cr.change_category == "resource"
    is_external = cr.change_category == "external_cost"

    for meta in meta_rows:
        if meta.field_changed == "role_added" and meta.new_value:
            role = db.query(RoleType).filter(RoleType.id == meta.new_value).first()
            if role:
                line_item_label = role.name
                line_item_id = role.id
                is_resource = True
                is_external = False
        elif meta.field_changed == "cost_type" and (meta.new_value or meta.old_value):
            ct_id = meta.new_value or meta.old_value
            ct = db.query(ExternalCostType).filter(ExternalCostType.id == ct_id).first()
            if ct:
                line_item_label = ct.name
                line_item_id = ct.id
                is_resource = False
                is_external = True

    # If still no label from metadata, try to infer from line_item_type
    if line_item_label == cr.summary and value_changes:
        lit = value_changes[0].line_item_type
        if lit == "resource":
            is_resource = True
            is_external = False
            line_item_label = "Resource Change"
        elif lit == "external_cost":
            is_resource = False
            is_external = True
            line_item_label = "External Cost Change"

    # Look up hourly rate if resource
    hourly_rate = 120.0  # default
    if is_resource and line_item_id.startswith("role-"):
        from models.people import RateTable
        rate_row = (
            db.query(RateTable)
            .filter(RateTable.role_type_id == line_item_id)
            .order_by(RateTable.effective_date.desc())
            .first()
        )
        if rate_row:
            hourly_rate = float(rate_row.hourly_rate)

    # Build month values
    month_values: list[DetailViewMonthValue] = []
    all_months: set[str] = set()
    for d in value_changes:
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

    # Sort months
    sorted_months = sorted(all_months)
    month_values.sort(key=lambda mv: mv.month)

    # Compute totals
    proposed_total = sum(mv.proposed for mv in month_values)
    current_total = sum((mv.current or 0) for mv in month_values)
    proposed_total_eur = sum(mv.proposed_eur for mv in month_values)
    current_total_eur = sum((mv.current_eur or 0) for mv in month_values)

    line_item = DetailViewLineItemSchema(
        id=line_item_id,
        name=line_item_label,
        category="internal" if is_resource else "external",
        unit="hours" if is_resource else "eur",
        months=month_values,
        proposed_total=round(proposed_total, 1),
        proposed_total_eur=round(proposed_total_eur, 2),
        current_total=round(current_total, 1),
        current_total_eur=round(current_total_eur, 2),
    )

    # KPIs
    delta_eur = proposed_total_eur - current_total_eur
    delta_color = "#059669" if delta_eur < 0 else "#dc2626" if delta_eur > 0 else "#334155"
    delta_pct = (
        round((delta_eur / current_total_eur) * 100, 1)
        if current_total_eur != 0 else 0.0
    )
    kpis = [
        DetailViewKPISchema(
            label="Affected Lines (Current)",
            value=round(current_total_eur, 2),
            format="currency",
            color="#334155",
        ),
        DetailViewKPISchema(
            label="Affected Lines (Proposed)",
            value=round(proposed_total_eur, 2),
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

    return DetailViewGridData(
        months=sorted_months,
        line_items=[line_item],
        kpis=kpis,
    )


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

    # Compute EUR impact from change details
    items = []
    for cr in crs:
        delta_sum = 0.0
        for d in cr.change_details:
            if d.delta:
                try:
                    delta_sum += float(d.delta.replace("€", "").replace(",", "").strip())
                except (ValueError, AttributeError):
                    pass

        items.append(
            ApprovalItem(
                cr_id=cr.id,
                project_id=cr.project_id,
                project_name=cr.project.name if cr.project else "",
                summary=cr.summary,
                submitted_by=cr.submitted_by.name if cr.submitted_by else "",
                confirmed_by_cc_owner=cr.cc_owner.name if cr.cc_owner else None,
                impact_eur_delta=round(delta_sum, 2) if delta_sum != 0 else None,
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
