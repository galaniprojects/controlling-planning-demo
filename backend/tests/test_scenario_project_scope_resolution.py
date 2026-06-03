"""Stream A — project-scope resolution tests (spec §5, §6).

Covers: anchor read shape, overlay precedence (hand-edits-win), absolute-month
keying (an edited cell does NOT travel under a macro), and line add/remove overlay.
"""
import pytest

from models.financial import Forecast
from models.projects import Project
from models.scenarios import (
    Scenario,
    ScenarioAction,
    ScenarioForecastCellEdit,
    ScenarioLineEdit,
)
from services.scenario_project_scope.resolution import (
    read_anchor_grid,
    resolve_project_grid,
)
from services.scenario_project_scope.rollup import rollup_grid
from services.scenario_project_scope.types import (
    LINE_KIND_EXTERNAL,
    LINE_KIND_INTERNAL,
)


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------

def _project(db, pid="proj-res", start="2026-05", end="2026-08"):
    p = Project(
        id=pid,
        name="Resolution Project",
        pipeline_stage="Active",
        capex_opex="opex",
        start_month=start,
        end_month=end,
    )
    db.add(p)
    db.commit()
    return p


def _forecast(db, pid, month, category, sub_category, amount, hours=None, role_type_id=None, vendor=None):
    row = Forecast(
        project_id=pid,
        month=month,
        category=category,
        sub_category=sub_category,
        amount_eur=amount,
        hours=hours,
        role_type_id=role_type_id,
        vendor=vendor,
    )
    db.add(row)
    return row


def _scenario(db, sid_author="p-auth"):
    s = Scenario(name="S", author_id=sid_author, status="private")
    db.add(s)
    db.commit()
    return s


def _line_by_key(grid, key):
    for line in grid.lines:
        if line.line_key == key:
            return line
    return None


# ---------------------------------------------------------------------------
# read_anchor_grid
# ---------------------------------------------------------------------------

def test_anchor_read_internal_and_external_shape(db):
    _project(db)
    _forecast(db, "proj-res", "2026-05", "internal", "R-DEV", 8000.0, hours=100.0)
    _forecast(db, "proj-res", "2026-06", "internal", "R-DEV", 8800.0, hours=110.0)
    _forecast(db, "proj-res", "2026-06", "external", "EC-CONSULT", 5000.0, vendor="Acme")
    db.commit()

    grid = read_anchor_grid(db, "proj-res")

    assert grid.project_id == "proj-res"
    assert grid.start_month == "2026-05"
    assert grid.end_month == "2026-08"

    internal = _line_by_key(grid, "internal|R-DEV|")
    assert internal is not None
    assert internal.kind == LINE_KIND_INTERNAL
    assert internal.category == "internal"
    assert internal.cells["2026-05"].amount_eur == 8000.0
    assert internal.cells["2026-05"].hours == 100.0
    assert internal.cells["2026-06"].hours == 110.0

    external = _line_by_key(grid, "external|EC-CONSULT|")
    assert external is not None
    assert external.kind == LINE_KIND_EXTERNAL
    assert external.vendor == "Acme"
    assert external.cells["2026-06"].amount_eur == 5000.0
    assert external.cells["2026-06"].hours is None


def test_anchor_read_falls_back_to_cell_minmax_when_no_project_end(db):
    # Service-style project: end_month is null -> derive end from cells.
    _project(db, pid="proj-svc", start="2026-05", end=None)
    _forecast(db, "proj-svc", "2026-05", "internal", "R-DEV", 1000.0, hours=10.0)
    _forecast(db, "proj-svc", "2026-09", "internal", "R-DEV", 1000.0, hours=10.0)
    db.commit()

    grid = read_anchor_grid(db, "proj-svc")
    assert grid.start_month == "2026-05"
    assert grid.end_month == "2026-09"


# ---------------------------------------------------------------------------
# Overlay precedence — hand-edits-win
# ---------------------------------------------------------------------------

def test_overlay_cell_edit_wins(db):
    _project(db)
    _forecast(db, "proj-res", "2026-06", "internal", "R-DEV", 8800.0, hours=110.0)
    db.commit()
    scenario = _scenario(db)

    db.add(ScenarioForecastCellEdit(
        scenario_id=scenario.id,
        project_id="proj-res",
        line_key="internal|R-DEV|",
        month="2026-06",
        field="hours",
        value=120.0,
    ))
    db.commit()

    grid = resolve_project_grid(db, scenario, "proj-res")
    internal = _line_by_key(grid, "internal|R-DEV|")
    assert internal.cells["2026-06"].hours == 120.0  # edited value wins
    # € is recomputed from the edited hours via the rate-at-month lookup (no
    # RateTable seeded → DEFAULT_HOURLY_RATE 120.0 fallback), so the
    # rollup/dashboard match what promote writes.
    assert internal.cells["2026-06"].amount_eur == 120.0 * 120.0


def test_overlay_external_amount_edit_wins(db):
    _project(db)
    _forecast(db, "proj-res", "2026-06", "external", "EC-CONSULT", 5000.0, vendor="Acme")
    db.commit()
    scenario = _scenario(db)

    db.add(ScenarioForecastCellEdit(
        scenario_id=scenario.id,
        project_id="proj-res",
        line_key="external|EC-CONSULT|",
        month="2026-06",
        field="amount_eur",
        value=7500.0,
    ))
    db.commit()

    grid = resolve_project_grid(db, scenario, "proj-res")
    external = _line_by_key(grid, "external|EC-CONSULT|")
    assert external.cells["2026-06"].amount_eur == 7500.0


# ---------------------------------------------------------------------------
# Absolute-month keying — the edit does NOT travel under a macro (spec §5.2)
# ---------------------------------------------------------------------------

def test_cell_edit_does_not_travel_under_delay(db):
    _project(db, start="2026-05", end="2026-06")
    _forecast(db, "proj-res", "2026-06", "internal", "R-DEV", 8800.0, hours=110.0)
    db.commit()
    scenario = _scenario(db)

    # delay by 2 months (Layer 1) AND an absolute-month hand edit on 2026-06.
    db.add(ScenarioAction(
        scenario_id=scenario.id,
        action_order=1,
        scope="project",
        action_type="delay_project",
        project_id="proj-res",
        parameters_json='{"months": 2}',
    ))
    db.add(ScenarioForecastCellEdit(
        scenario_id=scenario.id,
        project_id="proj-res",
        line_key="internal|R-DEV|",
        month="2026-06",
        field="hours",
        value=120.0,
    ))
    db.commit()

    grid = resolve_project_grid(db, scenario, "proj-res")
    internal = _line_by_key(grid, "internal|R-DEV|")

    # The macro shifted the original 2026-06 cell to 2026-08 (110h, 8800 EUR).
    assert internal.cells["2026-08"].hours == 110.0
    assert internal.cells["2026-08"].amount_eur == 8800.0
    # The hand edit stayed on its absolute month 2026-06 (did NOT travel), and
    # its € was recomputed from the edited hours (DEFAULT_HOURLY_RATE 120.0 fallback).
    assert internal.cells["2026-06"].hours == 120.0
    assert internal.cells["2026-06"].amount_eur == 120.0 * 120.0


# ---------------------------------------------------------------------------
# Line add / remove overlay
# ---------------------------------------------------------------------------

def test_overlay_add_line(db):
    _project(db)
    _forecast(db, "proj-res", "2026-06", "internal", "R-DEV", 8800.0, hours=110.0)
    db.commit()
    scenario = _scenario(db)

    minted = "new:role:abc123"
    db.add(ScenarioLineEdit(
        scenario_id=scenario.id,
        project_id="proj-res",
        line_key=minted,
        op="add",
        line_kind=LINE_KIND_INTERNAL,
        category="internal",
        sub_category="R-QA",
        role_type_id="R-QA",
    ))
    db.add(ScenarioForecastCellEdit(
        scenario_id=scenario.id,
        project_id="proj-res",
        line_key=minted,
        month="2026-07",
        field="hours",
        value=40.0,
    ))
    db.commit()

    grid = resolve_project_grid(db, scenario, "proj-res")
    added = _line_by_key(grid, minted)
    assert added is not None
    assert added.kind == LINE_KIND_INTERNAL
    assert added.sub_category == "R-QA"
    assert added.cells["2026-07"].hours == 40.0


def test_overlay_remove_line(db):
    _project(db)
    _forecast(db, "proj-res", "2026-06", "internal", "R-DEV", 8800.0, hours=110.0)
    _forecast(db, "proj-res", "2026-06", "external", "EC-CONSULT", 5000.0, vendor="Acme")
    db.commit()
    scenario = _scenario(db)

    db.add(ScenarioLineEdit(
        scenario_id=scenario.id,
        project_id="proj-res",
        line_key="external|EC-CONSULT|",
        op="remove",
        line_kind=LINE_KIND_EXTERNAL,
        category="external",
        sub_category="EC-CONSULT",
    ))
    db.commit()

    grid = resolve_project_grid(db, scenario, "proj-res")
    assert _line_by_key(grid, "external|EC-CONSULT|") is None
    assert _line_by_key(grid, "internal|R-DEV|") is not None


def test_overlay_edit_external_line_metadata(db):
    """An op='edit' overlay row (Session 3 T2) patches the resolved external
    line's vendor + cost-type grouping in place; per-month € is untouched."""
    _project(db)
    _forecast(db, "proj-res", "2026-06", "external", "EC-CONSULT", 5000.0, vendor="Acme")
    db.commit()
    scenario = _scenario(db)

    db.add(ScenarioLineEdit(
        scenario_id=scenario.id,
        project_id="proj-res",
        line_key="external|EC-CONSULT|",
        op="edit",
        line_kind=LINE_KIND_EXTERNAL,
        category="external",
        sub_category="EC-LICENSE",
        cost_type_id="EC-LICENSE",
        vendor="Umbrella",
        description="Renegotiated",
    ))
    db.commit()

    grid = resolve_project_grid(db, scenario, "proj-res")
    line = _line_by_key(grid, "external|EC-CONSULT|")
    assert line is not None                         # identity (line_key) unchanged
    assert line.vendor == "Umbrella"                # vendor patched
    assert line.sub_category == "EC-LICENSE"        # cost-type grouping patched
    assert line.cells["2026-06"].amount_eur == 5000.0  # € untouched by metadata edit


def test_overlay_edit_partial_keeps_vendor(db):
    """A cost-type-only edit leaves the resolved vendor at its anchor value."""
    _project(db)
    _forecast(db, "proj-res", "2026-06", "external", "EC-CONSULT", 5000.0, vendor="Acme")
    db.commit()
    scenario = _scenario(db)

    db.add(ScenarioLineEdit(
        scenario_id=scenario.id,
        project_id="proj-res",
        line_key="external|EC-CONSULT|",
        op="edit",
        line_kind=LINE_KIND_EXTERNAL,
        category="external",
        sub_category="EC-LICENSE",
        cost_type_id="EC-LICENSE",
        vendor=None,
    ))
    db.commit()

    grid = resolve_project_grid(db, scenario, "proj-res")
    line = _line_by_key(grid, "external|EC-CONSULT|")
    assert line.vendor == "Acme"                    # unchanged (edit.vendor was None)
    assert line.sub_category == "EC-LICENSE"


def test_resolve_no_overlay_no_macros_matches_anchor(db):
    _project(db)
    _forecast(db, "proj-res", "2026-06", "internal", "R-DEV", 8800.0, hours=110.0)
    db.commit()
    scenario = _scenario(db)

    grid = resolve_project_grid(db, scenario, "proj-res")
    internal = _line_by_key(grid, "internal|R-DEV|")
    assert internal.cells["2026-06"].hours == 110.0
    assert internal.cells["2026-06"].amount_eur == 8800.0


def test_hours_edit_moves_rolled_up_budget(db):
    """Regression for the review blocker: an hours cell edit must change the
    rolled-up adjusted_budget (resolution recomputes € from the edited hours),
    not leave it at the anchor value — so the dashboard matches what promote
    writes. Anchor 110h @ 8800€; edit to 120h @ 85.0 fallback → 10200€.
    """
    _project(db)
    _forecast(db, "proj-res", "2026-06", "internal", "R-DEV", 8800.0, hours=110.0)
    db.commit()
    scenario = _scenario(db)
    db.add(ScenarioForecastCellEdit(
        scenario_id=scenario.id, project_id="proj-res",
        line_key="internal|R-DEV|", month="2026-06", field="hours", value=120.0,
    ))
    db.commit()

    anchor = read_anchor_grid(db, "proj-res")
    adjusted = resolve_project_grid(db, scenario, "proj-res")
    state = rollup_grid(
        adjusted, anchor, project_name="Resolution Project",
        baseline_eur=8800.0, original_rag="green",
    )
    assert state["original_budget"] == 8800.0
    assert state["adjusted_budget"] == 120.0 * 120.0  # 14400.0 (DEFAULT_HOURLY_RATE fallback)
    assert state["budget_delta"] == pytest.approx(5600.0)
    assert state["is_affected"] is True


# ---------------------------------------------------------------------------
# Rate-at-month (S6 regression — CLAUDE.md "rate in effect at the time")
# ---------------------------------------------------------------------------

def test_hours_edit_prices_at_rate_in_force_at_month(db):
    """An hours edit prices each cell at the RateTable rate in force at *that
    cell's month*, not a single latest-wins rate. Two rate rows bracket the
    window; an edit in an earlier month must use the earlier rate even though a
    later (higher) rate exists (S6 rate-at-month fix)."""
    from decimal import Decimal

    from models.people import RateTable

    _project(db, start="2026-05", end="2026-07")
    # Role priced at €100 from 2025, stepping up to €150 from 2026-07.
    db.add(RateTable(role_type_id="R-STEP", competence_center_id="cc-x",
                     hourly_rate=Decimal("100.00"), effective_date="2025-01-01"))
    db.add(RateTable(role_type_id="R-STEP", competence_center_id="cc-x",
                     hourly_rate=Decimal("150.00"), effective_date="2026-07-01"))
    # Anchor: role carried in sub_category (rate lookup falls back to it).
    _forecast(db, "proj-res", "2026-06", "internal", "R-STEP", 1000.0, hours=10.0)
    _forecast(db, "proj-res", "2026-07", "internal", "R-STEP", 1500.0, hours=10.0)
    db.commit()

    scenario = _scenario(db)
    line_key = "internal|R-STEP|"
    db.add(ScenarioForecastCellEdit(
        scenario_id=scenario.id, project_id="proj-res",
        line_key=line_key, month="2026-06", field="hours", value=20.0,
    ))
    db.add(ScenarioForecastCellEdit(
        scenario_id=scenario.id, project_id="proj-res",
        line_key=line_key, month="2026-07", field="hours", value=20.0,
    ))
    db.commit()

    grid = resolve_project_grid(db, scenario, "proj-res")
    internal = _line_by_key(grid, line_key)
    # June prices at €100 (the €150 row is not yet effective); July at €150.
    assert internal.cells["2026-06"].amount_eur == 20.0 * 100.0
    assert internal.cells["2026-07"].amount_eur == 20.0 * 150.0


def test_edit_to_same_hours_leaves_eur_unchanged(db):
    """The 'edit-to-same-hours changes €' oddity is gone: re-entering a cell's
    existing hours re-prices it at the same rate-at-month, so € equals the
    anchor (which was itself priced at that rate)."""
    from decimal import Decimal

    from models.people import RateTable

    _project(db, start="2026-05", end="2026-06")
    db.add(RateTable(role_type_id="R-STEP", competence_center_id="cc-x",
                     hourly_rate=Decimal("100.00"), effective_date="2025-01-01"))
    _forecast(db, "proj-res", "2026-06", "internal", "R-STEP", 1000.0, hours=10.0)
    db.commit()

    scenario = _scenario(db)
    line_key = "internal|R-STEP|"
    db.add(ScenarioForecastCellEdit(
        scenario_id=scenario.id, project_id="proj-res",
        line_key=line_key, month="2026-06", field="hours", value=10.0,  # same as anchor
    ))
    db.commit()

    grid = resolve_project_grid(db, scenario, "proj-res")
    internal = _line_by_key(grid, line_key)
    assert internal.cells["2026-06"].hours == 10.0
    assert internal.cells["2026-06"].amount_eur == 1000.0  # unchanged from anchor
