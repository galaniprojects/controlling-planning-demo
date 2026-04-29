"""Unit tests for services/scenario_impact.py — 8-dimension dashboard.

Per [B-ID-01..03] [B-AC-03]: server-side recalculation, Tier 3 redaction,
8 dimensions including Cluster F's cost_allocation widening.
"""

import pytest

from models.organization import ProjectGroupingAssignment
from models.scenarios import Scenario, ScenarioAction
from services.scenario_engine import recalculate_scenario
from services.scenario_impact import (
    TIER3_LEVER_CATEGORIES,
    compute_impact_dashboard,
    has_tier3_diffs,
    mark_recalculated,
)


# ---------------------------------------------------------------------------
# Tier 3 detection
# ---------------------------------------------------------------------------

class TestHasTier3Diffs:
    def test_no_actions(self, db):
        assert has_tier3_diffs([]) is False

    def test_tier3_lever_category(self, db):
        action = ScenarioAction(
            scenario_id=1, action_order=1, scope="portfolio",
            action_type="rate_escalation", lever_category="rate_table", tier=2,
        )
        assert has_tier3_diffs([action]) is True

    def test_tier3_explicit_flag(self, db):
        action = ScenarioAction(
            scenario_id=1, action_order=1, scope="portfolio",
            action_type="custom", lever_category="other", tier=3,
        )
        assert has_tier3_diffs([action]) is True

    def test_tier1_action(self, db):
        action = ScenarioAction(
            scenario_id=1, action_order=1, scope="project",
            action_type="reduce_budget", lever_category="forecast_grid", tier=1,
        )
        assert has_tier3_diffs([action]) is False

    def test_all_tier3_categories_recognized(self):
        assert TIER3_LEVER_CATEGORIES == {
            "people", "rate_table", "capacity_param", "restructuring",
        }


# ---------------------------------------------------------------------------
# Compute dashboard — full integration
# ---------------------------------------------------------------------------

@pytest.fixture
def basic_scenario(db, seed_personas, seed_hierarchy, create_test_project):
    """A scenario with one project + one reduce_budget action."""
    create_test_project("proj-i1", forecast_amt=1000)
    db.add(ProjectGroupingAssignment(
        project_id="proj-i1", grouping_entity_id=seed_hierarchy["prog_one_id"],
    ))

    sc = Scenario(name="Impact Test", author_id="p-dev-1", status="private")
    db.add(sc)
    db.flush()

    db.add(ScenarioAction(
        scenario_id=sc.id, action_order=1, scope="project",
        action_type="reduce_budget", project_id="proj-i1",
        parameters_json='{"percentage": 20}',
        lever_category="forecast_grid", tier=1,
    ))
    db.commit()
    return sc


class TestComputeImpactDashboard:
    def test_returns_8_dimensions_with_tier3(self, db, basic_scenario):
        actions = (
            db.query(ScenarioAction)
            .filter(ScenarioAction.scenario_id == basic_scenario.id)
            .all()
        )
        state = recalculate_scenario(db, basic_scenario, actions)
        dashboard = compute_impact_dashboard(
            db, basic_scenario.id, state, include_tier3=True,
            include_lever12=False,
        )
        assert dashboard["scenario_id"] == basic_scenario.id
        dim = dashboard["dimensions"]
        # 8 dimensions per [B-ID-01]
        for key in (
            "financial", "backlog_ranking", "capacity",
            "people", "outsourcing_ratio", "investment_mix",
            "running_cost", "change_summary",
        ):
            assert key in dim, f"missing dimension '{key}'"

    def test_people_dimension_redacted_for_non_tier3(self, db, basic_scenario):
        # Add a Tier 3 lever action
        db.add(ScenarioAction(
            scenario_id=basic_scenario.id, action_order=2, scope="portfolio",
            action_type="rate_escalation", lever_category="rate_table", tier=2,
            parameters_json='{"increase_pct": 5, "scope_type": "role", "scope_values": ["role-dev"]}',
        ))
        db.commit()

        actions = (
            db.query(ScenarioAction)
            .filter(ScenarioAction.scenario_id == basic_scenario.id)
            .all()
        )
        state = recalculate_scenario(db, basic_scenario, actions)

        dashboard = compute_impact_dashboard(
            db, basic_scenario.id, state, include_tier3=False,
            include_lever12=False,
        )
        people = dashboard["dimensions"]["people"]
        assert people.get("redacted") is True
        assert dashboard["tier3_content"] is True

    def test_financial_dimension_includes_capex_opex(self, db, basic_scenario):
        actions = (
            db.query(ScenarioAction)
            .filter(ScenarioAction.scenario_id == basic_scenario.id)
            .all()
        )
        state = recalculate_scenario(db, basic_scenario, actions)
        dashboard = compute_impact_dashboard(
            db, basic_scenario.id, state, include_tier3=True,
            include_lever12=False,
        )
        fin = dashboard["dimensions"]["financial"]
        assert "capex" in fin
        assert "opex" in fin
        for k in ("original", "adjusted", "delta"):
            assert k in fin["capex"]
            assert k in fin["opex"]

    def test_change_summary_lists_actions(self, db, basic_scenario):
        actions = (
            db.query(ScenarioAction)
            .filter(ScenarioAction.scenario_id == basic_scenario.id)
            .all()
        )
        state = recalculate_scenario(db, basic_scenario, actions)
        dashboard = compute_impact_dashboard(
            db, basic_scenario.id, state, include_tier3=True,
            include_lever12=False,
        )
        cs = dashboard["dimensions"]["change_summary"]
        assert cs["total_actions"] == 1
        assert "forecast_grid" in cs["by_category"]

    def test_unknown_scenario_returns_empty(self, db):
        # Should not raise
        result = compute_impact_dashboard(
            db, 999999, {}, include_tier3=True, include_lever12=False,
        )
        assert result == {}


class TestMarkRecalculated:
    def test_stamps_timestamp_and_tier3_flag(self, db, basic_scenario):
        # Add a Tier 3 action to set the flag.
        db.add(ScenarioAction(
            scenario_id=basic_scenario.id, action_order=2, scope="portfolio",
            action_type="rate_escalation", lever_category="rate_table", tier=2,
        ))
        db.commit()

        assert basic_scenario.last_recalculated_at is None
        mark_recalculated(db, basic_scenario.id)
        db.commit()
        db.refresh(basic_scenario)
        assert basic_scenario.last_recalculated_at is not None
        assert basic_scenario.tier3_content_flag is True
