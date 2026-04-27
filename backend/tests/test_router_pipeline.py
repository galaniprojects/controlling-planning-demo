"""Integration tests for routers/pipeline.py [A-PS-04] [A-DOI-03..A-DOI-10]."""

from __future__ import annotations

import pytest

from models.projects import Project
from models.system import AuditLog


HEADERS_CTRL = {"X-Current-User": "persona-controller"}
HEADERS_PL = {"X-Current-User": "persona-pl"}
HEADERS_EXEC = {"X-Current-User": "persona-exec"}
HEADERS_CC = {"X-Current-User": "persona-cc-owner"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _set_pipeline(db, project_id, *, stage, doi, frozen_doi=None,
                  ai_council_approved=False, ai_council_doc_url=None,
                  within_cutoff=None):
    """Stamp pipeline attributes on a project after factory creation."""
    proj = db.query(Project).filter(Project.id == project_id).first()
    proj.pipeline_stage = stage
    proj.doi = doi
    proj.frozen_doi = frozen_doi
    proj.ai_council_approved = ai_council_approved
    proj.ai_council_doc_url = ai_council_doc_url
    proj.within_cutoff = within_cutoff
    db.commit()
    return proj


def _make_doi1_ready(db, project_id):
    """Fill the gate fields needed to advance to DoI 1."""
    proj = db.query(Project).filter(Project.id == project_id).first()
    proj.name = "X"
    proj.description = "d"
    proj.project_type = 1
    proj.composite_score = 4.0
    proj.tshirt_size = "M"
    proj.transformation_level = "T1"
    proj.ai_council_approved = True
    proj.ai_council_doc_url = "https://x"
    db.commit()
    return proj


@pytest.fixture
def alpha(db, seed_personas, create_test_project):
    """Project owned by persona-pl (p-pm-1)."""
    create_test_project(
        project_id="proj-alpha", months=["2026-01"],
        pl_person_id="p-pm-1",
    )
    return "proj-alpha"


@pytest.fixture
def other(db, seed_personas, create_test_project):
    """Project NOT owned by persona-pl (still in alpha/beta seed list... so use
    a third id outside the persona's owned list)."""
    create_test_project(
        project_id="proj-other", months=["2026-01"],
        pl_person_id="p-dev-1",
    )
    return "proj-other"


# ---------------------------------------------------------------------------
# GET endpoint
# ---------------------------------------------------------------------------

class TestGetPipeline:
    def test_returns_default_state_for_active_project(self, test_client, db, alpha):
        _set_pipeline(
            db, alpha, stage="Active", doi=3,
            ai_council_approved=True,
            ai_council_doc_url="https://x", within_cutoff=True,
        )
        resp = test_client.get(f"/api/projects/{alpha}/pipeline", headers=HEADERS_CTRL)
        assert resp.status_code == 200
        data = resp.json()
        assert data["pipeline_stage"] == "Active"
        assert data["doi"] == 3
        assert data["ai_council_approved"] is True
        assert data["within_cutoff"] is True
        assert data["gate_status"]["current_doi"] == 3
        assert data["gate_status"]["next_doi"] == 4

    def test_unscored_project_returns_nulls(self, test_client, db, alpha):
        # Project created by factory has no pipeline_stage; defaults are NULL/false.
        resp = test_client.get(f"/api/projects/{alpha}/pipeline", headers=HEADERS_CTRL)
        assert resp.status_code == 200
        data = resp.json()
        assert data["pipeline_stage"] is None
        assert data["doi"] is None
        assert data["ai_council_approved"] is False

    @pytest.mark.parametrize("headers", [HEADERS_CTRL, HEADERS_PL, HEADERS_EXEC, HEADERS_CC])
    def test_open_to_all_roles(self, test_client, db, alpha, headers):
        _set_pipeline(db, alpha, stage="Active", doi=3)
        resp = test_client.get(f"/api/projects/{alpha}/pipeline", headers=headers)
        assert resp.status_code == 200

    def test_404_for_unknown_project(self, test_client, seed_personas):
        resp = test_client.get("/api/projects/nonexistent/pipeline", headers=HEADERS_CTRL)
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST transition — happy paths
# ---------------------------------------------------------------------------

class TestTransitionForward:
    def test_pl_advances_own_project_proposed_to_under_evaluation(self, test_client, db, alpha):
        _set_pipeline(db, alpha, stage="Proposed", doi=0)
        # DoI 0 -> 1 needs gate fields satisfied OR override; we satisfy them
        # so the PL path passes without needing override (controller-only).
        _make_doi1_ready(db, alpha)
        resp = test_client.post(
            f"/api/projects/{alpha}/pipeline/transition",
            headers=HEADERS_PL,
            json={"target_stage": "Under Evaluation", "target_doi": 1},
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["pipeline_stage"] == "Under Evaluation"
        assert data["doi"] == 1

    def test_controller_advances_under_evaluation_to_approved(self, test_client, db, alpha):
        _set_pipeline(db, alpha, stage="Under Evaluation", doi=2)
        # Pre-fill DoI 3 gate: at least one milestone (phase) and start_month.
        from models.projects import ProjectPhase
        proj = db.query(Project).filter(Project.id == alpha).first()
        proj.start_month = "2026-04"
        db.add(ProjectPhase(
            project_id=alpha, phase_number=1, name="P1",
            baseline_start="2026-04", baseline_end="2026-06",
            forecast_start="2026-04", forecast_end="2026-06", color="blue",
        ))
        db.commit()
        resp = test_client.post(
            f"/api/projects/{alpha}/pipeline/transition",
            headers=HEADERS_CTRL,
            json={"target_stage": "Approved"},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["pipeline_stage"] == "Approved"

    def test_backwards_transition_allowed(self, test_client, db, alpha):
        # [A-PS-11]: Approved -> Under Evaluation is permitted.
        _set_pipeline(db, alpha, stage="Approved", doi=3)
        resp = test_client.post(
            f"/api/projects/{alpha}/pipeline/transition",
            headers=HEADERS_CTRL,
            json={"target_stage": "Under Evaluation", "target_doi": 2},
        )
        assert resp.status_code == 200
        assert resp.json()["pipeline_stage"] == "Under Evaluation"
        assert resp.json()["doi"] == 2


# ---------------------------------------------------------------------------
# POST transition — gate enforcement and overrides
# ---------------------------------------------------------------------------

class TestTransitionGates:
    def test_missing_gate_fields_409(self, test_client, db, alpha):
        # Project has no TN scores etc; advancing to DoI 1 should fail.
        _set_pipeline(db, alpha, stage="Proposed", doi=0)
        resp = test_client.post(
            f"/api/projects/{alpha}/pipeline/transition",
            headers=HEADERS_CTRL,
            json={"target_stage": "Under Evaluation", "target_doi": 1},
        )
        assert resp.status_code == 409
        body = resp.json()["detail"]
        assert body["error"] == "doi_gate_unmet"
        assert body["target_doi"] == 1
        assert any("AI Council" in m for m in body["missing_fields"])

    def test_override_reason_bypasses_gate_and_logs_audit(self, test_client, db, alpha):
        _set_pipeline(db, alpha, stage="Proposed", doi=0)
        resp = test_client.post(
            f"/api/projects/{alpha}/pipeline/transition",
            headers=HEADERS_CTRL,
            json={
                "target_stage": "Under Evaluation",
                "target_doi": 1,
                "override_reason": "demo override — KB confirmed offline",
            },
        )
        assert resp.status_code == 200, resp.text
        # Override audit row should be present.
        rows = db.query(AuditLog).filter(
            AuditLog.entity_type == "pipeline",
            AuditLog.action == "override",
        ).all()
        assert any("KB confirmed" in (r.new_value or "") for r in rows)


# ---------------------------------------------------------------------------
# Cancelled / Paused / frozen_doi
# ---------------------------------------------------------------------------

class TestOffPathStages:
    def test_cancelled_to_anywhere_without_override_409(self, test_client, db, alpha):
        _set_pipeline(db, alpha, stage="Cancelled", doi=None, frozen_doi=2)
        resp = test_client.post(
            f"/api/projects/{alpha}/pipeline/transition",
            headers=HEADERS_CTRL,
            json={"target_stage": "Proposed"},
        )
        assert resp.status_code == 409
        # The detail is a graph-error string (not the gate dict).
        assert "override_reason" in resp.json()["detail"]

    def test_frozen_doi_set_when_entering_paused(self, test_client, db, alpha):
        _set_pipeline(db, alpha, stage="Active", doi=3)
        resp = test_client.post(
            f"/api/projects/{alpha}/pipeline/transition",
            headers=HEADERS_CTRL,
            json={"target_stage": "Paused"},
        )
        assert resp.status_code == 200
        proj = db.query(Project).filter(Project.id == alpha).first()
        assert proj.pipeline_stage == "Paused"
        assert proj.doi is None
        assert proj.frozen_doi == 3

    def test_frozen_doi_restored_when_leaving_paused(self, test_client, db, alpha):
        _set_pipeline(db, alpha, stage="Paused", doi=None, frozen_doi=3)
        resp = test_client.post(
            f"/api/projects/{alpha}/pipeline/transition",
            headers=HEADERS_CTRL,
            json={"target_stage": "Active", "override_reason": "resume"},
        )
        # We provide override_reason because DoI 3 gate may not be met on
        # this minimal project — the assertion is about the DoI restore.
        assert resp.status_code == 200
        proj = db.query(Project).filter(Project.id == alpha).first()
        assert proj.pipeline_stage == "Active"
        assert proj.doi == 3
        assert proj.frozen_doi is None


# ---------------------------------------------------------------------------
# Authorization
# ---------------------------------------------------------------------------

class TestTransitionAuthorization:
    def test_pl_forbidden_on_other_project(self, test_client, db, other):
        _set_pipeline(db, other, stage="Proposed", doi=0)
        resp = test_client.post(
            f"/api/projects/{other}/pipeline/transition",
            headers=HEADERS_PL,
            json={"target_stage": "Under Evaluation", "target_doi": 1,
                  "override_reason": "x"},
        )
        assert resp.status_code == 403

    def test_pl_forbidden_for_target_doi_above_2(self, test_client, db, alpha):
        _set_pipeline(db, alpha, stage="Under Evaluation", doi=2)
        resp = test_client.post(
            f"/api/projects/{alpha}/pipeline/transition",
            headers=HEADERS_PL,
            json={"target_stage": "Approved"},
        )
        assert resp.status_code == 403

    def test_executive_forbidden(self, test_client, db, alpha):
        _set_pipeline(db, alpha, stage="Proposed", doi=0)
        resp = test_client.post(
            f"/api/projects/{alpha}/pipeline/transition",
            headers=HEADERS_EXEC,
            json={"target_stage": "Under Evaluation"},
        )
        assert resp.status_code == 403

    def test_cc_owner_forbidden(self, test_client, db, alpha):
        _set_pipeline(db, alpha, stage="Proposed", doi=0)
        resp = test_client.post(
            f"/api/projects/{alpha}/pipeline/transition",
            headers=HEADERS_CC,
            json={"target_stage": "Under Evaluation"},
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# AI Council endpoint
# ---------------------------------------------------------------------------

class TestAICouncilEndpoint:
    def test_controller_sets_flag_and_url(self, test_client, db, alpha):
        _set_pipeline(db, alpha, stage="Proposed", doi=0)
        resp = test_client.put(
            f"/api/projects/{alpha}/pipeline/ai-council",
            headers=HEADERS_CTRL,
            json={
                "ai_council_approved": True,
                "ai_council_doc_url": "https://onedrive/test",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["ai_council_approved"] is True
        assert data["ai_council_doc_url"] == "https://onedrive/test"
        # Audit rows should exist for both fields.
        rows = db.query(AuditLog).filter(AuditLog.entity_type == "ai_council").all()
        fields = {r.field_changed for r in rows}
        assert "ai_council_approved" in fields
        assert "ai_council_doc_url" in fields

    def test_pl_forbidden(self, test_client, db, alpha):
        _set_pipeline(db, alpha, stage="Proposed", doi=0)
        resp = test_client.put(
            f"/api/projects/{alpha}/pipeline/ai-council",
            headers=HEADERS_PL,
            json={"ai_council_approved": True},
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# within_cutoff endpoint
# ---------------------------------------------------------------------------

class TestWithinCutoffEndpoint:
    def test_controller_sets_within_cutoff(self, test_client, db, alpha):
        _set_pipeline(db, alpha, stage="Approved", doi=3, within_cutoff=False)
        resp = test_client.put(
            f"/api/projects/{alpha}/pipeline/within-cutoff",
            headers=HEADERS_CTRL,
            json={"within_cutoff": True, "reason": "demo"},
        )
        assert resp.status_code == 200
        assert resp.json()["within_cutoff"] is True
        rows = db.query(AuditLog).filter(AuditLog.entity_type == "within_cutoff").all()
        assert len(rows) == 1
        assert "demo" in (rows[0].new_value or "")

    def test_pl_forbidden(self, test_client, db, alpha):
        _set_pipeline(db, alpha, stage="Approved", doi=3)
        resp = test_client.put(
            f"/api/projects/{alpha}/pipeline/within-cutoff",
            headers=HEADERS_PL,
            json={"within_cutoff": True},
        )
        assert resp.status_code == 403
