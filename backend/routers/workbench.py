"""Project Workbench endpoints (Section 10.4) — 11 endpoints + C1 forecast grid/versioning."""
from __future__ import annotations
import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session
from config import DEMO_DATE
from database import get_db
from dependencies import get_current_user, require_role
from models.capacity import Allocation, ResourceRequest
from models.organization import CostCenter
from models.change_requests import ChangeRequest, CRChangeDetail, CRSubmissionSnapshot
from models.financial import Actuals, Baseline, Forecast, ForecastVersion
from models.people import Person, RateTable, RoleType
from models.projects import MilestoneType, Project, ProjectMilestone
from models.system import SystemSuggestion
from schemas.common import CurrentUser
from schemas.workbench import (
    AcknowledgeRequest, CRHistoryItem, EditRequest, ForecastGridRow,
    ForecastVersionDetail, ForecastVersionDiff, ForecastVersionListResponse,
    ForecastVersionMeta, ManualSnapshotRequest, MixedGridResponse,
    ProjectListItem, SubmitRequest,
)
from services.calculations import compute_plan_drift, add_months
from services.forecast_cycle import (
    clear_cycle, derive_cycle_label, get_cycle_by_id, start_cycle,
)
from services.portfolio_service import compute_project_financials, get_project_entity_info, get_project_hierarchy_path, get_top_level_entity_type_id

router = APIRouter(prefix="/api/projects", tags=["Project Workbench"])

# C1: separate router for cross-project diff endpoint [C-RH-05]
forecast_router = APIRouter(prefix="/api/forecast", tags=["Forecast Versions"])

# E1: separate router for portfolio-level progress aggregation [E-04d]
progress_router = APIRouter(prefix="/api/portfolio", tags=["Progress Tracker"])

# E2: separate router for external cost aggregation [E-08a]–[E-08b]
external_costs_workbench_router = APIRouter(
    prefix="/api/workbench", tags=["Project Workbench External Costs"],
)


def _get_project_lob_name(db: Session, project_id: str) -> str:
    """Get the top-level entity name (LoB) for a project."""
    top_type = get_top_level_entity_type_id(db)
    info = get_project_entity_info(db, project_id, top_type)
    return info["name"] if info else "Unassigned"


@router.get("")
def get_project_list(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Get project list (role-filtered)."""
    from dependencies import pl_project_filter
    query = db.query(Project).filter(Project.is_active.is_(True))
    if user.role == "project_lead":
        query = query.filter(pl_project_filter(user))
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

    # Resource plan summary — title and filtering depend on project lifecycle
    from config import DEMO_DATE
    demo_year = DEMO_DATE[:4]  # "2026"

    if project.status == "active":
        resource_title = f"Resource Plan {demo_year}"
        rp_filter = Forecast.month.like(f"{demo_year}-%")
    elif project.status == "planned":
        start_year = project.start_month[:4] if project.start_month else demo_year
        resource_title = f"Resource Plan {start_year}"
        rp_filter = None
    elif project.status == "completed":
        resource_title = "Resources Consumed"
        rp_filter = None
    else:
        resource_title = "Resource Plan"
        rp_filter = None

    rp_query = db.query(Forecast.sub_category, func.sum(Forecast.hours).label("total_hours")).filter(
        Forecast.project_id == project_id, Forecast.category == "internal"
    )
    if rp_filter is not None:
        rp_query = rp_query.filter(rp_filter)
    internal_rows = rp_query.group_by(Forecast.sub_category).all()

    resource_summary = []
    for row in internal_rows:
        role = db.query(RoleType).filter(RoleType.id == row.sub_category).first()
        resource_summary.append({
            "role_id": row.sub_category,
            "role_name": role.name if role else row.sub_category,
            "total_hours": round(float(row.total_hours or 0), 1),
        })

    # Check for pending CRs (locks forecast review)
    pending_cr = (
        db.query(ChangeRequest)
        .filter(
            ChangeRequest.project_id == project_id,
            ChangeRequest.status.in_(["pending_cc_confirmation", "pending_controller_approval", "changes_requested"]),
        )
        .order_by(ChangeRequest.submission_timestamp.desc())
        .first()
    )

    return {
        "metadata": {
            "id": project.id, "name": project.name, "lob": _get_project_lob_name(db, project.id),
            "hierarchy_path": get_project_hierarchy_path(db, project.id),
            "status": project.status, "rag": project.rag_status,
            "timeline": {"start": project.start_month, "end": project.end_month, "projected_end": project.projected_end_month},
            "pl_name": project.pl.name if project.pl else None,
            "pending_cr": {
                "cr_id": pending_cr.id,
                "status": pending_cr.status,
                "submitted_at": pending_cr.submission_timestamp.isoformat() if pending_cr.submission_timestamp else None,
            } if pending_cr else None,
        },
        "three_point_comparison": {
            "baseline": fins["baseline_total"], "forecast": fins["forecast_total"],
            "actuals": fins["actuals_ytd"], "plan_drift_pct": fins["plan_drift_pct"],
            "execution_variance": round(exec_var, 2), "total_variance": round(total_var, 2),
        },
        "trajectory_chart": trajectory,
        "capex_opex": capex_opex,
        "resource_plan_title": resource_title,
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

    today_month = DEMO_DATE[:7]  # "2026-04"

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

    # Milestones [A-MS-01]
    milestones = (
        db.query(ProjectMilestone)
        .filter(ProjectMilestone.project_id == project_id)
        .order_by(ProjectMilestone.sequence_number)
        .all()
    )
    type_lookup = {mt.id: mt for mt in db.query(MilestoneType).all()}
    milestones_data = [
        {
            "name": m.name,
            "sequence_number": m.sequence_number,
            "baseline_start": m.baseline_start,
            "baseline_end": m.baseline_end,
            "forecast_start": m.forecast_start,
            "forecast_end": m.forecast_end,
            # Resolved colour: own override else type default
            "color": (
                m.color
                if m.color
                else (
                    type_lookup[m.milestone_type_id].default_color
                    if m.milestone_type_id and m.milestone_type_id in type_lookup
                    else None
                )
            ),
            "slip_months": _month_diff(m.forecast_end, m.baseline_end),
        }
        for m in milestones
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
        "milestones": milestones_data,
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

    bl_map: dict[str, dict[str, dict]] = {}
    for b in baselines:
        sub = bl_map.setdefault(b.sub_category, {})
        if b.month not in sub:
            sub[b.month] = {"hours": 0.0, "amount": 0.0}
        sub[b.month]["hours"] += float(b.hours or 0)
        sub[b.month]["amount"] += float(b.amount_eur)
    ac_map: dict[str, dict[str, dict]] = {}
    for a in actuals_list:
        sub = ac_map.setdefault(a.sub_category, {})
        if a.month not in sub:
            sub[a.month] = {"hours": 0.0, "amount": 0.0}
        sub[a.month]["hours"] += float(a.hours or 0)
        sub[a.month]["amount"] += float(a.amount_eur)

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
        # Merge duplicate (role, month) cells from multi-location staffing
        existing_cell = None
        if f.category == "internal":
            for c in rows_map[key]["months"]:
                if c["month"] == f.month:
                    existing_cell = c
                    break
        if existing_cell:
            existing_cell["forecast_hours"] += float(f.hours or 0)
            existing_cell["forecast_amount"] += float(f.amount_eur)
            # baseline/actuals already aggregated in bl_map/ac_map
        else:
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

    # Attach employee assignments for internal rows from allocations
    from sqlalchemy.orm import joinedload
    allocs = (
        db.query(Allocation)
        .options(joinedload(Allocation.person))
        .filter(Allocation.project_id == project_id)
        .all()
    )
    # Group: role_type_id -> person_id -> [{month, hours}]
    role_person_months: dict[str, dict[str, list[dict]]] = {}
    person_names: dict[str, str] = {}
    for a in allocs:
        if not a.person:
            continue
        role_id = a.person.role_type_id
        pid = a.person_id
        person_names[pid] = a.person.name
        role_person_months.setdefault(role_id, {}).setdefault(pid, []).append(
            {"month": a.month, "hours": float(a.hours)}
        )
    # Build per-role assignment arrays
    role_assignments: dict[str, list[dict]] = {}
    for role_id, persons in role_person_months.items():
        role_assignments[role_id] = [
            {
                "person_id": pid,
                "person_name": person_names[pid],
                "months": sorted(months, key=lambda m: m["month"]),
            }
            for pid, months in persons.items()
        ]
    for row in items:
        if row["category"] == "internal":
            row["assignments"] = role_assignments.get(row["sub_category"], [])

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

    # Build role_type_id → person name map from allocations
    from models.capacity import Allocation as AllocModel
    from models.people import Person as PersonModel
    allocs_for_project = (
        db.query(AllocModel.person_id, PersonModel.name, PersonModel.role_type_id)
        .join(PersonModel, AllocModel.person_id == PersonModel.id)
        .filter(AllocModel.project_id == project_id, AllocModel.month == prev_month)
        .all()
    )
    # Map role_type_id → list of person names (for internal line items)
    role_to_people: dict[str, list[str]] = {}
    for _pid, pname, rtid in allocs_for_project:
        role_to_people.setdefault(rtid, [])
        if pname not in role_to_people[rtid]:
            role_to_people[rtid].append(pname)

    retro = []
    skippable = True
    # Track how many times each (category, sub_category) has appeared for unique indexing
    seen_counts: dict[tuple[str, str], int] = {}
    for f in forecast_rows:
        key = (f.category, f.sub_category)
        actual_amt = ac_map.get(key, 0)
        forecast_amt = float(f.amount_eur)
        variance = actual_amt - forecast_amt
        variance_pct = ((variance / forecast_amt) * 100) if forecast_amt != 0 else 0
        significant = abs(variance_pct) > 10
        if significant:
            skippable = False

        # Determine person name for internal line items
        person_name = None
        if f.category == "internal":
            people_names = role_to_people.get(f.sub_category, [])
            occurrence = seen_counts.get(key, 0)
            if occurrence < len(people_names):
                person_name = people_names[occurrence]
            elif people_names:
                person_name = people_names[0]

        seen_counts[key] = seen_counts.get(key, 0) + 1

        retro.append({
            "category": f.category, "sub_category": f.sub_category,
            "forecast": forecast_amt, "actual": actual_amt,
            "variance": round(variance, 2), "variance_pct": round(variance_pct, 1),
            "significant": significant,
            "person_name": person_name,
        })

    cycle.retrospective_data = retro
    return {"cycle_id": cycle.cycle_id, "phase": 1, "retrospective_data": retro, "skippable": skippable, "retro_month": prev_month}


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
    # Hourly rate lookup for converting internal hours → EUR
    rate_rows = db.query(RateTable).all()
    rate_map: dict[str, float] = {}
    for rt in rate_rows:
        rate_map.setdefault(rt.role_type_id, float(rt.hourly_rate))

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

        old_val = round(ch.get("old_value", 0), 2)
        new_val = round(ch.get("new_value", 0), 2)
        delta_val = round(ch.get("delta", 0), 2)
        cat = ch.get("category", "")
        if cat == "internal":
            rate = rate_map.get(sub_cat, 120.0)
            line_items_map[sub_cat]["months"][ch["month"]] = {
                "before": old_val,
                "after": new_val,
                "delta": delta_val,
                "before_eur": round(old_val * rate, 2),
                "after_eur": round(new_val * rate, 2),
                "delta_eur": round(delta_val * rate, 2),
            }
        else:
            # External: values are already in EUR
            line_items_map[sub_cat]["months"][ch["month"]] = {
                "before": None,
                "after": None,
                "delta": None,
                "before_eur": old_val,
                "after_eur": new_val,
                "delta_eur": delta_val,
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
                months_list.append({
                    "month": m,
                    "before": mv["before"], "after": mv["after"], "delta": mv["delta"],
                    "before_eur": mv["before_eur"], "after_eur": mv["after_eur"], "delta_eur": mv["delta_eur"],
                })
            else:
                months_list.append({
                    "month": m, "before": None, "after": None, "delta": None,
                    "before_eur": None, "after_eur": None, "delta_eur": None,
                })
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
        # Enrich change item with delta_eur for correct EUR totals
        enriched_ch = dict(ch)
        if cat == "internal":
            rate = rate_map.get(sub_cat, 120.0)
            enriched_ch["delta_eur"] = round(ch.get("delta", 0) * rate, 2)
        else:
            enriched_ch["delta_eur"] = round(ch.get("delta", 0), 2)
        cc_groups_map[cc_id]["items"].append(enriched_ch)

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
                    line_item_type=item.get("sub_category"),
                    month=item.get("month"),
                )
                db.add(detail)

            # Create resource requests for CC Owner to act on
            if initial_status == "pending_cc_confirmation":
                db.flush()  # ensure change details are visible via relationship
                from routers.portfolio import _create_resource_requests_from_cr
                _create_resource_requests_from_cr(cr, db)

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
                    line_item_type=item.get("sub_category"),
                    month=item.get("month"),
                )
                db.add(detail)

            # Create resource requests for CC Owner to act on
            if initial_status == "pending_cc_confirmation":
                db.flush()  # ensure change details are visible via relationship
                from routers.portfolio import _create_resource_requests_from_cr
                _create_resource_requests_from_cr(cr, db)

            created_crs.append({"id": cr.id, "status": cr.status, "category": cr.change_category})

    db.commit()
    clear_cycle(project_id)

    # C1 [C-FV-05] — cycle completion: capture one version per active project
    try:
        from services.forecast_versioning import capture_versions_for_cycle
        _cycle_label = derive_cycle_label(DEMO_DATE)
        _cycle_id = body.cost_centre_groups[0].get("cycle_id") if body.cost_centre_groups else None
        capture_versions_for_cycle(db, user, _cycle_label, cycle_id=_cycle_id)
        db.commit()
    except Exception as _e:  # noqa: BLE001 — best-effort
        import logging as _logging
        _logging.getLogger(__name__).warning("Cycle version capture failed: %s", _e)

    # E1 [E-04c] — cycle completion: capture one progress snapshot per active
    # project, mirroring the C1 fan-out. Best-effort: any failure here must
    # not block the cycle submission.
    try:
        from services.progress_tracker import capture_progress_for_cycle
        _cycle_label = derive_cycle_label(DEMO_DATE)
        _cycle_id = body.cost_centre_groups[0].get("cycle_id") if body.cost_centre_groups else None
        capture_progress_for_cycle(db, user, _cycle_label, cycle_id=_cycle_id)
        db.commit()
    except Exception as _e:  # noqa: BLE001 — best-effort
        import logging as _logging
        _logging.getLogger(__name__).warning("Cycle progress snapshot failed: %s", _e)

    # [A-BK-14] Forecast-cycle completion (rolling forecast cadence) — fan out
    # to the backlog within_cutoff recompute. Best-effort to avoid surfacing a
    # 500 on the cycle submission itself if the recompute path errors.
    try:
        from services.ranking import recompute_within_cutoff_for_backlog
        recompute_within_cutoff_for_backlog(db)
    except Exception:  # noqa: BLE001 — defensive: trigger best-effort.
        db.rollback()

    return {"items": created_crs, "total": len(created_crs)}


# ---------------------------------------------------------------------------
# Change History (2 endpoints)
# ---------------------------------------------------------------------------


def _compute_cr_impact_eur(cr: ChangeRequest, db: Session) -> float | None:
    """Lightweight EUR impact calculation for a CR without full grid build."""
    value_changes = [
        d for d in cr.change_details
        if d.line_item_type and d.month and _is_numeric(d.old_value, d.new_value)
    ]
    if not value_changes:
        return None

    # Cache rate lookups across line items
    rate_cache: dict[str, float] = {}
    total_delta = 0.0

    for d in value_changes:
        old_v = _parse_numeric(d.old_value)
        new_v = _parse_numeric(d.new_value)
        delta = new_v - old_v

        if d.line_item_type.startswith("role-"):
            # Resource: convert hours delta to EUR using hourly rate
            if d.line_item_type not in rate_cache:
                rate_row = (
                    db.query(RateTable)
                    .filter(RateTable.role_type_id == d.line_item_type)
                    .order_by(RateTable.effective_date.desc())
                    .first()
                )
                rate_cache[d.line_item_type] = float(rate_row.hourly_rate) if rate_row else 120.0
            total_delta += delta * rate_cache[d.line_item_type]
        else:
            # External cost: already in EUR
            total_delta += delta

    return round(total_delta, 2)


def _is_numeric(old_val: str | None, new_val: str | None) -> bool:
    for v in (old_val, new_val):
        if v and v != "NULL":
            try:
                float(v.replace("€", "").replace(",", "").replace(" ", "").strip())
                return True
            except (ValueError, AttributeError):
                continue
    return False


def _parse_numeric(val: str | None) -> float:
    if not val or val == "NULL":
        return 0.0
    try:
        return float(val.replace("€", "").replace(",", "").replace(" ", "").strip())
    except (ValueError, AttributeError):
        return 0.0


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
            impact_eur=_compute_cr_impact_eur(cr, db),
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


@router.get("/{project_id}/change-requests/{cr_id}/diff")
def get_cr_diff(
    project_id: str, cr_id: int,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """Get diff between original and controller-proposed forecast for a CR."""
    from collections import defaultdict
    from models.financial import ExternalCostType

    cr = (
        db.query(ChangeRequest)
        .filter(ChangeRequest.id == cr_id, ChangeRequest.project_id == project_id)
        .first()
    )
    if not cr:
        raise HTTPException(404, "Change request not found")

    # Load active snapshots
    original_snap = (
        db.query(CRSubmissionSnapshot)
        .filter(
            CRSubmissionSnapshot.change_request_id == cr_id,
            CRSubmissionSnapshot.snapshot_type == "original",
            CRSubmissionSnapshot.is_active.is_(True),
        )
        .first()
    )
    proposed_snap = (
        db.query(CRSubmissionSnapshot)
        .filter(
            CRSubmissionSnapshot.change_request_id == cr_id,
            CRSubmissionSnapshot.snapshot_type == "controller_proposed",
            CRSubmissionSnapshot.is_active.is_(True),
        )
        .first()
    )

    if not original_snap or not proposed_snap:
        raise HTTPException(404, "No snapshot data available for diff")

    original_data = json.loads(original_snap.forecast_data_json)
    proposed_data = json.loads(proposed_snap.forecast_data_json)

    # Index by (category, sub_category, month)
    orig_map: dict[tuple, dict] = {}
    for entry in original_data:
        key = (entry["category"], entry["sub_category"], entry["month"])
        orig_map[key] = entry

    prop_map: dict[tuple, dict] = {}
    for entry in proposed_data:
        key = (entry["category"], entry["sub_category"], entry["month"])
        prop_map[key] = entry

    # Collect all months and line items
    all_months: set[str] = set()
    line_keys: set[tuple[str, str]] = set()  # (category, sub_category)
    for key in set(orig_map.keys()) | set(prop_map.keys()):
        cat, sub, month = key
        all_months.add(month)
        line_keys.add((cat, sub))

    sorted_months = sorted(all_months)

    # Resolve names
    role_names = {r.id: r.name for r in db.query(RoleType).all()}
    cost_type_names = {c.id: c.name for c in db.query(ExternalCostType).all()}

    # Look up hourly rates
    rate_cache: dict[str, float] = {}
    for cat, sub in line_keys:
        if cat == "internal" and sub not in rate_cache:
            rate_row = (
                db.query(RateTable)
                .filter(RateTable.role_type_id == sub)
                .order_by(RateTable.effective_date.desc())
                .first()
            )
            rate_cache[sub] = float(rate_row.hourly_rate) if rate_row else 120.0

    # Build line items
    line_items = []
    total_current_eur = 0.0
    total_proposed_eur = 0.0

    for cat, sub in sorted(line_keys, key=lambda x: (0 if x[0] == "internal" else 1, x[1])):
        is_internal = cat == "internal"
        name = role_names.get(sub, sub) if is_internal else cost_type_names.get(sub, sub)
        rate = rate_cache.get(sub, 1.0) if is_internal else 1.0

        month_values = []
        for m in sorted_months:
            key = (cat, sub, m)
            orig_entry = orig_map.get(key, {})
            prop_entry = prop_map.get(key, {})

            if is_internal:
                current_val = orig_entry.get("hours") or 0
                proposed_val = prop_entry.get("hours") or 0
            else:
                current_val = orig_entry.get("amount_eur") or 0
                proposed_val = prop_entry.get("amount_eur") or 0

            current_eur = current_val * rate if is_internal else current_val
            proposed_eur = proposed_val * rate if is_internal else proposed_val
            is_changed = abs(current_val - proposed_val) > 0.01

            month_values.append({
                "month": m,
                "proposed": proposed_val,
                "proposed_eur": proposed_eur,
                "current": current_val,
                "current_eur": current_eur,
                "is_changed": is_changed,
            })

        current_total = sum(mv["current"] for mv in month_values)
        proposed_total = sum(mv["proposed"] for mv in month_values)
        current_total_eur = sum(mv["current_eur"] for mv in month_values)
        proposed_total_eur = sum(mv["proposed_eur"] for mv in month_values)

        total_current_eur += current_total_eur
        total_proposed_eur += proposed_total_eur

        line_items.append({
            "id": sub,
            "name": name,
            "category": cat,
            "unit": "hours" if is_internal else "eur",
            "months": month_values,
            "current_total": round(current_total, 1),
            "proposed_total": round(proposed_total, 1),
            "current_total_eur": round(current_total_eur, 2),
            "proposed_total_eur": round(proposed_total_eur, 2),
        })

    # KPIs
    delta_eur = total_proposed_eur - total_current_eur
    delta_color = "#059669" if delta_eur < 0 else "#dc2626" if delta_eur > 0 else "#334155"
    delta_pct = round((delta_eur / total_current_eur) * 100, 1) if total_current_eur != 0 else 0.0
    kpis = [
        {"label": "Affected Lines (Current)", "value": round(total_current_eur, 2), "format": "currency", "color": "#334155"},
        {"label": "Affected Lines (Proposed)", "value": round(total_proposed_eur, 2), "format": "currency", "color": "#1e40af"},
        {"label": "Total Impact", "value": round(delta_eur, 2), "format": "currency_delta", "color": delta_color},
    ]

    return {
        "cr_id": cr.id,
        "project_id": cr.project_id,
        "project_name": cr.project.name if cr.project else "",
        "controller_feedback": cr.controller_feedback,
        "grid_data": {
            "months": sorted_months,
            "line_items": line_items,
            "kpis": kpis,
        },
    }


@router.put("/{project_id}/change-requests/{cr_id}/accept-changes")
def accept_cr_changes(
    project_id: str, cr_id: int,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """PL accepts controller's proposed changes for a CR."""
    cr = (
        db.query(ChangeRequest)
        .filter(ChangeRequest.id == cr_id, ChangeRequest.project_id == project_id)
        .first()
    )
    if not cr:
        raise HTTPException(404, "Change request not found")
    if cr.status != "sent_back_by_controller":
        raise HTTPException(409, f"CR status is '{cr.status}', expected 'sent_back_by_controller'")

    # Load controller_proposed snapshot
    proposed_snap = (
        db.query(CRSubmissionSnapshot)
        .filter(
            CRSubmissionSnapshot.change_request_id == cr_id,
            CRSubmissionSnapshot.snapshot_type == "controller_proposed",
            CRSubmissionSnapshot.is_active.is_(True),
        )
        .first()
    )

    if proposed_snap:
        proposed_data = json.loads(proposed_snap.forecast_data_json)
        original_snap = (
            db.query(CRSubmissionSnapshot)
            .filter(
                CRSubmissionSnapshot.change_request_id == cr_id,
                CRSubmissionSnapshot.snapshot_type == "original",
                CRSubmissionSnapshot.is_active.is_(True),
            )
            .first()
        )
        original_data = json.loads(original_snap.forecast_data_json) if original_snap else []

        # Index original data
        orig_map: dict[tuple, dict] = {}
        for entry in original_data:
            key = (entry["category"], entry["sub_category"], entry["month"])
            orig_map[key] = entry

        # Update CRChangeDetail rows to reflect accepted values
        # Clear existing details and recreate from snapshot diff
        db.query(CRChangeDetail).filter(CRChangeDetail.change_request_id == cr_id).delete()
        db.flush()

        role_names = {r.id: r.name for r in db.query(RoleType).all()}
        from models.financial import ExternalCostType
        cost_type_names = {c.id: c.name for c in db.query(ExternalCostType).all()}

        for entry in proposed_data:
            key = (entry["category"], entry["sub_category"], entry["month"])
            orig_entry = orig_map.get(key, {})
            is_internal = entry["category"] == "internal"

            old_val = orig_entry.get("hours" if is_internal else "amount_eur") or 0
            new_val = entry.get("hours" if is_internal else "amount_eur") or 0

            if abs(old_val - new_val) > 0.01:
                sub = entry["sub_category"]
                name = role_names.get(sub, sub) if is_internal else cost_type_names.get(sub, sub)
                delta_val = new_val - old_val
                delta_str = f"{'+' if delta_val > 0 else ''}{delta_val:.0f} {'hrs/mo' if is_internal else 'EUR/mo'}"

                detail = CRChangeDetail(
                    change_request_id=cr_id,
                    field_changed=name,
                    old_value=str(int(old_val)) if old_val == int(old_val) else str(old_val),
                    new_value=str(int(new_val)) if new_val == int(new_val) else str(new_val),
                    delta=delta_str,
                    line_item_type=entry["sub_category"],
                    month=entry["month"],
                )
                db.add(detail)

    # Determine next status: check if CR has internal resource changes
    has_resource_changes = any(
        d.line_item_type and d.line_item_type.startswith("role-")
        for d in cr.change_details
    )

    if has_resource_changes:
        # Needs CC Owner confirmation for resource changes
        cr.status = "pending_cc_confirmation"
        from routers.portfolio import _create_resource_requests_from_cr
        _create_resource_requests_from_cr(cr, db)
    else:
        # No resource impact — approve directly and update forecast
        cr.status = "approved"
        cr.controller_status = "approved"
        cr.controller_approval_timestamp = datetime.utcnow()
        _apply_cr_to_forecast(cr, db)

    cr.controller_feedback = None
    db.commit()

    # [A-BK-14] CR acceptance may have applied forecast deltas (no-resource
    # path auto-approves and runs _apply_cr_to_forecast) → recompute the
    # backlog within_cutoff flags so envelope consumption stays current.
    try:
        from services.ranking import recompute_within_cutoff_for_backlog
        recompute_within_cutoff_for_backlog(db)
    except Exception:  # noqa: BLE001 — defensive: trigger best-effort.
        db.rollback()

    return {"status": cr.status, "message": "Changes accepted successfully."}


@router.put("/{project_id}/change-requests/{cr_id}/resubmit")
def resubmit_cr(
    project_id: str, cr_id: int,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """PL edits and resubmits a CR back to controller."""
    cr = (
        db.query(ChangeRequest)
        .filter(ChangeRequest.id == cr_id, ChangeRequest.project_id == project_id)
        .first()
    )
    if not cr:
        raise HTTPException(404, "Change request not found")
    if cr.status != "sent_back_by_controller":
        raise HTTPException(409, f"CR status is '{cr.status}', expected 'sent_back_by_controller'")

    # Deactivate old snapshots
    db.query(CRSubmissionSnapshot).filter(
        CRSubmissionSnapshot.change_request_id == cr_id,
        CRSubmissionSnapshot.is_active.is_(True),
    ).update({"is_active": False})

    # Determine whether to route through CC Owner or directly to Controller
    has_resource_changes = any(
        d.line_item_type and d.line_item_type.startswith("role-")
        for d in cr.change_details
    )

    if has_resource_changes:
        cr.status = "pending_cc_confirmation"
        # Reset CC Owner fields for fresh confirmation
        cr.cc_owner_id = None
        cr.cc_status = None
        cr.cc_confirmation_timestamp = None
        cr.cc_comments = None
        # Recreate resource requests
        from routers.portfolio import _create_resource_requests_from_cr
        _create_resource_requests_from_cr(cr, db)
    else:
        cr.status = "pending_controller_approval"

    cr.controller_feedback = None
    cr.controller_status = None
    cr.controller_comments = None
    cr.controller_id = None
    cr.controller_approval_timestamp = None
    db.commit()

    return {"status": cr.status, "message": "Change request resubmitted."}


def _apply_cr_to_forecast(cr: ChangeRequest, db: Session) -> None:
    """Apply CR change details to forecast rows."""
    for detail in cr.change_details:
        if detail.month and detail.new_value:
            row = (
                db.query(Forecast)
                .filter(
                    Forecast.project_id == cr.project_id,
                    Forecast.month == detail.month,
                    Forecast.sub_category == detail.line_item_type,
                )
                .first()
            )
            if row:
                try:
                    new_val = float(detail.new_value.replace("€", "").replace(",", "").strip())
                    is_internal = detail.line_item_type and detail.line_item_type.startswith("role-")
                    if is_internal:
                        row.hours = new_val
                        rate_row = (
                            db.query(RateTable)
                            .filter(RateTable.role_type_id == detail.line_item_type)
                            .order_by(RateTable.effective_date.desc())
                            .first()
                        )
                        rate = float(rate_row.hourly_rate) if rate_row else 120.0
                        row.amount_eur = new_val * rate
                    else:
                        row.amount_eur = new_val
                except (ValueError, AttributeError):
                    pass

    # After updating forecast, ensure allocations match
    from services.allocation_service import ensure_project_allocations
    ensure_project_allocations(cr.project_id, db)


# ===========================================================================
# C1 — Mixed-Granularity Forecast Grid [C-FG-01..08]
# ===========================================================================

@router.get("/{project_id}/forecast/grid")
def get_forecast_grid(
    project_id: str,
    granularity: str = Query(
        default="mixed",
        description="'mixed' (default), 'monthly', or 'quarterly'",
    ),
    boundary_months: int | None = Query(
        default=None,
        description="Override for granularity_boundary_months",
    ),
    horizon_months: int | None = Query(
        default=None,
        description="Override for planning_horizon_months",
    ),
    lookback_months: int = Query(
        default=12,
        ge=0,
        le=36,
        description=(
            "v5.1 W3: number of past months rendered before demo_date in "
            "the inner monthly window. Default 12 covers the prior calendar "
            "year of actuals. 0 reverts to the v5 column model "
            "(start at demo_date)."
        ),
    ),
    include_person_breakdown: bool = Query(
        default=True,
        description=(
            "v5.1 C-05: when True, internal rows carry per-employee "
            "sub_rows for the F&P grid expand affordance. Default True "
            "(frontend always shows the chevron)."
        ),
    ),
    include_vendor_breakdown: bool = Query(
        default=True,
        description=(
            "v5.1 C-06 / C-07: when True, external rows carry per-vendor "
            "sub_rows and a derived role_name for the F&P grid label. "
            "Default True."
        ),
    ),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Mixed-granularity forecast grid [C-FG-02].

    Monthly columns within the boundary, quarterly columns beyond.
    Existing v4 GET /api/projects/{id}/forecast is untouched and returns
    the v4 shape; this endpoint is the new C1 surface.
    """
    from dependencies import pl_project_filter
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    # PL filter: only own projects
    if user.role == "project_lead" and project_id not in user.project_ids:
        raise HTTPException(403, "Access denied")

    if granularity not in ("mixed", "monthly", "quarterly"):
        raise HTTPException(422, "granularity must be 'mixed', 'monthly', or 'quarterly'")

    from services.forecast_versioning import build_mixed_grid
    # v5.1 C-08: include baseline + actuals overlays so the UI can render
    # the three-point cell stack. capture_version() still defaults to
    # include_baseline_actuals=False so version snapshots stay forecast-only.
    # v5.1 W3: lookback_months extends the inner monthly window backwards
    # so past months (with full actuals) render alongside future ones.
    # v5.1 W4 C-05/C-06/C-07: include_*_breakdown thread per-employee /
    # per-vendor sub_rows + the derived role_name.
    grid = build_mixed_grid(
        db=db,
        project_id=project_id,
        demo_date=DEMO_DATE,
        granularity=granularity,
        boundary_months=boundary_months,
        horizon_months=horizon_months,
        include_baseline_actuals=True,
        lookback_months=lookback_months,
        include_person_breakdown=include_person_breakdown,
        include_vendor_breakdown=include_vendor_breakdown,
    )
    return grid


# ===========================================================================
# C1 — Forecast Versions [C-FV-01..07, C-RH-01..05]
# ===========================================================================

@router.get("/{project_id}/forecast/versions")
def list_forecast_versions(
    project_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """List forecast versions for a project, newest first [C-RH-01]."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    # PL filter
    if user.role == "project_lead" and project_id not in user.project_ids:
        raise HTTPException(403, "Access denied")

    from services.forecast_versioning import list_versions
    versions, total = list_versions(db, project_id, limit=limit, offset=offset)

    items = [
        ForecastVersionMeta(
            id=fv.id,
            project_id=fv.project_id,
            version_number=fv.version_number,
            version_type=fv.version_type,
            cycle_label=fv.cycle_label,
            cycle_id=fv.cycle_id,
            change_request_id=fv.change_request_id,
            created_at=fv.created_at,
            created_by_id=fv.created_by_id,
            created_by_name=fv.created_by.name if fv.created_by else None,
            granularity_boundary_months=fv.granularity_boundary_months,
            planning_horizon_months=fv.planning_horizon_months,
            cell_count=fv.cell_count,
            total_amount_eur=float(fv.total_amount_eur) if fv.total_amount_eur else None,
        )
        for fv in versions
    ]
    return ForecastVersionListResponse(items=items, total=total)


@router.get("/{project_id}/forecast/versions/{version_id}")
def get_forecast_version(
    project_id: str,
    version_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Get a specific forecast version including payload [C-RH-02]."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    if user.role == "project_lead" and project_id not in user.project_ids:
        raise HTTPException(403, "Access denied")

    from services.forecast_versioning import get_version
    import json as _json

    fv = get_version(db, version_id)
    if not fv or fv.project_id != project_id:
        raise HTTPException(404, "Forecast version not found")

    meta = ForecastVersionMeta(
        id=fv.id,
        project_id=fv.project_id,
        version_number=fv.version_number,
        version_type=fv.version_type,
        cycle_label=fv.cycle_label,
        cycle_id=fv.cycle_id,
        change_request_id=fv.change_request_id,
        created_at=fv.created_at,
        created_by_id=fv.created_by_id,
        created_by_name=fv.created_by.name if fv.created_by else None,
        granularity_boundary_months=fv.granularity_boundary_months,
        planning_horizon_months=fv.planning_horizon_months,
        cell_count=fv.cell_count,
        total_amount_eur=float(fv.total_amount_eur) if fv.total_amount_eur else None,
    )

    payload = None
    if fv.payload_json:
        try:
            payload = _json.loads(fv.payload_json)
        except (json.JSONDecodeError, TypeError):
            pass

    return ForecastVersionDetail(meta=meta, payload=payload)


@router.post("/{project_id}/forecast/versions")
def create_manual_forecast_version(
    project_id: str,
    body: ManualSnapshotRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Manually create a forecast version snapshot (controller only) [C-FV-03]."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")

    from services.forecast_versioning import capture_version
    fv = capture_version(
        db=db,
        project_id=project_id,
        user=user,
        version_type="manual",
        cycle_label=body.label,
    )
    db.commit()
    db.refresh(fv)

    return ForecastVersionMeta(
        id=fv.id,
        project_id=fv.project_id,
        version_number=fv.version_number,
        version_type=fv.version_type,
        cycle_label=fv.cycle_label,
        cycle_id=fv.cycle_id,
        change_request_id=fv.change_request_id,
        created_at=fv.created_at,
        created_by_id=fv.created_by_id,
        created_by_name=fv.created_by.name if fv.created_by else None,
        granularity_boundary_months=fv.granularity_boundary_months,
        planning_horizon_months=fv.planning_horizon_months,
        cell_count=fv.cell_count,
        total_amount_eur=float(fv.total_amount_eur) if fv.total_amount_eur else None,
    )


# ===========================================================================
# C1 — Cross-project version diff [C-RH-05] (separate router prefix)
# ===========================================================================

@forecast_router.get("/versions/{version_a_id}/diff/{version_b_id}")
def get_forecast_version_diff(
    version_a_id: int,
    version_b_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Diff two forecast versions (cross-project is valid) [C-RH-05]."""
    from services.forecast_versioning import compute_diff, get_version
    from schemas.workbench import CellDelta

    fv_a = get_version(db, version_a_id)
    fv_b = get_version(db, version_b_id)

    if fv_a is None:
        raise HTTPException(404, f"Version {version_a_id} not found")
    if fv_b is None:
        raise HTTPException(404, f"Version {version_b_id} not found")

    # PL filtering: PL can only diff their own project's versions
    if user.role == "project_lead":
        if fv_a.project_id not in user.project_ids or fv_b.project_id not in user.project_ids:
            raise HTTPException(403, "Access denied")

    try:
        diff = compute_diff(db, version_a_id, version_b_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc))

    return ForecastVersionDiff(
        version_a_id=diff["version_a_id"],
        version_b_id=diff["version_b_id"],
        version_a_number=diff["version_a_number"],
        version_b_number=diff["version_b_number"],
        version_a_project_id=diff["version_a_project_id"],
        version_b_project_id=diff["version_b_project_id"],
        line_deltas=[CellDelta(**d) for d in diff["line_deltas"]],
        summary=diff["summary"],
        grand_totals=diff["grand_totals"],
    )


# ---------------------------------------------------------------------------
# E1 — Progress Tracker endpoints [E-04c] [E-04d]
# ---------------------------------------------------------------------------

from models.projects import MilestoneDeliverable, ProgressSnapshot  # noqa: E402
from schemas.workbench import (  # noqa: E402
    DeliverableCreateRequest, DeliverableItem, DeliverableListResponse,
    DeliverableUpdateRequest, PortfolioProgressAggregateResponse,
    PortfolioProgressIndicator, ProgressHistoryListResponse, ProgressResponse,
    ProgressSnapshotDetail, ProgressSnapshotMeta, ProgressUpdateRequest,
)
from services.progress_tracker import (  # noqa: E402
    MAX_CHECKLIST_ITEMS, apply_progress_update, build_progress_response_payload,
    compute_portfolio_progress_indicators,
)


def _can_edit_progress(user: CurrentUser, project: Project) -> bool:
    """Controllers can edit any project; PLs can edit projects they own."""
    if user.role == "controller":
        return True
    if user.role == "project_lead":
        if project.pl_person_id == user.person_id:
            return True
        if project.id in (user.project_ids or []):
            return True
    return False


def _load_project_or_404(db: Session, project_id: str) -> Project:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, f"Project {project_id} not found")
    return project


def _emit_progress_audit(
    db: Session,
    user: CurrentUser,
    project: Project,
    deltas: dict,
) -> None:
    """One audit_log entry per changed field. Category: forecast_actions."""
    from routers.admin import _log_audit
    for field, (old_val, new_val) in deltas.items():
        _log_audit(
            db, user, "project_progress", project.id, project.name,
            "update", field,
            None if old_val is None else str(old_val),
            None if new_val is None else str(new_val),
            category="forecast_actions",
        )


def _serialize_deliverable(item: MilestoneDeliverable) -> DeliverableItem:
    return DeliverableItem(
        id=item.id,
        milestone_id=item.milestone_id,
        sequence=item.sequence,
        text=item.text,
        is_complete=item.is_complete,
        completed_at=item.completed_at,
        completed_by_id=item.completed_by_id,
    )


def _serialize_progress_snapshot(
    snap: ProgressSnapshot, person_lookup: dict[str, str],
) -> ProgressSnapshotMeta:
    return ProgressSnapshotMeta(
        id=snap.id,
        project_id=snap.project_id,
        cycle_label=snap.cycle_label,
        cycle_id=snap.cycle_id,
        snapshot_at=snap.snapshot_at,
        created_by_id=snap.created_by_id,
        created_by_name=person_lookup.get(snap.created_by_id) if snap.created_by_id else None,
        current_milestone_id=snap.current_milestone_id,
        current_milestone_name=snap.current_milestone_name,
        current_milestone_sequence=snap.current_milestone_sequence,
        progress_pct=float(snap.progress_pct) if snap.progress_pct is not None else None,
        progress_pct_manual_override=bool(snap.progress_pct_manual_override),
        status_narrative=snap.status_narrative,
        next_milestone_confidence=snap.next_milestone_confidence,
        confidence_reason=snap.confidence_reason,
    )


# --- Progress GET / PATCH -------------------------------------------------


@router.get("/{project_id}/progress", response_model=ProgressResponse)
def get_project_progress(
    project_id: str,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """Return the current progress tracker state for a project [E-04c]."""
    project = _load_project_or_404(db, project_id)
    payload = build_progress_response_payload(db, project)
    return ProgressResponse(**payload)


@router.patch("/{project_id}/progress", response_model=ProgressResponse)
def update_project_progress(
    project_id: str,
    body: ProgressUpdateRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Mutate live progress fields. Live-editable per [E-04c].

    Authorization: controller (any project) or PL (own project).
    Audit category: ``forecast_actions``. One audit entry per changed field.
    """
    project = _load_project_or_404(db, project_id)
    if not _can_edit_progress(user, project):
        raise HTTPException(403, "Insufficient permissions to edit progress")

    explicit = set(body.model_dump(exclude_unset=True).keys())
    try:
        deltas = apply_progress_update(
            db, project, user,
            current_milestone_id=body.current_milestone_id,
            progress_pct=body.progress_pct,
            progress_pct_manual_override=body.progress_pct_manual_override,
            status_narrative=body.status_narrative,
            next_milestone_confidence=body.next_milestone_confidence,
            confidence_reason=body.confidence_reason,
            set_explicit=explicit,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    if deltas:
        _emit_progress_audit(db, user, project, deltas)
        db.commit()
        db.refresh(project)

    payload = build_progress_response_payload(db, project)
    return ProgressResponse(**payload)


# --- Progress history -----------------------------------------------------


@router.get("/{project_id}/progress/history", response_model=ProgressHistoryListResponse)
def list_progress_history(
    project_id: str,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """List progress snapshots for a project, newest first [E-04c]."""
    _load_project_or_404(db, project_id)

    snaps = (
        db.query(ProgressSnapshot)
        .filter(ProgressSnapshot.project_id == project_id)
        .order_by(ProgressSnapshot.snapshot_at.desc(), ProgressSnapshot.id.desc())
        .all()
    )

    person_ids = {s.created_by_id for s in snaps if s.created_by_id}
    persons = (
        db.query(Person).filter(Person.id.in_(person_ids)).all()
        if person_ids else []
    )
    person_lookup = {p.id: p.name for p in persons}

    items = [_serialize_progress_snapshot(s, person_lookup) for s in snaps]
    return ProgressHistoryListResponse(items=items, total=len(items))


@router.get(
    "/{project_id}/progress/history/{snapshot_id}",
    response_model=ProgressSnapshotDetail,
)
def get_progress_snapshot(
    project_id: str,
    snapshot_id: int,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """Return a single progress snapshot with the captured checklist payload."""
    _load_project_or_404(db, project_id)

    snap = (
        db.query(ProgressSnapshot)
        .filter(
            ProgressSnapshot.id == snapshot_id,
            ProgressSnapshot.project_id == project_id,
        )
        .first()
    )
    if snap is None:
        raise HTTPException(404, "Progress snapshot not found")

    person_lookup: dict[str, str] = {}
    if snap.created_by_id:
        person = db.query(Person).filter(Person.id == snap.created_by_id).first()
        if person:
            person_lookup[snap.created_by_id] = person.name

    checklist = []
    if snap.checklist_payload_json:
        try:
            checklist = json.loads(snap.checklist_payload_json)
        except (ValueError, TypeError):
            checklist = []

    return ProgressSnapshotDetail(
        meta=_serialize_progress_snapshot(snap, person_lookup),
        checklist=checklist,
    )


# --- Deliverable checklist CRUD -------------------------------------------


@router.get(
    "/{project_id}/milestones/{milestone_id}/checklist",
    response_model=DeliverableListResponse,
)
def list_milestone_deliverables(
    project_id: str,
    milestone_id: int,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """List deliverable checklist items for a milestone [E-04c]."""
    _load_project_or_404(db, project_id)

    ms = (
        db.query(ProjectMilestone)
        .filter(
            ProjectMilestone.id == milestone_id,
            ProjectMilestone.project_id == project_id,
        )
        .first()
    )
    if ms is None:
        raise HTTPException(404, "Milestone not found")

    items = (
        db.query(MilestoneDeliverable)
        .filter(MilestoneDeliverable.milestone_id == milestone_id)
        .order_by(MilestoneDeliverable.sequence)
        .all()
    )
    return DeliverableListResponse(
        items=[_serialize_deliverable(d) for d in items],
        total=len(items),
    )


@router.post(
    "/{project_id}/milestones/{milestone_id}/checklist",
    response_model=DeliverableItem,
)
def create_milestone_deliverable(
    project_id: str,
    milestone_id: int,
    body: DeliverableCreateRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Add a deliverable checklist item. Max 10 per milestone per [E-04c]."""
    project = _load_project_or_404(db, project_id)
    if not _can_edit_progress(user, project):
        raise HTTPException(403, "Insufficient permissions to edit deliverables")

    ms = (
        db.query(ProjectMilestone)
        .filter(
            ProjectMilestone.id == milestone_id,
            ProjectMilestone.project_id == project_id,
        )
        .first()
    )
    if ms is None:
        raise HTTPException(404, "Milestone not found")

    text = (body.text or "").strip()
    if not text:
        raise HTTPException(400, "Deliverable text must not be empty")

    existing_count = (
        db.query(MilestoneDeliverable)
        .filter(MilestoneDeliverable.milestone_id == milestone_id)
        .count()
    )
    if existing_count >= MAX_CHECKLIST_ITEMS:
        raise HTTPException(
            409,
            f"Milestone already has {MAX_CHECKLIST_ITEMS} deliverables "
            f"(maximum per [E-04c])",
        )

    if body.sequence is None:
        next_seq = existing_count + 1
    else:
        next_seq = max(1, int(body.sequence))

    item = MilestoneDeliverable(
        milestone_id=milestone_id,
        sequence=next_seq,
        text=text,
        is_complete=False,
    )
    db.add(item)

    from routers.admin import _log_audit
    _log_audit(
        db, user, "milestone_deliverable", str(milestone_id), text,
        "create", category="forecast_actions",
    )

    db.commit()
    db.refresh(item)
    return _serialize_deliverable(item)


@router.patch(
    "/{project_id}/checklist/{item_id}",
    response_model=DeliverableItem,
)
def update_milestone_deliverable(
    project_id: str,
    item_id: int,
    body: DeliverableUpdateRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Update a deliverable's text, completion, or sequence [E-04c]."""
    project = _load_project_or_404(db, project_id)
    if not _can_edit_progress(user, project):
        raise HTTPException(403, "Insufficient permissions to edit deliverables")

    item = (
        db.query(MilestoneDeliverable)
        .join(
            ProjectMilestone,
            MilestoneDeliverable.milestone_id == ProjectMilestone.id,
        )
        .filter(
            MilestoneDeliverable.id == item_id,
            ProjectMilestone.project_id == project_id,
        )
        .first()
    )
    if item is None:
        raise HTTPException(404, "Deliverable not found")

    explicit = set(body.model_dump(exclude_unset=True).keys())
    deltas: dict[str, tuple] = {}

    if "text" in explicit:
        new_text = (body.text or "").strip()
        if not new_text:
            raise HTTPException(400, "Deliverable text must not be empty")
        if new_text != item.text:
            deltas["text"] = (item.text, new_text)
            item.text = new_text

    if "is_complete" in explicit:
        new_complete = bool(body.is_complete)
        if item.is_complete != new_complete:
            deltas["is_complete"] = (item.is_complete, new_complete)
            item.is_complete = new_complete
            if new_complete:
                item.completed_at = datetime.utcnow()
                item.completed_by_id = user.person_id
            else:
                item.completed_at = None
                item.completed_by_id = None

    if "sequence" in explicit and body.sequence is not None:
        new_seq = max(1, int(body.sequence))
        if new_seq != item.sequence:
            deltas["sequence"] = (item.sequence, new_seq)
            item.sequence = new_seq

    if deltas:
        from routers.admin import _log_audit
        for field, (old_val, new_val) in deltas.items():
            _log_audit(
                db, user, "milestone_deliverable", str(item.id), item.text,
                "update", field,
                None if old_val is None else str(old_val),
                None if new_val is None else str(new_val),
                category="forecast_actions",
            )
        db.commit()
        db.refresh(item)

    return _serialize_deliverable(item)


@router.delete("/{project_id}/checklist/{item_id}")
def delete_milestone_deliverable(
    project_id: str,
    item_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Remove a deliverable from a milestone [E-04c]."""
    project = _load_project_or_404(db, project_id)
    if not _can_edit_progress(user, project):
        raise HTTPException(403, "Insufficient permissions to edit deliverables")

    item = (
        db.query(MilestoneDeliverable)
        .join(
            ProjectMilestone,
            MilestoneDeliverable.milestone_id == ProjectMilestone.id,
        )
        .filter(
            MilestoneDeliverable.id == item_id,
            ProjectMilestone.project_id == project_id,
        )
        .first()
    )
    if item is None:
        raise HTTPException(404, "Deliverable not found")

    from routers.admin import _log_audit
    _log_audit(
        db, user, "milestone_deliverable", str(item.id), item.text,
        "delete", category="forecast_actions",
    )

    db.delete(item)
    db.commit()
    return {"id": item_id, "deleted": True}


# --- Portfolio aggregation [E-04d] ----------------------------------------


@progress_router.get(
    "/progress-aggregate",
    response_model=PortfolioProgressAggregateResponse,
)
def get_portfolio_progress_aggregate(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Portfolio-wide progress indicators for Backlog / Portfolio inline view.

    Filters to the user's project scope (PL sees only own projects per
    standard scope rules).
    """
    project_ids: list[str] | None = None
    if user.role == "project_lead":
        project_ids = list(user.project_ids or [])

    payload = compute_portfolio_progress_indicators(db, project_ids=project_ids)
    return PortfolioProgressAggregateResponse(
        items=[PortfolioProgressIndicator(**row) for row in payload["items"]],
        total=payload["total"],
        summary=payload["summary"],
    )


# ---------------------------------------------------------------------------
# v5 Session E2 — External cost aggregation (project-scoped) [E-08a]–[E-08b]
# ---------------------------------------------------------------------------

def _verify_project_visible(db: Session, project_id: str, user: CurrentUser) -> Project:
    """Look up a project and verify the current user can see it.

    Project Leads only see their own projects; Cost Center Owners only see
    projects with allocations from their cost center; Controllers and
    Executives see everything.
    """
    from dependencies import pl_project_filter

    proj = db.query(Project).filter(Project.id == project_id).first()
    if not proj:
        raise HTTPException(404, f"Project not found: {project_id}")

    if user.role == "project_lead":
        # Re-query under PL filter to confirm visibility
        visible = (
            db.query(Project.id)
            .filter(Project.id == project_id, pl_project_filter(user))
            .first()
        )
        if not visible:
            raise HTTPException(403, "Forbidden: not your project")
    elif user.role == "cost_center_owner" and user.cost_center_id:
        from models.people import Person
        cc_person_ids = [
            r[0] for r in db.query(Person.id)
            .filter(Person.cost_center_id == user.cost_center_id).all()
        ]
        if cc_person_ids:
            allowed = (
                db.query(Allocation.project_id)
                .filter(
                    Allocation.project_id == project_id,
                    Allocation.person_id.in_(cc_person_ids),
                )
                .first()
            )
            if not allowed:
                raise HTTPException(403, "Forbidden: project not in your CC scope")
        else:
            raise HTTPException(403, "Forbidden: no people in your cost center")

    return proj


@external_costs_workbench_router.get(
    "/projects/{project_id}/external-costs/vendor-summary",
)
def get_project_external_cost_vendor_summary(
    project_id: str,
    year: int | None = Query(None, description="Optional fiscal year filter (YYYY)"),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Vendor breakdown for a single project per [E-08a].

    Returns one row per vendor with forecast/actuals/baseline totals plus
    derived remaining and variance figures.
    """
    from services.external_cost_aggregation import compute_project_vendor_summary

    _verify_project_visible(db, project_id, user)
    rows = compute_project_vendor_summary(db, project_id, year=year)
    return {
        "items": rows,
        "total": len(rows),
        "project_id": project_id,
        "year": year,
    }


@external_costs_workbench_router.get(
    "/projects/{project_id}/external-costs/category-rollup",
)
def get_project_external_cost_category_rollup(
    project_id: str,
    year: int | None = Query(None, description="Optional fiscal year filter (YYYY)"),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Per-cost-type rollup for a single project per [E-08b]."""
    from services.external_cost_aggregation import compute_project_category_rollup

    _verify_project_visible(db, project_id, user)
    rows = compute_project_category_rollup(db, project_id, year=year)
    return {
        "items": rows,
        "total": len(rows),
        "project_id": project_id,
        "year": year,
    }
