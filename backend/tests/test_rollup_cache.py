"""Unit tests for services/rollup_cache.py (v5 Session F3 [F-RV-01..06])."""

from __future__ import annotations

import json
import pytest

from models.charging import (
    BTCProfile, BTCProfileLine, ChargeableEntity, ChargingLocation, Distribution,
    RollupCache,
)
from models.organization import GroupingEntityType, GroupingEntity
from services.rollup_cache import (
    LAYER_STAGE1, LAYER_STAGE2, get_cache_status, get_stage1_effective,
    get_stage2_location_total, invalidate_all, invalidate_for_btc_write,
    invalidate_for_distribution_write, invalidate_for_entity_cost_write,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_entity(db, entity_id="ce-a", identifier="IT00S001", to_business_pct=60.0, annual_cost=1000000.0):
    get_type = GroupingEntityType(id="get-t", name="LoB")
    ge = GroupingEntity(id="lob-t", entity_type_id="get-t", name="Test LoB")
    db.add_all([get_type, ge])
    db.flush()
    ce = ChargeableEntity(
        id=entity_id, entity_type="Offering", identifier=identifier,
        name="Test Offering", to_business_pct=to_business_pct,
        hierarchy_node_id="lob-t", is_active=True,
        annual_cost=annual_cost,
    )
    db.add(ce)
    db.flush()
    return ce


def _make_cl(db, cl_id="cl-a", code="DE-A-001"):
    cl = ChargingLocation(id=cl_id, code=code, name=f"Test {code}", is_active=True)
    db.add(cl)
    db.flush()
    return cl


# ---------------------------------------------------------------------------
# Cache miss → compute → hit
# ---------------------------------------------------------------------------

class TestCacheMissThenHit:
    def test_stage1_miss_computes_and_caches(self, db):
        _make_entity(db, annual_cost=500000.0)
        # On miss, should compute and store.
        result = get_stage1_effective(db, 2026, "forecast", "ce-a")
        assert result["entity_id"] == "ce-a"
        assert result["effective_cost"] >= 0

        # Verify row was inserted.
        entry = db.query(RollupCache).filter(
            RollupCache.cache_layer == LAYER_STAGE1,
            RollupCache.key_id == "ce-a",
        ).first()
        assert entry is not None

    def test_stage1_hit_returns_cached(self, db):
        _make_entity(db)
        # First call populates cache.
        r1 = get_stage1_effective(db, 2026, "forecast", "ce-a")
        # Second call should return same result from cache (row count unchanged).
        count_before = db.query(RollupCache).filter(RollupCache.cache_layer == LAYER_STAGE1).count()
        r2 = get_stage1_effective(db, 2026, "forecast", "ce-a")
        count_after = db.query(RollupCache).filter(RollupCache.cache_layer == LAYER_STAGE1).count()
        assert r1["entity_id"] == r2["entity_id"]
        assert count_before == count_after  # no new row inserted

    def test_stage2_miss_computes_and_caches(self, db):
        _make_entity(db, annual_cost=1000000.0)
        _make_cl(db)
        # Create active BTC profile.
        profile = BTCProfile(entity_id="ce-a", year=2026, mode="manual", status="active")
        db.add(profile)
        db.flush()
        line = BTCProfileLine(
            profile_id=profile.id, charging_location_id="cl-a", percentage=100.0,
        )
        db.add(line)
        db.commit()

        result = get_stage2_location_total(db, 2026, "forecast", "ce-a", "cl-a")
        assert result["amount_eur"] >= 0
        assert result["percentage"] == 100.0

        # Verify row was inserted.
        entry = db.query(RollupCache).filter(
            RollupCache.cache_layer == LAYER_STAGE2,
            RollupCache.key_id == "ce-a:cl-a",
        ).first()
        assert entry is not None

    def test_stage2_no_profile_returns_zero(self, db):
        _make_entity(db)
        _make_cl(db)
        result = get_stage2_location_total(db, 2026, "forecast", "ce-a", "cl-a")
        assert result["amount_eur"] == 0.0
        assert result["percentage"] is None


# ---------------------------------------------------------------------------
# Invalidation helpers
# ---------------------------------------------------------------------------

class TestInvalidationForDistributionWrite:
    def test_clears_stage1_and_stage2_for_year_version(self, db):
        _make_entity(db)
        # Manually insert cache entries.
        db.add(RollupCache(
            cache_layer=LAYER_STAGE1, year=2026, version="forecast",
            key_id="ce-a", payload_json='{"effective_cost": 0}',
        ))
        db.add(RollupCache(
            cache_layer=LAYER_STAGE2, year=2026, version="forecast",
            key_id="ce-a:cl-a", payload_json='{"amount_eur": 0}',
        ))
        db.commit()

        count = invalidate_for_distribution_write(db, "ce-a", 2026, "forecast")
        assert count == 2
        remaining = db.query(RollupCache).count()
        assert remaining == 0

    def test_leaves_other_versions_intact(self, db):
        _make_entity(db)
        db.add(RollupCache(
            cache_layer=LAYER_STAGE1, year=2026, version="baseline",
            key_id="ce-a", payload_json='{"effective_cost": 0}',
        ))
        db.add(RollupCache(
            cache_layer=LAYER_STAGE1, year=2026, version="forecast",
            key_id="ce-a", payload_json='{"effective_cost": 0}',
        ))
        db.commit()

        invalidate_for_distribution_write(db, "ce-a", 2026, "forecast")
        remaining = db.query(RollupCache).filter(
            RollupCache.version == "baseline",
        ).count()
        assert remaining == 1


class TestInvalidationForBTCWrite:
    def test_clears_stage2_for_entity_year(self, db):
        _make_entity(db)
        db.add(RollupCache(
            cache_layer=LAYER_STAGE2, year=2026, version="forecast",
            key_id="ce-a:cl-a", payload_json='{"amount_eur": 100}',
        ))
        db.add(RollupCache(
            cache_layer=LAYER_STAGE2, year=2026, version="forecast",
            key_id="ce-b:cl-a", payload_json='{"amount_eur": 200}',  # different entity
        ))
        db.commit()

        invalidate_for_btc_write(db, "ce-a", 2026)
        remaining = db.query(RollupCache).filter(
            RollupCache.key_id.like("ce-a:%"),
        ).count()
        assert remaining == 0
        # Other entity should remain
        remaining_b = db.query(RollupCache).filter(
            RollupCache.key_id.like("ce-b:%"),
        ).count()
        assert remaining_b == 1

    def test_does_not_clear_stage1(self, db):
        _make_entity(db)
        db.add(RollupCache(
            cache_layer=LAYER_STAGE1, year=2026, version="forecast",
            key_id="ce-a", payload_json='{"effective_cost": 1000}',
        ))
        db.commit()
        invalidate_for_btc_write(db, "ce-a", 2026)
        stage1_count = db.query(RollupCache).filter(
            RollupCache.cache_layer == LAYER_STAGE1,
        ).count()
        assert stage1_count == 1  # stage1 not cleared by BTC write


class TestInvalidationForEntityCostWrite:
    def test_clears_both_layers_for_entity(self, db):
        _make_entity(db)
        db.add(RollupCache(
            cache_layer=LAYER_STAGE1, year=2026, version="forecast",
            key_id="ce-a", payload_json='{"effective_cost": 1000}',
        ))
        db.add(RollupCache(
            cache_layer=LAYER_STAGE2, year=2026, version="forecast",
            key_id="ce-a:cl-a", payload_json='{"amount_eur": 600}',
        ))
        db.commit()

        count = invalidate_for_entity_cost_write(db, "ce-a")
        assert count == 2


class TestInvalidateAll:
    def test_flushes_entire_cache(self, db):
        _make_entity(db)
        for i in range(5):
            db.add(RollupCache(
                cache_layer=LAYER_STAGE1, year=2026, version="forecast",
                key_id=f"ce-{i}", payload_json='{}',
            ))
        db.commit()
        count = invalidate_all(db)
        assert count == 5
        assert db.query(RollupCache).count() == 0

    def test_flushes_all_layers(self, db):
        db.add(RollupCache(
            cache_layer=LAYER_STAGE1, year=2026, version="forecast",
            key_id="ce-a", payload_json='{}',
        ))
        db.add(RollupCache(
            cache_layer=LAYER_STAGE2, year=2026, version="forecast",
            key_id="ce-a:cl-a", payload_json='{}',
        ))
        db.commit()
        count = invalidate_all(db)
        assert count == 2


# ---------------------------------------------------------------------------
# Diagnostics
# ---------------------------------------------------------------------------

class TestGetCacheStatus:
    def test_counts_per_layer(self, db):
        db.add(RollupCache(
            cache_layer=LAYER_STAGE1, year=2026, version="forecast",
            key_id="ce-a", payload_json='{}',
        ))
        db.add(RollupCache(
            cache_layer=LAYER_STAGE2, year=2026, version="forecast",
            key_id="ce-a:cl-a", payload_json='{}',
        ))
        db.add(RollupCache(
            cache_layer=LAYER_STAGE2, year=2026, version="forecast",
            key_id="ce-a:cl-b", payload_json='{}',
        ))
        db.commit()
        status = get_cache_status(db)
        assert status["total"] == 3
        assert status["stage1_effective"] == 1
        assert status["stage2_location"] == 2

    def test_empty_cache_all_zeros(self, db):
        status = get_cache_status(db)
        assert status["total"] == 0
        assert status["stage1_effective"] == 0
        assert status["stage2_location"] == 0
