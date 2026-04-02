"""Reporting module endpoints (Section 5) — 12 endpoints."""

from __future__ import annotations

import json
from datetime import date

import config as app_config
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user
from models.reporting import SavedView
from schemas.common import CurrentUser
from schemas.reports import SavedViewCreate, SavedViewUpdate
from services.report_service import (
    compute_cc_financial_summary,
    compute_forecast_accuracy,
    compute_programme_rollup,
    compute_vendor_drilldown,
    compute_vendor_spend,
    compute_year_over_year,
    generate_csv_export,
)

router = APIRouter(prefix="/api/reports", tags=["Reporting"])


# ---------------------------------------------------------------------------
# Standard report definitions
# ---------------------------------------------------------------------------

STANDARD_REPORTS = [
    {
        "id": "programme-rollup",
        "name": "Programme / Multi-Project Rollup",
        "description": "Consolidated financial view across multiple related projects.",
        "icon": "BarChart3",
    },
    {
        "id": "cc-financial-summary",
        "name": "Cost Center Financial Summary",
        "description": "Total financial picture for a cost center across all projects.",
        "icon": "Building2",
    },
    {
        "id": "vendor-spend",
        "name": "Vendor Spend Analysis",
        "description": "Analyse external spending by vendor across the portfolio.",
        "icon": "Truck",
    },
    {
        "id": "forecast-accuracy",
        "name": "Forecast Accuracy",
        "description": "Retrospective analysis of forecast accuracy vs actuals.",
        "icon": "Target",
    },
    {
        "id": "year-over-year",
        "name": "Year-over-Year Comparison",
        "description": "Compare portfolio spending trajectory between fiscal years.",
        "icon": "CalendarRange",
    },
]


# ---------------------------------------------------------------------------
# Report list
# ---------------------------------------------------------------------------

@router.get("")
def list_reports(
    _user: CurrentUser = Depends(get_current_user),
):
    """List available standard reports."""
    return {"items": STANDARD_REPORTS, "total": len(STANDARD_REPORTS)}


# ---------------------------------------------------------------------------
# Programme / Multi-Project Rollup
# ---------------------------------------------------------------------------

@router.get("/programme-rollup")
def get_programme_rollup(
    lob: str | None = None,
    status: str | None = None,
    rag: str | None = None,
    type: str | None = None,
    grouping: str = "lob",
    fiscal_year: int | None = None,
    project_ids: str | None = None,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Programme / Multi-Project Rollup report."""
    filters: dict = {}
    if lob:
        filters["lob"] = lob
    if status:
        filters["status"] = status
    if rag:
        filters["rag"] = rag
    if type:
        filters["type"] = type
    # RPT-03: custom project group
    if project_ids:
        filters["project_ids"] = [pid.strip() for pid in project_ids.split(",") if pid.strip()]

    return compute_programme_rollup(db, user, filters, grouping, fiscal_year=fiscal_year)


# ---------------------------------------------------------------------------
# Cost Center Financial Summary
# ---------------------------------------------------------------------------

@router.get("/cc-financial-summary")
def get_cc_financial_summary(
    cost_center: str | None = None,
    type: str | None = None,
    fiscal_year: int | None = None,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Cost Center Financial Summary report."""
    filters: dict = {}
    if cost_center:
        filters["cost_center"] = cost_center
    if type:
        filters["type"] = type

    return compute_cc_financial_summary(db, user, filters, fiscal_year=fiscal_year)


# ---------------------------------------------------------------------------
# Vendor Spend Analysis
# ---------------------------------------------------------------------------

@router.get("/vendor-spend")
def get_vendor_spend(
    vendor: str | None = None,
    lob: str | None = None,
    status: str | None = None,
    fiscal_year: int | None = None,
    expense_cost_type: str | None = None,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Vendor Spend Analysis report."""
    filters: dict = {}
    if vendor:
        filters["vendor"] = vendor
    if lob:
        filters["lob"] = lob
    if status:
        filters["status"] = status
    if expense_cost_type:
        filters["expense_cost_type"] = expense_cost_type

    return compute_vendor_spend(db, user, filters, fiscal_year=fiscal_year)


@router.get("/vendor-spend/{vendor_name}/details")
def get_vendor_details(
    vendor_name: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Drill-down into a specific vendor's line items."""
    items = compute_vendor_drilldown(db, user, vendor_name)
    return {"items": items, "total": len(items)}


# ---------------------------------------------------------------------------
# Forecast Accuracy
# ---------------------------------------------------------------------------

@router.get("/forecast-accuracy")
def get_forecast_accuracy(
    horizon: int = 6,
    lob: str | None = None,
    type: str | None = None,
    fiscal_year: int | None = None,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Forecast Accuracy report with configurable horizon."""
    filters: dict = {}
    if lob:
        filters["lob"] = lob
    if type:
        filters["type"] = type

    return compute_forecast_accuracy(db, user, filters, horizon, fiscal_year=fiscal_year)


# ---------------------------------------------------------------------------
# Year-over-Year Comparison
# ---------------------------------------------------------------------------

@router.get("/year-over-year")
def get_year_over_year(
    fy_current: int = 2026,
    fy_previous: int = 2025,
    lob: str | None = None,
    cost_type: str | None = None,
    show_monthly: bool = False,
    months: str | None = None,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Year-over-Year Comparison report."""
    filters: dict = {}
    if lob:
        filters["lob"] = lob
    if cost_type:
        filters["cost_type"] = cost_type

    months_filter = None
    if months:
        months_filter = [int(m) for m in months.split(",") if m.strip().isdigit()]

    return compute_year_over_year(
        db, user, filters, fy_current, fy_previous,
        show_monthly=show_monthly, months_filter=months_filter,
    )


# ---------------------------------------------------------------------------
# Saved Views CRUD
# ---------------------------------------------------------------------------

@router.get("/saved-views")
def list_saved_views(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """List user's saved views."""
    views = (
        db.query(SavedView)
        .filter(SavedView.user_id == user.user_id)
        .order_by(SavedView.modified_at.desc())
        .all()
    )
    items = [
        {
            "id": v.id,
            "report_id": v.report_id,
            "name": v.name,
            "config": json.loads(v.config_json),
            "created_at": v.created_at.isoformat() if v.created_at else "",
            "modified_at": v.modified_at.isoformat() if v.modified_at else "",
        }
        for v in views
    ]
    return {"items": items, "total": len(items)}


@router.post("/saved-views")
def create_saved_view(
    body: SavedViewCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Create a new saved view."""
    view = SavedView(
        user_id=user.user_id,
        report_id=body.report_id,
        name=body.name,
        config_json=json.dumps(body.config),
    )
    db.add(view)
    db.commit()
    db.refresh(view)
    return {
        "id": view.id,
        "report_id": view.report_id,
        "name": view.name,
        "config": json.loads(view.config_json),
        "created_at": view.created_at.isoformat() if view.created_at else "",
        "modified_at": view.modified_at.isoformat() if view.modified_at else "",
    }


@router.put("/saved-views/{view_id}")
def update_saved_view(
    view_id: int,
    body: SavedViewUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Update a saved view."""
    view = db.query(SavedView).filter(SavedView.id == view_id, SavedView.user_id == user.user_id).first()
    if not view:
        raise HTTPException(404, "Saved view not found")

    if body.name is not None:
        view.name = body.name
    if body.config is not None:
        view.config_json = json.dumps(body.config)

    db.commit()
    db.refresh(view)
    return {
        "id": view.id,
        "report_id": view.report_id,
        "name": view.name,
        "config": json.loads(view.config_json),
        "created_at": view.created_at.isoformat() if view.created_at else "",
        "modified_at": view.modified_at.isoformat() if view.modified_at else "",
    }


@router.delete("/saved-views/{view_id}")
def delete_saved_view(
    view_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Delete a saved view."""
    view = db.query(SavedView).filter(SavedView.id == view_id, SavedView.user_id == user.user_id).first()
    if not view:
        raise HTTPException(404, "Saved view not found")

    db.delete(view)
    db.commit()
    return {"status": "deleted"}


# ---------------------------------------------------------------------------
# RPT-03: Custom Project Groups
# ---------------------------------------------------------------------------

@router.get("/custom-groups")
def list_custom_groups(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """List user's saved custom project groups (stored as saved views with report_id='custom-group')."""
    groups = (
        db.query(SavedView)
        .filter(SavedView.user_id == user.user_id, SavedView.report_id == "custom-group")
        .order_by(SavedView.modified_at.desc())
        .all()
    )
    return {
        "items": [
            {"id": g.id, "name": g.name, "project_ids": json.loads(g.config_json).get("project_ids", [])}
            for g in groups
        ],
        "total": len(groups),
    }


@router.post("/custom-groups")
def create_custom_group(
    body: SavedViewCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Save a custom project group."""
    view = SavedView(
        user_id=user.user_id,
        report_id="custom-group",
        name=body.name,
        config_json=json.dumps(body.config),
    )
    db.add(view)
    db.commit()
    db.refresh(view)
    return {"id": view.id, "name": view.name, "project_ids": body.config.get("project_ids", [])}


@router.delete("/custom-groups/{group_id}")
def delete_custom_group(
    group_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Delete a custom project group."""
    view = db.query(SavedView).filter(SavedView.id == group_id, SavedView.user_id == user.user_id).first()
    if not view:
        raise HTTPException(404, "Group not found")
    db.delete(view)
    db.commit()
    return {"status": "deleted"}


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

REPORT_EXPORT_CONFIG = {
    "programme-rollup": {
        "name": "Programme Rollup",
        "headers": ["Project", "LoB", "Status", "RAG", "Baseline", "Forecast", "Actuals", "Remaining", "Variance", "Variance %"],
        "row_keys": ["project_name", "lob_name", "status", "rag", "baseline_budget", "current_forecast", "actuals_to_date", "remaining_forecast", "variance", "variance_pct"],
    },
    "cc-financial-summary": {
        "name": "CC Financial Summary",
        "headers": ["Project", "Internal Hours", "Internal Cost", "External Cost", "Total Cost", "% of Budget", "Status"],
        "row_keys": ["project_name", "internal_hours", "internal_cost", "external_cost", "total_cost", "pct_of_cc_budget", "status"],
    },
    "vendor-spend": {
        "name": "Vendor Spend",
        "headers": ["Vendor", "Expense Cost Type", "Ordered", "Invoiced", "Open", "Accruals", "Projects", "POs"],
        "row_keys": ["vendor_name", "expense_cost_type", "total_ordered", "total_invoiced", "total_open", "total_accruals", "project_count", "po_count"],
    },
    "forecast-accuracy": {
        "name": "Forecast Accuracy",
        "headers": ["Project", "LoB", "Forecast", "Actual", "Variance", "Variance %", "Rating"],
        "row_keys": ["project_name", "lob_name", "forecast_value", "actual_value", "variance", "variance_pct", "accuracy_rating"],
    },
    "year-over-year": {
        "name": "Year-over-Year",
        "headers": ["Month", "FY Current", "FY Previous", "Delta", "Delta %", "Cumulative Current", "Cumulative Previous"],
        "row_keys": ["month", "fy_current", "fy_previous", "delta", "delta_pct", "cumulative_current", "cumulative_previous"],
    },
}


@router.get("/{report_id}/export")
def export_report(
    report_id: str,
    lob: str | None = None,
    status: str | None = None,
    rag: str | None = None,
    type: str | None = None,
    cost_center: str | None = None,
    vendor: str | None = None,
    horizon: int = 6,
    fy_current: int = 2026,
    fy_previous: int = 2025,
    cost_type: str | None = None,
    fiscal_year: int | None = None,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Export report data as Excel file."""
    config = REPORT_EXPORT_CONFIG.get(report_id)
    if not config:
        raise HTTPException(404, f"Unknown report: {report_id}")

    # Dynamic top-level entity label for export headers
    from services.portfolio_service import get_top_level_entity_type_id
    from models.organization import GroupingEntityType
    top_type_id = get_top_level_entity_type_id(db)
    top_label = "LoB"
    if top_type_id:
        et = db.query(GroupingEntityType).get(top_type_id)
        if et:
            top_label = et.name
    config = dict(config)  # shallow copy to avoid mutating the constant
    config["headers"] = [top_label if h == "LoB" else h for h in config["headers"]]

    filters: dict = {}
    if lob:
        filters["lob"] = lob
    if status:
        filters["status"] = status
    if rag:
        filters["rag"] = rag
    if type:
        filters["type"] = type
    if cost_center:
        filters["cost_center"] = cost_center
    if vendor:
        filters["vendor"] = vendor
    if cost_type:
        filters["cost_type"] = cost_type

    # Fetch data
    if report_id == "programme-rollup":
        data = compute_programme_rollup(db, user, filters, fiscal_year=fiscal_year)
    elif report_id == "cc-financial-summary":
        data = compute_cc_financial_summary(db, user, filters, fiscal_year=fiscal_year)
    elif report_id == "vendor-spend":
        data = compute_vendor_spend(db, user, filters, fiscal_year=fiscal_year)
    elif report_id == "forecast-accuracy":
        data = compute_forecast_accuracy(db, user, filters, horizon, fiscal_year=fiscal_year)
    elif report_id == "year-over-year":
        data = compute_year_over_year(db, user, filters, fy_current, fy_previous)
    else:
        raise HTTPException(404, f"Unknown report: {report_id}")

    # Build Excel rows
    data_rows = []
    for row in data.get("rows", []):
        data_rows.append([row.get(k, "") for k in config["row_keys"]])

    # Summary row
    summary = None
    if report_id == "programme-rollup" and data.get("kpis"):
        kpis = data["kpis"]
        summary = [
            "TOTAL", "", "", "",
            kpis.get("total_baseline", 0),
            kpis.get("total_forecast", 0),
            "", "",
            kpis.get("overall_variance", 0),
            kpis.get("overall_variance_pct", 0),
        ]

    buf = generate_csv_export(
        report_name=config["name"],
        headers=config["headers"],
        data_rows=data_rows,
        summary_row=summary,
        active_filters=filters,
    )

    filename = f"{app_config.BRANDING['csv_export_prefix']}_{config['name'].replace(' ', '_')}_{date.today().isoformat()}.csv"

    return StreamingResponse(
        buf,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
