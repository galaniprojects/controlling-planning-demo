"""User Measurement authoring endpoints in the Charging namespace per FD-2.

The Charging/UM rework (spec §1–§2) relocates UM out of Administration into
Charging & Allocations. This router replaces the legacy
``/api/admin/user-measurement/*`` shim (``routers/user_measurement.py``, which
is deleted in FD-2 commit 7) with the authoring API the new in-grid editor and
CSV bulk-entry surfaces consume:

- ``GET  /info`` — reframes the legacy ``/refresh-status`` payload per
  [F-DIR-01] (CRETA is the system of record; SAP is export-only).
- ``GET  /versions[?year=&quarter=&status=]`` — list version headers + cell counts.
- ``GET  /versions/{id}`` — header + dense cells (the matrix shape).
- ``POST /versions`` — three-origin draft creation per [F-UM-03]
  (``blank`` / ``copy_active`` / ``copy_prior``).
- ``POST /versions/from-csv`` — CSV bulk-entry that **creates a draft**.
  This is the closure point of the FD-1 shim that auto-activated CSV imports.
- ``PATCH /versions/{id}/cells`` — row/column paste; bulk cell mutation with
  per-cell audit. 409 if the version is active.
- ``POST /versions/{id}/activate`` — freeze the draft into an immutable
  active version per [F-UM-02].
- ``DELETE /versions/{id}`` — drafts only; 409 on active per [F-UM-02].
- ``GET  /allocation-keys`` — distinct values used by the FD-6 admin
  autocomplete and the dashboard triple-display per [F-AK-01].

Permission model per [F-DIR-03]: reads = all roles; writes = controller-only.

The state machine, validation, cell mutation, audit, and activation all live in
``services/user_measurement_service.py`` (FD-1 territory — not modified by
FD-2). This router commits transactions after each successful mutation so the
service's "I append; the caller commits" contract holds. ``UMValidationError``
maps to HTTP 409 (the established shape from ``BTCValidationError``).
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user, require_role
from models.charging import ChargingLocation, UMVersion, UserMeasurement
from schemas.common import CurrentUser
from schemas.user_measurement import (
    UMAllocationKeysResponse,
    UMCellMutationResult,
    UMCellResponse,
    UMCellsBulkSetRequest,
    UMCellsBulkSetResponse,
    UMCsvImportPreview,
    UMCsvImportResponse,
    UMInfoResponse,
    UMVersionCreateRequest,
    UMVersionDetailResponse,
    UMVersionsListResponse,
    UMVersionSummary,
)
from services.user_measurement_service import (
    UMValidationError,
    activate_version,
    bulk_set_cells,
    copy_from_version,
    create_draft,
    create_draft_from_csv,
    get_active_version,
    get_version,
    list_allocation_keys,
    list_cells,
    list_versions,
)

router = APIRouter(
    prefix="/api/charging/user-measurement",
    tags=["Charging: UserMeasurement"],
)


# ---------------------------------------------------------------------------
# Serialisation helpers
# ---------------------------------------------------------------------------

def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt is not None else None


def _summary(v: UMVersion, cell_count: int) -> UMVersionSummary:
    return UMVersionSummary(
        id=v.id,
        year=v.year,
        quarter=v.quarter,
        status=v.status,
        source=v.source,
        activated_at=_iso(v.activated_at),
        created_at=_iso(v.created_at) or "",
        created_by_person_id=v.created_by_person_id,
        copied_from_version_id=v.copied_from_version_id,
        cell_count=cell_count,
    )


def _count_cells(db: Session, version_id: int) -> int:
    return (
        db.query(func.count(UserMeasurement.id))
        .filter(UserMeasurement.version_id == version_id)
        .scalar()
        or 0
    )


# ---------------------------------------------------------------------------
# /info — reframes the legacy SAP-stub copy per [F-DIR-01]
# ---------------------------------------------------------------------------

@router.get("/info", response_model=UMInfoResponse)
def info(_user: CurrentUser = Depends(get_current_user)) -> UMInfoResponse:
    """Module info: CRETA is the system of record; SAP is export-only.

    Read-visible to all roles per [F-DIR-03]. ``sap_export_available`` stays
    ``False`` here — FD-4 flips it once the SAP export endpoint ships.
    """
    return UMInfoResponse(
        system_of_record="creta",
        authoring_modes=["in_grid", "csv_bulk_entry"],
        sap_export_available=False,
    )


# ---------------------------------------------------------------------------
# /versions — list headers
# ---------------------------------------------------------------------------

@router.get("/versions", response_model=UMVersionsListResponse)
def list_versions_endpoint(
    year: int | None = None,
    quarter: int | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
) -> UMVersionsListResponse:
    """List UM versions. Read-visible to all roles per [F-DIR-03]."""
    versions = list_versions(db, year=year, quarter=quarter, status=status)
    if not versions:
        return UMVersionsListResponse(items=[], total=0)
    # One COUNT query covering all returned versions.
    counts = dict(
        db.query(UserMeasurement.version_id, func.count(UserMeasurement.id))
        .filter(UserMeasurement.version_id.in_([v.id for v in versions]))
        .group_by(UserMeasurement.version_id)
        .all()
    )
    items = [_summary(v, counts.get(v.id, 0)) for v in versions]
    return UMVersionsListResponse(items=items, total=len(items))


# ---------------------------------------------------------------------------
# /versions/{id} — header + dense cells
# ---------------------------------------------------------------------------

@router.get("/versions/{version_id}", response_model=UMVersionDetailResponse)
def get_version_endpoint(
    version_id: int,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
) -> UMVersionDetailResponse:
    """Header + cells for one version. Read-visible to all roles."""
    try:
        v = get_version(db, version_id)
    except UMValidationError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    cells = list_cells(db, version_id)
    cl_code_by_id = {
        cl.id: cl.code for cl in db.query(ChargingLocation).all()
    }
    cell_items = [
        UMCellResponse(
            s_code=c.s_code,
            charging_location_id=c.charging_location_id,
            charging_location_code=cl_code_by_id.get(c.charging_location_id),
            value=int(c.value),
        )
        for c in cells
    ]
    return UMVersionDetailResponse(
        version=_summary(v, len(cell_items)),
        cells=cell_items,
    )


# ---------------------------------------------------------------------------
# /versions — POST (three-origin draft creation per [F-UM-03])
# ---------------------------------------------------------------------------

@router.post("/versions", response_model=UMVersionDetailResponse, status_code=201)
def create_version(
    body: UMVersionCreateRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
) -> UMVersionDetailResponse:
    """Create a new draft version per [F-UM-03]."""
    try:
        if body.origin == "blank":
            if body.year is None or body.quarter is None:
                raise UMValidationError(
                    "year and quarter are required for a blank draft",
                )
            v = create_draft(
                db,
                year=body.year,
                quarter=body.quarter,
                source="manual",
                created_by_person_id=user.person_id,
            )
        elif body.origin == "copy_active":
            if body.year is None or body.quarter is None:
                raise UMValidationError(
                    "year and quarter are required for copy_active",
                )
            active = get_active_version(db, body.year, body.quarter)
            if active is None:
                raise UMValidationError(
                    f"No active UM version to copy for "
                    f"{body.year}-Q{body.quarter}",
                )
            v = copy_from_version(
                db,
                source_version_id=active.id,
                created_by_person_id=user.person_id,
            )
        elif body.origin == "copy_prior":
            if body.source_version_id is None:
                raise UMValidationError(
                    "source_version_id is required for copy_prior",
                )
            v = copy_from_version(
                db,
                source_version_id=body.source_version_id,
                created_by_person_id=user.person_id,
            )
        else:  # pragma: no cover — Pydantic Literal already filters this
            raise UMValidationError(f"invalid origin '{body.origin}'")
        db.commit()
        db.refresh(v)
    except UMValidationError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(exc))

    cells = list_cells(db, v.id)
    cl_code_by_id = {
        cl.id: cl.code for cl in db.query(ChargingLocation).all()
    }
    cell_items = [
        UMCellResponse(
            s_code=c.s_code,
            charging_location_id=c.charging_location_id,
            charging_location_code=cl_code_by_id.get(c.charging_location_id),
            value=int(c.value),
        )
        for c in cells
    ]
    return UMVersionDetailResponse(
        version=_summary(v, len(cell_items)),
        cells=cell_items,
    )


# ---------------------------------------------------------------------------
# /versions/from-csv — CSV bulk-entry that creates a DRAFT (no auto-activate)
# ---------------------------------------------------------------------------

@router.post("/versions/from-csv", response_model=UMCsvImportResponse, status_code=201)
async def create_version_from_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
) -> UMCsvImportResponse:
    """Parse a CSV into a new **draft** version per [F-UM-03].

    Closes the FD-1 shim that auto-activated CSV imports. The controller
    reviews the parse_errors/skipped_zero_rows preview, then activates the
    draft via ``POST /versions/{id}/activate``.

    Header: ``year,quarter,s_code,charging_location_code,value[,source]``.
    """
    content = await file.read()
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="CSV file must be UTF-8 encoded")

    try:
        version, parsed = create_draft_from_csv(
            db, text, created_by_person_id=user.person_id,
        )
        db.commit()
        db.refresh(version)
    except UMValidationError as exc:
        db.rollback()
        # Per the legacy shim's contract: surface as 422 so the frontend can
        # render parse errors in the preview dialog.
        raise HTTPException(status_code=422, detail=str(exc))
    except ValueError as exc:
        # parse_um_csv raises ValueError for header-level failures (missing
        # column, empty CSV) — those are 400.
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))

    return UMCsvImportResponse(
        version=_summary(version, len(parsed.cells)),
        preview=UMCsvImportPreview(
            inserted=len(parsed.cells),
            skipped_zero_rows=parsed.skipped_zero_rows,
            parse_errors=parsed.parse_errors,
        ),
    )


# ---------------------------------------------------------------------------
# /versions/{id}/cells — bulk PATCH (row/column paste)
# ---------------------------------------------------------------------------

@router.patch("/versions/{version_id}/cells", response_model=UMCellsBulkSetResponse)
def bulk_patch_cells(
    version_id: int,
    body: UMCellsBulkSetRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
) -> UMCellsBulkSetResponse:
    """Bulk cell mutation per [F-UM-05]. 409 if the version is active."""
    try:
        muts = bulk_set_cells(
            db,
            version_id=version_id,
            cells=[c.model_dump() for c in body.cells],
            actor_person_id=user.person_id,
        )
        db.commit()
    except UMValidationError as exc:
        db.rollback()
        # The service raises for "not found" and "active immutable" + bad
        # values. Map "not found" to 404; everything else 409.
        msg = str(exc)
        if "not found" in msg:
            raise HTTPException(status_code=404, detail=msg)
        raise HTTPException(status_code=409, detail=msg)

    results = [
        UMCellMutationResult(
            s_code=m.s_code,
            charging_location_id=m.charging_location_id,
            action=m.action,
            old_value=m.old_value,
            new_value=m.new_value,
        )
        for m in muts
    ]
    return UMCellsBulkSetResponse(mutations=results, total=len(results))


# ---------------------------------------------------------------------------
# /versions/{id}/activate
# ---------------------------------------------------------------------------

@router.post("/versions/{version_id}/activate", response_model=UMVersionDetailResponse)
def activate_endpoint(
    version_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
) -> UMVersionDetailResponse:
    """Freeze a draft into an immutable active version per [F-UM-02]."""
    try:
        v = activate_version(db, version_id, actor_person_id=user.person_id)
        db.commit()
        db.refresh(v)
    except UMValidationError as exc:
        db.rollback()
        msg = str(exc)
        if "not found" in msg:
            raise HTTPException(status_code=404, detail=msg)
        raise HTTPException(status_code=409, detail=msg)

    cells = list_cells(db, v.id)
    cl_code_by_id = {
        cl.id: cl.code for cl in db.query(ChargingLocation).all()
    }
    cell_items = [
        UMCellResponse(
            s_code=c.s_code,
            charging_location_id=c.charging_location_id,
            charging_location_code=cl_code_by_id.get(c.charging_location_id),
            value=int(c.value),
        )
        for c in cells
    ]
    return UMVersionDetailResponse(
        version=_summary(v, len(cell_items)),
        cells=cell_items,
    )


# ---------------------------------------------------------------------------
# /versions/{id} — DELETE (drafts only)
# ---------------------------------------------------------------------------

@router.delete("/versions/{version_id}", status_code=200)
def delete_version(
    version_id: int,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role("controller")),
) -> dict:
    """Delete a draft version and its cells. 409 on active per [F-UM-02]."""
    try:
        v = get_version(db, version_id)
    except UMValidationError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    if v.status == "active":
        raise HTTPException(
            status_code=409,
            detail=(
                f"UM version {version_id} is 'active' and cannot be deleted — "
                f"historical versions remain intact for SAP-export reproducibility."
            ),
        )
    db.delete(v)
    db.commit()
    return {"id": version_id, "deleted": True}


# ---------------------------------------------------------------------------
# /allocation-keys — distinct catalogue values per [F-AK-01]
# ---------------------------------------------------------------------------

@router.get("/allocation-keys", response_model=UMAllocationKeysResponse)
def allocation_keys(
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
) -> UMAllocationKeysResponse:
    """Distinct non-empty allocation keys across the catalogue per [F-AK-01]."""
    items = list_allocation_keys(db)
    return UMAllocationKeysResponse(items=items, total=len(items))
