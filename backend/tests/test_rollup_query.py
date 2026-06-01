"""Unit tests for services/rollup_query.py (FD-3 — version_id rescope).

The rollup query service was rescoped in FD-3 B3 from a free-form
``version: str = 'forecast'`` to ``version_id: int`` against the new
``DistributionVersion`` header. Tests seed a production-active version
upfront and pass its id through to every entry point.
"""

from __future__ import annotations

from datetime import date

import pytest

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


def _make_version(db, active_from=date(2025, 1, 1)) -> DistributionVersion:
    """Seed an active production DistributionVersion for the rollup tests."""
    v = DistributionVersion(
        active_from=active_from, status="active",
        rationale="rollup-query test seed", origin="seed",
        scenario_id=None,
    )
    db.add(v)
    db.flush()
    return v


def _setup_entities(db, count=3):
    """Insert grouping entities and chargeable entities."""
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


def _make_geo_cl(db, cl_id, code, *, region_id=None, country_id=None, division=None):
    """Charging location wired to region / country / division for geo tests."""
    cl = ChargingLocation(
        id=cl_id, code=code, name=f"Test {code}", division=division,
        region_id=region_id, country_id=country_id, is_active=True,
    )
    db.add(cl)
    db.flush()
    return cl


# ---------------------------------------------------------------------------
# query_rollup — per-dimension aggregations
# ---------------------------------------------------------------------------


class TestQueryRollup:
    def test_group_by_entity_type(self, db):
        v = _make_version(db)
        _setup_entities(db)
        result = query_rollup(db, 2026, v.id, group_by="entity_type")
        group_keys = {r.group_key for r in result.rows}
        assert "Offering" in group_keys
        assert "InternalService" in group_keys
        assert result.version_id == v.id

    def test_group_by_entity(self, db):
        v = _make_version(db)
        _setup_entities(db, count=3)
        result = query_rollup(db, 2026, v.id, group_by="entity")
        assert len(result.rows) == 3

    def test_grand_total_equals_sum_of_rows(self, db):
        v = _make_version(db)
        _setup_entities(db, count=3)
        result = query_rollup(db, 2026, v.id, group_by="entity_type")
        computed_total = round(sum(r.effective_cost for r in result.rows), 2)
        assert abs(computed_total - result.grand_total_effective) < 0.01

    def test_group_by_hierarchy_node(self, db):
        v = _make_version(db)
        _setup_entities(db, count=4)
        result = query_rollup(db, 2026, v.id, group_by="hierarchy_node")
        group_keys = {r.group_key for r in result.rows}
        assert "lob-alpha" in group_keys or "lob-beta" in group_keys

    def test_unsupported_dimension_raises(self, db):
        v = _make_version(db)
        with pytest.raises(ValueError, match="Unsupported group_by"):
            query_rollup(db, 2026, v.id, group_by="banana")

    def test_entity_type_filter(self, db):
        v = _make_version(db)
        _setup_entities(db, count=4)
        result = query_rollup(
            db, 2026, v.id, group_by="entity", entity_type="Offering",
        )
        for row in result.rows:
            assert row.group_key.startswith("ce-")

    def test_empty_portfolio_returns_empty(self, db):
        v = _make_version(db)
        result = query_rollup(db, 2026, v.id, group_by="entity_type")
        assert result.rows == []
        assert result.grand_total_effective == 0.0

    def test_rows_sorted_by_effective_cost_desc(self, db):
        v = _make_version(db)
        _setup_entities(db, count=4)
        result = query_rollup(db, 2026, v.id, group_by="entity")
        costs = [r.effective_cost for r in result.rows]
        assert costs == sorted(costs, reverse=True)

    def test_entity_count_per_group(self, db):
        v = _make_version(db)
        _setup_entities(db, count=4)
        result = query_rollup(db, 2026, v.id, group_by="entity_type")
        total_entities = sum(r.entity_count for r in result.rows)
        assert total_entities == 4

    def test_annual_cost_appears_in_effective_cost(self, db):
        """Entities with annual_cost should have effective_cost > 0."""
        v = _make_version(db)
        _setup_entities(db, count=2)
        result = query_rollup(db, 2026, v.id, group_by="entity")
        positive_count = sum(1 for r in result.rows if r.effective_cost > 0)
        assert positive_count >= 1

    def test_all_supported_dims_do_not_raise(self, db):
        v = _make_version(db)
        _setup_entities(db, count=2)
        for dim in SUPPORTED_DIMS:
            result = query_rollup(db, 2026, v.id, group_by=dim)
            assert result.dimension == dim


# ---------------------------------------------------------------------------
# drill_down_charging_location
# ---------------------------------------------------------------------------


class TestDrillDownChargingLocation:
    def test_basic_drill_down(self, db):
        v = _make_version(db)
        _make_cl(db)
        _setup_entities(db, count=1)
        result = drill_down_charging_location(db, "ce-0", 2026, v.id, "cl-a")
        assert result.entity_id == "ce-0"
        assert isinstance(result.paths, list)
        assert result.version_id == v.id

    def test_entity_not_found_raises(self, db):
        v = _make_version(db)
        _make_cl(db)
        with pytest.raises(ValueError, match="not found"):
            drill_down_charging_location(
                db, "ce-nonexistent", 2026, v.id, "cl-a",
            )

    def test_upstream_chain_with_distribution(self, db):
        v = _make_version(db)
        _make_cl(db)
        _setup_entities(db, count=2)
        edge = Distribution(
            version_id=v.id,
            source_entity_id="ce-1", destination_entity_id="ce-0",
            percentage=40.0,
        )
        db.add(edge)
        db.commit()

        result = drill_down_charging_location(db, "ce-0", 2026, v.id, "cl-a")
        path_entities = set()
        for path in result.paths:
            path_entities.update(path.path)
        assert "ce-1" in path_entities

    def test_response_has_effective_cost(self, db):
        v = _make_version(db)
        _make_cl(db)
        _setup_entities(db, count=1)
        result = drill_down_charging_location(db, "ce-0", 2026, v.id, "cl-a")
        assert result.effective_cost >= 0

    def test_path_labels_enriched(self, db):
        v = _make_version(db)
        _make_cl(db)
        _setup_entities(db, count=1)
        result = drill_down_charging_location(db, "ce-0", 2026, v.id, "cl-a")
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
        v = _make_version(db)
        _make_cl(db, "cl-muc", "DE-MUC")
        _make_cl(db, "cl-stg", "DE-STG")
        entities = _setup_entities(db, count=2)
        for ent in entities:
            ent.to_business_pct = 50.0
        db.flush()

        _make_btc_profile(db, "ce-0", 2026, [("cl-muc", 60), ("cl-stg", 40)])
        _make_btc_profile(db, "ce-1", 2026, [("cl-muc", 60), ("cl-stg", 40)])
        db.commit()

        result = get_location_breakdown(db, "cl-muc", 2026, v.id)

        assert result.charging_location_id == "cl-muc"
        assert result.charging_location_code == "DE-MUC"
        assert len(result.chargeable_entities) == 2
        row_sum = round(
            sum(r.amount_eur for r in result.chargeable_entities), 2,
        )
        assert abs(row_sum - result.total_amount_eur) < 0.01
        share_sum = sum(r.share_pct for r in result.chargeable_entities)
        assert abs(share_sum - 100.0) < 0.5
        ce0 = next(r for r in result.chargeable_entities if r.entity_id == "ce-0")
        assert abs(ce0.amount_eur - 30000.0) < 0.01

    def test_returns_legal_entities_at_location(self, db):
        v = _make_version(db)
        _make_cl(db, "cl-muc", "DE-MUC")
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

        result = get_location_breakdown(db, "cl-muc", 2026, v.id)

        codes = {le.code for le in result.legal_entities}
        assert codes == {"LE-001", "LE-002"}
        assert [le.code for le in result.legal_entities] == ["LE-001", "LE-002"]

    def test_no_inflows_returns_zero_total(self, db):
        v = _make_version(db)
        _make_cl(db, "cl-empty", "DE-EMPTY")
        db.add(LegalEntity(
            id="le-x", code="LE-X", name="Sole tenant",
            charging_location_id="cl-empty", is_active=True,
        ))
        db.commit()

        result = get_location_breakdown(db, "cl-empty", 2026, v.id)
        assert result.chargeable_entities == []
        assert result.total_amount_eur == 0.0
        assert len(result.legal_entities) == 1

    def test_unknown_location_raises(self, db):
        v = _make_version(db)
        with pytest.raises(ValueError, match="not found"):
            get_location_breakdown(db, "cl-nonexistent", 2026, v.id)

    def test_only_active_btc_profiles_count(self, db):
        v = _make_version(db)
        _make_cl(db, "cl-muc", "DE-MUC")
        entities = _setup_entities(db, count=1)
        entities[0].to_business_pct = 50.0
        db.flush()
        draft = BTCProfile(
            entity_id="ce-0", year=2026, mode="manual", status="draft",
        )
        db.add(draft)
        db.flush()
        db.add(BTCProfileLine(
            profile_id=draft.id, charging_location_id="cl-muc", percentage=100.0,
        ))
        db.commit()

        result = get_location_breakdown(db, "cl-muc", 2026, v.id)
        assert result.chargeable_entities == []
        assert result.total_amount_eur == 0.0


# ---------------------------------------------------------------------------
# query_rollup — geo dimensions (Stage 2 / BTC distribution)
# ---------------------------------------------------------------------------


def _setup_geo_fixture(db):
    """Two entities releasing to business, split across an EMEA and an APAC
    charging location. ce-0 (annual 100000, to_business 50%) → business 50000:
    Munich 60% = 30000, Shanghai 40% = 20000. ce-1 (annual 200000, to_business
    10%) → business 20000: Munich 60% = 12000, Shanghai 40% = 8000.
    """
    db.add_all([
        Region(id="reg-emea", code="EMEA", name="EMEA"),
        Region(id="reg-apac", code="APAC", name="APAC"),
        Country(id="ctry-de", iso_code="DE", name="Germany"),
        Country(id="ctry-cn", iso_code="CN", name="China"),
    ])
    db.flush()
    _make_geo_cl(db, "cl-muc", "DE-MUC", region_id="reg-emea",
                 country_id="ctry-de", division="Operations")
    _make_geo_cl(db, "cl-sha", "CN-SHA", region_id="reg-apac",
                 country_id="ctry-cn", division="Engineering")
    entities = _setup_entities(db, count=2)
    entities[0].to_business_pct = 50.0   # ce-0
    entities[1].to_business_pct = 10.0   # ce-1
    db.flush()
    _make_btc_profile(db, "ce-0", 2026, [("cl-muc", 60), ("cl-sha", 40)])
    _make_btc_profile(db, "ce-1", 2026, [("cl-muc", 60), ("cl-sha", 40)])
    db.commit()


class TestQueryRollupGeo:
    def test_region_buckets_distinct_and_btc_weighted(self, db):
        v = _make_version(db)
        _setup_geo_fixture(db)
        result = query_rollup(db, 2026, v.id, group_by="region")
        by_key = {r.group_key: r for r in result.rows}
        # Real geo buckets — NOT the entity_type stub that caused the bug.
        assert set(by_key) == {"reg-emea", "reg-apac"}
        assert "Offering" not in by_key and "InternalService" not in by_key
        # EMEA = 30000 + 12000; APAC = 20000 + 8000.
        assert abs(by_key["reg-emea"].effective_cost - 42000.0) < 0.01
        assert abs(by_key["reg-apac"].effective_cost - 28000.0) < 0.01
        assert by_key["reg-emea"].group_label == "EMEA"
        assert by_key["reg-emea"].entity_count == 2

    def test_country_and_division_are_distinct_dimensions(self, db):
        v = _make_version(db)
        _setup_geo_fixture(db)
        countries = {r.group_key for r in
                     query_rollup(db, 2026, v.id, group_by="country").rows}
        divisions = {r.group_label for r in
                     query_rollup(db, 2026, v.id, group_by="division").rows}
        assert countries == {"ctry-de", "ctry-cn"}
        assert divisions == {"Operations", "Engineering"}

    def test_grand_total_reconciles_across_geo_dims(self, db):
        v = _make_version(db)
        _setup_geo_fixture(db)
        # Total released-to-business is invariant to the geo split chosen.
        region_total = query_rollup(db, 2026, v.id, group_by="region").grand_total_effective
        country_total = query_rollup(db, 2026, v.id, group_by="country").grand_total_effective
        assert abs(region_total - 70000.0) < 0.01
        assert abs(region_total - country_total) < 0.01

    def test_entity_without_profile_contributes_zero(self, db):
        v = _make_version(db)
        db.add(Region(id="reg-emea", code="EMEA", name="EMEA"))
        db.flush()
        _make_geo_cl(db, "cl-muc", "DE-MUC", region_id="reg-emea")
        ents = _setup_entities(db, count=1)
        ents[0].to_business_pct = 50.0
        db.flush()
        db.commit()  # no BTC profile created
        result = query_rollup(db, 2026, v.id, group_by="region")
        assert result.rows == []
        assert result.grand_total_effective == 0.0

    def test_location_without_region_falls_into_unassigned(self, db):
        v = _make_version(db)
        _make_geo_cl(db, "cl-orphan", "XX-ORP")  # no region_id
        ents = _setup_entities(db, count=1)
        ents[0].to_business_pct = 50.0
        db.flush()
        _make_btc_profile(db, "ce-0", 2026, [("cl-orphan", 100)])
        db.commit()
        result = query_rollup(db, 2026, v.id, group_by="region")
        assert [r.group_label for r in result.rows] == ["(Unassigned)"]


# ---------------------------------------------------------------------------
# query_rollup — change_or_run population scope (VIPER §5)
# ---------------------------------------------------------------------------


class TestQueryRollupChangeOrRunScope:
    def _seed_mixed(self, db):
        # _setup_entities makes i<2 → Offering; add a Project explicitly.
        _setup_entities(db, count=2)
        db.add(ChargeableEntity(
            id="ce-proj", entity_type="Project", identifier="IT099999",
            name="A Project", to_business_pct=0.0, is_active=True,
            annual_cost=50000.0,
        ))
        db.flush()
        db.commit()

    def test_run_scope_excludes_projects(self, db):
        v = _make_version(db)
        self._seed_mixed(db)
        result = query_rollup(
            db, 2026, v.id, group_by="entity_type", change_or_run="run",
        )
        keys = {r.group_key for r in result.rows}
        assert "Project" not in keys
        assert keys <= {"Offering", "InternalService"}

    def test_change_scope_keeps_only_projects(self, db):
        v = _make_version(db)
        self._seed_mixed(db)
        result = query_rollup(
            db, 2026, v.id, group_by="entity_type", change_or_run="change",
        )
        keys = {r.group_key for r in result.rows}
        assert keys == {"Project"}

    def test_invalid_change_or_run_raises(self, db):
        v = _make_version(db)
        with pytest.raises(ValueError, match="Unsupported change_or_run"):
            query_rollup(db, 2026, v.id, group_by="entity_type", change_or_run="banana")
