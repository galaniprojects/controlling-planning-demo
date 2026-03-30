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
