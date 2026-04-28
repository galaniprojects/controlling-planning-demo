"""Administration endpoints (Section 10.9) — 21 endpoints (20 new + 1 existing reset-demo)."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user, require_role
from models.organization import (
    CompetenceCenter, CostCenter, Location,
    GroupingEntityType, GroupingEntity, GroupingHierarchy,
    GroupingHierarchyLevel, ProjectGroupingAssignment,
)
from models.people import Person, RateTable, RoleType
from models.projects import Project
from models.system import AuditLog, PlanningParameter
from schemas.admin import (
    AdminContextResponse,
    AuditLogEntry,
    CompetenceCenterCreate,
    CompetenceCenterUpdate,
    CostCenterCreate,
    CostCenterUpdate,
    LoBCreate,
    LoBUpdate,
    LocationCreate,
    LocationUpdate,
    ParametersReset,
    ParametersUpdate,
    PersonCreate,
    PersonUpdate,
    RatesUpdate,
)
from schemas.common import CurrentUser

router = APIRouter(prefix="/api/admin", tags=["Administration"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _gen_id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:8]}"


def _log_audit(
    db: Session,
    user: CurrentUser,
    entity_type: str,
    entity_id: str,
    entity_name: str | None,
    action: str,
    field_changed: str | None = None,
    old_value: str | None = None,
    new_value: str | None = None,
) -> None:
    entry = AuditLog(
        user_person_id=user.person_id,
        entity_type=entity_type,
        entity_id=entity_id,
        entity_name=entity_name,
        action=action,
        field_changed=field_changed,
        old_value=old_value,
        new_value=new_value,
    )
    db.add(entry)


# ---------------------------------------------------------------------------
# Cost Centers (3 endpoints)
# ---------------------------------------------------------------------------

@router.post("/cost-centers")
def create_cost_center(
    body: CostCenterCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Create a new cost center."""
    cc = CostCenter(
        id=_gen_id("cc"),
        name=body.name,
        location_id=body.location_id,
        competence_center_id=body.competence_center_id,
    )
    db.add(cc)
    _log_audit(db, user, "cost_center", cc.id, cc.name, "create")
    db.commit()
    db.refresh(cc)
    return {"id": cc.id, "name": cc.name, "is_active": cc.is_active}


@router.put("/cost-centers/{cost_center_id}")
def update_cost_center(
    cost_center_id: str,
    body: CostCenterUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Update a cost center."""
    cc = db.query(CostCenter).filter(CostCenter.id == cost_center_id).first()
    if not cc:
        raise HTTPException(404, "Cost center not found")
    if body.name is not None:
        _log_audit(db, user, "cost_center", cc.id, cc.name, "update", "name", cc.name, body.name)
        cc.name = body.name
    if body.location_id is not None:
        _log_audit(db, user, "cost_center", cc.id, cc.name, "update", "location_id", cc.location_id, body.location_id)
        cc.location_id = body.location_id
    if body.competence_center_id is not None:
        _log_audit(db, user, "cost_center", cc.id, cc.name, "update", "competence_center_id", cc.competence_center_id, body.competence_center_id)
        cc.competence_center_id = body.competence_center_id
    db.commit()
    db.refresh(cc)
    return {"id": cc.id, "name": cc.name, "is_active": cc.is_active}


@router.put("/cost-centers/{cost_center_id}/deactivate")
def deactivate_cost_center(
    cost_center_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Deactivate a cost center (soft delete)."""
    cc = db.query(CostCenter).filter(CostCenter.id == cost_center_id).first()
    if not cc:
        raise HTTPException(404, "Cost center not found")
    _log_audit(db, user, "cost_center", cc.id, cc.name, "deactivate")
    cc.is_active = False
    db.commit()
    db.refresh(cc)
    return {"id": cc.id, "name": cc.name, "is_active": cc.is_active}


# ---------------------------------------------------------------------------
# Competence Centers (2 endpoints)
# ---------------------------------------------------------------------------

@router.post("/competence-centers")
def create_competence_center(
    body: CompetenceCenterCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Create a new competence center."""
    cc = CompetenceCenter(id=_gen_id("comp"), name=body.name)
    db.add(cc)
    _log_audit(db, user, "competence_center", cc.id, cc.name, "create")
    db.commit()
    db.refresh(cc)
    return {"id": cc.id, "name": cc.name, "is_active": cc.is_active}


@router.put("/competence-centers/{competence_center_id}")
def update_competence_center(
    competence_center_id: str,
    body: CompetenceCenterUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Update a competence center."""
    cc = db.query(CompetenceCenter).filter(CompetenceCenter.id == competence_center_id).first()
    if not cc:
        raise HTTPException(404, "Competence center not found")
    if body.name is not None:
        _log_audit(db, user, "competence_center", cc.id, cc.name, "update", "name", cc.name, body.name)
        cc.name = body.name
    db.commit()
    db.refresh(cc)
    return {"id": cc.id, "name": cc.name, "is_active": cc.is_active}


# ---------------------------------------------------------------------------
# Competence Centers — Employee Assignment (3 endpoints)
# ---------------------------------------------------------------------------

@router.get("/competence-centers/{competence_center_id}/people")
def get_competence_center_people(
    competence_center_id: str,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role("controller")),
):
    """List people assigned to a competence center."""
    people = (
        db.query(Person)
        .filter(Person.competence_center_id == competence_center_id, Person.is_active.is_(True))
        .order_by(Person.name)
        .all()
    )
    items = [
        {
            "id": p.id,
            "name": p.name,
            "role_name": p.role_type.name if p.role_type else "",
            "cost_center_name": p.cost_center.name if p.cost_center else "",
        }
        for p in people
    ]
    return {"items": items, "total": len(items)}


@router.put("/competence-centers/{competence_center_id}/people/{person_id}/assign")
def assign_person_to_competence_center(
    competence_center_id: str,
    person_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Assign a person to a competence center."""
    cc = db.query(CompetenceCenter).filter(CompetenceCenter.id == competence_center_id).first()
    if not cc:
        raise HTTPException(404, "Competence center not found")
    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(404, "Person not found")
    old_cc_id = person.competence_center_id
    person.competence_center_id = competence_center_id
    _log_audit(db, user, "person", person.id, person.name, "update", "competence_center_id", old_cc_id, competence_center_id)
    db.commit()
    return {"status": "ok", "person_id": person.id, "competence_center_id": competence_center_id}


@router.put("/competence-centers/{competence_center_id}/people/{person_id}/unassign")
def unassign_person_from_competence_center(
    competence_center_id: str,
    person_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Remove a person from a competence center."""
    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(404, "Person not found")
    if person.competence_center_id != competence_center_id:
        raise HTTPException(400, "Person is not assigned to this competence center")
    _log_audit(db, user, "person", person.id, person.name, "update", "competence_center_id", competence_center_id, None)
    person.competence_center_id = None
    db.commit()
    return {"status": "ok", "person_id": person.id}


# ---------------------------------------------------------------------------
# Lines of Business (2 endpoints)
# ---------------------------------------------------------------------------

@router.post("/lobs")
def create_lob(
    body: LoBCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Create a new Line of Business (as a GroupingEntity)."""
    from services.portfolio_service import get_top_level_entity_type_id
    top_type = get_top_level_entity_type_id(db)
    if not top_type:
        raise HTTPException(400, "No active hierarchy configured")
    entity = GroupingEntity(id=_gen_id("lob"), name=body.name, entity_type_id=top_type)
    db.add(entity)
    _log_audit(db, user, "lob", entity.id, entity.name, "create")
    db.commit()
    db.refresh(entity)
    return {"id": entity.id, "name": entity.name, "is_active": entity.is_active}


@router.put("/lobs/{lob_id}")
def update_lob(
    lob_id: str,
    body: LoBUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Update a Line of Business (GroupingEntity)."""
    entity = db.query(GroupingEntity).filter(GroupingEntity.id == lob_id).first()
    if not entity:
        raise HTTPException(404, "Entity not found")
    if body.name is not None:
        _log_audit(db, user, "lob", entity.id, entity.name, "update", "name", entity.name, body.name)
        entity.name = body.name
    db.commit()
    db.refresh(entity)
    return {"id": entity.id, "name": entity.name, "is_active": entity.is_active}


# ---------------------------------------------------------------------------
# Lines of Business — Project Assignment (2 endpoints)
# ---------------------------------------------------------------------------

@router.get("/lobs/{lob_id}/projects")
def get_lob_projects(
    lob_id: str,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role("controller")),
):
    """List projects assigned to an entity (LoB or other grouping entity)."""
    from services.portfolio_service import _get_projects_for_entity_recursive
    project_ids = _get_projects_for_entity_recursive(db, lob_id)
    projects = (
        db.query(Project)
        .filter(Project.id.in_(project_ids), Project.is_active.is_(True))
        .order_by(Project.name)
        .all()
    ) if project_ids else []
    items = [
        {
            "id": p.id,
            "name": p.name,
            "status": p.status,
            "total_budget": float(p.total_budget or p.annual_budget or 0),
        }
        for p in projects
    ]
    return {"items": items, "total": len(items)}


@router.put("/lobs/{lob_id}/projects/{project_id}/assign")
def assign_project_to_lob(
    lob_id: str,
    project_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Reassign a project to a different grouping entity."""
    entity = db.query(GroupingEntity).filter(GroupingEntity.id == lob_id).first()
    if not entity:
        raise HTTPException(404, "Grouping entity not found")
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    # Remove existing assignment
    old_assignment = db.query(ProjectGroupingAssignment).filter(
        ProjectGroupingAssignment.project_id == project_id
    ).first()
    old_entity_id = old_assignment.grouping_entity_id if old_assignment else ""
    old_entity_name = ""
    if old_assignment:
        old_entity = db.query(GroupingEntity).get(old_assignment.grouping_entity_id)
        old_entity_name = old_entity.name if old_entity else old_entity_id
        db.delete(old_assignment)
    # Create new assignment
    new_assignment = ProjectGroupingAssignment(project_id=project_id, grouping_entity_id=lob_id)
    db.add(new_assignment)
    _log_audit(db, user, "project", project.id, project.name, "update", "entity_id", old_entity_id, lob_id)
    db.commit()
    return {"status": "ok", "project_id": project.id, "lob_id": lob_id, "old_lob_name": old_entity_name}


# ---------------------------------------------------------------------------
# Locations (2 endpoints)
# ---------------------------------------------------------------------------

@router.post("/locations")
def create_location(
    body: LocationCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Create a new location."""
    loc = Location(id=_gen_id("loc"), city=body.city, country=body.country)
    db.add(loc)
    _log_audit(db, user, "location", loc.id, f"{loc.city}, {loc.country}", "create")
    db.commit()
    db.refresh(loc)
    return {"id": loc.id, "city": loc.city, "country": loc.country, "is_active": loc.is_active}


@router.put("/locations/{location_id}")
def update_location(
    location_id: str,
    body: LocationUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Update a location."""
    loc = db.query(Location).filter(Location.id == location_id).first()
    if not loc:
        raise HTTPException(404, "Location not found")
    if body.city is not None:
        _log_audit(db, user, "location", loc.id, f"{loc.city}, {loc.country}", "update", "city", loc.city, body.city)
        loc.city = body.city
    if body.country is not None:
        loc.country = body.country
    db.commit()
    db.refresh(loc)
    return {"id": loc.id, "city": loc.city, "country": loc.country, "is_active": loc.is_active}


# ---------------------------------------------------------------------------
# People (3 endpoints)
# ---------------------------------------------------------------------------

@router.post("/people")
def create_person(
    body: PersonCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Add a new person."""
    person = Person(
        id=_gen_id("p"),
        name=body.name,
        role_type_id=body.role_type_id,
        cost_center_id=body.cost_center_id,
        competence_center_id=body.competence_center_id,
    )
    db.add(person)
    _log_audit(db, user, "person", person.id, person.name, "create")
    db.commit()
    db.refresh(person)
    return {"id": person.id, "name": person.name, "is_active": person.is_active}


@router.put("/people/{person_id}")
def update_person(
    person_id: str,
    body: PersonUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Update a person."""
    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(404, "Person not found")
    if body.name is not None:
        _log_audit(db, user, "person", person.id, person.name, "update", "name", person.name, body.name)
        person.name = body.name
    if body.role_type_id is not None:
        _log_audit(db, user, "person", person.id, person.name, "update", "role_type_id", person.role_type_id, body.role_type_id)
        person.role_type_id = body.role_type_id
    if body.cost_center_id is not None:
        person.cost_center_id = body.cost_center_id
    if body.competence_center_id is not None:
        _log_audit(db, user, "person", person.id, person.name, "update", "competence_center_id", person.competence_center_id, body.competence_center_id)
        person.competence_center_id = body.competence_center_id
    db.commit()
    db.refresh(person)
    return {"id": person.id, "name": person.name, "is_active": person.is_active}


@router.put("/people/{person_id}/deactivate")
def deactivate_person(
    person_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Deactivate a person (soft delete)."""
    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(404, "Person not found")
    _log_audit(db, user, "person", person.id, person.name, "deactivate")
    person.is_active = False
    db.commit()
    db.refresh(person)
    return {"id": person.id, "name": person.name, "is_active": person.is_active}


# ---------------------------------------------------------------------------
# Rate Table (2 endpoints)
# ---------------------------------------------------------------------------

@router.get("/rates")
def get_rates(
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role("controller")),
):
    """Get all rate table entries."""
    rates = db.query(RateTable).all()
    items = []
    for r in rates:
        items.append({
            "id": r.id,
            "role_type_id": r.role_type_id,
            "role_name": r.role_type.name if r.role_type else "",
            "competence_center_id": r.competence_center_id,
            "competence_center_name": r.competence_center.name if r.competence_center else "",
            "current_rate": float(r.hourly_rate),
            "effective_date": r.effective_date,
            "previous_rate": float(r.previous_rate) if r.previous_rate else None,
            "previous_effective_date": r.previous_effective_date,
        })
    return {"items": items, "total": len(items)}


@router.put("/rates")
def update_rates(
    body: RatesUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Update hourly rates with new effective dates."""
    updated = []
    for change in body.changes:
        rate = (
            db.query(RateTable)
            .filter(
                RateTable.role_type_id == change.role_type_id,
                RateTable.competence_center_id == change.competence_center_id,
            )
            .first()
        )
        if not rate:
            raise HTTPException(404, f"Rate not found for role={change.role_type_id}, cc={change.competence_center_id}")
        old_rate = float(rate.hourly_rate)
        rate.previous_rate = rate.hourly_rate
        rate.previous_effective_date = rate.effective_date
        rate.hourly_rate = change.new_rate
        rate.effective_date = change.effective_date
        _log_audit(
            db, user, "rate_table", f"{rate.role_type_id}/{rate.competence_center_id}",
            f"{rate.role_type.name} @ {rate.competence_center.name}",
            "update", "hourly_rate", str(old_rate), str(change.new_rate),
        )
        updated.append({
            "role_type_id": rate.role_type_id,
            "competence_center_id": rate.competence_center_id,
            "new_rate": float(rate.hourly_rate),
            "effective_date": rate.effective_date,
        })
    db.commit()
    return {"items": updated, "total": len(updated)}


# ---------------------------------------------------------------------------
# Planning Parameters (3 endpoints)
# ---------------------------------------------------------------------------

@router.get("/parameters")
def get_parameters(
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role("controller")),
):
    """Get all planning parameters."""
    params = db.query(PlanningParameter).all()
    items = [
        {
            "key": p.key,
            "name": p.name,
            "description": p.description,
            "current_value": p.current_value,
            "default_value": p.default_value,
            "data_type": p.data_type,
            "group": p.param_group,
        }
        for p in params
    ]
    return {"items": items, "total": len(items)}


@router.put("/parameters")
def update_parameters(
    body: ParametersUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Update planning parameter values.

    [A-TN-07] If any changed key is in the tech_navigator group (tn_*),
    recompute denormalized Tech Navigator scores across the portfolio so
    composite_score and tshirt_size stay consistent with the new weights.

    [A-BK-14] If any changed key is in the ranking group (ranking_*) OR
    a tn_* key (which feeds composite_score), also recompute the
    within_cutoff flag across the backlog.
    """
    from services.tech_navigator import recompute_all_scores
    from services.ranking import (
        parameter_key_triggers_recompute,
        recompute_within_cutoff_for_backlog,
    )

    updated = []
    tn_changed = False
    ranking_recompute_needed = False
    for change in body.changes:
        param = db.query(PlanningParameter).filter(PlanningParameter.key == change.key).first()
        if not param:
            raise HTTPException(404, f"Parameter not found: {change.key}")
        old_value = param.current_value
        param.current_value = change.new_value
        _log_audit(db, user, "planning_parameter", param.key, param.name, "update", "current_value", old_value, change.new_value)
        updated.append({"key": param.key, "name": param.name, "current_value": param.current_value})
        if param.key.startswith("tn_"):
            tn_changed = True
        if parameter_key_triggers_recompute(param.key):
            ranking_recompute_needed = True
    db.commit()
    if tn_changed:
        recompute_all_scores(db)
    if ranking_recompute_needed:
        try:
            recompute_within_cutoff_for_backlog(db)
        except Exception:  # noqa: BLE001 — defensive: trigger best-effort.
            db.rollback()
    return {"items": updated, "total": len(updated)}


@router.post("/parameters/reset")
def reset_parameters(
    body: ParametersReset,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Reset planning parameters to default values."""
    from services.tech_navigator import recompute_all_scores

    query = db.query(PlanningParameter)
    if body.keys:
        query = query.filter(PlanningParameter.key.in_(body.keys))
    params = query.all()
    updated = []
    tn_changed = False
    for param in params:
        if param.current_value != param.default_value:
            _log_audit(db, user, "planning_parameter", param.key, param.name, "update", "current_value", param.current_value, param.default_value)
            param.current_value = param.default_value
            if param.key.startswith("tn_"):
                tn_changed = True
        updated.append({"key": param.key, "name": param.name, "current_value": param.current_value})
    db.commit()
    if tn_changed:
        recompute_all_scores(db)
    return {"items": updated, "total": len(updated)}


@router.post("/recompute-scores")
def recompute_scores(
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role("controller")),
):
    """Recompute Tech Navigator scores across the entire portfolio [A-TN-07].

    Useful after a bulk seed import or to repair drift; the same logic runs
    automatically when a controller edits any tn_* planning parameter.

    [A-BK-14] After scores recompute, fan out to within_cutoff recompute so
    composite_score-driven rank changes are reflected in the cutoff flag.
    """
    from services.tech_navigator import recompute_all_scores
    from services.ranking import recompute_within_cutoff_for_backlog

    count = recompute_all_scores(db)
    try:
        recompute_within_cutoff_for_backlog(db)
    except Exception:  # noqa: BLE001 — defensive: trigger best-effort.
        db.rollback()
    return {"recomputed": count}


# ---------------------------------------------------------------------------
# Grouping Hierarchy (ADM-01) — 10 endpoints
# ---------------------------------------------------------------------------

@router.get("/grouping/entity-types")
def get_entity_types(
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role("controller")),
):
    """List all grouping entity types."""
    types = db.query(GroupingEntityType).all()
    items = []
    for t in types:
        entity_count = db.query(func.count(GroupingEntity.id)).filter(GroupingEntity.entity_type_id == t.id).scalar()
        items.append({"id": t.id, "name": t.name, "is_active": t.is_active, "entity_count": entity_count})
    return {"items": items, "total": len(items)}


@router.post("/grouping/entity-types")
def create_entity_type(
    body: dict,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Create a new grouping entity type."""
    et = GroupingEntityType(id=_gen_id("get"), name=body["name"])
    db.add(et)
    _log_audit(db, user, "grouping_entity_type", et.id, et.name, "create")
    db.commit()
    db.refresh(et)
    return {"id": et.id, "name": et.name, "is_active": et.is_active}


@router.put("/grouping/entity-types/{type_id}")
def update_entity_type(
    type_id: str,
    body: dict,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Update a grouping entity type."""
    et = db.query(GroupingEntityType).filter(GroupingEntityType.id == type_id).first()
    if not et:
        raise HTTPException(404, "Entity type not found")
    if "name" in body:
        _log_audit(db, user, "grouping_entity_type", et.id, et.name, "update", "name", et.name, body["name"])
        et.name = body["name"]
    db.commit()
    db.refresh(et)
    return {"id": et.id, "name": et.name, "is_active": et.is_active}


@router.get("/grouping/entities")
def get_grouping_entities(
    type_id: str | None = None,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role("controller")),
):
    """List grouping entities, optionally filtered by type."""
    query = db.query(GroupingEntity)
    if type_id:
        query = query.filter(GroupingEntity.entity_type_id == type_id)
    entities = query.order_by(GroupingEntity.name).all()
    items = []
    for e in entities:
        project_count = db.query(func.count(ProjectGroupingAssignment.id)).filter(
            ProjectGroupingAssignment.grouping_entity_id == e.id
        ).scalar()
        items.append({
            "id": e.id,
            "entity_type_id": e.entity_type_id,
            "entity_type_name": e.entity_type.name if e.entity_type else "",
            "name": e.name,
            "parent_entity_id": e.parent_entity_id,
            "is_active": e.is_active,
            "project_count": project_count,
        })
    return {"items": items, "total": len(items)}


@router.post("/grouping/entities")
def create_grouping_entity(
    body: dict,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Create a new grouping entity."""
    ge = GroupingEntity(
        id=_gen_id("ge"),
        entity_type_id=body["entity_type_id"],
        name=body["name"],
        parent_entity_id=body.get("parent_entity_id"),
    )
    db.add(ge)
    _log_audit(db, user, "grouping_entity", ge.id, ge.name, "create")
    db.commit()
    db.refresh(ge)
    return {"id": ge.id, "name": ge.name, "entity_type_id": ge.entity_type_id, "is_active": ge.is_active}


@router.put("/grouping/entities/{entity_id}")
def update_grouping_entity(
    entity_id: str,
    body: dict,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Update a grouping entity."""
    ge = db.query(GroupingEntity).filter(GroupingEntity.id == entity_id).first()
    if not ge:
        raise HTTPException(404, "Entity not found")
    if "name" in body:
        _log_audit(db, user, "grouping_entity", ge.id, ge.name, "update", "name", ge.name, body["name"])
        ge.name = body["name"]
    if "parent_entity_id" in body:
        ge.parent_entity_id = body["parent_entity_id"]
    db.commit()
    db.refresh(ge)
    return {"id": ge.id, "name": ge.name, "is_active": ge.is_active}


@router.get("/grouping/hierarchies")
def get_hierarchies(
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role("controller")),
):
    """List all grouping hierarchies with their levels."""
    hierarchies = db.query(GroupingHierarchy).all()
    items = []
    for h in hierarchies:
        levels = [
            {"level_order": lvl.level_order, "entity_type_id": lvl.entity_type_id, "entity_type_name": lvl.entity_type.name if lvl.entity_type else ""}
            for lvl in h.levels
        ]
        items.append({
            "id": h.id,
            "name": h.name,
            "is_active_hierarchy": h.is_active_hierarchy,
            "levels": levels,
        })
    return {"items": items, "total": len(items)}


@router.post("/grouping/hierarchies")
def create_hierarchy(
    body: dict,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Create a new grouping hierarchy with levels."""
    h = GroupingHierarchy(id=_gen_id("hier"), name=body["name"])
    db.add(h)
    db.flush()
    for i, et_id in enumerate(body.get("levels", [])):
        lvl = GroupingHierarchyLevel(hierarchy_id=h.id, level_order=i, entity_type_id=et_id)
        db.add(lvl)
    _log_audit(db, user, "grouping_hierarchy", h.id, h.name, "create")
    db.commit()
    db.refresh(h)
    return {"id": h.id, "name": h.name, "is_active_hierarchy": h.is_active_hierarchy}


@router.put("/grouping/hierarchies/{hierarchy_id}")
def update_hierarchy(
    hierarchy_id: str,
    body: dict,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Update a hierarchy name and/or levels."""
    h = db.query(GroupingHierarchy).filter(GroupingHierarchy.id == hierarchy_id).first()
    if not h:
        raise HTTPException(404, "Hierarchy not found")
    if "name" in body:
        h.name = body["name"]
    if "levels" in body:
        db.query(GroupingHierarchyLevel).filter(GroupingHierarchyLevel.hierarchy_id == h.id).delete()
        for i, et_id in enumerate(body["levels"]):
            lvl = GroupingHierarchyLevel(hierarchy_id=h.id, level_order=i, entity_type_id=et_id)
            db.add(lvl)
    _log_audit(db, user, "grouping_hierarchy", h.id, h.name, "update")
    db.commit()
    db.refresh(h)
    return {"id": h.id, "name": h.name, "is_active_hierarchy": h.is_active_hierarchy}


@router.put("/grouping/hierarchies/{hierarchy_id}/activate")
def activate_hierarchy(
    hierarchy_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Set this hierarchy as the active one (deactivate all others)."""
    h = db.query(GroupingHierarchy).filter(GroupingHierarchy.id == hierarchy_id).first()
    if not h:
        raise HTTPException(404, "Hierarchy not found")
    # Deactivate all
    db.query(GroupingHierarchy).update({GroupingHierarchy.is_active_hierarchy: False})
    h.is_active_hierarchy = True
    _log_audit(db, user, "grouping_hierarchy", h.id, h.name, "activate")
    db.commit()
    return {"id": h.id, "name": h.name, "is_active_hierarchy": True}


@router.get("/grouping/active-hierarchy")
def get_active_hierarchy(
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """Get the currently active hierarchy with full entity tree and project assignments."""
    h = db.query(GroupingHierarchy).filter(GroupingHierarchy.is_active_hierarchy.is_(True)).first()
    if not h:
        return {"hierarchy": None, "levels": [], "top_level_label": "Line of Business", "entities": []}

    if not h.levels:
        return {"hierarchy": {"id": h.id, "name": h.name}, "levels": [], "top_level_label": "Group", "entities": []}

    levels_data = [
        {"level_order": lvl.level_order, "entity_type_id": lvl.entity_type_id, "entity_type_name": lvl.entity_type.name if lvl.entity_type else ""}
        for lvl in h.levels
    ]
    leaf_type_id = h.levels[-1].entity_type_id
    top_type = h.levels[0].entity_type

    def _build_entity_node(entity, is_leaf: bool) -> dict:
        """Build a tree node for an entity, recursively including children."""
        projects = []
        if is_leaf:
            assignments = db.query(ProjectGroupingAssignment).filter(
                ProjectGroupingAssignment.grouping_entity_id == entity.id
            ).all()
            for a in assignments:
                p = db.query(Project).filter(Project.id == a.project_id).first()
                if p:
                    projects.append({"id": p.id, "name": p.name, "status": p.status})

        # Get child entities (entities whose parent_entity_id == this entity)
        child_entities = (
            db.query(GroupingEntity)
            .filter(GroupingEntity.parent_entity_id == entity.id, GroupingEntity.is_active.is_(True))
            .order_by(GroupingEntity.name)
            .all()
        )
        children = []
        child_project_count = 0
        for child in child_entities:
            child_is_leaf = child.entity_type_id == leaf_type_id
            child_node = _build_entity_node(child, child_is_leaf)
            children.append(child_node)
            child_project_count += child_node["project_count"]

        return {
            "id": entity.id,
            "name": entity.name,
            "entity_type_id": entity.entity_type_id,
            "project_count": len(projects) + child_project_count,
            "children": children,
            "projects": projects,
        }

    # Query top-level entities (matching the first level's type, no parent)
    top_entities = (
        db.query(GroupingEntity)
        .filter(
            GroupingEntity.entity_type_id == top_type.id,
            GroupingEntity.is_active.is_(True),
            GroupingEntity.parent_entity_id.is_(None),
        )
        .order_by(GroupingEntity.name)
        .all()
    )

    is_single_level = len(h.levels) == 1
    entity_list = [_build_entity_node(e, is_single_level) for e in top_entities]

    return {
        "hierarchy": {"id": h.id, "name": h.name},
        "levels": levels_data,
        "top_level_label": top_type.name,
        "entities": entity_list,
    }


@router.put("/grouping/entities/{entity_id}/parent")
def set_entity_parent(
    entity_id: str,
    body: dict,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Set or clear an entity's parent (assign child entity to parent)."""
    entity = db.query(GroupingEntity).filter(GroupingEntity.id == entity_id).first()
    if not entity:
        raise HTTPException(404, "Entity not found")
    old_parent = entity.parent_entity_id
    new_parent = body.get("parent_entity_id")
    entity.parent_entity_id = new_parent
    _log_audit(db, user, "grouping_entity", entity.id, entity.name, "update", "parent_entity_id", old_parent, new_parent)
    db.commit()
    db.refresh(entity)
    return {"id": entity.id, "name": entity.name, "parent_entity_id": entity.parent_entity_id}


@router.post("/grouping/project-assignments")
def assign_project_to_entity(
    body: dict,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Assign a project to a grouping entity. Removes any existing assignment for this project."""
    project_id = body["project_id"]
    entity_id = body["grouping_entity_id"]
    # Remove existing assignment for this project
    db.query(ProjectGroupingAssignment).filter(
        ProjectGroupingAssignment.project_id == project_id
    ).delete()
    assignment = ProjectGroupingAssignment(project_id=project_id, grouping_entity_id=entity_id)
    db.add(assignment)
    _log_audit(db, user, "project_grouping", project_id, None, "assign", "grouping_entity_id", None, entity_id)
    db.commit()
    return {"status": "ok", "project_id": project_id, "grouping_entity_id": entity_id}


@router.delete("/grouping/project-assignments/{project_id}")
def unassign_project_from_entity(
    project_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Remove a project's grouping entity assignment."""
    deleted = db.query(ProjectGroupingAssignment).filter(
        ProjectGroupingAssignment.project_id == project_id
    ).delete()
    if not deleted:
        raise HTTPException(404, "Assignment not found")
    _log_audit(db, user, "project_grouping", project_id, None, "unassign")
    db.commit()
    return {"status": "ok", "project_id": project_id}


@router.get("/grouping/entities/{entity_id}/projects")
def get_entity_projects(
    entity_id: str,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role("controller")),
):
    """List projects assigned to a grouping entity."""
    assignments = db.query(ProjectGroupingAssignment).filter(
        ProjectGroupingAssignment.grouping_entity_id == entity_id
    ).all()
    items = []
    for a in assignments:
        p = db.query(Project).filter(Project.id == a.project_id).first()
        if p:
            items.append({
                "id": p.id,
                "name": p.name,
                "status": p.status,
                "total_budget": float(p.total_budget or p.annual_budget or 0),
            })
    return {"items": items, "total": len(items)}


# ---------------------------------------------------------------------------
# Admin Context + Audit Log (2 endpoints)
# ---------------------------------------------------------------------------

@router.get("/context")
def get_admin_context(
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role("controller")),
):
    """Get admin module landing page context."""
    cost_center_count = db.query(func.count(CostCenter.id)).scalar()
    people_count = db.query(func.count(Person.id)).filter(Person.is_active.is_(True)).scalar()
    from services.portfolio_service import get_top_level_entity_type_id
    top_type = get_top_level_entity_type_id(db)
    lob_count = db.query(func.count(GroupingEntity.id)).filter(
        GroupingEntity.entity_type_id == top_type
    ).scalar() if top_type else 0
    location_count = db.query(func.count(Location.id)).scalar()
    competence_center_count = db.query(func.count(CompetenceCenter.id)).scalar()

    last_rate = db.query(func.max(RateTable.effective_date)).scalar()
    last_param = db.query(func.max(PlanningParameter.modified_at)).scalar()

    return AdminContextResponse(
        cost_center_count=cost_center_count,
        people_count=people_count,
        lob_count=lob_count,
        location_count=location_count,
        competence_center_count=competence_center_count,
        last_rate_update=last_rate,
        last_parameter_change=str(last_param) if last_param else None,
    )


@router.get("/audit-log")
def get_audit_log(
    entity_type: str | None = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role("controller")),
):
    """Get audit log entries, optionally filtered by entity type."""
    query = db.query(AuditLog).order_by(AuditLog.timestamp.desc())
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    entries = query.limit(limit).all()
    items = [
        AuditLogEntry(
            id=e.id,
            timestamp=str(e.timestamp),
            user_name=e.user.name if e.user else "unknown",
            entity_type=e.entity_type,
            entity_id=e.entity_id,
            entity_name=e.entity_name,
            action=e.action,
            field_changed=e.field_changed,
            old_value=e.old_value,
            new_value=e.new_value,
        )
        for e in entries
    ]
    return {"items": items, "total": len(items)}


# ---------------------------------------------------------------------------
# Demo Reset (existing endpoint)
# ---------------------------------------------------------------------------

@router.post("/reset-demo")
def reset_demo(request: Request):
    """Drop all tables, recreate schema, and reload seed data.

    This is a demo-only endpoint for resetting the application to its
    initial state. Not intended for production use.
    """
    from seed.loader import reset_database

    # Clear any in-memory state
    try:
        from services.forecast_cycle import clear_all_cycles
        clear_all_cycles()
    except ImportError:
        pass

    fixtures = reset_database()
    request.app.state.fixtures = fixtures

    return {
        "status": "ok",
        "message": "Demo data has been reset to initial state.",
        "loaded": {
            "manuals": len(fixtures.get("manuals", [])),
            "faq": len(fixtures.get("faq", [])),
            "advisor_goals": len(fixtures.get("advisor_goals", [])),
        },
    }
