"""Audit log query and export endpoints — Cluster D Session D2.

Implements spec line ~1849:

1. GET ``/api/audit/log`` — categorised global audit log with filters and pagination.
2. GET ``/api/audit/log/entity/{entity_type}/{entity_id}`` — entity-scoped trail.
3. GET ``/api/audit/categories`` — reference list of the 8 categories.
4. GET ``/api/audit/export`` — CSV/XLSX export with the same filters as ``/log``.

The legacy ``/api/admin/audit-log`` endpoint stays in ``routers/admin.py`` for
back-compat. New surfaces live here so admin.py doesn't keep growing.

All endpoints require the ``controller`` role.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import get_db
from dependencies import require_role
from schemas.common import CurrentUser
from services.audit_export import export_csv, export_xlsx
from services.audit_query import list_categories, query_audit_log, query_entity_trail


router = APIRouter(prefix="/api/audit", tags=["Audit"])


def _parse_date(s: Optional[str], field: str) -> Optional[datetime]:
    if not s:
        return None
    try:
        # Accept ISO date or full datetime
        return datetime.fromisoformat(s)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid {field}: '{s}'. Expected ISO-8601 date or datetime.",
        ) from exc


def _build_filter_summary(
    categories: Optional[list[str]],
    entity_type: Optional[str],
    entity_id: Optional[str],
    user_person_id: Optional[str],
    start: Optional[str],
    end: Optional[str],
) -> str:
    parts: list[str] = []
    if categories:
        parts.append(f"categories={','.join(categories)}")
    if entity_type:
        parts.append(f"entity_type={entity_type}")
    if entity_id:
        parts.append(f"entity_id={entity_id}")
    if user_person_id:
        parts.append(f"user_person_id={user_person_id}")
    if start:
        parts.append(f"from={start}")
    if end:
        parts.append(f"to={end}")
    return "; ".join(parts)


# ---------------------------------------------------------------------------
# GET /api/audit/log — global filtered list
# ---------------------------------------------------------------------------

@router.get("/log")
def get_audit_log(
    category: Optional[list[str]] = Query(default=None, description="Filter by category. Repeat the param to OR multiple categories."),
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    user_person_id: Optional[str] = None,
    start_date: Optional[str] = Query(default=None, description="ISO-8601 (inclusive)"),
    end_date: Optional[str] = Query(default=None, description="ISO-8601 (inclusive)"),
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role("controller")),
):
    """Global audit log with category / entity / user / date filters.

    All filters AND-combine; ``category`` may be repeated to OR several
    categories. Pagination follows the standard ``limit`` + ``offset`` pattern.
    """
    if limit < 1 or limit > 1000:
        raise HTTPException(status_code=400, detail="limit must be in [1, 1000]")
    if offset < 0:
        raise HTTPException(status_code=400, detail="offset must be >= 0")

    start_dt = _parse_date(start_date, "start_date")
    end_dt = _parse_date(end_date, "end_date")

    try:
        items, total = query_audit_log(
            db,
            categories=category,
            entity_type=entity_type,
            entity_id=entity_id,
            user_person_id=user_person_id,
            start_date=start_dt,
            end_date=end_dt,
            limit=limit,
            offset=offset,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "items": [i.to_dict() for i in items],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


# ---------------------------------------------------------------------------
# GET /api/audit/log/entity/{entity_type}/{entity_id} — entity-scoped trail
# ---------------------------------------------------------------------------

@router.get("/log/entity/{entity_type}/{entity_id}")
def get_entity_audit_trail(
    entity_type: str,
    entity_id: str,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role("controller")),
):
    """Entity-scoped audit trail per spec line ~1851.

    Renders the same data as the global log but pre-scoped to a single
    entity, for inclusion at the bottom of an entity detail view.
    """
    if limit < 1 or limit > 1000:
        raise HTTPException(status_code=400, detail="limit must be in [1, 1000]")
    items, total = query_entity_trail(
        db, entity_type=entity_type, entity_id=entity_id, limit=limit, offset=offset
    )
    return {
        "items": [i.to_dict() for i in items],
        "total": total,
        "entity_type": entity_type,
        "entity_id": entity_id,
    }


# ---------------------------------------------------------------------------
# GET /api/audit/categories — reference list
# ---------------------------------------------------------------------------

@router.get("/categories")
def get_audit_categories(
    _user: CurrentUser = Depends(require_role("controller")),
):
    """Return the 8 supported audit categories with display labels."""
    items = list_categories()
    return {"items": items, "total": len(items)}


# ---------------------------------------------------------------------------
# GET /api/audit/export — CSV / XLSX export
# ---------------------------------------------------------------------------

@router.get("/export")
def export_audit_log(
    format: str = Query(default="csv", pattern="^(csv|xlsx)$"),
    category: Optional[list[str]] = Query(default=None),
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    user_person_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = Query(default=10000, ge=1, le=100000),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Export filtered audit rows as CSV (default) or XLSX.

    XLSX requires openpyxl at runtime; if unavailable the endpoint falls back
    to CSV with an ``X-Audit-Export-Fallback`` response header.
    """
    start_dt = _parse_date(start_date, "start_date")
    end_dt = _parse_date(end_date, "end_date")

    try:
        rows, total = query_audit_log(
            db,
            categories=category,
            entity_type=entity_type,
            entity_id=entity_id,
            user_person_id=user_person_id,
            start_date=start_dt,
            end_date=end_dt,
            limit=limit,
            offset=0,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    summary = _build_filter_summary(
        category, entity_type, entity_id, user_person_id, start_date, end_date
    )

    fallback = False
    if format == "xlsx":
        try:
            buf = export_xlsx(rows, exported_by=user.name, filter_summary=summary)
            media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            ext = "xlsx"
        except RuntimeError:
            # Document fallback per "Working assumptions" in PROGRESS.md.
            fallback = True
            buf = export_csv(rows, exported_by=user.name, filter_summary=summary)
            media_type = "text/csv"
            ext = "csv"
    else:
        buf = export_csv(rows, exported_by=user.name, filter_summary=summary)
        media_type = "text/csv"
        ext = "csv"

    filename = f"audit_log_{datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')}.{ext}"
    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "X-Audit-Export-Total": str(total),
    }
    if fallback:
        headers["X-Audit-Export-Fallback"] = "openpyxl-unavailable; served-as-csv"

    return StreamingResponse(buf, media_type=media_type, headers=headers)
