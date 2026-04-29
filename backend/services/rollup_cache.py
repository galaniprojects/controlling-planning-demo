"""Persistent rollup cache for Cluster F Stage 1 and Stage 2 cost aggregations.

Per [F-RV-01..06]:

Two cache layers:
- ``'stage1_effective'``: Effective cost per entity (own + inflows) computed
  by ``services/dag_resolver.compute_effective_cost``. Key: entity_id.
- ``'stage2_location'``: Per-charging-location cost for an entity after
  applying BTC profile percentages (Stage 2). Key: ``<entity_id>:<cl_id>``.

Cache invalidation is write-through: each Distribution write, BTC profile
write, and annual_cost write calls the relevant invalidate helper. The
``POST /api/admin/rollup-cache/invalidate`` endpoint (controller-only)
flushes everything for a manual recovery path. ``invalidate_all`` is also
called at demo-reset time to ensure a clean slate.

Cache hits/misses are handled transparently:
- On MISS: recompute, insert (or replace-on-unique-conflict), return result.
- On HIT: deserialize and return cached payload.

Justification for persistent over in-memory: simulator (B1) needs reads
outside the writing request; survives uvicorn reload during demos; demo
scale is trivial.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from models.charging import RollupCache


# ---------------------------------------------------------------------------
# Cache layer identifiers
# ---------------------------------------------------------------------------

LAYER_STAGE1 = "stage1_effective"
LAYER_STAGE2 = "stage2_location"


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _get_entry(
    db: Session, cache_layer: str, year: int, version: str, key_id: str,
) -> Optional[RollupCache]:
    return (
        db.query(RollupCache)
        .filter(
            RollupCache.cache_layer == cache_layer,
            RollupCache.year == year,
            RollupCache.version == version,
            RollupCache.key_id == key_id,
        )
        .first()
    )


def _upsert_entry(
    db: Session,
    cache_layer: str,
    year: int,
    version: str,
    key_id: str,
    payload: dict,
) -> RollupCache:
    """Upsert a cache entry using get-or-create-then-update."""
    entry = _get_entry(db, cache_layer, year, version, key_id)
    if entry is None:
        entry = RollupCache(
            cache_layer=cache_layer,
            year=year,
            version=version,
            key_id=key_id,
            payload_json=json.dumps(payload),
            computed_at=datetime.utcnow(),
        )
        db.add(entry)
    else:
        entry.payload_json = json.dumps(payload)
        entry.computed_at = datetime.utcnow()
    db.flush()
    db.commit()
    return entry


def _delete_entries(
    db: Session, cache_layer: str, year: int, version: str,
    key_id: Optional[str] = None,
) -> int:
    """Delete cache entries matching the given criteria. Returns deleted count."""
    q = db.query(RollupCache).filter(
        RollupCache.cache_layer == cache_layer,
        RollupCache.year == year,
        RollupCache.version == version,
    )
    if key_id is not None:
        q = q.filter(RollupCache.key_id == key_id)
    count = q.count()
    q.delete(synchronize_session=False)
    return count


# ---------------------------------------------------------------------------
# Stage 1 — effective cost
# ---------------------------------------------------------------------------

def get_stage1_effective(
    db: Session, year: int, version: str, entity_id: str,
) -> dict:
    """Return the effective cost for an entity, using the cache.

    On cache miss: calls ``compute_effective_cost``, stores result, returns it.
    On cache hit: deserialises and returns cached dict.

    The returned dict has the shape of ``EffectiveCostResult`` serialised to
    JSON (see services/dag_resolver.py).
    """
    from services.dag_resolver import compute_effective_cost

    entry = _get_entry(db, LAYER_STAGE1, year, version, entity_id)
    if entry is not None:
        return json.loads(entry.payload_json)

    # Cache miss — compute.
    result = compute_effective_cost(db, year, version, entity_id)
    payload = {
        "entity_id": result.entity_id,
        "entity_name": result.entity_name,
        "year": result.year,
        "version": result.version,
        "own_cost": float(result.own_cost),
        "inflows": [
            {
                "source_entity_id": c.source_entity_id,
                "source_entity_name": c.source_entity_name,
                "percentage": c.percentage,
                "amount": c.amount,
            }
            for c in result.inflows
        ],
        "inflow_total": float(result.inflow_total),
        "effective_cost": float(result.effective_cost),
    }
    _upsert_entry(db, LAYER_STAGE1, year, version, entity_id, payload)
    return payload


# ---------------------------------------------------------------------------
# Stage 2 — per-location totals
# ---------------------------------------------------------------------------

def get_stage2_location_total(
    db: Session, year: int, version: str, entity_id: str,
    charging_location_id: str,
) -> dict:
    """Return the Stage 2 cost for one (entity × charging-location) pair.

    Computes: effective_cost × btc_percentage / 100 for the entity's active
    BTC profile line for the given charging location and year.

    Returns ``{"amount_eur": float, "percentage": float | None}``.
    On cache miss: computes and caches; on cache hit: returns cached.
    """
    from models.charging import BTCProfile

    key_id = f"{entity_id}:{charging_location_id}"
    entry = _get_entry(db, LAYER_STAGE2, year, version, key_id)
    if entry is not None:
        return json.loads(entry.payload_json)

    # Cache miss — compute.
    effective = get_stage1_effective(db, year, version, entity_id)
    eff_cost = float(effective.get("effective_cost", 0))

    # Look up BTC profile line.
    profile = (
        db.query(BTCProfile)
        .filter(
            BTCProfile.entity_id == entity_id,
            BTCProfile.year == year,
            BTCProfile.status == "active",
        )
        .first()
    )
    pct: Optional[float] = None
    if profile is not None:
        for line in profile.lines:
            if line.charging_location_id == charging_location_id:
                pct = float(line.percentage)
                break

    amount = round(eff_cost * (pct / 100.0), 2) if pct is not None else 0.0
    payload = {"amount_eur": amount, "percentage": pct, "effective_cost": eff_cost}
    _upsert_entry(db, LAYER_STAGE2, year, version, key_id, payload)
    return payload


# ---------------------------------------------------------------------------
# Invalidation helpers
# ---------------------------------------------------------------------------

def invalidate_for_distribution_write(
    db: Session, entity_id: str, year: int, version: str,
) -> int:
    """Invalidate Stage 1 cache entries when a Distribution edge is written.

    Removes the entity's own entry and any downstream entities that might
    have this entity as an upstream source. For simplicity we delete all
    stage1 entries for the given (year, version) — they will be recomputed
    on next access. Also clears Stage 2 entries for the same (year, version).
    """
    count = 0
    count += db.query(RollupCache).filter(
        RollupCache.cache_layer == LAYER_STAGE1,
        RollupCache.year == year,
        RollupCache.version == version,
    ).delete(synchronize_session=False)
    count += db.query(RollupCache).filter(
        RollupCache.cache_layer == LAYER_STAGE2,
        RollupCache.year == year,
        RollupCache.version == version,
    ).delete(synchronize_session=False)
    return count


def invalidate_for_btc_write(
    db: Session, entity_id: str, year: int,
) -> int:
    """Invalidate Stage 2 cache entries when a BTC profile is written.

    Only Stage 2 entries are affected — the Stage 2 allocation percentages
    depend on BTC profile data, not on the distribution edges.
    """
    count = db.query(RollupCache).filter(
        RollupCache.cache_layer == LAYER_STAGE2,
        RollupCache.year == year,
        RollupCache.key_id.like(f"{entity_id}:%"),
    ).delete(synchronize_session=False)
    return count


def invalidate_for_entity_cost_write(
    db: Session, entity_id: str,
) -> int:
    """Invalidate all cache entries when an entity's annual_cost is written.

    Both Stage 1 (because own_cost changes) and Stage 2 (because the amount
    changes) are affected. Clear everything for the entity across all years
    and versions.
    """
    count = 0
    count += db.query(RollupCache).filter(
        RollupCache.cache_layer == LAYER_STAGE1,
        RollupCache.key_id == entity_id,
    ).delete(synchronize_session=False)
    count += db.query(RollupCache).filter(
        RollupCache.cache_layer == LAYER_STAGE2,
        RollupCache.key_id.like(f"{entity_id}:%"),
    ).delete(synchronize_session=False)
    return count


def invalidate_all(db: Session) -> int:
    """Flush the entire rollup cache.

    Called by ``POST /api/admin/reset-demo`` to ensure a clean slate after
    the database is re-seeded.
    """
    count = db.query(RollupCache).delete(synchronize_session=False)
    return count


# ---------------------------------------------------------------------------
# Diagnostics
# ---------------------------------------------------------------------------

def get_cache_status(db: Session) -> dict:
    """Return diagnostic counts per layer."""
    total = db.query(RollupCache).count()
    stage1_count = db.query(RollupCache).filter(
        RollupCache.cache_layer == LAYER_STAGE1,
    ).count()
    stage2_count = db.query(RollupCache).filter(
        RollupCache.cache_layer == LAYER_STAGE2,
    ).count()
    return {
        "total": total,
        "stage1_effective": stage1_count,
        "stage2_location": stage2_count,
    }
