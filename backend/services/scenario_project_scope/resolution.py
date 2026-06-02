"""Project-scope recompute core — resolution (spec §5, §6). **Stream A.**

Resolves a scenario's plan for one project in the fixed order
``anchor → apply macros in order → overlay hand edits on top`` (spec §5.1),
with absolute-month keying (§5.2) and hand-edits-win precedence, into a
``ResolvedGrid`` (per role line / per external-cost line, per month: internal
hours / external €).

**Anchor cell source = LIVE Forecast rows**, keyed by
``(project_id, month, category, sub_category, role_type_id)`` — the only true
per-month source, the only one carrying hours, and the same keyspace the write
paths target. ``Scenario.anchor_forecast_version_id`` stays the pinned scalar
reference + stale-anchor guard; it is not the per-cell source.

Stream A implements every function here and owns the accompanying tests.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from models.scenarios import Scenario
from services.scenario_project_scope.types import ResolvedGrid


def read_anchor_grid(db: Session, project_id: str) -> ResolvedGrid:
    """Read the project's live Forecast rows into the baseline (pre-macro,
    pre-overlay) ``ResolvedGrid``. Internal rows carry hours + €; external rows
    carry €. ``line_key`` = natural composite "category|sub_category|role_type_id".
    """
    raise NotImplementedError("Stream A: resolution.read_anchor_grid")


def resolve_project_grid(db: Session, scenario: Scenario, project_id: str) -> ResolvedGrid:
    """Resolve ``anchor → macros → overlay`` into the per-line/per-month grid for
    one project (spec §5.1, §6). Macros (Layer 1) re-derive against the rebased
    anchor; the Layer-2 overlay is applied last (hand-edits-win), keyed to
    absolute months. Returns the fully-resolved (adjusted) grid.
    """
    raise NotImplementedError("Stream A: resolution.resolve_project_grid")
