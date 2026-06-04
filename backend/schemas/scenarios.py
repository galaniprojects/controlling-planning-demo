"""Pydantic schemas for What-If Simulator endpoints (Cluster B Section 10.6).

v4 schemas (kept verbatim for backward-compat) + v5 B1 additions for the
extended scenario lifecycle, cost allocation, impact dimensions, and the promote /
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
# v5 B1 — Cost allocation schemas
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
    action_id: Optional[int] = None  # None for overlay-only (no ScenarioAction)
    project_id: Optional[str] = None
    status: str
    message: str
    # Apply-to-CR: number of draft CRs created for this project. (Replaces the
    # legacy cells_marked_provisional, kept Optional for backward compatibility.)
    change_requests_created: Optional[int] = None
    cells_marked_provisional: Optional[int] = None


class ApplyToForecastResponse(BaseModel):
    scenario_id: int
    event_id: int
    applied_by: str
    applied_at: str
    diffs_carried_forward: int
    diffs_skipped: int
    draft_change_requests_created: int = 0  # total draft CRs across all projects
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
    anchor_amount_eur: Optional[float] = None  # anchor cell's stored € (live-local anchor/delta)
    field: str                     # "hours" | "amount_eur" (what the write endpoint expects)
    can_edit: bool                 # False for actuals (month < DEMO_DATE)
    is_changed: bool = False       # resolved value differs from anchor (incl. macro shifts)
    has_overlay: bool = False      # a hand-overlay row exists for this cell (revertable)
    is_empty: bool = False         # neither anchor nor adjusted has the cell


class ScenarioGridRow(BaseModel):
    line_key: str                  # natural composite — round-tripped on write/revert
    category: str                  # "internal" | "external"
    kind: str                      # "internal_role" | "external_cost"
    sub_category_name: str         # display label
    hourly_rate: Optional[float] = None  # internal lines only (for €-from-hours sub-line)
    # S6 location-aware rates: workforce location of an internal role line
    # (split per location). Null for external lines and location-less rows.
    location_id: Optional[str] = None
    location_name: Optional[str] = None  # display label (city) for the location chip
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


class ScenarioProjectItem(BaseModel):
    id: str
    name: str
    pipeline_stage: str


class ScenarioProjectsResponse(BaseModel):
    """All projects selectable in the simulator workspace — every active project
    regardless of pipeline stage (the simulator is portfolio-wide what-if), so a
    scenario's affected projects are always reachable. NOT the Portfolio 'Change'
    population, which excludes backlog-stage projects."""

    items: list[ScenarioProjectItem]
    total: int


class ScenarioGridWriteResponse(BaseModel):
    """Returned by the cell write + revert endpoints: the recalculated scenario
    state (verbatim ``recalculate_scenario`` dict, consumed by the impact
    dashboard) plus the freshly resolved grid for the edited project, so the
    frontend reconciles its optimistic edit in one round-trip."""

    state: dict
    grid: ScenarioGridResponse


# ---------------------------------------------------------------------------
# Project-scope redesign Session 3 — T1 edit surfaces
#   role lines (add/remove), plan edits (dates/stage/doi/milestones), Tier-3 mix.
# Both line ops write ScenarioLineEdit; plan writes ScenarioPlanEdit; mix writes
# ScenarioMixChange. All write endpoints recalc + return the resolved grid so the
# surface reconciles in one round-trip, mirroring the Session-2 cell contract.
# ---------------------------------------------------------------------------

class LineAddRequest(BaseModel):
    """Add an internal role line to a project's plan within the scenario. A stable
    ``new:role:<uuid>`` line_key is minted server-side; cells are then editable via
    the cell endpoints under that key."""

    role_type_id: str
    sub_category: Optional[str] = None
    category: Optional[str] = "internal"
    # S6 location-aware rates: workforce location for the added internal line
    # (loc-muc / loc-bud / loc-pun). Determines the line's rate. Null → resolves
    # via the Munich/any fallback.
    location_id: Optional[str] = None


class ScenarioLineWriteResponse(BaseModel):
    """Line add/remove response — the minted/affected ``line_key`` plus the
    recalculated state and resolved grid (the new line appears as an empty row
    ready for cell edits)."""

    line_key: str
    state: dict
    grid: ScenarioGridResponse


class PlanEditRequest(BaseModel):
    """Upsert one project-plan overlay target. ``target`` ∈ OVERLAY_PLAN_TARGETS.
      - date/stage/doi: scalar ``value`` (e.g. "2026-09", a stage name, "3").
      - milestone: ``milestone_id`` set + structured ``entry_json`` (name, dates)."""

    target: str
    value: Optional[str] = None
    milestone_id: Optional[str] = None
    entry_json: Optional[dict] = None


class ScenarioPlanMilestone(BaseModel):
    milestone_id: str
    name: str
    forecast_start: Optional[str] = None
    forecast_end: Optional[str] = None
    anchor_forecast_start: Optional[str] = None
    anchor_forecast_end: Optional[str] = None
    is_changed: bool = False


class ScenarioPlanResponse(BaseModel):
    """The project's plan under the scenario: anchor values (live Project /
    milestones) overlaid with any ScenarioPlanEdit rows, plus per-field changed
    flags so the editor can render the diff."""

    project_id: str
    start_month: Optional[str] = None
    end_month: Optional[str] = None
    stage: Optional[str] = None
    doi: Optional[int] = None
    anchor_start_month: Optional[str] = None
    anchor_end_month: Optional[str] = None
    anchor_stage: Optional[str] = None
    anchor_doi: Optional[int] = None
    start_changed: bool = False
    end_changed: bool = False
    stage_changed: bool = False
    doi_changed: bool = False
    milestones: list[ScenarioPlanMilestone] = []


class ScenarioPlanWriteResponse(BaseModel):
    """Plan write/revert response: recalculated state + resolved grid (so a date
    shift reflects immediately) + the freshly resolved plan for the editor."""

    state: dict
    grid: ScenarioGridResponse
    plan: ScenarioPlanResponse


class MixChangeRequest(BaseModel):
    """Tier-3 seniority/sourcing mix swap: move ``hours_per_month_swap`` hours per
    month from ``swap_from_role_id`` to ``swap_to_role_id`` from ``effective_from``
    onward. Mirrors the legacy ``change_allocation`` shape (spec §8)."""

    swap_from_role_id: str
    swap_to_role_id: str
    hours_per_month_swap: float
    effective_from: str = Field(pattern=r"^\d{4}-\d{2}$")
    cost_center_id: Optional[str] = None
    # S6 location-aware rates: workforce location of the from/to role lines. The
    # UX swaps within one location (set both equal); both nullable for back-compat.
    swap_from_location_id: Optional[str] = None
    swap_to_location_id: Optional[str] = None


class ScenarioMixItem(BaseModel):
    id: int
    cost_center_id: Optional[str] = None
    swap_from_role_id: Optional[str] = None
    swap_to_role_id: Optional[str] = None
    hours_per_month_swap: Optional[float] = None
    effective_from: Optional[str] = None
    swap_from_location_id: Optional[str] = None
    swap_to_location_id: Optional[str] = None


class ScenarioMixWriteResponse(BaseModel):
    """Mix write/revert response: recalculated state + resolved grid + the current
    set of mix swaps for the project."""

    state: dict
    grid: ScenarioGridResponse
    mix_changes: list[ScenarioMixItem] = []


class ScenarioMixListResponse(BaseModel):
    """GET response — the current set of Tier-3 mix swaps for the project (so the
    control can render previously-saved swaps on mount)."""

    mix_changes: list[ScenarioMixItem] = []


# ---------------------------------------------------------------------------
# Project-scope redesign Session 3 — T2 external-cost line items
#   add / remove / edit (vendor, category=cost-type rollup, description, capex).
# add/remove/edit all write ScenarioLineEdit (line_kind='external_cost'); the
# write endpoints recalc + return the resolved grid like the cell contract, plus
# the freshly resolved external-line list so the editor reconciles in one trip.
# ---------------------------------------------------------------------------

class ExternalCostLineCreateRequest(BaseModel):
    """Add an external-cost line item to a project's plan within the scenario. A
    stable ``new:ext:<uuid>`` line_key is minted server-side; per-month € is then
    editable via the cell endpoints under that key. ``cost_type_id`` is the rollup
    grouping (maps to the line's ``sub_category``); vendor / description / capex
    identify and annotate the item."""

    cost_type_id: str
    vendor: Optional[str] = None
    description: Optional[str] = None
    capex_opex: Optional[str] = None


class ExternalCostLineUpdateRequest(BaseModel):
    """Edit an existing (or pending-added) external-cost line's metadata. All
    fields optional — only the provided ones are patched. ``cost_type_id`` changes
    the rollup grouping; the line_key (identity) is unchanged."""

    cost_type_id: Optional[str] = None
    vendor: Optional[str] = None
    description: Optional[str] = None
    capex_opex: Optional[str] = None


class ExternalCostTypeOption(BaseModel):
    id: str
    name: str


class ExternalCostLineItem(BaseModel):
    """One external-cost line under the scenario, anchor + overlay resolved."""

    line_key: str
    cost_type_id: Optional[str] = None
    cost_type_name: Optional[str] = None
    vendor: Optional[str] = None
    description: Optional[str] = None
    capex_opex: Optional[str] = None
    total_eur: float                     # sum of resolved future + past cells
    origin: str                          # "anchor" | "added"


class ExternalCostListResponse(BaseModel):
    """The external-cost line items for one project under the scenario, plus the
    cost-type catalogue for the add/edit category selector."""

    scenario_id: int
    project_id: str
    items: list[ExternalCostLineItem] = []
    available_cost_types: list[ExternalCostTypeOption] = []
    total: int


class ExternalCostWriteResponse(BaseModel):
    """External-cost add/remove/edit response: the affected ``line_key`` plus the
    recalculated state, the freshly resolved grid (the line appears/updates/drops),
    and the refreshed external-line list so the editor reconciles in one trip."""

    line_key: str
    state: dict
    grid: ScenarioGridResponse
    external_costs: ExternalCostListResponse
