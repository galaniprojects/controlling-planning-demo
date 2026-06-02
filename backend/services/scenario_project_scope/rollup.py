"""Resolved-grid rollup (spec §6). **Stream B.**

Rolls a ``ResolvedGrid`` up into the SAME per-project state shape the existing
engine emits (``ProjectStateDict``) so the impact dashboard stays insulated, and
exposes the internal/external + per-role euro splits (``GridSplits``) the
investment-mix and outsourcing-ratio dimensions need — which the legacy
single-budget scalar could not express.

Stream B implements every function here and owns the accompanying tests. It can
build against fixture grids without waiting on Stream A's resolution internals.
"""
from __future__ import annotations

from typing import Optional

from services.calculations import compute_budget_rag, compute_plan_drift
from services.scenario_project_scope.types import (
    LINE_KIND_EXTERNAL,
    LINE_KIND_INTERNAL,
    GridSplits,
    ProjectStateDict,
    ResolvedGrid,
)

# Tolerance for float comparison when deciding whether the adjusted grid differs
# from the anchor (is_affected). Tight enough to ignore IEEE-754 noise only.
_AFFECTED_EPS = 1e-9


def _grid_total_eur(grid: ResolvedGrid) -> float:
    """Sum of every resolved cell's euro value across all lines."""
    return sum(
        cell.amount_eur
        for line in grid.lines
        for cell in line.cells.values()
    )


def _grids_differ(adjusted: ResolvedGrid, anchor: ResolvedGrid) -> bool:
    """True when the adjusted grid is not structurally identical to the anchor
    (any added/removed line, any added/removed cell, or any per-cell euro/hours
    difference beyond float noise)."""
    adj_lines = {line.line_key: line for line in adjusted.lines}
    anc_lines = {line.line_key: line for line in anchor.lines}
    if adj_lines.keys() != anc_lines.keys():
        return True
    for line_key, adj_line in adj_lines.items():
        anc_line = anc_lines[line_key]
        if adj_line.cells.keys() != anc_line.cells.keys():
            return True
        for month, adj_cell in adj_line.cells.items():
            anc_cell = anc_line.cells[month]
            if abs(adj_cell.amount_eur - anc_cell.amount_eur) > _AFFECTED_EPS:
                return True
            adj_h = adj_cell.hours or 0.0
            anc_h = anc_cell.hours or 0.0
            if abs(adj_h - anc_h) > _AFFECTED_EPS:
                return True
    return False


def rollup_grid(
    adjusted: ResolvedGrid,
    anchor: ResolvedGrid,
    *,
    project_name: str,
    baseline_eur: float,
    original_rag: Optional[str],
) -> ProjectStateDict:
    """Roll the resolved (``adjusted``) grid and the baseline (``anchor``) grid up
    into the per-project state dict: ``original_budget`` = Σ anchor €,
    ``adjusted_budget`` = Σ adjusted €, ``budget_delta`` = adjusted − original,
    ``adjusted_rag`` recomputed from drift vs ``baseline_eur`` (matching the
    legacy engine's RAG logic), ``is_affected`` True when adjusted differs from
    anchor. Returns a ``ProjectStateDict`` (no dates — those live on the grids).
    """
    original_budget = _grid_total_eur(anchor)
    adjusted_budget = _grid_total_eur(adjusted)
    budget_delta = adjusted_budget - original_budget

    # Mirror scenario_engine.recalculate_scenario exactly: drift of the adjusted
    # budget vs the project baseline, then RAG from that drift. A falsy baseline
    # collapses drift to 0 (-> green) like the engine's `if state["baseline"]`.
    drift = compute_plan_drift(adjusted_budget, baseline_eur) if baseline_eur else 0
    adjusted_rag = compute_budget_rag(drift)

    return ProjectStateDict(
        project_id=adjusted.project_id,
        project_name=project_name,
        original_budget=round(original_budget, 2),
        adjusted_budget=round(adjusted_budget, 2),
        budget_delta=round(budget_delta, 2),
        original_rag=original_rag,
        adjusted_rag=adjusted_rag,
        is_affected=_grids_differ(adjusted, anchor),
    )


def grid_splits(grid: ResolvedGrid) -> GridSplits:
    """Internal/external euro totals + per-role euro split read off the resolved
    grid (spec §6, §7). Internal € from internal-line cells, external € from
    external-line cells, ``by_role`` keyed by role_type_id.
    """
    internal_eur = 0.0
    external_eur = 0.0
    by_role: dict[str, float] = {}

    for line in grid.lines:
        line_eur = sum(cell.amount_eur for cell in line.cells.values())
        if line.kind == LINE_KIND_INTERNAL:
            internal_eur += line_eur
            if line.role_type_id is not None:
                by_role[line.role_type_id] = by_role.get(line.role_type_id, 0.0) + line_eur
        elif line.kind == LINE_KIND_EXTERNAL:
            external_eur += line_eur

    return GridSplits(
        internal_eur=internal_eur,
        external_eur=external_eur,
        by_role=by_role,
    )
