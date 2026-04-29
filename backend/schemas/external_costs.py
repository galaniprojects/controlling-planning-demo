"""Pydantic schemas for external cost aggregation endpoints (v5 Session E2).

Per [E-08a]–[E-08d]. Endpoints surface vendor and category totals at two scopes:
project-scoped (Workbench) and portfolio-scoped (Portfolio).
"""

from __future__ import annotations

from pydantic import BaseModel


class VendorSummaryItem(BaseModel):
    """Single vendor row within a project's external cost vendor summary.

    Forecast = total non-actuals projected spend (planned + ordered + invoiced).
    Actuals = realised spend (Actuals table).
    Remaining = forecast - actuals.
    Variance = forecast - baseline.
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
