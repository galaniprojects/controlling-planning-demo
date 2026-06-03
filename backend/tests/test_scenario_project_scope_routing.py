"""Unit tests for services/scenario_project_scope/routing.py — Stream C.

Covers (spec §6):
- Overlay rows (cell / line / mix / plan) -> RoutableDiff classification.
- own / other resolution against project.pl_person_id.
- write_forecast_cells: upsert by cell key, hours->€ coherence via RateTable,
  external €-verbatim, minted-line insert, removed-line suppression,
  other-PL diffs skipped.
- materialize_provisional_cells: writes resolved values + is_provisional,
  upserts existing cells, returns count.
"""

from decimal import Decimal

import pytest

from models.financial import Forecast
from models.people import Person, RateTable
from models.projects import Project
from models.scenarios import (
    Scenario,
    ScenarioForecastCellEdit,
    ScenarioLineEdit,
    ScenarioMixChange,
    ScenarioPlanEdit,
)
from services.scenario_project_scope.routing import (
    collect_overlay_diffs,
    materialize_provisional_cells,
    write_forecast_cells,
)
from services.scenario_project_scope.types import (
    ResolvedCell,
    ResolvedGrid,
    ResolvedLine,
    RoutableDiff,
    LINE_KIND_EXTERNAL,
    LINE_KIND_INTERNAL,
    ROUTABLE_KIND_CELL,
    ROUTABLE_KIND_LINE,
    ROUTABLE_KIND_MIX,
    ROUTABLE_KIND_PLAN,
)


CONTROLLER_ID = "p-dev-1"   # acts as the promoting controller


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def rate_role_dev(db, seed_org_base):
    """Effective hourly rate for role-dev: latest of two entries = 100.00."""
    db.add(RateTable(
        role_type_id="role-dev", competence_center_id="comp-dev",
        hourly_rate=Decimal("80.00"), effective_date="2024-01-01",
    ))
    db.add(RateTable(
        role_type_id="role-dev", competence_center_id="comp-dev",
        hourly_rate=Decimal("100.00"), effective_date="2025-06-01",
    ))
    db.commit()
    return 100.0


@pytest.fixture
def scenario_world(db, seed_org_base, rate_role_dev):
    """A scenario on an own project (PL == controller) with one internal
    forecast line in June, plus a foreign project owned by another PL."""
    own = Project(
        id="proj-own-c", name="Own C", pipeline_stage="Active", capex_opex="opex",
        start_month="2026-01", end_month="2026-12", pl_person_id=CONTROLLER_ID,
    )
    foreign = Project(
        id="proj-foreign-c", name="Foreign C", pipeline_stage="Active",
        capex_opex="opex", start_month="2026-01", end_month="2026-12",
        pl_person_id="p-dev-2",
    )
    db.add_all([own, foreign])
    db.add(Forecast(
        project_id="proj-own-c", month="2026-06", category="internal",
        sub_category="role-dev", role_type_id=None, hours=10,
        amount_eur=Decimal("1000.00"),
    ))
    sc = Scenario(name="PS Scenario", author_id=CONTROLLER_ID, status="private")
    db.add(sc)
    db.commit()
    return {"scenario_id": sc.id}


# ---------------------------------------------------------------------------
# collect_overlay_diffs — classification + own/other
# ---------------------------------------------------------------------------

class TestCollectOverlayDiffs:
    def test_classifies_each_overlay_kind(self, db, scenario_world):
        sid = scenario_world["scenario_id"]
        db.add(ScenarioForecastCellEdit(
            scenario_id=sid, project_id="proj-own-c",
            line_key="internal|role-dev||", month="2026-06", field="hours",
            value=Decimal("20"),
        ))
        db.add(ScenarioLineEdit(
            scenario_id=sid, project_id="proj-own-c",
            line_key="new:ext:abc", op="add", line_kind="external_cost",
            category="external", sub_category="ext-consult", vendor="Acme",
        ))
        db.add(ScenarioMixChange(
            scenario_id=sid, project_id="proj-own-c",
            swap_from_role_id="role-dev", swap_to_role_id="role-pm",
            hours_per_month_swap=Decimal("40"), effective_from="2026-07",
        ))
        db.add(ScenarioPlanEdit(
            scenario_id=sid, project_id="proj-own-c", target="stage",
            value="approved",
        ))
        db.add(ScenarioPlanEdit(
            scenario_id=sid, project_id="proj-own-c", target="end_month",
            value="2026-11",
        ))
        db.commit()

        sc = db.query(Scenario).filter_by(id=sid).first()
        diffs = collect_overlay_diffs(db, sc)
        by_kind = {}
        for d in diffs:
            by_kind.setdefault(d.kind, []).append(d)

        assert by_kind[ROUTABLE_KIND_CELL][0].lever_category == "forecast_grid"
        assert by_kind[ROUTABLE_KIND_LINE][0].lever_category == "forecast_grid"
        assert by_kind[ROUTABLE_KIND_MIX][0].lever_category == "people"

        plan_levers = {d.field: d.lever_category for d in by_kind[ROUTABLE_KIND_PLAN]}
        assert plan_levers["stage"] == "pipeline_stage"
        assert plan_levers["end_month"] == "milestone"

        # All scope=project, ref carries the originating row id.
        assert all(d.scope == "project" for d in diffs)
        assert by_kind[ROUTABLE_KIND_CELL][0].ref.startswith("cell:")

    def test_own_resolution_with_controller(self, db, scenario_world):
        sid = scenario_world["scenario_id"]
        db.add(ScenarioForecastCellEdit(
            scenario_id=sid, project_id="proj-own-c",
            line_key="internal|role-dev||", month="2026-06", field="hours",
            value=Decimal("20"),
        ))
        db.add(ScenarioForecastCellEdit(
            scenario_id=sid, project_id="proj-foreign-c",
            line_key="internal|role-dev||", month="2026-06", field="hours",
            value=Decimal("5"),
        ))
        db.commit()
        sc = db.query(Scenario).filter_by(id=sid).first()
        diffs = collect_overlay_diffs(db, sc, controller_user_id=CONTROLLER_ID)
        own = {d.project_id: d.own for d in diffs}
        assert own["proj-own-c"] is True
        assert own["proj-foreign-c"] is False

    def test_own_none_without_controller(self, db, scenario_world):
        sid = scenario_world["scenario_id"]
        db.add(ScenarioForecastCellEdit(
            scenario_id=sid, project_id="proj-own-c",
            line_key="internal|role-dev||", month="2026-06", field="hours",
            value=Decimal("20"),
        ))
        db.commit()
        sc = db.query(Scenario).filter_by(id=sid).first()
        diffs = collect_overlay_diffs(db, sc)
        assert all(d.own is None for d in diffs)


# ---------------------------------------------------------------------------
# write_forecast_cells — the direct_forecast_update writer
# ---------------------------------------------------------------------------

class TestWriteForecastCells:
    def test_hours_edit_recomputes_euro(self, db, scenario_world):
        sid = scenario_world["scenario_id"]
        db.add(ScenarioForecastCellEdit(
            scenario_id=sid, project_id="proj-own-c",
            line_key="internal|role-dev||", month="2026-06", field="hours",
            value=Decimal("20"),
        ))
        db.commit()
        sc = db.query(Scenario).filter_by(id=sid).first()
        diffs = collect_overlay_diffs(db, sc, controller_user_id=CONTROLLER_ID)
        n = write_forecast_cells(db, sc, diffs, acting_user_id=CONTROLLER_ID)
        db.commit()

        assert n == 1
        row = (
            db.query(Forecast)
            .filter(Forecast.project_id == "proj-own-c",
                    Forecast.month == "2026-06",
                    Forecast.sub_category == "role-dev")
            .first()
        )
        assert float(row.hours) == 20.0
        # 20 hours * 100 €/h (latest effective rate) = 2000.00 — € stays coherent.
        assert float(row.amount_eur) == 2000.0

    def test_external_amount_written_verbatim_and_inserts(self, db, scenario_world):
        sid = scenario_world["scenario_id"]
        db.add(ScenarioForecastCellEdit(
            scenario_id=sid, project_id="proj-own-c",
            line_key="external|ext-lic||", month="2026-08", field="amount_eur",
            value=Decimal("5000"),
        ))
        db.commit()
        sc = db.query(Scenario).filter_by(id=sid).first()
        diffs = collect_overlay_diffs(db, sc, controller_user_id=CONTROLLER_ID)
        n = write_forecast_cells(db, sc, diffs, acting_user_id=CONTROLLER_ID)
        db.commit()

        assert n == 1
        row = (
            db.query(Forecast)
            .filter(Forecast.project_id == "proj-own-c",
                    Forecast.month == "2026-08",
                    Forecast.category == "external",
                    Forecast.sub_category == "ext-lic")
            .first()
        )
        assert row is not None
        assert float(row.amount_eur) == 5000.0
        assert row.hours is None

    def test_minted_line_inserts_with_metadata(self, db, scenario_world):
        sid = scenario_world["scenario_id"]
        db.add(ScenarioLineEdit(
            scenario_id=sid, project_id="proj-own-c",
            line_key="new:ext:zz", op="add", line_kind="external_cost",
            category="external", sub_category="ext-consult", vendor="Acme",
            capex_opex="opex", description="New consulting line",
        ))
        db.add(ScenarioForecastCellEdit(
            scenario_id=sid, project_id="proj-own-c",
            line_key="new:ext:zz", month="2026-07", field="amount_eur",
            value=Decimal("3000"),
        ))
        db.commit()
        sc = db.query(Scenario).filter_by(id=sid).first()
        diffs = collect_overlay_diffs(db, sc, controller_user_id=CONTROLLER_ID)
        n = write_forecast_cells(db, sc, diffs, acting_user_id=CONTROLLER_ID)
        db.commit()

        assert n == 1
        row = (
            db.query(Forecast)
            .filter(Forecast.project_id == "proj-own-c",
                    Forecast.month == "2026-07",
                    Forecast.category == "external",
                    Forecast.sub_category == "ext-consult")
            .first()
        )
        assert row is not None
        assert float(row.amount_eur) == 3000.0
        assert row.vendor == "Acme"
        assert row.capex_opex == "opex"

    def test_removed_line_deletes_live_rows(self, db, scenario_world):
        sid = scenario_world["scenario_id"]
        # proj-own-c already has one internal|role-dev row in June.
        db.add(ScenarioLineEdit(
            scenario_id=sid, project_id="proj-own-c",
            line_key="internal|role-dev||", op="remove", line_kind="internal_role",
            category="internal", sub_category="role-dev",
        ))
        db.commit()
        sc = db.query(Scenario).filter_by(id=sid).first()
        diffs = collect_overlay_diffs(db, sc, controller_user_id=CONTROLLER_ID)
        n = write_forecast_cells(db, sc, diffs, acting_user_id=CONTROLLER_ID)
        db.commit()

        assert n == 1
        remaining = (
            db.query(Forecast)
            .filter(Forecast.project_id == "proj-own-c",
                    Forecast.sub_category == "role-dev")
            .all()
        )
        assert remaining == []

    def test_other_pl_diffs_skipped(self, db, scenario_world):
        sid = scenario_world["scenario_id"]
        db.add(ScenarioForecastCellEdit(
            scenario_id=sid, project_id="proj-foreign-c",
            line_key="internal|role-dev||", month="2026-06", field="hours",
            value=Decimal("99"),
        ))
        db.commit()
        sc = db.query(Scenario).filter_by(id=sid).first()
        diffs = collect_overlay_diffs(db, sc, controller_user_id=CONTROLLER_ID)
        # All diffs are other-PL (own=False) -> nothing written.
        n = write_forecast_cells(db, sc, diffs, acting_user_id=CONTROLLER_ID)
        db.commit()
        assert n == 0

    def test_hours_edit_prices_at_rate_in_force_at_each_month(self, db, scenario_world):
        """S6 rate-at-month regression for the promote writer. Two cell edits
        on the same role line in different months must each price at the rate
        in force at *that cell's month* (uses ``ce.month``), not a single
        latest-wins rate. A later, higher rate row exists but is not yet
        effective for the earlier cell."""
        sid = scenario_world["scenario_id"]
        # role-step: €100 from 2025, stepping up to €150 from 2026-07.
        db.add(RateTable(role_type_id="role-step", competence_center_id="comp-dev",
                         hourly_rate=Decimal("100.00"), effective_date="2025-01-01"))
        db.add(RateTable(role_type_id="role-step", competence_center_id="comp-dev",
                         hourly_rate=Decimal("150.00"), effective_date="2026-07-01"))
        # June edit (priced at 100) and July edit (priced at 150), same hours.
        db.add(ScenarioForecastCellEdit(
            scenario_id=sid, project_id="proj-own-c",
            line_key="internal|role-step||", month="2026-06", field="hours",
            value=Decimal("20"),
        ))
        db.add(ScenarioForecastCellEdit(
            scenario_id=sid, project_id="proj-own-c",
            line_key="internal|role-step||", month="2026-07", field="hours",
            value=Decimal("20"),
        ))
        db.commit()
        sc = db.query(Scenario).filter_by(id=sid).first()
        diffs = collect_overlay_diffs(db, sc, controller_user_id=CONTROLLER_ID)
        write_forecast_cells(db, sc, diffs, acting_user_id=CONTROLLER_ID)
        db.commit()

        june = (
            db.query(Forecast)
            .filter(Forecast.project_id == "proj-own-c",
                    Forecast.month == "2026-06",
                    Forecast.sub_category == "role-step")
            .first()
        )
        july = (
            db.query(Forecast)
            .filter(Forecast.project_id == "proj-own-c",
                    Forecast.month == "2026-07",
                    Forecast.sub_category == "role-step")
            .first()
        )
        assert float(june.amount_eur) == 20.0 * 100.0   # 2000.0 — June rate
        assert float(july.amount_eur) == 20.0 * 150.0   # 3000.0 — July step-up

    def test_multi_location_promote_keeps_split_lines(self, db, scenario_world):
        """S6 location-aware promote: two same-role lines at different workforce
        locations promote to two DISTINCT live Forecast rows (split by
        location_id), each priced at its own location's rate — they must NOT
        collapse onto one cell key on write-back."""
        sid = scenario_world["scenario_id"]
        # Per-location rates for role-loc: Munich €100/h, Budapest €60/h.
        db.add(RateTable(role_type_id="role-loc", competence_center_id="comp-dev",
                         location_id="loc-muc", hourly_rate=Decimal("100.00"),
                         effective_date="2025-01-01"))
        db.add(RateTable(role_type_id="role-loc", competence_center_id="comp-dev",
                         location_id="loc-bud", hourly_rate=Decimal("60.00"),
                         effective_date="2025-01-01"))
        # Two live anchor rows: same role, different location, same month.
        db.add(Forecast(project_id="proj-own-c", month="2026-06", category="internal",
                        sub_category="role-loc", role_type_id=None,
                        location_id="loc-muc", hours=10, amount_eur=Decimal("1000.00")))
        db.add(Forecast(project_id="proj-own-c", month="2026-06", category="internal",
                        sub_category="role-loc", role_type_id=None,
                        location_id="loc-bud", hours=10, amount_eur=Decimal("600.00")))
        # Hours edit on each location-split line (keys carry the 4th segment).
        db.add(ScenarioForecastCellEdit(
            scenario_id=sid, project_id="proj-own-c",
            line_key="internal|role-loc||loc-muc", month="2026-06", field="hours",
            value=Decimal("20"),
        ))
        db.add(ScenarioForecastCellEdit(
            scenario_id=sid, project_id="proj-own-c",
            line_key="internal|role-loc||loc-bud", month="2026-06", field="hours",
            value=Decimal("30"),
        ))
        db.commit()
        sc = db.query(Scenario).filter_by(id=sid).first()
        diffs = collect_overlay_diffs(db, sc, controller_user_id=CONTROLLER_ID)
        n = write_forecast_cells(db, sc, diffs, acting_user_id=CONTROLLER_ID)
        db.commit()

        assert n == 2
        rows = (
            db.query(Forecast)
            .filter(Forecast.project_id == "proj-own-c",
                    Forecast.sub_category == "role-loc",
                    Forecast.month == "2026-06")
            .all()
        )
        by_loc = {r.location_id: r for r in rows}
        # Two distinct location rows survive — not collapsed into one.
        assert set(by_loc) == {"loc-muc", "loc-bud"}
        assert float(by_loc["loc-muc"].hours) == 20.0
        assert float(by_loc["loc-muc"].amount_eur) == 2000.0   # 20h x 100 (Munich)
        assert float(by_loc["loc-bud"].hours) == 30.0
        assert float(by_loc["loc-bud"].amount_eur) == 1800.0   # 30h x 60 (Budapest)


# ---------------------------------------------------------------------------
# materialize_provisional_cells — apply-to-forecast writer
# ---------------------------------------------------------------------------

class TestMaterializeProvisionalCells:
    def test_writes_values_and_provisional_flag(self, db, scenario_world):
        sc = db.query(Scenario).filter_by(
            id=scenario_world["scenario_id"]).first()
        grid = ResolvedGrid(
            project_id="proj-own-c",
            lines=[
                # Existing internal June line — upsert in place.
                ResolvedLine(
                    line_key="internal|role-dev||", category="internal",
                    kind=LINE_KIND_INTERNAL, sub_category="role-dev",
                    role_type_id=None,
                    cells={"2026-06": ResolvedCell(amount_eur=2500.0, hours=25.0)},
                ),
                # New external July line — insert.
                ResolvedLine(
                    line_key="new:ext:m1", category="external",
                    kind=LINE_KIND_EXTERNAL, sub_category="ext-consult",
                    vendor="Globex",
                    cells={"2026-07": ResolvedCell(amount_eur=4000.0)},
                ),
            ],
        )
        n = materialize_provisional_cells(db, sc, [grid])
        db.commit()

        assert n == 2
        internal = (
            db.query(Forecast)
            .filter(Forecast.project_id == "proj-own-c",
                    Forecast.month == "2026-06",
                    Forecast.sub_category == "role-dev")
            .first()
        )
        assert float(internal.amount_eur) == 2500.0
        assert float(internal.hours) == 25.0
        assert internal.is_provisional is True

        external = (
            db.query(Forecast)
            .filter(Forecast.project_id == "proj-own-c",
                    Forecast.month == "2026-07",
                    Forecast.category == "external")
            .first()
        )
        assert external is not None
        assert float(external.amount_eur) == 4000.0
        assert external.hours is None
        assert external.is_provisional is True

    def test_upserts_in_place_no_duplicate(self, db, scenario_world):
        sc = db.query(Scenario).filter_by(
            id=scenario_world["scenario_id"]).first()
        grid = ResolvedGrid(
            project_id="proj-own-c",
            lines=[ResolvedLine(
                line_key="internal|role-dev||", category="internal",
                kind=LINE_KIND_INTERNAL, sub_category="role-dev",
                role_type_id=None,
                cells={"2026-06": ResolvedCell(amount_eur=1234.0, hours=12.0)},
            )],
        )
        materialize_provisional_cells(db, sc, [grid])
        db.commit()
        rows = (
            db.query(Forecast)
            .filter(Forecast.project_id == "proj-own-c",
                    Forecast.month == "2026-06",
                    Forecast.sub_category == "role-dev")
            .all()
        )
        assert len(rows) == 1
        assert float(rows[0].amount_eur) == 1234.0
