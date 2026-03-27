"""Portfolio business logic — KPI aggregation, tree building, chart data."""

from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.orm import Session

from config import DEMO_DATE
from models.capacity import Allocation
from models.financial import Actuals, Baseline, Forecast
from models.organization import (
    GroupingEntity, GroupingEntityType, GroupingHierarchy,
    GroupingHierarchyLevel, ProjectGroupingAssignment,
)
from models.people import Person
from models.projects import Project
from services.calculations import (
    FTE_HOURS,
    compute_budget_rag,
    compute_combined_rag,
    compute_plan_drift,
    compute_timeline_rag,
    compute_utilization_pct,
)


# ---------------------------------------------------------------------------
# Utility: resolve a project's entity of a given type (e.g., LoB name)
# ---------------------------------------------------------------------------

def get_project_entity_info(db: Session, project_id: str, entity_type_id: str | None = None) -> dict | None:
    """Get the entity (of given type) that a project belongs to, walking up the tree.

    If entity_type_id is None, returns the directly-assigned entity.
    Returns {'id': ..., 'name': ..., 'entity_type_id': ...} or None.
    """
    assignment = (
        db.query(ProjectGroupingAssignment)
        .filter(ProjectGroupingAssignment.project_id == project_id)
        .first()
    )
    if not assignment:
        return None

    entity = db.query(GroupingEntity).get(assignment.grouping_entity_id)
    if not entity:
        return None

    if entity_type_id is None:
        return {"id": entity.id, "name": entity.name, "entity_type_id": entity.entity_type_id}

    # Walk up through parent entities to find the matching type
    current = entity
    visited = set()
    while current:
        if current.id in visited:
            break
        visited.add(current.id)
        if current.entity_type_id == entity_type_id:
            return {"id": current.id, "name": current.name, "entity_type_id": current.entity_type_id}
        if current.parent_entity_id:
            current = db.query(GroupingEntity).get(current.parent_entity_id)
        else:
            break
    return None


def get_project_hierarchy_path(db: Session, project_id: str) -> list[dict]:
    """Return the full hierarchy path from root to the project's assigned entity.

    Returns a list like:
      [{"type_name": "Line of Business", "entity_name": "Truck & Bus Systems (TBS)"},
       {"type_name": "Program", "entity_name": "Digital Braking Platform"}]
    """
    assignment = (
        db.query(ProjectGroupingAssignment)
        .filter(ProjectGroupingAssignment.project_id == project_id)
        .first()
    )
    if not assignment:
        return []

    entity = db.query(GroupingEntity).get(assignment.grouping_entity_id)
    if not entity:
        return []

    # Collect the chain from assigned entity up to root
    chain = []
    current = entity
    visited = set()
    while current:
        if current.id in visited:
            break
        visited.add(current.id)
        type_name = current.entity_type.name if current.entity_type else current.entity_type_id
        chain.append({"type_name": type_name, "entity_name": current.name})
        if current.parent_entity_id:
            current = db.query(GroupingEntity).get(current.parent_entity_id)
        else:
            break

    # Reverse to get root-first order
    chain.reverse()
    return chain


def get_top_level_entity_type_id(db: Session) -> str | None:
    """Get the entity type ID for the top level of the active hierarchy."""
    hierarchy = (
        db.query(GroupingHierarchy)
        .filter(GroupingHierarchy.is_active_hierarchy.is_(True))
        .first()
    )
    if not hierarchy or not hierarchy.levels:
        return None
    return hierarchy.levels[0].entity_type_id


def _get_projects_for_entity_recursive(db: Session, entity_id: str) -> list[str]:
    """Get all project IDs assigned to an entity or any of its descendants."""
    # Direct project assignments
    direct = [
        a.project_id
        for a in db.query(ProjectGroupingAssignment)
        .filter(ProjectGroupingAssignment.grouping_entity_id == entity_id)
        .all()
    ]
    # Recurse into child entities
    children = (
        db.query(GroupingEntity.id)
        .filter(GroupingEntity.parent_entity_id == entity_id)
        .all()
    )
    for (child_id,) in children:
        direct.extend(_get_projects_for_entity_recursive(db, child_id))
    return direct


def compute_portfolio_kpis(db: Session, filters: dict | None = None) -> dict:
    """Compute portfolio-level KPI summary, optionally filtered."""
    filters = filters or {}

    empty_result = {
        "baseline": 0, "current_forecast": 0, "ytd_actuals": 0,
        "plan_drift_amount": 0, "plan_drift_pct": 0,
        "run_total": 0, "change_total": 0, "run_pct": 50, "change_pct": 50,
        "lifetime_baseline": 0, "lifetime_forecast": 0, "lifetime_actuals": 0,
        "active_project_count": 0,
    }

    # Build filtered project ID list
    proj_q = db.query(Project.id).filter(Project.is_active.is_(True))

    # Entity filter (covers both old "lob" param and new "grouping_entity" param)
    entity_filter = filters.get("grouping_entity") or filters.get("lob")
    if entity_filter:
        ge_project_ids = _get_projects_for_entity_recursive(db, entity_filter)
        if ge_project_ids:
            proj_q = proj_q.filter(Project.id.in_(ge_project_ids))
        else:
            return empty_result

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
        return empty_result

    # CY boundaries (fiscal year 2026: Jan-Dec)
    cy_start = "2026-01"
    cy_end = "2026-12"

    # --- Lifetime totals ---
    lifetime_forecast = float(
        db.query(func.coalesce(func.sum(Forecast.amount_eur), 0))
        .filter(Forecast.project_id.in_(project_ids))
        .scalar()
    )
    lifetime_baseline = float(
        db.query(func.coalesce(func.sum(Baseline.amount_eur), 0))
        .filter(Baseline.project_id.in_(project_ids))
        .scalar()
    )
    lifetime_actuals = float(
        db.query(func.coalesce(func.sum(Actuals.amount_eur), 0))
        .filter(Actuals.project_id.in_(project_ids))
        .scalar()
    )
    active_project_count = len(project_ids)

    # --- CY-scoped totals ---
    total_forecast = float(
        db.query(func.coalesce(func.sum(Forecast.amount_eur), 0))
        .filter(Forecast.project_id.in_(project_ids),
                Forecast.month >= cy_start, Forecast.month <= cy_end)
        .scalar()
    )
    total_baseline = float(
        db.query(func.coalesce(func.sum(Baseline.amount_eur), 0))
        .filter(Baseline.project_id.in_(project_ids),
                Baseline.month >= cy_start, Baseline.month <= cy_end)
        .scalar()
    )

    # YTD spend (actuals through demo date, CY only)
    ytd_spend = (
        db.query(func.coalesce(func.sum(Actuals.amount_eur), 0))
        .filter(Actuals.project_id.in_(project_ids),
                Actuals.month >= cy_start, Actuals.month <= DEMO_DATE)
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

    # Run/Change ratio
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

    baseline_val = round(total_baseline, 2)
    forecast_val = round(total_forecast, 2)
    plan_drift_amount = round(forecast_val - baseline_val, 2)

    return {
        "baseline": baseline_val,
        "current_forecast": forecast_val,
        "ytd_actuals": round(float(ytd_spend), 2),
        "plan_drift_amount": plan_drift_amount,
        "plan_drift_pct": round(portfolio_variance_pct, 1),
        "run_total": round(float(run_budget or 0), 2),
        "change_total": round(float(change_budget or 0), 2),
        "run_pct": run_pct,
        "change_pct": change_pct,
        # Lifetime summary fields
        "lifetime_baseline": round(lifetime_baseline, 2),
        "lifetime_forecast": round(lifetime_forecast, 2),
        "lifetime_actuals": round(lifetime_actuals, 2),
        "active_project_count": active_project_count,
    }


def compute_project_financials(db: Session, project_id: str) -> dict:
    """Compute financial summary for a single project, including CY/PY splits."""
    cy_start, cy_end = "2026-01", "2026-12"

    baseline_total = float(
        db.query(func.coalesce(func.sum(Baseline.amount_eur), 0))
        .filter(Baseline.project_id == project_id).scalar()
    )
    forecast_total = float(
        db.query(func.coalesce(func.sum(Forecast.amount_eur), 0))
        .filter(Forecast.project_id == project_id).scalar()
    )
    actuals_ytd = float(
        db.query(func.coalesce(func.sum(Actuals.amount_eur), 0))
        .filter(Actuals.project_id == project_id, Actuals.month <= DEMO_DATE).scalar()
    )
    forecast_ytd = float(
        db.query(func.coalesce(func.sum(Forecast.amount_eur), 0))
        .filter(Forecast.project_id == project_id, Forecast.month <= DEMO_DATE).scalar()
    )

    # CY splits
    baseline_cy = float(
        db.query(func.coalesce(func.sum(Baseline.amount_eur), 0))
        .filter(Baseline.project_id == project_id,
                Baseline.month >= cy_start, Baseline.month <= cy_end).scalar()
    )
    forecast_cy = float(
        db.query(func.coalesce(func.sum(Forecast.amount_eur), 0))
        .filter(Forecast.project_id == project_id,
                Forecast.month >= cy_start, Forecast.month <= cy_end).scalar()
    )
    actuals_cy = float(
        db.query(func.coalesce(func.sum(Actuals.amount_eur), 0))
        .filter(Actuals.project_id == project_id,
                Actuals.month >= cy_start, Actuals.month <= DEMO_DATE).scalar()
    )

    # PY splits (everything before CY)
    baseline_py = round(baseline_total - baseline_cy, 2)
    forecast_py = round(forecast_total - forecast_cy, 2)
    actuals_py = float(
        db.query(func.coalesce(func.sum(Actuals.amount_eur), 0))
        .filter(Actuals.project_id == project_id, Actuals.month < cy_start).scalar()
    )

    plan_drift = compute_plan_drift(forecast_total, baseline_total)

    return {
        "baseline_total": round(baseline_total, 2),
        "forecast_total": round(forecast_total, 2),
        "actuals_ytd": round(actuals_ytd, 2),
        "forecast_ytd": round(forecast_ytd, 2),
        "plan_drift_pct": round(plan_drift, 1),
        "baseline_cy": round(baseline_cy, 2),
        "forecast_cy": round(forecast_cy, 2),
        "actuals_cy": round(actuals_cy, 2),
        "baseline_py": round(baseline_py, 2),
        "forecast_py": round(forecast_py, 2),
        "actuals_py": round(actuals_py, 2),
    }


def build_portfolio_tree(db: Session, filters: dict | None = None) -> list[dict]:
    """Build hierarchical portfolio tree from the active GroupingEntity hierarchy.

    Uses the active hierarchy to build entity levels (e.g., LoB -> Program -> Project).
    Falls back to a flat project list if no hierarchy is configured.
    """
    filters = filters or {}

    # --- Load projects (with optional filters) ---
    query = db.query(Project).filter(Project.is_active.is_(True))

    # Entity filter (covers both old "lob" param and new "grouping_entity" param)
    entity_filter = filters.get("grouping_entity") or filters.get("lob")
    if entity_filter:
        ge_project_ids = _get_projects_for_entity_recursive(db, entity_filter)
        if ge_project_ids:
            query = query.filter(Project.id.in_(ge_project_ids))
        else:
            return []
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
    if not projects:
        return []

    # Build project ID -> project mapping
    project_map = {p.id: p for p in projects}
    project_ids = set(project_map.keys())

    # --- Compute financials for each project ---
    project_fin_cache: dict[str, dict] = {}
    for pid in project_ids:
        project_fin_cache[pid] = compute_project_financials(db, pid)

    # --- Load all assignments for these projects ---
    assignments = (
        db.query(ProjectGroupingAssignment)
        .filter(ProjectGroupingAssignment.project_id.in_(project_ids))
        .all()
    )
    # entity_id -> [project_ids]
    entity_projects: dict[str, list[str]] = {}
    project_entity: dict[str, str] = {}  # project_id -> entity_id
    for a in assignments:
        entity_projects.setdefault(a.grouping_entity_id, []).append(a.project_id)
        project_entity[a.project_id] = a.grouping_entity_id

    # --- Load the active hierarchy ---
    hierarchy = (
        db.query(GroupingHierarchy)
        .filter(GroupingHierarchy.is_active_hierarchy.is_(True))
        .first()
    )

    if not hierarchy or not hierarchy.levels:
        # No hierarchy — return flat project list
        return [_make_project_node(project_map[pid], project_fin_cache[pid]) for pid in project_ids]

    # --- Load entity type names for type labels ---
    entity_type_names: dict[str, str] = {}
    for level in hierarchy.levels:
        et = db.query(GroupingEntityType).get(level.entity_type_id)
        if et:
            entity_type_names[et.id] = et.name.lower().replace(" ", "_")

    # --- Load all entities and build the tree recursively ---
    all_entities = db.query(GroupingEntity).filter(GroupingEntity.is_active.is_(True)).all()
    entity_by_id = {e.id: e for e in all_entities}

    # Get the entity type IDs in the hierarchy (ordered top to bottom)
    hierarchy_type_ids = [level.entity_type_id for level in hierarchy.levels]
    top_type_id = hierarchy_type_ids[0]

    # Find top-level entities
    top_entities = [e for e in all_entities if e.entity_type_id == top_type_id and e.parent_entity_id is None]

    rag_priority = {"red": 2, "amber": 1, "green": 0, None: -1}

    def build_entity_node(entity: GroupingEntity) -> dict | None:
        """Recursively build a tree node for an entity."""
        children = []

        # Find child entities (entities whose parent is this entity)
        child_entities = [e for e in all_entities if e.parent_entity_id == entity.id]
        for child in child_entities:
            child_node = build_entity_node(child)
            if child_node:
                children.append(child_node)

        # Find directly assigned projects
        direct_pids = [pid for pid in entity_projects.get(entity.id, []) if pid in project_ids]
        for pid in direct_pids:
            children.append(_make_project_node(project_map[pid], project_fin_cache[pid]))

        if not children:
            return None

        # Aggregate financials from children
        agg = _aggregate_children(children, rag_priority)
        type_label = entity_type_names.get(entity.entity_type_id, entity.entity_type_id)

        return {
            "id": entity.id,
            "name": entity.name,
            "type": type_label,
            "status": None,
            "rag": agg["rag"],
            "baseline_budget": agg["baseline_budget"],
            "current_forecast": agg["current_forecast"],
            "actuals_ytd": agg["actuals_ytd"],
            "variance_pct": agg["variance_pct"],
            "baseline_cy": agg["baseline_cy"],
            "forecast_cy": agg["forecast_cy"],
            "actuals_cy": agg["actuals_cy"],
            "baseline_py": agg["baseline_py"],
            "forecast_py": agg["forecast_py"],
            "actuals_py": agg["actuals_py"],
            "timeline": None,
            "children": children,
        }

    tree = []
    for te in top_entities:
        node = build_entity_node(te)
        if node:
            tree.append(node)

    # Also pick up projects not assigned to any entity in the hierarchy
    assigned_pids = set()
    for pid_list in entity_projects.values():
        assigned_pids.update(pid_list)
    unassigned = project_ids - assigned_pids
    for pid in unassigned:
        tree.append(_make_project_node(project_map[pid], project_fin_cache[pid]))

    return tree


def _make_project_node(p: Project, fins: dict) -> dict:
    """Create a project tree node."""
    return {
        "id": p.id,
        "name": p.name,
        "type": "service" if p.is_service else "project",
        "status": p.status,
        "rag": p.rag_status,
        "baseline_budget": fins["baseline_total"],
        "current_forecast": fins["forecast_total"],
        "actuals_ytd": fins["actuals_ytd"],
        "variance_pct": fins["plan_drift_pct"],
        "baseline_cy": fins["baseline_cy"],
        "forecast_cy": fins["forecast_cy"],
        "actuals_cy": fins["actuals_cy"],
        "baseline_py": fins["baseline_py"],
        "forecast_py": fins["forecast_py"],
        "actuals_py": fins["actuals_py"],
        "timeline": {
            "start": p.start_month,
            "end": p.end_month,
            "projected_end": p.projected_end_month,
        },
        "children": [],
    }


def _aggregate_children(children: list[dict], rag_priority: dict) -> dict:
    """Aggregate financials and RAG from a list of child nodes."""
    baseline = sum(c.get("baseline_budget", 0) for c in children)
    forecast = sum(c.get("current_forecast", 0) for c in children)
    actuals = sum(c.get("actuals_ytd", 0) for c in children)
    variance = compute_plan_drift(forecast, baseline) if baseline else 0.0

    worst_rag = None
    for c in children:
        r = c.get("rag")
        if r and rag_priority.get(r, -1) > rag_priority.get(worst_rag, -1):
            worst_rag = r

    return {
        "baseline_budget": round(baseline, 2),
        "current_forecast": round(forecast, 2),
        "actuals_ytd": round(actuals, 2),
        "variance_pct": round(variance, 1),
        "rag": worst_rag,
        "baseline_cy": round(sum(c.get("baseline_cy", 0) for c in children), 2),
        "forecast_cy": round(sum(c.get("forecast_cy", 0) for c in children), 2),
        "actuals_cy": round(sum(c.get("actuals_cy", 0) for c in children), 2),
        "baseline_py": round(sum(c.get("baseline_py", 0) for c in children), 2),
        "forecast_py": round(sum(c.get("forecast_py", 0) for c in children), 2),
        "actuals_py": round(sum(c.get("actuals_py", 0) for c in children), 2),
    }
