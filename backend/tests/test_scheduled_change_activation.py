"""Integration tests for scheduled change CRUD + activation engine."""

from __future__ import annotations

import json
from datetime import date, timedelta

import pytest

from models.scheduled_changes import ScheduledChange
from models.system import AuditLog, PlanningParameter
from schemas.common import CurrentUser
from services.scheduled_change_activation import apply_due_changes


HEADERS_CTRL = {"X-Current-User": "persona-controller"}
HEADERS_PL = {"X-Current-User": "persona-pl"}


@pytest.fixture
def planning_param(db):
    """Insert a planning parameter that scheduled changes can target."""
    p = PlanningParameter(
        key="standard_hours_global", name="Standard hours",
        description="Standard monthly hours",
        current_value="160", default_value="160",
        data_type="integer", param_group="planning",
    )
    db.add(p)
    db.commit()
    return p


# ---------------------------------------------------------------------------
# CRUD endpoints
# ---------------------------------------------------------------------------


class TestCreateScheduledChange:
    def test_creates_in_pending_review(self, test_client, db, seed_personas, planning_param):
        future = (date.today() + timedelta(days=30)).isoformat()
        resp = test_client.post(
            "/api/admin/scheduled-changes",
            headers=HEADERS_CTRL,
            json={
                "entity_type": "planning_parameter",
                "entity_id": "standard_hours_global",
                "description": "Reduce to 156",
                "pending_values": {"current_value": "156"},
                "activation_date": future,
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["review_status"] == "pending_review"
        assert data["activation_date"] == future
        assert data["pending_values"] == {"current_value": "156"}
        # Audit log row tagged scheduled_change_lifecycle.
        rows = db.query(AuditLog).filter(AuditLog.entity_type == "scheduled_change").all()
        assert len(rows) == 1
        assert rows[0].category == "scheduled_change_lifecycle"
        assert rows[0].action == "create"

    def test_rejects_past_activation_date(self, test_client, seed_personas, planning_param):
        past = (date.today() - timedelta(days=1)).isoformat()
        resp = test_client.post(
            "/api/admin/scheduled-changes",
            headers=HEADERS_CTRL,
            json={
                "entity_type": "planning_parameter",
                "entity_id": "standard_hours_global",
                "pending_values": {"current_value": "156"},
                "activation_date": past,
            },
        )
        assert resp.status_code == 400

    def test_pl_forbidden(self, test_client, seed_personas, planning_param):
        future = (date.today() + timedelta(days=10)).isoformat()
        resp = test_client.post(
            "/api/admin/scheduled-changes",
            headers=HEADERS_PL,
            json={
                "entity_type": "planning_parameter",
                "entity_id": "standard_hours_global",
                "pending_values": {"current_value": "156"},
                "activation_date": future,
            },
        )
        assert resp.status_code == 403


class TestApproveRejectCancel:
    def _create(self, test_client, future):
        return test_client.post(
            "/api/admin/scheduled-changes",
            headers=HEADERS_CTRL,
            json={
                "entity_type": "planning_parameter",
                "entity_id": "standard_hours_global",
                "pending_values": {"current_value": "156"},
                "activation_date": future,
            },
        )

    def test_approve_pending(self, test_client, db, seed_personas, planning_param):
        future = (date.today() + timedelta(days=10)).isoformat()
        sc_id = self._create(test_client, future).json()["id"]
        resp = test_client.post(
            f"/api/admin/scheduled-changes/{sc_id}/approve",
            headers=HEADERS_CTRL, json={"review_comments": "ok"},
        )
        assert resp.status_code == 200
        assert resp.json()["review_status"] == "approved"
        assert resp.json()["review_comments"] == "ok"

    def test_cannot_approve_twice(self, test_client, db, seed_personas, planning_param):
        future = (date.today() + timedelta(days=10)).isoformat()
        sc_id = self._create(test_client, future).json()["id"]
        test_client.post(f"/api/admin/scheduled-changes/{sc_id}/approve", headers=HEADERS_CTRL, json={})
        resp = test_client.post(
            f"/api/admin/scheduled-changes/{sc_id}/approve", headers=HEADERS_CTRL, json={},
        )
        assert resp.status_code == 409

    def test_reject(self, test_client, db, seed_personas, planning_param):
        future = (date.today() + timedelta(days=10)).isoformat()
        sc_id = self._create(test_client, future).json()["id"]
        resp = test_client.post(
            f"/api/admin/scheduled-changes/{sc_id}/reject",
            headers=HEADERS_CTRL, json={"review_comments": "no thanks"},
        )
        assert resp.status_code == 200
        assert resp.json()["review_status"] == "rejected"
        assert resp.json()["review_comments"] == "no thanks"

    def test_cancel_approved(self, test_client, db, seed_personas, planning_param):
        future = (date.today() + timedelta(days=10)).isoformat()
        sc_id = self._create(test_client, future).json()["id"]
        test_client.post(f"/api/admin/scheduled-changes/{sc_id}/approve", headers=HEADERS_CTRL, json={})
        resp = test_client.post(
            f"/api/admin/scheduled-changes/{sc_id}/cancel", headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        assert resp.json()["review_status"] == "cancelled"


# ---------------------------------------------------------------------------
# Activation engine
# ---------------------------------------------------------------------------


class TestApplyDueChanges:
    def test_applies_planning_parameter(self, db, seed_personas, planning_param):
        # Create an approved scheduled change due today.
        sc = ScheduledChange(
            entity_type="planning_parameter",
            entity_id="standard_hours_global",
            description="Apply 156",
            pending_values_json=json.dumps({"current_value": "156"}),
            activation_date=date.today(),
            review_status="approved",
            created_by_person_id="p-dev-1",
            reviewed_by_person_id="p-dev-1",
        )
        db.add(sc)
        db.commit()
        user = CurrentUser(
            user_id="persona-controller", person_id="p-dev-1", name="Test Controller",
            role="controller", cost_center_id=None, project_ids=[],
        )
        result = apply_due_changes(db, user, today=date.today())
        assert len(result["applied"]) == 1
        assert result["skipped"] == []
        assert result["errors"] == []
        # Live record updated
        param = db.query(PlanningParameter).filter_by(key="standard_hours_global").first()
        assert param.current_value == "156"
        # ScheduledChange flipped to activated
        db.refresh(sc)
        assert sc.review_status == "activated"
        assert sc.activated_at is not None
        # Audit row written under scheduled_change_lifecycle
        rows = (
            db.query(AuditLog).filter(AuditLog.entity_type == "scheduled_change").all()
        )
        assert any(r.action == "activate" and r.category == "scheduled_change_lifecycle" for r in rows)

    def test_skips_unsupported_entity_type(self, db, seed_personas):
        sc = ScheduledChange(
            entity_type="cost_center", entity_id="cc-muc-bso",
            description="Rename",
            pending_values_json=json.dumps({"name": "Renamed"}),
            activation_date=date.today(),
            review_status="approved",
            created_by_person_id="p-dev-1",
        )
        db.add(sc)
        db.commit()
        user = CurrentUser(
            user_id="persona-controller", person_id="p-dev-1", name="Test Controller",
            role="controller", cost_center_id=None, project_ids=[],
        )
        result = apply_due_changes(db, user, today=date.today())
        assert len(result["skipped"]) == 1
        # Still flips to activated (no-op recorded)
        db.refresh(sc)
        assert sc.review_status == "activated"

    def test_does_not_apply_future_changes(self, db, seed_personas, planning_param):
        sc = ScheduledChange(
            entity_type="planning_parameter",
            entity_id="standard_hours_global",
            pending_values_json=json.dumps({"current_value": "156"}),
            activation_date=date.today() + timedelta(days=30),
            review_status="approved",
            created_by_person_id="p-dev-1",
        )
        db.add(sc)
        db.commit()
        user = CurrentUser(
            user_id="persona-controller", person_id="p-dev-1", name="Test Controller",
            role="controller", cost_center_id=None, project_ids=[],
        )
        result = apply_due_changes(db, user, today=date.today())
        assert result["applied"] == []
        db.refresh(sc)
        assert sc.review_status == "approved"

    def test_does_not_apply_pending_review(self, db, seed_personas, planning_param):
        sc = ScheduledChange(
            entity_type="planning_parameter",
            entity_id="standard_hours_global",
            pending_values_json=json.dumps({"current_value": "156"}),
            activation_date=date.today(),
            review_status="pending_review",
            created_by_person_id="p-dev-1",
        )
        db.add(sc)
        db.commit()
        user = CurrentUser(
            user_id="persona-controller", person_id="p-dev-1", name="Test Controller",
            role="controller", cost_center_id=None, project_ids=[],
        )
        result = apply_due_changes(db, user, today=date.today())
        assert result["applied"] == []

    def test_endpoint_returns_summary(self, test_client, db, seed_personas, planning_param):
        sc = ScheduledChange(
            entity_type="planning_parameter",
            entity_id="standard_hours_global",
            pending_values_json=json.dumps({"current_value": "156"}),
            activation_date=date.today(),
            review_status="approved",
            created_by_person_id="p-dev-1",
        )
        db.add(sc)
        db.commit()
        resp = test_client.post(
            "/api/admin/apply-scheduled-changes", headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "applied" in data
        assert "skipped" in data
        assert "errors" in data
        assert len(data["applied"]) == 1
