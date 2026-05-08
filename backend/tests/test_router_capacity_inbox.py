"""Integration tests for v5.2 W3 capacity inbox endpoint.

Per spec §12.3: GET /api/capacity/inbox returns one row per (project, CC)
for the triage queue, with role-badge aggregation, unassigned-hours math,
age-in-days, and CR-vs-intake disambiguation.

Role authorization (per spec §12.1):
  * Controller — all CCs.
  * CC Owner   — own CC only (server-side scoping).
  * Executive  — 403 Forbidden (read-only role; not on the triage queue).
  * PL         — 403 Forbidden.
"""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest


HEADERS_CTRL = {"X-Current-User": "persona-controller"}
HEADERS_CCO = {"X-Current-User": "persona-cc-owner"}
HEADERS_EXEC = {"X-Current-User": "persona-exec"}
HEADERS_PL = {"X-Current-User": "persona-pl"}


# ---------------------------------------------------------------------------
# Fixture: seed projects + resource requests covering all rule branches
# ---------------------------------------------------------------------------

@pytest.fixture
def seed_inbox(db, seed_org_base, seed_personas):
    """Seed the inbox scenarios used across the tests:

      * proj-alpha (high)   — single-CC (cc-muc-dev), 2 resource requests
                              (1× role-dev high + 1× role-pm medium), no
                              assignments → status='new', priority='high'.
      * proj-beta  (low)    — multi-CC fan-out across cc-muc-dev + cc-bud-dev,
                              one role-dev request per CC. cc-muc-dev row
                              has a draft assignment → status='in_progress';
                              cc-bud-dev row has no assignments → 'new'.
      * proj-gamma (medium) — CR-triggered re-confirmation on cc-muc-dev
                              (role-dev), distinct row with type='change_request'.
      * proj-old   (low)    — single CC, very old (35 days) so the age-sort
                              and age-days computation are exercised.
    """
    from models.capacity import (
        ResourceRequest, ResourceRequestAssignment,
    )
    from models.change_requests import ChangeRequest
    from models.organization import CostCenter, Location
    from models.projects import Project

    # --- Add a second location/CC so multi-CC fan-out is realistic ---
    loc_bud = Location(id="loc-bud", city="Budapest", country="Hungary")
    cc_bud = CostCenter(
        id="cc-bud-dev", name="Budapest Development",
        location_id="loc-bud", competence_center_id="comp-dev",
    )

    # --- Projects ---
    proj_alpha = Project(
        id="proj-alpha", name="Alpha", status="pending_cc_confirmation",
        capex_opex="capex", start_month="2026-01", end_month="2026-12",
        pl_person_id="p-pm-1",
    )
    proj_beta = Project(
        id="proj-beta", name="Beta", status="pending_cc_confirmation",
        capex_opex="capex", start_month="2026-02", end_month="2026-09",
        pl_person_id="p-pm-1",
    )
    proj_gamma = Project(
        id="proj-gamma", name="Gamma", status="active",
        capex_opex="capex", start_month="2026-01", end_month="2026-12",
        pl_person_id="p-pm-1",
    )
    proj_old = Project(
        id="proj-old", name="Old Pending", status="pending_cc_confirmation",
        capex_opex="capex", start_month="2026-01", end_month="2026-06",
        pl_person_id="p-pm-1",
    )

    # --- Change Request for proj-gamma ---
    cr_gamma = ChangeRequest(
        id=901,
        project_id="proj-gamma",
        submitted_by_id="p-pm-1",
        submission_timestamp=datetime.utcnow(),
        change_category="scope",
        summary="Scope increase: +1 developer Q4",
        status="pending_cc_confirmation",
    )

    db.add_all([loc_bud, cc_bud, proj_alpha, proj_beta, proj_gamma, proj_old, cr_gamma])
    db.flush()

    # Set request created_at deterministically so age math is testable.
    now = datetime.utcnow()

    rrs = [
        # proj-alpha — 1 dev high + 1 pm medium, both on cc-muc-dev
        ResourceRequest(
            id=1001, project_id="proj-alpha", cost_center_id="cc-muc-dev",
            request_type="resource", role_type_id="role-dev",
            hours_or_amount_per_month=160, period_start="2026-01", period_end="2026-03",
            priority="high", status="pending",
            created_at=now - timedelta(days=3),
        ),
        ResourceRequest(
            id=1002, project_id="proj-alpha", cost_center_id="cc-muc-dev",
            request_type="resource", role_type_id="role-pm",
            hours_or_amount_per_month=80, period_start="2026-01", period_end="2026-02",
            priority="medium", status="pending",
            created_at=now - timedelta(days=3),
        ),
        # proj-beta — multi-CC fan-out: dev on cc-muc-dev + dev on cc-bud-dev
        ResourceRequest(
            id=1010, project_id="proj-beta", cost_center_id="cc-muc-dev",
            request_type="resource", role_type_id="role-dev",
            hours_or_amount_per_month=120, period_start="2026-02", period_end="2026-04",
            priority="low", status="pending",
            created_at=now - timedelta(days=8),
        ),
        ResourceRequest(
            id=1011, project_id="proj-beta", cost_center_id="cc-bud-dev",
            request_type="resource", role_type_id="role-dev",
            hours_or_amount_per_month=80, period_start="2026-02", period_end="2026-03",
            priority="low", status="pending",
            created_at=now - timedelta(days=8),
        ),
        # proj-gamma — CR-triggered re-confirmation row on cc-muc-dev
        ResourceRequest(
            id=1020, project_id="proj-gamma", cost_center_id="cc-muc-dev",
            request_type="resource", role_type_id="role-dev",
            change_request_id=901,
            hours_or_amount_per_month=100, period_start="2026-04", period_end="2026-06",
            priority="medium", status="pending",
            created_at=now - timedelta(days=1),
        ),
        # proj-old — old, low priority
        ResourceRequest(
            id=1030, project_id="proj-old", cost_center_id="cc-muc-dev",
            request_type="resource", role_type_id="role-pm",
            hours_or_amount_per_month=40, period_start="2026-01", period_end="2026-02",
            priority="low", status="pending",
            created_at=now - timedelta(days=35),
        ),
    ]
    db.add_all(rrs)
    db.flush()

    # Add a draft assignment on proj-beta / cc-muc-dev so its status flips
    # to in_progress while the cc-bud-dev row stays new.
    db.add(ResourceRequestAssignment(
        resource_request_id=1010, month="2026-02",
        person_id="p-dev-1", hours=120,
    ))
    db.commit()

    return {
        "now": now,
        "rr_count": len(rrs),
    }


# ---------------------------------------------------------------------------
# Shape & response envelope
# ---------------------------------------------------------------------------

class TestInboxShape:
    def test_returns_200_for_controller(self, test_client, seed_inbox):
        resp = test_client.get("/api/capacity/inbox", headers=HEADERS_CTRL)
        assert resp.status_code == 200, resp.text

    def test_response_envelope(self, test_client, seed_inbox):
        resp = test_client.get("/api/capacity/inbox", headers=HEADERS_CTRL)
        data = resp.json()
        assert "items" in data and "total" in data
        assert isinstance(data["items"], list)
        assert data["total"] == len(data["items"])

    def test_each_row_has_required_fields(self, test_client, seed_inbox):
        resp = test_client.get("/api/capacity/inbox", headers=HEADERS_CTRL)
        rows = resp.json()["items"]
        assert len(rows) >= 1
        required = {
            "project_id", "project_name", "project_priority",
            "type", "cc_id", "cc_name", "pl_name",
            "role_badges", "unassigned_hours", "age_days", "status",
            "earliest_request_date",
        }
        for row in rows:
            assert required.issubset(row.keys()), \
                f"missing keys in row: {required - row.keys()}"
            assert isinstance(row["role_badges"], list)


# ---------------------------------------------------------------------------
# Role-based authorization (§12.1, §12.14)
# ---------------------------------------------------------------------------

class TestInboxRoleGating:
    def test_controller_sees_all_ccs(self, test_client, seed_inbox):
        resp = test_client.get("/api/capacity/inbox", headers=HEADERS_CTRL)
        assert resp.status_code == 200
        rows = resp.json()["items"]
        cc_ids = {r["cc_id"] for r in rows}
        # Controller sees both CCs (multi-CC fan-out from proj-beta).
        assert "cc-muc-dev" in cc_ids
        assert "cc-bud-dev" in cc_ids

    def test_cc_owner_sees_only_own_cc(self, test_client, seed_inbox):
        resp = test_client.get("/api/capacity/inbox", headers=HEADERS_CCO)
        assert resp.status_code == 200
        rows = resp.json()["items"]
        cc_ids = {r["cc_id"] for r in rows}
        # cc-muc-dev is the persona-cc-owner's managed CC.
        assert cc_ids == {"cc-muc-dev"}, \
            f"CC Owner should see only own CC, got {cc_ids}"

    def test_executive_forbidden(self, test_client, seed_inbox):
        resp = test_client.get("/api/capacity/inbox", headers=HEADERS_EXEC)
        assert resp.status_code == 403

    def test_pl_forbidden(self, test_client, seed_inbox):
        resp = test_client.get("/api/capacity/inbox", headers=HEADERS_PL)
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Multi-CC fan-out (§12.6) and CR-vs-intake distinction (§12.5)
# ---------------------------------------------------------------------------

class TestInboxFanOut:
    def test_project_spanning_two_ccs_returns_two_rows(
        self, test_client, seed_inbox,
    ):
        resp = test_client.get("/api/capacity/inbox", headers=HEADERS_CTRL)
        rows = resp.json()["items"]
        beta_rows = [r for r in rows if r["project_id"] == "proj-beta"]
        assert len(beta_rows) == 2
        assert {r["cc_id"] for r in beta_rows} == {"cc-muc-dev", "cc-bud-dev"}

    def test_cr_row_is_distinct_from_intake(self, test_client, seed_inbox):
        resp = test_client.get("/api/capacity/inbox", headers=HEADERS_CTRL)
        rows = resp.json()["items"]
        gamma_rows = [r for r in rows if r["project_id"] == "proj-gamma"]
        assert len(gamma_rows) == 1
        row = gamma_rows[0]
        assert row["type"] == "change_request"
        assert row["cr_id"] == 901
        assert row["status"] == "re_confirm"
        assert row["cr_summary"] is not None and "Scope increase" in row["cr_summary"]


# ---------------------------------------------------------------------------
# Status derivation (§12.3)
# ---------------------------------------------------------------------------

class TestInboxStatus:
    def test_no_assignments_yields_new(self, test_client, seed_inbox):
        resp = test_client.get("/api/capacity/inbox", headers=HEADERS_CTRL)
        rows = resp.json()["items"]
        # proj-alpha has no assignments anywhere → 'new'
        alpha = next(r for r in rows if r["project_id"] == "proj-alpha")
        assert alpha["status"] == "new"

    def test_some_assignments_yields_in_progress(self, test_client, seed_inbox):
        resp = test_client.get("/api/capacity/inbox", headers=HEADERS_CTRL)
        rows = resp.json()["items"]
        # proj-beta on cc-muc-dev has a draft assignment → 'in_progress'.
        beta_muc = next(
            r for r in rows
            if r["project_id"] == "proj-beta" and r["cc_id"] == "cc-muc-dev"
        )
        assert beta_muc["status"] == "in_progress"

        # The other CC for the same project remains 'new'.
        beta_bud = next(
            r for r in rows
            if r["project_id"] == "proj-beta" and r["cc_id"] == "cc-bud-dev"
        )
        assert beta_bud["status"] == "new"


# ---------------------------------------------------------------------------
# Aggregations: role badges + unassigned hours + priority + age
# ---------------------------------------------------------------------------

class TestInboxAggregations:
    def test_role_badges_aggregate_by_role_type(self, test_client, seed_inbox):
        resp = test_client.get("/api/capacity/inbox", headers=HEADERS_CTRL)
        rows = resp.json()["items"]
        alpha = next(r for r in rows if r["project_id"] == "proj-alpha")
        # 1× role-dev + 1× role-pm
        badge_map = {b["role_type_id"]: b["count"] for b in alpha["role_badges"]}
        assert badge_map == {"role-dev": 1, "role-pm": 1}

    def test_unassigned_hours_subtracts_assigned(self, test_client, seed_inbox):
        resp = test_client.get("/api/capacity/inbox", headers=HEADERS_CTRL)
        rows = resp.json()["items"]
        # proj-beta on cc-muc-dev: 120 h/mo × 3 months = 360 requested
        # Assigned: 120 hours for one month → 240 unassigned.
        beta_muc = next(
            r for r in rows
            if r["project_id"] == "proj-beta" and r["cc_id"] == "cc-muc-dev"
        )
        assert beta_muc["unassigned_hours"] == pytest.approx(240.0)

        # proj-beta on cc-bud-dev: 80 h/mo × 2 months = 160 unassigned.
        beta_bud = next(
            r for r in rows
            if r["project_id"] == "proj-beta" and r["cc_id"] == "cc-bud-dev"
        )
        assert beta_bud["unassigned_hours"] == pytest.approx(160.0)

    def test_project_priority_is_highest_request_priority(
        self, test_client, seed_inbox,
    ):
        resp = test_client.get("/api/capacity/inbox", headers=HEADERS_CTRL)
        rows = resp.json()["items"]
        alpha = next(r for r in rows if r["project_id"] == "proj-alpha")
        # Has one high + one medium → row is 'high'.
        assert alpha["project_priority"] == "high"

    def test_age_days_is_nonneg_and_reflects_oldest(self, test_client, seed_inbox):
        resp = test_client.get("/api/capacity/inbox", headers=HEADERS_CTRL)
        rows = resp.json()["items"]
        old = next(r for r in rows if r["project_id"] == "proj-old")
        assert old["age_days"] >= 30
        for row in rows:
            assert row["age_days"] >= 0


# ---------------------------------------------------------------------------
# Default sort: priority desc → age desc (§12.3)
# ---------------------------------------------------------------------------

class TestInboxSort:
    def test_default_sort_priority_then_age(self, test_client, seed_inbox):
        resp = test_client.get("/api/capacity/inbox", headers=HEADERS_CTRL)
        rows = resp.json()["items"]
        rank = {"high": 3, "medium": 2, "low": 1}
        for i in range(len(rows) - 1):
            a, b = rows[i], rows[i + 1]
            ar, br = rank.get(a["project_priority"], 0), rank.get(b["project_priority"], 0)
            assert ar >= br, (
                f"priority sort broken at index {i}: "
                f"{a['project_priority']} -> {b['project_priority']}"
            )
            if ar == br:
                assert a["age_days"] >= b["age_days"], (
                    f"age secondary sort broken: {a['age_days']} -> {b['age_days']}"
                )


# ---------------------------------------------------------------------------
# Filters
# ---------------------------------------------------------------------------

class TestInboxFilters:
    def test_filter_by_status_re_confirm(self, test_client, seed_inbox):
        resp = test_client.get(
            "/api/capacity/inbox?status=re_confirm", headers=HEADERS_CTRL,
        )
        rows = resp.json()["items"]
        assert len(rows) == 1
        assert rows[0]["project_id"] == "proj-gamma"

    def test_filter_by_role_type_id(self, test_client, seed_inbox):
        # role-pm only — narrows to alpha (has role-pm) and old (has role-pm).
        resp = test_client.get(
            "/api/capacity/inbox?role_type_id=role-pm", headers=HEADERS_CTRL,
        )
        rows = resp.json()["items"]
        project_ids = {r["project_id"] for r in rows}
        assert project_ids == {"proj-alpha", "proj-old"}

    def test_filter_by_cost_center_for_controller(self, test_client, seed_inbox):
        resp = test_client.get(
            "/api/capacity/inbox?cost_center_id=cc-bud-dev", headers=HEADERS_CTRL,
        )
        rows = resp.json()["items"]
        assert {r["cc_id"] for r in rows} == {"cc-bud-dev"}

    def test_filter_by_pl_person_id(self, test_client, seed_inbox):
        resp = test_client.get(
            "/api/capacity/inbox?pl_person_id=p-pm-1", headers=HEADERS_CTRL,
        )
        rows = resp.json()["items"]
        # All seeded projects share PL p-pm-1, so this should match all rows.
        assert len(rows) >= 5
        for r in rows:
            assert r["pl_person_id"] == "p-pm-1"


# ---------------------------------------------------------------------------
# Empty state
# ---------------------------------------------------------------------------

class TestInboxEmpty:
    def test_no_pending_requests_returns_empty(
        self, test_client, db, seed_org_base, seed_personas,
    ):
        # No requests seeded in this test — seed_inbox not used.
        resp = test_client.get("/api/capacity/inbox", headers=HEADERS_CTRL)
        assert resp.status_code == 200
        data = resp.json()
        assert data["items"] == []
        assert data["total"] == 0
