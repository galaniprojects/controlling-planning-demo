"""Pydantic schemas for the Report Builder API."""

from __future__ import annotations

from pydantic import BaseModel


class ReportExecuteRequest(BaseModel):
    rows: list[str] = []
    columns: list[str] = []
    filters: dict[str, list[str]] = {}
    values: list[str] = []


class ColumnMeta(BaseModel):
    id: str
    name: str
    type: str  # "dimension" | "measure"
    format: str | None = None  # "currency" | "percent" | "number" | "hours"


class ReportExecuteResponse(BaseModel):
    columns: list[ColumnMeta]
    rows: list[dict]
    total_rows: int
    warnings: list[str] = []


class FilterValuesResponse(BaseModel):
    dimension_id: str
    values: list[str]


# --- Saved Reports ---


class SavedReportCreate(BaseModel):
    name: str
    description: str | None = None
    definition: dict  # full report state as JSON object


class SavedReportUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    definition: dict | None = None


class SavedReportOut(BaseModel):
    id: int
    name: str
    description: str | None = None
    created_by: str
    is_published: bool
    created_at: str
    modified_at: str

    model_config = {"from_attributes": True}


class SavedReportDetail(SavedReportOut):
    definition: dict


class ShareEntry(BaseModel):
    shared_with: str  # user or role ID
    permission: str = "view_only"  # view_only | can_edit


class ShareReportRequest(BaseModel):
    shares: list[ShareEntry] = []
    is_published: bool = False


class SharedReportOut(BaseModel):
    id: int
    name: str
    description: str | None = None
    created_by: str
    is_published: bool
    permission: str | None = None  # null for published-only reports
    shared_at: str | None = None
    created_at: str
    modified_at: str
