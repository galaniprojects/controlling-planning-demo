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
    """One cell in the mixed-granularity grid — either monthly or quarterly.

    v5.1 C-08: in addition to the live forecast value, cells optionally carry
    baseline and actuals values so the UI can render the three-point stack
    (baseline / forecast / actuals) per temporal context. The fields stay
    nullable so legacy callers + ForecastVersion snapshots remain compatible.
    """
    key: str               # YYYY-MM or YYYY-QN
    cell_type: str         # 'monthly' | 'quarterly'
    hours: float
    amount_eur: float
    is_provisional: bool   # True for outer-zone cells [C-FG-07]
    # v5.1 C-08 — three-point overlay (nullable)
    baseline_hours: Optional[float] = None
    baseline_amount_eur: Optional[float] = None
    actuals_hours: Optional[float] = None
    actuals_amount_eur: Optional[float] = None
    # True when actuals exist but only cover part of the cell (current month)
    actuals_partial: Optional[bool] = None


class GridSubRow(BaseModel):
    """One sub-row under an expandable line item (v5.1 C-05 / C-06).

    For internal rows (category='internal'), each sub-row represents one
    employee assigned to the parent role. For external rows
    (category='external'), each sub-row represents one
    (vendor, po_number, role_type_id) tuple. Cell shape mirrors GridCell so
    the UI can route sub-row cells through the same renderer.

    Discriminator fields are nullable so a single shape covers both shapes
    without a Pydantic union. The frontend reads `category` from the parent.
    """
    label: str                              # primary display name
    sub_label: Optional[str] = None         # secondary line (e.g. cost-centre)
    cells: list[GridCell]
    row_total: float
    # Internal sub-row fields
    person_id: Optional[str] = None
    cost_center_id: Optional[str] = None
    # External sub-row fields
    vendor: Optional[str] = None
    po_number: Optional[str] = None
    role_type_id: Optional[str] = None
    role_name: Optional[str] = None


class GridRow(BaseModel):
    """One line item row (category × sub_category) in the mixed grid.

    v5.1 C-05 / C-06: rows can carry expandable `sub_rows` — per-employee
    breakdowns for internal rows or per-vendor breakdowns for external
    rows. Default None preserves byte-identical payloads for callers
    (notably ForecastVersion snapshots) that don't request the breakdown.

    v5.1 C-07: external rows can carry a derived `role_name` when all
    contributing line items share a single role assignment; the F&P grid
    renders `[Category] — [Role Name]` in that case. Falls back to None
    when the row has mixed roles or no role assignment.
    """
    category: str
    sub_category: str
    capex_opex: Optional[str] = None
    cells: list[GridCell]
    row_total: float
    # v5.1 C-05 / C-06
    sub_rows: Optional[list[GridSubRow]] = None
    # v5.1 C-07 (external rows only — derived from contributing line items)
    role_name: Optional[str] = None


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


# ---------------------------------------------------------------------------
# E1 — Progress Tracker schemas [E-04c]
# ---------------------------------------------------------------------------

# Confidence enum values per [E-04c]. Anything else rejects with 400.
PROGRESS_CONFIDENCE_VALUES = ("on_track", "at_risk", "blocked")


class DeliverableItem(BaseModel):
    """One deliverable checklist item on a milestone [E-04c]."""
    id: int
    milestone_id: int
    sequence: int
    text: str
    is_complete: bool
    completed_at: Optional[datetime] = None
    completed_by_id: Optional[str] = None


class DeliverableListResponse(BaseModel):
    items: list[DeliverableItem]
    total: int


class DeliverableCreateRequest(BaseModel):
    """Body for POST /api/projects/{id}/milestones/{mid}/checklist."""
    text: str
    sequence: Optional[int] = None  # auto-assign at end if not provided


class DeliverableUpdateRequest(BaseModel):
    """Body for PATCH /api/projects/{id}/checklist/{item_id}."""
    text: Optional[str] = None
    is_complete: Optional[bool] = None
    sequence: Optional[int] = None


class CurrentMilestoneSummary(BaseModel):
    """Lightweight milestone descriptor returned with progress payload."""
    id: int
    name: str
    sequence_number: int
    forecast_start: str
    forecast_end: str


class ChecklistRollup(BaseModel):
    """Aggregate checklist completion for the current milestone."""
    total_items: int
    completed_items: int
    completion_pct: Optional[float] = None  # null when total_items == 0


class ProgressResponse(BaseModel):
    """Response for GET /api/projects/{id}/progress [E-04c]."""
    project_id: str
    project_name: str
    current_milestone: Optional[CurrentMilestoneSummary] = None
    progress_pct: Optional[float] = None
    # Effective percentage — reflects the auto-computed checklist value when
    # ``progress_pct_manual_override`` is False AND the current milestone has
    # checklist items; otherwise mirrors the stored ``progress_pct`` field.
    effective_progress_pct: Optional[float] = None
    progress_pct_manual_override: bool
    status_narrative: Optional[str] = None
    next_milestone_confidence: Optional[str] = None
    confidence_reason: Optional[str] = None
    progress_updated_at: Optional[datetime] = None
    progress_updated_by_id: Optional[str] = None
    progress_updated_by_name: Optional[str] = None
    checklist: ChecklistRollup
    deliverables: list[DeliverableItem]


class ProgressUpdateRequest(BaseModel):
    """Body for PATCH /api/projects/{id}/progress [E-04c].

    Field semantics:
    - ``progress_pct``: when provided alongside ``progress_pct_manual_override=True``
      sets the manual override; when ``progress_pct_manual_override=False`` clears
      the override and the next GET re-derives from the checklist.
    - ``next_milestone_confidence``: required to be one of
      ``PROGRESS_CONFIDENCE_VALUES``. ``confidence_reason`` is required when the
      value is ``at_risk`` or ``blocked``.
    - ``current_milestone_id``: PL/controller marks the current milestone
      explicitly. Must reference a milestone of the same project.
    """
    current_milestone_id: Optional[int] = None
    progress_pct: Optional[float] = None
    progress_pct_manual_override: Optional[bool] = None
    status_narrative: Optional[str] = None
    next_milestone_confidence: Optional[str] = None
    confidence_reason: Optional[str] = None


class ProgressSnapshotMeta(BaseModel):
    """One row in GET /api/projects/{id}/progress/history."""
    id: int
    project_id: str
    cycle_label: Optional[str] = None
    cycle_id: Optional[str] = None
    snapshot_at: datetime
    created_by_id: Optional[str] = None
    created_by_name: Optional[str] = None
    current_milestone_id: Optional[int] = None
    current_milestone_name: Optional[str] = None
    current_milestone_sequence: Optional[int] = None
    progress_pct: Optional[float] = None
    progress_pct_manual_override: bool
    status_narrative: Optional[str] = None
    next_milestone_confidence: Optional[str] = None
    confidence_reason: Optional[str] = None


class ProgressHistoryListResponse(BaseModel):
    items: list[ProgressSnapshotMeta]
    total: int


class ProgressSnapshotDetail(BaseModel):
    """Full snapshot detail including the captured checklist payload."""
    meta: ProgressSnapshotMeta
    checklist: list[dict] = []
    # Each entry: {milestone_id, milestone_name, sequence_number, items: [{text, is_complete, sequence}]}


class PortfolioProgressIndicator(BaseModel):
    """One row in GET /api/portfolio/progress-aggregate [E-04d]."""
    project_id: str
    project_name: str
    pipeline_stage: Optional[str] = None
    rag_status: Optional[str] = None
    current_milestone_name: Optional[str] = None
    current_milestone_sequence: Optional[int] = None
    progress_pct: Optional[float] = None
    next_milestone_confidence: Optional[str] = None
    has_progress_data: bool


class PortfolioProgressAggregateResponse(BaseModel):
    """Response shape for GET /api/portfolio/progress-aggregate."""
    items: list[PortfolioProgressIndicator]
    total: int
    summary: dict[str, int]
    # Counts per confidence bucket: {on_track, at_risk, blocked, unreported}
