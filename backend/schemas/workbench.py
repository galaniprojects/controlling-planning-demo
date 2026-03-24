"""Pydantic schemas for Project Workbench endpoints (Section 10.4)."""
from __future__ import annotations
from pydantic import BaseModel


class ProjectListItem(BaseModel):
    id: str
    name: str
    rag: str | None
    type: str
    status: str
    is_service: bool


class ThreePointComparison(BaseModel):
    baseline: float
    forecast: float
    actuals: float
    plan_drift_pct: float
    execution_variance: float
    total_variance: float


class ProjectOverview(BaseModel):
    metadata: dict
    three_point_comparison: dict
    trajectory_chart: list[dict]
    capex_opex: dict
    resource_plan_summary: list[dict]


class ForecastGridRow(BaseModel):
    category: str
    sub_category: str
    sub_category_name: str
    months: list[dict]


class ForecastCycleStart(BaseModel):
    cycle_id: str
    phase: int
    retrospective_data: list[dict]
    skippable: bool


class AcknowledgeRequest(BaseModel):
    explanations: dict[str, str] = {}


class EditRequest(BaseModel):
    changes: list[dict] = []
    applied_suggestion_ids: list[int] = []


class SubmitRequest(BaseModel):
    groups: list[dict] = []
    cost_centre_groups: list[dict] | None = None


class CRHistoryItem(BaseModel):
    id: int
    project_id: str
    status: str
    change_category: str
    summary: str
    justification: str | None
    is_system_suggested: bool
    submitted_by: str
    submission_date: str
    changes: list[dict]
    impact_eur: float | None = None
