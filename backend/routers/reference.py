"""Reference Data endpoints (Section 10.8) — 6 read-only lookup endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user
from models.capacity import Allocation
from models.financial import ExternalCostType
from models.organization import CompetenceCenter, CostCenter, LineOfBusiness, Location
from models.people import Person, RateTable, RoleType
from models.projects import Project
from schemas.common import CurrentUser
from schemas.reference import (
    CompetenceCenterCostCenter,
    CompetenceCenterResponse,
    CostCenterResponse,
    CostTypeResponse,
    LoBResponse,
    LocationResponse,
    PersonResponse,
    RateInfo,
    RoleResponse,
)
from services.calculations import FTE_HOURS

router = APIRouter(prefix="/api/reference", tags=["Reference Data"])


@router.get("/lobs")
def get_lobs(
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """Get all Lines of Business with project counts and total budgets."""
    lobs = db.query(LineOfBusiness).all()
    items = []
    for lob in lobs:
        project_count = (
            db.query(func.count(Project.id))
            .filter(Project.lob_id == lob.id, Project.is_active.is_(True))
            .scalar()
        )
        total_budget = (
            db.query(func.coalesce(func.sum(Project.total_budget), 0))
            .filter(Project.lob_id == lob.id, Project.is_active.is_(True))
            .scalar()
        )
        items.append(
            LoBResponse(
                id=lob.id,
                name=lob.name,
                description=lob.description,
                is_active=lob.is_active,
                project_count=project_count,
                total_budget=float(total_budget or 0),
            )
        )
    return {"items": items, "total": len(items)}


@router.get("/competence-centers")
def get_competence_centers(
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """Get all Competence Centers with blended rates and associated cost centers."""
    ccs = db.query(CompetenceCenter).all()
    items = []
    for cc in ccs:
        rates = db.query(RateTable).filter(RateTable.competence_center_id == cc.id).all()
        blended_rate = sum(float(r.hourly_rate) for r in rates) / len(rates) if rates else 0
        cost_centers = [
            CompetenceCenterCostCenter(id=c.id, name=c.name)
            for c in db.query(CostCenter).filter(CostCenter.competence_center_id == cc.id).all()
        ]
        items.append(
            CompetenceCenterResponse(
                id=cc.id,
                name=cc.name,
                blended_rate=round(blended_rate, 2),
                cost_centers=cost_centers,
                is_active=cc.is_active,
            )
        )
    return {"items": items, "total": len(items)}


@router.get("/cost-centers")
def get_cost_centers(
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """Get all Cost Centers with location, competence center, and headcount."""
    centers = db.query(CostCenter).all()
    items = []
    for c in centers:
        headcount = (
            db.query(func.count(Person.id))
            .filter(Person.cost_center_id == c.id, Person.is_active.is_(True))
            .scalar()
        )
        items.append(
            CostCenterResponse(
                id=c.id,
                name=c.name,
                location_id=c.location_id,
                location_name=c.location.city if c.location else "",
                competence_center_id=c.competence_center_id,
                competence_center_name=c.competence_center.name if c.competence_center else "",
                headcount=headcount,
                is_active=c.is_active,
            )
        )
    return {"items": items, "total": len(items)}


@router.get("/locations")
def get_locations(
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """Get all Locations with cost center counts."""
    locations = db.query(Location).all()
    items = []
    for loc in locations:
        cc_count = (
            db.query(func.count(CostCenter.id))
            .filter(CostCenter.location_id == loc.id)
            .scalar()
        )
        items.append(
            LocationResponse(
                id=loc.id,
                city=loc.city,
                country=loc.country,
                cost_center_count=cc_count,
                is_active=loc.is_active,
            )
        )
    return {"items": items, "total": len(items)}


@router.get("/roles")
def get_roles(
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """Get all Role Types with rates per competence center."""
    roles = db.query(RoleType).all()
    items = []
    for role in roles:
        rates = []
        for r in role.rate_entries:
            cc = r.competence_center
            rates.append(
                RateInfo(
                    competence_center_id=r.competence_center_id,
                    competence_center_name=cc.name if cc else "",
                    hourly_rate=float(r.hourly_rate),
                    effective_date=r.effective_date,
                )
            )
        items.append(
            RoleResponse(id=role.id, name=role.name, rates=rates)
        )
    return {"items": items, "total": len(items)}


@router.get("/people")
def get_people(
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """Get all people with role, cost center, and current utilization."""
    people = db.query(Person).order_by(Person.name).all()
    # Current month utilization
    demo_month = "2026-03"
    items = []
    for p in people:
        alloc_hours = (
            db.query(func.coalesce(func.sum(Allocation.hours), 0))
            .filter(Allocation.person_id == p.id, Allocation.month == demo_month)
            .scalar()
        )
        util_pct = round(float(alloc_hours) / FTE_HOURS * 100, 1) if alloc_hours else 0.0
        items.append(
            PersonResponse(
                id=p.id,
                name=p.name,
                role_type_id=p.role_type_id,
                role_name=p.role_type.name if p.role_type else "",
                cost_center_id=p.cost_center_id,
                cost_center_name=p.cost_center.name if p.cost_center else "",
                competence_center_id=p.competence_center_id,
                competence_center_name=p.competence_center.name if p.competence_center else "",
                utilization_pct=util_pct,
                is_active=p.is_active,
            )
        )
    return {"items": items, "total": len(items)}


@router.get("/cost-types")
def get_cost_types(
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """Get all External Cost Types."""
    types = db.query(ExternalCostType).all()
    items = [CostTypeResponse(id=t.id, name=t.name) for t in types]
    return {"items": items, "total": len(items)}
