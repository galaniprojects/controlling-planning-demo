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
    ChargingLocation, Country, LegalEntity, Region, UserMeasurement,
)
from models.system import AuditLog
from schemas.charging import (
    ChargingLocationCreate, ChargingLocationResponse, ChargingLocationUpdate,
    CountryCreate, CountryResponse, CountryUpdate,
    LegalEntityCreate, LegalEntityResponse, LegalEntityUpdate,
    RegionCreate, RegionResponse, RegionUpdate,
)
from schemas.common import CurrentUser

router = APIRouter(prefix="/api/admin", tags=["Administration: Charging"])


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
) -> None:
    """Local audit-log helper.

    Mirrors ``routers.admin._log_audit`` with the same call signature and the
    same SQL columns. Kept independent of D2's pending category-field rollout
    per the team-lead's instruction "do not add a category parameter — D2 will
    add that field to AuditLog and update all callers in their commit".
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
