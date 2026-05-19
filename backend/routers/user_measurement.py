"""UserMeasurement matrix admin endpoints per [F-UM-01..05].

FD-1 legacy shim. The Charging/UM rework makes CRETA the system of record for
an authored UM matrix with a draft/active state machine
(``services/user_measurement_service``). This router keeps its existing paths
(``/api/admin/user-measurement/*``) and response shapes so the Administration
UM panel and `btc_service` keep working **untouched** through FD-1. The proper
relocation into the Charging & Allocations namespace, the in-grid/CSV
authoring UI, and the controller-review-before-activate flow are FD-2.

Shim debt (recorded in PROGRESS.md, removed in FD-2):
- ``POST /import`` creates a *draft* then **auto-activates** it in the same
  call. Spec §2 says CSV import does not auto-activate, but the legacy
  "import → immediately usable" contract (legacy tests + automatic BTC) must
  hold until FD-2 builds the review flow.
- ``/refresh-status`` still returns the SAP-stub payload; its language
  contradicts [F-DIR-01] (UM is authored, SAP is export-only). Reframed in
  FD-2, not here.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user, require_role
from models.charging import ChargingLocation, UMVersion, UserMeasurement
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
from services.user_measurement_import import parse_um_csv
from services.user_measurement_service import (
    activate_version,
    get_active_version,
)

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


def _version_stamp(v: UMVersion) -> str:
    """The version's representative timestamp for the legacy ``imported_at``.

    Active versions report their freeze timestamp; drafts (no ``activated_at``)
    fall back to ``created_at`` so the non-nullable response field is always a
    string (legacy schema contract).
    """
    ts = v.activated_at or v.created_at
    return ts.isoformat()


@router.get("/refresh-status", response_model=UserMeasurementRefreshStatusResponse)
def refresh_status(
    _user: CurrentUser = Depends(get_current_user),
):
    """Stub for [F-UM-02] "automatic refresh" (FD-2 reframes per [F-DIR-01])."""
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
    """List UM versions, optionally filtered by year/quarter.

    Read-visible to all CRETA users per [F-DIR-03]; authoring/import is
    controller-only.
    """
    counts = dict(
        db.query(UserMeasurement.version_id, func.count(UserMeasurement.id))
        .group_by(UserMeasurement.version_id)
        .all()
    )
    q = db.query(UMVersion)
    if year is not None:
        q = q.filter(UMVersion.year == year)
    if quarter is not None:
        q = q.filter(UMVersion.quarter == quarter)
    versions = q.order_by(
        UMVersion.year.desc(),
        UMVersion.quarter.desc(),
        UMVersion.activated_at.desc(),
        UMVersion.id.desc(),
    ).all()

    items = [
        UserMeasurementVersionResponse(
            year=v.year,
            quarter=v.quarter,
            imported_at=_version_stamp(v),
            source=v.source,
            row_count=counts.get(v.id, 0),
            imported_by_person_id=v.created_by_person_id,
        )
        for v in versions
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

    Returns the resolved active version by default. Pass ``imported_at`` (the
    stamp returned by ``/versions``) to address a specific version.
    Read-visible to all CRETA users per [F-DIR-03].
    """
    if imported_at:
        version = next(
            (
                v
                for v in db.query(UMVersion)
                .filter(UMVersion.year == year, UMVersion.quarter == quarter)
                .all()
                if _version_stamp(v) == imported_at
            ),
            None,
        )
    else:
        version = get_active_version(db, year, quarter)

    if version is None:
        return UserMeasurementListResponse(
            items=[], total=0, year=year, quarter=quarter, imported_at=None,
        )

    rows = (
        db.query(UserMeasurement)
        .filter(UserMeasurement.version_id == version.id)
        .join(
            ChargingLocation,
            ChargingLocation.id == UserMeasurement.charging_location_id,
            isouter=True,
        )
        .order_by(UserMeasurement.s_code, UserMeasurement.charging_location_id)
        .all()
    )
    stamp = _version_stamp(version)
    items = [
        UserMeasurementCellResponse(
            id=r.id,
            year=version.year,
            quarter=version.quarter,
            s_code=r.s_code,
            charging_location_id=r.charging_location_id,
            charging_location_code=(
                r.charging_location.code if r.charging_location else None
            ),
            value=float(r.value),
            source=version.source,
            imported_at=stamp,
        )
        for r in rows
    ]
    return UserMeasurementListResponse(
        items=items,
        total=len(items),
        year=version.year,
        quarter=version.quarter,
        imported_at=stamp,
    )


@router.post("/import", response_model=UserMeasurementImportResponse)
async def import_user_measurement(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Import a UM CSV per [F-UM-03]. FD-1 shim: creates a draft, then
    auto-activates it (legacy "import → usable" contract; FD-2 adds the
    controller-review-before-activate flow).

    Expected CSV header:
    ``year, quarter, s_code, charging_location_code, value[, source]``.
    """
    content = await file.read()
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(400, "CSV file must be UTF-8 encoded")

    try:
        parsed = parse_um_csv(db, text, default_source="csv_upload")
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    if not parsed.cells:
        # No rows landed; surface as 422 so the frontend can show parse errors.
        raise HTTPException(
            status_code=422,
            detail={
                "message": "No rows imported",
                "parse_errors": parsed.parse_errors,
                "skipped_zero_rows": parsed.skipped_zero_rows,
            },
        )

    version = UMVersion(
        year=parsed.year,
        quarter=parsed.quarter,
        status="draft",
        source="csv_upload",
        created_by_person_id=user.person_id,
    )
    db.add(version)
    db.flush()
    for cell in parsed.cells:
        db.add(
            UserMeasurement(
                version_id=version.id,
                s_code=cell.s_code,
                charging_location_id=cell.charging_location_id,
                value=cell.value,
            )
        )
        _audit(
            db,
            user,
            "user_measurement_cell",
            str(version.id),
            f"UM v{version.id} {version.year}-Q{version.quarter}",
            "create",
            f"{cell.s_code}:{cell.charging_location_id}",
            None,
            str(cell.value),
        )

    # FD-1 shim: auto-activate so the imported version is immediately usable.
    activate_version(db, version.id, actor_person_id=user.person_id)
    db.commit()
    db.refresh(version)

    return UserMeasurementImportResponse(
        year=version.year,
        quarter=version.quarter,
        imported_at=_version_stamp(version),
        source=version.source,
        row_count=len(parsed.cells),
        inserted=len(parsed.cells),
        skipped_zero_rows=parsed.skipped_zero_rows,
        parse_errors=parsed.parse_errors,
    )
