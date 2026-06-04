"""Unit tests for services/scenario_promote.py — Promote workflow.

Per [B-PR-01..06] [B-OQ-01] [F-AC-01]:
- Anchor must equal latest cycle.
- Selective per-diff routing.
- Cost allocation promotion gated by RolePermissionGrant.
- Audit row recorded.
"""

import json
from datetime import datetime
from decimal import Decimal

import pytest

from models.change_requests import ChangeRequest, CRChangeDetail
from models.charging import (
    BTCProfile, BTCProfileLine, ChargeableEntity, ChargingLocation, Distribution,
)
from models.financial import Forecast, ForecastVersion
from models.people import Person
from models.projects import Project
from models.scenarios import (
    Scenario, ScenarioAction, ScenarioForecastCellEdit, ScenarioPromotion,
)
from models.system import RolePermissionGrant
from schemas.common import CurrentUser
from services.scenario_cost_allocation import (
    ACTION_BTC_LINE_CHANGE,
    ACTION_DISTRIBUTION_CHANGE,
    ACTION_TO_BUSINESS_CHANGE,
    COST_ALLOCATION_CATEGORY,
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
    p = Project(id="p-anchor", name="Anchor Project", pipeline_stage="Active",
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
def cost_allocation_promote_world(db, author_person, cycle_anchor):
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
    def test_cost_allocation_routing(self, db, cost_allocation_promote_world):
        actions = (
            db.query(ScenarioAction)
            .filter(ScenarioAction.scenario_id == cost_allocation_promote_world["scenario_id"])
            .all()
        )
        for a in actions:
            d = decide_routing(db, a, controller_user_id="p-promoter")
            assert d.routing_type == "cost_allocation_update"

    def test_forecast_grid_own_project(self, db, author_person):
        from models.projects import Project
        p = Project(id="p-own", name="Own", pipeline_stage="Active", capex_opex="opex",
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
        p = Project(id="p-foreign", name="Foreign", pipeline_stage="Active",
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
# Cost allocation permission gating per [F-AC-01]
# ---------------------------------------------------------------------------

class TestCostAllocationPermission:
    def test_controller_can_always_promote(self, db, cost_allocation_promote_world,
                                            controller_user_obj):
        actions = (
            db.query(ScenarioAction)
            .filter(ScenarioAction.scenario_id == cost_allocation_promote_world["scenario_id"])
            .all()
        )
        for a in actions:
            decision = decide_routing(db, a, controller_user_id="p-promoter")
            ok, msg = apply_routing(db, a, decision, controller_user_obj)
            assert ok, f"controller should promote {a.action_type}: {msg}"
        db.commit()

    def test_pl_without_grant_blocked(self, db, cost_allocation_promote_world):
        pl_user = CurrentUser(
            user_id="persona-pl", person_id="p-pl",
            name="PL", role="project_lead",
        )
        # No RolePermissionGrant exists, so PL should be blocked.
        actions = (
            db.query(ScenarioAction)
            .filter(ScenarioAction.scenario_id == cost_allocation_promote_world["scenario_id"])
            .all()
        )
        for a in actions:
            decision = decide_routing(db, a, controller_user_id="p-promoter")
            ok, msg = apply_routing(db, a, decision, pl_user)
            assert not ok
            assert "permission denied" in msg

    def test_pl_with_grant_can_promote_btc(self, db, cost_allocation_promote_world):
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
                ScenarioAction.scenario_id == cost_allocation_promote_world["scenario_id"],
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
    def test_promotes_cost_allocation_actions(self, db, cost_allocation_promote_world,
                                      controller_user_obj):
        result = execute_promote(
            db, cost_allocation_promote_world["scenario_id"],
            user=controller_user_obj,
        )
        db.commit()
        assert result["promoted_count"] >= 2
        assert result["skipped_count"] == 0
        # Audit row recorded
        promo = (
            db.query(ScenarioPromotion)
            .filter(ScenarioPromotion.scenario_id == cost_allocation_promote_world["scenario_id"])
            .first()
        )
        assert promo is not None
        assert promo.promoted_count >= 2

    def test_cost_allocation_to_business_materialized_on_live_entity(
        self, db, cost_allocation_promote_world, controller_user_obj,
    ):
        execute_promote(
            db, cost_allocation_promote_world["scenario_id"],
            user=controller_user_obj,
        )
        db.commit()
        live = (
            db.query(ChargeableEntity)
            .filter_by(id=cost_allocation_promote_world["ent_id"])
            .first()
        )
        assert float(live.to_business_pct) == 10.0

    def test_cost_allocation_btc_lines_materialized(
        self, db, cost_allocation_promote_world, controller_user_obj,
    ):
        execute_promote(
            db, cost_allocation_promote_world["scenario_id"],
            user=controller_user_obj,
        )
        db.commit()
        profile = (
            db.query(BTCProfile)
            .filter(
                BTCProfile.entity_id == cost_allocation_promote_world["ent_id"],
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
        assert lines[0].charging_location_id == cost_allocation_promote_world["cl_id"]

    def test_promoted_actions_marked(self, db, cost_allocation_promote_world,
                                     controller_user_obj):
        execute_promote(
            db, cost_allocation_promote_world["scenario_id"],
            user=controller_user_obj,
        )
        db.commit()
        actions = (
            db.query(ScenarioAction)
            .filter(ScenarioAction.scenario_id == cost_allocation_promote_world["scenario_id"])
            .all()
        )
        for a in actions:
            assert a.promoted_at is not None
            assert a.promoted_by_id == "p-promoter"

    def test_partial_promote_via_action_ids(
        self, db, cost_allocation_promote_world, controller_user_obj,
    ):
        actions = (
            db.query(ScenarioAction)
            .filter(ScenarioAction.scenario_id == cost_allocation_promote_world["scenario_id"])
            .order_by(ScenarioAction.action_order)
            .all()
        )
        assert len(actions) >= 2
        # Promote only the first action
        result = execute_promote(
            db, cost_allocation_promote_world["scenario_id"],
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
        self, db, cost_allocation_promote_world, controller_user_obj,
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
                db, cost_allocation_promote_world["scenario_id"],
                user=controller_user_obj,
            )
        assert exc.value.hint == "rebase"


class TestPreviewPromote:
    def test_returns_decisions(self, db, cost_allocation_promote_world, controller_user_obj):
        out = preview_promote(
            db, cost_allocation_promote_world["scenario_id"], user=controller_user_obj,
        )
        assert out["scenario_id"] == cost_allocation_promote_world["scenario_id"]
        assert len(out["decisions"]) >= 2
        for d in out["decisions"]:
            assert d["routing_type"] == "cost_allocation_update"
            assert d["permission_ok"] is True


# ---------------------------------------------------------------------------
# Macro curve shifts written to live forecast on promote (review finding #4)
# ---------------------------------------------------------------------------

def _macro_project(db, pid, pl_person_id, cells):
    """A project + internal forecast cells. ``cells`` = {month: amount_eur}."""
    db.add(Project(
        id=pid, name=pid, pipeline_stage="Active", capex_opex="opex",
        start_month=min(cells), end_month=max(cells), pl_person_id=pl_person_id,
    ))
    for month, amt in cells.items():
        db.add(Forecast(
            project_id=pid, month=month, category="internal",
            sub_category="role-dev", role_type_id=None, amount_eur=amt, hours=10.0,
        ))
    db.flush()


class TestMacroPromote:
    def test_delay_own_project_writes_shifted_curve(self, db, cycle_anchor,
                                                    controller_user_obj):
        # p-promoter (the controller) owns the project → own → direct write.
        _macro_project(db, "p-mac", "p-promoter", {"2026-06": 1000.0, "2026-07": 1000.0})
        db.add(ScenarioAction(
            scenario_id=cycle_anchor["scenario_id"], action_order=1,
            scope="project", action_type="delay_project", project_id="p-mac",
            parameters_json='{"delay_months": 2}', lever_category="forecast_grid",
        ))
        db.commit()

        result = execute_promote(
            db, cycle_anchor["scenario_id"], user=controller_user_obj,
        )
        db.commit()

        def at(month):
            return (
                db.query(Forecast)
                .filter(Forecast.project_id == "p-mac", Forecast.month == month)
                .first()
            )
        # Vacated months are gone; the curve moved +2 (total preserved).
        assert at("2026-06") is None
        assert at("2026-07") is None
        assert float(at("2026-08").amount_eur) == 1000.0
        assert float(at("2026-09").amount_eur) == 1000.0
        # The macro action was stamped promoted.
        assert result["promoted_count"] >= 1
        macro = [s for s in result["summary"] if s["target_id"] == "p-mac"]
        assert macro and macro[0]["routing_type"] == "direct_forecast_update"

    def test_delay_other_pl_routes_to_change_request_no_write(self, db, cycle_anchor,
                                                              controller_user_obj):
        _macro_project(db, "p-mac-f", "p-someone-else", {"2026-06": 500.0})
        db.add(ScenarioAction(
            scenario_id=cycle_anchor["scenario_id"], action_order=1,
            scope="project", action_type="delay_project", project_id="p-mac-f",
            parameters_json='{"delay_months": 2}', lever_category="forecast_grid",
        ))
        db.commit()

        result = execute_promote(
            db, cycle_anchor["scenario_id"], user=controller_user_obj,
        )
        db.commit()

        # Other-PL macro → change request, NOT written: original cell untouched,
        # no shifted cell created.
        orig = (
            db.query(Forecast)
            .filter(Forecast.project_id == "p-mac-f", Forecast.month == "2026-06")
            .first()
        )
        assert orig is not None and float(orig.amount_eur) == 500.0
        assert (
            db.query(Forecast)
            .filter(Forecast.project_id == "p-mac-f", Forecast.month == "2026-08")
            .first()
        ) is None
        mac = [s for s in result["summary"] if s["target_id"] == "p-mac-f"]
        assert mac and mac[0]["routing_type"] == "change_request"

        # F8: the other-PL diff is now routed to a DRAFT CR authored by the
        # project's PL (it no longer silently vanishes).
        crs = (
            db.query(ChangeRequest)
            .filter(ChangeRequest.project_id == "p-mac-f")
            .all()
        )
        assert crs, "expected at least one draft CR for the other-PL project"
        for cr in crs:
            assert cr.status == "draft"
            assert cr.submitted_by_id == "p-someone-else"  # the project's PL
            assert cr.source_scenario_id == cycle_anchor["scenario_id"]
        details = (
            db.query(CRChangeDetail)
            .filter(CRChangeDetail.change_request_id.in_([c.id for c in crs]))
            .all()
        )
        assert details, "expected CRChangeDetail rows on the draft CR(s)"

    def test_macro_plus_overlay_written_once(self, db, cycle_anchor,
                                             controller_user_obj):
        # A project with BOTH a macro and an overlay cell edit must be written
        # once via the macro route (overlay folded into the resolved grid), with
        # no double-count from the overlay route.
        _macro_project(db, "p-mac-ov", "p-promoter", {"2026-06": 1000.0})
        sid = cycle_anchor["scenario_id"]
        db.add(ScenarioAction(
            scenario_id=sid, action_order=1, scope="project",
            action_type="delay_project", project_id="p-mac-ov",
            parameters_json='{"delay_months": 1}', lever_category="forecast_grid",
        ))
        # Absolute-month overlay edit on 2026-08 (does not travel under the macro).
        db.add(ScenarioForecastCellEdit(
            scenario_id=sid, project_id="p-mac-ov", line_key="internal|role-dev|",
            month="2026-08", field="amount_eur", value=4242.0,
        ))
        db.commit()

        result = execute_promote(db, sid, user=controller_user_obj)
        db.commit()

        rows = (
            db.query(Forecast)
            .filter(Forecast.project_id == "p-mac-ov",
                    Forecast.sub_category == "role-dev")
            .all()
        )
        by_month = {r.month: float(r.amount_eur) for r in rows}
        # Exactly one row per month (no double-write); the shifted cell at 2026-07
        # and the absolute overlay at 2026-08 both present.
        assert len(rows) == len(by_month)
        assert by_month.get("2026-07") == 1000.0   # 2026-06 shifted +1
        assert by_month.get("2026-08") == 4242.0   # overlay, did not travel
        assert "2026-06" not in by_month            # vacated
        # Only one promote summary entry targets the project (no overlay-route dup).
        targets = [s for s in result["summary"] if s["target_id"] == "p-mac-ov"]
        assert len(targets) == 1


# ---------------------------------------------------------------------------
# F8: other-PL forecast diffs route to a DRAFT Change Request (no silent drop)
# ---------------------------------------------------------------------------

class TestPromoteOtherPLDraftCR:
    def test_other_pl_creates_one_draft_cr_per_cost_center(
        self, db, cycle_anchor, controller_user_obj, seed_org_base,
    ):
        """A delayed other-PL project staffed across two cost centres produces one
        draft CR per cost centre, authored by the project's PL."""
        from models.capacity import Allocation
        from models.organization import CostCenter
        from models.people import Person

        # Two cost centres, two people in different roles/CCs.
        db.add_all([
            CostCenter(id="cc-a", name="CC A", location_id="loc-muc",
                       competence_center_id="comp-dev"),
            CostCenter(id="cc-b", name="CC B", location_id="loc-muc",
                       competence_center_id="comp-dev"),
        ])
        db.add_all([
            Person(id="p-r1", name="Role One", role_type_id="role-dev",
                   cost_center_id="cc-a", competence_center_id="comp-dev"),
            Person(id="p-r2", name="Role Two", role_type_id="role-pm",
                   cost_center_id="cc-b", competence_center_id="comp-dev"),
        ])
        # Project owned by a different PL → other-PL routing.
        db.add(Project(
            id="p-multi", name="Multi CC", pipeline_stage="Active",
            capex_opex="opex", start_month="2026-06", end_month="2026-07",
            pl_person_id="p-other-pl",
        ))
        # Two internal forecast lines (role-dev, role-pm), one per cost centre.
        for month in ("2026-06", "2026-07"):
            db.add(Forecast(
                project_id="p-multi", month=month, category="internal",
                sub_category="role-dev", role_type_id=None,
                amount_eur=1000.0, hours=10.0,
            ))
            db.add(Forecast(
                project_id="p-multi", month=month, category="internal",
                sub_category="role-pm", role_type_id=None,
                amount_eur=2000.0, hours=10.0,
            ))
        # Allocations so the factory maps each role to its cost centre.
        db.add_all([
            Allocation(person_id="p-r1", project_id="p-multi", month="2026-06",
                       hours=10.0),
            Allocation(person_id="p-r2", project_id="p-multi", month="2026-06",
                       hours=10.0),
        ])
        db.add(ScenarioAction(
            scenario_id=cycle_anchor["scenario_id"], action_order=1,
            scope="project", action_type="delay_project", project_id="p-multi",
            parameters_json='{"delay_months": 2}', lever_category="forecast_grid",
        ))
        db.commit()

        execute_promote(db, cycle_anchor["scenario_id"], user=controller_user_obj)
        db.commit()

        crs = (
            db.query(ChangeRequest)
            .filter(ChangeRequest.project_id == "p-multi")
            .all()
        )
        # One CR per distinct cost centre (cc-a, cc-b).
        assert len(crs) == 2
        assert {cr.status for cr in crs} == {"draft"}
        assert {cr.submitted_by_id for cr in crs} == {"p-other-pl"}
        cc_ids = {
            d.line_item_type for cr in crs for d in cr.change_details
        }
        assert "role-dev" in cc_ids and "role-pm" in cc_ids

    def test_rerun_does_not_duplicate_draft_crs(
        self, db, cycle_anchor, controller_user_obj, seed_org_base,
    ):
        """Re-running execute_promote replaces (not duplicates) the prior draft
        CRs for the project (factory dedupe via source_scenario_id)."""
        sid = cycle_anchor["scenario_id"]
        db.add(Project(
            id="p-ov-f", name="Overlay Foreign", pipeline_stage="Active",
            capex_opex="opex", start_month="2026-06", end_month="2026-06",
            pl_person_id="p-other-pl",
        ))
        db.add(Forecast(
            project_id="p-ov-f", month="2026-06", category="internal",
            sub_category="role-dev", role_type_id=None,
            amount_eur=1000.0, hours=10.0,
        ))
        # Overlay edit changes the hours → a real diff (internal lines diff on
        # hours; no macro action).
        db.add(ScenarioForecastCellEdit(
            scenario_id=sid, project_id="p-ov-f", line_key="internal|role-dev||",
            month="2026-06", field="hours", value=20.0,
        ))
        db.commit()

        execute_promote(db, sid, user=controller_user_obj)
        db.commit()
        first = (
            db.query(ChangeRequest)
            .filter(ChangeRequest.project_id == "p-ov-f")
            .all()
        )
        assert len(first) >= 1

        # Re-run: overlay route fires again (no actions consumed); dedupe replaces.
        execute_promote(db, sid, user=controller_user_obj)
        db.commit()
        second = (
            db.query(ChangeRequest)
            .filter(ChangeRequest.project_id == "p-ov-f")
            .all()
        )
        assert len(second) == len(first), "re-run must not duplicate draft CRs"

    def test_other_pl_empty_diff_creates_no_cr(
        self, db, cycle_anchor, controller_user_obj, seed_org_base,
    ):
        """An other-PL project whose overlay edit nets to no change creates no CR."""
        sid = cycle_anchor["scenario_id"]
        db.add(Project(
            id="p-ov-empty", name="Overlay Empty", pipeline_stage="Active",
            capex_opex="opex", start_month="2026-06", end_month="2026-06",
            pl_person_id="p-other-pl",
        ))
        db.add(Forecast(
            project_id="p-ov-empty", month="2026-06", category="internal",
            sub_category="role-dev", role_type_id=None,
            amount_eur=1000.0, hours=10.0,
        ))
        # Overlay edit sets the SAME hours → resolved diff is empty.
        db.add(ScenarioForecastCellEdit(
            scenario_id=sid, project_id="p-ov-empty",
            line_key="internal|role-dev||", month="2026-06",
            field="hours", value=10.0,
        ))
        db.commit()

        execute_promote(db, sid, user=controller_user_obj)
        db.commit()

        crs = (
            db.query(ChangeRequest)
            .filter(ChangeRequest.project_id == "p-ov-empty")
            .all()
        )
        assert crs == [], "empty diff must not create a change request"
