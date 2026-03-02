"""Capacity Management endpoints (Section 10.5) — 14 endpoints."""
from __future__ import annotations
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from config import DEMO_DATE
from database import get_db
from dependencies import get_current_user, require_role
from models.capacity import Allocation, ResourceRequest
from models.change_requests import ChangeRequest
from models.organization import CostCenter, LineOfBusiness
from models.people import Person, RoleType
from models.projects import Project
from schemas.capacity import (
    CapacityContext, ConfirmRequest, CounterProposeRequest, DeclineRequest,
    OrgHeatmapRow, OrgSummary, PartialFulfillRequest, PersonHeatmapRow,
    RequestItem, RoleHeatmapRow, TeamSummary, UtilizationCell,
)
from schemas.common import CurrentUser
from services.calculations import (
    FTE_HOURS, add_months, compute_utilization_pct, generate_month_range,
    utilization_color_bucket,
)

router = APIRouter(prefix="/api/capacity", tags=["Capacity Management"])


def _verify_cc_access(user: CurrentUser, cost_center_id: str):
    """Verify user owns the cost center (CC owners only see their own CC)."""
    if user.role == "cost_center_owner" and user.cost_center_id != cost_center_id:
        raise HTTPException(403, "Forbidden: cannot access other cost centers")


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
    default_tab = "my-team" if user.role == "cost_center_owner" else "org"
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
                pct = compute_utilization_pct(hours)
                cells.append(UtilizationCell(month=m, value=pct, color=utilization_color_bucket(pct)))
            people_rows.append(PersonHeatmapRow(person_id=person.id, name=person.name, utilization=cells))

        # Aggregate
        agg = []
        for i, m in enumerate(months):
            vals = [pr.utilization[i].value for pr in people_rows]
            avg = round(sum(vals) / len(vals), 1) if vals else 0
            agg.append(UtilizationCell(month=m, value=avg, color=utilization_color_bucket(avg)))

        role_rows.append(RoleHeatmapRow(
            role_id=role_id, role_name=role.name if role else role_id,
            aggregate_utilization=agg, people=people_rows,
        ))

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
    return {
        "id": r.id, "project_id": r.project_id,
        "project_name": proj.name if proj else r.project_id,
        "request_type": r.request_type,
        "role_or_cost_type": role_or_ct,
        "hours_or_amount": float(r.hours_or_amount_per_month),
        "period_start": r.period_start, "period_end": r.period_end,
        "priority": r.priority, "status": r.status,
        "assigned_person_id": r.assigned_person_id,
        "explanation": r.explanation,
    }


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
    req.assigned_person_id = body.assigned_person_id
    # Advance linked CR if exists
    if req.change_request_id:
        cr = db.query(ChangeRequest).filter(ChangeRequest.id == req.change_request_id).first()
        if cr and cr.status == "pending_cc_confirmation":
            cr.status = "pending_controller_approval"
            cr.cc_owner_id = user.person_id
            cr.cc_status = "confirmed"
            cr.cc_confirmation_timestamp = datetime.utcnow()
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
            cr.status = "pending_controller_approval"
            cr.cc_owner_id = user.person_id
            cr.cc_status = "confirmed"
            cr.cc_confirmation_timestamp = datetime.utcnow()
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
            cr.status = "pending_controller_approval"
            cr.cc_owner_id = user.person_id
            cr.cc_status = "confirmed"
            cr.cc_confirmation_timestamp = datetime.utcnow()
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

    return OrgSummary(total_headcount=total_headcount, avg_utilization_pct=avg_util, over_allocated_cc_count=over_count)


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
        from_month = DEMO_DATE
    if not to_month:
        to_month = add_months(DEMO_DATE, 11)
    months = generate_month_range(from_month, to_month)

    rows = []
    if pivot == "cost_center":
        for cc in db.query(CostCenter).all():
            people = db.query(Person).filter(Person.cost_center_id == cc.id, Person.is_active.is_(True)).all()
            if not people:
                continue
            pids = [p.id for p in people]
            cells = []
            for m in months:
                total = float(
                    db.query(func.coalesce(func.sum(Allocation.hours), 0))
                    .filter(Allocation.person_id.in_(pids), Allocation.month == m).scalar()
                )
                avg = compute_utilization_pct(total / len(people)) if people else 0
                cells.append(UtilizationCell(month=m, value=avg, color=utilization_color_bucket(avg)))
            rows.append(OrgHeatmapRow(id=cc.id, name=cc.name, utilization=cells))

    elif pivot == "role":
        for role in db.query(RoleType).all():
            people = db.query(Person).filter(Person.role_type_id == role.id, Person.is_active.is_(True)).all()
            if not people:
                continue
            pids = [p.id for p in people]
            cells = []
            for m in months:
                total = float(
                    db.query(func.coalesce(func.sum(Allocation.hours), 0))
                    .filter(Allocation.person_id.in_(pids), Allocation.month == m).scalar()
                )
                avg = compute_utilization_pct(total / len(people)) if people else 0
                cells.append(UtilizationCell(month=m, value=avg, color=utilization_color_bucket(avg)))
            rows.append(OrgHeatmapRow(id=role.id, name=role.name, utilization=cells))

    elif pivot == "lob":
        for lob in db.query(LineOfBusiness).all():
            proj_ids = [p.id for p in db.query(Project).filter(Project.lob_id == lob.id).all()]
            if not proj_ids:
                continue
            cells = []
            for m in months:
                total = float(
                    db.query(func.coalesce(func.sum(Allocation.hours), 0))
                    .filter(Allocation.project_id.in_(proj_ids), Allocation.month == m).scalar()
                )
                # Estimate headcount from allocations
                people_count = (
                    db.query(func.count(func.distinct(Allocation.person_id)))
                    .filter(Allocation.project_id.in_(proj_ids), Allocation.month == m).scalar()
                )
                avg = compute_utilization_pct(total / people_count) if people_count else 0
                cells.append(UtilizationCell(month=m, value=avg, color=utilization_color_bucket(avg)))
            rows.append(OrgHeatmapRow(id=lob.id, name=lob.name, utilization=cells))

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
        proj_ids = [p.id for p in db.query(Project).filter(Project.lob_id == dimension_id).all()]
        allocs = (
            db.query(Allocation).filter(Allocation.project_id.in_(proj_ids), Allocation.month == month).all()
        ) if proj_ids else []
    else:
        allocs = []

    # Group by project
    proj_map = {}
    for a in allocs:
        proj_map.setdefault(a.project_id, 0)
        proj_map[a.project_id] += float(a.hours)

    items = []
    for pid, hours in proj_map.items():
        proj = db.query(Project).filter(Project.id == pid).first()
        has_pending = db.query(ChangeRequest).filter(
            ChangeRequest.project_id == pid,
            ChangeRequest.status.in_(["pending_cc_confirmation", "pending_controller_approval"])
        ).first() is not None
        items.append({
            "project_id": pid, "project_name": proj.name if proj else pid,
            "hours_allocated": round(hours, 1), "has_pending_crs": has_pending,
        })

    return {"items": items, "total": len(items)}
