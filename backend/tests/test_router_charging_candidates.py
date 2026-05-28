"""Router tests for GET /api/charging/distribution-candidates/{source_entity_id}
(Service Workbench Session 2).

Exercises the candidate-picker endpoint:

- Excludes the source entity itself from candidate list.
- Excludes entities already wired as outgoing targets from the source.
- Excludes entities that would form a cycle if added.
- Computes the correct ``resulting_chain_depth`` for each candidate.
- Sets the ``near_max_depth_warning`` flag when the resulting depth is at
  or beyond ``max_allocation_depth - 1``.
- Access-control parity: all four roles can read.
"""

from __future__ import annotations

from datetime import date

import pytest

from models.charging import (
    ChargeableEntity, Distribution, DistributionVersion,
)
from models.organization import GroupingEntity, GroupingEntityType
from models.system import PlanningParameter


# ---------------------------------------------------------------------------
# Seed helpers
# ---------------------------------------------------------------------------


def _seed_max_depth_param(db, value: int) -> PlanningParameter:
    """Insert or update the max_allocation_depth PlanningParameter row.

    Used by tests that need to exercise the near-max-depth warning at
    custom max values. The in-memory test DB starts empty so we manage
    the row explicitly per fixture.
    """
    row = (
        db.query(PlanningParameter)
        .filter(PlanningParameter.key == "max_allocation_depth")
        .first()
    )
    if row is None:
        row = PlanningParameter(
            key="max_allocation_depth",
            name="Max allocation depth",
            data_type="integer",
            param_group="limits",
            current_value=str(value),
            default_value=str(value),
        )
        db.add(row)
    else:
        row.current_value = str(value)
    db.flush()
    return row


def _seed_lob(db, lob_id: str = "lob-cand") -> None:
    if db.query(GroupingEntityType).filter_by(id="get-lob-cand").first() is None:
        db.add(GroupingEntityType(id="get-lob-cand", name="LoB-cand"))
    if db.query(GroupingEntity).filter_by(id=lob_id).first() is None:
        db.add(GroupingEntity(
            id=lob_id, entity_type_id="get-lob-cand", name="LoB Cand",
        ))
    db.flush()


@pytest.fixture
def seed_simple_graph(db, seed_personas):
    """Build A -> B (40%) ; C isolated, D isolated.

    No existing target on A → B is the only one. So candidates from A
    should exclude A (self) and B (existing target). C and D are eligible.
    """
    _seed_max_depth_param(db, 6)
    _seed_lob(db)

    db.add_all([
        ChargeableEntity(
            id="a", entity_type="InternalService", identifier="ITF00001",
            name="A", to_business_pct=0.0, hierarchy_node_id="lob-cand",
            annual_cost=100.0,
        ),
        ChargeableEntity(
            id="b", entity_type="InternalService", identifier="ITF00002",
            name="B", to_business_pct=0.0, hierarchy_node_id="lob-cand",
            annual_cost=0.0,
        ),
        ChargeableEntity(
            id="c", entity_type="Offering", identifier="IT00CCC",
            name="C", to_business_pct=0.0, hierarchy_node_id="lob-cand",
            annual_cost=0.0,
        ),
        ChargeableEntity(
            id="d", entity_type="Offering", identifier="IT00DDD",
            name="D", to_business_pct=0.0, hierarchy_node_id="lob-cand",
            annual_cost=0.0,
        ),
    ])
    v = DistributionVersion(
        active_from=date(2025, 1, 1), status="active",
        rationale="cand seed", origin="seed",
    )
    db.add(v)
    db.flush()
    db.add(Distribution(
        version_id=v.id, source_entity_id="a",
        destination_entity_id="b", percentage=40.0,
    ))
    db.commit()
    return {"version_id": v.id}


@pytest.fixture
def seed_cycle_graph(db, seed_personas):
    """Build A -> B -> C. Hitting candidates from C should exclude A
    (since C -> A would close A -> B -> C -> A).
    """
    _seed_max_depth_param(db, 6)
    _seed_lob(db, "lob-cycle")
    db.add_all([
        ChargeableEntity(
            id="ax", entity_type="InternalService", identifier="ITF11001",
            name="A", to_business_pct=0.0, hierarchy_node_id="lob-cycle",
            annual_cost=0.0,
        ),
        ChargeableEntity(
            id="bx", entity_type="InternalService", identifier="ITF11002",
            name="B", to_business_pct=0.0, hierarchy_node_id="lob-cycle",
            annual_cost=0.0,
        ),
        ChargeableEntity(
            id="cx", entity_type="InternalService", identifier="ITF11003",
            name="C", to_business_pct=0.0, hierarchy_node_id="lob-cycle",
            annual_cost=0.0,
        ),
    ])
    v = DistributionVersion(
        active_from=date(2025, 1, 1), status="active",
        rationale="cycle seed", origin="seed",
    )
    db.add(v)
    db.flush()
    db.add_all([
        Distribution(version_id=v.id, source_entity_id="ax",
                     destination_entity_id="bx", percentage=50.0),
        Distribution(version_id=v.id, source_entity_id="bx",
                     destination_entity_id="cx", percentage=50.0),
    ])
    db.commit()
    return {"version_id": v.id}


@pytest.fixture
def seed_deep_chain(db, seed_personas):
    """Build a chain so we can exercise the near_max_depth warning flag.

    Layout: P1 -> P2 -> P3 (3 nodes, 2 edges). Plus an isolated P4 and an
    isolated P5 which itself has a downstream P5 -> P6 -> P7 (3 nodes, 2
    edges). Max allocation depth = 4 (edge-count).

    Edge-count distances (existing graph):
      longest_ending_at:   p1=0, p2=1, p3=2, p4=0 (isolated),
                           p5=0, p6=1, p7=2
      longest_starting_at: p1=2, p2=1, p3=0, p4=0,
                           p5=2, p6=1, p7=0

    ``resulting_chain_depth = ending[source] + 1 + starting[candidate]``.

    Candidates from P3 (ending=2):
      - P4 (starting=0): 2 + 1 + 0 = 3 — at max-1, warning True, no violate.
      - P5 (starting=2): 2 + 1 + 2 = 5 — exceeds max=4, would_violate True.
      - P6 (starting=1): 2 + 1 + 1 = 4 — equal to max, near_max True, no violate.
      - P7 (starting=0): 2 + 1 + 0 = 3 — at max-1, near_max True.

    Candidates from P1 (ending=0):
      - P4 (starting=0): 0 + 1 + 0 = 1 — far below threshold, both False.
      - P5 (starting=2): 0 + 1 + 2 = 3 — at max-1, near_max True.
    """
    _seed_max_depth_param(db, 4)
    _seed_lob(db, "lob-deep")
    db.add_all([
        ChargeableEntity(
            id="p1", entity_type="InternalService", identifier="ITF21001",
            name="P1", to_business_pct=0.0, hierarchy_node_id="lob-deep",
            annual_cost=0.0,
        ),
        ChargeableEntity(
            id="p2", entity_type="InternalService", identifier="ITF21002",
            name="P2", to_business_pct=0.0, hierarchy_node_id="lob-deep",
            annual_cost=0.0,
        ),
        ChargeableEntity(
            id="p3", entity_type="InternalService", identifier="ITF21003",
            name="P3", to_business_pct=0.0, hierarchy_node_id="lob-deep",
            annual_cost=0.0,
        ),
        ChargeableEntity(
            id="p4", entity_type="Offering", identifier="IT00P4Z",
            name="P4 isolated", to_business_pct=0.0,
            hierarchy_node_id="lob-deep", annual_cost=0.0,
        ),
        ChargeableEntity(
            id="p5", entity_type="InternalService", identifier="ITF21005",
            name="P5", to_business_pct=0.0, hierarchy_node_id="lob-deep",
            annual_cost=0.0,
        ),
        ChargeableEntity(
            id="p6", entity_type="InternalService", identifier="ITF21006",
            name="P6", to_business_pct=0.0, hierarchy_node_id="lob-deep",
            annual_cost=0.0,
        ),
        ChargeableEntity(
            id="p7", entity_type="InternalService", identifier="ITF21007",
            name="P7", to_business_pct=0.0, hierarchy_node_id="lob-deep",
            annual_cost=0.0,
        ),
    ])
    v = DistributionVersion(
        active_from=date(2025, 1, 1), status="active",
        rationale="deep seed", origin="seed",
    )
    db.add(v)
    db.flush()
    db.add_all([
        Distribution(version_id=v.id, source_entity_id="p1",
                     destination_entity_id="p2", percentage=50.0),
        Distribution(version_id=v.id, source_entity_id="p2",
                     destination_entity_id="p3", percentage=50.0),
        Distribution(version_id=v.id, source_entity_id="p5",
                     destination_entity_id="p6", percentage=50.0),
        Distribution(version_id=v.id, source_entity_id="p6",
                     destination_entity_id="p7", percentage=50.0),
    ])
    db.commit()
    return {"version_id": v.id}


def _h(persona: str) -> dict:
    return {"X-Current-User": persona}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestCandidatesExclusion:
    def test_excludes_self(self, test_client, seed_simple_graph):
        r = test_client.get(
            "/api/charging/distribution-candidates/a",
            headers=_h("persona-controller"),
        )
        assert r.status_code == 200, r.text
        data = r.json()
        candidate_ids = {c["entity_id"] for c in data["candidates"]}
        assert "a" not in candidate_ids

    def test_excludes_existing_targets(self, test_client, seed_simple_graph):
        # A already points at B → B excluded; C, D included.
        r = test_client.get(
            "/api/charging/distribution-candidates/a",
            headers=_h("persona-controller"),
        )
        assert r.status_code == 200, r.text
        data = r.json()
        candidate_ids = {c["entity_id"] for c in data["candidates"]}
        assert "b" not in candidate_ids
        assert {"c", "d"}.issubset(candidate_ids)
        assert data["total"] == len(data["candidates"])

    def test_excludes_cycle_creators(self, test_client, seed_cycle_graph):
        # Candidates from C — A would create cycle A -> B -> C -> A.
        r = test_client.get(
            "/api/charging/distribution-candidates/cx",
            headers=_h("persona-controller"),
        )
        assert r.status_code == 200, r.text
        data = r.json()
        candidate_ids = {c["entity_id"] for c in data["candidates"]}
        assert "ax" not in candidate_ids
        assert "cx" not in candidate_ids
        # B is also a cycle path member: C -> B would close B -> C -> B.
        assert "bx" not in candidate_ids


class TestResultingChainDepth:
    def test_resulting_chain_depth_uses_edge_count(
        self, test_client, seed_simple_graph,
    ):
        # A -> B exists (1 edge). Candidate C from source A:
        # longest_ending_at(A)=0 (root), longest_starting_at(C)=0 (isolated)
        # → resulting = 0 + 1 + 0 = 1 (the new A→C edge).
        r = test_client.get(
            "/api/charging/distribution-candidates/a",
            headers=_h("persona-controller"),
        )
        assert r.status_code == 200, r.text
        data = r.json()
        c_candidate = next(
            c for c in data["candidates"] if c["entity_id"] == "c"
        )
        assert c_candidate["resulting_chain_depth"] == 1

    def test_resulting_chain_depth_in_deep_chain(
        self, test_client, seed_deep_chain,
    ):
        # Source = P3 (longest_ending_at=2 — 2 edges from P1).
        # Candidate P4 (isolated, starting=0): 2 + 1 + 0 = 3.
        # Candidate P5 (root of P5→P6→P7, starting=2): 2 + 1 + 2 = 5.
        r = test_client.get(
            "/api/charging/distribution-candidates/p3",
            headers=_h("persona-controller"),
        )
        assert r.status_code == 200, r.text
        data = r.json()
        by_id = {c["entity_id"]: c for c in data["candidates"]}
        assert by_id["p4"]["resulting_chain_depth"] == 3
        assert by_id["p5"]["resulting_chain_depth"] == 5


class TestNearMaxDepthFlag:
    """Boundary tests for ``near_max_depth_warning`` and ``would_violate_max_depth``.

    With max=4 (edge-count), threshold for warning is max-1 = 3.
    The two flags are mutually exclusive: would_violate fires when
    resulting > max; near_max_depth_warning fires when resulting >= max-1
    AND resulting <= max.
    """

    def test_off_when_well_below_threshold(self, test_client, seed_deep_chain):
        # Source = P1 (ending=0). Candidate P4 (starting=0): resulting=1.
        # max=4, threshold=3. 1 < 3 → both flags False.
        r = test_client.get(
            "/api/charging/distribution-candidates/p1",
            headers=_h("persona-controller"),
        )
        cands = {c["entity_id"]: c for c in r.json()["candidates"]}
        assert cands["p4"]["resulting_chain_depth"] == 1
        assert cands["p4"]["near_max_depth_warning"] is False
        assert cands["p4"]["would_violate_max_depth"] is False

    def test_warning_at_max_minus_one(self, test_client, seed_deep_chain):
        # Source = P1. Candidate P5 (starting=2): resulting=3 == max-1.
        # 3 >= 3 (threshold) and 3 <= 4 (max) → near_max True, no violate.
        r = test_client.get(
            "/api/charging/distribution-candidates/p1",
            headers=_h("persona-controller"),
        )
        cands = {c["entity_id"]: c for c in r.json()["candidates"]}
        assert cands["p5"]["resulting_chain_depth"] == 3
        assert cands["p5"]["near_max_depth_warning"] is True
        assert cands["p5"]["would_violate_max_depth"] is False

    def test_warning_at_max(self, test_client, seed_deep_chain):
        # Source = P3 (ending=2). Candidate P6 (starting=1): resulting=4 == max.
        # 4 >= 3 and 4 <= 4 → near_max True, no violate.
        r = test_client.get(
            "/api/charging/distribution-candidates/p3",
            headers=_h("persona-controller"),
        )
        cands = {c["entity_id"]: c for c in r.json()["candidates"]}
        assert cands["p6"]["resulting_chain_depth"] == 4
        assert cands["p6"]["near_max_depth_warning"] is True
        assert cands["p6"]["would_violate_max_depth"] is False

    def test_would_violate_above_max(self, test_client, seed_deep_chain):
        # Source = P3 (ending=2). Candidate P5 (starting=2): resulting=5 > max=4.
        # would_violate True, near_max False (mutually exclusive).
        r = test_client.get(
            "/api/charging/distribution-candidates/p3",
            headers=_h("persona-controller"),
        )
        cands = {c["entity_id"]: c for c in r.json()["candidates"]}
        assert cands["p5"]["resulting_chain_depth"] == 5
        assert cands["p5"]["would_violate_max_depth"] is True
        assert cands["p5"]["near_max_depth_warning"] is False

    def test_would_violate_aligns_with_save_time_409(
        self, test_client, seed_deep_chain,
    ):
        # Decisive cross-check: a candidate flagged would_violate=True
        # should, when POSTed as an edge, get a 409 with violating_path.
        r = test_client.get(
            "/api/charging/distribution-candidates/p3",
            headers=_h("persona-controller"),
        )
        violator = next(
            c for c in r.json()["candidates"]
            if c["would_violate_max_depth"] is True
        )
        # Need a draft version to write into — seed_deep_chain ships an
        # active version only, so create a draft sibling via the API.
        from models.charging import DistributionVersion
        from tests.conftest import TestSessionLocal
        session = TestSessionLocal()
        try:
            draft = DistributionVersion(
                active_from=None, status="draft", rationale="", origin="blank",
            )
            session.add(draft)
            # Mirror seed_deep_chain edges into the draft so the depth
            # math at save time matches the candidate endpoint.
            from models.charging import Distribution
            for src, dst in [
                ("p1", "p2"), ("p2", "p3"),
                ("p5", "p6"), ("p6", "p7"),
            ]:
                session.flush()
                session.add(Distribution(
                    version_id=draft.id, source_entity_id=src,
                    destination_entity_id=dst, percentage=50.0,
                ))
            session.commit()
            draft_id = draft.id
        finally:
            session.close()

        post = test_client.post(
            "/api/charging/distributions",
            headers=_h("persona-controller"),
            json={
                "version_id": draft_id,
                "source_entity_id": "p3",
                "destination_entity_id": violator["entity_id"],
                "percentage": 10.0,
            },
        )
        assert post.status_code == 409, post.text
        body = post.json()["detail"]
        assert "violating_path" in body or (
            isinstance(body, dict) and "violating_path" in body
        )


class TestCandidatesErrors:
    def test_404_unknown_source(self, test_client, seed_simple_graph):
        r = test_client.get(
            "/api/charging/distribution-candidates/no-such-entity",
            headers=_h("persona-controller"),
        )
        assert r.status_code == 404


class TestCandidatesAccessControl:
    @pytest.mark.parametrize("persona", [
        "persona-controller",
        "persona-exec",
        "persona-pl",
        "persona-cc-owner",
    ])
    def test_open_to_all_four_roles(
        self, test_client, seed_simple_graph, persona,
    ):
        r = test_client.get(
            "/api/charging/distribution-candidates/a",
            headers=_h(persona),
        )
        assert r.status_code == 200, (
            f"Persona {persona} expected 200, got {r.status_code}: {r.text}"
        )
