"""Pydantic schemas for Project Workbench endpoints (Section 10.4)."""
from __future__ import annotations
from datetime import datetime
from typing import Any, Optional
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


# ---------------------------------------------------------------------------
# C1 — Mixed-Granularity Grid + Versioning schemas [C-FG-01..08, C-FV-01..07]
# ---------------------------------------------------------------------------

class GridCell(BaseModel):
    """One cell in the mixed-granularity grid — either monthly or quarterly."""
    key: str               # YYYY-MM or YYYY-QN
    cell_type: str         # 'monthly' | 'quarterly'
    hours: float
    amount_eur: float
    is_provisional: bool   # True for outer-zone cells [C-FG-07]


class GridRow(BaseModel):
    """One line item row (category × sub_category) in the mixed grid."""
    category: str
    sub_category: str
    capex_opex: Optional[str] = None
    cells: list[GridCell]
    row_total: float


class MixedGridResponse(BaseModel):
    """Response shape for GET /api/projects/{id}/forecast/grid [C-FG-02]."""
    project_id: str
    granularity: str              # 'mixed' | 'monthly' | 'quarterly'
    boundary_month: str           # last month rendered monthly (YYYY-MM)
    horizon_end_month: str        # last month in grid (YYYY-MM)
    granularity_boundary_months: int
    planning_horizon_months: int
    columns: list[dict]           # [{key, label, cell_type}]
    rows: list[GridRow]
    totals_by_column: dict[str, float]
    grand_total: float


class ForecastVersionMeta(BaseModel):
    """Lightweight version summary for list endpoints [C-RH-01]."""
    id: int
    project_id: str
    version_number: int
    version_type: str             # 'cycle' | 'cr_approval' | 'manual'
    cycle_label: Optional[str] = None
    cycle_id: Optional[str] = None
    change_request_id: Optional[int] = None
    created_at: datetime
    created_by_id: str
    created_by_name: Optional[str] = None
    granularity_boundary_months: int
    planning_horizon_months: int
    cell_count: Optional[int] = None
    total_amount_eur: Optional[float] = None


class ForecastVersionListResponse(BaseModel):
    """Paginated list of forecast versions [C-RH-01]."""
    items: list[ForecastVersionMeta]
    total: int


class ForecastVersionDetail(BaseModel):
    """Version detail including the full JSON payload [C-RH-02]."""
    meta: ForecastVersionMeta
    payload: Optional[dict] = None  # decoded payload_json


class CellDelta(BaseModel):
    """One changed cell in a version diff [C-RH-05]."""
    category: str
    sub_category: str
    cell_key: str                 # YYYY-MM or YYYY-QN
    version_a_amount: Optional[float] = None
    version_b_amount: Optional[float] = None
    delta: Optional[float] = None
    status: str                   # 'added' | 'removed' | 'modified' | 'unchanged'


class LineItemDelta(BaseModel):
    """Aggregated delta per line item."""
    category: str
    sub_category: str
    total_delta: float


class ForecastVersionDiff(BaseModel):
    """Diff between two forecast versions [C-RH-05]."""
    version_a_id: int
    version_b_id: int
    version_a_number: int
    version_b_number: int
    version_a_project_id: str
    version_b_project_id: str
    line_deltas: list[CellDelta]
    summary: dict[str, int]       # {added_count, removed_count, modified_count, total_changes}
    grand_totals: dict[str, float] # {version_a, version_b, delta}


class ManualSnapshotRequest(BaseModel):
    """Body for POST /api/projects/{id}/forecast/versions (manual snapshot) [C-FV-03]."""
    label: Optional[str] = None   # optional human label stored as cycle_label
