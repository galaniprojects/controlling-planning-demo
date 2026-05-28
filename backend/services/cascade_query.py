"""Bidirectional Stage 1 cascade query service (Service Workbench Session 2).

Two top-level query functions feeding two new read endpoints under
``/api/charging/``:

- :func:`query_cascade_chain` — full upstream + focal + downstream chain
  for a focal ChargeableEntity, including the focal's BTC business
  terminals. Powers the Allocation Flow view (Session 4).
- :func:`query_distribution_candidates` — every active ChargeableEntity
  eligible as a new distribution target from a given source, with the
  ``resulting_chain_depth`` and a near-max-depth warning flag. Powers the
  entity picker (Session 5).

This module is intentionally small: it composes existing primitives
(Teammate A's :func:`services.dag_resolver.compute_effective_cost` and
:func:`services.dag_resolver.detect_cycle_db`; Teammate B's
:func:`services.depth_validation.get_max_allocation_depth` and
:func:`services.depth_validation.compute_chain_depths_for_version`;
:func:`services.distribution_service.resolve_active_version`) rather than
reimplementing DAG traversal. The router converts the returned dataclasses
to Pydantic responses.
"""

from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import date
from typing import Optional

from sqlalchemy.orm import Session

from config import DEMO_DATE as _DEMO_DATE
from models.charging import (
    BTCProfile, BTCProfileLine, ChargeableEntity, ChargingLocation,
    Distribution, DistributionVersion,
)

# Deferred imports for teammate-owned modules — A/B may not be merged yet in
# this worktree. Python resolves at call-time so the failure surface is
# moved to the runtime rather than import-time of cascade_query itself.
# This mirrors the pattern A uses in dag_resolver.get_upstream_chain.


_DEMO_YEAR = int(_DEMO_DATE.split("-")[0])


# ---------------------------------------------------------------------------
# Result dataclasses (router converts to Pydantic)
# ---------------------------------------------------------------------------


@dataclass
class CascadeNodeResult:
    entity_id: str
    entity_name: str
    entity_type: str  # "Project" | "Offering" | "InternalService"
    identifier: str
    own_cost: float
    effective_cost: float
    to_business_pct: float
    self_retained_pct: float


@dataclass
class CascadeEdgeResult:
    source_entity_id: str
    destination_entity_id: str
    percentage: float
    amount: float
    chain_depth: Optional[int]
    rationale: Optional[str]


@dataclass
class CascadeBusinessTerminalResult:
    charging_location_id: str
    code: str
    name: str
    percentage: float
    amount: float


@dataclass
class CascadeChainResult:
    focal: CascadeNodeResult
    upstream: list[CascadeNodeResult]
    downstream: list[CascadeNodeResult]
    edges: list[CascadeEdgeResult]
    business_terminals: list[CascadeBusinessTerminalResult]
    version: DistributionVersion
    evaluated_date: date
    max_allocation_depth: int


@dataclass
class DistributionCandidateResult:
    entity_id: str
    entity_name: str
    entity_type: str
    identifier: str
    resulting_chain_depth: int
    near_max_depth_warning: bool
    would_violate_max_depth: bool


@dataclass
class CascadeCandidatesResult:
    source_entity_id: str
    version_id: int
    max_allocation_depth: int
    candidates: list[DistributionCandidateResult] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _resolve_version(
    db: Session, version_id: Optional[int], evaluated_date: Optional[date],
) -> DistributionVersion:
    """Resolve a Distribution version explicitly or via active-on-date.

    Mirrors ``routers.charging._resolve_version_param`` but kept local to
    the service so callers don't have to import a router-private helper.
    Raises ``ValueError`` for not-found / no-active conditions — the router
    converts these into HTTPException(404).
    """
    if version_id is not None:
        v = db.query(DistributionVersion).filter_by(id=version_id).first()
        if v is None:
            raise ValueError(f"DistributionVersion {version_id} not found")
        return v
    # Defer to distribution_service so we share the production-only filter.
    from services.distribution_service import resolve_active_version
    eff_date = evaluated_date or date.today()
    v = resolve_active_version(db, eff_date)
    if v is None:
        raise ValueError(
            f"No production DistributionVersion in force for {eff_date}",
        )
    return v


def _derive_year(
    version: DistributionVersion, evaluated_date: Optional[date],
) -> int:
    """Year used for own-cost (Project.annual_budget) and BTC-profile lookup.

    Priority: ``evaluated_date.year`` (if supplied) >
    ``version.active_from.year`` (if explicit/historical version_id) >
    ``DEMO_DATE.year`` (fallback for legacy versions with no active_from).
    Aligns the cascade output with the same year axis the rest of the app
    uses — a historical version_id pulls historical year-of-cost data
    instead of silently mapping to the demo year.
    """
    if evaluated_date is not None:
        return evaluated_date.year
    if version.active_from is not None:
        return version.active_from.year
    return _DEMO_YEAR


def _build_node(
    db: Session, entity: ChargeableEntity, version_id: int, year: int,
) -> CascadeNodeResult:
    """Compute the cascade-node payload for one entity.

    Uses A's memoization-aware ``compute_effective_cost`` — repeated calls
    across siblings still benefit from the per-call ``_memo`` dict, but
    cross-call we pay for each focal node only once per
    :func:`query_cascade_chain` invocation since the cascade walk passes
    a shared ``_memo`` through. ``year`` is derived once per request by
    :func:`_derive_year` and threaded through so own-cost lookups (which
    are year-scoped on ``Project.annual_budget``) stay consistent with
    the resolved version.
    """
    from services.dag_resolver import compute_effective_cost

    result = compute_effective_cost(db, year, version_id, entity.id)
    to_business = float(entity.to_business_pct or 0)

    # Self-retained = 100 - to_business - sum(outgoing distribution %).
    # Same formula the existing sum_validation surfaces use.
    outgoing_sum = (
        db.query(Distribution.percentage)
        .filter(
            Distribution.version_id == version_id,
            Distribution.source_entity_id == entity.id,
        )
        .all()
    )
    out_total = sum(float(p[0]) for p in outgoing_sum)
    self_retained = max(0.0, 100.0 - to_business - out_total)

    return CascadeNodeResult(
        entity_id=entity.id,
        entity_name=entity.name,
        entity_type=entity.entity_type,
        identifier=entity.identifier,
        own_cost=round(result.own_cost, 2),
        effective_cost=round(result.effective_cost, 2),
        to_business_pct=round(to_business, 2),
        self_retained_pct=round(self_retained, 2),
    )


def _walk_directed(
    db: Session, version_id: int, start_entity_id: str, direction: str,
) -> tuple[set[str], list[Distribution]]:
    """BFS over Distribution edges in one direction.

    ``direction`` is ``"upstream"`` (walk source ← destination) or
    ``"downstream"`` (walk source → destination). Returns the set of
    visited entity ids (excluding the start) and the list of all edges
    traversed during the walk (deduped by id).
    """
    visited: set[str] = set()
    edges_by_id: dict[int, Distribution] = {}
    queue: deque[str] = deque([start_entity_id])

    while queue:
        current = queue.popleft()
        if direction == "upstream":
            rows = (
                db.query(Distribution)
                .filter(
                    Distribution.version_id == version_id,
                    Distribution.destination_entity_id == current,
                )
                .all()
            )
            for edge in rows:
                edges_by_id[edge.id] = edge
                neighbour = edge.source_entity_id
                if neighbour not in visited and neighbour != start_entity_id:
                    visited.add(neighbour)
                    queue.append(neighbour)
        else:  # downstream
            rows = (
                db.query(Distribution)
                .filter(
                    Distribution.version_id == version_id,
                    Distribution.source_entity_id == current,
                )
                .all()
            )
            for edge in rows:
                edges_by_id[edge.id] = edge
                neighbour = edge.destination_entity_id
                if neighbour not in visited and neighbour != start_entity_id:
                    visited.add(neighbour)
                    queue.append(neighbour)

    return visited, list(edges_by_id.values())


def _business_terminals_for_entity(
    db: Session, entity: ChargeableEntity, effective_cost: float, year: int,
) -> list[CascadeBusinessTerminalResult]:
    """Return the focal entity's business-terminal contributions for ``year``.

    Each row is one line on the active BTC profile for the derived year
    (see :func:`_derive_year`). EUR amount = ``effective × to_business% × line%``.
    Returns an empty list when the entity has no active profile for the year
    (the to_business share may still be non-zero but unrouted — that's a UI
    surface concern).
    """
    profile = (
        db.query(BTCProfile)
        .filter(
            BTCProfile.entity_id == entity.id,
            BTCProfile.year == year,
            BTCProfile.status == "active",
        )
        .first()
    )
    if profile is None or not profile.lines:
        return []

    to_business = float(entity.to_business_pct or 0)
    business_total = effective_cost * to_business / 100.0

    terminals: list[CascadeBusinessTerminalResult] = []
    for line in profile.lines:
        cl = line.charging_location
        amount = business_total * float(line.percentage) / 100.0
        terminals.append(CascadeBusinessTerminalResult(
            charging_location_id=line.charging_location_id,
            code=cl.code if cl is not None else "",
            name=cl.name if cl is not None else "",
            percentage=float(line.percentage),
            amount=round(amount, 2),
        ))
    return terminals


# ---------------------------------------------------------------------------
# Public — cascade chain
# ---------------------------------------------------------------------------


def query_cascade_chain(
    db: Session,
    entity_id: str,
    version_id: Optional[int] = None,
    evaluated_date: Optional[date] = None,
) -> CascadeChainResult:
    """Resolve the full bidirectional cascade for a focal entity.

    Returns a :class:`CascadeChainResult` with focal + upstream + downstream
    nodes (deduped, transitively collected) plus all edges in the displayed
    sub-graph plus the focal's business terminals. ``version_id`` selects
    the Stage 1 version explicitly; otherwise resolves the production
    version in force on ``evaluated_date`` (default: today).

    Raises ``ValueError`` for not-found focal / no active production
    version; the router maps these to HTTP 404.
    """
    focal = db.query(ChargeableEntity).filter_by(id=entity_id).first()
    if focal is None:
        raise ValueError(f"ChargeableEntity {entity_id} not found")

    version = _resolve_version(db, version_id, evaluated_date)
    eff_date = evaluated_date or date.today()
    year = _derive_year(version, evaluated_date)

    # Resolve B's max-depth value via a deferred import.
    from services.depth_validation import get_max_allocation_depth
    max_depth = get_max_allocation_depth(db)

    # Walk both directions from the focal node. The focal is included
    # in neither set — we add the focal as a separate node below.
    upstream_ids, upstream_edges = _walk_directed(
        db, version.id, entity_id, "upstream",
    )
    downstream_ids, downstream_edges = _walk_directed(
        db, version.id, entity_id, "downstream",
    )

    # Build node payloads — focal first so its effective cost feeds the
    # business-terminal calc, then each upstream and downstream entity.
    focal_node = _build_node(db, focal, version.id, year)

    upstream_nodes: list[CascadeNodeResult] = []
    if upstream_ids:
        rows = (
            db.query(ChargeableEntity)
            .filter(ChargeableEntity.id.in_(upstream_ids))
            .all()
        )
        # Stable-ish ordering by entity_id for deterministic responses.
        rows.sort(key=lambda r: r.id)
        upstream_nodes = [_build_node(db, r, version.id, year) for r in rows]

    downstream_nodes: list[CascadeNodeResult] = []
    if downstream_ids:
        rows = (
            db.query(ChargeableEntity)
            .filter(ChargeableEntity.id.in_(downstream_ids))
            .all()
        )
        rows.sort(key=lambda r: r.id)
        downstream_nodes = [_build_node(db, r, version.id, year) for r in rows]

    # Effective-cost lookup keyed by entity id, for edge amount resolution.
    # Includes the focal so edges anchored at the focal also resolve.
    cost_by_id: dict[str, float] = {focal_node.entity_id: focal_node.effective_cost}
    for n in upstream_nodes:
        cost_by_id[n.entity_id] = n.effective_cost
    for n in downstream_nodes:
        cost_by_id[n.entity_id] = n.effective_cost

    # Merge upstream and downstream edge sets (dedupe by id — diamond paths
    # can re-visit the same edge from both sides though typically only one
    # direction yields a given edge).
    edges_by_id: dict[int, Distribution] = {e.id: e for e in upstream_edges}
    for e in downstream_edges:
        edges_by_id[e.id] = e

    edge_results: list[CascadeEdgeResult] = []
    for edge in sorted(
        edges_by_id.values(),
        key=lambda e: (e.source_entity_id, e.destination_entity_id),
    ):
        src_cost = cost_by_id.get(edge.source_entity_id, 0.0)
        amount = src_cost * float(edge.percentage) / 100.0
        edge_results.append(CascadeEdgeResult(
            source_entity_id=edge.source_entity_id,
            destination_entity_id=edge.destination_entity_id,
            percentage=float(edge.percentage),
            amount=round(amount, 2),
            chain_depth=edge.chain_depth,
            rationale=edge.rationale,
        ))

    terminals = _business_terminals_for_entity(
        db, focal, focal_node.effective_cost, year,
    )

    return CascadeChainResult(
        focal=focal_node,
        upstream=upstream_nodes,
        downstream=downstream_nodes,
        edges=edge_results,
        business_terminals=terminals,
        version=version,
        evaluated_date=eff_date,
        max_allocation_depth=max_depth,
    )


# ---------------------------------------------------------------------------
# Public — distribution candidates
# ---------------------------------------------------------------------------


def _compute_depth_per_node(
    edges: list[tuple[str, str]],
) -> tuple[dict[str, int], dict[str, int]]:
    """Return (longest_path_ending_at, longest_path_starting_at) for every node.

    Both values are **edge counts** (a single isolated node = 0). Compatible
    with :func:`services.depth_validation._longest_distance_from_roots` and
    directly comparable to ``max_allocation_depth`` (also edge-count).

    Used to derive the resulting chain depth for a hypothetical new edge
    ``source → candidate``:
    ``resulting_depth = ends_at[source] + 1 + starts_at[candidate]`` — the
    ``+1`` accounts for the new edge itself; ``ends_at[source]`` is the
    longest path of existing edges that terminates at the source; and
    ``starts_at[candidate]`` is the longest path of existing edges that
    starts at the candidate.

    ``edges`` is a list of ``(source_id, destination_id)`` pairs in the
    current version graph (without the simulated new edge). Disconnected /
    unknown nodes default to 0 in the caller.
    """
    # Build adjacency (forward) and reverse adjacency.
    forward: dict[str, list[str]] = defaultdict(list)
    reverse: dict[str, list[str]] = defaultdict(list)
    nodes: set[str] = set()
    for src, dst in edges:
        forward[src].append(dst)
        reverse[dst].append(src)
        nodes.add(src)
        nodes.add(dst)

    # Memoized DFS for longest path lengths (in edge counts).
    longest_starting_at: dict[str, int] = {}
    longest_ending_at: dict[str, int] = {}

    def starting(n: str) -> int:
        if n in longest_starting_at:
            return longest_starting_at[n]
        best = 0
        for nxt in forward.get(n, []):
            best = max(best, 1 + starting(nxt))
        longest_starting_at[n] = best
        return best

    def ending(n: str) -> int:
        if n in longest_ending_at:
            return longest_ending_at[n]
        best = 0
        for prv in reverse.get(n, []):
            best = max(best, 1 + ending(prv))
        longest_ending_at[n] = best
        return best

    for n in nodes:
        starting(n)
        ending(n)

    return longest_ending_at, longest_starting_at


def query_distribution_candidates(
    db: Session,
    source_entity_id: str,
    version_id: Optional[int] = None,
) -> CascadeCandidatesResult:
    """Resolve eligible distribution targets from a source entity.

    Returns a :class:`CascadeCandidatesResult` carrying every active
    ``ChargeableEntity`` (other than the source itself) that:

    1. Does not already have an incoming edge from the source in the
       targeted version.
    2. Would not form a cycle if a new edge ``source → candidate`` were
       added (per ``detect_cycle_db``).

    Each survivor carries its ``resulting_chain_depth`` (the longest
    **edge-count** path that would pass through the simulated edge — the
    longest path of existing edges ending at source, plus ``+1`` for the
    new edge, plus the longest path of existing edges starting at the
    candidate). Directly comparable to ``max_allocation_depth``.

    Two boolean flags surface relative to the cap:
    - ``near_max_depth_warning``: ``resulting_chain_depth >=
      max_allocation_depth - 1`` AND the candidate is still saveable
      (would NOT 409).
    - ``would_violate_max_depth``: ``resulting_chain_depth >
      max_allocation_depth`` — server-side save would 409 with the
      violating path. Frontend should disable rather than show as warning.
    The two flags are mutually exclusive.

    ``version_id`` defaults to the production version in force today.
    Raises ``ValueError`` for not-found source / version.
    """
    source = db.query(ChargeableEntity).filter_by(id=source_entity_id).first()
    if source is None:
        raise ValueError(f"ChargeableEntity {source_entity_id} not found")

    version = _resolve_version(db, version_id, None)

    from services.dag_resolver import detect_cycle_db
    from services.depth_validation import get_max_allocation_depth

    max_depth = get_max_allocation_depth(db)

    # Existing outgoing destinations from the source — excluded.
    existing_targets = {
        row[0] for row in (
            db.query(Distribution.destination_entity_id)
            .filter(
                Distribution.version_id == version.id,
                Distribution.source_entity_id == source_entity_id,
            )
            .all()
        )
    }

    # Pre-compute longest path ending at / starting at every node in the
    # current version graph. Used for resulting_chain_depth derivation.
    current_edges = [
        (row.source_entity_id, row.destination_entity_id)
        for row in (
            db.query(Distribution)
            .filter(Distribution.version_id == version.id)
            .all()
        )
    ]
    longest_ending_at, longest_starting_at = _compute_depth_per_node(
        current_edges,
    )

    # All other active entities are candidates pre-filter.
    rows = (
        db.query(ChargeableEntity)
        .filter(
            ChargeableEntity.id != source_entity_id,
            ChargeableEntity.is_active == True,  # noqa: E712
        )
        .order_by(ChargeableEntity.id)
        .all()
    )

    candidates: list[DistributionCandidateResult] = []
    for candidate in rows:
        if candidate.id in existing_targets:
            continue
        # Cycle check — per-candidate; cheap on small graphs.
        chain = detect_cycle_db(
            db, version.id, source_entity_id, candidate.id,
        )
        if chain is not None:
            continue

        # Resulting chain depth = longest edge-path ending at source +
        # 1 (new edge) + longest edge-path starting at candidate. Each
        # defaults to 0 when the node isn't in the existing graph
        # (isolated entity has no incident edges). Edge-count units,
        # directly comparable to max_allocation_depth.
        end_len = longest_ending_at.get(source_entity_id, 0)
        start_len = longest_starting_at.get(candidate.id, 0)
        resulting_depth = end_len + 1 + start_len
        would_violate = resulting_depth > max_depth
        near_max = (not would_violate) and resulting_depth >= (max_depth - 1)

        candidates.append(DistributionCandidateResult(
            entity_id=candidate.id,
            entity_name=candidate.name,
            entity_type=candidate.entity_type,
            identifier=candidate.identifier,
            resulting_chain_depth=resulting_depth,
            near_max_depth_warning=near_max,
            would_violate_max_depth=would_violate,
        ))

    return CascadeCandidatesResult(
        source_entity_id=source_entity_id,
        version_id=version.id,
        max_allocation_depth=max_depth,
        candidates=candidates,
    )
