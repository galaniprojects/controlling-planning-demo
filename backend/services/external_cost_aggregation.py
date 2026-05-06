"""External cost aggregation service for v5 Session E2.

Per [E-08a]–[E-08d]. Reuses helpers from ``services.report_service`` (notably
``_get_scoped_project_ids``) so role scoping behaves identically to the
existing Vendor Spend report.

Two scopes:
  - Project-scoped: ``compute_project_vendor_summary``,
    ``compute_project_category_rollup``
  - Portfolio-scoped: ``compute_portfolio_vendor_summary``,
    ``compute_portfolio_category_analysis``,
    ``compute_project_vendor_matrix``

All amounts are returned in EUR with two-decimal rounding to keep the
front-end formatter (`formatters.ts`) happy.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from models.financial import Actuals, Baseline, ExternalCostType, Forecast
from models.people import RoleType
from models.projects import Project
from schemas.common import CurrentUser
from services.report_service import _get_scoped_project_ids


def _load_role_names(db: Session) -> dict[str, str]:
    """Return a {role_type_id: name} map covering all role types.

    Cached per call — used by the v5.1 C-07 vendor-summary role denormalisation
    so each output row carries `role_name` alongside `role_type_id`. Single
    round-trip per request (the catalogue is ~12 rows in the demo seed).
    """
    return {rt.id: rt.name for rt in db.query(RoleType).all()}


def _load_cost_type_names(db: Session) -> dict[str, str]:
    """Return a {cost_type_id: name} map covering all configured types."""
    return {
        ct.id: ct.name
        for ct in db.query(ExternalCostType).all()
    }


def _project_external_filter(query, project_id: str | None = None,
                             project_ids: list[str] | None = None,
                             year: int | None = None):
    """Apply common filters to a Forecast/Actuals/Baseline query."""
    from sqlalchemy import func as sa_func

    if project_id is not None:
        query = query.filter(query.column_descriptions[0]["entity"].project_id
                             == project_id)
    elif project_ids is not None:
        # Resolve column dynamically to support Forecast/Actuals/Baseline
        entity = query.column_descriptions[0]["entity"]
        query = query.filter(entity.project_id.in_(project_ids))
    if year is not None:
        entity = query.column_descriptions[0]["entity"]
        query = query.filter(sa_func.substr(entity.month, 1, 4) == str(year))
    # Always restrict to external rows with a vendor populated
    entity = query.column_descriptions[0]["entity"]
    query = query.filter(entity.category == "external")
    return query


# ---------------------------------------------------------------------------
# Project-scoped helpers
# ---------------------------------------------------------------------------

def compute_project_vendor_summary(
    db: Session,
    project_id: str,
    year: int | None = None,
    role_type_id: str | None = None,
) -> list[dict]:
    """Vendor list for a single project. Caller is responsible for access checks.

    v5.1 C-07: each output row carries `role_type_id` + `role_name` denormalised
    from the contributing line items. When the (vendor, project) tuple has
    multiple distinct roles, the row's `role_type_id` is None (matches the
    parent-label rule used by the F&P grid). When `role_type_id` is passed in,
    the result is filtered to vendors whose dominant/sole role matches.
    """
    cost_type_names = _load_cost_type_names(db)
    role_names = _load_role_names(db)

    fc_q = db.query(Forecast).filter(
        Forecast.project_id == project_id,
        Forecast.category == "external",
        Forecast.vendor.isnot(None),
        Forecast.vendor != "",
    )
    bl_q = db.query(Baseline).filter(
        Baseline.project_id == project_id,
        Baseline.category == "external",
        Baseline.vendor.isnot(None),
        Baseline.vendor != "",
    )
    ac_q = db.query(Actuals).filter(
        Actuals.project_id == project_id,
        Actuals.category == "external",
        Actuals.vendor.isnot(None),
        Actuals.vendor != "",
    )

    if year is not None:
        from sqlalchemy import func as sa_func
        prefix = str(year)
        fc_q = fc_q.filter(sa_func.substr(Forecast.month, 1, 4) == prefix)
        bl_q = bl_q.filter(sa_func.substr(Baseline.month, 1, 4) == prefix)
        ac_q = ac_q.filter(sa_func.substr(Actuals.month, 1, 4) == prefix)

    forecast_rows = fc_q.all()
    baseline_rows = bl_q.all()
    actuals_rows = ac_q.all()

    vendor_map: dict[str, dict] = {}

    def _ensure(vendor: str) -> dict:
        if vendor not in vendor_map:
            vendor_map[vendor] = {
                "vendor_name": vendor,
                "forecast_total": 0.0,
                "actuals_total": 0.0,
                "baseline_total": 0.0,
                "po_numbers": set(),
                "cost_type_counts": {},
                "role_ids": set(),  # v5.1 C-07: distinct non-null role_type_ids
                "line_count": 0,
            }
        return vendor_map[vendor]

    for f in forecast_rows:
        rec = _ensure(f.vendor)
        rec["forecast_total"] += float(f.amount_eur or 0)
        rec["line_count"] += 1
        if f.po_number:
            rec["po_numbers"].add(f.po_number)
        ct = f.sub_category or ""
        if ct:
            rec["cost_type_counts"][ct] = rec["cost_type_counts"].get(ct, 0) + 1
        if f.role_type_id:
            rec["role_ids"].add(f.role_type_id)

    for b in baseline_rows:
        rec = _ensure(b.vendor)
        rec["baseline_total"] += float(b.amount_eur or 0)
        ct = b.sub_category or ""
        if ct:
            rec["cost_type_counts"][ct] = rec["cost_type_counts"].get(ct, 0) + 1
        if b.role_type_id:
            rec["role_ids"].add(b.role_type_id)

    for a in actuals_rows:
        rec = _ensure(a.vendor)
        rec["actuals_total"] += float(a.amount_eur or 0)
        if a.role_type_id:
            rec["role_ids"].add(a.role_type_id)

    rows: list[dict] = []
    for rec in vendor_map.values():
        ct_counts = rec["cost_type_counts"]
        dominant_ct_id = max(ct_counts, key=ct_counts.get) if ct_counts else ""
        dominant_ct_name = cost_type_names.get(dominant_ct_id, dominant_ct_id)
        forecast_total = round(rec["forecast_total"], 2)
        actuals_total = round(rec["actuals_total"], 2)
        baseline_total = round(rec["baseline_total"], 2)

        # v5.1 C-07 — role denormalisation. Single non-null role → row-level
        # role_type_id + role_name set; mixed (>=2 distinct) or all null →
        # both fields None. Mirrors the F&P grid parent-label rule.
        role_ids = rec["role_ids"]
        if len(role_ids) == 1:
            row_role_id = next(iter(role_ids))
            row_role_name = role_names.get(row_role_id)
        else:
            row_role_id = None
            row_role_name = None

        rows.append({
            "vendor_name": rec["vendor_name"],
            "expense_cost_type": dominant_ct_name,
            "forecast_total": forecast_total,
            "actuals_total": actuals_total,
            "baseline_total": baseline_total,
            "remaining": round(forecast_total - actuals_total, 2),
            "variance": round(forecast_total - baseline_total, 2),
            "po_count": len(rec["po_numbers"]),
            "line_count": rec["line_count"],
            # v5.1 C-07
            "role_type_id": row_role_id,
            "role_name": row_role_name,
            # v5.1 C-09 — vendor-table column additions (zero-filled in
            # pre-work; Teammate C populates real values once the new
            # columns and seed data are wired through).
            "contract_reference": None,
            "contract_end": None,
            "open_po": 0.0,
            "remaining_not_invoiced": 0.0,
        })

    # v5.1 C-07: optional role filter — applied after rollup so the
    # mixed-role exclusion semantics are obvious. Vendors with `role_type_id`
    # null (no role / mixed roles) are excluded when a specific role is
    # requested.
    if role_type_id is not None:
        rows = [r for r in rows if r["role_type_id"] == role_type_id]

    rows.sort(key=lambda r: r["forecast_total"], reverse=True)
    return rows


def compute_project_category_rollup(
    db: Session,
    project_id: str,
    year: int | None = None,
) -> list[dict]:
    """Per-cost-type totals for one project."""
    cost_type_names = _load_cost_type_names(db)

    fc_q = db.query(Forecast).filter(
        Forecast.project_id == project_id,
        Forecast.category == "external",
    )
    bl_q = db.query(Baseline).filter(
        Baseline.project_id == project_id,
        Baseline.category == "external",
    )
    ac_q = db.query(Actuals).filter(
        Actuals.project_id == project_id,
        Actuals.category == "external",
    )

    if year is not None:
        from sqlalchemy import func as sa_func
        prefix = str(year)
        fc_q = fc_q.filter(sa_func.substr(Forecast.month, 1, 4) == prefix)
        bl_q = bl_q.filter(sa_func.substr(Baseline.month, 1, 4) == prefix)
        ac_q = ac_q.filter(sa_func.substr(Actuals.month, 1, 4) == prefix)

    cat_map: dict[str, dict] = {}

    def _ensure(cost_type_id: str) -> dict:
        if cost_type_id not in cat_map:
            cat_map[cost_type_id] = {
                "cost_type_id": cost_type_id,
                "cost_type_name": cost_type_names.get(cost_type_id, cost_type_id),
                "forecast_total": 0.0,
                "actuals_total": 0.0,
                "baseline_total": 0.0,
                "vendors": set(),
            }
        return cat_map[cost_type_id]

    for f in fc_q.all():
        rec = _ensure(f.sub_category or "")
        rec["forecast_total"] += float(f.amount_eur or 0)
        if f.vendor:
            rec["vendors"].add(f.vendor)
    for b in bl_q.all():
        rec = _ensure(b.sub_category or "")
        rec["baseline_total"] += float(b.amount_eur or 0)
        if b.vendor:
            rec["vendors"].add(b.vendor)
    for a in ac_q.all():
        rec = _ensure(a.sub_category or "")
        rec["actuals_total"] += float(a.amount_eur or 0)
        if a.vendor:
            rec["vendors"].add(a.vendor)

    rows: list[dict] = []
    for rec in cat_map.values():
        forecast_total = round(rec["forecast_total"], 2)
        actuals_total = round(rec["actuals_total"], 2)
        baseline_total = round(rec["baseline_total"], 2)
        rows.append({
            "cost_type_id": rec["cost_type_id"],
            "cost_type_name": rec["cost_type_name"],
            "forecast_total": forecast_total,
            "actuals_total": actuals_total,
            "baseline_total": baseline_total,
            "remaining": round(forecast_total - actuals_total, 2),
            "variance": round(forecast_total - baseline_total, 2),
            "vendor_count": len(rec["vendors"]),
        })

    rows.sort(key=lambda r: r["forecast_total"], reverse=True)
    return rows


# ---------------------------------------------------------------------------
# Portfolio-scoped helpers
# ---------------------------------------------------------------------------

def compute_portfolio_vendor_summary(
    db: Session,
    user: CurrentUser,
    year: int | None = None,
    filters: dict | None = None,
) -> list[dict]:
    """Cross-project vendor table.

    Reuses ``_get_scoped_project_ids`` so the same role visibility rules apply
    as in the existing Vendor Spend report.
    """
    project_ids = _get_scoped_project_ids(db, user, filters)
    if not project_ids:
        return []

    cost_type_names = _load_cost_type_names(db)
    project_names = {
        p.id: p.name
        for p in db.query(Project).filter(Project.id.in_(project_ids)).all()
    }

    fc_q = db.query(Forecast).filter(
        Forecast.project_id.in_(project_ids),
        Forecast.category == "external",
        Forecast.vendor.isnot(None),
        Forecast.vendor != "",
    )
    ac_q = db.query(Actuals).filter(
        Actuals.project_id.in_(project_ids),
        Actuals.category == "external",
        Actuals.vendor.isnot(None),
        Actuals.vendor != "",
    )

    if year is not None:
        from sqlalchemy import func as sa_func
        prefix = str(year)
        fc_q = fc_q.filter(sa_func.substr(Forecast.month, 1, 4) == prefix)
        ac_q = ac_q.filter(sa_func.substr(Actuals.month, 1, 4) == prefix)

    vendor_map: dict[str, dict] = {}

    def _ensure(vendor: str) -> dict:
        if vendor not in vendor_map:
            vendor_map[vendor] = {
                "vendor_name": vendor,
                "forecast_total": 0.0,
                "actuals_total": 0.0,
                "project_totals": {},  # project_id -> forecast+actuals
                "po_numbers": set(),
                "cost_type_counts": {},
            }
        return vendor_map[vendor]

    for f in fc_q.all():
        rec = _ensure(f.vendor)
        amt = float(f.amount_eur or 0)
        rec["forecast_total"] += amt
        rec["project_totals"][f.project_id] = (
            rec["project_totals"].get(f.project_id, 0.0) + amt
        )
        if f.po_number:
            rec["po_numbers"].add(f.po_number)
        ct = f.sub_category or ""
        if ct:
            rec["cost_type_counts"][ct] = rec["cost_type_counts"].get(ct, 0) + 1

    for a in ac_q.all():
        rec = _ensure(a.vendor)
        amt = float(a.amount_eur or 0)
        rec["actuals_total"] += amt
        rec["project_totals"][a.project_id] = (
            rec["project_totals"].get(a.project_id, 0.0) + amt
        )

    rows: list[dict] = []
    for rec in vendor_map.values():
        ct_counts = rec["cost_type_counts"]
        dominant_ct_id = max(ct_counts, key=ct_counts.get) if ct_counts else ""
        dominant_ct_name = cost_type_names.get(dominant_ct_id, dominant_ct_id)
        if rec["project_totals"]:
            top_pid, top_amt = max(rec["project_totals"].items(), key=lambda x: x[1])
        else:
            top_pid, top_amt = None, 0.0
        rows.append({
            "vendor_name": rec["vendor_name"],
            "expense_cost_type": dominant_ct_name,
            "project_count": len(rec["project_totals"]),
            "forecast_total": round(rec["forecast_total"], 2),
            "actuals_total": round(rec["actuals_total"], 2),
            "top_project_id": top_pid,
            "top_project_name": project_names.get(top_pid) if top_pid else None,
            "top_project_amount": round(top_amt, 2),
            "po_count": len(rec["po_numbers"]),
        })

    rows.sort(key=lambda r: r["forecast_total"], reverse=True)
    return rows


def compute_portfolio_category_analysis(
    db: Session,
    user: CurrentUser,
    year: int | None = None,
    filters: dict | None = None,
) -> list[dict]:
    """Portfolio-level breakdown by external cost type."""
    project_ids = _get_scoped_project_ids(db, user, filters)
    if not project_ids:
        return []

    cost_type_names = _load_cost_type_names(db)

    fc_q = db.query(Forecast).filter(
        Forecast.project_id.in_(project_ids),
        Forecast.category == "external",
    )
    ac_q = db.query(Actuals).filter(
        Actuals.project_id.in_(project_ids),
        Actuals.category == "external",
    )

    if year is not None:
        from sqlalchemy import func as sa_func
        prefix = str(year)
        fc_q = fc_q.filter(sa_func.substr(Forecast.month, 1, 4) == prefix)
        ac_q = ac_q.filter(sa_func.substr(Actuals.month, 1, 4) == prefix)

    cat_map: dict[str, dict] = {}

    def _ensure(cost_type_id: str) -> dict:
        if cost_type_id not in cat_map:
            cat_map[cost_type_id] = {
                "cost_type_id": cost_type_id,
                "cost_type_name": cost_type_names.get(cost_type_id, cost_type_id),
                "forecast_total": 0.0,
                "actuals_total": 0.0,
                "projects": set(),
                "vendors": set(),
            }
        return cat_map[cost_type_id]

    for f in fc_q.all():
        rec = _ensure(f.sub_category or "")
        rec["forecast_total"] += float(f.amount_eur or 0)
        rec["projects"].add(f.project_id)
        if f.vendor:
            rec["vendors"].add(f.vendor)

    for a in ac_q.all():
        rec = _ensure(a.sub_category or "")
        rec["actuals_total"] += float(a.amount_eur or 0)
        rec["projects"].add(a.project_id)
        if a.vendor:
            rec["vendors"].add(a.vendor)

    grand_total = sum(rec["forecast_total"] for rec in cat_map.values()) or 1.0

    rows: list[dict] = []
    for rec in cat_map.values():
        rows.append({
            "cost_type_id": rec["cost_type_id"],
            "cost_type_name": rec["cost_type_name"],
            "forecast_total": round(rec["forecast_total"], 2),
            "actuals_total": round(rec["actuals_total"], 2),
            "project_count": len(rec["projects"]),
            "vendor_count": len(rec["vendors"]),
            "pct_of_external_total": round(
                (rec["forecast_total"] / grand_total) * 100, 1
            ),
        })

    rows.sort(key=lambda r: r["forecast_total"], reverse=True)
    return rows


def compute_project_vendor_matrix(
    db: Session,
    user: CurrentUser,
    year: int | None = None,
    filters: dict | None = None,
) -> dict:
    """Cross-tab grid: rows = projects, columns = vendors, cells = total spend."""
    project_ids = _get_scoped_project_ids(db, user, filters)
    if not project_ids:
        return {"projects": [], "vendors": [], "cells": [], "total": 0.0}

    project_names = {
        p.id: p.name
        for p in db.query(Project).filter(Project.id.in_(project_ids)).all()
    }

    fc_q = db.query(Forecast).filter(
        Forecast.project_id.in_(project_ids),
        Forecast.category == "external",
        Forecast.vendor.isnot(None),
        Forecast.vendor != "",
    )
    ac_q = db.query(Actuals).filter(
        Actuals.project_id.in_(project_ids),
        Actuals.category == "external",
        Actuals.vendor.isnot(None),
        Actuals.vendor != "",
    )

    if year is not None:
        from sqlalchemy import func as sa_func
        prefix = str(year)
        fc_q = fc_q.filter(sa_func.substr(Forecast.month, 1, 4) == prefix)
        ac_q = ac_q.filter(sa_func.substr(Actuals.month, 1, 4) == prefix)

    cell_map: dict[tuple[str, str], dict] = {}
    project_totals: dict[str, float] = {}
    vendor_totals: dict[str, float] = {}
    grand_total = 0.0

    for f in fc_q.all():
        key = (f.project_id, f.vendor)
        if key not in cell_map:
            cell_map[key] = {
                "project_id": f.project_id, "vendor_name": f.vendor,
                "forecast_total": 0.0, "actuals_total": 0.0,
            }
        amt = float(f.amount_eur or 0)
        cell_map[key]["forecast_total"] += amt
        project_totals[f.project_id] = project_totals.get(f.project_id, 0.0) + amt
        vendor_totals[f.vendor] = vendor_totals.get(f.vendor, 0.0) + amt
        grand_total += amt

    for a in ac_q.all():
        key = (a.project_id, a.vendor)
        if key not in cell_map:
            cell_map[key] = {
                "project_id": a.project_id, "vendor_name": a.vendor,
                "forecast_total": 0.0, "actuals_total": 0.0,
            }
        cell_map[key]["actuals_total"] += float(a.amount_eur or 0)

    cells = [
        {
            "project_id": rec["project_id"],
            "vendor_name": rec["vendor_name"],
            "forecast_total": round(rec["forecast_total"], 2),
            "actuals_total": round(rec["actuals_total"], 2),
        }
        for rec in cell_map.values()
    ]

    projects_out = [
        {
            "id": pid,
            "name": project_names.get(pid, pid),
            "row_total": round(project_totals.get(pid, 0.0), 2),
        }
        for pid in sorted(project_totals.keys(),
                          key=lambda p: project_totals.get(p, 0), reverse=True)
    ]
    vendors_out = [
        {"name": v, "col_total": round(vendor_totals.get(v, 0.0), 2)}
        for v in sorted(vendor_totals.keys(),
                        key=lambda v: vendor_totals.get(v, 0), reverse=True)
    ]

    return {
        "projects": projects_out,
        "vendors": vendors_out,
        "cells": cells,
        "total": round(grand_total, 2),
    }


# ---------------------------------------------------------------------------
# v5.1 C-09 — KPI block + monthly grid (lead pre-work pins shape; Teammate C
# fills the real aggregation in the same files).
# ---------------------------------------------------------------------------


def compute_project_external_kpis(
    db: Session,
    project_id: str,
    vendor_rows: list[dict],
    year: int | None = None,
) -> dict:
    """Six top-level KPIs derived from vendor rows + cheap scalar queries.

    Lead pre-work returns zero-filled values for `accruals`, `open_pos`, and
    `remaining_not_invoiced`. Teammate C swaps these for real sums once the
    seed top-up populates `forecast.po_amount`, `forecast.accrual_amount`,
    and `actuals.invoiced_amount`.
    """
    total_forecast = round(
        sum(r.get("forecast_total", 0.0) for r in vendor_rows), 2
    )
    actuals_ytd = round(
        sum(r.get("actuals_total", 0.0) for r in vendor_rows), 2
    )
    variance_vs_baseline = round(
        total_forecast - sum(r.get("baseline_total", 0.0) for r in vendor_rows),
        2,
    )

    # Placeholder — Teammate C wires these to the new columns.
    open_pos = 0.0
    remaining_not_invoiced = 0.0
    accruals = 0.0

    return {
        "total_forecast": total_forecast,
        "actuals_ytd": actuals_ytd,
        "open_pos": open_pos,
        "remaining_not_invoiced": remaining_not_invoiced,
        "accruals": accruals,
        "variance_vs_baseline": variance_vs_baseline,
    }


def compute_project_monthly_grid(
    db: Session,
    project_id: str,
    year: int | None = None,
    role_type_id: str | None = None,
    category: str | None = None,
) -> dict:
    """Monthly grid payload for the External Costs tab (v5.1 C-09).

    Lead pre-work stub — returns an empty payload with the response shape
    fixed. Teammate C implements the real aggregation:

      - Group external rows by (vendor, sub_category, po_number, role_type_id).
      - Per cell: assemble forecast/actuals/accrual/po_obligo (omit zero).
      - Per cell status: from Forecast.ext_status.
      - Per line status: latest non-null past-month status.
      - open_po: sum(forecast.po_amount) - sum(actuals.amount_eur)
        clamped at 0.
      - remaining_not_invoiced: open_po - sum(actuals.invoiced_amount)
        clamped at 0.
      - delivery_schedule / invoice_history loaded from
        ExternalCostDelivery / ExternalCostInvoice tables.

    `category` filters by `sub_category` (cost_type_id) when provided.
    `role_type_id` narrows to lines with the given role (mixed-role lines
    excluded, mirrors the C-07 vendor-summary semantics).
    """
    return {
        "items": [],
        "year_columns": [],
        "year": year,
        "project_id": project_id,
        "total": 0,
    }
