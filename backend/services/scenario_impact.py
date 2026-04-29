"""Scenario impact dashboard — 8-dimension calculator per [B-ID-01..03].

The dashboard computes server-side as a single atomic operation per the spec
recalculation model. Every call rebuilds the dashboard from current scenario
state; there is no incremental delta cache. Cluster B's design principle
"on-demand recalculation, atomically consistent" justifies the simple shape.

Eight dimensions:
1. Financial impact     — total budget delta, CapEx/OpEx shift, per-project.
2. Backlog ranking      — projects shifting above/below cutoff, contestable
                          envelope changes.
3. Capacity impact      — per-cost-centre / per-role utilization deltas.
4. People impact        — Tier 3 only; specific people allocation deltas.
5. Outsourcing ratio    — internal/external mix vs target.
6. Investment mix       — distribution by hierarchy node / Type / T-level.
7. Running cost         — long-term tail for Operate-stage projects.
8. Change summary       — audit-style list of every diff in the scenario.

Per [B-AC-03], the People dimension (4) is OMITTED for callers without
Tier 3 access. The router decides whether to include it based on the
caller's User.tier3_flag.
"""

from __future__ import annotations

import json
from collections import defaultdict
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from models.financial import Forecast
from models.organization import CostCenter
from models.projects import Project
from models.scenarios import (
    Scenario, ScenarioAction, ScenarioCapacityImpact, ScenarioState,
)


# ---------------------------------------------------------------------------
# Tier 3 categorisation
# ---------------------------------------------------------------------------

# Categories that touch Tier 3 surfaces per [B-AC-02..03]. Used to flag a
# scenario's tier3_content_flag and to redact the 'people' dimension for
# users without Tier 3 access.
TIER3_LEVER_CATEGORIES = {
    "people",
    "rate_table",
    "capacity_param",
    "restructuring",
}


def has_tier3_diffs(actions: list[ScenarioAction]) -> bool:
    """Return True if any action targets a Tier 3 lever."""
    return any(
        (a.tier == 3) or (a.lever_category in TIER3_LEVER_CATEGORIES)
        for a in actions
    )


# ---------------------------------------------------------------------------
# Helper — load anchor totals from anchor forecast version
# ---------------------------------------------------------------------------

def _anchor_total_from_version(
    db: Session, scenario: Scenario,
) -> Optional[float]:
    """Return the anchor forecast version's grand total in EUR, or None."""
    if scenario.anchor_forecast_version_id is None:
        return None
    from models.financial import ForecastVersion
    fv = (
        db.query(ForecastVersion)
        .filter(ForecastVersion.id == scenario.anchor_forecast_version_id)
        .first()
    )
    if fv is None or fv.total_amount_eur is None:
        return None
    return float(fv.total_amount_eur)


# ---------------------------------------------------------------------------
# Dimension 1 — Financial
# ---------------------------------------------------------------------------

def compute_financial_dimension(
    db: Session, scenario: Scenario, scenario_state: dict,
) -> dict:
    """Dimension 1 — financial impact summary.

    Reuses the existing scenario_engine totals (``total_budget_original`` /
    ``total_budget_adjusted``) and adds anchor-version comparison plus
    CapEx/OpEx breakdown.
    """
    dashboard = scenario_state.get("impact_dashboard", {})
    project_states = scenario_state.get("project_states", [])

    capex_orig = 0.0
    capex_adj = 0.0
    opex_orig = 0.0
    opex_adj = 0.0
    capex_opex_lookup = {
        row[0]: row[1] for row in db.query(Project.id, Project.capex_opex).all()
    }
    for ps in project_states:
        kind = capex_opex_lookup.get(ps.get("project_id"), "opex")
        if kind == "capex":
            capex_orig += float(ps.get("original_budget", 0))
            capex_adj += float(ps.get("adjusted_budget", 0))
        else:
            opex_orig += float(ps.get("original_budget", 0))
            opex_adj += float(ps.get("adjusted_budget", 0))

    anchor_total = _anchor_total_from_version(db, scenario)
    return {
        "total_anchor": anchor_total,
        "total_original": dashboard.get("total_budget_original", 0.0),
        "total_adjusted": dashboard.get("total_budget_adjusted", 0.0),
        "total_delta": dashboard.get("total_budget_delta", 0.0),
        "capex": {
            "original": round(capex_orig, 2),
            "adjusted": round(capex_adj, 2),
            "delta": round(capex_adj - capex_orig, 2),
        },
        "opex": {
            "original": round(opex_orig, 2),
            "adjusted": round(opex_adj, 2),
            "delta": round(opex_adj - opex_orig, 2),
        },
        "time_frame_breakdown": dashboard.get("time_frame_breakdown", []),
    }


# ---------------------------------------------------------------------------
# Dimension 2 — Backlog ranking
# ---------------------------------------------------------------------------

def compute_backlog_ranking_dimension(
    db: Session, scenario: Scenario, scenario_state: dict,
) -> dict:
    """Dimension 2 — backlog ranking shifts.

    Identifies projects whose adjusted budget pushes them above or below
    their anchor position. Lightweight version: counts affected projects;
    full backlog re-rank is computed on demand by the simulator UI through
    a separate endpoint.
    """
    project_states = scenario_state.get("project_states", [])
    affected = sum(1 for ps in project_states if ps.get("is_affected"))
    removed = sum(
        1 for ps in project_states
        if ps.get("is_affected") and float(ps.get("adjusted_budget", 0)) <= 0
        and float(ps.get("original_budget", 0)) > 0
    )
    return {
        "projects_affected": affected,
        "projects_removed_count": removed,
        "headline": (
            f"{affected} project(s) shifted by scenario actions"
            if affected else "No project ranking shifts"
        ),
    }


# ---------------------------------------------------------------------------
# Dimension 3 — Capacity
# ---------------------------------------------------------------------------

def compute_capacity_dimension(
    db: Session, scenario: Scenario, scenario_state: dict,
) -> dict:
    """Dimension 3 — capacity impact (per cost-centre utilization deltas)."""
    capacity = scenario_state.get("capacity_impacts", [])

    by_cc: dict[str, dict] = defaultdict(lambda: {
        "cost_center_id": "",
        "max_original": 0.0,
        "max_adjusted": 0.0,
        "fte_delta_total": 0.0,
        "month_count": 0,
    })

    for c in capacity:
        bucket = by_cc[c["cost_center_id"]]
        bucket["cost_center_id"] = c["cost_center_id"]
        bucket["max_original"] = max(bucket["max_original"], c["original_utilization_pct"])
        bucket["max_adjusted"] = max(bucket["max_adjusted"], c["adjusted_utilization_pct"])
        bucket["fte_delta_total"] += c["fte_delta"]
        bucket["month_count"] += 1

    cc_summary = list(by_cc.values())
    over_100 = sum(
        1 for cc in cc_summary if cc["max_adjusted"] >= 100.0
    )
    return {
        "cost_centers": cc_summary,
        "over_100_count": over_100,
        "headline": (
            f"{over_100} cost centre(s) >100% utilization"
            if over_100 else "All cost centres within capacity"
        ),
    }


# ---------------------------------------------------------------------------
# Dimension 4 — People (Tier 3 only)
# ---------------------------------------------------------------------------

def compute_people_dimension(
    db: Session, scenario: Scenario, scenario_state: dict,
) -> dict:
    """Dimension 4 — people impact (Tier 3 only).

    Returns counts of people-related diffs by sub-type. Caller must check
    Tier 3 access before exposing this dimension to the user.
    """
    actions = (
        db.query(ScenarioAction)
        .filter(
            ScenarioAction.scenario_id == scenario.id,
            ScenarioAction.lever_category.in_(("people", "restructuring")),
        )
        .all()
    )
    by_type: dict[str, int] = defaultdict(int)
    for a in actions:
        by_type[a.action_type] += 1
    return {
        "tier": 3,
        "action_count": len(actions),
        "by_type": dict(by_type),
        "headline": (
            f"{len(actions)} Tier 3 people/restructuring action(s)"
            if actions else "No Tier 3 people changes"
        ),
    }


# ---------------------------------------------------------------------------
# Dimension 5 — Outsourcing ratio
# ---------------------------------------------------------------------------

def compute_outsourcing_ratio_dimension(
    db: Session, scenario: Scenario, scenario_state: dict,
) -> dict:
    """Dimension 5 — internal vs external split, scenario vs anchor."""
    # Live data: sum of forecast amount_eur grouped by category.
    rows = (
        db.query(Forecast.category, func.sum(Forecast.amount_eur))
        .group_by(Forecast.category)
        .all()
    )
    totals: dict[str, float] = {row[0] or "unknown": float(row[1] or 0) for row in rows}
    internal = totals.get("internal", 0.0)
    external = totals.get("external", 0.0)
    grand = internal + external
    internal_pct = round((internal / grand * 100.0) if grand else 0.0, 2)
    external_pct = round((external / grand * 100.0) if grand else 0.0, 2)
    return {
        "internal_total": round(internal, 2),
        "external_total": round(external, 2),
        "internal_pct": internal_pct,
        "external_pct": external_pct,
        "headline": f"Internal {internal_pct}% / External {external_pct}%",
    }


# ---------------------------------------------------------------------------
# Dimension 6 — Investment mix
# ---------------------------------------------------------------------------

def compute_investment_mix_dimension(
    db: Session, scenario: Scenario, scenario_state: dict,
) -> dict:
    """Dimension 6 — distribution by hierarchy top-level node."""
    project_states = scenario_state.get("project_states", [])
    from services.portfolio_service import (
        get_project_entity_info, get_top_level_entity_type_id,
    )
    top_type = get_top_level_entity_type_id(db)
    by_node: dict[str, dict] = defaultdict(lambda: {
        "node_id": "",
        "node_name": "",
        "anchor_total": 0.0,
        "scenario_total": 0.0,
    })
    for ps in project_states:
        info = get_project_entity_info(db, ps["project_id"], top_type)
        nid = info["id"] if info else "unassigned"
        nname = info["name"] if info else "Unassigned"
        bucket = by_node[nid]
        bucket["node_id"] = nid
        bucket["node_name"] = nname
        bucket["anchor_total"] += float(ps.get("original_budget", 0))
        bucket["scenario_total"] += float(ps.get("adjusted_budget", 0))
    items = []
    grand_anchor = sum(b["anchor_total"] for b in by_node.values()) or 1.0
    grand_scenario = sum(b["scenario_total"] for b in by_node.values()) or 1.0
    for b in by_node.values():
        items.append({
            "node_id": b["node_id"],
            "node_name": b["node_name"],
            "anchor_total": round(b["anchor_total"], 2),
            "scenario_total": round(b["scenario_total"], 2),
            "anchor_pct": round(b["anchor_total"] / grand_anchor * 100.0, 2),
            "scenario_pct": round(b["scenario_total"] / grand_scenario * 100.0, 2),
            "delta": round(b["scenario_total"] - b["anchor_total"], 2),
        })
    items.sort(key=lambda x: -x["scenario_total"])
    return {
        "items": items,
        "headline": f"{len(items)} top-level node(s) tracked",
    }


# ---------------------------------------------------------------------------
# Dimension 7 — Running cost / long-term sustainability
# ---------------------------------------------------------------------------

def compute_running_cost_dimension(
    db: Session, scenario: Scenario, scenario_state: dict,
) -> dict:
    """Dimension 7 — long-term cost tail for Operate-stage projects.

    Surfaces the time-frame breakdown so the UI can render a CY / NY /
    out-year chart. The breakdown is already computed by the engine; this
    dimension passes it through with a headline summary.
    """
    breakdown = (
        scenario_state.get("impact_dashboard", {}).get("time_frame_breakdown", [])
    )
    overall = next((b for b in breakdown if b.get("label") == "Overall"), None)
    if overall:
        delta = overall.get("delta", 0.0)
        headline = (
            f"Total horizon delta: {'+' if delta >= 0 else ''}€{delta:,.0f}"
        )
    else:
        headline = "No long-term breakdown available"
    return {
        "time_frame_breakdown": breakdown,
        "headline": headline,
    }


# ---------------------------------------------------------------------------
# Dimension 8 — Change summary
# ---------------------------------------------------------------------------

def compute_change_summary_dimension(
    db: Session, scenario: Scenario, scenario_state: dict,
) -> dict:
    """Dimension 8 — audit-style list of every diff in the scenario."""
    actions = scenario_state.get("actions", [])
    by_category: dict[str, int] = defaultdict(int)
    for a in actions:
        cat = (a.get("lever_category")
               or _infer_category(a.get("action_type", "")))
        by_category[cat] += 1
    return {
        "total_actions": len(actions),
        "by_category": dict(by_category),
        "actions": actions,
    }


def _infer_category(action_type: str) -> str:
    """Best-effort category inference for legacy actions without lever_category."""
    if action_type in ("delay_project", "accelerate_project", "pause_project"):
        return "milestone"
    if action_type in ("remove_project", "scale_budget", "reduce_budget",
                       "increase_budget", "adjust_budget", "cut_consulting",
                       "adjust_external_cost"):
        return "forecast_grid"
    if action_type in ("change_allocation",):
        return "people"
    if action_type in ("rate_escalation",):
        return "rate_table"
    if action_type in ("freeze_new_starts", "across_the_board_cut",
                       "reduce_lob", "cut_by_lob", "cut_by_type",
                       "cap_cost_category", "apply_pct_cut"):
        return "portfolio_rule"
    if action_type in ("distribution_edge_change", "btc_profile_line_change",
                       "to_business_pct_change"):
        return "cost_allocation"
    return "other"


# ---------------------------------------------------------------------------
# Top-level orchestrator
# ---------------------------------------------------------------------------

def compute_impact_dashboard(
    db: Session, scenario_id: int, scenario_state: dict,
    *, include_tier3: bool, include_lever12: bool = True,
    lever12_year: int = 2026,
) -> dict:
    """Compute the full 8-dimension dashboard for a scenario.

    ``include_tier3`` toggles the People dimension and any Tier 3 details.
    ``include_lever12`` toggles the per-charging-location cost allocation
    impact section. Set False if the caller is rendering a thin context.
    """
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if scenario is None:
        return {}

    actions = (
        db.query(ScenarioAction)
        .filter(ScenarioAction.scenario_id == scenario_id)
        .all()
    )
    tier3_present = has_tier3_diffs(actions)

    dashboard: dict = {
        "scenario_id": scenario_id,
        "tier3_content": tier3_present,
        "tier3_visible": include_tier3,
        "stale": _is_stale(scenario),
        "anchor_forecast_version_id": scenario.anchor_forecast_version_id,
        "dimensions": {
            "financial": compute_financial_dimension(db, scenario, scenario_state),
            "backlog_ranking": compute_backlog_ranking_dimension(
                db, scenario, scenario_state,
            ),
            "capacity": compute_capacity_dimension(db, scenario, scenario_state),
            "outsourcing_ratio": compute_outsourcing_ratio_dimension(
                db, scenario, scenario_state,
            ),
            "investment_mix": compute_investment_mix_dimension(
                db, scenario, scenario_state,
            ),
            "running_cost": compute_running_cost_dimension(
                db, scenario, scenario_state,
            ),
            "change_summary": compute_change_summary_dimension(
                db, scenario, scenario_state,
            ),
        },
    }

    if include_tier3:
        dashboard["dimensions"]["people"] = compute_people_dimension(
            db, scenario, scenario_state,
        )
    else:
        dashboard["dimensions"]["people"] = {
            "tier": 3,
            "redacted": True,
            "headline": "Tier 3 — restricted",
        }

    if include_lever12:
        from services.scenario_lever12 import compute_cost_allocation_impact
        try:
            dashboard["dimensions"]["cost_allocation"] = (
                compute_cost_allocation_impact(db, scenario_id, year=lever12_year)
            )
        except Exception as exc:  # noqa: BLE001
            # Defensive: cost allocation impact is a heavy compute that
            # should never crash the dashboard.
            import logging
            logging.getLogger(__name__).warning(
                "compute_cost_allocation_impact failed for scenario %s: %s",
                scenario_id, exc,
            )
            dashboard["dimensions"]["cost_allocation"] = {
                "year": lever12_year,
                "items": [],
                "totals": {"anchor_total": 0.0, "scenario_total": 0.0, "delta": 0.0},
                "error": str(exc),
            }

    return dashboard


def _is_stale(scenario: Scenario) -> bool:
    """Return True when the scenario has unrecalculated edits."""
    if scenario.last_recalculated_at is None:
        # Never recalculated counts as stale only if there are actions.
        return scenario.modified_at is not None
    return (
        scenario.modified_at is not None
        and scenario.modified_at > scenario.last_recalculated_at
    )


def mark_recalculated(db: Session, scenario_id: int) -> None:
    """Stamp the scenario as freshly recalculated."""
    from datetime import datetime
    sc = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if sc is not None:
        sc.last_recalculated_at = datetime.utcnow()
        # Also re-evaluate tier3 content flag for stable list-view filtering.
        actions = (
            db.query(ScenarioAction)
            .filter(ScenarioAction.scenario_id == scenario_id)
            .all()
        )
        sc.tier3_content_flag = has_tier3_diffs(actions)
