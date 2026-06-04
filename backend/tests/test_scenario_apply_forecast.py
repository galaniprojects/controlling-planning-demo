"""Unit tests for services/scenario_apply_forecast.py — PL Apply-to-forecast.

Per [B-PR-05] [B-OQ-02] + the locked apply-to-CR product decision:
- PL only.
- Only own-project diffs carried forward.
- Portfolio-level diffs left behind.
- Each eligible own-project diff is staged as draft Change Request(s) (one per
  cost centre), authored by the applying PL, tagged with source_scenario_id.
- The live forecast is NOT mutated (no provisional cells written).
- Scenario not consumed.
"""

import pytest

from models.change_requests import ChangeRequest, CRChangeDetail
from models.financial import Forecast
from models.scenarios import (
    Scenario, ScenarioAction, ScenarioApplyToForecastEvent, ScenarioForecastCellEdit,
)
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
    """A scenario authored by the PL with a forecast_grid action on own project.

    The own project also carries a Layer-2 overlay cell edit (hours 11 -> 30 on
    2026-02) so the resolved grid actually diverges from the live forecast — that
    diff is what apply stages as a draft CR. (``reduce_budget`` alone is not a
    project-scope macro, so it produces no grid diff on its own.)
    """
    create_test_project("proj-own", forecast_amt=1000, pl_person_id="p-pm-1")
    create_test_project("proj-other", forecast_amt=1000, pl_person_id="p-dev-1")

    sc = Scenario(name="Apply Test", author_id="p-pm-1", status="private")
    db.add(sc)
    db.flush()

    # Overlay edit on the own project — guarantees a real diff vs live forecast.
    db.add(ScenarioForecastCellEdit(
        scenario_id=sc.id, project_id="proj-own",
        line_key="internal|role-dev||", month="2026-02",
        field="hours", value=30.0,
    ))

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

    def test_draft_crs_created_live_forecast_untouched(
        self, db, applyforecast_world, pl_user_obj,
    ):
        """Apply stages the own-project diff as draft CR(s) authored by the PL,
        with detail rows matching the resolved diff — and leaves the live
        forecast rows untouched (no provisional flag, no value mutation)."""
        # Snapshot the live forecast before apply.
        before = {
            (r.project_id, r.month): (r.hours, r.amount_eur, r.is_provisional)
            for r in db.query(Forecast).all()
        }

        apply_to_forecast(
            db, scenario_id=applyforecast_world["scenario_id"],
            user=pl_user_obj,
        )
        db.commit()

        # Exactly one draft CR for the owned project, authored by the PL, tagged.
        crs = (
            db.query(ChangeRequest)
            .filter(ChangeRequest.project_id == "proj-own")
            .all()
        )
        assert len(crs) == 1
        cr = crs[0]
        assert cr.status == "draft"
        assert cr.submitted_by_id == "p-pm-1"
        assert cr.source_scenario_id == applyforecast_world["scenario_id"]

        # The detail captures the overlaid hours change (11 -> 30 on 2026-02).
        details = (
            db.query(CRChangeDetail)
            .filter(CRChangeDetail.change_request_id == cr.id)
            .all()
        )
        assert len(details) == 1
        d = details[0]
        assert d.month == "2026-02"
        assert d.line_item_type == "role-dev"
        assert float(d.old_value) == 11.0
        assert float(d.new_value) == 30.0

        # No draft CR for the other (non-owned) project.
        assert (
            db.query(ChangeRequest)
            .filter(ChangeRequest.project_id == "proj-other")
            .count()
            == 0
        )

        # Live forecast rows are completely unchanged — no provisional cells.
        after = {
            (r.project_id, r.month): (r.hours, r.amount_eur, r.is_provisional)
            for r in db.query(Forecast).all()
        }
        assert after == before
        assert not any(r.is_provisional for r in db.query(Forecast).all())

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
        # Per [B-OQ-02] working assumption: provenance visible to controller.
        # The note now describes draft Change Requests, not provisional cells.
        note = result["provenance_note"]
        assert "Provenance" in note
        assert "draft Change Request" in note
        assert "Visible to controller" in note
        assert "is_provisional" not in note
        assert "B-OQ-02" not in note

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


class TestApplyGate:
    """Issue A (§5) — the apply gate must allow the scenario OWNER (any
    status, incl. private) OR a PUBLISHED scenario, and reject everything
    else. This pins the backend gate so the frontend gate
    (`disabled={!(isOwner || isPublished)}`) provably agrees.
    """

    def _make_other_author(self, db):
        from models.people import Person
        if db.query(Person).filter_by(id="p-other-author").first() is None:
            db.add(Person(
                id="p-other-author", name="Other Author",
                role_type_id="role-dev", cost_center_id="cc-muc-dev",
                competence_center_id="comp-dev",
            ))
            db.flush()

    def test_owner_private_allowed(self, db, seed_org_base,
                                   create_test_project, pl_user_obj):
        # Owner applies their OWN private scenario — allowed.
        create_test_project("proj-own", forecast_amt=1000, pl_person_id="p-pm-1")
        sc = Scenario(name="Owner private", author_id="p-pm-1", status="private")
        db.add(sc)
        db.flush()
        db.add(ScenarioAction(
            scenario_id=sc.id, action_order=1, scope="project",
            action_type="reduce_budget", project_id="proj-own",
            parameters_json='{"percentage": 10}',
            lever_category="forecast_grid", tier=1,
        ))
        # Overlay edit makes the resolved grid diverge so a draft CR is staged.
        db.add(ScenarioForecastCellEdit(
            scenario_id=sc.id, project_id="proj-own",
            line_key="internal|role-dev||", month="2026-02",
            field="hours", value=30.0,
        ))
        db.commit()

        result = apply_to_forecast(db, scenario_id=sc.id, user=pl_user_obj)
        db.commit()
        assert result["diffs_carried_forward"] == 1

    def test_published_non_owner_allowed(self, db, seed_org_base,
                                         create_test_project, pl_user_obj):
        # Non-owner applies a PUBLISHED scenario — allowed.
        self._make_other_author(db)
        create_test_project("proj-own", forecast_amt=1000, pl_person_id="p-pm-1")
        sc = Scenario(name="Published other",
                      author_id="p-other-author", status="published")
        db.add(sc)
        db.flush()
        db.add(ScenarioAction(
            scenario_id=sc.id, action_order=1, scope="project",
            action_type="reduce_budget", project_id="proj-own",
            parameters_json='{"percentage": 10}',
            lever_category="forecast_grid", tier=1,
        ))
        db.commit()

        result = apply_to_forecast(db, scenario_id=sc.id, user=pl_user_obj)
        db.commit()
        assert "summary" in result

    def test_non_owner_non_published_rejected(self, db, seed_org_base,
                                              create_test_project, pl_user_obj):
        # Non-owner, non-published (private) scenario — rejected.
        self._make_other_author(db)
        sc = Scenario(name="Private other",
                      author_id="p-other-author", status="private")
        db.add(sc)
        db.commit()
        with pytest.raises(ApplyToForecastError) as exc:
            apply_to_forecast(db, scenario_id=sc.id, user=pl_user_obj)
        assert "non-published" in exc.value.message


class TestOverlayOnlyApply:
    """Apply-to-forecast must reach a PL's own project edited PURELY via the
    Layer-2 overlay (no ScenarioAction) — review finding #3."""

    def test_overlay_only_own_project_carries_with_values(
        self, db, seed_org_base, create_test_project, pl_user_obj,
    ):
        create_test_project("proj-own", forecast_amt=1000, pl_person_id="p-pm-1")
        sc = Scenario(name="Overlay only", author_id="p-pm-1", status="private")
        db.add(sc)
        db.flush()
        # No ScenarioAction — just an overlay hours edit on the own project's
        # existing internal line (11 -> 25 on 2026-02).
        db.add(ScenarioForecastCellEdit(
            scenario_id=sc.id, project_id="proj-own",
            line_key="internal|role-dev||", month="2026-02",
            field="hours", value=25.0,
        ))
        db.commit()

        result = apply_to_forecast(db, scenario_id=sc.id, user=pl_user_obj)
        db.commit()

        assert result["diffs_carried_forward"] >= 1

        # A draft CR with a detail for the edited month/value exists.
        cr = (
            db.query(ChangeRequest)
            .filter(ChangeRequest.project_id == "proj-own")
            .one()
        )
        assert cr.status == "draft"
        assert cr.submitted_by_id == "p-pm-1"
        assert cr.source_scenario_id == sc.id
        detail = (
            db.query(CRChangeDetail)
            .filter(
                CRChangeDetail.change_request_id == cr.id,
                CRChangeDetail.month == "2026-02",
            )
            .one()
        )
        assert float(detail.new_value) == 25.0

        # Live forecast left untouched — no provisional cells.
        assert not any(
            r.is_provisional
            for r in db.query(Forecast).filter(Forecast.project_id == "proj-own")
        )

    def test_overlay_only_other_project_skipped(
        self, db, seed_org_base, create_test_project, pl_user_obj,
    ):
        create_test_project("proj-foreign", forecast_amt=1000, pl_person_id="p-dev-1")
        sc = Scenario(name="Overlay foreign", author_id="p-pm-1", status="private")
        db.add(sc)
        db.flush()
        db.add(ScenarioForecastCellEdit(
            scenario_id=sc.id, project_id="proj-foreign",
            line_key="internal|role-dev||", month="2026-02",
            field="hours", value=25.0,
        ))
        db.commit()

        result = apply_to_forecast(db, scenario_id=sc.id, user=pl_user_obj)
        db.commit()

        assert result["diffs_carried_forward"] == 0
        # No CR created for the non-owned project, and live forecast untouched.
        assert (
            db.query(ChangeRequest)
            .filter(ChangeRequest.project_id == "proj-foreign")
            .count()
            == 0
        )
        foreign = (
            db.query(Forecast)
            .filter(Forecast.project_id == "proj-foreign", Forecast.month == "2026-02")
            .first()
        )
        assert foreign.is_provisional is False
        assert float(foreign.amount_eur) == 1000.0
