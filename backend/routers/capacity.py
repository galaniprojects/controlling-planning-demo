"""Capacity Management endpoints (Section 10.5) — 14 endpoints."""
from __future__ import annotations
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from config import DEMO_DATE
from database import get_db
from dependencies import get_current_user, require_role
from models.capacity import Allocation, ResourceRequest, ResourceRequestAssignment
from models.change_requests import ChangeRequest
from models.financial import Forecast
from models.people import RateTable
from models.organization import CostCenter, GroupingEntity, Location
from services.portfolio_service import _get_projects_for_entity_recursive, get_project_entity_info, get_top_level_entity_type_id
from models.people import Person, RoleType
from models.projects import Project
from schemas.capacity import (
    CapacityContext, ConfirmRequest, CounterProposeRequest, DeclineRequest,
    ExternalCapacityRow, OrgExternalSummary, OrgHeatmapRow, OrgSummary,
    PartialFulfillRequest, PersonHeatmapRow, RequestItem,
    RoleAvailabilityResponse, RoleAvailabilityRow, RoleHeatmapRow,
    SaveAssignmentsRequest, TeamSummary, UtilizationCell,
)
from schemas.common import CurrentUser
from services.calculations import (
    FTE_HOURS, add_months, compute_utilization_pct, generate_month_range,
    get_standard_hours, resolve_hourly_rate, utilization_color_bucket,
)

router = APIRouter(prefix="/api/capacity", tags=["Capacity Management"])


def _verify_cc_access(user: CurrentUser, cost_center_id: str):
    """Verify user owns the cost center (CC owners only see their own CC)."""
    if user.role == "cost_center_owner" and user.cost_center_id != cost_center_id:
        raise HTTPException(403, "Forbidden: cannot access other cost centers")


# ---------------------------------------------------------------------------
# v5.1 C-07 — synthetic 'External' row inside team-heatmap role groups
# ---------------------------------------------------------------------------

def compute_external_role_rows(
    db: Session,
    cost_center_id: str,
    role_ids: list[str],
    months: list[str],
) -> dict[str, ExternalCapacityRow]:
    """Compute one ``ExternalCapacityRow`` per role for the team heatmap.

    Aggregates ``Forecast`` rows where ``category='external'`` and
    ``role_type_id`` is one of ``role_ids``, scoped to projects that the
    cost-center's people are allocated to. For each (role, month) it sums
    ``amount_eur`` and converts to FTE-equivalent via
    ``amount_eur / hourly_rate / FTE_HOURS``. Hourly rate is resolved via
    ``resolve_hourly_rate(role_id, competence_center_id=None, month)``
    because external resources have no Person.competence_center_id.

    Returns a mapping ``{role_id: ExternalCapacityRow}``. Roles with no
    matching external forecast across the entire window are omitted from
    the result so the caller can leave ``RoleHeatmapRow.external = None``.
    """
    if not role_ids or not months:
        return {}

    # Scope: projects this cost-center's people are allocated to in the window.
    cc_person_ids = [
        p.id for p in db.query(Person.id)
        .filter(Person.cost_center_id == cost_center_id, Person.is_active.is_(True))
        .all()
    ]
    if not cc_person_ids:
        return {}

    project_id_rows = (
        db.query(Allocation.project_id)
        .filter(
            Allocation.person_id.in_(cc_person_ids),
            Allocation.month >= months[0],
            Allocation.month <= months[-1],
        )
        .distinct()
        .all()
    )
    project_ids = [r[0] for r in project_id_rows if r[0]]
    if not project_ids:
        return {}

    # Pull all matching external Forecast rows in one query.
    ext_rows = (
        db.query(Forecast)
        .filter(
            Forecast.project_id.in_(project_ids),
            Forecast.category == "external",
            Forecast.role_type_id.in_(role_ids),
            Forecast.month.in_(months),
        )
        .all()
    )
    if not ext_rows:
        return {}

    # Aggregate amount_eur per (role_id, month).
    sums: dict[tuple[str, str], float] = {}
    for f in ext_rows:
        key = (f.role_type_id, f.month)
        sums[key] = sums.get(key, 0.0) + float(f.amount_eur or 0)

    # Build ExternalCapacityRow per role with cells for ALL months in the
    # window (zero-fill for months without any matching forecast). Only emit
    # the row if at least one month is non-zero.
    result: dict[str, ExternalCapacityRow] = {}
    for role_id in role_ids:
        cells: list[UtilizationCell] = []
        any_nonzero = False
        for m in months:
            amt = sums.get((role_id, m), 0.0)
            if amt > 0:
                rate = float(resolve_hourly_rate(db, role_id, None, m))
                fte = amt / rate / FTE_HOURS if (rate and FTE_HOURS) else 0.0
                fte = round(fte, 2)
                if fte > 0:
                    any_nonzero = True
            else:
                fte = 0.0
            cells.append(UtilizationCell(
                month=m,
                value=fte,
                color=utilization_color_bucket(fte * 100),
                allocated_hours=None,
                standard_hours=None,
            ))
        if any_nonzero:
            result[role_id] = ExternalCapacityRow(label="External", fte_equivalent=cells)

    return result


def _compute_org_role_external_summary(
    db: Session,
    role_id: str,
    months: list[str],
) -> OrgExternalSummary:
    """Lightweight roll-up surfaced by the org-heatmap role pivot.

    Counts the number of distinct projects with external Forecast lines
    tagged with this ``role_id`` in the visible window, and computes the
    average monthly FTE-equivalent across the same window using
    ``resolve_hourly_rate(role_id, None, month)``. Returns a zeroed summary
    when nothing matches.
    """
    if not months:
        return OrgExternalSummary()

    rows = (
        db.query(Forecast)
        .filter(
            Forecast.category == "external",
            Forecast.role_type_id == role_id,
            Forecast.month.in_(months),
        )
        .all()
    )
    if not rows:
        return OrgExternalSummary()

    project_ids = {r.project_id for r in rows if r.project_id}
    # Aggregate amount per month, then convert to FTE per month, then average.
    per_month: dict[str, float] = {}
    for r in rows:
        per_month[r.month] = per_month.get(r.month, 0.0) + float(r.amount_eur or 0)

    total_fte = 0.0
    for m, amt in per_month.items():
        rate = float(resolve_hourly_rate(db, role_id, None, m))
        if rate and FTE_HOURS:
            total_fte += amt / rate / FTE_HOURS
    avg_fte = total_fte / len(months) if months else 0.0

    return OrgExternalSummary(
        count=len(project_ids),
        total_fte=round(avg_fte, 2),
    )


@router.get("/context")
def get_capacity_context(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Get capacity module landing context."""
    pending = 0
    if user.cost_center_id:
        pending = (
            db.query(func.count(ResourceRequest.id))
            .filter(ResourceRequest.cost_center_id == user.cost_center_id, ResourceRequest.status == "pending")
            .scalar()
        )
    default_tab = "my-team"
    return CapacityContext(
        default_tab=default_tab,
        managed_cost_center_id=user.cost_center_id,
        pending_request_count=pending,
    )


# ---------------------------------------------------------------------------
# My Team (3 endpoints)
# ---------------------------------------------------------------------------

@router.get("/my-team/{cost_center_id}/summary")
def get_team_summary(
    cost_center_id: str,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """Get team summary for a cost center."""
    _verify_cc_access(_user, cost_center_id)
    people = db.query(Person).filter(Person.cost_center_id == cost_center_id, Person.is_active.is_(True)).all()
    headcount = len(people)

    person_ids = [p.id for p in people]
    alloc_data = (
        db.query(Allocation.person_id, func.sum(Allocation.hours).label("total"))
        .filter(Allocation.person_id.in_(person_ids), Allocation.month == DEMO_DATE)
        .group_by(Allocation.person_id).all()
    ) if person_ids else []

    alloc_map = {r.person_id: float(r.total) for r in alloc_data}
    utils = [compute_utilization_pct(alloc_map.get(p.id, 0)) for p in people]
    avg_util = round(sum(utils) / len(utils), 1) if utils else 0
    over_count = sum(1 for u in utils if u > 100)

    pending = (
        db.query(func.count(ResourceRequest.id))
        .filter(ResourceRequest.cost_center_id == cost_center_id, ResourceRequest.status == "pending")
        .scalar()
    )

    return TeamSummary(
        headcount=headcount, avg_utilization_pct=avg_util,
        over_allocated_count=over_count, pending_request_count=pending,
    )


@router.get("/my-team/{cost_center_id}/heatmap")
def get_team_heatmap(
    cost_center_id: str,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
    from_month: str | None = None,
    to_month: str | None = None,
):
    """Get team heatmap (person utilization by month)."""
    _verify_cc_access(_user, cost_center_id)
    if not from_month:
        from_month = DEMO_DATE
    if not to_month:
        to_month = add_months(DEMO_DATE, 11)

    months = generate_month_range(from_month, to_month)

    # Look up standard hours for this cost center's location
    cc = db.query(CostCenter).filter(CostCenter.id == cost_center_id).first()
    std_hours = get_standard_hours(db, cc.location_id) if cc else FTE_HOURS

    people = (
        db.query(Person).filter(Person.cost_center_id == cost_center_id, Person.is_active.is_(True))
        .order_by(Person.role_type_id, Person.name).all()
    )
    person_ids = [p.id for p in people]

    allocations = (
        db.query(Allocation)
        .filter(Allocation.person_id.in_(person_ids), Allocation.month >= from_month, Allocation.month <= to_month)
        .all()
    ) if person_ids else []

    alloc_map = {}
    for a in allocations:
        alloc_map.setdefault(a.person_id, {}).setdefault(a.month, 0)
        alloc_map[a.person_id][a.month] += float(a.hours)

    # Group by role
    role_groups = {}
    for p in people:
        role_groups.setdefault(p.role_type_id, []).append(p)

    role_rows = []
    for role_id, role_people in role_groups.items():
        role = db.query(RoleType).filter(RoleType.id == role_id).first()
        people_rows = []
        for person in role_people:
            cells = []
            for m in months:
                hours = alloc_map.get(person.id, {}).get(m, 0)
                pct = round((hours / std_hours) * 100, 1) if std_hours else 0
                cells.append(UtilizationCell(
                    month=m, value=pct, color=utilization_color_bucket(pct),
                    allocated_hours=round(hours, 1), standard_hours=std_hours,
                ))
            people_rows.append(PersonHeatmapRow(person_id=person.id, name=person.name, utilization=cells))

        # Aggregate
        agg = []
        for i, m in enumerate(months):
            vals = [pr.utilization[i].value for pr in people_rows]
            avg = round(sum(vals) / len(vals), 1) if vals else 0
            total_alloc = sum(pr.utilization[i].allocated_hours or 0 for pr in people_rows)
            total_std = std_hours * len(people_rows)
            agg.append(UtilizationCell(
                month=m, value=avg, color=utilization_color_bucket(avg),
                allocated_hours=round(total_alloc, 1), standard_hours=round(total_std, 1),
            ))

        role_rows.append(RoleHeatmapRow(
            role_id=role_id, role_name=role.name if role else role_id,
            aggregate_utilization=agg, people=people_rows,
        ))

    # v5.1 C-07: attach synthetic 'External' rows for roles that have
    # external-cost forecast lines tagged with role_type_id in the same
    # in-scope projects.
    external_by_role = compute_external_role_rows(
        db, cost_center_id, list(role_groups.keys()), months,
    )
    for row in role_rows:
        if row.role_id in external_by_role:
            row.external = external_by_role[row.role_id]

    return {"items": role_rows, "total": len(role_rows)}


@router.get("/my-team/{cost_center_id}/people/{person_id}/detail")
def get_person_detail(
    cost_center_id: str, person_id: str,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """Get person detail with project allocations."""
    _verify_cc_access(_user, cost_center_id)
    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(404, "Person not found")

    months = generate_month_range(DEMO_DATE, add_months(DEMO_DATE, 11))

    allocations = (
        db.query(Allocation)
        .filter(Allocation.person_id == person_id, Allocation.month >= DEMO_DATE)
        .order_by(Allocation.month).all()
    )

    by_month = {}
    for a in allocations:
        entry = by_month.setdefault(a.month, [])
        proj = db.query(Project).filter(Project.id == a.project_id).first()
        entry.append({"project_id": a.project_id, "project_name": proj.name if proj else a.project_id, "hours": float(a.hours)})

    alloc_by_month = []
    for m in months:
        projects = by_month.get(m, [])
        total = sum(p["hours"] for p in projects)
        alloc_by_month.append({"month": m, "total_hours": total, "utilization_pct": compute_utilization_pct(total), "projects": projects})

    pending = (
        db.query(ResourceRequest)
        .filter(ResourceRequest.assigned_person_id == person_id, ResourceRequest.status == "pending")
        .all()
    )
    pending_items = [{"id": r.id, "project_id": r.project_id, "hours": float(r.hours_or_amount_per_month)} for r in pending]

    return {
        "person_id": person.id, "name": person.name,
        "role": person.role_type.name if person.role_type else "",
        "allocations_by_month": alloc_by_month,
        "pending_requests": pending_items,
    }


# ---------------------------------------------------------------------------
# Request Management (7 endpoints)
# ---------------------------------------------------------------------------

def _get_request(db: Session, cost_center_id: str, request_id: int) -> ResourceRequest:
    req = db.query(ResourceRequest).filter(ResourceRequest.id == request_id, ResourceRequest.cost_center_id == cost_center_id).first()
    if not req:
        raise HTTPException(404, "Request not found")
    return req


def _request_to_dict(r: ResourceRequest, db: Session) -> dict:
    proj = db.query(Project).filter(Project.id == r.project_id).first()
    role_or_ct = ""
    if r.role_type_id:
        rt = db.query(RoleType).filter(RoleType.id == r.role_type_id).first()
        role_or_ct = rt.name if rt else r.role_type_id
    elif r.cost_type_id:
        role_or_ct = r.cost_type_id

    # Find currently allocated person for this role on this project
    currently_allocated = None
    if r.role_type_id and r.request_type == "resource":
        alloc_person = (
            db.query(Person)
            .join(Allocation, Allocation.person_id == Person.id)
            .filter(
                Allocation.project_id == r.project_id,
                Person.role_type_id == r.role_type_id,
                Allocation.hours > 0,
            )
            .first()
        )
        if alloc_person:
            currently_allocated = {"id": alloc_person.id, "name": alloc_person.name}

    return {
        "id": r.id, "project_id": r.project_id,
        "project_name": proj.name if proj else r.project_id,
        "request_type": r.request_type,
        "role_or_cost_type": role_or_ct,
        "hours_or_amount": float(r.hours_or_amount_per_month),
        "original_hours": float(r.original_hours_per_month) if r.original_hours_per_month is not None else None,
        "change_direction": r.change_direction,
        "period_start": r.period_start, "period_end": r.period_end,
        "priority": r.priority, "status": r.status,
        "assigned_person_id": r.assigned_person_id,
        "explanation": r.explanation,
        "currently_allocated": currently_allocated,
    }


def _create_allocations_from_assignments(db: Session, req: ResourceRequest):
    """Create/adjust Allocation records from a ResourceRequest's assignments.

    Called when a request is confirmed. For increases, adds hours. For decreases,
    subtracts hours from existing allocations.
    """
    if req.request_type != "resource":
        return  # External cost requests don't create allocations

    is_decrease = req.change_direction == "decrease"

    assignments = (
        db.query(ResourceRequestAssignment)
        .filter(ResourceRequestAssignment.resource_request_id == req.id)
        .all()
    )

    if assignments:
        for a in assignments:
            existing = db.query(Allocation).filter(
                Allocation.person_id == a.person_id,
                Allocation.project_id == req.project_id,
                Allocation.month == a.month,
            ).first()
            if existing:
                if is_decrease:
                    existing.hours = max(0, float(existing.hours) - float(a.hours))
                else:
                    existing.hours = float(existing.hours) + float(a.hours)
            elif not is_decrease:
                db.add(Allocation(
                    person_id=a.person_id,
                    project_id=req.project_id,
                    month=a.month,
                    hours=float(a.hours),
                    is_confirmed=True,
                ))
    elif req.assigned_person_id:
        months = generate_month_range(req.period_start, req.period_end)
        for m in months:
            existing = db.query(Allocation).filter(
                Allocation.person_id == req.assigned_person_id,
                Allocation.project_id == req.project_id,
                Allocation.month == m,
            ).first()
            if existing:
                if is_decrease:
                    existing.hours = max(0, float(existing.hours) - float(req.hours_or_amount_per_month))
                else:
                    existing.hours = float(existing.hours) + float(req.hours_or_amount_per_month)
            elif not is_decrease:
                db.add(Allocation(
                    person_id=req.assigned_person_id,
                    project_id=req.project_id,
                    month=m,
                    hours=float(req.hours_or_amount_per_month),
                    is_confirmed=True,
                ))


@router.get("/requests/{cost_center_id}")
def get_request_queue(
    cost_center_id: str,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """Get resource request queue for a cost center."""
    _verify_cc_access(_user, cost_center_id)
    requests = (
        db.query(ResourceRequest)
        .filter(ResourceRequest.cost_center_id == cost_center_id)
        .order_by(ResourceRequest.created_at.desc()).all()
    )
    items = [_request_to_dict(r, db) for r in requests]
    return {"items": items, "total": len(items)}


@router.get("/requests/{cost_center_id}/{request_id}")
def get_request_detail(
    cost_center_id: str, request_id: int,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """Get resource request detail."""
    _verify_cc_access(_user, cost_center_id)
    req = _get_request(db, cost_center_id, request_id)
    return _request_to_dict(req, db)


@router.get("/requests/{cost_center_id}/{request_id}/monthly-hours")
def get_request_monthly_hours(
    cost_center_id: str, request_id: int,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """Get actual per-month forecast hours for a resource request."""
    _verify_cc_access(_user, cost_center_id)
    req = _get_request(db, cost_center_id, request_id)

    category = "internal" if req.request_type == "resource" else "external"
    sub_cat = req.role_type_id if category == "internal" else req.cost_type_id
    months = generate_month_range(req.period_start, req.period_end)

    # Aggregate forecast by month (may have multiple rows per month)
    forecasts = (
        db.query(
            Forecast.month,
            func.sum(Forecast.hours).label("total_hours"),
            func.sum(Forecast.amount_eur).label("total_amount"),
        )
        .filter(
            Forecast.project_id == req.project_id,
            Forecast.category == category,
            Forecast.sub_category == sub_cat,
            Forecast.month.in_(months),
        )
        .group_by(Forecast.month)
        .order_by(Forecast.month)
        .all()
    )

    forecast_map: dict[str, dict] = {}
    for f in forecasts:
        forecast_map[f.month] = {
            "month": f.month,
            "hours": float(f.total_hours) if f.total_hours is not None else 0,
            "amount_eur": float(f.total_amount) if f.total_amount is not None else 0,
        }

    # Build items, filling missing months with the average from the request
    items = []
    for m in months:
        if m in forecast_map:
            items.append(forecast_map[m])
        else:
            items.append({
                "month": m,
                "hours": float(req.hours_or_amount_per_month) if category == "internal" else 0,
                "amount_eur": float(req.hours_or_amount_per_month) if category == "external" else 0,
            })

    return {"items": items, "total": len(items)}


@router.get("/requests/{cost_center_id}/{request_id}/assignments")
def get_request_assignments(
    cost_center_id: str, request_id: int,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """Get current per-month assignments for a resource request."""
    _verify_cc_access(_user, cost_center_id)
    req = _get_request(db, cost_center_id, request_id)

    assignments = (
        db.query(ResourceRequestAssignment)
        .filter(ResourceRequestAssignment.resource_request_id == req.id)
        .order_by(ResourceRequestAssignment.month)
        .all()
    )

    items = []
    for a in assignments:
        person = db.query(Person).filter(Person.id == a.person_id).first()
        items.append({
            "month": a.month,
            "person_id": a.person_id,
            "person_name": person.name if person else a.person_id,
            "hours": float(a.hours),
        })

    return {"items": items, "total": len(items)}


@router.put("/requests/{cost_center_id}/{request_id}/assignments")
def save_request_assignments(
    cost_center_id: str, request_id: int,
    body: SaveAssignmentsRequest,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role("cost_center_owner", "controller")),
):
    """Save per-month person assignments for a resource request."""
    _verify_cc_access(_user, cost_center_id)
    req = _get_request(db, cost_center_id, request_id)

    if req.status not in ("pending", "confirmed"):
        raise HTTPException(409, f"Request status is '{req.status}', cannot assign")

    valid_months = set(generate_month_range(req.period_start, req.period_end))

    # Validate assignments
    seen_months: set[str] = set()
    for entry in body.assignments:
        if entry.month not in valid_months:
            raise HTTPException(400, f"Month '{entry.month}' is outside request period")
        if entry.month in seen_months:
            raise HTTPException(400, f"Duplicate month '{entry.month}'")
        seen_months.add(entry.month)

        person = db.query(Person).filter(
            Person.id == entry.person_id, Person.is_active == True
        ).first()
        if not person:
            raise HTTPException(400, f"Person '{entry.person_id}' not found or inactive")

    # Build forecast hours lookup (aggregated by month)
    category = "internal" if req.request_type == "resource" else "external"
    sub_cat = req.role_type_id if category == "internal" else req.cost_type_id
    forecast_rows = (
        db.query(
            Forecast.month,
            func.sum(Forecast.hours).label("total_hours"),
            func.sum(Forecast.amount_eur).label("total_amount"),
        )
        .filter(
            Forecast.project_id == req.project_id,
            Forecast.category == category,
            Forecast.sub_category == sub_cat,
        )
        .group_by(Forecast.month)
        .all()
    )
    forecast_hours: dict[str, float] = {}
    for f in forecast_rows:
        if category == "internal":
            forecast_hours[f.month] = float(f.total_hours) if f.total_hours is not None else 0
        else:
            forecast_hours[f.month] = float(f.total_amount) if f.total_amount is not None else 0

    # Delete existing assignments
    db.query(ResourceRequestAssignment).filter(
        ResourceRequestAssignment.resource_request_id == req.id
    ).delete()

    # Insert new assignments
    for entry in body.assignments:
        hours = forecast_hours.get(entry.month, float(req.hours_or_amount_per_month))
        db.add(ResourceRequestAssignment(
            resource_request_id=req.id,
            month=entry.month,
            person_id=entry.person_id,
            hours=hours,
        ))

    # Update assigned_person_id to most-frequently-assigned person (backward compat)
    if body.assignments:
        from collections import Counter
        person_counts = Counter(e.person_id for e in body.assignments)
        req.assigned_person_id = person_counts.most_common(1)[0][0]

    db.commit()

    # Return saved assignments
    return get_request_assignments(cost_center_id, request_id, db, _user)


@router.get("/requests/{cost_center_id}/{request_id}/assignment-preview")
def get_assignment_preview(
    cost_center_id: str, request_id: int,
    person_id: str,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """Preview assignment impact on a person's utilization."""
    _verify_cc_access(_user, cost_center_id)
    req = _get_request(db, cost_center_id, request_id)
    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(404, "Person not found")

    months = generate_month_range(req.period_start, req.period_end)
    projections = []
    exceeds = False
    for m in months:
        current = (
            db.query(func.coalesce(func.sum(Allocation.hours), 0))
            .filter(Allocation.person_id == person_id, Allocation.month == m)
            .scalar()
        )
        new_total = float(current) + float(req.hours_or_amount_per_month)
        pct = compute_utilization_pct(new_total)
        if pct > 100:
            exceeds = True
        projections.append({"month": m, "current_hours": float(current), "added_hours": float(req.hours_or_amount_per_month), "total_hours": new_total, "utilization_pct": pct})

    return {
        "person_id": person_id, "person_name": person.name,
        "monthly_projections": projections, "exceeds_100_pct": exceeds,
        "recommendation": "Caution: over-allocation detected" if exceeds else "Assignment within capacity",
    }


@router.put("/requests/{cost_center_id}/{request_id}/confirm")
def confirm_request(
    cost_center_id: str, request_id: int,
    body: ConfirmRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("cost_center_owner", "controller")),
):
    """Confirm a resource request with assigned person."""
    req = _get_request(db, cost_center_id, request_id)
    if req.status != "pending":
        raise HTTPException(409, f"Request status is '{req.status}', expected 'pending'")
    req.status = "confirmed"
    if body.assigned_person_id:
        req.assigned_person_id = body.assigned_person_id
    # Create Allocations from assignments
    _create_allocations_from_assignments(db, req)
    # Advance linked CR — route to Controller for final approval
    if req.change_request_id:
        cr = db.query(ChangeRequest).filter(ChangeRequest.id == req.change_request_id).first()
        if cr and cr.status == "pending_cc_confirmation":
            cr.cc_owner_id = user.person_id
            cr.cc_status = "confirmed"
            cr.cc_confirmation_timestamp = datetime.utcnow()
            cr.status = "pending_controller_approval"
    db.commit()
    return _request_to_dict(req, db)


@router.put("/requests/{cost_center_id}/{request_id}/partially-fulfill")
def partially_fulfill_request(
    cost_center_id: str, request_id: int,
    body: PartialFulfillRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("cost_center_owner", "controller")),
):
    """Partially fulfill a resource request."""
    req = _get_request(db, cost_center_id, request_id)
    req.status = "partially_fulfilled"
    req.adjusted_value = body.adjusted_value
    req.assigned_person_id = body.assigned_person_id
    if req.change_request_id:
        cr = db.query(ChangeRequest).filter(ChangeRequest.id == req.change_request_id).first()
        if cr and cr.status == "pending_cc_confirmation":
            cr.cc_owner_id = user.person_id
            cr.cc_status = "confirmed"
            cr.cc_confirmation_timestamp = datetime.utcnow()
            cr.status = "pending_controller_approval"
    db.commit()
    return _request_to_dict(req, db)


@router.put("/requests/{cost_center_id}/{request_id}/counter-propose")
def counter_propose_request(
    cost_center_id: str, request_id: int,
    body: CounterProposeRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("cost_center_owner", "controller")),
):
    """Counter-propose for a resource request."""
    req = _get_request(db, cost_center_id, request_id)
    req.status = "counter_proposed"
    req.explanation = body.explanation
    if req.change_request_id:
        cr = db.query(ChangeRequest).filter(ChangeRequest.id == req.change_request_id).first()
        if cr and cr.status == "pending_cc_confirmation":
            cr.cc_owner_id = user.person_id
            cr.cc_status = "confirmed"
            cr.cc_confirmation_timestamp = datetime.utcnow()
            cr.status = "pending_controller_approval"
    db.commit()
    return _request_to_dict(req, db)


@router.put("/requests/{cost_center_id}/{request_id}/decline")
def decline_request(
    cost_center_id: str, request_id: int,
    body: DeclineRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("cost_center_owner", "controller")),
):
    """Decline a resource request."""
    req = _get_request(db, cost_center_id, request_id)
    req.status = "declined"
    req.explanation = body.reason
    if req.change_request_id:
        cr = db.query(ChangeRequest).filter(ChangeRequest.id == req.change_request_id).first()
        if cr and cr.status == "pending_cc_confirmation":
            cr.status = "sent_back_by_cc"
            cr.cc_owner_id = user.person_id
            cr.cc_status = "declined"
            cr.cc_comments = body.reason
    db.commit()
    return _request_to_dict(req, db)


# ---------------------------------------------------------------------------
# Project-Level Confirmation (3 endpoints)
# ---------------------------------------------------------------------------


@router.get("/project-confirmation/pending")
def get_pending_project_confirmations(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("cost_center_owner", "controller")),
):
    """List projects and change requests awaiting CC resource confirmation."""
    items = []
    top_type = get_top_level_entity_type_id(db)

    # --- Projects awaiting CC confirmation ---
    projects = (
        db.query(Project)
        .filter(Project.status == "pending_cc_confirmation")
        .all()
    )
    for p in projects:
        entity_info = get_project_entity_info(db, p.id, top_type)
        pl = db.query(Person).filter(Person.id == p.pl_person_id).first() if p.pl_person_id else None
        req_count = (
            db.query(func.count(ResourceRequest.id))
            .filter(ResourceRequest.project_id == p.id, ResourceRequest.status == "pending")
            .scalar()
        )
        items.append({
            "id": p.id,
            "type": "project",
            "name": p.name,
            "lob_name": entity_info["name"] if entity_info else "Unknown",
            "pl_name": pl.name if pl else None,
            "start_month": p.start_month,
            "end_month": p.end_month,
            "resource_request_count": req_count,
            "submitted_at": p.modified_at.isoformat() if p.modified_at else None,
        })

    # --- Change Requests awaiting CC confirmation ---
    pending_crs = (
        db.query(ChangeRequest)
        .filter(ChangeRequest.status == "pending_cc_confirmation")
        .all()
    )
    for cr in pending_crs:
        project = db.query(Project).filter(Project.id == cr.project_id).first()
        if not project:
            continue
        entity_info = get_project_entity_info(db, project.id, top_type)
        pl = db.query(Person).filter(Person.id == project.pl_person_id).first() if project.pl_person_id else None
        req_count = (
            db.query(func.count(ResourceRequest.id))
            .filter(
                ResourceRequest.change_request_id == cr.id,
                ResourceRequest.status == "pending",
            )
            .scalar()
        )
        items.append({
            "id": project.id,
            "type": "change_request",
            "cr_id": cr.id,
            "name": project.name,
            "cr_summary": cr.summary or f"CR #{cr.id}",
            "lob_name": entity_info["name"] if entity_info else "Unknown",
            "pl_name": pl.name if pl else None,
            "start_month": project.start_month,
            "end_month": project.end_month,
            "resource_request_count": req_count,
            "submitted_at": cr.submission_timestamp.isoformat() if cr.submission_timestamp else None,
        })

    return {"items": items, "total": len(items)}


@router.get("/project-assignment/{project_id}")
def get_project_assignment_detail(
    project_id: str,
    cr: int | None = None,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("cost_center_owner", "controller")),
):
    """Get project detail with all resource requests and their assignments for the assignment page.

    When *cr* query param is provided, only resource requests linked to that
    change request are returned.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")

    entity_info = get_project_entity_info(db, project.id, get_top_level_entity_type_id(db))
    pl = db.query(Person).filter(Person.id == project.pl_person_id).first() if project.pl_person_id else None

    # Get resource requests — optionally scoped to a specific CR
    rr_query = db.query(ResourceRequest).filter(ResourceRequest.project_id == project_id)
    if cr is not None:
        rr_query = rr_query.filter(ResourceRequest.change_request_id == cr)
    requests = rr_query.order_by(ResourceRequest.request_type, ResourceRequest.created_at).all()

    request_items = []
    for r in requests:
        rd = _request_to_dict(r, db)
        # Include assignment count
        assignment_count = (
            db.query(func.count(ResourceRequestAssignment.id))
            .filter(ResourceRequestAssignment.resource_request_id == r.id)
            .scalar()
        )
        months = generate_month_range(r.period_start, r.period_end)
        rd["assignment_count"] = assignment_count
        rd["total_months"] = len(months)
        rd["fully_assigned"] = assignment_count >= len(months)
        request_items.append(rd)

    all_fully_assigned = all(
        r["fully_assigned"] for r in request_items
        if r["request_type"] == "resource" and r.get("status") == "pending"
    )

    # Determine cost center ID from the requests
    cc_id = requests[0].cost_center_id if requests else None

    # Include CR metadata when scoped to a change request
    cr_info = None
    if cr is not None:
        cr_obj = db.query(ChangeRequest).filter(ChangeRequest.id == cr).first()
        if cr_obj:
            cr_info = {
                "id": cr_obj.id,
                "summary": cr_obj.summary,
                "status": cr_obj.status,
            }

    return {
        "project": {
            "id": project.id,
            "name": project.name,
            "description": project.description,
            "lob_name": entity_info["name"] if entity_info else "Unknown",
            "pl_name": pl.name if pl else None,
            "start_month": project.start_month,
            "end_month": project.end_month,
            "status": project.status,
        },
        "cost_center_id": cc_id,
        "requests": request_items,
        "all_resource_requests_assigned": all_fully_assigned,
        "change_request": cr_info,
    }


@router.put("/project-confirmation/{project_id}/confirm")
def confirm_project_resources(
    project_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("cost_center_owner", "controller")),
):
    """CC Owner confirms resources for a project. Status -> pending_approval."""
    from models.system import Notification

    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    if project.status != "pending_cc_confirmation":
        raise HTTPException(409, f"Project status is '{project.status}', expected 'pending_cc_confirmation'")

    # Confirm all pending resource requests and create Allocations from assignments
    pending_requests = (
        db.query(ResourceRequest)
        .filter(ResourceRequest.project_id == project_id, ResourceRequest.status == "pending")
        .all()
    )
    for req in pending_requests:
        req.status = "confirmed"
        _create_allocations_from_assignments(db, req)

    project.status = "pending_approval"

    # Notify controller (Anna Schneider = p-schneider)
    db.add(Notification(
        user_person_id="p-schneider",
        message=f"Project '{project.name}' ready for review — resources confirmed",
        severity="action",
        deep_link_module="portfolio",
        deep_link_entity_id=project.id,
        deep_link_tab="intake",
    ))

    # Notify PL
    if project.pl_person_id:
        db.add(Notification(
            user_person_id=project.pl_person_id,
            message=f"Your project '{project.name}' is in the intake queue",
            severity="info",
            deep_link_module="portfolio",
            deep_link_entity_id=project.id,
            deep_link_tab="intake",
        ))

    db.commit()
    db.refresh(project)

    return {"id": project.id, "name": project.name, "status": project.status}


@router.put("/project-confirmation/{project_id}/decline")
def decline_project_resources(
    project_id: str,
    body: DeclineRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("cost_center_owner", "controller")),
):
    """CC Owner declines resources for a project. Status -> changes_requested."""
    from models.system import Notification

    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    if project.status != "pending_cc_confirmation":
        raise HTTPException(409, f"Project status is '{project.status}', expected 'pending_cc_confirmation'")

    # Decline all pending resource requests
    pending_requests = (
        db.query(ResourceRequest)
        .filter(ResourceRequest.project_id == project_id, ResourceRequest.status == "pending")
        .all()
    )
    for req in pending_requests:
        req.status = "declined"
        req.explanation = body.reason

    project.status = "changes_requested"
    project.submission_feedback = body.reason

    # Notify PL
    if project.pl_person_id:
        db.add(Notification(
            user_person_id=project.pl_person_id,
            message=f"CC Owner declined resources for '{project.name}'",
            severity="action",
            deep_link_module="workbench",
            deep_link_entity_id=project.id,
            deep_link_tab="diff",
        ))

    db.commit()
    db.refresh(project)

    return {"id": project.id, "name": project.name, "status": project.status}


# ---------------------------------------------------------------------------
# Organization Overview (3 endpoints)
# ---------------------------------------------------------------------------

@router.get("/org/summary")
def get_org_summary(
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """Get organization-wide capacity summary."""
    total_headcount = db.query(func.count(Person.id)).filter(Person.is_active.is_(True), Person.cost_center_id.isnot(None)).scalar()

    alloc_total = (
        db.query(func.coalesce(func.sum(Allocation.hours), 0))
        .filter(Allocation.month == DEMO_DATE).scalar()
    )
    avg_util = compute_utilization_pct(float(alloc_total) / total_headcount) if total_headcount > 0 else 0

    # Count CCs with over-allocation
    cc_ids = [cc.id for cc in db.query(CostCenter).all()]
    over_count = 0
    for cc_id in cc_ids:
        people = db.query(Person).filter(Person.cost_center_id == cc_id, Person.is_active.is_(True)).all()
        for p in people:
            hours = (
                db.query(func.coalesce(func.sum(Allocation.hours), 0))
                .filter(Allocation.person_id == p.id, Allocation.month == DEMO_DATE).scalar()
            )
            if compute_utilization_pct(float(hours)) > 100:
                over_count += 1
                break

    # Count CRs pending controller approval
    pending_controller = db.query(func.count(ChangeRequest.id)).filter(
        ChangeRequest.status == "pending_controller_approval",
    ).scalar()

    return OrgSummary(
        total_headcount=total_headcount,
        avg_utilization_pct=avg_util,
        over_allocated_cc_count=over_count,
        pending_controller_approval_count=pending_controller,
    )


@router.get("/org/heatmap")
def get_org_heatmap(
    pivot: str = "cost_center",
    from_month: str | None = None,
    to_month: str | None = None,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """Get organization heatmap pivoted by lob, role, or cost_center."""
    if not from_month:
        # Find earliest allocation month, or default to 2025-01
        earliest = db.query(func.min(Allocation.month)).scalar()
        from_month = earliest if earliest and earliest < DEMO_DATE else add_months(DEMO_DATE, -12)
    if not to_month:
        to_month = add_months(DEMO_DATE, 11)
    months = generate_month_range(from_month, to_month)

    # Pre-build a location → standard_hours cache
    _std_hours_cache: dict[str, float] = {}
    def _get_std_hours_for_location(loc_id: str | None) -> float:
        if not loc_id:
            return get_standard_hours(db)
        if loc_id not in _std_hours_cache:
            _std_hours_cache[loc_id] = get_standard_hours(db, loc_id)
        return _std_hours_cache[loc_id]

    rows = []
    if pivot == "cost_center":
        for cc in db.query(CostCenter).all():
            people = db.query(Person).filter(Person.cost_center_id == cc.id, Person.is_active.is_(True)).all()
            if not people:
                continue
            pids = [p.id for p in people]
            std_h = _get_std_hours_for_location(cc.location_id)
            cells = []
            for m in months:
                total = float(
                    db.query(func.coalesce(func.sum(Allocation.hours), 0))
                    .filter(Allocation.person_id.in_(pids), Allocation.month == m).scalar()
                )
                per_person = total / len(people) if people else 0
                pct = round((per_person / std_h) * 100, 1) if std_h else 0
                cells.append(UtilizationCell(
                    month=m, value=pct, color=utilization_color_bucket(pct),
                    allocated_hours=round(total, 1), standard_hours=round(std_h * len(people), 1),
                ))
            rows.append(OrgHeatmapRow(id=cc.id, name=cc.name, utilization=cells))

    elif pivot == "role":
        for role in db.query(RoleType).all():
            people = db.query(Person).filter(Person.role_type_id == role.id, Person.is_active.is_(True)).all()
            if not people:
                continue
            pids = [p.id for p in people]
            # Aggregate standard hours across people's locations
            total_std = sum(_get_std_hours_for_location(
                (db.query(CostCenter.location_id).filter(CostCenter.id == p.cost_center_id).scalar() if p.cost_center_id else None)
            ) for p in people)
            avg_std = total_std / len(people) if people else FTE_HOURS
            cells = []
            for m in months:
                total = float(
                    db.query(func.coalesce(func.sum(Allocation.hours), 0))
                    .filter(Allocation.person_id.in_(pids), Allocation.month == m).scalar()
                )
                per_person = total / len(people) if people else 0
                pct = round((per_person / avg_std) * 100, 1) if avg_std else 0
                cells.append(UtilizationCell(
                    month=m, value=pct, color=utilization_color_bucket(pct),
                    allocated_hours=round(total, 1), standard_hours=round(total_std, 1),
                ))

            # v5.1 C-07 — lightweight external roll-up for the role pivot.
            ext_summary = _compute_org_role_external_summary(db, role.id, months)
            rows.append(OrgHeatmapRow(
                id=role.id, name=role.name, utilization=cells,
                external_summary=ext_summary,
            ))

    elif pivot == "lob":
        top_type = get_top_level_entity_type_id(db)
        top_entities = db.query(GroupingEntity).filter(
            GroupingEntity.entity_type_id == top_type,
            GroupingEntity.is_active.is_(True),
        ).all() if top_type else []
        for ent in top_entities:
            proj_ids = _get_projects_for_entity_recursive(db, ent.id)
            if not proj_ids:
                continue
            cells = []
            for m in months:
                total = float(
                    db.query(func.coalesce(func.sum(Allocation.hours), 0))
                    .filter(Allocation.project_id.in_(proj_ids), Allocation.month == m).scalar()
                )
                people_count = (
                    db.query(func.count(func.distinct(Allocation.person_id)))
                    .filter(Allocation.project_id.in_(proj_ids), Allocation.month == m).scalar()
                )
                avg_std = get_standard_hours(db)  # Use global default for LoB view
                per_person = total / people_count if people_count else 0
                pct = round((per_person / avg_std) * 100, 1) if avg_std else 0
                cells.append(UtilizationCell(
                    month=m, value=pct, color=utilization_color_bucket(pct),
                    allocated_hours=round(total, 1),
                    standard_hours=round(avg_std * people_count, 1) if people_count else 0,
                ))
            rows.append(OrgHeatmapRow(id=ent.id, name=ent.name, utilization=cells))

    return {"items": rows, "total": len(rows)}


@router.get("/org/heatmap/{dimension_id}/detail")
def get_heatmap_detail(
    dimension_id: str,
    pivot: str = "cost_center",
    month: str | None = None,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """Get project-level breakdown for a heatmap cell."""
    if not month:
        month = DEMO_DATE

    if pivot == "cost_center":
        people = db.query(Person).filter(Person.cost_center_id == dimension_id, Person.is_active.is_(True)).all()
        pids = [p.id for p in people]
        allocs = (
            db.query(Allocation).filter(Allocation.person_id.in_(pids), Allocation.month == month).all()
        ) if pids else []
    elif pivot == "role":
        people = db.query(Person).filter(Person.role_type_id == dimension_id, Person.is_active.is_(True)).all()
        pids = [p.id for p in people]
        allocs = (
            db.query(Allocation).filter(Allocation.person_id.in_(pids), Allocation.month == month).all()
        ) if pids else []
    elif pivot == "lob":
        proj_ids = _get_projects_for_entity_recursive(db, dimension_id)
        allocs = (
            db.query(Allocation).filter(Allocation.project_id.in_(proj_ids), Allocation.month == month).all()
        ) if proj_ids else []
    else:
        allocs = []

    # Group by project, and collect per-person detail
    proj_map: dict[str, float] = {}
    proj_people: dict[str, dict[str, float]] = {}  # project_id -> {person_id -> hours}
    for a in allocs:
        proj_map.setdefault(a.project_id, 0)
        proj_map[a.project_id] += float(a.hours)
        proj_people.setdefault(a.project_id, {}).setdefault(a.person_id, 0)
        proj_people[a.project_id][a.person_id] += float(a.hours)

    # Compute summary: allocated vs available
    total_allocated = sum(proj_map.values())
    if pivot == "cost_center":
        cc = db.query(CostCenter).filter(CostCenter.id == dimension_id).first()
        std_h = get_standard_hours(db, cc.location_id) if cc else get_standard_hours(db)
        headcount = len(people) if people else 0
    elif pivot == "role":
        std_h = get_standard_hours(db)  # Use global for role view
        headcount = len(people) if people else 0
    else:
        std_h = get_standard_hours(db)
        lob_proj_ids = _get_projects_for_entity_recursive(db, dimension_id)
        headcount = db.query(func.count(func.distinct(Allocation.person_id))).filter(
            Allocation.project_id.in_(lob_proj_ids),
            Allocation.month == month,
        ).scalar() if lob_proj_ids else 0
    total_available = std_h * headcount
    delta = total_available - total_allocated

    items = []
    for pid, hours in proj_map.items():
        proj = db.query(Project).filter(Project.id == pid).first()
        has_pending = db.query(ChangeRequest).filter(
            ChangeRequest.project_id == pid,
            ChangeRequest.status.in_(["pending_cc_confirmation", "pending_controller_approval"])
        ).first() is not None

        # Build employee list for this project
        employees = []
        for person_id, person_hours in proj_people.get(pid, {}).items():
            person = db.query(Person).filter(Person.id == person_id).first()
            employees.append({
                "person_id": person_id,
                "person_name": person.name if person else person_id,
                "hours": round(person_hours, 1),
            })

        items.append({
            "project_id": pid, "project_name": proj.name if proj else pid,
            "hours_allocated": round(hours, 1), "has_pending_crs": has_pending,
            "employees": employees,
        })

    return {
        "items": items, "total": len(items),
        "allocated_hours": round(total_allocated, 1),
        "available_hours": round(total_available, 1),
        "delta": round(delta, 1),
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _apply_cr_to_forecast_on_cc_confirm(cr: ChangeRequest, db: Session) -> None:
    """Apply CR change details to forecast rows when CC Owner confirms (final stage)."""
    for detail in cr.change_details:
        if detail.month and detail.new_value:
            row = (
                db.query(Forecast)
                .filter(
                    Forecast.project_id == cr.project_id,
                    Forecast.month == detail.month,
                    Forecast.sub_category == detail.line_item_type,
                )
                .first()
            )
            if row:
                try:
                    new_val = float(detail.new_value.replace("€", "").replace(",", "").strip())
                    is_internal = detail.line_item_type and detail.line_item_type.startswith("role-")
                    if is_internal:
                        row.hours = new_val
                        rate_row = (
                            db.query(RateTable)
                            .filter(RateTable.role_type_id == detail.line_item_type)
                            .order_by(RateTable.effective_date.desc())
                            .first()
                        )
                        rate = float(rate_row.hourly_rate) if rate_row else 120.0
                        row.amount_eur = new_val * rate
                    else:
                        row.amount_eur = new_val
                except (ValueError, AttributeError):
                    pass


# ---------------------------------------------------------------------------
# v5 Session E2 — PL-friendly role-availability aggregation [E-06a]
# ---------------------------------------------------------------------------


@router.get("/role-availability", response_model=RoleAvailabilityResponse)
def get_role_availability(
    location_id: str | None = None,
    role_type_id: str | None = None,
    month_from: str | None = None,
    month_to: str | None = None,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """Aggregated allocation read-model for capacity planning per [E-06a].

    Returns one row per (role_type, location, month). The response intentionally
    omits person identifiers and names so Project Leads can browse availability
    without seeing personal data. All four roles read the same shape.

    Default month range: current demo month plus the next two months.
    """
    if not month_from:
        month_from = DEMO_DATE
    if not month_to:
        month_to = add_months(month_from, 2)

    if month_to < month_from:
        raise HTTPException(400, "month_to must be >= month_from")

    months = generate_month_range(month_from, month_to)
    if not months:
        return RoleAvailabilityResponse(items=[], total=0, months=[])

    # 1. People in scope, filtered by location + role
    person_q = (
        db.query(Person)
        .filter(Person.is_active.is_(True), Person.cost_center_id.isnot(None))
    )
    if role_type_id:
        person_q = person_q.filter(Person.role_type_id == role_type_id)
    if location_id:
        person_q = (
            person_q.join(CostCenter, Person.cost_center_id == CostCenter.id)
            .filter(CostCenter.location_id == location_id)
        )
    people = person_q.all()

    if not people:
        return RoleAvailabilityResponse(items=[], total=0, months=months)

    # Pre-fetch lookup tables
    role_names = {r.id: r.name for r in db.query(RoleType).all()}
    location_names = {l.id: l.city for l in db.query(Location).all()}
    cc_to_location = {
        cc.id: cc.location_id for cc in db.query(CostCenter).all()
    }

    # 2. Compute headcount per (role, location)
    cell_meta: dict[tuple[str, str], dict] = {}
    for p in people:
        loc_id = cc_to_location.get(p.cost_center_id, "")
        key = (p.role_type_id, loc_id)
        if key not in cell_meta:
            cell_meta[key] = {
                "role_type_id": p.role_type_id,
                "role_type_name": role_names.get(p.role_type_id, p.role_type_id),
                "location_id": loc_id,
                "location_name": location_names.get(loc_id, loc_id),
                "person_ids": set(),
            }
        cell_meta[key]["person_ids"].add(p.id)

    # 3. Pull allocations for these people across the month range
    person_ids = [p.id for p in people]
    alloc_rows = (
        db.query(Allocation.person_id, Allocation.month,
                 func.coalesce(func.sum(Allocation.hours), 0).label("total"))
        .filter(
            Allocation.person_id.in_(person_ids),
            Allocation.month >= month_from,
            Allocation.month <= month_to,
        )
        .group_by(Allocation.person_id, Allocation.month)
        .all()
    )
    person_to_role_loc: dict[str, tuple[str, str]] = {
        p.id: (p.role_type_id, cc_to_location.get(p.cost_center_id, ""))
        for p in people
    }

    # (role, location, month) -> total allocated hours
    allocated_map: dict[tuple[str, str, str], float] = {}
    for row in alloc_rows:
        key = person_to_role_loc.get(row.person_id)
        if not key:
            continue
        cell_key = (key[0], key[1], row.month)
        allocated_map[cell_key] = (
            allocated_map.get(cell_key, 0.0) + float(row.total)
        )

    # 4. Build response rows
    standard = get_standard_hours(db)
    items: list[RoleAvailabilityRow] = []
    for (role_id, loc_id), meta in cell_meta.items():
        for month in months:
            headcount = len(meta["person_ids"])
            total_capacity = headcount * standard
            allocated = allocated_map.get((role_id, loc_id, month), 0.0)
            available = max(total_capacity - allocated, 0.0)
            util = (
                round((allocated / total_capacity) * 100, 1)
                if total_capacity > 0 else 0.0
            )
            items.append(RoleAvailabilityRow(
                role_type_id=role_id,
                role_type_name=meta["role_type_name"],
                location_id=loc_id,
                location_name=meta["location_name"],
                month=month,
                headcount=headcount,
                standard_hours=round(total_capacity, 2),
                allocated_hours=round(allocated, 2),
                available_hours=round(available, 2),
                utilization_pct=util,
            ))

    items.sort(key=lambda r: (r.role_type_name, r.location_name, r.month))
    return RoleAvailabilityResponse(items=items, total=len(items), months=months)
