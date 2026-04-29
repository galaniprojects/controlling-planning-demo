"""Lever 12 — Cost allocation rules sandbox engine for Cluster B What-If.

Per spec [B-ES-01] (lever 12) and [F-RV-01..06]:

Lever 12 covers:
- **Stage 1 distribution edges** (inter-service distribution between
  ChargeableEntities) — forked into the scenario as Distribution rows under
  ``version='scenario-{id}'`` per [F-S1-04].
- **Stage 2 BTC profile percentages** (per-charging-location split of the
  to-business share) — recorded as ScenarioActions because BTCProfile has
  no version dimension. Applied as an overlay at impact-calc time.
- **to_business_pct on ChargeableEntity** — recorded as ScenarioActions and
  applied as an overlay at impact-calc time.

Sandbox isolation guarantee per CLAUDE.md:
- Live ``BTCProfile`` / ``BTCProfileLine`` rows are NEVER mutated by this
  module. Only Distribution rows are written, and only under the
  scenario-scoped version.
- The read-only services (rollup_cache, rollup_query, dag_resolver,
  btc_service, distribution_service) are not modified — we call them with
  scenario-scoped arguments.

Per-charging-location impact computation:
- For each affected entity, compute Stage 1 effective cost under the anchor
  version (typically 'forecast') and under the scenario version
  ('scenario-{id}'). Then apply Stage 2 percentages — anchor BTC profile
  for the anchor side, scenario overlay for the scenario side. The delta
  per (entity, charging_location) is reported.

This module deliberately stays additive — F3's rollup engine is the source
of truth for live numbers. We layer the simulator's overlays on top.
"""

from __future__ import annotations

import json
from collections import defaultdict
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from models.charging import (
    BTCProfile, BTCProfileLine, ChargeableEntity, Distribution,
)
from models.scenarios import Scenario, ScenarioAction
from services.dag_resolver import compute_effective_cost
from services.distribution_service import (
    DistributionValidationError,
    create_distribution_edge,
    delete_distribution_edge,
    update_distribution_edge,
    update_to_business_pct,
)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Default anchor version when not pinned on the scenario.
DEFAULT_ANCHOR_VERSION = "forecast"

# Action types for the Lever 12 sub-surface.
ACTION_DISTRIBUTION_CHANGE = "distribution_edge_change"
ACTION_BTC_LINE_CHANGE = "btc_profile_line_change"
ACTION_TO_BUSINESS_CHANGE = "to_business_pct_change"

LEVER12_ACTION_TYPES = (
    ACTION_DISTRIBUTION_CHANGE,
    ACTION_BTC_LINE_CHANGE,
    ACTION_TO_BUSINESS_CHANGE,
)

LEVER12_CATEGORY = "cost_allocation"


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------

class Lever12Error(Exception):
    """Surface for Lever 12 mutation errors. Router maps to HTTP 409."""

    def __init__(self, message: str, *, cycle_chain: Optional[list[str]] = None):
        super().__init__(message)
        self.message = message
        self.cycle_chain = cycle_chain


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def scenario_version(scenario_id: int) -> str:
    """Return the canonical Distribution.version string for a scenario."""
    return f"scenario-{scenario_id}"


def _next_action_order(db: Session, scenario_id: int) -> int:
    from sqlalchemy import func
    return (
        db.query(func.coalesce(func.max(ScenarioAction.action_order), 0))
        .filter(ScenarioAction.scenario_id == scenario_id)
        .scalar()
    ) + 1


def _ensure_scenario(db: Session, scenario_id: int) -> Scenario:
    sc = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if sc is None:
        raise Lever12Error(f"Scenario {scenario_id} not found")
    return sc


# ---------------------------------------------------------------------------
# Stage 1 — Lazy fork of forecast edges into scenario version
# ---------------------------------------------------------------------------

def fork_entity_edges(
    db: Session, scenario_id: int, entity_id: str, year: int,
    *, anchor_version: str = DEFAULT_ANCHOR_VERSION,
) -> int:
    """Copy all anchor-version edges sourced at ``entity_id`` to the scenario.

    Idempotent — if scenario-version edges already exist for the entity, no
    copy happens. Returns the count of rows freshly forked.

    The lazy fork pattern means the simulator only stores edges that are
    actually being mutated; untouched entities continue to compute against
    the anchor version through the read path's fallback.
    """
    sv = scenario_version(scenario_id)

    # Any edges already at scenario version for this entity?
    existing_count = (
        db.query(Distribution)
        .filter(
            Distribution.year == year,
            Distribution.version == sv,
            Distribution.source_entity_id == entity_id,
        )
        .count()
    )
    if existing_count > 0:
        return 0

    anchor_edges = (
        db.query(Distribution)
        .filter(
            Distribution.year == year,
            Distribution.version == anchor_version,
            Distribution.source_entity_id == entity_id,
        )
        .all()
    )
    forked = 0
    for e in anchor_edges:
        clone = Distribution(
            year=year, version=sv,
            source_entity_id=e.source_entity_id,
            destination_entity_id=e.destination_entity_id,
            percentage=e.percentage,
        )
        db.add(clone)
        forked += 1
    if forked:
        db.flush()
    return forked


def list_scenario_edges(
    db: Session, scenario_id: int, entity_id: str, year: int,
    *, anchor_version: str = DEFAULT_ANCHOR_VERSION,
) -> list[Distribution]:
    """Return the effective edge list for a scenario.

    If the entity has any scenario-version edges, return those (the fork
    happened already). Otherwise return the anchor edges so the UI can show
    the inherited state.
    """
    sv = scenario_version(scenario_id)
    rows = (
        db.query(Distribution)
        .filter(
            Distribution.year == year,
            Distribution.version == sv,
            Distribution.source_entity_id == entity_id,
        )
        .all()
    )
    if rows:
        return rows
    return (
        db.query(Distribution)
        .filter(
            Distribution.year == year,
            Distribution.version == anchor_version,
            Distribution.source_entity_id == entity_id,
        )
        .all()
    )


# ---------------------------------------------------------------------------
# Stage 1 — Distribution mutation API (exposed to router via scenarios)
# ---------------------------------------------------------------------------

def _check_cycle_across_versions(
    db: Session, year: int, source_id: str, dest_id: str,
    *, scenario_version_str: str, anchor_version: str,
) -> Optional[list[str]]:
    """Union-aware cycle detection.

    The lazy-fork pattern means scenario-version edges are sparse — only
    the entities the user has touched. To validate cycles correctly we
    must consider the union of (anchor edges for entities not forked) +
    (scenario edges for entities forked). Detect cycle iff the candidate
    edge would create a cycle in this union graph.
    """
    from services.dag_resolver import EdgeKey, detect_cycle

    # Fetch all edges in either version, dedup by (source, dest):
    # scenario rows win (they're the post-fork state), anchor rows fill in
    # for untouched entities.
    scenario_edges = (
        db.query(Distribution)
        .filter(
            Distribution.year == year,
            Distribution.version == scenario_version_str,
        )
        .all()
    )
    forked_sources = {e.source_entity_id for e in scenario_edges}

    anchor_edges = (
        db.query(Distribution)
        .filter(
            Distribution.year == year,
            Distribution.version == anchor_version,
            ~Distribution.source_entity_id.in_(forked_sources)
            if forked_sources else Distribution.source_entity_id.isnot(None),
        )
        .all()
    )

    keys = [
        EdgeKey(source=e.source_entity_id, destination=e.destination_entity_id)
        for e in [*scenario_edges, *anchor_edges]
    ]
    return detect_cycle(keys, source_id, dest_id)


def apply_distribution_create(
    db: Session, scenario_id: int, *, year: int,
    source_entity_id: str, destination_entity_id: str, percentage: float,
    anchor_version: str = DEFAULT_ANCHOR_VERSION,
) -> dict:
    """Create a new Stage 1 distribution edge in the sandbox.

    Forks edges first if needed, then delegates to distribution_service.
    Records a ScenarioAction with the mutation parameters so the diff
    summary surfaces the change.
    """
    _ensure_scenario(db, scenario_id)
    sv = scenario_version(scenario_id)
    fork_entity_edges(db, scenario_id, source_entity_id, year, anchor_version=anchor_version)

    # Union-aware cycle check across anchor + scenario edges.
    chain = _check_cycle_across_versions(
        db, year, source_entity_id, destination_entity_id,
        scenario_version_str=sv, anchor_version=anchor_version,
    )
    if chain is not None:
        raise Lever12Error(
            f"Cycle detected per [F-S1-05]: {' → '.join(chain)}",
            cycle_chain=chain,
        )

    try:
        edge = create_distribution_edge(
            db, year=year, version=sv,
            source_entity_id=source_entity_id,
            destination_entity_id=destination_entity_id,
            percentage=percentage,
        )
    except DistributionValidationError as exc:
        raise Lever12Error(exc.message, cycle_chain=exc.cycle_chain) from exc

    _record_action(
        db, scenario_id, ACTION_DISTRIBUTION_CHANGE,
        params={
            "operation": "create",
            "year": year,
            "source_entity_id": source_entity_id,
            "destination_entity_id": destination_entity_id,
            "percentage": float(percentage),
            "edge_id": edge.id,
        },
    )
    return {
        "edge_id": edge.id,
        "year": year,
        "version": sv,
        "source_entity_id": source_entity_id,
        "destination_entity_id": destination_entity_id,
        "percentage": float(edge.percentage),
    }


def apply_distribution_update(
    db: Session, scenario_id: int, *, edge_id: int, percentage: float,
    anchor_version: str = DEFAULT_ANCHOR_VERSION,
) -> dict:
    """Update the percentage on an existing scenario-version edge."""
    _ensure_scenario(db, scenario_id)
    sv = scenario_version(scenario_id)
    edge = db.query(Distribution).filter_by(id=edge_id).first()
    if edge is None:
        raise Lever12Error(f"Distribution edge {edge_id} not found")
    if edge.version != sv:
        # The edge belongs to anchor; fork first then locate the new edge by
        # source/dest matching.
        fork_entity_edges(
            db, scenario_id, edge.source_entity_id, edge.year,
            anchor_version=anchor_version,
        )
        new_edge = (
            db.query(Distribution)
            .filter(
                Distribution.year == edge.year,
                Distribution.version == sv,
                Distribution.source_entity_id == edge.source_entity_id,
                Distribution.destination_entity_id == edge.destination_entity_id,
            )
            .first()
        )
        if new_edge is None:
            raise Lever12Error(
                f"Failed to fork edge {edge_id} into scenario {scenario_id}",
            )
        edge = new_edge
    try:
        update_distribution_edge(db, edge.id, percentage=percentage)
    except DistributionValidationError as exc:
        raise Lever12Error(exc.message, cycle_chain=exc.cycle_chain) from exc

    _record_action(
        db, scenario_id, ACTION_DISTRIBUTION_CHANGE,
        params={
            "operation": "update",
            "edge_id": edge.id,
            "year": edge.year,
            "source_entity_id": edge.source_entity_id,
            "destination_entity_id": edge.destination_entity_id,
            "percentage": float(percentage),
        },
    )
    return {
        "edge_id": edge.id,
        "year": edge.year,
        "version": sv,
        "source_entity_id": edge.source_entity_id,
        "destination_entity_id": edge.destination_entity_id,
        "percentage": float(edge.percentage),
    }


def apply_distribution_delete(
    db: Session, scenario_id: int, *, edge_id: int,
    anchor_version: str = DEFAULT_ANCHOR_VERSION,
) -> dict:
    """Delete an edge in the sandbox (forks first if needed)."""
    _ensure_scenario(db, scenario_id)
    sv = scenario_version(scenario_id)
    edge = db.query(Distribution).filter_by(id=edge_id).first()
    if edge is None:
        raise Lever12Error(f"Distribution edge {edge_id} not found")
    if edge.version != sv:
        fork_entity_edges(
            db, scenario_id, edge.source_entity_id, edge.year,
            anchor_version=anchor_version,
        )
        new_edge = (
            db.query(Distribution)
            .filter(
                Distribution.year == edge.year,
                Distribution.version == sv,
                Distribution.source_entity_id == edge.source_entity_id,
                Distribution.destination_entity_id == edge.destination_entity_id,
            )
            .first()
        )
        if new_edge is None:
            raise Lever12Error(
                f"Failed to fork edge {edge_id} into scenario {scenario_id}",
            )
        edge = new_edge

    record_params = {
        "operation": "delete",
        "edge_id": edge.id,
        "year": edge.year,
        "source_entity_id": edge.source_entity_id,
        "destination_entity_id": edge.destination_entity_id,
        "percentage": float(edge.percentage),
    }
    try:
        delete_distribution_edge(db, edge.id)
    except DistributionValidationError as exc:
        raise Lever12Error(exc.message) from exc

    _record_action(
        db, scenario_id, ACTION_DISTRIBUTION_CHANGE, params=record_params,
    )
    return {"deleted_edge_id": record_params["edge_id"], "version": sv}


# ---------------------------------------------------------------------------
# Stage 1 — to_business_pct mutation (overlay)
# ---------------------------------------------------------------------------

def apply_to_business_change(
    db: Session, scenario_id: int, *, entity_id: str, year: int,
    new_pct: float, anchor_version: str = DEFAULT_ANCHOR_VERSION,
) -> dict:
    """Record a to_business_pct override for the scenario.

    The live ChargeableEntity row is **not** mutated. The override lives in
    a ScenarioAction and is applied as an overlay during impact computation.
    Validates that the resulting sum (over scenario-version edges) stays
    within 100% per [F-S1-02].
    """
    _ensure_scenario(db, scenario_id)
    entity = db.query(ChargeableEntity).filter_by(id=entity_id).first()
    if entity is None:
        raise Lever12Error(f"Chargeable entity '{entity_id}' not found")

    if new_pct < 0 or new_pct > 100:
        raise Lever12Error(
            f"to_business_pct {new_pct} outside [0, 100] range",
        )

    # Fork edges so we can validate the sum against scenario-version edges.
    sv = scenario_version(scenario_id)
    fork_entity_edges(db, scenario_id, entity_id, year, anchor_version=anchor_version)
    edges = (
        db.query(Distribution)
        .filter(
            Distribution.year == year,
            Distribution.version == sv,
            Distribution.source_entity_id == entity_id,
        )
        .all()
    )
    edge_sum = sum(float(e.percentage) for e in edges)
    if edge_sum + new_pct > 100.0 + 0.01:
        raise Lever12Error(
            f"Sum rule violation per [F-S1-02]: distributed ({edge_sum:.2f}) "
            f"+ new to_business_pct ({new_pct:.2f}) = {edge_sum + new_pct:.2f} "
            f"exceeds 100%",
        )

    _record_action(
        db, scenario_id, ACTION_TO_BUSINESS_CHANGE,
        params={
            "entity_id": entity_id,
            "year": year,
            "anchor_pct": float(entity.to_business_pct),
            "new_pct": float(new_pct),
        },
    )
    return {
        "entity_id": entity_id,
        "year": year,
        "anchor_pct": float(entity.to_business_pct),
        "scenario_pct": float(new_pct),
    }


# ---------------------------------------------------------------------------
# Stage 2 — BTC profile line mutation (overlay)
# ---------------------------------------------------------------------------

def apply_btc_lines_change(
    db: Session, scenario_id: int, *, entity_id: str, year: int,
    lines: list[dict],
) -> dict:
    """Record a BTC profile-line overlay for (entity, year) in the scenario.

    ``lines`` is a list of ``{"charging_location_id": str, "percentage": float}``.
    The list represents the **complete** target state — empty means "wipe to
    no allocation". The live BTCProfileLine rows are **not** touched.

    Sum-to-100 validation runs at the service layer (consistent with
    btc_service's BTC_SUM_TOLERANCE = 0.01) when ``lines`` is non-empty.
    """
    _ensure_scenario(db, scenario_id)
    entity = db.query(ChargeableEntity).filter_by(id=entity_id).first()
    if entity is None:
        raise Lever12Error(f"Chargeable entity '{entity_id}' not found")

    # Validate per-line percentages and sum-to-100 (when non-empty).
    total = 0.0
    for line in lines:
        pct = line.get("percentage", 0)
        if pct is None or pct < 0 or pct > 100:
            raise Lever12Error(
                f"BTC line percentage {pct} outside (0, 100] range",
            )
        total += float(pct)
    if lines and abs(total - 100.0) > 0.01:
        raise Lever12Error(
            f"BTC lines must sum to 100% (got {total:.2f})",
        )

    _record_action(
        db, scenario_id, ACTION_BTC_LINE_CHANGE,
        params={
            "entity_id": entity_id,
            "year": year,
            "lines": [
                {
                    "charging_location_id": line["charging_location_id"],
                    "percentage": float(line["percentage"]),
                }
                for line in lines
            ],
        },
    )
    return {
        "entity_id": entity_id,
        "year": year,
        "scenario_lines": [
            {
                "charging_location_id": line["charging_location_id"],
                "percentage": float(line["percentage"]),
            }
            for line in lines
        ],
    }


# ---------------------------------------------------------------------------
# Internal — record action helper
# ---------------------------------------------------------------------------

def _record_action(
    db: Session, scenario_id: int, action_type: str, *, params: dict,
) -> ScenarioAction:
    """Insert a ScenarioAction row and bump the modified timestamp.

    All Lever 12 actions get scope='portfolio', tier=2, lever_category=
    'cost_allocation' per [B-AC-02].
    """
    from datetime import datetime
    action = ScenarioAction(
        scenario_id=scenario_id,
        action_order=_next_action_order(db, scenario_id),
        scope="portfolio",
        action_type=action_type,
        project_id=None,
        parameters_json=json.dumps(params, default=str),
        impact_delta_json=None,
        group_label=None,
        lever_category=LEVER12_CATEGORY,
        tier=2,
    )
    db.add(action)

    # Bump the scenario modified_at so the UI's stale indicator triggers.
    sc = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if sc is not None:
        sc.modified_at = datetime.utcnow()

    db.flush()
    return action


# ---------------------------------------------------------------------------
# Per-charging-location impact (anchor vs scenario)
# ---------------------------------------------------------------------------

@dataclass
class LocationImpact:
    entity_id: str
    entity_name: str
    charging_location_id: str
    charging_location_code: str
    anchor_amount: float
    scenario_amount: float
    delta: float


def _collect_btc_overlay(
    db: Session, scenario_id: int, year: int,
) -> dict[tuple[str, int], list[dict]]:
    """Build ``{(entity_id, year): [scenario_lines]}`` from scenario actions.

    The most recent ``btc_profile_line_change`` action for an
    (entity, year) wins. Earlier actions are superseded.
    """
    actions = (
        db.query(ScenarioAction)
        .filter(
            ScenarioAction.scenario_id == scenario_id,
            ScenarioAction.action_type == ACTION_BTC_LINE_CHANGE,
        )
        .order_by(ScenarioAction.action_order)
        .all()
    )
    overlay: dict[tuple[str, int], list[dict]] = {}
    for a in actions:
        try:
            params = json.loads(a.parameters_json) if a.parameters_json else {}
        except json.JSONDecodeError:
            continue
        if int(params.get("year", 0)) != year:
            continue
        eid = params.get("entity_id")
        if not eid:
            continue
        overlay[(eid, year)] = list(params.get("lines", []))
    return overlay


def _collect_to_business_overlay(
    db: Session, scenario_id: int, year: int,
) -> dict[str, float]:
    """Build ``{entity_id: scenario_to_business_pct}`` from scenario actions."""
    actions = (
        db.query(ScenarioAction)
        .filter(
            ScenarioAction.scenario_id == scenario_id,
            ScenarioAction.action_type == ACTION_TO_BUSINESS_CHANGE,
        )
        .order_by(ScenarioAction.action_order)
        .all()
    )
    overlay: dict[str, float] = {}
    for a in actions:
        try:
            params = json.loads(a.parameters_json) if a.parameters_json else {}
        except json.JSONDecodeError:
            continue
        if int(params.get("year", 0)) != year:
            continue
        eid = params.get("entity_id")
        if not eid:
            continue
        overlay[eid] = float(params.get("new_pct", 0.0))
    return overlay


def _live_btc_lines(
    db: Session, entity_id: str, year: int,
) -> list[dict]:
    """Return the live BTC profile lines for an entity-year, or []."""
    profile = (
        db.query(BTCProfile)
        .filter(BTCProfile.entity_id == entity_id, BTCProfile.year == year)
        .first()
    )
    if profile is None:
        return []
    lines = (
        db.query(BTCProfileLine).filter(BTCProfileLine.profile_id == profile.id).all()
    )
    return [
        {
            "charging_location_id": line.charging_location_id,
            "percentage": float(line.percentage),
        }
        for line in lines
    ]


def _per_location_amount(
    effective_cost: float, to_business_pct: float, btc_lines: list[dict],
) -> dict[str, float]:
    """Return ``{cl_id: eur_amount}`` after applying Stage 2 split."""
    if not btc_lines or to_business_pct <= 0 or effective_cost <= 0:
        return {}
    to_business_value = effective_cost * (to_business_pct / 100.0)
    out: dict[str, float] = {}
    for line in btc_lines:
        cl_id = line["charging_location_id"]
        share = float(line.get("percentage", 0)) / 100.0
        out[cl_id] = round(to_business_value * share, 2)
    return out


def _entities_touched_by_scenario(
    db: Session, scenario_id: int, year: int,
) -> set[str]:
    """Return the union of entity ids that have any Lever 12 action."""
    actions = (
        db.query(ScenarioAction)
        .filter(
            ScenarioAction.scenario_id == scenario_id,
            ScenarioAction.action_type.in_(LEVER12_ACTION_TYPES),
        )
        .all()
    )
    touched: set[str] = set()
    for a in actions:
        try:
            params = json.loads(a.parameters_json) if a.parameters_json else {}
        except json.JSONDecodeError:
            continue
        if a.action_type == ACTION_DISTRIBUTION_CHANGE:
            if int(params.get("year", year)) == year and params.get("source_entity_id"):
                touched.add(params["source_entity_id"])
        else:
            if int(params.get("year", year)) == year and params.get("entity_id"):
                touched.add(params["entity_id"])

    # Add destination entities of distribution changes — their effective
    # costs are also affected by upstream edge changes.
    dist_actions = [a for a in actions if a.action_type == ACTION_DISTRIBUTION_CHANGE]
    for a in dist_actions:
        try:
            params = json.loads(a.parameters_json) if a.parameters_json else {}
        except json.JSONDecodeError:
            continue
        dest = params.get("destination_entity_id")
        if dest:
            touched.add(dest)
    return touched


def compute_cost_allocation_impact(
    db: Session, scenario_id: int, *, year: int,
    anchor_version: str = DEFAULT_ANCHOR_VERSION,
) -> dict:
    """Per-charging-location impact: anchor vs scenario for the given year.

    Returns a payload of the shape::

        {
            "year": <int>,
            "anchor_version": <str>,
            "scenario_version": "scenario-<id>",
            "touched_entity_count": <int>,
            "items": [LocationImpact, ...],
            "totals": {
                "anchor_total": <float>,
                "scenario_total": <float>,
                "delta": <float>,
            },
        }

    Only the entities the scenario actually touches contribute non-zero
    deltas — untouched entities cost out identically on both sides and are
    omitted from ``items``. Per [F-RV-02] cache fork-on-mutation principle.
    """
    sv = scenario_version(scenario_id)
    touched = _entities_touched_by_scenario(db, scenario_id, year)

    # If no Lever 12 mutations, the impact is zero.
    if not touched:
        return {
            "year": year,
            "anchor_version": anchor_version,
            "scenario_version": sv,
            "touched_entity_count": 0,
            "items": [],
            "totals": {"anchor_total": 0.0, "scenario_total": 0.0, "delta": 0.0},
        }

    btc_overlay = _collect_btc_overlay(db, scenario_id, year)
    tb_overlay = _collect_to_business_overlay(db, scenario_id, year)

    # Pre-fetch charging location codes for labelling.
    from models.charging import ChargingLocation
    cl_lookup = {
        cl.id: cl.code
        for cl in db.query(ChargingLocation.id, ChargingLocation.code).all()
    }

    items: list[LocationImpact] = []
    anchor_grand = 0.0
    scenario_grand = 0.0

    for entity_id in sorted(touched):
        entity = db.query(ChargeableEntity).filter_by(id=entity_id).first()
        if entity is None:
            continue

        anchor_eff = compute_effective_cost(db, year, anchor_version, entity_id)
        scenario_eff = compute_effective_cost(db, year, sv, entity_id)

        # to_business overlay: scenario value if set, else anchor.
        anchor_tb = float(entity.to_business_pct)
        scenario_tb = tb_overlay.get(entity_id, anchor_tb)

        # BTC overlay: scenario lines if set (overlay key present), else live.
        if (entity_id, year) in btc_overlay:
            scenario_lines = btc_overlay[(entity_id, year)]
        else:
            scenario_lines = _live_btc_lines(db, entity_id, year)
        anchor_lines = _live_btc_lines(db, entity_id, year)

        anchor_per_loc = _per_location_amount(
            anchor_eff.effective_cost, anchor_tb, anchor_lines,
        )
        scenario_per_loc = _per_location_amount(
            scenario_eff.effective_cost, scenario_tb, scenario_lines,
        )

        all_cls = set(anchor_per_loc) | set(scenario_per_loc)
        for cl_id in sorted(all_cls):
            a = anchor_per_loc.get(cl_id, 0.0)
            s = scenario_per_loc.get(cl_id, 0.0)
            delta = round(s - a, 2)
            anchor_grand += a
            scenario_grand += s
            if abs(delta) < 0.005:
                # Skip noise rows so the UI stays focused on changed rows.
                continue
            items.append(LocationImpact(
                entity_id=entity_id,
                entity_name=entity.name,
                charging_location_id=cl_id,
                charging_location_code=cl_lookup.get(cl_id, cl_id),
                anchor_amount=round(a, 2),
                scenario_amount=round(s, 2),
                delta=delta,
            ))

    return {
        "year": year,
        "anchor_version": anchor_version,
        "scenario_version": sv,
        "touched_entity_count": len(touched),
        "items": [
            {
                "entity_id": i.entity_id,
                "entity_name": i.entity_name,
                "charging_location_id": i.charging_location_id,
                "charging_location_code": i.charging_location_code,
                "anchor_amount": i.anchor_amount,
                "scenario_amount": i.scenario_amount,
                "delta": i.delta,
            }
            for i in items
        ],
        "totals": {
            "anchor_total": round(anchor_grand, 2),
            "scenario_total": round(scenario_grand, 2),
            "delta": round(scenario_grand - anchor_grand, 2),
        },
    }


# ---------------------------------------------------------------------------
# Cleanup — invoked when a scenario is deleted so the sandbox doesn't leak
# ---------------------------------------------------------------------------

def cleanup_lever12_state(db: Session, scenario_id: int) -> int:
    """Delete all scenario-version Distribution rows for a scenario.

    Caller commits. Returns the count of rows removed. Lever 12 BTC and
    to_business_pct overlays live in ScenarioActions which the scenario
    delete cascade already removes.
    """
    sv = scenario_version(scenario_id)
    rows = db.query(Distribution).filter(Distribution.version == sv).all()
    n = len(rows)
    for r in rows:
        db.delete(r)
    return n
