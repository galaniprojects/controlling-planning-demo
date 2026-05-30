"""Tests for the Run cost-tree builder — VIPER Wave 5 §10.2 node-vs-level rule.

Uses the ``seed_hierarchy`` fixture:
    LoB Alpha (lob-alpha)
      └─ Programme One (prog-one)
    LoB Beta  (lob-beta)

Run entities (Offering / InternalService) attach at mixed levels and the tree
must roll Program-attached entities up into their parent LoB when grouping by
LoB, and surface LoB-only entities as direct leaves of the LoB node when
grouping by Program.
"""

from __future__ import annotations

import pytest

from models.charging import ChargeableEntity
from services.run_tree import build_run_cost_tree


@pytest.fixture
def seed_run_entities(db, seed_hierarchy):
    """Three Run entities at mixed levels + one inactive (must be ignored)."""
    entities = [
        # Attached at LoB Alpha (level 0)
        ChargeableEntity(
            id="off-a", entity_type="Offering", identifier="IT00S001",
            name="Offering A", hierarchy_node_id="lob-alpha", annual_cost=100.0,
        ),
        # Attached at LoB Beta (level 0)
        ChargeableEntity(
            id="off-b", entity_type="Offering", identifier="IT00S002",
            name="Offering B", hierarchy_node_id="lob-beta", annual_cost=200.0,
        ),
        # Attached at Programme One (level 1, under LoB Alpha)
        ChargeableEntity(
            id="svc-p", entity_type="InternalService", identifier="ITF20001",
            name="Service P", hierarchy_node_id="prog-one", annual_cost=50.0,
        ),
        # Inactive — must be excluded from the population
        ChargeableEntity(
            id="off-dead", entity_type="Offering", identifier="IT00S099",
            name="Dead Offering", hierarchy_node_id="lob-beta",
            annual_cost=999.0, is_active=False,
        ),
        # A Change project entity — must NEVER appear in the Run tree
        ChargeableEntity(
            id="prj-x", entity_type="Project", identifier="IT012345",
            name="Project X", hierarchy_node_id="lob-alpha", annual_cost=777.0,
        ),
    ]
    db.add_all(entities)
    db.commit()
    return seed_hierarchy


def _find(nodes, node_id):
    for n in nodes:
        if n["id"] == node_id:
            return n
        found = _find(n["children"], node_id)
        if found:
            return found
    return None


def test_group_by_lob_rolls_program_entity_into_parent(db, seed_run_entities):
    """(a) A Program-attached entity rolls up into its parent LoB bucket."""
    tree = build_run_cost_tree(db, group_by="lob")

    assert tree["group_by"] == "lob"
    assert tree["year"] == 2026

    alpha = _find(tree["nodes"], "lob-alpha")
    assert alpha is not None
    assert alpha["kind"] == "group"
    assert alpha["level"] == "get-lob"
    # 100 (off-a, direct) + 50 (svc-p, rolled up from prog-one) = 150
    assert alpha["rolled_cost"] == 150.0
    assert alpha["entity_count"] == 2

    # No Programme bucket exists when grouping by LoB — svc-p is a direct leaf.
    assert _find(tree["nodes"], "prog-one") is None
    svc = _find(alpha["children"], "svc-p")
    assert svc is not None and svc["kind"] == "entity"

    # The Change Project entity is excluded entirely.
    assert _find(tree["nodes"], "prj-x") is None
    # Inactive entity excluded.
    assert _find(tree["nodes"], "off-dead") is None


def test_group_by_program_lob_only_entity_is_direct_leaf(db, seed_run_entities):
    """(b) An LoB-only entity appears as a direct leaf of the LoB node."""
    tree = build_run_cost_tree(db, group_by="program")

    alpha = _find(tree["nodes"], "lob-alpha")
    assert alpha is not None

    # off-a attaches above the Program level → direct leaf of LoB Alpha.
    direct_child_ids = [c["id"] for c in alpha["children"]]
    assert "off-a" in direct_child_ids
    off_a = _find(alpha["children"], "off-a")
    assert off_a["kind"] == "entity"

    # The Programme One group still exists as a sibling, holding svc-p.
    prog = _find(alpha["children"], "prog-one")
    assert prog is not None and prog["kind"] == "group"
    assert prog["level"] == "get-prog"
    assert _find(prog["children"], "svc-p") is not None
    assert prog["rolled_cost"] == 50.0

    # Entity leaves render ABOVE program group rows (§10.2 ordering).
    assert direct_child_ids.index("off-a") < direct_child_ids.index("prog-one")


def test_grand_total_equals_sum_of_top_node_rolled(db, seed_run_entities):
    """(c) grand_total == sum of top-level node rolled_cost (no cost loss)."""
    for gb in ("lob", "program"):
        tree = build_run_cost_tree(db, group_by=gb)
        top_sum = sum(n["rolled_cost"] for n in tree["nodes"])
        assert tree["grand_total"] == top_sum
        # All active Run entities accounted for: 100 + 200 + 50 = 350.
        assert tree["grand_total"] == 350.0


def test_node_scope_filters_to_descendants(db, seed_run_entities):
    """The node param scopes the population descendant-inclusive."""
    # Scope to LoB Alpha → only off-a (100) + svc-p (50) = 150, Beta excluded.
    tree = build_run_cost_tree(db, group_by="lob", node="lob-alpha")
    assert tree["grand_total"] == 150.0
    assert _find(tree["nodes"], "lob-beta") is None

    # Scope to Programme One → only svc-p (50).
    tree2 = build_run_cost_tree(db, group_by="program", node="prog-one")
    assert tree2["grand_total"] == 50.0
    assert _find(tree2["nodes"], "off-a") is None
    assert _find(tree2["nodes"], "svc-p") is not None


def test_entity_node_field_shape(db, seed_run_entities):
    """Entity/group node field contract matches the frontend RunCostTreeNode."""
    tree = build_run_cost_tree(db, group_by="lob")
    alpha = _find(tree["nodes"], "lob-alpha")
    svc = _find(alpha["children"], "svc-p")

    # Group node contract
    assert set(alpha.keys()) == {
        "id", "name", "kind", "level", "entity_type", "identifier",
        "annual_cost", "rolled_cost", "entity_count", "children",
    }
    assert alpha["annual_cost"] == 0.0
    assert alpha["entity_type"] is None
    assert alpha["identifier"] is None

    # Entity node contract
    assert svc["level"] is None
    assert svc["entity_type"] == "InternalService"
    assert svc["identifier"] == "ITF20001"
    assert svc["annual_cost"] == 50.0
    assert svc["rolled_cost"] == 50.0
    assert svc["entity_count"] == 1
    assert svc["children"] == []


def test_unsupported_group_by_raises(db, seed_hierarchy):
    with pytest.raises(ValueError):
        build_run_cost_tree(db, group_by="region")


# ---------------------------------------------------------------------------
# Router integration — wiring + auth + response_model validation
# ---------------------------------------------------------------------------

HDR = {"X-Current-User": "persona-controller"}


def test_cost_tree_endpoint_ok(test_client, seed_personas, seed_run_entities):
    resp = test_client.get(
        "/api/portfolio/run/cost-tree?group_by=lob", headers=HDR
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["group_by"] == "lob"
    assert body["grand_total"] == 350.0
    assert {n["id"] for n in body["nodes"]} == {"lob-alpha", "lob-beta"}


def test_cost_tree_endpoint_rejects_bad_group_by(test_client, seed_personas):
    resp = test_client.get(
        "/api/portfolio/run/cost-tree?group_by=region", headers=HDR
    )
    assert resp.status_code == 422


def test_run_external_cost_routes_wired(test_client, seed_personas):
    for path in (
        "/api/portfolio/run/external-costs/vendor-summary",
        "/api/portfolio/run/external-costs/category-analysis",
        "/api/portfolio/run/external-costs/project-vendor-matrix",
    ):
        resp = test_client.get(f"{path}?year=2026", headers=HDR)
        assert resp.status_code == 200, path
        assert resp.json()["year"] == 2026
