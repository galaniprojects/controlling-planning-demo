"""What-If Simulator endpoints (Section 10.6) — 13 endpoints."""
from __future__ import annotations
import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session
from database import get_db
from dependencies import get_current_user, require_role
from models.projects import Project
from models.scenarios import (
    Scenario, ScenarioAction, ScenarioCapacityImpact, ScenarioState,
)
from schemas.common import CurrentUser
from schemas.scenarios import (
    ActionReorder, ActionRequest, AdvisorApply, AdvisorQuery,
    CompareRequest, ScenarioCreate, ScenarioListItem, ScenarioMetadataUpdate,
)
from services.scenario_engine import get_scenario_state, recalculate_scenario

router = APIRouter(prefix="/api/scenarios", tags=["What-If Simulator"])


# ---------------------------------------------------------------------------
# Scenario Manager (5 endpoints)
# ---------------------------------------------------------------------------

@router.get("")
def list_scenarios(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller", "executive")),
):
    """Get all scenarios (my + published)."""
    my = db.query(Scenario).filter(Scenario.author_id == user.person_id).all()
    published = db.query(Scenario).filter(Scenario.status == "published", Scenario.author_id != user.person_id).all()

    def to_item(s):
        return ScenarioListItem(
            id=s.id, name=s.name, description=s.description, status=s.status,
            author_name=s.author.name if s.author else "",
            created_at=str(s.created_at), modified_at=str(s.modified_at),
            headline_impact=s.headline_impact,
        )

    return {
        "my_scenarios": [to_item(s) for s in my],
        "published_scenarios": [to_item(s) for s in published],
    }


@router.post("")
def create_scenario(
    body: ScenarioCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller", "executive")),
):
    """Create a new scenario (optionally clone from existing)."""
    # Check 10-scenario cap
    count = db.query(func.count(Scenario.id)).filter(Scenario.author_id == user.person_id).scalar()
    if count >= 10:
        raise HTTPException(409, "Maximum 10 scenarios per user")

    scenario = Scenario(
        name=body.name, description=body.description,
        author_id=user.person_id, status="private",
    )
    db.add(scenario)
    db.flush()

    if body.clone_from:
        source_actions = (
            db.query(ScenarioAction)
            .filter(ScenarioAction.scenario_id == body.clone_from)
            .order_by(ScenarioAction.action_order).all()
        )
        for a in source_actions:
            new_action = ScenarioAction(
                scenario_id=scenario.id, action_order=a.action_order,
                scope=a.scope, action_type=a.action_type, project_id=a.project_id,
                parameters_json=a.parameters_json, impact_delta_json=a.impact_delta_json,
                group_label=a.group_label,
            )
            db.add(new_action)

    db.commit()
    db.refresh(scenario)
    return {"id": scenario.id, "name": scenario.name, "status": scenario.status}


@router.delete("/{scenario_id}")
def delete_scenario(
    scenario_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller", "executive")),
):
    """Delete a scenario (owner only)."""
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(404, "Scenario not found")
    if scenario.author_id != user.person_id:
        raise HTTPException(403, "Only the author can delete this scenario")

    db.query(ScenarioCapacityImpact).filter(ScenarioCapacityImpact.scenario_id == scenario_id).delete()
    db.query(ScenarioState).filter(ScenarioState.scenario_id == scenario_id).delete()
    db.query(ScenarioAction).filter(ScenarioAction.scenario_id == scenario_id).delete()
    db.delete(scenario)
    db.commit()
    return {"status": "deleted"}


@router.put("/{scenario_id}/publish")
def publish_scenario(
    scenario_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller", "executive")),
):
    """Publish a scenario."""
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(404, "Scenario not found")
    if scenario.author_id != user.person_id:
        raise HTTPException(403, "Only the author can publish")
    scenario.status = "published"
    db.commit()
    return {"id": scenario.id, "status": scenario.status}


@router.put("/{scenario_id}/unpublish")
def unpublish_scenario(
    scenario_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller", "executive")),
):
    """Unpublish a scenario."""
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(404, "Scenario not found")
    if scenario.author_id != user.person_id:
        raise HTTPException(403, "Only the author can unpublish")
    scenario.status = "private"
    db.commit()
    return {"id": scenario.id, "status": scenario.status}


# ---------------------------------------------------------------------------
# Workspace (2 endpoints)
# ---------------------------------------------------------------------------

@router.get("/{scenario_id}")
def get_scenario_detail(
    scenario_id: int,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role("controller", "executive")),
):
    """Get full scenario state."""
    state = get_scenario_state(db, scenario_id)
    if not state:
        raise HTTPException(404, "Scenario not found")
    return state


@router.put("/{scenario_id}/metadata")
def update_scenario_metadata(
    scenario_id: int,
    body: ScenarioMetadataUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller", "executive")),
):
    """Update scenario name/description."""
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(404, "Scenario not found")
    if scenario.author_id != user.person_id:
        raise HTTPException(403, "Only the author can update metadata")
    if body.name is not None:
        scenario.name = body.name
    if body.description is not None:
        scenario.description = body.description
    db.commit()
    return {"id": scenario.id, "name": scenario.name, "description": scenario.description}


# ---------------------------------------------------------------------------
# Actions (3 endpoints)
# ---------------------------------------------------------------------------

@router.post("/{scenario_id}/actions")
def apply_action(
    scenario_id: int,
    body: ActionRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller", "executive")),
):
    """Apply an action and return full recalculated state."""
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(404, "Scenario not found")

    max_order = db.query(func.coalesce(func.max(ScenarioAction.action_order), 0)).filter(
        ScenarioAction.scenario_id == scenario_id
    ).scalar()

    action = ScenarioAction(
        scenario_id=scenario_id,
        action_order=max_order + 1,
        scope=body.scope,
        action_type=body.action_type,
        project_id=body.project_id,
        parameters_json=json.dumps(body.parameters) if body.parameters else None,
    )
    db.add(action)

    # Invalidate old snapshots
    db.query(ScenarioState).filter(ScenarioState.scenario_id == scenario_id).delete()
    db.query(ScenarioCapacityImpact).filter(ScenarioCapacityImpact.scenario_id == scenario_id).delete()
    db.commit()

    # Recalculate
    actions = db.query(ScenarioAction).filter(ScenarioAction.scenario_id == scenario_id).order_by(ScenarioAction.action_order).all()
    return recalculate_scenario(db, scenario, actions)


@router.delete("/{scenario_id}/actions/{action_id}")
def remove_action(
    scenario_id: int, action_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller", "executive")),
):
    """Remove an action and recalculate."""
    action = db.query(ScenarioAction).filter(ScenarioAction.id == action_id, ScenarioAction.scenario_id == scenario_id).first()
    if not action:
        raise HTTPException(404, "Action not found")
    db.delete(action)
    db.query(ScenarioState).filter(ScenarioState.scenario_id == scenario_id).delete()
    db.query(ScenarioCapacityImpact).filter(ScenarioCapacityImpact.scenario_id == scenario_id).delete()
    db.commit()

    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    actions = db.query(ScenarioAction).filter(ScenarioAction.scenario_id == scenario_id).order_by(ScenarioAction.action_order).all()
    return recalculate_scenario(db, scenario, actions)


@router.put("/{scenario_id}/actions/reorder")
def reorder_actions(
    scenario_id: int,
    body: ActionReorder,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller", "executive")),
):
    """Reorder actions (no recalculation)."""
    for i, action_id in enumerate(body.action_ids):
        action = db.query(ScenarioAction).filter(ScenarioAction.id == action_id, ScenarioAction.scenario_id == scenario_id).first()
        if action:
            action.action_order = i + 1
    db.commit()
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Drill-down + Comparison (2 endpoints)
# ---------------------------------------------------------------------------

@router.get("/{scenario_id}/drill-down")
def get_drill_down(
    scenario_id: int,
    level: str = "lob",
    parent_id: str | None = None,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role("controller", "executive")),
):
    """Get drill-down detail for a scenario."""
    state = get_scenario_state(db, scenario_id)
    if not state:
        raise HTTPException(404, "Scenario not found")

    project_states = state.get("project_states", [])

    if level == "project" and parent_id:
        items = [ps for ps in project_states if ps["project_id"] == parent_id]
    elif level == "lob":
        lob_map = {}
        for ps in project_states:
            proj = db.query(Project).filter(Project.id == ps["project_id"]).first()
            lob_id = proj.lob_id if proj else "unknown"
            lob_map.setdefault(lob_id, {"id": lob_id, "original": 0, "adjusted": 0, "delta": 0, "projects": []})
            lob_map[lob_id]["original"] += ps["original_budget"]
            lob_map[lob_id]["adjusted"] += ps["adjusted_budget"]
            lob_map[lob_id]["delta"] += ps["budget_delta"]
            lob_map[lob_id]["projects"].append(ps["project_id"])
        items = list(lob_map.values())
    else:
        items = project_states

    return {"items": items, "total": len(items), "level": level}


@router.post("/compare")
def compare_scenarios(
    body: CompareRequest,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role("controller", "executive")),
):
    """Compare 1-3 scenarios side by side."""
    if len(body.scenario_ids) > 3:
        raise HTTPException(400, "Maximum 3 scenarios for comparison")

    # Current state column
    projects = db.query(Project).filter(Project.is_active.is_(True)).all()
    from models.financial import Forecast
    current_budgets = {}
    for p in projects:
        total = float(
            db.query(func.coalesce(func.sum(Forecast.amount_eur), 0))
            .filter(Forecast.project_id == p.id).scalar()
        )
        current_budgets[p.id] = {"name": p.name, "budget": round(total, 2), "rag": p.rag_status}

    columns = [{"label": "Current State", "data": current_budgets}]

    for sid in body.scenario_ids:
        state = get_scenario_state(db, sid)
        if state:
            scenario_data = {}
            for ps in state.get("project_states", []):
                scenario_data[ps["project_id"]] = {
                    "name": ps["project_name"],
                    "budget": ps["adjusted_budget"],
                    "delta": ps["budget_delta"],
                    "rag": ps["adjusted_rag"],
                }
            columns.append({"label": state["metadata"]["name"], "scenario_id": sid, "data": scenario_data})

    return {"columns": columns, "total_scenarios": len(body.scenario_ids)}


# ---------------------------------------------------------------------------
# AI Advisor (2 endpoints)
# ---------------------------------------------------------------------------

@router.post("/{scenario_id}/advisor/query")
def query_advisor(
    scenario_id: int,
    body: AdvisorQuery,
    request: Request,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role("controller", "executive")),
):
    """Query AI Advisor with a goal."""
    from services.advisor import match_goal, get_paths_for_goal

    advisor_goals = request.app.state.fixtures.get("advisor_goals", [])
    goal = match_goal(body.goal, advisor_goals)
    if not goal:
        return {"paths": [], "message": "No matching recommendations found for this goal."}

    paths = get_paths_for_goal(goal)
    return {"paths": paths, "matched_goal": goal.get("goal_display", "")}


@router.post("/{scenario_id}/advisor/apply")
def apply_advisor_path(
    scenario_id: int,
    body: AdvisorApply,
    request: Request,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller", "executive")),
):
    """Apply an advisor path's constituent actions to the scenario."""
    from services.advisor import find_path_by_id

    advisor_goals = request.app.state.fixtures.get("advisor_goals", [])
    goal, path = find_path_by_id(advisor_goals, body.path_id)
    if not path:
        raise HTTPException(404, f"Path not found: {body.path_id}")

    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(404, "Scenario not found")

    max_order = db.query(func.coalesce(func.max(ScenarioAction.action_order), 0)).filter(
        ScenarioAction.scenario_id == scenario_id
    ).scalar()

    for i, action_def in enumerate(path.get("constituent_actions", [])):
        action = ScenarioAction(
            scenario_id=scenario_id,
            action_order=max_order + i + 1,
            scope=action_def.get("scope", "project"),
            action_type=action_def.get("action_type", action_def.get("rule_type", "adjust_budget")),
            project_id=action_def.get("project_id"),
            parameters_json=json.dumps(action_def.get("parameters", {})),
            impact_delta_json=json.dumps(action_def.get("impact_delta", {})),
            group_label=path.get("name", ""),
        )
        db.add(action)

    # Invalidate and recalculate
    db.query(ScenarioState).filter(ScenarioState.scenario_id == scenario_id).delete()
    db.query(ScenarioCapacityImpact).filter(ScenarioCapacityImpact.scenario_id == scenario_id).delete()
    db.commit()

    actions = db.query(ScenarioAction).filter(ScenarioAction.scenario_id == scenario_id).order_by(ScenarioAction.action_order).all()
    result = recalculate_scenario(db, scenario, actions)
    result["narrative_summary"] = f"Applied '{path.get('name', '')}' path with {len(path.get('constituent_actions', []))} actions."
    return result
