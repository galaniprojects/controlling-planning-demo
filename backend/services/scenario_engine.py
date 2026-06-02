"""What-If scenario recalculation engine."""
from __future__ import annotations
import json
from collections import defaultdict
from sqlalchemy import func
from sqlalchemy.orm import Session
from config import DEMO_DATE
from models.capacity import Allocation
from models.financial import Baseline, Forecast
from models.organization import CostCenter
from models.people import Person, RateTable
from models.projects import Project
from models.scenarios import (
    Scenario, ScenarioAction, ScenarioCapacityImpact, ScenarioState,
    ScenarioForecastCellEdit, ScenarioLineEdit, PROJECT_MACRO_ACTION_TYPES,
)
from services.calculations import compute_plan_drift, compute_budget_rag, add_months, month_diff
from services.portfolio_service import get_project_entity_info, get_top_level_entity_type_id, _get_projects_for_entity_recursive


def _get_project_lob_id(db: Session, project_id: str) -> str:
    """Get the top-level entity ID for a project."""
    top_type = get_top_level_entity_type_id(db)
    info = get_project_entity_info(db, project_id, top_type)
    return info["id"] if info else ""

# Current year derived from demo date
_CY = int(DEMO_DATE.split("-")[0])


# Action type aliases — normalise advisor fixture names to engine names
_ACTION_ALIASES = {
    "defer_project": "delay_project",
    "delay": "delay_project",
    "accelerate": "accelerate_project",
    "remove": "remove_project",
    "pause": "pause_project",
    "change_resources": "change_allocation",
}


def _get_yearly_forecasts(db: Session, project_ids: list[str]) -> dict[str, dict[int, float]]:
    """Return {project_id: {year: total_forecast}} for given projects."""
    rows = (
        db.query(
            Forecast.project_id,
            func.substr(Forecast.month, 1, 4),
            func.sum(Forecast.amount_eur),
        )
        .filter(Forecast.project_id.in_(project_ids))
        .group_by(Forecast.project_id, func.substr(Forecast.month, 1, 4))
        .all()
    )
    result: dict[str, dict[int, float]] = defaultdict(dict)
    for pid, year_str, amt in rows:
        result[pid][int(year_str)] = float(amt)
    return dict(result)


def _build_time_frame_breakdown(
    yearly_original: dict[int, float],
    yearly_adjusted: dict[int, float],
) -> list[dict]:
    """Build the CY / NY / subsequent / Overall breakdown."""
    all_years = sorted(y for y in (set(yearly_original.keys()) | set(yearly_adjusted.keys())) if y >= _CY)
    segments = []
    for y in all_years:
        orig = yearly_original.get(y, 0.0)
        adj = yearly_adjusted.get(y, 0.0)
        label = "CY" if y == _CY else str(y)
        segments.append({
            "label": label,
            "year": y,
            "original": round(orig, 2),
            "adjusted": round(adj, 2),
            "delta": round(adj - orig, 2),
        })
    # Overall
    total_orig = sum(yearly_original.values())
    total_adj = sum(yearly_adjusted.values())
    segments.append({
        "label": "Overall",
        "year": None,
        "original": round(total_orig, 2),
        "adjusted": round(total_adj, 2),
        "delta": round(total_adj - total_orig, 2),
    })
    return segments


def _grid_yearly_totals(grid) -> dict[int, float]:
    """Sum a resolved grid's cell € by calendar year — used so the time-frame
    breakdown reflects a macro's temporal shift (a delay moves € across year
    boundaries), rather than re-using the pre-shift per-year ratio."""
    totals: dict[int, float] = defaultdict(float)
    for line in grid.lines:
        for month, cell in line.cells.items():
            totals[int(month[:4])] += cell.amount_eur
    return dict(totals)


def _get_year_scoped_forecast(db: Session, project_id: str, target_years: list[str]) -> float:
    """Sum of Forecast.amount_eur for a project filtered to specific years."""
    return float(
        db.query(func.coalesce(func.sum(Forecast.amount_eur), 0))
        .filter(
            Forecast.project_id == project_id,
            func.substr(Forecast.month, 1, 4).in_(target_years),
        )
        .scalar()
    )


def get_scenario_state(db: Session, scenario_id: int) -> dict:
    """Get full scenario state — from snapshots if available, otherwise recalculate."""
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        return None

    states = db.query(ScenarioState).filter(ScenarioState.scenario_id == scenario_id).all()
    capacity = db.query(ScenarioCapacityImpact).filter(ScenarioCapacityImpact.scenario_id == scenario_id).all()
    actions = db.query(ScenarioAction).filter(ScenarioAction.scenario_id == scenario_id).order_by(ScenarioAction.action_order).all()

    if states:
        # Pre-computed snapshots exist
        project_states = []
        total_original = 0.0
        total_adjusted = 0.0
        rag_dist = {"green": 0, "amber": 0, "red": 0}

        for s in states:
            project_states.append({
                "project_id": s.project_id,
                "project_name": db.query(Project.name).filter(Project.id == s.project_id).scalar() or s.project_id,
                "original_budget": float(s.original_budget),
                "adjusted_budget": float(s.adjusted_budget),
                "budget_delta": float(s.budget_delta),
                "original_rag": s.original_rag,
                "adjusted_rag": s.adjusted_rag,
                "is_affected": s.is_affected,
            })
            total_original += float(s.original_budget)
            total_adjusted += float(s.adjusted_budget)
            if s.adjusted_rag:
                rag_dist[s.adjusted_rag] = rag_dist.get(s.adjusted_rag, 0) + 1

        capacity_impacts = [
            {
                "cost_center_id": c.cost_center_id,
                "month": c.month,
                "original_utilization_pct": float(c.original_utilization_pct),
                "adjusted_utilization_pct": float(c.adjusted_utilization_pct),
                "fte_delta": float(c.fte_delta),
            }
            for c in capacity
        ]

        action_list = [
            {
                "id": a.id, "action_order": a.action_order, "scope": a.scope,
                "action_type": a.action_type, "project_id": a.project_id,
                "parameters": json.loads(a.parameters_json) if a.parameters_json else {},
                "impact_delta": json.loads(a.impact_delta_json) if a.impact_delta_json else {},
                "group_label": a.group_label,
            }
            for a in actions
        ]

        # headline_impact is stored as JSON string for the scenario list;
        # the workspace generates a proper narrative, so leave headline empty here.
        headline = ""

        # SIM-03: compute time-frame breakdown from snapshots. Projects edited by
        # a macro have a shifted curve the persisted scalar can't express, so
        # re-resolve those at read time for the year buckets (spec §5 finding);
        # non-macro projects keep the cheap proportional distribution.
        pid_list = [s.project_id for s in states]
        yearly_fc = _get_yearly_forecasts(db, pid_list)
        macro_pids = {
            a.project_id for a in actions
            if a.scope == "project" and a.project_id
            and _ACTION_ALIASES.get(a.action_type, a.action_type) in PROJECT_MACRO_ACTION_TYPES
        }
        macro_yearly_adj: dict[str, dict[int, float]] = {}
        if macro_pids:
            from services.scenario_project_scope.resolution import resolve_project_grid
            for pid in macro_pids:
                macro_yearly_adj[pid] = _grid_yearly_totals(
                    resolve_project_grid(db, scenario, pid)
                )
        yearly_orig_totals: dict[int, float] = defaultdict(float)
        yearly_adj_totals: dict[int, float] = defaultdict(float)
        for s in states:
            proj_yearly = yearly_fc.get(s.project_id, {})
            for yr, amt in proj_yearly.items():
                yearly_orig_totals[yr] += amt
            if s.project_id in macro_yearly_adj:
                for yr, amt in macro_yearly_adj[s.project_id].items():
                    yearly_adj_totals[yr] += amt
            else:
                proj_total = sum(proj_yearly.values()) or 1.0
                for yr, amt in proj_yearly.items():
                    ratio = amt / proj_total if proj_total else 0
                    yearly_adj_totals[yr] += float(s.adjusted_budget) * ratio
        breakdown = _build_time_frame_breakdown(
            dict(yearly_orig_totals), dict(yearly_adj_totals)
        )

        return {
            "metadata": {
                "id": scenario.id, "name": scenario.name,
                "description": scenario.description, "status": scenario.status,
                "author_name": scenario.author.name if scenario.author else "",
            },
            "actions": action_list,
            "impact_dashboard": {
                "total_budget_original": round(total_original, 2),
                "total_budget_adjusted": round(total_adjusted, 2),
                "total_budget_delta": round(total_adjusted - total_original, 2),
                "rag_distribution": rag_dist,
                "headline": headline,
                "time_frame_breakdown": breakdown,
            },
            "project_states": project_states,
            "capacity_impacts": capacity_impacts,
        }
    else:
        return recalculate_scenario(db, scenario, actions)


def _project_scope_core_pids(
    db: Session, scenario: Scenario, actions: list[ScenarioAction], valid_pids: set[str],
) -> set[str]:
    """Projects whose edits use the two-layer model and therefore recompute via the
    project-scope core (spec §6) instead of the legacy aggregate path.

    A project is in the core set when it has a Layer-1 macro action
    (delay/accelerate/pause/remove) or a Layer-2 cell/line overlay row. Mix and
    plan overlays do not yet drive the financial grid this session, so they are
    deliberately excluded — any non-macro legacy project action on such a project
    still applies via ``_apply_project_action`` as the surviving compile target.
    """
    pids: set[str] = set()
    for a in actions:
        if a.scope == "project" and a.project_id in valid_pids:
            if _ACTION_ALIASES.get(a.action_type, a.action_type) in PROJECT_MACRO_ACTION_TYPES:
                pids.add(a.project_id)
    for model in (ScenarioForecastCellEdit, ScenarioLineEdit):
        for (pid,) in (
            db.query(model.project_id)
            .filter(model.scenario_id == scenario.id)
            .distinct()
            .all()
        ):
            if pid in valid_pids:
                pids.add(pid)
    return pids


def recalculate_scenario(db: Session, scenario: Scenario, actions: list[ScenarioAction]) -> dict:
    """Recalculate scenario from scratch by applying actions to current portfolio state."""
    projects = db.query(Project).filter(Project.is_active.is_(True)).all()
    project_ids = [p.id for p in projects]

    # SIM-03: pre-fetch per-year forecast totals for time-frame breakdown
    yearly_fc = _get_yearly_forecasts(db, project_ids)

    # Build working state: project_id -> {budget, rag, ...}
    working = {}
    for p in projects:
        baseline = float(
            db.query(func.coalesce(func.sum(Baseline.amount_eur), 0))
            .filter(Baseline.project_id == p.id).scalar()
        )
        forecast = float(
            db.query(func.coalesce(func.sum(Forecast.amount_eur), 0))
            .filter(Forecast.project_id == p.id).scalar()
        )
        working[p.id] = {
            "name": p.name, "original_budget": forecast,
            "adjusted_budget": forecast, "baseline": baseline,
            "rag": p.rag_status, "lob_id": _get_project_lob_id(db, p.id),
            "is_service": p.is_service, "is_affected": False,
            "start": p.start_month, "end": p.end_month,
            "status": p.pipeline_stage,
        }

    # Project-scope recompute core (spec §6): projects whose edits use the
    # two-layer model (Layer-1 macros and/or Layer-2 cell/line overlay) recompute
    # via the resolved cell grid → rollup, replacing the legacy aggregate path for
    # those projects. Non-macro legacy project actions on other projects still
    # apply below as the surviving compile target.
    from services.scenario_project_scope import resolution as _ps_resolution
    from services.scenario_project_scope import rollup as _ps_rollup
    from services.scenario_project_scope import macros as _ps_macros

    core_pids = _project_scope_core_pids(db, scenario, actions, set(working.keys()))
    macro_notes: list[str] = []
    # Per-year adjusted € from the resolved grid, for core projects, so the
    # time-frame breakdown shows a macro's year-over-year shift (spec §5 finding).
    core_yearly_adj: dict[str, dict[int, float]] = {}
    if core_pids:
        open_month = _ps_macros.current_open_forecast_month()
        for pid in core_pids:
            state = working[pid]
            anchor_grid = _ps_resolution.read_anchor_grid(db, pid)
            adjusted_grid = _ps_resolution.resolve_project_grid(db, scenario, pid)
            ps = _ps_rollup.rollup_grid(
                adjusted_grid, anchor_grid,
                project_name=state["name"], baseline_eur=state["baseline"],
                original_rag=state["rag"],
            )
            state["adjusted_budget"] = ps["adjusted_budget"]
            state["is_affected"] = ps["is_affected"]
            core_yearly_adj[pid] = _grid_yearly_totals(adjusted_grid)
            if adjusted_grid.start_month:
                state["start"] = adjusted_grid.start_month
            if adjusted_grid.end_month:
                state["end"] = adjusted_grid.end_month
            # Surface macro clamp messages (spec §4). resolve_project_grid returns
            # only the grid, so re-derive notes from the ordered macros directly.
            proj_macros = [
                a for a in actions
                if a.scope == "project" and a.project_id == pid
                and _ACTION_ALIASES.get(a.action_type, a.action_type) in PROJECT_MACRO_ACTION_TYPES
            ]
            if proj_macros:
                macro_notes.extend(
                    _ps_macros.apply_macros(
                        anchor_grid, proj_macros, current_open_month=open_month,
                    ).notes
                )

    # Apply actions — compute per-action budget delta. Project-scope actions on
    # core projects were already applied by the core above (it is authoritative),
    # so skip them here while still recording them in the action list.
    action_list = []
    for a in actions:
        params = json.loads(a.parameters_json) if a.parameters_json else {}
        core_handled = a.scope == "project" and a.project_id in core_pids

        # Use pre-computed delta if available (pre-seeded scenarios)
        if a.impact_delta_json:
            if not core_handled:
                _apply_action(db, working, a.action_type, a.scope, a.project_id, params)
            action_list.append({
                "id": a.id, "action_order": a.action_order, "scope": a.scope,
                "action_type": a.action_type, "project_id": a.project_id,
                "parameters": params,
                "impact_delta": json.loads(a.impact_delta_json),
                "group_label": a.group_label,
            })
        elif core_handled:
            action_list.append({
                "id": a.id, "action_order": a.action_order, "scope": a.scope,
                "action_type": a.action_type, "project_id": a.project_id,
                "parameters": params, "impact_delta": {},
                "group_label": a.group_label,
            })
        else:
            # Snapshot total budget before, apply, snapshot after
            before = sum(s["adjusted_budget"] for s in working.values())
            _apply_action(db, working, a.action_type, a.scope, a.project_id, params)
            after = sum(s["adjusted_budget"] for s in working.values())
            budget_delta = round(after - before, 2)
            action_list.append({
                "id": a.id, "action_order": a.action_order, "scope": a.scope,
                "action_type": a.action_type, "project_id": a.project_id,
                "parameters": params,
                "impact_delta": {"budget_delta": budget_delta},
                "group_label": a.group_label,
            })

    # Build result
    project_states = []
    total_original = 0.0
    total_adjusted = 0.0
    rag_dist = {"green": 0, "amber": 0, "red": 0}

    for pid, state in working.items():
        delta = state["adjusted_budget"] - state["original_budget"]
        drift = compute_plan_drift(state["adjusted_budget"], state["baseline"]) if state["baseline"] else 0
        adj_rag = compute_budget_rag(drift)
        project_states.append({
            "project_id": pid, "project_name": state["name"],
            "original_budget": round(state["original_budget"], 2),
            "adjusted_budget": round(state["adjusted_budget"], 2),
            "budget_delta": round(delta, 2),
            "original_rag": state["rag"], "adjusted_rag": adj_rag,
            "is_affected": state["is_affected"],
        })
        total_original += state["original_budget"]
        total_adjusted += state["adjusted_budget"]
        if adj_rag:
            rag_dist[adj_rag] = rag_dist.get(adj_rag, 0) + 1

    # SIM-03: compute time-frame breakdown. Core (new-model) projects use the
    # resolved grid's per-year € so a macro's temporal shift is visible (spec §5);
    # non-core projects keep the proportional original-ratio distribution.
    yearly_orig_totals: dict[int, float] = defaultdict(float)
    yearly_adj_totals: dict[int, float] = defaultdict(float)
    for pid, state in working.items():
        proj_yearly = yearly_fc.get(pid, {})
        for yr, amt in proj_yearly.items():
            yearly_orig_totals[yr] += amt
        if pid in core_yearly_adj:
            for yr, amt in core_yearly_adj[pid].items():
                yearly_adj_totals[yr] += amt
        else:
            proj_total = sum(proj_yearly.values()) or 1.0
            for yr, amt in proj_yearly.items():
                ratio = amt / proj_total if proj_total else 0
                yearly_adj_totals[yr] += state["adjusted_budget"] * ratio
    breakdown = _build_time_frame_breakdown(
        dict(yearly_orig_totals), dict(yearly_adj_totals)
    )

    return {
        "metadata": {
            "id": scenario.id, "name": scenario.name,
            "description": scenario.description, "status": scenario.status,
            "author_name": scenario.author.name if scenario.author else "",
        },
        "actions": action_list,
        "impact_dashboard": {
            "total_budget_original": round(total_original, 2),
            "total_budget_adjusted": round(total_adjusted, 2),
            "total_budget_delta": round(total_adjusted - total_original, 2),
            "rag_distribution": rag_dist,
            "time_frame_breakdown": breakdown,
            "macro_notes": macro_notes,
        },
        "project_states": project_states,
        "capacity_impacts": [],
    }


def _apply_action(db: Session, working: dict, action_type: str, scope: str,
                   project_id: str | None, params: dict):
    """Apply a single action to the working state."""
    # Normalise aliases
    action_type = _ACTION_ALIASES.get(action_type, action_type)

    if scope == "project" and project_id and project_id in working:
        _apply_project_action(db, working, action_type, project_id, params)
    elif scope == "portfolio":
        _apply_portfolio_action(db, working, action_type, params)


# ---------------------------------------------------------------------------
# Project-scoped actions
# ---------------------------------------------------------------------------

def _apply_project_action(db: Session, working: dict, action_type: str,
                          project_id: str, params: dict):
    state = working[project_id]
    state["is_affected"] = True

    # SIM-04: year-scoped actions
    target_years = params.get("target_years")

    if action_type == "remove_project":
        if target_years:
            # Remove only forecast for target years
            scoped = _get_year_scoped_forecast(db, project_id, target_years)
            state["adjusted_budget"] -= scoped
        else:
            state["adjusted_budget"] = 0

    elif action_type in ("reduce_budget", "adjust_budget"):
        pct = params.get("percentage", params.get("pct", 0))
        if pct:
            if target_years:
                scoped = _get_year_scoped_forecast(db, project_id, target_years)
                state["adjusted_budget"] -= scoped * (float(pct) / 100)
            else:
                state["adjusted_budget"] *= (1 - float(pct) / 100)
        amount = params.get("amount", 0)
        if amount:
            state["adjusted_budget"] += float(amount)

    elif action_type == "increase_budget":
        amount = float(params.get("amount", 0))
        state["adjusted_budget"] += amount

    elif action_type == "delay_project":
        # Shift remaining budget forward by N months.
        # The first N future months become empty → that budget is "freed".
        months = int(params.get("months", params.get("months_forward", 3)))
        future_forecasts = (
            db.query(Forecast.month, func.sum(Forecast.amount_eur))
            .filter(Forecast.project_id == project_id, Forecast.month > DEMO_DATE)
            .group_by(Forecast.month)
            .order_by(Forecast.month)
            .all()
        )
        freed = sum(float(amt) for _month, amt in future_forecasts[:months])
        state["adjusted_budget"] -= freed
        if state["end"]:
            state["end"] = add_months(state["end"], months)

    elif action_type == "accelerate_project":
        # Project finishes sooner; small premium for compression.
        months = int(params.get("months", params.get("months_forward", 3)))
        future_total = float(
            db.query(func.coalesce(func.sum(Forecast.amount_eur), 0))
            .filter(Forecast.project_id == project_id, Forecast.month > DEMO_DATE)
            .scalar()
        )
        if state["end"] and state["start"]:
            remaining = month_diff(DEMO_DATE, state["end"])
            if remaining > 0:
                monthly_rate = future_total / remaining
                premium = monthly_rate * 0.05 * months
                state["adjusted_budget"] += premium
            state["end"] = add_months(state["end"], -months)

    elif action_type == "pause_project":
        # Zero out all budget from start_month onward.
        start_month = params.get("start_month", params.get("from_month", DEMO_DATE))
        paused = float(
            db.query(func.coalesce(func.sum(Forecast.amount_eur), 0))
            .filter(Forecast.project_id == project_id, Forecast.month >= start_month)
            .scalar()
        )
        state["adjusted_budget"] -= paused

    elif action_type == "change_allocation":
        # Add/remove/modify resource allocation — calculate EUR delta.
        role_type_id = params.get("role_type_id", params.get("role"))
        action_mode = params.get("action", "modify")
        hours_per_month = float(params.get("hours_per_month", params.get("hours_delta", 0)))
        start_month = params.get("start_month", params.get("from_month", DEMO_DATE))
        end_month = params.get("end_month", params.get("to_month", state.get("end") or "2027-12"))

        # Look up hourly rate for the role
        rate_entry = (
            db.query(RateTable)
            .filter(RateTable.role_type_id == role_type_id)
            .order_by(RateTable.effective_date.desc())
            .first()
        )
        hourly_rate = float(rate_entry.hourly_rate) if rate_entry else 85.0

        num_months = max(month_diff(start_month, end_month) + 1, 1)
        if action_mode == "remove":
            hours_per_month = -abs(hours_per_month)
        elif action_mode == "add":
            hours_per_month = abs(hours_per_month)

        delta = hours_per_month * hourly_rate * num_months
        state["adjusted_budget"] += delta

    elif action_type == "cut_consulting":
        pct = params.get("percentage", params.get("pct", 15))
        if target_years:
            scoped = _get_year_scoped_forecast(db, project_id, target_years)
            state["adjusted_budget"] -= scoped * 0.3 * (float(pct) / 100)
        else:
            state["adjusted_budget"] -= state["adjusted_budget"] * 0.3 * (float(pct) / 100)

    elif action_type == "adjust_external_cost":
        # Similar to cut_consulting but uses explicit percentage
        pct = float(params.get("adjustment_pct", params.get("percentage", 15)))
        state["adjusted_budget"] -= state["adjusted_budget"] * 0.3 * (abs(pct) / 100)


# ---------------------------------------------------------------------------
# Portfolio-scoped actions
# ---------------------------------------------------------------------------

def _apply_portfolio_action(db: Session, working: dict, action_type: str, params: dict):
    # SIM-04: year-scoped actions
    target_years = params.get("target_years")

    if action_type in ("across_the_board_cut", "apply_pct_cut"):
        pct = float(params.get("percentage", params.get("adjustment_pct", params.get("pct", 0))))
        for pid, state in working.items():
            if target_years:
                scoped = _get_year_scoped_forecast(db, pid, target_years)
                state["adjusted_budget"] -= scoped * (abs(pct) / 100)
            else:
                state["adjusted_budget"] *= (1 - abs(pct) / 100)
            state["is_affected"] = True

    elif action_type in ("reduce_lob", "cut_by_lob"):
        lob_id = params.get("lob_id")
        pct = float(params.get("percentage", params.get("pct", 0)))
        for pid, state in working.items():
            if state["lob_id"] == lob_id:
                if target_years:
                    scoped = _get_year_scoped_forecast(db, pid, target_years)
                    state["adjusted_budget"] -= scoped * (abs(pct) / 100)
                else:
                    state["adjusted_budget"] *= (1 - abs(pct) / 100)
                state["is_affected"] = True

    elif action_type == "cut_by_type":
        target_type = params.get("target_type", "all")
        pct = float(params.get("reduction_pct", params.get("percentage", 10)))
        for pid, state in working.items():
            match = (
                target_type == "all"
                or (target_type == "service" and state["is_service"])
                or (target_type == "project" and not state["is_service"])
            )
            if match:
                if target_years:
                    scoped = _get_year_scoped_forecast(db, pid, target_years)
                    state["adjusted_budget"] -= scoped * (abs(pct) / 100)
                else:
                    state["adjusted_budget"] *= (1 - abs(pct) / 100)
                state["is_affected"] = True

    elif action_type == "freeze_new_starts":
        cutoff_month = params.get("cutoff_month", DEMO_DATE)
        for state in working.values():
            if state["start"] and state["start"] > cutoff_month:
                state["adjusted_budget"] = 0
                state["is_affected"] = True

    elif action_type == "cap_cost_category":
        _apply_cap_cost_category(db, working, params)

    elif action_type == "rate_escalation":
        _apply_rate_escalation(db, working, params)


def _apply_cap_cost_category(db: Session, working: dict, params: dict):
    """Cap or percentage-cut a specific external cost type across the portfolio."""
    cost_type_id = params.get("cost_type_id", params.get("cost_type"))
    if not cost_type_id:
        return

    # SIM-04: year-scoped support
    target_years = params.get("target_years")

    # Gather total external cost by project for this cost type
    cap_q = db.query(Forecast.project_id, func.sum(Forecast.amount_eur)).filter(
        Forecast.category == "external",
        Forecast.sub_category == cost_type_id,
        Forecast.month > DEMO_DATE,
    )
    if target_years:
        cap_q = cap_q.filter(func.substr(Forecast.month, 1, 4).in_(target_years))
    results = cap_q.group_by(Forecast.project_id).all()
    total_by_project = {pid: float(amt) for pid, amt in results}
    grand_total = sum(total_by_project.values())

    if grand_total <= 0:
        return

    # Percentage-based variant (used by advisor fixtures)
    pct = params.get("percentage")
    if pct and not params.get("cap_amount"):
        pct = abs(float(pct))
        for pid, amt in total_by_project.items():
            if pid in working:
                working[pid]["adjusted_budget"] -= amt * (pct / 100)
                working[pid]["is_affected"] = True
        return

    # Absolute cap variant
    cap_amount = float(params.get("cap_amount", 0))
    if cap_amount <= 0:
        return
    cap_period = params.get("cap_period", "annual")
    if cap_period == "monthly":
        cap_amount *= 12

    if grand_total > cap_amount:
        reduction_ratio = 1 - (cap_amount / grand_total)
        for pid, amt in total_by_project.items():
            if pid in working:
                working[pid]["adjusted_budget"] -= amt * reduction_ratio
                working[pid]["is_affected"] = True


def _apply_rate_escalation(db: Session, working: dict, params: dict):
    """Model hourly rate increases by role, cost center, or location."""
    scope_type = params.get("scope_type")
    scope_values = params.get("scope_values", [])
    # Support single-value legacy format
    if not scope_values and params.get("scope_value"):
        scope_values = [params["scope_value"]]
    if not scope_type or not scope_values:
        return

    increase_pct = float(params.get("increase_pct", 5))
    effective_month = params.get("effective_month", DEMO_DATE)

    # Find matching person IDs
    person_query = db.query(Person.id).filter(Person.is_active.is_(True))
    if scope_type == "role":
        person_query = person_query.filter(Person.role_type_id.in_(scope_values))
    elif scope_type == "cost_center":
        person_query = person_query.filter(Person.cost_center_id.in_(scope_values))
    elif scope_type == "location":
        cc_ids = [
            row[0] for row in
            db.query(CostCenter.id).filter(CostCenter.location_id.in_(scope_values)).all()
        ]
        if not cc_ids:
            return
        person_query = person_query.filter(Person.cost_center_id.in_(cc_ids))
    else:
        return

    matching_person_ids = [row[0] for row in person_query.all()]
    if not matching_person_ids:
        return

    # Total allocated hours per project from effective_month onward
    allocations = (
        db.query(Allocation.project_id, func.sum(Allocation.hours))
        .filter(
            Allocation.person_id.in_(matching_person_ids),
            Allocation.month >= effective_month,
        )
        .group_by(Allocation.project_id)
        .all()
    )

    # Average hourly rate for matching people
    avg_rate = 85.0
    rate_result = (
        db.query(func.avg(RateTable.hourly_rate))
        .join(Person, Person.role_type_id == RateTable.role_type_id)
        .filter(Person.id.in_(matching_person_ids))
        .scalar()
    )
    if rate_result:
        avg_rate = float(rate_result)

    for pid, total_hours in allocations:
        if pid in working:
            current_cost = float(total_hours) * avg_rate
            increase = current_cost * (increase_pct / 100)
            working[pid]["adjusted_budget"] += increase
            working[pid]["is_affected"] = True
