"""Pydantic schemas for Reporting module endpoints (Section 5)."""

from __future__ import annotations

from pydantic import BaseModel


# --- Report Library ---
class ReportListItem(BaseModel):
    id: str
    name: str
    description: str
    icon: str  # lucide icon name


# --- Saved Views ---
class SavedViewCreate(BaseModel):
    report_id: str
    name: str
    config: dict


class SavedViewUpdate(BaseModel):
    name: str | None = None
    config: dict | None = None


class SavedViewResponse(BaseModel):
    id: int
    report_id: str
    name: str
    config: dict
    created_at: str
    modified_at: str
