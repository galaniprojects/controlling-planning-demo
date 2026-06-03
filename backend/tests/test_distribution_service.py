"""Unit tests for the Stage 1 distribution service (FD-3 — version_id rescope).

Covers:
- Version state machine (create blank / copy_active / copy_prior, update
  rationale, activate, delete).
- Production resolver (latest ``active_from`` ≤ evaluated date,
  scenario-scope exclusion).
- Sum-rule per `[F-S1-02]`.
- Cycle wrapper per `[F-S1-05]`.
- Edge CRUD scoped to drafts (active-version immutability per `[F-S1-08]`).
- Version diff per `[F-S1-07]`.
"""

from __future__ import annotations

from datetime import date

import pytest

from models.charging import ChargeableEntity, Distribution, DistributionVersion
from models.organization import GroupingEntity, GroupingEntityType
from models.scenarios import Scenario
from models.system import PlanningParameter
from services.distribution_service import (
    DiffEdge,
    DistributionValidationError,
    activate_version,
    assert_no_cycle,
    assert_sum_within_100,
    compute_sum_validation,
    compute_version_diff,
    create_distribution_edge,
    create_version,
    delete_distribution_edge,
    delete_version,
    get_forked_sources,
    get_version,
    list_edges_for_version,
    list_versions,
    union_incoming_edges,
    union_outgoing_edges,
    resolve_active_version,
    resolve_active_version_or_raise,
    resolve_default_compared_to,
    update_distribution_edge,
    update_to_business_pct,
    update_version_rationale,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _seed_planning_parameter(db):
    """Ensure ``max_allocation_depth=6`` is present for every test in this module.

    The Service Workbench S1 depth-validation path (create / update edge)
    reads this PlanningParameter row. ``conftest.setup_db`` autouse already
    seeds it for the whole suite, but we re-check here so individual depth
    tests can rely on a known starting state. Individual depth tests in
    :class:`TestDepthValidation` override the value via :func:`_seed_max_depth_param`.
    """
    existing = (
        db.query(PlanningParameter)
        .filter(PlanningParameter.key == "max_allocation_depth")
        .first()
    )
    if existing is None:
        db.add(PlanningParameter(
            key="max_allocation_depth",
            name="Max allocation depth",
            description="Maximum chain depth for Stage 1 distributions.",
            current_value="6",
            default_value="6",
            data_type="integer",
            param_group="limits",
        ))
        db.commit()
    yield


@pytest.fixture
def graph(db):
    """Three entities + one active production version (no edges yet).

    A (InternalService, to_business=0), B (Offering, to_business=50),
    C (Offering, to_business=0). Active production version
    ``active_from=2025-01-01`` for sum-rule + edge CRUD tests.
    """
    et = GroupingEntityType(id="get-lob", name="LoB")
    n = GroupingEntity(id="lob-1", entity_type_id="get-lob", name="LoB One")
    db.add_all([et, n])
    a = ChargeableEntity(
        id="A", entity_type="InternalService", identifier="ITF99001",
        name="A", to_business_pct=0.0, hierarchy_node_id="lob-1",
    )
    b = ChargeableEntity(
        id="B", entity_type="Offering", identifier="IT00BBB",
        name="B", to_business_pct=50.0, hierarchy_node_id="lob-1",
    )
    c = ChargeableEntity(
        id="C", entity_type="Offering", identifier="IT00CCC",
        name="C", to_business_pct=0.0, hierarchy_node_id="lob-1",
    )
    db.add_all([a, b, c])
    db.flush()

    v_active = DistributionVersion(
        active_from=date(2025, 1, 1), status="active",
        rationale="Initial", origin="seed",
    )
    db.add(v_active)
    db.commit()
    return {"a": a, "b": b, "c": c, "active": v_active}


@pytest.fixture
def draft_version(db, graph):
    """Add a draft sibling so edge-CRUD tests have a mutable target."""
    v = DistributionVersion(
        active_from=None, status="draft", rationale="", origin="blank",
    )
    db.add(v)
    db.commit()
    return v


# ---------------------------------------------------------------------------
# Version resolution
# ---------------------------------------------------------------------------


class TestResolveActiveVersion:
    def test_returns_active_in_force(self, db, graph):
        v = resolve_active_version(db, date(2026, 4, 1))
        assert v is not None
        assert v.id == graph["active"].id

    def test_returns_none_when_no_version_in_force(self, db, graph):
        # All versions have active_from=2025-01-01; evaluated 2024 → none.
        assert resolve_active_version(db, date(2024, 1, 1)) is None

    def test_picks_latest_active_from_under_cap(self, db, graph):
        # Add a second active version with active_from=2026-01-01; the resolver
        # should pick it for any date >= 2026-01-01.
        v2 = DistributionVersion(
            active_from=date(2026, 1, 1), status="active",
            rationale="Re-agreed for 2026", origin="copy_active",
            copied_from_version_id=graph["active"].id,
        )
        db.add(v2)
        db.commit()
        assert resolve_active_version(db, date(2026, 4, 1)).id == v2.id
        # Pre-2026 still resolves to v1.
        assert resolve_active_version(db, date(2025, 6, 1)).id == graph["active"].id

    def test_excludes_scenario_versions(self, db, graph, seed_org_base):
        # Create a scenario-scoped row — production resolver must ignore it.
        sc = Scenario(name="Sc", author_id=seed_org_base["person_ids"][0])
        db.add(sc)
        db.flush()
        v_sc = DistributionVersion(
            active_from=date(2026, 6, 1), status="draft",
            rationale="", origin="blank", scenario_id=sc.id,
        )
        db.add(v_sc)
        db.commit()
        v = resolve_active_version(db, date(2026, 6, 2))
        assert v.id == graph["active"].id

    def test_or_raise_variant(self, db, graph):
        with pytest.raises(DistributionValidationError, match="No production"):
            resolve_active_version_or_raise(db, date(2024, 1, 1))


class TestListVersions:
    def test_default_excludes_scenarios(self, db, graph, seed_org_base):
        sc = Scenario(name="Sc", author_id=seed_org_base["person_ids"][0])
        db.add(sc)
        db.flush()
        v_sc = DistributionVersion(
            scenario_id=sc.id, status="draft", origin="blank", rationale="",
        )
        db.add(v_sc)
        db.commit()
        versions = list_versions(db)
        assert all(v.scenario_id is None for v in versions)

    def test_include_scenario_returns_all(self, db, graph, seed_org_base):
        sc = Scenario(name="Sc", author_id=seed_org_base["person_ids"][0])
        db.add(sc)
        db.flush()
        v_sc = DistributionVersion(
            scenario_id=sc.id, status="draft", origin="blank", rationale="",
        )
        db.add(v_sc)
        db.commit()
        versions = list_versions(db, include_scenario=True)
        ids = {v.id for v in versions}
        assert v_sc.id in ids
        assert graph["active"].id in ids

    def test_status_filter(self, db, graph):
        v_draft = DistributionVersion(
            status="draft", origin="blank", rationale="",
        )
        db.add(v_draft)
        db.commit()
        assert all(v.status == "active" for v in list_versions(db, status="active"))
        assert all(v.status == "draft" for v in list_versions(db, status="draft"))


# ---------------------------------------------------------------------------
# Version state machine — create / update / activate / delete
# ---------------------------------------------------------------------------


class TestCreateVersion:
    def test_blank_origin_creates_empty_draft(self, db, graph):
        v = create_version(db, origin="blank")
        db.commit()
        assert v.status == "draft"
        assert v.active_from is None
        assert v.rationale == ""
        assert v.origin == "blank"
        assert v.copied_from_version_id is None
        assert list_edges_for_version(db, v.id) == []

    def test_blank_origin_with_rationale_stored(self, db, graph):
        v = create_version(db, origin="blank", rationale="experimenting")
        db.commit()
        assert v.rationale == "experimenting"

    def test_invalid_origin_rejected(self, db, graph):
        with pytest.raises(DistributionValidationError, match="Invalid origin"):
            create_version(db, origin="not-a-real-origin")

    def test_copy_active_requires_in_force_version(self, db, graph):
        # The seeded active has active_from=2025-01-01; evaluated 2024 → none.
        with pytest.raises(DistributionValidationError, match="no production"):
            create_version(db, origin="copy_active", evaluated_date=date(2024, 1, 1))

    def test_copy_active_pulls_edges_from_in_force(self, db, graph):
        # Seed two edges on the active version.
        db.add_all([
            Distribution(
                version_id=graph["active"].id,
                source_entity_id="A", destination_entity_id="B",
                percentage=30.0, rationale="initial split",
            ),
            Distribution(
                version_id=graph["active"].id,
                source_entity_id="B", destination_entity_id="C",
                percentage=20.0,
            ),
        ])
        db.commit()

        new = create_version(db, origin="copy_active", evaluated_date=date(2026, 4, 1))
        db.commit()
        edges = list_edges_for_version(db, new.id)
        assert len(edges) == 2
        assert new.copied_from_version_id == graph["active"].id
        # Verify per-edge rationale carried over.
        a_b = next(e for e in edges if e.source_entity_id == "A")
        assert a_b.rationale == "initial split"

    def test_copy_prior_requires_copied_from(self, db, graph):
        with pytest.raises(DistributionValidationError, match="requires copied_from_version_id"):
            create_version(db, origin="copy_prior")

    def test_copy_prior_pulls_edges_from_specified(self, db, graph):
        db.add(Distribution(
            version_id=graph["active"].id,
            source_entity_id="A", destination_entity_id="B", percentage=10.0,
        ))
        db.commit()
        new = create_version(
            db, origin="copy_prior", copied_from_version_id=graph["active"].id,
        )
        db.commit()
        assert new.copied_from_version_id == graph["active"].id
        assert len(list_edges_for_version(db, new.id)) == 1

    def test_copy_prior_unknown_source_raises(self, db, graph):
        with pytest.raises(DistributionValidationError, match="not found"):
            create_version(db, origin="copy_prior", copied_from_version_id=99999)


class TestUpdateVersionRationale:
    def test_updates_draft(self, db, draft_version):
        update_version_rationale(db, draft_version.id, rationale="new explanation")
        db.commit()
        v = get_version(db, draft_version.id)
        assert v.rationale == "new explanation"

    def test_rejects_active(self, db, graph):
        with pytest.raises(DistributionValidationError, match="immutable"):
            update_version_rationale(db, graph["active"].id, rationale="x")


class TestActivateVersion:
    def test_activates_draft(self, db, draft_version):
        before = draft_version.activated_at
        activate_version(
            db, draft_version.id,
            active_from=date(2026, 6, 1),
            rationale="Q2 2026 split agreed by SteerCo",
        )
        db.commit()
        v = get_version(db, draft_version.id)
        assert v.status == "active"
        assert v.active_from == date(2026, 6, 1)
        assert v.activated_at is not None and v.activated_at != before
        assert v.rationale == "Q2 2026 split agreed by SteerCo"

    def test_rejects_already_active(self, db, graph):
        with pytest.raises(DistributionValidationError, match="already active"):
            activate_version(
                db, graph["active"].id, active_from=date(2026, 1, 1),
                rationale="x",
            )

    def test_rejects_empty_rationale(self, db, draft_version):
        with pytest.raises(DistributionValidationError, match="non-empty rationale"):
            activate_version(
                db, draft_version.id, active_from=date(2026, 6, 1), rationale="",
            )

    def test_rejects_whitespace_only_rationale(self, db, draft_version):
        with pytest.raises(DistributionValidationError, match="non-empty rationale"):
            activate_version(
                db, draft_version.id, active_from=date(2026, 6, 1),
                rationale="   \n  ",
            )

    def test_rejects_duplicate_active_from(self, db, graph):
        # Graph's active is active_from=2025-01-01; new draft tries to activate
        # on the same date — must fail.
        v_draft = DistributionVersion(status="draft", origin="blank", rationale="")
        db.add(v_draft)
        db.commit()
        with pytest.raises(DistributionValidationError, match="active_from"):
            activate_version(
                db, v_draft.id, active_from=date(2025, 1, 1), rationale="dup",
            )

    def test_rejects_scenario_scoped(self, db, graph, seed_org_base):
        sc = Scenario(name="X", author_id=seed_org_base["person_ids"][0])
        db.add(sc)
        db.flush()
        v_sc = DistributionVersion(
            status="draft", origin="blank", rationale="",
            scenario_id=sc.id,
        )
        db.add(v_sc)
        db.commit()
        with pytest.raises(DistributionValidationError, match="scenario-scoped"):
            activate_version(
                db, v_sc.id, active_from=date(2026, 6, 1), rationale="x",
            )


class TestDeleteVersion:
    def test_deletes_draft(self, db, draft_version):
        vid = draft_version.id
        delete_version(db, vid)
        db.commit()
        assert db.query(DistributionVersion).filter_by(id=vid).first() is None

    def test_rejects_active(self, db, graph):
        with pytest.raises(DistributionValidationError, match="immutable"):
            delete_version(db, graph["active"].id)

    def test_cascade_drops_edges(self, db, draft_version):
        db.add(Distribution(
            version_id=draft_version.id,
            source_entity_id="A", destination_entity_id="B", percentage=10.0,
        ))
        db.commit()
        delete_version(db, draft_version.id)
        db.commit()
        assert db.query(Distribution).filter_by(version_id=draft_version.id).count() == 0


# ---------------------------------------------------------------------------
# Sum-rule + cycle assertions
# ---------------------------------------------------------------------------


class TestComputeSumValidation:
    def test_empty_state_is_valid(self, db, graph, draft_version):
        result = compute_sum_validation(db, "A", draft_version.id)
        assert result.is_valid
        assert result.distribution_total_pct == 0.0
        assert result.self_retained_pct == 100.0

    def test_with_existing_edges(self, db, graph, draft_version):
        db.add(Distribution(
            version_id=draft_version.id, source_entity_id="A",
            destination_entity_id="B", percentage=30.0,
        ))
        db.commit()
        result = compute_sum_validation(db, "A", draft_version.id)
        assert result.distribution_total_pct == 30.0
        assert result.self_retained_pct == 70.0

    def test_candidate_destination_simulates_create(self, db, graph, draft_version):
        result = compute_sum_validation(
            db, "A", draft_version.id,
            candidate_destination_id="B", candidate_percentage=60.0,
        )
        assert result.distribution_total_pct == 60.0
        assert result.is_valid

    def test_candidate_to_business_simulates_update(self, db, graph, draft_version):
        result = compute_sum_validation(
            db, "B", draft_version.id, candidate_to_business_pct=110.0,
        )
        assert result.grand_total_pct == 110.0
        assert not result.is_valid

    def test_unknown_entity_raises(self, db, draft_version):
        with pytest.raises(DistributionValidationError, match="Source entity"):
            compute_sum_validation(db, "nonexistent", draft_version.id)


class TestAssertSumWithin100:
    def test_passes_when_valid(self, db, graph, draft_version):
        result = assert_sum_within_100(
            db, "A", draft_version.id,
            candidate_destination_id="B", candidate_percentage=50.0,
        )
        assert result.is_valid

    def test_raises_when_over_100(self, db, graph, draft_version):
        with pytest.raises(DistributionValidationError, match="Sum rule"):
            assert_sum_within_100(
                db, "B", draft_version.id,
                candidate_destination_id="C", candidate_percentage=60.0,
            )


class TestAssertNoCycle:
    def test_passes_when_no_cycle(self, db, graph, draft_version):
        assert_no_cycle(db, "A", "B", draft_version.id)

    def test_raises_with_chain(self, db, graph, draft_version):
        db.add(Distribution(
            version_id=draft_version.id, source_entity_id="A",
            destination_entity_id="B", percentage=10.0,
        ))
        db.commit()
        with pytest.raises(DistributionValidationError) as ei:
            assert_no_cycle(db, "B", "A", draft_version.id)
        assert ei.value.cycle_chain is not None
        assert ei.value.cycle_chain[0] == "B"


# ---------------------------------------------------------------------------
# Edge CRUD (scoped to drafts)
# ---------------------------------------------------------------------------


class TestCreateDistributionEdge:
    def test_creates_edge_on_draft(self, db, graph, draft_version):
        edge = create_distribution_edge(
            db, version_id=draft_version.id,
            source_entity_id="A", destination_entity_id="B",
            percentage=20.0, rationale="initial 20% to B",
        )
        db.commit()
        assert edge.id is not None
        assert float(edge.percentage) == 20.0
        assert edge.rationale == "initial 20% to B"

    def test_rejects_active_version(self, db, graph):
        with pytest.raises(DistributionValidationError, match="immutable"):
            create_distribution_edge(
                db, version_id=graph["active"].id,
                source_entity_id="A", destination_entity_id="B", percentage=20.0,
            )

    def test_rejects_unknown_version(self, db, graph):
        with pytest.raises(DistributionValidationError, match="not found"):
            create_distribution_edge(
                db, version_id=99999,
                source_entity_id="A", destination_entity_id="B", percentage=20.0,
            )

    def test_rejects_unknown_source(self, db, draft_version):
        with pytest.raises(DistributionValidationError, match="Source entity"):
            create_distribution_edge(
                db, version_id=draft_version.id,
                source_entity_id="nope", destination_entity_id="B",
                percentage=20.0,
            )

    def test_rejects_unknown_destination(self, db, graph, draft_version):
        with pytest.raises(DistributionValidationError, match="Destination entity"):
            create_distribution_edge(
                db, version_id=draft_version.id,
                source_entity_id="A", destination_entity_id="nope",
                percentage=20.0,
            )

    def test_rejects_duplicate(self, db, graph, draft_version):
        create_distribution_edge(
            db, version_id=draft_version.id,
            source_entity_id="A", destination_entity_id="B", percentage=20.0,
        )
        db.commit()
        with pytest.raises(DistributionValidationError, match="already exists"):
            create_distribution_edge(
                db, version_id=draft_version.id,
                source_entity_id="A", destination_entity_id="B", percentage=15.0,
            )

    def test_rejects_cycle(self, db, graph, draft_version):
        create_distribution_edge(
            db, version_id=draft_version.id,
            source_entity_id="A", destination_entity_id="B", percentage=20.0,
        )
        db.commit()
        with pytest.raises(DistributionValidationError) as ei:
            create_distribution_edge(
                db, version_id=draft_version.id,
                source_entity_id="B", destination_entity_id="A",
                percentage=10.0,
            )
        assert "Cycle detected" in ei.value.message

    def test_rejects_sum_overflow(self, db, graph, draft_version):
        # B has to_business=50; adding 60% would push grand to 110.
        with pytest.raises(DistributionValidationError, match="Sum rule"):
            create_distribution_edge(
                db, version_id=draft_version.id,
                source_entity_id="B", destination_entity_id="C", percentage=60.0,
            )


class TestUpdateDistributionEdge:
    def test_updates_percentage(self, db, graph, draft_version):
        edge = create_distribution_edge(
            db, version_id=draft_version.id,
            source_entity_id="A", destination_entity_id="B", percentage=20.0,
        )
        db.commit()
        update_distribution_edge(db, edge.id, percentage=35.0)
        db.commit()
        refreshed = db.query(Distribution).filter_by(id=edge.id).first()
        assert float(refreshed.percentage) == 35.0

    def test_updates_rationale_when_opt_in(self, db, graph, draft_version):
        edge = create_distribution_edge(
            db, version_id=draft_version.id,
            source_entity_id="A", destination_entity_id="B",
            percentage=20.0, rationale="old",
        )
        db.commit()
        update_distribution_edge(
            db, edge.id, percentage=20.0, rationale="new", update_rationale=True,
        )
        db.commit()
        assert db.query(Distribution).filter_by(id=edge.id).first().rationale == "new"

    def test_does_not_clobber_rationale_when_opt_out(self, db, graph, draft_version):
        edge = create_distribution_edge(
            db, version_id=draft_version.id,
            source_entity_id="A", destination_entity_id="B",
            percentage=20.0, rationale="keep",
        )
        db.commit()
        update_distribution_edge(db, edge.id, percentage=25.0)
        db.commit()
        assert db.query(Distribution).filter_by(id=edge.id).first().rationale == "keep"

    def test_rejects_active_version(self, db, graph):
        db.add(Distribution(
            version_id=graph["active"].id, source_entity_id="A",
            destination_entity_id="B", percentage=10.0,
        ))
        db.commit()
        edge = db.query(Distribution).filter_by(version_id=graph["active"].id).first()
        with pytest.raises(DistributionValidationError, match="immutable"):
            update_distribution_edge(db, edge.id, percentage=20.0)

    def test_rejects_unknown_edge(self, db, draft_version):
        with pytest.raises(DistributionValidationError, match="not found"):
            update_distribution_edge(db, 99999, percentage=10.0)

    def test_rejects_sum_overflow(self, db, graph, draft_version):
        edge = create_distribution_edge(
            db, version_id=draft_version.id,
            source_entity_id="B", destination_entity_id="C", percentage=10.0,
        )
        db.commit()
        with pytest.raises(DistributionValidationError, match="Sum rule"):
            update_distribution_edge(db, edge.id, percentage=60.0)


class TestDeleteDistributionEdge:
    def test_deletes_on_draft(self, db, graph, draft_version):
        edge = create_distribution_edge(
            db, version_id=draft_version.id,
            source_entity_id="A", destination_entity_id="B", percentage=20.0,
        )
        db.commit()
        delete_distribution_edge(db, edge.id)
        db.commit()
        assert db.query(Distribution).filter_by(id=edge.id).first() is None

    def test_rejects_active_version(self, db, graph):
        db.add(Distribution(
            version_id=graph["active"].id, source_entity_id="A",
            destination_entity_id="B", percentage=10.0,
        ))
        db.commit()
        edge = db.query(Distribution).filter_by(version_id=graph["active"].id).first()
        with pytest.raises(DistributionValidationError, match="immutable"):
            delete_distribution_edge(db, edge.id)

    def test_rejects_unknown(self, db, draft_version):
        with pytest.raises(DistributionValidationError, match="not found"):
            delete_distribution_edge(db, 99999)


# ---------------------------------------------------------------------------
# update_to_business_pct
# ---------------------------------------------------------------------------


class TestUpdateToBusinessPct:
    def test_updates_field(self, db, graph, draft_version):
        update_to_business_pct(db, "A", new_pct=40.0, version_id=draft_version.id)
        db.commit()
        a = db.query(ChargeableEntity).filter_by(id="A").first()
        assert float(a.to_business_pct) == 40.0

    def test_rejects_active_version(self, db, graph):
        with pytest.raises(DistributionValidationError, match="immutable"):
            update_to_business_pct(
                db, "A", new_pct=40.0, version_id=graph["active"].id,
            )

    def test_rejects_unknown_entity(self, db, draft_version):
        with pytest.raises(DistributionValidationError, match="not found"):
            update_to_business_pct(
                db, "nope", new_pct=10.0, version_id=draft_version.id,
            )

    def test_rejects_when_sum_exceeds_100(self, db, graph, draft_version):
        create_distribution_edge(
            db, version_id=draft_version.id,
            source_entity_id="A", destination_entity_id="B", percentage=60.0,
        )
        db.commit()
        with pytest.raises(DistributionValidationError, match="Sum rule"):
            update_to_business_pct(
                db, "A", new_pct=50.0, version_id=draft_version.id,
            )


# ---------------------------------------------------------------------------
# Version diff per [F-S1-07]
# ---------------------------------------------------------------------------


@pytest.fixture
def two_versions_for_diff(db, graph):
    """Build two production versions for diff coverage:

    v1 (active, 2025-01-01): A→B 30%, B→C 20% (rationale='initial split')
    v2 (draft):              A→B 40% (rationale='retuned for 2026'),
                             A→C 10% (added),
                             B→C removed
    """
    v1 = graph["active"]
    db.add_all([
        Distribution(version_id=v1.id, source_entity_id="A",
                     destination_entity_id="B", percentage=30.0,
                     rationale="initial split"),
        Distribution(version_id=v1.id, source_entity_id="B",
                     destination_entity_id="C", percentage=20.0),
    ])
    v2 = DistributionVersion(status="draft", origin="copy_prior",
                             copied_from_version_id=v1.id, rationale="")
    db.add(v2)
    db.flush()
    db.add_all([
        Distribution(version_id=v2.id, source_entity_id="A",
                     destination_entity_id="B", percentage=40.0,
                     rationale="retuned for 2026"),
        Distribution(version_id=v2.id, source_entity_id="A",
                     destination_entity_id="C", percentage=10.0,
                     rationale="new edge"),
    ])
    db.commit()
    return {"v1": v1, "v2": v2}


class TestComputeVersionDiff:
    def test_added_removed_changed_buckets(self, db, graph, two_versions_for_diff):
        v1 = two_versions_for_diff["v1"]
        v2 = two_versions_for_diff["v2"]
        result = compute_version_diff(
            db, v2.id, compared_to_version_id=v1.id,
        )
        assert result.added_count == 1   # A→C
        assert result.removed_count == 1  # B→C
        assert result.changed_count == 1  # A→B
        assert len(result.changes) == 3

        added = next(c for c in result.changes if c.change_kind == "added")
        assert (added.source_entity_id, added.destination_entity_id) == ("A", "C")
        assert added.new_percentage == 10.0
        assert added.old_percentage is None
        assert added.new_rationale == "new edge"

        removed = next(c for c in result.changes if c.change_kind == "removed")
        assert (removed.source_entity_id, removed.destination_entity_id) == ("B", "C")
        assert removed.old_percentage == 20.0
        assert removed.new_percentage is None

        changed = next(c for c in result.changes if c.change_kind == "changed")
        assert (changed.source_entity_id, changed.destination_entity_id) == ("A", "B")
        assert changed.old_percentage == 30.0
        assert changed.new_percentage == 40.0
        assert changed.old_rationale == "initial split"
        assert changed.new_rationale == "retuned for 2026"

    def test_rationale_only_change_marked_changed(self, db, graph, draft_version):
        v1 = graph["active"]
        db.add(Distribution(
            version_id=v1.id, source_entity_id="A", destination_entity_id="B",
            percentage=20.0, rationale="old",
        ))
        db.add(Distribution(
            version_id=draft_version.id, source_entity_id="A",
            destination_entity_id="B", percentage=20.0, rationale="new",
        ))
        db.commit()
        r = compute_version_diff(
            db, draft_version.id, compared_to_version_id=v1.id,
        )
        assert r.changed_count == 1
        changed = r.changes[0]
        assert changed.old_rationale == "old"
        assert changed.new_rationale == "new"

    def test_no_changes_returns_empty(self, db, graph, draft_version):
        v1 = graph["active"]
        # Both versions empty.
        r = compute_version_diff(db, draft_version.id, compared_to_version_id=v1.id)
        assert r.changes == []
        assert r.added_count == 0
        assert r.removed_count == 0
        assert r.changed_count == 0

    def test_default_compared_to_prior_active(self, db, graph):
        # Build v2 active superseding v1; default compared_to should be v1.
        v1 = graph["active"]
        v2 = DistributionVersion(
            status="active", active_from=date(2026, 1, 1),
            rationale="2026 split", origin="copy_active",
            copied_from_version_id=v1.id,
        )
        db.add(v2)
        db.commit()
        r = compute_version_diff(db, v2.id)  # no compared_to → resolves default
        assert r.compared_to_version.id == v1.id

    def test_default_compared_to_for_first_ever_raises(self, db, graph):
        # The only active version has no prior — diff w/ default partner fails.
        with pytest.raises(DistributionValidationError, match="No default comparison"):
            compute_version_diff(db, graph["active"].id)


class TestResolveDefaultComparedTo:
    def test_picks_prior_by_active_from(self, db, graph):
        v1 = graph["active"]
        v2 = DistributionVersion(
            status="active", active_from=date(2026, 1, 1),
            rationale="2026", origin="copy_active",
            copied_from_version_id=v1.id,
        )
        db.add(v2)
        db.commit()
        partner = resolve_default_compared_to(db, v2)
        assert partner.id == v1.id

    def test_draft_partners_with_latest_active(self, db, graph):
        v_draft = DistributionVersion(status="draft", origin="blank", rationale="")
        db.add(v_draft)
        db.commit()
        partner = resolve_default_compared_to(db, v_draft)
        assert partner.id == graph["active"].id

    def test_scenario_uses_anchor(self, db, graph, seed_org_base):
        sc = Scenario(
            name="X", author_id=seed_org_base["person_ids"][0],
            anchor_distribution_version_id=graph["active"].id,
        )
        db.add(sc)
        db.flush()
        v_sc = DistributionVersion(
            scenario_id=sc.id, status="draft", origin="blank", rationale="",
        )
        db.add(v_sc)
        db.commit()
        partner = resolve_default_compared_to(db, v_sc)
        assert partner.id == graph["active"].id


# ---------------------------------------------------------------------------
# Service Workbench S1 — depth validation + chain_depth cache
# ---------------------------------------------------------------------------


def _seed_max_depth_param(db, value: int) -> PlanningParameter:
    """Insert (or update) the ``max_allocation_depth`` PlanningParameter row.

    The in-memory test DB does not run the seed, so any test that touches
    the depth validation path must seed this row explicitly.
    """
    existing = (
        db.query(PlanningParameter)
        .filter(PlanningParameter.key == "max_allocation_depth")
        .first()
    )
    if existing is not None:
        existing.current_value = str(value)
        db.commit()
        return existing
    p = PlanningParameter(
        key="max_allocation_depth",
        name="Max allocation depth",
        description="Maximum chain depth for Stage 1 distributions.",
        current_value=str(value),
        default_value="6",
        data_type="integer",
        param_group="limits",
    )
    db.add(p)
    db.commit()
    return p


@pytest.fixture
def deep_graph(db, graph):
    """Five additional entities (D, E, F, G, H) so depth tests can build
    chains of varying length without re-seeding ``graph``.

    All InternalServices with to_business=0 — they exist purely to act as
    pass-through nodes in the chain depth tests below.
    """
    extras = []
    for code in ("D", "E", "F", "G", "H"):
        extras.append(ChargeableEntity(
            id=code, entity_type="InternalService", identifier=f"ITDEEP{code}",
            name=code, to_business_pct=0.0, hierarchy_node_id="lob-1",
        ))
    db.add_all(extras)
    db.commit()
    return graph


class TestDepthValidation:
    """Service Workbench S1 — third save-time validation alongside cycle + sum.

    All tests seed ``max_allocation_depth`` explicitly via the helper since
    the in-memory test DB has no seed data.
    """

    def test_create_edge_rejects_when_exceeds_max_depth(
        self, db, deep_graph, draft_version,
    ):
        # max=3 means a chain of 3 edges (4 nodes) is allowed; a 4th edge
        # (5-node chain) must be rejected.
        _seed_max_depth_param(db, 3)

        # Build A → B → C → D (3 edges, 4 nodes — at the cap, OK).
        create_distribution_edge(
            db, version_id=draft_version.id,
            source_entity_id="A", destination_entity_id="B", percentage=10.0,
        )
        # B has to_business=50; cap a small percentage so the sum stays under.
        create_distribution_edge(
            db, version_id=draft_version.id,
            source_entity_id="B", destination_entity_id="C", percentage=10.0,
        )
        create_distribution_edge(
            db, version_id=draft_version.id,
            source_entity_id="C", destination_entity_id="D", percentage=10.0,
        )
        db.commit()

        # Adding D → E would make the chain 4 edges deep — over the cap.
        with pytest.raises(DistributionValidationError) as ei:
            create_distribution_edge(
                db, version_id=draft_version.id,
                source_entity_id="D", destination_entity_id="E", percentage=10.0,
            )
        assert "depth" in ei.value.message.lower()
        assert ei.value.violating_path is not None
        # Sample path is a concrete root-to-leaf walk of the offending graph.
        assert len(ei.value.violating_path) >= 5

    def test_create_edge_within_max_depth_succeeds(
        self, db, deep_graph, draft_version,
    ):
        _seed_max_depth_param(db, 6)
        # A 2-edge chain — well under the default cap.
        create_distribution_edge(
            db, version_id=draft_version.id,
            source_entity_id="A", destination_entity_id="B", percentage=10.0,
        )
        edge = create_distribution_edge(
            db, version_id=draft_version.id,
            source_entity_id="B", destination_entity_id="C", percentage=10.0,
        )
        db.commit()
        assert edge.id is not None

    def test_create_edge_recomputes_chain_depth(
        self, db, deep_graph, draft_version,
    ):
        _seed_max_depth_param(db, 6)
        # Single edge → chain_depth=1 (longest path through the edge is the
        # edge itself).
        edge = create_distribution_edge(
            db, version_id=draft_version.id,
            source_entity_id="A", destination_entity_id="B", percentage=10.0,
        )
        db.commit()
        refreshed = db.query(Distribution).filter_by(id=edge.id).first()
        assert refreshed.chain_depth == 1

        # Add A → C — second edge in a 2-leaf fan-out, each carries depth 1.
        edge2 = create_distribution_edge(
            db, version_id=draft_version.id,
            source_entity_id="A", destination_entity_id="C", percentage=10.0,
        )
        db.commit()
        assert db.query(Distribution).filter_by(id=edge2.id).first().chain_depth == 1

    def test_update_edge_recomputes_chain_depth(
        self, db, deep_graph, draft_version,
    ):
        _seed_max_depth_param(db, 6)
        e1 = create_distribution_edge(
            db, version_id=draft_version.id,
            source_entity_id="A", destination_entity_id="B", percentage=10.0,
        )
        e2 = create_distribution_edge(
            db, version_id=draft_version.id,
            source_entity_id="B", destination_entity_id="C", percentage=10.0,
        )
        db.commit()
        # Two-edge chain → both edges carry chain_depth=2.
        assert db.query(Distribution).filter_by(id=e1.id).first().chain_depth == 2
        assert db.query(Distribution).filter_by(id=e2.id).first().chain_depth == 2

        # Updating percentage doesn't change graph topology — depths stay 2
        # and the recompute hook simply re-stamps the same values.
        update_distribution_edge(db, e1.id, percentage=15.0)
        db.commit()
        assert db.query(Distribution).filter_by(id=e1.id).first().chain_depth == 2
        assert db.query(Distribution).filter_by(id=e2.id).first().chain_depth == 2

    def test_delete_edge_recomputes_chain_depth(
        self, db, deep_graph, draft_version,
    ):
        _seed_max_depth_param(db, 6)
        e1 = create_distribution_edge(
            db, version_id=draft_version.id,
            source_entity_id="A", destination_entity_id="B", percentage=10.0,
        )
        e2 = create_distribution_edge(
            db, version_id=draft_version.id,
            source_entity_id="B", destination_entity_id="C", percentage=10.0,
        )
        e3 = create_distribution_edge(
            db, version_id=draft_version.id,
            source_entity_id="C", destination_entity_id="D", percentage=10.0,
        )
        db.commit()
        # 3-edge chain → every edge carries chain_depth=3.
        assert db.query(Distribution).filter_by(id=e1.id).first().chain_depth == 3
        assert db.query(Distribution).filter_by(id=e2.id).first().chain_depth == 3

        # Delete the leaf edge C → D; remaining edges should drop to depth 2.
        delete_distribution_edge(db, e3.id)
        db.commit()
        assert db.query(Distribution).filter_by(id=e1.id).first().chain_depth == 2
        assert db.query(Distribution).filter_by(id=e2.id).first().chain_depth == 2

    def test_delete_edge_does_not_run_depth_assertion(
        self, db, deep_graph, draft_version,
    ):
        # Build a 3-deep chain at max=3.
        _seed_max_depth_param(db, 3)
        e1 = create_distribution_edge(
            db, version_id=draft_version.id,
            source_entity_id="A", destination_entity_id="B", percentage=10.0,
        )
        create_distribution_edge(
            db, version_id=draft_version.id,
            source_entity_id="B", destination_entity_id="C", percentage=10.0,
        )
        create_distribution_edge(
            db, version_id=draft_version.id,
            source_entity_id="C", destination_entity_id="D", percentage=10.0,
        )
        db.commit()

        # Lower the cap artificially so the existing graph is now "too deep".
        # A naive depth assertion on delete would falsely block this — but
        # delete can only shrink the graph, so we skip the assertion.
        _seed_max_depth_param(db, 1)
        # Deleting the root edge must succeed regardless of the lowered cap.
        delete_distribution_edge(db, e1.id)
        db.commit()
        assert db.query(Distribution).filter_by(id=e1.id).first() is None

    def test_to_business_pct_update_does_not_recompute_chain_depth(
        self, db, deep_graph, draft_version,
    ):
        _seed_max_depth_param(db, 6)
        e1 = create_distribution_edge(
            db, version_id=draft_version.id,
            source_entity_id="A", destination_entity_id="B", percentage=10.0,
        )
        e2 = create_distribution_edge(
            db, version_id=draft_version.id,
            source_entity_id="B", destination_entity_id="C", percentage=10.0,
        )
        db.commit()
        before_e1 = db.query(Distribution).filter_by(id=e1.id).first().chain_depth
        before_e2 = db.query(Distribution).filter_by(id=e2.id).first().chain_depth
        assert before_e1 == 2 and before_e2 == 2

        # to_business_pct doesn't affect graph topology and the spec says
        # the cache refresh is skipped for this entry point — values stay
        # untouched (i.e., the bulk updater was not called).
        update_to_business_pct(
            db, "A", new_pct=20.0, version_id=draft_version.id,
        )
        db.commit()
        assert (
            db.query(Distribution).filter_by(id=e1.id).first().chain_depth
            == before_e1
        )
        assert (
            db.query(Distribution).filter_by(id=e2.id).first().chain_depth
            == before_e2
        )

    def test_chain_depth_null_until_first_write(
        self, db, deep_graph, draft_version,
    ):
        _seed_max_depth_param(db, 6)
        # Insert an edge bypassing the service so chain_depth stays NULL
        # — mirrors the foundation-commit state where seeded edges have no
        # cached depth until the first service-mediated mutation in the
        # version repopulates the cache.
        raw_edge = Distribution(
            version_id=draft_version.id,
            source_entity_id="A", destination_entity_id="B",
            percentage=10.0,
        )
        db.add(raw_edge)
        db.commit()
        assert (
            db.query(Distribution).filter_by(id=raw_edge.id).first().chain_depth
            is None
        )

        # First service-mediated write triggers the bulk refresh; all edges
        # in the version (including the raw one) end up with chain_depth set.
        create_distribution_edge(
            db, version_id=draft_version.id,
            source_entity_id="B", destination_entity_id="C", percentage=10.0,
        )
        db.commit()
        assert (
            db.query(Distribution).filter_by(id=raw_edge.id).first().chain_depth
            == 2
        )


# ---------------------------------------------------------------------------
# Union-aware edge resolution (Simulator S3) — shared sandbox primitives
#
# These back the simulator's union-of-forked-vs-anchor cascade. They are the
# single source of truth reused by scenario_lever12 (impact preview) and the
# anchor-aware cascade_query / dag_resolver paths (editor reload).
# ---------------------------------------------------------------------------


class TestUnionEdgeHelpers:
    @pytest.fixture
    def union_world(self, db, graph):
        """Anchor: A→B 30, B→C 40. Sandbox: A forked, A→B edited to 50.

        So forked_sources = {A}: A reads from sandbox, B/C inherit anchor.
        """
        anchor = graph["active"]
        sandbox = DistributionVersion(
            active_from=None, status="draft", rationale="", origin="blank",
        )
        db.add(sandbox)
        db.flush()
        db.add_all([
            Distribution(version_id=anchor.id, source_entity_id="A",
                         destination_entity_id="B", percentage=30.0),
            Distribution(version_id=anchor.id, source_entity_id="B",
                         destination_entity_id="C", percentage=40.0),
            Distribution(version_id=sandbox.id, source_entity_id="A",
                         destination_entity_id="B", percentage=50.0),
        ])
        db.commit()
        return {"anchor": anchor.id, "sandbox": sandbox.id}

    def test_forked_sources(self, db, union_world):
        assert get_forked_sources(db, union_world["sandbox"]) == {"A"}

    def test_outgoing_forked_uses_sandbox(self, db, union_world):
        out = union_outgoing_edges(
            db, entity_id="A", scenario_version_id=union_world["sandbox"],
            anchor_version_id=union_world["anchor"],
        )
        assert len(out) == 1
        assert float(out[0].percentage) == 50.0

    def test_outgoing_unforked_falls_back_to_anchor(self, db, union_world):
        out = union_outgoing_edges(
            db, entity_id="B", scenario_version_id=union_world["sandbox"],
            anchor_version_id=union_world["anchor"],
        )
        assert len(out) == 1
        assert out[0].destination_entity_id == "C"
        assert float(out[0].percentage) == 40.0

    def test_incoming_prefers_sandbox_excludes_anchor_dup(self, db, union_world):
        # Into B: the sandbox A→B (50) wins; the anchor A→B (30) is excluded
        # because its source A is forked. No double-counting.
        inc = union_incoming_edges(
            db, entity_id="B", scenario_version_id=union_world["sandbox"],
            anchor_version_id=union_world["anchor"],
        )
        assert len(inc) == 1
        assert float(inc[0].percentage) == 50.0

    def test_incoming_unforked_source_uses_anchor(self, db, union_world):
        # Into C: source B is un-forked → the anchor B→C (40) is used.
        inc = union_incoming_edges(
            db, entity_id="C", scenario_version_id=union_world["sandbox"],
            anchor_version_id=union_world["anchor"],
        )
        assert len(inc) == 1
        assert inc[0].source_entity_id == "B"
        assert float(inc[0].percentage) == 40.0

    def test_no_anchor_returns_sandbox_only(self, db, union_world):
        # anchor=None disables fallback: un-forked B has no sandbox outgoing,
        # and C has no sandbox incoming.
        assert union_outgoing_edges(
            db, entity_id="B", scenario_version_id=union_world["sandbox"],
            anchor_version_id=None,
        ) == []
        assert union_incoming_edges(
            db, entity_id="C", scenario_version_id=union_world["sandbox"],
            anchor_version_id=None,
        ) == []
