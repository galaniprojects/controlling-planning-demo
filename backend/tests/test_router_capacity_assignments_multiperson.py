"""Integration tests for v5.2 W1 multi-person assignments per spec §9.5 / §9.9.

The PUT /api/capacity/requests/{cc}/{rid}/assignments endpoint accepts two
body shapes:

  Legacy (v4 / v5.0):
    {"assignments": [{"month": "2026-04", "person_id": "p-1"}]}

  v5.2 multi-person (§9.5):
    {"assignments": [
        {"month": "2026-04",
         "assignments": [{"person_id": "p-1", "hours": 40},
                         {"person_id": "p-2", "hours": 40}]},
    ]}

The new shape requires the relaxed unique constraint on
``ResourceRequestAssignment(resource_request_id, month, person_id)``
introduced in v5.2 W1.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest


HEADERS_CCO = {"X-Current-User": "persona-cc-owner"}


@pytest.fixture
def seed_request(db, seed_org_base, seed_personas):
    from models.capacity import ResourceRequest
    from models.financial import Forecast
    from models.projects import Project

    proj = Project(
        id="proj-mp", name="Multi-Person Test", status="active",
        capex_opex="capex", start_month="2026-01", end_month="2026-12",
    )
    db.add(proj)
    db.flush()

    # Forecast row driving per-month hours
    db.add(Forecast(
        project_id="proj-mp", month="2026-04",
        category="internal", sub_category="role-dev",
        hours=80, amount_eur=8000,
    ))

    req = ResourceRequest(
        project_id="proj-mp", cost_center_id="cc-muc-dev",
        request_type="resource", role_type_id="role-dev",
        hours_or_amount_per_month=80,
        period_start="2026-04", period_end="2026-04",
        priority="medium", status="pending",
    )
    db.add(req)
    db.commit()
    return {"request_id": req.id, "project_id": "proj-mp"}


# ---------------------------------------------------------------------------
# Multi-person body shape (v5.2)
# ---------------------------------------------------------------------------

@patch("routers.capacity.DEMO_DATE", "2026-04")
class TestMultiPersonBodyShape:
    """The new v5.2 body shape splits a month across multiple people."""

    def test_two_people_split_one_month_hours(self, test_client, db, seed_request):
        from models.capacity import ResourceRequestAssignment

        rid = seed_request["request_id"]
        resp = test_client.put(
            f"/api/capacity/requests/cc-muc-dev/{rid}/assignments",
            headers=HEADERS_CCO,
            json={
                "assignments": [
                    {
                        "month": "2026-04",
                        "assignments": [
                            {"person_id": "p-dev-1", "hours": 40},
                            {"person_id": "p-dev-2", "hours": 40},
                        ],
                    },
                ],
            },
        )
        assert resp.status_code == 200, resp.text

        rows = (
            db.query(ResourceRequestAssignment)
            .filter(ResourceRequestAssignment.resource_request_id == rid)
            .all()
        )
        # One row per person per month — relaxed unique constraint
        assert len(rows) == 2
        person_ids = {r.person_id for r in rows}
        assert person_ids == {"p-dev-1", "p-dev-2"}
        # Each carries its individual portion
        person_hours = {r.person_id: float(r.hours) for r in rows}
        assert person_hours["p-dev-1"] == 40
        assert person_hours["p-dev-2"] == 40

    def test_partial_assignment_allowed(self, test_client, db, seed_request):
        """Per §9.5: a month can be intentionally left partially assigned —
        sum < requested hours is permitted."""
        from models.capacity import ResourceRequestAssignment

        rid = seed_request["request_id"]
        resp = test_client.put(
            f"/api/capacity/requests/cc-muc-dev/{rid}/assignments",
            headers=HEADERS_CCO,
            json={
                "assignments": [
                    {
                        "month": "2026-04",
                        "assignments": [
                            {"person_id": "p-dev-1", "hours": 40},
                            # Note: only 40h assigned, request asks for 80h
                        ],
                    },
                ],
            },
        )
        assert resp.status_code == 200

        rows = (
            db.query(ResourceRequestAssignment)
            .filter(ResourceRequestAssignment.resource_request_id == rid)
            .all()
        )
        assert len(rows) == 1
        assert float(rows[0].hours) == 40

    def test_replaces_previous_assignments(self, test_client, db, seed_request):
        """Per §9.7 + §9.9: the PUT replaces all assignments for the request."""
        from models.capacity import ResourceRequestAssignment

        rid = seed_request["request_id"]
        # First save: two people
        test_client.put(
            f"/api/capacity/requests/cc-muc-dev/{rid}/assignments",
            headers=HEADERS_CCO,
            json={
                "assignments": [
                    {
                        "month": "2026-04",
                        "assignments": [
                            {"person_id": "p-dev-1", "hours": 40},
                            {"person_id": "p-dev-2", "hours": 40},
                        ],
                    },
                ],
            },
        )

        # Second save: single person, full hours
        resp = test_client.put(
            f"/api/capacity/requests/cc-muc-dev/{rid}/assignments",
            headers=HEADERS_CCO,
            json={
                "assignments": [
                    {
                        "month": "2026-04",
                        "assignments": [
                            {"person_id": "p-pm-1", "hours": 80},
                        ],
                    },
                ],
            },
        )
        assert resp.status_code == 200

        rows = (
            db.query(ResourceRequestAssignment)
            .filter(ResourceRequestAssignment.resource_request_id == rid)
            .all()
        )
        # Old assignments wiped, only the latest pm assignment remains
        assert len(rows) == 1
        assert rows[0].person_id == "p-pm-1"


# ---------------------------------------------------------------------------
# Backward compatibility (legacy single-person body)
# ---------------------------------------------------------------------------

@patch("routers.capacity.DEMO_DATE", "2026-04")
class TestLegacyBodyShape:
    """Per the wave plan: legacy ``{month, person_id}`` shape still accepted."""

    def test_legacy_single_person_still_works(self, test_client, db, seed_request):
        from models.capacity import ResourceRequestAssignment

        rid = seed_request["request_id"]
        resp = test_client.put(
            f"/api/capacity/requests/cc-muc-dev/{rid}/assignments",
            headers=HEADERS_CCO,
            json={
                "assignments": [
                    {"month": "2026-04", "person_id": "p-dev-1"},
                ],
            },
        )
        assert resp.status_code == 200, resp.text

        rows = (
            db.query(ResourceRequestAssignment)
            .filter(ResourceRequestAssignment.resource_request_id == rid)
            .all()
        )
        assert len(rows) == 1
        assert rows[0].person_id == "p-dev-1"


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

@patch("routers.capacity.DEMO_DATE", "2026-04")
class TestValidation:
    def test_unknown_person_id_rejected(self, test_client, db, seed_request):
        rid = seed_request["request_id"]
        resp = test_client.put(
            f"/api/capacity/requests/cc-muc-dev/{rid}/assignments",
            headers=HEADERS_CCO,
            json={
                "assignments": [
                    {
                        "month": "2026-04",
                        "assignments": [
                            {"person_id": "p-does-not-exist", "hours": 80},
                        ],
                    },
                ],
            },
        )
        assert resp.status_code == 400

    def test_month_outside_request_period_rejected(
        self, test_client, db, seed_request,
    ):
        rid = seed_request["request_id"]
        resp = test_client.put(
            f"/api/capacity/requests/cc-muc-dev/{rid}/assignments",
            headers=HEADERS_CCO,
            json={
                "assignments": [
                    {
                        "month": "2027-12",  # outside Apr-only request
                        "assignments": [
                            {"person_id": "p-dev-1", "hours": 80},
                        ],
                    },
                ],
            },
        )
        assert resp.status_code == 400

    def test_duplicate_month_rejected(self, test_client, db, seed_request):
        rid = seed_request["request_id"]
        resp = test_client.put(
            f"/api/capacity/requests/cc-muc-dev/{rid}/assignments",
            headers=HEADERS_CCO,
            json={
                "assignments": [
                    {"month": "2026-04",
                     "assignments": [{"person_id": "p-dev-1", "hours": 40}]},
                    {"month": "2026-04",
                     "assignments": [{"person_id": "p-dev-2", "hours": 40}]},
                ],
            },
        )
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Multi-person save-draft → audit log (W5 S10, spec §9.5 + §12.10)
# ---------------------------------------------------------------------------

@patch("routers.capacity.DEMO_DATE", "2026-04")
class TestMultiPersonAuditDetail:
    """The `assign_draft` audit row must include each per-person split in
    its detail_payload so the history-detail expansion can render
    "F. Keller 40h | L. Fischer 40h"."""

    def test_audit_payload_lists_each_person(
        self, test_client, db, seed_request,
    ):
        from models.capacity import CapacityActionLog

        rid = seed_request["request_id"]
        resp = test_client.put(
            f"/api/capacity/requests/cc-muc-dev/{rid}/assignments",
            headers=HEADERS_CCO,
            json={
                "assignments": [{
                    "month": "2026-04",
                    "assignments": [
                        {"person_id": "p-dev-1", "hours": 40},
                        {"person_id": "p-dev-2", "hours": 40},
                    ],
                }],
            },
        )
        assert resp.status_code == 200

        latest = (
            db.query(CapacityActionLog)
            .filter(CapacityActionLog.action_type == "assign_draft")
            .order_by(CapacityActionLog.id.desc())
            .first()
        )
        assert latest is not None

        import json as _json
        payload = latest.detail_payload
        if isinstance(payload, str):
            payload = _json.loads(payload)
        # Both people show up in the assignments list.
        names = {a.get("person_id") for a in payload.get("assignments", [])}
        assert names == {"p-dev-1", "p-dev-2"}
        # Hours are preserved per row.
        hours = {
            a["person_id"]: float(a["hours"])
            for a in payload["assignments"]
        }
        assert hours["p-dev-1"] == 40
        assert hours["p-dev-2"] == 40


@patch("routers.capacity.DEMO_DATE", "2026-04")
class TestPartialMultiPersonSavePersists:
    """Spec §9.5: a partial split (sum < requested) is permitted. The save
    must keep both rows so a subsequent project confirm sees the partial
    state and routes through the partial_confirm branch."""

    def test_partial_split_round_trip(self, test_client, db, seed_request):
        from models.capacity import ResourceRequestAssignment

        rid = seed_request["request_id"]
        # Save a 40h + 30h split for an 80h request → 70h total = partial.
        resp = test_client.put(
            f"/api/capacity/requests/cc-muc-dev/{rid}/assignments",
            headers=HEADERS_CCO,
            json={
                "assignments": [{
                    "month": "2026-04",
                    "assignments": [
                        {"person_id": "p-dev-1", "hours": 40},
                        {"person_id": "p-dev-2", "hours": 30},
                    ],
                }],
            },
        )
        assert resp.status_code == 200

        rows = (
            db.query(ResourceRequestAssignment)
            .filter(ResourceRequestAssignment.resource_request_id == rid)
            .order_by(ResourceRequestAssignment.person_id)
            .all()
        )
        assert len(rows) == 2
        total = sum(float(r.hours) for r in rows)
        assert total == 70  # request was 80, we left 10h unfilled
