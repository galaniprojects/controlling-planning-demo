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
"""
from __future__ import annotations

from models.scenarios import ScenarioAction
from services.scenario_project_scope.types import MacroApplyResult, ResolvedGrid


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
    raise NotImplementedError("Stream A: macros.apply_macro")


def apply_macros(
    grid: ResolvedGrid,
    actions: list[ScenarioAction],
    *,
    current_open_month: str,
) -> MacroApplyResult:
    """Apply the ordered macro list to the grid in sequence, accumulating notes.
    Order is significant and preserved (spec §4).
    """
    raise NotImplementedError("Stream A: macros.apply_macros")
