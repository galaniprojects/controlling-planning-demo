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
                        end="2026-12", status="active"):
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
