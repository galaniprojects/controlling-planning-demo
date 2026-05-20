"""Lever 12 — Cost allocation rules sandbox engine for Cluster B What-If.

Per spec [B-ES-01] (lever 12) and [F-RV-01..06]:

Lever 12 covers:
- **Stage 1 distribution edges** (inter-service distribution between
  ChargeableEntities) — forked into the scenario via a per-scenario
  ``DistributionVersion`` (``scenario_id=N``, ``status='draft'`` permanently)
  per FD-3 spec §4 [F-S1-02..04]. The Charging/UM rework replaces the v4
  string-keyed ``version='scenario-<id>'`` with this first-class FK model so
  cascade deletes drop the sandbox cleanly when a scenario is removed.
- **Stage 2 BTC profile percentages** (per-charging-location split of the
  to-business share) — recorded as ScenarioActions because BTCProfile has
  no version dimension. Applied as an overlay at impact-calc time.
- **to_business_pct on ChargeableEntity** — recorded as ScenarioActions and
  applied as an overlay at impact-calc time.

Sandbox isolation guarantee per CLAUDE.md:
- Live ``BTCProfile`` / ``BTCProfileLine`` rows are NEVER mutated by this
  module. Only Distribution rows are written, and only under the
  per-scenario draft ``DistributionVersion``.
- The anchor production ``DistributionVersion`` is NEVER mutated — its
  edges are copied lazily into the scenario version on first touch.
- The read-only services (rollup_cache, rollup_query, dag_resolver,
  btc_service, distribution_service) are not modified — we call them with
  scenario-version arguments.

FD-3 anchor pinning per spec §4 Open-Question #3:
- ``Scenario.anchor_distribution_version_id`` pins the production version
  the scenario was forked against at scenario creation time. Prevents
  production reactivations from shifting impact deltas mid-flight.
- ``NULL`` anchor (legacy scenarios) falls back to
  ``resolve_active_version(db, evaluated_date)`` at read time so existing
  v4-era scenarios stay computable.

Per-charging-location impact computation:
- For each affected entity, compute Stage 1 effective cost under the anchor
  ``DistributionVersion`` and under the scenario ``DistributionVersion``.
  Then apply Stage 2 percentages — anchor BTC profile for the anchor side,
  scenario overlay for the scenario side. The delta per
  (entity, charging_location) is reported.

This module deliberately stays additive — F3's rollup engine is the source
of truth for live numbers. We layer the simulator's overlays on top.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from models.charging import (
    BTCProfile, BTCProfileLine, ChargeableEntity, Distribution,
    DistributionVersion,
)
from models.scenarios import Scenario, ScenarioAction
from services.distribution_service import DistributionValidationError


# Sum-rule tolerance — kept in sync with
# ``services.distribution_service.SUM_TOLERANCE``. Mirrored locally so D1
# remains independent of teammate-b's FD-3 B1 refactor of the
# distribution_service helpers.
_SUM_TOLERANCE = 0.01


def _resolve_active_distribution_version(
    db: Session, evaluated_date: date,
) -> Optional[DistributionVersion]:
    """Inline production-version resolver pending FD-3 B1 service landing.

    FD-3 [F-S1-02]: latest production ``DistributionVersion`` whose
    ``active_from`` is on or before ``evaluated_date``. Scenario versions
    (``scenario_id IS NOT NULL``) are excluded by spec.

    Will be replaced by ``services.distribution_service.resolve_active_version``
    once FD-3 B1 lands; the duplication is intentional and short-lived so
    D1 (lever-12 refactor) can land independently of B1 timing.
    """
    return (
        db.query(DistributionVersion)
        .filter(
            DistributionVersion.scenario_id.is_(None),
            DistributionVersion.status == "active",
            DistributionVersion.active_from.isnot(None),
            DistributionVersion.active_from <= evaluated_date,
        )
        .order_by(DistributionVersion.active_from.desc())
        .first()
    )


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Demo date — CLAUDE.md fixes "today" at 2026-04 for time-dependent logic.
# Used as the fallback ``evaluated_date`` when a scenario has no pinned
# ``anchor_distribution_version_id`` (legacy v4 scenarios).
_DEMO_FALLBACK_DATE = date(2026, 4, 1)

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
    """Stable human-readable label for a scenario's sandbox version.

    Returns ``"scenario-<id>"``. This is a pure naming convention used in
    API response payloads, audit lines, and external-facing identifiers. It
    does NOT query the database. The actual sandbox lives in a
    ``DistributionVersion`` row keyed by ``scenario_id``; use
    :func:`_get_or_create_scenario_dist_version` to obtain it.

    Kept for backwards-compatibility with API callers and the v4-era
    promote/audit machinery that ships the label through ``parameters_json``
    payloads. New code should reference ``DistributionVersion.id`` instead.
    """
    return f"scenario-{scenario_id}"


def _ensure_scenario(db: Session, scenario_id: int) -> Scenario:
    sc = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if sc is None:
        raise Lever12Error(f"Scenario {scenario_id} not found")
    return sc


def _resolve_anchor_version_id(
    db: Session, scenario: Scenario,
) -> Optional[int]:
    """Resolve the production anchor for a scenario per FD-3 OQ #3.

    Order of resolution:
    1. ``Scenario.anchor_distribution_version_id`` pinned at creation.
    2. Fallback: ``resolve_active_version(db, demo_today)`` for legacy
       scenarios that pre-date FD-3 (anchor column NULL).

    Returns the ``DistributionVersion.id`` (int) or None when no production
    version is active. None propagates through the lever-12 read paths so
    impact computation degrades gracefully (zero inflow contributions) when
    no anchor exists — the v4 string-keyed code path had no equivalent
    safety net but tests now exercise it.
    """
    if scenario.anchor_distribution_version_id is not None:
        return scenario.anchor_distribution_version_id
    av = _resolve_active_distribution_version(db, _DEMO_FALLBACK_DATE)
    return av.id if av is not None else None


def _get_or_create_scenario_dist_version(
    db: Session, scenario_id: int,
) -> DistributionVersion:
    """Eager-create the per-scenario sandbox ``DistributionVersion``.

    One ``DistributionVersion`` per scenario, identified by ``scenario_id``.
    Created on first mutation with ``status='draft'`` (permanently),
    ``origin='blank'``, empty rationale, ``active_from=NULL`` — none of those
    fields are meaningful for sandbox versions, but the schema requires them.

    The scenario version stays in draft forever — the distribution-service
    activate invariant rejects activating a row with ``scenario_id IS NOT
    NULL`` (per FD-3 [F-S1-02]). When the scenario is deleted, the
    ``ondelete=CASCADE`` on this FK drops the version row and (via the
    edge-level cascade) all child distribution edges.
    """
    existing = (
        db.query(DistributionVersion)
        .filter(DistributionVersion.scenario_id == scenario_id)
        .first()
    )
    if existing is not None:
        return existing
    sv = DistributionVersion(
        scenario_id=scenario_id,
        status="draft",
        origin="blank",
        rationale="",
        active_from=None,
    )
    db.add(sv)
    db.flush()
    return sv


def _next_action_order(db: Session, scenario_id: int) -> int:
    from sqlalchemy import func
    return (
        db.query(func.coalesce(func.max(ScenarioAction.action_order), 0))
        .filter(ScenarioAction.scenario_id == scenario_id)
        .scalar()
    ) + 1


def _assert_scenario_sum_within_100(
    db: Session, scenario_version_id: int, source_entity_id: str,
    *, candidate_destination_id: Optional[str] = None,
    candidate_edge_id: Optional[int] = None,
    candidate_percentage: Optional[float] = None,
) -> None:
    """Sum-rule check scoped to a scenario sandbox version.

    Mirrors ``services.distribution_service.assert_sum_within_100`` semantics
    (``to_business_pct + Σdistribute % ≤ 100``) but reads only edges in the
    given scenario ``DistributionVersion`` so the lever-12 sandbox does not
    leak production-edge percentages into validation. Cadence-agnostic per
    FD-3 [F-S1-02] — no year filter.

    Inlined here to keep D1 independent of FD-3 B1's distribution_service
    refactor; the math is small and stable.
    """
    src = db.query(ChargeableEntity).filter_by(id=source_entity_id).first()
    if src is None:
        raise Lever12Error(f"Source entity '{source_entity_id}' not found")

    edges = (
        db.query(Distribution)
        .filter(
            Distribution.version_id == scenario_version_id,
            Distribution.source_entity_id == source_entity_id,
        )
        .all()
    )

    distribution_total = 0.0
    candidate_applied = False
    for e in edges:
        if candidate_edge_id is not None and e.id == candidate_edge_id:
            distribution_total += float(candidate_percentage or 0.0)
            candidate_applied = True
        else:
            distribution_total += float(e.percentage)
    if candidate_destination_id is not None and not candidate_applied:
        distribution_total += float(candidate_percentage or 0.0)

    to_business = float(src.to_business_pct)
    grand_total = to_business + distribution_total
    if grand_total > 100.0 + _SUM_TOLERANCE:
        raise Lever12Error(
            f"Sum rule violation per [F-S1-02]: to_business_pct "
            f"({to_business:.2f}) + distributed "
            f"({distribution_total:.2f}) = {grand_total:.2f} exceeds 100%",
        )


def _create_scenario_edge(
    db: Session, *, scenario_version_id: int, source_entity_id: str,
    destination_entity_id: str, percentage: float,
) -> Distribution:
    """Insert a scenario-version edge after duplicate-edge validation.

    Cycle + sum-rule checks live at the lever-12 layer (see
    :func:`_check_cycle_across_versions` and
    :func:`_assert_scenario_sum_within_100`) so callers handle them before
    invoking this helper. Caller commits.
    """
    # Reject duplicate edge — uniqueness is also enforced at the DB layer
    # but a friendly 409 is better UX.
    existing = (
        db.query(Distribution)
        .filter(
            Distribution.version_id == scenario_version_id,
            Distribution.source_entity_id == source_entity_id,
            Distribution.destination_entity_id == destination_entity_id,
        )
        .first()
    )
    if existing is not None:
        raise Lever12Error(
            f"Distribution edge already exists "
            f"({source_entity_id} → {destination_entity_id} in scenario "
            f"version {scenario_version_id}). Update the existing edge "
            f"instead.",
        )

    edge = Distribution(
        version_id=scenario_version_id,
        source_entity_id=source_entity_id,
        destination_entity_id=destination_entity_id,
        percentage=Decimal(str(round(percentage, 2))),
    )
    db.add(edge)
    db.flush()
    return edge


def _update_scenario_edge(
    db: Session, edge: Distribution, *, percentage: float,
) -> Distribution:
    """Update a scenario-version edge percentage. Caller commits."""
    edge.percentage = Decimal(str(round(percentage, 2)))
    db.flush()
    return edge


def _delete_scenario_edge(db: Session, edge: Distribution) -> None:
    """Delete a scenario-version edge. Caller commits."""
    db.delete(edge)
    db.flush()


# ---------------------------------------------------------------------------
# Stage 1 — Lazy fork of anchor edges into scenario version
# ---------------------------------------------------------------------------

def fork_entity_edges(
    db: Session, scenario_id: int, entity_id: str,
    *, anchor_version_id: Optional[int] = None,
) -> int:
    """Copy all anchor-version edges sourced at ``entity_id`` to the scenario.

    Idempotent — if scenario-version edges already exist for the entity, no
    copy happens. Returns the count of rows freshly forked.

    The lazy fork pattern means the simulator only stores edges that are
    actually being mutated; untouched entities continue to compute against
    the anchor version through the union-aware read path
    (:func:`_compute_scenario_effective_cost`).

    Cadence-agnostic per FD-3 [F-S1-02] — there is no ``year`` filter on
    distribution edges; the year axis lives on the cost being distributed,
    not on Stage 1.
    """
    scenario = _ensure_scenario(db, scenario_id)
    sv = _get_or_create_scenario_dist_version(db, scenario_id)

    if anchor_version_id is None:
        anchor_version_id = _resolve_anchor_version_id(db, scenario)
    if anchor_version_id is None:
        # No production anchor exists — nothing to fork from.
        return 0

    # Any edges already at scenario version for this entity?
    existing_count = (
        db.query(Distribution)
        .filter(
            Distribution.version_id == sv.id,
            Distribution.source_entity_id == entity_id,
        )
        .count()
    )
    if existing_count > 0:
        return 0

    anchor_edges = (
        db.query(Distribution)
        .filter(
            Distribution.version_id == anchor_version_id,
            Distribution.source_entity_id == entity_id,
        )
        .all()
    )
    forked = 0
    for e in anchor_edges:
        clone = Distribution(
            version_id=sv.id,
            source_entity_id=e.source_entity_id,
            destination_entity_id=e.destination_entity_id,
            percentage=e.percentage,
            rationale=e.rationale,
        )
        db.add(clone)
        forked += 1
    if forked:
        db.flush()
    return forked


def list_scenario_edges(
    db: Session, scenario_id: int, entity_id: str,
    *, anchor_version_id: Optional[int] = None,
) -> list[Distribution]:
    """Return the effective edge list for a scenario.

    If the entity has any scenario-version edges, return those (the fork
    happened already). Otherwise return the anchor edges so the UI can show
    the inherited state.
    """
    scenario = _ensure_scenario(db, scenario_id)
    sv_row = (
        db.query(DistributionVersion)
        .filter(DistributionVersion.scenario_id == scenario_id)
        .first()
    )
    if sv_row is not None:
        rows = (
            db.query(Distribution)
            .filter(
                Distribution.version_id == sv_row.id,
                Distribution.source_entity_id == entity_id,
            )
            .all()
        )
        if rows:
            return rows

    if anchor_version_id is None:
        anchor_version_id = _resolve_anchor_version_id(db, scenario)
    if anchor_version_id is None:
        return []
    return (
        db.query(Distribution)
        .filter(
            Distribution.version_id == anchor_version_id,
            Distribution.source_entity_id == entity_id,
        )
        .all()
    )


# ---------------------------------------------------------------------------
# Stage 1 — Distribution mutation API (exposed to router via scenarios)
# ---------------------------------------------------------------------------

def _check_cycle_across_versions(
    db: Session, source_id: str, dest_id: str,
    *, scenario_version_id: int, anchor_version_id: Optional[int],
) -> Optional[list[str]]:
    """Union-aware cycle detection.

    The lazy-fork pattern means scenario-version edges are sparse — only
    the entities the user has touched. To validate cycles correctly we
    must consider the union of (anchor edges for entities not forked) +
    (scenario edges for entities forked). Detect cycle iff the candidate
    edge would create a cycle in this union graph.

    Cadence-agnostic per FD-3 [F-S1-02] — no ``year`` filter.
    """
    from services.dag_resolver import EdgeKey, detect_cycle

    # Fetch all edges in either version, dedup by (source, dest):
    # scenario rows win (they're the post-fork state), anchor rows fill in
    # for untouched entities.
    scenario_edges = (
        db.query(Distribution)
        .filter(Distribution.version_id == scenario_version_id)
        .all()
    )
    forked_sources = {e.source_entity_id for e in scenario_edges}

    anchor_edges: list[Distribution] = []
    if anchor_version_id is not None:
        anchor_q = db.query(Distribution).filter(
            Distribution.version_id == anchor_version_id,
        )
        if forked_sources:
            anchor_q = anchor_q.filter(
                ~Distribution.source_entity_id.in_(forked_sources),
            )
        anchor_edges = anchor_q.all()

    keys = [
        EdgeKey(source=e.source_entity_id, destination=e.destination_entity_id)
        for e in [*scenario_edges, *anchor_edges]
    ]
    return detect_cycle(keys, source_id, dest_id)


def apply_distribution_create(
    db: Session, scenario_id: int, *, year: int,
    source_entity_id: str, destination_entity_id: str, percentage: float,
) -> dict:
    """Create a new Stage 1 distribution edge in the sandbox.

    Forks edges first if needed, then delegates to distribution_service.
    Records a ScenarioAction with the mutation parameters so the diff
    summary surfaces the change.

    ``year`` is retained in the public API and persisted in
    ``ScenarioAction.parameters_json`` for downstream consumers (promote
    routing, BTC overlay collection) — the distribution edge itself is
    cadence-agnostic per FD-3 [F-S1-02] so ``year`` is not stored on the
    Distribution row.
    """
    scenario = _ensure_scenario(db, scenario_id)
    sv = _get_or_create_scenario_dist_version(db, scenario_id)
    anchor_version_id = _resolve_anchor_version_id(db, scenario)

    fork_entity_edges(
        db, scenario_id, source_entity_id,
        anchor_version_id=anchor_version_id,
    )

    # Union-aware cycle check across anchor + scenario edges.
    chain = _check_cycle_across_versions(
        db, source_entity_id, destination_entity_id,
        scenario_version_id=sv.id, anchor_version_id=anchor_version_id,
    )
    if chain is not None:
        raise Lever12Error(
            f"Cycle detected per [F-S1-05]: {' → '.join(chain)}",
            cycle_chain=chain,
        )

    # Sum rule per [F-S1-02] — scoped to the scenario sandbox.
    _assert_scenario_sum_within_100(
        db, scenario_version_id=sv.id, source_entity_id=source_entity_id,
        candidate_destination_id=destination_entity_id,
        candidate_percentage=percentage,
    )

    try:
        edge = _create_scenario_edge(
            db, scenario_version_id=sv.id,
            source_entity_id=source_entity_id,
            destination_entity_id=destination_entity_id,
            percentage=percentage,
        )
    except DistributionValidationError as exc:  # pragma: no cover — defensive
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
        "version": scenario_version(scenario_id),
        "version_id": sv.id,
        "source_entity_id": source_entity_id,
        "destination_entity_id": destination_entity_id,
        "percentage": float(edge.percentage),
    }


def apply_distribution_update(
    db: Session, scenario_id: int, *, edge_id: int, percentage: float,
) -> dict:
    """Update the percentage on an existing scenario-version edge."""
    scenario = _ensure_scenario(db, scenario_id)
    sv = _get_or_create_scenario_dist_version(db, scenario_id)
    anchor_version_id = _resolve_anchor_version_id(db, scenario)

    edge = db.query(Distribution).filter_by(id=edge_id).first()
    if edge is None:
        raise Lever12Error(f"Distribution edge {edge_id} not found")
    if edge.version_id != sv.id:
        # The edge belongs to anchor; fork first then locate the new edge by
        # source/dest matching.
        fork_entity_edges(
            db, scenario_id, edge.source_entity_id,
            anchor_version_id=anchor_version_id,
        )
        new_edge = (
            db.query(Distribution)
            .filter(
                Distribution.version_id == sv.id,
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

    # Sum rule per [F-S1-02] — scoped to the scenario sandbox; substitute
    # the candidate percentage into the running total.
    _assert_scenario_sum_within_100(
        db, scenario_version_id=sv.id,
        source_entity_id=edge.source_entity_id,
        candidate_edge_id=edge.id, candidate_percentage=percentage,
    )
    _update_scenario_edge(db, edge, percentage=percentage)

    # Persist the edge's source/dest in the action params so the promote
    # service can rematch against the canonical production version without
    # depending on edge_id (which differs across scenario/production rows).
    _record_action(
        db, scenario_id, ACTION_DISTRIBUTION_CHANGE,
        params={
            "operation": "update",
            "edge_id": edge.id,
            "source_entity_id": edge.source_entity_id,
            "destination_entity_id": edge.destination_entity_id,
            "percentage": float(percentage),
        },
    )
    return {
        "edge_id": edge.id,
        "version": scenario_version(scenario_id),
        "version_id": sv.id,
        "source_entity_id": edge.source_entity_id,
        "destination_entity_id": edge.destination_entity_id,
        "percentage": float(edge.percentage),
    }


def apply_distribution_delete(
    db: Session, scenario_id: int, *, edge_id: int,
) -> dict:
    """Delete an edge in the sandbox (forks first if needed)."""
    scenario = _ensure_scenario(db, scenario_id)
    sv = _get_or_create_scenario_dist_version(db, scenario_id)
    anchor_version_id = _resolve_anchor_version_id(db, scenario)

    edge = db.query(Distribution).filter_by(id=edge_id).first()
    if edge is None:
        raise Lever12Error(f"Distribution edge {edge_id} not found")
    if edge.version_id != sv.id:
        fork_entity_edges(
            db, scenario_id, edge.source_entity_id,
            anchor_version_id=anchor_version_id,
        )
        new_edge = (
            db.query(Distribution)
            .filter(
                Distribution.version_id == sv.id,
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
        "source_entity_id": edge.source_entity_id,
        "destination_entity_id": edge.destination_entity_id,
        "percentage": float(edge.percentage),
    }
    _delete_scenario_edge(db, edge)

    _record_action(
        db, scenario_id, ACTION_DISTRIBUTION_CHANGE, params=record_params,
    )
    return {
        "deleted_edge_id": record_params["edge_id"],
        "version": scenario_version(scenario_id),
        "version_id": sv.id,
    }


# ---------------------------------------------------------------------------
# Stage 1 — to_business_pct mutation (overlay)
# ---------------------------------------------------------------------------

def apply_to_business_change(
    db: Session, scenario_id: int, *, entity_id: str, year: int,
    new_pct: float,
) -> dict:
    """Record a to_business_pct override for the scenario.

    The live ChargeableEntity row is **not** mutated. The override lives in
    a ScenarioAction and is applied as an overlay during impact computation.
    Validates that the resulting sum (over scenario-version edges) stays
    within 100% per [F-S1-02].
    """
    scenario = _ensure_scenario(db, scenario_id)
    entity = db.query(ChargeableEntity).filter_by(id=entity_id).first()
    if entity is None:
        raise Lever12Error(f"Chargeable entity '{entity_id}' not found")

    if new_pct < 0 or new_pct > 100:
        raise Lever12Error(
            f"to_business_pct {new_pct} outside [0, 100] range",
        )

    # Fork edges so we can validate the sum against scenario-version edges.
    sv = _get_or_create_scenario_dist_version(db, scenario_id)
    anchor_version_id = _resolve_anchor_version_id(db, scenario)
    fork_entity_edges(
        db, scenario_id, entity_id, anchor_version_id=anchor_version_id,
    )
    edges = (
        db.query(Distribution)
        .filter(
            Distribution.version_id == sv.id,
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


def _compute_anchor_effective_cost(
    db: Session, anchor_version_id: int, entity_id: str,
    *, _seen: Optional[set[str]] = None,
) -> float:
    """Pure anchor-version Stage 1 effective cost (no scenario inflow).

    Replaces the call to ``services.dag_resolver.compute_effective_cost``
    while FD-3 B1's refactor of that helper to the new ``version_id``
    signature is in flight. The math is identical: own_cost + Σ(inflow
    upstream effective cost × edge %). Cycle-defensive via ``_seen``.

    Inlined here to keep D1 independent of FD-3 B1 timing; will collapse
    back to ``compute_effective_cost(db, version_id, entity_id)`` once B1
    lands its refactored helper.
    """
    from services.dag_resolver import get_own_cost

    if _seen is None:
        _seen = set()

    entity = db.query(ChargeableEntity).filter_by(id=entity_id).first()
    if entity is None:
        return 0.0
    if entity_id in _seen:
        return float(get_own_cost(entity))
    _seen.add(entity_id)

    total = float(get_own_cost(entity))
    incoming = (
        db.query(Distribution)
        .filter(
            Distribution.version_id == anchor_version_id,
            Distribution.destination_entity_id == entity_id,
        )
        .all()
    )
    for edge in incoming:
        upstream = _compute_anchor_effective_cost(
            db, anchor_version_id, edge.source_entity_id, _seen=_seen,
        )
        total += upstream * float(edge.percentage) / 100.0
    return total


def _compute_scenario_effective_cost(
    db: Session, scenario_version_id: int, anchor_version_id: Optional[int],
    entity_id: str, *, _seen: Optional[set[str]] = None,
) -> float:
    """Union-aware effective cost for the lever-12 sandbox.

    Lever 12's lazy-fork pattern means scenario-version Distribution rows
    only exist for entities the user actually mutated — every other entity
    inherits its anchor edges. A vanilla single-version walk against the
    scenario version returns own_cost only for entities the user did not
    touch (no inflows). That regression bug was the cost-allocation tile's
    pain point pre-Item-8.

    This walker mirrors ``_check_cycle_across_versions`` semantics: for
    each visited entity, prefer scenario edges (post-fork state) and fall
    back to anchor edges if nothing was forked from that source.

    Cadence-agnostic per FD-3 [F-S1-02] — no ``year`` filter on Distribution.
    Returns the effective cost as a float; inflow detail is internal.
    """
    from services.dag_resolver import get_own_cost

    if _seen is None:
        _seen = set()

    entity = db.query(ChargeableEntity).filter_by(id=entity_id).first()
    if entity is None:
        return 0.0

    if entity_id in _seen:
        # Defensive cycle bottom-out — cycle detection happens at write time.
        return float(get_own_cost(entity))
    _seen.add(entity_id)

    total = float(get_own_cost(entity))

    # Sources for which the scenario forked Stage 1 edges. We use this set
    # to decide which version to query for each incoming edge's source.
    forked_sources = {
        row[0] for row in
        db.query(Distribution.source_entity_id)
        .filter(Distribution.version_id == scenario_version_id)
        .distinct()
        .all()
    }

    # Incoming edges into this entity = union of (scenario edges where the
    # source was forked) + (anchor edges where the source was NOT forked).
    incoming_scenario = (
        db.query(Distribution)
        .filter(
            Distribution.version_id == scenario_version_id,
            Distribution.destination_entity_id == entity_id,
        )
        .all()
    )
    incoming_anchor: list[Distribution] = []
    if anchor_version_id is not None:
        incoming_anchor_all = (
            db.query(Distribution)
            .filter(
                Distribution.version_id == anchor_version_id,
                Distribution.destination_entity_id == entity_id,
            )
            .all()
        )
        incoming_anchor = [
            e for e in incoming_anchor_all
            if e.source_entity_id not in forked_sources
        ]

    for edge in [*incoming_scenario, *incoming_anchor]:
        upstream_cost = _compute_scenario_effective_cost(
            db, scenario_version_id, anchor_version_id,
            edge.source_entity_id, _seen=_seen,
        )
        total += upstream_cost * float(edge.percentage) / 100.0
    return total


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
            # Distribution actions are cadence-agnostic post-FD-3. Older
            # actions (pre-FD-3 seed/audit data) may still carry a ``year``
            # key — match the legacy semantics: include the action when
            # ``year`` is missing OR matches the requested year. The
            # touched-entity set is a superset filter, so a permissive
            # match is safe — non-impactful entities drop out at the
            # delta-magnitude filter below.
            action_year = params.get("year")
            if action_year is None or int(action_year) == year:
                if params.get("source_entity_id"):
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
        action_year = params.get("year")
        if action_year is not None and int(action_year) != year:
            continue
        dest = params.get("destination_entity_id")
        if dest:
            touched.add(dest)
    return touched


def compute_cost_allocation_impact(
    db: Session, scenario_id: int, *, year: int,
) -> dict:
    """Per-charging-location impact: anchor vs scenario for the given year.

    Returns a payload of the shape::

        {
            "year": <int>,
            "anchor_version": <str>,        # human-readable label
            "anchor_version_id": <int|None>,
            "scenario_version": "scenario-<id>",
            "scenario_version_id": <int>,
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

    ``year`` is still meaningful for Stage 2 (BTC profile + to_business
    overlays are year-scoped). Stage 1 Distribution edges are
    cadence-agnostic per FD-3 [F-S1-02] so the anchor/scenario version_ids
    do not depend on year.
    """
    scenario = _ensure_scenario(db, scenario_id)
    sv = _get_or_create_scenario_dist_version(db, scenario_id)
    anchor_version_id = _resolve_anchor_version_id(db, scenario)

    anchor_label = (
        f"v{anchor_version_id}" if anchor_version_id is not None else "none"
    )
    scenario_label = scenario_version(scenario_id)

    touched = _entities_touched_by_scenario(db, scenario_id, year)

    # If no Lever 12 mutations, the impact is zero.
    if not touched:
        return {
            "year": year,
            "anchor_version": anchor_label,
            "anchor_version_id": anchor_version_id,
            "scenario_version": scenario_label,
            "scenario_version_id": sv.id,
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

        # Compute Stage 1 effective cost on each side. If no anchor version
        # is resolvable (legacy scenario, no production version yet) we
        # treat the anchor side as own-cost-only via a defensive call.
        if anchor_version_id is not None:
            anchor_eff_cost = _compute_anchor_effective_cost(
                db, anchor_version_id, entity_id,
            )
        else:
            from services.dag_resolver import get_own_cost
            anchor_eff_cost = get_own_cost(entity)

        # Union-aware walk: any unforked source falls back to its anchor
        # edges. Without this, BTC-only scenarios (no Stage 1 fork) lose
        # every upstream inflow on the scenario side, producing misleading
        # deltas.
        scenario_eff_cost = _compute_scenario_effective_cost(
            db, sv.id, anchor_version_id, entity_id,
        )

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
            anchor_eff_cost, anchor_tb, anchor_lines,
        )
        scenario_per_loc = _per_location_amount(
            scenario_eff_cost, scenario_tb, scenario_lines,
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
        "anchor_version": anchor_label,
        "anchor_version_id": anchor_version_id,
        "scenario_version": scenario_label,
        "scenario_version_id": sv.id,
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
    """Delete the per-scenario sandbox ``DistributionVersion`` and its edges.

    Caller commits. Returns the count of distribution edges removed. Lever
    12 BTC and to_business_pct overlays live in ScenarioActions which the
    scenario delete cascade already removes.

    Post-FD-3 semantics: the cascade chain is
    ``Scenario → DistributionVersion(scenario_id=N) → Distribution(version_id=…)``.
    We could rely on the DB cascade alone when Scenario is deleted, but
    callers (notably ``DELETE /api/scenarios/{id}``) invoke this helper
    explicitly to mirror the v4-era "manual cleanup" contract and to return
    the count of removed edges for audit/UX.
    """
    sv = (
        db.query(DistributionVersion)
        .filter(DistributionVersion.scenario_id == scenario_id)
        .first()
    )
    if sv is None:
        return 0
    n = (
        db.query(Distribution)
        .filter(Distribution.version_id == sv.id)
        .count()
    )
    # Delete the header — cascade on Distribution.version_id removes edges.
    db.delete(sv)
    db.flush()
    return n
