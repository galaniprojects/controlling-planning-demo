"""Pydantic schemas for Portfolio Overview endpoints (Section 10.3)."""

from __future__ import annotations

from pydantic import BaseModel


# --- Dashboard ---
class PortfolioKPIs(BaseModel):
    total_budget: float
    ytd_spend: float
    forecast_at_completion: float
    overall_variance_pct: float
    capex_opex_split: dict
    run_change_ratio: str


class TimelineInfo(BaseModel):
    start: str | None
    end: str | None
    projected_end: str | None


class ProjectTreeNode(BaseModel):
    id: str
    name: str
    type: str  # lob, program, project, service
    status: str | None
    rag: str | None
    baseline_budget: float
    current_forecast: float
    actuals_ytd: float
    variance_pct: float
    timeline: TimelineInfo | None
    children: list["ProjectTreeNode"] = []


class BudgetSnapshot(BaseModel):
    baseline: float
    forecast: float
    actuals_ytd: float
    plan_drift_pct: float


class ProjectSummary(BaseModel):
    id: str
    name: str
    rag: str | None
    budget_snapshot: BudgetSnapshot
    timeline: TimelineInfo | None
    last_cr_summary: str | None
    forecast_sparkline: list[dict]


# --- Intake Queue ---
class IntakeItem(BaseModel):
    project_id: str
    name: str
    submitted_by: str | None
    lob: str
    estimated_budget: float | None
    submission_date: str | None
    status: str


class IntakeDetail(BaseModel):
    project_id: str
    name: str
    description: str | None
    lob_id: str
    lob_name: str
    start_month: str
    end_month: str | None
    estimated_budget: float | None
    capex_opex: str
    status: str


class ApprovalAction(BaseModel):
    comments: str | None = None


class RejectAction(BaseModel):
    reason: str


class SendBackAction(BaseModel):
    comments: str


# --- Approvals ---
class ApprovalItem(BaseModel):
    cr_id: int
    project_id: str
    project_name: str
    summary: str
    submitted_by: str
    confirmed_by_cc_owner: str | None
    impact_eur_delta: float | None
    submission_date: str
    system_suggested: bool


class CRChangeDetailResponse(BaseModel):
    field_changed: str
    old_value: str | None
    new_value: str | None
    delta: str | None
    line_item_type: str | None
    month: str | None


class DetailViewMonthValue(BaseModel):
    month: str
    proposed: float
    proposed_eur: float
    current: float | None = None
    current_eur: float | None = None
    is_changed: bool = False


class DetailViewLineItemSchema(BaseModel):
    id: str
    name: str
    category: str  # internal | external
    unit: str  # hours | eur
    months: list[DetailViewMonthValue]
    proposed_total: float
    proposed_total_eur: float
    current_total: float | None = None
    current_total_eur: float | None = None


class DetailViewKPISchema(BaseModel):
    label: str
    value: float
    format: str  # currency | currency_delta
    color: str | None = None
    secondary_label: str | None = None


class DetailViewGridData(BaseModel):
    months: list[str]
    line_items: list[DetailViewLineItemSchema]
    kpis: list[DetailViewKPISchema]


class CRDetailResponse(BaseModel):
    id: int
    project_id: str
    project_name: str
    status: str
    change_category: str
    summary: str
    justification: str | None
    is_system_suggested: bool
    submitted_by: str
    submission_date: str
    cc_owner: str | None
    cc_status: str | None
    cc_comments: str | None
    controller: str | None
    controller_status: str | None
    controller_comments: str | None
    changes: list[CRChangeDetailResponse]
    grid_data: DetailViewGridData | None = None
