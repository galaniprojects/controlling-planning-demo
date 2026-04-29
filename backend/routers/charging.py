"""Cluster F charging-master admin endpoints (Country, Region, ChargingLocation, LegalEntity).

Built for v5 Session D1 per [F-MD-01], [F-MD-02], [F-MD-03], [F-AC-01].
All endpoints require the controller role per the existing admin pattern.
"""

from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from dependencies import require_role
from models.charging import (
    CHARGEABLE_ENTITY_TYPES, ChargeableEntity, ChargingLocation, Country,
    Distribution, LegalEntity, Region, UserMeasurement,
)
from models.organization import GroupingEntity
from models.people import Person
from models.projects import Project
from models.system import AuditLog
from schemas.btc_profile import (
    BTCCopyFromRequest, BTCModeChangeRequest, BTCProfileCreate,
    BTCProfileListResponse, BTCProfileResponse, BTCProfileUpdate,
    BTCRefreshDiffRequest, BTCRefreshDiffResponse,
    WBSMatrixResponse as WBSMatrixSchemaResponse,
    YearRolloverRequest, YearRolloverResponse,
)
from schemas.chargeable_entity import (
    ChargeableEntityCreate, ChargeableEntityListResponse,
    ChargeableEntityResponse, ChargeableEntityUpdate,
    validate_identifier_for_type,
)
from schemas.rollup import (
    EntityAllocationBreakdownResponse, EntityAllocationBreakdownRow,
    RollupCacheStatusResponse, RollupDrillDownResponse, RollupListResponse,
)
from schemas.charging import (
    ChargingLocationCreate, ChargingLocationResponse, ChargingLocationUpdate,
    CountryCreate, CountryResponse, CountryUpdate,
    LegalEntityCreate, LegalEntityResponse, LegalEntityUpdate,
    RegionCreate, RegionResponse, RegionUpdate,
)
from schemas.common import CurrentUser
from schemas.distribution import (
    DistributionCreate, DistributionListResponse, DistributionResponse,
    DistributionUpdate, DistributionEffectiveCost, DistributionInflow,
    EntityDistributionSummary, WBSElementResponse,
)
from services.btc_service import (
    BTCValidationError, assert_btc_required,
    build_wbs_matrix, change_mode, copy_from_profile, create_automatic_profile,
    create_manual_profile, compute_sums_to_100, get_profile,
    get_profile_for_entity, list_profiles, refresh_from_um,
    update_profile, year_rollover,
)
from services.dag_resolver import (
    compute_effective_cost, get_upstream_chain,
)
from services.distribution_service import (
    DistributionValidationError, compute_sum_validation,
    create_distribution_edge, delete_distribution_edge,
    is_known_version, update_distribution_edge, update_to_business_pct,
)
from services.rollup_cache import (
    get_cache_status, invalidate_all, invalidate_for_btc_write,
    invalidate_for_distribution_write, invalidate_for_entity_cost_write,
)
from services.rollup_query import (
    drill_down_charging_location, query_entity_allocation_breakdown, query_rollup,
)
from services.wbs_generator import build_wbs_element

router = APIRouter(prefix="/api/admin", tags=["Administration: Charging"])
charging_router = APIRouter(prefix="/api/charging", tags=["Charging & Allocations"])


def _gen_id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:8]}"


def _audit(
    db: Session,
    user: CurrentUser,
    entity_type: str,
    entity_id: str,
    entity_name: str | None,
    action: str,
    field_changed: str | None = None,
    old_value: str | None = None,
    new_value: str | None = None,
    *,
    category: str = "master_data",
) -> None:
    """Local audit-log helper.

    Mirrors ``routers.admin._log_audit`` and writes an AuditLog row with the
    correct ``category`` per Session D2's contract (default ``master_data``
    for D1's existing call sites; F2 callers pass ``category='master_data'``
    explicitly for ChargeableEntity and Distribution writes).
    """
    db.add(
        AuditLog(
            user_person_id=user.person_id,
            entity_type=entity_type,
            entity_id=entity_id,
            entity_name=entity_name,
            action=action,
            field_changed=field_changed,
            old_value=old_value,
            new_value=new_value,
            category=category,
        )
    )


# ---------------------------------------------------------------------------
# Country (4 endpoints)
# ---------------------------------------------------------------------------

@router.get("/countries", response_model=dict)
def list_countries(
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role("controller")),
):
    """List all countries (active and inactive). [F-MD-02]"""
    rows = db.query(Country).order_by(Country.name).all()
    items = [
        CountryResponse(id=c.id, iso_code=c.iso_code, name=c.name, is_active=c.is_active)
        for c in rows
    ]
    return {"items": [i.model_dump() for i in items], "total": len(items)}


@router.post("/countries", response_model=CountryResponse)
def create_country(
    body: CountryCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Create a country."""
    if db.query(Country).filter(Country.iso_code == body.iso_code).first():
        raise HTTPException(409, f"Country with iso_code '{body.iso_code}' already exists")
    c = Country(id=_gen_id("ctry"), iso_code=body.iso_code, name=body.name)
    db.add(c)
    _audit(db, user, "country", c.id, c.name, "create")
    db.commit()
    db.refresh(c)
    return CountryResponse(id=c.id, iso_code=c.iso_code, name=c.name, is_active=c.is_active)


@router.put("/countries/{country_id}", response_model=CountryResponse)
def update_country(
    country_id: str,
    body: CountryUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Update a country's iso_code or name."""
    c = db.query(Country).filter(Country.id == country_id).first()
    if not c:
        raise HTTPException(404, "Country not found")
    if body.iso_code is not None and body.iso_code != c.iso_code:
        if db.query(Country).filter(Country.iso_code == body.iso_code, Country.id != country_id).first():
            raise HTTPException(409, f"iso_code '{body.iso_code}' already in use")
        _audit(db, user, "country", c.id, c.name, "update", "iso_code", c.iso_code, body.iso_code)
        c.iso_code = body.iso_code
    if body.name is not None and body.name != c.name:
        _audit(db, user, "country", c.id, c.name, "update", "name", c.name, body.name)
        c.name = body.name
    db.commit()
    db.refresh(c)
    return CountryResponse(id=c.id, iso_code=c.iso_code, name=c.name, is_active=c.is_active)


@router.put("/countries/{country_id}/deactivate", response_model=CountryResponse)
def deactivate_country(
    country_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Soft-delete a country."""
    c = db.query(Country).filter(Country.id == country_id).first()
    if not c:
        raise HTTPException(404, "Country not found")
    _audit(db, user, "country", c.id, c.name, "deactivate")
    c.is_active = False
    db.commit()
    db.refresh(c)
    return CountryResponse(id=c.id, iso_code=c.iso_code, name=c.name, is_active=c.is_active)


# ---------------------------------------------------------------------------
# Region (4 endpoints)
# ---------------------------------------------------------------------------

@router.get("/regions", response_model=dict)
def list_regions(
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role("controller")),
):
    rows = db.query(Region).order_by(Region.name).all()
    items = [
        RegionResponse(id=r.id, code=r.code, name=r.name, is_active=r.is_active) for r in rows
    ]
    return {"items": [i.model_dump() for i in items], "total": len(items)}


@router.post("/regions", response_model=RegionResponse)
def create_region(
    body: RegionCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    if db.query(Region).filter(Region.code == body.code).first():
        raise HTTPException(409, f"Region with code '{body.code}' already exists")
    r = Region(id=_gen_id("rgn"), code=body.code, name=body.name)
    db.add(r)
    _audit(db, user, "region", r.id, r.name, "create")
    db.commit()
    db.refresh(r)
    return RegionResponse(id=r.id, code=r.code, name=r.name, is_active=r.is_active)


@router.put("/regions/{region_id}", response_model=RegionResponse)
def update_region(
    region_id: str,
    body: RegionUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    r = db.query(Region).filter(Region.id == region_id).first()
    if not r:
        raise HTTPException(404, "Region not found")
    if body.code is not None and body.code != r.code:
        if db.query(Region).filter(Region.code == body.code, Region.id != region_id).first():
            raise HTTPException(409, f"code '{body.code}' already in use")
        _audit(db, user, "region", r.id, r.name, "update", "code", r.code, body.code)
        r.code = body.code
    if body.name is not None and body.name != r.name:
        _audit(db, user, "region", r.id, r.name, "update", "name", r.name, body.name)
        r.name = body.name
    db.commit()
    db.refresh(r)
    return RegionResponse(id=r.id, code=r.code, name=r.name, is_active=r.is_active)


@router.put("/regions/{region_id}/deactivate", response_model=RegionResponse)
def deactivate_region(
    region_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    r = db.query(Region).filter(Region.id == region_id).first()
    if not r:
        raise HTTPException(404, "Region not found")
    _audit(db, user, "region", r.id, r.name, "deactivate")
    r.is_active = False
    db.commit()
    db.refresh(r)
    return RegionResponse(id=r.id, code=r.code, name=r.name, is_active=r.is_active)


# ---------------------------------------------------------------------------
# ChargingLocation (4 endpoints)
# ---------------------------------------------------------------------------

def _serialize_charging_location(cl: ChargingLocation) -> ChargingLocationResponse:
    return ChargingLocationResponse(
        id=cl.id,
        code=cl.code,
        name=cl.name,
        division=cl.division,
        region_id=cl.region_id,
        region_name=cl.region.name if cl.region else None,
        country_id=cl.country_id,
        country_name=cl.country.name if cl.country else None,
        country_iso_code=cl.country.iso_code if cl.country else None,
        is_active=cl.is_active,
    )


@router.get("/charging-locations", response_model=dict)
def list_charging_locations(
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role("controller")),
):
    """List all charging locations [F-MD-01]."""
    rows = db.query(ChargingLocation).order_by(ChargingLocation.code).all()
    items = [_serialize_charging_location(cl) for cl in rows]
    return {"items": [i.model_dump() for i in items], "total": len(items)}


@router.post("/charging-locations", response_model=ChargingLocationResponse)
def create_charging_location(
    body: ChargingLocationCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    if db.query(ChargingLocation).filter(ChargingLocation.code == body.code).first():
        raise HTTPException(409, f"ChargingLocation with code '{body.code}' already exists")
    if body.region_id and not db.query(Region).filter(Region.id == body.region_id).first():
        raise HTTPException(404, f"Region '{body.region_id}' not found")
    if body.country_id and not db.query(Country).filter(Country.id == body.country_id).first():
        raise HTTPException(404, f"Country '{body.country_id}' not found")
    cl = ChargingLocation(
        id=_gen_id("cl"),
        code=body.code,
        name=body.name,
        division=body.division,
        region_id=body.region_id,
        country_id=body.country_id,
    )
    db.add(cl)
    _audit(db, user, "charging_location", cl.id, cl.name, "create")
    db.commit()
    db.refresh(cl)
    return _serialize_charging_location(cl)


@router.put("/charging-locations/{cl_id}", response_model=ChargingLocationResponse)
def update_charging_location(
    cl_id: str,
    body: ChargingLocationUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    cl = db.query(ChargingLocation).filter(ChargingLocation.id == cl_id).first()
    if not cl:
        raise HTTPException(404, "ChargingLocation not found")

    if body.code is not None and body.code != cl.code:
        if db.query(ChargingLocation).filter(ChargingLocation.code == body.code, ChargingLocation.id != cl_id).first():
            raise HTTPException(409, f"code '{body.code}' already in use")
        _audit(db, user, "charging_location", cl.id, cl.name, "update", "code", cl.code, body.code)
        cl.code = body.code
    if body.name is not None and body.name != cl.name:
        _audit(db, user, "charging_location", cl.id, cl.name, "update", "name", cl.name, body.name)
        cl.name = body.name
    if body.division is not None and body.division != cl.division:
        _audit(db, user, "charging_location", cl.id, cl.name, "update", "division", cl.division, body.division)
        cl.division = body.division
    if body.region_id is not None and body.region_id != cl.region_id:
        if body.region_id and not db.query(Region).filter(Region.id == body.region_id).first():
            raise HTTPException(404, f"Region '{body.region_id}' not found")
        _audit(db, user, "charging_location", cl.id, cl.name, "update", "region_id", cl.region_id, body.region_id)
        cl.region_id = body.region_id
    if body.country_id is not None and body.country_id != cl.country_id:
        if body.country_id and not db.query(Country).filter(Country.id == body.country_id).first():
            raise HTTPException(404, f"Country '{body.country_id}' not found")
        _audit(db, user, "charging_location", cl.id, cl.name, "update", "country_id", cl.country_id, body.country_id)
        cl.country_id = body.country_id
    db.commit()
    db.refresh(cl)
    return _serialize_charging_location(cl)


@router.put("/charging-locations/{cl_id}/deactivate", response_model=ChargingLocationResponse)
def deactivate_charging_location(
    cl_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    cl = db.query(ChargingLocation).filter(ChargingLocation.id == cl_id).first()
    if not cl:
        raise HTTPException(404, "ChargingLocation not found")
    _audit(db, user, "charging_location", cl.id, cl.name, "deactivate")
    cl.is_active = False
    db.commit()
    db.refresh(cl)
    return _serialize_charging_location(cl)


# ---------------------------------------------------------------------------
# LegalEntity (4 endpoints)
# ---------------------------------------------------------------------------

def _serialize_legal_entity(le: LegalEntity) -> LegalEntityResponse:
    return LegalEntityResponse(
        id=le.id,
        code=le.code,
        name=le.name,
        charging_location_id=le.charging_location_id,
        charging_location_code=le.charging_location.code if le.charging_location else None,
        charging_location_name=le.charging_location.name if le.charging_location else None,
        country_id=le.country_id,
        country_iso_code=le.country.iso_code if le.country else None,
        country_name=le.country.name if le.country else None,
        is_active=le.is_active,
    )


@router.get("/legal-entities", response_model=dict)
def list_legal_entities(
    charging_location_id: str | None = None,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role("controller")),
):
    """List legal entities, optionally filtered by charging-location rollup. [F-MD-01]"""
    query = db.query(LegalEntity)
    if charging_location_id:
        query = query.filter(LegalEntity.charging_location_id == charging_location_id)
    rows = query.order_by(LegalEntity.code).all()
    items = [_serialize_legal_entity(le) for le in rows]
    return {"items": [i.model_dump() for i in items], "total": len(items)}


@router.post("/legal-entities", response_model=LegalEntityResponse)
def create_legal_entity(
    body: LegalEntityCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    if db.query(LegalEntity).filter(LegalEntity.code == body.code).first():
        raise HTTPException(409, f"LegalEntity with code '{body.code}' already exists")
    if body.charging_location_id and not db.query(ChargingLocation).filter(
        ChargingLocation.id == body.charging_location_id,
    ).first():
        raise HTTPException(404, f"ChargingLocation '{body.charging_location_id}' not found")
    if body.country_id and not db.query(Country).filter(Country.id == body.country_id).first():
        raise HTTPException(404, f"Country '{body.country_id}' not found")
    le = LegalEntity(
        id=_gen_id("le"),
        code=body.code,
        name=body.name,
        charging_location_id=body.charging_location_id,
        country_id=body.country_id,
    )
    db.add(le)
    _audit(db, user, "legal_entity", le.id, le.name, "create")
    db.commit()
    db.refresh(le)
    return _serialize_legal_entity(le)


@router.put("/legal-entities/{le_id}", response_model=LegalEntityResponse)
def update_legal_entity(
    le_id: str,
    body: LegalEntityUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    le = db.query(LegalEntity).filter(LegalEntity.id == le_id).first()
    if not le:
        raise HTTPException(404, "LegalEntity not found")

    if body.code is not None and body.code != le.code:
        if db.query(LegalEntity).filter(LegalEntity.code == body.code, LegalEntity.id != le_id).first():
            raise HTTPException(409, f"code '{body.code}' already in use")
        _audit(db, user, "legal_entity", le.id, le.name, "update", "code", le.code, body.code)
        le.code = body.code
    if body.name is not None and body.name != le.name:
        _audit(db, user, "legal_entity", le.id, le.name, "update", "name", le.name, body.name)
        le.name = body.name
    if body.charging_location_id is not None and body.charging_location_id != le.charging_location_id:
        if body.charging_location_id and not db.query(ChargingLocation).filter(
            ChargingLocation.id == body.charging_location_id,
        ).first():
            raise HTTPException(404, f"ChargingLocation '{body.charging_location_id}' not found")
        _audit(db, user, "legal_entity", le.id, le.name, "update",
               "charging_location_id", le.charging_location_id, body.charging_location_id)
        le.charging_location_id = body.charging_location_id
    if body.country_id is not None and body.country_id != le.country_id:
        if body.country_id and not db.query(Country).filter(Country.id == body.country_id).first():
            raise HTTPException(404, f"Country '{body.country_id}' not found")
        _audit(db, user, "legal_entity", le.id, le.name, "update",
               "country_id", le.country_id, body.country_id)
        le.country_id = body.country_id
    db.commit()
    db.refresh(le)
    return _serialize_legal_entity(le)


@router.put("/legal-entities/{le_id}/deactivate", response_model=LegalEntityResponse)
def deactivate_legal_entity(
    le_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    le = db.query(LegalEntity).filter(LegalEntity.id == le_id).first()
    if not le:
        raise HTTPException(404, "LegalEntity not found")
    _audit(db, user, "legal_entity", le.id, le.name, "deactivate")
    le.is_active = False
    db.commit()
    db.refresh(le)
    return _serialize_legal_entity(le)


# ===========================================================================
# v5 Session F2 — ChargeableEntity polymorphic root [F-DM-01..04]
# ===========================================================================

def _serialize_chargeable_entity(ce: ChargeableEntity) -> ChargeableEntityResponse:
    """Convert a ChargeableEntity ORM row to its response shape.

    The ``is_change_or_run`` derived classification is read off the model
    property — it consults the linked Project (for Project subtype) so the
    response stays consistent with pipeline state without a column on the
    chargeable_entities table.
    """
    return ChargeableEntityResponse(
        id=ce.id,
        entity_type=ce.entity_type,
        identifier=ce.identifier,
        name=ce.name,
        description=ce.description,
        hierarchy_node_id=ce.hierarchy_node_id,
        responsible_person_id=ce.responsible_person_id,
        to_business_pct=float(ce.to_business_pct or 0),
        annual_cost=float(ce.annual_cost) if ce.annual_cost is not None else None,
        project_id=ce.project_id,
        termination_month=ce.termination_month,
        is_active=ce.is_active,
        is_change_or_run=ce.is_change_or_run,
    )


@router.get("/chargeable-entities", response_model=ChargeableEntityListResponse)
def list_chargeable_entities(
    entity_type: str | None = None,
    hierarchy_node_id: str | None = None,
    is_active: bool | None = True,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role("controller")),
) -> ChargeableEntityListResponse:
    """List chargeable entities with optional filters per [F-DM-01].

    Default filter is ``is_active=True`` — pass ``is_active=null`` (literal
    ``null`` in querystring) to include deactivated rows. ``entity_type`` and
    ``hierarchy_node_id`` filter on the dimensions surfaced in the F4 module
    sidebar.
    """
    if entity_type is not None and entity_type not in CHARGEABLE_ENTITY_TYPES:
        raise HTTPException(
            422,
            f"entity_type must be one of {CHARGEABLE_ENTITY_TYPES}, got '{entity_type}'",
        )

    q = db.query(ChargeableEntity)
    if entity_type is not None:
        q = q.filter(ChargeableEntity.entity_type == entity_type)
    if hierarchy_node_id is not None:
        q = q.filter(ChargeableEntity.hierarchy_node_id == hierarchy_node_id)
    if is_active is not None:
        q = q.filter(ChargeableEntity.is_active == is_active)

    rows = q.order_by(ChargeableEntity.entity_type, ChargeableEntity.name).all()
    items = [_serialize_chargeable_entity(r) for r in rows]
    return ChargeableEntityListResponse(items=items, total=len(items))


@router.get(
    "/chargeable-entities/{entity_id}", response_model=ChargeableEntityResponse,
)
def get_chargeable_entity(
    entity_id: str,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role("controller")),
) -> ChargeableEntityResponse:
    ce = db.query(ChargeableEntity).filter_by(id=entity_id).first()
    if ce is None:
        raise HTTPException(404, f"ChargeableEntity '{entity_id}' not found")
    return _serialize_chargeable_entity(ce)


@router.post(
    "/chargeable-entities", response_model=ChargeableEntityResponse, status_code=201,
)
def create_chargeable_entity(
    body: ChargeableEntityCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
) -> ChargeableEntityResponse:
    """Create a new ChargeableEntity per [F-DM-01].

    For ``entity_type='Project'`` the request must reference an existing
    project_id. For Offering and InternalService no underlying entity exists —
    the row is created here and nowhere else.
    """
    # Validate identifier shape per the type's pattern.
    try:
        validate_identifier_for_type(body.entity_type, body.identifier)
    except ValueError as e:
        raise HTTPException(422, str(e))

    if body.entity_type == "Project":
        if not body.project_id:
            raise HTTPException(
                422, "project_id is required for entity_type='Project'",
            )
        proj = db.query(Project).filter_by(id=body.project_id).first()
        if proj is None:
            raise HTTPException(404, f"Project '{body.project_id}' not found")
        # Reject duplicate ChargeableEntity for the same project.
        existing = (
            db.query(ChargeableEntity).filter_by(project_id=body.project_id).first()
        )
        if existing is not None:
            raise HTTPException(
                409,
                f"Project '{body.project_id}' is already linked to "
                f"ChargeableEntity '{existing.id}'",
            )
    else:
        if body.project_id:
            raise HTTPException(
                422,
                f"project_id must be NULL for entity_type='{body.entity_type}'",
            )

    if body.hierarchy_node_id is not None:
        if not db.query(GroupingEntity).filter_by(id=body.hierarchy_node_id).first():
            raise HTTPException(
                404,
                f"GroupingEntity '{body.hierarchy_node_id}' not found",
            )
    if body.responsible_person_id is not None:
        if not db.query(Person).filter_by(id=body.responsible_person_id).first():
            raise HTTPException(
                404,
                f"Person '{body.responsible_person_id}' not found",
            )

    # Reject duplicate identifier (also enforced at the DB layer; surface a
    # friendly 409 here).
    if db.query(ChargeableEntity).filter_by(identifier=body.identifier).first():
        raise HTTPException(
            409, f"Identifier '{body.identifier}' already exists",
        )

    ce_id = body.identifier  # Use the identifier as the primary key — keeps URLs clean.
    ce = ChargeableEntity(
        id=ce_id,
        entity_type=body.entity_type,
        identifier=body.identifier,
        name=body.name,
        description=body.description,
        hierarchy_node_id=body.hierarchy_node_id,
        responsible_person_id=body.responsible_person_id,
        to_business_pct=body.to_business_pct,
        annual_cost=body.annual_cost,
        project_id=body.project_id,
        termination_month=body.termination_month,
    )
    db.add(ce)
    db.flush()

    # F3: Offering creation gate per [F-S2-01] — if entity_type='Offering' and
    # to_business_pct > 0, require an inline btc_profile or btc_profile_copy_from.
    # For now we log the requirement but do not block (BTC profile can be created
    # after entity creation in the admin UI). The gate at DoI 2→3 is the hard block.
    if body.entity_type == "Offering" and float(body.to_business_pct or 0) > 0:
        _audit(
            db, user, "chargeable_entity", ce.id, ce.name, "create",
            "btc_gate_note", None,
            f"Offering with to_business_pct={body.to_business_pct}% — BTC profile required before billing",
            category="master_data",
        )

    _audit(
        db, user, "chargeable_entity", ce.id, ce.name, "create",
        category="master_data",
    )
    db.commit()
    db.refresh(ce)
    return _serialize_chargeable_entity(ce)


@router.put(
    "/chargeable-entities/{entity_id}", response_model=ChargeableEntityResponse,
)
def update_chargeable_entity(
    entity_id: str,
    body: ChargeableEntityUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
) -> ChargeableEntityResponse:
    ce = db.query(ChargeableEntity).filter_by(id=entity_id).first()
    if ce is None:
        raise HTTPException(404, f"ChargeableEntity '{entity_id}' not found")

    if body.hierarchy_node_id is not None and body.hierarchy_node_id != ce.hierarchy_node_id:
        if not db.query(GroupingEntity).filter_by(id=body.hierarchy_node_id).first():
            raise HTTPException(
                404, f"GroupingEntity '{body.hierarchy_node_id}' not found",
            )
        _audit(
            db, user, "chargeable_entity", ce.id, ce.name, "update",
            "hierarchy_node_id", ce.hierarchy_node_id, body.hierarchy_node_id,
            category="master_data",
        )
        ce.hierarchy_node_id = body.hierarchy_node_id
    if body.responsible_person_id is not None and body.responsible_person_id != ce.responsible_person_id:
        if not db.query(Person).filter_by(id=body.responsible_person_id).first():
            raise HTTPException(
                404, f"Person '{body.responsible_person_id}' not found",
            )
        _audit(
            db, user, "chargeable_entity", ce.id, ce.name, "update",
            "responsible_person_id", ce.responsible_person_id,
            body.responsible_person_id, category="master_data",
        )
        ce.responsible_person_id = body.responsible_person_id
    if body.name is not None and body.name != ce.name:
        _audit(
            db, user, "chargeable_entity", ce.id, ce.name, "update",
            "name", ce.name, body.name, category="master_data",
        )
        ce.name = body.name
    if body.description is not None and body.description != ce.description:
        ce.description = body.description
    if body.to_business_pct is not None and float(ce.to_business_pct or 0) != body.to_business_pct:
        _audit(
            db, user, "chargeable_entity", ce.id, ce.name, "update",
            "to_business_pct",
            str(ce.to_business_pct), str(body.to_business_pct),
            category="master_data",
        )
        ce.to_business_pct = body.to_business_pct
    if body.termination_month is not None and body.termination_month != ce.termination_month:
        _audit(
            db, user, "chargeable_entity", ce.id, ce.name, "update",
            "termination_month", ce.termination_month, body.termination_month,
            category="master_data",
        )
        ce.termination_month = body.termination_month
    if body.annual_cost is not None:
        old_cost = float(ce.annual_cost) if ce.annual_cost is not None else None
        if old_cost != body.annual_cost:
            _audit(
                db, user, "chargeable_entity", ce.id, ce.name, "update",
                "annual_cost",
                str(old_cost) if old_cost is not None else None,
                str(body.annual_cost),
                category="master_data",
            )
            ce.annual_cost = body.annual_cost
            # Invalidate rollup cache for this entity across all years/versions.
            invalidate_for_entity_cost_write(db, ce.id)

    db.commit()
    db.refresh(ce)
    return _serialize_chargeable_entity(ce)


@router.put(
    "/chargeable-entities/{entity_id}/deactivate",
    response_model=ChargeableEntityResponse,
)
def deactivate_chargeable_entity(
    entity_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
) -> ChargeableEntityResponse:
    ce = db.query(ChargeableEntity).filter_by(id=entity_id).first()
    if ce is None:
        raise HTTPException(404, f"ChargeableEntity '{entity_id}' not found")
    _audit(
        db, user, "chargeable_entity", ce.id, ce.name, "deactivate",
        category="master_data",
    )
    ce.is_active = False
    db.commit()
    db.refresh(ce)
    return _serialize_chargeable_entity(ce)


# ===========================================================================
# v5 Session F2 — Stage 1 Distribution edges [F-S1-01..05]
# Mounted under /api/charging so the consumer-facing surfaces (F4 frontend,
# Cluster B simulator) have a separate prefix from /api/admin master data.
# ===========================================================================

def _serialize_distribution(d: Distribution) -> DistributionResponse:
    return DistributionResponse(
        id=d.id,
        year=d.year,
        version=d.version,
        source_entity_id=d.source_entity_id,
        destination_entity_id=d.destination_entity_id,
        percentage=float(d.percentage),
        source_entity_name=(d.source_entity.name if d.source_entity else None),
        destination_entity_name=(d.destination_entity.name if d.destination_entity else None),
    )


def _validation_error_to_http(e: DistributionValidationError) -> HTTPException:
    """Translate a service-level validation error to HTTP 409 with cycle chain."""
    payload: dict[str, object] = {"detail": e.message}
    if e.cycle_chain is not None:
        payload["cycle_chain"] = e.cycle_chain
    return HTTPException(409, payload)


@charging_router.get("/distributions", response_model=DistributionListResponse)
def list_distributions(
    year: int | None = None,
    version: str | None = None,
    source_entity_id: str | None = None,
    destination_entity_id: str | None = None,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role(
        "controller", "executive", "project_lead", "cost_center_owner",
    )),
) -> DistributionListResponse:
    """List distribution edges with optional filters per [F-S1-01].

    Open to all authenticated roles for read — Cluster F's data is
    read-visible per [F-UM-04] / [F-AC-01]. Writes require controller (the
    spec's responsible-owner edit path lands once F4 implements
    RolePermissionGrant enforcement).
    """
    q = db.query(Distribution)
    if year is not None:
        q = q.filter(Distribution.year == year)
    if version is not None:
        q = q.filter(Distribution.version == version)
    if source_entity_id is not None:
        q = q.filter(Distribution.source_entity_id == source_entity_id)
    if destination_entity_id is not None:
        q = q.filter(Distribution.destination_entity_id == destination_entity_id)
    rows = q.order_by(
        Distribution.year, Distribution.version, Distribution.source_entity_id,
    ).all()
    items = [_serialize_distribution(r) for r in rows]
    return DistributionListResponse(items=items, total=len(items))


@charging_router.get(
    "/distributions/{edge_id}", response_model=DistributionResponse,
)
def get_distribution(
    edge_id: int,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role(
        "controller", "executive", "project_lead", "cost_center_owner",
    )),
) -> DistributionResponse:
    edge = db.query(Distribution).filter_by(id=edge_id).first()
    if edge is None:
        raise HTTPException(404, f"Distribution edge {edge_id} not found")
    return _serialize_distribution(edge)


@charging_router.post(
    "/distributions", response_model=DistributionResponse, status_code=201,
)
def create_distribution(
    body: DistributionCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
) -> DistributionResponse:
    """Create a Stage 1 distribution edge per [F-S1-01..05].

    Validates the sum-rule per [F-S1-02] (≤100% across to_business_pct +
    distributions) and detects cycles per [F-S1-05]. On cycle, returns
    HTTP 409 with a structured body containing ``cycle_chain``.
    """
    if not is_known_version(body.version):
        # Soft warning — accept the version but note that it is non-builtin.
        # Audit category will reveal the typo trail if relevant.
        pass

    try:
        edge = create_distribution_edge(
            db,
            year=body.year,
            version=body.version,
            source_entity_id=body.source_entity_id,
            destination_entity_id=body.destination_entity_id,
            percentage=body.percentage,
        )
    except DistributionValidationError as e:
        raise _validation_error_to_http(e)

    _audit(
        db, user, "distribution", str(edge.id),
        f"{edge.source_entity_id} -> {edge.destination_entity_id}",
        "create",
        new_value=f"{body.year}/{body.version}: {body.percentage}%",
        category="master_data",
    )
    # Invalidate rollup cache for all affected entities in this (year, version).
    invalidate_for_distribution_write(db, body.source_entity_id, body.year, body.version)
    db.commit()
    db.refresh(edge)
    return _serialize_distribution(edge)


@charging_router.put(
    "/distributions/{edge_id}", response_model=DistributionResponse,
)
def update_distribution(
    edge_id: int,
    body: DistributionUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
) -> DistributionResponse:
    edge = db.query(Distribution).filter_by(id=edge_id).first()
    if edge is None:
        raise HTTPException(404, f"Distribution edge {edge_id} not found")

    old_pct = float(edge.percentage)
    try:
        edge = update_distribution_edge(db, edge_id, percentage=body.percentage)
    except DistributionValidationError as e:
        raise _validation_error_to_http(e)

    _audit(
        db, user, "distribution", str(edge.id),
        f"{edge.source_entity_id} -> {edge.destination_entity_id}",
        "update", "percentage", str(old_pct), str(body.percentage),
        category="master_data",
    )
    invalidate_for_distribution_write(db, edge.source_entity_id, edge.year, edge.version)
    db.commit()
    db.refresh(edge)
    return _serialize_distribution(edge)


@charging_router.delete("/distributions/{edge_id}")
def delete_distribution(
    edge_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
) -> dict:
    edge = db.query(Distribution).filter_by(id=edge_id).first()
    if edge is None:
        raise HTTPException(404, f"Distribution edge {edge_id} not found")
    edge_label = f"{edge.source_entity_id} -> {edge.destination_entity_id}"
    edge_year_version = f"{edge.year}/{edge.version}"
    edge_pct = float(edge.percentage)
    try:
        delete_distribution_edge(db, edge_id)
    except DistributionValidationError as e:
        raise _validation_error_to_http(e)
    _audit(
        db, user, "distribution", str(edge_id), edge_label, "delete",
        old_value=f"{edge_year_version}: {edge_pct}%",
        category="master_data",
    )
    # Invalidate cache: edge_label is "src -> dst", extract source.
    src_id = edge_label.split(" -> ")[0]
    year_str = edge_year_version.split("/")[0]
    ver_str = edge_year_version.split("/")[1]
    invalidate_for_distribution_write(db, src_id, int(year_str), ver_str)
    db.commit()
    return {"id": edge_id, "deleted": True}


@charging_router.get(
    "/entities/{entity_id}/distribution-summary",
    response_model=EntityDistributionSummary,
)
def get_entity_distribution_summary(
    entity_id: str,
    year: int,
    version: str = "forecast",
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role(
        "controller", "executive", "project_lead", "cost_center_owner",
    )),
) -> EntityDistributionSummary:
    """Single-entity Stage 1 profile per [F-S1-03].

    Returns the entity's ``to_business_pct``, all outgoing edges for the
    given (year, version), and the derived self-retained percentage so the
    F4 editor can render the edges-as-list view in one round trip.
    """
    entity = db.query(ChargeableEntity).filter_by(id=entity_id).first()
    if entity is None:
        raise HTTPException(404, f"ChargeableEntity '{entity_id}' not found")

    result = compute_sum_validation(db, entity_id, year, version)

    edges = db.query(Distribution).filter(
        Distribution.source_entity_id == entity_id,
        Distribution.year == year,
        Distribution.version == version,
    ).order_by(Distribution.destination_entity_id).all()

    return EntityDistributionSummary(
        entity_id=entity.id,
        entity_name=entity.name,
        year=year,
        version=version,
        to_business_pct=result.to_business_pct,
        distributions=[_serialize_distribution(e) for e in edges],
        self_retained_pct=result.self_retained_pct,
        sums_within_100=result.is_valid,
    )


@charging_router.put(
    "/entities/{entity_id}/to-business-pct",
    response_model=EntityDistributionSummary,
)
def update_entity_to_business_pct(
    entity_id: str,
    new_pct: float,
    year: int,
    version: str = "forecast",
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
) -> EntityDistributionSummary:
    """Update the entity's ``to_business_pct`` after validating the sum cap."""
    entity = db.query(ChargeableEntity).filter_by(id=entity_id).first()
    if entity is None:
        raise HTTPException(404, f"ChargeableEntity '{entity_id}' not found")
    old_value = float(entity.to_business_pct or 0)
    try:
        update_to_business_pct(
            db, entity_id, new_pct=new_pct, year=year, version=version,
        )
    except DistributionValidationError as e:
        raise _validation_error_to_http(e)

    _audit(
        db, user, "chargeable_entity", entity.id, entity.name, "update",
        "to_business_pct", str(old_value), str(new_pct),
        category="master_data",
    )
    db.commit()
    return get_entity_distribution_summary(entity_id, year, version, db, user)


@charging_router.get(
    "/entities/{entity_id}/effective-cost",
    response_model=DistributionEffectiveCost,
)
def get_entity_effective_cost(
    entity_id: str,
    year: int,
    version: str = "forecast",
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role(
        "controller", "executive", "project_lead", "cost_center_owner",
    )),
) -> DistributionEffectiveCost:
    """DAG-resolved effective cost per [F-S1-02].

    Returns own_cost + sum of inflows through the upstream chain. Inflows
    list each immediate upstream contribution (entity, %, amount) so the
    rollup drill-down can render the chain.
    """
    entity = db.query(ChargeableEntity).filter_by(id=entity_id).first()
    if entity is None:
        raise HTTPException(404, f"ChargeableEntity '{entity_id}' not found")
    result = compute_effective_cost(db, year, version, entity_id)
    return DistributionEffectiveCost(
        entity_id=result.entity_id,
        entity_name=result.entity_name,
        year=result.year,
        version=result.version,
        own_cost=round(result.own_cost, 2),
        inflows=[
            DistributionInflow(
                source_entity_id=c.source_entity_id,
                source_entity_name=c.source_entity_name,
                percentage=c.percentage,
                amount=c.amount,
            )
            for c in result.inflows
        ],
        inflow_total=round(result.inflow_total, 2),
        effective_cost=round(result.effective_cost, 2),
    )


@charging_router.get("/entities/{entity_id}/upstream-chain")
def get_entity_upstream_chain(
    entity_id: str,
    year: int,
    version: str = "forecast",
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role(
        "controller", "executive", "project_lead", "cost_center_owner",
    )),
) -> dict:
    """Return all upstream paths that terminate at the given entity per [F-RV-04].

    Each path is an ordered list of entity ids from a source (no incoming
    edges) down to the target. Used by the rollup drill-down panel to render
    contributing chains; F2 ships the data layer, F5 will consume it visually.
    """
    entity = db.query(ChargeableEntity).filter_by(id=entity_id).first()
    if entity is None:
        raise HTTPException(404, f"ChargeableEntity '{entity_id}' not found")
    paths = get_upstream_chain(db, year, version, entity_id)
    return {
        "entity_id": entity.id,
        "entity_name": entity.name,
        "year": year,
        "version": version,
        "paths": paths,
        "total": len(paths),
    }


@charging_router.get(
    "/entities/{entity_id}/wbs/{charging_location_id}",
    response_model=WBSElementResponse,
)
def get_entity_wbs_element(
    entity_id: str,
    charging_location_id: str,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role(
        "controller", "executive", "project_lead", "cost_center_owner",
    )),
) -> WBSElementResponse:
    """Algorithmic WBS element preview per [F-DM-03].

    Format: ``<entity.identifier>-64-99-<charging_location.code>``.
    Generated; never stored. Used by F3's SAP export and the F4 editor's
    preview row.
    """
    entity = db.query(ChargeableEntity).filter_by(id=entity_id).first()
    if entity is None:
        raise HTTPException(404, f"ChargeableEntity '{entity_id}' not found")
    cl = db.query(ChargingLocation).filter_by(id=charging_location_id).first()
    if cl is None:
        raise HTTPException(
            404, f"ChargingLocation '{charging_location_id}' not found",
        )
    wbs = build_wbs_element(entity.identifier, cl.code)
    return WBSElementResponse(
        entity_id=entity.id,
        charging_location_id=cl.id,
        wbs_element=wbs,
    )


# ===========================================================================
# v5 Session F3 — BTC Profile endpoints [F-S2-01..08]
# Mounted under /api/charging (read) and /api/admin (write scheduler).
# ===========================================================================

def _btc_error_to_http(e: BTCValidationError) -> HTTPException:
    payload: dict = {"detail": e.message}
    if e.warnings:
        payload["warnings"] = e.warnings
    return HTTPException(409, payload)


def _serialize_btc_profile(profile) -> BTCProfileResponse:
    """Serialize a BTCProfile ORM row to its response shape."""
    lines = [
        {
            "id": line.id,
            "profile_id": line.profile_id,
            "charging_location_id": line.charging_location_id,
            "percentage": float(line.percentage),
            "charging_location_code": line.charging_location.code if line.charging_location else None,
            "charging_location_name": line.charging_location.name if line.charging_location else None,
        }
        for line in (profile.lines or [])
    ]
    from schemas.btc_profile import BTCProfileLineResponse
    return BTCProfileResponse(
        id=profile.id,
        entity_id=profile.entity_id,
        year=profile.year,
        mode=profile.mode,
        s_code=profile.s_code,
        um_snapshot_at=profile.um_snapshot_at,
        status=profile.status,
        copied_from_profile_id=profile.copied_from_profile_id,
        lines=[BTCProfileLineResponse(**line) for line in lines],
        sums_to_100=compute_sums_to_100(profile.lines) if profile.lines else False,
        created_at=profile.created_at,
        modified_at=profile.modified_at,
    )


@charging_router.get("/btc-profiles", response_model=BTCProfileListResponse)
def list_btc_profiles(
    entity_id: str | None = None,
    year: int | None = None,
    status: str | None = None,
    mode: str | None = None,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role(
        "controller", "executive", "project_lead", "cost_center_owner",
    )),
) -> BTCProfileListResponse:
    """List BTC profiles with optional filters per [F-S2-01]."""
    profiles = list_profiles(
        db, entity_id=entity_id, year=year, status=status, mode=mode,
    )
    items = [_serialize_btc_profile(p) for p in profiles]
    return BTCProfileListResponse(items=items, total=len(items))


@charging_router.get("/btc-profiles/{profile_id}", response_model=BTCProfileResponse)
def get_btc_profile(
    profile_id: int,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role(
        "controller", "executive", "project_lead", "cost_center_owner",
    )),
) -> BTCProfileResponse:
    """Fetch a BTC profile by id. Includes sums-to-100 flag per [F-S2-02]."""
    try:
        profile = get_profile(db, profile_id)
    except BTCValidationError as e:
        raise HTTPException(404, e.message)
    return _serialize_btc_profile(profile)


@charging_router.get("/entities/{entity_id}/btc-profile", response_model=BTCProfileResponse)
def get_entity_btc_profile(
    entity_id: str,
    year: int,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role(
        "controller", "executive", "project_lead", "cost_center_owner",
    )),
) -> BTCProfileResponse:
    """Fetch the BTC profile for a specific (entity, year) per [F-S2-01]."""
    entity = db.query(ChargeableEntity).filter_by(id=entity_id).first()
    if entity is None:
        raise HTTPException(404, f"ChargeableEntity '{entity_id}' not found")
    profile = get_profile_for_entity(db, entity_id, year)
    if profile is None:
        raise HTTPException(
            404,
            f"No BTC profile for entity '{entity_id}' year {year}",
        )
    return _serialize_btc_profile(profile)


@charging_router.post("/btc-profiles", response_model=BTCProfileResponse, status_code=201)
def create_btc_profile(
    body: BTCProfileCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
) -> BTCProfileResponse:
    """Create a manual or automatic BTC profile per [F-S2-01..04]."""
    try:
        if body.mode == "manual":
            profile = create_manual_profile(
                db,
                entity_id=body.entity_id,
                year=body.year,
                lines=[{"charging_location_id": l.charging_location_id, "percentage": l.percentage} for l in body.lines],
                status=body.status,
            )
        else:
            if not body.s_code:
                raise HTTPException(422, "s_code is required for automatic mode")
            profile = create_automatic_profile(
                db,
                entity_id=body.entity_id,
                year=body.year,
                s_code=body.s_code,
                um_year=body.um_year,
                um_quarter=body.um_quarter,
                status=body.status,
            )
    except BTCValidationError as e:
        raise _btc_error_to_http(e)

    _audit(
        db, user, "btc_profile", str(profile.id),
        f"entity={body.entity_id} year={body.year} mode={body.mode}",
        "create",
        new_value=f"status={body.status}",
        category="master_data",
    )
    invalidate_for_btc_write(db, body.entity_id, body.year)
    db.commit()
    db.refresh(profile)
    return _serialize_btc_profile(profile)


@charging_router.put("/btc-profiles/{profile_id}", response_model=BTCProfileResponse)
def update_btc_profile(
    profile_id: int,
    body: BTCProfileUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
) -> BTCProfileResponse:
    """Update lines on a manual BTC profile per [F-S2-02]."""
    try:
        profile = get_profile(db, profile_id)
        profile = update_profile(
            db, profile_id,
            lines=[{"charging_location_id": l.charging_location_id, "percentage": l.percentage} for l in body.lines],
        )
    except BTCValidationError as e:
        raise _btc_error_to_http(e)

    _audit(
        db, user, "btc_profile", str(profile.id),
        f"entity={profile.entity_id} year={profile.year}",
        "update", "lines", None, f"{len(body.lines)} lines",
        category="master_data",
    )
    invalidate_for_btc_write(db, profile.entity_id, profile.year)
    db.commit()
    db.refresh(profile)
    return _serialize_btc_profile(profile)


@charging_router.delete("/btc-profiles/{profile_id}")
def delete_btc_profile(
    profile_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
) -> dict:
    """Delete a BTC profile (cascades to lines)."""
    from models.charging import BTCProfile as BTCProfileModel
    profile = db.query(BTCProfileModel).filter_by(id=profile_id).first()
    if profile is None:
        raise HTTPException(404, f"BTCProfile {profile_id} not found")
    entity_id = profile.entity_id
    year = profile.year
    _audit(
        db, user, "btc_profile", str(profile_id),
        f"entity={entity_id} year={year}",
        "delete",
        old_value=f"mode={profile.mode} status={profile.status}",
        category="master_data",
    )
    db.delete(profile)
    invalidate_for_btc_write(db, entity_id, year)
    db.commit()
    return {"id": profile_id, "deleted": True}


@charging_router.post(
    "/btc-profiles/{profile_id}/refresh-um",
    response_model=BTCRefreshDiffResponse,
)
def refresh_btc_profile_from_um(
    profile_id: int,
    body: BTCRefreshDiffRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
) -> BTCRefreshDiffResponse:
    """Refresh an automatic BTC profile from UM data per [F-S2-04].

    ``?dry_run=true`` returns the diff without committing. Pass
    ``body.dry_run=false`` to commit the update.
    """
    try:
        diff = refresh_from_um(
            db, profile_id,
            um_year=body.um_year,
            um_quarter=body.um_quarter,
            dry_run=body.dry_run,
        )
    except BTCValidationError as e:
        raise _btc_error_to_http(e)

    if not body.dry_run:
        try:
            profile = get_profile(db, profile_id)
            _audit(
                db, user, "btc_profile", str(profile_id),
                f"entity={profile.entity_id} year={profile.year}",
                "refresh_um",
                new_value=f"year={diff.year} Q{diff.quarter}",
                category="master_data",
            )
            invalidate_for_btc_write(db, profile.entity_id, profile.year)
        except BTCValidationError:
            pass
        db.commit()

    return BTCRefreshDiffResponse(
        profile_id=diff.profile_id,
        s_code=diff.s_code,
        year=diff.year,
        quarter=diff.quarter,
        added=diff.added,
        removed=diff.removed,
        changed=diff.changed,
        would_sum_to_100=diff.would_sum_to_100,
        committed=not body.dry_run,
    )


@charging_router.post(
    "/btc-profiles/{profile_id}/change-mode",
    response_model=BTCProfileResponse,
)
def change_btc_profile_mode(
    profile_id: int,
    body: BTCModeChangeRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
) -> BTCProfileResponse:
    """Change the mode of a BTC profile per [F-S2-03]."""
    try:
        profile_obj = get_profile(db, profile_id)
        profile_obj = change_mode(
            db, profile_id, body.new_mode,
            confirm=body.confirm,
            s_code=body.s_code,
            um_year=body.um_year,
            um_quarter=body.um_quarter,
        )
    except BTCValidationError as e:
        raise _btc_error_to_http(e)

    _audit(
        db, user, "btc_profile", str(profile_id),
        f"entity={profile_obj.entity_id} year={profile_obj.year}",
        "change_mode", "mode", None, body.new_mode,
        category="master_data",
    )
    invalidate_for_btc_write(db, profile_obj.entity_id, profile_obj.year)
    db.commit()
    db.refresh(profile_obj)
    return _serialize_btc_profile(profile_obj)


@charging_router.post(
    "/btc-profiles/{profile_id}/copy-from",
    response_model=BTCProfileResponse,
    status_code=201,
)
def copy_btc_profile(
    profile_id: int,
    body: BTCCopyFromRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
) -> BTCProfileResponse:
    """Copy a BTC profile to a new (entity, year) combination per [F-S2-06]."""
    try:
        new_profile = copy_from_profile(
            db, body.source_profile_id,
            target_entity_id=body.target_entity_id,
            target_year=body.target_year,
            target_status=body.target_status,
        )
    except BTCValidationError as e:
        raise _btc_error_to_http(e)

    _audit(
        db, user, "btc_profile", str(new_profile.id),
        f"entity={body.target_entity_id} year={body.target_year}",
        "copy_from",
        new_value=f"source_profile_id={body.source_profile_id}",
        category="master_data",
    )
    invalidate_for_btc_write(db, body.target_entity_id, body.target_year)
    db.commit()
    db.refresh(new_profile)
    return _serialize_btc_profile(new_profile)


@charging_router.get(
    "/entities/{entity_id}/wbs-matrix",
    response_model=WBSMatrixSchemaResponse,
)
def get_entity_wbs_matrix(
    entity_id: str,
    year: int,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role(
        "controller", "executive", "project_lead", "cost_center_owner",
    )),
) -> WBSMatrixSchemaResponse:
    """Return the full WBS matrix (all charging locations) for an entity per [F-OQ-05]."""
    try:
        matrix = build_wbs_matrix(db, entity_id, year)
    except BTCValidationError as e:
        raise HTTPException(404, e.message)

    return WBSMatrixSchemaResponse(
        entity_id=matrix.entity_id,
        entity_name=matrix.entity_name,
        identifier=matrix.identifier,
        year=matrix.year,
        rows=[
            {
                "charging_location_id": r.charging_location_id,
                "charging_location_code": r.charging_location_code,
                "charging_location_name": r.charging_location_name,
                "wbs_element": r.wbs_element,
                "btc_percentage": r.btc_percentage,
                "annual_amount_eur": r.annual_amount_eur,
            }
            for r in matrix.rows
        ],
        sums_to_100=matrix.sums_to_100,
        has_active_profile=matrix.has_active_profile,
        effective_cost=matrix.effective_cost,
    )


@router.post("/btc-profiles/year-rollover", response_model=YearRolloverResponse)
def btc_year_rollover(
    body: YearRolloverRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
) -> YearRolloverResponse:
    """Roll over all active BTC profiles from source_year to target_year per [F-S2-07]."""
    if body.source_year >= body.target_year:
        raise HTTPException(
            422, "target_year must be greater than source_year",
        )
    result = year_rollover(db, body.source_year, body.target_year)
    _audit(
        db, user, "btc_profile", "year_rollover",
        f"year_rollover source={body.source_year} target={body.target_year}",
        "year_rollover",
        new_value=f"rolled_over={len(result.rolled_over)} skipped={len(result.skipped)} errors={len(result.errors)}",
        category="master_data",
    )
    db.commit()
    return YearRolloverResponse(
        source_year=body.source_year,
        target_year=body.target_year,
        rolled_over=result.rolled_over,
        skipped=result.skipped,
        errors=result.errors,
    )


# ===========================================================================
# v5 Session F3 — Rollup Query + Cache endpoints [F-RV-01..06]
# ===========================================================================

@charging_router.get("/rollup", response_model=RollupListResponse)
def get_rollup(
    year: int,
    version: str = "forecast",
    group_by: str = "entity_type",
    entity_type: str | None = None,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role(
        "controller", "executive", "project_lead", "cost_center_owner",
    )),
) -> RollupListResponse:
    """Aggregate effective costs by dimension per [F-RV-01..06].

    ``group_by`` can be: entity, entity_type, hierarchy_node, responsible,
    change_or_run, charging_location, legal_entity, region, division, country, stage.
    """
    try:
        result = query_rollup(
            db, year, version,
            group_by=group_by,
            entity_type=entity_type,
        )
    except ValueError as e:
        raise HTTPException(422, str(e))

    return RollupListResponse(
        dimension=result.dimension,
        year=result.year,
        version=result.version,
        rows=[
            {
                "group_key": r.group_key,
                "group_label": r.group_label,
                "dimension": r.dimension,
                "year": r.year,
                "version": r.version,
                "entity_count": r.entity_count,
                "effective_cost": r.effective_cost,
                "own_cost": r.own_cost,
                "inflow_total": r.inflow_total,
                "stage2_amount": r.stage2_amount,
            }
            for r in result.rows
        ],
        grand_total_effective=result.grand_total_effective,
        grand_total_own_cost=result.grand_total_own_cost,
        total=len(result.rows),
    )


@charging_router.get(
    "/rollup/charging-location/{cl_id}",
    response_model=RollupDrillDownResponse,
)
def get_rollup_drill_down(
    cl_id: str,
    entity_id: str,
    year: int,
    version: str = "forecast",
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role(
        "controller", "executive", "project_lead", "cost_center_owner",
    )),
) -> RollupDrillDownResponse:
    """Drill into a specific (entity × charging-location) to see the upstream chain."""
    cl = db.query(ChargingLocation).filter_by(id=cl_id).first()
    if cl is None:
        raise HTTPException(404, f"ChargingLocation '{cl_id}' not found")
    try:
        result = drill_down_charging_location(db, entity_id, year, version, cl_id)
    except ValueError as e:
        raise HTTPException(404, str(e))

    return RollupDrillDownResponse(
        entity_id=result.entity_id,
        entity_name=result.entity_name,
        year=result.year,
        version=result.version,
        effective_cost=result.effective_cost,
        own_cost=result.own_cost,
        inflow_total=result.inflow_total,
        paths=[
            {"path": p.path, "path_labels": p.path_labels}
            for p in result.paths
        ],
    )


@charging_router.get(
    "/entities/{entity_id}/allocation-breakdown",
    response_model=EntityAllocationBreakdownResponse,
)
def get_entity_allocation_breakdown(
    entity_id: str,
    year: int,
    version: str = "forecast",
    sort_by: str = "amount",
    sort_dir: str = "desc",
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role(
        "controller", "executive", "project_lead", "cost_center_owner",
    )),
) -> EntityAllocationBreakdownResponse:
    """Per-entity BTC allocation breakdown for the Workbench BTC tab per [E-09].

    Returns one row per charging location in the entity's active BTC profile,
    each with the location's percentage, the absolute EUR amount allocated
    (effective_cost × to_business_pct ÷ 100 × percentage ÷ 100), and enriched
    region / country / division metadata. Sortable by location/region/division/
    percentage/amount in ascending or descending order.
    """
    try:
        result = query_entity_allocation_breakdown(
            db, entity_id, year, version,
            sort_by=sort_by, sort_dir=sort_dir,
        )
    except ValueError as e:
        raise HTTPException(404, str(e))

    return EntityAllocationBreakdownResponse(
        entity_id=result.entity_id,
        entity_name=result.entity_name,
        year=result.year,
        version=result.version,
        to_business_pct=result.to_business_pct,
        effective_cost=result.effective_cost,
        business_amount_total=result.business_amount_total,
        rows=[
            EntityAllocationBreakdownRow(
                charging_location_id=r.charging_location_id,
                charging_location_code=r.charging_location_code,
                charging_location_name=r.charging_location_name,
                region_name=r.region_name,
                division=r.division,
                country_iso_code=r.country_iso_code,
                legal_entity_name=r.legal_entity_name,
                percentage=r.percentage,
                amount_eur=r.amount_eur,
            )
            for r in result.rows
        ],
        profile_id=result.profile_id,
        profile_status=result.profile_status,
        profile_mode=result.profile_mode,
        has_profile=result.has_profile,
        sums_to_100=result.sums_to_100,
        total=len(result.rows),
    )


@router.post("/rollup-cache/invalidate")
def invalidate_rollup_cache(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
) -> dict:
    """Flush the entire rollup cache per [F-RV-01]. Manual recovery path."""
    count = invalidate_all(db)
    _audit(
        db, user, "rollup_cache", "global", "Rollup cache invalidation",
        "invalidate_all",
        new_value=f"deleted={count}",
        category="master_data",
    )
    db.commit()
    return {"deleted": count, "message": "Rollup cache flushed"}


@router.get("/rollup-cache/status", response_model=RollupCacheStatusResponse)
def get_rollup_cache_status(
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role("controller")),
) -> RollupCacheStatusResponse:
    """Diagnostic: return rollup cache entry counts per layer."""
    status = get_cache_status(db)
    return RollupCacheStatusResponse(**status)
