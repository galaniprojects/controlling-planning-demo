"""Tests for the ``run`` block added to ``GET /api/portfolio/kpis`` (VIPER Wave 4).

Coverage:
1. ``compute_run_selector_metrics`` unit tests — correct aggregation against ORM
   data inserted directly in the test DB.
2. Router-level integration — ``GET /api/portfolio/kpis`` carries a ``run`` key
   with the expected shape and values.
3. Isolation guard — ``compute_portfolio_kpis`` output does NOT carry a ``run``
   key; the block is injected only at the router layer.
"""

from __future__ import annotations

import pytest

from models.charging import ChargeableEntity
from services.portfolio_service import compute_portfolio_kpis, compute_run_selector_metrics


HEADERS_CTRL = {"X-Current-User": "persona-controller"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _add_entity(db, eid: str, entity_type: str, annual_cost, is_active: bool = True):
    """Insert a minimal ChargeableEntity row."""
    ent = ChargeableEntity(
        id=eid,
        entity_type=entity_type,
        identifier=f"ID-{eid}",
        name=f"Entity {eid}",
        annual_cost=annual_cost,
        is_active=is_active,
    )
    db.add(ent)
    db.commit()
    return ent


# ---------------------------------------------------------------------------
# Unit tests: compute_run_selector_metrics
# ---------------------------------------------------------------------------

class TestComputeRunSelectorMetrics:
    def test_empty_db_returns_zero_counts(self, db):
        """No ChargeableEntity rows -> entity_count 0, annual_cost_total 0.0."""
        result = compute_run_selector_metrics(db)
        assert result == {"entity_count": 0, "annual_cost_total": 0.0}

    def test_counts_offerings_and_internal_services(self, db):
        """Offerings and InternalServices are both counted."""
        _add_entity(db, "off-1", "Offering", 100_000.0)
        _add_entity(db, "svc-1", "InternalService", 200_000.0)
        result = compute_run_selector_metrics(db)
        assert result["entity_count"] == 2
        assert result["annual_cost_total"] == 300_000.0

    def test_excludes_project_type_entities(self, db):
        """Project-type ChargeableEntity rows are NOT counted in the Run block."""
        _add_entity(db, "off-1", "Offering", 150_000.0)
        _add_entity(db, "ce-proj", "Project", 999_999.0)  # must be excluded
        result = compute_run_selector_metrics(db)
        assert result["entity_count"] == 1
        assert result["annual_cost_total"] == 150_000.0

    def test_excludes_inactive_entities(self, db):
        """Soft-deleted (is_active=False) entities are excluded."""
        _add_entity(db, "off-active", "Offering", 80_000.0, is_active=True)
        _add_entity(db, "off-deleted", "Offering", 50_000.0, is_active=False)
        result = compute_run_selector_metrics(db)
        assert result["entity_count"] == 1
        assert result["annual_cost_total"] == 80_000.0

    def test_null_annual_cost_treated_as_zero(self, db):
        """NULL annual_cost via COALESCE contributes 0 to the sum."""
        _add_entity(db, "off-nocost", "Offering", None)
        _add_entity(db, "svc-1", "InternalService", 120_000.0)
        result = compute_run_selector_metrics(db)
        assert result["entity_count"] == 2
        assert result["annual_cost_total"] == 120_000.0

    def test_annual_cost_total_rounded_to_2_decimals(self, db):
        """annual_cost_total is rounded to exactly 2 decimal places."""
        _add_entity(db, "off-1", "Offering", 333.333)
        _add_entity(db, "off-2", "Offering", 333.333)
        _add_entity(db, "off-3", "Offering", 333.333)
        result = compute_run_selector_metrics(db)
        # raw sum = 999.999, rounds to 1000.0
        assert result["annual_cost_total"] == round(999.999, 2)

    def test_return_types(self, db):
        """entity_count is int; annual_cost_total is float."""
        _add_entity(db, "off-1", "Offering", 50_000.0)
        result = compute_run_selector_metrics(db)
        assert isinstance(result["entity_count"], int)
        assert isinstance(result["annual_cost_total"], float)

    def test_matches_direct_orm_aggregation(self, db):
        """Helper result matches what a direct ORM query returns (cross-check)."""
        from sqlalchemy import func
        _add_entity(db, "off-1", "Offering", 980_000.0)
        _add_entity(db, "svc-2", "InternalService", 400_000.0)
        _add_entity(db, "svc-inactive", "InternalService", 100_000.0, is_active=False)
        _add_entity(db, "ce-proj", "Project", 250_000.0)

        result = compute_run_selector_metrics(db)

        # Direct ORM cross-check
        row = (
            db.query(
                func.count(ChargeableEntity.id).label("cnt"),
                func.coalesce(func.sum(ChargeableEntity.annual_cost), 0).label("total"),
            )
            .filter(
                ChargeableEntity.entity_type.in_(["Offering", "InternalService"]),
                ChargeableEntity.is_active.is_(True),
            )
            .one()
        )
        assert result["entity_count"] == int(row.cnt)
        assert result["annual_cost_total"] == round(float(row.total), 2)


# ---------------------------------------------------------------------------
# Integration tests: GET /api/portfolio/kpis carries the run block
# ---------------------------------------------------------------------------

class TestPortfolioKpisRunBlock:
    def test_run_block_present_and_shaped_correctly(
        self, test_client, seed_personas, create_test_project, db
    ):
        """``GET /api/portfolio/kpis`` carries a ``run`` object with the correct
        keys and value types when Run entities are present (the empty case is
        covered separately by ``test_run_block_zero_when_no_run_entities``)."""
        create_test_project("proj-1", pipeline_stage="Active")
        _add_entity(db, "off-eunify", "Offering", 980_000.0)
        resp = test_client.get("/api/portfolio/kpis", headers=HEADERS_CTRL)
        assert resp.status_code == 200
        data = resp.json()

        assert "run" in data, "Missing 'run' key in /portfolio/kpis response"
        run = data["run"]
        assert set(run) == {"entity_count", "annual_cost_total"}
        assert isinstance(run["entity_count"], int)
        assert isinstance(run["annual_cost_total"], (int, float))
        assert run["entity_count"] == 1

    def test_run_block_zero_when_no_run_entities(
        self, test_client, seed_personas, create_test_project, db
    ):
        """With no Offerings / InternalServices seeded, the run block is zeros."""
        create_test_project("proj-1", pipeline_stage="Active")
        resp = test_client.get("/api/portfolio/kpis", headers=HEADERS_CTRL)
        assert resp.status_code == 200
        run = resp.json()["run"]
        assert run["entity_count"] == 0
        assert run["annual_cost_total"] == 0.0

    def test_run_block_values_match_seeded_entities(
        self, test_client, seed_personas, create_test_project, db
    ):
        """run block values match a direct ORM aggregation over the same data."""
        create_test_project("proj-1", pipeline_stage="Active")
        _add_entity(db, "off-eunify", "Offering", 980_000.0)
        _add_entity(db, "svc-cloud", "InternalService", 400_000.0)
        _add_entity(db, "off-retired", "Offering", 250_000.0, is_active=False)

        resp = test_client.get("/api/portfolio/kpis", headers=HEADERS_CTRL)
        assert resp.status_code == 200
        run = resp.json()["run"]

        # Only 2 active Offering/InternalService entities should be counted
        assert run["entity_count"] == 2
        assert run["annual_cost_total"] == 980_000.0 + 400_000.0

    def test_run_block_excludes_project_type_entities(
        self, test_client, seed_personas, create_test_project, db
    ):
        """Project-type ChargeableEntity rows do not inflate the run block."""
        create_test_project("proj-1", pipeline_stage="Active")
        _add_entity(db, "off-1", "Offering", 500_000.0)
        _add_entity(db, "ce-proj", "Project", 999_000.0)

        resp = test_client.get("/api/portfolio/kpis", headers=HEADERS_CTRL)
        assert resp.status_code == 200
        run = resp.json()["run"]

        assert run["entity_count"] == 1
        assert run["annual_cost_total"] == 500_000.0

    def test_existing_kpi_fields_unchanged(
        self, test_client, seed_personas, create_test_project, db
    ):
        """Existing top-level KPI fields are still present after adding run block."""
        create_test_project("proj-1", pipeline_stage="Active")
        resp = test_client.get("/api/portfolio/kpis", headers=HEADERS_CTRL)
        assert resp.status_code == 200
        data = resp.json()

        expected_keys = {
            "baseline", "current_forecast", "ytd_actuals",
            "plan_drift_amount", "plan_drift_pct",
            "capex_total", "opex_total", "capex_pct", "opex_pct",
            "run_total", "change_total", "run_pct", "change_pct",
            "lifetime_baseline", "lifetime_forecast", "lifetime_actuals",
            "active_project_count",
        }
        for key in expected_keys:
            assert key in data, f"Expected key '{key}' missing from /portfolio/kpis"


# ---------------------------------------------------------------------------
# Isolation guard: compute_portfolio_kpis must NOT carry a run key
# ---------------------------------------------------------------------------

class TestComputePortfolioKpisIsolation:
    def test_compute_portfolio_kpis_has_no_run_key(self, db, seed_org_base):
        """The shared compute_portfolio_kpis helper must remain unmodified.

        The ``run`` block is injected only at the router layer; the shared
        function output must not carry it, so Launchpad and module-card KPI
        callers are unaffected.
        """
        result = compute_portfolio_kpis(db)
        assert "run" not in result, (
            "compute_portfolio_kpis returned a 'run' key — this function is "
            "shared by Launchpad and module-card callers and must NOT include "
            "the run block. Add it only at the router layer."
        )

    def test_compute_portfolio_kpis_change_scoped_has_no_run_key(self, db, seed_org_base):
        """Same isolation check with population='change' filter applied."""
        result = compute_portfolio_kpis(db, {"population": "change"})
        assert "run" not in result
