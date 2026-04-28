"""Pydantic schemas for the UserMeasurement admin endpoints."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


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
