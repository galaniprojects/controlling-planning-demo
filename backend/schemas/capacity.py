"""Pydantic schemas for Capacity Management endpoints (Section 10.5)."""
from __future__ import annotations
from pydantic import BaseModel


class CapacityContext(BaseModel):
    default_tab: str
    managed_cost_center_id: str | None
    pending_request_count: int


class TeamSummary(BaseModel):
    headcount: int
    avg_utilization_pct: float
    over_allocated_count: int
    pending_request_count: int


class UtilizationCell(BaseModel):
    month: str
    value: float
    color: str
    allocated_hours: float | None = None
    standard_hours: float | None = None


class PersonHeatmapRow(BaseModel):
    person_id: str
    name: str
    utilization: list[UtilizationCell]


class RoleHeatmapRow(BaseModel):
    role_id: str
    role_name: str
    aggregate_utilization: list[UtilizationCell]
    people: list[PersonHeatmapRow]


class PersonAllocation(BaseModel):
    project_id: str
    project_name: str
    hours: float


class PersonDetail(BaseModel):
    person_id: str
    name: str
    role: str
    allocations_by_month: list[dict]
    pending_requests: list[dict]


class RequestItem(BaseModel):
    id: int
    project_id: str
    project_name: str
    request_type: str
    role_or_cost_type: str
    hours_or_amount: float
    period_start: str
    period_end: str
    priority: str
    status: str


class ConfirmRequest(BaseModel):
    assigned_person_id: str | None = None


class PartialFulfillRequest(BaseModel):
    adjusted_value: float
    assigned_person_id: str | None = None


class CounterProposeRequest(BaseModel):
    explanation: str
    alternative_resource_plan: list[dict] = []


class DeclineRequest(BaseModel):
    reason: str


class AssignmentEntry(BaseModel):
    month: str
    person_id: str


class SaveAssignmentsRequest(BaseModel):
    assignments: list[AssignmentEntry]


class OrgSummary(BaseModel):
    total_headcount: int
    avg_utilization_pct: float
    over_allocated_cc_count: int
    pending_controller_approval_count: int


class OrgHeatmapRow(BaseModel):
    id: str
    name: str
    utilization: list[UtilizationCell]
    children: list[dict] = []


# ---------------------------------------------------------------------------
# v5 Session E2 — PL capacity read-only role-availability per [E-06a]
# ---------------------------------------------------------------------------


class RoleAvailabilityRow(BaseModel):
    """Aggregated allocation snapshot for one (role, location, month) cell.

    Returned by ``GET /api/capacity/role-availability``. Person identifiers and
    names are intentionally omitted so Project Leads can browse availability
    without seeing personal data per [E-06a].
    """

    role_type_id: str
    role_type_name: str
    location_id: str
    location_name: str
    month: str  # YYYY-MM
    headcount: int
    standard_hours: float
    allocated_hours: float
    available_hours: float
    utilization_pct: float


class RoleAvailabilityResponse(BaseModel):
    items: list[RoleAvailabilityRow]
    total: int
    months: list[str]
