"""What-If Simulator endpoints — Cluster B Session B1.

v4 baseline: 13 endpoints (Scenario Manager, Workspace, Actions, Drill-down,
Compare, Advisor).

v5 B1 additions:
- Lifecycle: anchor selection at create, rebase, archive (soft), tag-aware
  list, Tier 3 visibility on publish.
- Lever 12: distribution edge CRUD in sandbox, BTC line overlay, to_business
  override, per-charging-location impact.
- Impact dashboard: 8-dimension server-side recalculation per [B-ID-01..03].
- Promote workflow (controller-only): preview + execute with [F-AC-01]
  permission gating per [B-OQ-01].
- PL Apply-to-forecast: own-project diff carry-forward.
- Tier 3 enforcement: People dimension hidden for non-Tier-3 callers.
- Role expansion: PL + CC Owner now have read access (CC Owner scoped).
"""
from __future__ import annotations
import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from dependencies import (
    assert_pl_may_touch_project, get_current_user, pl_leads_project,
    require_role, user_has_tier3,
)
from models.financial import ForecastVersion
from models.projects import Project
from models.scenarios import (
    Scenario, ScenarioAction, ScenarioApplyToForecastEvent,
    ScenarioCapacityImpact, ScenarioPromotion,
    ScenarioState, SCENARIO_VISIBILITIES,
)
from schemas.common import CurrentUser
from schemas.scenarios import (
    ActionReorder, ActionRequest, AdvisorApply, AdvisorQuery,
    ApplyToForecastRequest, ApplyToForecastResponse,
    BTCLinesChange, CompareRequest,
    CostAllocationImpactResponse,
    DistributionEdgeCreate, DistributionEdgeUpdate,
    ImpactDashboardResponse,
    PromoteExecuteRequest, PromoteExecuteResponse,
    PromotePreviewRequest, PromotePreviewResponse,
    ScenarioArchiveRequest, ScenarioCreate,
    ScenarioListItem,
    ScenarioListResponse, ScenarioMetadataUpdate, ScenarioPublishRequest,
    ScenarioRebaseRequest, ToBusinessChange,
)
from services.distribution_service import resolve_active_version
from services.scenario_apply_forecast import (
    ApplyToForecastError, apply_to_forecast,
)
from services.scenario_engine import (
    get_scenario_state, recalculate_scenario,
)
from services.scenario_impact import (
    compute_impact_dashboard, mark_recalculated,
)
from services.scenario_lever12 import (
    Lever12Error, apply_btc_lines_change, apply_distribution_create,
    apply_distribution_delete, apply_distribution_update,
    apply_to_business_change, cleanup_lever12_state,
    compute_cost_allocation_impact, scenario_version,
)
from services.scenario_promote import (
    PromoteError, execute_promote, preview_promote,
)


router = APIRouter(prefix="/api/scenarios", tags=["What-If Simulator"])


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _serialize_scenario(s: Scenario) -> ScenarioListItem:
    tags_list: Optional[list[str]] = None
    if s.tags:
        try:
            parsed = json.loads(s.tags)
            if isinstance(parsed, list):
                tags_list = [str(x) for x in parsed]
        except json.JSONDecodeError:
            tags_list = None
    return ScenarioListItem(
        id=s.id, name=s.name, description=s.description, status=s.status,
        author_name=s.author.name if s.author else "",
        created_at=str(s.created_at), modified_at=str(s.modified_at),
        headline_impact=s.headline_impact,
        visibility=s.visibility,
        tier3_content_flag=s.tier3_content_flag,
        archived=s.archived,
        archived_at=str(s.archived_at) if s.archived_at else None,
        tags=tags_list,
        anchor_forecast_version_id=s.anchor_forecast_version_id,
        last_recalculated_at=str(s.last_recalculated_at) if s.last_recalculated_at else None,
    )


def _check_scenario_owner(scenario: Scenario, user: CurrentUser) -> None:
    if scenario.author_id != user.person_id:
        raise HTTPException(403, "Only the author can perform this action.")


def _get_scenario_or_404(db: Session, scenario_id: int) -> Scenario:
    sc = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if sc is None:
        raise HTTPException(404, f"Scenario {scenario_id} not found")
    return sc


def _scenario_touches_pl_project(
    db: Session, scenario: Scenario, user: CurrentUser,
) -> bool:
    """True if any action in ``scenario`` targets a project the PL leads.

    Used for the targeted leadership→PL handoff (Simulator §9.1): a published
    scenario authored by someone else is visible to a PL only via the slice of
    their own projects it touches.
    """
    rows = (
        db.query(ScenarioAction.project_id)
        .filter(
            ScenarioAction.scenario_id == scenario.id,
            ScenarioAction.project_id.isnot(None),
        )
        .distinct()
        .all()
    )
    for (pid,) in rows:
        if pid and pl_leads_project(db, user, pid):
            return True
    return False


def _user_can_view_scenario(
    scenario: Scenario, user: CurrentUser, has_tier3: bool,
    db: Optional[Session] = None,
) -> bool:
    """Per [B-AC-01..03] [B-SL-03] and Simulator §9/§9.2 visibility rules.

    For Project Leads, visibility is directional (§9.2): a PL sees their own
    authored scenarios, plus any *published* scenario whose diffs touch one of
    their projects (the targeted handoff, §9.1). A PL never sees a peer PL's
    scenario laterally, nor a published scenario that does not touch their
    projects. ``db`` is required to evaluate the handoff touch-check; when not
    supplied (legacy callers) the handoff is conservatively denied.
    """
    # Owner always sees own scenarios.
    if scenario.author_id == user.person_id:
        return True

    # Project Leads: directional, no lateral visibility (§9.2).
    if user.role == "project_lead":
        if scenario.status != "published":
            return False
        if db is None:
            return False
        return _scenario_touches_pl_project(db, scenario, user)

    # Private scenarios: only the owner.
    if scenario.status == "private":
        return False
    # Published scenarios — Tier 3 content gating.
    if scenario.visibility == "tier3_only" and not has_tier3:
        return False
    return True


def _latest_cycle_version_id(db: Session) -> Optional[int]:
    fv = (
        db.query(ForecastVersion)
        .filter(ForecastVersion.version_type == "cycle")
        .order_by(ForecastVersion.created_at.desc())
        .first()
    )
    return fv.id if fv else None


# ---------------------------------------------------------------------------
# Scenario Manager (extended)
# ---------------------------------------------------------------------------

@router.get("", response_model=ScenarioListResponse)
def list_scenarios(
    include_archived: bool = Query(False, description="Include archived scenarios"),
    tag: Optional[str] = Query(None, description="Filter by tag (substring match)"),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role(
        "controller", "executive", "project_lead", "cost_center_owner",
    )),
):
    """List scenarios visible to the caller per [B-AC-01..03] and [B-SL-03..05]."""
    has_tier3 = user_has_tier3(db, user)

    base_q = db.query(Scenario)
    if not include_archived:
        base_q = base_q.filter(Scenario.archived.is_(False))

    my = base_q.filter(Scenario.author_id == user.person_id).all()
    published = (
        base_q.filter(
            Scenario.status == "published",
            Scenario.author_id != user.person_id,
        ).all()
    )
    archived = []
    if include_archived:
        archived = (
            db.query(Scenario)
            .filter(
                Scenario.archived.is_(True),
                Scenario.author_id == user.person_id,
            )
            .all()
        )

    # Filter published by Tier 3 visibility.
    visible_published = [
        p for p in published
        if _user_can_view_scenario(p, user, has_tier3, db)
    ]

    def matches_tag(s: Scenario) -> bool:
        if not tag:
            return True
        try:
            tags = json.loads(s.tags) if s.tags else []
        except json.JSONDecodeError:
            return False
        return any(tag.lower() in str(t).lower() for t in tags)

    # Collect all available tags for the filter UX.
    all_tags: set[str] = set()
    for s in [*my, *visible_published, *archived]:
        if s.tags:
            try:
                tags = json.loads(s.tags)
                if isinstance(tags, list):
                    all_tags.update(str(t) for t in tags)
            except json.JSONDecodeError:
                pass

    return ScenarioListResponse(
        my_scenarios=[_serialize_scenario(s) for s in my if matches_tag(s)],
        published_scenarios=[
            _serialize_scenario(s) for s in visible_published if matches_tag(s)
        ],
        archived_scenarios=[
            _serialize_scenario(s) for s in archived if matches_tag(s)
        ],
        available_tags=sorted(all_tags),
    )


@router.post("")
def create_scenario(
    body: ScenarioCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role(
        "controller", "executive", "cost_center_owner", "project_lead",
    )),
):
    """Create a scenario per [B-AC-01..03] [B-SL-01] and Simulator §9.

    Project Leads may now author scenarios (Simulator §9), scoped per-action
    to the projects they lead (enforced at the action/overlay write boundary
    and on clone below). CC Owner creation requires ``cc_owner_scope_cc_id``
    to match the persona's managed cost centre per [E-06b].
    """
    # Cap at 10 scenarios per user (existing v4 rule, kept for soft warning).
    count = (
        db.query(func.count(Scenario.id))
        .filter(Scenario.author_id == user.person_id)
        .scalar()
    )
    if count >= 10:
        raise HTTPException(409, "Maximum 10 scenarios per user")

    cc_scope = body.cc_owner_scope_cc_id
    if user.role == "cost_center_owner":
        # Auto-fill scope from persona if not provided; reject mismatch.
        if cc_scope is None:
            cc_scope = user.cost_center_id
        if cc_scope != user.cost_center_id:
            raise HTTPException(
                403,
                f"CC Owner scenarios must be scoped to managed CC "
                f"'{user.cost_center_id}', got '{cc_scope}'",
            )

    # Default anchor to the latest cycle if none supplied.
    anchor_id = body.anchor_forecast_version_id
    if anchor_id is None:
        anchor_id = _latest_cycle_version_id(db)
    elif (
        db.query(ForecastVersion).filter(ForecastVersion.id == anchor_id).first()
        is None
    ):
        raise HTTPException(404, f"Forecast version {anchor_id} not found")

    tags_json = json.dumps(body.tags) if body.tags else None

    # FD-3 [F-S1-02] / OQ #3: pin the Stage 1 distribution-version anchor at
    # scenario creation. Prevents subsequent production reactivations from
    # shifting impact deltas underneath an open scenario. NULL is preserved
    # as a legacy escape hatch — the lever-12 read paths fall back to
    # resolve-by-date when this column is NULL.
    from datetime import date as _date
    from config import DEMO_DATE
    _demo_today_year, _demo_today_month = (int(s) for s in DEMO_DATE.split("-"))
    _demo_today = _date(_demo_today_year, _demo_today_month, 1)
    _anchor_version = resolve_active_version(db, _demo_today)
    dist_anchor = _anchor_version.id if _anchor_version is not None else None

    scenario = Scenario(
        name=body.name,
        description=body.description,
        author_id=user.person_id,
        status="private",
        visibility="private",
        anchor_forecast_version_id=anchor_id,
        anchor_distribution_version_id=dist_anchor,
        tags=tags_json,
        cc_owner_scope_cc_id=cc_scope,
    )
    db.add(scenario)
    db.flush()

    if body.clone_from:
        source = (
            db.query(Scenario).filter(Scenario.id == body.clone_from).first()
        )
        if source is None:
            raise HTTPException(404, f"Source scenario {body.clone_from} not found")
        # Clone published-only or owned scenarios.
        has_tier3 = user_has_tier3(db, user)
        if not _user_can_view_scenario(source, user, has_tier3, db):
            raise HTTPException(
                403, "Cannot clone a scenario you cannot view.",
            )
        source_actions = (
            db.query(ScenarioAction)
            .filter(ScenarioAction.scenario_id == body.clone_from)
            .order_by(ScenarioAction.action_order).all()
        )
        # Per-action scoping (Simulator §9): a PL may only clone into a
        # scenario actions that target projects they lead.
        for a in source_actions:
            assert_pl_may_touch_project(db, user, a.project_id)
        for a in source_actions:
            db.add(ScenarioAction(
                scenario_id=scenario.id, action_order=a.action_order,
                scope=a.scope, action_type=a.action_type, project_id=a.project_id,
                parameters_json=a.parameters_json, impact_delta_json=a.impact_delta_json,
                group_label=a.group_label,
                lever_category=a.lever_category, tier=a.tier,
            ))

    db.commit()
    db.refresh(scenario)
    return {
        "id": scenario.id, "name": scenario.name, "status": scenario.status,
        "anchor_forecast_version_id": scenario.anchor_forecast_version_id,
        "anchor_distribution_version_id": scenario.anchor_distribution_version_id,
        "visibility": scenario.visibility,
        "cc_owner_scope_cc_id": scenario.cc_owner_scope_cc_id,
    }


@router.delete("/{scenario_id}")
def delete_scenario(
    scenario_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role(
        "controller", "executive", "cost_center_owner", "project_lead",
    )),
):
    """Hard delete a scenario (owner only). Also cleans up Lever 12 sandbox rows."""
    scenario = _get_scenario_or_404(db, scenario_id)
    _check_scenario_owner(scenario, user)

    # Lever 12 sandbox cleanup: delete scenario-version Distribution rows.
    cleanup_lever12_state(db, scenario_id)

    db.query(ScenarioCapacityImpact).filter(
        ScenarioCapacityImpact.scenario_id == scenario_id,
    ).delete()
    db.query(ScenarioState).filter(ScenarioState.scenario_id == scenario_id).delete()
    db.query(ScenarioApplyToForecastEvent).filter(
        ScenarioApplyToForecastEvent.scenario_id == scenario_id,
    ).delete()
    db.query(ScenarioPromotion).filter(
        ScenarioPromotion.scenario_id == scenario_id,
    ).delete()
    db.query(ScenarioAction).filter(ScenarioAction.scenario_id == scenario_id).delete()
    db.delete(scenario)
    db.commit()
    return {"status": "deleted"}


@router.put("/{scenario_id}/publish")
def publish_scenario(
    scenario_id: int,
    body: Optional[ScenarioPublishRequest] = None,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role(
        "controller", "executive", "cost_center_owner", "project_lead",
    )),
):
    """Publish per [B-SL-03] with Tier 3 content gating (Option C).

    Publication is directional and role-dependent (Simulator §9.2). For a
    controller, publish sits on the path to live (publish-for-review → Promote).
    For a Project Lead, publish means *expose for oversight and feed the
    targeted handoff*: it flips ``status`` to ``published`` so the scenario
    flows upward to controllers and becomes visible to PLs whose projects it
    touches — but it grants no promote route (PLs cannot promote; their path to
    live stays Apply-to-forecast). Lateral PL→PL browsing is prevented by
    ``_user_can_view_scenario``.
    """
    scenario = _get_scenario_or_404(db, scenario_id)
    _check_scenario_owner(scenario, user)

    # Default visibility based on Tier 3 content; can be overridden in body.
    target_visibility = "all_users"
    if scenario.tier3_content_flag:
        target_visibility = "tier3_only"
    if body and body.visibility:
        if body.visibility not in SCENARIO_VISIBILITIES:
            raise HTTPException(
                400, f"visibility must be one of {SCENARIO_VISIBILITIES}",
            )
        target_visibility = body.visibility

    scenario.status = "published"
    scenario.visibility = target_visibility
    db.commit()
    return {
        "id": scenario.id,
        "status": scenario.status,
        "visibility": scenario.visibility,
    }


@router.put("/{scenario_id}/unpublish")
def unpublish_scenario(
    scenario_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role(
        "controller", "executive", "cost_center_owner", "project_lead",
    )),
):
    scenario = _get_scenario_or_404(db, scenario_id)
    _check_scenario_owner(scenario, user)
    scenario.status = "private"
    scenario.visibility = "private"
    db.commit()
    return {"id": scenario.id, "status": scenario.status, "visibility": scenario.visibility}


@router.put("/{scenario_id}/archive")
def archive_scenario(
    scenario_id: int,
    body: ScenarioArchiveRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role(
        "controller", "executive", "cost_center_owner", "project_lead",
    )),
):
    """Soft archive per [B-SL-05] — scenarios remain queryable, are read-only."""
    scenario = _get_scenario_or_404(db, scenario_id)
    _check_scenario_owner(scenario, user)
    if body.archived:
        scenario.archived = True
        scenario.archived_at = datetime.utcnow()
    else:
        scenario.archived = False
        scenario.archived_at = None
    db.commit()
    return {
        "id": scenario.id,
        "archived": scenario.archived,
        "archived_at": str(scenario.archived_at) if scenario.archived_at else None,
    }


@router.put("/{scenario_id}/rebase")
def rebase_scenario(
    scenario_id: int,
    body: ScenarioRebaseRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role(
        "controller", "executive", "cost_center_owner", "project_lead",
    )),
):
    """Re-anchor a scenario to a newer cycle version per [B-SL-02].

    Manual + explicit per spec — no automatic rebase. Carries forward all
    diffs unchanged; conflict resolution is a UI concern that this endpoint
    does not handle (the demo surfaces "rebased" status; the user resolves
    conflicts in the editor).
    """
    scenario = _get_scenario_or_404(db, scenario_id)
    _check_scenario_owner(scenario, user)
    new_anchor = (
        db.query(ForecastVersion)
        .filter(ForecastVersion.id == body.new_anchor_version_id)
        .first()
    )
    if new_anchor is None:
        raise HTTPException(
            404, f"Forecast version {body.new_anchor_version_id} not found",
        )
    scenario.rebased_from_version_id = scenario.anchor_forecast_version_id
    scenario.anchor_forecast_version_id = new_anchor.id
    db.commit()
    return {
        "id": scenario.id,
        "anchor_forecast_version_id": scenario.anchor_forecast_version_id,
        "rebased_from_version_id": scenario.rebased_from_version_id,
    }


# ---------------------------------------------------------------------------
# Workspace
# ---------------------------------------------------------------------------

@router.get("/{scenario_id}")
def get_scenario_detail(
    scenario_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role(
        "controller", "executive", "project_lead", "cost_center_owner",
    )),
):
    """Get full scenario state. Tier 3 content redacted for non-Tier-3 users."""
    scenario = _get_scenario_or_404(db, scenario_id)
    has_tier3 = user_has_tier3(db, user)
    if not _user_can_view_scenario(scenario, user, has_tier3, db):
        raise HTTPException(403, "You do not have access to this scenario.")

    state = get_scenario_state(db, scenario_id)
    if not state:
        raise HTTPException(404, "Scenario state not available")

    # Redact Tier 3 actions when caller lacks the flag.
    if not has_tier3 and scenario.tier3_content_flag:
        state["actions"] = [
            a for a in state.get("actions", [])
            if (a.get("lever_category") or "") not in {
                "people", "rate_table", "capacity_param", "restructuring",
            }
            and (a.get("tier") or 1) != 3
        ]

    state["metadata"]["visibility"] = scenario.visibility
    state["metadata"]["tier3_content_flag"] = scenario.tier3_content_flag
    state["metadata"]["anchor_forecast_version_id"] = scenario.anchor_forecast_version_id
    state["metadata"]["archived"] = scenario.archived
    state["metadata"]["last_recalculated_at"] = (
        str(scenario.last_recalculated_at) if scenario.last_recalculated_at else None
    )
    state["metadata"]["cc_owner_scope_cc_id"] = scenario.cc_owner_scope_cc_id
    return state


@router.put("/{scenario_id}/metadata")
def update_scenario_metadata(
    scenario_id: int,
    body: ScenarioMetadataUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role(
        "controller", "executive", "cost_center_owner", "project_lead",
    )),
):
    """Update scenario name/description/tags/visibility."""
    scenario = _get_scenario_or_404(db, scenario_id)
    _check_scenario_owner(scenario, user)
    if body.name is not None:
        scenario.name = body.name
    if body.description is not None:
        scenario.description = body.description
    if body.tags is not None:
        scenario.tags = json.dumps(body.tags)
    if body.visibility is not None:
        if body.visibility not in SCENARIO_VISIBILITIES:
            raise HTTPException(
                400, f"visibility must be one of {SCENARIO_VISIBILITIES}",
            )
        scenario.visibility = body.visibility
    db.commit()
    return {
        "id": scenario.id,
        "name": scenario.name,
        "description": scenario.description,
        "tags": json.loads(scenario.tags) if scenario.tags else [],
        "visibility": scenario.visibility,
    }


# ---------------------------------------------------------------------------
# Actions
# ---------------------------------------------------------------------------

@router.post("/{scenario_id}/actions")
def apply_action(
    scenario_id: int,
    body: ActionRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role(
        "controller", "executive", "cost_center_owner", "project_lead",
    )),
):
    """Apply an action and return full recalculated state."""
    scenario = _get_scenario_or_404(db, scenario_id)
    _check_scenario_owner(scenario, user)

    # Per-action project scoping (Simulator §9): a PL may only add actions
    # targeting projects they lead. Controllers/executives are unrestricted.
    assert_pl_may_touch_project(db, user, body.project_id)

    # CC Owner scoping per [E-06b]: only resource (people / capacity) actions
    # within their CC. Reject anything else.
    if user.role == "cost_center_owner":
        allowed = {"change_allocation"}
        if body.action_type not in allowed:
            raise HTTPException(
                403,
                f"CC Owner scenarios may only modify resource allocations "
                f"within their cost centre. Got action_type='{body.action_type}'.",
            )
        # Optional CC enforcement: parameters must reference managed CC.
        # (Lightweight check; full enforcement deferred to per-action code.)

    max_order = (
        db.query(func.coalesce(func.max(ScenarioAction.action_order), 0))
        .filter(ScenarioAction.scenario_id == scenario_id)
        .scalar()
    )

    action = ScenarioAction(
        scenario_id=scenario_id,
        action_order=max_order + 1,
        scope=body.scope,
        action_type=body.action_type,
        project_id=body.project_id,
        parameters_json=json.dumps(body.parameters) if body.parameters else None,
        lever_category=body.lever_category,
        tier=body.tier or 1,
    )
    db.add(action)

    # Bump modified timestamp for stale indicator
    scenario.modified_at = datetime.utcnow()

    # Invalidate snapshots
    db.query(ScenarioState).filter(ScenarioState.scenario_id == scenario_id).delete()
    db.query(ScenarioCapacityImpact).filter(
        ScenarioCapacityImpact.scenario_id == scenario_id,
    ).delete()
    db.commit()

    actions = (
        db.query(ScenarioAction)
        .filter(ScenarioAction.scenario_id == scenario_id)
        .order_by(ScenarioAction.action_order).all()
    )
    return recalculate_scenario(db, scenario, actions)


@router.delete("/{scenario_id}/actions/{action_id}")
def remove_action(
    scenario_id: int, action_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role(
        "controller", "executive", "cost_center_owner", "project_lead",
    )),
):
    scenario = _get_scenario_or_404(db, scenario_id)
    _check_scenario_owner(scenario, user)

    action = (
        db.query(ScenarioAction)
        .filter(ScenarioAction.id == action_id, ScenarioAction.scenario_id == scenario_id)
        .first()
    )
    if not action:
        raise HTTPException(404, "Action not found")
    db.delete(action)
    scenario.modified_at = datetime.utcnow()
    db.query(ScenarioState).filter(ScenarioState.scenario_id == scenario_id).delete()
    db.query(ScenarioCapacityImpact).filter(
        ScenarioCapacityImpact.scenario_id == scenario_id,
    ).delete()
    db.commit()

    actions = (
        db.query(ScenarioAction)
        .filter(ScenarioAction.scenario_id == scenario_id)
        .order_by(ScenarioAction.action_order).all()
    )
    return recalculate_scenario(db, scenario, actions)


@router.put("/{scenario_id}/actions/reorder")
def reorder_actions(
    scenario_id: int,
    body: ActionReorder,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role(
        "controller", "executive", "cost_center_owner", "project_lead",
    )),
):
    scenario = _get_scenario_or_404(db, scenario_id)
    _check_scenario_owner(scenario, user)
    for i, action_id in enumerate(body.action_ids):
        action = (
            db.query(ScenarioAction)
            .filter(
                ScenarioAction.id == action_id,
                ScenarioAction.scenario_id == scenario_id,
            )
            .first()
        )
        if action:
            action.action_order = i + 1
    db.commit()
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Drill-down + Comparison
# ---------------------------------------------------------------------------

@router.get("/{scenario_id}/drill-down")
def get_drill_down(
    scenario_id: int,
    level: str = "lob",
    parent_id: str | None = None,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role(
        "controller", "executive", "project_lead", "cost_center_owner",
    )),
):
    scenario = _get_scenario_or_404(db, scenario_id)
    has_tier3 = user_has_tier3(db, user)
    if not _user_can_view_scenario(scenario, user, has_tier3, db):
        raise HTTPException(403, "You do not have access to this scenario.")

    state = get_scenario_state(db, scenario_id)
    if not state:
        raise HTTPException(404, "Scenario not found")

    project_states = state.get("project_states", [])

    if level == "project" and parent_id:
        items = [ps for ps in project_states if ps["project_id"] == parent_id]
    elif level == "lob":
        from services.portfolio_service import (
            get_project_entity_info, get_top_level_entity_type_id,
        )
        top_type = get_top_level_entity_type_id(db)
        lob_map = {}
        for ps in project_states:
            entity_info = get_project_entity_info(db, ps["project_id"], top_type)
            lob_id = entity_info["id"] if entity_info else "unknown"
            lob_map.setdefault(lob_id, {
                "id": lob_id, "original": 0, "adjusted": 0, "delta": 0,
                "projects": [],
            })
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
    user: CurrentUser = Depends(require_role(
        "controller", "executive", "project_lead", "cost_center_owner",
    )),
):
    """Compare 1-3 scenarios side by side per [B-CV-01..05]."""
    if len(body.scenario_ids) > 3:
        raise HTTPException(400, "Maximum 3 scenarios for comparison")

    has_tier3 = user_has_tier3(db, user)
    # Per [B-CV-01]: shared anchor requirement.
    scenarios = [
        _get_scenario_or_404(db, sid) for sid in body.scenario_ids
    ]
    for sc in scenarios:
        if not _user_can_view_scenario(sc, user, has_tier3, db):
            raise HTTPException(
                403,
                f"You do not have access to scenario {sc.id}.",
            )
    if scenarios:
        anchors = {s.anchor_forecast_version_id for s in scenarios}
        if len(anchors) > 1:
            raise HTTPException(
                409,
                "Comparison requires shared anchor — rebase scenarios so "
                "they share the same forecast cycle version.",
            )

    projects = db.query(Project).filter(Project.is_active.is_(True)).all()
    from models.financial import Forecast
    current_budgets = {}
    for p in projects:
        total = float(
            db.query(func.coalesce(func.sum(Forecast.amount_eur), 0))
            .filter(Forecast.project_id == p.id).scalar()
        )
        current_budgets[p.id] = {
            "name": p.name, "budget": round(total, 2), "rag": p.rag_status,
        }

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
            columns.append({
                "label": state["metadata"]["name"],
                "scenario_id": sid, "data": scenario_data,
            })

    return {"columns": columns, "total_scenarios": len(body.scenario_ids)}


# ---------------------------------------------------------------------------
# v5 B1 — Lever 12 endpoints
# ---------------------------------------------------------------------------

@router.post("/{scenario_id}/lever12/distributions")
def lever12_create_distribution(
    scenario_id: int,
    body: DistributionEdgeCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role(
        "controller", "executive",
    )),
):
    """Create a Stage 1 distribution edge in the scenario sandbox per [B-ES-01]."""
    scenario = _get_scenario_or_404(db, scenario_id)
    _check_scenario_owner(scenario, user)
    try:
        result = apply_distribution_create(
            db, scenario_id, year=body.year,
            source_entity_id=body.source_entity_id,
            destination_entity_id=body.destination_entity_id,
            percentage=body.percentage,
        )
    except Lever12Error as exc:
        body_payload = {"detail": exc.message}
        if exc.cycle_chain:
            body_payload["cycle_chain"] = exc.cycle_chain
        raise HTTPException(409, body_payload) from exc
    db.commit()
    return result


@router.put("/{scenario_id}/lever12/distributions/{edge_id}")
def lever12_update_distribution(
    scenario_id: int, edge_id: int,
    body: DistributionEdgeUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role(
        "controller", "executive",
    )),
):
    scenario = _get_scenario_or_404(db, scenario_id)
    _check_scenario_owner(scenario, user)
    try:
        result = apply_distribution_update(
            db, scenario_id, edge_id=edge_id, percentage=body.percentage,
        )
    except Lever12Error as exc:
        raise HTTPException(409, exc.message) from exc
    db.commit()
    return result


@router.delete("/{scenario_id}/lever12/distributions/{edge_id}")
def lever12_delete_distribution(
    scenario_id: int, edge_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role(
        "controller", "executive",
    )),
):
    scenario = _get_scenario_or_404(db, scenario_id)
    _check_scenario_owner(scenario, user)
    try:
        result = apply_distribution_delete(
            db, scenario_id, edge_id=edge_id,
        )
    except Lever12Error as exc:
        raise HTTPException(409, exc.message) from exc
    db.commit()
    return result


@router.post("/{scenario_id}/lever12/to-business")
def lever12_to_business_change(
    scenario_id: int,
    body: ToBusinessChange,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role(
        "controller", "executive",
    )),
):
    """Set a to_business_pct override for the scenario per [B-ES-01]."""
    scenario = _get_scenario_or_404(db, scenario_id)
    _check_scenario_owner(scenario, user)
    try:
        result = apply_to_business_change(
            db, scenario_id, entity_id=body.entity_id, year=body.year,
            new_pct=body.new_pct,
        )
    except Lever12Error as exc:
        raise HTTPException(409, exc.message) from exc
    db.commit()
    return result


@router.post("/{scenario_id}/lever12/btc-lines")
def lever12_btc_lines_change(
    scenario_id: int,
    body: BTCLinesChange,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role(
        "controller", "executive",
    )),
):
    """Set a BTC profile line overlay for the scenario per [B-ES-01]."""
    scenario = _get_scenario_or_404(db, scenario_id)
    _check_scenario_owner(scenario, user)
    try:
        result = apply_btc_lines_change(
            db, scenario_id, entity_id=body.entity_id, year=body.year,
            lines=[line.model_dump() for line in body.lines],
        )
    except Lever12Error as exc:
        raise HTTPException(409, exc.message) from exc
    db.commit()
    return result


@router.get(
    "/{scenario_id}/lever12/cost-allocation-impact",
    response_model=CostAllocationImpactResponse,
)
def lever12_cost_allocation_impact(
    scenario_id: int,
    year: int = Query(2026, description="Fiscal year for the impact view"),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role(
        "controller", "executive", "project_lead", "cost_center_owner",
    )),
):
    """Per-charging-location impact for the scenario per [F-RV-01..06]."""
    scenario = _get_scenario_or_404(db, scenario_id)
    has_tier3 = user_has_tier3(db, user)
    if not _user_can_view_scenario(scenario, user, has_tier3, db):
        raise HTTPException(403, "You do not have access to this scenario.")
    return compute_cost_allocation_impact(db, scenario_id, year=year)


# ---------------------------------------------------------------------------
# v5 B1 — Impact dashboard
# ---------------------------------------------------------------------------

@router.get("/{scenario_id}/impact", response_model=ImpactDashboardResponse)
def impact_dashboard(
    scenario_id: int,
    year: int = Query(2026, description="Year for Lever 12 cost allocation calc"),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role(
        "controller", "executive", "project_lead", "cost_center_owner",
    )),
):
    """8-dimension impact dashboard per [B-ID-01..03]."""
    scenario = _get_scenario_or_404(db, scenario_id)
    has_tier3 = user_has_tier3(db, user)
    if not _user_can_view_scenario(scenario, user, has_tier3, db):
        raise HTTPException(403, "You do not have access to this scenario.")

    state = get_scenario_state(db, scenario_id)
    if not state:
        raise HTTPException(404, "Scenario state not available")

    dashboard = compute_impact_dashboard(
        db, scenario_id, state,
        include_tier3=has_tier3, include_lever12=True, lever12_year=year,
    )
    return dashboard


@router.post("/{scenario_id}/recalculate")
def recalculate_endpoint(
    scenario_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role(
        "controller", "executive", "cost_center_owner", "project_lead",
    )),
):
    """Stamp the scenario as freshly recalculated (clears stale indicator)."""
    scenario = _get_scenario_or_404(db, scenario_id)
    _check_scenario_owner(scenario, user)
    mark_recalculated(db, scenario_id)
    db.commit()
    return {
        "scenario_id": scenario_id,
        "last_recalculated_at": (
            str(scenario.last_recalculated_at) if scenario.last_recalculated_at else None
        ),
        "tier3_content_flag": scenario.tier3_content_flag,
    }


# ---------------------------------------------------------------------------
# v5 B1 — Promote workflow
# ---------------------------------------------------------------------------

@router.post(
    "/{scenario_id}/promote/preview",
    response_model=PromotePreviewResponse,
)
def promote_preview(
    scenario_id: int,
    body: Optional[PromotePreviewRequest] = None,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Preview the routing of a scenario's diffs without applying them."""
    try:
        return preview_promote(
            db, scenario_id,
            action_ids=(body.action_ids if body else None),
            user=user,
        )
    except PromoteError as exc:
        body_payload = {"detail": exc.message}
        if exc.hint:
            body_payload["hint"] = exc.hint
        raise HTTPException(409, body_payload) from exc


@router.post(
    "/{scenario_id}/promote",
    response_model=PromoteExecuteResponse,
)
def promote_execute(
    scenario_id: int,
    body: Optional[PromoteExecuteRequest] = None,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Execute selective promotion per [B-PR-01..06] [B-OQ-01]."""
    try:
        result = execute_promote(
            db, scenario_id,
            action_ids=(body.action_ids if body else None),
            user=user,
            notes=(body.notes if body else None),
        )
    except PromoteError as exc:
        body_payload = {"detail": exc.message}
        if exc.hint:
            body_payload["hint"] = exc.hint
        raise HTTPException(409, body_payload) from exc
    db.commit()
    return result


@router.get("/{scenario_id}/promotions")
def list_promotions(
    scenario_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role(
        "controller", "executive", "project_lead", "cost_center_owner",
    )),
):
    """Return the audit trail of past promotions for a scenario."""
    scenario = _get_scenario_or_404(db, scenario_id)
    has_tier3 = user_has_tier3(db, user)
    if not _user_can_view_scenario(scenario, user, has_tier3, db):
        raise HTTPException(403, "You do not have access to this scenario.")
    rows = (
        db.query(ScenarioPromotion)
        .filter(ScenarioPromotion.scenario_id == scenario_id)
        .order_by(ScenarioPromotion.promoted_at.desc())
        .all()
    )
    return {
        "items": [
            {
                "id": r.id,
                "promoted_at": str(r.promoted_at),
                "promoted_by_id": r.promoted_by_id,
                "promoted_count": r.promoted_count,
                "skipped_count": r.skipped_count,
                "notes": r.notes,
                "summary": json.loads(r.routing_summary_json) if r.routing_summary_json else [],
            }
            for r in rows
        ],
        "total": len(rows),
    }


# ---------------------------------------------------------------------------
# v5 B1 — Apply-to-forecast (PL only)
# ---------------------------------------------------------------------------

@router.post(
    "/{scenario_id}/apply-to-forecast",
    response_model=ApplyToForecastResponse,
)
def apply_to_forecast_endpoint(
    scenario_id: int,
    body: Optional[ApplyToForecastRequest] = None,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("project_lead")),
):
    """PL Apply-to-forecast per [B-PR-05]."""
    try:
        result = apply_to_forecast(
            db, scenario_id=scenario_id, user=user,
            cycle_id=(body.cycle_id if body else None),
            cycle_label=(body.cycle_label if body else None),
        )
    except ApplyToForecastError as exc:
        raise HTTPException(409, exc.message) from exc
    db.commit()
    return result


# ---------------------------------------------------------------------------
# AI Advisor (unchanged)
# ---------------------------------------------------------------------------

@router.post("/{scenario_id}/advisor/query")
def query_advisor(
    scenario_id: int,
    body: AdvisorQuery,
    request: Request,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role(
        "controller", "executive", "cost_center_owner",
    )),
):
    """Query AI Advisor with a goal."""
    from services.advisor import get_paths_for_goal, match_goal

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
    user: CurrentUser = Depends(require_role(
        "controller", "executive", "cost_center_owner",
    )),
):
    """Apply an advisor path's constituent actions to the scenario."""
    from services.advisor import find_path_by_id

    advisor_goals = request.app.state.fixtures.get("advisor_goals", [])
    goal, path = find_path_by_id(advisor_goals, body.path_id)
    if not path:
        raise HTTPException(404, f"Path not found: {body.path_id}")

    scenario = _get_scenario_or_404(db, scenario_id)
    _check_scenario_owner(scenario, user)

    max_order = (
        db.query(func.coalesce(func.max(ScenarioAction.action_order), 0))
        .filter(ScenarioAction.scenario_id == scenario_id)
        .scalar()
    )

    for i, action_def in enumerate(path.get("constituent_actions", [])):
        action = ScenarioAction(
            scenario_id=scenario_id,
            action_order=max_order + i + 1,
            scope=action_def.get("scope", "project"),
            action_type=action_def.get(
                "action_type", action_def.get("rule_type", "adjust_budget"),
            ),
            project_id=action_def.get("project_id"),
            parameters_json=json.dumps(action_def.get("parameters", {})),
            impact_delta_json=json.dumps(action_def.get("impact_delta", {})),
            group_label=path.get("name", ""),
        )
        db.add(action)

    scenario.modified_at = datetime.utcnow()
    db.query(ScenarioState).filter(ScenarioState.scenario_id == scenario_id).delete()
    db.query(ScenarioCapacityImpact).filter(
        ScenarioCapacityImpact.scenario_id == scenario_id,
    ).delete()
    db.commit()

    actions = (
        db.query(ScenarioAction)
        .filter(ScenarioAction.scenario_id == scenario_id)
        .order_by(ScenarioAction.action_order).all()
    )
    result = recalculate_scenario(db, scenario, actions)
    result["narrative_summary"] = (
        f"Applied '{path.get('name', '')}' path with "
        f"{len(path.get('constituent_actions', []))} actions."
    )
    return result
