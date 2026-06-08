"""Unit tests for services/scenario_engine.py."""

import json

import pytest
from unittest.mock import patch

from models.capacity import Allocation
from models.financial import Baseline, Forecast
from models.organization import ProjectGroupingAssignment
from models.people import RateTable
from models.projects import Project
from models.scenarios import Scenario, ScenarioAction
from services.scenario_engine import (
    _ACTION_ALIASES,
    _apply_action,
    _apply_portfolio_action,
    _apply_project_action,
    _build_time_frame_breakdown,
    _uplift_forecast_by_category,
    get_scenario_state,
    recalculate_scenario,
)


# ---------------------------------------------------------------------------
# Pure function
# ---------------------------------------------------------------------------

class TestBuildTimeFrameBreakdown:
    @patch("services.scenario_engine._CY", 2026)
    def test_single_year(self):
        orig = {2026: 1000.0}
        adj = {2026: 900.0}
        result = _build_time_frame_breakdown(orig, adj)
        # CY segment + Overall
        assert len(result) == 2
        assert result[0]["label"] == "CY"
        assert result[0]["original"] == 1000.0
        assert result[0]["adjusted"] == 900.0
        assert result[0]["delta"] == -100.0
        assert result[1]["label"] == "Overall"

    @patch("services.scenario_engine._CY", 2026)
    def test_multi_year(self):
        orig = {2026: 1000.0, 2027: 500.0}
        adj = {2026: 900.0, 2027: 500.0}
        result = _build_time_frame_breakdown(orig, adj)
        # CY + 2027 + Overall
        assert len(result) == 3
        assert result[0]["label"] == "CY"
        assert result[1]["label"] == "2027"
        assert result[2]["label"] == "Overall"
        assert result[2]["original"] == 1500.0

    @patch("services.scenario_engine._CY", 2026)
    def test_empty(self):
        result = _build_time_frame_breakdown({}, {})
        # Only the Overall segment
        assert len(result) == 1
        assert result[0]["label"] == "Overall"
        assert result[0]["original"] == 0.0

    @patch("services.scenario_engine._CY", 2026)
    def test_excludes_past_years(self):
        orig = {2025: 500.0, 2026: 1000.0}
        adj = {2025: 500.0, 2026: 900.0}
        result = _build_time_frame_breakdown(orig, adj)
        # Should only include 2026 + Overall (2025 < _CY is excluded from segments)
        labels = [s["label"] for s in result]
        assert "2025" not in labels
        # But Overall includes all years
        assert result[-1]["original"] == 1500.0


class TestActionAliases:
    def test_known_aliases(self):
        assert _ACTION_ALIASES["defer_project"] == "delay_project"
        assert _ACTION_ALIASES["delay"] == "delay_project"
        assert _ACTION_ALIASES["remove"] == "remove_project"


# ---------------------------------------------------------------------------
# Project-scoped actions (DB-dependent)
# ---------------------------------------------------------------------------

def _make_working_state(project_id="proj-1", budget=10000.0, baseline=9000.0,
                        lob_id="lob-alpha", is_service=False, start="2025-01",
                        end="2026-12", status="active",
                        transformation_level=None, project_type=None):
    return {
        project_id: {
            "name": "Test Project",
            "original_budget": budget,
            "adjusted_budget": budget,
            "baseline": baseline,
            "rag": "green",
            "lob_id": lob_id,
            "is_service": is_service,
            "is_affected": False,
            "start": start,
            "end": end,
            "status": status,
            # A0 — enriched working-state fields (sim no-op lever fix)
            "transformation_level": transformation_level,
            "project_type": project_type,
        }
    }


@patch("services.scenario_engine.DEMO_DATE", "2026-04")
class TestApplyProjectActions:
    def test_remove_project(self, db, seed_org_base, create_test_project):
        create_test_project("proj-1")
        working = _make_working_state()
        _apply_action(db, working, "remove_project", "project", "proj-1", {})
        assert working["proj-1"]["adjusted_budget"] == 0
        assert working["proj-1"]["is_affected"] is True

    def test_reduce_budget_percentage(self, db, seed_org_base, create_test_project):
        create_test_project("proj-1")
        working = _make_working_state(budget=10000.0)
        _apply_action(db, working, "reduce_budget", "project", "proj-1", {"percentage": 10})
        assert working["proj-1"]["adjusted_budget"] == pytest.approx(9000.0)

    def test_increase_budget(self, db, seed_org_base, create_test_project):
        create_test_project("proj-1")
        working = _make_working_state(budget=10000.0)
        _apply_action(db, working, "increase_budget", "project", "proj-1", {"amount": 5000})
        assert working["proj-1"]["adjusted_budget"] == 15000.0

    def test_pause_project(self, db, seed_org_base, create_test_project):
        create_test_project("proj-1", months=["2026-04", "2026-05", "2026-06"],
                            forecast_amt=1000)
        working = _make_working_state(budget=3000.0)
        _apply_action(db, working, "pause_project", "project", "proj-1",
                      {"start_month": "2026-04"})
        # Should reduce by total forecast from 2026-04 onward
        assert working["proj-1"]["adjusted_budget"] < 3000.0

    def test_delay_project(self, db, seed_org_base, create_test_project):
        create_test_project("proj-1", months=["2026-05", "2026-06", "2026-07"],
                            forecast_amt=1000)
        working = _make_working_state(budget=10000.0)
        _apply_action(db, working, "delay_project", "project", "proj-1",
                      {"months": 2})
        # First 2 future months' forecast should be freed
        assert working["proj-1"]["adjusted_budget"] < 10000.0

    def test_cut_consulting(self, db, seed_org_base, create_test_project):
        create_test_project("proj-1")
        working = _make_working_state(budget=10000.0)
        _apply_action(db, working, "cut_consulting", "project", "proj-1",
                      {"percentage": 50})
        # Should cut 30% * 50% = 15% of budget
        assert working["proj-1"]["adjusted_budget"] == pytest.approx(8500.0)

    def test_change_allocation_add(self, db, seed_org_base, create_test_project):
        create_test_project("proj-1")
        # Need a rate table entry
        db.add(RateTable(
            role_type_id="role-dev", competence_center_id="comp-dev",
            hourly_rate=100.0, effective_date="2025-01-01",
        ))
        db.commit()
        working = _make_working_state(budget=10000.0)
        _apply_action(db, working, "change_allocation", "project", "proj-1", {
            "role_type_id": "role-dev", "action": "add",
            "hours_per_month": 40,
            "start_month": "2026-05", "end_month": "2026-07",
        })
        # 40 hrs * 100 EUR * 3 months = 12000 added
        assert working["proj-1"]["adjusted_budget"] == pytest.approx(22000.0)

    def test_alias_defer_project(self, db, seed_org_base, create_test_project):
        create_test_project("proj-1", months=["2026-05", "2026-06"],
                            forecast_amt=500)
        working = _make_working_state(budget=5000.0)
        _apply_action(db, working, "defer_project", "project", "proj-1",
                      {"months": 1})
        # Should work same as delay_project
        assert working["proj-1"]["adjusted_budget"] < 5000.0


# ---------------------------------------------------------------------------
# Portfolio-scoped actions
# ---------------------------------------------------------------------------

@patch("services.scenario_engine.DEMO_DATE", "2026-04")
class TestApplyPortfolioActions:
    def test_across_the_board_cut(self, db, seed_org_base, create_test_project):
        create_test_project("proj-1")
        create_test_project("proj-2", name="P2")
        working = {
            **_make_working_state("proj-1", 10000),
            **_make_working_state("proj-2", 20000),
        }
        _apply_portfolio_action(db, working, "across_the_board_cut", {"percentage": 10})
        assert working["proj-1"]["adjusted_budget"] == pytest.approx(9000.0)
        assert working["proj-2"]["adjusted_budget"] == pytest.approx(18000.0)

    def test_reduce_lob(self, db, seed_org_base, create_test_project):
        create_test_project("proj-1")
        create_test_project("proj-2", name="P2")
        working = {
            "proj-1": {**_make_working_state("proj-1")["proj-1"], "lob_id": "lob-alpha"},
            "proj-2": {**_make_working_state("proj-2")["proj-2"], "lob_id": "lob-beta"},
        }
        _apply_portfolio_action(db, working, "reduce_lob",
                                {"lob_id": "lob-alpha", "percentage": 20})
        assert working["proj-1"]["adjusted_budget"] == pytest.approx(8000.0)
        assert working["proj-2"]["adjusted_budget"] == 10000.0  # Unaffected

    def test_freeze_new_starts(self, db, seed_org_base):
        working = {
            "proj-old": {
                "name": "Old", "original_budget": 5000, "adjusted_budget": 5000,
                "baseline": 4000, "rag": "green", "lob_id": "", "is_service": False,
                "is_affected": False, "start": "2025-01", "end": "2026-12", "status": "active",
            },
            "proj-new": {
                "name": "New", "original_budget": 3000, "adjusted_budget": 3000,
                "baseline": 3000, "rag": "green", "lob_id": "", "is_service": False,
                "is_affected": False, "start": "2026-06", "end": "2027-06", "status": "active",
            },
        }
        _apply_portfolio_action(db, working, "freeze_new_starts",
                                {"cutoff_month": "2026-04"})
        assert working["proj-old"]["adjusted_budget"] == 5000  # Not frozen
        assert working["proj-new"]["adjusted_budget"] == 0  # Frozen

    def test_cut_by_type_service(self, db, seed_org_base):
        working = {
            "proj-1": {
                "name": "Project", "original_budget": 10000, "adjusted_budget": 10000,
                "baseline": 9000, "rag": "green", "lob_id": "", "is_service": False,
                "is_affected": False, "start": "2025-01", "end": "2026-12", "status": "active",
            },
            "svc-1": {
                "name": "Service", "original_budget": 5000, "adjusted_budget": 5000,
                "baseline": 5000, "rag": "green", "lob_id": "", "is_service": True,
                "is_affected": False, "start": "2025-01", "end": None, "status": "active",
            },
        }
        _apply_portfolio_action(db, working, "cut_by_type",
                                {"target_type": "service", "reduction_pct": 20})
        assert working["proj-1"]["adjusted_budget"] == 10000  # Unaffected
        assert working["svc-1"]["adjusted_budget"] == pytest.approx(4000.0)


# ---------------------------------------------------------------------------
# Scenario lifecycle
# ---------------------------------------------------------------------------

@patch("services.scenario_engine.DEMO_DATE", "2026-04")
class TestRecalculateScenario:
    def test_basic_recalculate(self, db, seed_org_base, seed_hierarchy, create_test_project):
        create_test_project("proj-1", months=["2026-01", "2026-02", "2026-03"],
                            baseline_amt=1000, forecast_amt=1100)
        db.add(ProjectGroupingAssignment(
            project_id="proj-1", grouping_entity_id=seed_hierarchy["prog_one_id"],
        ))

        scenario = Scenario(
            name="Test", description="Test scenario",
            author_id="p-dev-1", status="private",
        )
        db.add(scenario)
        db.flush()

        action = ScenarioAction(
            scenario_id=scenario.id, action_order=1,
            scope="project", action_type="reduce_budget",
            project_id="proj-1",
            parameters_json=json.dumps({"percentage": 10}),
        )
        db.add(action)
        db.commit()

        result = recalculate_scenario(db, scenario, [action])
        assert result is not None
        assert "impact_dashboard" in result
        assert "project_states" in result
        dashboard = result["impact_dashboard"]
        assert dashboard["total_budget_delta"] < 0

    def test_no_active_projects(self, db, seed_org_base):
        scenario = Scenario(
            name="Empty", description="No projects",
            author_id="p-dev-1", status="private",
        )
        db.add(scenario)
        db.commit()
        result = recalculate_scenario(db, scenario, [])
        assert result["project_states"] == []
        assert result["impact_dashboard"]["total_budget_original"] == 0


@patch("services.scenario_engine.DEMO_DATE", "2026-04")
class TestGetScenarioState:
    def test_returns_none_for_missing(self, db):
        result = get_scenario_state(db, 9999)
        assert result is None

    def test_recalculates_when_no_snapshots(self, db, seed_org_base, seed_hierarchy,
                                            create_test_project):
        create_test_project("proj-1", months=["2026-01"],
                            baseline_amt=1000, forecast_amt=1000)
        db.add(ProjectGroupingAssignment(
            project_id="proj-1", grouping_entity_id=seed_hierarchy["prog_one_id"],
        ))
        scenario = Scenario(
            name="Test", author_id="p-dev-1", status="private",
        )
        db.add(scenario)
        db.commit()

        result = get_scenario_state(db, scenario.id)
        assert result is not None
        assert result["metadata"]["name"] == "Test"
        assert len(result["project_states"]) == 1


# ---------------------------------------------------------------------------
# Sim no-op lever fix — previously no-op portfolio/project levers (A1-A7)
# Each lever MUST move adjusted_budget (or, for reassign, re-bucket without a
# budget change). Tests are written against qa/CONTRACTS-sim-noop.md.
# ---------------------------------------------------------------------------

@patch("services.scenario_engine.DEMO_DATE", "2026-04")
class TestCutByHierarchy:
    """A1 — cut_by_hierarchy: reduce member projects of a hierarchy node
    (and its descendants), scoped via _get_projects_for_entity_recursive."""

    def test_cuts_only_member_projects(self, db, seed_org_base, seed_hierarchy,
                                       create_test_project):
        # proj-1 sits under prog-one (child of lob-alpha); proj-2 under lob-beta.
        create_test_project("proj-1")
        create_test_project("proj-2", name="P2")
        db.add(ProjectGroupingAssignment(
            project_id="proj-1", grouping_entity_id=seed_hierarchy["prog_one_id"],
        ))
        db.add(ProjectGroupingAssignment(
            project_id="proj-2", grouping_entity_id=seed_hierarchy["lob_beta_id"],
        ))
        db.commit()

        working = {
            **_make_working_state("proj-1", 10000),
            **_make_working_state("proj-2", 20000),
        }
        _apply_portfolio_action(db, working, "cut_by_hierarchy", {
            "hierarchy_node_id": seed_hierarchy["lob_alpha_id"],
            "percentage": 20,
        })
        # proj-1 is a (recursive) member of lob-alpha → cut 20%.
        assert working["proj-1"]["adjusted_budget"] == pytest.approx(8000.0)
        assert working["proj-1"]["is_affected"] is True
        # proj-2 is under lob-beta → untouched.
        assert working["proj-2"]["adjusted_budget"] == pytest.approx(20000.0)

    def test_unknown_node_is_noop(self, db, seed_org_base, seed_hierarchy,
                                  create_test_project):
        create_test_project("proj-1")
        db.add(ProjectGroupingAssignment(
            project_id="proj-1", grouping_entity_id=seed_hierarchy["prog_one_id"],
        ))
        db.commit()
        working = _make_working_state("proj-1", 10000)
        _apply_portfolio_action(db, working, "cut_by_hierarchy", {
            "hierarchy_node_id": "does-not-exist", "percentage": 50,
        })
        assert working["proj-1"]["adjusted_budget"] == pytest.approx(10000.0)


@patch("services.scenario_engine.DEMO_DATE", "2026-04")
class TestCutByTransformation:
    """A2 — cut_by_transformation: reduce projects whose transformation_level
    matches the target ("T0"/"T1"/"T2")."""

    def test_cuts_only_matching_level(self, db, seed_org_base):
        working = {
            **_make_working_state("proj-t1", 10000, transformation_level="T1"),
            **_make_working_state("proj-t0", 20000, transformation_level="T0"),
        }
        _apply_portfolio_action(db, working, "cut_by_transformation", {
            "transformation_level": "T1", "percentage": 25,
        })
        assert working["proj-t1"]["adjusted_budget"] == pytest.approx(7500.0)
        assert working["proj-t1"]["is_affected"] is True
        # T0 project untouched.
        assert working["proj-t0"]["adjusted_budget"] == pytest.approx(20000.0)

    def test_missing_level_is_noop(self, db, seed_org_base):
        working = _make_working_state("proj-1", 10000, transformation_level=None)
        _apply_portfolio_action(db, working, "cut_by_transformation", {
            "transformation_level": "T2", "percentage": 30,
        })
        assert working["proj-1"]["adjusted_budget"] == pytest.approx(10000.0)


@patch("services.scenario_engine.DEMO_DATE", "2026-04")
class TestAdjustRateTable:
    """A3 — adjust_rate_table: uplift category-scoped forecast cost by a
    percentage, optionally filtered by role/location."""

    def test_internal_scope_no_filter_uplifts(self, db, seed_org_base,
                                              create_test_project):
        # internal forecast 1000 x 3 months (2026-01..03), effective from 2026-01.
        create_test_project("proj-1", months=["2026-01", "2026-02", "2026-03"],
                            forecast_amt=1000)
        working = _make_working_state("proj-1", 10000)
        _apply_portfolio_action(db, working, "adjust_rate_table", {
            "rate_table_scope": "internal", "percentage": 10,
            "effective_month": "2026-01",
        })
        # uplift = sum(internal forecast >= 2026-01) * 10% = 3000 * 0.10 = 300
        assert working["proj-1"]["adjusted_budget"] == pytest.approx(10300.0)
        assert working["proj-1"]["is_affected"] is True

    def test_role_filter_scopes_uplift(self, db, seed_org_base, create_test_project):
        # CORRECTED scoping (CONTRACTS A3): the role_type_id for internal forecast
        # rows lives in Forecast.sub_category, so role scoping is precise on the
        # forecast rows — NO allocation join. proj-1 keeps sub_category='role-dev';
        # proj-2's internal rows are re-tagged to 'role-pm'.
        from models.financial import Forecast
        create_test_project("proj-1", months=["2026-01", "2026-02", "2026-03"],
                            forecast_amt=1000)
        create_test_project("proj-2", name="P2",
                            months=["2026-01", "2026-02", "2026-03"], forecast_amt=1000)
        db.query(Forecast).filter(Forecast.project_id == "proj-2").update(
            {Forecast.sub_category: "role-pm"}, synchronize_session=False)
        db.commit()
        working = {
            **_make_working_state("proj-1", 10000),
            **_make_working_state("proj-2", 10000),
        }
        _apply_portfolio_action(db, working, "adjust_rate_table", {
            "rate_table_scope": "internal", "role_type_id": "role-dev",
            "percentage": 10, "effective_month": "2026-01",
        })
        # Only proj-1's role-dev internal forecast is uplifted: 3000 * 10% = 300.
        assert working["proj-1"]["adjusted_budget"] == pytest.approx(10300.0)
        assert working["proj-2"]["adjusted_budget"] == pytest.approx(10000.0)

    def test_location_filter_scopes_uplift(self, db, seed_org_base, create_test_project):
        # CORRECTED scoping (CONTRACTS A3): location has no forecast-row signal, so
        # the project set is derived via CostCenter.location_id -> Person.cost_center_id
        # -> that person's allocated projects. p-dev-1 sits at loc-muc (cc-muc-dev)
        # and is allocated to proj-1; a second person at loc-ber is allocated to proj-2.
        from models.organization import Location, CostCenter
        from models.people import Person
        create_test_project("proj-1", months=["2026-01", "2026-02", "2026-03"],
                            forecast_amt=1000)
        create_test_project("proj-2", name="P2",
                            months=["2026-01", "2026-02", "2026-03"], forecast_amt=1000)
        db.add(Location(id="loc-ber", city="Berlin", country="Germany"))
        db.add(CostCenter(id="cc-ber", name="Berlin Dev", location_id="loc-ber",
                          competence_center_id="comp-dev"))
        db.add(Person(id="p-ber-1", name="Berlin Dev", role_type_id="role-dev",
                      cost_center_id="cc-ber", competence_center_id="comp-dev"))
        # loc-muc person on proj-1; loc-ber person on proj-2.
        db.add(Allocation(project_id="proj-1", person_id="p-dev-1",
                          month="2026-05", hours=40))
        db.add(Allocation(project_id="proj-2", person_id="p-ber-1",
                          month="2026-05", hours=40))
        db.commit()
        working = {
            **_make_working_state("proj-1", 10000),
            **_make_working_state("proj-2", 10000),
        }
        _apply_portfolio_action(db, working, "adjust_rate_table", {
            "rate_table_scope": "internal", "location_id": "loc-muc",
            "percentage": 10, "effective_month": "2026-01",
        })
        # loc-muc persons are allocated only to proj-1 → only proj-1 uplifted.
        assert working["proj-1"]["adjusted_budget"] == pytest.approx(10300.0)
        assert working["proj-2"]["adjusted_budget"] == pytest.approx(10000.0)

    def test_external_scope_role_filter_not_noop(self, db, seed_org_base,
                                                 create_test_project):
        # R2 (code-review): role_type_id lives in Forecast.sub_category for INTERNAL
        # rows only (external rows carry cost_type_id there). For external scope the
        # role filter must be ignored, not applied to the wrong column → silent
        # no-op. proj-1 gets an external forecast row of 2000.
        from models.financial import Forecast
        create_test_project("proj-1", months=["2026-01"], forecast_amt=1000)
        db.add(Forecast(project_id="proj-1", month="2026-01",
                        category="external", sub_category="EC-CONSULT",
                        amount_eur=2000))
        db.commit()
        working = _make_working_state("proj-1", 10000)
        _apply_portfolio_action(db, working, "adjust_rate_table", {
            "rate_table_scope": "external", "role_type_id": "role-dev",
            "percentage": 10, "effective_month": "2026-01",
        })
        # External forecast (2000) uplifted 10% = 200 — role filter ignored for
        # external scope, NOT a no-op.
        assert working["proj-1"]["adjusted_budget"] == pytest.approx(10200.0)
        assert working["proj-1"]["is_affected"] is True

    def test_uplift_no_matching_forecast_not_affected(self, db, seed_org_base,
                                                      create_test_project):
        # R3 (code-review): a project with no in-scope forecast must NOT be flagged
        # is_affected — that would inflate the affected-projects count.
        create_test_project("proj-1", months=["2026-01"], forecast_amt=1000)
        working = _make_working_state("proj-1", 10000)
        # sub_category that matches nothing → scoped sum is 0.
        _uplift_forecast_by_category(
            db, working, None, "internal", 10.0, "2026-01",
            sub_categories=["role-nonexistent"],
        )
        assert working["proj-1"]["adjusted_budget"] == pytest.approx(10000.0)
        assert working["proj-1"]["is_affected"] is False


@patch("services.scenario_engine.DEMO_DATE", "2026-04")
class TestChangeBudgetEnvelope:
    """A4 — change_budget_envelope: percent uplift per project, or absolute
    pro-rata so the scoped-year envelope sums to the target value."""

    def test_percent_mode(self, db, seed_org_base, create_test_project):
        # year-2026 forecast = 1000 x 3 = 3000.
        create_test_project("proj-1", months=["2026-01", "2026-02", "2026-03"],
                            forecast_amt=1000)
        working = _make_working_state("proj-1", 10000)
        _apply_portfolio_action(db, working, "change_budget_envelope", {
            "mode": "percent", "value": 10, "year": 2026,
        })
        # adjusted += scoped_year(3000) * 10% = 300
        assert working["proj-1"]["adjusted_budget"] == pytest.approx(10300.0)
        assert working["proj-1"]["is_affected"] is True

    def test_absolute_mode_prorata(self, db, seed_org_base, create_test_project):
        # Two projects each with year-2026 forecast 3000 → grand total 6000.
        create_test_project("proj-1", months=["2026-01", "2026-02", "2026-03"],
                            forecast_amt=1000)
        create_test_project("proj-2", name="P2",
                            months=["2026-01", "2026-02", "2026-03"], forecast_amt=1000)
        working = {
            **_make_working_state("proj-1", 10000),
            **_make_working_state("proj-2", 20000),
        }
        _apply_portfolio_action(db, working, "change_budget_envelope", {
            "mode": "absolute", "value": 12000, "year": 2026,
        })
        # ratio = 12000 / 6000 = 2; per project adjusted += scoped(3000) * (2 - 1)
        assert working["proj-1"]["adjusted_budget"] == pytest.approx(13000.0)
        assert working["proj-2"]["adjusted_budget"] == pytest.approx(23000.0)


@patch("services.scenario_engine.DEMO_DATE", "2026-04")
class TestInjectHypotheticalProject:
    """A5 — inject_hypothetical_project: add a synthetic working entry whose
    adjusted_budget == total_budget (so the portfolio delta == +total_budget)."""

    def test_injects_synthetic_project(self, db, seed_org_base):
        working = _make_working_state("proj-1", 10000)
        _apply_portfolio_action(db, working, "inject_hypothetical_project", {
            "name": "New Platform", "total_budget": 50000,
            "project_type": 2, "transformation_level": "T2",
        })
        key = "hypo-new-platform"
        assert key in working
        hypo = working[key]
        assert hypo["original_budget"] == 0
        assert hypo["adjusted_budget"] == pytest.approx(50000.0)
        assert hypo["baseline"] == 0
        assert hypo["is_affected"] is True
        assert hypo["project_type"] == 2
        assert hypo["transformation_level"] == "T2"
        # Existing project untouched.
        assert working["proj-1"]["adjusted_budget"] == pytest.approx(10000.0)

    def test_collision_gets_suffix(self, db, seed_org_base):
        working = {}
        for _ in range(2):
            _apply_portfolio_action(db, working, "inject_hypothetical_project", {
                "name": "New Platform", "total_budget": 1000,
                "project_type": 1, "transformation_level": "T0",
            })
        assert "hypo-new-platform" in working
        assert "hypo-new-platform-2" in working


@patch("services.scenario_engine.DEMO_DATE", "2026-04")
class TestReassignHierarchy:
    """A6 — reassign_hierarchy (project-scoped): NO budget change; resolves the
    target node to its top-level ancestor and stamps reassigned_node_id."""

    def test_sets_reassigned_node_without_budget_change(self, db, seed_org_base,
                                                        seed_hierarchy):
        working = _make_working_state("proj-1", 10000)
        before = working["proj-1"]["adjusted_budget"]
        _apply_project_action(db, working, "reassign_hierarchy", "proj-1", {
            "hierarchy_node_id": seed_hierarchy["prog_one_id"],
        })
        # prog-one resolves up to its top-level LoB ancestor (lob-alpha).
        assert working["proj-1"]["reassigned_node_id"] == seed_hierarchy["lob_alpha_id"]
        # No budget movement.
        assert working["proj-1"]["adjusted_budget"] == pytest.approx(before)
        assert working["proj-1"]["is_affected"] is True

    def test_top_level_node_resolves_to_itself(self, db, seed_org_base,
                                               seed_hierarchy):
        working = _make_working_state("proj-1", 10000)
        _apply_project_action(db, working, "reassign_hierarchy", "proj-1", {
            "hierarchy_node_id": seed_hierarchy["lob_beta_id"],
        })
        assert working["proj-1"]["reassigned_node_id"] == seed_hierarchy["lob_beta_id"]

    def test_unresolvable_node_is_not_set(self, db, seed_org_base, seed_hierarchy):
        # R4 (code-review): a node that does NOT resolve to a top-level-type node
        # (orphan: non-top type, no parent) must not be stored — otherwise the mix
        # dimension would split anchor (top-level) vs scenario (mid-level) for the
        # same project. The re-bucket is skipped; the project stays canonical.
        from models.organization import GroupingEntity
        db.add(GroupingEntity(id="orphan-prog", entity_type_id="get-prog",
                              name="Orphan Programme", parent_entity_id=None))
        db.commit()
        working = _make_working_state("proj-1", 10000)
        _apply_project_action(db, working, "reassign_hierarchy", "proj-1", {
            "hierarchy_node_id": "orphan-prog",
        })
        assert working["proj-1"].get("reassigned_node_id") is None


@patch("services.scenario_engine.DEMO_DATE", "2026-04")
class TestRateEscalationSurfaces:
    """A7 — rate_escalation surface-contract reconciliation. The surface payloads
    {pct, rate_scope} and {pct, from_month, category} must move the budget via
    forecast uplift; the catalogue per-person payload still works."""

    def test_surface_rate_scope(self, db, seed_org_base, create_test_project):
        # Forecasts from DEMO_DATE (2026-04) onward so from_month default catches them.
        create_test_project("proj-1", months=["2026-04", "2026-05", "2026-06"],
                            forecast_amt=1000)
        working = _make_working_state("proj-1", 10000)
        _apply_portfolio_action(db, working, "rate_escalation", {
            "pct": 10, "rate_scope": "internal",
        })
        # uplift = sum(internal forecast >= 2026-04) * 10% = 3000 * 0.10 = 300
        assert working["proj-1"]["adjusted_budget"] == pytest.approx(10300.0)
        assert working["proj-1"]["is_affected"] is True

    def test_surface_from_month_category(self, db, seed_org_base, create_test_project):
        create_test_project("proj-1", months=["2026-01", "2026-02", "2026-03"],
                            forecast_amt=1000)
        working = _make_working_state("proj-1", 10000)
        _apply_portfolio_action(db, working, "rate_escalation", {
            "pct": 10, "from_month": "2026-01", "category": "internal",
        })
        assert working["proj-1"]["adjusted_budget"] == pytest.approx(10300.0)

    def test_catalogue_per_person_path_still_works(self, db, seed_org_base,
                                                   create_test_project):
        # Catalogue payload: scope_type/scope_values drive the allocation-based path.
        create_test_project("proj-1")
        db.add(RateTable(
            role_type_id="role-dev", competence_center_id="comp-dev",
            hourly_rate=100.0, effective_date="2025-01-01",
        ))
        db.add(Allocation(
            project_id="proj-1", person_id="p-dev-1", month="2026-05", hours=40,
        ))
        db.commit()
        working = _make_working_state("proj-1", 10000)
        _apply_portfolio_action(db, working, "rate_escalation", {
            "scope_type": "role", "scope_values": ["role-dev"],
            "increase_pct": 5, "effective_month": "2026-04",
        })
        # 40 hrs * 100 EUR * 5% = 200 added.
        assert working["proj-1"]["adjusted_budget"] == pytest.approx(10200.0)
        assert working["proj-1"]["is_affected"] is True
