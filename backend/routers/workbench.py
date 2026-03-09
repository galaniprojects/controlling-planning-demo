"""Project Workbench endpoints (Section 10.4) — 11 endpoints."""
from __future__ import annotations
import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from config import DEMO_DATE
from database import get_db
from dependencies import get_current_user
from models.capacity import ResourceRequest
from models.change_requests import ChangeRequest, CRChangeDetail
from models.financial import Actuals, Baseline, Forecast
from models.people import Person, RateTable, RoleType
from models.projects import Project
from models.system import SystemSuggestion
from schemas.common import CurrentUser
from schemas.workbench import (
    AcknowledgeRequest, CRHistoryItem, EditRequest, ForecastGridRow,
    ProjectListItem, SubmitRequest,
)
from services.calculations import compute_plan_drift, add_months
from services.forecast_cycle import (
    clear_cycle, get_cycle_by_id, start_cycle,
)
from services.portfolio_service import compute_project_financials

router = APIRouter(prefix="/api/projects", tags=["Project Workbench"])


@router.get("")
def get_project_list(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Get project list (role-filtered)."""
    query = db.query(Project).filter(Project.is_active.is_(True))
    if user.role == "project_lead" and user.project_ids:
        query = query.filter(Project.id.in_(user.project_ids))
    projects = query.order_by(Project.name).all()
    items = [
        ProjectListItem(
            id=p.id, name=p.name, rag=p.rag_status,
            type="service" if p.is_service else "project",
            status=p.status, is_service=p.is_service,
        )
        for p in projects
    ]
    return {"items": items, "total": len(items)}


@router.get("/{project_id}/overview")
def get_project_overview(
    project_id: str,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """Get project overview with three-point comparison."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")

    fins = compute_project_financials(db, project_id)
    exec_var = float(fins["actuals_ytd"]) - float(fins["forecast_ytd"])
    total_var = float(fins["actuals_ytd"]) - float(fins["baseline_total"])

    # Trajectory chart
    baseline_rows = (
        db.query(Baseline.month, func.sum(Baseline.amount_eur).label("total"))
        .filter(Baseline.project_id == project_id)
        .group_by(Baseline.month).order_by(Baseline.month).all()
    )
    forecast_rows = (
        db.query(Forecast.month, func.sum(Forecast.amount_eur).label("total"))
        .filter(Forecast.project_id == project_id)
        .group_by(Forecast.month).order_by(Forecast.month).all()
    )
    actuals_rows = (
        db.query(Actuals.month, func.sum(Actuals.amount_eur).label("total"))
        .filter(Actuals.project_id == project_id)
        .group_by(Actuals.month).order_by(Actuals.month).all()
    )

    bl_map = {r.month: round(float(r.total), 2) for r in baseline_rows}
    fc_map = {r.month: round(float(r.total), 2) for r in forecast_rows}
    ac_map = {r.month: round(float(r.total), 2) for r in actuals_rows}
    all_months = sorted(set(bl_map) | set(fc_map) | set(ac_map))
    trajectory = [
        {"month": m, "baseline": bl_map.get(m, 0), "forecast": fc_map.get(m, 0), "actuals": ac_map.get(m, 0)}
        for m in all_months
    ]

    # CapEx/OpEx
    capex_opex = {"type": project.capex_opex}

    # Resource plan summary
    internal_rows = (
        db.query(Forecast.sub_category, func.sum(Forecast.hours).label("total_hours"))
        .filter(Forecast.project_id == project_id, Forecast.category == "internal")
        .group_by(Forecast.sub_category).all()
    )
    resource_summary = []
    for row in internal_rows:
        role = db.query(RoleType).filter(RoleType.id == row.sub_category).first()
        resource_summary.append({
            "role_id": row.sub_category,
            "role_name": role.name if role else row.sub_category,
            "total_hours": round(float(row.total_hours or 0), 1),
        })

    return {
        "metadata": {
            "id": project.id, "name": project.name, "lob": project.lob_id,
            "status": project.status, "rag": project.rag_status,
            "timeline": {"start": project.start_month, "end": project.end_month, "projected_end": project.projected_end_month},
            "pl_name": project.pl.name if project.pl else None,
        },
        "three_point_comparison": {
            "baseline": fins["baseline_total"], "forecast": fins["forecast_total"],
            "actuals": fins["actuals_ytd"], "plan_drift_pct": fins["plan_drift_pct"],
            "execution_variance": round(exec_var, 2), "total_variance": round(total_var, 2),
        },
        "trajectory_chart": trajectory,
        "capex_opex": capex_opex,
        "resource_plan_summary": resource_summary,
    }


@router.get("/{project_id}/forecast")
def get_project_forecast(
    project_id: str,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """Get current forecast grid (rows x months)."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")

    forecasts = db.query(Forecast).filter(Forecast.project_id == project_id).order_by(Forecast.month).all()
    baselines = db.query(Baseline).filter(Baseline.project_id == project_id).all()
    actuals_list = db.query(Actuals).filter(Actuals.project_id == project_id).all()

    bl_map = {}
    for b in baselines:
        bl_map.setdefault(b.sub_category, {})[b.month] = {"hours": float(b.hours or 0), "amount": float(b.amount_eur)}
    ac_map = {}
    for a in actuals_list:
        ac_map.setdefault(a.sub_category, {})[a.month] = {"hours": float(a.hours or 0), "amount": float(a.amount_eur)}

    rows_map = {}
    for f in forecasts:
        key = (f.category, f.sub_category)
        if key not in rows_map:
            if f.category == "internal":
                role = db.query(RoleType).filter(RoleType.id == f.sub_category).first()
                name = role.name if role else f.sub_category
            else:
                from models.financial import ExternalCostType
                ct = db.query(ExternalCostType).filter(ExternalCostType.id == f.sub_category).first()
                name = ct.name if ct else f.sub_category
            rows_map[key] = {"category": f.category, "sub_category": f.sub_category, "sub_category_name": name, "months": []}
        bl = bl_map.get(f.sub_category, {}).get(f.month, {})
        ac = ac_map.get(f.sub_category, {}).get(f.month, {})
        rows_map[key]["months"].append({
            "month": f.month,
            "forecast_hours": float(f.hours or 0),
            "forecast_amount": float(f.amount_eur),
            "baseline_hours": bl.get("hours", 0),
            "baseline_amount": bl.get("amount", 0),
            "actuals_hours": ac.get("hours", 0),
            "actuals_amount": ac.get("amount", 0),
        })

    items = list(rows_map.values())
    return {"items": items, "total": len(items)}


# ---------------------------------------------------------------------------
# Forecast Cycle — 5-Phase Wizard (6 endpoints)
# ---------------------------------------------------------------------------

@router.post("/{project_id}/forecast-cycle/start")
def start_forecast_cycle(
    project_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Start a new forecast cycle (Phase 1 — Retrospective)."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")

    cycle = start_cycle(project_id)

    # Compute retrospective: previous month forecast vs actuals
    prev_month = add_months(DEMO_DATE, -1)
    forecast_rows = (
        db.query(Forecast)
        .filter(Forecast.project_id == project_id, Forecast.month == prev_month)
        .all()
    )
    actuals_rows = (
        db.query(Actuals)
        .filter(Actuals.project_id == project_id, Actuals.month == prev_month)
        .all()
    )
    ac_map = {(a.category, a.sub_category): float(a.amount_eur) for a in actuals_rows}

    retro = []
    skippable = True
    for f in forecast_rows:
        key = (f.category, f.sub_category)
        actual_amt = ac_map.get(key, 0)
        forecast_amt = float(f.amount_eur)
        variance = actual_amt - forecast_amt
        variance_pct = ((variance / forecast_amt) * 100) if forecast_amt != 0 else 0
        significant = abs(variance_pct) > 10
        if significant:
            skippable = False
        retro.append({
            "category": f.category, "sub_category": f.sub_category,
            "forecast": forecast_amt, "actual": actual_amt,
            "variance": round(variance, 2), "variance_pct": round(variance_pct, 1),
            "significant": significant,
        })

    cycle.retrospective_data = retro
    return {"cycle_id": cycle.cycle_id, "phase": 1, "retrospective_data": retro, "skippable": skippable}


@router.put("/{project_id}/forecast-cycle/{cycle_id}/acknowledge")
def acknowledge_retrospective(
    project_id: str, cycle_id: str,
    body: AcknowledgeRequest,
    _user: CurrentUser = Depends(get_current_user),
):
    """Phase 1: PL acknowledges and explains significant variances."""
    cycle = get_cycle_by_id(project_id, cycle_id)
    if not cycle:
        raise HTTPException(404, "No active forecast cycle")
    cycle.phase = 2
    return {"status": "ok", "phase": 2}


@router.get("/{project_id}/forecast-cycle/{cycle_id}/suggestions")
def get_suggestions(
    project_id: str, cycle_id: str,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """Phase 2: Get system suggestions."""
    cycle = get_cycle_by_id(project_id, cycle_id)
    if not cycle:
        raise HTTPException(404, "No active forecast cycle")

    suggestions = db.query(SystemSuggestion).filter(SystemSuggestion.project_id == project_id).all()
    items = []
    for s in suggestions:
        pre_filled = json.loads(s.pre_filled_changes_json) if s.pre_filled_changes_json else []
        items.append({
            "id": s.id, "type": s.suggestion_type,
            "observation": s.observation, "recommendation": s.recommendation,
            "impact_description": s.impact_description,
            "pre_filled_changes": pre_filled,
        })

    cycle.suggestions = items
    cycle.phase = 3
    return {"items": items, "total": len(items)}


@router.put("/{project_id}/forecast-cycle/{cycle_id}/edit")
def save_edits(
    project_id: str, cycle_id: str,
    body: EditRequest,
    _user: CurrentUser = Depends(get_current_user),
):
    """Phase 3: Save working changes (idempotent)."""
    cycle = get_cycle_by_id(project_id, cycle_id)
    if not cycle:
        raise HTTPException(404, "No active forecast cycle")

    cycle.working_changes = body.changes
    cycle.applied_suggestion_ids = body.applied_suggestion_ids
    cycle.phase = 4
    return {"status": "ok", "total_changes": len(body.changes), "phase": 4}


@router.get("/{project_id}/forecast-cycle/{cycle_id}/review")
def get_review(
    project_id: str, cycle_id: str,
    _user: CurrentUser = Depends(get_current_user),
):
    """Phase 4: Get grouped changes for review before submission."""
    cycle = get_cycle_by_id(project_id, cycle_id)
    if not cycle:
        raise HTTPException(404, "No active forecast cycle")

    # Group changes by type
    resource_changes = [c for c in cycle.working_changes if c.get("category") == "internal"]
    external_changes = [c for c in cycle.working_changes if c.get("category") == "external"]
    other_changes = [c for c in cycle.working_changes if c.get("category") not in ("internal", "external")]

    groups = []
    if resource_changes:
        groups.append({"type": "resource", "items": resource_changes, "count": len(resource_changes)})
    if external_changes:
        groups.append({"type": "external_cost", "items": external_changes, "count": len(external_changes)})
    if other_changes:
        groups.append({"type": "other", "items": other_changes, "count": len(other_changes)})

    cycle.review_groups = groups
    return {"items": groups, "total": len(groups)}


@router.put("/{project_id}/forecast-cycle/{cycle_id}/submit")
def submit_forecast_cycle(
    project_id: str, cycle_id: str,
    body: SubmitRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Phase 5: Submit forecast cycle — creates CRs."""
    cycle = get_cycle_by_id(project_id, cycle_id)
    if not cycle:
        raise HTTPException(404, "No active forecast cycle")

    # INVESTIGATION (v2 6.1 — CR Routing Bug):
    # CRs created here start at "pending_cc_confirmation", which requires CC Owner
    # confirmation before advancing to "pending_controller_approval". Resource-type
    # CRs work because CC Owners process them via Request Management. Non-resource
    # CRs (budget/timeline changes) have NO CC Owner UI to confirm them, so they
    # are stuck and never reach the Controller's Approvals tab.
    # Fix deferred to v2 Session 2.
    created_crs = []
    for group in (body.groups or cycle.review_groups):
        cr = ChangeRequest(
            project_id=project_id,
            submitted_by_id=user.person_id,
            submission_timestamp=datetime.utcnow(),
            status="pending_cc_confirmation",
            change_category=group.get("type", "other"),
            summary=group.get("justification", f"Forecast update: {group.get('type', 'changes')}"),
            justification=group.get("justification"),
            is_system_suggested=any(
                sid in cycle.applied_suggestion_ids
                for sid in [c.get("suggestion_id") for c in group.get("items", [])]
            ),
        )
        db.add(cr)
        db.flush()

        for item in group.get("items", []):
            detail = CRChangeDetail(
                change_request_id=cr.id,
                field_changed=item.get("sub_category", ""),
                old_value=str(item.get("old_value", "")),
                new_value=str(item.get("new_value", "")),
                delta=str(item.get("delta", "")),
                line_item_type=item.get("category"),
                month=item.get("month"),
            )
            db.add(detail)

        created_crs.append({"id": cr.id, "status": cr.status, "category": cr.change_category})

    db.commit()
    clear_cycle(project_id)

    return {"items": created_crs, "total": len(created_crs)}


# ---------------------------------------------------------------------------
# Change History (2 endpoints)
# ---------------------------------------------------------------------------

@router.get("/{project_id}/change-requests")
def get_project_crs(
    project_id: str,
    category: str | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """Get change request history for a project."""
    query = (
        db.query(ChangeRequest)
        .filter(ChangeRequest.project_id == project_id)
        .order_by(ChangeRequest.submission_timestamp.desc())
    )
    if category:
        query = query.filter(ChangeRequest.change_category == category)
    if status:
        query = query.filter(ChangeRequest.status == status)
    crs = query.all()

    items = [
        CRHistoryItem(
            id=cr.id, project_id=cr.project_id, status=cr.status,
            change_category=cr.change_category, summary=cr.summary,
            justification=cr.justification, is_system_suggested=cr.is_system_suggested,
            submitted_by=cr.submitted_by.name if cr.submitted_by else "",
            submission_date=str(cr.submission_timestamp),
            changes=[
                {"field": d.field_changed, "old": d.old_value, "new": d.new_value, "delta": d.delta, "month": d.month}
                for d in cr.change_details
            ],
        )
        for cr in crs
    ]
    return {"items": items, "total": len(items)}


@router.get("/{project_id}/change-requests/{cr_id}")
def get_project_cr_detail(
    project_id: str, cr_id: int,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """Get a single change request detail."""
    cr = (
        db.query(ChangeRequest)
        .filter(ChangeRequest.id == cr_id, ChangeRequest.project_id == project_id)
        .first()
    )
    if not cr:
        raise HTTPException(404, "Change request not found")

    return CRHistoryItem(
        id=cr.id, project_id=cr.project_id, status=cr.status,
        change_category=cr.change_category, summary=cr.summary,
        justification=cr.justification, is_system_suggested=cr.is_system_suggested,
        submitted_by=cr.submitted_by.name if cr.submitted_by else "",
        submission_date=str(cr.submission_timestamp),
        changes=[
            {"field": d.field_changed, "old": d.old_value, "new": d.new_value, "delta": d.delta, "month": d.month}
            for d in cr.change_details
        ],
    )
