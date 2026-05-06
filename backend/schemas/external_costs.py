"""Pydantic schemas for external cost aggregation endpoints (v5 Session E2).

Per [E-08a]–[E-08d]. Endpoints surface vendor and category totals at two scopes:
project-scoped (Workbench) and portfolio-scoped (Portfolio).

v5.1 C-09 extends this module with the monthly grid response shape used by
the External Costs tab overhaul (lead pre-work pins the contract; Teammate B
builds the frontend against the type stubs and Teammate C fills the
aggregation).
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel


# Single source of truth for the v5.1 C-09 status vocabulary. Mirrored on the
# frontend in `frontend/src/types/api.ts` (`ExternalCostStatus`). Backend rows
# emit lowercase strings exactly matching this set; the badge component
# (`ExternalCostStatusBadge.tsx`) decides the visual mapping.
ExternalCostStatus = Literal[
    "planned",
    "ordered",
    "goods_received",
    "invoiced",
    "accrual",
    "open",
]


class VendorSummaryItem(BaseModel):
    """Single vendor row within a project's external cost vendor summary.

    Forecast = total non-actuals projected spend (planned + ordered + invoiced).
    Actuals = realised spend (Actuals table).
    Remaining = forecast - actuals.
    Variance = forecast - baseline.

    v5.1 C-09: extended with `contract_reference`, `contract_end`, `open_po`,
    `remaining_not_invoiced` to back the four new vendor-table columns.
    All four are optional so existing serialisers / tests that don't set them
    keep passing during the lead pre-work commit.
    """

    vendor_name: str
    expense_cost_type: str
    forecast_total: float
    actuals_total: float
    remaining: float
    variance: float
    baseline_total: float
    po_count: int
    line_count: int

    # v5.1 C-09 — vendor-table column additions
    contract_reference: Optional[str] = None
    contract_end: Optional[str] = None  # YYYY-MM
    open_po: float = 0.0
    remaining_not_invoiced: float = 0.0


class CategoryRollupItem(BaseModel):
    """Per-cost-type rollup for a project."""

    cost_type_id: str
    cost_type_name: str
    forecast_total: float
    actuals_total: float
    baseline_total: float
    remaining: float
    variance: float
    vendor_count: int


class PortfolioVendorSummaryItem(BaseModel):
    """Cross-project vendor row for the portfolio view.

    Aggregates one vendor's spend across all projects the user can see, plus
    the dominant cost type, project count, and the highest-spend project.
    """

    vendor_name: str
    expense_cost_type: str
    project_count: int
    forecast_total: float
    actuals_total: float
    top_project_id: str | None
    top_project_name: str | None
    top_project_amount: float
    po_count: int


class PortfolioCategoryAnalysisItem(BaseModel):
    """Per-cost-type rollup at the portfolio level."""

    cost_type_id: str
    cost_type_name: str
    forecast_total: float
    actuals_total: float
    project_count: int
    vendor_count: int
    pct_of_external_total: float


class ProjectVendorMatrixCell(BaseModel):
    """One cell in the project × vendor cross-tab."""

    project_id: str
    vendor_name: str
    forecast_total: float
    actuals_total: float


class ProjectVendorMatrixResponse(BaseModel):
    """Cross-tab payload (rows=projects, columns=vendors)."""

    projects: list[dict]  # [{ "id": str, "name": str, "row_total": float }]
    vendors: list[dict]   # [{ "name": str, "col_total": float }]
    cells: list[ProjectVendorMatrixCell]
    total: float


# ---------------------------------------------------------------------------
# v5.1 C-09 — External Costs monthly grid
# ---------------------------------------------------------------------------


class ExternalCostsKpis(BaseModel):
    """Six top-level KPIs returned alongside the vendor-summary rows.

    Computed server-side so the frontend renders against ready-to-display
    values (consistent with the project's "no roll-ups client-side" rule).
    """

    total_forecast: float = 0.0
    actuals_ytd: float = 0.0
    open_pos: float = 0.0
    remaining_not_invoiced: float = 0.0
    accruals: float = 0.0
    variance_vs_baseline: float = 0.0


class MonthlyGridCell(BaseModel):
    """One cell in the External Costs monthly grid.

    Only `month` and `forecast` are guaranteed; `actuals`, `accrual`,
    `po_obligo`, `status` are omitted (frontend treats absence as
    "don't render that line in the stack" / "no badge").
    """

    month: str  # YYYY-MM
    forecast: Optional[float] = None
    actuals: Optional[float] = None
    accrual: Optional[float] = None
    po_obligo: Optional[float] = None
    status: Optional[ExternalCostStatus] = None


class DeliveryScheduleRow(BaseModel):
    """One scheduled delivery milestone (row-expansion content)."""

    milestone_name: str
    expected_month: str  # YYYY-MM
    expected_amount: float
    delivered_month: Optional[str] = None  # YYYY-MM, null = not yet delivered


class InvoiceHistoryRow(BaseModel):
    """One invoice received (row-expansion content)."""

    invoice_number: str
    invoice_date: str  # ISO date
    amount: float
    status: str  # 'received' | 'paid'


class MonthlyGridItem(BaseModel):
    """One external cost line item, grouped by (vendor, sub_category, po_number, role).

    `monthly_cells` carries the per-month stack values. Sticky-right metadata
    (`contract_end_month`, `status`, `open_po`, `remaining_not_invoiced`) is
    rendered in dedicated columns. `delivery_schedule` and `invoice_history`
    are populated for the row-expansion drawer.
    """

    line_id: str  # f"{vendor}|{sub_category}|{po_number or 'no-po'}"
    vendor: str
    role_type_id: Optional[str] = None
    role_name: Optional[str] = None
    sub_category: str
    sub_category_name: str
    po_number: Optional[str] = None
    contract_end_month: Optional[str] = None  # YYYY-MM
    status: Optional[ExternalCostStatus] = None
    open_po: float = 0.0
    remaining_not_invoiced: float = 0.0
    monthly_cells: list[MonthlyGridCell] = []
    delivery_schedule: list[DeliveryScheduleRow] = []
    invoice_history: list[InvoiceHistoryRow] = []


class MonthlyGridResponse(BaseModel):
    """Response wrapper for GET /external-costs/monthly-grid."""

    items: list[MonthlyGridItem] = []
    year_columns: list[str] = []  # full ordered list of YYYY-MM keys
    year: Optional[int] = None
    project_id: str
    total: int = 0


class VendorSummaryResponse(BaseModel):
    """Wrapper for GET /external-costs/vendor-summary.

    v5.1 C-09: top-level `kpis` block added — single round-trip surfaces both
    the per-vendor rows and the 6 KPI strip values.
    """

    items: list[VendorSummaryItem] = []
    total: int = 0
    project_id: str
    year: Optional[int] = None
    kpis: ExternalCostsKpis = ExternalCostsKpis()
