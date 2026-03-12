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
from models.capacity import Allocation, ResourceRequest
from models.organization import CostCenter
from models.change_requests import ChangeRequest, CRChangeDetail
from models.financial import Actuals, Baseline, Forecast
from models.people import Person, RateTable, RoleType
from models.projects import Project, ProjectPhase
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
        {"month": m, "baseline": bl_map.get(m, 0), "forecast": fc_map.get(m, 0), "actuals": ac_map.get(m) if m in ac_map else None}
        for m in all_months
    ]

    # CapEx/OpEx — aggregate from line items
    capex_rows = (
        db.query(
            Forecast.capex_opex,
            func.sum(Forecast.amount_eur).label("total"),
        )
        .filter(Forecast.project_id == project_id, Forecast.capex_opex.isnot(None))
        .group_by(Forecast.capex_opex)
        .all()
    )
    capex_totals = {r.capex_opex: round(float(r.total), 2) for r in capex_rows}
    capex_amt = capex_totals.get("capex", 0)
    opex_amt = capex_totals.get("opex", 0)
    total_co = capex_amt + opex_amt
    if capex_amt > 0 and opex_amt > 0:
        co_type = "mixed"
    elif opex_amt > 0:
        co_type = "opex"
    else:
        co_type = "capex"
    capex_opex = {
        "type": co_type,
        "capex_amount": capex_amt,
        "opex_amount": opex_amt,
        "capex_pct": round((capex_amt / total_co) * 100, 1) if total_co else 0,
        "opex_pct": round((opex_amt / total_co) * 100, 1) if total_co else 0,
    }

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


@router.get("/{project_id}/timeline")
def get_project_timeline(
    project_id: str,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """Get project timeline data for the timeline visualization chart."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")

    today_month = DEMO_DATE[:7]  # "2026-03"

    # Gather monthly data from all three series
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

    # Monthly data with overrun and elapsed flags
    monthly_data = []
    cum_baseline = 0.0
    cum_forecast = 0.0
    cum_actuals = 0.0
    cumulative_data = []

    for m in all_months:
        bl = bl_map.get(m, 0)
        fc = fc_map.get(m, 0)
        ac = ac_map.get(m) if m in ac_map else None
        is_elapsed = m < today_month
        overrun = False
        if ac is not None and fc > 0 and ac > fc:
            overrun = True

        monthly_data.append({
            "month": m,
            "baseline": bl,
            "forecast": fc,
            "actuals": ac,
            "is_elapsed": is_elapsed,
            "overrun": overrun,
        })

        cum_baseline += bl
        cum_forecast += fc
        if ac is not None:
            cum_actuals += ac

        cumulative_data.append({
            "month": m,
            "baseline": round(cum_baseline, 2),
            "forecast": round(cum_forecast, 2),
            "actuals": round(cum_actuals, 2) if m <= today_month and m in ac_map else None,
        })

    # Phases
    phases = (
        db.query(ProjectPhase)
        .filter(ProjectPhase.project_id == project_id)
        .order_by(ProjectPhase.phase_number)
        .all()
    )
    phases_data = [
        {
            "name": p.name,
            "phase_number": p.phase_number,
            "baseline_start": p.baseline_start,
            "baseline_end": p.baseline_end,
            "forecast_start": p.forecast_start,
            "forecast_end": p.forecast_end,
            "color": p.color,
            "slip_months": _month_diff(p.forecast_end, p.baseline_end),
        }
        for p in phases
    ]

    # Summary
    baseline_total = round(sum(bl_map.values()), 2)
    forecast_total = round(sum(fc_map.values()), 2)
    ytd_actuals = round(sum(v for m, v in ac_map.items() if m <= today_month), 2)
    plan_drift = round(((forecast_total - baseline_total) / baseline_total * 100) if baseline_total else 0, 1)
    # Execution variance: YTD actuals vs YTD forecast
    ytd_forecast = round(sum(v for m, v in fc_map.items() if m <= today_month), 2)
    execution_variance = round(((ytd_actuals - ytd_forecast) / ytd_forecast * 100) if ytd_forecast else 0, 1)

    budget_ceiling = float(project.total_budget) if project.total_budget else baseline_total

    return {
        "monthly_data": monthly_data,
        "cumulative_data": cumulative_data,
        "phases": phases_data,
        "summary": {
            "baseline_total": baseline_total,
            "forecast_total": forecast_total,
            "ytd_actuals": ytd_actuals,
            "plan_drift": plan_drift,
            "execution_variance": execution_variance,
        },
        "budget_ceiling": budget_ceiling,
        "today_month": today_month,
    }


def _month_diff(a: str, b: str) -> int:
    """Return the number of months between two YYYY-MM strings (a - b)."""
    ay, am = int(a[:4]), int(a[5:7])
    by, bm = int(b[:4]), int(b[5:7])
    return (ay - by) * 12 + (am - bm)


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

    # Pre-load hourly rates for internal roles (first rate per role_type_id)
    rate_rows = db.query(RateTable).all()
    rate_map: dict[str, float] = {}
    for rt in rate_rows:
        rate_map.setdefault(rt.role_type_id, float(rt.hourly_rate))

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
            row_data: dict = {"category": f.category, "sub_category": f.sub_category, "sub_category_name": name, "capex_opex": f.capex_opex, "months": []}
            if f.category == "internal":
                row_data["hourly_rate"] = rate_map.get(f.sub_category)
            rows_map[key] = row_data
        bl = bl_map.get(f.sub_category, {}).get(f.month, {})
        ac = ac_map.get(f.sub_category, {}).get(f.month, {})
        cell = {
            "month": f.month,
            "forecast_hours": float(f.hours or 0),
            "forecast_amount": float(f.amount_eur),
            "baseline_hours": bl.get("hours", 0),
            "baseline_amount": bl.get("amount", 0),
            "actuals_hours": ac.get("hours", 0),
            "actuals_amount": ac.get("amount", 0),
        }
        # External cost procurement fields
        if f.category == "external":
            cell["ext_status"] = f.ext_status
            cell["po_number"] = f.po_number
            cell["vendor"] = f.vendor
        rows_map[key]["months"].append(cell)

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
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """Phase 4: Get grouped changes for review with cost centre grouping."""
    cycle = get_cycle_by_id(project_id, cycle_id)
    if not cycle:
        raise HTTPException(404, "No active forecast cycle")

    # Build a mapping: sub_category → cost_center_id for internal items
    # via allocations → person → cost_center
    sub_cat_to_cc: dict[str, str] = {}
    allocs = (
        db.query(Allocation.person_id)
        .filter(Allocation.project_id == project_id)
        .distinct()
        .all()
    )
    person_ids = [a.person_id for a in allocs]
    if person_ids:
        persons = db.query(Person).filter(Person.id.in_(person_ids)).all()
        for p in persons:
            if p.cost_center_id and p.role_type_id:
                sub_cat_to_cc[p.role_type_id] = p.cost_center_id

    # Load cost centre names
    cc_names: dict[str, str] = {}
    all_cc_ids = set(sub_cat_to_cc.values())
    if all_cc_ids:
        ccs = db.query(CostCenter).filter(CostCenter.id.in_(all_cc_ids)).all()
        cc_names = {cc.id: cc.name for cc in ccs}

    # Default cost centre for external items: project's primary CC
    # (use the CC with most allocations, or a fallback)
    default_cc_id = None
    if sub_cat_to_cc:
        from collections import Counter
        cc_counts = Counter(sub_cat_to_cc.values())
        default_cc_id = cc_counts.most_common(1)[0][0]

    # Build DetailViewGrid-style line items from working changes
    from models.financial import ExternalCostType
    changes = cycle.working_changes
    all_months = sorted({c.get("month", "") for c in changes if c.get("month")})

    # Group changes by sub_category for line items
    line_items_map: dict[str, dict] = {}
    for ch in changes:
        sub_cat = ch.get("sub_category", "")
        if sub_cat not in line_items_map:
            cat = ch.get("category", "")
            if cat == "internal":
                role = db.query(RoleType).filter(RoleType.id == sub_cat).first()
                name = role.name if role else sub_cat
            else:
                ect = db.query(ExternalCostType).filter(ExternalCostType.id == sub_cat).first()
                name = ect.name if ect else sub_cat
            line_items_map[sub_cat] = {
                "id": sub_cat,
                "label": name,
                "category": cat,
                "capex_opex": None,
                "is_system_suggested": ch.get("suggestion_id") is not None,
                "months": {},
            }

        line_items_map[sub_cat]["months"][ch["month"]] = {
            "before": round(ch.get("old_value", 0), 2),
            "after": round(ch.get("new_value", 0), 2),
            "delta": round(ch.get("delta", 0), 2),
        }
        if ch.get("suggestion_id") is not None:
            line_items_map[sub_cat]["is_system_suggested"] = True

    # Convert to list format
    grid_line_items = []
    for sub_cat, li in line_items_map.items():
        months_list = []
        for m in all_months:
            mv = li["months"].get(m)
            if mv:
                months_list.append({"month": m, "before": mv["before"], "after": mv["after"], "delta": mv["delta"]})
            else:
                months_list.append({"month": m, "before": None, "after": None, "delta": None})
        grid_line_items.append({
            "id": li["id"],
            "label": li["label"],
            "category": li["category"],
            "capex_opex": li.get("capex_opex"),
            "is_system_suggested": li.get("is_system_suggested", False),
            "months": months_list,
        })

    # Group by cost centre
    cc_groups_map: dict[str, dict] = {}
    for ch in changes:
        sub_cat = ch.get("sub_category", "")
        cat = ch.get("category", "")
        if cat == "internal":
            cc_id = sub_cat_to_cc.get(sub_cat, default_cc_id or "unknown")
        else:
            cc_id = default_cc_id or "external"
        if cc_id not in cc_groups_map:
            cc_groups_map[cc_id] = {
                "id": cc_id,
                "name": cc_names.get(cc_id, cc_id),
                "line_items": [],
                "items": [],
            }
        # Track which line items belong to this CC
        li_info = line_items_map.get(sub_cat, {})
        if sub_cat not in [x["id"] for x in cc_groups_map[cc_id]["line_items"]]:
            cc_groups_map[cc_id]["line_items"].append({
                "id": sub_cat,
                "label": li_info.get("label", sub_cat),
            })
        cc_groups_map[cc_id]["items"].append(ch)

    cost_centre_groups = list(cc_groups_map.values())

    # Also preserve the old-style groups for backward compatibility with submit
    resource_changes = [c for c in changes if c.get("category") == "internal"]
    external_changes = [c for c in changes if c.get("category") == "external"]
    other_changes = [c for c in changes if c.get("category") not in ("internal", "external")]
    legacy_groups = []
    if resource_changes:
        legacy_groups.append({"type": "resource", "items": resource_changes, "count": len(resource_changes)})
    if external_changes:
        legacy_groups.append({"type": "external_cost", "items": external_changes, "count": len(external_changes)})
    if other_changes:
        legacy_groups.append({"type": "other", "items": other_changes, "count": len(other_changes)})

    cycle.review_groups = legacy_groups
    cycle.cost_centre_groups = cost_centre_groups

    return {
        "items": legacy_groups,
        "total": len(legacy_groups),
        "grid_data": {
            "months": all_months,
            "line_items": grid_line_items,
        },
        "cost_centre_groups": cost_centre_groups,
    }


@router.put("/{project_id}/forecast-cycle/{cycle_id}/submit")
def submit_forecast_cycle(
    project_id: str, cycle_id: str,
    body: SubmitRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Phase 5: Submit forecast cycle — creates one CR per cost centre."""
    cycle = get_cycle_by_id(project_id, cycle_id)
    if not cycle:
        raise HTTPException(404, "No active forecast cycle")

    # Use cost centre groups if available (v3 redesign), otherwise legacy groups
    cc_groups = body.cost_centre_groups or cycle.cost_centre_groups
    created_crs = []

    if cc_groups:
        for group in cc_groups:
            cc_name = group.get("name", group.get("id", ""))
            items = group.get("items", [])
            justification = group.get("justification", "")
            categories = {c.get("category") for c in items}
            has_internal = "internal" in categories
            change_category = "resource" if has_internal else "external_cost"
            initial_status = "pending_cc_confirmation" if has_internal else "pending_controller_approval"

            cr = ChangeRequest(
                project_id=project_id,
                submitted_by_id=user.person_id,
                submission_timestamp=datetime.utcnow(),
                status=initial_status,
                change_category=change_category,
                summary=justification or f"Forecast update: {cc_name}",
                justification=justification,
                is_system_suggested=any(
                    c.get("suggestion_id") in cycle.applied_suggestion_ids
                    for c in items if c.get("suggestion_id") is not None
                ),
            )
            db.add(cr)
            db.flush()

            for item in items:
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

            created_crs.append({"id": cr.id, "status": cr.status, "category": cr.change_category, "cost_centre": cc_name})
    else:
        # Legacy fallback: group by type
        for group in (body.groups or cycle.review_groups):
            group_type = group.get("type", "other")
            initial_status = "pending_cc_confirmation" if group_type == "resource" else "pending_controller_approval"
            cr = ChangeRequest(
                project_id=project_id,
                submitted_by_id=user.person_id,
                submission_timestamp=datetime.utcnow(),
                status=initial_status,
                change_category=group_type,
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


@router.get("/{project_id}/change-requests/{cr_id}/detail-view")
def get_cr_detail_view(
    project_id: str, cr_id: int,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """Get CR detail view data in DetailViewGrid format (for full detail modal)."""
    from routers.portfolio import _build_cr_grid_data

    cr = (
        db.query(ChangeRequest)
        .filter(ChangeRequest.id == cr_id, ChangeRequest.project_id == project_id)
        .first()
    )
    if not cr:
        raise HTTPException(404, "Change request not found")

    grid_data = _build_cr_grid_data(cr, db)

    # Determine decided_by (CC Owner or Controller who took action)
    decided_by = None
    decided_date = None
    if cr.controller and cr.controller_approval_timestamp:
        decided_by = cr.controller.name if cr.controller else None
        decided_date = str(cr.controller_approval_timestamp)
    elif cr.cc_owner and cr.cc_confirmation_timestamp:
        decided_by = cr.cc_owner.name if cr.cc_owner else None
        decided_date = str(cr.cc_confirmation_timestamp)

    return {
        "cr_id": cr.id,
        "project_id": cr.project_id,
        "project_name": cr.project.name if cr.project else "",
        "summary": cr.summary,
        "status": cr.status,
        "change_category": cr.change_category,
        "justification": cr.justification,
        "is_system_suggested": cr.is_system_suggested,
        "submitted_by": cr.submitted_by.name if cr.submitted_by else "",
        "submission_date": str(cr.submission_timestamp),
        "decided_by": decided_by,
        "decided_date": decided_date,
        "grid_data": grid_data.model_dump() if grid_data else None,
    }
