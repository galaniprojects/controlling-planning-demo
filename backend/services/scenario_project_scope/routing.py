"""Direct overlay-diff routing + the two write paths (spec §6). **Stream C.**

Feeds the project-scope overlay diff DIRECTLY through the existing routing
decision (``scenario_promote.decide_routing``) — no synthetic-action round-trip.
Each Layer-2 overlay entry becomes a ``RoutableDiff`` and is individually
routable / promotable, so partial promote is preserved. Also de-stubs the two
write paths:

  - **promote ``direct_forecast_update``** — currently a no-op stub in
    ``scenario_promote.apply_routing``; becomes a real writer of live Forecast
    (and external-cost) rows for the own-project forecast_grid diffs.
  - **apply-to-forecast** — currently flags cells ``is_provisional=True`` WITHOUT
    values in ``scenario_apply_forecast``; becomes a materialiser that writes the
    resolved values into the next cycle as provisional cells.

Stream C implements every function here, then wires ``scenario_promote.py`` and
``scenario_apply_forecast.py`` to call them. The eligibility *widening* and
stale-anchor guard for apply-to-forecast are Session 4 — only the write
*capability* lands in Session 1. Stream C owns the accompanying tests and can
build against fixture overlays.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from models.scenarios import Scenario
from services.scenario_project_scope.types import RoutableDiff, ResolvedGrid


def collect_overlay_diffs(
    db: Session,
    scenario: Scenario,
    *,
    controller_user_id: Optional[str] = None,
) -> list[RoutableDiff]:
    """Read a scenario's Layer-2 overlay rows (cell / line / mix / plan edits) and
    present them as ``RoutableDiff``s, one per entry, classified by
    ``lever_category`` (cell/line on a forecast line → forecast_grid; mix →
    people/sourcing_mix; plan stage/DoI → pipeline_stage; etc.). When
    ``controller_user_id`` is given, resolve ``own`` (project.pl_person_id vs the
    controller) so forecast_grid diffs split direct-update vs change-request.
    """
    raise NotImplementedError("Stream C: routing.collect_overlay_diffs")


def write_forecast_cells(
    db: Session,
    scenario: Scenario,
    diffs: list[RoutableDiff],
    *,
    acting_user_id: str,
) -> int:
    """Promote's ``direct_forecast_update`` writer: apply the own-project
    forecast_grid overlay diffs to live Forecast (and external-cost) rows —
    upsert by ``(project_id, month, category, sub_category, role_type_id)``,
    insert minted lines, suppress removed lines. Returns the number of rows
    written. Replaces the demo stub in ``scenario_promote.apply_routing``.
    """
    raise NotImplementedError("Stream C: routing.write_forecast_cells")


def materialize_provisional_cells(
    db: Session,
    scenario: Scenario,
    grids: list[ResolvedGrid],
    *,
    cycle_id: Optional[str],
    cycle_label: Optional[str],
) -> int:
    """Apply-to-forecast writer: materialise resolved values into the next cycle as
    provisional Forecast cells (``is_provisional=True``) WITH values — replacing
    the current flag-only behaviour. Returns the number of cells written.
    """
    raise NotImplementedError("Stream C: routing.materialize_provisional_cells")
