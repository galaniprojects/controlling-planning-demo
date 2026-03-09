"""Portfolio business logic — KPI aggregation, tree building, chart data."""

from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.orm import Session

from config import DEMO_DATE
from models.capacity import Allocation
from models.financial import Actuals, Baseline, Forecast
from models.organization import LineOfBusiness
from models.people import Person
from models.projects import Program, Project
from services.calculations import (
    FTE_HOURS,
    compute_budget_rag,
    compute_combined_rag,
    compute_plan_drift,
    compute_timeline_rag,
    compute_utilization_pct,
)


def compute_portfolio_kpis(db: Session, filters: dict | None = None) -> dict:
    """Compute portfolio-level KPI summary, optionally filtered."""
    filters = filters or {}

    # Build filtered project ID list
    proj_q = db.query(Project.id).filter(Project.is_active.is_(True))
    if filters.get("lob"):
        proj_q = proj_q.filter(Project.lob_id == filters["lob"])
    if filters.get("status"):
        proj_q = proj_q.filter(Project.status == filters["status"])
    if filters.get("rag"):
        proj_q = proj_q.filter(Project.rag_status == filters["rag"])
    if filters.get("type"):
        if filters["type"] == "service":
            proj_q = proj_q.filter(Project.is_service.is_(True))
        elif filters["type"] == "project":
            proj_q = proj_q.filter(Project.is_service.is_(False))
    project_ids = [r[0] for r in proj_q.all()]

    if not project_ids:
        return {
            "total_budget": 0, "ytd_spend": 0, "portfolio_variance_pct": 0,
            "overall_utilization_pct": 0, "run_change_ratio": "50/50",
            "run_total": 0, "change_total": 0, "run_pct": 50, "change_pct": 50,
        }

    # Total budget
    total_budget = (
        db.query(func.coalesce(func.sum(Project.total_budget), 0))
        .filter(Project.id.in_(project_ids))
        .scalar()
    )

    # YTD spend (actuals through demo date)
    ytd_spend = (
        db.query(func.coalesce(func.sum(Actuals.amount_eur), 0))
        .filter(Actuals.project_id.in_(project_ids), Actuals.month <= DEMO_DATE)
        .scalar()
    )

    # Total forecast at completion
    total_forecast = (
        db.query(func.coalesce(func.sum(Forecast.amount_eur), 0))
        .filter(Forecast.project_id.in_(project_ids))
        .scalar()
    )

    # Total baseline
    total_baseline = (
        db.query(func.coalesce(func.sum(Baseline.amount_eur), 0))
        .filter(Baseline.project_id.in_(project_ids))
        .scalar()
    )

    # Portfolio variance
    portfolio_variance_pct = compute_plan_drift(float(total_forecast), float(total_baseline))

    # Overall utilization: average across all active people for current month
    total_alloc_hours = (
        db.query(func.coalesce(func.sum(Allocation.hours), 0))
        .filter(Allocation.month == DEMO_DATE)
        .scalar()
    )
    active_headcount = (
        db.query(func.count(Person.id))
        .filter(Person.is_active.is_(True), Person.cost_center_id.isnot(None))
        .scalar()
    )
    if active_headcount > 0:
        overall_utilization = compute_utilization_pct(float(total_alloc_hours) / active_headcount)
    else:
        overall_utilization = 0.0

    # Run/Change ratio — services use annual_budget, projects use total_budget
    run_budget = (
        db.query(func.coalesce(func.sum(Project.annual_budget), 0))
        .filter(Project.id.in_(project_ids), Project.is_service.is_(True))
        .scalar()
    )
    change_budget = (
        db.query(func.coalesce(func.sum(Project.total_budget), 0))
        .filter(Project.id.in_(project_ids), Project.is_service.is_(False))
        .scalar()
    )
    total = float(run_budget or 0) + float(change_budget or 0)
    if total > 0:
        run_pct = round(float(run_budget or 0) / total * 100)
        change_pct = 100 - run_pct
    else:
        run_pct = change_pct = 50

    return {
        "total_budget": round(float(total_budget), 2),
        "ytd_spend": round(float(ytd_spend), 2),
        "portfolio_variance_pct": round(portfolio_variance_pct, 1),
        "overall_utilization_pct": overall_utilization,
        "run_change_ratio": f"{run_pct}/{change_pct}",
        "run_total": round(float(run_budget or 0), 2),
        "change_total": round(float(change_budget or 0), 2),
        "run_pct": run_pct,
        "change_pct": change_pct,
    }


def compute_project_financials(db: Session, project_id: str) -> dict:
    """Compute financial summary for a single project."""
    baseline_total = (
        db.query(func.coalesce(func.sum(Baseline.amount_eur), 0))
        .filter(Baseline.project_id == project_id)
        .scalar()
    )
    forecast_total = (
        db.query(func.coalesce(func.sum(Forecast.amount_eur), 0))
        .filter(Forecast.project_id == project_id)
        .scalar()
    )
    actuals_ytd = (
        db.query(func.coalesce(func.sum(Actuals.amount_eur), 0))
        .filter(Actuals.project_id == project_id, Actuals.month <= DEMO_DATE)
        .scalar()
    )
    forecast_ytd = (
        db.query(func.coalesce(func.sum(Forecast.amount_eur), 0))
        .filter(Forecast.project_id == project_id, Forecast.month <= DEMO_DATE)
        .scalar()
    )

    plan_drift = compute_plan_drift(float(forecast_total), float(baseline_total))

    return {
        "baseline_total": round(float(baseline_total), 2),
        "forecast_total": round(float(forecast_total), 2),
        "actuals_ytd": round(float(actuals_ytd), 2),
        "forecast_ytd": round(float(forecast_ytd), 2),
        "plan_drift_pct": round(plan_drift, 1),
    }


def build_portfolio_tree(db: Session, filters: dict | None = None) -> list[dict]:
    """Build hierarchical portfolio tree: LoB -> Program -> Project.

    Three-pass approach:
    1. Load all projects (with optional filters)
    2. Group into hierarchy
    3. Aggregate bottom-up
    """
    filters = filters or {}

    # Pass 1: Load projects
    query = db.query(Project).filter(Project.is_active.is_(True))

    if filters.get("lob"):
        query = query.filter(Project.lob_id == filters["lob"])
    if filters.get("status"):
        query = query.filter(Project.status == filters["status"])
    if filters.get("rag"):
        query = query.filter(Project.rag_status == filters["rag"])
    if filters.get("type"):
        if filters["type"] == "service":
            query = query.filter(Project.is_service.is_(True))
        elif filters["type"] == "project":
            query = query.filter(Project.is_service.is_(False))

    projects = query.all()

    # Compute financials for each project
    project_nodes = []
    for p in projects:
        fins = compute_project_financials(db, p.id)
        project_nodes.append({
            "id": p.id,
            "name": p.name,
            "type": "service" if p.is_service else "project",
            "status": p.status,
            "rag": p.rag_status,
            "baseline_budget": fins["baseline_total"],
            "current_forecast": fins["forecast_total"],
            "actuals_ytd": fins["actuals_ytd"],
            "variance_pct": fins["plan_drift_pct"],
            "timeline": {
                "start": p.start_month,
                "end": p.end_month,
                "projected_end": p.projected_end_month,
            },
            "lob_id": p.lob_id,
            "program_id": p.program_id,
            "children": [],
        })

    # Pass 2: Group into hierarchy
    lob_map: dict[str, dict] = {}  # lob_id -> {lob_node, programs: {prog_id -> prog_node}, direct: []}
    all_lobs = db.query(LineOfBusiness).all()

    for lob in all_lobs:
        if filters.get("lob") and lob.id != filters["lob"]:
            continue
        lob_map[lob.id] = {
            "id": lob.id,
            "name": lob.name,
            "type": "lob",
            "_programs": {},
            "_direct": [],
        }

    # Load programs
    programs = db.query(Program).all()
    for prog in programs:
        if prog.lob_id in lob_map:
            lob_map[prog.lob_id]["_programs"][prog.id] = {
                "id": prog.id,
                "name": prog.name,
                "type": "program",
                "_children": [],
            }

    # Place projects
    for pn in project_nodes:
        lob_id = pn["lob_id"]
        prog_id = pn["program_id"]
        if lob_id not in lob_map:
            continue
        if prog_id and prog_id in lob_map[lob_id]["_programs"]:
            lob_map[lob_id]["_programs"][prog_id]["_children"].append(pn)
        else:
            lob_map[lob_id]["_direct"].append(pn)

    # Pass 3: Aggregate bottom-up
    rag_priority = {"red": 2, "amber": 1, "green": 0, None: -1}
    tree = []

    for lob_id, lob_data in lob_map.items():
        lob_children = []
        lob_baseline = 0.0
        lob_forecast = 0.0
        lob_actuals = 0.0
        worst_rag = None

        # Process programs
        for prog_id, prog_data in lob_data["_programs"].items():
            prog_baseline = sum(c["baseline_budget"] for c in prog_data["_children"])
            prog_forecast = sum(c["current_forecast"] for c in prog_data["_children"])
            prog_actuals = sum(c["actuals_ytd"] for c in prog_data["_children"])
            prog_variance = compute_plan_drift(prog_forecast, prog_baseline) if prog_baseline else 0.0
            prog_rag = max(
                (c["rag"] for c in prog_data["_children"] if c["rag"]),
                key=lambda r: rag_priority.get(r, -1),
                default=None,
            )

            if prog_data["_children"]:
                prog_node = {
                    "id": prog_data["id"],
                    "name": prog_data["name"],
                    "type": "program",
                    "status": None,
                    "rag": prog_rag,
                    "baseline_budget": round(prog_baseline, 2),
                    "current_forecast": round(prog_forecast, 2),
                    "actuals_ytd": round(prog_actuals, 2),
                    "variance_pct": round(prog_variance, 1),
                    "timeline": None,
                    "children": prog_data["_children"],
                }
                lob_children.append(prog_node)
                lob_baseline += prog_baseline
                lob_forecast += prog_forecast
                lob_actuals += prog_actuals
                if prog_rag and rag_priority.get(prog_rag, -1) > rag_priority.get(worst_rag, -1):
                    worst_rag = prog_rag

        # Direct projects (no program)
        for pn in lob_data["_direct"]:
            lob_children.append(pn)
            lob_baseline += pn["baseline_budget"]
            lob_forecast += pn["current_forecast"]
            lob_actuals += pn["actuals_ytd"]
            if pn["rag"] and rag_priority.get(pn["rag"], -1) > rag_priority.get(worst_rag, -1):
                worst_rag = pn["rag"]

        if lob_children:
            lob_variance = compute_plan_drift(lob_forecast, lob_baseline) if lob_baseline else 0.0
            tree.append({
                "id": lob_data["id"],
                "name": lob_data["name"],
                "type": "lob",
                "status": None,
                "rag": worst_rag,
                "baseline_budget": round(lob_baseline, 2),
                "current_forecast": round(lob_forecast, 2),
                "actuals_ytd": round(lob_actuals, 2),
                "variance_pct": round(lob_variance, 1),
                "timeline": None,
                "children": lob_children,
            })

    return tree
