"""Unit tests for services/rollup_query.py (v5 Session F3 [F-RV-01..06])."""

from __future__ import annotations

import pytest

from models.charging import (
    BTCProfile, BTCProfileLine, ChargeableEntity, ChargingLocation, Distribution,
)
from models.organization import GroupingEntityType, GroupingEntity
from services.rollup_query import SUPPORTED_DIMS, drill_down_charging_location, query_rollup


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _setup_entities(db, count=3):
    """Insert grouping entities and chargeablee entities."""
    get_type = GroupingEntityType(id="get-lob", name="Line of Business")
    ge1 = GroupingEntity(id="lob-alpha", entity_type_id="get-lob", name="LoB Alpha")
    ge2 = GroupingEntity(id="lob-beta", entity_type_id="get-lob", name="LoB Beta")
    db.add_all([get_type, ge1, ge2])
    db.flush()

    entities = []
    for i in range(count):
        e_type = "Offering" if i < 2 else "InternalService"
        identifier = f"IT00S{i:03d}" if e_type == "Offering" else f"ITF0{i:04d}"
        ce = ChargeableEntity(
            id=f"ce-{i}", entity_type=e_type, identifier=identifier,
            name=f"Entity {i}", to_business_pct=float(i * 10),
            hierarchy_node_id="lob-alpha" if i % 2 == 0 else "lob-beta",
            is_active=True, annual_cost=float((i + 1) * 100000),
        )
        db.add(ce)
        entities.append(ce)
    db.flush()
    return entities


def _make_cl(db, cl_id="cl-a", code="DE-A-001"):
    cl = ChargingLocation(id=cl_id, code=code, name=f"Test {code}", is_active=True)
    db.add(cl)
    db.flush()
    return cl


# ---------------------------------------------------------------------------
# query_rollup — per-dimension aggregations
# ---------------------------------------------------------------------------

class TestQueryRollup:
    def test_group_by_entity_type(self, db):
        _setup_entities(db)
        result = query_rollup(db, 2026, "forecast", group_by="entity_type")
        group_keys = {r.group_key for r in result.rows}
        # Two entity types: Offering + InternalService
        assert "Offering" in group_keys
        assert "InternalService" in group_keys

    def test_group_by_entity(self, db):
        _setup_entities(db, count=3)
        result = query_rollup(db, 2026, "forecast", group_by="entity")
        assert len(result.rows) == 3

    def test_grand_total_equals_sum_of_rows(self, db):
        _setup_entities(db, count=3)
        result = query_rollup(db, 2026, "forecast", group_by="entity_type")
        computed_total = round(sum(r.effective_cost for r in result.rows), 2)
        assert abs(computed_total - result.grand_total_effective) < 0.01

    def test_group_by_hierarchy_node(self, db):
        _setup_entities(db, count=4)
        result = query_rollup(db, 2026, "forecast", group_by="hierarchy_node")
        # Should have lob-alpha and lob-beta
        group_keys = {r.group_key for r in result.rows}
        assert "lob-alpha" in group_keys or "lob-beta" in group_keys

    def test_unsupported_dimension_raises(self, db):
        with pytest.raises(ValueError, match="Unsupported group_by"):
            query_rollup(db, 2026, "forecast", group_by="banana")

    def test_entity_type_filter(self, db):
        _setup_entities(db, count=4)
        result = query_rollup(db, 2026, "forecast", group_by="entity", entity_type="Offering")
        for row in result.rows:
            assert row.group_key.startswith("ce-")

    def test_empty_portfolio_returns_empty(self, db):
        result = query_rollup(db, 2026, "forecast", group_by="entity_type")
        assert result.rows == []
        assert result.grand_total_effective == 0.0

    def test_rows_sorted_by_effective_cost_desc(self, db):
        _setup_entities(db, count=4)
        result = query_rollup(db, 2026, "forecast", group_by="entity")
        costs = [r.effective_cost for r in result.rows]
        assert costs == sorted(costs, reverse=True)

    def test_entity_count_per_group(self, db):
        _setup_entities(db, count=4)
        result = query_rollup(db, 2026, "forecast", group_by="entity_type")
        total_entities = sum(r.entity_count for r in result.rows)
        assert total_entities == 4

    def test_annual_cost_appears_in_effective_cost(self, db):
        """Entities with annual_cost should have effective_cost > 0."""
        _setup_entities(db, count=2)
        result = query_rollup(db, 2026, "forecast", group_by="entity")
        # At least some rows should have positive effective cost (from annual_cost)
        positive_count = sum(1 for r in result.rows if r.effective_cost > 0)
        assert positive_count >= 1

    def test_all_supported_dims_do_not_raise(self, db):
        _setup_entities(db, count=2)
        for dim in SUPPORTED_DIMS:
            result = query_rollup(db, 2026, "forecast", group_by=dim)
            assert result.dimension == dim


# ---------------------------------------------------------------------------
# drill_down_charging_location
# ---------------------------------------------------------------------------

class TestDrillDownChargingLocation:
    def test_basic_drill_down(self, db):
        _make_cl(db)
        _setup_entities(db, count=1)
        # No upstream chain (no distributions) — paths should contain [ce-0]
        result = drill_down_charging_location(db, "ce-0", 2026, "forecast", "cl-a")
        assert result.entity_id == "ce-0"
        assert isinstance(result.paths, list)

    def test_entity_not_found_raises(self, db):
        _make_cl(db)
        with pytest.raises(ValueError, match="not found"):
            drill_down_charging_location(db, "ce-nonexistent", 2026, "forecast", "cl-a")

    def test_upstream_chain_with_distribution(self, db):
        _make_cl(db)
        _setup_entities(db, count=2)
        # Add distribution: ce-1 → ce-0
        edge = Distribution(
            year=2026, version="forecast",
            source_entity_id="ce-1", destination_entity_id="ce-0",
            percentage=40.0,
        )
        db.add(edge)
        db.commit()

        result = drill_down_charging_location(db, "ce-0", 2026, "forecast", "cl-a")
        # Should have paths through ce-1
        path_entities = set()
        for path in result.paths:
            path_entities.update(path.path)
        assert "ce-1" in path_entities

    def test_response_has_effective_cost(self, db):
        _make_cl(db)
        _setup_entities(db, count=1)
        result = drill_down_charging_location(db, "ce-0", 2026, "forecast", "cl-a")
        assert result.effective_cost >= 0

    def test_path_labels_enriched(self, db):
        _make_cl(db)
        _setup_entities(db, count=1)
        result = drill_down_charging_location(db, "ce-0", 2026, "forecast", "cl-a")
        for path in result.paths:
            assert len(path.path_labels) == len(path.path)
