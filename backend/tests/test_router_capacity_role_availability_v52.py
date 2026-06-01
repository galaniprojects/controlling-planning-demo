"""Integration tests for v5.2 W1 enhancements to /api/capacity/role-availability.

Per spec §13.10:
  * Add ``competing_demand_count`` per role-per-month — count of pending
    resource requests from OTHER projects (excluding the requesting PL's
    own project IDs).
  * Add ``location_summary[]`` array when ``location_id`` is omitted —
    one entry per location with ``total_headcount`` + ``avg_availability_pct``.

Privacy boundary (§13.8): no person names, no project names, no PL names,
no CC names. Tests assert these fields stay absent in the new payload too.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest


HEADERS_PL = {"X-Current-User": "persona-pl"}
HEADERS_CTRL = {"X-Current-User": "persona-controller"}


@pytest.fixture
def seed_competing_demand(db, seed_org_base, seed_personas):
    """Seed two projects (one owned by the PL, one not) and pending resource
    requests against role-dev so we can verify the PL's own requests are
    excluded from the competing count."""
    from models.capacity import Allocation, ResourceRequest
    from models.organization import CostCenter, Location
    from models.people import Person, RoleType
    from models.projects import Project

    # Add Budapest location for location_summary tests
    bud = Location(id="loc-bud", city="Budapest", country="Hungary")
    cc_bud = CostCenter(
        id="cc-bud-dev", name="Budapest Development",
        location_id="loc-bud", competence_center_id="comp-dev",
    )
    p_bud = Person(
        id="p-bud-dev", name="Bud Dev",
        role_type_id="role-dev", cost_center_id="cc-bud-dev",
        competence_center_id="comp-dev",
    )
    db.add_all([bud, cc_bud, p_bud])

    # PL persona owns proj-alpha and proj-beta (per conftest seed_personas)
    proj_alpha = Project(
        id="proj-alpha", name="Alpha (PL's own)", pipeline_stage="Active",
        capex_opex="capex", start_month="2026-01", end_month="2026-12",
        pl_person_id="p-pm-1",
    )
    proj_beta = Project(
        id="proj-beta", name="Beta (PL's own)", pipeline_stage="Active",
        capex_opex="capex", start_month="2026-01", end_month="2026-12",
        pl_person_id="p-pm-1",
    )
    proj_other = Project(
        id="proj-other-1", name="Other PL's project", pipeline_stage="Active",
        capex_opex="capex", start_month="2026-01", end_month="2026-12",
    )
    proj_other_2 = Project(
        id="proj-other-2", name="Yet Another", pipeline_stage="Active",
        capex_opex="capex", start_month="2026-01", end_month="2026-12",
    )
    db.add_all([proj_alpha, proj_beta, proj_other, proj_other_2])
    db.flush()

    # Pending requests against role-dev / loc-muc / 2026-04:
    #   * 2 requests from OTHER projects → competing_demand_count = 2 for PL
    #   * 1 request from PL's own project → excluded for PL, included for non-PL
    db.add_all([
        ResourceRequest(
            project_id="proj-other-1", cost_center_id="cc-muc-dev",
            request_type="resource", role_type_id="role-dev",
            hours_or_amount_per_month=80,
            period_start="2026-04", period_end="2026-04",
            priority="high", status="pending",
        ),
        ResourceRequest(
            project_id="proj-other-2", cost_center_id="cc-muc-dev",
            request_type="resource", role_type_id="role-dev",
            hours_or_amount_per_month=40,
            period_start="2026-04", period_end="2026-04",
            priority="medium", status="pending",
        ),
        ResourceRequest(
            project_id="proj-alpha", cost_center_id="cc-muc-dev",
            request_type="resource", role_type_id="role-dev",
            hours_or_amount_per_month=120,
            period_start="2026-04", period_end="2026-04",
            priority="high", status="pending",
        ),
    ])

    # Some allocations so the row exists for the (role, location, month) cell
    db.add_all([
        Allocation(person_id="p-dev-1", project_id="proj-alpha",
                   month="2026-04", hours=80, is_confirmed=True),
        Allocation(person_id="p-bud-dev", project_id="proj-alpha",
                   month="2026-04", hours=40, is_confirmed=True),
    ])
    db.commit()
    return {}


# ---------------------------------------------------------------------------
# competing_demand_count
# ---------------------------------------------------------------------------

@patch("routers.capacity.DEMO_DATE", "2026-04")
class TestCompetingDemandCount:
    def test_field_present_in_response(self, test_client, seed_competing_demand):
        resp = test_client.get(
            "/api/capacity/role-availability"
            "?month_from=2026-04&month_to=2026-04",
            headers=HEADERS_PL,
        )
        assert resp.status_code == 200
        data = resp.json()
        for row in data["items"]:
            assert "competing_demand_count" in row, \
                f"row missing competing_demand_count field: {row}"
            assert isinstance(row["competing_demand_count"], int)
            assert row["competing_demand_count"] >= 0

    def test_pl_sees_competing_count_excluding_own_projects(
        self, test_client, seed_competing_demand,
    ):
        """PL has 2 other-project requests + 1 own-project request against
        role-dev/loc-muc/2026-04. The PL view should report 2 (own excluded)."""
        resp = test_client.get(
            "/api/capacity/role-availability"
            "?role_type_id=role-dev&location_id=loc-muc"
            "&month_from=2026-04&month_to=2026-04",
            headers=HEADERS_PL,
        )
        assert resp.status_code == 200
        data = resp.json()
        rows = data["items"]
        muc_dev = next(
            r for r in rows
            if r["role_type_id"] == "role-dev"
               and r["location_id"] == "loc-muc"
               and r["month"] == "2026-04"
        )
        assert muc_dev["competing_demand_count"] == 2, \
            f"expected 2 competing requests (other PLs only), got " \
            f"{muc_dev['competing_demand_count']}"

    def test_no_competing_demand_when_no_pending_requests(
        self, test_client, seed_org_base, seed_personas,
    ):
        """Empty-state: zero pending requests → competing_demand_count == 0."""
        resp = test_client.get(
            "/api/capacity/role-availability"
            "?month_from=2026-04&month_to=2026-04",
            headers=HEADERS_PL,
        )
        assert resp.status_code == 200
        data = resp.json()
        for row in data["items"]:
            assert row.get("competing_demand_count", 0) == 0


# ---------------------------------------------------------------------------
# location_summary[]
# ---------------------------------------------------------------------------

@patch("routers.capacity.DEMO_DATE", "2026-04")
class TestLocationSummary:
    def test_present_when_location_id_omitted(
        self, test_client, seed_competing_demand,
    ):
        """Per §13.10: location_summary appears only on all-locations queries."""
        resp = test_client.get(
            "/api/capacity/role-availability"
            "?month_from=2026-04&month_to=2026-04",
            headers=HEADERS_PL,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "location_summary" in data
        assert isinstance(data["location_summary"], list)
        assert len(data["location_summary"]) >= 2  # Munich + Budapest
        for entry in data["location_summary"]:
            assert "location_id" in entry
            assert "location_name" in entry
            assert "total_headcount" in entry
            assert "avg_availability_pct" in entry
            assert isinstance(entry["total_headcount"], int)
            assert isinstance(entry["avg_availability_pct"], (int, float))

    def test_absent_or_empty_when_location_filter_applied(
        self, test_client, seed_competing_demand,
    ):
        """Per §13.10: when location_id is provided, location_summary is
        either omitted or returned as an empty list (the side panel section
        only renders for all-locations queries)."""
        resp = test_client.get(
            "/api/capacity/role-availability"
            "?location_id=loc-muc&month_from=2026-04&month_to=2026-04",
            headers=HEADERS_PL,
        )
        assert resp.status_code == 200
        data = resp.json()
        # Either omitted or empty list — both are acceptable signals that the
        # all-locations section is not active.
        ls = data.get("location_summary")
        assert ls is None or ls == []

    def test_munich_headcount_correct(self, test_client, seed_competing_demand):
        """seed_org_base has 3 Munich people (p-dev-1, p-dev-2, p-pm-1) — the
        Munich entry's total_headcount should match."""
        resp = test_client.get(
            "/api/capacity/role-availability"
            "?month_from=2026-04&month_to=2026-04",
            headers=HEADERS_PL,
        )
        data = resp.json()
        muc = next(
            (e for e in data.get("location_summary", [])
             if e["location_id"] == "loc-muc"),
            None,
        )
        assert muc is not None
        assert muc["total_headcount"] == 3


# ---------------------------------------------------------------------------
# Privacy boundary still holds with the new fields
# ---------------------------------------------------------------------------

@patch("routers.capacity.DEMO_DATE", "2026-04")
class TestPrivacyStillEnforced:
    """Even with the new fields, no person/project/PL/CC names leak."""

    def test_no_person_or_project_names_in_payload(
        self, test_client, seed_competing_demand,
    ):
        resp = test_client.get(
            "/api/capacity/role-availability"
            "?month_from=2026-04&month_to=2026-04",
            headers=HEADERS_PL,
        )
        body = resp.text
        for forbidden in (
            "Dev One", "Dev Two", "PM One", "Bud Dev",
            "Alpha", "Beta", "Other PL",
        ):
            assert forbidden not in body, (
                f"sensitive name '{forbidden}' leaked into role-availability "
                f"response"
            )
