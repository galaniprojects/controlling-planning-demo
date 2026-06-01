"""Rollup query service for Cluster F Stage 1 + Stage 2 cost aggregations.

Per [F-RV-01..06]:

Supports multi-dimension aggregations over the chargeable-entity cost graph.
Dimensions: entity, entity_type, hierarchy_node, responsible, change_or_run,
charging_location, legal_entity, region, division, country, stage.

Time granularity: annual (default) or quarterly drill-down per [F-RV-06].
Annual is the primary reporting view; quarterly is an optional drill.

The rollup query fetches effective-cost payloads from the cache
(``services/rollup_cache.get_stage1_effective``) so it benefits from the
cache's miss-then-compute behaviour.

**FD-3 rework (Charging/UM round, cluster B3 — service rescope):** the v4
``version: str = 'forecast'`` defaults are retired. Every public entry
point takes ``version_id: int`` against the ``DistributionVersion`` header
introduced by FD-3. Callers (the four ``charging_router`` endpoints in
``backend/routers/charging.py``) resolve ``version_id`` from an explicit
query param or the production-resolver
(``distribution_service.resolve_active_version``) before invoking here —
the service itself does not resolve dates, by design.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from sqlalchemy.orm import Session

from models.charging import (
    BTCProfile, BTCProfileLine, ChargingLocation, ChargeableEntity,
    Country, LegalEntity, Region,
)


# ---------------------------------------------------------------------------
# Rollup row
# ---------------------------------------------------------------------------

@dataclass
class RollupRow:
    """One aggregated row in the rollup table."""
    group_key: str           # The value of the grouping dimension
    group_label: str         # Human-readable label for the group
    dimension: str           # Which dimension was grouped on
    year: int
    version_id: int
    entity_count: int
    effective_cost: float
    own_cost: float
    inflow_total: float
    # Stage 2 breakdown — only populated when a specific charging_location is requested.
    stage2_amount: Optional[float] = None


@dataclass
class RollupListResponse:
    dimension: str
    year: int
    version_id: int
    rows: list[RollupRow]
    grand_total_effective: float
    grand_total_own_cost: float


@dataclass
class DrillDownPath:
    """One upstream path in the DAG drill-down."""
    path: list[str]      # Entity ids from source to target
    path_labels: list[str]  # Human-readable entity names


@dataclass
class DrillDownResponse:
    entity_id: str
    entity_name: str
    year: int
    version_id: int
    effective_cost: float
    own_cost: float
    inflow_total: float
    paths: list[DrillDownPath]


@dataclass
class EntityAllocationBreakdownRow:
    """One charging-location row in the per-entity allocation breakdown.

    Used by F6's Workbench BTC tab per [E-09].
    """
    charging_location_id: str
    charging_location_code: Optional[str]
    charging_location_name: Optional[str]
    region_name: Optional[str]
    division: Optional[str]
    country_iso_code: Optional[str]
    legal_entity_name: Optional[str]
    percentage: float
    amount_eur: float


@dataclass
class EntityAllocationBreakdownResponse:
    entity_id: str
    entity_name: str
    year: int
    version_id: int
    to_business_pct: float
    effective_cost: float
    business_amount_total: float
    rows: list[EntityAllocationBreakdownRow]
    profile_id: Optional[int]
    profile_status: Optional[str]
    profile_mode: Optional[str]
    has_profile: bool
    sums_to_100: bool


# ---------------------------------------------------------------------------
# Supported grouping dimensions
# ---------------------------------------------------------------------------

SUPPORTED_DIMS = {
    "entity",
    "entity_type",
    "hierarchy_node",
    "responsible",
    "change_or_run",
    "charging_location",
    "legal_entity",
    "region",
    "division",
    "country",
    "stage",
}

# Dimensions that are NOT an attribute of the entity row but a *distribution*
# of the entity's to-business cost across charging locations (Stage 2 / BTC).
# An entity fans into one bucket per active BTC profile line, weighted by the
# line percentage — see ``_geo_groups`` below. This mirrors the canonical
# per-entity breakdown in ``query_entity_allocation_breakdown`` and the
# Charging module's ``useChargingRollupData`` so totals reconcile.
GEO_DIMS = {"charging_location", "legal_entity", "region", "division", "country"}

# The ``is_change_or_run`` classification (models/charging.py) is purely
# entity-type based: ``Project`` ⇒ Change, *every other* type ⇒ Run (VIPER §5).
# A rollup is scoped to one population at the DB level — the property itself is
# Python-only and cannot be filtered in SQL. Deriving both predicates from the
# single ``Project`` constant (rather than enumerating the Run types) keeps this
# in lockstep with the property should a fourth entity type ever be added.
_CHANGE_ENTITY_TYPE = "Project"


# ---------------------------------------------------------------------------
# Geo aggregation (Stage 2 / BTC distribution)
# ---------------------------------------------------------------------------

def _geo_groups(
    db: Session,
    year: int,
    version_id: int,
    entities: list[ChargeableEntity],
    dim: str,
    cost_by_entity: dict[str, dict],
) -> dict[str, dict]:
    """Aggregate Stage-2 (BTC) to-business cost into geo buckets.

    For each entity ``business_amount = effective_cost × to_business_pct / 100``;
    for each line of its active BTC profile ``amount = business_amount ×
    percentage / 100``, bucketed by the line's charging location's ``region`` /
    ``country`` / ``division`` / location / representative legal entity. The
    formula matches ``query_entity_allocation_breakdown`` (and the Charging
    module's ``useChargingRollupData``); this aggregation rounds once at the
    bucket total rather than per line, so a bucket reconciles with the
    per-entity breakdown to within sub-cent rounding. Entities with no active
    profile, or no to-business release, contribute nothing.

    Returns a ``{group_key: group-dict}`` map in the same shape the shared
    ``query_rollup`` tail consumes; the allocated EUR amount lands in
    ``effective_cost`` (own_cost / inflow_total are not meaningful per geo
    bucket and stay 0).
    """
    if not entities:
        return {}

    entity_ids = [e.id for e in entities]

    profiles = (
        db.query(BTCProfile)
        .filter(
            BTCProfile.entity_id.in_(entity_ids),
            BTCProfile.year == year,
            BTCProfile.status == "active",
        )
        .all()
    )
    profile_by_entity = {p.entity_id: p for p in profiles}

    # Batch-load charging locations referenced by any line (+ region/country
    # via their relationships).
    cl_ids = {line.charging_location_id for p in profiles for line in p.lines}
    cls: dict[str, ChargingLocation] = {}
    if cl_ids:
        cls = {
            cl.id: cl
            for cl in db.query(ChargingLocation)
            .filter(ChargingLocation.id.in_(cl_ids)).all()
        }

    # Representative active legal entity per charging location — the first by
    # ``code`` (deterministic, matching ``get_location_breakdown``). Only needed
    # for the legal_entity dimension.
    le_by_cl: dict[str, tuple[str, str]] = {}
    if cl_ids and dim == "legal_entity":
        for le in (
            db.query(LegalEntity)
            .filter(
                LegalEntity.charging_location_id.in_(cl_ids),
                LegalEntity.is_active.is_(True),
            ).order_by(LegalEntity.code).all()
        ):
            clid = le.charging_location_id
            if clid and clid not in le_by_cl:
                le_by_cl[clid] = (le.id, le.name)

    def _bucket(cl: Optional[ChargingLocation]) -> tuple[str, str]:
        if dim == "region":
            if cl is not None and cl.region_id:
                return cl.region_id, (cl.region.name if cl.region else cl.region_id)
        elif dim == "country":
            if cl is not None and cl.country_id:
                return cl.country_id, (cl.country.name if cl.country else cl.country_id)
        elif dim == "division":
            if cl is not None and cl.division:
                return cl.division, cl.division
        elif dim == "charging_location":
            if cl is not None:
                return cl.id, (cl.name or cl.id)
        elif dim == "legal_entity":
            le = le_by_cl.get(cl.id) if cl is not None else None
            if le is not None:
                return le[0], le[1]
        return "__none__", "(Unassigned)"

    groups: dict[str, dict] = {}
    seen: dict[str, set] = {}
    for ent in entities:
        profile = profile_by_entity.get(ent.id)
        if profile is None:
            continue
        eff = float(cost_by_entity.get(ent.id, {}).get("effective_cost", 0.0))
        business_amount = eff * float(ent.to_business_pct or 0.0) / 100.0
        if business_amount == 0:
            continue
        for line in profile.lines:
            cl = cls.get(line.charging_location_id)
            amount = business_amount * float(line.percentage) / 100.0
            key, label = _bucket(cl)
            g = groups.get(key)
            if g is None:
                g = {
                    "group_key": key,
                    "group_label": label,
                    "entity_count": 0,
                    "effective_cost": 0.0,
                    "own_cost": 0.0,
                    "inflow_total": 0.0,
                }
                groups[key] = g
                seen[key] = set()
            g["effective_cost"] += amount
            if ent.id not in seen[key]:
                seen[key].add(ent.id)
                g["entity_count"] += 1
    return groups


# ---------------------------------------------------------------------------
# Main rollup query
# ---------------------------------------------------------------------------

def query_rollup(
    db: Session,
    year: int,
    version_id: int,
    *,
    group_by: str = "entity_type",
    entity_type: Optional[str] = None,
    change_or_run: Optional[str] = None,
    is_active: bool = True,
    limit: int = 500,
) -> RollupListResponse:
    """Aggregate effective costs by the specified dimension.

    Fetches all active chargeable entities matching the optional filters,
    resolves their effective costs (via cache against ``version_id``), and
    aggregates by the chosen dimension.

    ``change_or_run`` (optional) scopes the population to one classification
    per VIPER §5: ``'run'`` keeps Offerings + InternalServices, ``'change'``
    keeps Projects. Applied at the DB level via ``entity_type`` since
    ``is_change_or_run`` is a computed property.

    For the geo dimensions (region / division / country / charging_location /
    legal_entity — see GEO_DIMS) cost is not an entity attribute but the
    entity's to-business amount distributed across charging locations via its
    active BTC profile; one entity fans into multiple buckets weighted by the
    profile-line percentages.

    Supported ``group_by`` values: see SUPPORTED_DIMS.
    """
    from services.rollup_cache import get_stage1_effective

    if group_by not in SUPPORTED_DIMS:
        raise ValueError(
            f"Unsupported group_by '{group_by}'. "
            f"Valid options: {sorted(SUPPORTED_DIMS)}",
        )

    q = db.query(ChargeableEntity)
    if entity_type is not None:
        q = q.filter(ChargeableEntity.entity_type == entity_type)
    if change_or_run is not None:
        cor = change_or_run.strip().lower()
        if cor == "run":
            q = q.filter(ChargeableEntity.entity_type != _CHANGE_ENTITY_TYPE)
        elif cor == "change":
            q = q.filter(ChargeableEntity.entity_type == _CHANGE_ENTITY_TYPE)
        else:
            raise ValueError(
                f"Unsupported change_or_run '{change_or_run}'. "
                "Valid options: 'change', 'run'.",
            )
    if is_active:
        q = q.filter(ChargeableEntity.is_active.is_(True))
    entities = q.all()

    # Resolve effective costs — cache-backed.
    cost_by_entity: dict[str, dict] = {}
    for ent in entities[:limit]:
        try:
            cost_by_entity[ent.id] = get_stage1_effective(
                db, year, version_id, ent.id,
            )
        except Exception:
            cost_by_entity[ent.id] = {
                "effective_cost": 0.0,
                "own_cost": 0.0,
                "inflow_total": 0.0,
            }

    # Helper: extract dimension key+label for an entity.
    def _dim_key_label(ent: ChargeableEntity, dim: str) -> tuple[str, str]:
        if dim == "entity":
            return ent.id, ent.name
        if dim == "entity_type":
            return ent.entity_type, ent.entity_type
        if dim == "hierarchy_node":
            if ent.hierarchy_node_id:
                node = ent.hierarchy_node
                return ent.hierarchy_node_id, (node.name if node else ent.hierarchy_node_id)
            return "__none__", "(No Hierarchy Node)"
        if dim == "responsible":
            if ent.responsible_person_id:
                person = ent.responsible
                return ent.responsible_person_id, (person.name if person else ent.responsible_person_id)
            return "__none__", "(Unassigned)"
        if dim == "change_or_run":
            val = ent.is_change_or_run
            return val, val
        if dim == "stage":
            if ent.entity_type == "Project" and ent.project:
                stage = ent.project.pipeline_stage or "Unknown"
                return stage, stage
            return "Run", "Run (Steady State)"
        # Geo dimensions (GEO_DIMS) are handled by ``_geo_groups`` — they are a
        # distribution across charging locations, not an entity attribute, so
        # they never reach this single-bucket resolver.
        return "__unknown__", "(Unknown)"

    # Aggregate.
    if group_by in GEO_DIMS:
        groups = _geo_groups(
            db, year, version_id, entities[:limit], group_by, cost_by_entity,
        )
    else:
        groups = {}
        for ent in entities[:limit]:
            key, label = _dim_key_label(ent, group_by)
            costs = cost_by_entity.get(ent.id, {"effective_cost": 0, "own_cost": 0, "inflow_total": 0})
            if key not in groups:
                groups[key] = {
                    "group_key": key,
                    "group_label": label,
                    "entity_count": 0,
                    "effective_cost": 0.0,
                    "own_cost": 0.0,
                    "inflow_total": 0.0,
                }
            groups[key]["entity_count"] += 1
            groups[key]["effective_cost"] += float(costs.get("effective_cost", 0))
            groups[key]["own_cost"] += float(costs.get("own_cost", 0))
            groups[key]["inflow_total"] += float(costs.get("inflow_total", 0))

    rows = [
        RollupRow(
            group_key=g["group_key"],
            group_label=g["group_label"],
            dimension=group_by,
            year=year,
            version_id=version_id,
            entity_count=g["entity_count"],
            effective_cost=round(g["effective_cost"], 2),
            own_cost=round(g["own_cost"], 2),
            inflow_total=round(g["inflow_total"], 2),
        )
        for g in groups.values()
    ]
    rows.sort(key=lambda r: r.effective_cost, reverse=True)

    grand_total_effective = round(sum(r.effective_cost for r in rows), 2)
    grand_total_own_cost = round(sum(r.own_cost for r in rows), 2)

    return RollupListResponse(
        dimension=group_by,
        year=year,
        version_id=version_id,
        rows=rows,
        grand_total_effective=grand_total_effective,
        grand_total_own_cost=grand_total_own_cost,
    )


# ---------------------------------------------------------------------------
# Drill-down by charging location
# ---------------------------------------------------------------------------

def drill_down_charging_location(
    db: Session,
    entity_id: str,
    year: int,
    version_id: int,
    charging_location_id: str,
) -> DrillDownResponse:
    """Drill into a specific (entity × charging_location) to see the upstream chain.

    Uses ``get_upstream_chain`` for the DAG paths (rescoped to ``version_id``
    in FD-3 B1) and ``get_stage2_location_total`` for the cost at this
    location.
    """
    from services.dag_resolver import get_upstream_chain
    from services.rollup_cache import get_stage1_effective, get_stage2_location_total

    entity = db.query(ChargeableEntity).filter_by(id=entity_id).first()
    if entity is None:
        raise ValueError(f"ChargeableEntity '{entity_id}' not found")

    effective_data = get_stage1_effective(db, year, version_id, entity_id)

    # Stage 2 total for this charging location (informational; not surfaced
    # on the DrillDownResponse but populates the cache for the location-
    # breakdown sibling endpoint).
    get_stage2_location_total(
        db, year, version_id, entity_id, charging_location_id,
    )

    raw_paths = get_upstream_chain(db, version_id, entity_id)

    enriched_paths: list[DrillDownPath] = []
    for path in raw_paths:
        labels: list[str] = []
        for eid in path:
            e = db.query(ChargeableEntity).filter_by(id=eid).first()
            labels.append(e.name if e else eid)
        enriched_paths.append(DrillDownPath(path=path, path_labels=labels))

    return DrillDownResponse(
        entity_id=entity.id,
        entity_name=entity.name,
        year=year,
        version_id=version_id,
        effective_cost=round(float(effective_data.get("effective_cost", 0)), 2),
        own_cost=round(float(effective_data.get("own_cost", 0)), 2),
        inflow_total=round(float(effective_data.get("inflow_total", 0)), 2),
        paths=enriched_paths,
    )


# ---------------------------------------------------------------------------
# F6 — Per-entity allocation breakdown
# ---------------------------------------------------------------------------

def query_entity_allocation_breakdown(
    db: Session,
    entity_id: str,
    year: int,
    version_id: int,
    *,
    sort_by: str = "amount",
    sort_dir: str = "desc",
) -> EntityAllocationBreakdownResponse:
    """Compute the per-charging-location BTC allocation breakdown for an entity.

    For one ``ChargeableEntity`` and ``year`` this returns:
      - the entity's effective cost (Stage 1 result, cache-backed)
      - to_business amount = effective_cost × to_business_pct ÷ 100
      - one row per charging location in the active BTC profile, with the
        location's percentage, the absolute EUR amount, and enriched metadata
        (region, country, division, optional representative legal entity)

    Used by F6's Workbench BTC tab per [E-09] for the allocation breakdown
    table and drill-down. Sortable by location/region/division/percentage/amount.

    ``version_id`` selects the Stage 1 graph used for the effective-cost
    rollup (cadence-agnostic per `[F-S1-02]`); ``year`` selects the BTC
    profile.

    Raises ``ValueError`` if the entity is missing.
    """
    from services.rollup_cache import get_stage1_effective
    from models.charging import (
        BTCProfile, ChargingLocation, LegalEntity,
    )

    entity = db.query(ChargeableEntity).filter_by(id=entity_id).first()
    if entity is None:
        raise ValueError(f"ChargeableEntity '{entity_id}' not found")

    try:
        effective_data = get_stage1_effective(db, year, version_id, entity_id)
    except Exception:
        effective_data = {"effective_cost": 0.0}
    effective_cost = float(effective_data.get("effective_cost", 0.0))

    to_business_pct = float(entity.to_business_pct or 0.0)
    business_amount_total = round(effective_cost * to_business_pct / 100.0, 2)

    profile = (
        db.query(BTCProfile)
        .filter(
            BTCProfile.entity_id == entity_id,
            BTCProfile.year == year,
            BTCProfile.status == "active",
        )
        .first()
    )
    if profile is None:
        profile = (
            db.query(BTCProfile)
            .filter(
                BTCProfile.entity_id == entity_id,
                BTCProfile.year == year,
            )
            .first()
        )

    rows: list[EntityAllocationBreakdownRow] = []
    sum_pct = 0.0
    if profile is not None:
        cl_ids = [line.charging_location_id for line in profile.lines]
        cls = {
            cl.id: cl for cl in db.query(ChargingLocation)
            .filter(ChargingLocation.id.in_(cl_ids)).all()
        } if cl_ids else {}

        le_by_cl: dict[str, str] = {}
        if cl_ids:
            les = (
                db.query(LegalEntity)
                .filter(LegalEntity.charging_location_id.in_(cl_ids))
                .filter(LegalEntity.is_active.is_(True))
                .all()
            )
            for le in les:
                if le.charging_location_id and le.charging_location_id not in le_by_cl:
                    le_by_cl[le.charging_location_id] = le.name

        for line in profile.lines:
            cl = cls.get(line.charging_location_id)
            pct = float(line.percentage)
            sum_pct += pct
            amount = round(business_amount_total * pct / 100.0, 2)
            region_name = None
            country_iso = None
            division = None
            cl_code = None
            cl_name = None
            if cl is not None:
                cl_code = cl.code
                cl_name = cl.name
                division = cl.division
                if cl.region is not None:
                    region_name = cl.region.name
                if cl.country is not None:
                    country_iso = cl.country.iso_code
            rows.append(EntityAllocationBreakdownRow(
                charging_location_id=line.charging_location_id,
                charging_location_code=cl_code,
                charging_location_name=cl_name,
                region_name=region_name,
                division=division,
                country_iso_code=country_iso,
                legal_entity_name=le_by_cl.get(line.charging_location_id),
                percentage=pct,
                amount_eur=amount,
            ))

    sort_key_map = {
        "amount": lambda r: r.amount_eur,
        "percentage": lambda r: r.percentage,
        "location": lambda r: (r.charging_location_name or "").lower(),
        "code": lambda r: (r.charging_location_code or "").lower(),
        "region": lambda r: (r.region_name or "").lower(),
        "division": lambda r: (r.division or "").lower(),
        "country": lambda r: (r.country_iso_code or "").lower(),
    }
    key_fn = sort_key_map.get(sort_by, sort_key_map["amount"])
    rows.sort(key=key_fn, reverse=(sort_dir.lower() != "asc"))

    return EntityAllocationBreakdownResponse(
        entity_id=entity.id,
        entity_name=entity.name,
        year=year,
        version_id=version_id,
        to_business_pct=to_business_pct,
        effective_cost=round(effective_cost, 2),
        business_amount_total=business_amount_total,
        rows=rows,
        profile_id=profile.id if profile is not None else None,
        profile_status=profile.status if profile is not None else None,
        profile_mode=profile.mode if profile is not None else None,
        has_profile=profile is not None,
        sums_to_100=abs(sum_pct - 100.0) < 0.01,
    )


# ---------------------------------------------------------------------------
# Per-charging-location breakdown (level-4 drill on the rollup map)
# ---------------------------------------------------------------------------

@dataclass
class LegalEntitySummary:
    id: str
    code: str
    name: str


@dataclass
class LocationBreakdownEntity:
    """One chargeable-entity row in a charging-location breakdown."""
    entity_id: str
    identifier: str
    name: str
    entity_type: str
    doi: Optional[int]
    is_change_or_run: str
    percentage: float
    amount_eur: float
    share_pct: float


@dataclass
class LocationBreakdownResponse:
    """Per-charging-location BTC-weighted breakdown.

    BTC Stage 2 splits to a ``ChargingLocation``; ``LegalEntity`` is a 1:N
    rollup with no per-entity attribution rule per [F-MD-01], so legal
    entities are returned as informational metadata only — never as a cost
    split.
    """
    charging_location_id: str
    charging_location_code: str
    charging_location_name: str
    region_name: Optional[str]
    division: Optional[str]
    country_iso_code: Optional[str]
    year: int
    version_id: int
    total_amount_eur: float
    legal_entities: list[LegalEntitySummary]
    chargeable_entities: list[LocationBreakdownEntity]


def get_location_breakdown(
    db: Session,
    charging_location_id: str,
    year: int,
    version_id: int,
) -> LocationBreakdownResponse:
    """Aggregate BTC-weighted Stage-2 cost for one charging location.

    Algorithm:
      - Look up the ``ChargingLocation`` (raises ``ValueError`` if missing).
      - Find every ``BTCProfileLine`` targeting this location whose parent
        profile is active for ``year``. Each line contributes one
        (entity, percentage) pair.
      - For each entity, resolve effective cost via the rollup cache
        (keyed by ``version_id``) and compute the per-location amount as
        ``effective_cost × to_business_pct/100 × line.percentage/100`` —
        identical to the Stage-2 math used in
        :func:`query_entity_allocation_breakdown`.
      - Sort rows by amount descending, populate ``share_pct`` once the
        location total is known.
      - Attach legal entities at this location for the panel's
        informational chip list.
    """
    from services.rollup_cache import get_stage1_effective

    cl = db.query(ChargingLocation).filter_by(id=charging_location_id).first()
    if cl is None:
        raise ValueError(
            f"ChargingLocation '{charging_location_id}' not found",
        )

    lines = (
        db.query(BTCProfileLine, BTCProfile)
        .join(BTCProfile, BTCProfileLine.profile_id == BTCProfile.id)
        .filter(
            BTCProfileLine.charging_location_id == charging_location_id,
            BTCProfile.year == year,
            BTCProfile.status == "active",
        )
        .all()
    )

    rows: list[LocationBreakdownEntity] = []
    total = 0.0
    for line, profile in lines:
        entity = db.query(ChargeableEntity).filter_by(id=profile.entity_id).first()
        if entity is None or not entity.is_active:
            continue
        try:
            eff = get_stage1_effective(db, year, version_id, entity.id)
        except Exception:
            eff = {"effective_cost": 0.0}
        effective_cost = float(eff.get("effective_cost", 0.0) or 0.0)
        to_business_pct = float(entity.to_business_pct or 0.0)
        line_pct = float(line.percentage or 0.0)
        amount = round(
            effective_cost * to_business_pct / 100.0 * line_pct / 100.0, 2,
        )
        if amount <= 0:
            continue
        doi: Optional[int] = None
        if entity.entity_type == "Project" and entity.project is not None:
            doi = entity.project.doi
        rows.append(LocationBreakdownEntity(
            entity_id=entity.id,
            identifier=entity.identifier,
            name=entity.name,
            entity_type=entity.entity_type,
            doi=doi,
            is_change_or_run=entity.is_change_or_run,
            percentage=line_pct,
            amount_eur=amount,
            share_pct=0.0,
        ))
        total += amount

    total = round(total, 2)
    if total > 0:
        for r in rows:
            r.share_pct = round(r.amount_eur / total * 100.0, 2)

    rows.sort(key=lambda r: r.amount_eur, reverse=True)

    legal_entities = [
        LegalEntitySummary(id=le.id, code=le.code, name=le.name)
        for le in (
            db.query(LegalEntity)
            .filter(LegalEntity.charging_location_id == charging_location_id)
            .filter(LegalEntity.is_active.is_(True))
            .order_by(LegalEntity.code)
            .all()
        )
    ]

    region_name = cl.region.name if cl.region is not None else None
    country_iso = cl.country.iso_code if cl.country is not None else None

    return LocationBreakdownResponse(
        charging_location_id=cl.id,
        charging_location_code=cl.code,
        charging_location_name=cl.name,
        region_name=region_name,
        division=cl.division,
        country_iso_code=country_iso,
        year=year,
        version_id=version_id,
        total_amount_eur=total,
        legal_entities=legal_entities,
        chargeable_entities=rows,
    )
