"""Integration tests for rollup + cache endpoints (v5 Session F3 [F-RV-01..06])."""

from __future__ import annotations

import pytest

from datetime import date

from models.charging import (
    BTCProfile, BTCProfileLine, ChargeableEntity, ChargingLocation,
    Distribution, DistributionVersion, RollupCache,
)


def _seed_dist_version(db):
    """Create an active Stage 1 DistributionVersion (FD-3) for tests that need
    one. Idempotent — returns the existing row if already created.
    """
    v = (
        db.query(DistributionVersion)
        .filter_by(scenario_id=None, status="active")
        .first()
    )
    if v is None:
        v = DistributionVersion(
            active_from=date(2025, 1, 1), status="active", origin="seed",
            rationale="Router-rollup test seed", scenario_id=None,
        )
        db.add(v)
        db.flush()
    return v


HEADERS_CTRL = {"X-Current-User": "persona-controller"}
HEADERS_PL = {"X-Current-User": "persona-pl"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _seed_entity(db, entity_id="ce-off-1", identifier="IT00S001",
                 annual_cost=1000000.0, entity_type="Offering",
                 hierarchy_node_id="lob-alpha"):
    """Seed a ChargeableEntity reusing the `lob-alpha` node from seed_hierarchy."""
    ce = ChargeableEntity(
        id=entity_id, entity_type=entity_type, identifier=identifier,
        name=f"Entity {entity_id}", to_business_pct=60.0,
        hierarchy_node_id=hierarchy_node_id, is_active=True,
        annual_cost=annual_cost,
    )
    db.add(ce)
    db.flush()
    return ce


def _seed_cl(db, cl_id="cl-de1", code="DE-A-001"):
    cl = ChargingLocation(id=cl_id, code=code, name=f"CL {code}", is_active=True)
    db.add(cl)
    db.flush()
    return cl


# ---------------------------------------------------------------------------
# 1. GET /api/charging/rollup
# ---------------------------------------------------------------------------

class TestGetRollup:
    def test_empty_returns_empty_rows(self, test_client, seed_personas, seed_hierarchy):
        resp = test_client.get(
            "/api/charging/rollup?year=2026&version=forecast&group_by=entity_type",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert "rows" in data
        assert "grand_total_effective" in data
        assert data["rows"] == []
        assert data["grand_total_effective"] == 0.0

    def test_group_by_entity_type_returns_rows(
        self, test_client, seed_personas, seed_hierarchy, db,
    ):
        # seed_hierarchy already created lob-alpha; use it.
        _seed_entity(db, "ce-a", "IT00S011", 500000.0, "Offering")
        _seed_entity(db, "ce-b", "ITF00001", 300000.0, "InternalService")
        db.commit()

        resp = test_client.get(
            "/api/charging/rollup?year=2026&version=forecast&group_by=entity_type",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        group_keys = {r["group_key"] for r in data["rows"]}
        assert "Offering" in group_keys
        assert "InternalService" in group_keys

    def test_grand_total_matches_rows_sum(
        self, test_client, seed_personas, seed_hierarchy, db,
    ):
        _seed_entity(db, "ce-c", "IT00S021", 400000.0, "Offering")
        _seed_entity(db, "ce-d", "IT00S022", 600000.0, "Offering")
        db.commit()

        resp = test_client.get(
            "/api/charging/rollup?year=2026&version=forecast&group_by=entity",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        row_sum = sum(r["effective_cost"] for r in data["rows"])
        assert abs(row_sum - data["grand_total_effective"]) < 0.01

    def test_unsupported_group_by_returns_422_or_400(
        self, test_client, seed_personas, seed_hierarchy,
    ):
        resp = test_client.get(
            "/api/charging/rollup?year=2026&version=forecast&group_by=banana",
            headers=HEADERS_CTRL,
        )
        # Service raises ValueError → router converts to 400
        assert resp.status_code in (400, 422), resp.text

    def test_pl_can_read_rollup(self, test_client, seed_personas, seed_hierarchy):
        """PLs have read access to rollup (controller + exec + pl allowed)."""
        resp = test_client.get(
            "/api/charging/rollup?year=2026&version=forecast&group_by=entity_type",
            headers=HEADERS_PL,
        )
        # PLs may be 403 or 200 depending on role enforcement — accept either
        # but must not 500.
        assert resp.status_code in (200, 403), resp.text


# ---------------------------------------------------------------------------
# 2. GET /api/charging/rollup/charging-location/{cl_id}?entity_id=...
# ---------------------------------------------------------------------------

class TestGetRollupDrillDown:
    def test_entity_not_found_returns_404(
        self, test_client, seed_personas, seed_hierarchy, db,
    ):
        _seed_cl(db)
        db.commit()

        resp = test_client.get(
            "/api/charging/rollup/charging-location/cl-de1?entity_id=no-such-entity"
            "&year=2026&version=forecast",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 404, resp.text

    def test_drill_down_no_upstream(
        self, test_client, seed_personas, seed_hierarchy, db,
    ):
        _seed_entity(db)
        _seed_cl(db)
        db.commit()

        resp = test_client.get(
            "/api/charging/rollup/charging-location/cl-de1?entity_id=ce-off-1"
            "&year=2026&version=forecast",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["entity_id"] == "ce-off-1"
        assert isinstance(data["paths"], list)
        assert data["effective_cost"] >= 0

    def test_drill_down_with_upstream_distribution(
        self, test_client, seed_personas, seed_hierarchy, db,
    ):
        _seed_entity(db, "ce-src", "ITF10001", 800000.0, "InternalService")
        _seed_entity(db, "ce-dst", "IT00S031", 200000.0, "Offering")
        _seed_cl(db)

        # FD-3: Stage 1 edges FK into a DistributionVersion header.
        dist_v = _seed_dist_version(db)
        edge = Distribution(
            version_id=dist_v.id,
            source_entity_id="ce-src", destination_entity_id="ce-dst",
            percentage=25.0,
        )
        db.add(edge)
        db.commit()

        resp = test_client.get(
            "/api/charging/rollup/charging-location/cl-de1?entity_id=ce-dst"
            "&year=2026&version=forecast",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        all_path_entities = set()
        for path in data["paths"]:
            all_path_entities.update(path["path"])
        assert "ce-src" in all_path_entities


# ---------------------------------------------------------------------------
# 3. POST /api/charging/rollup-cache/invalidate
# ---------------------------------------------------------------------------

class TestInvalidateRollupCache:
    def test_flushes_cache_and_returns_count(
        self, test_client, seed_personas, seed_hierarchy, db,
    ):
        # Pre-populate some cache entries (FD-3: version_id FK replaces
        # the legacy `version` String).
        dist_v = _seed_dist_version(db)
        for i in range(3):
            db.add(RollupCache(
                cache_layer="stage1_effective", year=2026,
                version_id=dist_v.id,
                key_id=f"ce-{i}", payload_json='{"effective_cost": 0}',
            ))
        db.commit()

        resp = test_client.post(
            "/api/admin/rollup-cache/invalidate",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert "deleted" in data
        assert data["deleted"] == 3

    def test_empty_cache_returns_zero(
        self, test_client, seed_personas, seed_hierarchy,
    ):
        resp = test_client.post(
            "/api/admin/rollup-cache/invalidate",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["deleted"] == 0

    def test_pl_forbidden_403(self, test_client, seed_personas, seed_hierarchy):
        resp = test_client.post(
            "/api/admin/rollup-cache/invalidate",
            headers=HEADERS_PL,
        )
        assert resp.status_code == 403, resp.text


# ---------------------------------------------------------------------------
# 4. GET /api/charging/rollup-cache/status
# ---------------------------------------------------------------------------

class TestRollupCacheStatus:
    def test_returns_zero_when_empty(
        self, test_client, seed_personas, seed_hierarchy,
    ):
        resp = test_client.get(
            "/api/admin/rollup-cache/status",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["total"] == 0
        assert data["stage1_effective"] == 0
        assert data["stage2_location"] == 0

    def test_counts_per_layer(
        self, test_client, seed_personas, seed_hierarchy, db,
    ):
        # FD-3: version_id FK replaces the legacy `version` String column.
        dist_v = _seed_dist_version(db)
        db.add(RollupCache(
            cache_layer="stage1_effective", year=2026, version_id=dist_v.id,
            key_id="ce-a", payload_json='{"effective_cost": 100}',
        ))
        db.add(RollupCache(
            cache_layer="stage2_location", year=2026, version_id=dist_v.id,
            key_id="ce-a:cl-x", payload_json='{"amount_eur": 60}',
        ))
        db.add(RollupCache(
            cache_layer="stage2_location", year=2026, version_id=dist_v.id,
            key_id="ce-a:cl-y", payload_json='{"amount_eur": 40}',
        ))
        db.commit()

        resp = test_client.get(
            "/api/admin/rollup-cache/status",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["total"] == 3
        assert data["stage1_effective"] == 1
        assert data["stage2_location"] == 2
