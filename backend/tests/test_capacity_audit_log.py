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
            id="proj-aud", name="Audit Test", status="active",
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
            id="proj-ts", name="TS Test", status="active",
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
            id=f"proj-{action_type}", name="P", status="active",
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
        status="pending_cc_confirmation",
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
