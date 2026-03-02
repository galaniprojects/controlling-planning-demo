"""What-If scenario recalculation engine."""
from __future__ import annotations
import json
from sqlalchemy import func
from sqlalchemy.orm import Session
from config import DEMO_DATE
from models.financial import Baseline, Forecast
from models.projects import Project
from models.scenarios import Scenario, ScenarioAction, ScenarioCapacityImpact, ScenarioState
from services.calculations import compute_plan_drift, compute_budget_rag


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

        headline = scenario.headline_impact or ""

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
            },
            "project_states": project_states,
            "capacity_impacts": capacity_impacts,
        }
    else:
        # No snapshots — return basic state with actions
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
        return recalculate_scenario(db, scenario, actions)


def recalculate_scenario(db: Session, scenario: Scenario, actions: list[ScenarioAction]) -> dict:
    """Recalculate scenario from scratch by applying actions to current portfolio state."""
    projects = db.query(Project).filter(Project.is_active.is_(True)).all()
    
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
            "rag": p.rag_status, "lob_id": p.lob_id,
            "is_service": p.is_service, "is_affected": False,
            "start": p.start_month, "end": p.end_month,
        }

    # Apply actions
    action_list = []
    for a in actions:
        params = json.loads(a.parameters_json) if a.parameters_json else {}
        _apply_action(working, a.action_type, a.scope, a.project_id, params)
        action_list.append({
            "id": a.id, "action_order": a.action_order, "scope": a.scope,
            "action_type": a.action_type, "project_id": a.project_id,
            "parameters": params,
            "impact_delta": json.loads(a.impact_delta_json) if a.impact_delta_json else {},
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
        },
        "project_states": project_states,
        "capacity_impacts": [],
    }


def _apply_action(working: dict, action_type: str, scope: str, project_id: str | None, params: dict):
    """Apply a single action to the working state."""
    if scope == "project" and project_id and project_id in working:
        state = working[project_id]
        state["is_affected"] = True
        if action_type == "remove_project":
            state["adjusted_budget"] = 0
        elif action_type == "reduce_budget" or action_type == "adjust_budget":
            pct = params.get("percentage", params.get("pct", 0))
            if pct:
                state["adjusted_budget"] *= (1 - float(pct) / 100)
            amount = params.get("amount", 0)
            if amount:
                state["adjusted_budget"] += float(amount)
        elif action_type == "delay_project":
            pass  # Budget stays same, timeline shifts (not modeled in simple calc)
        elif action_type == "cut_consulting":
            pct = params.get("percentage", params.get("pct", 15))
            # Assume external costs are ~30% of budget
            state["adjusted_budget"] -= state["adjusted_budget"] * 0.3 * (float(pct) / 100)
    elif scope == "portfolio":
        if action_type == "across_the_board_cut":
            pct = params.get("percentage", params.get("pct", 0))
            for state in working.values():
                state["adjusted_budget"] *= (1 - float(pct) / 100)
                state["is_affected"] = True
        elif action_type == "reduce_lob" or action_type == "cut_by_lob":
            lob_id = params.get("lob_id")
            pct = params.get("percentage", params.get("pct", 0))
            for state in working.values():
                if state["lob_id"] == lob_id:
                    state["adjusted_budget"] *= (1 - float(pct) / 100)
                    state["is_affected"] = True
