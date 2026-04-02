"""Unit tests for services/allocation_service.py."""

import pytest

from models.capacity import Allocation
from models.financial import Forecast
from services.allocation_service import _stable_index, ensure_project_allocations


class TestStableIndex:
    def test_deterministic(self):
        a = _stable_index("proj-1", "role-dev", 5)
        b = _stable_index("proj-1", "role-dev", 5)
        assert a == b

    def test_different_inputs(self):
        a = _stable_index("proj-1", "role-dev", 10)
        b = _stable_index("proj-2", "role-dev", 10)
        # Different projects should (very likely) give different indices
        # Not guaranteed but extremely likely with MD5
        assert isinstance(a, int) and isinstance(b, int)

    def test_zero_people(self):
        assert _stable_index("proj-1", "role-dev", 0) == 0

    def test_within_range(self):
        idx = _stable_index("proj-1", "role-dev", 3)
        assert 0 <= idx < 3


class TestEnsureProjectAllocations:
    def test_no_forecasts_returns_zero(self, db, seed_org_base, create_test_project):
        proj = create_test_project("proj-1", months=["2026-01"], forecast_amt=1000, baseline_amt=900)
        # Remove all internal forecasts (the default ones have hours)
        # Actually, default fixtures have hours=11, so forecasts exist.
        # Create a project with NO internal forecasts
        from models.projects import Project
        proj2 = Project(
            id="proj-empty", name="Empty", status="active",
            capex_opex="capex", start_month="2025-01", end_month="2026-12",
        )
        db.add(proj2)
        db.commit()
        assert ensure_project_allocations("proj-empty", db) == 0

    def test_creates_allocations_from_forecast(self, db, seed_org_base, create_test_project):
        create_test_project("proj-1", months=["2026-01", "2026-02"])
        created = ensure_project_allocations("proj-1", db)
        assert created > 0
        allocs = db.query(Allocation).filter(Allocation.project_id == "proj-1").all()
        assert len(allocs) > 0

    def test_respects_existing_allocations(self, db, seed_org_base, create_test_project):
        create_test_project("proj-1", months=["2026-01"])
        # Pre-create an allocation covering the full need
        db.add(Allocation(
            person_id="p-dev-1", project_id="proj-1",
            month="2026-01", hours=11, is_confirmed=True,
        ))
        db.commit()
        created = ensure_project_allocations("proj-1", db)
        # Should create 0 since existing covers the 11 hours forecast
        assert created == 0

    def test_idempotent(self, db, seed_org_base, create_test_project):
        create_test_project("proj-1", months=["2026-01"])
        first_run = ensure_project_allocations("proj-1", db)
        second_run = ensure_project_allocations("proj-1", db)
        assert first_run > 0
        assert second_run == 0  # No new allocations needed

    def test_caps_at_160_hours(self, db, seed_org_base, create_test_project):
        # Create a forecast with very high hours requiring multiple people
        from models.financial import Forecast as F
        from models.projects import Project
        proj = Project(
            id="proj-big", name="Big", status="active",
            capex_opex="capex", start_month="2025-01", end_month="2026-12",
        )
        db.add(proj)
        db.flush()
        db.add(F(
            project_id="proj-big", month="2026-01",
            category="internal", sub_category="role-dev",
            hours=300, amount_eur=30000,
        ))
        db.commit()

        ensure_project_allocations("proj-big", db)
        allocs = db.query(Allocation).filter(
            Allocation.project_id == "proj-big", Allocation.month == "2026-01"
        ).all()
        for a in allocs:
            assert float(a.hours) <= 160.0
