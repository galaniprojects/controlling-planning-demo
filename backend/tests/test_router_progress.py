"""Integration tests for the E1 progress tracker endpoints [E-04c] [E-04d]."""

from __future__ import annotations

from decimal import Decimal

import pytest

from models.projects import (
    MilestoneDeliverable, ProgressSnapshot, Project, ProjectMilestone,
)
from models.system import AuditLog


HEADERS_CTRL = {"X-Current-User": "persona-controller"}
HEADERS_PL = {"X-Current-User": "persona-pl"}
HEADERS_EXEC = {"X-Current-User": "persona-exec"}
HEADERS_CC = {"X-Current-User": "persona-cc-owner"}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def proj_with_milestones(db, seed_personas, create_test_project):
    """Project owned by persona-pl with two milestones in place."""
    create_test_project(
        project_id="proj-alpha",
        months=["2026-04"],
        pl_person_id="p-pm-1",
    )
    db.add_all([
        ProjectMilestone(
            project_id="proj-alpha", sequence_number=1, name="Plan",
            baseline_start="2026-01", baseline_end="2026-03",
            forecast_start="2026-01", forecast_end="2026-03",
        ),
        ProjectMilestone(
            project_id="proj-alpha", sequence_number=2, name="Build",
            baseline_start="2026-04", baseline_end="2026-09",
            forecast_start="2026-04", forecast_end="2026-09",
        ),
    ])
    db.commit()
    return "proj-alpha"


@pytest.fixture
def proj_other(db, seed_personas, create_test_project):
    """Project NOT owned by persona-pl (used for 403 checks)."""
    create_test_project(project_id="proj-other", months=["2026-04"])
    return "proj-other"


# ---------------------------------------------------------------------------
# GET /api/projects/{id}/progress
# ---------------------------------------------------------------------------


class TestGetProgress:
    def test_returns_default_shape(self, test_client, proj_with_milestones):
        resp = test_client.get(
            f"/api/projects/{proj_with_milestones}/progress",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["project_id"] == proj_with_milestones
        assert body["progress_pct"] is None
        assert body["effective_progress_pct"] is None
        assert body["progress_pct_manual_override"] is False
        assert body["status_narrative"] is None
        assert body["next_milestone_confidence"] is None
        assert body["checklist"]["total_items"] == 0
        assert body["deliverables"] == []
        # Demo date 2026-04 → milestone 2 (Build)
        assert body["current_milestone"]["sequence_number"] == 2

    def test_404_for_unknown_project(self, test_client, seed_personas):
        resp = test_client.get(
            "/api/projects/proj-nope/progress",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 404

    def test_pl_can_read_other_projects(self, test_client, proj_other):
        # Read access is open to all roles per [E-04d]; PL can see read-only.
        resp = test_client.get(
            f"/api/projects/{proj_other}/progress",
            headers=HEADERS_PL,
        )
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# PATCH /api/projects/{id}/progress
# ---------------------------------------------------------------------------


class TestPatchProgress:
    def test_controller_updates_full_payload(self, test_client, proj_with_milestones, db):
        resp = test_client.patch(
            f"/api/projects/{proj_with_milestones}/progress",
            headers=HEADERS_CTRL,
            json={
                "progress_pct": 45.5,
                "progress_pct_manual_override": True,
                "status_narrative": "Build phase nearing completion",
                "next_milestone_confidence": "on_track",
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["progress_pct"] == 45.5
        assert body["progress_pct_manual_override"] is True
        assert body["status_narrative"] == "Build phase nearing completion"
        assert body["next_milestone_confidence"] == "on_track"
        assert body["progress_updated_by_id"] == "p-dev-1"  # controller persona

        # Audit entries written, one per field
        entries = db.query(AuditLog).filter(
            AuditLog.entity_type == "project_progress",
            AuditLog.entity_id == proj_with_milestones,
        ).all()
        assert len(entries) >= 4  # progress_pct, override, narrative, confidence
        for e in entries:
            assert e.category == "forecast_actions"

    def test_pl_can_update_own_project(self, test_client, proj_with_milestones):
        resp = test_client.patch(
            f"/api/projects/{proj_with_milestones}/progress",
            headers=HEADERS_PL,
            json={"status_narrative": "On track"},
        )
        assert resp.status_code == 200

    def test_pl_cannot_update_other_project(self, test_client, proj_other):
        resp = test_client.patch(
            f"/api/projects/{proj_other}/progress",
            headers=HEADERS_PL,
            json={"status_narrative": "Hijack attempt"},
        )
        assert resp.status_code == 403

    def test_exec_cannot_edit(self, test_client, proj_with_milestones):
        resp = test_client.patch(
            f"/api/projects/{proj_with_milestones}/progress",
            headers=HEADERS_EXEC,
            json={"status_narrative": "Hijack attempt"},
        )
        assert resp.status_code == 403

    def test_invalid_confidence_value_400(self, test_client, proj_with_milestones):
        resp = test_client.patch(
            f"/api/projects/{proj_with_milestones}/progress",
            headers=HEADERS_CTRL,
            json={"next_milestone_confidence": "wibble"},
        )
        assert resp.status_code == 400

    def test_at_risk_without_reason_400(self, test_client, proj_with_milestones):
        resp = test_client.patch(
            f"/api/projects/{proj_with_milestones}/progress",
            headers=HEADERS_CTRL,
            json={"next_milestone_confidence": "at_risk"},
        )
        assert resp.status_code == 400

    def test_blocked_with_reason_succeeds(self, test_client, proj_with_milestones):
        resp = test_client.patch(
            f"/api/projects/{proj_with_milestones}/progress",
            headers=HEADERS_CTRL,
            json={
                "next_milestone_confidence": "blocked",
                "confidence_reason": "Vendor escalation pending",
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["next_milestone_confidence"] == "blocked"
        assert body["confidence_reason"] == "Vendor escalation pending"

    def test_pct_out_of_range_400(self, test_client, proj_with_milestones):
        resp = test_client.patch(
            f"/api/projects/{proj_with_milestones}/progress",
            headers=HEADERS_CTRL,
            json={"progress_pct": 150},
        )
        assert resp.status_code == 400

    def test_partial_patch_does_not_clear_other_fields(
        self, test_client, proj_with_milestones, db,
    ):
        # First set some fields
        test_client.patch(
            f"/api/projects/{proj_with_milestones}/progress",
            headers=HEADERS_CTRL,
            json={"status_narrative": "X", "next_milestone_confidence": "on_track"},
        )
        # Now patch only one
        resp = test_client.patch(
            f"/api/projects/{proj_with_milestones}/progress",
            headers=HEADERS_CTRL,
            json={"progress_pct": 30, "progress_pct_manual_override": True},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status_narrative"] == "X"
        assert body["next_milestone_confidence"] == "on_track"
        assert body["progress_pct"] == 30.0


# ---------------------------------------------------------------------------
# Deliverable checklist CRUD
# ---------------------------------------------------------------------------


class TestChecklistCRUD:
    def test_list_empty(self, test_client, proj_with_milestones, db):
        ms = db.query(ProjectMilestone).filter(
            ProjectMilestone.project_id == proj_with_milestones,
            ProjectMilestone.sequence_number == 1,
        ).first()
        resp = test_client.get(
            f"/api/projects/{proj_with_milestones}/milestones/{ms.id}/checklist",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        assert resp.json() == {"items": [], "total": 0}

    def test_add_deliverable(self, test_client, proj_with_milestones, db):
        ms = db.query(ProjectMilestone).filter(
            ProjectMilestone.project_id == proj_with_milestones,
            ProjectMilestone.sequence_number == 1,
        ).first()
        resp = test_client.post(
            f"/api/projects/{proj_with_milestones}/milestones/{ms.id}/checklist",
            headers=HEADERS_CTRL,
            json={"text": "API integration complete"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["text"] == "API integration complete"
        assert body["sequence"] == 1
        assert body["is_complete"] is False

    def test_add_deliverable_max_10_enforced(self, test_client, proj_with_milestones, db):
        ms = db.query(ProjectMilestone).filter(
            ProjectMilestone.project_id == proj_with_milestones,
            ProjectMilestone.sequence_number == 1,
        ).first()
        for i in range(10):
            resp = test_client.post(
                f"/api/projects/{proj_with_milestones}/milestones/{ms.id}/checklist",
                headers=HEADERS_CTRL,
                json={"text": f"Item {i+1}"},
            )
            assert resp.status_code == 200, f"item {i+1} failed: {resp.text}"

        resp = test_client.post(
            f"/api/projects/{proj_with_milestones}/milestones/{ms.id}/checklist",
            headers=HEADERS_CTRL,
            json={"text": "Item 11"},
        )
        assert resp.status_code == 409
        assert "10" in resp.json()["detail"]

    def test_add_empty_text_400(self, test_client, proj_with_milestones, db):
        ms = db.query(ProjectMilestone).filter(
            ProjectMilestone.project_id == proj_with_milestones,
        ).first()
        resp = test_client.post(
            f"/api/projects/{proj_with_milestones}/milestones/{ms.id}/checklist",
            headers=HEADERS_CTRL,
            json={"text": "   "},
        )
        assert resp.status_code == 400

    def test_pl_cannot_add_to_other_project(self, test_client, proj_other, db):
        ms = ProjectMilestone(
            project_id=proj_other, sequence_number=1, name="X",
            baseline_start="2026-01", baseline_end="2026-12",
            forecast_start="2026-01", forecast_end="2026-12",
        )
        db.add(ms)
        db.commit()
        db.refresh(ms)
        resp = test_client.post(
            f"/api/projects/{proj_other}/milestones/{ms.id}/checklist",
            headers=HEADERS_PL,
            json={"text": "Sneaky add"},
        )
        assert resp.status_code == 403

    def test_update_complete_sets_completed_at(
        self, test_client, proj_with_milestones, db,
    ):
        ms = db.query(ProjectMilestone).filter(
            ProjectMilestone.project_id == proj_with_milestones,
        ).first()
        d = MilestoneDeliverable(milestone_id=ms.id, sequence=1, text="X")
        db.add(d)
        db.commit()
        db.refresh(d)

        resp = test_client.patch(
            f"/api/projects/{proj_with_milestones}/checklist/{d.id}",
            headers=HEADERS_CTRL,
            json={"is_complete": True},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["is_complete"] is True
        assert body["completed_at"] is not None
        assert body["completed_by_id"] == "p-dev-1"

    def test_update_uncomplete_clears_completed_at(
        self, test_client, proj_with_milestones, db,
    ):
        ms = db.query(ProjectMilestone).filter(
            ProjectMilestone.project_id == proj_with_milestones,
        ).first()
        d = MilestoneDeliverable(milestone_id=ms.id, sequence=1, text="X")
        db.add(d)
        db.commit()
        db.refresh(d)

        # Complete then uncomplete
        test_client.patch(
            f"/api/projects/{proj_with_milestones}/checklist/{d.id}",
            headers=HEADERS_CTRL, json={"is_complete": True},
        )
        resp = test_client.patch(
            f"/api/projects/{proj_with_milestones}/checklist/{d.id}",
            headers=HEADERS_CTRL, json={"is_complete": False},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["is_complete"] is False
        assert body["completed_at"] is None

    def test_update_text_empty_400(self, test_client, proj_with_milestones, db):
        ms = db.query(ProjectMilestone).filter(
            ProjectMilestone.project_id == proj_with_milestones,
        ).first()
        d = MilestoneDeliverable(milestone_id=ms.id, sequence=1, text="X")
        db.add(d)
        db.commit()
        db.refresh(d)

        resp = test_client.patch(
            f"/api/projects/{proj_with_milestones}/checklist/{d.id}",
            headers=HEADERS_CTRL, json={"text": "   "},
        )
        assert resp.status_code == 400

    def test_delete_deliverable(self, test_client, proj_with_milestones, db):
        ms = db.query(ProjectMilestone).filter(
            ProjectMilestone.project_id == proj_with_milestones,
        ).first()
        d = MilestoneDeliverable(milestone_id=ms.id, sequence=1, text="X")
        db.add(d)
        db.commit()
        d_id = d.id

        resp = test_client.delete(
            f"/api/projects/{proj_with_milestones}/checklist/{d_id}",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        assert resp.json()["deleted"] is True
        assert db.query(MilestoneDeliverable).filter(
            MilestoneDeliverable.id == d_id
        ).first() is None


# ---------------------------------------------------------------------------
# Auto-compute behaviour via API
# ---------------------------------------------------------------------------


class TestAutoComputeViaAPI:
    def test_progress_auto_computes_from_checklist(
        self, test_client, proj_with_milestones, db,
    ):
        # Get current milestone (sequence 2, "Build" — covers 2026-04)
        ms = db.query(ProjectMilestone).filter(
            ProjectMilestone.project_id == proj_with_milestones,
            ProjectMilestone.sequence_number == 2,
        ).first()
        # Add 4 deliverables, mark 1 complete via API
        for i in range(4):
            test_client.post(
                f"/api/projects/{proj_with_milestones}/milestones/{ms.id}/checklist",
                headers=HEADERS_CTRL, json={"text": f"Step {i+1}"},
            )
        items = db.query(MilestoneDeliverable).filter(
            MilestoneDeliverable.milestone_id == ms.id
        ).order_by(MilestoneDeliverable.sequence).all()

        test_client.patch(
            f"/api/projects/{proj_with_milestones}/checklist/{items[0].id}",
            headers=HEADERS_CTRL, json={"is_complete": True},
        )

        # GET /progress should reflect 25% effective
        resp = test_client.get(
            f"/api/projects/{proj_with_milestones}/progress",
            headers=HEADERS_CTRL,
        )
        body = resp.json()
        assert body["effective_progress_pct"] == 25.0
        assert body["checklist"]["total_items"] == 4
        assert body["checklist"]["completed_items"] == 1


# ---------------------------------------------------------------------------
# Progress history endpoints
# ---------------------------------------------------------------------------


class TestProgressHistory:
    def test_list_empty_returns_zero(self, test_client, proj_with_milestones):
        resp = test_client.get(
            f"/api/projects/{proj_with_milestones}/progress/history",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        assert resp.json() == {"items": [], "total": 0}

    def test_list_with_snapshots(self, test_client, proj_with_milestones, db):
        # Manually create snapshots
        from datetime import datetime, timedelta
        s1 = ProgressSnapshot(
            project_id=proj_with_milestones,
            cycle_label="Q1 2026 Cycle", cycle_id="seed-q1",
            snapshot_at=datetime(2026, 1, 15, 10, 0, 0),
            created_by_id="p-dev-1",
            progress_pct=Decimal("20.0"),
            progress_pct_manual_override=False,
            next_milestone_confidence="on_track",
        )
        s2 = ProgressSnapshot(
            project_id=proj_with_milestones,
            cycle_label="Q2 2026 Cycle", cycle_id="seed-q2",
            snapshot_at=datetime(2026, 4, 15, 10, 0, 0),
            created_by_id="p-dev-1",
            progress_pct=Decimal("60.0"),
            progress_pct_manual_override=True,
            next_milestone_confidence="at_risk",
            confidence_reason="Vendor",
        )
        db.add_all([s1, s2])
        db.commit()

        resp = test_client.get(
            f"/api/projects/{proj_with_milestones}/progress/history",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 2
        # Newest first
        assert body["items"][0]["cycle_label"] == "Q2 2026 Cycle"
        # created_by_name resolves from Person.name, not DemoPersona.display_name
        assert body["items"][0]["created_by_name"] == "Dev One"
        assert body["items"][1]["cycle_label"] == "Q1 2026 Cycle"

    def test_get_single_snapshot_with_checklist(
        self, test_client, proj_with_milestones, db,
    ):
        import json as _json
        payload = [{
            "milestone_id": 1,
            "milestone_name": "Plan",
            "sequence_number": 1,
            "items": [{"id": 1, "text": "Spec", "is_complete": True, "sequence": 1}],
        }]
        snap = ProgressSnapshot(
            project_id=proj_with_milestones,
            cycle_label="X", cycle_id="x1",
            checklist_payload_json=_json.dumps(payload),
        )
        db.add(snap)
        db.commit()
        db.refresh(snap)

        resp = test_client.get(
            f"/api/projects/{proj_with_milestones}/progress/history/{snap.id}",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["meta"]["id"] == snap.id
        assert len(body["checklist"]) == 1
        assert body["checklist"][0]["milestone_name"] == "Plan"

    def test_get_unknown_snapshot_404(self, test_client, proj_with_milestones):
        resp = test_client.get(
            f"/api/projects/{proj_with_milestones}/progress/history/99999",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Portfolio aggregation [E-04d]
# ---------------------------------------------------------------------------


class TestPortfolioProgressAggregate:
    def test_aggregate_summary(self, test_client, proj_with_milestones, proj_other, db):
        # Set proj-alpha to on_track, proj-other to at_risk
        proj_a = db.query(Project).filter(Project.id == proj_with_milestones).first()
        proj_a.next_milestone_confidence = "on_track"
        proj_b = db.query(Project).filter(Project.id == proj_other).first()
        proj_b.next_milestone_confidence = "at_risk"
        proj_b.confidence_reason = "Risk"
        db.commit()

        resp = test_client.get(
            "/api/portfolio/progress-aggregate", headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 2
        assert body["summary"]["on_track"] == 1
        assert body["summary"]["at_risk"] == 1

    def test_pl_scope_filter(self, test_client, proj_with_milestones, proj_other, db):
        # PL persona is configured with project_ids ["proj-alpha", "proj-beta"]
        resp = test_client.get(
            "/api/portfolio/progress-aggregate", headers=HEADERS_PL,
        )
        assert resp.status_code == 200
        body = resp.json()
        # Only proj-alpha exists from the PL's owned list (proj-beta isn't seeded)
        ids = {i["project_id"] for i in body["items"]}
        assert ids == {proj_with_milestones}

    def test_controller_sees_all(self, test_client, proj_with_milestones, proj_other):
        resp = test_client.get(
            "/api/portfolio/progress-aggregate", headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 2
