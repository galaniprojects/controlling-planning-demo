"""Tests for the VIPER §7 (Wave 3) run-entity / cumulative-cost block on the
project-summary payload (``GET /api/portfolio/projects/{id}/summary``).

The block is populated server-side from ``Project.run_entity_id`` ->
``ChargeableEntity`` and ``Project.handover_month``:

- ``run_entity``: id / name / identifier / annual_cost of the related entity.
- ``handover_year``: fiscal year of ``handover_month`` (falls back to the
  current fiscal year when no handover month is recorded).
- ``cumulative_since_handover``: ``annual_cost * (current_fy - handover_year + 1)``
  — annual cost held flat, inclusive of both endpoint years (demo-grade).

The test DB is the in-memory fixture DB (not the production seed), so we
construct projects + a ChargeableEntity directly, mirroring the seed values
called out in the Wave 3 brief (``off-eunify`` / IT00S118 / €980.000).
DEMO_DATE is patched to "2026-04" so ``current_fiscal_year()`` == 2026.
"""

from unittest.mock import patch

import pytest

from models.charging import ChargeableEntity
from models.projects import Project


HEADERS_CTRL = {"X-Current-User": "persona-controller"}


@pytest.fixture
def run_entity_offering(db):
    """Insert the 'Enterprise Unified Workspace' Offering (mirrors off-eunify)."""
    ent = ChargeableEntity(
        id="off-eunify",
        entity_type="Offering",
        identifier="IT00S118",
        name="Enterprise Unified Workspace",
        annual_cost=980000.00,
    )
    db.add(ent)
    db.commit()
    return ent


@patch("services.calendar.DEMO_DATE", "2026-04")
@patch("services.portfolio_service.DEMO_DATE", "2026-04")
@patch("routers.portfolio.DEMO_DATE", "2026-04")
class TestRunEntityBlock:
    def test_handed_over_project_populates_block(
        self, test_client, seed_personas, create_test_project, db, run_entity_offering
    ):
        """A handed-over project surfaces the run-entity block + cumulative cost."""
        create_test_project("proj-iam-run", pipeline_stage="Run entity spawned")
        proj = db.query(Project).filter(Project.id == "proj-iam-run").first()
        proj.run_entity_id = "off-eunify"
        proj.handover_month = "2025-09"
        db.commit()

        resp = test_client.get(
            "/api/portfolio/projects/proj-iam-run/summary", headers=HEADERS_CTRL
        )
        assert resp.status_code == 200
        data = resp.json()

        assert data["run_entity"] is not None
        assert data["run_entity"]["id"] == "off-eunify"
        assert data["run_entity"]["name"] == "Enterprise Unified Workspace"
        assert data["run_entity"]["identifier"] == "IT00S118"
        assert data["run_entity"]["annual_cost"] == 980000.0

        # handover 2025-09 -> FY 2025; current FY 2026 -> span (2026-2025+1)=2
        assert data["handover_year"] == 2025
        assert data["cumulative_since_handover"] == 980000.0 * 2
        assert data["cumulative_since_handover"] == 1960000.0

    def test_non_handed_over_project_leaves_block_null(
        self, test_client, seed_personas, create_test_project, db
    ):
        """A project with no run_entity_id leaves all three fields None."""
        create_test_project("proj-cloud3-run", pipeline_stage="Completed")

        resp = test_client.get(
            "/api/portfolio/projects/proj-cloud3-run/summary", headers=HEADERS_CTRL
        )
        assert resp.status_code == 200
        data = resp.json()

        assert data["run_entity"] is None
        assert data["cumulative_since_handover"] is None
        assert data["handover_year"] is None

    def test_handover_in_current_year_multiplier_is_one(
        self, test_client, seed_personas, create_test_project, db, run_entity_offering
    ):
        """Handover within the current fiscal year -> span of exactly one year."""
        create_test_project("proj-iam-run", pipeline_stage="Run entity spawned")
        proj = db.query(Project).filter(Project.id == "proj-iam-run").first()
        proj.run_entity_id = "off-eunify"
        proj.handover_month = "2026-02"  # FY 2026 == current FY
        db.commit()

        resp = test_client.get(
            "/api/portfolio/projects/proj-iam-run/summary", headers=HEADERS_CTRL
        )
        assert resp.status_code == 200
        data = resp.json()

        assert data["handover_year"] == 2026
        # span = (2026 - 2026 + 1) = 1
        assert data["cumulative_since_handover"] == 980000.0

    def test_missing_handover_month_falls_back_to_current_fy(
        self, test_client, seed_personas, create_test_project, db, run_entity_offering
    ):
        """No handover month recorded -> handover_year defaults to current FY."""
        create_test_project("proj-iam-run", pipeline_stage="Run entity spawned")
        proj = db.query(Project).filter(Project.id == "proj-iam-run").first()
        proj.run_entity_id = "off-eunify"
        proj.handover_month = None
        db.commit()

        resp = test_client.get(
            "/api/portfolio/projects/proj-iam-run/summary", headers=HEADERS_CTRL
        )
        assert resp.status_code == 200
        data = resp.json()

        assert data["handover_year"] == 2026
        assert data["cumulative_since_handover"] == 980000.0  # span 1

    def test_run_entity_with_null_annual_cost_omits_cumulative(
        self, test_client, seed_personas, create_test_project, db
    ):
        """A run entity with no annual_cost surfaces the block but no cumulative."""
        ent = ChargeableEntity(
            id="off-nocost",
            entity_type="Offering",
            identifier="IT00S999",
            name="Costless Offering",
            annual_cost=None,
        )
        db.add(ent)
        db.commit()

        create_test_project("proj-iam-run", pipeline_stage="Run entity spawned")
        proj = db.query(Project).filter(Project.id == "proj-iam-run").first()
        proj.run_entity_id = "off-nocost"
        proj.handover_month = "2025-09"
        db.commit()

        resp = test_client.get(
            "/api/portfolio/projects/proj-iam-run/summary", headers=HEADERS_CTRL
        )
        assert resp.status_code == 200
        data = resp.json()

        assert data["run_entity"] is not None
        assert data["run_entity"]["annual_cost"] is None
        assert data["handover_year"] == 2025
        # No annual_cost -> cannot compute cumulative.
        assert data["cumulative_since_handover"] is None

    @pytest.mark.parametrize(
        "handover_month,expected_year,expected_span",
        [
            ("2024-01", 2024, 3),  # 2026-2024+1
            ("2025-06", 2025, 2),  # 2026-2025+1
            ("2026-12", 2026, 1),  # 2026-2026+1
        ],
    )
    def test_cumulative_arithmetic_across_handover_years(
        self,
        test_client,
        seed_personas,
        create_test_project,
        db,
        run_entity_offering,
        handover_month,
        expected_year,
        expected_span,
    ):
        """Cumulative = annual_cost * (current_fy - handover_year + 1)."""
        create_test_project("proj-iam-run", pipeline_stage="Run entity spawned")
        proj = db.query(Project).filter(Project.id == "proj-iam-run").first()
        proj.run_entity_id = "off-eunify"
        proj.handover_month = handover_month
        db.commit()

        resp = test_client.get(
            "/api/portfolio/projects/proj-iam-run/summary", headers=HEADERS_CTRL
        )
        assert resp.status_code == 200
        data = resp.json()

        assert data["handover_year"] == expected_year
        assert data["cumulative_since_handover"] == 980000.0 * expected_span

    def test_future_handover_month_clamps_span_to_one(
        self, test_client, seed_personas, create_test_project, db, run_entity_offering
    ):
        """A handover month in a future fiscal year must not produce a zero or
        negative cumulative — the span is clamped to >= 1."""
        create_test_project("proj-iam-run", pipeline_stage="Run entity spawned")
        proj = db.query(Project).filter(Project.id == "proj-iam-run").first()
        proj.run_entity_id = "off-eunify"
        proj.handover_month = "2028-03"  # FY 2028 > current FY 2026 -> raw span -1
        db.commit()

        resp = test_client.get(
            "/api/portfolio/projects/proj-iam-run/summary", headers=HEADERS_CTRL
        )
        assert resp.status_code == 200
        data = resp.json()

        assert data["handover_year"] == 2028
        # max(1, 2026 - 2028 + 1) == 1
        assert data["cumulative_since_handover"] == 980000.0

    def test_project_type_run_entity_leaves_block_null(
        self, test_client, seed_personas, create_test_project, db
    ):
        """Read-side guard: a run_entity_id pointing to a Project-type entity
        (which the write path forbids) must not render the block."""
        ent = ChargeableEntity(
            id="ce-proj-type",
            entity_type="Project",
            identifier="IT012345",
            name="Some Project Entity",
            annual_cost=500000.00,
        )
        db.add(ent)
        db.commit()

        create_test_project("proj-iam-run", pipeline_stage="Run entity spawned")
        proj = db.query(Project).filter(Project.id == "proj-iam-run").first()
        proj.run_entity_id = "ce-proj-type"
        proj.handover_month = "2025-09"
        db.commit()

        resp = test_client.get(
            "/api/portfolio/projects/proj-iam-run/summary", headers=HEADERS_CTRL
        )
        assert resp.status_code == 200
        data = resp.json()

        assert data["run_entity"] is None
        assert data["cumulative_since_handover"] is None
        assert data["handover_year"] is None
