"""Report Builder API endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user
from schemas.common import CurrentUser
from schemas.report_builder import (
    FilterValuesResponse,
    ReportExecuteRequest,
    ReportExecuteResponse,
)
from services.report_builder_catalog import get_catalog_response
from services.report_builder_engine import (
    _get_filter_values_for_dimension,
    _get_scoped_project_ids,
    execute_report,
)

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
