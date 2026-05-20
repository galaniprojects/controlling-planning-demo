"""Pydantic schemas for the UserMeasurement endpoints.

FD-2 reframes UM around the authored draft/active state machine (see
``routers/user_measurement_charging.py``):

- ``UMInfoResponse`` replaces the legacy ``/refresh-status`` payload — the
  language is now "CRETA is the system of record; authoring modes are in-grid
  and CSV bulk-entry" per [F-DIR-01] / [F-UM-03].
- ``UMVersionDetailResponse`` carries the header + dense cells the in-grid
  editor consumes.
- ``UMVersionCreateRequest`` carries the three create origins per [F-UM-03]
  (mirrors ``DistributionVersionCreatePayload``).
- ``UMCellsBulkSetRequest`` drives the row/column paste path.

The original legacy response shapes (``UserMeasurementCellResponse`` etc.)
are retained for the admin shim until FD-2 deletes it, then they go too.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# FD-2 authored-version schemas (charging-namespaced router)
# ---------------------------------------------------------------------------

class UMVersionSummary(BaseModel):
    """One row of the UM versions list — header without cells."""

    id: int
    year: int
    quarter: int
    status: str  # 'draft' | 'active'
    source: str  # 'manual' | 'csv_upload' | 'copy' | 'seed'
    activated_at: Optional[str]  # ISO; null when draft
    created_at: str  # ISO
    created_by_person_id: Optional[str]
    copied_from_version_id: Optional[int]
    cell_count: int


class UMVersionsListResponse(BaseModel):
    items: list[UMVersionSummary]
    total: int


class UMCellResponse(BaseModel):
    """One cell of a UM version — integer value per [F-UM-01]."""

    s_code: str
    charging_location_id: str
    charging_location_code: Optional[str]
    value: int


class UMVersionDetailResponse(BaseModel):
    """Header + dense cells for one version — feeds the matrix editor/viewer."""

    version: UMVersionSummary
    cells: list[UMCellResponse]


UMVersionCreateOrigin = Literal["blank", "copy_active", "copy_prior"]


class UMVersionCreateRequest(BaseModel):
    """Three-origin draft creation per [F-UM-03].

    - ``blank`` — empty draft for (year, quarter). ``year``/``quarter`` required.
    - ``copy_active`` — pre-fill from the currently active version for
      (year, quarter). Requires ``year``/``quarter``; rejects 409 if no active.
    - ``copy_prior`` — pre-fill from ``source_version_id`` (any version, same
      ``year``/``quarter`` of the source).
    """

    origin: UMVersionCreateOrigin
    year: Optional[int] = None
    quarter: Optional[int] = Field(None, ge=1, le=4)
    source_version_id: Optional[int] = None


class UMCellPatch(BaseModel):
    """One cell mutation in a bulk patch. ``value == 0`` deletes the cell."""

    s_code: str
    charging_location_id: str
    value: int


class UMCellsBulkSetRequest(BaseModel):
    """Row/column paste — one transactional bulk patch per [F-UM-05]."""

    cells: list[UMCellPatch]


class UMCellMutationResult(BaseModel):
    """Per-cell outcome for a bulk patch — feeds the editor's optimistic UI."""

    s_code: str
    charging_location_id: str
    action: str  # 'create' | 'update' | 'deactivate'
    old_value: Optional[int]
    new_value: Optional[int]


class UMCellsBulkSetResponse(BaseModel):
    mutations: list[UMCellMutationResult]
    total: int


class UMCsvImportPreview(BaseModel):
    """Surfaces per-row diagnostics from the CSV parser — both halves of FD-2's
    "review, then activate" promise are visible to the controller without
    activating the draft.
    """

    inserted: int
    skipped_zero_rows: int
    parse_errors: list[str] = Field(default_factory=list)


class UMCsvImportResponse(BaseModel):
    """Returned by ``POST /versions/from-csv`` — creates a draft only."""

    version: UMVersionSummary
    preview: UMCsvImportPreview


class UMInfoResponse(BaseModel):
    """Reframes the legacy ``/refresh-status`` payload per [F-DIR-01].

    CRETA is the system of record; authoring is in-grid + CSV bulk-entry.
    There is no SAP-derived UM ingestion. ``sap_export_available`` is plumbed
    here so the frontend can hint at FD-4's SAP export when it lands.
    """

    system_of_record: str  # "creta"
    authoring_modes: list[str]  # ["in_grid", "csv_bulk_entry"]
    sap_export_available: bool


class UMAllocationKeysResponse(BaseModel):
    """Distinct allocation keys (feeds the FD-6 admin panel autocomplete)."""

    items: list[str]
    total: int


# ---------------------------------------------------------------------------
# Legacy admin-shim schemas — deleted with the router in FD-2 commit 7.
# Kept here only so the shim's imports resolve until then.
# ---------------------------------------------------------------------------

class UserMeasurementCellResponse(BaseModel):
    """A single (year, quarter, s_code, charging_location) cell."""

    id: int
    year: int
    quarter: int
    s_code: str
    charging_location_id: str
    charging_location_code: Optional[str]
    value: float
    source: str
    imported_at: str


class UserMeasurementVersionResponse(BaseModel):
    """Metadata for one UM import batch (a "version" per [F-UM-03])."""

    year: int
    quarter: int
    imported_at: str
    source: str
    row_count: int
    imported_by_person_id: Optional[str]


class UserMeasurementListResponse(BaseModel):
    """Standard response shape for the read endpoint."""

    items: list[UserMeasurementCellResponse]
    total: int
    year: int
    quarter: int
    imported_at: Optional[str]


class UserMeasurementVersionsResponse(BaseModel):
    items: list[UserMeasurementVersionResponse]
    total: int


class UserMeasurementImportResponse(BaseModel):
    """Returned by the CSV upload endpoint per [F-UM-02]."""

    year: int
    quarter: int
    imported_at: str
    source: str
    row_count: int
    inserted: int
    skipped_zero_rows: int
    parse_errors: list[str] = Field(default_factory=list)


class UserMeasurementRefreshStatusResponse(BaseModel):
    """Returned by the stub automatic-refresh status endpoint per [F-UM-02].

    Working assumption: returns 200 with ``status=not_connected`` so the
    frontend can render a tooltip-style explanatory dialog rather than a
    generic network error. Production replaces this with a SAP-API integration.
    """

    status: str  # not_connected, ok, error
    message: str
    last_attempt_at: Optional[str] = None
