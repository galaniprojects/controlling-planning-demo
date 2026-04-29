"""Unit tests for services/scenario_promote.py — Promote workflow.

Per [B-PR-01..06] [B-OQ-01] [F-AC-01]:
- Anchor must equal latest cycle.
- Selective per-diff routing.
- Lever 12 promotion gated by RolePermissionGrant.
- Audit row recorded.
"""

import json
from datetime import datetime
from decimal import Decimal

import pytest

from models.charging import (
    BTCProfile, BTCProfileLine, ChargeableEntity, ChargingLocation, Distribution,
)
from models.financial import ForecastVersion
from models.people import Person
from models.scenarios import Scenario, ScenarioAction, ScenarioPromotion
from models.system import RolePermissionGrant
from schemas.common import CurrentUser
from services.scenario_lever12 import (
    ACTION_BTC_LINE_CHANGE,
    ACTION_DISTRIBUTION_CHANGE,
    ACTION_TO_BUSINESS_CHANGE,
    LEVER12_CATEGORY,
    apply_btc_lines_change,
    apply_distribution_create,
    apply_to_business_change,
    scenario_version,
)
from services.scenario_promote import (
    PromoteError,
    apply_routing,
    assert_anchor_is_latest_cycle,
    decide_routing,
    execute_promote,
    preview_promote,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def author_person(db, seed_org_base):
    p = Person(
        id="p-promoter", name="Promoter",
        role_type_id="role-dev", cost_center_id="cc-muc-dev",
        competence_center_id="comp-dev",
    )
    db.add(p)
    db.commit()
    return p


@pytest.fixture
def controller_user_obj():
    return CurrentUser(
        user_id="persona-controller", person_id="p-promoter",
        name="Promoter", role="controller",
        cost_center_id=None, project_ids=[],
    )


@pytest.fixture
def cycle_anchor(db, author_person):
    """A 'cycle' ForecastVersion + a Scenario anchored to it."""
    fv = ForecastVersion(
        project_id=None, version_number=1, version_type="cycle",
        cycle_label="Q1 2026", created_by_id="p-promoter",
        granularity_boundary_months=12, planning_horizon_months=60,
    )
    # FK on project_id is required — create a placeholder project
    from models.projects import Project
    p = Project(id="p-anchor", name="Anchor Project", status="active",
                capex_opex="capex", start_month="2025-01", end_month="2026-12")
    db.add(p)
    db.flush()
    fv.project_id = "p-anchor"
    db.add(fv)
    db.flush()

    scenario = Scenario(
        name="Promote Scenario", author_id="p-promoter", status="private",
        anchor_forecast_version_id=fv.id,
    )
    db.add(scenario)
    db.commit()
    return {"version_id": fv.id, "scenario_id": scenario.id}


@pytest.fixture
def lever12_promote_world(db, author_person, cycle_anchor):
    """Scenario with anchor + Stage 1/Stage 2 mutations ready to promote."""
    cl = ChargingLocation(id="cl-x", code="CL-X", name="Loc X")
    db.add(cl)
    ent = ChargeableEntity(
        id="ent-promote", entity_type="Offering", identifier="IT00S999",
        name="Promote Entity", annual_cost=Decimal("50000"),
        to_business_pct=Decimal("0"),
    )
    db.add(ent)
    db.commit()
    scenario_id = cycle_anchor["scenario_id"]
    apply_to_business_change(
        db, scenario_id, entity_id="ent-promote", year=2026, new_pct=10.0,
    )
    apply_btc_lines_change(
        db, scenario_id, entity_id="ent-promote", year=2026,
        lines=[{"charging_location_id": "cl-x", "percentage": 100.0}],
    )
    db.commit()
    return {**cycle_anchor, "ent_id": "ent-promote", "cl_id": "cl-x"}


# ---------------------------------------------------------------------------
# Pre-flight check
# ---------------------------------------------------------------------------

class TestAssertAnchorIsLatestCycle:
    def test_no_anchor_raises(self, db, author_person):
        sc = Scenario(name="x", author_id="p-promoter", status="private")
        db.add(sc)
        db.commit()
        with pytest.raises(PromoteError) as exc:
            assert_anchor_is_latest_cycle(db, sc)
        assert "rebase" in (exc.value.hint or "")

    def test_matching_anchor_passes(self, db, cycle_anchor):
        sc = db.query(Scenario).filter_by(id=cycle_anchor["scenario_id"]).first()
        anchor, latest = assert_anchor_is_latest_cycle(db, sc)
        assert anchor.id == cycle_anchor["version_id"]
        assert latest.id == cycle_anchor["version_id"]

    def test_stale_anchor_raises(self, db, cycle_anchor):
        # Create a newer cycle version
        from models.financial import ForecastVersion
        fv2 = ForecastVersion(
            project_id="p-anchor", version_number=2, version_type="cycle",
            cycle_label="Q2 2026", created_by_id="p-promoter",
            granularity_boundary_months=12, planning_horizon_months=60,
        )
        db.add(fv2)
        db.commit()
        sc = db.query(Scenario).filter_by(id=cycle_anchor["scenario_id"]).first()
        with pytest.raises(PromoteError) as exc:
            assert_anchor_is_latest_cycle(db, sc)
        assert exc.value.hint == "rebase"


# ---------------------------------------------------------------------------
# Routing decisions
# ---------------------------------------------------------------------------

class TestDecideRouting:
    def test_lever12_routing(self, db, lever12_promote_world):
        actions = (
            db.query(ScenarioAction)
            .filter(ScenarioAction.scenario_id == lever12_promote_world["scenario_id"])
            .all()
        )
        for a in actions:
            d = decide_routing(db, a, controller_user_id="p-promoter")
            assert d.routing_type == "cost_allocation_update"

    def test_forecast_grid_own_project(self, db, author_person):
        from models.projects import Project
        p = Project(id="p-own", name="Own", status="active", capex_opex="opex",
                    start_month="2026-01", end_month="2026-12",
                    pl_person_id="p-promoter")
        db.add(p)
        db.commit()
        a = ScenarioAction(
            scenario_id=1, action_order=1, scope="project",
            action_type="reduce_budget", project_id="p-own",
            lever_category="forecast_grid", tier=1,
        )
        d = decide_routing(db, a, controller_user_id="p-promoter")
        assert d.routing_type == "direct_forecast_update"

    def test_forecast_grid_other_pl_routes_to_cr(self, db, author_person):
        from models.projects import Project
        # Use a different person for "other PL"
        other = Person(
            id="p-other", name="Other PL",
            role_type_id="role-dev", cost_center_id="cc-muc-dev",
            competence_center_id="comp-dev",
        )
        db.add(other)
        p = Project(id="p-foreign", name="Foreign", status="active",
                    capex_opex="opex", start_month="2026-01", end_month="2026-12",
                    pl_person_id="p-other")
        db.add(p)
        db.commit()
        a = ScenarioAction(
            scenario_id=1, action_order=1, scope="project",
            action_type="reduce_budget", project_id="p-foreign",
            lever_category="forecast_grid", tier=1,
        )
        d = decide_routing(db, a, controller_user_id="p-promoter")
        assert d.routing_type == "change_request"
        assert d.requires_review is True

    def test_unknown_category_routes_to_no_route(self, db):
        a = ScenarioAction(
            scenario_id=1, action_order=1, scope="portfolio",
            action_type="mystery_action", lever_category="something_new",
            tier=1,
        )
        d = decide_routing(db, a, controller_user_id="p-promoter")
        assert d.routing_type == "no_route"


# ---------------------------------------------------------------------------
# Lever 12 permission gating per [F-AC-01]
# ---------------------------------------------------------------------------

class TestLever12Permission:
    def test_controller_can_always_promote(self, db, lever12_promote_world,
                                            controller_user_obj):
        actions = (
            db.query(ScenarioAction)
            .filter(ScenarioAction.scenario_id == lever12_promote_world["scenario_id"])
            .all()
        )
        for a in actions:
            decision = decide_routing(db, a, controller_user_id="p-promoter")
            ok, msg = apply_routing(db, a, decision, controller_user_obj)
            assert ok, f"controller should promote {a.action_type}: {msg}"
        db.commit()

    def test_pl_without_grant_blocked(self, db, lever12_promote_world):
        pl_user = CurrentUser(
            user_id="persona-pl", person_id="p-pl",
            name="PL", role="project_lead",
        )
        # No RolePermissionGrant exists, so PL should be blocked.
        actions = (
            db.query(ScenarioAction)
            .filter(ScenarioAction.scenario_id == lever12_promote_world["scenario_id"])
            .all()
        )
        for a in actions:
            decision = decide_routing(db, a, controller_user_id="p-promoter")
            ok, msg = apply_routing(db, a, decision, pl_user)
            assert not ok
            assert "permission denied" in msg

    def test_pl_with_grant_can_promote_btc(self, db, lever12_promote_world):
        pl_user = CurrentUser(
            user_id="persona-pl", person_id="p-pl",
            name="PL", role="project_lead",
        )
        # Grant project_lead btc_profile edit access
        db.add(RolePermissionGrant(
            role="project_lead", entity_type="btc_profile", can_edit=True,
        ))
        db.commit()
        actions = (
            db.query(ScenarioAction)
            .filter(
                ScenarioAction.scenario_id == lever12_promote_world["scenario_id"],
                ScenarioAction.action_type == ACTION_BTC_LINE_CHANGE,
            )
            .all()
        )
        for a in actions:
            decision = decide_routing(db, a, controller_user_id="p-promoter")
            ok, msg = apply_routing(db, a, decision, pl_user)
            assert ok, msg
        db.commit()


# ---------------------------------------------------------------------------
# Promote execution end-to-end
# ---------------------------------------------------------------------------

class TestExecutePromote:
    def test_promotes_lever12_actions(self, db, lever12_promote_world,
                                      controller_user_obj):
        result = execute_promote(
            db, lever12_promote_world["scenario_id"],
            user=controller_user_obj,
        )
        db.commit()
        assert result["promoted_count"] >= 2
        assert result["skipped_count"] == 0
        # Audit row recorded
        promo = (
            db.query(ScenarioPromotion)
            .filter(ScenarioPromotion.scenario_id == lever12_promote_world["scenario_id"])
            .first()
        )
        assert promo is not None
        assert promo.promoted_count >= 2

    def test_lever12_to_business_materialized_on_live_entity(
        self, db, lever12_promote_world, controller_user_obj,
    ):
        execute_promote(
            db, lever12_promote_world["scenario_id"],
            user=controller_user_obj,
        )
        db.commit()
        live = (
            db.query(ChargeableEntity)
            .filter_by(id=lever12_promote_world["ent_id"])
            .first()
        )
        assert float(live.to_business_pct) == 10.0

    def test_lever12_btc_lines_materialized(
        self, db, lever12_promote_world, controller_user_obj,
    ):
        execute_promote(
            db, lever12_promote_world["scenario_id"],
            user=controller_user_obj,
        )
        db.commit()
        profile = (
            db.query(BTCProfile)
            .filter(
                BTCProfile.entity_id == lever12_promote_world["ent_id"],
                BTCProfile.year == 2026,
            )
            .first()
        )
        assert profile is not None
        lines = db.query(BTCProfileLine).filter(
            BTCProfileLine.profile_id == profile.id,
        ).all()
        assert len(lines) == 1
        assert float(lines[0].percentage) == 100.0
        assert lines[0].charging_location_id == lever12_promote_world["cl_id"]

    def test_promoted_actions_marked(self, db, lever12_promote_world,
                                     controller_user_obj):
        execute_promote(
            db, lever12_promote_world["scenario_id"],
            user=controller_user_obj,
        )
        db.commit()
        actions = (
            db.query(ScenarioAction)
            .filter(ScenarioAction.scenario_id == lever12_promote_world["scenario_id"])
            .all()
        )
        for a in actions:
            assert a.promoted_at is not None
            assert a.promoted_by_id == "p-promoter"

    def test_partial_promote_via_action_ids(
        self, db, lever12_promote_world, controller_user_obj,
    ):
        actions = (
            db.query(ScenarioAction)
            .filter(ScenarioAction.scenario_id == lever12_promote_world["scenario_id"])
            .order_by(ScenarioAction.action_order)
            .all()
        )
        assert len(actions) >= 2
        # Promote only the first action
        result = execute_promote(
            db, lever12_promote_world["scenario_id"],
            action_ids=[actions[0].id], user=controller_user_obj,
        )
        db.commit()
        assert result["promoted_count"] == 1
        # First action marked, second not.
        db.refresh(actions[0])
        db.refresh(actions[1])
        assert actions[0].promoted_at is not None
        assert actions[1].promoted_at is None

    def test_stale_anchor_blocks_promote(
        self, db, lever12_promote_world, controller_user_obj,
    ):
        from models.financial import ForecastVersion
        fv2 = ForecastVersion(
            project_id="p-anchor", version_number=2, version_type="cycle",
            cycle_label="Q2 2026", created_by_id="p-promoter",
            granularity_boundary_months=12, planning_horizon_months=60,
        )
        db.add(fv2)
        db.commit()
        with pytest.raises(PromoteError) as exc:
            execute_promote(
                db, lever12_promote_world["scenario_id"],
                user=controller_user_obj,
            )
        assert exc.value.hint == "rebase"


class TestPreviewPromote:
    def test_returns_decisions(self, db, lever12_promote_world, controller_user_obj):
        out = preview_promote(
            db, lever12_promote_world["scenario_id"], user=controller_user_obj,
        )
        assert out["scenario_id"] == lever12_promote_world["scenario_id"]
        assert len(out["decisions"]) >= 2
        for d in out["decisions"]:
            assert d["routing_type"] == "cost_allocation_update"
            assert d["permission_ok"] is True
