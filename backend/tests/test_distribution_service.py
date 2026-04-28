"""Unit tests for the Stage 1 distribution service (v5 Session F2 [F-S1-02..05])."""

from __future__ import annotations

import pytest

from models.charging import ChargeableEntity, Distribution
from models.organization import GroupingEntity, GroupingEntityType
from services.distribution_service import (
    DistributionValidationError,
    assert_no_cycle,
    assert_sum_within_100,
    compute_sum_validation,
    create_distribution_edge,
    delete_distribution_edge,
    is_known_version,
    update_distribution_edge,
    update_to_business_pct,
)


@pytest.fixture
def graph(db):
    """Three-entity graph: A (no to_business), B (50% to_business), C (no edges)."""
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
    db.commit()
    return {"a": a, "b": b, "c": c}


# ---------------------------------------------------------------------------
# is_known_version
# ---------------------------------------------------------------------------


class TestIsKnownVersion:
    def test_baseline_recognised(self):
        assert is_known_version("baseline")
    def test_forecast_recognised(self):
        assert is_known_version("forecast")
    def test_actuals_recognised(self):
        assert is_known_version("actuals")
    def test_scenario_prefix_recognised(self):
        assert is_known_version("scenario-42")
    def test_unknown_returns_false(self):
        assert not is_known_version("nonsense")


# ---------------------------------------------------------------------------
# Sum-rule validation
# ---------------------------------------------------------------------------


class TestComputeSumValidation:
    def test_empty_state_is_valid(self, db, graph):
        result = compute_sum_validation(db, "A", 2026, "forecast")
        assert result.is_valid
        assert result.distribution_total_pct == 0.0
        assert result.self_retained_pct == 100.0

    def test_with_existing_edges_below_cap(self, db, graph):
        db.add(Distribution(
            year=2026, version="forecast",
            source_entity_id="A", destination_entity_id="B", percentage=30.0,
        ))
        db.commit()
        result = compute_sum_validation(db, "A", 2026, "forecast")
        assert result.distribution_total_pct == 30.0
        assert result.self_retained_pct == 70.0
        assert result.is_valid

    def test_to_business_plus_distributions_sum(self, db, graph):
        # B has to_business=50; add 30% more — grand=80, self=20.
        db.add(Distribution(
            year=2026, version="forecast",
            source_entity_id="B", destination_entity_id="C", percentage=30.0,
        ))
        db.commit()
        result = compute_sum_validation(db, "B", 2026, "forecast")
        assert result.to_business_pct == 50.0
        assert result.distribution_total_pct == 30.0
        assert result.grand_total_pct == 80.0
        assert result.self_retained_pct == 20.0

    def test_candidate_destination_simulates_create(self, db, graph):
        # Currently A has 0 edges; simulate adding a 60% edge.
        result = compute_sum_validation(
            db, "A", 2026, "forecast",
            candidate_destination_id="B", candidate_percentage=60.0,
        )
        assert result.distribution_total_pct == 60.0
        assert result.is_valid

    def test_candidate_to_business_simulates_update(self, db, graph):
        # B has to_business=50; simulate raising to 110.
        result = compute_sum_validation(
            db, "B", 2026, "forecast", candidate_to_business_pct=110.0,
        )
        assert result.grand_total_pct == 110.0
        assert not result.is_valid

    def test_unknown_entity_raises(self, db, graph):
        with pytest.raises(DistributionValidationError, match="Source entity"):
            compute_sum_validation(db, "nonexistent", 2026, "forecast")


class TestAssertSumWithin100:
    def test_passes_when_valid(self, db, graph):
        result = assert_sum_within_100(
            db, "A", 2026, "forecast",
            candidate_destination_id="B", candidate_percentage=50.0,
        )
        assert result.is_valid

    def test_raises_when_over_100(self, db, graph):
        with pytest.raises(DistributionValidationError, match="Sum rule violation"):
            assert_sum_within_100(
                db, "B", 2026, "forecast",
                candidate_destination_id="C", candidate_percentage=60.0,
            )


# ---------------------------------------------------------------------------
# Cycle assertion
# ---------------------------------------------------------------------------


class TestAssertNoCycle:
    def test_passes_when_no_cycle(self, db, graph):
        # Empty graph — adding any edge is safe.
        assert_no_cycle(db, "A", "B", 2026, "forecast")

    def test_raises_with_chain_payload(self, db, graph):
        # A -> B already exists; B -> A would close a cycle.
        db.add(Distribution(
            year=2026, version="forecast",
            source_entity_id="A", destination_entity_id="B", percentage=10.0,
        ))
        db.commit()
        with pytest.raises(DistributionValidationError) as ei:
            assert_no_cycle(db, "B", "A", 2026, "forecast")
        assert ei.value.cycle_chain is not None
        assert ei.value.cycle_chain[0] == "B"
        assert "A" in ei.value.cycle_chain


# ---------------------------------------------------------------------------
# Edge create / update / delete
# ---------------------------------------------------------------------------


class TestCreateDistributionEdge:
    def test_creates_edge(self, db, graph):
        edge = create_distribution_edge(
            db, year=2026, version="forecast",
            source_entity_id="A", destination_entity_id="B", percentage=20.0,
        )
        db.commit()
        assert edge.id is not None
        assert float(edge.percentage) == 20.0

    def test_rejects_unknown_source(self, db, graph):
        with pytest.raises(DistributionValidationError, match="Source entity"):
            create_distribution_edge(
                db, year=2026, version="forecast",
                source_entity_id="nope", destination_entity_id="B",
                percentage=20.0,
            )

    def test_rejects_unknown_destination(self, db, graph):
        with pytest.raises(DistributionValidationError, match="Destination entity"):
            create_distribution_edge(
                db, year=2026, version="forecast",
                source_entity_id="A", destination_entity_id="nope",
                percentage=20.0,
            )

    def test_rejects_duplicate_edge(self, db, graph):
        create_distribution_edge(
            db, year=2026, version="forecast",
            source_entity_id="A", destination_entity_id="B", percentage=20.0,
        )
        db.commit()
        with pytest.raises(DistributionValidationError, match="already exists"):
            create_distribution_edge(
                db, year=2026, version="forecast",
                source_entity_id="A", destination_entity_id="B", percentage=15.0,
            )

    def test_rejects_cycle_creation(self, db, graph):
        create_distribution_edge(
            db, year=2026, version="forecast",
            source_entity_id="A", destination_entity_id="B", percentage=20.0,
        )
        db.commit()
        with pytest.raises(DistributionValidationError) as ei:
            create_distribution_edge(
                db, year=2026, version="forecast",
                source_entity_id="B", destination_entity_id="A",
                percentage=10.0,
            )
        assert "Cycle detected" in ei.value.message

    def test_rejects_when_sum_exceeds_100(self, db, graph):
        # B has to_business=50; adding a 60% edge would push grand to 110.
        with pytest.raises(DistributionValidationError, match="Sum rule"):
            create_distribution_edge(
                db, year=2026, version="forecast",
                source_entity_id="B", destination_entity_id="C", percentage=60.0,
            )


class TestUpdateDistributionEdge:
    def test_updates_percentage(self, db, graph):
        edge = create_distribution_edge(
            db, year=2026, version="forecast",
            source_entity_id="A", destination_entity_id="B", percentage=20.0,
        )
        db.commit()
        update_distribution_edge(db, edge.id, percentage=35.0)
        db.commit()
        refreshed = db.query(Distribution).filter_by(id=edge.id).first()
        assert float(refreshed.percentage) == 35.0

    def test_rejects_unknown_edge(self, db, graph):
        with pytest.raises(DistributionValidationError, match="not found"):
            update_distribution_edge(db, 99999, percentage=10.0)

    def test_rejects_when_update_violates_sum(self, db, graph):
        edge = create_distribution_edge(
            db, year=2026, version="forecast",
            source_entity_id="B", destination_entity_id="C", percentage=10.0,
        )
        db.commit()
        # B has to_business=50; raising the only edge to 60 would push grand=110.
        with pytest.raises(DistributionValidationError, match="Sum rule"):
            update_distribution_edge(db, edge.id, percentage=60.0)


class TestDeleteDistributionEdge:
    def test_deletes_existing(self, db, graph):
        edge = create_distribution_edge(
            db, year=2026, version="forecast",
            source_entity_id="A", destination_entity_id="B", percentage=20.0,
        )
        db.commit()
        delete_distribution_edge(db, edge.id)
        db.commit()
        assert db.query(Distribution).filter_by(id=edge.id).first() is None

    def test_rejects_unknown(self, db, graph):
        with pytest.raises(DistributionValidationError, match="not found"):
            delete_distribution_edge(db, 99999)


# ---------------------------------------------------------------------------
# update_to_business_pct
# ---------------------------------------------------------------------------


class TestUpdateToBusinessPct:
    def test_updates_field(self, db, graph):
        update_to_business_pct(db, "A", new_pct=40.0, year=2026, version="forecast")
        db.commit()
        a = db.query(ChargeableEntity).filter_by(id="A").first()
        assert float(a.to_business_pct) == 40.0

    def test_rejects_unknown_entity(self, db, graph):
        with pytest.raises(DistributionValidationError, match="not found"):
            update_to_business_pct(
                db, "nope", new_pct=10.0, year=2026, version="forecast",
            )

    def test_rejects_when_sum_exceeds_100(self, db, graph):
        # Add a 60% edge first.
        create_distribution_edge(
            db, year=2026, version="forecast",
            source_entity_id="A", destination_entity_id="B", percentage=60.0,
        )
        db.commit()
        # Now raising A's to_business to 50 would push grand to 110.
        with pytest.raises(DistributionValidationError, match="Sum rule"):
            update_to_business_pct(db, "A", new_pct=50.0, year=2026, version="forecast")
