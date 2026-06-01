"""Integration tests for v5 Session E2 PL capacity role-availability endpoint.

Per [E-06a]. Verifies aggregation correctness and asserts NO person names
appear in the response payload (PLs see role-level aggregates only).
"""

from __future__ import annotations

from unittest.mock import patch

import pytest


HEADERS_CTRL = {"X-Current-User": "persona-controller"}
HEADERS_PL = {"X-Current-User": "persona-pl"}
HEADERS_CCO = {"X-Current-User": "persona-cc-owner"}
HEADERS_EXEC = {"X-Current-User": "persona-exec"}


@pytest.fixture
def seed_capacity(db, seed_org_base, seed_personas):
    """Add a second location and a third role-type to exercise grouping."""
    from models.capacity import Allocation
    from models.organization import CostCenter, CompetenceCenter, Location
    from models.people import Person, RoleType
    from models.projects import Project

    # Add a second location + cost center
    bud = Location(id="loc-bud", city="Budapest", country="Hungary")
    cc_bud = CostCenter(
        id="cc-bud-dev", name="Budapest Development",
        location_id="loc-bud", competence_center_id="comp-dev",
    )
    db.add_all([bud, cc_bud])

    # New role type and people
    role_qa = RoleType(id="role-qa", name="QA Engineer")
    db.add(role_qa)
    p_dev_bud = Person(
        id="p-dev-bud", name="Bud Dev",
        role_type_id="role-dev", cost_center_id="cc-bud-dev",
        competence_center_id="comp-dev",
    )
    p_qa = Person(
        id="p-qa-1", name="QA One",
        role_type_id="role-qa", cost_center_id="cc-muc-dev",
        competence_center_id="comp-dev",
    )
    db.add_all([p_dev_bud, p_qa])

    # A project so allocations can FK to it
    proj = Project(
        id="proj-cap-test", name="Capacity Test",
        pipeline_stage="Active", capex_opex="capex",
        start_month="2026-01", end_month="2026-12",
    )
    db.add(proj)
    db.flush()

    # Allocations: April 2026 only
    # 2 Munich devs allocated 80h each, Budapest dev 40h, QA 0h
    db.add_all([
        Allocation(person_id="p-dev-1", project_id="proj-cap-test",
                   month="2026-04", hours=80, is_confirmed=True),
        Allocation(person_id="p-dev-2", project_id="proj-cap-test",
                   month="2026-04", hours=80, is_confirmed=True),
        Allocation(person_id="p-dev-bud", project_id="proj-cap-test",
                   month="2026-04", hours=40, is_confirmed=True),
        # May 2026 — pm-1 fully booked
        Allocation(person_id="p-pm-1", project_id="proj-cap-test",
                   month="2026-05", hours=160, is_confirmed=True),
    ])
    db.commit()
    return {"proj": proj}


# ---------------------------------------------------------------------------
# Shape + role gating
# ---------------------------------------------------------------------------

@patch("routers.capacity.DEMO_DATE", "2026-04")
class TestRoleAvailabilityShape:
    def test_basic_response_shape(self, test_client, seed_capacity):
        resp = test_client.get(
            "/api/capacity/role-availability?month_from=2026-04&month_to=2026-04",
            headers=HEADERS_PL,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "total" in data
        assert "months" in data
        assert data["months"] == ["2026-04"]
        for row in data["items"]:
            assert "role_type_id" in row
            assert "role_type_name" in row
            assert "location_id" in row
            assert "location_name" in row
            assert "month" in row
            assert "headcount" in row
            assert "standard_hours" in row
            assert "allocated_hours" in row
            assert "available_hours" in row
            assert "utilization_pct" in row

    def test_pl_can_read(self, test_client, seed_capacity):
        resp = test_client.get(
            "/api/capacity/role-availability?month_from=2026-04&month_to=2026-04",
            headers=HEADERS_PL,
        )
        assert resp.status_code == 200

    def test_controller_can_read(self, test_client, seed_capacity):
        resp = test_client.get(
            "/api/capacity/role-availability?month_from=2026-04&month_to=2026-04",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200

    def test_cc_owner_can_read(self, test_client, seed_capacity):
        resp = test_client.get(
            "/api/capacity/role-availability?month_from=2026-04&month_to=2026-04",
            headers=HEADERS_CCO,
        )
        assert resp.status_code == 200

    def test_executive_can_read(self, test_client, seed_capacity):
        resp = test_client.get(
            "/api/capacity/role-availability?month_from=2026-04&month_to=2026-04",
            headers=HEADERS_EXEC,
        )
        assert resp.status_code == 200

    def test_no_auth(self, test_client, seed_capacity):
        resp = test_client.get("/api/capacity/role-availability")
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# CRITICAL: no person names in the response
# ---------------------------------------------------------------------------

@patch("routers.capacity.DEMO_DATE", "2026-04")
class TestNoPersonNames:
    """Per [E-06a]: PLs must NOT see individual person identifiers or names."""

    def test_no_person_id_field(self, test_client, seed_capacity):
        resp = test_client.get(
            "/api/capacity/role-availability?month_from=2026-04&month_to=2026-04",
            headers=HEADERS_PL,
        )
        for row in resp.json()["items"]:
            assert "person_id" not in row
            assert "person_name" not in row
            assert "name" not in row
            assert "assigned_person_id" not in row

    def test_known_person_names_absent_from_payload(self, test_client, seed_capacity):
        """No string in the response should match a seeded person's display name."""
        resp = test_client.get(
            "/api/capacity/role-availability?month_from=2026-04&month_to=2026-04",
            headers=HEADERS_PL,
        )
        body = resp.text
        for forbidden in ("Dev One", "Dev Two", "PM One", "Bud Dev", "QA One"):
            assert forbidden not in body, \
                f"Person name '{forbidden}' leaked into role-availability payload"

    def test_no_person_names_for_controller_either(self, test_client, seed_capacity):
        """Same shape across roles per the plan: even controllers receive aggregates."""
        resp = test_client.get(
            "/api/capacity/role-availability?month_from=2026-04&month_to=2026-04",
            headers=HEADERS_CTRL,
        )
        body = resp.text
        for forbidden in ("Dev One", "Dev Two", "PM One", "Bud Dev", "QA One"):
            assert forbidden not in body


# ---------------------------------------------------------------------------
# Aggregation correctness
# ---------------------------------------------------------------------------

@patch("routers.capacity.DEMO_DATE", "2026-04")
class TestRoleAvailabilityAggregation:
    def test_munich_dev_aggregate(self, test_client, seed_capacity):
        resp = test_client.get(
            "/api/capacity/role-availability?month_from=2026-04&month_to=2026-04",
            headers=HEADERS_PL,
        )
        rows = {
            (r["role_type_id"], r["location_id"], r["month"]): r
            for r in resp.json()["items"]
        }
        # Munich devs: p-dev-1 + p-dev-2 = 2 people, 80h + 80h = 160h
        muc_dev = rows[("role-dev", "loc-muc", "2026-04")]
        assert muc_dev["headcount"] == 2
        assert muc_dev["allocated_hours"] == 160.0
        assert muc_dev["standard_hours"] == 320.0  # 2 × 160 FTE
        assert muc_dev["available_hours"] == 160.0
        assert muc_dev["utilization_pct"] == 50.0

    def test_budapest_dev_aggregate(self, test_client, seed_capacity):
        resp = test_client.get(
            "/api/capacity/role-availability?month_from=2026-04&month_to=2026-04",
            headers=HEADERS_PL,
        )
        rows = {
            (r["role_type_id"], r["location_id"], r["month"]): r
            for r in resp.json()["items"]
        }
        bud_dev = rows[("role-dev", "loc-bud", "2026-04")]
        assert bud_dev["headcount"] == 1
        assert bud_dev["allocated_hours"] == 40.0
        assert bud_dev["available_hours"] == 120.0
        assert bud_dev["utilization_pct"] == 25.0

    def test_qa_zero_allocation(self, test_client, seed_capacity):
        resp = test_client.get(
            "/api/capacity/role-availability?month_from=2026-04&month_to=2026-04",
            headers=HEADERS_PL,
        )
        rows = {
            (r["role_type_id"], r["location_id"], r["month"]): r
            for r in resp.json()["items"]
        }
        qa = rows[("role-qa", "loc-muc", "2026-04")]
        assert qa["headcount"] == 1
        assert qa["allocated_hours"] == 0.0
        assert qa["utilization_pct"] == 0.0

    def test_full_month_range(self, test_client, seed_capacity):
        resp = test_client.get(
            "/api/capacity/role-availability?month_from=2026-04&month_to=2026-05",
            headers=HEADERS_PL,
        )
        data = resp.json()
        assert data["months"] == ["2026-04", "2026-05"]
        # 2 months × (3 role-location combos for dev + qa + pm) ...
        # role-dev × loc-muc, role-dev × loc-bud, role-qa × loc-muc, role-pm × loc-muc = 4 cells × 2 months = 8 rows
        assert data["total"] == 8

    def test_pm_full_in_may(self, test_client, seed_capacity):
        resp = test_client.get(
            "/api/capacity/role-availability?month_from=2026-05&month_to=2026-05",
            headers=HEADERS_PL,
        )
        rows = {
            (r["role_type_id"], r["location_id"], r["month"]): r
            for r in resp.json()["items"]
        }
        pm = rows[("role-pm", "loc-muc", "2026-05")]
        assert pm["allocated_hours"] == 160.0
        assert pm["available_hours"] == 0.0
        assert pm["utilization_pct"] == 100.0


# ---------------------------------------------------------------------------
# Filters
# ---------------------------------------------------------------------------

@patch("routers.capacity.DEMO_DATE", "2026-04")
class TestRoleAvailabilityFilters:
    def test_location_filter(self, test_client, seed_capacity):
        resp = test_client.get(
            "/api/capacity/role-availability?location_id=loc-muc&month_from=2026-04&month_to=2026-04",
            headers=HEADERS_PL,
        )
        rows = resp.json()["items"]
        assert all(r["location_id"] == "loc-muc" for r in rows)

    def test_role_filter(self, test_client, seed_capacity):
        resp = test_client.get(
            "/api/capacity/role-availability?role_type_id=role-dev&month_from=2026-04&month_to=2026-04",
            headers=HEADERS_PL,
        )
        rows = resp.json()["items"]
        assert all(r["role_type_id"] == "role-dev" for r in rows)
        assert len(rows) == 2  # munich + budapest

    def test_combined_filters(self, test_client, seed_capacity):
        resp = test_client.get(
            "/api/capacity/role-availability"
            "?location_id=loc-bud&role_type_id=role-dev"
            "&month_from=2026-04&month_to=2026-04",
            headers=HEADERS_PL,
        )
        rows = resp.json()["items"]
        assert len(rows) == 1
        assert rows[0]["role_type_id"] == "role-dev"
        assert rows[0]["location_id"] == "loc-bud"

    def test_invalid_month_range(self, test_client, seed_capacity):
        resp = test_client.get(
            "/api/capacity/role-availability"
            "?month_from=2026-12&month_to=2026-01",
            headers=HEADERS_PL,
        )
        assert resp.status_code == 400

    def test_default_month_range(self, test_client, seed_capacity):
        # No month params — defaults to DEMO_DATE + 2 months
        resp = test_client.get(
            "/api/capacity/role-availability",
            headers=HEADERS_PL,
        )
        assert resp.status_code == 200
        # Default is 3 months (current + next 2)
        data = resp.json()
        assert len(data["months"]) == 3
