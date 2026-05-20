"""Unit tests for services/rollup_query.py (v5 Session F3 [F-RV-01..06])."""

from __future__ import annotations

import pytest

from datetime import date

from models.charging import (
    BTCProfile, BTCProfileLine, ChargeableEntity, ChargingLocation,
    Country, Distribution, DistributionVersion, LegalEntity, Region,
)
from models.organization import GroupingEntityType, GroupingEntity
from services.rollup_query import (
    SUPPORTED_DIMS, drill_down_charging_location, get_location_breakdown,
    query_rollup,
)


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
        # FD-3: Stage 1 edges now FK into a DistributionVersion header.
        dist_v = DistributionVersion(
            active_from=date(2025, 1, 1), status="active", origin="seed",
            rationale="Rollup-query test seed", scenario_id=None,
        )
        db.add(dist_v)
        db.flush()
        edge = Distribution(
            version_id=dist_v.id,
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


# ---------------------------------------------------------------------------
# get_location_breakdown — level-4 drill on rollup map
# ---------------------------------------------------------------------------

def _make_btc_profile(db, entity_id, year, lines):
    """Insert an active BTC profile with the given (cl_id, percentage) lines."""
    profile = BTCProfile(
        entity_id=entity_id, year=year, mode="manual", status="active",
    )
    db.add(profile)
    db.flush()
    for cl_id, pct in lines:
        db.add(BTCProfileLine(
            profile_id=profile.id, charging_location_id=cl_id, percentage=pct,
        ))
    db.flush()
    return profile


class TestGetLocationBreakdown:
    def test_happy_path_aggregates_inflows(self, db):
        # Two locations; two entities each routing some BTC to cl-muc.
        _make_cl(db, "cl-muc", "DE-MUC")
        _make_cl(db, "cl-stg", "DE-STG")
        entities = _setup_entities(db, count=2)
        # Bump to_business_pct so amounts are non-zero (helper sets 0/10).
        for ent in entities:
            ent.to_business_pct = 50.0
        db.flush()

        # Each entity sends 60% of its to_business pool to MUC, 40% to STG.
        _make_btc_profile(db, "ce-0", 2026, [("cl-muc", 60), ("cl-stg", 40)])
        _make_btc_profile(db, "ce-1", 2026, [("cl-muc", 60), ("cl-stg", 40)])
        db.commit()

        result = get_location_breakdown(db, "cl-muc", 2026, "forecast")

        assert result.charging_location_id == "cl-muc"
        assert result.charging_location_code == "DE-MUC"
        assert len(result.chargeable_entities) == 2
        # Sum of per-row amounts equals the location total.
        row_sum = round(
            sum(r.amount_eur for r in result.chargeable_entities), 2,
        )
        assert abs(row_sum - result.total_amount_eur) < 0.01
        # Share percentages sum to ~100.
        share_sum = sum(r.share_pct for r in result.chargeable_entities)
        assert abs(share_sum - 100.0) < 0.5
        # Row math sanity: ce-0 amount = 100k * 0.5 * 0.6 = 30k.
        ce0 = next(r for r in result.chargeable_entities if r.entity_id == "ce-0")
        assert abs(ce0.amount_eur - 30000.0) < 0.01

    def test_returns_legal_entities_at_location(self, db):
        _make_cl(db, "cl-muc", "DE-MUC")
        # Two LEs at cl-muc, one at cl-stg, one inactive at cl-muc.
        _make_cl(db, "cl-stg", "DE-STG")
        db.add_all([
            LegalEntity(id="le-1", code="LE-001", name="Konstrukt-Werke",
                        charging_location_id="cl-muc", is_active=True),
            LegalEntity(id="le-2", code="LE-002", name="Konstrukt Mobility",
                        charging_location_id="cl-muc", is_active=True),
            LegalEntity(id="le-3", code="LE-003", name="Other Co",
                        charging_location_id="cl-stg", is_active=True),
            LegalEntity(id="le-4", code="LE-004", name="Retired",
                        charging_location_id="cl-muc", is_active=False),
        ])
        db.commit()

        result = get_location_breakdown(db, "cl-muc", 2026, "forecast")

        codes = {le.code for le in result.legal_entities}
        assert codes == {"LE-001", "LE-002"}
        # Sorted by code.
        assert [le.code for le in result.legal_entities] == ["LE-001", "LE-002"]

    def test_no_inflows_returns_zero_total(self, db):
        # Location exists but no BTC profile lines target it.
        _make_cl(db, "cl-empty", "DE-EMPTY")
        db.add(LegalEntity(
            id="le-x", code="LE-X", name="Sole tenant",
            charging_location_id="cl-empty", is_active=True,
        ))
        db.commit()

        result = get_location_breakdown(db, "cl-empty", 2026, "forecast")
        assert result.chargeable_entities == []
        assert result.total_amount_eur == 0.0
        # Legal entity list still populated.
        assert len(result.legal_entities) == 1

    def test_unknown_location_raises(self, db):
        with pytest.raises(ValueError, match="not found"):
            get_location_breakdown(db, "cl-nonexistent", 2026, "forecast")

    def test_only_active_btc_profiles_count(self, db):
        _make_cl(db, "cl-muc", "DE-MUC")
        entities = _setup_entities(db, count=1)
        entities[0].to_business_pct = 50.0
        db.flush()
        # Draft profile should be ignored.
        draft = BTCProfile(
            entity_id="ce-0", year=2026, mode="manual", status="draft",
        )
        db.add(draft)
        db.flush()
        db.add(BTCProfileLine(
            profile_id=draft.id, charging_location_id="cl-muc", percentage=100.0,
        ))
        db.commit()

        result = get_location_breakdown(db, "cl-muc", 2026, "forecast")
        assert result.chargeable_entities == []
        assert result.total_amount_eur == 0.0
