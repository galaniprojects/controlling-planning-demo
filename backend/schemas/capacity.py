"""Pydantic schemas for Capacity Management endpoints (Section 10.5).

Wave 1 of the v5.2 Capacity Module Redesign extends this module with
dashboard-tier response shapes (forecast time series, headcount breakdown,
hotspot list), the audit-trail history shape, and the multi-person
assignment PUT body. Spec refs: §11.10, §12.10, §12.15, §13.10, §9.5.
"""
from __future__ import annotations
from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, Field


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


class ExternalCapacityRow(BaseModel):
    """v5.1 C-07 — synthetic 'External' resource row inside a role group.

    Carries the FTE-equivalent count per month for vendor / consultant
    line items (Forecast.category='external' AND role_type_id IS NOT NULL)
    aggregated to the role. The team heatmap renders one row per role
    group with an 'External' badge so users can see outsourcing-ratio
    context alongside internal people. FTE-equivalent is computed as
    `external_amount_eur / hourly_rate / standard_fte_hours`.
    """
    label: str                                  # display label (e.g. "External")
    fte_equivalent: list[UtilizationCell]       # month → FTE-equivalent count


class RoleHeatmapRow(BaseModel):
    role_id: str
    role_name: str
    aggregate_utilization: list[UtilizationCell]
    people: list[PersonHeatmapRow]
    # v5.1 C-07 — optional external resource row (None when no external
    # line items with role_type_id == role_id are in scope)
    external: Optional["ExternalCapacityRow"] = None


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
    """Legacy single-person-per-month assignment entry.

    Retained for backward compatibility with the v4 PUT body shape
    ``[{month, person_id}]``. v5.2 W1 (§9.5) introduces a multi-person
    body shape via ``MonthAssignment``; the route auto-detects which
    shape was sent and dispatches accordingly.
    """
    month: str
    person_id: str


class AssignmentPerson(BaseModel):
    """Single person's portion of a multi-person month assignment.

    Per spec §9.5, hours are the split unit (not percentage). The sum
    of ``hours`` across all entries in the month should equal the
    request's monthly hours, but partial fulfilment is permitted.
    """
    person_id: str
    hours: Optional[float] = None


class MonthAssignment(BaseModel):
    """v5.2 multi-person assignment body shape per spec §9.5.

    Each element is one month + a list of ``AssignmentPerson`` entries
    representing the people sharing that month's hours.
    """
    month: str
    assignments: list[AssignmentPerson]


class SaveAssignmentsRequest(BaseModel):
    """Multi-shape PUT body for /requests/{cc}/{rid}/assignments.

    The endpoint accepts either:
      * legacy: ``{"assignments": [{"month": "...", "person_id": "..."}]}``
      * v5.2:   ``{"assignments": [{"month": "...", "assignments": [...]}]}``

    Both shapes coexist because the assignment payload is type-validated
    only after a route-level shape sniff (the legacy ``person_id`` key
    versus the new nested ``assignments`` key per §9.9).
    """
    # Stored as raw dict list and parsed in the route to support both shapes.
    assignments: list[dict[str, Any]]


class OrgSummary(BaseModel):
    total_headcount: int
    avg_utilization_pct: float
    over_allocated_cc_count: int
    pending_controller_approval_count: int


class OrgExternalSummary(BaseModel):
    """v5.1 C-07 — lightweight external-resource roll-up surfaced inside the
    org-heatmap role pivot. ``count`` is the number of distinct projects that
    contribute external spend with this role assignment over the visible
    window; ``total_fte`` is the average monthly FTE-equivalent across the
    same window. Both default to zero when no external lines match the role.
    """
    count: int = 0
    total_fte: float = 0.0


class OrgHeatmapRow(BaseModel):
    id: str
    name: str
    utilization: list[UtilizationCell]
    children: list[dict] = []
    # v5.1 C-07 — only populated for ``pivot=role``; None elsewhere.
    external_summary: Optional[OrgExternalSummary] = None


# ---------------------------------------------------------------------------
# v5 Session E2 — PL capacity read-only role-availability per [E-06a]
# ---------------------------------------------------------------------------


class RoleAvailabilityRow(BaseModel):
    """Aggregated allocation snapshot for one (role, location, month) cell.

    Returned by ``GET /api/capacity/role-availability``. Person identifiers and
    names are intentionally omitted so Project Leads can browse availability
    without seeing personal data per [E-06a].

    v5.2 §13.10 adds ``competing_demand_count`` — count of pending
    ``ResourceRequest`` rows for this role/location/month authored by a PL
    *other than* the requesting PL. This populates the §13.5 "competing
    demand" badge that warns PLs that capacity is contested even when the
    headline available-hours number looks healthy.
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
    competing_demand_count: int = 0


class LocationAvailabilitySummary(BaseModel):
    """v5.2 §13.7 location-comparison roll-up.

    Returned in ``RoleAvailabilityResponse.location_summary`` only when the
    caller does NOT supply ``location_id`` — i.e. PL is browsing "All
    locations" and should see which sites have the most spare capacity.
    """

    location_id: str
    location_name: str
    total_headcount: int
    avg_availability_pct: float


class RoleAvailabilityResponse(BaseModel):
    items: list[RoleAvailabilityRow]
    total: int
    months: list[str]
    location_summary: Optional[list[LocationAvailabilitySummary]] = None


# ---------------------------------------------------------------------------
# v5.2 W1 §11.10 — Dashboard layer aggregations (forecast / breakdown / hotspots)
# ---------------------------------------------------------------------------


class DashboardForecastPoint(BaseModel):
    """One month in the capacity forecast time series per spec §11.4.

    All hours are scope-aggregated. ``available_hours`` is sum of
    ``standard_available_hours`` across people in scope, ``allocated_hours``
    sums confirmed ``Allocation.hours``, and ``demand_hours`` sums
    pending/partially-fulfilled ``ResourceRequest`` rows of type ``resource``.
    """
    month: str  # YYYY-MM
    available_hours: float
    allocated_hours: float
    demand_hours: float


class DashboardForecastResponse(BaseModel):
    items: list[DashboardForecastPoint]
    total: int
    scope: str
    start: str
    end: str


class HeadcountBreakdownSegment(BaseModel):
    """One segment of the headcount-breakdown stacked bar per spec §11.5."""
    label: str
    count: int
    avg_utilization_pct: float
    # Stable identifier so the UI can drill back to scope. Example values:
    # location_id for dimension=location, hierarchy_entity_id for hierarchy,
    # role_type_id for role, cost_center_id for cost_center.
    segment_id: Optional[str] = None


class HeadcountBreakdownResponse(BaseModel):
    items: list[HeadcountBreakdownSegment]
    total: int
    dimension: str  # location / hierarchy / role / cost_center
    scope: str


class UtilizationDistributionBucket(BaseModel):
    """One bucket of the utilization distribution histogram per spec §11.3.

    ``bucket`` is the bucket key (``zero | 1_25 | 26_50 | 51_75 | 76_100 |
    over_100``). ``count`` is the number of people in scope whose mean
    utilization across the visible window falls in that range.
    """
    bucket: str
    count: int


class UtilizationDistributionResponse(BaseModel):
    items: list[UtilizationDistributionBucket]
    total_people: int
    scope: str
    start: str
    end: str


class HotspotItem(BaseModel):
    """One ranked capacity issue per spec §11.6.

    ``category`` is one of ``over_allocation`` / ``unfulfilled_demand`` /
    ``under_utilization``. ``severity`` is the raw weight (used for
    ranking; UI sorts client-side as a sanity check). ``target_id`` /
    ``target_type`` carry just enough metadata for the row-click handler
    to open the right side panel: person detail vs. demand detail.
    """
    category: str
    severity: float
    summary: str
    target_id: str
    target_type: str  # person / role / request


class HotspotResponse(BaseModel):
    items: list[HotspotItem]
    total: int
    scope: str


# ---------------------------------------------------------------------------
# v5.2 W1 §12.15 — Capacity history (audit trail) endpoint
# ---------------------------------------------------------------------------


class CapacityHistoryEntry(BaseModel):
    """One row in the capacity audit history per spec §12.13.

    ``detail_payload`` is the parsed JSON object from
    ``capacity_action_log.detail_payload`` (NOT the raw string per §12.15).
    Joined names (project / user / cost-centre) are included so the UI does
    not need lookup round-trips.
    """
    id: int
    timestamp: datetime
    action_type: str
    acting_user_id: str
    acting_user_name: str
    project_id: str
    project_name: Optional[str] = None
    cost_center_id: str
    cost_center_name: Optional[str] = None
    summary: str
    detail_payload: Optional[dict[str, Any]] = None
    cr_id: Optional[int] = None


class CapacityHistoryResponse(BaseModel):
    items: list[CapacityHistoryEntry]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------------------
# v5.2 W3 §12.3 — Resource Requests inbox (project-per-CC triage queue)
# ---------------------------------------------------------------------------


class CapacityInboxRoleBadge(BaseModel):
    """One role-aggregated badge inside an inbox row.

    The inbox shows compact role badges like ``"Sr Dev ×1"`` so the CC Owner
    can scan a project's required-roles mix without expanding the row.
    """
    role_type_id: str
    role_name: str
    count: int


class CapacityInboxItem(BaseModel):
    """One row in the inbox table — one project-per-cost-center per spec §12.3.

    A project that fans out across multiple CCs appears as multiple rows
    (one per CC). A project with a pending Change Request appears as a
    distinct row with ``type='change_request'`` and ``cr_id`` populated.

    ``status`` derivation (per spec §12.3 / §12.5):
      * ``new``         — no resource-request assignments exist for this group.
      * ``in_progress`` — at least one assignment row exists (draft saved).
      * ``re_confirm``  — group is CR-triggered (``cr_id`` is non-null).

    ``project_priority`` is derived from the highest-priority ResourceRequest
    in the group (high > medium > low). Projects without a dedicated priority
    column inherit triage urgency from their requests.
    """
    project_id: str
    project_name: str
    project_priority: str  # high | medium | low
    hierarchy_node_name: Optional[str] = None
    type: str  # 'project' | 'change_request'
    cr_id: Optional[int] = None
    cr_summary: Optional[str] = None
    cc_id: str
    cc_name: str
    pl_person_id: Optional[str] = None
    pl_name: Optional[str] = None
    role_badges: list[CapacityInboxRoleBadge]
    unassigned_hours: float
    age_days: int
    status: str  # 'new' | 'in_progress' | 're_confirm'
    earliest_request_date: datetime


class CapacityInboxResponse(BaseModel):
    items: list[CapacityInboxItem]
    total: int
