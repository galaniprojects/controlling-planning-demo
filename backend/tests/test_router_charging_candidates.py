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

    Layout: P1 -> P2 -> P3 (length 3 nodes). Plus an isolated P4 and an
    isolated P5 which itself has a downstream P5 -> P6 -> P7 (3-node chain
    starting at P5). Max = 4.

    Candidates from P3:
      - P4: longest_ending_at(P3)=3, longest_starting_at(P4)=1
        resulting depth = 4. With max=4 → near_max trigger threshold is
        max-1 = 3, so 4 >= 3 → warning True.
      - P5: longest_ending_at(P3)=3 + longest_starting_at(P5)=3 = 6 → warning True.
    Candidates from P1 (depth 1 root) to P4 (isolated): depth = 1 + 1 = 2.
    2 >= 3 (max-1)? No → warning False.
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
    def test_resulting_chain_depth_correct(
        self, test_client, seed_simple_graph,
    ):
        # A -> B exists. Candidate C from source A: longest_ending_at(A)=1
        # (A is a root with no incoming), longest_starting_at(C)=1 (C is
        # an isolated node) → resulting depth = 2.
        r = test_client.get(
            "/api/charging/distribution-candidates/a",
            headers=_h("persona-controller"),
        )
        assert r.status_code == 200, r.text
        data = r.json()
        c_candidate = next(
            c for c in data["candidates"] if c["entity_id"] == "c"
        )
        assert c_candidate["resulting_chain_depth"] == 2

    def test_resulting_chain_depth_in_deep_chain(
        self, test_client, seed_deep_chain,
    ):
        # Source = P3 (depth 3 from P1 root).
        # Candidate P4 (isolated): 3 + 1 = 4.
        # Candidate P5 (root of P5 -> P6 -> P7, 3-node chain): 3 + 3 = 6.
        r = test_client.get(
            "/api/charging/distribution-candidates/p3",
            headers=_h("persona-controller"),
        )
        assert r.status_code == 200, r.text
        data = r.json()
        by_id = {c["entity_id"]: c for c in data["candidates"]}
        assert by_id["p4"]["resulting_chain_depth"] == 4
        assert by_id["p5"]["resulting_chain_depth"] == 6


class TestNearMaxDepthFlag:
    def test_near_max_depth_warning_flag(self, test_client, seed_deep_chain):
        # max=4. Threshold for warning = max - 1 = 3 (depth >= 3 triggers).
        # Source = P1 (root, longest_ending_at = 1).
        #   - P4 (isolated): 1 + 1 = 2 → warning False.
        #   - P5 (root of P5 chain depth 3): 1 + 3 = 4 → warning True.
        # Source = P3 (end of P1->P2->P3, longest_ending_at = 3).
        #   - P4: 3 + 1 = 4 → warning True.
        r1 = test_client.get(
            "/api/charging/distribution-candidates/p1",
            headers=_h("persona-controller"),
        )
        assert r1.status_code == 200, r1.text
        cands_p1 = {c["entity_id"]: c for c in r1.json()["candidates"]}
        # p4: resulting depth=2; threshold=3 → not near-max.
        assert cands_p1["p4"]["resulting_chain_depth"] == 2
        assert cands_p1["p4"]["near_max_depth_warning"] is False
        # p5: resulting depth=4; threshold=3 → near-max.
        assert cands_p1["p5"]["resulting_chain_depth"] == 4
        assert cands_p1["p5"]["near_max_depth_warning"] is True

        r3 = test_client.get(
            "/api/charging/distribution-candidates/p3",
            headers=_h("persona-controller"),
        )
        assert r3.status_code == 200, r3.text
        cands_p3 = {c["entity_id"]: c for c in r3.json()["candidates"]}
        # p4 candidate from p3: resulting depth 4 → near-max.
        assert cands_p3["p4"]["resulting_chain_depth"] == 4
        assert cands_p3["p4"]["near_max_depth_warning"] is True


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
