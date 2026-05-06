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

from models.financial import (
    Actuals, Baseline, ExternalCostDelivery, ExternalCostInvoice,
    ExternalCostType, Forecast,
)
from models.people import RoleType
from models.projects import Project
from schemas.common import CurrentUser
from services.report_service import _get_scoped_project_ids


# v5.1 C-09: demo "today" used to derive line-level latest-status semantics.
# Sourced from the planning_parameter row when present so the value stays
# consistent with the rest of the codebase, with a hard fallback to the
# documented April 2026 demo date so unit tests that don't seed the
# parameter table still pass.
DEMO_DATE_FALLBACK = "2026-04"


def _demo_date(db: Session) -> str:
    """Resolve the canonical demo "today" month (YYYY-MM)."""
    try:
        from models.system import PlanningParameter
        row = db.query(PlanningParameter).filter(
            PlanningParameter.key == "demo_current_month"
        ).first()
        if row and row.current_value:
            return str(row.current_value)[:7]
    except Exception:
        pass
    return DEMO_DATE_FALLBACK


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
                # v5.1 C-09 — column populations
                "po_amount_total": 0.0,
                "actuals_against_po": 0.0,
                "invoiced_against_po": 0.0,
                "contract_end_max": None,  # YYYY-MM string, max across line PO rows
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
        # v5.1 C-09 column population
        if f.po_amount:
            rec["po_amount_total"] += float(f.po_amount or 0)
        if f.contract_end_month:
            cur_max = rec["contract_end_max"]
            if cur_max is None or f.contract_end_month > cur_max:
                rec["contract_end_max"] = f.contract_end_month

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
        # v5.1 C-09 — sum actuals against any PO (the spec assumes PO-tracked
        # actuals share the line's PO number; in the demo seed an actuals
        # row only carries po_number when the underlying forecast did).
        if a.po_number:
            rec["actuals_against_po"] += float(a.amount_eur or 0)
            rec["invoiced_against_po"] += float(a.invoiced_amount or 0)

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

        # v5.1 C-09 — derived per-vendor column values:
        #   open_po = sum(forecast.po_amount) - sum(actuals.amount_eur tied
        #     to a PO), clamped at 0.
        #   remaining_not_invoiced = open_po - sum(actuals.invoiced_amount
        #     tied to a PO), clamped at 0.
        #   contract_reference = lexicographically smallest PO# (or None)
        #   contract_end = max contract_end_month (YYYY-MM string compare).
        open_po = max(0.0, rec["po_amount_total"] - rec["actuals_against_po"])
        remaining_ni = max(0.0, open_po - rec["invoiced_against_po"])
        po_numbers_sorted = sorted(rec["po_numbers"])
        contract_reference = po_numbers_sorted[0] if po_numbers_sorted else None

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
            # v5.1 C-09 — vendor-table column additions
            "contract_reference": contract_reference,
            "contract_end": rec["contract_end_max"],
            "open_po": round(open_po, 2),
            "remaining_not_invoiced": round(remaining_ni, 2),
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
    """Six top-level KPIs derived from vendor rows + scalar column sums.

    The first three (total_forecast, actuals_ytd, variance_vs_baseline) come
    from the already-aggregated vendor rows; the new three (accruals,
    open_pos, remaining_not_invoiced) are scalar SQL sums against the
    Forecast / Actuals tables so the formula is independent of vendor
    grouping.

    All sums respect the optional `year` filter.
    """
    from sqlalchemy import func as sa_func

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

    # Scalar sums for the v5.1 C-09 columns.
    fc_q = db.query(
        sa_func.coalesce(sa_func.sum(Forecast.accrual_amount), 0.0),
        sa_func.coalesce(sa_func.sum(Forecast.po_amount), 0.0),
    ).filter(
        Forecast.project_id == project_id,
        Forecast.category == "external",
    )
    if year is not None:
        fc_q = fc_q.filter(sa_func.substr(Forecast.month, 1, 4) == str(year))
    accruals_sum, po_sum = fc_q.one()

    ac_q = db.query(
        sa_func.coalesce(sa_func.sum(Actuals.amount_eur), 0.0),
        sa_func.coalesce(sa_func.sum(Actuals.invoiced_amount), 0.0),
    ).filter(
        Actuals.project_id == project_id,
        Actuals.category == "external",
        Actuals.po_number.isnot(None),
    )
    if year is not None:
        ac_q = ac_q.filter(sa_func.substr(Actuals.month, 1, 4) == str(year))
    actuals_against_po, invoiced_sum = ac_q.one()

    open_pos = max(0.0, float(po_sum) - float(actuals_against_po))
    remaining_not_invoiced = max(0.0, open_pos - float(invoiced_sum))

    return {
        "total_forecast": total_forecast,
        "actuals_ytd": actuals_ytd,
        "open_pos": round(open_pos, 2),
        "remaining_not_invoiced": round(remaining_not_invoiced, 2),
        "accruals": round(float(accruals_sum), 2),
        "variance_vs_baseline": variance_vs_baseline,
    }


# ---------------------------------------------------------------------------
# Monthly-grid helpers
# ---------------------------------------------------------------------------


def _line_id(vendor: str, sub_category: str, po_number: str | None,
             role_type_id: str | None) -> str:
    """Stable per-group identifier matching the schema docstring."""
    po_part = po_number or "no-po"
    role_part = role_type_id or "no-role"
    return f"{vendor}|{sub_category}|{po_part}|{role_part}"


def _assemble_cell(month: str, fc_amount: float, ac_amount: float,
                   accrual_amount: float, po_obligo: float,
                   status: str | None) -> dict:
    """Build one MonthlyGridCell dict, omitting zero/None entries.

    `month` is always present so the frontend can index by month.
    Other keys are emitted only when they carry signal.
    """
    cell: dict = {"month": month}
    if fc_amount:
        cell["forecast"] = round(fc_amount, 2)
    if ac_amount:
        cell["actuals"] = round(ac_amount, 2)
    if accrual_amount:
        cell["accrual"] = round(accrual_amount, 2)
    if po_obligo:
        cell["po_obligo"] = round(po_obligo, 2)
    if status:
        cell["status"] = status
    return cell


def compute_project_monthly_grid(
    db: Session,
    project_id: str,
    year: int | None = None,
    role_type_id: str | None = None,
    category: str | None = None,
) -> dict:
    """Monthly grid payload for the External Costs tab (v5.1 C-09).

    Group key: ``(vendor, sub_category, po_number, role_type_id)``.

    Per cell, assemble ``forecast`` / ``actuals`` / ``accrual`` / ``po_obligo``
    (zero/null values are omitted from the cell dict so the frontend can skip
    rendering that line in the stack).

    Line-level metadata:
      - ``status``: latest non-null cell status at ``min(today, max(month))``
        — DEMO_DATE-aware so the demo's "current" month behaves consistently.
      - ``open_po``: ``sum(po_amount) - sum(actuals.amount_eur)`` (PO-tagged
        actuals only), clamped at 0.
      - ``remaining_not_invoiced``: ``open_po - sum(actuals.invoiced_amount)``
        (PO-tagged actuals only), clamped at 0.
      - ``contract_end_month``: max ``Forecast.contract_end_month`` across the
        line's monthly rows (lexicographic compare on YYYY-MM strings).

    Filters:
      - ``year`` restricts cells to that fiscal year (4-char prefix on month).
      - ``category`` narrows to one ``sub_category`` (cost_type_id).
      - ``role_type_id`` excludes lines whose ``role_type_id`` group key
        differs (a single line cannot have mixed roles by construction since
        ``role_type_id`` is part of the group key, so the filter is
        equality-based at the line level).

    Row-expansion content (``delivery_schedule`` / ``invoice_history``) is
    inlined from the ``external_cost_deliveries`` / ``external_cost_invoices``
    tables, keyed by ``(project_id, vendor, po_number)``.

    Returns a dict matching ``MonthlyGridResponse``.
    """
    from sqlalchemy import func as sa_func

    today = _demo_date(db)

    # ---- Forecast / Actuals queries with optional filters -----------------
    fc_q = db.query(Forecast).filter(
        Forecast.project_id == project_id,
        Forecast.category == "external",
        Forecast.vendor.isnot(None),
        Forecast.vendor != "",
    )
    ac_q = db.query(Actuals).filter(
        Actuals.project_id == project_id,
        Actuals.category == "external",
        Actuals.vendor.isnot(None),
        Actuals.vendor != "",
    )

    if year is not None:
        prefix = str(year)
        fc_q = fc_q.filter(sa_func.substr(Forecast.month, 1, 4) == prefix)
        ac_q = ac_q.filter(sa_func.substr(Actuals.month, 1, 4) == prefix)

    if category is not None:
        fc_q = fc_q.filter(Forecast.sub_category == category)
        ac_q = ac_q.filter(Actuals.sub_category == category)

    forecast_rows = fc_q.all()
    actuals_rows = ac_q.all()

    cost_type_names = _load_cost_type_names(db)
    role_names = _load_role_names(db)

    # ---- Group by (vendor, sub_category, po_number, role_type_id) ---------
    lines: dict[tuple, dict] = {}

    def _ensure(vendor: str, sub_cat: str, po: str | None,
                role: str | None) -> dict:
        key = (vendor, sub_cat, po, role)
        if key not in lines:
            lines[key] = {
                "key": key,
                "vendor": vendor,
                "sub_category": sub_cat,
                "po_number": po,
                "role_type_id": role,
                # cell_map[month] = {forecast, actuals, accrual, po_obligo, status}
                "cell_map": {},
                "po_amount_total": 0.0,
                "actuals_against_po": 0.0,
                "invoiced_against_po": 0.0,
                "contract_end_max": None,
                # months tracked separately so we can derive the latest
                # past-month status without re-reading cell_map twice.
                "months_with_status": {},  # month -> status
            }
        return lines[key]

    def _ensure_cell(line: dict, month: str) -> dict:
        cm = line["cell_map"]
        if month not in cm:
            cm[month] = {
                "forecast": 0.0, "actuals": 0.0,
                "accrual": 0.0, "po_obligo": 0.0,
                "status": None,
            }
        return cm[month]

    for f in forecast_rows:
        line = _ensure(f.vendor, f.sub_category or "", f.po_number,
                       f.role_type_id)
        cell = _ensure_cell(line, f.month)
        amt = float(f.amount_eur or 0)
        cell["forecast"] += amt
        if f.po_amount:
            cell["po_obligo"] += float(f.po_amount or 0)
            line["po_amount_total"] += float(f.po_amount or 0)
        if f.accrual_amount:
            cell["accrual"] += float(f.accrual_amount or 0)
        if f.ext_status and not cell["status"]:
            cell["status"] = f.ext_status
            line["months_with_status"][f.month] = f.ext_status
        if f.contract_end_month:
            cur = line["contract_end_max"]
            if cur is None or f.contract_end_month > cur:
                line["contract_end_max"] = f.contract_end_month

    for a in actuals_rows:
        # Match to a forecast line by (vendor, sub_category, po_number, role).
        # Fall back to (vendor, sub_category, None, role) when no PO is set
        # — keeps actuals visible even when the forecast hasn't been keyed
        # to a PO yet.
        key_with_po = (a.vendor, a.sub_category or "", a.po_number,
                       a.role_type_id)
        if a.po_number and key_with_po in lines:
            line = lines[key_with_po]
        else:
            line = _ensure(a.vendor, a.sub_category or "", a.po_number,
                           a.role_type_id)
        cell = _ensure_cell(line, a.month)
        amt = float(a.amount_eur or 0)
        cell["actuals"] += amt
        if a.po_number:
            line["actuals_against_po"] += amt
            line["invoiced_against_po"] += float(a.invoiced_amount or 0)
        # Actuals also carry an ext_status — overlay onto the cell only if
        # the forecast didn't supply one (rare in the seed but defensive).
        if a.ext_status and not cell["status"]:
            cell["status"] = a.ext_status
            if a.month not in line["months_with_status"]:
                line["months_with_status"][a.month] = a.ext_status

    # ---- Apply line-level role filter -------------------------------------
    if role_type_id is not None:
        lines = {
            k: v for k, v in lines.items()
            if v["role_type_id"] == role_type_id
        }

    # ---- Pre-load delivery / invoice rows once ----------------------------
    deliveries_by_key: dict[tuple, list] = {}
    invoices_by_key: dict[tuple, list] = {}
    if lines:
        po_keys = {
            (line["vendor"], line["po_number"])
            for line in lines.values() if line["po_number"]
        }
        if po_keys:
            d_rows = db.query(ExternalCostDelivery).filter(
                ExternalCostDelivery.project_id == project_id,
            ).all()
            for d in d_rows:
                if (d.vendor, d.po_number) in po_keys:
                    deliveries_by_key.setdefault(
                        (d.vendor, d.po_number), []
                    ).append({
                        "milestone_name": d.milestone_name,
                        "expected_month": d.expected_month,
                        "expected_amount": float(d.expected_amount or 0),
                        "delivered_month": d.delivered_month,
                    })
            i_rows = db.query(ExternalCostInvoice).filter(
                ExternalCostInvoice.project_id == project_id,
            ).all()
            for i in i_rows:
                if (i.vendor, i.po_number) in po_keys:
                    invoices_by_key.setdefault(
                        (i.vendor, i.po_number), []
                    ).append({
                        "invoice_number": i.invoice_number,
                        "invoice_date": i.invoice_date.isoformat()
                            if i.invoice_date else "",
                        "amount": float(i.amount or 0),
                        "status": i.status,
                    })

    # ---- Build ordered items + year_columns -------------------------------
    all_months: set[str] = set()
    items: list[dict] = []

    for line in lines.values():
        cells_out: list[dict] = []
        for month in sorted(line["cell_map"].keys()):
            c = line["cell_map"][month]
            cells_out.append(_assemble_cell(
                month, c["forecast"], c["actuals"],
                c["accrual"], c["po_obligo"], c["status"],
            ))
            all_months.add(month)

        # Line-level latest status: latest non-null status at min(today, max(month))
        if line["months_with_status"]:
            month_max_data = max(line["months_with_status"].keys())
            cap_month = min(today, month_max_data)
            past_status_months = sorted(
                m for m in line["months_with_status"].keys() if m <= cap_month
            )
            if past_status_months:
                line_status = line["months_with_status"][past_status_months[-1]]
            else:
                # All status-bearing months are in the future — fall back to
                # the earliest known status so the badge isn't empty.
                line_status = line["months_with_status"][
                    min(line["months_with_status"].keys())
                ]
        else:
            line_status = None

        open_po = max(
            0.0, line["po_amount_total"] - line["actuals_against_po"]
        )
        remaining_ni = max(
            0.0, open_po - line["invoiced_against_po"]
        )

        sub_cat = line["sub_category"]
        items.append({
            "line_id": _line_id(line["vendor"], sub_cat, line["po_number"],
                                line["role_type_id"]),
            "vendor": line["vendor"],
            "role_type_id": line["role_type_id"],
            "role_name": role_names.get(line["role_type_id"])
                if line["role_type_id"] else None,
            "sub_category": sub_cat,
            "sub_category_name": cost_type_names.get(sub_cat, sub_cat),
            "po_number": line["po_number"],
            "contract_end_month": line["contract_end_max"],
            "status": line_status,
            "open_po": round(open_po, 2),
            "remaining_not_invoiced": round(remaining_ni, 2),
            "monthly_cells": cells_out,
            "delivery_schedule": deliveries_by_key.get(
                (line["vendor"], line["po_number"]), []
            ) if line["po_number"] else [],
            "invoice_history": invoices_by_key.get(
                (line["vendor"], line["po_number"]), []
            ) if line["po_number"] else [],
        })

    # Stable ordering: vendor, sub_category, po_number, role
    items.sort(key=lambda r: (
        r["vendor"], r["sub_category"], r["po_number"] or "",
        r["role_type_id"] or "",
    ))

    return {
        "items": items,
        "year_columns": sorted(all_months),
        "year": year,
        "project_id": project_id,
        "total": len(items),
    }
