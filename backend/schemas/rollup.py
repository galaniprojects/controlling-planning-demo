"""Pydantic schemas for the Cluster F rollup query and drill-down endpoints.

Per [F-RV-01..06].
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class RollupRowResponse(BaseModel):
    group_key: str
    group_label: str
    dimension: str
    year: int
    version: str
    entity_count: int
    effective_cost: float
    own_cost: float
    inflow_total: float
    stage2_amount: Optional[float] = None


class RollupListResponse(BaseModel):
    dimension: str
    year: int
    version: str
    rows: list[RollupRowResponse]
    grand_total_effective: float
    grand_total_own_cost: float
    total: int


class DrillDownPathResponse(BaseModel):
    path: list[str]
    path_labels: list[str]


class RollupDrillDownResponse(BaseModel):
    entity_id: str
    entity_name: str
    year: int
    version: str
    effective_cost: float
    own_cost: float
    inflow_total: float
    stage2_amount: Optional[float] = None
    paths: list[DrillDownPathResponse]


class RollupCacheStatusResponse(BaseModel):
    total: int
    stage1_effective: int
    stage2_location: int


# ---------------------------------------------------------------------------
# F6 — Workbench BTC tab allocation breakdown
# ---------------------------------------------------------------------------

class EntityAllocationBreakdownRow(BaseModel):
    """One charging-location row in an entity's BTC allocation breakdown.

    Returned by ``GET /api/charging/entities/{entity_id}/allocation-breakdown``.
    Used in the Workbench BTC tab per [E-09].
    """
    charging_location_id: str
    charging_location_code: Optional[str] = None
    charging_location_name: Optional[str] = None
    region_name: Optional[str] = None
    division: Optional[str] = None
    country_iso_code: Optional[str] = None
    legal_entity_name: Optional[str] = None
    percentage: float
    amount_eur: float


class EntityAllocationBreakdownResponse(BaseModel):
    """Per-entity allocation breakdown response per [E-09]."""
    entity_id: str
    entity_name: str
    year: int
    version: str
    to_business_pct: float
    effective_cost: float
    business_amount_total: float
    rows: list[EntityAllocationBreakdownRow]
    profile_id: Optional[int] = None
    profile_status: Optional[str] = None
    profile_mode: Optional[str] = None
    has_profile: bool = False
    sums_to_100: bool = False
    total: int


# ---------------------------------------------------------------------------
# Level-4 drill: per-charging-location breakdown
# ---------------------------------------------------------------------------

class LegalEntitySummary(BaseModel):
    id: str
    code: str
    name: str


class LocationBreakdownEntity(BaseModel):
    entity_id: str
    identifier: str
    name: str
    entity_type: str  # 'Project' | 'Offering' | 'InternalService'
    doi: Optional[int] = None
    is_change_or_run: str  # 'Change' | 'Run'
    percentage: float
    amount_eur: float
    share_pct: float


class LocationBreakdownResponse(BaseModel):
    """Per-charging-location breakdown returned by
    ``GET /api/charging/locations/{cl_id}/breakdown``.
    """
    charging_location_id: str
    charging_location_code: str
    charging_location_name: str
    region_name: Optional[str] = None
    division: Optional[str] = None
    country_iso_code: Optional[str] = None
    year: int
    version: str
    total_amount_eur: float
    legal_entities: list[LegalEntitySummary]
    chargeable_entities: list[LocationBreakdownEntity]
    total: int
