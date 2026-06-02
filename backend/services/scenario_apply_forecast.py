"""Scenario PL Apply-to-Forecast workflow per [B-PR-05].

PL-only path that pre-populates the next forecast cycle submission with
the PL's own-project diffs from a scenario.

Per spec [B-PR-05]:
- Available during an active forecast cycle, including pre-existing
  scenarios.
- Only diffs within the PL's edit authority are carried forward (forecast
  grid values, milestone dates, resource plan changes on own projects).
- Portfolio-level / cross-project diffs are left behind with a message.
- Scenario-originated values are marked with a provenance indicator
  (consistent with the ``is_provisional`` marker pattern from Cluster C).
- Scenario is NOT consumed; same scenario can be applied multiple times.

Per [B-OQ-02] working assumption: provenance note IS visible to the
controller in the resulting forecast submission metadata.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from models.financial import Forecast
from models.projects import Project
from models.scenarios import (
    Scenario, ScenarioAction, ScenarioApplyToForecastEvent,
)
from schemas.common import CurrentUser


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------

class ApplyToForecastError(Exception):
    """Surface for apply-to-forecast errors. Router maps to 409."""

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


# ---------------------------------------------------------------------------
# Eligibility filter — only PL-edit-authority diffs carry forward
# ---------------------------------------------------------------------------

# Lever categories the PL can submit through the forecast cycle.
PL_FORECAST_CARRY_CATEGORIES = {
    "forecast_grid",
    "milestone",
    "people",  # only when targeted at PL's own project
    "sourcing_mix",
}


def is_pl_carry_eligible(
    action: ScenarioAction, pl_project_ids: set[str],
) -> tuple[bool, str]:
    """Return (eligible, reason) for whether PL can carry this diff forward."""
    cat = action.lever_category or ""
    pid = action.project_id

    if action.scope != "project":
        return False, f"non-project scope '{action.scope}' — portfolio-level diffs cannot carry forward."

    if not pid:
        return False, "no project_id on action — cannot scope to PL authority."

    if pid not in pl_project_ids:
        return False, f"project '{pid}' is not owned by this PL."

    if cat not in PL_FORECAST_CARRY_CATEGORIES:
        # Best-effort fallback for legacy actions without lever_category set.
        if cat == "" and action.action_type in (
            "delay_project", "accelerate_project", "pause_project",
            "remove_project", "scale_budget", "reduce_budget",
            "increase_budget", "adjust_budget", "cut_consulting",
            "change_allocation",
        ):
            return True, "legacy own-project action carried forward."
        return False, f"category '{cat}' is not a PL-carry-forward category."

    return True, f"PL can carry forward {cat} diff."


# ---------------------------------------------------------------------------
# Top-level orchestrator
# ---------------------------------------------------------------------------

def apply_to_forecast(
    db: Session, *, scenario_id: int, user: CurrentUser,
    cycle_id: Optional[str] = None, cycle_label: Optional[str] = None,
) -> dict:
    """Carry a PL's own-project diffs from a scenario into the next cycle.

    Returns the audit summary; caller commits.
    """
    if user.role != "project_lead":
        raise ApplyToForecastError(
            "Apply-to-forecast is PL-only per [B-PR-05]. Controllers use Promote.",
        )

    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if scenario is None:
        raise ApplyToForecastError(f"Scenario {scenario_id} not found.")

    # PLs can apply scenarios they own OR published scenarios.
    if scenario.author_id != user.person_id and scenario.status != "published":
        raise ApplyToForecastError(
            "Cannot apply a non-published scenario you do not own.",
        )

    pl_projects = set(user.project_ids or [])
    actions = (
        db.query(ScenarioAction)
        .filter(ScenarioAction.scenario_id == scenario_id)
        .order_by(ScenarioAction.action_order)
        .all()
    )

    summary: list[dict] = []
    carried = 0
    skipped = 0

    # Materialise each eligible project's resolved grid once (cache by project).
    materialized: dict[str, int] = {}

    for a in actions:
        eligible, reason = is_pl_carry_eligible(a, pl_projects)
        if eligible:
            # De-stubbed write path (spec §6): materialise the project's resolved
            # values into the next cycle as provisional Forecast cells (values +
            # is_provisional=True), instead of merely flagging existing cells.
            if a.project_id not in materialized:
                materialized[a.project_id] = _materialize_project(
                    db, scenario, a.project_id,
                )
            cells_marked = materialized[a.project_id]
            summary.append({
                "action_id": a.id,
                "project_id": a.project_id,
                "status": "carried",
                "message": reason,
                "cells_marked_provisional": cells_marked,
            })
            carried += 1
        else:
            summary.append({
                "action_id": a.id,
                "project_id": a.project_id,
                "status": "skipped",
                "message": reason,
            })
            skipped += 1

    # Overlay-only projects (spec §6): a project edited purely via the Layer-2
    # overlay has no ScenarioAction to iterate above, so it would never carry
    # forward. Enumerate the scenario's forecast overlay diffs and materialise
    # the PL's own overlay-only projects (mirrors the promote path's
    # _overlay_forecast_routes). Non-owned overlay is left behind.
    from services.scenario_project_scope.routing import collect_overlay_diffs

    overlay_projects: dict[str, bool] = {}  # project_id -> owned-by-this-PL
    for d in collect_overlay_diffs(db, scenario):
        if d.lever_category != "forecast_grid" or not d.project_id:
            continue
        if d.project_id in materialized:
            continue  # already carried via an action above (dedupe)
        overlay_projects.setdefault(d.project_id, d.project_id in pl_projects)
    for pid, owned in overlay_projects.items():
        if owned:
            cells = _materialize_project(db, scenario, pid)
            materialized[pid] = cells
            summary.append({
                "action_id": None,
                "project_id": pid,
                "status": "carried",
                "message": "Layer-2 overlay edits carried forward (no action).",
                "cells_marked_provisional": cells,
            })
            carried += 1
        else:
            summary.append({
                "action_id": None,
                "project_id": pid,
                "status": "skipped",
                "message": f"project '{pid}' is not owned by this PL.",
            })
            skipped += 1

    event = ScenarioApplyToForecastEvent(
        scenario_id=scenario_id,
        applied_by_id=user.person_id,
        applied_at=datetime.utcnow(),
        cycle_id=cycle_id,
        cycle_label=cycle_label,
        diffs_carried_forward=carried,
        diffs_skipped=skipped,
        summary_json=json.dumps(summary, default=str),
    )
    db.add(event)
    db.flush()

    return {
        "scenario_id": scenario_id,
        "event_id": event.id,
        "applied_by": user.person_id,
        "applied_at": event.applied_at.isoformat(),
        "diffs_carried_forward": carried,
        "diffs_skipped": skipped,
        "summary": summary,
        "provenance_note": (
            "Provenance: scenario-originated values marked with "
            f"is_provisional=True. Visible to controller per [B-OQ-02]."
        ),
    }


def _materialize_project(db: Session, scenario: Scenario, project_id: str) -> int:
    """Materialise a project's resolved grid into provisional cells.

    Resolves the project's plan (anchor -> macros -> overlay, spec §5.1) via the
    project-scope recompute core, then writes the resolved values into the next
    cycle as Forecast cells with ``is_provisional=True`` AND values (spec §6) —
    replacing the legacy flag-only marking.
    """
    if not project_id:
        return 0

    from services.scenario_project_scope.resolution import resolve_project_grid
    from services.scenario_project_scope.routing import (
        materialize_provisional_cells,
    )

    grid = resolve_project_grid(db, scenario, project_id)
    return materialize_provisional_cells(db, scenario, [grid])
