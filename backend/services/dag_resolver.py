"""DAG resolution for Stage 1 distribution edges.

Per `[F-S1-02]` and `[F-S1-05]`:

- An entity's *effective cost* equals its own cost plus the sum of inflows
  from upstream entities. Each inflow is the upstream entity's *effective
  cost* multiplied by the edge's percentage. The recursion bottoms out at
  source entities with no inflows (own_cost only).
- Adding a distribution edge that would create a cycle is hard-blocked at
  save time per `[F-S1-05]`. The error message lists the cycle chain so
  the user can identify which existing edge to remove.

**FD-3 rework (Charging/UM round, cluster B1 — service rescope):** the v4
``(year, version)`` filter on ``Distribution`` rows has been retired.
Edges now key by ``version_id`` (FK → ``DistributionVersion``). Cycle
detection and effective-cost computation operate on a single version graph
identified by ``version_id``. The ``year`` argument is retained only on the
own-cost lookup side (own_cost surfaces from ``Project.annual_budget`` /
``ChargeableEntity.annual_cost`` — fields that are inherently year-scoped
on the cost being distributed). Stage 1 edges themselves are cadence-
agnostic per `[F-S1-02]`.

Note on own_cost: F2 did not introduce a per-entity ``annual_cost`` field;
F3 added it on ``ChargeableEntity``. For Project subtypes the own_cost
falls back to ``Project.annual_budget`` (services) / ``Project.total_budget``
/ ``ChargeableEntity.annual_cost``; for Offering and InternalService the
column on ``ChargeableEntity.annual_cost`` is authoritative.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from models.charging import ChargeableEntity, Distribution
from models.projects import Project


# ---------------------------------------------------------------------------
# Cycle detection — pure-function form (no DB)
# ---------------------------------------------------------------------------


@dataclass
class EdgeKey:
    """Lightweight identifier for an existing edge (used in cycle detection)."""

    source: str
    destination: str


def detect_cycle(
    existing_edges: Iterable[EdgeKey],
    new_source: str,
    new_destination: str,
) -> Optional[list[str]]:
    """Return the cycle chain if adding (new_source → new_destination) creates
    a cycle in the existing edge graph; else ``None``.

    The chain is ordered from new_source through the existing path back to
    new_source itself, e.g. ``["A", "B", "C", "A"]`` for the cycle
    ``A → B → C → A``. A self-loop (``new_source == new_destination``) returns
    ``[new_source, new_source]``.
    """
    if new_source == new_destination:
        return [new_source, new_source]

    adjacency: dict[str, list[str]] = defaultdict(list)
    for e in existing_edges:
        adjacency[e.source].append(e.destination)

    path: list[str] = [new_destination]
    visited: set[str] = set()

    def _dfs(node: str) -> bool:
        if node == new_source:
            return True
        if node in visited:
            return False
        visited.add(node)
        for neighbour in adjacency.get(node, []):
            path.append(neighbour)
            if _dfs(neighbour):
                return True
            path.pop()
        return False

    if _dfs(new_destination):
        return [new_source, *path]
    return None


def detect_cycle_db(
    db: Session, version_id: int, source_id: str, destination_id: str,
    *, exclude_edge_id: Optional[int] = None,
) -> Optional[list[str]]:
    """DB-backed wrapper around :func:`detect_cycle`.

    Scope is the single ``DistributionVersion`` identified by ``version_id``.
    ``exclude_edge_id`` lets the cycle check ignore an existing edge being
    updated (so updating its percentage does not falsely register as a
    cycle).
    """
    q = db.query(Distribution).filter(Distribution.version_id == version_id)
    if exclude_edge_id is not None:
        q = q.filter(Distribution.id != exclude_edge_id)
    edges = [
        EdgeKey(source=row.source_entity_id, destination=row.destination_entity_id)
        for row in q.all()
    ]
    return detect_cycle(edges, source_id, destination_id)


# ---------------------------------------------------------------------------
# Effective-cost resolution
# ---------------------------------------------------------------------------


@dataclass
class InflowContribution:
    source_entity_id: str
    source_entity_name: str
    percentage: float
    amount: float


@dataclass
class EffectiveCostResult:
    entity_id: str
    entity_name: str
    year: int
    version_id: int
    own_cost: float
    own_cost_source: Optional[str] = None
    inflows: list[InflowContribution] = field(default_factory=list)

    @property
    def inflow_total(self) -> float:
        return sum(c.amount for c in self.inflows)

    @property
    def effective_cost(self) -> float:
        return float(self.own_cost) + self.inflow_total


@dataclass
class _OwnCost:
    """Own-cost lookup result carrying the source for traceability."""

    value: float
    source: Optional[str]  # 'annual_budget' | 'total_budget' | 'annual_cost' | None


def _get_own_cost_detailed(entity: ChargeableEntity) -> _OwnCost:
    """Resolve an entity's own (annual) cost with provenance.

    Resolution order:
    1. For Project subtypes: ``Project.annual_budget`` → ``Project.total_budget``
       → ``ChargeableEntity.annual_cost`` (F3 column).
    2. For Offerings and InternalServices: ``ChargeableEntity.annual_cost``
       (F3 column). Falls back to 0.0 when null.

    The detailed return shape feeds ``EffectiveCostResult.own_cost_source``
    so the rollup drill-down can display "comes from `annual_budget`" /
    "comes from `annual_cost`" etc.
    """
    entity_annual_cost: Optional[float] = None
    if entity.annual_cost is not None:
        entity_annual_cost = float(entity.annual_cost)

    if entity.entity_type == "Project" and entity.project is not None:
        proj: Project = entity.project
        if proj.annual_budget is not None:
            return _OwnCost(float(proj.annual_budget), "annual_budget")
        if proj.total_budget is not None:
            return _OwnCost(float(proj.total_budget), "total_budget")
        if entity_annual_cost is not None:
            return _OwnCost(entity_annual_cost, "annual_cost")
        return _OwnCost(0.0, None)

    if entity_annual_cost is not None:
        return _OwnCost(entity_annual_cost, "annual_cost")
    return _OwnCost(0.0, None)


def get_own_cost(entity: ChargeableEntity) -> float:
    """Backward-compatible scalar wrapper around :func:`_get_own_cost_detailed`."""
    return _get_own_cost_detailed(entity).value


def compute_effective_cost(
    db: Session, year: int, version_id: int, entity_id: str,
    *, anchor_version_id: Optional[int] = None,
    _memo: Optional[dict[str, EffectiveCostResult]] = None,
    _forked_sources: Optional[set[str]] = None,
) -> EffectiveCostResult:
    """Recursively compute an entity's effective cost.

    Walks incoming distribution edges for the given ``version_id``, recurses
    upstream, and sums each contribution = upstream.effective_cost ×
    edge_percentage / 100. ``year`` scopes the own-cost lookup only — Stage
    1 edges are cadence-agnostic.

    **Memoization (Service Workbench S1):** the recursion threads a private
    ``_memo`` dict keyed by ``entity_id``. On repeat encounter we return the
    **fully computed** cached result (own cost + all inflows), which is the
    correct behaviour on diamond-DAG patterns where a shared node is reached
    via multiple downstream paths and itself has upstream inflows.

    Cycles are rejected at edge-save time by :func:`detect_cycle_db`, so the
    resolver does not carry a cycle-breaking guard — memoization alone
    suffices for a well-formed DAG.

    **Simulator S3 — sandbox union mode:** when ``anchor_version_id`` is
    supplied, ``version_id`` is treated as a per-scenario sandbox version and
    the incoming-edge walk reads the UNION of (sandbox edges) + (anchor edges
    for un-forked sources) via ``distribution_service.union_incoming_edges``.
    This keeps the editor's cascade effective-cost identical to the impact
    preview's. When ``anchor_version_id`` is ``None`` (the default and the
    only value the canonical Charging path ever passes) the walk is the
    original single-version query — behaviour is byte-identical.
    """
    if _memo is None:
        _memo = {}
    if entity_id in _memo:
        return _memo[entity_id]

    entity = db.query(ChargeableEntity).filter_by(id=entity_id).first()
    if entity is None:
        result = EffectiveCostResult(
            entity_id=entity_id, entity_name="<unknown>", year=year,
            version_id=version_id, own_cost=0.0, own_cost_source=None,
        )
        _memo[entity_id] = result
        return result

    own = _get_own_cost_detailed(entity)
    result = EffectiveCostResult(
        entity_id=entity.id, entity_name=entity.name, year=year,
        version_id=version_id,
        own_cost=own.value, own_cost_source=own.source,
    )

    if anchor_version_id is None:
        # Canonical single-version path — unchanged.
        incoming = (
            db.query(Distribution)
            .filter(
                Distribution.version_id == version_id,
                Distribution.destination_entity_id == entity_id,
            )
            .all()
        )
    else:
        # Sandbox union path. Resolve the forked-source set once and thread
        # it through the recursion to avoid an O(depth) DISTINCT re-query.
        from services.distribution_service import (
            get_forked_sources, union_incoming_edges,
        )
        if _forked_sources is None:
            _forked_sources = get_forked_sources(db, version_id)
        incoming = union_incoming_edges(
            db, entity_id=entity_id, scenario_version_id=version_id,
            anchor_version_id=anchor_version_id,
            forked_sources=_forked_sources,
        )

    for edge in incoming:
        upstream = compute_effective_cost(
            db, year, version_id, edge.source_entity_id,
            anchor_version_id=anchor_version_id, _memo=_memo,
            _forked_sources=_forked_sources,
        )
        amount = upstream.effective_cost * float(edge.percentage) / 100.0
        result.inflows.append(InflowContribution(
            source_entity_id=upstream.entity_id,
            source_entity_name=upstream.entity_name,
            percentage=float(edge.percentage),
            amount=round(amount, 2),
        ))

    _memo[entity_id] = result
    return result


def get_upstream_chain(
    db: Session, version_id: int, entity_id: str,
    *, max_depth: int | None = None,
) -> list[list[str]]:
    """Return all upstream paths terminating at ``entity_id``.

    Each path is an ordered list of entity ids from a source (no incoming
    edges) down to ``entity_id``. Useful for the rollup drill-down — surfaced
    so the upstream-chain panel can render textual paths per `[F-RV-04]`.

    ``max_depth`` caps deep DAGs at a sane value to bound API latency. Real
    KB graphs are shallow (≤4 levels per the workshop notes).

    **Service Workbench S1:** when ``max_depth`` is ``None`` (the default),
    the cap is resolved from the ``max_allocation_depth`` PlanningParameter
    via :func:`services.depth_validation.get_max_allocation_depth`. Explicit
    integers still win, so callers retain the old override behaviour.
    """
    if max_depth is None:
        # Deferred import: depth_validation is owned by Teammate B and may
        # not yet exist in every worktree during parallel development. We
        # avoid a top-level import so other consumers of this module remain
        # unaffected if B has not yet merged.
        from services.depth_validation import get_max_allocation_depth
        max_depth = get_max_allocation_depth(db)

    paths: list[list[str]] = []

    def _walk(node: str, current: list[str], depth: int) -> None:
        if depth > max_depth:
            return
        incoming = (
            db.query(Distribution)
            .filter(
                Distribution.version_id == version_id,
                Distribution.destination_entity_id == node,
            )
            .all()
        )
        if not incoming:
            paths.append(list(reversed(current)))
            return
        for edge in incoming:
            _walk(edge.source_entity_id, [*current, edge.source_entity_id], depth + 1)

    _walk(entity_id, [entity_id], 0)
    return paths
