"""Integration tests for v5.2 W5 group-by-project endpoint (spec §10).

GET /api/capacity/projects returns one row per visible project with three
child collections (assigned people, unfulfilled slots, external costs) plus
per-month fulfillment metrics.

Authorization (per spec §15):
  * Controller / Executive / CC Owner — full access.
  * Project Lead                       — 403 Forbidden.

Scope rule (§10.12): scope filters which PROJECTS appear, not which people
within a project. Per-project rows always include all allocated people
regardless of CC.
"""

from __future__ import annotations

import pytest


HEADERS_CTRL = {"X-Current-User": "persona-controller"}
HEADERS_CCO = {"X-Current-User": "persona-cc-owner"}
HEADERS_EXEC = {"X-Current-User": "persona-exec"}
HEADERS_PL = {"X-Current-User": "persona-pl"}


# ---------------------------------------------------------------------------
# Fixture: three projects with different fulfillment states + an external cost
# ---------------------------------------------------------------------------

@pytest.fixture
def seed_projects(db, seed_org_base, seed_personas):
    """Three projects exercising the §10 row types and fulfillment math.

    Window expected: months covering 2026-04..2026-06.

      * proj-low   — 1 resource RR (role-dev, 80h/mo, 2026-04..05) with no
                     assignments → fulfillment_pct = 0.
      * proj-high  — 1 resource RR (role-dev, 80h/mo, 2026-04..05) fully
                     assigned (160h via 2 month rows) + an Allocation per
                     month. fulfillment_pct = 100.
      * proj-mid   — 1 resource RR (80h/mo, 2026-04..05), assignments cover
                     month 1 only → fulfillment_pct = 50; one external_cost
                     RR (€200/mo, 2026-04..06).
      * proj-other — ONLY allocations (no RRs) for a person at a different
                     location, used to test §10.12 scope filtering.
    """
    from datetime import datetime
    from models.capacity import (
        Allocation, ResourceRequest, ResourceRequestAssignment,
    )
    from models.financial import ExternalCostType
    from models.organization import CostCenter, Location
    from models.people import Person, RoleType
    from models.projects import Project

    # Second location/CC + person at it (for scope filter test).
    loc_bud = Location(id="loc-bud", city="Budapest", country="Hungary")
    cc_bud = CostCenter(
        id="cc-bud-dev", name="Budapest Development",
        location_id="loc-bud", competence_center_id="comp-dev",
    )
    person_bud = Person(
        id="p-bud-1", name="Bud One",
        role_type_id="role-dev", cost_center_id="cc-bud-dev",
        competence_center_id="comp-dev",
    )

    cost_type = ExternalCostType(id="ect-software", name="Software License")

    proj_low = Project(
        id="proj-low", name="Low Fulfillment",
        status="pending_cc_confirmation",
        capex_opex="capex", start_month="2026-01", end_month="2026-12",
        pl_person_id="p-pm-1",
    )
    proj_high = Project(
        id="proj-high", name="High Fulfillment",
        status="active",
        capex_opex="capex", start_month="2026-01", end_month="2026-12",
        pl_person_id="p-pm-1",
    )
    proj_mid = Project(
        id="proj-mid", name="Mid Fulfillment",
        status="active",
        capex_opex="capex", start_month="2026-01", end_month="2026-12",
        pl_person_id="p-pm-1",
    )
    proj_other = Project(
        id="proj-other", name="Other Location Project",
        status="active",
        capex_opex="capex", start_month="2026-01", end_month="2026-12",
    )

    db.add_all([
        loc_bud, cc_bud, person_bud, cost_type,
        proj_low, proj_high, proj_mid, proj_other,
    ])
    db.flush()

    rrs = [
        # proj-low: 80h/mo for Apr-May (= 160h total) — no assignments.
        ResourceRequest(
            id=2001, project_id="proj-low", cost_center_id="cc-muc-dev",
            request_type="resource", role_type_id="role-dev",
            hours_or_amount_per_month=80,
            period_start="2026-04", period_end="2026-05",
            priority="medium", status="pending",
        ),
        # proj-high: 80h/mo for Apr-May, fully assigned.
        ResourceRequest(
            id=2010, project_id="proj-high", cost_center_id="cc-muc-dev",
            request_type="resource", role_type_id="role-dev",
            hours_or_amount_per_month=80,
            period_start="2026-04", period_end="2026-05",
            priority="medium", status="confirmed",
        ),
        # proj-mid: 80h/mo for Apr-May, half assigned (only Apr).
        ResourceRequest(
            id=2020, project_id="proj-mid", cost_center_id="cc-muc-dev",
            request_type="resource", role_type_id="role-dev",
            hours_or_amount_per_month=80,
            period_start="2026-04", period_end="2026-05",
            priority="high", status="partially_fulfilled",
        ),
        # proj-mid: external cost €200/mo Apr-Jun.
        ResourceRequest(
            id=2021, project_id="proj-mid", cost_center_id="cc-muc-dev",
            request_type="external_cost", cost_type_id="ect-software",
            hours_or_amount_per_month=200,
            period_start="2026-04", period_end="2026-06",
            priority="medium", status="pending",
            explanation="License renewal",
        ),
    ]
    db.add_all(rrs)
    db.flush()

    # Assignments (multi-person split friendly: each row = one person/month).
    db.add_all([
        # proj-high: full coverage via p-dev-1 (80h × 2 months).
        ResourceRequestAssignment(
            resource_request_id=2010, month="2026-04",
            person_id="p-dev-1", hours=80,
        ),
        ResourceRequestAssignment(
            resource_request_id=2010, month="2026-05",
            person_id="p-dev-1", hours=80,
        ),
        # proj-mid: only Apr is covered (and only by 80h via two people = 40+40).
        ResourceRequestAssignment(
            resource_request_id=2020, month="2026-04",
            person_id="p-dev-1", hours=40,
        ),
        ResourceRequestAssignment(
            resource_request_id=2020, month="2026-04",
            person_id="p-dev-2", hours=40,
        ),
    ])

    # Allocations (drive the assigned-person rows + total utilization layer).
    db.add_all([
        # p-dev-1 on proj-high (80h Apr/May).
        Allocation(
            person_id="p-dev-1", project_id="proj-high",
            month="2026-04", hours=80,
        ),
        Allocation(
            person_id="p-dev-1", project_id="proj-high",
            month="2026-05", hours=80,
        ),
        # p-dev-1 also on proj-mid for Apr (40h) — tests dual-layer math.
        Allocation(
            person_id="p-dev-1", project_id="proj-mid",
            month="2026-04", hours=40,
        ),
        # p-dev-2 on proj-mid for Apr (40h).
        Allocation(
            person_id="p-dev-2", project_id="proj-mid",
            month="2026-04", hours=40,
        ),
        # p-bud-1 on proj-other (Apr) — different CC. Visible only at scope=all
        # or scope=location:loc-bud.
        Allocation(
            person_id="p-bud-1", project_id="proj-other",
            month="2026-04", hours=80,
        ),
    ])
    db.commit()

    return {
        "default_window": ("2026-04", "2026-09"),
    }


# ---------------------------------------------------------------------------
# Authorization
# ---------------------------------------------------------------------------

class TestProjectsAuthorization:
    def test_controller_200(self, test_client, seed_projects):
        resp = test_client.get(
            "/api/capacity/projects?start=2026-04&end=2026-06",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200, resp.text

    def test_executive_200(self, test_client, seed_projects):
        resp = test_client.get(
            "/api/capacity/projects?start=2026-04&end=2026-06",
            headers=HEADERS_EXEC,
        )
        assert resp.status_code == 200

    def test_cc_owner_200(self, test_client, seed_projects):
        resp = test_client.get(
            "/api/capacity/projects?start=2026-04&end=2026-06",
            headers=HEADERS_CCO,
        )
        assert resp.status_code == 200

    def test_pl_403(self, test_client, seed_projects):
        resp = test_client.get(
            "/api/capacity/projects?start=2026-04&end=2026-06",
            headers=HEADERS_PL,
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Response shape
# ---------------------------------------------------------------------------

class TestProjectsShape:
    def test_envelope(self, test_client, seed_projects):
        resp = test_client.get(
            "/api/capacity/projects?start=2026-04&end=2026-06",
            headers=HEADERS_CTRL,
        )
        data = resp.json()
        assert {"items", "total", "scope", "start", "end", "reference_max_hours"} <= data.keys()
        assert data["scope"] == "all"
        assert data["start"] == "2026-04"
        assert data["end"] == "2026-06"
        assert isinstance(data["items"], list)
        assert data["total"] == len(data["items"])

    def test_item_shape(self, test_client, seed_projects):
        resp = test_client.get(
            "/api/capacity/projects?start=2026-04&end=2026-06",
            headers=HEADERS_CTRL,
        )
        items = {it["project_id"]: it for it in resp.json()["items"]}
        # All four projects with allocations or RRs should appear at scope=all.
        assert "proj-low" in items
        assert "proj-high" in items
        assert "proj-mid" in items
        # proj-other has only allocations — still visible at scope=all.
        assert "proj-other" in items

        item = items["proj-mid"]
        assert {"project_id", "project_name", "hierarchy_node_name",
                "pl_name", "fulfillment_pct", "fully_assigned_request_count",
                "total_request_count", "monthly_demand", "assigned_people",
                "unfulfilled_slots", "external_costs"} <= item.keys()


# ---------------------------------------------------------------------------
# Fulfillment math
# ---------------------------------------------------------------------------

class TestProjectsFulfillment:
    def test_zero_fulfillment(self, test_client, seed_projects):
        resp = test_client.get(
            "/api/capacity/projects?start=2026-04&end=2026-06",
            headers=HEADERS_CTRL,
        )
        items = {it["project_id"]: it for it in resp.json()["items"]}
        low = items["proj-low"]
        assert low["fulfillment_pct"] == 0.0
        assert low["fully_assigned_request_count"] == 0
        assert low["total_request_count"] == 1
        # All months in the request period should appear as unfulfilled slots.
        assert len(low["unfulfilled_slots"]) == 1
        slot = low["unfulfilled_slots"][0]
        assert slot["status"] == "pending"
        assert slot["role_type_id"] == "role-dev"

    def test_full_fulfillment(self, test_client, seed_projects):
        resp = test_client.get(
            "/api/capacity/projects?start=2026-04&end=2026-06",
            headers=HEADERS_CTRL,
        )
        items = {it["project_id"]: it for it in resp.json()["items"]}
        high = items["proj-high"]
        assert high["fulfillment_pct"] == 100.0
        assert high["fully_assigned_request_count"] == 1
        assert high["total_request_count"] == 1
        # Confirmed RRs are not surfaced as unfulfilled slots.
        assert high["unfulfilled_slots"] == []
        # Assigned-person row should appear with this_project_hours == 80.
        assert len(high["assigned_people"]) == 1
        ap = high["assigned_people"][0]
        assert ap["person_id"] == "p-dev-1"
        m_apr = next(m for m in ap["monthly"] if m["month"] == "2026-04")
        assert m_apr["this_project_hours"] == 80.0

    def test_partial_fulfillment(self, test_client, seed_projects):
        resp = test_client.get(
            "/api/capacity/projects?start=2026-04&end=2026-06",
            headers=HEADERS_CTRL,
        )
        items = {it["project_id"]: it for it in resp.json()["items"]}
        mid = items["proj-mid"]
        # 1 of 2 months covered → 50%.
        assert mid["fulfillment_pct"] == 50.0
        # The single resource RR is not fully assigned across all months.
        assert mid["fully_assigned_request_count"] == 0
        # Should appear in unfulfilled_slots since status='partially_fulfilled'.
        assert len(mid["unfulfilled_slots"]) == 1
        # External cost should appear in the external_costs collection.
        assert len(mid["external_costs"]) == 1
        ec = mid["external_costs"][0]
        assert ec["cost_type_label"] == "Software License"
        assert ec["period_start"] == "2026-04"
        assert ec["period_end"] == "2026-06"

    def test_dual_layer_total_utilization(self, test_client, seed_projects):
        """§10.4: assigned-person row carries total_utilization_pct (across
        all projects) for the faded background layer."""
        resp = test_client.get(
            "/api/capacity/projects?start=2026-04&end=2026-06",
            headers=HEADERS_CTRL,
        )
        items = {it["project_id"]: it for it in resp.json()["items"]}
        # p-dev-1 on proj-high in Apr has 80h on this project but 120h total
        # (80 proj-high + 40 proj-mid). With std hours = 160, that's 75%.
        ap = next(a for a in items["proj-high"]["assigned_people"]
                  if a["person_id"] == "p-dev-1")
        m_apr = next(m for m in ap["monthly"] if m["month"] == "2026-04")
        assert m_apr["this_project_hours"] == 80.0
        assert m_apr["total_hours_all_projects"] == 120.0
        assert m_apr["total_utilization_pct"] == 75.0

    def test_reference_max_hours(self, test_client, seed_projects):
        resp = test_client.get(
            "/api/capacity/projects?start=2026-04&end=2026-06",
            headers=HEADERS_CTRL,
        )
        # Each project requests 80h/mo (single dev), so the global max
        # across visible projects in any month should be 80.
        assert resp.json()["reference_max_hours"] == 80.0


# ---------------------------------------------------------------------------
# Sort order (§10.9): fulfillment % asc, then project name alpha
# ---------------------------------------------------------------------------

class TestProjectsSort:
    def test_least_staffed_first(self, test_client, seed_projects):
        resp = test_client.get(
            "/api/capacity/projects?start=2026-04&end=2026-06",
            headers=HEADERS_CTRL,
        )
        items = resp.json()["items"]
        order = [it["project_id"] for it in items]
        # proj-low = 0%, proj-mid = 50%, proj-high = 100%, proj-other = 100%
        # (no RRs → counted as fully assigned). proj-other comes after
        # proj-high alphabetically among the 100% group.
        assert order.index("proj-low") < order.index("proj-mid")
        assert order.index("proj-mid") < order.index("proj-high")
        assert order.index("proj-high") < order.index("proj-other")


# ---------------------------------------------------------------------------
# Scope filtering (§10.12)
# ---------------------------------------------------------------------------

class TestProjectsScope:
    def test_scope_location_filters_projects(self, test_client, seed_projects):
        resp = test_client.get(
            "/api/capacity/projects?scope=location:loc-bud&start=2026-04&end=2026-06",
            headers=HEADERS_CTRL,
        )
        items = {it["project_id"] for it in resp.json()["items"]}
        # Only proj-other has an allocation by a Budapest person.
        assert "proj-other" in items
        assert "proj-low" not in items
        assert "proj-high" not in items

    def test_scope_cost_center_filters_projects(self, test_client, seed_projects):
        resp = test_client.get(
            "/api/capacity/projects?scope=cost_center:cc-muc-dev&start=2026-04&end=2026-06",
            headers=HEADERS_CTRL,
        )
        items = {it["project_id"] for it in resp.json()["items"]}
        # All three Munich-CC projects are visible.
        assert items >= {"proj-low", "proj-high", "proj-mid"}
        # Budapest-only project is excluded.
        assert "proj-other" not in items

    def test_invalid_scope_400(self, test_client, seed_projects):
        resp = test_client.get(
            "/api/capacity/projects?scope=garbage:foo&start=2026-04&end=2026-06",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Filter chips (§10.10) — v5.2 W6 Track A removed the server-side filter_chip
# parameter. Filter-chip semantics now live exclusively in the frontend at
# `frontend/src/modules/capacity/timeline/projectFilters.ts` so the chip-count
# source matches the chip-filter result by construction. The dead server-side
# code path was never wired into the React layer post-W5.
# ---------------------------------------------------------------------------
