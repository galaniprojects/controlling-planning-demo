"""Unit tests for services/scenario_apply_forecast.py — PL Apply-to-forecast.

Per [B-PR-05] [B-OQ-02]:
- PL only.
- Only own-project diffs carried forward.
- Portfolio-level diffs left behind.
- Provenance: cells stamped is_provisional=True.
- Scenario not consumed.
"""

import pytest

from models.financial import Forecast
from models.scenarios import Scenario, ScenarioAction, ScenarioApplyToForecastEvent
from schemas.common import CurrentUser
from services.scenario_apply_forecast import (
    ApplyToForecastError,
    PL_FORECAST_CARRY_CATEGORIES,
    apply_to_forecast,
    is_pl_carry_eligible,
)


@pytest.fixture
def pl_user_obj():
    return CurrentUser(
        user_id="persona-pl", person_id="p-pm-1", name="PL One",
        role="project_lead", project_ids=["proj-own"],
    )


@pytest.fixture
def controller_user_obj():
    return CurrentUser(
        user_id="persona-controller", person_id="p-dev-1",
        name="Ctrl", role="controller",
    )


@pytest.fixture
def applyforecast_world(db, seed_org_base, create_test_project):
    """A scenario authored by the PL with a forecast_grid action on own project."""
    create_test_project("proj-own", forecast_amt=1000, pl_person_id="p-pm-1")
    create_test_project("proj-other", forecast_amt=1000, pl_person_id="p-dev-1")

    sc = Scenario(name="Apply Test", author_id="p-pm-1", status="private")
    db.add(sc)
    db.flush()

    db.add(ScenarioAction(
        scenario_id=sc.id, action_order=1, scope="project",
        action_type="reduce_budget", project_id="proj-own",
        parameters_json='{"percentage": 10}',
        lever_category="forecast_grid", tier=1,
    ))
    db.add(ScenarioAction(
        scenario_id=sc.id, action_order=2, scope="project",
        action_type="reduce_budget", project_id="proj-other",
        parameters_json='{"percentage": 10}',
        lever_category="forecast_grid", tier=1,
    ))
    db.add(ScenarioAction(
        scenario_id=sc.id, action_order=3, scope="portfolio",
        action_type="across_the_board_cut",
        parameters_json='{"percentage": 5}',
        lever_category="portfolio_rule", tier=2,
    ))
    db.commit()
    return {"scenario_id": sc.id}


# ---------------------------------------------------------------------------
# Eligibility filter
# ---------------------------------------------------------------------------

class TestIsPlCarryEligible:
    def test_own_project_forecast_grid(self):
        a = ScenarioAction(
            scenario_id=1, action_order=1, scope="project",
            action_type="reduce_budget", project_id="proj-own",
            lever_category="forecast_grid",
        )
        ok, _ = is_pl_carry_eligible(a, {"proj-own"})
        assert ok

    def test_other_project_blocked(self):
        a = ScenarioAction(
            scenario_id=1, action_order=1, scope="project",
            action_type="reduce_budget", project_id="proj-other",
            lever_category="forecast_grid",
        )
        ok, msg = is_pl_carry_eligible(a, {"proj-own"})
        assert not ok
        assert "not owned" in msg

    def test_portfolio_action_blocked(self):
        a = ScenarioAction(
            scenario_id=1, action_order=1, scope="portfolio",
            action_type="across_the_board_cut",
            lever_category="portfolio_rule",
        )
        ok, msg = is_pl_carry_eligible(a, {"proj-own"})
        assert not ok
        assert "non-project scope" in msg

    def test_unrecognized_category_blocked(self):
        a = ScenarioAction(
            scenario_id=1, action_order=1, scope="project",
            action_type="rate_escalation", project_id="proj-own",
            lever_category="rate_table",
        )
        ok, msg = is_pl_carry_eligible(a, {"proj-own"})
        assert not ok
        assert "not a PL-carry-forward" in msg

    def test_legacy_action_no_category(self):
        a = ScenarioAction(
            scenario_id=1, action_order=1, scope="project",
            action_type="delay_project", project_id="proj-own",
            lever_category=None,
        )
        ok, _ = is_pl_carry_eligible(a, {"proj-own"})
        assert ok

    def test_milestone_carries(self):
        a = ScenarioAction(
            scenario_id=1, action_order=1, scope="project",
            action_type="shift_milestone", project_id="proj-own",
            lever_category="milestone",
        )
        ok, _ = is_pl_carry_eligible(a, {"proj-own"})
        assert ok


# ---------------------------------------------------------------------------
# Top-level orchestrator
# ---------------------------------------------------------------------------

class TestApplyToForecast:
    def test_pl_only(self, db, applyforecast_world, controller_user_obj):
        with pytest.raises(ApplyToForecastError) as exc:
            apply_to_forecast(
                db, scenario_id=applyforecast_world["scenario_id"],
                user=controller_user_obj,
            )
        assert "PL-only" in exc.value.message

    def test_carries_own_project_only(self, db, applyforecast_world, pl_user_obj):
        result = apply_to_forecast(
            db, scenario_id=applyforecast_world["scenario_id"],
            user=pl_user_obj, cycle_id="cyc-1", cycle_label="Q3 2026",
        )
        db.commit()
        # 3 actions: 1 own (carried), 1 other (skipped), 1 portfolio (skipped)
        assert result["diffs_carried_forward"] == 1
        assert result["diffs_skipped"] == 2

    def test_provisional_cells_stamped(self, db, applyforecast_world, pl_user_obj):
        # Sanity: cells start non-provisional
        rows = (
            db.query(Forecast)
            .filter(Forecast.project_id == "proj-own")
            .all()
        )
        for r in rows:
            assert not r.is_provisional

        apply_to_forecast(
            db, scenario_id=applyforecast_world["scenario_id"],
            user=pl_user_obj,
        )
        db.commit()
        rows_after = (
            db.query(Forecast)
            .filter(Forecast.project_id == "proj-own")
            .all()
        )
        assert all(r.is_provisional for r in rows_after)

        # Other project's cells untouched
        other_rows = (
            db.query(Forecast)
            .filter(Forecast.project_id == "proj-other")
            .all()
        )
        for r in other_rows:
            assert not r.is_provisional

    def test_event_recorded(self, db, applyforecast_world, pl_user_obj):
        apply_to_forecast(
            db, scenario_id=applyforecast_world["scenario_id"],
            user=pl_user_obj, cycle_id="cyc-q3", cycle_label="Q3 2026",
        )
        db.commit()
        ev = (
            db.query(ScenarioApplyToForecastEvent)
            .filter(ScenarioApplyToForecastEvent.scenario_id == applyforecast_world["scenario_id"])
            .first()
        )
        assert ev is not None
        assert ev.cycle_id == "cyc-q3"
        assert ev.cycle_label == "Q3 2026"
        assert ev.diffs_carried_forward == 1

    def test_provenance_note_visible(self, db, applyforecast_world, pl_user_obj):
        result = apply_to_forecast(
            db, scenario_id=applyforecast_world["scenario_id"],
            user=pl_user_obj,
        )
        # Per [B-OQ-02] working assumption: provenance visible.
        assert "Provenance" in result["provenance_note"]
        assert "B-OQ-02" in result["provenance_note"]

    def test_unknown_scenario_raises(self, db, pl_user_obj):
        with pytest.raises(ApplyToForecastError):
            apply_to_forecast(db, scenario_id=999999, user=pl_user_obj)

    def test_pl_cannot_apply_others_private_scenario(self, db, pl_user_obj,
                                                      seed_org_base, create_test_project):
        from models.people import Person
        other = Person(
            id="p-other-author", name="Other Author",
            role_type_id="role-dev", cost_center_id="cc-muc-dev",
            competence_center_id="comp-dev",
        )
        db.add(other)
        sc = Scenario(name="Private", author_id="p-other-author", status="private")
        db.add(sc)
        db.commit()
        with pytest.raises(ApplyToForecastError):
            apply_to_forecast(db, scenario_id=sc.id, user=pl_user_obj)

    def test_pl_can_apply_published_scenario(self, db, applyforecast_world,
                                             pl_user_obj):
        sc = (
            db.query(Scenario)
            .filter_by(id=applyforecast_world["scenario_id"])
            .first()
        )
        sc.author_id = "p-dev-1"  # someone else
        sc.status = "published"
        db.commit()
        # PL can still apply because it's published.
        result = apply_to_forecast(
            db, scenario_id=applyforecast_world["scenario_id"], user=pl_user_obj,
        )
        db.commit()
        assert "summary" in result
