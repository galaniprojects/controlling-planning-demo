"""Stream A — project-scope macro tests (spec §4).

Covers: each macro (delay / accelerate / pause / remove), the accelerate clamp,
and the delay <-> accelerate symmetry round-trip (identity).
"""
from config import DEMO_DATE
from models.scenarios import ScenarioAction
from services.scenario_project_scope.macros import (
    apply_macro,
    apply_macros,
    current_open_forecast_month,
)
from services.scenario_project_scope.types import (
    LINE_KIND_INTERNAL,
    ResolvedCell,
    ResolvedGrid,
    ResolvedLine,
)


OPEN = current_open_forecast_month()  # == DEMO_DATE == "2026-04"


def _grid(cells, start="2026-06", end="2026-08"):
    """One internal line with the given {month: (amount, hours)} cells."""
    line = ResolvedLine(
        line_key="internal|R-DEV|",
        category="internal",
        kind=LINE_KIND_INTERNAL,
        sub_category="R-DEV",
        cells={m: ResolvedCell(amount_eur=a, hours=h) for m, (a, h) in cells.items()},
    )
    return ResolvedGrid(project_id="p1", lines=[line], start_month=start, end_month=end)


def _action(action_type, **params):
    import json
    return ScenarioAction(
        scenario_id=1,
        action_order=1,
        scope="project",
        action_type=action_type,
        project_id="p1",
        parameters_json=json.dumps(params) if params else None,
    )


def _line(grid):
    return grid.lines[0]


def _total(grid):
    return sum(c.amount_eur for line in grid.lines for c in line.cells.values())


# ---------------------------------------------------------------------------
# open month
# ---------------------------------------------------------------------------

def test_current_open_month_is_demo_date():
    assert current_open_forecast_month() == DEMO_DATE == "2026-04"


# ---------------------------------------------------------------------------
# delay
# ---------------------------------------------------------------------------

def test_delay_shifts_cells_and_dates_preserving_total():
    grid = _grid({"2026-06": (6000.0, 60.0), "2026-07": (7000.0, 70.0)})
    res = apply_macro(grid, _action("delay_project", months=2), current_open_month=OPEN)
    out = res.grid

    line = _line(out)
    assert "2026-06" not in line.cells
    assert "2026-07" not in line.cells
    assert line.cells["2026-08"].amount_eur == 6000.0
    assert line.cells["2026-08"].hours == 60.0
    assert line.cells["2026-09"].amount_eur == 7000.0
    assert out.start_month == "2026-08"  # 2026-06 + 2
    assert out.end_month == "2026-10"    # 2026-08 + 2
    assert _total(out) == _total(grid)   # total preserved
    assert res.notes == []


def test_delay_does_not_reshape_the_past():
    # A cell strictly before the open month is frozen; only movable cells shift.
    grid = _grid({"2026-03": (3000.0, 30.0), "2026-06": (6000.0, 60.0)}, start="2026-03")
    out = apply_macro(grid, _action("delay_project", months=1), current_open_month=OPEN).grid
    line = _line(out)
    assert line.cells["2026-03"].amount_eur == 3000.0  # frozen, untouched
    assert "2026-07" in line.cells and "2026-06" not in line.cells
    assert out.start_month == "2026-03"  # < open -> frozen


# ---------------------------------------------------------------------------
# accelerate
# ---------------------------------------------------------------------------

def test_accelerate_pulls_cells_earlier_preserving_total():
    grid = _grid({"2026-08": (8000.0, 80.0), "2026-09": (9000.0, 90.0)}, start="2026-08", end="2026-09")
    out = apply_macro(grid, _action("accelerate_project", months=2), current_open_month=OPEN).grid
    line = _line(out)
    assert line.cells["2026-06"].amount_eur == 8000.0
    assert line.cells["2026-07"].amount_eur == 9000.0
    assert out.start_month == "2026-06"
    assert out.end_month == "2026-07"
    assert _total(out) == _total(grid)


def test_accelerate_clamps_at_open_month_and_notes():
    # Start 2026-06; open is 2026-04 -> can move only 2; ask for 3.
    grid = _grid({"2026-06": (6000.0, 60.0)}, start="2026-06", end="2026-06")
    res = apply_macro(grid, _action("accelerate_project", months=3), current_open_month=OPEN)
    out = res.grid
    line = _line(out)
    assert "2026-04" in line.cells          # clamped to the open month, not earlier
    assert line.cells["2026-04"].amount_eur == 6000.0
    assert out.start_month == "2026-04"
    assert len(res.notes) == 1
    assert "only 2" in res.notes[0]
    assert "2026-04" in res.notes[0]


# ---------------------------------------------------------------------------
# pause
# ---------------------------------------------------------------------------

def test_pause_suspends_and_resumes_tail():
    grid = _grid({"2026-06": (6000.0, 60.0), "2026-07": (7000.0, 70.0)}, start="2026-06", end="2026-07")
    out = apply_macro(
        grid, _action("pause_project", months=2, start_month="2026-07"),
        current_open_month=OPEN,
    ).grid
    line = _line(out)
    # Cells before the pause point are untouched; the tail moves out by 2.
    assert line.cells["2026-06"].amount_eur == 6000.0
    assert "2026-07" not in line.cells       # suspended month is empty
    assert line.cells["2026-09"].amount_eur == 7000.0
    assert out.end_month == "2026-09"
    assert _total(out) == _total(grid)


# ---------------------------------------------------------------------------
# remove
# ---------------------------------------------------------------------------

def test_remove_drops_all_lines():
    grid = _grid({"2026-06": (6000.0, 60.0)})
    res = apply_macro(grid, _action("remove_project"), current_open_month=OPEN)
    assert res.grid.lines == []
    assert _total(res.grid) == 0.0
    assert len(res.notes) == 1


# ---------------------------------------------------------------------------
# symmetry — delay(+N) then accelerate(-N) == identity
# ---------------------------------------------------------------------------

def test_delay_then_accelerate_is_identity():
    cells = {"2026-06": (6000.0, 60.0), "2026-07": (7000.0, 70.0), "2026-08": (8000.0, 80.0)}
    grid = _grid(cells, start="2026-06", end="2026-08")

    res = apply_macros(
        grid,
        [_action("delay_project", months=3), _action("accelerate_project", months=3)],
        current_open_month=OPEN,
    )
    out = res.grid
    line = _line(out)

    assert set(line.cells.keys()) == set(cells.keys())
    for month, (amount, hours) in cells.items():
        assert line.cells[month].amount_eur == amount
        assert line.cells[month].hours == hours
    assert out.start_month == "2026-06"
    assert out.end_month == "2026-08"
    assert res.notes == []  # no clamp triggered on the round-trip


def test_apply_macros_preserves_order_and_isolates_anchor():
    grid = _grid({"2026-06": (6000.0, 60.0)}, start="2026-06", end="2026-06")
    out = apply_macros(grid, [_action("delay_project", months=1)], current_open_month=OPEN).grid
    # Original grid untouched (functional macros).
    assert "2026-06" in _line(grid).cells
    assert "2026-07" in _line(out).cells
