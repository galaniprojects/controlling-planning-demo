"""Unit tests for services/intake_workflow.py [A-BK-26..A-BK-29]."""

from __future__ import annotations

import json

import pytest
from fastapi import HTTPException

from models.financial import Forecast
from models.projects import Project, ProjectMilestone
from models.submissions import ProjectSubmissionSnapshot
from models.system import AuditLog, Notification
from schemas.intake import IntakeProjectCreate
from services.intake_workflow import (
    APPROVED,
    CANCELLED,
    PROPOSED,
    SNAPSHOT_CONTROLLER_SENT_BACK,
    SNAPSHOT_PL_RESUBMITTED,
    UNDER_EVALUATION,
    approve_intake_project,
    compute_intake_diff,
    create_intake_project,
    reject_intake_project,
    resubmit_intake_project,
    send_back_intake_project,
)


# ---------------------------------------------------------------------------
# Local helpers — bootstrap a project under evaluation
# ---------------------------------------------------------------------------

def _project_under_evaluation(db, seed_org_base, seed_hierarchy, **overrides) -> Project:
    """Insert a Project at Under Evaluation / DoI 2 ready for controller actions."""
    p = Project(
        id=overrides.get("id", "proj-eval"),
        name=overrides.get("name", "Eval Project"),
        description="A project under evaluation",
        review_state="pending_approval",
        capex_opex="capex",
        start_month="2026-06",
        end_month=None,
        pl_person_id=overrides.get("pl_person_id", "p-pm-1"),
        project_type=overrides.get("project_type", 1),
        pipeline_stage=UNDER_EVALUATION,
        doi=2,
        ai_council_approved=True,
        is_active=True,
    )
    db.add(p)
    db.commit()
    return p


# ---------------------------------------------------------------------------
# 1. create_intake_project
# ---------------------------------------------------------------------------

class TestCreateIntakeProject:
    def test_creates_project_at_doi_zero_proposed(
        self, db, seed_org_base, seed_hierarchy, controller_user,
    ):
        body = IntakeProjectCreate(
            name="New IT Initiative",
            description="Initial pitch description",
            lob_id="lob-alpha",
            project_type=1,
            capex_opex="capex",
            start_month="2026-09",
            pl_person_id="p-pm-1",
        )
        proj = create_intake_project(db, body, controller_user)
        db.commit()

        assert proj.pipeline_stage == PROPOSED
        assert proj.doi == 0
        assert proj.pipeline_stage == "Proposed"
        assert proj.ai_council_approved is False
        assert proj.within_cutoff is None
        assert proj.composite_score is None
        assert proj.pl_person_id == "p-pm-1"

    def test_pl_self_creation_defaults_pl_person_id(
        self, db, seed_org_base, seed_hierarchy, pl_user,
    ):
        body = IntakeProjectCreate(
            name="My PL Project",
            description="Self-driven idea",
            lob_id="lob-alpha",
            project_type=2,
            capex_opex="opex",
            start_month="2026-07",
        )
        proj = create_intake_project(db, body, pl_user)
        db.commit()
        assert proj.pl_person_id == pl_user.person_id

    def test_creates_grouping_assignment(
        self, db, seed_org_base, seed_hierarchy, controller_user,
    ):
        from models.organization import ProjectGroupingAssignment
        body = IntakeProjectCreate(
            name="GE Project", description="d", lob_id="lob-beta",
            project_type=1, start_month="2026-05",
        )
        proj = create_intake_project(db, body, controller_user)
        db.commit()
        ga = (
            db.query(ProjectGroupingAssignment)
            .filter(ProjectGroupingAssignment.project_id == proj.id)
            .first()
        )
        assert ga is not None
        assert ga.grouping_entity_id == "lob-beta"

    def test_writes_audit_log_master_data(
        self, db, seed_org_base, seed_hierarchy, controller_user,
    ):
        body = IntakeProjectCreate(
            name="Audit Test", description="d", lob_id="lob-alpha",
            project_type=1, start_month="2026-05",
        )
        proj = create_intake_project(db, body, controller_user)
        db.commit()
        audit = (
            db.query(AuditLog)
            .filter(AuditLog.entity_id == proj.id, AuditLog.action == "create")
            .first()
        )
        assert audit is not None
        assert audit.category == "master_data"
        assert audit.entity_type == "project"

    def test_rejects_end_before_start(
        self, db, seed_org_base, seed_hierarchy, controller_user,
    ):
        body = IntakeProjectCreate(
            name="Bad Range", description="d", lob_id="lob-alpha",
            project_type=1, start_month="2026-09", end_month="2026-06",
        )
        with pytest.raises(HTTPException) as exc:
            create_intake_project(db, body, controller_user)
        assert exc.value.status_code == 422


# ---------------------------------------------------------------------------
# 2. approve_intake_project
# ---------------------------------------------------------------------------

class TestApproveIntakeProject:
    def test_transitions_to_approved_doi_3(
        self, db, seed_org_base, seed_hierarchy, controller_user,
    ):
        proj = _project_under_evaluation(db, seed_org_base, seed_hierarchy)
        approve_intake_project(db, proj, controller_user, comments="LGTM")
        db.commit()
        assert proj.pipeline_stage == APPROVED
        assert proj.doi == 3
        assert proj.pipeline_stage == "Approved"
        assert proj.rag_status == "green"
        assert proj.submission_feedback is None

    def test_409_when_not_under_evaluation(
        self, db, seed_org_base, seed_hierarchy, controller_user,
    ):
        proj = _project_under_evaluation(db, seed_org_base, seed_hierarchy)
        proj.pipeline_stage = "Proposed"
        proj.doi = 1
        db.commit()
        with pytest.raises(HTTPException) as exc:
            approve_intake_project(db, proj, controller_user)
        assert exc.value.status_code == 409
        assert "Under Evaluation" in str(exc.value.detail)

    def test_writes_audit_pipeline_transitions(
        self, db, seed_org_base, seed_hierarchy, controller_user,
    ):
        proj = _project_under_evaluation(db, seed_org_base, seed_hierarchy)
        approve_intake_project(db, proj, controller_user)
        db.commit()
        audits = (
            db.query(AuditLog)
            .filter(AuditLog.entity_id == proj.id, AuditLog.action == "approve")
            .all()
        )
        assert len(audits) >= 2  # stage + doi
        for a in audits:
            assert a.category == "pipeline_transitions"

    def test_generates_baseline_when_forecast_present(
        self, db, seed_org_base, seed_hierarchy, controller_user,
    ):
        from models.financial import Baseline
        proj = _project_under_evaluation(db, seed_org_base, seed_hierarchy)
        # Seed a forecast row
        db.add(Forecast(
            project_id=proj.id, month="2026-06",
            category="internal", sub_category="role-dev",
            hours=10, amount_eur=1000,
        ))
        db.commit()
        approve_intake_project(db, proj, controller_user)
        db.commit()
        baselines = (
            db.query(Baseline)
            .filter(Baseline.project_id == proj.id)
            .all()
        )
        assert len(baselines) == 1
        assert float(baselines[0].amount_eur) == 1000.0

    def test_no_baseline_when_no_forecast(
        self, db, seed_org_base, seed_hierarchy, controller_user,
    ):
        from models.financial import Baseline
        proj = _project_under_evaluation(db, seed_org_base, seed_hierarchy)
        approve_intake_project(db, proj, controller_user)
        db.commit()
        baselines = (
            db.query(Baseline)
            .filter(Baseline.project_id == proj.id)
            .all()
        )
        assert len(baselines) == 0

    def test_notification_to_pl(
        self, db, seed_org_base, seed_hierarchy, controller_user,
    ):
        proj = _project_under_evaluation(db, seed_org_base, seed_hierarchy)
        approve_intake_project(db, proj, controller_user)
        db.commit()
        notifs = (
            db.query(Notification)
            .filter(Notification.user_person_id == "p-pm-1")
            .all()
        )
        assert any("approved" in n.message for n in notifs)


# ---------------------------------------------------------------------------
# 3. send_back_intake_project
# ---------------------------------------------------------------------------

class TestSendBackIntakeProject:
    def test_transitions_to_proposed_doi_1(
        self, db, seed_org_base, seed_hierarchy, controller_user,
    ):
        proj = _project_under_evaluation(db, seed_org_base, seed_hierarchy)
        send_back_intake_project(db, proj, controller_user, comments="Need TN scoring")
        db.commit()
        assert proj.pipeline_stage == PROPOSED
        assert proj.doi == 1
        assert proj.review_state == "changes_requested"
        assert proj.submission_feedback == "Need TN scoring"

    def test_409_when_not_under_evaluation(
        self, db, seed_org_base, seed_hierarchy, controller_user,
    ):
        proj = _project_under_evaluation(db, seed_org_base, seed_hierarchy)
        proj.pipeline_stage = "Approved"
        proj.doi = 3
        db.commit()
        with pytest.raises(HTTPException) as exc:
            send_back_intake_project(db, proj, controller_user, comments="x")
        assert exc.value.status_code == 409

    def test_captures_controller_sent_back_snapshot(
        self, db, seed_org_base, seed_hierarchy, controller_user,
    ):
        proj = _project_under_evaluation(db, seed_org_base, seed_hierarchy)
        proj.composite_score = 4.2
        proj.tn_standardization = 5
        db.commit()
        send_back_intake_project(db, proj, controller_user, comments="Refine scope")
        db.commit()
        snap = (
            db.query(ProjectSubmissionSnapshot)
            .filter(
                ProjectSubmissionSnapshot.project_id == proj.id,
                ProjectSubmissionSnapshot.snapshot_type == SNAPSHOT_CONTROLLER_SENT_BACK,
            )
            .first()
        )
        assert snap is not None
        assert snap.is_active is True
        state = json.loads(snap.forecast_data_json)
        # Snapshot captures the *pre-mutation* state. Composite score is
        # Numeric(4,2), so it round-trips as "4.20" not "4.2".
        assert state["composite_score"] == "4.20"
        assert state["tn_standardization"] == "5"
        assert snap.comments == "Refine scope"

    def test_audit_logs_pipeline_transitions(
        self, db, seed_org_base, seed_hierarchy, controller_user,
    ):
        proj = _project_under_evaluation(db, seed_org_base, seed_hierarchy)
        send_back_intake_project(db, proj, controller_user, comments="x")
        db.commit()
        audits = (
            db.query(AuditLog)
            .filter(AuditLog.entity_id == proj.id, AuditLog.action == "send_back")
            .all()
        )
        assert len(audits) >= 3  # stage + doi + comments
        for a in audits:
            assert a.category == "pipeline_transitions"

    def test_notification_with_diff_deep_link(
        self, db, seed_org_base, seed_hierarchy, controller_user,
    ):
        proj = _project_under_evaluation(db, seed_org_base, seed_hierarchy)
        send_back_intake_project(db, proj, controller_user, comments="Fix budget")
        db.commit()
        notif = (
            db.query(Notification)
            .filter(Notification.user_person_id == "p-pm-1")
            .order_by(Notification.id.desc())
            .first()
        )
        assert notif is not None
        assert notif.deep_link_tab == "diff"
        assert "sent back" in notif.message.lower()

    def test_deactivates_prior_send_back_snapshot(
        self, db, seed_org_base, seed_hierarchy, controller_user,
    ):
        proj = _project_under_evaluation(db, seed_org_base, seed_hierarchy)
        send_back_intake_project(db, proj, controller_user, comments="first")
        db.commit()
        # Second iteration: bring back to Under Evaluation manually
        proj.pipeline_stage = UNDER_EVALUATION
        proj.doi = 2
        proj.submission_feedback = None
        db.commit()
        send_back_intake_project(db, proj, controller_user, comments="second")
        db.commit()
        active = (
            db.query(ProjectSubmissionSnapshot)
            .filter(
                ProjectSubmissionSnapshot.project_id == proj.id,
                ProjectSubmissionSnapshot.snapshot_type == SNAPSHOT_CONTROLLER_SENT_BACK,
                ProjectSubmissionSnapshot.is_active.is_(True),
            )
            .all()
        )
        assert len(active) == 1
        assert active[0].comments == "second"


# ---------------------------------------------------------------------------
# 4. reject_intake_project
# ---------------------------------------------------------------------------

class TestRejectIntakeProject:
    def test_transitions_to_cancelled_freezes_doi(
        self, db, seed_org_base, seed_hierarchy, controller_user,
    ):
        proj = _project_under_evaluation(db, seed_org_base, seed_hierarchy)
        reject_intake_project(db, proj, controller_user, reason="Out of scope")
        db.commit()
        assert proj.pipeline_stage == CANCELLED
        assert proj.doi is None
        assert proj.frozen_doi == 2
        assert proj.pipeline_stage == "Cancelled"
        assert proj.submission_feedback == "Out of scope"
        assert proj.within_cutoff is None

    def test_409_when_not_under_evaluation(
        self, db, seed_org_base, seed_hierarchy, controller_user,
    ):
        proj = _project_under_evaluation(db, seed_org_base, seed_hierarchy)
        proj.pipeline_stage = "Proposed"
        proj.doi = 1
        db.commit()
        with pytest.raises(HTTPException) as exc:
            reject_intake_project(db, proj, controller_user, reason="x")
        assert exc.value.status_code == 409

    def test_audit_pipeline_transitions(
        self, db, seed_org_base, seed_hierarchy, controller_user,
    ):
        proj = _project_under_evaluation(db, seed_org_base, seed_hierarchy)
        reject_intake_project(db, proj, controller_user, reason="No funding")
        db.commit()
        audits = (
            db.query(AuditLog)
            .filter(AuditLog.entity_id == proj.id, AuditLog.action == "reject")
            .all()
        )
        assert len(audits) >= 3
        for a in audits:
            assert a.category == "pipeline_transitions"

    def test_notification_to_pl(
        self, db, seed_org_base, seed_hierarchy, controller_user,
    ):
        proj = _project_under_evaluation(db, seed_org_base, seed_hierarchy)
        reject_intake_project(db, proj, controller_user, reason="No funding")
        db.commit()
        notif = (
            db.query(Notification)
            .filter(Notification.user_person_id == "p-pm-1")
            .order_by(Notification.id.desc())
            .first()
        )
        assert notif is not None
        assert "rejected" in notif.message.lower()


# ---------------------------------------------------------------------------
# 5. resubmit_intake_project
# ---------------------------------------------------------------------------

class TestResubmitIntakeProject:
    def _send_back_first(self, db, controller_user, seed_org_base, seed_hierarchy):
        proj = _project_under_evaluation(db, seed_org_base, seed_hierarchy)
        send_back_intake_project(db, proj, controller_user, comments="Refine TN")
        db.commit()
        return proj

    def test_transitions_back_to_under_evaluation(
        self, db, seed_org_base, seed_hierarchy, controller_user, pl_user, seed_personas,
    ):
        proj = self._send_back_first(db, controller_user, seed_org_base, seed_hierarchy)
        resubmit_intake_project(db, proj, pl_user, notes="Fixed scope")
        db.commit()
        assert proj.pipeline_stage == UNDER_EVALUATION
        assert proj.doi == 2
        assert proj.review_state == "pending_approval"
        assert proj.submission_feedback is None

    def test_409_when_not_in_sent_back_state(
        self, db, seed_org_base, seed_hierarchy, controller_user, pl_user, seed_personas,
    ):
        proj = _project_under_evaluation(db, seed_org_base, seed_hierarchy)
        with pytest.raises(HTTPException) as exc:
            resubmit_intake_project(db, proj, pl_user)
        assert exc.value.status_code == 409

    def test_captures_pl_resubmitted_snapshot(
        self, db, seed_org_base, seed_hierarchy, controller_user, pl_user, seed_personas,
    ):
        proj = self._send_back_first(db, controller_user, seed_org_base, seed_hierarchy)
        # PL bumps a TN score before resubmitting
        proj.composite_score = 5.0
        db.commit()
        resubmit_intake_project(db, proj, pl_user, notes="Updated scoring")
        db.commit()
        snap = (
            db.query(ProjectSubmissionSnapshot)
            .filter(
                ProjectSubmissionSnapshot.project_id == proj.id,
                ProjectSubmissionSnapshot.snapshot_type == SNAPSHOT_PL_RESUBMITTED,
                ProjectSubmissionSnapshot.is_active.is_(True),
            )
            .first()
        )
        assert snap is not None
        state = json.loads(snap.forecast_data_json)
        assert state["composite_score"] == "5.00"
        assert snap.comments == "Updated scoring"

    def test_notifies_controllers(
        self, db, seed_org_base, seed_hierarchy, controller_user, pl_user, seed_personas,
    ):
        proj = self._send_back_first(db, controller_user, seed_org_base, seed_hierarchy)
        resubmit_intake_project(db, proj, pl_user, notes="ready")
        db.commit()
        # seed_personas creates a controller persona at p-dev-1
        notifs = (
            db.query(Notification)
            .filter(Notification.user_person_id == "p-dev-1")
            .all()
        )
        assert any("resubmitted" in n.message for n in notifs)


# ---------------------------------------------------------------------------
# 6. compute_intake_diff
# ---------------------------------------------------------------------------

class TestComputeIntakeDiff:
    def test_404_without_send_back_snapshot(
        self, db, seed_org_base, seed_hierarchy,
    ):
        proj = _project_under_evaluation(db, seed_org_base, seed_hierarchy)
        with pytest.raises(HTTPException) as exc:
            compute_intake_diff(db, proj, diff_type="resubmit")
        assert exc.value.status_code == 404

    def test_diff_against_current_state_when_no_resubmit(
        self, db, seed_org_base, seed_hierarchy, controller_user,
    ):
        proj = _project_under_evaluation(db, seed_org_base, seed_hierarchy)
        proj.composite_score = 3.0
        db.commit()
        send_back_intake_project(db, proj, controller_user, comments="Polish")
        db.commit()
        # PL hasn't pressed Resubmit yet but updates a field
        proj.composite_score = 4.5
        db.commit()
        diff = compute_intake_diff(db, proj, diff_type="resubmit")
        assert diff.diff_type == "current"
        composite = next(f for f in diff.fields if f.field == "composite_score")
        # Numeric(4,2) round-trips as e.g. "3.00" / "4.50".
        assert composite.before == "3.00"
        assert composite.after == "4.50"
        assert composite.changed is True
        assert diff.has_baseline is True

    def test_diff_against_resubmit_snapshot(
        self, db, seed_org_base, seed_hierarchy, controller_user, pl_user, seed_personas,
    ):
        proj = _project_under_evaluation(db, seed_org_base, seed_hierarchy)
        proj.composite_score = 3.0
        db.commit()
        send_back_intake_project(db, proj, controller_user, comments="Polish")
        db.commit()
        proj.composite_score = 4.5
        db.commit()
        resubmit_intake_project(db, proj, pl_user, notes="updated")
        db.commit()
        diff = compute_intake_diff(db, proj, diff_type="resubmit")
        assert diff.diff_type == "pl_resubmitted"
        composite = next(f for f in diff.fields if f.field == "composite_score")
        assert composite.before == "3.00"
        assert composite.after == "4.50"

    def test_invalid_diff_type_raises_422(
        self, db, seed_org_base, seed_hierarchy, controller_user,
    ):
        proj = _project_under_evaluation(db, seed_org_base, seed_hierarchy)
        send_back_intake_project(db, proj, controller_user, comments="x")
        db.commit()
        with pytest.raises(HTTPException) as exc:
            compute_intake_diff(db, proj, diff_type="banana")
        assert exc.value.status_code == 422

    def test_milestone_count_in_diff(
        self, db, seed_org_base, seed_hierarchy, controller_user,
    ):
        proj = _project_under_evaluation(db, seed_org_base, seed_hierarchy)
        send_back_intake_project(db, proj, controller_user, comments="Add milestones")
        db.commit()
        # Add a milestone after Send Back
        db.add(ProjectMilestone(
            project_id=proj.id, sequence_number=1, name="Kickoff",
            baseline_start="2026-06", baseline_end="2026-07",
            forecast_start="2026-06", forecast_end="2026-07",
        ))
        db.commit()
        diff = compute_intake_diff(db, proj, diff_type="current")
        ms = next(f for f in diff.fields if f.field == "milestone_count")
        assert ms.before == "0"
        assert ms.after == "1"
        assert ms.changed is True
