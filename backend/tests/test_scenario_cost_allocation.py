"""Unit tests for services/scenario_cost_allocation.py — sandbox cost allocation engine.

Per spec [B-ES-01] (cost allocation widening) and [F-RV-01..06], plus the FD-3
Charging/UM rework (spec §4) which replaces the v4 string-keyed
``Distribution.version`` column with a first-class ``DistributionVersion``
header keyed by ``Distribution.version_id`` (FK):

- Stage 1 distribution edges fork lazily into a per-scenario
  ``DistributionVersion`` (``scenario_id=N``, ``status='draft'`` permanently)
- Stage 2 BTC + to_business overlays stored as ScenarioActions
- Per-charging-location impact computed against the anchor production
  ``DistributionVersion`` pinned on ``Scenario.anchor_distribution_version_id``
- Live BTCProfile rows are NEVER mutated by this module
- The anchor production version is NEVER mutated; only the per-scenario
  draft version receives edge writes
"""

import json
from datetime import date
from decimal import Decimal

import pytest

from models.charging import (
    BTCProfile, BTCProfileLine, ChargeableEntity, ChargingLocation, Distribution,
    DistributionVersion,
)
from models.people import Person
from models.scenarios import Scenario, ScenarioAction
from services.scenario_cost_allocation import (
    ACTION_BTC_LINE_CHANGE,
    ACTION_DISTRIBUTION_CHANGE,
    ACTION_TO_BUSINESS_CHANGE,
    CostAllocationError,
    apply_btc_lines_change,
    apply_distribution_create,
    apply_distribution_delete,
    apply_distribution_update,
    apply_to_business_change,
    cleanup_cost_allocation_state,
    compute_cost_allocation_impact,
    fork_entity_edges,
    list_scenario_edges,
    scenario_version,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _scenario_dist_version(db, scenario_id):
    """Look up the per-scenario sandbox DistributionVersion row, or None."""
    return (
        db.query(DistributionVersion)
        .filter(DistributionVersion.scenario_id == scenario_id)
        .first()
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
def cost_allocation_world(db, author_person):
    """Two ChargeableEntities + 2 ChargingLocations + an active production edge.

    Topology:
        ent_src (annual_cost=100k) --50%--> ent_dst (annual_cost=0)
        ent_src.to_business_pct = 30%
        BTCProfile on ent_src (year=2026, manual, active):
          cl_a → 60%, cl_b → 40%

    Stage 1 edges live on an active production ``DistributionVersion``
    (``active_from=2025-01-01``, ``origin='seed'``). The scenario is
    explicitly anchored to that version.
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

    # Active production DistributionVersion — anchor for the scenario.
    active_version = DistributionVersion(
        active_from=date(2025, 1, 1),
        status="active",
        rationale="seed",
        origin="seed",
        scenario_id=None,
    )
    db.add(active_version)
    db.flush()

    # Existing production distribution edge.
    edge = Distribution(
        version_id=active_version.id,
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
        name="Cost Allocation Test Scenario", author_id=author_person.id, status="private",
        anchor_distribution_version_id=active_version.id,
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
        "active_version_id": active_version.id,
        "year": 2026,
    }


# ---------------------------------------------------------------------------
# scenario_version helper
# ---------------------------------------------------------------------------

class TestScenarioVersionHelper:
    """``scenario_version`` is kept as a stable human-readable label helper.

    It does NOT query the database — the sandbox version row is looked up
    by ``scenario_id`` via :func:`_get_or_create_scenario_dist_version`.
    """

    def test_format(self):
        assert scenario_version(42) == "scenario-42"
        assert scenario_version(1) == "scenario-1"


# ---------------------------------------------------------------------------
# Lazy fork
# ---------------------------------------------------------------------------

class TestForkEntityEdges:
    def test_initial_fork_clones_anchor_edges(self, db, cost_allocation_world):
        n = fork_entity_edges(
            db, cost_allocation_world["scenario_id"], cost_allocation_world["ent_src_id"],
        )
        assert n == 1
        sv = _scenario_dist_version(db, cost_allocation_world["scenario_id"])
        assert sv is not None
        rows = (
            db.query(Distribution)
            .filter(Distribution.version_id == sv.id)
            .all()
        )
        assert len(rows) == 1
        assert rows[0].source_entity_id == "ent-src"
        assert float(rows[0].percentage) == 50.0

    def test_fork_is_idempotent(self, db, cost_allocation_world):
        fork_entity_edges(
            db, cost_allocation_world["scenario_id"], cost_allocation_world["ent_src_id"],
        )
        n2 = fork_entity_edges(
            db, cost_allocation_world["scenario_id"], cost_allocation_world["ent_src_id"],
        )
        assert n2 == 0

    def test_fork_does_not_touch_anchor(self, db, cost_allocation_world):
        fork_entity_edges(
            db, cost_allocation_world["scenario_id"], cost_allocation_world["ent_src_id"],
        )
        anchor_rows = (
            db.query(Distribution)
            .filter(Distribution.version_id == cost_allocation_world["active_version_id"])
            .all()
        )
        assert len(anchor_rows) == 1
        assert float(anchor_rows[0].percentage) == 50.0

    def test_list_returns_anchor_when_no_fork(self, db, cost_allocation_world):
        rows = list_scenario_edges(
            db, cost_allocation_world["scenario_id"], cost_allocation_world["ent_src_id"],
        )
        assert len(rows) == 1
        assert rows[0].version_id == cost_allocation_world["active_version_id"]

    def test_list_returns_scenario_after_fork(self, db, cost_allocation_world):
        fork_entity_edges(
            db, cost_allocation_world["scenario_id"], cost_allocation_world["ent_src_id"],
        )
        rows = list_scenario_edges(
            db, cost_allocation_world["scenario_id"], cost_allocation_world["ent_src_id"],
        )
        sv = _scenario_dist_version(db, cost_allocation_world["scenario_id"])
        assert all(r.version_id == sv.id for r in rows)


# ---------------------------------------------------------------------------
# Distribution mutations (Stage 1)
# ---------------------------------------------------------------------------

class TestApplyDistributionCreate:
    def test_create_records_action(self, db, cost_allocation_world, author_person):
        # We need a third entity to create a new edge to.
        ent_3 = ChargeableEntity(
            id="ent-3", entity_type="InternalService", identifier="ITF00200",
            name="Third Service", annual_cost=Decimal("0"),
            to_business_pct=Decimal("0"),
        )
        db.add(ent_3)
        db.commit()

        result = apply_distribution_create(
            db, cost_allocation_world["scenario_id"], year=2026,
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
            .filter(ScenarioAction.scenario_id == cost_allocation_world["scenario_id"])
            .all()
        )
        assert len(actions) == 1
        assert actions[0].action_type == ACTION_DISTRIBUTION_CHANGE
        assert actions[0].lever_category == "cost_allocation"
        assert actions[0].tier == 2
        # Both anchor and scenario edges exist; anchor untouched
        anchor = (
            db.query(Distribution)
            .filter(Distribution.version_id == cost_allocation_world["active_version_id"])
            .all()
        )
        sv = _scenario_dist_version(db, cost_allocation_world["scenario_id"])
        sandbox = (
            db.query(Distribution)
            .filter(Distribution.version_id == sv.id)
            .all()
        )
        assert len(anchor) == 1
        # 1 forked edge (ent-src→ent-dst) + 1 new (ent-src→ent-3)
        assert len(sandbox) == 2

    def test_sum_violation_raises(self, db, cost_allocation_world):
        # ent-src already has to_business_pct=30 + edge=50 = 80; adding 30 → 110 > 100
        ent_3 = ChargeableEntity(
            id="ent-3", entity_type="InternalService", identifier="ITF00200",
            name="Third Service", annual_cost=Decimal("0"),
            to_business_pct=Decimal("0"),
        )
        db.add(ent_3)
        db.commit()
        with pytest.raises(CostAllocationError) as exc:
            apply_distribution_create(
                db, cost_allocation_world["scenario_id"], year=2026,
                source_entity_id="ent-src", destination_entity_id="ent-3",
                percentage=30.0,
            )
        assert "Sum rule" in exc.value.message or "exceeds" in exc.value.message

    def test_cycle_violation_raises(self, db, cost_allocation_world):
        # Adding ent-dst → ent-src would create a cycle
        with pytest.raises(CostAllocationError) as exc:
            apply_distribution_create(
                db, cost_allocation_world["scenario_id"], year=2026,
                source_entity_id="ent-dst", destination_entity_id="ent-src",
                percentage=10.0,
            )
        assert exc.value.cycle_chain is not None
        assert "ent-src" in exc.value.cycle_chain or "ent-dst" in exc.value.cycle_chain

    def test_added_destination_flows_into_downstream_effective_cost(
        self, db, cost_allocation_world,
    ):
        """Session 3 add-destination: a NEW Stage-1 edge must propagate the
        source's effective cost into the destination's per-location split.

        ent-src (eff 100k, leaf) gains a NEW 15% edge to ent-3. ent-3 has its
        own BTC profile (cl-a 100%) + to_business 40%. The edge does NOT exist
        on the anchor version, so ent-3's anchor effective cost is own-cost
        only (0) while its scenario effective cost picks up 100k*0.15 = 15k of
        inflow. The per-location delta must surface that 15k → cl-a 6k.
        """
        ent_3 = ChargeableEntity(
            id="ent-3", entity_type="InternalService", identifier="ITF00200",
            name="Third Service", annual_cost=Decimal("0"),
            to_business_pct=Decimal("40"),
        )
        db.add(ent_3)
        db.flush()
        db.add(BTCProfile(
            entity_id="ent-3", year=2026, mode="manual", status="active",
        ))
        db.flush()
        profile_3 = (
            db.query(BTCProfile).filter(BTCProfile.entity_id == "ent-3").first()
        )
        db.add(BTCProfileLine(
            profile_id=profile_3.id, charging_location_id="cl-a",
            percentage=Decimal("100"),
        ))
        db.commit()

        # ent-src: to_business 30 + existing edge 50 + new 15 = 95 ≤ 100.
        apply_distribution_create(
            db, cost_allocation_world["scenario_id"], year=2026,
            source_entity_id="ent-src", destination_entity_id="ent-3",
            percentage=15.0,
        )
        db.commit()

        out = compute_cost_allocation_impact(
            db, cost_allocation_world["scenario_id"], year=2026,
        )
        items = {(i["entity_id"], i["charging_location_id"]): i for i in out["items"]}
        # ent-3 picks up the inflow only on the scenario side.
        assert ("ent-3", "cl-a") in items
        row = items[("ent-3", "cl-a")]
        assert row["anchor_amount"] == 0.0
        assert row["scenario_amount"] == 6000.0  # 100k * 0.15 * 0.40
        assert row["delta"] == 6000.0
        # ent-src's own per-location amounts are unchanged (its incoming
        # effective cost did not move) → no noise rows for it.
        assert ("ent-src", "cl-a") not in items
        assert ("ent-src", "cl-b") not in items

    def test_union_cycle_detected_for_sandbox_only_edge(self, db, cost_allocation_world):
        """Union-aware cycle: an edge that cycles ONLY through sandbox edges
        (not present on the anchor) must still be rejected.

        Anchor graph has just ent-src → ent-dst. We add a sandbox edge
        ent-dst → ent-3, then attempt ent-3 → ent-src. That closes the loop
        ent-src → ent-dst → ent-3 → ent-src — a cycle that exists ONLY in the
        union of anchor + scenario edges, never in the anchor alone.
        """
        ent_3 = ChargeableEntity(
            id="ent-3", entity_type="InternalService", identifier="ITF00200",
            name="Third Service", annual_cost=Decimal("0"),
            to_business_pct=Decimal("0"),
        )
        db.add(ent_3)
        db.commit()

        # Sandbox-only edge ent-dst → ent-3 (no anchor equivalent).
        apply_distribution_create(
            db, cost_allocation_world["scenario_id"], year=2026,
            source_entity_id="ent-dst", destination_entity_id="ent-3",
            percentage=50.0,
        )
        db.commit()

        # ent-3 → ent-src closes a loop only via the union graph.
        with pytest.raises(CostAllocationError) as exc:
            apply_distribution_create(
                db, cost_allocation_world["scenario_id"], year=2026,
                source_entity_id="ent-3", destination_entity_id="ent-src",
                percentage=10.0,
            )
        assert exc.value.cycle_chain is not None


class TestApplyDistributionUpdate:
    def test_update_anchor_edge_forks_first(self, db, cost_allocation_world):
        result = apply_distribution_update(
            db, cost_allocation_world["scenario_id"],
            edge_id=cost_allocation_world["edge_id"], percentage=40.0,
        )
        db.commit()
        assert result["percentage"] == 40.0
        # Anchor row unchanged
        anchor = (
            db.query(Distribution)
            .filter(Distribution.id == cost_allocation_world["edge_id"])
            .first()
        )
        assert float(anchor.percentage) == 50.0
        # New scenario row exists with 40
        sv = _scenario_dist_version(db, cost_allocation_world["scenario_id"])
        sandbox = (
            db.query(Distribution)
            .filter(Distribution.version_id == sv.id)
            .all()
        )
        assert len(sandbox) == 1
        assert float(sandbox[0].percentage) == 40.0

    def test_update_missing_edge_raises(self, db, cost_allocation_world):
        with pytest.raises(CostAllocationError):
            apply_distribution_update(
                db, cost_allocation_world["scenario_id"],
                edge_id=99999, percentage=20.0,
            )


class TestApplyDistributionDelete:
    def test_delete_forks_then_removes(self, db, cost_allocation_world):
        result = apply_distribution_delete(
            db, cost_allocation_world["scenario_id"], edge_id=cost_allocation_world["edge_id"],
        )
        db.commit()
        assert "deleted_edge_id" in result
        # Anchor untouched
        anchor = (
            db.query(Distribution)
            .filter(Distribution.id == cost_allocation_world["edge_id"])
            .first()
        )
        assert anchor is not None
        # Sandbox empty
        sv = _scenario_dist_version(db, cost_allocation_world["scenario_id"])
        sandbox = (
            db.query(Distribution)
            .filter(Distribution.version_id == sv.id)
            .all()
        )
        assert len(sandbox) == 0
        # Action recorded
        actions = (
            db.query(ScenarioAction)
            .filter(ScenarioAction.scenario_id == cost_allocation_world["scenario_id"])
            .all()
        )
        assert len(actions) == 1
        params = json.loads(actions[0].parameters_json)
        assert params["operation"] == "delete"


# ---------------------------------------------------------------------------
# to_business_pct overlay
# ---------------------------------------------------------------------------

class TestApplyToBusinessChange:
    def test_records_action(self, db, cost_allocation_world):
        result = apply_to_business_change(
            db, cost_allocation_world["scenario_id"],
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

    def test_live_entity_not_mutated(self, db, cost_allocation_world):
        apply_to_business_change(
            db, cost_allocation_world["scenario_id"],
            entity_id="ent-src", year=2026, new_pct=25.0,
        )
        db.commit()
        live = db.query(ChargeableEntity).filter_by(id="ent-src").first()
        assert float(live.to_business_pct) == 30.0

    def test_out_of_range_raises(self, db, cost_allocation_world):
        with pytest.raises(CostAllocationError):
            apply_to_business_change(
                db, cost_allocation_world["scenario_id"],
                entity_id="ent-src", year=2026, new_pct=110.0,
            )

    def test_sum_violation_raises(self, db, cost_allocation_world):
        # Existing edges sum to 50%; new to_business 60% → 110 > 100
        with pytest.raises(CostAllocationError) as exc:
            apply_to_business_change(
                db, cost_allocation_world["scenario_id"],
                entity_id="ent-src", year=2026, new_pct=60.0,
            )
        assert "Sum rule" in exc.value.message

    def test_unknown_entity_raises(self, db, cost_allocation_world):
        with pytest.raises(CostAllocationError):
            apply_to_business_change(
                db, cost_allocation_world["scenario_id"],
                entity_id="ent-bogus", year=2026, new_pct=10.0,
            )


# ---------------------------------------------------------------------------
# BTC line overlay
# ---------------------------------------------------------------------------

class TestApplyBTCLinesChange:
    def test_records_overlay_action(self, db, cost_allocation_world):
        result = apply_btc_lines_change(
            db, cost_allocation_world["scenario_id"],
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

    def test_live_btc_lines_unchanged(self, db, cost_allocation_world):
        apply_btc_lines_change(
            db, cost_allocation_world["scenario_id"],
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

    def test_sum_violation_raises(self, db, cost_allocation_world):
        with pytest.raises(CostAllocationError):
            apply_btc_lines_change(
                db, cost_allocation_world["scenario_id"],
                entity_id="ent-src", year=2026,
                lines=[
                    {"charging_location_id": "cl-a", "percentage": 50.0},
                    {"charging_location_id": "cl-b", "percentage": 30.0},
                ],
            )

    def test_empty_lines_allowed(self, db, cost_allocation_world):
        # Empty list is a valid "wipe" overlay
        result = apply_btc_lines_change(
            db, cost_allocation_world["scenario_id"],
            entity_id="ent-src", year=2026, lines=[],
        )
        db.commit()
        assert result["scenario_lines"] == []


# ---------------------------------------------------------------------------
# Per-charging-location impact
# ---------------------------------------------------------------------------

class TestComputeCostAllocationImpact:
    def test_no_actions_yields_empty_impact(self, db, cost_allocation_world):
        out = compute_cost_allocation_impact(
            db, cost_allocation_world["scenario_id"], year=2026,
        )
        assert out["touched_entity_count"] == 0
        assert out["items"] == []
        assert out["totals"]["delta"] == 0.0
        assert out["anchor_version_id"] == cost_allocation_world["active_version_id"]

    def test_to_business_change_shifts_per_location_amounts(self, db, cost_allocation_world):
        # ent-src effective_cost = annual_cost(100k) (no inflows, leaf source)
        # Anchor: to_business=30%, BTC = 60/40 → cl-a 18k, cl-b 12k
        # After scenario: to_business=20% → cl-a 12k, cl-b 8k
        apply_to_business_change(
            db, cost_allocation_world["scenario_id"],
            entity_id="ent-src", year=2026, new_pct=20.0,
        )
        db.commit()
        out = compute_cost_allocation_impact(
            db, cost_allocation_world["scenario_id"], year=2026,
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

    def test_btc_line_overlay_shifts_split(self, db, cost_allocation_world):
        # Replace 60/40 with 100/0 → all 30k goes to cl-a
        apply_btc_lines_change(
            db, cost_allocation_world["scenario_id"],
            entity_id="ent-src", year=2026,
            lines=[{"charging_location_id": "cl-a", "percentage": 100.0}],
        )
        db.commit()
        out = compute_cost_allocation_impact(
            db, cost_allocation_world["scenario_id"], year=2026,
        )
        items = {(i["entity_id"], i["charging_location_id"]): i for i in out["items"]}
        # cl-a goes from 18k to 30k (+12k)
        assert items[("ent-src", "cl-a")]["scenario_amount"] == 30000.0
        assert items[("ent-src", "cl-a")]["delta"] == 12000.0
        # cl-b goes from 12k to 0 (-12k)
        assert items[("ent-src", "cl-b")]["scenario_amount"] == 0.0
        assert items[("ent-src", "cl-b")]["delta"] == -12000.0


# ---------------------------------------------------------------------------
# Union-aware effective cost — Item 8 follow-up regression test
# Pre-fix bug: BTC-only scenarios lost upstream inflows on the scenario side
# because compute_effective_cost(version='scenario-N') queried only the
# (empty, pre-fork) scenario-version Distribution rows. The union-aware walker
# falls back to anchor edges for any source the scenario hasn't forked.
# ---------------------------------------------------------------------------

@pytest.fixture
def cost_allocation_with_upstream(db, author_person):
    """ent_src receives 50% of an upstream's cost; scenario touches BTC only.

    Topology:
        ent_up (annual_cost=80k) --50%--> ent_src (annual_cost=100k)
        ent_src.to_business_pct = 50%
        BTCProfile on ent_src (year=2026, manual, active):
          cl_a → 100%

    ent_src effective_cost (anchor) = 100k + 80k*0.5 = 140k
    to_business_value = 140k * 0.5 = 70k → cl_a anchor_amount = 70k
    """
    cl_a = ChargingLocation(id="cl-up-a", code="CL-UP-A", name="Up Loc A")
    cl_b = ChargingLocation(id="cl-up-b", code="CL-UP-B", name="Up Loc B")
    db.add_all([cl_a, cl_b])

    ent_up = ChargeableEntity(
        id="ent-up", entity_type="InternalService", identifier="ITF00200",
        name="Upstream Service", annual_cost=Decimal("80000"),
        to_business_pct=Decimal("0"),
    )
    ent_src = ChargeableEntity(
        id="ent-src-up", entity_type="Offering", identifier="IT00S200",
        name="Source Offering With Upstream", annual_cost=Decimal("100000"),
        to_business_pct=Decimal("50"),
    )
    db.add_all([ent_up, ent_src])
    db.flush()

    active_version = DistributionVersion(
        active_from=date(2025, 1, 1), status="active",
        rationale="seed", origin="seed", scenario_id=None,
    )
    db.add(active_version)
    db.flush()

    # Upstream → ent_src 50% (production version).
    db.add(Distribution(
        version_id=active_version.id,
        source_entity_id="ent-up", destination_entity_id="ent-src-up",
        percentage=Decimal("50"),
    ))

    profile = BTCProfile(
        entity_id="ent-src-up", year=2026, mode="manual", status="active",
    )
    db.add(profile)
    db.flush()
    db.add(BTCProfileLine(
        profile_id=profile.id, charging_location_id="cl-up-a",
        percentage=Decimal("100"),
    ))

    scenario = Scenario(
        name="BTC-only Scenario (upstream test)",
        author_id=author_person.id, status="private",
        anchor_distribution_version_id=active_version.id,
    )
    db.add(scenario)
    db.commit()
    db.refresh(scenario)
    return {
        "scenario_id": scenario.id,
        "ent_src_id": "ent-src-up",
        "ent_up_id": "ent-up",
        "cl_a_id": "cl-up-a",
        "cl_b_id": "cl-up-b",
        "active_version_id": active_version.id,
        "year": 2026,
    }


class TestUnionAwareEffectiveCost:
    """Regression coverage for the BTC-only scenario inflow-loss bug."""

    def test_btc_only_scenario_preserves_upstream_inflows(
        self, db, cost_allocation_with_upstream,
    ):
        """Anchor and scenario totals must balance when only BTC was touched.

        Before fix: compute_effective_cost(version='scenario-N') ignored
        anchor edges for unforked sources, so the scenario side computed
        100k*0.5=50k while the anchor side computed 140k*0.5=70k — a phantom
        -20k delta caused by losing the upstream inflow rather than by any
        real change. After fix: both sides see 140k effective cost; only the
        intentional BTC line shift drives the per-location delta.
        """
        # Replace 100/0 with 0/100 — pure cl_a→cl_b BTC swap, no inflow change.
        apply_btc_lines_change(
            db, cost_allocation_with_upstream["scenario_id"],
            entity_id="ent-src-up", year=2026,
            lines=[{"charging_location_id": "cl-up-b", "percentage": 100.0}],
        )
        db.commit()

        out = compute_cost_allocation_impact(
            db, cost_allocation_with_upstream["scenario_id"], year=2026,
        )
        # Both sides must agree on the to_business value (140k * 0.5 = 70k);
        # delta must net to zero across the BTC swap.
        assert out["totals"]["anchor_total"] == 70000.0
        assert out["totals"]["scenario_total"] == 70000.0
        assert out["totals"]["delta"] == 0.0

        items = {(i["entity_id"], i["charging_location_id"]): i for i in out["items"]}
        # cl_a: 70k → 0 (delta -70k)
        assert items[("ent-src-up", "cl-up-a")]["anchor_amount"] == 70000.0
        assert items[("ent-src-up", "cl-up-a")]["scenario_amount"] == 0.0
        assert items[("ent-src-up", "cl-up-a")]["delta"] == -70000.0
        # cl_b: 0 → 70k (delta +70k)
        assert items[("ent-src-up", "cl-up-b")]["anchor_amount"] == 0.0
        assert items[("ent-src-up", "cl-up-b")]["scenario_amount"] == 70000.0
        assert items[("ent-src-up", "cl-up-b")]["delta"] == 70000.0

    def test_btc_overlay_with_partial_stage1_fork_uses_scenario_edges(
        self, db, cost_allocation_with_upstream,
    ):
        """When Stage 1 IS forked, scenario must use scenario edges for
        forked sources and anchor edges for unforked sources (union)."""
        sid = cost_allocation_with_upstream["scenario_id"]

        # 1) Fork the upstream edge and reduce 50% → 20% so inflow drops by 24k.
        #    New inflow contribution = 80k * 0.20 = 16k → ent_src eff = 116k.
        from services.scenario_cost_allocation import (
            apply_distribution_update,
        )
        anchor_edge = (
            db.query(Distribution)
            .filter(
                Distribution.version_id == cost_allocation_with_upstream["active_version_id"],
                Distribution.source_entity_id == "ent-up",
            )
            .one()
        )
        apply_distribution_update(db, sid, edge_id=anchor_edge.id, percentage=20.0)
        db.commit()

        out = compute_cost_allocation_impact(db, sid, year=2026)
        # Both ent-src AND ent-up are touched (dest of edge change). ent-up
        # has no BTC profile so contributes no per-loc rows. ent-src:
        #   anchor: 140k * 0.5 = 70k → cl_a 70k
        #   scenario: 116k * 0.5 = 58k → cl_a 58k (BTC unchanged at 100/0)
        # cl_a delta = -12k.
        assert out["touched_entity_count"] == 2
        items = {(i["entity_id"], i["charging_location_id"]): i for i in out["items"]}
        assert items[("ent-src-up", "cl-up-a")]["anchor_amount"] == 70000.0
        assert items[("ent-src-up", "cl-up-a")]["scenario_amount"] == 58000.0
        assert items[("ent-src-up", "cl-up-a")]["delta"] == -12000.0


# ---------------------------------------------------------------------------
# Mixed Stage-1 + Stage-2 — MDH rebalance balance re-verification
#
# The seeded "MDH BTC Rebalance" demo scenario shifts both the Stage-1
# distribution AND the Stage-2 BTC split. This class guards the invariant
# the lead flagged: after BOTH stages are mutated, the per-charging-location
# totals must still balance (Σ scenario per-location amounts for an entity ==
# its scenario effective cost × to_business%), the union-aware effective-cost
# walk must use scenario edges for forked sources and anchor edges for
# unforked ones, and the live distribution/BTC rows must never be touched.
# ---------------------------------------------------------------------------

class TestMixedStageMDHBalance:
    """Re-verify MDH-style balance after a combined Stage-1 + Stage-2 edit."""

    def _balance_for_entity(self, out, entity_id):
        """Sum the scenario per-location amounts surfaced for one entity."""
        return round(
            sum(
                i["scenario_amount"]
                for i in out["items"]
                if i["entity_id"] == entity_id
            ),
            2,
        )

    def test_stage1_edge_and_stage2_btc_balance_and_union_aware(
        self, db, cost_allocation_with_upstream,
    ):
        """Mutate Stage 1 (upstream edge %) AND Stage 2 (BTC split) together.

        Topology (from the fixture):
            ent-up (80k) --50%--> ent-src-up (100k, to_business 50%)
            BTCProfile on ent-src-up: cl-up-a 100%

        Anchor:  eff = 100k + 80k*0.50 = 140k; to_business = 70k;
                 BTC 100/0  → cl-a 70k, cl-b 0.

        Mixed scenario:
            Stage 1 — drop the upstream edge 50% → 25%
                      eff (union-aware) = 100k + 80k*0.25 = 120k
            Stage 2 — BTC 100/0 → 40/60
                      to_business = 120k*0.5 = 60k → cl-a 24k, cl-b 36k.

        The scenario side must use the FORKED upstream edge (25%), proving the
        union walk consumed the scenario edge rather than the stale anchor 50%.
        """
        sid = cost_allocation_with_upstream["scenario_id"]
        anchor_version_id = cost_allocation_with_upstream["active_version_id"]

        # Stage 1: fork + reduce the upstream edge.
        anchor_edge = (
            db.query(Distribution)
            .filter(
                Distribution.version_id == anchor_version_id,
                Distribution.source_entity_id == "ent-up",
            )
            .one()
        )
        apply_distribution_update(db, sid, edge_id=anchor_edge.id, percentage=25.0)
        # Stage 2: rebalance the BTC split (still sums to 100).
        apply_btc_lines_change(
            db, sid, entity_id="ent-src-up", year=2026,
            lines=[
                {"charging_location_id": "cl-up-a", "percentage": 40.0},
                {"charging_location_id": "cl-up-b", "percentage": 60.0},
            ],
        )
        db.commit()

        out = compute_cost_allocation_impact(db, sid, year=2026)
        items = {(i["entity_id"], i["charging_location_id"]): i for i in out["items"]}

        # Anchor side (unchanged): 140k eff, 70k to_business, 100/0 split.
        assert items[("ent-src-up", "cl-up-a")]["anchor_amount"] == 70000.0
        assert items[("ent-src-up", "cl-up-b")]["anchor_amount"] == 0.0
        # Scenario side: union-aware 120k eff, 60k to_business, 40/60 split.
        assert items[("ent-src-up", "cl-up-a")]["scenario_amount"] == 24000.0
        assert items[("ent-src-up", "cl-up-b")]["scenario_amount"] == 36000.0
        # Deltas.
        assert items[("ent-src-up", "cl-up-a")]["delta"] == -46000.0
        assert items[("ent-src-up", "cl-up-b")]["delta"] == 36000.0

        # --- MDH balance re-verification --------------------------------
        # Per-location scenario amounts must reconcile to eff × to_business%.
        # eff = 120k, to_business = 50% → 60k total to-business value.
        assert self._balance_for_entity(out, "ent-src-up") == 60000.0
        # Anchor side balances independently: 140k × 50% = 70k.
        anchor_balance = round(
            sum(
                i["anchor_amount"]
                for i in out["items"]
                if i["entity_id"] == "ent-src-up"
            ),
            2,
        )
        assert anchor_balance == 70000.0
        # Grand totals reconcile.
        assert out["totals"]["anchor_total"] == 70000.0
        assert out["totals"]["scenario_total"] == 60000.0
        assert out["totals"]["delta"] == -10000.0

    def test_mixed_edit_does_not_mutate_live_rows(self, db, cost_allocation_with_upstream):
        """Invariant 2: the live anchor edge and live BTC lines are never
        mutated by a combined Stage-1 + Stage-2 sandbox edit."""
        sid = cost_allocation_with_upstream["scenario_id"]
        anchor_version_id = cost_allocation_with_upstream["active_version_id"]
        anchor_edge = (
            db.query(Distribution)
            .filter(
                Distribution.version_id == anchor_version_id,
                Distribution.source_entity_id == "ent-up",
            )
            .one()
        )
        apply_distribution_update(db, sid, edge_id=anchor_edge.id, percentage=25.0)
        apply_btc_lines_change(
            db, sid, entity_id="ent-src-up", year=2026,
            lines=[
                {"charging_location_id": "cl-up-a", "percentage": 40.0},
                {"charging_location_id": "cl-up-b", "percentage": 60.0},
            ],
        )
        db.commit()

        # Live anchor edge still 50%.
        live_edge = (
            db.query(Distribution).filter(Distribution.id == anchor_edge.id).one()
        )
        assert float(live_edge.percentage) == 50.0
        # Live BTC lines still cl-up-a 100% (single line).
        live_lines = (
            db.query(BTCProfileLine)
            .join(BTCProfile, BTCProfileLine.profile_id == BTCProfile.id)
            .filter(BTCProfile.entity_id == "ent-src-up")
            .all()
        )
        pct_map = {
            line.charging_location_id: float(line.percentage)
            for line in live_lines
        }
        assert pct_map == {"cl-up-a": 100.0}


# ---------------------------------------------------------------------------
# Union-aware CASCADE (Simulator S3 boundary waiver)
#
# The Stage-1 distribution editor reloads via `cascade_query.query_cascade_chain`.
# In sandbox mode it is called with an `anchor_version_id`, switching the walk
# + effective-cost to the same union-of-forked-vs-anchor rule as the impact
# preview, so the editor shows its own forked/added edges with correct EUR
# amounts. These tests lock both the sandbox behaviour AND the guarantee that
# the canonical (anchor=None) path is unchanged.
# ---------------------------------------------------------------------------

class TestUnionAwareCascade:
    """`query_cascade_chain` under the sandbox union rule + canonical guard."""

    def _add_sandbox_destination(self, db, sid):
        """Add a new sandbox edge ent-src-up -> ent-x (20%). Forks the focal's
        outgoing set (empty in anchor) and creates the sandbox version, while
        leaving the focal's UPSTREAM source (ent-up) un-forked."""
        ent_x = ChargeableEntity(
            id="ent-x", entity_type="InternalService", identifier="ITF00900",
            name="New Sink", annual_cost=Decimal("0"), to_business_pct=Decimal("0"),
        )
        db.add(ent_x)
        db.commit()
        apply_distribution_create(
            db, sid, year=2026,
            source_entity_id="ent-src-up", destination_entity_id="ent-x",
            percentage=20.0,
        )
        db.commit()

    def test_sandbox_cascade_preserves_unforked_upstream_inflow(
        self, db, cost_allocation_with_upstream,
    ):
        """Focal effective cost must include the anchor inflow from an
        UN-forked upstream source (the exact bug class). ent-up was never
        forked, yet ent-src-up must still cost out at 140k (own 100k + anchor
        inflow 80k*0.5), and the newly-added sandbox edge must appear."""
        from services import cascade_query
        from services.scenario_cost_allocation import resolve_sandbox_and_anchor

        sid = cost_allocation_with_upstream["scenario_id"]
        self._add_sandbox_destination(db, sid)
        sv_id, anchor_id = resolve_sandbox_and_anchor(db, sid)
        assert sv_id is not None and anchor_id is not None

        result = cascade_query.query_cascade_chain(
            db, "ent-src-up", version_id=sv_id, anchor_version_id=anchor_id,
        )
        # Union-aware: anchor inflow from un-forked ent-up is preserved.
        assert result.focal.effective_cost == 140000.0
        assert "ent-up" in {n.entity_id for n in result.upstream}
        # The added sandbox destination is WYSIWYG-visible.
        assert "ent-x" in {n.entity_id for n in result.downstream}
        assert any(
            e.source_entity_id == "ent-src-up" and e.destination_entity_id == "ent-x"
            for e in result.edges
        )

    def test_naive_single_version_walk_loses_inflow_without_anchor(
        self, db, cost_allocation_with_upstream,
    ):
        """Contrast guard: querying the SPARSE sandbox version withOUT an
        anchor (anchor_version_id=None) loses the un-forked upstream inflow —
        100k own only. This is precisely why the union path exists; if a
        future refactor dropped the anchor arg this asserts the regression."""
        from services import cascade_query
        from services.scenario_cost_allocation import resolve_sandbox_and_anchor

        sid = cost_allocation_with_upstream["scenario_id"]
        self._add_sandbox_destination(db, sid)
        sv_id, _ = resolve_sandbox_and_anchor(db, sid)

        result = cascade_query.query_cascade_chain(
            db, "ent-src-up", version_id=sv_id, anchor_version_id=None,
        )
        assert result.focal.effective_cost == 100000.0

    def test_canonical_cascade_unchanged_ignores_sandbox(
        self, db, cost_allocation_with_upstream,
    ):
        """The canonical (production) cascade must be unaffected by sandbox
        edits: focal still 140k via the anchor edge, upstream still ent-up,
        and the sandbox-only ent-x edge must NOT leak into the production
        cascade."""
        from services import cascade_query
        from services.scenario_cost_allocation import resolve_sandbox_and_anchor

        sid = cost_allocation_with_upstream["scenario_id"]
        self._add_sandbox_destination(db, sid)
        _, anchor_id = resolve_sandbox_and_anchor(db, sid)

        result = cascade_query.query_cascade_chain(
            db, "ent-src-up", version_id=anchor_id,  # anchor_version_id=None
        )
        assert result.focal.effective_cost == 140000.0
        assert "ent-up" in {n.entity_id for n in result.upstream}
        assert "ent-x" not in {n.entity_id for n in result.downstream}
        assert not any(e.destination_entity_id == "ent-x" for e in result.edges)


# ---------------------------------------------------------------------------
# Anchor pinning — FD-3 OQ #3
# ---------------------------------------------------------------------------

class TestAnchorPinning:
    """``Scenario.anchor_distribution_version_id`` pins the production anchor.

    When NULL, ``_resolve_anchor_version_id`` falls back to the latest
    production active version (resolve-by-date). When set, that pinned id is
    used regardless of subsequent activations — production reactivations
    cannot shift impact deltas underneath an open scenario.
    """

    def test_pinned_anchor_used_when_set(self, db, cost_allocation_world):
        # Activate a NEWER production version with a different edge percentage.
        newer = DistributionVersion(
            active_from=date(2026, 3, 1), status="active",
            rationale="newer", origin="copy_active",
            copied_from_version_id=cost_allocation_world["active_version_id"],
            scenario_id=None,
        )
        db.add(newer)
        db.flush()
        db.add(Distribution(
            version_id=newer.id,
            source_entity_id="ent-src", destination_entity_id="ent-dst",
            percentage=Decimal("80"),
        ))
        db.commit()

        # Scenario is anchored to the OLDER version (50%); the listing must
        # reflect 50%, not the newer 80%.
        rows = list_scenario_edges(
            db, cost_allocation_world["scenario_id"], "ent-src",
        )
        assert len(rows) == 1
        assert float(rows[0].percentage) == 50.0

    def test_legacy_null_anchor_falls_back_to_resolver(
        self, db, author_person,
    ):
        # Create an active version + an edge, then a scenario WITHOUT
        # ``anchor_distribution_version_id`` (legacy v4-era contract).
        ent_a = ChargeableEntity(
            id="anchor-src", entity_type="Offering", identifier="IT00S300",
            name="Anchor Src", annual_cost=Decimal("50000"),
            to_business_pct=Decimal("0"),
        )
        ent_b = ChargeableEntity(
            id="anchor-dst", entity_type="InternalService", identifier="ITF00300",
            name="Anchor Dst", annual_cost=Decimal("0"),
            to_business_pct=Decimal("0"),
        )
        db.add_all([ent_a, ent_b])
        db.flush()

        av = DistributionVersion(
            active_from=date(2025, 1, 1), status="active",
            rationale="seed", origin="seed", scenario_id=None,
        )
        db.add(av)
        db.flush()
        db.add(Distribution(
            version_id=av.id,
            source_entity_id="anchor-src", destination_entity_id="anchor-dst",
            percentage=Decimal("25"),
        ))

        legacy_scenario = Scenario(
            name="Legacy Scenario (no pinned anchor)",
            author_id=author_person.id, status="private",
            anchor_distribution_version_id=None,
        )
        db.add(legacy_scenario)
        db.commit()

        rows = list_scenario_edges(db, legacy_scenario.id, "anchor-src")
        assert len(rows) == 1
        assert float(rows[0].percentage) == 25.0


# ---------------------------------------------------------------------------
# Cleanup on scenario delete
# ---------------------------------------------------------------------------

class TestCleanupCostAllocationState:
    def test_cleanup_removes_scenario_distributions(self, db, cost_allocation_world):
        apply_distribution_update(
            db, cost_allocation_world["scenario_id"],
            edge_id=cost_allocation_world["edge_id"], percentage=40.0,
        )
        db.commit()
        sv = _scenario_dist_version(db, cost_allocation_world["scenario_id"])
        assert sv is not None
        before = db.query(Distribution).filter(Distribution.version_id == sv.id).count()
        assert before == 1

        n = cleanup_cost_allocation_state(db, cost_allocation_world["scenario_id"])
        db.commit()
        assert n == 1
        # Header gone too — cascade removes child edges.
        assert (
            db.query(DistributionVersion)
            .filter(DistributionVersion.scenario_id == cost_allocation_world["scenario_id"])
            .first()
        ) is None

    def test_cleanup_does_not_touch_anchor(self, db, cost_allocation_world):
        apply_distribution_update(
            db, cost_allocation_world["scenario_id"],
            edge_id=cost_allocation_world["edge_id"], percentage=40.0,
        )
        db.commit()
        cleanup_cost_allocation_state(db, cost_allocation_world["scenario_id"])
        db.commit()
        anchor_count = (
            db.query(Distribution)
            .filter(Distribution.version_id == cost_allocation_world["active_version_id"])
            .count()
        )
        assert anchor_count == 1

    def test_cleanup_with_no_sandbox_is_noop(self, db, cost_allocation_world):
        """When no mutations occurred, there's no sandbox version to clean."""
        n = cleanup_cost_allocation_state(db, cost_allocation_world["scenario_id"])
        assert n == 0
