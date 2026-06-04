"""Session 4 — Apply-to-Forecast widening + stale-anchor guard (spec §8, §10).

Covers the two Session-4 changes layered on top of the apply path — now
re-expressed under the locked apply-to-CR contract (apply stages draft Change
Requests, it does NOT write provisional Forecast cells):

  1. WIDENED ELIGIBILITY — apply stages the FULL project-scope edit surface as
     draft-CR change details, not just internal forecast cells: external-cost
     line items and added / removed role lines transfer too. (Internal cells and
     the stale-anchor-tolerant legacy world are covered by
     ``tests/test_scenario_apply_forecast.py``.)

  2. STALE-ANCHOR GUARD — apply refuses (ApplyToForecastError with hint="rebase")
     when the scenario anchor is behind the latest forecast cycle, matching
     Promote; it succeeds when the anchor is current; and it is a no-op when no
     cycle version exists at all (legacy demo state).

Fixtures mirror ``tests/test_scenario_apply_forecast.py`` and ``conftest.py``
(autouse ``pin_demo_date`` → DEMO_DATE "2026-04", open forecast month "2026-05").
"""

import uuid

import pytest

from models.change_requests import ChangeRequest, CRChangeDetail
from models.financial import Forecast, ForecastVersion
from models.scenarios import (
    Scenario,
    ScenarioForecastCellEdit,
    ScenarioLineEdit,
)
from schemas.common import CurrentUser
from services.scenario_apply_forecast import (
    ApplyToForecastError,
    PL_FORECAST_CARRY_CATEGORIES,
    apply_to_forecast,
    assert_anchor_is_latest_cycle,
)


@pytest.fixture
def pl_user_obj():
    return CurrentUser(
        user_id="persona-pl", person_id="p-pm-1", name="PL One",
        role="project_lead", project_ids=["proj-own"],
    )


# ---------------------------------------------------------------------------
# Widened eligibility — external costs + added/removed lines carry as cells
# ---------------------------------------------------------------------------

class TestWidenedCarry:
    def test_carry_categories_widened_to_external_cost(self):
        # Session 4 widened the set so external-cost edits transfer.
        assert "external_cost" in PL_FORECAST_CARRY_CATEGORIES
        assert "forecast_grid" in PL_FORECAST_CARRY_CATEGORIES

    def test_external_cost_line_carries_as_draft_cr(
        self, db, seed_org_base, create_test_project, pl_user_obj,
    ):
        """An added external-cost line item (ScenarioLineEdit op=add + a value
        cell on a future month) stages a draft CR detail; the live forecast is
        untouched."""
        create_test_project("proj-own", forecast_amt=1000, pl_person_id="p-pm-1")
        sc = Scenario(name="Ext add", author_id="p-pm-1", status="private")
        db.add(sc)
        db.flush()

        ext_key = f"new:ext:{uuid.uuid4()}"
        db.add(ScenarioLineEdit(
            scenario_id=sc.id, project_id="proj-own", line_key=ext_key,
            op="add", line_kind="external_cost", category="external",
            sub_category="ct-licence", vendor="Acme GmbH",
            description="Annual licence", capex_opex="opex",
        ))
        # Future month (open forecast month is 2026-05).
        db.add(ScenarioForecastCellEdit(
            scenario_id=sc.id, project_id="proj-own", line_key=ext_key,
            month="2026-06", field="amount_eur", value=5000.0,
        ))
        db.commit()

        result = apply_to_forecast(db, scenario_id=sc.id, user=pl_user_obj)
        db.commit()

        assert result["diffs_carried_forward"] >= 1
        cr = (
            db.query(ChangeRequest)
            .filter(
                ChangeRequest.project_id == "proj-own",
                ChangeRequest.source_scenario_id == sc.id,
            )
            .one()
        )
        assert cr.status == "draft"
        assert cr.submitted_by_id == "p-pm-1"
        detail = (
            db.query(CRChangeDetail)
            .filter(
                CRChangeDetail.change_request_id == cr.id,
                CRChangeDetail.month == "2026-06",
                CRChangeDetail.line_item_type == "ct-licence",
            )
            .one()
        )
        assert float(detail.new_value) == 5000.0

        # No external Forecast cell was written (live forecast untouched).
        assert (
            db.query(Forecast)
            .filter(
                Forecast.project_id == "proj-own",
                Forecast.category == "external",
            )
            .count()
            == 0
        )

    def test_added_role_line_carries_as_draft_cr(
        self, db, seed_org_base, create_test_project, pl_user_obj,
    ):
        """An added internal role line stages a draft CR detail carrying the
        edited hours; the live forecast gains no row."""
        create_test_project("proj-own", forecast_amt=1000, pl_person_id="p-pm-1")
        sc = Scenario(name="Role add", author_id="p-pm-1", status="private")
        db.add(sc)
        db.flush()

        role_key = f"new:role:{uuid.uuid4()}"
        db.add(ScenarioLineEdit(
            scenario_id=sc.id, project_id="proj-own", line_key=role_key,
            op="add", line_kind="internal_role", category="internal",
            sub_category="role-pm", role_type_id="role-pm",
        ))
        db.add(ScenarioForecastCellEdit(
            scenario_id=sc.id, project_id="proj-own", line_key=role_key,
            month="2026-06", field="hours", value=40.0,
        ))
        db.commit()

        result = apply_to_forecast(db, scenario_id=sc.id, user=pl_user_obj)
        db.commit()

        assert result["diffs_carried_forward"] >= 1
        cr = (
            db.query(ChangeRequest)
            .filter(
                ChangeRequest.project_id == "proj-own",
                ChangeRequest.source_scenario_id == sc.id,
            )
            .one()
        )
        assert cr.status == "draft"
        detail = (
            db.query(CRChangeDetail)
            .filter(
                CRChangeDetail.change_request_id == cr.id,
                CRChangeDetail.month == "2026-06",
                CRChangeDetail.line_item_type == "role-pm",
            )
            .one()
        )
        assert float(detail.new_value) == 40.0

        # No live Forecast row was added for the new role line.
        assert (
            db.query(Forecast)
            .filter(
                Forecast.project_id == "proj-own",
                Forecast.role_type_id == "role-pm",
            )
            .count()
            == 0
        )

    def test_removed_line_emits_drop_to_zero_detail(
        self, db, seed_org_base, create_test_project, pl_user_obj,
    ):
        """A line removed in the scenario stages a drop-to-zero CR detail and the
        replacement external line stages its own detail; live forecast unchanged."""
        create_test_project(
            "proj-own", forecast_amt=1000, pl_person_id="p-pm-1",
            months=["2026-06", "2026-07"],
        )
        sc = Scenario(name="Remove line", author_id="p-pm-1", status="private")
        db.add(sc)
        db.flush()

        # The seeded internal line key: "internal|role-dev||" (role_type_id NULL).
        removed_key = "internal|role-dev||"
        db.add(ScenarioLineEdit(
            scenario_id=sc.id, project_id="proj-own", line_key=removed_key,
            op="remove", line_kind="internal_role", category="internal",
            sub_category="role-dev",
        ))
        # Add a replacement external line so the scenario still carries something.
        ext_key = f"new:ext:{uuid.uuid4()}"
        db.add(ScenarioLineEdit(
            scenario_id=sc.id, project_id="proj-own", line_key=ext_key,
            op="add", line_kind="external_cost", category="external",
            sub_category="ct-licence", vendor="Acme",
        ))
        db.add(ScenarioForecastCellEdit(
            scenario_id=sc.id, project_id="proj-own", line_key=ext_key,
            month="2026-06", field="amount_eur", value=1234.0,
        ))
        db.commit()

        before = {
            (r.project_id, r.month, r.category): (r.hours, r.amount_eur)
            for r in db.query(Forecast).all()
        }

        result = apply_to_forecast(db, scenario_id=sc.id, user=pl_user_obj)
        db.commit()

        assert result["diffs_carried_forward"] >= 1
        details = (
            db.query(CRChangeDetail)
            .join(ChangeRequest, CRChangeDetail.change_request_id == ChangeRequest.id)
            .filter(ChangeRequest.source_scenario_id == sc.id)
            .all()
        )
        # The replacement external line staged its € value.
        assert any(
            d.line_item_type == "ct-licence" and float(d.new_value) == 1234.0
            for d in details
        )
        # The removed internal line staged a drop-to-zero detail (old hours -> 0).
        drop = [d for d in details if d.line_item_type == "role-dev"]
        assert drop, "removed line did not stage a drop-to-zero detail"
        assert all(float(d.new_value) == 0.0 for d in drop)
        assert all(float(d.old_value) > 0.0 for d in drop)

        # Live forecast rows are completely unchanged (no provisional cells).
        after = {
            (r.project_id, r.month, r.category): (r.hours, r.amount_eur)
            for r in db.query(Forecast).all()
        }
        assert after == before
        assert not any(r.is_provisional for r in db.query(Forecast).all())


# ---------------------------------------------------------------------------
# Stale-anchor guard (spec §10) — matches Promote
# ---------------------------------------------------------------------------

def _make_cycle_version(db, *, version_number: int, label: str) -> ForecastVersion:
    """Create a 'cycle' ForecastVersion (needs an FK project_id)."""
    from models.projects import Project
    anchor_proj_id = f"p-anchor-{version_number}"
    if db.query(Project).filter(Project.id == anchor_proj_id).first() is None:
        db.add(Project(
            id=anchor_proj_id, name=f"Anchor {version_number}",
            pipeline_stage="Active", capex_opex="capex",
            start_month="2025-01", end_month="2026-12",
        ))
        db.flush()
    fv = ForecastVersion(
        project_id=anchor_proj_id, version_number=version_number,
        version_type="cycle", cycle_label=label, created_by_id="p-pm-1",
        granularity_boundary_months=12, planning_horizon_months=60,
    )
    db.add(fv)
    db.flush()
    return fv


@pytest.fixture
def anchored_world(db, seed_org_base, create_test_project):
    """A PL-owned scenario with an overlay edit, anchored to a current cycle."""
    create_test_project(
        "proj-own", forecast_amt=1000, pl_person_id="p-pm-1",
        months=["2026-06"],
    )
    fv = _make_cycle_version(db, version_number=1, label="Q2 2026")
    sc = Scenario(
        name="Anchored", author_id="p-pm-1", status="private",
        anchor_forecast_version_id=fv.id,
    )
    db.add(sc)
    db.flush()
    db.add(ScenarioForecastCellEdit(
        scenario_id=sc.id, project_id="proj-own",
        line_key="internal|role-dev||", month="2026-06",
        field="hours", value=20.0,
    ))
    db.commit()
    return {"scenario_id": sc.id, "version_id": fv.id}


class TestStaleAnchorGuard:
    def test_no_cycle_version_is_no_op(
        self, db, seed_org_base, create_test_project, pl_user_obj,
    ):
        """Legacy demo state: no cycle ForecastVersion exists, so the guard does
        not fire even with a NULL anchor — apply proceeds."""
        create_test_project(
            "proj-own", forecast_amt=1000, pl_person_id="p-pm-1",
            months=["2026-06"],
        )
        sc = Scenario(name="No cycle", author_id="p-pm-1", status="private")
        db.add(sc)
        db.flush()
        db.add(ScenarioForecastCellEdit(
            scenario_id=sc.id, project_id="proj-own",
            line_key="internal|role-dev||", month="2026-06",
            field="hours", value=20.0,
        ))
        db.commit()

        # Should NOT raise — guard is a no-op when no cycle exists.
        result = apply_to_forecast(db, scenario_id=sc.id, user=pl_user_obj)
        db.commit()
        assert result["diffs_carried_forward"] >= 1

    def test_current_anchor_succeeds(self, db, anchored_world, pl_user_obj):
        result = apply_to_forecast(
            db, scenario_id=anchored_world["scenario_id"], user=pl_user_obj,
        )
        db.commit()
        assert result["diffs_carried_forward"] >= 1

    def test_stale_anchor_refused_with_rebase_hint(
        self, db, anchored_world, pl_user_obj,
    ):
        # A newer cycle version makes the scenario's anchor stale.
        _make_cycle_version(db, version_number=2, label="Q3 2026")
        db.commit()

        with pytest.raises(ApplyToForecastError) as exc:
            apply_to_forecast(
                db, scenario_id=anchored_world["scenario_id"], user=pl_user_obj,
            )
        assert exc.value.hint == "rebase"
        assert "rebase" in exc.value.message.lower()

    def test_stale_anchor_creates_no_change_requests(
        self, db, anchored_world, pl_user_obj,
    ):
        """The guard fires before any CR creation — no draft CRs are staged."""
        _make_cycle_version(db, version_number=2, label="Q3 2026")
        db.commit()

        with pytest.raises(ApplyToForecastError):
            apply_to_forecast(
                db, scenario_id=anchored_world["scenario_id"], user=pl_user_obj,
            )
        assert db.query(ChangeRequest).count() == 0
        # And the live forecast is untouched.
        rows = (
            db.query(Forecast)
            .filter(Forecast.project_id == "proj-own")
            .all()
        )
        assert all(not r.is_provisional for r in rows)

    def test_missing_anchor_refused_when_cycle_exists(
        self, db, seed_org_base, create_test_project, pl_user_obj,
    ):
        """Once a cycle exists, a scenario with NO anchor is also refused
        (it cannot be guaranteed current) — matching Promote's missing-anchor path."""
        create_test_project(
            "proj-own", forecast_amt=1000, pl_person_id="p-pm-1",
            months=["2026-06"],
        )
        _make_cycle_version(db, version_number=1, label="Q2 2026")
        sc = Scenario(name="No anchor", author_id="p-pm-1", status="private")
        db.add(sc)
        db.flush()
        db.add(ScenarioForecastCellEdit(
            scenario_id=sc.id, project_id="proj-own",
            line_key="internal|role-dev||", month="2026-06",
            field="hours", value=20.0,
        ))
        db.commit()

        with pytest.raises(ApplyToForecastError) as exc:
            apply_to_forecast(db, scenario_id=sc.id, user=pl_user_obj)
        assert exc.value.hint == "rebase"

    def test_guard_helper_no_op_without_cycle(self, db, seed_org_base):
        """assert_anchor_is_latest_cycle returns cleanly (no raise) when no cycle
        version exists, even for an anchorless scenario."""
        sc = Scenario(name="x", author_id="p-pm-1", status="private")
        db.add(sc)
        db.commit()
        # Should not raise.
        assert assert_anchor_is_latest_cycle(db, sc) is None


# ---------------------------------------------------------------------------
# Author scope vs apply scope parity (code-review SF-2)
# ---------------------------------------------------------------------------

class TestApplyOwnershipParity:
    """The apply led-set must match the authoring boundary
    (``dependencies.pl_leads_project``): a PL leads a project via the persona's
    static ``project_ids`` OR via ``Project.pl_person_id``. A project led only
    via ``pl_person_id`` (absent from ``project_ids``) must be carried, not
    silently skipped at apply."""

    def test_pl_person_id_led_project_is_carried_not_skipped(
        self, db, seed_org_base, create_test_project,
    ):
        # Project led via pl_person_id only; NOT in the persona's project_ids.
        create_test_project(
            "proj-fk-led", forecast_amt=1000, pl_person_id="p-pm-1",
            months=["2026-06"],
        )
        user = CurrentUser(
            user_id="persona-pl", person_id="p-pm-1", name="PL One",
            role="project_lead", project_ids=[],  # deliberately empty
        )
        sc = Scenario(name="FK-led apply", author_id="p-pm-1", status="private")
        db.add(sc)
        db.flush()
        db.add(ScenarioForecastCellEdit(
            scenario_id=sc.id, project_id="proj-fk-led",
            line_key="internal|role-dev||", month="2026-06",
            field="hours", value=25.0,
        ))
        db.commit()

        result = apply_to_forecast(db, scenario_id=sc.id, user=user)
        db.commit()

        # The FK-led project must NOT be skipped as "not owned by this PL".
        skipped_pids = {
            s.get("project_id")
            for s in result.get("summary", [])
            if s.get("status") == "skipped"
        }
        assert "proj-fk-led" not in skipped_pids
        assert result["diffs_carried_forward"] >= 1

        # The FK-led project's overlay was staged as a draft CR authored by the PL.
        cr = (
            db.query(ChangeRequest)
            .filter(
                ChangeRequest.project_id == "proj-fk-led",
                ChangeRequest.source_scenario_id == sc.id,
            )
            .one()
        )
        assert cr.status == "draft"
        assert cr.submitted_by_id == "p-pm-1"
        detail = (
            db.query(CRChangeDetail)
            .filter(
                CRChangeDetail.change_request_id == cr.id,
                CRChangeDetail.month == "2026-06",
            )
            .one()
        )
        assert float(detail.new_value) == 25.0
