"""Unit tests for services/scenario_lever12.py — sandbox cost allocation engine.

Per spec [B-ES-01] (Lever 12 widening) and [F-RV-01..06]:
- Stage 1 distribution edges fork lazily into version='scenario-{id}'
- Stage 2 BTC + to_business overlays stored as ScenarioActions
- Per-charging-location impact computed against the anchor version
- Live BTCProfile rows are NEVER mutated by this module
"""

import json
from decimal import Decimal

import pytest

from models.charging import (
    BTCProfile, BTCProfileLine, ChargeableEntity, ChargingLocation, Distribution,
)
from models.people import Person
from models.scenarios import Scenario, ScenarioAction
from services.scenario_lever12 import (
    ACTION_BTC_LINE_CHANGE,
    ACTION_DISTRIBUTION_CHANGE,
    ACTION_TO_BUSINESS_CHANGE,
    Lever12Error,
    apply_btc_lines_change,
    apply_distribution_create,
    apply_distribution_delete,
    apply_distribution_update,
    apply_to_business_change,
    cleanup_lever12_state,
    compute_cost_allocation_impact,
    fork_entity_edges,
    list_scenario_edges,
    scenario_version,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def author_person(db, seed_org_base):
    """An author Person row distinct from seed_org_base persons."""
    person = Person(
        id="p-b1-author", name="B1 Author",
        role_type_id="role-dev", cost_center_id="cc-muc-dev",
        competence_center_id="comp-dev",
    )
    db.add(person)
    db.commit()
    return person


@pytest.fixture
def lever12_world(db, author_person):
    """Two ChargeableEntities + 2 ChargingLocations + a forecast-version edge.

    Topology:
        ent_src (annual_cost=100k) --50%--> ent_dst (annual_cost=0)
        ent_src.to_business_pct = 30%
        BTCProfile on ent_src (year=2026, manual, active):
          cl_a → 60%, cl_b → 40%
    """
    cl_a = ChargingLocation(id="cl-a", code="CL-A", name="Location A")
    cl_b = ChargingLocation(id="cl-b", code="CL-B", name="Location B")
    db.add_all([cl_a, cl_b])

    ent_src = ChargeableEntity(
        id="ent-src", entity_type="Offering", identifier="IT00S100",
        name="Source Offering", annual_cost=Decimal("100000"),
        to_business_pct=Decimal("30"),
    )
    ent_dst = ChargeableEntity(
        id="ent-dst", entity_type="InternalService", identifier="ITF00100",
        name="Dest Service", annual_cost=Decimal("0"),
        to_business_pct=Decimal("0"),
    )
    db.add_all([ent_src, ent_dst])
    db.flush()

    # Existing forecast-version distribution edge
    edge = Distribution(
        year=2026, version="forecast",
        source_entity_id="ent-src", destination_entity_id="ent-dst",
        percentage=Decimal("50"),
    )
    db.add(edge)

    # BTCProfile + lines
    profile = BTCProfile(
        entity_id="ent-src", year=2026, mode="manual", status="active",
    )
    db.add(profile)
    db.flush()
    db.add(BTCProfileLine(
        profile_id=profile.id, charging_location_id="cl-a",
        percentage=Decimal("60"),
    ))
    db.add(BTCProfileLine(
        profile_id=profile.id, charging_location_id="cl-b",
        percentage=Decimal("40"),
    ))

    scenario = Scenario(
        name="Lever 12 Test Scenario", author_id=author_person.id, status="private",
    )
    db.add(scenario)
    db.commit()
    db.refresh(scenario)

    return {
        "scenario_id": scenario.id,
        "ent_src_id": "ent-src",
        "ent_dst_id": "ent-dst",
        "cl_a_id": "cl-a",
        "cl_b_id": "cl-b",
        "edge_id": edge.id,
        "year": 2026,
    }


# ---------------------------------------------------------------------------
# scenario_version helper
# ---------------------------------------------------------------------------

class TestScenarioVersionHelper:
    def test_format(self):
        assert scenario_version(42) == "scenario-42"
        assert scenario_version(1) == "scenario-1"


# ---------------------------------------------------------------------------
# Lazy fork
# ---------------------------------------------------------------------------

class TestForkEntityEdges:
    def test_initial_fork_clones_anchor_edges(self, db, lever12_world):
        n = fork_entity_edges(
            db, lever12_world["scenario_id"], lever12_world["ent_src_id"], 2026,
        )
        assert n == 1
        sv = scenario_version(lever12_world["scenario_id"])
        rows = (
            db.query(Distribution)
            .filter(Distribution.version == sv)
            .all()
        )
        assert len(rows) == 1
        assert rows[0].source_entity_id == "ent-src"
        assert float(rows[0].percentage) == 50.0

    def test_fork_is_idempotent(self, db, lever12_world):
        fork_entity_edges(
            db, lever12_world["scenario_id"], lever12_world["ent_src_id"], 2026,
        )
        n2 = fork_entity_edges(
            db, lever12_world["scenario_id"], lever12_world["ent_src_id"], 2026,
        )
        assert n2 == 0

    def test_fork_does_not_touch_anchor(self, db, lever12_world):
        fork_entity_edges(
            db, lever12_world["scenario_id"], lever12_world["ent_src_id"], 2026,
        )
        anchor_rows = (
            db.query(Distribution)
            .filter(Distribution.version == "forecast")
            .all()
        )
        assert len(anchor_rows) == 1
        assert float(anchor_rows[0].percentage) == 50.0

    def test_list_returns_anchor_when_no_fork(self, db, lever12_world):
        rows = list_scenario_edges(
            db, lever12_world["scenario_id"], lever12_world["ent_src_id"], 2026,
        )
        assert len(rows) == 1
        assert rows[0].version == "forecast"

    def test_list_returns_scenario_after_fork(self, db, lever12_world):
        fork_entity_edges(
            db, lever12_world["scenario_id"], lever12_world["ent_src_id"], 2026,
        )
        rows = list_scenario_edges(
            db, lever12_world["scenario_id"], lever12_world["ent_src_id"], 2026,
        )
        assert all(r.version == scenario_version(lever12_world["scenario_id"]) for r in rows)


# ---------------------------------------------------------------------------
# Distribution mutations (Stage 1)
# ---------------------------------------------------------------------------

class TestApplyDistributionCreate:
    def test_create_records_action(self, db, lever12_world, author_person):
        # We need a third entity to create a new edge to.
        ent_3 = ChargeableEntity(
            id="ent-3", entity_type="InternalService", identifier="ITF00200",
            name="Third Service", annual_cost=Decimal("0"),
            to_business_pct=Decimal("0"),
        )
        db.add(ent_3)
        db.commit()

        result = apply_distribution_create(
            db, lever12_world["scenario_id"], year=2026,
            source_entity_id="ent-src", destination_entity_id="ent-3",
            percentage=10.0,
        )
        db.commit()

        assert result["source_entity_id"] == "ent-src"
        assert result["destination_entity_id"] == "ent-3"
        assert result["percentage"] == 10.0
        # Action recorded
        actions = (
            db.query(ScenarioAction)
            .filter(ScenarioAction.scenario_id == lever12_world["scenario_id"])
            .all()
        )
        assert len(actions) == 1
        assert actions[0].action_type == ACTION_DISTRIBUTION_CHANGE
        assert actions[0].lever_category == "cost_allocation"
        assert actions[0].tier == 2
        # Both anchor and scenario edges exist; anchor untouched
        anchor = db.query(Distribution).filter(Distribution.version == "forecast").all()
        sv = scenario_version(lever12_world["scenario_id"])
        sandbox = db.query(Distribution).filter(Distribution.version == sv).all()
        assert len(anchor) == 1
        # 1 forked edge (ent-src→ent-dst) + 1 new (ent-src→ent-3)
        assert len(sandbox) == 2

    def test_sum_violation_raises(self, db, lever12_world):
        # ent-src already has to_business_pct=30 + edge=50 = 80; adding 30 → 110 > 100
        ent_3 = ChargeableEntity(
            id="ent-3", entity_type="InternalService", identifier="ITF00200",
            name="Third Service", annual_cost=Decimal("0"),
            to_business_pct=Decimal("0"),
        )
        db.add(ent_3)
        db.commit()
        with pytest.raises(Lever12Error) as exc:
            apply_distribution_create(
                db, lever12_world["scenario_id"], year=2026,
                source_entity_id="ent-src", destination_entity_id="ent-3",
                percentage=30.0,
            )
        assert "Sum rule" in exc.value.message or "exceeds" in exc.value.message

    def test_cycle_violation_raises(self, db, lever12_world):
        # Adding ent-dst → ent-src would create a cycle
        with pytest.raises(Lever12Error) as exc:
            apply_distribution_create(
                db, lever12_world["scenario_id"], year=2026,
                source_entity_id="ent-dst", destination_entity_id="ent-src",
                percentage=10.0,
            )
        assert exc.value.cycle_chain is not None
        assert "ent-src" in exc.value.cycle_chain or "ent-dst" in exc.value.cycle_chain


class TestApplyDistributionUpdate:
    def test_update_anchor_edge_forks_first(self, db, lever12_world):
        result = apply_distribution_update(
            db, lever12_world["scenario_id"],
            edge_id=lever12_world["edge_id"], percentage=40.0,
        )
        db.commit()
        assert result["percentage"] == 40.0
        # Anchor row unchanged
        anchor = (
            db.query(Distribution)
            .filter(Distribution.id == lever12_world["edge_id"])
            .first()
        )
        assert float(anchor.percentage) == 50.0
        # New scenario row exists with 40
        sv = scenario_version(lever12_world["scenario_id"])
        sandbox = db.query(Distribution).filter(Distribution.version == sv).all()
        assert len(sandbox) == 1
        assert float(sandbox[0].percentage) == 40.0

    def test_update_missing_edge_raises(self, db, lever12_world):
        with pytest.raises(Lever12Error):
            apply_distribution_update(
                db, lever12_world["scenario_id"],
                edge_id=99999, percentage=20.0,
            )


class TestApplyDistributionDelete:
    def test_delete_forks_then_removes(self, db, lever12_world):
        result = apply_distribution_delete(
            db, lever12_world["scenario_id"], edge_id=lever12_world["edge_id"],
        )
        db.commit()
        assert "deleted_edge_id" in result
        # Anchor untouched
        anchor = (
            db.query(Distribution)
            .filter(Distribution.id == lever12_world["edge_id"])
            .first()
        )
        assert anchor is not None
        # Sandbox empty
        sv = scenario_version(lever12_world["scenario_id"])
        sandbox = db.query(Distribution).filter(Distribution.version == sv).all()
        assert len(sandbox) == 0
        # Action recorded
        actions = (
            db.query(ScenarioAction)
            .filter(ScenarioAction.scenario_id == lever12_world["scenario_id"])
            .all()
        )
        assert len(actions) == 1
        params = json.loads(actions[0].parameters_json)
        assert params["operation"] == "delete"


# ---------------------------------------------------------------------------
# to_business_pct overlay
# ---------------------------------------------------------------------------

class TestApplyToBusinessChange:
    def test_records_action(self, db, lever12_world):
        result = apply_to_business_change(
            db, lever12_world["scenario_id"],
            entity_id="ent-src", year=2026, new_pct=25.0,
        )
        db.commit()
        assert result["scenario_pct"] == 25.0
        assert result["anchor_pct"] == 30.0
        actions = (
            db.query(ScenarioAction)
            .filter(ScenarioAction.action_type == ACTION_TO_BUSINESS_CHANGE)
            .all()
        )
        assert len(actions) == 1

    def test_live_entity_not_mutated(self, db, lever12_world):
        apply_to_business_change(
            db, lever12_world["scenario_id"],
            entity_id="ent-src", year=2026, new_pct=25.0,
        )
        db.commit()
        live = db.query(ChargeableEntity).filter_by(id="ent-src").first()
        assert float(live.to_business_pct) == 30.0

    def test_out_of_range_raises(self, db, lever12_world):
        with pytest.raises(Lever12Error):
            apply_to_business_change(
                db, lever12_world["scenario_id"],
                entity_id="ent-src", year=2026, new_pct=110.0,
            )

    def test_sum_violation_raises(self, db, lever12_world):
        # Existing edges sum to 50%; new to_business 60% → 110 > 100
        with pytest.raises(Lever12Error) as exc:
            apply_to_business_change(
                db, lever12_world["scenario_id"],
                entity_id="ent-src", year=2026, new_pct=60.0,
            )
        assert "Sum rule" in exc.value.message

    def test_unknown_entity_raises(self, db, lever12_world):
        with pytest.raises(Lever12Error):
            apply_to_business_change(
                db, lever12_world["scenario_id"],
                entity_id="ent-bogus", year=2026, new_pct=10.0,
            )


# ---------------------------------------------------------------------------
# BTC line overlay
# ---------------------------------------------------------------------------

class TestApplyBTCLinesChange:
    def test_records_overlay_action(self, db, lever12_world):
        result = apply_btc_lines_change(
            db, lever12_world["scenario_id"],
            entity_id="ent-src", year=2026,
            lines=[
                {"charging_location_id": "cl-a", "percentage": 80.0},
                {"charging_location_id": "cl-b", "percentage": 20.0},
            ],
        )
        db.commit()
        assert len(result["scenario_lines"]) == 2
        actions = (
            db.query(ScenarioAction)
            .filter(ScenarioAction.action_type == ACTION_BTC_LINE_CHANGE)
            .all()
        )
        assert len(actions) == 1

    def test_live_btc_lines_unchanged(self, db, lever12_world):
        apply_btc_lines_change(
            db, lever12_world["scenario_id"],
            entity_id="ent-src", year=2026,
            lines=[
                {"charging_location_id": "cl-a", "percentage": 80.0},
                {"charging_location_id": "cl-b", "percentage": 20.0},
            ],
        )
        db.commit()
        # The original 60/40 split still on live BTCProfileLine rows
        live_lines = (
            db.query(BTCProfileLine)
            .join(BTCProfile, BTCProfileLine.profile_id == BTCProfile.id)
            .filter(BTCProfile.entity_id == "ent-src")
            .all()
        )
        pct_map = {
            line.charging_location_id: float(line.percentage)
            for line in live_lines
        }
        assert pct_map == {"cl-a": 60.0, "cl-b": 40.0}

    def test_sum_violation_raises(self, db, lever12_world):
        with pytest.raises(Lever12Error):
            apply_btc_lines_change(
                db, lever12_world["scenario_id"],
                entity_id="ent-src", year=2026,
                lines=[
                    {"charging_location_id": "cl-a", "percentage": 50.0},
                    {"charging_location_id": "cl-b", "percentage": 30.0},
                ],
            )

    def test_empty_lines_allowed(self, db, lever12_world):
        # Empty list is a valid "wipe" overlay
        result = apply_btc_lines_change(
            db, lever12_world["scenario_id"],
            entity_id="ent-src", year=2026, lines=[],
        )
        db.commit()
        assert result["scenario_lines"] == []


# ---------------------------------------------------------------------------
# Per-charging-location impact
# ---------------------------------------------------------------------------

class TestComputeCostAllocationImpact:
    def test_no_actions_yields_empty_impact(self, db, lever12_world):
        out = compute_cost_allocation_impact(
            db, lever12_world["scenario_id"], year=2026,
        )
        assert out["touched_entity_count"] == 0
        assert out["items"] == []
        assert out["totals"]["delta"] == 0.0

    def test_to_business_change_shifts_per_location_amounts(self, db, lever12_world):
        # ent-src effective_cost = annual_cost(100k) (no inflows, leaf source)
        # Anchor: to_business=30%, BTC = 60/40 → cl-a 18k, cl-b 12k
        # After scenario: to_business=20% → cl-a 12k, cl-b 8k
        apply_to_business_change(
            db, lever12_world["scenario_id"],
            entity_id="ent-src", year=2026, new_pct=20.0,
        )
        db.commit()
        out = compute_cost_allocation_impact(
            db, lever12_world["scenario_id"], year=2026,
        )
        # Two rows, one per CL
        items = {(i["entity_id"], i["charging_location_id"]): i for i in out["items"]}
        assert ("ent-src", "cl-a") in items
        assert ("ent-src", "cl-b") in items
        # Anchor amounts should be 18000 / 12000
        assert items[("ent-src", "cl-a")]["anchor_amount"] == 18000.0
        assert items[("ent-src", "cl-b")]["anchor_amount"] == 12000.0
        # Scenario amounts should be 12000 / 8000
        assert items[("ent-src", "cl-a")]["scenario_amount"] == 12000.0
        assert items[("ent-src", "cl-b")]["scenario_amount"] == 8000.0
        # Deltas
        assert items[("ent-src", "cl-a")]["delta"] == -6000.0
        assert items[("ent-src", "cl-b")]["delta"] == -4000.0
        # Totals
        assert out["totals"]["anchor_total"] == 30000.0
        assert out["totals"]["scenario_total"] == 20000.0
        assert out["totals"]["delta"] == -10000.0

    def test_btc_line_overlay_shifts_split(self, db, lever12_world):
        # Replace 60/40 with 100/0 → all 30k goes to cl-a
        apply_btc_lines_change(
            db, lever12_world["scenario_id"],
            entity_id="ent-src", year=2026,
            lines=[{"charging_location_id": "cl-a", "percentage": 100.0}],
        )
        db.commit()
        out = compute_cost_allocation_impact(
            db, lever12_world["scenario_id"], year=2026,
        )
        items = {(i["entity_id"], i["charging_location_id"]): i for i in out["items"]}
        # cl-a goes from 18k to 30k (+12k)
        assert items[("ent-src", "cl-a")]["scenario_amount"] == 30000.0
        assert items[("ent-src", "cl-a")]["delta"] == 12000.0
        # cl-b goes from 12k to 0 (-12k)
        assert items[("ent-src", "cl-b")]["scenario_amount"] == 0.0
        assert items[("ent-src", "cl-b")]["delta"] == -12000.0


# ---------------------------------------------------------------------------
# Cleanup on scenario delete
# ---------------------------------------------------------------------------

class TestCleanupLever12State:
    def test_cleanup_removes_scenario_distributions(self, db, lever12_world):
        apply_distribution_update(
            db, lever12_world["scenario_id"],
            edge_id=lever12_world["edge_id"], percentage=40.0,
        )
        db.commit()
        sv = scenario_version(lever12_world["scenario_id"])
        before = db.query(Distribution).filter(Distribution.version == sv).count()
        assert before == 1

        n = cleanup_lever12_state(db, lever12_world["scenario_id"])
        db.commit()
        assert n == 1
        after = db.query(Distribution).filter(Distribution.version == sv).count()
        assert after == 0

    def test_cleanup_does_not_touch_anchor(self, db, lever12_world):
        apply_distribution_update(
            db, lever12_world["scenario_id"],
            edge_id=lever12_world["edge_id"], percentage=40.0,
        )
        db.commit()
        cleanup_lever12_state(db, lever12_world["scenario_id"])
        db.commit()
        anchor_count = (
            db.query(Distribution)
            .filter(Distribution.version == "forecast")
            .count()
        )
        assert anchor_count == 1
