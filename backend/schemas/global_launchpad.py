"""Pydantic schemas for Global / Launchpad endpoints (Section 10.2)."""

from __future__ import annotations

from pydantic import BaseModel


class RoleInfo(BaseModel):
    id: str
    name: str
    user_name: str
    user_title: str | None
    default_module: str


class RoleContext(BaseModel):
    role: str
    user_name: str
    user_title: str | None
    accessible_modules: list[str]
    owned_project_ids: list[str]
    managed_cost_center_id: str | None
    # v5 B2 [B-AC-02] [D-AC-02]: Tier 3 simulator-access flag.
    # Resolved from User.tier3_flag (looked up by person_id; False when no
    # active User row exists). Frontend treats this as the authoritative
    # gate for Tier 3 surfaces / impact dimensions / catalogue actions.
    tier3_flag: bool = False


class NotificationResponse(BaseModel):
    id: int
    message: str
    severity: str
    deep_link_module: str | None = None
    deep_link_entity_id: str | None = None
    deep_link_tab: str | None = None
    is_read: bool


class PortfolioKPISummary(BaseModel):
    total_budget: float
    ytd_spend: float
    portfolio_variance_pct: float
    overall_utilization_pct: float
    run_change_ratio: str


class ModuleTile(BaseModel):
    id: str
    name: str
    description: str
    contextual_metric: str
    visible: bool
    sort_order: int
    # v5.1 W6 [C-01]: 1–2 role-differentiated subtitle KPIs rendered under
    # the description on each module card. Default empty so any module that
    # has no live KPI source still serialises cleanly.
    subtitle_kpis: list[str] = []


class PendingAction(BaseModel):
    id: str
    type: str
    title: str
    description: str
    urgency: str  # "urgent" | "info"
    deep_link_module: str
    deep_link_entity_id: str | None = None
    deep_link_tab: str | None = None
    timestamp: str | None = None


class ResourcePlanItem(BaseModel):
    role_type_id: str
    hours_per_month: float
    period_start: str
    period_end: str


class ExternalCostItem(BaseModel):
    cost_type_id: str
    amount_per_month: float
    period_start: str
    period_end: str


class ProjectCreate(BaseModel):
    name: str
    description: str | None = None
    lob_id: str
    start_month: str
    end_month: str | None = None
    capex_opex: str = "capex"
    resource_plan: list[ResourcePlanItem] = []
    external_costs: list[ExternalCostItem] = []


# ---------------------------------------------------------------------------
# v5 Session E2 — Launchpad role tiles per [E-06d]–[E-06j]
# ---------------------------------------------------------------------------


class TilePayload(BaseModel):
    """A single role-personalised launchpad tile.

    Each tile carries one primary metric (always populated), an optional
    secondary metric, and a deep-link target (module + optional entity / tab)
    for the front-end to navigate to on click.
    """

    tile_id: str
    title: str
    primary_metric: str
    secondary_metric: str | None = None
    link_module: str
    link_entity_id: str | None = None
    link_tab: str | None = None
    tone: str = "neutral"  # "neutral" | "positive" | "warning" | "alert"


class TilesResponse(BaseModel):
    """Wrapper for `GET /api/launchpad/tiles`."""

    role: str
    items: list[TilePayload]
    total: int
