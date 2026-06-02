"""Macro semantics — curve transforms over the resolved cells (spec §4). **Stream A.**

Four configurable macros, each a function of the anchor curve (not frozen
numbers), re-derived against a rebased anchor:

  - ``delay_project`` (N)      — shift start, end, and every cell N months later;
                                  curve shape and total preserved.
  - ``accelerate_project`` (N) — exact mirror of delay; pull N months earlier.
                                  **Clamp:** the curve cannot move earlier than the
                                  current open forecast month; if N would push the
                                  start into the past, clamp to the max legal value
                                  and emit a note. **Symmetry:** delay(+N) then
                                  accelerate(−N) returns the original curve.
  - ``pause_project`` (N)      — suspend N months; the remaining curve resumes after.
  - ``remove_project``         — drop the project from the scenario portfolio for
                                  impact purposes.

Macros are ordered (delay-then-accelerate is meaningful and the sequence is
preserved). The coarse catalogue actions survive only as the compile target for
macros + portfolio scope — they are NOT the compile target for project-scope
cell edits (those route via the overlay diff directly, spec §6).

Stream A implements every function here and owns the accompanying tests.

**Past-freeze (spec §4 universal rule).** "Nothing may reshape the past." A
macro only moves cells in the *movable* region — months ``>= current_open_month``.
Cells strictly before the open month (the actuals region) are left untouched, and
the project ``start_month`` / ``end_month`` only shift when they themselves sit in
the movable region. Because every movable cell is shifted by the same signed
delta, the relabelling is a bijection that preserves curve shape and total, which
is what makes ``delay(+N)`` then ``accelerate(−N)`` an exact identity.
"""
from __future__ import annotations

import json

from config import DEMO_DATE
from models.scenarios import ScenarioAction
from services.calculations import add_months, month_diff
from services.scenario_project_scope.types import (
    MacroApplyResult,
    ResolvedCell,
    ResolvedGrid,
    ResolvedLine,
)


def current_open_forecast_month() -> str:
    """The clamp boundary + past-freeze line for project-scope macros.

    ``config.DEMO_DATE`` is the current demo month (April 2026). Spec §4's worked
    accelerate example — "you asked for 3; the project can move only 2" for a
    project starting 2026-06 — only yields 2 when the boundary is ``DEMO_DATE``
    itself (``month_diff("2026-04", "2026-06") == 2``). So the current open
    forecast month **is** ``DEMO_DATE``: the demo month is open for forecasting,
    and the months strictly before it are frozen actuals that no macro may
    reshape. (Integration note: the legacy aggregate engine treats
    ``month > DEMO_DATE`` as the editable future; this module deliberately uses
    ``>= DEMO_DATE`` to honour the §4 worked example. Flagged to the lead.)
    """
    return DEMO_DATE


# ---------------------------------------------------------------------------
# Grid cloning — macros are functional (never mutate their input grid), so the
# anchor read and any prior macro result survive for comparison / round-trips.
# ---------------------------------------------------------------------------

def _clone_cell(cell: ResolvedCell) -> ResolvedCell:
    return ResolvedCell(amount_eur=cell.amount_eur, hours=cell.hours)


def _clone_line(line: ResolvedLine) -> ResolvedLine:
    return ResolvedLine(
        line_key=line.line_key,
        category=line.category,
        kind=line.kind,
        sub_category=line.sub_category,
        role_type_id=line.role_type_id,
        vendor=line.vendor,
        cells={m: _clone_cell(c) for m, c in line.cells.items()},
    )


def _clone_grid(grid: ResolvedGrid) -> ResolvedGrid:
    return ResolvedGrid(
        project_id=grid.project_id,
        lines=[_clone_line(line) for line in grid.lines],
        start_month=grid.start_month,
        end_month=grid.end_month,
    )


# ---------------------------------------------------------------------------
# Parameter parsing
# ---------------------------------------------------------------------------

def _parse_params(action: ScenarioAction) -> dict:
    raw = action.parameters_json
    if not raw:
        return {}
    if isinstance(raw, dict):
        return raw
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except (TypeError, ValueError):
        return {}


def _get_n(params: dict, default: int = 1) -> int:
    """Read the month count N from a macro's parameters (delay/accelerate/pause).

    Accepts the natural per-macro keys used by the seed + AI advisor
    (``delay_months`` / ``advance_months`` / ``pause_months``) alongside the
    generic ones, so a macro's N is read regardless of which vocabulary produced
    the action.
    """
    for key in (
        "months", "months_forward",
        "delay_months", "advance_months", "pause_months",
        "n", "N", "value",
    ):
        if key in params and params[key] is not None:
            try:
                return int(params[key])
            except (TypeError, ValueError):
                pass
    return default


# ---------------------------------------------------------------------------
# Shared shift primitive
# ---------------------------------------------------------------------------

def _shift_grid(grid: ResolvedGrid, delta: int, open_month: str, *, from_month: str | None = None) -> None:
    """Relabel every movable cell month by ``delta`` (in place).

    A cell is *movable* when its month ``>= from_month`` (defaults to the open
    forecast month). Frozen cells (the actuals region) are left untouched.
    ``start_month`` / ``end_month`` shift only when they sit in the movable
    region. Shifting all movable months by the same delta is a bijection, so no
    collision with frozen months can occur (the clamp keeps the earliest movable
    month ``>= open_month``).
    """
    boundary = from_month or open_month
    for line in grid.lines:
        new_cells: dict[str, ResolvedCell] = {}
        for month, cell in line.cells.items():
            if month >= boundary:
                new_cells[add_months(month, delta)] = cell
            else:
                new_cells[month] = cell
        line.cells = new_cells
    if grid.start_month and grid.start_month >= boundary:
        grid.start_month = add_months(grid.start_month, delta)
    if grid.end_month and grid.end_month >= boundary:
        grid.end_month = add_months(grid.end_month, delta)


def _earliest_movable(grid: ResolvedGrid, open_month: str) -> str | None:
    """The earliest month occupied in the movable region (cells + start_month)."""
    candidates = [m for line in grid.lines for m in line.cells if m >= open_month]
    if grid.start_month and grid.start_month >= open_month:
        candidates.append(grid.start_month)
    return min(candidates) if candidates else None


# ---------------------------------------------------------------------------
# The four macros
# ---------------------------------------------------------------------------

def _delay(grid: ResolvedGrid, n: int, open_month: str) -> MacroApplyResult:
    n = max(0, n)
    out = _clone_grid(grid)
    if n:
        _shift_grid(out, n, open_month)
    return MacroApplyResult(grid=out, notes=[])


def _accelerate(grid: ResolvedGrid, n: int, open_month: str) -> MacroApplyResult:
    n = max(0, n)
    out = _clone_grid(grid)
    notes: list[str] = []

    earliest = _earliest_movable(out, open_month)
    max_legal = max(0, month_diff(open_month, earliest)) if earliest else 0
    legal = min(n, max_legal)

    if legal < n:
        notes.append(
            f"Accelerate clamped: you asked for {n}; the project can move only "
            f"{legal} month(s) before reaching the current open forecast month "
            f"({open_month})."
        )
    if legal:
        _shift_grid(out, -legal, open_month)
    return MacroApplyResult(grid=out, notes=notes)


def _pause(grid: ResolvedGrid, n: int, open_month: str, params: dict) -> MacroApplyResult:
    n = max(0, n)
    out = _clone_grid(grid)
    if not n:
        return MacroApplyResult(grid=out, notes=[])

    pause_start = params.get("start_month", params.get("from_month")) or open_month
    if pause_start < open_month:
        pause_start = open_month  # never reshape the past

    # Push the tail (months >= pause_start) out by N; the N suspended months
    # become empty and the remaining curve resumes thereafter.
    _shift_grid(out, n, open_month, from_month=pause_start)
    return MacroApplyResult(grid=out, notes=[])


def _remove(grid: ResolvedGrid) -> MacroApplyResult:
    out = _clone_grid(grid)
    out.lines = []
    return MacroApplyResult(
        grid=out,
        notes=["Project removed from the scenario portfolio for impact."],
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def apply_macro(
    grid: ResolvedGrid,
    action: ScenarioAction,
    *,
    current_open_month: str,
) -> MacroApplyResult:
    """Apply one Layer-1 macro transform to the grid, returning the transformed
    grid plus any notes (e.g. the accelerate clamp message). ``current_open_month``
    is the accelerate clamp boundary (YYYY-MM). ``action.action_type`` is one of
    ``models.scenarios.PROJECT_MACRO_ACTION_TYPES``; ``action.parameters_json``
    carries N.
    """
    action_type = action.action_type
    params = _parse_params(action)

    if action_type == "delay_project":
        return _delay(grid, _get_n(params), current_open_month)
    if action_type == "accelerate_project":
        return _accelerate(grid, _get_n(params), current_open_month)
    if action_type == "pause_project":
        return _pause(grid, _get_n(params), current_open_month, params)
    if action_type == "remove_project":
        return _remove(grid)

    # Unknown / non-macro action_type: defensive no-op clone.
    return MacroApplyResult(grid=_clone_grid(grid), notes=[])


def apply_macros(
    grid: ResolvedGrid,
    actions: list[ScenarioAction],
    *,
    current_open_month: str,
) -> MacroApplyResult:
    """Apply the ordered macro list to the grid in sequence, accumulating notes.
    Order is significant and preserved (spec §4).
    """
    current = grid
    notes: list[str] = []
    for action in actions:
        result = apply_macro(current, action, current_open_month=current_open_month)
        current = result.grid
        notes.extend(result.notes)
    if current is grid:
        # No macros applied — hand back an isolated clone so callers can mutate
        # (the overlay step) without touching the anchor read.
        current = _clone_grid(grid)
    return MacroApplyResult(grid=current, notes=notes)
