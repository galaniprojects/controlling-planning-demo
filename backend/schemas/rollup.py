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
