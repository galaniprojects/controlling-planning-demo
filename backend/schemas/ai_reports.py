"""Pydantic schemas for AI Report Builder endpoints."""

from __future__ import annotations

from pydantic import BaseModel


class ConversationStartRequest(BaseModel):
    initial_message: str


class ConversationMessageRequest(BaseModel):
    message: str


class ColumnDef(BaseModel):
    key: str
    label: str
    type: str  # text, currency, percent, number, date


class TableSpec(BaseModel):
    columns: list[ColumnDef]
    rows: list[dict]
    sort_by: str | None = None
    sort_dir: str | None = None  # asc | desc


class ChartSpec(BaseModel):
    type: str  # bar, line, pie, donut
    title: str
    data: list[dict]
    data_key: str
    category_key: str
    secondary_data_key: str | None = None


class KPIItem(BaseModel):
    label: str
    value: float | int | str
    format: str  # currency, number, percent, text


class ReportSpec(BaseModel):
    title: str
    kpis: list[KPIItem] = []
    table: TableSpec | None = None
    charts: list[ChartSpec] = []


class ConversationReply(BaseModel):
    conversation_id: str
    text: str
    report: ReportSpec | None = None


class AIBuilderStatusResponse(BaseModel):
    available: bool
    message: str | None = None
