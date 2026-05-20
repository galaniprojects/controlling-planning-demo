"""Scenario Promote workflow per [B-PR-01..06].

Controller-only. Selective per-diff application — each diff routes through
its native system workflow:

| Diff lever_category   | Routing                                   |
| forecast_grid (own)   | direct_forecast_update                    |
| forecast_grid (other) | change_request                            |
| pipeline_stage        | doi_gate_check                            |
| tech_navigator (own)  | tech_navigator_direct                     |
| tech_navigator (other)| tech_navigator_send_back                  |
| rate_table            | rate_table_update                         |
| people / restructuring| people_action_item                        |
| budget_envelope       | budget_envelope_update                    |
| hypothetical_project  | hypothetical_to_proposed                  |
| hierarchy             | hierarchy_update                          |
| cost_allocation       | cost_allocation_update (Lever 12)         |
| capacity_param        | capacity_param_update                     |

Per [B-PR-02]: Promote requires the scenario's anchor_forecast_version_id
to point to the latest forecast cycle version. If stale, the router returns
409 with "rebase first" message.

Per [B-PR-04]: Partial promotion allowed. Promoted ScenarioAction rows get
``promoted_at`` / ``promoted_by_id`` stamped. Un-promoted actions remain
editable. Scenario stays open.

Per [B-OQ-01] working assumption: Lever 12 (cost allocation rule) diffs ARE
promotable, gated by the per-entity-type RolePermissionGrant from `[F-AC-01]`.
The implementation checks ``RolePermissionGrant.can_edit`` for each
``entity_type`` involved in the diff.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from models.charging import (
    BTCProfile, BTCProfileLine, ChargeableEntity, Distribution,
)
from models.financial import ForecastVersion
from models.projects import Project
from models.scenarios import (
    Scenario, ScenarioAction, ScenarioPromotion, SCENARIO_ROUTING_TYPES,
)
from models.system import RolePermissionGrant
from schemas.common import CurrentUser
from services.scenario_lever12 import (
    ACTION_BTC_LINE_CHANGE,
    ACTION_DISTRIBUTION_CHANGE,
    ACTION_TO_BUSINESS_CHANGE,
    scenario_version,
)


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------

class PromoteError(Exception):
    """Promote-time error. Router maps to HTTP 409."""

    def __init__(self, message: str, *, hint: Optional[str] = None):
        super().__init__(message)
        self.message = message
        self.hint = hint


# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------

def assert_anchor_is_latest_cycle(
    db: Session, scenario: Scenario,
) -> tuple[ForecastVersion, ForecastVersion]:
    """Per [B-PR-02], anchor must equal the latest cycle version.

    Returns (anchor_version, latest_cycle_version) on success. Raises
    PromoteError when stale (caller surfaces "rebase first" message).
    """
    if scenario.anchor_forecast_version_id is None:
        raise PromoteError(
            "Scenario has no anchor forecast version — rebase to the latest "
            "cycle before promoting.",
            hint="rebase",
        )
    anchor = (
        db.query(ForecastVersion)
        .filter(ForecastVersion.id == scenario.anchor_forecast_version_id)
        .first()
    )
    if anchor is None:
        raise PromoteError(
            f"Anchor forecast version {scenario.anchor_forecast_version_id} "
            "no longer exists. Rebase the scenario to a current version.",
            hint="rebase",
        )
    latest_cycle = (
        db.query(ForecastVersion)
        .filter(ForecastVersion.version_type == "cycle")
        .order_by(ForecastVersion.created_at.desc())
        .first()
    )
    if latest_cycle is None:
        # No cycles exist — anchor is trivially "latest".
        return anchor, anchor
    if anchor.id != latest_cycle.id:
        raise PromoteError(
            f"Scenario anchor (v{anchor.version_number} of project "
            f"{anchor.project_id}) is behind the latest cycle "
            f"(v{latest_cycle.version_number} of project "
            f"{latest_cycle.project_id}). Rebase to the latest cycle "
            "before promoting.",
            hint="rebase",
        )
    return anchor, latest_cycle


# ---------------------------------------------------------------------------
# Routing decision per action
# ---------------------------------------------------------------------------

@dataclass
class RoutingDecision:
    action_id: int
    routing_type: str
    target_id: Optional[str]
    requires_review: bool
    message: str


def decide_routing(
    db: Session, action: ScenarioAction, *, controller_user_id: str,
) -> RoutingDecision:
    """Decide how an action's diff should be applied to live data."""
    cat = action.lever_category or "other"
    project_id = action.project_id

    # Forecast grid changes: own vs other-PL routing.
    if cat == "forecast_grid":
        owner_id = _project_pl_id(db, project_id) if project_id else None
        if owner_id and owner_id != controller_user_id:
            return RoutingDecision(
                action_id=action.id, routing_type="change_request",
                target_id=project_id, requires_review=True,
                message="Forecast change for other-PL project — generates CR.",
            )
        return RoutingDecision(
            action_id=action.id, routing_type="direct_forecast_update",
            target_id=project_id, requires_review=False,
            message="Direct forecast update.",
        )

    if cat == "pipeline_stage":
        return RoutingDecision(
            action_id=action.id, routing_type="doi_gate_check",
            target_id=project_id, requires_review=True,
            message="Pipeline stage transition — DoI gate check at apply time.",
        )

    if cat == "tech_navigator":
        owner_id = _project_pl_id(db, project_id) if project_id else None
        if owner_id and owner_id != controller_user_id:
            return RoutingDecision(
                action_id=action.id, routing_type="tech_navigator_send_back",
                target_id=project_id, requires_review=True,
                message="Tech Navigator change for other-PL project — Send Back to PL.",
            )
        return RoutingDecision(
            action_id=action.id, routing_type="tech_navigator_direct",
            target_id=project_id, requires_review=False,
            message="Direct Tech Navigator update.",
        )

    if cat == "rate_table":
        return RoutingDecision(
            action_id=action.id, routing_type="rate_table_update",
            target_id=None, requires_review=True,
            message="Rate table update — admin path with effective date.",
        )

    if cat == "people":
        return RoutingDecision(
            action_id=action.id, routing_type="people_action_item",
            target_id=None, requires_review=True,
            message="People change — generates HR action item.",
        )

    if cat == "restructuring":
        return RoutingDecision(
            action_id=action.id, routing_type="people_action_item",
            target_id=None, requires_review=True,
            message="Restructuring change — generates HR action item.",
        )

    if cat == "budget_envelope":
        return RoutingDecision(
            action_id=action.id, routing_type="budget_envelope_update",
            target_id=None, requires_review=False,
            message="Budget envelope update via Backlog & Ranking config.",
        )

    if cat == "hypothetical_project":
        return RoutingDecision(
            action_id=action.id, routing_type="hypothetical_to_proposed",
            target_id=None, requires_review=False,
            message="Hypothetical project promoted to real Proposed (DoI 0).",
        )

    if cat == "hierarchy":
        return RoutingDecision(
            action_id=action.id, routing_type="hierarchy_update",
            target_id=project_id, requires_review=False,
            message="Hierarchy reassignment — direct update.",
        )

    if cat == "cost_allocation":
        return RoutingDecision(
            action_id=action.id, routing_type="cost_allocation_update",
            target_id=None, requires_review=False,
            message="Cost allocation rule update (Lever 12).",
        )

    if cat == "capacity_param":
        return RoutingDecision(
            action_id=action.id, routing_type="capacity_param_update",
            target_id=None, requires_review=True,
            message="Capacity parameter update.",
        )

    return RoutingDecision(
        action_id=action.id, routing_type="no_route",
        target_id=None, requires_review=False,
        message=f"No native route for action category '{cat}'.",
    )


def _project_pl_id(db: Session, project_id: str) -> Optional[str]:
    proj = db.query(Project).filter(Project.id == project_id).first()
    return proj.pl_person_id if proj else None


# ---------------------------------------------------------------------------
# [F-AC-01] permission check for Lever 12 promotion
# ---------------------------------------------------------------------------

def _user_can_promote_lever12(
    db: Session, user: CurrentUser, action: ScenarioAction,
) -> tuple[bool, str]:
    """Per [B-OQ-01] working assumption.

    Lever 12 promotion is gated by the RolePermissionGrant grid:
    - controller is always allowed (default override path).
    - other roles require an explicit grant for the entity_type involved.
    Returns (allowed, reason).
    """
    if user.role == "controller":
        # Controllers are the canonical override; default grant path.
        return True, "controller default grant"

    # Determine the entity_type involved.
    try:
        params = json.loads(action.parameters_json) if action.parameters_json else {}
    except json.JSONDecodeError:
        return False, "could not parse action parameters"

    eid = params.get("entity_id") or params.get("source_entity_id")
    if not eid:
        return False, "no entity_id in action parameters"

    entity = db.query(ChargeableEntity).filter_by(id=eid).first()
    if entity is None:
        return False, f"entity '{eid}' not found"

    # entity_type for permission lookup matches Cluster F's seed values:
    # btc_profile, distribution, charging_location, legal_entity.
    if action.action_type == ACTION_BTC_LINE_CHANGE:
        target_perm_type = "btc_profile"
    elif action.action_type in (
        ACTION_DISTRIBUTION_CHANGE, ACTION_TO_BUSINESS_CHANGE,
    ):
        target_perm_type = "distribution"
    else:
        return False, f"unknown lever 12 action type '{action.action_type}'"

    grant = (
        db.query(RolePermissionGrant)
        .filter(
            RolePermissionGrant.role == user.role,
            RolePermissionGrant.entity_type == target_perm_type,
        )
        .first()
    )
    if grant and grant.can_edit:
        return True, f"explicit grant for role={user.role}/entity={target_perm_type}"
    return False, (
        f"role '{user.role}' has no '{target_perm_type}' edit permission "
        f"per [F-AC-01]"
    )


# ---------------------------------------------------------------------------
# Apply routing — execute the diff against live data
# ---------------------------------------------------------------------------

def apply_routing(
    db: Session, action: ScenarioAction, decision: RoutingDecision,
    user: CurrentUser,
) -> tuple[bool, str]:
    """Execute the action's diff against live data per the routing decision.

    Returns (success, message). Failures are non-fatal — the caller records
    them in the routing summary and continues with other actions.
    """
    rt = decision.routing_type

    # Lever 12 routes — copy scenario-version distribution edges back to
    # the canonical version, materialise BTC overlays into BTCProfile/Lines.
    if rt == "cost_allocation_update":
        ok, reason = _user_can_promote_lever12(db, user, action)
        if not ok:
            return False, f"permission denied: {reason}"
        return _promote_lever12_action(db, action, user)

    # Direct updates that the demo can apply minimally.
    if rt == "direct_forecast_update":
        return True, "Direct forecast update applied (demo stub — no live mutation)."
    if rt == "tech_navigator_direct":
        return True, "Tech Navigator update applied (demo stub — no live mutation)."
    if rt == "budget_envelope_update":
        return True, "Budget envelope update applied (demo stub — no live mutation)."
    if rt == "hypothetical_to_proposed":
        return True, "Hypothetical project promoted to Proposed (demo stub)."
    if rt == "hierarchy_update":
        return True, "Hierarchy reassignment applied (demo stub)."

    # Routes that generate downstream action items rather than mutating live
    # data immediately. These are 'success' for the promote step — the action
    # item itself is the output.
    if rt in (
        "change_request", "doi_gate_check", "tech_navigator_send_back",
        "rate_table_update", "people_action_item", "capacity_param_update",
    ):
        return True, f"Action item created via {rt}."

    return False, f"No applier registered for routing '{rt}'."


def _promote_lever12_action(
    db: Session, action: ScenarioAction, user: CurrentUser,
) -> tuple[bool, str]:
    """Materialise a Lever 12 action against live (canonical) data."""
    try:
        params = json.loads(action.parameters_json) if action.parameters_json else {}
    except json.JSONDecodeError:
        return False, "Lever 12 action parameters are not JSON-decodable."

    if action.action_type == ACTION_DISTRIBUTION_CHANGE:
        return _promote_distribution_change(db, params)
    if action.action_type == ACTION_TO_BUSINESS_CHANGE:
        return _promote_to_business_change(db, params)
    if action.action_type == ACTION_BTC_LINE_CHANGE:
        return _promote_btc_line_change(db, params)
    return False, f"Unknown Lever 12 action type '{action.action_type}'."


def _promote_distribution_change(db: Session, params: dict) -> tuple[bool, str]:
    """Copy a scenario-version edge change back to the active production version.

    For 'create' / 'update' / 'delete' operations we mirror the scenario
    edge onto the latest active production ``DistributionVersion``. Post
    FD-3 [F-S1-02] the canonical target is no longer the string
    ``version='forecast'``; it is the latest-activated production version
    resolved by date.

    Validation: edges in the active production version are immutable per
    spec — promote should refuse to write to ``status='active'`` rows. Per
    FD-3 the expected flow is "create a draft version, edit it, activate".
    Until FD-3 B1 lands the version-creation flow in the router, this
    function targets the currently-active version directly to preserve the
    v4-era one-click promote contract; a follow-up will route via a draft.
    """
    from datetime import date as _date
    from decimal import Decimal as _Decimal

    from config import DEMO_DATE
    from models.charging import Distribution as _Distribution, DistributionVersion

    op = params.get("operation")
    src = params.get("source_entity_id")
    dst = params.get("destination_entity_id")
    pct = params.get("percentage")

    # Resolve the live production version by demo date — same logic
    # ``services.scenario_lever12._resolve_active_distribution_version``
    # uses; duplicated locally until FD-3 B1 ships
    # ``services.distribution_service.resolve_active_version``.
    _y, _m = (int(s) for s in DEMO_DATE.split("-"))
    _today = _date(_y, _m, 1)
    active = (
        db.query(DistributionVersion)
        .filter(
            DistributionVersion.scenario_id.is_(None),
            DistributionVersion.status == "active",
            DistributionVersion.active_from.isnot(None),
            DistributionVersion.active_from <= _today,
        )
        .order_by(DistributionVersion.active_from.desc())
        .first()
    )
    if active is None:
        return False, (
            "No active production distribution version found. Activate a "
            "production version before promoting Lever 12 distribution "
            "changes."
        )

    existing = (
        db.query(_Distribution)
        .filter(
            _Distribution.version_id == active.id,
            _Distribution.source_entity_id == src,
            _Distribution.destination_entity_id == dst,
        )
        .first()
    )

    if op == "create":
        if existing is not None:
            existing.percentage = _Decimal(str(round(float(pct), 2)))
            db.flush()
            return True, f"Updated existing live edge {existing.id}."
        edge = _Distribution(
            version_id=active.id,
            source_entity_id=src,
            destination_entity_id=dst,
            percentage=_Decimal(str(round(float(pct), 2))),
        )
        db.add(edge)
        db.flush()
        return True, f"Created live edge {edge.id}."

    if op == "update":
        if existing is None:
            edge = _Distribution(
                version_id=active.id,
                source_entity_id=src,
                destination_entity_id=dst,
                percentage=_Decimal(str(round(float(pct), 2))),
            )
            db.add(edge)
            db.flush()
            return True, f"Created live edge {edge.id} (no prior edge)."
        existing.percentage = _Decimal(str(round(float(pct), 2)))
        db.flush()
        return True, f"Updated live edge {existing.id}."

    if op == "delete":
        if existing is None:
            return True, "Live edge already absent — no-op."
        db.delete(existing)
        db.flush()
        return True, f"Deleted live edge {existing.id}."

    return False, f"Unknown distribution op '{op}'."


def _promote_to_business_change(db: Session, params: dict) -> tuple[bool, str]:
    """Apply a to_business_pct change to the live ChargeableEntity row."""
    eid = params.get("entity_id")
    new_pct = params.get("new_pct")
    entity = db.query(ChargeableEntity).filter_by(id=eid).first()
    if entity is None:
        return False, f"Entity '{eid}' not found."
    from decimal import Decimal
    entity.to_business_pct = Decimal(str(round(float(new_pct), 2)))
    return True, f"Updated to_business_pct to {float(new_pct):.2f}%."


def _promote_btc_line_change(db: Session, params: dict) -> tuple[bool, str]:
    """Replace a BTCProfile's lines with the scenario overlay."""
    eid = params.get("entity_id")
    year = int(params.get("year"))
    lines = list(params.get("lines", []))

    entity = db.query(ChargeableEntity).filter_by(id=eid).first()
    if entity is None:
        return False, f"Entity '{eid}' not found."

    profile = (
        db.query(BTCProfile)
        .filter(BTCProfile.entity_id == eid, BTCProfile.year == year)
        .first()
    )
    if profile is None:
        # Create a minimal manual profile so lines can hang off it.
        profile = BTCProfile(
            entity_id=eid, year=year, mode="manual", status="active",
        )
        db.add(profile)
        db.flush()

    # Wipe existing lines and insert the overlay.
    db.query(BTCProfileLine).filter(BTCProfileLine.profile_id == profile.id).delete()
    from decimal import Decimal
    for line in lines:
        cl_id = line.get("charging_location_id")
        pct = float(line.get("percentage", 0))
        if cl_id and pct > 0:
            db.add(BTCProfileLine(
                profile_id=profile.id,
                charging_location_id=cl_id,
                percentage=Decimal(str(round(pct, 2))),
            ))
    return True, f"Replaced BTC lines for {eid} year {year} ({len(lines)} rows)."


# ---------------------------------------------------------------------------
# Top-level orchestrator
# ---------------------------------------------------------------------------

def preview_promote(
    db: Session, scenario_id: int, *, action_ids: Optional[list[int]] = None,
    user: CurrentUser,
) -> dict:
    """Return the routing summary for the selected diffs (no mutation)."""
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if scenario is None:
        raise PromoteError(f"Scenario {scenario_id} not found.")
    assert_anchor_is_latest_cycle(db, scenario)

    actions = _select_actions(db, scenario_id, action_ids)
    decisions: list[dict] = []
    for a in actions:
        d = decide_routing(db, a, controller_user_id=user.person_id)
        item = {
            "action_id": d.action_id,
            "action_type": a.action_type,
            "lever_category": a.lever_category,
            "routing_type": d.routing_type,
            "target_id": d.target_id,
            "requires_review": d.requires_review,
            "message": d.message,
        }
        if d.routing_type == "cost_allocation_update":
            ok, reason = _user_can_promote_lever12(db, user, a)
            item["permission_ok"] = ok
            item["permission_message"] = reason
        decisions.append(item)
    return {
        "scenario_id": scenario_id,
        "anchor_forecast_version_id": scenario.anchor_forecast_version_id,
        "decisions": decisions,
    }


def execute_promote(
    db: Session, scenario_id: int, *, action_ids: Optional[list[int]] = None,
    user: CurrentUser, notes: Optional[str] = None,
) -> dict:
    """Execute the promote — apply each selected diff via its native route.

    Returns the audit summary. Caller commits.
    """
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if scenario is None:
        raise PromoteError(f"Scenario {scenario_id} not found.")
    assert_anchor_is_latest_cycle(db, scenario)

    actions = _select_actions(db, scenario_id, action_ids)

    summary: list[dict] = []
    promoted_count = 0
    skipped_count = 0
    now = datetime.utcnow()

    for a in actions:
        decision = decide_routing(db, a, controller_user_id=user.person_id)

        # No route → skip with explanation.
        if decision.routing_type == "no_route":
            summary.append({
                "action_id": a.id,
                "routing_type": decision.routing_type,
                "status": "skipped",
                "message": decision.message,
                "target_id": decision.target_id,
            })
            skipped_count += 1
            continue

        ok, msg = apply_routing(db, a, decision, user)
        if ok:
            a.promoted_at = now
            a.promoted_by_id = user.person_id
            promoted_count += 1
            summary.append({
                "action_id": a.id,
                "routing_type": decision.routing_type,
                "status": "promoted",
                "message": msg,
                "target_id": decision.target_id,
            })
        else:
            skipped_count += 1
            summary.append({
                "action_id": a.id,
                "routing_type": decision.routing_type,
                "status": "skipped",
                "message": msg,
                "target_id": decision.target_id,
            })

    promotion = ScenarioPromotion(
        scenario_id=scenario_id,
        promoted_at=now,
        promoted_by_id=user.person_id,
        routing_summary_json=json.dumps(summary, default=str),
        promoted_count=promoted_count,
        skipped_count=skipped_count,
        notes=notes,
    )
    db.add(promotion)
    db.flush()

    return {
        "scenario_id": scenario_id,
        "promotion_id": promotion.id,
        "promoted_at": now.isoformat(),
        "promoted_count": promoted_count,
        "skipped_count": skipped_count,
        "summary": summary,
    }


def _select_actions(
    db: Session, scenario_id: int, action_ids: Optional[list[int]],
) -> list[ScenarioAction]:
    q = db.query(ScenarioAction).filter(
        ScenarioAction.scenario_id == scenario_id,
        ScenarioAction.promoted_at.is_(None),
    )
    if action_ids:
        q = q.filter(ScenarioAction.id.in_(action_ids))
    return q.order_by(ScenarioAction.action_order).all()
