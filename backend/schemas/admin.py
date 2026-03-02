"""Pydantic schemas for Administration endpoints (Section 10.9)."""

from __future__ import annotations

from pydantic import BaseModel


# --- Cost Center ---
class CostCenterCreate(BaseModel):
    name: str
    location_id: str
    competence_center_id: str


class CostCenterUpdate(BaseModel):
    name: str | None = None
    location_id: str | None = None
    competence_center_id: str | None = None


# --- Competence Center ---
class CompetenceCenterCreate(BaseModel):
    name: str


class CompetenceCenterUpdate(BaseModel):
    name: str | None = None


# --- LoB ---
class LoBCreate(BaseModel):
    name: str
    description: str | None = None


class LoBUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


# --- Location ---
class LocationCreate(BaseModel):
    city: str
    country: str


class LocationUpdate(BaseModel):
    city: str | None = None
    country: str | None = None


# --- People ---
class PersonCreate(BaseModel):
    name: str
    role_type_id: str
    cost_center_id: str | None = None


class PersonUpdate(BaseModel):
    name: str | None = None
    role_type_id: str | None = None
    cost_center_id: str | None = None


# --- Rates ---
class RateChange(BaseModel):
    role_type_id: str
    competence_center_id: str
    new_rate: float
    effective_date: str


class RatesUpdate(BaseModel):
    changes: list[RateChange]


# --- Parameters ---
class ParameterChange(BaseModel):
    key: str
    new_value: str


class ParametersUpdate(BaseModel):
    changes: list[ParameterChange]


class ParametersReset(BaseModel):
    keys: list[str] | None = None


# --- Responses ---
class AdminContextResponse(BaseModel):
    cost_center_count: int
    people_count: int
    lob_count: int
    location_count: int
    competence_center_count: int
    last_rate_update: str | None
    last_parameter_change: str | None


class AuditLogEntry(BaseModel):
    id: int
    timestamp: str
    user_name: str
    entity_type: str
    entity_id: str
    entity_name: str | None
    action: str
    field_changed: str | None
    old_value: str | None
    new_value: str | None
