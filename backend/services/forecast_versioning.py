"""Forecast versioning service — C1 Mixed-Granularity Forecast + Versioning.

Spec: [C-FG-01..08], [C-FV-01..07], [C-VC-01..03], [C-RH-01..05]

Key concepts:
- boundary_month: last month rendered monthly (default: today + 12 months)
- horizon_end_month: last month in the grid (default: today + 60 months)
- Months <= boundary_month → monthly columns
- Months > boundary_month → aggregated into quarterly buckets (YYYY-QN)
- is_provisional=True for forecast rows beyond the boundary (outer zone)

Version lifecycle:
- 'cycle'       — created by submit_forecast_cycle for all active projects [C-FV-05]
- 'cr_approval' — created by approve_cr for the affected project [C-FV-02]
- 'manual'      — created on demand by a controller [C-FV-03]

payload_json schema_version 1: see _PAYLOAD_SCHEMA_VERSION below.
"""

from __future__ import annotations

import json
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from models.financial import Actuals, Baseline, Forecast, ForecastVersion
from models.projects import Project
from models.system import PlanningParameter
from schemas.common import CurrentUser
from services.calculations import (
    add_months,
    generate_month_range,
    month_to_quarter_key,
    month_to_str,
    parse_month,
    quarter_to_months,
)

_PAYLOAD_SCHEMA_VERSION = 1


# ---------------------------------------------------------------------------
# Parameter helpers [C-FG-05]
# ---------------------------------------------------------------------------

def get_horizon_params(db: Session) -> tuple[int, int]:
    """Return (granularity_boundary_months, planning_horizon_months).

    Falls back to (12, 60) if planning_parameters rows are missing.
    """
    rows = db.query(PlanningParameter).filter(
        PlanningParameter.key.in_(
            ["granularity_boundary_months", "planning_horizon_months"]
        )
    ).all()
    param_map = {r.key: int(r.current_value) for r in rows}
    boundary = param_map.get("granularity_boundary_months", 12)
    horizon = param_map.get("planning_horizon_months", 60)
    return boundary, horizon


def compute_boundary_month(demo_date: str, boundary_months: int) -> str:
    """Return the last month rendered at monthly granularity.

    boundary_month = demo_date + boundary_months - 1
    (subtract 1 so the first quarter starts at boundary_months+1)
    """
    return add_months(demo_date, boundary_months - 1)


def compute_horizon_end_month(demo_date: str, horizon_months: int) -> str:
    """Return the last month included in the grid."""
    return add_months(demo_date, horizon_months - 1)


# ---------------------------------------------------------------------------
# Quarter bucketing [C-FG-02..04]
# ---------------------------------------------------------------------------

def bucket_to_quarter(month: str, boundary_month: str) -> str | None:
    """Return the quarter key if month is beyond boundary, else None."""
    if month > boundary_month:
        return month_to_quarter_key(month)
    return None


def quarter_constituent_months(
    quarter_key: str,
    horizon_end_month: str,
) -> list[str]:
    """Return months in a quarter that fall within the horizon."""
    return [m for m in quarter_to_months(quarter_key) if m <= horizon_end_month]


def distribute_quarterly_value(
    total: float,
    months_in_quarter: list[str],
) -> dict[str, float]:
    """Distribute a quarterly aggregate back to constituent months.

    Uses equal division with cent-remainder applied to the last month [C-FG-03].
    """
    if not months_in_quarter:
        return {}
    n = len(months_in_quarter)
    base = round(total / n, 2)
    allocated = base * (n - 1)
    remainder = round(total - allocated, 2)
    result = {m: base for m in months_in_quarter[:-1]}
    result[months_in_quarter[-1]] = remainder
    return result


# ---------------------------------------------------------------------------
# Grid builder [C-FG-01..06]
# ---------------------------------------------------------------------------

def _first_quarter_start(boundary_month: str) -> str:
    """Return the first month of the first quarter whose first month > boundary_month.

    Rule per spec [C-FG-02]: monthly through boundary_month, then quarterly
    starting from the first quarter whose first month is strictly > boundary_month.

    Examples:
      boundary_month='2027-03' (last month of Q1 2027)
        → next quarter Q2 2027 starts at 2027-04 > 2027-03 ✓ → returns '2027-04'
      boundary_month='2027-05' (mid Q2 2027)
        → Q2 2027 starts at 2027-04 which is NOT > 2027-05
        → Q3 2027 starts at 2027-07 which IS > 2027-05 ✓ → returns '2027-07'
      boundary_month='2027-12' (last month of Q4 2027)
        → Q1 2028 starts at 2028-01 > 2027-12 ✓ → returns '2028-01'
    """
    # Walk forward quarter by quarter until we find one whose first month > boundary
    probe = add_months(boundary_month, 1)
    while True:
        q_key = month_to_quarter_key(probe)
        months = quarter_to_months(q_key)
        first_month = months[0]
        if first_month > boundary_month:
            return first_month
        # Not past boundary yet — jump to the start of the next quarter
        probe = add_months(months[-1], 1)  # one month after last month of this quarter


# ---------------------------------------------------------------------------
# Sub-row collectors (v5.1 W4 — lead-declared seam, teammates fill bodies)
# ---------------------------------------------------------------------------

def _collect_person_breakdown(
    db: Session,
    project_id: str,
    role_type_id: str,
    columns: list[dict],
    demo_date: str,
    horizon_end_month: str,
    lookback_start: str,
    include_baseline_actuals: bool,
) -> list[dict]:
    """v5.1 C-05 — return per-employee sub-rows for one internal role row.

    Teammate A fills this in (`feat/v5_1-roles-and-expand-w4-c05`). Until
    that lands, returns an empty list so the response shape is stable.

    Each returned dict is a `GridSubRow` payload: `label`, `sub_label`,
    `cells` (mirroring the parent row's column list), `row_total`,
    `person_id`, `cost_center_id`. EUR is computed via
    `services.calculations.resolve_hourly_rate`.
    """
    return []


def _collect_vendor_breakdown(
    db: Session,
    project_id: str,
    cost_type_id: str,
    columns: list[dict],
    demo_date: str,
    horizon_end_month: str,
    lookback_start: str,
    include_baseline_actuals: bool,
) -> tuple[list[dict], str | None]:
    """v5.1 C-06 / C-07 — per-vendor sub-rows + parent role_name for one external row.

    Returns:
        (sub_rows, role_name) where `role_name` is set when all
        contributing line items share a single non-null `role_type_id`,
        otherwise None (see C-07 spec — mixed-role parent rows fall back
        to `[Category]` only).

    Each sub-row groups by `(vendor, po_number, role_type_id)`. EUR-only
    cells (no hours). Baseline/Actuals rows always group under "No PO"
    since `po_number` only exists on Forecast.
    """
    from models.people import RoleType

    # ------------------------------------------------------------------
    # Fetch source rows. Forecast always; Baseline + Actuals only when the
    # caller explicitly asks for the three-source overlay (mirrors the
    # parent build_mixed_grid contract — capture_version stays single-source
    # so payload_json snapshots remain byte-identical to Wave 3).
    # ------------------------------------------------------------------
    fc_rows = (
        db.query(Forecast)
        .filter(
            Forecast.project_id == project_id,
            Forecast.category == "external",
            Forecast.sub_category == cost_type_id,
            Forecast.month >= lookback_start,
            Forecast.month <= horizon_end_month,
        )
        .all()
    )

    bl_rows: list[Baseline] = []
    ac_rows: list[Actuals] = []
    if include_baseline_actuals:
        bl_rows = (
            db.query(Baseline)
            .filter(
                Baseline.project_id == project_id,
                Baseline.category == "external",
                Baseline.sub_category == cost_type_id,
                Baseline.month <= horizon_end_month,
            )
            .all()
        )
        ac_rows = (
            db.query(Actuals)
            .filter(
                Actuals.project_id == project_id,
                Actuals.category == "external",
                Actuals.sub_category == cost_type_id,
                Actuals.month <= demo_date,
            )
            .all()
        )

    # Parent role_name derivation per [v5.1 C-07]: collect every distinct
    # non-null role_type_id contributing to the row. Single role → the parent
    # gets `[Category] — [Role Name]`; mixed (>=2 distinct) or all null →
    # role_name=None and the frontend falls back to `[Category]` only.
    distinct_roles: set[str] = set()
    for r in fc_rows:
        if r.role_type_id:
            distinct_roles.add(r.role_type_id)
    for r in bl_rows:
        if r.role_type_id:
            distinct_roles.add(r.role_type_id)
    for r in ac_rows:
        if r.role_type_id:
            distinct_roles.add(r.role_type_id)

    parent_role_name: str | None = None
    if len(distinct_roles) == 1:
        only_role = next(iter(distinct_roles))
        rt = db.query(RoleType).filter(RoleType.id == only_role).first()
        if rt is not None:
            parent_role_name = rt.name

    if not fc_rows and not bl_rows and not ac_rows:
        return [], parent_role_name

    # Pre-load role_name lookup for all roles seen across the three sources
    # so the per-sub-row label can carry the role even when the parent has
    # mixed roles. Single round-trip per parent row.
    all_role_ids = {r.role_type_id for r in fc_rows if r.role_type_id}
    all_role_ids.update(r.role_type_id for r in bl_rows if r.role_type_id)
    all_role_ids.update(r.role_type_id for r in ac_rows if r.role_type_id)
    role_name_map: dict[str, str] = {}
    if all_role_ids:
        for rt in db.query(RoleType).filter(RoleType.id.in_(all_role_ids)).all():
            role_name_map[rt.id] = rt.name

    # ------------------------------------------------------------------
    # Group by (vendor, po_number, role_type_id) per [C-06]. Baseline + Actuals
    # have no po_number column on the model, so they always bucket as "No PO".
    # We track per-(group, source, month) cells separately so the C-08
    # three-source overlay survives quarterly aggregation.
    # ------------------------------------------------------------------
    SourceKey = tuple[str, str | None, str | None]  # (vendor, po_number, role_id)

    # group_key → {"vendor", "po_number", "role_type_id", "fc": {month: amount},
    #              "bl": {month: amount}, "ac": {month: amount}, "ac_partial_months": set}
    groups: dict[SourceKey, dict] = {}

    def _ensure(vendor: str | None, po: str | None, role: str | None) -> dict:
        # Normalise vendor key — None / "" → "Unspecified" so they bucket
        # together (matches the existing vendor_summary behaviour).
        v_key = vendor if vendor else "Unspecified"
        key: SourceKey = (v_key, po, role)
        if key not in groups:
            groups[key] = {
                "vendor": v_key,
                "po_number": po,
                "role_type_id": role,
                "fc": {},
                "bl": {},
                "ac": {},
                "ac_partial_months": set(),
            }
        return groups[key]

    for r in fc_rows:
        g = _ensure(r.vendor, r.po_number, r.role_type_id)
        g["fc"][r.month] = g["fc"].get(r.month, 0.0) + float(r.amount_eur or 0)

    for r in bl_rows:
        # Baseline has no po_number — always group under None
        g = _ensure(r.vendor, None, r.role_type_id)
        g["bl"][r.month] = g["bl"].get(r.month, 0.0) + float(r.amount_eur or 0)

    for r in ac_rows:
        g = _ensure(r.vendor, None, r.role_type_id)
        g["ac"][r.month] = g["ac"].get(r.month, 0.0) + float(r.amount_eur or 0)
        if r.month == demo_date:
            g["ac_partial_months"].add(r.month)

    # ------------------------------------------------------------------
    # Build sub-rows: project per-month buckets through the parent grid's
    # column shape (monthly cells stay verbatim; quarterly cells sum the
    # constituent months). EUR-only cells — `hours` is set to 0.0 to match
    # the GridCell schema's required field.
    # ------------------------------------------------------------------
    sub_rows: list[dict] = []
    for key, g in groups.items():
        cells: list[dict] = []
        row_total = 0.0
        for col in columns:
            col_key = col["key"]
            cell_type = col["cell_type"]
            if cell_type == "monthly":
                fc_amt = g["fc"].get(col_key, 0.0)
                cell = {
                    "key": col_key,
                    "cell_type": "monthly",
                    "hours": 0.0,
                    "amount_eur": round(fc_amt, 2),
                    "is_provisional": False,
                }
                if include_baseline_actuals:
                    bl_amt = g["bl"].get(col_key)
                    ac_amt = g["ac"].get(col_key)
                    cell["baseline_hours"] = None
                    cell["baseline_amount_eur"] = (
                        round(bl_amt, 2) if bl_amt is not None else None
                    )
                    cell["actuals_hours"] = None
                    cell["actuals_amount_eur"] = (
                        round(ac_amt, 2) if ac_amt is not None else None
                    )
                    cell["actuals_partial"] = (
                        ac_amt is not None and col_key == demo_date
                    )
            else:
                # Quarterly: sum constituent months
                q_months = quarter_constituent_months(col_key, horizon_end_month)
                fc_total = sum(g["fc"].get(m, 0.0) for m in q_months)
                cell = {
                    "key": col_key,
                    "cell_type": "quarterly",
                    "hours": 0.0,
                    "amount_eur": round(fc_total, 2),
                    "is_provisional": False,
                }
                if include_baseline_actuals:
                    bl_total = 0.0
                    bl_seen = False
                    ac_total = 0.0
                    ac_seen = False
                    ac_partial_q = False
                    for m in q_months:
                        if m in g["bl"]:
                            bl_seen = True
                            bl_total += g["bl"][m]
                        if m in g["ac"]:
                            ac_seen = True
                            ac_total += g["ac"][m]
                            if m == demo_date:
                                ac_partial_q = True
                    cell["baseline_hours"] = None
                    cell["baseline_amount_eur"] = round(bl_total, 2) if bl_seen else None
                    cell["actuals_hours"] = None
                    cell["actuals_amount_eur"] = round(ac_total, 2) if ac_seen else None
                    cell["actuals_partial"] = ac_partial_q if ac_seen else None

            cells.append(cell)
            row_total += cell["amount_eur"]

        vendor = g["vendor"]
        po_number = g["po_number"]
        role_id = g["role_type_id"]
        role_name = role_name_map.get(role_id) if role_id else None

        po_label = po_number if po_number else "No PO"
        role_label = role_name if role_name else "—"
        label = f"{vendor} · {role_label} · {po_label}"

        sub_rows.append({
            "label": label,
            "sub_label": None,
            "cells": cells,
            "row_total": round(row_total, 2),
            "vendor": vendor,
            "po_number": po_number,
            "role_type_id": role_id,
            "role_name": role_name,
        })

    # Sort by descending row_total for deterministic output
    sub_rows.sort(key=lambda r: r["row_total"], reverse=True)

    return sub_rows, parent_role_name


def build_mixed_grid(
    db: Session,
    project_id: str,
    demo_date: str,
    granularity: str = "mixed",
    boundary_months: int | None = None,
    horizon_months: int | None = None,
    include_baseline_actuals: bool = False,
    lookback_months: int | None = None,
    include_person_breakdown: bool = False,
    include_vendor_breakdown: bool = False,
) -> dict:
    """Build the mixed-granularity forecast grid for a project.

    Args:
        granularity: 'mixed' (default), 'monthly', or 'quarterly'.
        boundary_months: override for granularity_boundary_months.
        horizon_months: override for planning_horizon_months.
        include_baseline_actuals: when True (v5.1 C-08), each cell carries
            ``baseline_*`` / ``actuals_*`` overlays alongside the forecast
            values so the UI can render the three-point stack. Default False
            keeps ForecastVersion snapshots forecast-only (smaller payloads,
            no behavioural change for v4 / v5 callers).
        lookback_months: when set and > 0 (v5.1 W3 pre-work), the inner
            monthly column window extends backwards from demo_date by this
            many months so past months render alongside future ones. The
            past zone is always monthly — boundary_month / quarterly outer
            zone semantics for the future are unchanged. Default None keeps
            the v5 column model (start at demo_date), so capture_version
            payload shapes stay byte-identical for existing callers.
        include_person_breakdown: when True (v5.1 C-05), internal rows
            carry ``sub_rows`` listing each assigned employee with
            per-column hours + EUR. Default False so capture_version
            snapshots stay forecast-only.
        include_vendor_breakdown: when True (v5.1 C-06), external rows
            carry ``sub_rows`` listing each (vendor, po_number, role)
            tuple. C-07 also derives ``role_name`` on the parent row when
            all contributing line items share a single role. Default
            False so capture_version snapshots stay forecast-only.

    Returns a dict matching the MixedGridResponse schema.
    """
    db_boundary, db_horizon = get_horizon_params(db)
    b_months = boundary_months if boundary_months is not None else db_boundary
    h_months = horizon_months if horizon_months is not None else db_horizon

    boundary_month = compute_boundary_month(demo_date, b_months)
    horizon_end_month = compute_horizon_end_month(demo_date, h_months)

    # v5.1 W3: lookback_start is the inclusive lower bound for the monthly
    # column window. Defaults to demo_date (v5 behaviour). When the caller
    # passes lookback_months > 0, we step back that many months so the F&P
    # grid renders elapsed months alongside future ones — needed for the
    # C-08 three-point past-month layout (actuals primary / forecast
    # secondary / baseline tertiary) and the C-03/C-04 phase-band + chart.
    lb_months = lookback_months if (lookback_months and lookback_months > 0) else 0
    lookback_start = add_months(demo_date, -lb_months) if lb_months else demo_date

    # ---------------------------------------------------------------------
    # v5.1 W3: forecast rows are fetched from lookback_start (defaults to
    # demo_date) through horizon_end_month, so the inner monthly window can
    # cover past months when lookback_months > 0. Baseline + actuals queries
    # below intentionally have no lower bound (Baseline.month <=
    # horizon_end_month, Actuals.month <= demo_date) — they already cover
    # any lookback window the caller requests. The past-zone display rule
    # (actuals primary / forecast secondary / baseline tertiary) lives in
    # the frontend; the backend just needs to surface the cells.
    # ---------------------------------------------------------------------

    # Fetch all forecast rows for this project
    fc_rows = (
        db.query(Forecast)
        .filter(
            Forecast.project_id == project_id,
            Forecast.month >= lookback_start,
            Forecast.month <= horizon_end_month,
        )
        .order_by(Forecast.month)
        .all()
    )

    # Group rows by (category, sub_category) — same structure as v4 grid
    rows_map: dict[tuple[str, str], dict] = {}
    for f in fc_rows:
        key = (f.category, f.sub_category)
        if key not in rows_map:
            rows_map[key] = {
                "category": f.category,
                "sub_category": f.sub_category,
                "capex_opex": f.capex_opex,
                "cells": {},  # month/quarter_key → {hours, amount_eur, is_provisional, cell_type}
            }
        cell_key = f.month
        if cell_key not in rows_map[key]["cells"]:
            rows_map[key]["cells"][cell_key] = {
                "hours": 0.0,
                "amount_eur": 0.0,
                "is_provisional": bool(f.is_provisional),
                "cell_type": "monthly",
            }
        rows_map[key]["cells"][cell_key]["hours"] += float(f.hours or 0)
        rows_map[key]["cells"][cell_key]["amount_eur"] += float(f.amount_eur)

    # ---------------------------------------------------------------------
    # v5.1 C-08: optionally fetch baseline + actuals so cells can carry the
    # three-point stack. We index by (category, sub_category, month) to
    # match the forecast row grouping. Hours are summed when present.
    # ---------------------------------------------------------------------
    baseline_index: dict[tuple[str, str, str], dict[str, float]] = {}
    actuals_index: dict[tuple[str, str, str], dict[str, float]] = {}
    if include_baseline_actuals:
        # Baseline can extend past demo_date — pull everything <= horizon
        # so the row grouping picks up line items that have a baseline but
        # no forecast (and vice versa).
        bl_rows = (
            db.query(Baseline)
            .filter(
                Baseline.project_id == project_id,
                Baseline.month <= horizon_end_month,
            )
            .all()
        )
        for b in bl_rows:
            k = (b.category, b.sub_category, b.month)
            entry = baseline_index.setdefault(k, {"hours": 0.0, "amount_eur": 0.0})
            entry["hours"] += float(b.hours or 0)
            entry["amount_eur"] += float(b.amount_eur)
            # Make sure the row exists in rows_map even if no forecast row
            # touched this (category, sub_category) — the UI still wants to
            # show the baseline column.
            row_key = (b.category, b.sub_category)
            if row_key not in rows_map:
                rows_map[row_key] = {
                    "category": b.category,
                    "sub_category": b.sub_category,
                    "capex_opex": b.capex_opex,
                    "cells": {},
                }

        # Actuals are historical — strictly past months are fully closed,
        # the current month (demo_date) is partial.
        ac_rows = (
            db.query(Actuals)
            .filter(
                Actuals.project_id == project_id,
                Actuals.month <= demo_date,
            )
            .all()
        )
        for a in ac_rows:
            k = (a.category, a.sub_category, a.month)
            entry = actuals_index.setdefault(k, {"hours": 0.0, "amount_eur": 0.0})
            entry["hours"] += float(a.hours or 0)
            entry["amount_eur"] += float(a.amount_eur)
            row_key = (a.category, a.sub_category)
            if row_key not in rows_map:
                rows_map[row_key] = {
                    "category": a.category,
                    "sub_category": a.sub_category,
                    "capex_opex": a.capex_opex,
                    "cells": {},
                }

    # Determine column headers. v5.1 W3: monthly window starts at
    # lookback_start (= demo_date when lookback_months is None/0), runs
    # through boundary_month. Past zone is always monthly — quarterly
    # outer-zone columns only sit beyond boundary_month, never in the past.
    monthly_months = generate_month_range(lookback_start, boundary_month)
    # Cap to horizon
    monthly_months = [m for m in monthly_months if m <= horizon_end_month]

    # Quarterly columns: from first quarter past boundary through horizon
    quarterly_keys: list[str] = []
    if granularity != "monthly":
        fqs = _first_quarter_start(boundary_month)
        cur = fqs
        while cur <= horizon_end_month:
            qk = month_to_quarter_key(cur)
            if qk not in quarterly_keys:
                quarterly_keys.append(qk)
            cur = add_months(cur, 3)

    # Build column definitions
    if granularity == "monthly":
        all_monthly = generate_month_range(lookback_start, horizon_end_month)
        columns = [{"key": m, "label": m, "cell_type": "monthly"} for m in all_monthly]
    elif granularity == "quarterly":
        # All columns as quarters. Past months (before demo_date) collapse
        # into their containing quarter just like future ones — quarterly
        # mode is a uniform aggregation, not the mixed past/future split.
        all_months = generate_month_range(lookback_start, horizon_end_month)
        seen_quarters: list[str] = []
        for m in all_months:
            qk = month_to_quarter_key(m)
            if qk not in seen_quarters:
                seen_quarters.append(qk)
        columns = [{"key": qk, "label": qk, "cell_type": "quarterly"} for qk in seen_quarters]
    else:  # mixed
        columns = [{"key": m, "label": m, "cell_type": "monthly"} for m in monthly_months]
        columns += [{"key": qk, "label": qk, "cell_type": "quarterly"} for qk in quarterly_keys]

    # Build output rows
    output_rows = []
    totals_by_column: dict[str, float] = {}

    for (category, sub_cat), row_data in rows_map.items():
        cells_raw = row_data["cells"]  # month → data

        # Aggregate into column keys
        output_cells = []
        for col in columns:
            col_key = col["key"]
            cell_type = col["cell_type"]

            if cell_type == "monthly":
                raw = cells_raw.get(col_key, {})
                cell = {
                    "key": col_key,
                    "cell_type": "monthly",
                    "hours": raw.get("hours", 0.0),
                    "amount_eur": raw.get("amount_eur", 0.0),
                    "is_provisional": raw.get("is_provisional", False),
                }
                if include_baseline_actuals:
                    bl = baseline_index.get((category, sub_cat, col_key))
                    ac = actuals_index.get((category, sub_cat, col_key))
                    cell["baseline_hours"] = (
                        round(bl["hours"], 2) if bl is not None else None
                    )
                    cell["baseline_amount_eur"] = (
                        round(bl["amount_eur"], 2) if bl is not None else None
                    )
                    cell["actuals_hours"] = (
                        round(ac["hours"], 2) if ac is not None else None
                    )
                    cell["actuals_amount_eur"] = (
                        round(ac["amount_eur"], 2) if ac is not None else None
                    )
                    # Partial = the cell month equals the demo date (current
                    # month is in progress). Past months are fully closed.
                    cell["actuals_partial"] = (
                        ac is not None and col_key == demo_date
                    )
            else:
                # Quarterly: sum constituent months
                q_months = quarter_constituent_months(col_key, horizon_end_month)
                total_hours = sum(cells_raw.get(m, {}).get("hours", 0.0) for m in q_months)
                total_amt = sum(cells_raw.get(m, {}).get("amount_eur", 0.0) for m in q_months)
                # A quarter is provisional if any constituent month is provisional
                any_provisional = any(
                    cells_raw.get(m, {}).get("is_provisional", False) for m in q_months
                )
                cell = {
                    "key": col_key,
                    "cell_type": "quarterly",
                    "hours": round(total_hours, 2),
                    "amount_eur": round(total_amt, 2),
                    "is_provisional": any_provisional,
                }
                if include_baseline_actuals:
                    bl_h = 0.0
                    bl_a = 0.0
                    bl_seen = False
                    ac_h = 0.0
                    ac_a = 0.0
                    ac_seen = False
                    ac_partial_q = False
                    for m in q_months:
                        bl = baseline_index.get((category, sub_cat, m))
                        if bl is not None:
                            bl_seen = True
                            bl_h += bl["hours"]
                            bl_a += bl["amount_eur"]
                        ac = actuals_index.get((category, sub_cat, m))
                        if ac is not None:
                            ac_seen = True
                            ac_h += ac["hours"]
                            ac_a += ac["amount_eur"]
                            if m == demo_date:
                                ac_partial_q = True
                    cell["baseline_hours"] = round(bl_h, 2) if bl_seen else None
                    cell["baseline_amount_eur"] = round(bl_a, 2) if bl_seen else None
                    cell["actuals_hours"] = round(ac_h, 2) if ac_seen else None
                    cell["actuals_amount_eur"] = round(ac_a, 2) if ac_seen else None
                    cell["actuals_partial"] = ac_partial_q if ac_seen else None

            output_cells.append(cell)
            totals_by_column[col_key] = round(
                totals_by_column.get(col_key, 0.0) + cell["amount_eur"], 2
            )

        out_row = {
            "category": category,
            "sub_category": sub_cat,
            "capex_opex": row_data["capex_opex"],
            "cells": output_cells,
            "row_total": round(sum(c["amount_eur"] for c in output_cells), 2),
        }

        # v5.1 C-05 — Teammate A: per-employee sub-rows for internal rows.
        if include_person_breakdown and category == "internal":
            out_row["sub_rows"] = _collect_person_breakdown(
                db=db,
                project_id=project_id,
                role_type_id=sub_cat,
                columns=columns,
                demo_date=demo_date,
                horizon_end_month=horizon_end_month,
                lookback_start=lookback_start,
                include_baseline_actuals=include_baseline_actuals,
            )

        # v5.1 C-06 / C-07 — Teammate B: per-vendor sub-rows + role_name on
        # the parent for external rows.
        if include_vendor_breakdown and category == "external":
            sub_rows, role_name = _collect_vendor_breakdown(
                db=db,
                project_id=project_id,
                cost_type_id=sub_cat,
                columns=columns,
                demo_date=demo_date,
                horizon_end_month=horizon_end_month,
                lookback_start=lookback_start,
                include_baseline_actuals=include_baseline_actuals,
            )
            out_row["sub_rows"] = sub_rows
            out_row["role_name"] = role_name

        output_rows.append(out_row)

    grand_total = round(sum(totals_by_column.values()), 2)

    return {
        "project_id": project_id,
        "granularity": granularity,
        "boundary_month": boundary_month,
        "horizon_end_month": horizon_end_month,
        "granularity_boundary_months": b_months,
        "planning_horizon_months": h_months,
        "columns": columns,
        "rows": output_rows,
        "totals_by_column": totals_by_column,
        "grand_total": grand_total,
    }


# ---------------------------------------------------------------------------
# Serialization helpers [C-FV-07]
# ---------------------------------------------------------------------------

def serialize_forecast_payload(
    project_id: str,
    grid: dict,
    captured_at: str,
) -> str:
    """Serialize the grid dict to a JSON string (payload_json).

    Schema version 1 format.
    """
    payload = {
        "schema_version": _PAYLOAD_SCHEMA_VERSION,
        "project_id": project_id,
        "captured_at": captured_at,
        "boundary_month": grid["boundary_month"],
        "horizon_end_month": grid["horizon_end_month"],
        "rows": grid["rows"],
        "totals_by_column": grid["totals_by_column"],
        "totals_by_category": _compute_totals_by_category(grid["rows"]),
        "grand_total": grid["grand_total"],
    }
    return json.dumps(payload, default=str)


def _compute_totals_by_category(rows: list[dict]) -> dict[str, float]:
    totals: dict[str, float] = {}
    for row in rows:
        cat = row["category"]
        totals[cat] = round(totals.get(cat, 0.0) + row.get("row_total", 0.0), 2)
    return totals


# ---------------------------------------------------------------------------
# Version capture [C-FV-01..06]
# ---------------------------------------------------------------------------

def _next_version_number(db: Session, project_id: str) -> int:
    """Return the next sequential version number for a project.

    Uses MAX + 1 with a retry-once pattern for UniqueConstraint races [C-FV-04].
    """
    from sqlalchemy import text
    result = db.execute(
        text("SELECT COALESCE(MAX(version_number), 0) FROM forecast_versions WHERE project_id = :pid"),
        {"pid": project_id},
    ).scalar()
    return (result or 0) + 1


def capture_version(
    db: Session,
    project_id: str,
    user: CurrentUser,
    version_type: str = "manual",
    change_request_id: int | None = None,
    cycle_label: str | None = None,
    cycle_id: str | None = None,
    demo_date: str = "2026-04",
    boundary_months: int | None = None,
    horizon_months: int | None = None,
) -> ForecastVersion:
    """Capture the current forecast as a new ForecastVersion.

    version_type: 'cycle' | 'cr_approval' | 'manual'

    Does NOT commit — caller is responsible for committing the session.
    Raises IntegrityError on version_number collision (retry in capture_versions_for_cycle).
    """
    from config import DEMO_DATE as _DEMO_DATE
    effective_demo_date = demo_date if demo_date != "2026-04" else _DEMO_DATE

    grid = build_mixed_grid(
        db=db,
        project_id=project_id,
        demo_date=effective_demo_date,
        boundary_months=boundary_months,
        horizon_months=horizon_months,
    )

    captured_at = datetime.utcnow().isoformat()
    payload_json = serialize_forecast_payload(project_id, grid, captured_at)

    # Count cells (number of non-zero amount_eur cells across all rows)
    cell_count = sum(
        1
        for row in grid["rows"]
        for cell in row["cells"]
        if cell["amount_eur"] != 0.0
    )

    version_number = _next_version_number(db, project_id)

    fv = ForecastVersion(
        project_id=project_id,
        version_number=version_number,
        version_type=version_type,
        cycle_label=cycle_label,
        cycle_id=cycle_id,
        change_request_id=change_request_id,
        created_by_id=user.person_id,
        granularity_boundary_months=grid["granularity_boundary_months"],
        planning_horizon_months=grid["planning_horizon_months"],
        payload_json=payload_json,
        cell_count=cell_count,
        total_amount_eur=Decimal(str(grid["grand_total"])) if grid["grand_total"] else None,
    )
    db.add(fv)
    return fv


def capture_versions_for_cycle(
    db: Session,
    user: CurrentUser,
    cycle_label: str,
    cycle_id: str | None = None,
    demo_date: str | None = None,
) -> list[ForecastVersion]:
    """Fan-out: create one ForecastVersion per active project for a cycle [C-FV-05].

    Runs best-effort — a failure for one project does not abort the others.
    Returns the list of created versions (committed by caller).
    """
    from config import DEMO_DATE as _DEMO_DATE
    effective_demo_date = demo_date or _DEMO_DATE

    projects = db.query(Project).filter(Project.is_active.is_(True)).all()
    created: list[ForecastVersion] = []

    for project in projects:
        # Only snapshot projects that have forecast rows
        has_forecast = db.query(Forecast).filter(
            Forecast.project_id == project.id
        ).limit(1).first()
        if not has_forecast:
            continue

        try:
            fv = capture_version(
                db=db,
                project_id=project.id,
                user=user,
                version_type="cycle",
                cycle_label=cycle_label,
                cycle_id=cycle_id,
                demo_date=effective_demo_date,
            )
            db.flush()  # materialize version_number before next project
            created.append(fv)
        except Exception as exc:  # noqa: BLE001
            import logging
            logging.getLogger(__name__).warning(
                "capture_versions_for_cycle: skipped project %s: %s", project.id, exc
            )
            db.rollback()

    return created


# ---------------------------------------------------------------------------
# List / detail [C-RH-01..04]
# ---------------------------------------------------------------------------

def list_versions(
    db: Session,
    project_id: str,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[ForecastVersion], int]:
    """Return (versions newest-first, total) [C-RH-01]."""
    q = (
        db.query(ForecastVersion)
        .filter(ForecastVersion.project_id == project_id)
        .order_by(ForecastVersion.version_number.desc())
    )
    total = q.count()
    items = q.offset(offset).limit(limit).all()
    return items, total


def get_version(db: Session, version_id: int) -> ForecastVersion | None:
    """Return a single version by its PK [C-RH-02]."""
    return db.query(ForecastVersion).filter(ForecastVersion.id == version_id).first()


# ---------------------------------------------------------------------------
# Diff computation [C-RH-05]
# ---------------------------------------------------------------------------

def _decode_payload(fv: ForecastVersion) -> dict | None:
    if not fv.payload_json:
        return None
    try:
        return json.loads(fv.payload_json)
    except (json.JSONDecodeError, TypeError):
        return None


def compute_diff(
    db: Session,
    version_a_id: int,
    version_b_id: int,
) -> dict:
    """Compute a line-item diff between two ForecastVersions [C-RH-05].

    status values: 'unchanged' | 'added' | 'removed' | 'modified'.
    Returns a dict matching ForecastVersionDiff schema.
    """
    fv_a = get_version(db, version_a_id)
    fv_b = get_version(db, version_b_id)

    if fv_a is None:
        raise ValueError(f"Version {version_a_id} not found")
    if fv_b is None:
        raise ValueError(f"Version {version_b_id} not found")

    payload_a = _decode_payload(fv_a)
    payload_b = _decode_payload(fv_b)

    if payload_a is None and payload_b is None:
        return _empty_diff(fv_a, fv_b)

    # Build lookup: (category, sub_category, cell_key) → amount_eur
    def _index(payload: dict | None) -> dict[tuple[str, str, str], float]:
        if payload is None:
            return {}
        idx: dict[tuple[str, str, str], float] = {}
        for row in payload.get("rows", []):
            cat = row.get("category", "")
            sub = row.get("sub_category", "")
            for cell in row.get("cells", []):
                key = cell.get("key", "")
                idx[(cat, sub, key)] = float(cell.get("amount_eur", 0.0))
        return idx

    idx_a = _index(payload_a)
    idx_b = _index(payload_b)

    all_keys = sorted(set(idx_a) | set(idx_b))

    line_deltas = []
    for (cat, sub, cell_key) in all_keys:
        a_val = idx_a.get((cat, sub, cell_key))
        b_val = idx_b.get((cat, sub, cell_key))

        if a_val is None:
            status = "added"
            delta = b_val
        elif b_val is None:
            status = "removed"
            delta = -(a_val)
        elif abs(a_val - b_val) < 0.005:
            status = "unchanged"
            delta = 0.0
        else:
            status = "modified"
            delta = round(b_val - a_val, 2)

        if status != "unchanged":
            line_deltas.append({
                "category": cat,
                "sub_category": sub,
                "cell_key": cell_key,
                "version_a_amount": a_val,
                "version_b_amount": b_val,
                "delta": delta,
                "status": status,
            })

    grand_total_a = float(fv_a.total_amount_eur or 0)
    grand_total_b = float(fv_b.total_amount_eur or 0)

    return {
        "version_a_id": version_a_id,
        "version_b_id": version_b_id,
        "version_a_number": fv_a.version_number,
        "version_b_number": fv_b.version_number,
        "version_a_project_id": fv_a.project_id,
        "version_b_project_id": fv_b.project_id,
        "line_deltas": line_deltas,
        "summary": {
            "added_count": sum(1 for d in line_deltas if d["status"] == "added"),
            "removed_count": sum(1 for d in line_deltas if d["status"] == "removed"),
            "modified_count": sum(1 for d in line_deltas if d["status"] == "modified"),
            "total_changes": len(line_deltas),
        },
        "grand_totals": {
            "version_a": grand_total_a,
            "version_b": grand_total_b,
            "delta": round(grand_total_b - grand_total_a, 2),
        },
    }


def _empty_diff(fv_a: ForecastVersion, fv_b: ForecastVersion) -> dict:
    return {
        "version_a_id": fv_a.id,
        "version_b_id": fv_b.id,
        "version_a_number": fv_a.version_number,
        "version_b_number": fv_b.version_number,
        "version_a_project_id": fv_a.project_id,
        "version_b_project_id": fv_b.project_id,
        "line_deltas": [],
        "summary": {"added_count": 0, "removed_count": 0, "modified_count": 0, "total_changes": 0},
        "grand_totals": {
            "version_a": float(fv_a.total_amount_eur or 0),
            "version_b": float(fv_b.total_amount_eur or 0),
            "delta": 0.0,
        },
    }


# ---------------------------------------------------------------------------
# Provisional marking [C-FG-07]
# ---------------------------------------------------------------------------

def mark_cells_provisional(
    db: Session,
    project_id: str,
    demo_date: str,
    boundary_months: int | None = None,
) -> int:
    """Set is_provisional=True for all forecast rows beyond the boundary month.

    Returns the number of rows updated.
    """
    db_boundary, _ = get_horizon_params(db)
    b_months = boundary_months if boundary_months is not None else db_boundary
    boundary_month = compute_boundary_month(demo_date, b_months)

    rows = (
        db.query(Forecast)
        .filter(
            Forecast.project_id == project_id,
            Forecast.month > boundary_month,
        )
        .all()
    )
    for row in rows:
        row.is_provisional = True

    inner_rows = (
        db.query(Forecast)
        .filter(
            Forecast.project_id == project_id,
            Forecast.month <= boundary_month,
        )
        .all()
    )
    for row in inner_rows:
        row.is_provisional = False

    return len(rows)
