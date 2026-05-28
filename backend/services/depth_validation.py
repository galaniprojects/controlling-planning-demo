"""Depth validation helpers for Stage 1 distribution graphs.

Service Workbench Session 1 (Teammate B). Adds a configurable
``max_allocation_depth`` ceiling on the longest root-to-leaf path through
a :class:`~models.charging.DistributionVersion`'s edge graph and powers:

- :class:`~models.charging.Distribution`'s ``chain_depth`` bulk cache
  populated by ``services.distribution_service`` after every edge mutation
  (Session 1 / Teammate C).
- Save-time depth validation (third validation alongside cycle + sum-rule)
  raised as :class:`DistributionValidationError` so the existing
  ``_validation_error_to_http`` mapper in ``routers/charging.py`` returns a
  409 with the violating path (Teammate C wires the field through; this
  module just sets the attribute on the exception).
- Admin PUT-time validation when a controller lowers
  ``PlanningParameter['max_allocation_depth']`` — every active production
  version is walked and any violators are surfaced with a sample path so
  the controller knows which graphs to flatten before re-trying.

Graphs are tiny (≤ ~100 edges per version), so all walks happen in Python
over an in-memory adjacency list rather than recursive CTEs — simpler,
portable to SQLite, and trivially correct on a DAG.

Public surface (consumed by A/C/D per the parallel-development contract):

* :func:`get_max_allocation_depth` — A imports for the default
  ``get_upstream_chain`` cap; D imports for the cascade / candidates
  endpoint responses.
* :func:`compute_chain_depths_for_version` — C imports for the bulk
  ``Distribution.chain_depth`` cache write; D may import to compute the
  "resulting chain_depth if added" for candidate entities.
* :func:`compute_longest_path_for_version` — used internally by
  :func:`assert_within_max_depth` and :func:`validate_param_change`;
  exported so callers can probe depth without forcing an exception.
* :func:`assert_within_max_depth` — C imports as the third save-time
  validation entry point.
* :func:`validate_param_change` — admin router imports to guard a
  controller-initiated lowering of ``max_allocation_depth``.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Optional

from sqlalchemy.orm import Session

from models.charging import Distribution, DistributionVersion
from models.system import PlanningParameter


__all__ = [
    "get_max_allocation_depth",
    "compute_chain_depths_for_version",
    "compute_longest_path_for_version",
    "assert_within_max_depth",
    "validate_param_change",
]


# ---------------------------------------------------------------------------
# PlanningParameter accessor
# ---------------------------------------------------------------------------


_MAX_DEPTH_KEY = "max_allocation_depth"


def get_max_allocation_depth(db: Session) -> int:
    """Return the configured ``max_allocation_depth`` ceiling as an ``int``.

    Reads :class:`~models.system.PlanningParameter`'s ``current_value`` for
    ``max_allocation_depth`` and parses it. The seed (foundation commit)
    ships a default of 6; controllers can adjust it via
    ``PUT /api/admin/parameters`` — see :func:`validate_param_change` for
    the safety check that fires before any commit lowers the cap below an
    existing graph's longest path.

    Raises :class:`ValueError` if the row is missing or its
    ``current_value`` cannot be parsed — should never happen post-seed,
    but surfaces loud if the seed drifts.
    """
    param = (
        db.query(PlanningParameter)
        .filter(PlanningParameter.key == _MAX_DEPTH_KEY)
        .first()
    )
    if param is None:
        raise ValueError(
            f"PlanningParameter '{_MAX_DEPTH_KEY}' not found — seed missing?"
        )
    try:
        return int(param.current_value)
    except (TypeError, ValueError) as exc:
        raise ValueError(
            f"PlanningParameter '{_MAX_DEPTH_KEY}' current_value "
            f"{param.current_value!r} is not an integer"
        ) from exc


# ---------------------------------------------------------------------------
# Per-version graph walks (BFS / DAG longest-path)
# ---------------------------------------------------------------------------


def _load_edges(db: Session, version_id: int) -> list[Distribution]:
    """All edges for a version. Empty list = empty / unseeded version."""
    return (
        db.query(Distribution)
        .filter(Distribution.version_id == version_id)
        .all()
    )


def _build_adjacency(
    edges: list[Distribution],
) -> tuple[
    dict[str, list[tuple[str, int]]],  # outgoing: src -> [(dst, edge_id), ...]
    dict[str, list[tuple[str, int]]],  # incoming: dst -> [(src, edge_id), ...]
    set[str],
]:
    """Return ``(outgoing, incoming, nodes)`` adjacency maps."""
    outgoing: dict[str, list[tuple[str, int]]] = defaultdict(list)
    incoming: dict[str, list[tuple[str, int]]] = defaultdict(list)
    nodes: set[str] = set()
    for e in edges:
        outgoing[e.source_entity_id].append((e.destination_entity_id, e.id))
        incoming[e.destination_entity_id].append((e.source_entity_id, e.id))
        nodes.add(e.source_entity_id)
        nodes.add(e.destination_entity_id)
    return outgoing, incoming, nodes


def _longest_distance_from_roots(
    outgoing: dict[str, list[tuple[str, int]]],
    incoming: dict[str, list[tuple[str, int]]],
    nodes: set[str],
) -> tuple[dict[str, int], dict[str, Optional[str]]]:
    """DAG longest-path-from-any-root computation.

    Returns:
        ``dist`` — node_id → number of edges in the longest root-to-node
        path. Roots (no incoming edges) start at 0. A leaf reachable via N
        edges from some root carries ``N``.

        ``predecessor`` — node_id → predecessor_id on a longest path (or
        ``None`` for roots). Used to reconstruct a concrete sample path
        for the violating-path error payload.

    Assumes the graph is acyclic — cycles are rejected upstream by
    :func:`services.dag_resolver.detect_cycle_db` at edge-save time, so
    by the time we walk a version's edges no cycles can exist. If a cycle
    *does* somehow exist (corrupt seed / bypassed validation), Kahn's
    topological sort below will simply stop short and the caller sees a
    partial / under-counted result rather than an infinite loop.
    """
    # Kahn's algorithm topological sort with longest-path relaxation. We
    # process nodes in topological order so each node's ``dist`` is final
    # before we propagate it to its descendants.
    in_degree: dict[str, int] = {n: len(incoming.get(n, [])) for n in nodes}
    queue: list[str] = [n for n, d in in_degree.items() if d == 0]
    dist: dict[str, int] = {n: 0 for n in nodes}
    predecessor: dict[str, Optional[str]] = {n: None for n in nodes}

    # We can't rely on dict ordering for determinism across CPython
    # versions — sort the initial roots so test assertions on the sample
    # path are stable.
    queue.sort()
    while queue:
        u = queue.pop(0)
        # Sort children for deterministic tie-breaks on equal distances.
        children = sorted(outgoing.get(u, []), key=lambda x: x[0])
        for v, _edge_id in children:
            candidate = dist[u] + 1
            if candidate > dist[v]:
                dist[v] = candidate
                predecessor[v] = u
            in_degree[v] -= 1
            if in_degree[v] == 0:
                # Insert preserving sort order so the next pop is the
                # lexicographically-smallest ready node.
                queue.append(v)
                queue.sort()
    return dist, predecessor


def _reconstruct_path(
    predecessor: dict[str, Optional[str]], end_node: str,
) -> list[str]:
    """Walk predecessors back to a root and return the path root→end_node."""
    path: list[str] = []
    cursor: Optional[str] = end_node
    # Bound the loop at len(predecessor) iterations as a defensive guard
    # against a corrupt predecessor map. Real DAGs terminate at a root in
    # depth(end_node) steps.
    for _ in range(len(predecessor) + 1):
        if cursor is None:
            break
        path.append(cursor)
        cursor = predecessor[cursor]
    path.reverse()
    return path


def compute_chain_depths_for_version(
    db: Session, version_id: int,
) -> dict[int, int]:
    """Bulk per-edge ``chain_depth`` for every edge in ``version_id``.

    Returns ``{edge_id: chain_depth}`` where ``chain_depth`` is the length
    of the longest root-to-leaf path that **passes through that edge**.

    Definition (matches the entity-picker badge semantics in Session 5):
    for edge ``u → v``, ``chain_depth = dist_from_root(u) + 1 +
    dist_to_leaf(v)``. The "1" is the edge itself; ``dist_from_root`` is
    the longest path entering ``u``; ``dist_to_leaf`` is the longest
    path leaving ``v``.

    Empty version → empty dict. Used by Teammate C's
    ``distribution_service`` cache updater after every edge mutation.
    Bulk operation; safe to call after every write since the graph is
    tiny.
    """
    edges = _load_edges(db, version_id)
    if not edges:
        return {}

    outgoing, incoming, nodes = _build_adjacency(edges)

    # Longest path *to* each node (root → node).
    dist_to, _pred_to = _longest_distance_from_roots(outgoing, incoming, nodes)

    # Longest path *from* each node (node → leaf). Reverse the adjacency
    # and reuse the same routine.
    dist_from, _pred_from = _longest_distance_from_roots(
        incoming, outgoing, nodes,
    )

    return {
        e.id: dist_to[e.source_entity_id] + 1 + dist_from[e.destination_entity_id]
        for e in edges
    }


def compute_longest_path_for_version(
    db: Session, version_id: int,
) -> tuple[int, Optional[list[str]]]:
    """Longest root-to-leaf path in ``version_id``.

    Returns ``(length, sample_path)`` where:

    * ``length`` — number of edges in the longest root-to-leaf walk
      (``0`` for empty / single-node versions, since no edges exist).
    * ``sample_path`` — a concrete list of entity ids realising that
      walk (length ``length + 1``), or ``None`` when ``length == 0``.

    Used by :func:`assert_within_max_depth` for save-time validation and
    :func:`validate_param_change` for admin-side change validation.
    """
    edges = _load_edges(db, version_id)
    if not edges:
        return 0, None

    outgoing, incoming, nodes = _build_adjacency(edges)
    dist, predecessor = _longest_distance_from_roots(
        outgoing, incoming, nodes,
    )
    # Find the deepest node; tie-break by entity_id for stable sample-path
    # output across runs and test assertions.
    deepest_dist = max(dist.values())
    candidates = sorted(n for n in nodes if dist[n] == deepest_dist)
    deepest_node = candidates[0]
    path = _reconstruct_path(predecessor, deepest_node)
    return deepest_dist, path


# ---------------------------------------------------------------------------
# Save-time validation entry point (consumed by Teammate C)
# ---------------------------------------------------------------------------


def assert_within_max_depth(
    db: Session, version_id: int, max_depth: int,
) -> None:
    """Raise :class:`DistributionValidationError` if version exceeds ``max_depth``.

    Computed on the version's current persisted edges (the caller is
    expected to have flushed the pending mutation before calling this).
    On violation, the raised exception carries ``violating_path`` — a
    sample root-to-leaf path that exceeds the cap — mirroring the
    existing ``cycle_chain`` pattern so :func:`_validation_error_to_http`
    can surface it in the 409 response body.

    The :class:`DistributionValidationError` class is imported lazily
    here to avoid a hard import cycle between
    ``services.distribution_service`` and this module (C extends the
    exception class with a ``violating_path`` field; if C has not yet
    landed in a given worktree we set the attribute dynamically so
    integration is robust either way).
    """
    longest, sample_path = compute_longest_path_for_version(db, version_id)
    if longest <= max_depth:
        return

    # Deferred import: distribution_service imports dag_resolver which
    # is fine, but importing distribution_service from a module that
    # distribution_service will (under Teammate C) import is a clean
    # circular pair. Lazy import resolves it.
    from services.distribution_service import DistributionValidationError

    message = (
        f"Allocation depth violation per [F-S1-02]: longest root-to-leaf "
        f"path has {longest} edges, exceeding max_allocation_depth "
        f"({max_depth})."
    )
    err = DistributionValidationError(message)
    # Set dynamically — works whether or not C has declared the field on
    # the exception class. After C lands the attribute will be picked up
    # by ``_validation_error_to_http`` and threaded into the 409 body.
    err.violating_path = sample_path
    raise err


# ---------------------------------------------------------------------------
# Admin-side change validation (consumed by routers/admin.py)
# ---------------------------------------------------------------------------


def validate_param_change(
    db: Session, new_max: int,
) -> list[tuple[int, list[str]]]:
    """Check whether lowering ``max_allocation_depth`` to ``new_max`` is safe.

    Walks every **active production** DistributionVersion (``status =
    'active'`` and ``scenario_id IS NULL``) and computes the longest
    root-to-leaf path. Drafts and scenario-scoped versions are excluded
    — drafts are work-in-progress, and scenario sandboxes are intentionally
    off-policy.

    Returns a list of ``(version_id, violating_path)`` tuples for the
    versions that would exceed ``new_max``. Empty list = safe to lower
    the cap. The admin PUT hook in ``routers/admin.py`` translates a
    non-empty list to a ``409`` with the violations payload so the UI
    can guide the controller to flatten the offending graphs first.

    Raising the cap (``new_max`` higher than the current setting) is
    always safe and returns an empty list — production graphs by
    definition fit under their original cap.
    """
    active_versions = (
        db.query(DistributionVersion)
        .filter(
            DistributionVersion.status == "active",
            DistributionVersion.scenario_id.is_(None),
        )
        .all()
    )
    violations: list[tuple[int, list[str]]] = []
    for v in active_versions:
        longest, sample_path = compute_longest_path_for_version(db, v.id)
        if longest > new_max:
            # sample_path is guaranteed non-None when longest > 0.
            violations.append((v.id, sample_path or []))
    return violations
