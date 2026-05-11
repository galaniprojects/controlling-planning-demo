"""UserMeasurement matrix admin endpoints per [F-UM-01..04].

Provides read access for the admin matrix viewer per [F-UM-04], CSV import
per [F-UM-02] (every import creates a new version per [F-UM-03]), and a
stubbed automatic-refresh status endpoint that returns 200 with a
"not_connected" payload (per the working assumption captured in PROGRESS.md
— a 501 would surface as a generic frontend network error, defeating the
explanatory-tooltip UX described in [F-UM-02]).
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user, require_role
from models.charging import ChargingLocation, UserMeasurement
from models.system import AuditLog
from schemas.common import CurrentUser
from schemas.user_measurement import (
    UserMeasurementCellResponse,
    UserMeasurementImportResponse,
    UserMeasurementListResponse,
    UserMeasurementRefreshStatusResponse,
    UserMeasurementVersionResponse,
    UserMeasurementVersionsResponse,
)
from services.user_measurement_import import import_csv

router = APIRouter(prefix="/api/admin/user-measurement", tags=["Administration: UserMeasurement"])


def _audit(
    db: Session,
    user: CurrentUser,
    entity_type: str,
    entity_id: str,
    entity_name: str | None,
    action: str,
    field_changed: str | None = None,
    old_value: str | None = None,
    new_value: str | None = None,
) -> None:
    db.add(
        AuditLog(
            user_person_id=user.person_id,
            entity_type=entity_type,
            entity_id=entity_id,
            entity_name=entity_name,
            action=action,
            field_changed=field_changed,
            old_value=old_value,
            new_value=new_value,
        )
    )


@router.get("/refresh-status", response_model=UserMeasurementRefreshStatusResponse)
def refresh_status(
    _user: CurrentUser = Depends(get_current_user),
):
    """Stub for [F-UM-02] "automatic refresh".

    Returns 200 with ``status="not_connected"`` so the frontend can render an
    explanatory tooltip. Production replaces this with a SAP-API integration.
    """
    return UserMeasurementRefreshStatusResponse(
        status="not_connected",
        message=(
            "Automatic refresh is not connected to a UM source in this prototype. "
            "Use 'Import CSV' to create a new version, or wait for the production "
            "SAP-API integration."
        ),
        last_attempt_at=None,
    )


@router.get("/versions", response_model=UserMeasurementVersionsResponse)
def list_versions(
    year: int | None = None,
    quarter: int | None = None,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """List all UM import versions, optionally filtered by year/quarter.

    Read-visible to all CRETA users per [F-UM-04]; the import endpoint below
    is admin-only.
    """
    q = db.query(
        UserMeasurement.year,
        UserMeasurement.quarter,
        UserMeasurement.imported_at,
        UserMeasurement.source,
        UserMeasurement.imported_by_person_id,
        func.count(UserMeasurement.id).label("row_count"),
    ).group_by(
        UserMeasurement.year,
        UserMeasurement.quarter,
        UserMeasurement.imported_at,
        UserMeasurement.source,
        UserMeasurement.imported_by_person_id,
    ).order_by(desc(UserMeasurement.year), desc(UserMeasurement.quarter), desc(UserMeasurement.imported_at))

    if year is not None:
        q = q.filter(UserMeasurement.year == year)
    if quarter is not None:
        q = q.filter(UserMeasurement.quarter == quarter)

    rows = q.all()
    items = [
        UserMeasurementVersionResponse(
            year=r.year,
            quarter=r.quarter,
            imported_at=r.imported_at.isoformat(),
            source=r.source,
            row_count=r.row_count,
            imported_by_person_id=r.imported_by_person_id,
        )
        for r in rows
    ]
    return UserMeasurementVersionsResponse(items=items, total=len(items))


@router.get("", response_model=UserMeasurementListResponse)
def list_user_measurement(
    year: int,
    quarter: int,
    imported_at: str | None = None,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """Return UM cells for a (year, quarter) version.

    Returns the latest version by default. Pass ``imported_at`` (ISO 8601
    timestamp matching the value returned by ``/versions``) to address a
    specific version. Read-visible to all CRETA users per [F-UM-04].
    """
    # imported_at lives in a SQLite TEXT column. SQLAlchemy's DateTime binding
    # appends ".000000" microseconds, which doesn't match seeded values that
    # were inserted without microseconds. Keep the equality comparison
    # server-side (subquery / strftime) so the format mismatch never bites.
    base_filter = (
        UserMeasurement.year == year,
        UserMeasurement.quarter == quarter,
    )

    if imported_at:
        try:
            ts = datetime.fromisoformat(imported_at)
        except ValueError:
            raise HTTPException(400, f"Invalid imported_at timestamp: {imported_at}")
        norm_ts = ts.strftime("%Y-%m-%d %H:%M:%S")
        time_filter = func.strftime(
            "%Y-%m-%d %H:%M:%S", UserMeasurement.imported_at,
        ) == norm_ts
        target_at_value = (
            db.query(UserMeasurement.imported_at)
            .filter(*base_filter)
            .filter(time_filter)
            .order_by(desc(UserMeasurement.imported_at))
            .limit(1)
            .scalar()
        )
    else:
        latest_subq = (
            db.query(func.max(UserMeasurement.imported_at))
            .filter(*base_filter)
            .scalar_subquery()
        )
        time_filter = UserMeasurement.imported_at == latest_subq
        target_at_value = (
            db.query(func.max(UserMeasurement.imported_at))
            .filter(*base_filter)
            .scalar()
        )

    if target_at_value is None:
        return UserMeasurementListResponse(
            items=[], total=0, year=year, quarter=quarter, imported_at=None,
        )

    rows = (
        db.query(UserMeasurement)
        .filter(*base_filter)
        .filter(time_filter)
        .join(ChargingLocation, ChargingLocation.id == UserMeasurement.charging_location_id, isouter=True)
        .order_by(UserMeasurement.s_code, UserMeasurement.charging_location_id)
        .all()
    )
    items = [
        UserMeasurementCellResponse(
            id=r.id,
            year=r.year,
            quarter=r.quarter,
            s_code=r.s_code,
            charging_location_id=r.charging_location_id,
            charging_location_code=r.charging_location.code if r.charging_location else None,
            value=float(r.value),
            source=r.source,
            imported_at=r.imported_at.isoformat(),
        )
        for r in rows
    ]
    target_at_iso = (
        target_at_value.isoformat()
        if hasattr(target_at_value, "isoformat")
        else str(target_at_value)
    )
    return UserMeasurementListResponse(
        items=items,
        total=len(items),
        year=year,
        quarter=quarter,
        imported_at=target_at_iso,
    )


@router.post("/import", response_model=UserMeasurementImportResponse)
async def import_user_measurement(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Import a UM CSV per [F-UM-02]. Always creates a new version per [F-UM-03].

    Expected CSV header: ``year, quarter, s_code, charging_location_code, value[, source]``.
    """
    content = await file.read()
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(400, "CSV file must be UTF-8 encoded")

    try:
        result = import_csv(
            db,
            text,
            default_source="csv_upload",
            imported_by_person_id=user.person_id,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    if result.inserted == 0:
        # No rows landed; surface as 422 so the frontend can show parse errors.
        raise HTTPException(
            status_code=422,
            detail={
                "message": "No rows imported",
                "parse_errors": result.parse_errors,
                "skipped_zero_rows": result.skipped_zero_rows,
            },
        )

    _audit(
        db,
        user,
        "user_measurement",
        f"{result.year}-Q{result.quarter}-{result.imported_at.isoformat()}",
        f"UM v{result.year}-Q{result.quarter}",
        "create",
        "row_count",
        None,
        str(result.row_count),
    )
    db.commit()

    return UserMeasurementImportResponse(
        year=result.year,
        quarter=result.quarter,
        imported_at=result.imported_at.isoformat(),
        source=result.source,
        row_count=result.row_count,
        inserted=result.inserted,
        skipped_zero_rows=result.skipped_zero_rows,
        parse_errors=result.parse_errors,
    )
