"""Run cost-tree builder — VIPER Wave 5 §10.2/§10.3 (Cost Distributions tab).

Builds the org roll-up tree for the **Run** population (Offering + Internal
Service chargeable entities) grouped by a hierarchy level (Line of Business or
Program). It mirrors the Portfolio tree-recursion pattern
(``portfolio_service.build_portfolio_tree`` / ``_aggregate_children`` /
``_get_projects_for_entity_recursive``) but is sourced from
``chargeable_entities.hierarchy_node_id`` and aggregates Run-entity
``annual_cost`` instead of project baseline/forecast/actuals.

Node-vs-level rule (§10.2 — the rule that governs correctness):

* A *node* is one ``grouping_entities`` row; a *level* is a tier shared by many
  nodes (``grouping_hierarchy_levels``: level 0 = ``get-lob``, level 1 =
  ``get-prog``).
* Run entities attach at **mixed levels**. When grouping **by LoB**, a
  Program-attached entity (e.g. ``svc-infra-platform`` → ``he-cit-prog-infra``)
  rolls **up into its parent LoB** — it does not form its own bucket.
* When grouping **by Program**, an entity attached only at an LoB
  (e.g. ``off-mdh`` → ``he-dnd``) sits as a **direct leaf of the LoB node**,
  above the Program rows — no orphaning, no silent cost loss.

Cost always appears somewhere; the sum of the top-level nodes' ``rolled_cost``
equals ``grand_total``.

This service does NOT modify ``build_portfolio_tree`` — it is a parallel
builder following the same pattern.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from models.charging import ChargeableEntity
from models.organization import (
    GroupingEntity,
    GroupingEntityType,
    GroupingHierarchy,
)

# Run population: chargeable entities that are not Change projects.
RUN_ENTITY_TYPES = ("Offering", "InternalService")

# group_by value -> index into the ordered hierarchy levels (0 = top / LoB,
# 1 = next / Program). The actual ``level_order`` value is read from the active
# hierarchy so this is robust to whatever numbering the seed uses.
_GROUP_BY_LEVEL_INDEX = {"lob": 0, "program": 1}


def build_run_cost_tree(
    db: Session,
    group_by: str,
    node: str | None = None,
    year: int = 2026,
) -> dict:
    """Build the Run cost roll-up tree grouped by ``lob`` or ``program``.

    Args:
        db: SQLAlchemy session.
        group_by: ``'lob'`` (tree down to Line of Business) or ``'program'``
            (tree down to Program).
        node: Optional grouping-entity id to scope the population to (its
            descendants, inclusive) before computing.
        year: Evaluated year echoed back in the response (default 2026).

    Returns:
        Dict matching ``RunCostTreeResponse``:
        ``{group_by, year, grand_total, nodes[]}`` where each node matches
        ``RunCostTreeNode``.
    """
    if group_by not in _GROUP_BY_LEVEL_INDEX:
        raise ValueError(f"Unsupported group_by: {group_by!r}")

    # --- Load the active hierarchy and its level ordering ---
    hierarchy = (
        db.query(GroupingHierarchy)
        .filter(GroupingHierarchy.is_active_hierarchy.is_(True))
        .first()
    )
    if not hierarchy or not hierarchy.levels:
        # No active hierarchy — nothing to group by.
        return {"group_by": group_by, "year": year, "grand_total": 0.0, "nodes": []}

    ordered_levels = sorted(hierarchy.levels, key=lambda lvl: lvl.level_order)
    level_order_by_type: dict[str, int] = {
        lvl.entity_type_id: lvl.level_order for lvl in ordered_levels
    }
    # Resolve the target level by index, clamping to the deepest available level.
    idx = min(_GROUP_BY_LEVEL_INDEX[group_by], len(ordered_levels) - 1)
    target_order = ordered_levels[idx].level_order

    # --- Load all active grouping nodes and index them ---
    all_groups = (
        db.query(GroupingEntity).filter(GroupingEntity.is_active.is_(True)).all()
    )
    group_by_id: dict[str, GroupingEntity] = {g.id: g for g in all_groups}
    children_index: dict[str | None, list[GroupingEntity]] = {}
    for g in all_groups:
        children_index.setdefault(g.parent_entity_id, []).append(g)

    # Display name per grouping-entity type (the level label, e.g. "Line of
    # Business" / "Program") — reference data read from the DB, never hardcoded.
    type_name_by_id: dict[str, str] = {
        t.id: t.name for t in db.query(GroupingEntityType).all()
    }

    def _order_of(group: GroupingEntity) -> int:
        # Groups whose type is not a hierarchy level sort below everything.
        return level_order_by_type.get(group.entity_type_id, 999)

    def _ancestors_inclusive(group_id: str) -> set[str]:
        """Set of group ids walking from ``group_id`` up to the root."""
        chain: set[str] = set()
        current = group_by_id.get(group_id)
        while current and current.id not in chain:
            chain.add(current.id)
            current = (
                group_by_id.get(current.parent_entity_id)
                if current.parent_entity_id
                else None
            )
        return chain

    # Top-level = roots of the hierarchy at/above the target level (LoB nodes).
    top_groups = [
        g for g in children_index.get(None, []) if _order_of(g) <= target_order
    ]

    # ``reachable_ids`` is the SINGLE source of truth for which group nodes the
    # render pass (``_build_group_node``) can actually draw: descend from a top
    # group only through children still at/above the target level. Anchoring
    # entities against this same set (below) guarantees a placed entity always
    # lands on a rendered node — no silent cost loss even if the hierarchy is
    # later deepened or gains a non-level intermediate node.
    reachable_ids: set[str] = set()

    def _mark_reachable(g: GroupingEntity) -> None:
        if g.id in reachable_ids:
            return
        reachable_ids.add(g.id)
        for cg in children_index.get(g.id, []):
            if _order_of(cg) <= target_order:
                _mark_reachable(cg)

    for g in top_groups:
        _mark_reachable(g)

    def _anchor_for(group_id: str) -> str | None:
        """Deepest ancestor (inclusive) that the render pass will actually draw.

        Walks up from ``group_id`` and returns the first id in ``reachable_ids``.
        For a Program-attached entity grouped by LoB this resolves to the parent
        LoB (the Program node is not reachable at target level 0); grouped by
        Program it resolves to the Program node itself. Sharing the
        render-reachable set keeps anchoring and rendering on one definition.
        """
        current = group_by_id.get(group_id)
        visited: set[str] = set()
        while current and current.id not in visited:
            visited.add(current.id)
            if current.id in reachable_ids:
                return current.id
            current = (
                group_by_id.get(current.parent_entity_id)
                if current.parent_entity_id
                else None
            )
        return None

    # --- Load the Run entity population ---
    run_entities = (
        db.query(ChargeableEntity)
        .filter(
            ChargeableEntity.entity_type.in_(RUN_ENTITY_TYPES),
            ChargeableEntity.is_active.is_(True),
        )
        .all()
    )

    # --- Place each entity at its anchor group, honouring the node scope ---
    entity_leaves_by_anchor: dict[str, list[ChargeableEntity]] = {}
    for e in run_entities:
        attach = e.hierarchy_node_id
        if not attach or attach not in group_by_id:
            continue  # unattached / inactive node — outside the org tree
        # Descendant-inclusive node scope: the entity must sit under `node`.
        if node and node not in _ancestors_inclusive(attach):
            continue
        anchor = _anchor_for(attach)
        if anchor is None:
            continue
        entity_leaves_by_anchor.setdefault(anchor, []).append(e)

    # --- Recursively build group nodes (prune empties, mirror portfolio tree) ---
    def _make_entity_node(e: ChargeableEntity) -> dict:
        cost = float(e.annual_cost or 0.0)
        return {
            "id": e.id,
            "name": e.name,
            "kind": "entity",
            "level": None,
            "level_label": None,
            "entity_type": e.entity_type,
            "identifier": e.identifier,
            "annual_cost": round(cost, 2),
            "rolled_cost": round(cost, 2),
            "entity_count": 1,
            "children": [],
        }

    def _build_group_node(g: GroupingEntity) -> dict | None:
        # Child group nodes that are still at/above the target level.
        child_group_nodes: list[dict] = []
        for cg in children_index.get(g.id, []):
            if _order_of(cg) <= target_order:
                cn = _build_group_node(cg)
                if cn:
                    child_group_nodes.append(cn)

        # Run entities anchored directly at this node become leaf rows.
        entity_nodes = [
            _make_entity_node(e) for e in entity_leaves_by_anchor.get(g.id, [])
        ]

        # Entity leaves render ABOVE the program rows (§10.2); both sorted by name.
        entity_nodes.sort(key=lambda n: n["name"])
        child_group_nodes.sort(key=lambda n: n["name"])
        children = entity_nodes + child_group_nodes

        if not children:
            return None  # prune empty branches, exactly like build_portfolio_tree

        rolled = sum(c["rolled_cost"] for c in children)
        count = sum(c["entity_count"] for c in children)
        return {
            "id": g.id,
            "name": g.name,
            "kind": "group",
            "level": g.entity_type_id,
            "level_label": type_name_by_id.get(g.entity_type_id),
            "entity_type": None,
            "identifier": None,
            "annual_cost": 0.0,
            "rolled_cost": round(rolled, 2),
            "entity_count": count,
            "children": children,
        }

    top_groups.sort(key=lambda g: g.name)

    nodes: list[dict] = []
    for g in top_groups:
        n = _build_group_node(g)
        if n:
            nodes.append(n)

    grand_total = round(sum(n["rolled_cost"] for n in nodes), 2)

    return {
        "group_by": group_by,
        "year": year,
        "grand_total": grand_total,
        "nodes": nodes,
    }
