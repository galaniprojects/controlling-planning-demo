"""Report Builder query engine — dynamically builds and executes queries.

Strategy: run separate queries per fact table (baselines, forecasts, actuals,
allocations) and merge results in Python on the dimension key tuple.  This
avoids complex multi-table JOINs and cartesian product issues.
"""

from __future__ import annotations

from collections import defaultdict

from sqlalchemy import func, distinct, case, literal_column
from sqlalchemy.orm import Session

from models.capacity import Allocation
from models.financial import Actuals, Baseline, ExternalCostType, Forecast
from models.organization import (
    CompetenceCenter,
    CostCenter,
    GroupingEntity,
    Location,
    ProjectGroupingAssignment,
)
from models.people import Person, RoleType
from models.projects import Project
from schemas.common import CurrentUser
from services.report_builder_catalog import (
    CAPACITY_DIMENSION_IDS,
    DIMENSION_MAP,
    MEASURE_MAP,
    check_compatibility_warnings,
)
from services.report_service import _build_project_lob_map, _get_scoped_project_ids


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _month_to_quarter(month_str: str) -> str:
    """Convert 'YYYY-MM' to 'Q1 YYYY' etc."""
    parts = month_str.split("-")
    y = parts[0]
    m = int(parts[1])
    q = (m - 1) // 3 + 1
    return f"Q{q} {y}"


def _month_to_year(month_str: str) -> str:
    return month_str[:4]


def _project_type_label(is_service: bool) -> str:
    return "Service" if is_service else "Project"


def _change_run_label(is_service: bool) -> str:
    return "Run" if is_service else "Change"


# ---------------------------------------------------------------------------
# Dimension value extraction
# ---------------------------------------------------------------------------

def _get_project_dimension_values(
    db: Session,
    project_ids: list[str],
    dim_ids: set[str],
) -> dict[str, dict[str, str]]:
    """Build a map of project_id → {dim_id: value} for project-level dimensions.

    Returns e.g. {"proj-1": {"D01": "SAP Migration", "D03": "active", "D05": "Enterprise Core"}}
    """
    if not project_ids:
        return {}

    result: dict[str, dict[str, str]] = defaultdict(dict)

    # Fetch project data
    projects_need = dim_ids & {"D01", "D02", "D03", "D04", "D14", "D15"}
    if projects_need:
        rows = db.query(Project).filter(Project.id.in_(project_ids)).all()
        for p in rows:
            if "D01" in dim_ids:
                result[p.id]["D01"] = p.name
            if "D02" in dim_ids:
                result[p.id]["D02"] = _project_type_label(p.is_service)
            if "D03" in dim_ids:
                result[p.id]["D03"] = p.status or "unknown"
            if "D04" in dim_ids:
                result[p.id]["D04"] = p.rag_status or "N/A"
            if "D14" in dim_ids:
                result[p.id]["D14"] = p.capex_opex or "N/A"
            if "D15" in dim_ids:
                result[p.id]["D15"] = _change_run_label(p.is_service)

    # LoB dimension — via grouping hierarchy
    if "D05" in dim_ids:
        lob_map = _build_project_lob_map(db)
        for pid in project_ids:
            if pid in lob_map:
                result[pid]["D05"] = lob_map[pid][1]  # name
            else:
                result[pid]["D05"] = "Unassigned"

    return dict(result)


def _get_filter_values_for_dimension(
    db: Session,
    dimension_id: str,
    project_ids: list[str] | None = None,
) -> list[str]:
    """Return distinct values for a dimension, optionally scoped to project IDs."""
    dim = DIMENSION_MAP.get(dimension_id)
    if not dim:
        return []

    if dimension_id == "D01":
        q = db.query(Project.name).filter(Project.is_active.is_(True))
        if project_ids is not None:
            q = q.filter(Project.id.in_(project_ids))
        return sorted([r[0] for r in q.distinct().all() if r[0]])

    if dimension_id == "D02":
        return ["Project", "Service"]

    if dimension_id == "D03":
        q = db.query(Project.status).filter(Project.is_active.is_(True))
        return sorted(set(r[0] for r in q.all() if r[0]))

    if dimension_id == "D04":
        return ["green", "amber", "red"]

    if dimension_id == "D05":
        lob_map = _build_project_lob_map(db)
        if project_ids is not None:
            return sorted(set(v[1] for k, v in lob_map.items() if k in set(project_ids)))
        return sorted(set(v[1] for v in lob_map.values()))

    if dimension_id == "D06":
        return sorted([r[0] for r in db.query(CostCenter.name).filter(CostCenter.is_active.is_(True)).all()])

    if dimension_id == "D07":
        return sorted([r[0] for r in db.query(CompetenceCenter.name).filter(CompetenceCenter.is_active.is_(True)).all()])

    if dimension_id == "D08":
        return sorted([r[0] for r in db.query(Location.city).filter(Location.is_active.is_(True)).all()])

    if dimension_id == "D09":
        return sorted([r[0] for r in db.query(RoleType.name).all()])

    if dimension_id == "D10":
        return sorted([r[0] for r in db.query(Person.name).filter(Person.is_active.is_(True)).all()])

    if dimension_id == "D11":
        vendors = set()
        for tbl in [Forecast, Actuals, Baseline]:
            rows = db.query(tbl.vendor).filter(tbl.vendor.isnot(None), tbl.vendor != "").distinct().all()
            vendors.update(r[0] for r in rows if r[0])
        return sorted(vendors)

    if dimension_id == "D12":
        return sorted([r[0] for r in db.query(ExternalCostType.name).all()])

    if dimension_id == "D13":
        statuses = set()
        for tbl in [Forecast, Actuals]:
            rows = db.query(tbl.ext_status).filter(tbl.ext_status.isnot(None)).distinct().all()
            statuses.update(r[0] for r in rows if r[0])
        return sorted(statuses)

    if dimension_id == "D14":
        return ["capex", "opex"]

    if dimension_id == "D15":
        return ["Change", "Run"]

    if dimension_id == "D16":
        years = set()
        for tbl in [Forecast, Baseline, Actuals]:
            rows = db.query(func.substr(tbl.month, 1, 4)).distinct().all()
            years.update(r[0] for r in rows if r[0])
        return sorted(years)

    if dimension_id == "D17":
        months_set = set()
        for tbl in [Forecast, Baseline, Actuals]:
            rows = db.query(tbl.month).distinct().all()
            months_set.update(r[0] for r in rows if r[0])
        return sorted(set(_month_to_quarter(m) for m in months_set))

    if dimension_id == "D18":
        months_set = set()
        for tbl in [Forecast, Baseline, Actuals]:
            rows = db.query(tbl.month).distinct().all()
            months_set.update(r[0] for r in rows if r[0])
        return sorted(months_set)

    return []


# ---------------------------------------------------------------------------
# Query execution engine
# ---------------------------------------------------------------------------

# Which measures come from which fact tables
_MEASURE_TABLE_MAP = {
    "M01": "baselines",
    "M02": "forecasts",
    "M03": "actuals",
    "M08": "forecasts",  # internal cost
    "M09": "forecasts",  # external cost
    "M10": "forecasts",  # obligo
    "M11": "forecasts",  # planned hours
    "M12": "actuals",    # actual hours
    "M13": "allocations",
    "M15": "projects",
    "M16": "allocations",
}

# Derived measures and their base requirements
_DERIVED_MEASURES = {
    "M04": ("M02", "M01"),   # Forecast - Baseline
    "M05": ("M02", "M01"),   # (Forecast - Baseline) / Baseline * 100
    "M06": ("M03", "M02"),   # Actuals - Forecast
    "M07": ("M02", "M03"),   # Forecast - Actuals
    "M14": ("M13", "M12"),   # Available / Actual hours (utilisation)
}

_TABLE_MODEL_MAP = {
    "baselines": Baseline,
    "forecasts": Forecast,
    "actuals": Actuals,
}


def _resolve_needed_base_measures(measure_ids: list[str]) -> set[str]:
    """Expand derived measures into the base measures we actually need to query."""
    needed = set()
    for mid in measure_ids:
        if mid in _DERIVED_MEASURES:
            for base in _DERIVED_MEASURES[mid]:
                needed.add(base)
        else:
            needed.add(mid)
    return needed


def _group_measures_by_table(base_measures: set[str]) -> dict[str, list[str]]:
    """Group base measure IDs by the fact table they come from."""
    grouped: dict[str, list[str]] = defaultdict(list)
    for mid in base_measures:
        tbl = _MEASURE_TABLE_MAP.get(mid)
        if tbl:
            grouped[tbl].append(mid)
    return dict(grouped)


def _extract_time_dim_value(month_str: str, dim_id: str) -> str:
    """Extract the time dimension value from a YYYY-MM month string."""
    if dim_id == "D16":
        return _month_to_year(month_str)
    if dim_id == "D17":
        return _month_to_quarter(month_str)
    if dim_id == "D18":
        return month_str
    return month_str


def _build_dim_key(
    row_data: dict,
    all_dim_ids: list[str],
) -> tuple:
    """Build a hashable dimension key tuple from a row dict."""
    return tuple(row_data.get(d, "") for d in all_dim_ids)


def _query_financial_table(
    db: Session,
    model,
    project_ids: list[str],
    all_dim_ids: list[str],
    project_dims: dict[str, dict[str, str]],
    filters: dict[str, list[str]],
    measures_for_table: list[str],
    role_type_map: dict[str, str] | None = None,
    ext_cost_type_map: dict[str, str] | None = None,
) -> dict[tuple, dict[str, float]]:
    """Query a financial table (baselines/forecasts/actuals) and aggregate measures.

    Returns {dim_key_tuple: {measure_id: value}}.
    """
    result: dict[tuple, dict[str, float]] = defaultdict(lambda: defaultdict(float))

    if not project_ids:
        return dict(result)

    # Fetch all rows for scoped projects
    q = db.query(model).filter(model.project_id.in_(project_ids))

    # Apply time filters
    if "D16" in filters:
        years = filters["D16"]
        q = q.filter(func.substr(model.month, 1, 4).in_(years))
    if "D18" in filters:
        q = q.filter(model.month.in_(filters["D18"]))
    if "D17" in filters:
        # Quarter filter — expand to months
        allowed_months = set()
        # Get all months and check which ones match the quarter filter
        all_months_q = db.query(model.month).distinct().all()
        for (m,) in all_months_q:
            if _month_to_quarter(m) in filters["D17"]:
                allowed_months.add(m)
        if allowed_months:
            q = q.filter(model.month.in_(allowed_months))

    # Apply vendor filter
    if "D11" in filters:
        q = q.filter(model.vendor.in_(filters["D11"]))

    # Apply ext_status filter
    if "D13" in filters:
        q = q.filter(model.ext_status.in_(filters["D13"]))

    rows = q.all()

    time_dims = set(all_dim_ids) & {"D16", "D17", "D18"}
    needs_role = "D09" in set(all_dim_ids)
    needs_ext_cat = "D12" in set(all_dim_ids)

    for row in rows:
        pid = row.project_id
        proj_data = project_dims.get(pid, {})

        # Build dimension values for this row
        dim_vals: dict[str, str] = {}
        for d in all_dim_ids:
            if d in time_dims:
                dim_vals[d] = _extract_time_dim_value(row.month, d)
            elif d == "D09":
                if row.category == "internal" and role_type_map:
                    dim_vals[d] = role_type_map.get(row.sub_category, row.sub_category)
                else:
                    dim_vals[d] = "N/A"
            elif d == "D11":
                dim_vals[d] = row.vendor or "N/A"
            elif d == "D12":
                if row.category == "external" and ext_cost_type_map:
                    dim_vals[d] = ext_cost_type_map.get(row.sub_category, row.sub_category)
                else:
                    dim_vals[d] = "N/A"
            elif d == "D13":
                dim_vals[d] = row.ext_status or "N/A"
            else:
                dim_vals[d] = proj_data.get(d, "N/A")

        # Apply non-time, non-project filters
        skip = False
        for fid, fvals in filters.items():
            if fid in time_dims or fid in {"D11", "D13", "D16", "D17", "D18"}:
                continue  # already applied in SQL
            val = dim_vals.get(fid, "")
            if val not in fvals:
                skip = True
                break
        if skip:
            continue

        key = _build_dim_key(dim_vals, all_dim_ids)

        # Aggregate measures
        amount = float(row.amount_eur or 0)
        hours = float(row.hours or 0)
        table_name = model.__tablename__

        for mid in measures_for_table:
            if mid == "M01" and table_name == "baselines":
                result[key][mid] += amount
            elif mid == "M02" and table_name == "forecasts":
                result[key][mid] += amount
            elif mid == "M03" and table_name == "actuals":
                result[key][mid] += amount
            elif mid == "M08" and row.category == "internal":
                result[key][mid] += amount
            elif mid == "M09" and row.category == "external":
                result[key][mid] += amount
            elif mid == "M10" and row.category == "external" and row.ext_status == "ordered":
                result[key][mid] += amount
            elif mid == "M11" and row.category == "internal":
                result[key][mid] += hours
            elif mid == "M12" and table_name == "actuals" and row.category == "internal":
                result[key][mid] += hours

    return dict(result)


def _query_allocations(
    db: Session,
    project_ids: list[str],
    all_dim_ids: list[str],
    project_dims: dict[str, dict[str, str]],
    filters: dict[str, list[str]],
    measures_for_table: list[str],
    person_cc_map: dict[str, str],
    person_cc_name_map: dict[str, str],
    person_name_map: dict[str, str],
    person_role_map: dict[str, str],
    person_comp_center_map: dict[str, str],
    person_location_map: dict[str, str],
) -> dict[tuple, dict[str, float]]:
    """Query allocations table for capacity measures."""
    result: dict[tuple, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    count_sets: dict[tuple, dict[str, set]] = defaultdict(lambda: defaultdict(set))

    if not project_ids:
        return dict(result)

    q = db.query(Allocation).filter(Allocation.project_id.in_(project_ids))

    # Time filters
    if "D16" in filters:
        q = q.filter(func.substr(Allocation.month, 1, 4).in_(filters["D16"]))
    if "D18" in filters:
        q = q.filter(Allocation.month.in_(filters["D18"]))

    rows = q.all()
    time_dims = set(all_dim_ids) & {"D16", "D17", "D18"}

    for row in rows:
        pid = row.project_id
        proj_data = project_dims.get(pid, {})

        dim_vals: dict[str, str] = {}
        for d in all_dim_ids:
            if d in time_dims:
                dim_vals[d] = _extract_time_dim_value(row.month, d)
            elif d == "D06":
                dim_vals[d] = person_cc_name_map.get(row.person_id, "N/A")
            elif d == "D07":
                dim_vals[d] = person_comp_center_map.get(row.person_id, "N/A")
            elif d == "D08":
                dim_vals[d] = person_location_map.get(row.person_id, "N/A")
            elif d == "D09":
                dim_vals[d] = person_role_map.get(row.person_id, "N/A")
            elif d == "D10":
                dim_vals[d] = person_name_map.get(row.person_id, "N/A")
            else:
                dim_vals[d] = proj_data.get(d, "N/A")

        # Apply filters
        skip = False
        for fid, fvals in filters.items():
            if fid in time_dims:
                continue
            val = dim_vals.get(fid, "")
            if val not in fvals:
                skip = True
                break
        if skip:
            continue

        key = _build_dim_key(dim_vals, all_dim_ids)
        hours_val = float(row.hours or 0)

        for mid in measures_for_table:
            if mid == "M13":
                result[key][mid] += hours_val
            elif mid == "M16":
                count_sets[key][mid].add(row.person_id)

    # Convert count sets to counts
    for key, sets in count_sets.items():
        for mid, s in sets.items():
            result[key][mid] = float(len(s))

    return dict(result)


def _query_project_counts(
    db: Session,
    project_ids: list[str],
    all_dim_ids: list[str],
    project_dims: dict[str, dict[str, str]],
    filters: dict[str, list[str]],
) -> dict[tuple, dict[str, float]]:
    """Count distinct projects per dimension key."""
    result: dict[tuple, dict[str, float]] = defaultdict(lambda: defaultdict(float))

    for pid in project_ids:
        proj_data = project_dims.get(pid, {})

        dim_vals: dict[str, str] = {}
        for d in all_dim_ids:
            dim_vals[d] = proj_data.get(d, "N/A")

        # Apply filters
        skip = False
        for fid, fvals in filters.items():
            if fid in {"D16", "D17", "D18"}:
                continue
            val = dim_vals.get(fid, "")
            if val not in fvals:
                skip = True
                break
        if skip:
            continue

        # For project counts with time dims, we just ignore time (count per non-time dims)
        non_time_dims = [d for d in all_dim_ids if d not in {"D16", "D17", "D18"}]
        key = _build_dim_key(dim_vals, all_dim_ids)
        result[key]["M15"] += 1

    return dict(result)


# ---------------------------------------------------------------------------
# Main execution entry point
# ---------------------------------------------------------------------------

def execute_report(
    db: Session,
    user: CurrentUser,
    rows: list[str],
    columns: list[str],
    filters: dict[str, list[str]],
    values: list[str],
) -> dict:
    """Execute a report builder query and return flat results.

    Parameters
    ----------
    rows : list of dimension IDs for row grouping
    columns : list of dimension IDs for column grouping
    filters : dict of dimension_id -> list of selected values
    values : list of measure IDs to compute

    Returns
    -------
    dict with keys: columns (metadata), rows (data), total_rows, warnings
    """
    if not values:
        return {"columns": [], "rows": [], "total_rows": 0, "warnings": []}

    all_dim_ids = rows + columns
    all_dim_set = set(all_dim_ids)

    # 1. Get scoped project IDs
    scoped_pids = _get_scoped_project_ids(db, user)

    # 2. Get project-level dimension values
    project_dims = _get_project_dimension_values(db, scoped_pids, all_dim_set | set(filters.keys()))

    # 3. Resolve base measures needed
    base_measures = _resolve_needed_base_measures(values)

    # 4. Group by source table
    table_groups = _group_measures_by_table(base_measures)

    # 5. Build lookup maps we might need
    role_type_map = None
    ext_cost_type_map = None
    person_maps: dict = {}

    if "D09" in (all_dim_set | set(filters.keys())) or any(m in base_measures for m in ["M11", "M12"]):
        role_type_map = {r.id: r.name for r in db.query(RoleType).all()}

    if "D12" in (all_dim_set | set(filters.keys())):
        ext_cost_type_map = {r.id: r.name for r in db.query(ExternalCostType).all()}

    needs_person_maps = all_dim_set & {"D06", "D07", "D08", "D09", "D10"}
    if needs_person_maps or "allocations" in table_groups:
        people = db.query(Person).all()
        cc_map = {cc.id: cc for cc in db.query(CostCenter).all()}
        comp_map = {c.id: c for c in db.query(CompetenceCenter).all()}
        loc_map = {l.id: l for l in db.query(Location).all()}
        rt_map = {r.id: r.name for r in db.query(RoleType).all()} if not role_type_map else role_type_map

        person_maps = {
            "person_cc_map": {p.id: p.cost_center_id or "" for p in people},
            "person_cc_name_map": {
                p.id: cc_map[p.cost_center_id].name if p.cost_center_id and p.cost_center_id in cc_map else "N/A"
                for p in people
            },
            "person_name_map": {p.id: p.name for p in people},
            "person_role_map": {p.id: rt_map.get(p.role_type_id, "N/A") for p in people},
            "person_comp_center_map": {
                p.id: comp_map[cc_map[p.cost_center_id].competence_center_id].name
                if p.cost_center_id and p.cost_center_id in cc_map
                and cc_map[p.cost_center_id].competence_center_id in comp_map
                else "N/A"
                for p in people
            },
            "person_location_map": {
                p.id: loc_map[cc_map[p.cost_center_id].location_id].city
                if p.cost_center_id and p.cost_center_id in cc_map
                and cc_map[p.cost_center_id].location_id in loc_map
                else "N/A"
                for p in people
            },
        }

    # 6. Execute queries per table and merge
    merged: dict[tuple, dict[str, float]] = defaultdict(lambda: defaultdict(float))

    for table_name, measure_list in table_groups.items():
        if table_name in ("baselines", "forecasts", "actuals"):
            model = _TABLE_MODEL_MAP[table_name]
            table_result = _query_financial_table(
                db, model, scoped_pids, all_dim_ids, project_dims,
                filters, measure_list,
                role_type_map=role_type_map,
                ext_cost_type_map=ext_cost_type_map,
            )
            for key, measures in table_result.items():
                for mid, val in measures.items():
                    merged[key][mid] += val

        elif table_name == "allocations":
            alloc_result = _query_allocations(
                db, scoped_pids, all_dim_ids, project_dims, filters, measure_list,
                **person_maps,
            )
            for key, measures in alloc_result.items():
                for mid, val in measures.items():
                    merged[key][mid] += val

        elif table_name == "projects":
            proj_result = _query_project_counts(
                db, scoped_pids, all_dim_ids, project_dims, filters,
            )
            for key, measures in proj_result.items():
                for mid, val in measures.items():
                    merged[key][mid] += val

    # 7. Compute derived measures
    for key in merged:
        vals = merged[key]
        if "M04" in values:
            vals["M04"] = vals.get("M02", 0) - vals.get("M01", 0)
        if "M05" in values:
            b = vals.get("M01", 0)
            f = vals.get("M02", 0)
            vals["M05"] = ((f - b) / b * 100) if b != 0 else 0
        if "M06" in values:
            vals["M06"] = vals.get("M03", 0) - vals.get("M02", 0)
        if "M07" in values:
            vals["M07"] = vals.get("M02", 0) - vals.get("M03", 0)
        if "M14" in values:
            avail = vals.get("M13", 0)
            actual = vals.get("M12", 0)
            vals["M14"] = (actual / avail * 100) if avail != 0 else 0

    # 8. Build column metadata
    col_meta = []
    for d_id in all_dim_ids:
        dim = DIMENSION_MAP[d_id]
        col_meta.append({
            "id": d_id,
            "name": dim.display_name,
            "type": "dimension",
        })
    for m_id in values:
        m = MEASURE_MAP[m_id]
        col_meta.append({
            "id": m_id,
            "name": m.display_name,
            "type": "measure",
            "format": m.format,
        })

    # 9. Build flat result rows
    result_rows = []
    for key, measures in merged.items():
        row_dict: dict[str, object] = {}
        for i, d_id in enumerate(all_dim_ids):
            row_dict[d_id] = key[i]
        for m_id in values:
            val = measures.get(m_id, 0)
            # Round appropriately
            if MEASURE_MAP[m_id].format == "currency":
                row_dict[m_id] = round(val, 2)
            elif MEASURE_MAP[m_id].format == "percent":
                row_dict[m_id] = round(val, 1)
            elif MEASURE_MAP[m_id].format == "hours":
                row_dict[m_id] = round(val, 1)
            else:
                row_dict[m_id] = round(val)
        result_rows.append(row_dict)

    # Sort by first dimension, then second, etc.
    if all_dim_ids:
        result_rows.sort(key=lambda r: tuple(str(r.get(d, "")) for d in all_dim_ids))

    # 10. Compatibility warnings
    warnings = check_compatibility_warnings(all_dim_ids, values)

    return {
        "columns": col_meta,
        "rows": result_rows,
        "total_rows": len(result_rows),
        "warnings": warnings,
    }
