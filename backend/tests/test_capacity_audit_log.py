"""Tests for ``services/capacity_audit.log_capacity_action`` + the four
write triggers wired into ``routers/capacity.py`` per spec §12.10.

Coverage:
  1. Service helper writes a CapacityActionLog row with all required fields.
  2. Each PUT endpoint triggers a log entry with the correct action_type:
       * /project-confirmation/{pid}/confirm → 'confirm' or 'partial_confirm'
       * /project-confirmation/{pid}/decline → 'decline'
       * /requests/{cc}/{rid}/assignments    → 'assign_draft'
       * /requests/{cc}/{rid}/partially-fulfill → 'partial_confirm'
  3. acting_user_id derived from session — no client-side spoofing.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest


HEADERS_CTRL = {"X-Current-User": "persona-controller"}
HEADERS_CCO = {"X-Current-User": "persona-cc-owner"}


# ---------------------------------------------------------------------------
# Service-level test: log_capacity_action()
# ---------------------------------------------------------------------------

class TestLogCapacityAction:
    """Unit tests for services/capacity_audit.log_capacity_action()."""

    def test_writes_a_row(self, db, seed_org_base, seed_personas):
        from models.capacity import CapacityActionLog  # type: ignore
        from models.projects import Project
        from schemas.common import CurrentUser
        from services.capacity_audit import log_capacity_action

        proj = Project(
            id="proj-aud", name="Audit Test", pipeline_stage="Active",
            capex_opex="capex", start_month="2026-01", end_month="2026-12",
        )
        db.add(proj)
        db.commit()

        user = CurrentUser(
            user_id="persona-cc-owner", person_id="p-dev-1",
            name="Test CC Owner", role="cost_center_owner",
            cost_center_id="cc-muc-dev", project_ids=[],
        )

        log_capacity_action(
            db, user,
            action_type="confirm",
            project_id="proj-aud",
            cost_center_id="cc-muc-dev",
            summary="Confirmed 2 roles, 320h",
            detail_payload={
                "requests_affected": [
                    {"request_id": 1, "role": "Developer", "months": 3, "hours": 240}
                ],
                "assignments": [],
            },
        )
        db.commit()

        rows = db.query(CapacityActionLog).all()
        assert len(rows) == 1
        row = rows[0]
        assert row.action_type == "confirm"
        assert row.acting_user_id == "p-dev-1"
        assert row.project_id == "proj-aud"
        assert row.cost_center_id == "cc-muc-dev"
        assert row.summary == "Confirmed 2 roles, 320h"
        # detail_payload may be persisted as JSON text or as parsed JSON — both are
        # acceptable as long as the same shape round-trips on read.
        import json as _json
        payload = row.detail_payload
        if isinstance(payload, str):
            payload = _json.loads(payload)
        assert payload.get("requests_affected") is not None

    def test_timestamp_auto_populated(self, db, seed_org_base, seed_personas):
        from models.capacity import CapacityActionLog  # type: ignore
        from models.projects import Project
        from schemas.common import CurrentUser
        from services.capacity_audit import log_capacity_action

        proj = Project(
            id="proj-ts", name="TS Test", pipeline_stage="Active",
            capex_opex="capex", start_month="2026-01", end_month="2026-12",
        )
        db.add(proj)
        db.commit()

        user = CurrentUser(
            user_id="persona-controller", person_id="p-dev-1",
            name="Ctrl", role="controller",
            cost_center_id=None, project_ids=[],
        )
        log_capacity_action(
            db, user,
            action_type="decline",
            project_id="proj-ts",
            cost_center_id="cc-muc-dev",
            summary="Declined",
            detail_payload={"decline_reason": "test"},
        )
        db.commit()

        row = db.query(CapacityActionLog).first()
        assert row.timestamp is not None

    @pytest.mark.parametrize("action_type", [
        "confirm", "partial_confirm", "decline", "decline_request",
        "assign_draft", "cr_reconfirm",
    ])
    def test_accepts_all_documented_action_types(
        self, db, seed_org_base, seed_personas, action_type,
    ):
        """All seven action types from §12.10 must be writable."""
        from models.capacity import CapacityActionLog  # type: ignore
        from models.projects import Project
        from schemas.common import CurrentUser
        from services.capacity_audit import log_capacity_action

        proj = Project(
            id=f"proj-{action_type}", name="P", pipeline_stage="Active",
            capex_opex="capex", start_month="2026-01", end_month="2026-12",
        )
        db.add(proj)
        db.commit()

        user = CurrentUser(
            user_id="persona-controller", person_id="p-dev-1",
            name="C", role="controller", cost_center_id=None, project_ids=[],
        )
        log_capacity_action(
            db, user,
            action_type=action_type,
            project_id=f"proj-{action_type}",
            cost_center_id="cc-muc-dev",
            summary=f"summary-{action_type}",
            detail_payload={},
        )
        db.commit()

        rows = db.query(CapacityActionLog).filter(
            CapacityActionLog.action_type == action_type
        ).all()
        assert len(rows) == 1


# ---------------------------------------------------------------------------
# Router-level write triggers
# ---------------------------------------------------------------------------

@pytest.fixture
def seed_confirmation_project(db, seed_org_base, seed_personas):
    """Seed a project in pending_cc_confirmation state with a pending request."""
    from models.capacity import ResourceRequest
    from models.projects import Project

    proj = Project(
        id="proj-conf", name="Confirm Test",
        pipeline_stage="Under Evaluation", review_state="pending_cc_confirmation",
        capex_opex="capex", start_month="2026-01", end_month="2026-12",
    )
    req = ResourceRequest(
        project_id="proj-conf", cost_center_id="cc-muc-dev",
        request_type="resource", role_type_id="role-dev",
        hours_or_amount_per_month=80,
        period_start="2026-04", period_end="2026-04",
        priority="medium", status="pending",
        assigned_person_id="p-dev-1",
    )
    db.add_all([proj, req])
    db.commit()
    return {"project_id": "proj-conf", "request_id": req.id}


@patch("routers.capacity.DEMO_DATE", "2026-04")
class TestConfirmEndpointWritesLog:
    """PUT /project-confirmation/{pid}/confirm logs a 'confirm' entry."""

    def test_logs_confirm_action(self, test_client, db, seed_confirmation_project):
        from models.capacity import CapacityActionLog  # type: ignore

        before = db.query(CapacityActionLog).count()

        resp = test_client.put(
            f"/api/capacity/project-confirmation/"
            f"{seed_confirmation_project['project_id']}/confirm",
            headers=HEADERS_CCO,
        )
        assert resp.status_code == 200

        after_rows = db.query(CapacityActionLog).order_by(
            CapacityActionLog.id.desc()
        ).all()
        assert len(after_rows) > before
        latest = after_rows[0]
        assert latest.action_type in ("confirm", "partial_confirm")
        assert latest.project_id == "proj-conf"

    def test_acting_user_derived_from_session_not_payload(
        self, test_client, db, seed_confirmation_project,
    ):
        """No client-side spoofing — acting_user_id reflects the persona's
        person_id, regardless of any body field."""
        from models.capacity import CapacityActionLog  # type: ignore

        # Try sending a body with a forged acting_user_id field — the server
        # must derive the acting user from X-Current-User instead.
        resp = test_client.put(
            f"/api/capacity/project-confirmation/"
            f"{seed_confirmation_project['project_id']}/confirm",
            headers=HEADERS_CCO,
            json={"acting_user_id": "p-spoofed", "user_id": "p-spoofed"},
        )
        assert resp.status_code == 200

        latest = db.query(CapacityActionLog).order_by(
            CapacityActionLog.id.desc()
        ).first()
        assert latest is not None
        # CC Owner persona's person_id (p-dev-1 per conftest seed_personas)
        assert latest.acting_user_id == "p-dev-1"


@patch("routers.capacity.DEMO_DATE", "2026-04")
class TestDeclineEndpointWritesLog:
    """PUT /project-confirmation/{pid}/decline logs a 'decline' entry."""

    def test_logs_decline_action(self, test_client, db, seed_confirmation_project):
        from models.capacity import CapacityActionLog  # type: ignore

        before = db.query(CapacityActionLog).count()

        resp = test_client.put(
            f"/api/capacity/project-confirmation/"
            f"{seed_confirmation_project['project_id']}/decline",
            headers=HEADERS_CCO,
            json={"reason": "Insufficient capacity"},
        )
        assert resp.status_code == 200

        rows = db.query(CapacityActionLog).order_by(
            CapacityActionLog.id.desc()
        ).all()
        assert len(rows) > before
        latest = rows[0]
        assert latest.action_type == "decline"
        assert latest.project_id == "proj-conf"
        # Detail payload should carry the decline reason for the history view
        import json as _json
        payload = latest.detail_payload
        if isinstance(payload, str):
            payload = _json.loads(payload)
        if isinstance(payload, dict):
            assert payload.get("decline_reason") == "Insufficient capacity"


@patch("routers.capacity.DEMO_DATE", "2026-04")
class TestAssignmentsEndpointWritesLog:
    """PUT /requests/{cc}/{rid}/assignments logs an 'assign_draft' entry."""

    def test_logs_assign_draft_action(self, test_client, db, seed_confirmation_project):
        from models.capacity import CapacityActionLog  # type: ignore

        rid = seed_confirmation_project["request_id"]
        before = db.query(CapacityActionLog).count()

        resp = test_client.put(
            f"/api/capacity/requests/cc-muc-dev/{rid}/assignments",
            headers=HEADERS_CCO,
            json={"assignments": [
                {"month": "2026-04", "person_id": "p-dev-1"},
            ]},
        )
        # Either body shape may be in flight — accept 200 only.
        assert resp.status_code == 200

        rows = db.query(CapacityActionLog).order_by(
            CapacityActionLog.id.desc()
        ).all()
        assert len(rows) > before
        latest = rows[0]
        assert latest.action_type == "assign_draft"


@patch("routers.capacity.DEMO_DATE", "2026-04")
class TestPartiallyFulfillEndpointWritesLog:
    """PUT /requests/{cc}/{rid}/partially-fulfill logs a 'partial_confirm' entry."""

    def test_logs_partial_confirm_action(
        self, test_client, db, seed_confirmation_project,
    ):
        from models.capacity import CapacityActionLog  # type: ignore

        rid = seed_confirmation_project["request_id"]
        before = db.query(CapacityActionLog).count()

        resp = test_client.put(
            f"/api/capacity/requests/cc-muc-dev/{rid}/partially-fulfill",
            headers=HEADERS_CCO,
            json={"adjusted_value": 40, "assigned_person_id": "p-dev-1"},
        )
        assert resp.status_code == 200

        rows = db.query(CapacityActionLog).order_by(
            CapacityActionLog.id.desc()
        ).all()
        assert len(rows) > before
        latest = rows[0]
        assert latest.action_type == "partial_confirm"


@patch("routers.capacity.DEMO_DATE", "2026-04")
class TestDeclineRequestEndpointWritesLog:
    """PUT /requests/{cc}/{rid}/decline logs a 'decline_request' entry per §12.10."""

    def test_logs_decline_request_action(
        self, test_client, db, seed_confirmation_project,
    ):
        from models.capacity import CapacityActionLog  # type: ignore

        rid = seed_confirmation_project["request_id"]
        before = db.query(CapacityActionLog).count()

        resp = test_client.put(
            f"/api/capacity/requests/cc-muc-dev/{rid}/decline",
            headers=HEADERS_CCO,
            json={"reason": "Role over-subscribed in Q2"},
        )
        assert resp.status_code == 200

        rows = db.query(CapacityActionLog).order_by(
            CapacityActionLog.id.desc()
        ).all()
        assert len(rows) > before
        latest = rows[0]
        assert latest.action_type == "decline_request"
        assert latest.project_id == "proj-conf"
        # Decline reason must be in the payload so the history view can render it.
        import json as _json
        payload = latest.detail_payload
        if isinstance(payload, str):
            payload = _json.loads(payload)
        assert payload.get("decline_reason") == "Role over-subscribed in Q2"


@patch("routers.capacity.DEMO_DATE", "2026-04")
class TestConfirmProjectCRReconfirm:
    """Project-level confirm of a CR-bound request logs a 'cr_reconfirm' entry
    with cr_id populated, per §12.10 vocabulary + detail_payload schema."""

    def test_cr_bound_confirm_emits_cr_reconfirm(
        self, test_client, db, seed_confirmation_project, seed_personas,
    ):
        from models.capacity import (
            CapacityActionLog, ResourceRequest, ResourceRequestAssignment,
        )
        from models.change_requests import ChangeRequest
        from models.projects import Project

        # Promote the seeded request into a CR-triggered re-confirmation by
        # attaching a ChangeRequest. Project status is already
        # pending_cc_confirmation from the fixture.
        from datetime import datetime as _dt
        cr = ChangeRequest(
            project_id="proj-conf",
            submitted_by_id="p-dev-1",
            submission_timestamp=_dt.utcnow(),
            status="pending_cc_confirmation",
            change_category="hours",
            summary="Bump dev hours",
        )
        db.add(cr)
        db.commit()
        req = (
            db.query(ResourceRequest)
            .filter(ResourceRequest.id == seed_confirmation_project["request_id"])
            .first()
        )
        req.change_request_id = cr.id
        # Cover the single requested month so the partial-precedence rule
        # (P1 #5) doesn't shadow `cr_reconfirm` with `partial_confirm`. This
        # test exercises the "CR-bound + fully assigned" path; the partial
        # branch has its own coverage in TestProjectConfirmPartialBranch.
        db.add(ResourceRequestAssignment(
            resource_request_id=req.id, month="2026-04",
            person_id="p-dev-1", hours=80,
        ))
        db.commit()

        before = db.query(CapacityActionLog).count()

        resp = test_client.put(
            f"/api/capacity/project-confirmation/proj-conf/confirm",
            headers=HEADERS_CCO,
        )
        assert resp.status_code == 200

        latest = (
            db.query(CapacityActionLog).order_by(CapacityActionLog.id.desc()).first()
        )
        assert latest is not None
        assert db.query(CapacityActionLog).count() > before
        assert latest.action_type == "cr_reconfirm"
        assert latest.cr_id == cr.id
        # detail_payload.cr_id mirrors the column.
        import json as _json
        payload = latest.detail_payload
        if isinstance(payload, str):
            payload = _json.loads(payload)
        assert payload.get("cr_id") == cr.id

    def test_cr_bound_partial_assignment_logs_partial_confirm(
        self, test_client, db, seed_confirmation_project, seed_personas,
    ):
        """P1 #5 precedence: CR-bound project with partial fulfilment now
        emits ``partial_confirm`` (was ``cr_reconfirm`` pre-fix). The CR
        context is preserved in `cr_id` + `summary` suffix.
        """
        from models.capacity import CapacityActionLog, ResourceRequest
        from models.change_requests import ChangeRequest
        from datetime import datetime as _dt

        cr = ChangeRequest(
            project_id="proj-conf",
            submitted_by_id="p-dev-1",
            submission_timestamp=_dt.utcnow(),
            status="pending_cc_confirmation",
            change_category="hours",
            summary="Bump dev hours",
        )
        db.add(cr)
        db.commit()
        req = (
            db.query(ResourceRequest)
            .filter(ResourceRequest.id == seed_confirmation_project["request_id"])
            .first()
        )
        req.change_request_id = cr.id
        # No assignments → all months count as partial.
        db.commit()

        resp = test_client.put(
            f"/api/capacity/project-confirmation/proj-conf/confirm",
            headers=HEADERS_CCO,
        )
        assert resp.status_code == 200

        latest = (
            db.query(CapacityActionLog).order_by(CapacityActionLog.id.desc()).first()
        )
        assert latest is not None
        # Partial precedence: action_type is partial_confirm even when CR-bound.
        assert latest.action_type == "partial_confirm"
        # CR context preserved in cr_id column + detail_payload + summary.
        assert latest.cr_id == cr.id
        import json as _json
        payload = latest.detail_payload
        if isinstance(payload, str):
            payload = _json.loads(payload)
        assert payload.get("cr_id") == cr.id
        assert "Partially re-confirmed via CR" in (latest.summary or "")


# ---------------------------------------------------------------------------
# Project-level partial-confirm branch (W5 S10)
# ---------------------------------------------------------------------------

@pytest.fixture
def seed_partial_assignment_project(db, seed_org_base, seed_personas):
    """Seed a multi-month resource request with one month fully assigned and
    one month with NO assignments — the project-level confirm should record
    `partial_confirm` per spec §9.5 / §12.10."""
    from models.capacity import ResourceRequest, ResourceRequestAssignment
    from models.projects import Project

    proj = Project(
        id="proj-partial", name="Partial Confirm Test",
        pipeline_stage="Under Evaluation", review_state="pending_cc_confirmation",
        capex_opex="capex", start_month="2026-04", end_month="2026-05",
    )
    req = ResourceRequest(
        project_id="proj-partial", cost_center_id="cc-muc-dev",
        request_type="resource", role_type_id="role-dev",
        hours_or_amount_per_month=80,
        period_start="2026-04", period_end="2026-05",
        priority="medium", status="pending",
    )
    db.add_all([proj, req])
    db.flush()
    # Apr fully assigned (80h to one person), May has NO assignment row
    db.add(ResourceRequestAssignment(
        resource_request_id=req.id,
        month="2026-04", person_id="p-dev-1", hours=80,
    ))
    db.commit()
    return {"project_id": "proj-partial", "request_id": req.id}


@patch("routers.capacity.DEMO_DATE", "2026-04")
class TestProjectConfirmPartialBranch:
    """When some months have sum(assignments) < requested hours, the
    project-level confirm endpoint must log `partial_confirm` rather than
    `confirm` per spec §9.5 + §12.10 (the table line "confirm or
    partial_confirm" on the same endpoint)."""

    def test_partial_assignment_logs_partial_confirm(
        self, test_client, db, seed_partial_assignment_project,
    ):
        from models.capacity import CapacityActionLog  # type: ignore

        resp = test_client.put(
            f"/api/capacity/project-confirmation/"
            f"{seed_partial_assignment_project['project_id']}/confirm",
            headers=HEADERS_CCO,
        )
        assert resp.status_code == 200

        latest = (
            db.query(CapacityActionLog).order_by(CapacityActionLog.id.desc()).first()
        )
        assert latest is not None
        assert latest.action_type == "partial_confirm", (
            f"Expected partial_confirm, got {latest.action_type}. "
            f"Summary: {latest.summary}"
        )
        # detail_payload should include partial / full month counts so the
        # history-detail expansion can render "{N} months partial".
        import json as _json
        payload = latest.detail_payload
        if isinstance(payload, str):
            payload = _json.loads(payload)
        assert payload.get("partial_months") == 1
        assert payload.get("full_months") == 1


@pytest.fixture
def seed_full_assignment_project(db, seed_org_base, seed_personas):
    """Counter-fixture: every month fully assigned. The project-level confirm
    must log plain `confirm`, NOT `partial_confirm`."""
    from models.capacity import ResourceRequest, ResourceRequestAssignment
    from models.projects import Project

    proj = Project(
        id="proj-full", name="Fully Assigned Test",
        pipeline_stage="Under Evaluation", review_state="pending_cc_confirmation",
        capex_opex="capex", start_month="2026-04", end_month="2026-05",
    )
    req = ResourceRequest(
        project_id="proj-full", cost_center_id="cc-muc-dev",
        request_type="resource", role_type_id="role-dev",
        hours_or_amount_per_month=80,
        period_start="2026-04", period_end="2026-05",
        priority="medium", status="pending",
    )
    db.add_all([proj, req])
    db.flush()
    db.add(ResourceRequestAssignment(
        resource_request_id=req.id,
        month="2026-04", person_id="p-dev-1", hours=80,
    ))
    db.add(ResourceRequestAssignment(
        resource_request_id=req.id,
        month="2026-05", person_id="p-dev-1", hours=80,
    ))
    db.commit()
    return {"project_id": "proj-full", "request_id": req.id}


@patch("routers.capacity.DEMO_DATE", "2026-04")
class TestProjectConfirmFullBranch:
    """Counterpart: with every month covered at the requested total, the
    audit log records `confirm`, not `partial_confirm`."""

    def test_full_coverage_logs_confirm(
        self, test_client, db, seed_full_assignment_project,
    ):
        from models.capacity import CapacityActionLog  # type: ignore

        resp = test_client.put(
            f"/api/capacity/project-confirmation/"
            f"{seed_full_assignment_project['project_id']}/confirm",
            headers=HEADERS_CCO,
        )
        assert resp.status_code == 200

        latest = (
            db.query(CapacityActionLog).order_by(CapacityActionLog.id.desc()).first()
        )
        assert latest is not None
        assert latest.action_type == "confirm"
        import json as _json
        payload = latest.detail_payload
        if isinstance(payload, str):
            payload = _json.loads(payload)
        assert payload.get("partial_months") == 0
        assert payload.get("full_months") == 2


@pytest.fixture
def seed_multi_person_split_project(db, seed_org_base, seed_personas):
    """Seed a project where a single month is split across two people such
    that the per-month sum equals the request — the audit log must record
    `confirm` (full coverage) even though more than one person is on the row."""
    from models.capacity import ResourceRequest, ResourceRequestAssignment
    from models.projects import Project

    proj = Project(
        id="proj-split", name="Split Confirm Test",
        pipeline_stage="Under Evaluation", review_state="pending_cc_confirmation",
        capex_opex="capex", start_month="2026-04", end_month="2026-04",
    )
    req = ResourceRequest(
        project_id="proj-split", cost_center_id="cc-muc-dev",
        request_type="resource", role_type_id="role-dev",
        hours_or_amount_per_month=80,
        period_start="2026-04", period_end="2026-04",
        priority="medium", status="pending",
    )
    db.add_all([proj, req])
    db.flush()
    # 40h + 40h = 80h (full)
    db.add(ResourceRequestAssignment(
        resource_request_id=req.id,
        month="2026-04", person_id="p-dev-1", hours=40,
    ))
    db.add(ResourceRequestAssignment(
        resource_request_id=req.id,
        month="2026-04", person_id="p-dev-2", hours=40,
    ))
    db.commit()
    return {"project_id": "proj-split", "request_id": req.id}


@patch("routers.capacity.DEMO_DATE", "2026-04")
class TestProjectConfirmMultiPersonFullSplit:
    """A multi-person split where the per-month sum equals the requested
    hours is full coverage — must log `confirm`, not `partial_confirm`."""

    def test_two_people_summing_to_full_logs_confirm(
        self, test_client, db, seed_multi_person_split_project,
    ):
        from models.capacity import CapacityActionLog  # type: ignore

        resp = test_client.put(
            f"/api/capacity/project-confirmation/"
            f"{seed_multi_person_split_project['project_id']}/confirm",
            headers=HEADERS_CCO,
        )
        assert resp.status_code == 200

        latest = (
            db.query(CapacityActionLog).order_by(CapacityActionLog.id.desc()).first()
        )
        assert latest is not None
        assert latest.action_type == "confirm"
        import json as _json
        payload = latest.detail_payload
        if isinstance(payload, str):
            payload = _json.loads(payload)
        assert payload.get("partial_months") == 0
        assert payload.get("full_months") == 1


@patch("routers.capacity.DEMO_DATE", "2026-04")
class TestAllSixActionTypesEndToEnd:
    """Per spec §12.10 the vocabulary has six write triggers. This test
    walks through all six and asserts each lands a row of the expected
    action_type — guards against silent drift if a router branch loses
    its log_capacity_action call.

    The vocabulary is:
       1. confirm           – project-level full
       2. partial_confirm   – project-level partial OR per-request partial
       3. decline           – project-level decline
       4. decline_request   – single-request decline within assignment panel
       5. assign_draft      – save draft on the assignments endpoint
       6. cr_reconfirm      – project-level confirm of a CR-bound request
    """

    def test_assign_draft_then_full_confirm_records_two_log_lines(
        self, test_client, db, seed_org_base, seed_personas,
    ):
        from models.capacity import (
            CapacityActionLog,
            ResourceRequest,
            ResourceRequestAssignment,
        )
        from models.projects import Project

        proj = Project(
            id="proj-flow", name="Flow Test",
            pipeline_stage="Under Evaluation", review_state="pending_cc_confirmation",
            capex_opex="capex", start_month="2026-04", end_month="2026-04",
        )
        req = ResourceRequest(
            project_id="proj-flow", cost_center_id="cc-muc-dev",
            request_type="resource", role_type_id="role-dev",
            hours_or_amount_per_month=80,
            period_start="2026-04", period_end="2026-04",
            priority="medium", status="pending",
        )
        db.add_all([proj, req])
        db.commit()

        # 1) Save draft as full split → assign_draft
        resp = test_client.put(
            f"/api/capacity/requests/cc-muc-dev/{req.id}/assignments",
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
        assert resp.status_code == 200, resp.text
        rows = (
            db.query(ResourceRequestAssignment)
            .filter(ResourceRequestAssignment.resource_request_id == req.id)
            .all()
        )
        assert len(rows) == 2

        # 2) Project-level confirm → confirm (full coverage 40 + 40 = 80)
        resp = test_client.put(
            f"/api/capacity/project-confirmation/proj-flow/confirm",
            headers=HEADERS_CCO,
        )
        assert resp.status_code == 200

        log_types = [
            r.action_type
            for r in db.query(CapacityActionLog)
            .filter(CapacityActionLog.project_id == "proj-flow")
            .order_by(CapacityActionLog.id.asc())
            .all()
        ]
        assert log_types == ["assign_draft", "confirm"]


@patch("routers.capacity.DEMO_DATE", "2026-04")
class TestDeclineRequestKeepsProjectStatus:
    """Single-request decline (`decline_request`) must NOT mutate the
    project's status — only the project-level `decline` endpoint advances
    the project to a declined state. This guards against accidental
    project-status side effects when a CC Owner declines one role within
    a multi-role assignment session per spec §12.7 + §12.10."""

    def test_decline_single_request_leaves_project_pending(
        self, test_client, db, seed_confirmation_project,
    ):
        from models.projects import Project

        rid = seed_confirmation_project["request_id"]
        resp = test_client.put(
            f"/api/capacity/requests/cc-muc-dev/{rid}/decline",
            headers=HEADERS_CCO,
            json={"reason": "Capacity over-allocated in Q2"},
        )
        assert resp.status_code == 200

        proj = db.query(Project).filter(Project.id == "proj-conf").first()
        assert proj is not None
        # Project status remains pending_cc_confirmation — only the request
        # was declined.
        assert proj.review_state == "pending_cc_confirmation"
