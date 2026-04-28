"""Integration tests for routers/workflow_templates.py [D-CAT-07]."""

from __future__ import annotations

import json

import pytest

from models.system import AuditLog
from models.workflow_templates import StepAction, WorkflowStep, WorkflowTemplate


HEADERS_CTRL = {"X-Current-User": "persona-controller"}
HEADERS_PL = {"X-Current-User": "persona-pl"}
HEADERS_EXEC = {"X-Current-User": "persona-exec"}


@pytest.fixture
def seeded_template(db, seed_personas):
    """Insert one template with three steps for the router tests."""
    template = WorkflowTemplate(
        key="forecast_cycle", name="Forecast Cycle",
        description="Five-phase rolling forecast", is_active=True,
    )
    db.add(template)
    db.flush()
    s1 = WorkflowStep(
        template_id=template.id, step_order=1, name="Cycle opens",
        step_type="action", required=True, skippable=False,
        assigned_role="controller",
    )
    s2 = WorkflowStep(
        template_id=template.id, step_order=2, name="Forecast editing",
        step_type="action", required=True, skippable=False,
        assigned_role="project_lead",
        notifications_json='{"on_overdue": ["controller"]}',
        time_constraint_days=10, escalation_action="reminder",
    )
    s3 = WorkflowStep(
        template_id=template.id, step_order=3, name="Acceptance",
        step_type="gate", required=True, skippable=False,
        assigned_role="controller",
    )
    db.add_all([s1, s2, s3])
    db.flush()
    db.add(StepAction(
        step_id=s3.id, action_order=1, action_type="approve",
        label="Approve forecast", config_json='{"updates_baseline": true}',
    ))
    db.commit()
    return {
        "template_id": template.id,
        "template_key": template.key,
        "step_ids": [s1.id, s2.id, s3.id],
    }


class TestListTemplates:
    def test_returns_summary_list(self, test_client, seeded_template):
        resp = test_client.get("/api/admin/workflow-templates", headers=HEADERS_CTRL)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        item = data["items"][0]
        assert item["key"] == "forecast_cycle"
        assert item["step_count"] == 3
        assert "steps" not in item  # summary only

    def test_pl_forbidden(self, test_client, seeded_template):
        resp = test_client.get("/api/admin/workflow-templates", headers=HEADERS_PL)
        assert resp.status_code == 403

    def test_exec_forbidden(self, test_client, seeded_template):
        resp = test_client.get("/api/admin/workflow-templates", headers=HEADERS_EXEC)
        assert resp.status_code == 403


class TestGetTemplateDetail:
    def test_lookup_by_key(self, test_client, seeded_template):
        resp = test_client.get(
            "/api/admin/workflow-templates/forecast_cycle", headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["key"] == "forecast_cycle"
        assert len(data["steps"]) == 3
        # Steps come back sorted by step_order
        assert [s["step_order"] for s in data["steps"]] == [1, 2, 3]
        # Step 3 has the approve action
        step3 = data["steps"][2]
        assert len(step3["actions"]) == 1
        assert step3["actions"][0]["action_type"] == "approve"
        assert step3["actions"][0]["config"]["updates_baseline"] is True

    def test_lookup_by_id(self, test_client, seeded_template):
        resp = test_client.get(
            f"/api/admin/workflow-templates/{seeded_template['template_id']}",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        assert resp.json()["key"] == "forecast_cycle"

    def test_not_found(self, test_client, seeded_template):
        resp = test_client.get(
            "/api/admin/workflow-templates/nonexistent", headers=HEADERS_CTRL,
        )
        assert resp.status_code == 404

    def test_decodes_json_columns(self, test_client, seeded_template):
        resp = test_client.get(
            "/api/admin/workflow-templates/forecast_cycle", headers=HEADERS_CTRL,
        )
        step2 = resp.json()["steps"][1]
        assert step2["notifications"] == {"on_overdue": ["controller"]}
        assert step2["time_constraint_days"] == 10
        assert step2["escalation_action"] == "reminder"


class TestUpdateStep:
    def test_update_required_flag(self, test_client, db, seeded_template):
        step_id = seeded_template["step_ids"][1]
        resp = test_client.put(
            f"/api/admin/workflow-templates/forecast_cycle/steps/{step_id}",
            headers=HEADERS_CTRL,
            json={"required": False, "skippable": True},
        )
        assert resp.status_code == 200
        out = resp.json()
        assert out["required"] is False
        assert out["skippable"] is True
        # Audit rows written under category=configuration
        rows = (
            db.query(AuditLog)
            .filter(AuditLog.entity_type == "workflow_step")
            .all()
        )
        assert len(rows) == 2
        assert all(r.category == "configuration" for r in rows)

    def test_update_data_gates(self, test_client, db, seeded_template):
        step_id = seeded_template["step_ids"][1]
        resp = test_client.put(
            f"/api/admin/workflow-templates/forecast_cycle/steps/{step_id}",
            headers=HEADERS_CTRL,
            json={"data_gates": ["gate_a", "gate_b"]},
        )
        assert resp.status_code == 200
        out = resp.json()
        assert out["data_gates"] == ["gate_a", "gate_b"]

    def test_invalid_escalation_action(self, test_client, seeded_template):
        step_id = seeded_template["step_ids"][1]
        resp = test_client.put(
            f"/api/admin/workflow-templates/forecast_cycle/steps/{step_id}",
            headers=HEADERS_CTRL,
            json={"escalation_action": "nuke_from_orbit"},
        )
        assert resp.status_code == 400

    def test_negative_time_constraint(self, test_client, seeded_template):
        step_id = seeded_template["step_ids"][0]
        resp = test_client.put(
            f"/api/admin/workflow-templates/forecast_cycle/steps/{step_id}",
            headers=HEADERS_CTRL,
            json={"time_constraint_days": -5},
        )
        assert resp.status_code == 400

    def test_step_not_found(self, test_client, seeded_template):
        resp = test_client.put(
            "/api/admin/workflow-templates/forecast_cycle/steps/9999",
            headers=HEADERS_CTRL,
            json={"required": False},
        )
        assert resp.status_code == 404

    def test_pl_forbidden(self, test_client, seeded_template):
        step_id = seeded_template["step_ids"][1]
        resp = test_client.put(
            f"/api/admin/workflow-templates/forecast_cycle/steps/{step_id}",
            headers=HEADERS_PL,
            json={"required": False},
        )
        assert resp.status_code == 403


class TestToggleActive:
    def test_toggle(self, test_client, db, seeded_template):
        resp = test_client.put(
            "/api/admin/workflow-templates/forecast_cycle/active",
            headers=HEADERS_CTRL,
            json={"is_active": False},
        )
        assert resp.status_code == 200
        assert resp.json()["is_active"] is False
        rows = (
            db.query(AuditLog)
            .filter(AuditLog.entity_type == "workflow_template")
            .all()
        )
        assert len(rows) == 1
        assert rows[0].category == "configuration"
        assert rows[0].new_value == "False"

    def test_no_change_no_audit(self, test_client, db, seeded_template):
        # Already active=True, set active=True again — no audit row.
        resp = test_client.put(
            "/api/admin/workflow-templates/forecast_cycle/active",
            headers=HEADERS_CTRL,
            json={"is_active": True},
        )
        assert resp.status_code == 200
        rows = (
            db.query(AuditLog)
            .filter(AuditLog.entity_type == "workflow_template")
            .all()
        )
        assert len(rows) == 0
