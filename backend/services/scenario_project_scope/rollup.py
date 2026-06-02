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

from services.scenario_project_scope.types import (
    GridSplits,
    ProjectStateDict,
    ResolvedGrid,
)


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
    raise NotImplementedError("Stream B: rollup.rollup_grid")


def grid_splits(grid: ResolvedGrid) -> GridSplits:
    """Internal/external euro totals + per-role euro split read off the resolved
    grid (spec §6, §7). Internal € from internal-line cells, external € from
    external-line cells, ``by_role`` keyed by role_type_id.
    """
    raise NotImplementedError("Stream B: rollup.grid_splits")
