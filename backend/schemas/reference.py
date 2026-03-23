"""Pydantic schemas for Reference Data endpoints (Section 10.8)."""

from __future__ import annotations

from pydantic import BaseModel


class RateInfo(BaseModel):
    competence_center_id: str
    competence_center_name: str
    hourly_rate: float
    effective_date: str


class LoBResponse(BaseModel):
    id: str
    name: str
    description: str | None
    is_active: bool
    project_count: int
    total_budget: float


class CompetenceCenterCostCenter(BaseModel):
    id: str
    name: str


class CompetenceCenterResponse(BaseModel):
    id: str
    name: str
    blended_rate: float
    cost_centers: list[CompetenceCenterCostCenter]
    is_active: bool


class CostCenterResponse(BaseModel):
    id: str
    name: str
    location_id: str
    location_name: str
    competence_center_id: str
    competence_center_name: str
    headcount: int
    is_active: bool


class LocationResponse(BaseModel):
    id: str
    city: str
    country: str
    cost_center_count: int
    is_active: bool


class RoleResponse(BaseModel):
    id: str
    name: str
    rates: list[RateInfo]


class PersonResponse(BaseModel):
    id: str
    name: str
    role_type_id: str
    role_name: str
    cost_center_id: str | None
    cost_center_name: str
    competence_center_id: str | None
    competence_center_name: str
    utilization_pct: float
    is_active: bool


class CostTypeResponse(BaseModel):
    id: str
    name: str
