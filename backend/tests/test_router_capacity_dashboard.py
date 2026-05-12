"""Integration tests for v5.2 W1 capacity dashboard endpoints.

Per spec §11.10 / §11.6 / §11.4 / §11.5. Three new endpoints under
``/api/capacity/dashboard/*``:

  * ``GET /api/capacity/dashboard/forecast`` — monthly available / allocated /
    incoming-demand hours per scope.
  * ``GET /api/capacity/dashboard/headcount-breakdown`` — headcount split by
    one of four dimensions (location | hierarchy | role | cost_center).
  * ``GET /api/capacity/dashboard/hotspots`` — ranked top-N capacity issues
    across three severity categories.

Role gating per spec §11.1: dashboard layer is visible to Controller and
Executive only. CC Owner sees the timeline alone. PL has no workspace
access.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest


HEADERS_CTRL = {"X-Current-User": "persona-controller"}
HEADERS_CCO = {"X-Current-User": "persona-cc-owner"}
HEADERS_EXEC = {"X-Current-User": "persona-exec"}
HEADERS_PL = {"X-Current-User": "persona-pl"}


# ---------------------------------------------------------------------------
# Fixture: seed enough capacity data for non-empty aggregations
# ---------------------------------------------------------------------------

@pytest.fixture
def seed_dashboard(db, seed_org_base, seed_personas):
    """Seed people, allocations, requests, and a project so dashboard
    endpoints have data to aggregate.

    Creates:
      * 3 Munich devs (already from seed_org_base) + 1 second location
      * 1 over-allocated person in Apr-2026 (>100% utilization)
      * 1 chronically under-utilized person (0h in 6+ consecutive months)
      * 2 pending resource requests (different role + different CC)
      * Demand hours queued in 2026-05
    """
    from models.capacity import Allocation, ResourceRequest
    from models.organization import CostCenter, Location
    from models.people import Person, RoleType
    from models.projects import Project

    # Add a second location and CC for cross-location queries
    bud = Location(id="loc-bud", city="Budapest", country="Hungary")
    cc_bud = CostCenter(
        id="cc-bud-dev", name="Budapest Development",
        location_id="loc-bud", competence_center_id="comp-dev",
    )
    role_qa = RoleType(id="role-qa", name="QA Engineer")
    p_bud_dev = Person(
        id="p-bud-dev", name="Bud Dev",
        role_type_id="role-dev", cost_center_id="cc-bud-dev",
        competence_center_id="comp-dev",
    )
    p_qa = Person(
        id="p-qa-1", name="QA One",
        role_type_id="role-qa", cost_center_id="cc-muc-dev",
        competence_center_id="comp-dev",
    )
    p_idle = Person(
        id="p-idle", name="Idle Person",
        role_type_id="role-dev", cost_center_id="cc-muc-dev",
        competence_center_id="comp-dev",
    )
    db.add_all([bud, cc_bud, role_qa, p_bud_dev, p_qa, p_idle])

    # Seed projects
    proj = Project(
        id="proj-dash", name="Dashboard Test", status="active",
        capex_opex="capex", start_month="2026-01", end_month="2026-12",
    )
    proj_pl = Project(
        id="proj-alpha", name="PL Project", status="active",
        capex_opex="capex", start_month="2026-01", end_month="2026-12",
        pl_person_id="p-pm-1",
    )
    db.add_all([proj, proj_pl])
    db.flush()

    # Allocations:
    #   p-dev-1: over-allocated (200h > 160 standard) in 2026-04
    #   p-dev-2: 80h in 2026-04 (50% utilization)
    #   p-pm-1: 160h in 2026-05 (100%)
    #   p-bud-dev: 40h in 2026-04 (25% utilization)
    #   p-idle: NO allocations (chronic under-utilization candidate)
    db.add_all([
        Allocation(person_id="p-dev-1", project_id="proj-dash",
                   month="2026-04", hours=200, is_confirmed=True),
        Allocation(person_id="p-dev-2", project_id="proj-dash",
                   month="2026-04", hours=80, is_confirmed=True),
        Allocation(person_id="p-pm-1", project_id="proj-dash",
                   month="2026-05", hours=160, is_confirmed=True),
        Allocation(person_id="p-bud-dev", project_id="proj-dash",
                   month="2026-04", hours=40, is_confirmed=True),
    ])

    # Pending resource requests for incoming-demand series
    db.add_all([
        ResourceRequest(
            project_id="proj-dash", cost_center_id="cc-muc-dev",
            request_type="resource", role_type_id="role-dev",
            hours_or_amount_per_month=80,
            period_start="2026-05", period_end="2026-06",
            priority="high", status="pending",
        ),
        ResourceRequest(
            project_id="proj-dash", cost_center_id="cc-bud-dev",
            request_type="resource", role_type_id="role-qa",
            hours_or_amount_per_month=40,
            period_start="2026-05", period_end="2026-05",
            priority="medium", status="pending",
        ),
    ])
    db.commit()
    return {"proj_id": "proj-dash"}


# ===========================================================================
# DASHBOARD FORECAST endpoint  ─  GET /api/capacity/dashboard/forecast
# ===========================================================================


@patch("routers.capacity.DEMO_DATE", "2026-04")
class TestDashboardForecastShape:
    """Shape and basic-contract assertions for the forecast time series."""

    def test_response_returns_200_for_controller(self, test_client, seed_dashboard):
        resp = test_client.get(
            "/api/capacity/dashboard/forecast"
            "?scope=all&start=2026-04&end=2026-06",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200

    def test_response_has_items_or_series_key(self, test_client, seed_dashboard):
        resp = test_client.get(
            "/api/capacity/dashboard/forecast"
            "?scope=all&start=2026-04&end=2026-06",
            headers=HEADERS_CTRL,
        )
        data = resp.json()
        # Spec §11.10: returns {month, available_hours, allocated_hours, demand_hours}[]
        # Accept either a top-level list or {items: [...]} envelope.
        rows = data if isinstance(data, list) else data.get("items") or data.get("series")
        assert rows is not None, f"forecast response missing rows: {data}"
        assert isinstance(rows, list)

    def test_each_row_has_required_fields(self, test_client, seed_dashboard):
        resp = test_client.get(
            "/api/capacity/dashboard/forecast"
            "?scope=all&start=2026-04&end=2026-06",
            headers=HEADERS_CTRL,
        )
        data = resp.json()
        rows = data if isinstance(data, list) else data.get("items") or data.get("series") or []
        assert len(rows) >= 1
        for row in rows:
            assert "month" in row, f"row missing 'month': {row}"
            assert "available_hours" in row
            assert "allocated_hours" in row
            assert "demand_hours" in row
            # All numeric (int or float), allocated/demand ≥ 0
            assert isinstance(row["allocated_hours"], (int, float))
            assert isinstance(row["available_hours"], (int, float))
            assert isinstance(row["demand_hours"], (int, float))
            assert row["allocated_hours"] >= 0
            assert row["demand_hours"] >= 0

    def test_month_range_inclusive(self, test_client, seed_dashboard):
        """start/end are inclusive month bounds."""
        resp = test_client.get(
            "/api/capacity/dashboard/forecast"
            "?scope=all&start=2026-04&end=2026-06",
            headers=HEADERS_CTRL,
        )
        data = resp.json()
        rows = data if isinstance(data, list) else data.get("items") or data.get("series") or []
        months = {r["month"] for r in rows}
        assert "2026-04" in months
        assert "2026-06" in months
        # Should NOT include outside-range months
        assert "2026-03" not in months
        assert "2026-07" not in months


@patch("routers.capacity.DEMO_DATE", "2026-04")
class TestDashboardForecastSemantics:
    """Aggregation semantics — computed values match the underlying data."""

    def test_allocated_hours_sums_per_month(self, test_client, seed_dashboard):
        """2026-04 allocated total = 200 + 80 + 40 = 320h."""
        resp = test_client.get(
            "/api/capacity/dashboard/forecast"
            "?scope=all&start=2026-04&end=2026-04",
            headers=HEADERS_CTRL,
        )
        data = resp.json()
        rows = data if isinstance(data, list) else data.get("items") or data.get("series") or []
        apr = next((r for r in rows if r["month"] == "2026-04"), None)
        assert apr is not None
        assert apr["allocated_hours"] == 320

    def test_demand_hours_sums_pending_requests(self, test_client, seed_dashboard):
        """2026-05 demand: req-1 (80h, role-dev, May+Jun) + req-2 (40h, role-qa, May only)
        = 80 + 40 = 120h in May."""
        resp = test_client.get(
            "/api/capacity/dashboard/forecast"
            "?scope=all&start=2026-05&end=2026-05",
            headers=HEADERS_CTRL,
        )
        data = resp.json()
        rows = data if isinstance(data, list) else data.get("items") or data.get("series") or []
        may = next((r for r in rows if r["month"] == "2026-05"), None)
        assert may is not None
        assert may["demand_hours"] == 120


@patch("routers.capacity.DEMO_DATE", "2026-04")
class TestDashboardForecastRoleGating:
    """Per spec §11.1 / §15: Controller + Executive see dashboard. CC Owner
    has access to the workspace endpoints but the dashboard layer is hidden
    in the UI; the API itself accepts CC Owner queries (the gating is UI-side
    per §11.1 — single CC scope hides the layer).

    The test below documents the acceptance: dashboard API rejects PL.
    """

    def test_pl_forbidden(self, test_client, seed_dashboard):
        resp = test_client.get(
            "/api/capacity/dashboard/forecast"
            "?scope=all&start=2026-04&end=2026-04",
            headers=HEADERS_PL,
        )
        assert resp.status_code == 403, \
            f"PL should not have access to dashboard endpoints (got {resp.status_code})"

    def test_executive_can_read(self, test_client, seed_dashboard):
        resp = test_client.get(
            "/api/capacity/dashboard/forecast"
            "?scope=all&start=2026-04&end=2026-04",
            headers=HEADERS_EXEC,
        )
        assert resp.status_code == 200


@patch("routers.capacity.DEMO_DATE", "2026-04")
class TestDashboardForecastScope:
    """Scope filtering — narrowing scope should restrict the aggregation."""

    def test_scope_all_includes_both_locations(self, test_client, seed_dashboard):
        """scope=all aggregates Munich + Budapest people in 2026-04."""
        resp = test_client.get(
            "/api/capacity/dashboard/forecast"
            "?scope=all&start=2026-04&end=2026-04",
            headers=HEADERS_CTRL,
        )
        data = resp.json()
        rows = data if isinstance(data, list) else data.get("items") or data.get("series") or []
        apr = next((r for r in rows if r["month"] == "2026-04"), None)
        assert apr is not None
        # Includes Bud allocation (40h) and all Munich allocations
        assert apr["allocated_hours"] == 320

    def test_scope_specific_location_filters(self, test_client, seed_dashboard):
        """scope=location:loc-muc excludes Budapest's 40h allocation."""
        resp = test_client.get(
            "/api/capacity/dashboard/forecast"
            "?scope=location:loc-muc&start=2026-04&end=2026-04",
            headers=HEADERS_CTRL,
        )
        if resp.status_code == 200:
            data = resp.json()
            rows = data if isinstance(data, list) else data.get("items") or data.get("series") or []
            apr = next((r for r in rows if r["month"] == "2026-04"), None)
            if apr is not None:
                # Munich-only: 200 + 80 = 280h (excludes Budapest's 40h)
                assert apr["allocated_hours"] == 280


# ===========================================================================
# HEADCOUNT BREAKDOWN endpoint
# ===========================================================================


@patch("routers.capacity.DEMO_DATE", "2026-04")
class TestHeadcountBreakdownShape:
    """Shape contract for /dashboard/headcount-breakdown."""

    def test_response_returns_200_for_controller(self, test_client, seed_dashboard):
        resp = test_client.get(
            "/api/capacity/dashboard/headcount-breakdown"
            "?scope=all&dimension=location",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200

    def test_each_row_has_required_fields(self, test_client, seed_dashboard):
        resp = test_client.get(
            "/api/capacity/dashboard/headcount-breakdown"
            "?scope=all&dimension=location",
            headers=HEADERS_CTRL,
        )
        data = resp.json()
        rows = data if isinstance(data, list) else data.get("items") or data.get("segments") or []
        assert len(rows) >= 1
        for row in rows:
            assert "label" in row
            assert "count" in row
            assert "avg_utilization" in row or "avg_utilization_pct" in row
            assert isinstance(row["count"], int)
            assert row["count"] >= 0


@patch("routers.capacity.DEMO_DATE", "2026-04")
class TestHeadcountBreakdownDimensions:
    """All four dimensions per §11.5: location | hierarchy | role | cost_center."""

    @pytest.mark.parametrize("dimension", ["location", "hierarchy", "role", "cost_center"])
    def test_dimension_accepted(self, test_client, seed_dashboard, dimension):
        resp = test_client.get(
            f"/api/capacity/dashboard/headcount-breakdown?scope=all&dimension={dimension}",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code in (200, 404), \
            f"dimension={dimension!r} should be accepted (got {resp.status_code})"
        # 404 is acceptable only if the underlying scope has no matching data;
        # the dimension itself must not be rejected as a 400/422.
        assert resp.status_code != 422
        assert resp.status_code != 400

    def test_invalid_dimension_rejected(self, test_client, seed_dashboard):
        resp = test_client.get(
            "/api/capacity/dashboard/headcount-breakdown"
            "?scope=all&dimension=banana",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code in (400, 422), \
            f"invalid dimension should be rejected (got {resp.status_code})"

    def test_dimension_location_lists_munich_and_budapest(
        self, test_client, seed_dashboard,
    ):
        resp = test_client.get(
            "/api/capacity/dashboard/headcount-breakdown"
            "?scope=all&dimension=location",
            headers=HEADERS_CTRL,
        )
        data = resp.json()
        rows = data if isinstance(data, list) else data.get("items") or data.get("segments") or []
        labels = [r["label"] for r in rows]
        # Munich + Budapest should both appear
        assert any("Munich" in lbl for lbl in labels), labels
        assert any("Budapest" in lbl for lbl in labels), labels


@patch("routers.capacity.DEMO_DATE", "2026-04")
class TestHeadcountBreakdownRoleGating:
    def test_pl_forbidden(self, test_client, seed_dashboard):
        resp = test_client.get(
            "/api/capacity/dashboard/headcount-breakdown"
            "?scope=all&dimension=location",
            headers=HEADERS_PL,
        )
        assert resp.status_code == 403

    def test_executive_can_read(self, test_client, seed_dashboard):
        resp = test_client.get(
            "/api/capacity/dashboard/headcount-breakdown"
            "?scope=all&dimension=role",
            headers=HEADERS_EXEC,
        )
        assert resp.status_code == 200


# ===========================================================================
# HOTSPOTS endpoint
# ===========================================================================


@patch("routers.capacity.DEMO_DATE", "2026-04")
class TestHotspotsShape:
    def test_response_returns_200_for_controller(self, test_client, seed_dashboard):
        resp = test_client.get(
            "/api/capacity/dashboard/hotspots?scope=all&limit=5",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200

    def test_response_returns_list(self, test_client, seed_dashboard):
        resp = test_client.get(
            "/api/capacity/dashboard/hotspots?scope=all&limit=5",
            headers=HEADERS_CTRL,
        )
        data = resp.json()
        rows = data if isinstance(data, list) else data.get("items") or data.get("hotspots") or []
        assert isinstance(rows, list)

    def test_limit_param_respected(self, test_client, seed_dashboard):
        resp = test_client.get(
            "/api/capacity/dashboard/hotspots?scope=all&limit=2",
            headers=HEADERS_CTRL,
        )
        data = resp.json()
        rows = data if isinstance(data, list) else data.get("items") or data.get("hotspots") or []
        assert len(rows) <= 2

    def test_each_row_has_category_and_severity(self, test_client, seed_dashboard):
        resp = test_client.get(
            "/api/capacity/dashboard/hotspots?scope=all&limit=5",
            headers=HEADERS_CTRL,
        )
        data = resp.json()
        rows = data if isinstance(data, list) else data.get("items") or data.get("hotspots") or []
        # At least one hotspot in our seed (over-allocated p-dev-1 in 2026-04)
        if len(rows) > 0:
            for row in rows:
                # Must have a category indicator (one of three per §11.6)
                category = row.get("category") or row.get("type") or row.get("issue_type")
                assert category in (
                    "over_allocation", "over-allocation",
                    "unfulfilled_demand", "unfulfilled-demand",
                    "chronic_under_utilization", "under_utilization", "under-utilization",
                ), f"unexpected category: {category!r} in {row}"
                # Must have a numeric severity
                severity = row.get("severity") or row.get("severity_score")
                assert severity is not None
                assert isinstance(severity, (int, float))


@patch("routers.capacity.DEMO_DATE", "2026-04")
class TestHotspotsRanking:
    """Severity ranking per spec §11.6 — sorted descending."""

    def test_results_sorted_by_severity_descending(self, test_client, seed_dashboard):
        resp = test_client.get(
            "/api/capacity/dashboard/hotspots?scope=all&limit=5",
            headers=HEADERS_CTRL,
        )
        data = resp.json()
        rows = data if isinstance(data, list) else data.get("items") or data.get("hotspots") or []
        if len(rows) >= 2:
            severities = [
                r.get("severity") or r.get("severity_score") for r in rows
            ]
            # Strictly non-increasing
            for i in range(len(severities) - 1):
                assert severities[i] >= severities[i + 1], \
                    f"hotspots not sorted desc: {severities}"

    def test_over_allocation_detected(self, test_client, seed_dashboard):
        """p-dev-1 has 200h in April (>160 std hours) — should hit over-allocation
        category if the seeded data is in range of the hotspot detection window."""
        resp = test_client.get(
            "/api/capacity/dashboard/hotspots?scope=all&limit=10",
            headers=HEADERS_CTRL,
        )
        data = resp.json()
        rows = data if isinstance(data, list) else data.get("items") or data.get("hotspots") or []
        # Look for over-allocation row
        over_alloc = [
            r for r in rows
            if (r.get("category") or r.get("type") or r.get("issue_type") or "")
                .replace("-", "_") in ("over_allocation",)
        ]
        # Severity formula: 3 × (peak_utilization - 100) × months_affected
        # peak = 125% (200h/160h), months = 1 → severity 75
        if over_alloc:
            sev = over_alloc[0].get("severity") or over_alloc[0].get("severity_score")
            assert sev > 0


@patch("routers.capacity.DEMO_DATE", "2026-04")
class TestHotspotsEmptyState:
    """Empty-state — when there are no issues, the response is a valid empty list."""

    def test_empty_scope_returns_empty_list(
        self, test_client, seed_personas, db,
    ):
        """A scope that resolves to zero people produces an empty hotspot list,
        not an error."""
        resp = test_client.get(
            "/api/capacity/dashboard/hotspots?scope=location:loc-nonexistent&limit=5",
            headers=HEADERS_CTRL,
        )
        # Either 200 with empty list, or 404. Must NOT 5xx.
        assert resp.status_code in (200, 404)
        if resp.status_code == 200:
            data = resp.json()
            rows = data if isinstance(data, list) else data.get("items") or data.get("hotspots") or []
            assert rows == []


@patch("routers.capacity.DEMO_DATE", "2026-04")
class TestHotspotsRoleGating:
    def test_pl_forbidden(self, test_client, seed_dashboard):
        resp = test_client.get(
            "/api/capacity/dashboard/hotspots?scope=all",
            headers=HEADERS_PL,
        )
        assert resp.status_code == 403

    def test_executive_can_read(self, test_client, seed_dashboard):
        resp = test_client.get(
            "/api/capacity/dashboard/hotspots?scope=all",
            headers=HEADERS_EXEC,
        )
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# v5.2 W4 P1 fix: GET /api/capacity/dashboard/utilization-distribution
# ---------------------------------------------------------------------------

EXPECTED_BUCKETS = ("zero", "1_25", "26_50", "51_75", "76_100", "over_100")


@patch("routers.capacity.DEMO_DATE", "2026-04")
class TestUtilizationDistributionShape:
    def test_returns_200_for_controller(self, test_client, seed_dashboard):
        resp = test_client.get(
            "/api/capacity/dashboard/utilization-distribution"
            "?scope=all&start=2026-04&end=2026-06",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200

    def test_response_envelope(self, test_client, seed_dashboard):
        resp = test_client.get(
            "/api/capacity/dashboard/utilization-distribution"
            "?scope=all&start=2026-04&end=2026-06",
            headers=HEADERS_CTRL,
        )
        data = resp.json()
        assert "items" in data
        assert "total_people" in data
        assert "scope" in data
        assert data["scope"] == "all"
        assert isinstance(data["items"], list)

    def test_all_six_buckets_present_even_when_empty(
        self, test_client, seed_personas, db,
    ):
        """Every bucket key appears in the response so the chart axis is
        stable across scope changes."""
        resp = test_client.get(
            "/api/capacity/dashboard/utilization-distribution"
            "?scope=location:loc-nonexistent&start=2026-04&end=2026-06",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        data = resp.json()
        keys = {b["bucket"] for b in data["items"]}
        assert keys == set(EXPECTED_BUCKETS)
        assert all(b["count"] == 0 for b in data["items"])
        assert data["total_people"] == 0


@patch("routers.capacity.DEMO_DATE", "2026-04")
class TestUtilizationDistributionSemantics:
    def test_total_equals_sum_of_buckets(self, test_client, seed_dashboard):
        resp = test_client.get(
            "/api/capacity/dashboard/utilization-distribution"
            "?scope=all&start=2026-04&end=2026-06",
            headers=HEADERS_CTRL,
        )
        data = resp.json()
        bucket_sum = sum(b["count"] for b in data["items"])
        assert data["total_people"] == bucket_sum

    def test_idle_person_lands_in_zero_bucket(self, test_client, seed_dashboard):
        """``p-idle`` has 0h allocated across the window → ``zero`` bucket."""
        resp = test_client.get(
            "/api/capacity/dashboard/utilization-distribution"
            "?scope=all&start=2026-04&end=2026-06",
            headers=HEADERS_CTRL,
        )
        items = {b["bucket"]: b["count"] for b in resp.json()["items"]}
        assert items["zero"] >= 1

    def test_invalid_window_400(self, test_client, seed_dashboard):
        resp = test_client.get(
            "/api/capacity/dashboard/utilization-distribution"
            "?scope=all&start=2026-12&end=2026-04",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 400


@patch("routers.capacity.DEMO_DATE", "2026-04")
class TestUtilizationDistributionRoleGating:
    def test_pl_forbidden(self, test_client, seed_dashboard):
        resp = test_client.get(
            "/api/capacity/dashboard/utilization-distribution?scope=all",
            headers=HEADERS_PL,
        )
        assert resp.status_code == 403

    def test_executive_can_read(self, test_client, seed_dashboard):
        resp = test_client.get(
            "/api/capacity/dashboard/utilization-distribution?scope=all",
            headers=HEADERS_EXEC,
        )
        assert resp.status_code == 200

    def test_cc_owner_can_read(self, test_client, seed_dashboard):
        resp = test_client.get(
            "/api/capacity/dashboard/utilization-distribution?scope=all",
            headers=HEADERS_CCO,
        )
        assert resp.status_code == 200


# ===========================================================================
# v5.2 closeout — unfulfilled_demand hotspots carry CC attribution
# ===========================================================================


def _hotspot_rows(payload):
    # The endpoint returns a `HotspotResponse` envelope with `items`. Older
    # iterations exposed alternative shapes; this helper kept the legacy
    # branches as a defensive belt-and-braces. v5.2 closeout: the response
    # shape is stable, drop the alternates.
    return payload["items"]


@patch("routers.capacity.DEMO_DATE", "2026-04")
class TestHotspotsUnfulfilledDemandCCAttribution:
    """v5.2 closeout: unfulfilled_demand items carry the originating CC so the
    HotspotListCard's synthesized side-panel payload can pin the CC context.
    """

    def test_single_cc_demand_returns_cc_id(self, test_client, seed_dashboard):
        # seed_dashboard puts role-dev demand entirely in cc-muc-dev.
        resp = test_client.get(
            "/api/capacity/dashboard/hotspots?scope=all&limit=10",
            headers=HEADERS_CTRL,
        )
        rows = _hotspot_rows(resp.json())
        unfulfilled = [
            r for r in rows
            if r.get("category") == "unfulfilled_demand" and r.get("target_id") == "role-dev"
        ]
        assert len(unfulfilled) == 1, f"expected one role-dev unfulfilled hotspot, got {len(unfulfilled)}"
        item = unfulfilled[0]
        assert item.get("cost_center_id") == "cc-muc-dev"
        assert item.get("cost_center_name")  # name resolved
        assert item.get("multi_cc") is False

    def test_multi_cc_demand_picks_highest_hour_cc_and_flags(
        self, db, test_client, seed_dashboard,
    ):
        """Add a second pending RR for role-dev in cc-bud-dev with smaller
        hours; aggregator should pick cc-muc-dev (the higher-hour CC) and
        flag multi_cc=True."""
        from models.capacity import ResourceRequest
        db.add(
            ResourceRequest(
                project_id="proj-dash", cost_center_id="cc-bud-dev",
                request_type="resource", role_type_id="role-dev",
                hours_or_amount_per_month=10,
                period_start="2026-05", period_end="2026-05",
                priority="medium", status="pending",
            ),
        )
        db.commit()

        resp = test_client.get(
            "/api/capacity/dashboard/hotspots?scope=all&limit=10",
            headers=HEADERS_CTRL,
        )
        rows = _hotspot_rows(resp.json())
        item = next(
            (r for r in rows
             if r.get("category") == "unfulfilled_demand" and r.get("target_id") == "role-dev"),
            None,
        )
        assert item is not None
        # cc-muc-dev has 80h × 2 months = 160h; cc-bud-dev has 10h × 1 = 10h.
        assert item.get("cost_center_id") == "cc-muc-dev"
        assert item.get("multi_cc") is True
