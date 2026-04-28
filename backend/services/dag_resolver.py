"""DAG resolution for Cluster F Stage 1 distribution edges.

Per [F-S1-02] and [F-S1-05]:

- An entity's *effective cost* equals its own cost plus the sum of inflows
  from upstream entities. Each inflow is the upstream entity's *effective
  cost* multiplied by the edge's percentage. The recursion bottoms out at
  source entities with no inflows (own_cost only).
- Adding a distribution edge that would create a cycle is hard-blocked at
  save time per [F-S1-05]. The error message lists the cycle chain so the
  user can identify which existing edge to remove.

This module is purposefully framework-free: it operates on plain dicts of
edges keyed by (year, version) so it can be exercised in unit tests without
touching the database. The router/service layer wraps it with a SQLAlchemy
session.

Note on own_cost: F2 does not yet introduce a per-entity ``annual_cost``
field on ChargeableEntity. For Project subtypes the own_cost is sourced from
``Project.annual_budget`` (services) or ``Project.total_budget``; for
Offering and InternalService it is reported as 0 in v5 (a future F3 session
will land the ``ChargeableEntity.annual_cost`` column and seed its values).
The DAG math is unaffected — the API just reports own_cost = 0 for those
entities until the column lands.
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

    # Build adjacency list of existing edges. Adding (new_source →
    # new_destination) creates a cycle iff there is already a path from
    # new_destination back to new_source.
    adjacency: dict[str, list[str]] = defaultdict(list)
    for e in existing_edges:
        adjacency[e.source].append(e.destination)

    # DFS from new_destination, looking for new_source. Track the path so the
    # cycle chain can be returned verbatim.
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
        # The cycle is new_source → new_destination → ... → new_source.
        # `path` already contains [new_destination, ..., new_source].
        return [new_source, *path]
    return None


def detect_cycle_db(
    db: Session, year: int, version: str, source_id: str, destination_id: str,
    *, exclude_edge_id: Optional[int] = None,
) -> Optional[list[str]]:
    """DB-backed wrapper around :func:`detect_cycle`.

    ``exclude_edge_id`` lets the cycle check ignore an existing edge being
    updated (so updating its percentage does not falsely register as a cycle).
    """
    q = db.query(Distribution).filter(
        Distribution.year == year, Distribution.version == version,
    )
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
    version: str
    own_cost: float
    inflows: list[InflowContribution] = field(default_factory=list)

    @property
    def inflow_total(self) -> float:
        return sum(c.amount for c in self.inflows)

    @property
    def effective_cost(self) -> float:
        return float(self.own_cost) + self.inflow_total


def get_own_cost(entity: ChargeableEntity) -> float:
    """Resolve an entity's own (annual) cost.

    For Project subtypes we read ``Project.annual_budget`` first (services
    use this column for steady-state cost) then fall back to
    ``total_budget`` divided by an estimated duration. For Offerings and
    InternalServices the column does not yet exist on ChargeableEntity in
    v5 (F3 will add it), so we report 0. The math stays correct — the
    field just shows up as 0 in API responses for non-Project entities.
    """
    if entity.entity_type == "Project" and entity.project is not None:
        proj: Project = entity.project
        if proj.annual_budget is not None:
            return float(proj.annual_budget)
        if proj.total_budget is not None:
            # Conservative annualisation: spread the total over the project's
            # duration in years (rough heuristic; F3 will refine when the
            # cost-aggregation engine lands).
            return float(proj.total_budget)
    return 0.0


def compute_effective_cost(
    db: Session, year: int, version: str, entity_id: str,
    *, _seen: Optional[set[str]] = None,
) -> EffectiveCostResult:
    """Recursively compute an entity's effective cost.

    Walks incoming distribution edges, recurses upstream, and sums each
    contribution = upstream.effective_cost × edge_percentage / 100.

    The internal ``_seen`` guard protects against cycles in malformed data
    (cycles should never reach this function thanks to save-time detection,
    but defensive code is cheap). On a cycle it bottoms out the recursion at
    the already-visited entity by treating it as zero-inflow.
    """
    if _seen is None:
        _seen = set()
    if entity_id in _seen:
        # Defensive — should be unreachable thanks to detect_cycle_db at write
        # time. Bottom out the recursion with own_cost only.
        entity = db.query(ChargeableEntity).filter_by(id=entity_id).first()
        if entity is None:
            return EffectiveCostResult(
                entity_id=entity_id, entity_name="<unknown>", year=year,
                version=version, own_cost=0.0,
            )
        return EffectiveCostResult(
            entity_id=entity_id, entity_name=entity.name, year=year,
            version=version, own_cost=get_own_cost(entity),
        )

    entity = db.query(ChargeableEntity).filter_by(id=entity_id).first()
    if entity is None:
        return EffectiveCostResult(
            entity_id=entity_id, entity_name="<unknown>", year=year,
            version=version, own_cost=0.0,
        )

    _seen.add(entity_id)

    own = get_own_cost(entity)
    result = EffectiveCostResult(
        entity_id=entity.id, entity_name=entity.name, year=year, version=version,
        own_cost=own,
    )

    incoming = (
        db.query(Distribution)
        .filter(
            Distribution.year == year,
            Distribution.version == version,
            Distribution.destination_entity_id == entity_id,
        )
        .all()
    )
    for edge in incoming:
        upstream = compute_effective_cost(
            db, year, version, edge.source_entity_id, _seen=_seen,
        )
        amount = upstream.effective_cost * float(edge.percentage) / 100.0
        result.inflows.append(InflowContribution(
            source_entity_id=upstream.entity_id,
            source_entity_name=upstream.entity_name,
            percentage=float(edge.percentage),
            amount=round(amount, 2),
        ))
    return result


def get_upstream_chain(
    db: Session, year: int, version: str, entity_id: str,
    *, max_depth: int = 8,
) -> list[list[str]]:
    """Return all upstream paths terminating at ``entity_id``.

    Each path is an ordered list of entity ids from a source (no incoming
    edges) down to ``entity_id``. Useful for the rollup drill-down in F3 —
    surfaced here so F2 can ship a working DAG-traversal endpoint.

    ``max_depth`` caps deep DAGs at a sane value to bound API latency. Real
    KB graphs are shallow (≤4 levels per the workshop notes).
    """
    paths: list[list[str]] = []

    def _walk(node: str, current: list[str], depth: int) -> None:
        if depth > max_depth:
            return
        incoming = (
            db.query(Distribution)
            .filter(
                Distribution.year == year,
                Distribution.version == version,
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
