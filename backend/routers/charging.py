"""Cluster F charging-master admin endpoints (Country, Region, ChargingLocation, LegalEntity).

Built for v5 Session D1 per [F-MD-01], [F-MD-02], [F-MD-03], [F-AC-01].
All endpoints require the controller role per the existing admin pattern.
"""

from __future__ import annotations

from datetime import date
from uuid import uuid4

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
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
    BTCActivateRequest, BTCCopyFromRequest, BTCModeChangeRequest,
    BTCProfileCreate, BTCProfileListResponse, BTCProfileResponse,
    BTCProfileUpdate, BTCRefreshDiffRequest, BTCRefreshDiffResponse,
    WBSMatrixResponse as WBSMatrixSchemaResponse,
    YearRolloverRequest, YearRolloverResponse,
)
from schemas.chargeable_entity import (
    ChargeableEntityCreate, ChargeableEntityListResponse,
    ChargeableEntityResponse, ChargeableEntityTypeMetadata,
    ChargeableEntityTypesResponse, ChargeableEntityUpdate,
    validate_identifier_for_type,
)
from schemas.rollup import (
    EntityAllocationBreakdownResponse, EntityAllocationBreakdownRow,
    LocationBreakdownResponse,
    RollupCacheStatusResponse, RollupDrillDownResponse, RollupListResponse,
)
from schemas.sap_export import SAPExportListResponse, SAPExportRowResponse
from schemas.charging import (
    ChargingLocationCreate, ChargingLocationResponse, ChargingLocationUpdate,
    CountryCreate, CountryResponse, CountryUpdate,
    LegalEntityCreate, LegalEntityResponse, LegalEntityUpdate,
    RegionCreate, RegionResponse, RegionUpdate,
)
from schemas.common import CurrentUser
from schemas.distribution import (
    CascadeBusinessTerminal, CascadeChainResponse, CascadeEdge, CascadeNode,
    DistributionCandidate, DistributionCandidatesResponse,
    DistributionCreate, DistributionListResponse, DistributionResponse,
    DistributionUpdate, DistributionEffectiveCost, DistributionInflow,
    DistributionVersionActivate, DistributionVersionCreate,
    DistributionVersionDetailResponse, DistributionVersionDiff,
    DistributionVersionDiffEdge, DistributionVersionListResponse,
    DistributionVersionResponse, DistributionVersionUpdate,
    EntityDistributionSummary, EntityStage1Inflow, EntityStage1VersionEntry,
    EntityStage1View, WBSElementResponse,
)
from services.btc_service import (
    BTCValidationError, activate_profile, assert_btc_required,
    build_wbs_matrix, change_mode, copy_from_profile, create_automatic_profile,
    create_manual_profile, compute_sums_to_100, get_frozen_um_values,
    get_profile, get_profile_for_entity, list_profiles,
    load_active_um_versions, refresh_from_um, update_profile, year_rollover,
)
from services import cascade_query
from services.dag_resolver import (
    compute_effective_cost, get_upstream_chain,
)
from services.distribution_service import (
    DistributionValidationError, activate_version, compute_sum_validation,
    compute_version_diff, create_distribution_edge, create_version,
    delete_distribution_edge, delete_version, get_version,
    list_edges_for_version, list_versions, resolve_active_version,
    resolve_active_version_or_raise, update_distribution_edge,
    update_to_business_pct, update_version_rationale,
)
from services.rollup_cache import (
    get_cache_status, invalidate_all, invalidate_for_btc_write,
    invalidate_for_entity_cost_write, invalidate_for_version,
)
from services.sap_export_service import build_sap_export
from models.charging import DistributionVersion
from services.rollup_query import (
    drill_down_charging_location, get_location_breakdown,
    query_entity_allocation_breakdown, query_rollup,
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
    _user: CurrentUser = Depends(require_role(
        "controller", "executive", "project_lead", "cost_center_owner",
    )),
):
    """List all countries (active and inactive). [F-MD-02]

    Read-open to all four roles per [A-05]. Mutations remain controller-only.
    """
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
    _user: CurrentUser = Depends(require_role(
        "controller", "executive", "project_lead", "cost_center_owner",
    )),
):
    """List all regions. Read-open to all four roles per [A-05]."""
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
    _user: CurrentUser = Depends(require_role(
        "controller", "executive", "project_lead", "cost_center_owner",
    )),
):
    """List all charging locations [F-MD-01].

    Read-open to all four roles per [A-05]. Mutations remain controller-only.
    """
    rows = db.query(ChargingLocation).order_by(ChargingLocation.code).all()
    items = [_serialize_charging_location(cl) for cl in rows]
    return {"items": [i.model_dump() for i in items], "total": len(items)}


@charging_router.get("/charging-locations", response_model=dict)
def list_charging_locations_read_only(
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role(
        "controller", "executive", "project_lead", "cost_center_owner",
    )),
):
    """Read-only list of charging locations accessible to all four roles.

    F6 [E-09]: the Workbench BTC tab needs to render location names + codes
    for non-controller roles. The admin equivalent above is mutation-gated.
    """
    rows = (
        db.query(ChargingLocation)
        .filter(ChargingLocation.is_active.is_(True))
        .order_by(ChargingLocation.code)
        .all()
    )
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
    _user: CurrentUser = Depends(require_role(
        "controller", "executive", "project_lead", "cost_center_owner",
    )),
):
    """List legal entities, optionally filtered by charging-location rollup. [F-MD-01]

    Read-open to all four roles per [A-05]. Mutations remain controller-only.
    """
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
        allocation_key=ce.allocation_key,
        is_active=ce.is_active,
        is_change_or_run=ce.is_change_or_run,
    )


# FD-6 / [F-ADM-01] — type metadata table driving the admin panel's
# config-driven form. Kept in-file (not a DB table) so adding a future subtype
# is a tuple + dict edit; spec §8 "configurable set" satisfied without a
# migration. Per locked design [F-OQ-11] the polymorphic root carries no
# type-branch columns — the metadata here describes *which* base fields are
# meaningful per subtype, not which columns exist.
_TYPE_METADATA: dict[str, dict[str, object]] = {
    "Project": {
        "label": "Project",
        "requires_project_id": True,
        "supports_allocation_key": False,
    },
    "Offering": {
        "label": "Offering",
        "requires_project_id": False,
        "supports_allocation_key": False,
    },
    "InternalService": {
        "label": "Internal Service",
        "requires_project_id": False,
        "supports_allocation_key": True,
    },
}


@router.get(
    "/chargeable-entity-types", response_model=ChargeableEntityTypesResponse,
)
def list_chargeable_entity_types(
    _user: CurrentUser = Depends(require_role(
        "controller", "executive", "project_lead", "cost_center_owner",
    )),
) -> ChargeableEntityTypesResponse:
    """List the configurable ChargeableEntity subtypes per [F-ADM-01].

    Drives the FD-6 admin panel's type-aware form. Read-open to all four roles
    so the read surfaces of Charging (which non-controllers can see) can also
    render the type chips without hitting a 403. Mutations remain
    controller-only on the CRUD endpoints.
    """
    items = [
        ChargeableEntityTypeMetadata(
            code=code,  # type: ignore[arg-type]
            label=str(_TYPE_METADATA[code]["label"]),
            requires_project_id=bool(_TYPE_METADATA[code]["requires_project_id"]),
            supports_allocation_key=bool(
                _TYPE_METADATA[code]["supports_allocation_key"],
            ),
        )
        for code in CHARGEABLE_ENTITY_TYPES
    ]
    return ChargeableEntityTypesResponse(items=items, total=len(items))


@router.get("/chargeable-entities", response_model=ChargeableEntityListResponse)
def list_chargeable_entities(
    entity_type: str | None = None,
    hierarchy_node_id: str | None = None,
    is_active: str | None = "true",
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role(
        "controller", "executive", "project_lead", "cost_center_owner",
    )),
) -> ChargeableEntityListResponse:
    """List chargeable entities with optional filters per [F-DM-01].

    ``is_active`` accepts ``true`` (default — active only), ``false`` (inactive
    only), or ``null`` (include all). ``entity_type`` and ``hierarchy_node_id``
    filter on the dimensions surfaced in the F4 module sidebar. Read-open to
    all four roles per [A-05] — Charging & Allocations is read-visible across
    personas; mutations remain controller-only.
    """
    if entity_type is not None and entity_type not in CHARGEABLE_ENTITY_TYPES:
        raise HTTPException(
            422,
            f"entity_type must be one of {CHARGEABLE_ENTITY_TYPES}, got '{entity_type}'",
        )
    active_filter: bool | None
    if is_active is None or is_active.lower() == "null":
        active_filter = None
    elif is_active.lower() in ("true", "1"):
        active_filter = True
    elif is_active.lower() in ("false", "0"):
        active_filter = False
    else:
        raise HTTPException(
            422,
            f"is_active must be 'true', 'false', or 'null'; got '{is_active}'",
        )

    q = db.query(ChargeableEntity)
    if entity_type is not None:
        q = q.filter(ChargeableEntity.entity_type == entity_type)
    if hierarchy_node_id is not None:
        q = q.filter(ChargeableEntity.hierarchy_node_id == hierarchy_node_id)
    if active_filter is not None:
        q = q.filter(ChargeableEntity.is_active == active_filter)

    rows = q.order_by(ChargeableEntity.entity_type, ChargeableEntity.name).all()
    items = [_serialize_chargeable_entity(r) for r in rows]
    return ChargeableEntityListResponse(items=items, total=len(items))


@router.get(
    "/chargeable-entities/{entity_id}", response_model=ChargeableEntityResponse,
)
def get_chargeable_entity(
    entity_id: str,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role(
        "controller", "executive", "project_lead", "cost_center_owner",
    )),
) -> ChargeableEntityResponse:
    """Read a single ChargeableEntity. Open to all four roles per [A-05]."""
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
        allocation_key=body.allocation_key,
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
    if body.allocation_key is not None and body.allocation_key != ce.allocation_key:
        # FD-6 / [F-AK-01] — audited patch mirroring termination_month. No
        # type-branch guard: the column is nullable on the polymorphic root
        # per the locked design. UI only surfaces editing on the
        # InternalService subtype.
        _audit(
            db, user, "chargeable_entity", ce.id, ce.name, "update",
            "allocation_key", ce.allocation_key, body.allocation_key,
            category="master_data",
        )
        ce.allocation_key = body.allocation_key
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
        version_id=d.version_id,
        source_entity_id=d.source_entity_id,
        destination_entity_id=d.destination_entity_id,
        percentage=float(d.percentage),
        rationale=d.rationale,
        source_entity_name=(d.source_entity.name if d.source_entity else None),
        destination_entity_name=(d.destination_entity.name if d.destination_entity else None),
    )


def _serialize_version(
    v: DistributionVersion, *, edge_count: int | None = None,
) -> DistributionVersionResponse:
    """Serialize a DistributionVersion header. ``edge_count`` is server-computed."""
    return DistributionVersionResponse(
        id=v.id,
        status=v.status,
        active_from=v.active_from,
        rationale=v.rationale,
        origin=v.origin,
        copied_from_version_id=v.copied_from_version_id,
        scenario_id=v.scenario_id,
        created_at=v.created_at,
        created_by_person_id=v.created_by_person_id,
        activated_at=v.activated_at,
        edge_count=edge_count,
    )


def _validation_error_to_http(e: DistributionValidationError) -> HTTPException:
    """Translate a service-level validation error to HTTP 409.

    Threads cycle_chain (cycle violation) or violating_path (depth violation,
    Service Workbench S1) through to the response body so the UI can render
    the offending chain.
    """
    payload: dict[str, object] = {"detail": e.message}
    if e.cycle_chain is not None:
        payload["cycle_chain"] = e.cycle_chain
    if getattr(e, "violating_path", None) is not None:
        payload["violating_path"] = e.violating_path
    return HTTPException(409, payload)


# ---------------------------------------------------------------------------
# Distribution edges (rescoped to version_id per FD-3 [F-S1-02..04])
# ---------------------------------------------------------------------------


@charging_router.get("/distributions", response_model=DistributionListResponse)
def list_distributions(
    version_id: int | None = None,
    source_entity_id: str | None = None,
    destination_entity_id: str | None = None,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role(
        "controller", "executive", "project_lead", "cost_center_owner",
    )),
) -> DistributionListResponse:
    """List distribution edges with optional filters per [F-S1-01].

    Open to all authenticated roles for read per [F-AC-01]. ``version_id``
    is the canonical filter (replaces the v4 ``year + version`` pair which
    is cadence-agnostic in FD-3). Writes still require controller.
    """
    q = db.query(Distribution)
    if version_id is not None:
        q = q.filter(Distribution.version_id == version_id)
    if source_entity_id is not None:
        q = q.filter(Distribution.source_entity_id == source_entity_id)
    if destination_entity_id is not None:
        q = q.filter(Distribution.destination_entity_id == destination_entity_id)
    rows = q.order_by(
        Distribution.version_id, Distribution.source_entity_id,
        Distribution.destination_entity_id,
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

    ``body.version_id`` must point at a **draft** ``DistributionVersion``;
    writes against an active version are rejected with 409 per [F-S1-08].
    Validates the sum-rule per [F-S1-02] and detects cycles per [F-S1-05].
    On cycle, returns HTTP 409 with a structured body containing
    ``cycle_chain``.
    """
    try:
        edge = create_distribution_edge(
            db,
            version_id=body.version_id,
            source_entity_id=body.source_entity_id,
            destination_entity_id=body.destination_entity_id,
            percentage=body.percentage,
            rationale=body.rationale,
        )
    except DistributionValidationError as e:
        raise _validation_error_to_http(e)

    _audit(
        db, user, "distribution", str(edge.id),
        f"{edge.source_entity_id} -> {edge.destination_entity_id}",
        "create",
        new_value=f"version_id={body.version_id}: {body.percentage}%",
        category="master_data",
    )
    invalidate_for_version(db, body.version_id)
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
        edge = update_distribution_edge(
            db, edge_id, percentage=body.percentage,
            rationale=body.rationale,
            update_rationale=body.rationale is not None,
        )
    except DistributionValidationError as e:
        raise _validation_error_to_http(e)

    _audit(
        db, user, "distribution", str(edge.id),
        f"{edge.source_entity_id} -> {edge.destination_entity_id}",
        "update", "percentage", str(old_pct), str(body.percentage),
        category="master_data",
    )
    invalidate_for_version(db, edge.version_id)
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
    edge_version_id = edge.version_id
    edge_source_id = edge.source_entity_id
    edge_pct = float(edge.percentage)
    try:
        delete_distribution_edge(db, edge_id)
    except DistributionValidationError as e:
        raise _validation_error_to_http(e)
    _audit(
        db, user, "distribution", str(edge_id), edge_label, "delete",
        old_value=f"version_id={edge_version_id}: {edge_pct}%",
        category="master_data",
    )
    invalidate_for_version(db, edge_version_id)
    db.commit()
    return {"id": edge_id, "deleted": True}


def _resolve_version_param(
    db: Session, version_id: int | None, evaluated_date: date | None,
) -> DistributionVersion:
    """Resolve the version targeted by a per-entity read endpoint.

    - ``version_id`` (optional): explicit selection — overrides the resolver.
    - ``evaluated_date`` (optional): if ``version_id`` is omitted, resolves the
      production version in force on the given date.
    - Both omitted: resolves the production version in force today.

    Raises HTTP 404 if no production version is in force for the date.
    """
    if version_id is not None:
        v = db.query(DistributionVersion).filter_by(id=version_id).first()
        if v is None:
            raise HTTPException(404, f"DistributionVersion {version_id} not found")
        return v
    eff_date = evaluated_date or date.today()
    v = resolve_active_version(db, eff_date)
    if v is None:
        raise HTTPException(
            404,
            f"No production DistributionVersion in force for {eff_date}",
        )
    return v


@charging_router.get(
    "/entities/{entity_id}/distribution-summary",
    response_model=EntityDistributionSummary,
)
def get_entity_distribution_summary(
    entity_id: str,
    version_id: int | None = None,
    evaluated_date: date | None = None,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role(
        "controller", "executive", "project_lead", "cost_center_owner",
    )),
) -> EntityDistributionSummary:
    """Single-entity Stage 1 profile per [F-S1-03].

    Returns the entity's ``to_business_pct``, all outgoing edges for the
    given version, and the derived self-retained percentage so the editor
    can render the edges-as-list view in one round trip. ``version_id``
    selects an explicit version; ``evaluated_date`` resolves the in-force
    production version; both omitted = in-force today.
    """
    entity = db.query(ChargeableEntity).filter_by(id=entity_id).first()
    if entity is None:
        raise HTTPException(404, f"ChargeableEntity '{entity_id}' not found")

    version = _resolve_version_param(db, version_id, evaluated_date)
    result = compute_sum_validation(db, entity_id, version.id)

    edges = db.query(Distribution).filter(
        Distribution.source_entity_id == entity_id,
        Distribution.version_id == version.id,
    ).order_by(Distribution.destination_entity_id).all()

    return EntityDistributionSummary(
        entity_id=entity.id,
        entity_name=entity.name,
        version_id=version.id,
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
    version_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
) -> EntityDistributionSummary:
    """Update the entity's ``to_business_pct`` after validating the sum cap.

    ``version_id`` is required — `to_business_pct` is a shared property
    on the entity but its sum-rule context is per-version, and the service
    rejects writes against an active version per [F-S1-08].
    """
    entity = db.query(ChargeableEntity).filter_by(id=entity_id).first()
    if entity is None:
        raise HTTPException(404, f"ChargeableEntity '{entity_id}' not found")
    old_value = float(entity.to_business_pct or 0)
    try:
        update_to_business_pct(
            db, entity_id, new_pct=new_pct, version_id=version_id,
        )
    except DistributionValidationError as e:
        raise _validation_error_to_http(e)

    _audit(
        db, user, "chargeable_entity", entity.id, entity.name, "update",
        "to_business_pct", str(old_value), str(new_pct),
        category="master_data",
    )
    db.commit()
    return get_entity_distribution_summary(
        entity_id, version_id, None, db, user,
    )


@charging_router.get(
    "/entities/{entity_id}/effective-cost",
    response_model=DistributionEffectiveCost,
)
def get_entity_effective_cost(
    entity_id: str,
    year: int,
    version_id: int | None = None,
    evaluated_date: date | None = None,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role(
        "controller", "executive", "project_lead", "cost_center_owner",
    )),
) -> DistributionEffectiveCost:
    """DAG-resolved effective cost per [F-S1-02].

    Returns own_cost + sum of inflows through the upstream chain. Inflows
    list each immediate upstream contribution (entity, %, amount) so the
    rollup drill-down can render the chain. ``year`` is retained on this
    response (own-cost lookup is year-scoped); ``version_id``/
    ``evaluated_date`` select the Stage-1 version graph for the inflow
    rollup.
    """
    entity = db.query(ChargeableEntity).filter_by(id=entity_id).first()
    if entity is None:
        raise HTTPException(404, f"ChargeableEntity '{entity_id}' not found")
    version = _resolve_version_param(db, version_id, evaluated_date)
    result = compute_effective_cost(db, year, version.id, entity_id)
    return DistributionEffectiveCost(
        entity_id=result.entity_id,
        entity_name=result.entity_name,
        year=result.year,
        version_id=result.version_id,
        own_cost=round(result.own_cost, 2),
        own_cost_source=result.own_cost_source,
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
    version_id: int | None = None,
    evaluated_date: date | None = None,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role(
        "controller", "executive", "project_lead", "cost_center_owner",
    )),
) -> dict:
    """Return all upstream paths that terminate at the given entity per [F-RV-04].

    Each path is an ordered list of entity ids from a source (no incoming
    edges) down to the target. Used by the rollup drill-down panel to render
    contributing chains.
    """
    entity = db.query(ChargeableEntity).filter_by(id=entity_id).first()
    if entity is None:
        raise HTTPException(404, f"ChargeableEntity '{entity_id}' not found")
    version = _resolve_version_param(db, version_id, evaluated_date)
    paths = get_upstream_chain(db, version.id, entity_id)
    return {
        "entity_id": entity.id,
        "entity_name": entity.name,
        "version_id": version.id,
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
# Charging/UM rework cluster FD-3 — DistributionVersion endpoints [F-S1-02..08]
# Effective-dated Stage 1 version management.
#
# This block ships in two waves:
# - **B0** (this commit): Pydantic-schema contract + 501-stub handlers so the
#   frontend (teammate-c) can wire types against the real shapes immediately.
# - **B1 / B2**: service layer + handler bodies + tests.
#
# All write endpoints are Controller-only per the existing admin pattern;
# reads open to all four roles per `[F-AC-01]`.
# ===========================================================================

# DEMO_YEAR is the year axis used for own-cost lookup in the per-entity
# Stage 1 view (effective-cost rollup). The Stage 1 graph is cadence-
# agnostic, but own_cost surfaces from year-keyed columns
# (Project.annual_budget, ChargeableEntity.annual_cost). Derived from
# config.DEMO_DATE so a demo-date bump propagates automatically.
from config import DEMO_DATE as _DEMO_DATE  # noqa: E402
_DEMO_YEAR = int(_DEMO_DATE.split("-")[0])


def _count_edges(db: Session, version_id: int) -> int:
    return db.query(Distribution).filter(
        Distribution.version_id == version_id,
    ).count()


@charging_router.get(
    "/distribution-versions",
    response_model=DistributionVersionListResponse,
)
def list_distribution_versions(
    status: str | None = None,
    include_scenario: bool = False,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role(
        "controller", "executive", "project_lead", "cost_center_owner",
    )),
) -> DistributionVersionListResponse:
    """List ``DistributionVersion`` headers per `[F-S1-02..04]`.

    Filters:
    - ``status`` — ``draft`` / ``active`` (default both).
    - ``include_scenario`` — when False (default), scenario-scoped versions
      are hidden. The simulator surfaces its sandbox version through its
      own endpoints, not the production timeline.
    """
    versions = list_versions(
        db, status=status, include_scenario=include_scenario,
    )
    items = [
        _serialize_version(v, edge_count=_count_edges(db, v.id))
        for v in versions
    ]
    return DistributionVersionListResponse(items=items, total=len(items))


@charging_router.post(
    "/distribution-versions",
    response_model=DistributionVersionDetailResponse,
    status_code=201,
)
def create_distribution_version(
    body: DistributionVersionCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
) -> DistributionVersionDetailResponse:
    """Create a new draft ``DistributionVersion`` per `[F-S1-04]`.

    Three origins:

    - ``blank`` — empty draft, no edges. ``copied_from_version_id`` ignored.
    - ``copy_active`` — copy edges from the currently in-force production
      version (latest ``active_from`` ≤ today). ``copied_from_version_id``
      ignored.
    - ``copy_prior`` — copy edges from the version identified by
      ``copied_from_version_id`` (required for this origin).

    Returns the new draft header plus its (possibly-copied) edges so the
    UI can render the version-creation modal preview in one round trip.
    Scenario-scoped versions cannot be created via this endpoint — the
    lever-12 service creates them lazily.
    """
    try:
        v = create_version(
            db,
            origin=body.origin,
            rationale=body.rationale,
            copied_from_version_id=body.copied_from_version_id,
            created_by_person_id=user.person_id,
            scenario_id=None,
        )
    except DistributionValidationError as e:
        raise _validation_error_to_http(e)

    _audit(
        db, user, "distribution_version", str(v.id),
        f"version {v.id}", "create",
        new_value=f"origin={body.origin} copied_from={body.copied_from_version_id}",
        category="master_data",
    )
    db.commit()
    db.refresh(v)
    edges = list_edges_for_version(db, v.id)
    return DistributionVersionDetailResponse(
        version=_serialize_version(v, edge_count=len(edges)),
        edges=[_serialize_distribution(e) for e in edges],
        total_edges=len(edges),
    )


@charging_router.get(
    "/distribution-versions/{version_id}",
    response_model=DistributionVersionDetailResponse,
)
def get_distribution_version(
    version_id: int,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role(
        "controller", "executive", "project_lead", "cost_center_owner",
    )),
) -> DistributionVersionDetailResponse:
    """Detail (header + edges) for a ``DistributionVersion``.

    Edge list is sorted by ``(source_entity_id, destination_entity_id)`` so
    the UI's deterministic ordering matches the diff report.
    """
    v = db.query(DistributionVersion).filter_by(id=version_id).first()
    if v is None:
        raise HTTPException(404, f"DistributionVersion {version_id} not found")
    edges = list_edges_for_version(db, v.id)
    return DistributionVersionDetailResponse(
        version=_serialize_version(v, edge_count=len(edges)),
        edges=[_serialize_distribution(e) for e in edges],
        total_edges=len(edges),
    )


@charging_router.put(
    "/distribution-versions/{version_id}",
    response_model=DistributionVersionResponse,
)
def update_distribution_version(
    version_id: int,
    body: DistributionVersionUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
) -> DistributionVersionResponse:
    """Update a draft version's rationale per `[F-S1-05]`.

    Edges are mutated via the existing edge endpoints
    (``/api/charging/distributions``). The service rejects header updates
    on an active version with HTTP 409 (immutable per `[F-S1-08]`).
    """
    try:
        v = update_version_rationale(db, version_id, rationale=body.rationale)
    except DistributionValidationError as e:
        raise _validation_error_to_http(e)
    _audit(
        db, user, "distribution_version", str(v.id),
        f"version {v.id}", "update", "rationale", None, body.rationale,
        category="master_data",
    )
    db.commit()
    db.refresh(v)
    return _serialize_version(v, edge_count=_count_edges(db, v.id))


@charging_router.post(
    "/distribution-versions/{version_id}/activate",
    response_model=DistributionVersionResponse,
)
def activate_distribution_version(
    version_id: int,
    body: DistributionVersionActivate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
) -> DistributionVersionResponse:
    """Activate a draft ``DistributionVersion`` per `[F-S1-02..03][F-S1-08]`.

    Production-only flip (draft → active):
    - ``active_from`` required.
    - ``rationale`` required (non-empty).

    Service rejects (all HTTP 409):
    - Activating a scenario-scoped version (those stay draft permanently).
    - Duplicate ``active_from`` across production active versions per
      [F-S1-02] "identical ``active_from`` for the same scope is forbidden".
    - Empty rationale per [F-S1-05].

    On success: ``status='active'``, ``activated_at=now()``, ``rationale``
    set, the version becomes the in-force version for the supplied
    ``active_from`` going forward. Header + edges then immutable.
    """
    try:
        v = activate_version(
            db, version_id,
            active_from=body.active_from, rationale=body.rationale,
        )
    except DistributionValidationError as e:
        raise _validation_error_to_http(e)
    _audit(
        db, user, "distribution_version", str(v.id),
        f"version {v.id}", "activate",
        new_value=f"active_from={body.active_from} rationale={body.rationale!r}",
        category="master_data",
    )
    # Activation does not change the edge graph; no cache invalidation needed.
    db.commit()
    db.refresh(v)
    return _serialize_version(v, edge_count=_count_edges(db, v.id))


@charging_router.delete("/distribution-versions/{version_id}")
def delete_distribution_version(
    version_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
) -> dict:
    """Delete a draft ``DistributionVersion``.

    Active production versions are immutable per [F-S1-08] — the service
    rejects deletion with HTTP 409. Scenario-scoped versions are deleted
    via scenario cleanup (FK cascade), not via this endpoint.

    Future-dated active revocation is tracked as an open question
    (plan §"Open questions" #2); not implemented in B2.
    """
    try:
        v = delete_version(db, version_id)
    except DistributionValidationError as e:
        raise _validation_error_to_http(e)
    _audit(
        db, user, "distribution_version", str(version_id),
        f"version {version_id}", "delete",
        old_value=f"status={v.status} origin={v.origin}",
        category="master_data",
    )
    db.commit()
    return {"id": version_id, "deleted": True}


@charging_router.get(
    "/distribution-versions/{version_id}/diff",
    response_model=DistributionVersionDiff,
)
def diff_distribution_version(
    version_id: int,
    compared_to_version_id: int | None = None,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role(
        "controller", "executive", "project_lead", "cost_center_owner",
    )),
) -> DistributionVersionDiff:
    """Version-diff report per [F-S1-07].

    Default ``compared_to_version_id``:
    - For production versions — the version preceding ``version_id`` by
      effective date (i.e. the version this one supersedes).
    - For scenario-scoped versions — the production anchor the scenario
      forked from (``Scenario.anchor_distribution_version_id``, or the
      resolver's active production version at the scenario creation time
      if NULL).
    """
    try:
        result = compute_version_diff(
            db, version_id, compared_to_version_id=compared_to_version_id,
        )
    except DistributionValidationError as e:
        # 404 if "not found"; 422 if "no default partner" — both raise the
        # validation error from the service. We map to 404 in the former and
        # 422 in the latter so the frontend can distinguish.
        if "not found" in e.message.lower():
            raise HTTPException(404, e.message)
        raise HTTPException(422, e.message)

    # Decorate the diff edges with entity names from a single lookup.
    entity_ids: set[str] = set()
    for c in result.changes:
        entity_ids.add(c.source_entity_id)
        entity_ids.add(c.destination_entity_id)
    name_lookup: dict[str, str] = {}
    if entity_ids:
        for row in (
            db.query(ChargeableEntity.id, ChargeableEntity.name)
            .filter(ChargeableEntity.id.in_(entity_ids))
            .all()
        ):
            name_lookup[row[0]] = row[1]

    diff_edges = [
        DistributionVersionDiffEdge(
            change_kind=c.change_kind,
            source_entity_id=c.source_entity_id,
            destination_entity_id=c.destination_entity_id,
            source_entity_name=name_lookup.get(c.source_entity_id),
            destination_entity_name=name_lookup.get(c.destination_entity_id),
            old_percentage=c.old_percentage,
            new_percentage=c.new_percentage,
            old_rationale=c.old_rationale,
            new_rationale=c.new_rationale,
        )
        for c in result.changes
    ]
    return DistributionVersionDiff(
        version=_serialize_version(
            result.version,
            edge_count=_count_edges(db, result.version.id),
        ),
        compared_to_version=_serialize_version(
            result.compared_to_version,
            edge_count=_count_edges(db, result.compared_to_version.id),
        ),
        changes=diff_edges,
        added_count=result.added_count,
        removed_count=result.removed_count,
        changed_count=result.changed_count,
        total=len(diff_edges),
    )


# ===========================================================================
# Service Workbench Session 2 — bidirectional cascade + candidate picker
# Composes A's resolver + B's depth helpers via services/cascade_query.py.
# Reads open to all four roles (mutations live elsewhere).
# ===========================================================================


def _serialize_cascade_node(n: cascade_query.CascadeNodeResult) -> CascadeNode:
    return CascadeNode(
        entity_id=n.entity_id,
        entity_name=n.entity_name,
        entity_type=n.entity_type,  # type: ignore[arg-type]
        identifier=n.identifier,
        own_cost=n.own_cost,
        effective_cost=n.effective_cost,
        to_business_pct=n.to_business_pct,
        self_retained_pct=n.self_retained_pct,
    )


@charging_router.get(
    "/cascade/{entity_id}",
    response_model=CascadeChainResponse,
)
def get_cascade_chain(
    entity_id: str,
    version_id: int | None = None,
    evaluated_date: date | None = None,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role(
        "controller", "executive", "project_lead", "cost_center_owner",
    )),
) -> CascadeChainResponse:
    """Full bidirectional cascade for a focal ChargeableEntity.

    Returns the focal node, transitively-collected upstream + downstream
    node lists, every edge in the displayed sub-graph (with resolved EUR
    amounts and the chain_depth cache value), and the focal's BTC
    business terminals projected for the demo year.

    ``version_id`` selects an explicit DistributionVersion (production or
    draft); ``evaluated_date`` resolves the production version in force
    on that date; both omitted = production version in force today.

    Powers the Service Workbench Allocation Flow view (Session 4).
    """
    # Pre-flight existence check so 404 fires before we resolve the version
    # (parity with the existing /stage1/entities/{entity_id} endpoint).
    ce = (
        db.query(ChargeableEntity).filter(ChargeableEntity.id == entity_id).first()
    )
    if ce is None:
        raise HTTPException(404, f"ChargeableEntity '{entity_id}' not found")

    try:
        result = cascade_query.query_cascade_chain(
            db, entity_id, version_id=version_id, evaluated_date=evaluated_date,
        )
    except ValueError as e:
        raise HTTPException(404, str(e))

    return CascadeChainResponse(
        focal=_serialize_cascade_node(result.focal),
        upstream=[_serialize_cascade_node(n) for n in result.upstream],
        downstream=[_serialize_cascade_node(n) for n in result.downstream],
        edges=[
            CascadeEdge(
                source_entity_id=e.source_entity_id,
                destination_entity_id=e.destination_entity_id,
                percentage=e.percentage,
                amount=e.amount,
                chain_depth=e.chain_depth,
                rationale=e.rationale,
            )
            for e in result.edges
        ],
        business_terminals=[
            CascadeBusinessTerminal(
                charging_location_id=t.charging_location_id,
                code=t.code,
                name=t.name,
                percentage=t.percentage,
                amount=t.amount,
            )
            for t in result.business_terminals
        ],
        version=_serialize_version(
            result.version,
            edge_count=_count_edges(db, result.version.id),
        ),
        evaluated_date=result.evaluated_date,
        max_allocation_depth=result.max_allocation_depth,
    )


@charging_router.get(
    "/distribution-candidates/{source_entity_id}",
    response_model=DistributionCandidatesResponse,
)
def get_distribution_candidates(
    source_entity_id: str,
    version_id: int | None = None,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role(
        "controller", "executive", "project_lead", "cost_center_owner",
    )),
) -> DistributionCandidatesResponse:
    """Eligible distribution targets from a source entity.

    Returns every active ChargeableEntity except: the source itself,
    entities already wired as an outgoing target from the source in this
    version, and entities that would form a cycle if added. Each candidate
    carries the ``resulting_chain_depth`` (longest path that would pass
    through the simulated edge) and ``near_max_depth_warning`` (set when
    the resulting depth is at or beyond ``max_allocation_depth - 1``).

    ``version_id`` defaults to the production version in force today.
    Powers the entity picker in the Service Workbench cascade editor
    (Session 5).
    """
    ce = (
        db.query(ChargeableEntity)
        .filter(ChargeableEntity.id == source_entity_id)
        .first()
    )
    if ce is None:
        raise HTTPException(
            404, f"ChargeableEntity '{source_entity_id}' not found",
        )

    try:
        result = cascade_query.query_distribution_candidates(
            db, source_entity_id, version_id=version_id,
        )
    except ValueError as e:
        raise HTTPException(404, str(e))

    return DistributionCandidatesResponse(
        source_entity_id=result.source_entity_id,
        version_id=result.version_id,
        max_allocation_depth=result.max_allocation_depth,
        candidates=[
            DistributionCandidate(
                entity_id=c.entity_id,
                entity_name=c.entity_name,
                entity_type=c.entity_type,  # type: ignore[arg-type]
                identifier=c.identifier,
                resulting_chain_depth=c.resulting_chain_depth,
                near_max_depth_warning=c.near_max_depth_warning,
                would_violate_max_depth=c.would_violate_max_depth,
            )
            for c in result.candidates
        ],
        total=len(result.candidates),
    )


@charging_router.get(
    "/stage1/entities/{entity_id}",
    response_model=EntityStage1View,
)
def get_entity_stage1_view(
    entity_id: str,
    evaluated_date: date | None = None,
    version_id: int | None = None,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role(
        "controller", "executive", "project_lead", "cost_center_owner",
    )),
) -> EntityStage1View:
    """Per-entity Stage 1 surface per [F-S1-06] (first-class).

    Returns everything the per-entity panel needs in one round trip:
    outbound edges with per-edge rationale, ``to_business_pct``, derived
    self-retained residual, effective cost (own + Σ inflows), and the
    effective-dated production version-history sidebar for the entity's
    outbound timeline.

    Resolution:
    - ``version_id`` (optional): explicit version selection — overrides the
      effective-date resolver. Used by the version-history sidebar to switch
      to a past production version.
    - ``evaluated_date`` (optional): if ``version_id`` is omitted, resolves
      the production version in force on this date. Defaults to today.
    """
    entity = db.query(ChargeableEntity).filter_by(id=entity_id).first()
    if entity is None:
        raise HTTPException(404, f"ChargeableEntity '{entity_id}' not found")

    eff_date = evaluated_date or date.today()
    version = _resolve_version_param(db, version_id, eff_date)

    sum_result = compute_sum_validation(db, entity_id, version.id)
    outbound = (
        db.query(Distribution)
        .filter(
            Distribution.source_entity_id == entity_id,
            Distribution.version_id == version.id,
        )
        .order_by(Distribution.destination_entity_id)
        .all()
    )
    effective = compute_effective_cost(db, _DEMO_YEAR, version.id, entity_id)

    # Build the version-history sidebar — production versions only, ordered
    # by active_from desc with NULLs (drafts) at the bottom.
    in_force = resolve_active_version(db, eff_date)
    in_force_id = in_force.id if in_force is not None else None
    production_versions = list_versions(db, include_scenario=False)

    history: list[EntityStage1VersionEntry] = []
    for pv in production_versions:
        count = (
            db.query(Distribution)
            .filter(
                Distribution.version_id == pv.id,
                Distribution.source_entity_id == entity_id,
            )
            .count()
        )
        history.append(EntityStage1VersionEntry(
            version_id=pv.id,
            active_from=pv.active_from,
            activated_at=pv.activated_at,
            status=pv.status,
            rationale=pv.rationale,
            origin=pv.origin,
            is_in_force=(pv.id == in_force_id),
            edge_count_for_entity=count,
        ))

    return EntityStage1View(
        entity_id=entity.id,
        entity_name=entity.name,
        entity_type=entity.entity_type,
        evaluated_date=eff_date,
        version=_serialize_version(version, edge_count=_count_edges(db, version.id)),
        to_business_pct=sum_result.to_business_pct,
        self_retained_pct=sum_result.self_retained_pct,
        sums_within_100=sum_result.is_valid,
        outbound_edges=[_serialize_distribution(e) for e in outbound],
        own_cost=round(effective.own_cost, 2),
        own_cost_source=effective.own_cost_source,
        inflows=[
            EntityStage1Inflow(
                source_entity_id=c.source_entity_id,
                source_entity_name=c.source_entity_name,
                percentage=c.percentage,
                amount=c.amount,
            )
            for c in effective.inflows
        ],
        inflow_total=round(effective.inflow_total, 2),
        effective_cost=round(effective.effective_cost, 2),
        history=history,
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


def _serialize_btc_profile(
    db: Session, profile, *, um_versions=None,
) -> BTCProfileResponse:
    """Serialize a BTCProfile ORM row to its response shape.

    FD-5 [F-DSH-01]: automatic profiles additionally carry the triple-display
    context — each line's raw UM integer (from the frozen UM version) and the
    service-level ``allocation_key`` (from the InternalService entity).

    ``um_versions`` lets the list endpoint pass a pre-loaded activated-version
    list so the frozen-version lookup is resolved once per request rather than
    re-scanning ``UMVersion`` per profile.
    """
    raw_um_by_cl: dict[str, int] = {}
    if profile.mode == "automatic":
        raw_um_by_cl = get_frozen_um_values(
            db, profile.s_code, profile.um_snapshot_at, versions=um_versions,
        )
    lines = [
        {
            "id": line.id,
            "profile_id": line.profile_id,
            "charging_location_id": line.charging_location_id,
            "percentage": float(line.percentage),
            "charging_location_code": line.charging_location.code if line.charging_location else None,
            "charging_location_name": line.charging_location.name if line.charging_location else None,
            "raw_um_value": raw_um_by_cl.get(line.charging_location_id),
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
        allocation_key=profile.entity.allocation_key if profile.entity else None,
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
    # Resolve the activated UM-version set once for the whole page — the
    # per-profile frozen-value lookup reuses it instead of re-scanning.
    um_versions = (
        load_active_um_versions(db)
        if any(p.mode == "automatic" for p in profiles)
        else []
    )
    items = [
        _serialize_btc_profile(db, p, um_versions=um_versions) for p in profiles
    ]
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
    return _serialize_btc_profile(db, profile)


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
    return _serialize_btc_profile(db, profile)


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
    return _serialize_btc_profile(db, profile)


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
    return _serialize_btc_profile(db, profile)


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
    "/btc-profiles/{profile_id}/activate",
    response_model=BTCProfileResponse,
)
def activate_btc_profile(
    profile_id: int,
    body: BTCActivateRequest = Body(default_factory=lambda: BTCActivateRequest()),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
) -> BTCProfileResponse:
    """Activate a draft BTC profile per FD-4 [F-S2-02].

    Snapshot-freeze semantics:
    - Automatic profiles re-snapshot against the currently active UM
      version at activate-time. Optional ``um_year``/``um_quarter``
      override the (year, quarter) lookup.
    - Manual profiles re-validate sum-to-100 and flip status.

    InternalService manual mode is blocked at create-time per [F-S2-01],
    so this endpoint only sees Project/Offering manual profiles.
    """
    try:
        profile = activate_profile(
            db, profile_id,
            um_year=body.um_year, um_quarter=body.um_quarter,
        )
    except BTCValidationError as e:
        raise _btc_error_to_http(e)

    _audit(
        db, user, "btc_profile", str(profile_id),
        f"entity={profile.entity_id} year={profile.year}",
        "activate", "status", "draft", "active",
        category="master_data",
    )
    invalidate_for_btc_write(db, profile.entity_id, profile.year)
    db.commit()
    db.refresh(profile)
    return _serialize_btc_profile(db, profile)


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
    return _serialize_btc_profile(db, profile_obj)


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
    return _serialize_btc_profile(db, new_profile)


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
    """Roll over active BTC profiles from source_year to target_year per [F-S2-07].

    Optional ``entity_types`` and ``entity_ids`` scope filters narrow the set
    of source-year profiles considered; both ``None`` means "roll all".
    """
    if body.source_year >= body.target_year:
        raise HTTPException(
            422, "target_year must be greater than source_year",
        )
    result = year_rollover(
        db,
        body.source_year,
        body.target_year,
        entity_types=body.entity_types,
        entity_ids=body.entity_ids,
    )
    scope_label = "all"
    if body.entity_ids:
        scope_label = f"entity_ids={','.join(body.entity_ids)}"
    elif body.entity_types:
        scope_label = f"entity_types={','.join(body.entity_types)}"
    _audit(
        db, user, "btc_profile", "year_rollover",
        f"year_rollover source={body.source_year} target={body.target_year} scope={scope_label}",
        "year_rollover",
        new_value=f"rolled_over={len(result.rolled_over)} skipped={len(result.skipped)} errors={len(result.errors)} scope={scope_label}",
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
# FD-4 [F-EXP-01] — SAP export endpoint
# ===========================================================================

_SAP_EXPORT_CSV_HEADER = (
    "wbs_element,entity_id,entity_identifier,entity_name,entity_type,"
    "charging_location_id,charging_location_code,charging_location_name,"
    "year,percentage,annual_amount_eur\n"
)

_VALID_ENTITY_TYPES = ("Project", "Offering", "InternalService")


def _csv_escape(value: object) -> str:
    """Minimal CSV escaping — quote when the value contains a comma, quote,
    or newline; double up embedded quotes."""
    if value is None:
        return ""
    s = str(value)
    if any(ch in s for ch in (',', '"', '\n', '\r')):
        return '"' + s.replace('"', '""') + '"'
    return s


def _sap_export_csv_rows(payload) -> "Iterable[str]":  # type: ignore[name-defined]
    yield _SAP_EXPORT_CSV_HEADER
    for r in payload.rows:
        yield (
            f"{_csv_escape(r.wbs_element)},"
            f"{_csv_escape(r.entity_id)},"
            f"{_csv_escape(r.entity_identifier)},"
            f"{_csv_escape(r.entity_name)},"
            f"{_csv_escape(r.entity_type)},"
            f"{_csv_escape(r.charging_location_id)},"
            f"{_csv_escape(r.charging_location_code)},"
            f"{_csv_escape(r.charging_location_name)},"
            f"{r.year},"
            f"{r.percentage:.2f},"
            f"{'' if r.annual_amount_eur is None else f'{r.annual_amount_eur:.2f}'}\n"
        )


@charging_router.get("/sap-export")
def get_sap_export(
    year: int,
    entity_type: str | None = Query(default=None),
    format: str = Query(default="json", pattern="^(json|csv)$"),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """SAP export for ``year`` per FD-4 [F-EXP-01].

    Each row is one (entity, charging-location) tuple drawn from the frozen
    active BTC profile for the year. Entities with ``to_business_pct > 0``
    but no active profile land in ``missing_profiles`` (JSON) / are silently
    omitted from CSV (the CSV is a SAP handoff artefact, not a punch list).

    Query params:
    - ``year`` (required) — charging year.
    - ``entity_type`` — optional ``Project`` / ``Offering`` / ``InternalService``.
    - ``format`` — ``json`` (default, in-app inspection) or ``csv``
      (file download via Content-Disposition).
    """
    if entity_type is not None and entity_type not in _VALID_ENTITY_TYPES:
        raise HTTPException(
            422,
            f"entity_type must be one of {_VALID_ENTITY_TYPES}; got {entity_type!r}",
        )

    payload = build_sap_export(db, year, entity_type=entity_type)

    # Audit each call so the controller can prove a SAP handoff happened.
    et_label = entity_type or "all"
    _audit(
        db, user, "sap_export", f"{year}",
        f"sap_export year={year} entity_type={et_label} format={format}",
        "export",
        new_value=f"rows={payload.total} missing={len(payload.missing_profiles)} format={format}",
        category="export",
    )
    db.commit()

    if format == "csv":
        filename = (
            f"creta-sap-export-{year}.csv"
            if entity_type is None
            else f"creta-sap-export-{year}-{entity_type.lower()}.csv"
        )
        return StreamingResponse(
            _sap_export_csv_rows(payload),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )

    items = [
        SAPExportRowResponse(
            wbs_element=r.wbs_element,
            entity_id=r.entity_id,
            entity_identifier=r.entity_identifier,
            entity_name=r.entity_name,
            entity_type=r.entity_type,
            charging_location_id=r.charging_location_id,
            charging_location_code=r.charging_location_code,
            charging_location_name=r.charging_location_name,
            year=r.year,
            percentage=r.percentage,
            annual_amount_eur=r.annual_amount_eur,
        )
        for r in payload.rows
    ]
    return SAPExportListResponse(
        year=payload.year,
        entity_type=payload.entity_type,
        items=items,
        missing_profiles=payload.missing_profiles,
        total=payload.total,
    )


# ===========================================================================
# v5 Session F3 — Rollup Query + Cache endpoints [F-RV-01..06]
# ===========================================================================

@charging_router.get("/rollup", response_model=RollupListResponse)
def get_rollup(
    year: int,
    version_id: int | None = None,
    evaluated_date: date | None = None,
    group_by: str = "entity_type",
    entity_type: str | None = None,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role(
        "controller", "executive", "project_lead", "cost_center_owner",
    )),
) -> RollupListResponse:
    """Aggregate effective costs by dimension per [F-RV-01..06].

    ``version_id`` (optional) selects the Stage-1 graph explicitly;
    ``evaluated_date`` (optional) resolves the in-force production version;
    both omitted = today's in-force production version.

    ``group_by`` can be: entity, entity_type, hierarchy_node, responsible,
    change_or_run, charging_location, legal_entity, region, division,
    country, stage.
    """
    version = _resolve_version_param(db, version_id, evaluated_date)
    try:
        result = query_rollup(
            db, year, version.id,
            group_by=group_by,
            entity_type=entity_type,
        )
    except ValueError as e:
        raise HTTPException(422, str(e))

    return RollupListResponse(
        dimension=result.dimension,
        year=result.year,
        version_id=result.version_id,
        rows=[
            {
                "group_key": r.group_key,
                "group_label": r.group_label,
                "dimension": r.dimension,
                "year": r.year,
                "version_id": r.version_id,
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
    version_id: int | None = None,
    evaluated_date: date | None = None,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role(
        "controller", "executive", "project_lead", "cost_center_owner",
    )),
) -> RollupDrillDownResponse:
    """Drill into a specific (entity × charging-location) to see the upstream chain."""
    cl = db.query(ChargingLocation).filter_by(id=cl_id).first()
    if cl is None:
        raise HTTPException(404, f"ChargingLocation '{cl_id}' not found")
    version = _resolve_version_param(db, version_id, evaluated_date)
    try:
        result = drill_down_charging_location(
            db, entity_id, year, version.id, cl_id,
        )
    except ValueError as e:
        raise HTTPException(404, str(e))

    return RollupDrillDownResponse(
        entity_id=result.entity_id,
        entity_name=result.entity_name,
        year=result.year,
        version_id=result.version_id,
        effective_cost=result.effective_cost,
        own_cost=result.own_cost,
        inflow_total=result.inflow_total,
        paths=[
            {"path": p.path, "path_labels": p.path_labels}
            for p in result.paths
        ],
    )


@charging_router.get(
    "/locations/{cl_id}/breakdown",
    response_model=LocationBreakdownResponse,
)
def get_location_breakdown_endpoint(
    cl_id: str,
    year: int,
    version_id: int | None = None,
    evaluated_date: date | None = None,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role(
        "controller", "executive", "project_lead", "cost_center_owner",
    )),
) -> LocationBreakdownResponse:
    """Per-charging-location BTC-weighted breakdown for the rollup map's
    level-4 drill. Returns chargeable-entity inflows + legal entities at the
    location.
    """
    version = _resolve_version_param(db, version_id, evaluated_date)
    try:
        result = get_location_breakdown(db, cl_id, year, version.id)
    except ValueError as e:
        raise HTTPException(404, str(e))

    return LocationBreakdownResponse(
        charging_location_id=result.charging_location_id,
        charging_location_code=result.charging_location_code,
        charging_location_name=result.charging_location_name,
        region_name=result.region_name,
        division=result.division,
        country_iso_code=result.country_iso_code,
        year=result.year,
        version_id=result.version_id,
        total_amount_eur=result.total_amount_eur,
        legal_entities=[
            {"id": le.id, "code": le.code, "name": le.name}
            for le in result.legal_entities
        ],
        chargeable_entities=[
            {
                "entity_id": e.entity_id,
                "identifier": e.identifier,
                "name": e.name,
                "entity_type": e.entity_type,
                "doi": e.doi,
                "is_change_or_run": e.is_change_or_run,
                "percentage": e.percentage,
                "amount_eur": e.amount_eur,
                "share_pct": e.share_pct,
            }
            for e in result.chargeable_entities
        ],
        total=len(result.chargeable_entities),
    )


@charging_router.get(
    "/entities/by-project/{project_id}",
    response_model=ChargeableEntityResponse,
)
def get_entity_by_project_id(
    project_id: str,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role(
        "controller", "executive", "project_lead", "cost_center_owner",
    )),
) -> ChargeableEntityResponse:
    """Look up the ChargeableEntity row for a given project. F6 read-only path.

    Workbench BTC tab needs to resolve project → ChargeableEntity to render
    the BTC tile / tab; the existing ``GET /api/admin/chargeable-entities/{id}``
    is controller-only. This charging-namespaced endpoint exposes the same
    serialised shape to all four roles. PL filtering is unnecessary here —
    the Workbench module already gates project visibility at the route level.
    """
    ce = (
        db.query(ChargeableEntity)
        .filter(ChargeableEntity.project_id == project_id)
        .first()
    )
    if ce is None:
        raise HTTPException(
            404, f"No ChargeableEntity is linked to project '{project_id}'",
        )
    return _serialize_chargeable_entity(ce)


@charging_router.get(
    "/entities/{entity_id}",
    response_model=ChargeableEntityResponse,
)
def get_entity_read_only(
    entity_id: str,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role(
        "controller", "executive", "project_lead", "cost_center_owner",
    )),
) -> ChargeableEntityResponse:
    """Read-only ChargeableEntity fetch accessible to all four roles.

    The admin equivalent at ``GET /api/admin/chargeable-entities/{id}`` is
    controller-only. This thin wrapper enables F6's Workbench BTC tab to
    fetch the entity for non-controller roles. Mutations remain in the admin
    namespace.
    """
    ce = db.query(ChargeableEntity).filter_by(id=entity_id).first()
    if ce is None:
        raise HTTPException(404, f"ChargeableEntity '{entity_id}' not found")
    return _serialize_chargeable_entity(ce)


@charging_router.get(
    "/entities/{entity_id}/allocation-breakdown",
    response_model=EntityAllocationBreakdownResponse,
)
def get_entity_allocation_breakdown(
    entity_id: str,
    year: int,
    version_id: int | None = None,
    evaluated_date: date | None = None,
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
    version = _resolve_version_param(db, version_id, evaluated_date)
    try:
        result = query_entity_allocation_breakdown(
            db, entity_id, year, version.id,
            sort_by=sort_by, sort_dir=sort_dir,
        )
    except ValueError as e:
        raise HTTPException(404, str(e))

    return EntityAllocationBreakdownResponse(
        entity_id=result.entity_id,
        entity_name=result.entity_name,
        year=result.year,
        version_id=result.version_id,
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
    _user: CurrentUser = Depends(require_role(
        "controller", "executive", "project_lead", "cost_center_owner",
    )),
) -> RollupCacheStatusResponse:
    """Diagnostic: return rollup cache entry counts per layer.

    Read-open to all four roles per [A-05]. The companion mutation endpoint
    (``POST /api/admin/rollup-cache/invalidate``) remains controller-only.
    """
    status = get_cache_status(db)
    return RollupCacheStatusResponse(**status)
