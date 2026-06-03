"""Pydantic schemas for What-If Simulator endpoints (Cluster B Section 10.6).

v4 schemas (kept verbatim for backward-compat) + v5 B1 additions for the
extended scenario lifecycle, Lever 12, impact dimensions, and the promote /
apply-to-forecast workflows.
"""
from __future__ import annotations
from typing import Any, Optional
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# v4 baseline schemas (unchanged)
# ---------------------------------------------------------------------------

class ScenarioListItem(BaseModel):
    id: int
    name: str
    description: str | None
    status: str
    author_name: str
    created_at: str
    modified_at: str
    headline_impact: str | None
    # v5 additions, optional for backward compat
    visibility: Optional[str] = None
    tier3_content_flag: Optional[bool] = None
    archived: Optional[bool] = None
    archived_at: Optional[str] = None
    tags: Optional[list[str]] = None
    anchor_forecast_version_id: Optional[int] = None
    last_recalculated_at: Optional[str] = None


class ScenarioCreate(BaseModel):
    name: str
    description: str | None = None
    clone_from: int | None = None
    # v5 additions
    anchor_forecast_version_id: Optional[int] = None
    tags: Optional[list[str]] = None
    cc_owner_scope_cc_id: Optional[str] = None


class ScenarioMetadataUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    tags: Optional[list[str]] = None
    visibility: Optional[str] = None  # 'private' | 'tier3_only' | 'all_users'


class ActionRequest(BaseModel):
    scope: str
    action_type: str
    project_id: str | None = None
    parameters: dict = {}
    # v5 additions for richer classification
    lever_category: Optional[str] = None
    tier: Optional[int] = None  # 1, 2, or 3


class ActionReorder(BaseModel):
    action_ids: list[int]


class CompareRequest(BaseModel):
    scenario_ids: list[int]


class AdvisorQuery(BaseModel):
    goal: str


class AdvisorApply(BaseModel):
    path_id: str


# ---------------------------------------------------------------------------
# v5 B1 — Lever 12 schemas
# ---------------------------------------------------------------------------

class DistributionEdgeCreate(BaseModel):
    year: int
    source_entity_id: str
    destination_entity_id: str
    percentage: float = Field(ge=0, le=100)


class DistributionEdgeUpdate(BaseModel):
    percentage: float = Field(ge=0, le=100)


class ToBusinessChange(BaseModel):
    entity_id: str
    year: int
    new_pct: float = Field(ge=0, le=100)


class BTCLineSpec(BaseModel):
    charging_location_id: str
    percentage: float = Field(gt=0, le=100)


class BTCLinesChange(BaseModel):
    entity_id: str
    year: int
    lines: list[BTCLineSpec]


class CostAllocationImpactItem(BaseModel):
    entity_id: str
    entity_name: str
    charging_location_id: str
    charging_location_code: str
    anchor_amount: float
    scenario_amount: float
    delta: float


class CostAllocationImpactResponse(BaseModel):
    year: int
    anchor_version: str
    scenario_version: str
    touched_entity_count: int
    items: list[CostAllocationImpactItem]
    totals: dict


# ---------------------------------------------------------------------------
# v5 B1 — Promote workflow schemas
# ---------------------------------------------------------------------------

class PromotePreviewRequest(BaseModel):
    """Optional list of action IDs to preview; omit for all un-promoted."""
    action_ids: Optional[list[int]] = None


class PromoteExecuteRequest(BaseModel):
    """Executor body. Action IDs may filter the selection; notes is audit text."""
    action_ids: Optional[list[int]] = None
    notes: Optional[str] = None


class RoutingDecisionItem(BaseModel):
    action_id: int
    action_type: str
    lever_category: Optional[str]
    routing_type: str
    target_id: Optional[str]
    requires_review: bool
    message: str
    permission_ok: Optional[bool] = None
    permission_message: Optional[str] = None


class PromotePreviewResponse(BaseModel):
    scenario_id: int
    anchor_forecast_version_id: Optional[int]
    decisions: list[RoutingDecisionItem]


class PromoteResultItem(BaseModel):
    action_id: int
    routing_type: str
    status: str  # 'promoted' | 'skipped'
    message: str
    target_id: Optional[str] = None


class PromoteExecuteResponse(BaseModel):
    scenario_id: int
    promotion_id: int
    promoted_at: str
    promoted_count: int
    skipped_count: int
    summary: list[PromoteResultItem]


# ---------------------------------------------------------------------------
# v5 B1 — Apply-to-forecast schemas
# ---------------------------------------------------------------------------

class ApplyToForecastRequest(BaseModel):
    cycle_id: Optional[str] = None
    cycle_label: Optional[str] = None


class ApplyToForecastSummaryItem(BaseModel):
    action_id: int
    project_id: Optional[str] = None
    status: str
    message: str
    cells_marked_provisional: Optional[int] = None


class ApplyToForecastResponse(BaseModel):
    scenario_id: int
    event_id: int
    applied_by: str
    applied_at: str
    diffs_carried_forward: int
    diffs_skipped: int
    summary: list[ApplyToForecastSummaryItem]
    provenance_note: str


# ---------------------------------------------------------------------------
# v5 B1 — Lifecycle schemas
# ---------------------------------------------------------------------------

class ScenarioRebaseRequest(BaseModel):
    """Body for POST /api/scenarios/{id}/rebase."""
    new_anchor_version_id: int


class ScenarioArchiveRequest(BaseModel):
    archived: bool = True


class ScenarioPublishRequest(BaseModel):
    """Optional override of default visibility on publish."""
    visibility: Optional[str] = None  # 'private' | 'tier3_only' | 'all_users'


# ---------------------------------------------------------------------------
# v5 B1 — Impact dashboard schemas
# ---------------------------------------------------------------------------

class ImpactDimensionEnvelope(BaseModel):
    """Generic envelope — each dimension has its own shape internally."""
    headline: Optional[str] = None
    # the rest is opaque dict so we can evolve dimensions without schema churn
    data: Optional[dict[str, Any]] = None


class ImpactDashboardResponse(BaseModel):
    scenario_id: int
    tier3_content: bool
    tier3_visible: bool
    stale: bool
    anchor_forecast_version_id: Optional[int]
    dimensions: dict[str, Any]


# ---------------------------------------------------------------------------
# v5 B1 — Tagging / filter list response
# ---------------------------------------------------------------------------

class ScenarioListResponse(BaseModel):
    my_scenarios: list[ScenarioListItem]
    published_scenarios: list[ScenarioListItem]
    archived_scenarios: list[ScenarioListItem] = []
    available_tags: list[str] = []


# ---------------------------------------------------------------------------
# Project-scope redesign Session 2 — editable forecast grid
#
# Purpose-built grid shape (NOT an extension of the workbench MixedGridResponse):
# pure monthly columns, one row per resolved line, anchor value per cell so the
# frontend can mark changed cells + drive per-cell revert without a second
# request. Fed by ``resolve_project_grid`` (adjusted) joined with
# ``read_anchor_grid`` (anchor). See guides/Simulator_Project_Scope_Redesign_*.
# ---------------------------------------------------------------------------

class ScenarioGridColumn(BaseModel):
    key: str                       # absolute "YYYY-MM"
    cell_type: str = "monthly"


class ScenarioGridCell(BaseModel):
    month: str                     # "YYYY-MM"
    display_value: float           # internal → hours; external → €
    amount_eur: float              # always the € value (internal: hours × rate)
    anchor_value: Optional[float] = None  # pre-overlay value in the cell's field
    field: str                     # "hours" | "amount_eur" (what the write endpoint expects)
    can_edit: bool                 # False for actuals (month < DEMO_DATE)
    is_changed: bool = False       # resolved value differs from anchor
    is_empty: bool = False         # neither anchor nor adjusted has the cell


class ScenarioGridRow(BaseModel):
    line_key: str                  # natural composite — round-tripped on write/revert
    category: str                  # "internal" | "external"
    kind: str                      # "internal_role" | "external_cost"
    sub_category_name: str         # display label
    hourly_rate: Optional[float] = None  # internal lines only (for €-from-hours sub-line)
    cells: list[ScenarioGridCell]


class ScenarioGridResponse(BaseModel):
    scenario_id: int
    project_id: str
    start_month: Optional[str] = None
    end_month: Optional[str] = None
    open_month: str                # DEMO_DATE — the actuals/future boundary
    columns: list[ScenarioGridColumn]
    rows: list[ScenarioGridRow]


class CellEditRequest(BaseModel):
    """Single forecast-cell overlay write. ``value=None`` zeroes the cell;
    reverting (fall back to anchor) is a DELETE, not a null write."""

    line_key: str
    month: str = Field(pattern=r"^\d{4}-\d{2}$")
    field: str                     # "hours" | "amount_eur" (∈ OVERLAY_CELL_FIELDS)
    value: Optional[float] = None


class ScenarioGridWriteResponse(BaseModel):
    """Returned by the cell write + revert endpoints: the recalculated scenario
    state (verbatim ``recalculate_scenario`` dict, consumed by the impact
    dashboard) plus the freshly resolved grid for the edited project, so the
    frontend reconciles its optimistic edit in one round-trip."""

    state: dict
    grid: ScenarioGridResponse
