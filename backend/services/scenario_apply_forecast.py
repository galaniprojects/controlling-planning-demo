"""Scenario PL Apply-to-Forecast workflow per [B-PR-05].

PL-only path that stages the PL's own-project diffs from a scenario as
**draft Change Requests** the PL refines in the Workbench before submitting
into the normal CR workflow.

Per spec [B-PR-05] + the locked apply-to-CR product decision:
- Available during an active forecast cycle, including pre-existing
  scenarios.
- Only diffs within the PL's edit authority are carried forward (forecast
  grid values, milestone dates, resource plan changes on own projects).
- Portfolio-level / cross-project diffs are left behind with a message.
- Each eligible own-project diff becomes one **draft** ChangeRequest per
  cost centre (grouped exactly like the Rolling Forecast wizard), authored
  by the applying PL, tagged with ``source_scenario_id``. Apply NO LONGER
  writes provisional Forecast cells — the live forecast is left untouched
  until the PL submits the draft CR(s) through the normal workflow.
- Scenario is NOT consumed; same scenario can be applied multiple times
  (re-apply replaces this scenario's prior draft CRs for the project).

Per [B-OQ-02] working assumption: provenance note IS visible to the
controller in the resulting Change Requests' metadata.
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
from services.scenario_anchor import stale_message, stale_projects


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------

class ApplyToForecastError(Exception):
    """Surface for apply-to-forecast errors. Router maps to 409.

    Carries an optional ``hint`` (mirroring ``PromoteError``) so the stale-anchor
    guard can flag a ``"rebase"`` remediation. The router currently surfaces only
    ``message`` on the 409, so the rebase remediation is also baked into the
    message text — the ``hint`` is available for callers/tests that inspect the
    exception directly and for any future router that forwards it.
    """

    def __init__(self, message: str, *, hint: Optional[str] = None):
        super().__init__(message)
        self.message = message
        self.hint = hint


# ---------------------------------------------------------------------------
# Eligibility filter — only PL-edit-authority diffs carry forward
# ---------------------------------------------------------------------------

# Lever categories the PL can submit through the forecast cycle.
#
# Widened for Session 4 (spec §8, §10): the eligible-category set admits
# everything the project-scope editing surface can produce, so the WYSIWYG-plan
# promise does not break at the apply handoff. In particular:
#   - ``external_cost`` — added / removed / edited external-cost line items.
#   - ``forecast_grid`` already covers internal cell edits AND the structural
#     add/remove of role and external lines (``collect_overlay_diffs`` classifies
#     every ``ScenarioLineEdit`` as forecast_grid), so the resolved-grid diff
#     stages those line changes as draft-CR change details.
# Portfolio-level / cross-project diffs stay OUT — PL authority is own-project
# only, enforced by the scope + ownership checks in ``is_pl_carry_eligible``.
PL_FORECAST_CARRY_CATEGORIES = {
    "forecast_grid",
    "external_cost",
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
# Stale-anchor guard (spec §10) — shared with Promote
# ---------------------------------------------------------------------------

def assert_anchor_is_latest_cycle(db: Session, scenario: Scenario) -> None:
    """Refuse apply-to-forecast on a stale anchor, matching Promote (spec §10).

    A PL seeds *their own* live forecast cycle off the scenario, so a stale
    anchor would pre-fill the next cycle from an out-of-date baseline — exactly
    the silent drift the guard exists to prevent. We share Promote's per-project
    stale-guard (``services/scenario_anchor.stale_projects``) so a PL hitting a
    stale anchor gets the same rebase prompt a controller does, raised as an
    ``ApplyToForecastError`` (the router maps that to 409) with ``hint="rebase"``.

    No-cycle tolerance: a project without a ``cycle`` ForecastVersion is not
    evaluated, so the legacy demo state (no cycles) is a no-op. Once a project
    has a cycle, an anchor behind that project's latest cycle is refused — and
    only the stale project(s) are named.
    """
    stale = stale_projects(db, scenario)
    if stale:
        raise ApplyToForecastError(
            f"{stale_message(stale, verb='applying')} Apply-to-forecast would "
            "otherwise seed the next cycle from an out-of-date baseline.",
            hint="rebase",
        )


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

    # Stale-anchor guard (spec §10) — refuse on a stale anchor, rebase first.
    assert_anchor_is_latest_cycle(db, scenario)

    # The PL's led set must match the authoring boundary (dependencies.pl_leads_project):
    # a project counts as led via the persona's static project_ids OR via Project.pl_person_id.
    # Without the pl_person_id arm, a project led only that way (e.g. dynamically created) could
    # be authored against but silently skipped here.
    pl_projects = set(user.project_ids or []) | {
        pid
        for (pid,) in db.query(Project.id).filter(Project.pl_person_id == user.person_id)
    }
    actions = (
        db.query(ScenarioAction)
        .filter(ScenarioAction.scenario_id == scenario_id)
        .order_by(ScenarioAction.action_order)
        .all()
    )

    summary: list[dict] = []
    carried = 0
    skipped = 0

    # Stage each eligible project's diff into draft CR(s) once (cache by project).
    # Value = number of draft CRs created for that project (0 == empty diff).
    materialized: dict[str, int] = {}

    for a in actions:
        eligible, reason = is_pl_carry_eligible(a, pl_projects)
        if eligible:
            # Apply-to-CR path: diff the project's resolved (scenario-adjusted)
            # grid against the live forecast baseline and stage the changes as
            # draft Change Requests (one per cost centre) — NO provisional cells.
            if a.project_id not in materialized:
                materialized[a.project_id] = _materialize_project(
                    db, scenario, a.project_id, user,
                )
            crs_created = materialized[a.project_id]
            if crs_created > 0:
                summary.append({
                    "action_id": a.id,
                    "project_id": a.project_id,
                    "status": "carried",
                    "message": reason,
                    "change_requests_created": crs_created,
                })
                carried += 1
            else:
                summary.append({
                    "action_id": a.id,
                    "project_id": a.project_id,
                    "status": "skipped",
                    "message": (
                        f"{reason} (no change vs live forecast — no draft CR created)."
                    ),
                })
                skipped += 1
        else:
            summary.append({
                "action_id": a.id,
                "project_id": a.project_id,
                "status": "skipped",
                "message": reason,
            })
            skipped += 1

    # Overlay-only projects (spec §6, §10): a project edited purely via the
    # Layer-2 overlay has no ScenarioAction to iterate above, so it would never
    # carry forward. Enumerate the scenario's forecast overlay diffs and stage
    # the PL's own overlay-only projects as draft CRs (mirrors the promote path's
    # _overlay_forecast_routes). Non-owned overlay is left behind.
    #
    # Widened eligibility (spec §10): the ``forecast_grid`` filter below carries
    # the FULL project-scope edit surface, not just internal cell edits —
    # ``collect_overlay_diffs`` classifies every ``ScenarioLineEdit`` (external-
    # cost add/remove/edit AND role-line add/remove) as ``forecast_grid``, so a
    # project touched by those alone is staged, and ``_materialize_project``
    # resolves the full grid (cells + external lines + structural line changes)
    # and diffs it into draft CR change details. Portfolio / cross-project diffs
    # are not ``forecast_grid`` and stay left behind (PL authority is own-project
    # only).
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
            crs_created = _materialize_project(db, scenario, pid, user)
            materialized[pid] = crs_created
            if crs_created > 0:
                summary.append({
                    "action_id": None,
                    "project_id": pid,
                    "status": "carried",
                    "message": "Layer-2 overlay edits staged as draft CR(s) (no action).",
                    "change_requests_created": crs_created,
                })
                carried += 1
            else:
                summary.append({
                    "action_id": None,
                    "project_id": pid,
                    "status": "skipped",
                    "message": (
                        "Layer-2 overlay edits net to no change vs live forecast — "
                        "no draft CR created."
                    ),
                })
                skipped += 1
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
        "draft_change_requests_created": sum(
            s.get("change_requests_created", 0) for s in summary
        ),
        "summary": summary,
        "provenance_note": (
            "Provenance: scenario-originated changes staged as draft Change "
            "Requests for the PL to refine and submit. The live forecast is "
            "unchanged until submission. Visible to controller."
        ),
    }


def _materialize_project(
    db: Session, scenario: Scenario, project_id: str, user: CurrentUser,
) -> int:
    """Stage a project's scenario diff as draft Change Request(s).

    Resolves the project's adjusted plan (anchor -> macros -> overlay, spec §5.1)
    via the project-scope recompute core, diffs it against the live forecast
    baseline, and stages the per-cell changes as draft Change Requests — one per
    cost centre, authored by the applying PL, tagged with ``source_scenario_id``
    (re-apply replaces this scenario's prior draft CRs for the project). The live
    forecast is NOT mutated. Returns the number of draft CRs created (0 == empty
    diff, so no CR).
    """
    if not project_id:
        return 0

    from services.change_request_factory import (
        create_change_requests,
        group_details_by_cost_center,
    )
    from services.scenario_project_scope.resolution import (
        read_anchor_grid,
        resolve_project_grid,
    )
    from services.scenario_project_scope.routing import diff_grids_to_details

    anchor = read_anchor_grid(db, project_id)
    adjusted = resolve_project_grid(db, scenario, project_id)
    details = diff_grids_to_details(adjusted, anchor)
    if not details:
        return 0  # no change vs live forecast — no CR for this project

    groups = group_details_by_cost_center(
        db, project_id, details,
        summary_label="Scenario apply",
        justification=(
            f"Staged from What-If scenario #{scenario.id} "
            f"({scenario.name}) via apply-to-forecast."
        ),
    )
    crs = create_change_requests(
        db, project_id=project_id, submitted_by_id=user.person_id,
        groups=groups, initial_status="draft", source_scenario_id=scenario.id,
    )
    return len(crs)
