"""Report Builder API endpoints."""

from __future__ import annotations

import json

import config
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user
from schemas.common import CurrentUser
from schemas.report_builder import (
    FilterValuesResponse,
    ReportExecuteRequest,
    ReportExecuteResponse,
    SavedReportCreate,
    SavedReportDetail,
    SavedReportOut,
    SavedReportUpdate,
    SharedReportOut,
    ShareReportRequest,
)
from services.report_builder_catalog import get_catalog_response
from services.report_builder_engine import (
    _get_filter_values_for_dimension,
    _get_scoped_project_ids,
    execute_report,
)
from services.report_builder_saved import (
    create_saved_report,
    get_saved_report,
    list_saved_reports,
    list_shared_reports,
    share_report,
    soft_delete_saved_report,
    update_saved_report,
)
from services.report_builder_export import export_report_to_csv

router = APIRouter(prefix="/api/report-builder", tags=["Report Builder"])


@router.get("/catalog")
def get_catalog():
    """Return the full data catalog (dimensions and measures with metadata)."""
    return get_catalog_response()


@router.post("/execute", response_model=ReportExecuteResponse)
def execute(
    body: ReportExecuteRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Execute a report composition and return flat result rows."""
    return execute_report(
        db=db,
        user=user,
        rows=body.rows,
        columns=body.columns,
        filters=body.filters,
        values=body.values,
    )


@router.get("/filter-values/{dimension_id}", response_model=FilterValuesResponse)
def get_filter_values(
    dimension_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Return distinct values for a dimension, scoped to user's visible data."""
    scoped_pids = _get_scoped_project_ids(db, user)
    vals = _get_filter_values_for_dimension(db, dimension_id, scoped_pids)
    return FilterValuesResponse(dimension_id=dimension_id, values=vals)


# ---------------------------------------------------------------------------
# Saved Reports CRUD
# ---------------------------------------------------------------------------

def _report_to_out(r) -> dict:
    """Convert a SavedReport ORM instance to an output dict."""
    return {
        "id": r.id,
        "name": r.name,
        "description": r.description,
        "created_by": r.created_by,
        "is_published": r.is_published,
        "created_at": r.created_at.isoformat() if r.created_at else "",
        "modified_at": r.modified_at.isoformat() if r.modified_at else "",
    }


def _report_to_detail(r) -> dict:
    """Convert a SavedReport ORM instance to a detail dict (with definition)."""
    out = _report_to_out(r)
    out["definition"] = json.loads(r.definition) if isinstance(r.definition, str) else r.definition
    return out


@router.get("/saved")
def list_saved(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """List current user's saved custom reports."""
    reports = list_saved_reports(db, user.user_id)
    return {"items": [_report_to_out(r) for r in reports], "total": len(reports)}


@router.post("/saved", response_model=SavedReportDetail)
def create_saved(
    body: SavedReportCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Save a new custom report definition."""
    report = create_saved_report(
        db, user.user_id, body.name, body.definition, body.description
    )
    return _report_to_detail(report)


@router.get("/saved/{report_id}", response_model=SavedReportDetail)
def get_saved(
    report_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Get a saved report by ID (own or shared)."""
    report = get_saved_report(db, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return _report_to_detail(report)


@router.put("/saved/{report_id}", response_model=SavedReportDetail)
def update_saved(
    report_id: int,
    body: SavedReportUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Update an existing saved report."""
    report = get_saved_report(db, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report.created_by != user.user_id:
        raise HTTPException(status_code=403, detail="Not the owner of this report")
    report = update_saved_report(db, report, body.name, body.description, body.definition)
    return _report_to_detail(report)


@router.delete("/saved/{report_id}")
def delete_saved(
    report_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Soft-delete a saved report."""
    report = get_saved_report(db, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report.created_by != user.user_id:
        raise HTTPException(status_code=403, detail="Not the owner of this report")
    soft_delete_saved_report(db, report)
    return {"ok": True}


@router.post("/saved/{report_id}/share")
def share_saved(
    report_id: int,
    body: ShareReportRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Share a report with other users/roles and/or publish to Report Library."""
    report = get_saved_report(db, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report.created_by != user.user_id:
        raise HTTPException(status_code=403, detail="Not the owner of this report")
    share_report(
        db, report,
        [{"shared_with": s.shared_with, "permission": s.permission} for s in body.shares],
        body.is_published,
    )
    return {"ok": True}


@router.get("/shared")
def list_shared(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """List reports shared with or published for the current user."""
    results = list_shared_reports(db, user.user_id)
    items = []
    for entry in results:
        r = entry["report"]
        items.append({
            "id": r.id,
            "name": r.name,
            "description": r.description,
            "created_by": r.created_by,
            "is_published": r.is_published,
            "permission": entry["permission"],
            "shared_at": entry["shared_at"],
            "created_at": r.created_at.isoformat() if r.created_at else "",
            "modified_at": r.modified_at.isoformat() if r.modified_at else "",
        })
    return {"items": items, "total": len(items)}


# ---------------------------------------------------------------------------
# Excel Export
# ---------------------------------------------------------------------------

@router.post("/export")
def export_unsaved(
    body: dict,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Export the current (unsaved) report composition to CSV."""
    buf = export_report_to_csv(db, user, body, report_name="Custom Report")
    filename = f"{config.BRANDING['csv_export_prefix']}_ReportBuilder_Custom_{__import__('datetime').date.today().isoformat()}.csv"
    return StreamingResponse(
        buf,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export/{report_id}")
def export_saved(
    report_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Export a saved report to CSV."""
    report = get_saved_report(db, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    definition = json.loads(report.definition) if isinstance(report.definition, str) else report.definition
    buf = export_report_to_csv(db, user, definition, report_name=report.name)
    safe_name = report.name.replace(" ", "_").replace("/", "-")
    filename = f"{config.BRANDING['csv_export_prefix']}_ReportBuilder_{safe_name}_{__import__('datetime').date.today().isoformat()}.csv"
    return StreamingResponse(
        buf,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
