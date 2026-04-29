"""Integration tests for routers/intake.py [A-BK-26..A-BK-29]."""

from __future__ import annotations

import pytest

from models.projects import Project
from models.submissions import ProjectSubmissionSnapshot
from services.intake_workflow import (
    APPROVED,
    CANCELLED,
    PROPOSED,
    SNAPSHOT_CONTROLLER_SENT_BACK,
    UNDER_EVALUATION,
)


HEADERS_CTRL = {"X-Current-User": "persona-controller"}
HEADERS_PL = {"X-Current-User": "persona-pl"}
HEADERS_EXEC = {"X-Current-User": "persona-exec"}
HEADERS_CC = {"X-Current-User": "persona-cc-owner"}


def _seed_eval_project(
    db, seed_org_base, seed_hierarchy, project_id="proj-eval", pl="p-pm-1",
) -> Project:
    """Insert a project at Under Evaluation / DoI 2 ready for controller actions."""
    p = Project(
        id=project_id,
        name="Eval Project",
        description="ready",
        status="pending_approval",
        capex_opex="capex",
        start_month="2026-06",
        end_month=None,
        pl_person_id=pl,
        project_type=1,
        pipeline_stage=UNDER_EVALUATION,
        doi=2,
        ai_council_approved=True,
        is_active=True,
    )
    db.add(p)
    db.commit()
    return p


# ---------------------------------------------------------------------------
# 1. POST /api/intake/projects
# ---------------------------------------------------------------------------

class TestCreateProjectEndpoint:
    BODY = {
        "name": "New IT Initiative",
        "description": "Initial pitch text",
        "lob_id": "lob-alpha",
        "project_type": 1,
        "capex_opex": "capex",
        "start_month": "2026-09",
        "pl_person_id": "p-pm-1",
    }

    def test_controller_creates_201(self, test_client, seed_personas, seed_hierarchy):
        resp = test_client.post(
            "/api/intake/projects", json=self.BODY, headers=HEADERS_CTRL,
        )
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["pipeline_stage"] == PROPOSED
        assert data["doi"] == 0
        assert data["status"] == "draft"
        assert data["pl_person_id"] == "p-pm-1"
        assert data["project_type"] == 1

    def test_pl_creates_self_201(self, test_client, seed_personas, seed_hierarchy):
        body = {**self.BODY}
        body.pop("pl_person_id")
        resp = test_client.post(
            "/api/intake/projects", json=body, headers=HEADERS_PL,
        )
        assert resp.status_code == 201, resp.text
        data = resp.json()
        # PL persona is p-pm-1 in conftest seed
        assert data["pl_person_id"] == "p-pm-1"

    def test_executive_creates_201(self, test_client, seed_personas, seed_hierarchy):
        resp = test_client.post(
            "/api/intake/projects", json=self.BODY, headers=HEADERS_EXEC,
        )
        assert resp.status_code == 201, resp.text

    def test_cc_owner_forbidden_403(self, test_client, seed_personas, seed_hierarchy):
        resp = test_client.post(
            "/api/intake/projects", json=self.BODY, headers=HEADERS_CC,
        )
        assert resp.status_code == 403

    def test_missing_name_422(self, test_client, seed_personas, seed_hierarchy):
        body = {**self.BODY}
        body.pop("name")
        resp = test_client.post(
            "/api/intake/projects", json=body, headers=HEADERS_CTRL,
        )
        assert resp.status_code == 422

    def test_invalid_project_type_422(self, test_client, seed_personas, seed_hierarchy):
        body = {**self.BODY, "project_type": 9}
        resp = test_client.post(
            "/api/intake/projects", json=body, headers=HEADERS_CTRL,
        )
        assert resp.status_code == 422

    def test_appears_in_intake_queue_at_bottom(
        self, test_client, seed_personas, seed_hierarchy, db,
    ):
        # New project is created at DoI 0 / Proposed — should NOT appear in
        # the Under-Evaluation queue. Confirm via /api/intake/queue.
        resp = test_client.post(
            "/api/intake/projects", json=self.BODY, headers=HEADERS_CTRL,
        )
        assert resp.status_code == 201
        queue_resp = test_client.get("/api/intake/queue", headers=HEADERS_CTRL)
        assert queue_resp.status_code == 200
        queue = queue_resp.json()
        # New project is in "Proposed" stage, so not in the Under Eval queue.
        assert all(item["pipeline_stage"] != PROPOSED for item in queue["items"])


# ---------------------------------------------------------------------------
# 2. POST /api/intake/projects/{id}/approve
# ---------------------------------------------------------------------------

class TestApproveEndpoint:
    def test_controller_approves_200(self, test_client, seed_personas, seed_hierarchy, db):
        proj = _seed_eval_project(db, None, seed_hierarchy)
        resp = test_client.post(
            f"/api/intake/projects/{proj.id}/approve",
            json={"comments": "LGTM"}, headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["pipeline_stage"] == APPROVED
        assert data["doi"] == 3
        assert data["status"] == "active"

    def test_404_unknown_project(self, test_client, seed_personas, seed_hierarchy):
        resp = test_client.post(
            "/api/intake/projects/proj-nope/approve",
            json={"comments": "x"}, headers=HEADERS_CTRL,
        )
        assert resp.status_code == 404

    def test_403_pl(self, test_client, seed_personas, seed_hierarchy, db):
        proj = _seed_eval_project(db, None, seed_hierarchy)
        resp = test_client.post(
            f"/api/intake/projects/{proj.id}/approve",
            json={"comments": "x"}, headers=HEADERS_PL,
        )
        assert resp.status_code == 403

    def test_409_wrong_stage(self, test_client, seed_personas, seed_hierarchy, db):
        proj = _seed_eval_project(db, None, seed_hierarchy)
        proj.pipeline_stage = PROPOSED
        proj.doi = 1
        db.commit()
        resp = test_client.post(
            f"/api/intake/projects/{proj.id}/approve",
            json={"comments": "x"}, headers=HEADERS_CTRL,
        )
        assert resp.status_code == 409


# ---------------------------------------------------------------------------
# 3. POST /api/intake/projects/{id}/send-back
# ---------------------------------------------------------------------------

class TestSendBackEndpoint:
    def test_controller_sends_back_200(
        self, test_client, seed_personas, seed_hierarchy, db,
    ):
        proj = _seed_eval_project(db, None, seed_hierarchy)
        resp = test_client.post(
            f"/api/intake/projects/{proj.id}/send-back",
            json={"comments": "Needs scoring"}, headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["pipeline_stage"] == PROPOSED
        assert data["doi"] == 1

    def test_422_missing_comments(
        self, test_client, seed_personas, seed_hierarchy, db,
    ):
        proj = _seed_eval_project(db, None, seed_hierarchy)
        resp = test_client.post(
            f"/api/intake/projects/{proj.id}/send-back",
            json={}, headers=HEADERS_CTRL,
        )
        assert resp.status_code == 422

    def test_403_pl(self, test_client, seed_personas, seed_hierarchy, db):
        proj = _seed_eval_project(db, None, seed_hierarchy)
        resp = test_client.post(
            f"/api/intake/projects/{proj.id}/send-back",
            json={"comments": "x"}, headers=HEADERS_PL,
        )
        assert resp.status_code == 403

    def test_409_wrong_stage(self, test_client, seed_personas, seed_hierarchy, db):
        proj = _seed_eval_project(db, None, seed_hierarchy)
        proj.pipeline_stage = APPROVED
        proj.doi = 3
        db.commit()
        resp = test_client.post(
            f"/api/intake/projects/{proj.id}/send-back",
            json={"comments": "x"}, headers=HEADERS_CTRL,
        )
        assert resp.status_code == 409

    def test_snapshot_persisted(self, test_client, seed_personas, seed_hierarchy, db):
        proj = _seed_eval_project(db, None, seed_hierarchy)
        resp = test_client.post(
            f"/api/intake/projects/{proj.id}/send-back",
            json={"comments": "Refine TN"}, headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        snap = (
            db.query(ProjectSubmissionSnapshot)
            .filter(
                ProjectSubmissionSnapshot.project_id == proj.id,
                ProjectSubmissionSnapshot.snapshot_type == SNAPSHOT_CONTROLLER_SENT_BACK,
            )
            .first()
        )
        assert snap is not None
        assert snap.comments == "Refine TN"


# ---------------------------------------------------------------------------
# 4. POST /api/intake/projects/{id}/reject
# ---------------------------------------------------------------------------

class TestRejectEndpoint:
    def test_controller_rejects_200(
        self, test_client, seed_personas, seed_hierarchy, db,
    ):
        proj = _seed_eval_project(db, None, seed_hierarchy)
        resp = test_client.post(
            f"/api/intake/projects/{proj.id}/reject",
            json={"reason": "Out of strategy"}, headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["pipeline_stage"] == CANCELLED
        assert data["doi"] == 0  # null → response default 0
        assert data["status"] == "rejected"

    def test_422_missing_reason(
        self, test_client, seed_personas, seed_hierarchy, db,
    ):
        proj = _seed_eval_project(db, None, seed_hierarchy)
        resp = test_client.post(
            f"/api/intake/projects/{proj.id}/reject",
            json={}, headers=HEADERS_CTRL,
        )
        assert resp.status_code == 422

    def test_403_pl(self, test_client, seed_personas, seed_hierarchy, db):
        proj = _seed_eval_project(db, None, seed_hierarchy)
        resp = test_client.post(
            f"/api/intake/projects/{proj.id}/reject",
            json={"reason": "x"}, headers=HEADERS_PL,
        )
        assert resp.status_code == 403

    def test_409_wrong_stage(self, test_client, seed_personas, seed_hierarchy, db):
        proj = _seed_eval_project(db, None, seed_hierarchy)
        proj.pipeline_stage = APPROVED
        db.commit()
        resp = test_client.post(
            f"/api/intake/projects/{proj.id}/reject",
            json={"reason": "x"}, headers=HEADERS_CTRL,
        )
        assert resp.status_code == 409


# ---------------------------------------------------------------------------
# 5. POST /api/intake/projects/{id}/resubmit
# ---------------------------------------------------------------------------

class TestResubmitEndpoint:
    def _send_back_via_api(self, test_client, db, proj):
        resp = test_client.post(
            f"/api/intake/projects/{proj.id}/send-back",
            json={"comments": "Polish"}, headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200, resp.text
        db.refresh(proj)

    def test_pl_resubmits_own_200(
        self, test_client, seed_personas, seed_hierarchy, db,
    ):
        # PL persona p-pm-1 owns "proj-alpha" / "proj-beta" (seed_personas).
        proj = _seed_eval_project(db, None, seed_hierarchy, project_id="proj-alpha", pl="p-pm-1")
        self._send_back_via_api(test_client, db, proj)
        resp = test_client.post(
            f"/api/intake/projects/{proj.id}/resubmit",
            json={"resubmission_notes": "fixed"}, headers=HEADERS_PL,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["pipeline_stage"] == UNDER_EVALUATION
        assert resp.json()["doi"] == 2

    def test_controller_can_resubmit_anyone_200(
        self, test_client, seed_personas, seed_hierarchy, db,
    ):
        proj = _seed_eval_project(db, None, seed_hierarchy)
        self._send_back_via_api(test_client, db, proj)
        resp = test_client.post(
            f"/api/intake/projects/{proj.id}/resubmit",
            json={}, headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200, resp.text

    def test_pl_403_other_project(
        self, test_client, seed_personas, seed_hierarchy, db,
    ):
        # Project owned by p-dev-2, PL persona's person is p-pm-1.
        proj = _seed_eval_project(
            db, None, seed_hierarchy,
            project_id="proj-other", pl="p-dev-2",
        )
        self._send_back_via_api(test_client, db, proj)
        resp = test_client.post(
            f"/api/intake/projects/{proj.id}/resubmit",
            json={}, headers=HEADERS_PL,
        )
        assert resp.status_code == 403

    def test_409_when_not_sent_back(
        self, test_client, seed_personas, seed_hierarchy, db,
    ):
        proj = _seed_eval_project(db, None, seed_hierarchy)
        # Without first being sent back
        resp = test_client.post(
            f"/api/intake/projects/{proj.id}/resubmit",
            json={}, headers=HEADERS_CTRL,
        )
        assert resp.status_code == 409


# ---------------------------------------------------------------------------
# 6. GET /api/intake/projects/{id}/diff
# ---------------------------------------------------------------------------

class TestDiffEndpoint:
    def test_404_no_send_back_yet(
        self, test_client, seed_personas, seed_hierarchy, db,
    ):
        proj = _seed_eval_project(db, None, seed_hierarchy)
        resp = test_client.get(
            f"/api/intake/projects/{proj.id}/diff", headers=HEADERS_CTRL,
        )
        assert resp.status_code == 404

    def test_200_after_send_back(
        self, test_client, seed_personas, seed_hierarchy, db,
    ):
        proj = _seed_eval_project(db, None, seed_hierarchy)
        test_client.post(
            f"/api/intake/projects/{proj.id}/send-back",
            json={"comments": "x"}, headers=HEADERS_CTRL,
        )
        resp = test_client.get(
            f"/api/intake/projects/{proj.id}/diff", headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["project_id"] == proj.id
        assert isinstance(data["fields"], list)
        assert any(f["field"] == "composite_score" for f in data["fields"])

    def test_invalid_type_422(
        self, test_client, seed_personas, seed_hierarchy, db,
    ):
        proj = _seed_eval_project(db, None, seed_hierarchy)
        test_client.post(
            f"/api/intake/projects/{proj.id}/send-back",
            json={"comments": "x"}, headers=HEADERS_CTRL,
        )
        resp = test_client.get(
            f"/api/intake/projects/{proj.id}/diff?type=banana",
            headers=HEADERS_CTRL,
        )
        # FastAPI's Literal validator returns 422 here.
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# 7. GET /api/intake/queue
# ---------------------------------------------------------------------------

class TestQueueEndpoint:
    def test_lists_under_evaluation_only(
        self, test_client, seed_personas, seed_hierarchy, db,
    ):
        proj_eval = _seed_eval_project(db, None, seed_hierarchy)
        # Add a Proposed project that should not appear
        proj_proposed = Project(
            id="proj-prop",
            name="Proposed Project",
            description="d",
            status="draft",
            capex_opex="capex",
            start_month="2026-06",
            pipeline_stage=PROPOSED,
            doi=0,
            project_type=1,
            ai_council_approved=False,
            is_active=True,
        )
        db.add(proj_proposed)
        db.commit()
        resp = test_client.get("/api/intake/queue", headers=HEADERS_CTRL)
        assert resp.status_code == 200
        items = resp.json()["items"]
        ids = [i["id"] for i in items]
        assert proj_eval.id in ids
        assert "proj-prop" not in ids

    def test_response_shape(
        self, test_client, seed_personas, seed_hierarchy, db,
    ):
        _seed_eval_project(db, None, seed_hierarchy)
        resp = test_client.get("/api/intake/queue", headers=HEADERS_CTRL)
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data and "total" in data
        assert data["total"] == len(data["items"])
        keys = {"id", "name", "pipeline_stage", "doi", "project_type",
                "composite_score", "total_budget", "tshirt_size",
                "pl_person_id", "submission_feedback", "ai_council_approved"}
        assert keys <= set(data["items"][0].keys())


# ---------------------------------------------------------------------------
# 8. v4 deprecation — /api/portfolio/intake* endpoints return 410
# ---------------------------------------------------------------------------

class TestV4IntakeDeprecation:
    DEPRECATED_GET = [
        "/api/portfolio/intake",
        "/api/portfolio/intake/proj-x",
        "/api/portfolio/intake/proj-x/diff",
        "/api/portfolio/intake/proj-x/editable-grid",
    ]
    DEPRECATED_PUT = [
        "/api/portfolio/intake/proj-x/approve",
        "/api/portfolio/intake/proj-x/reject",
        "/api/portfolio/intake/proj-x/send-back",
        "/api/portfolio/intake/proj-x/resubmit",
        "/api/portfolio/intake/proj-x/accept-changes",
    ]

    @pytest.mark.parametrize("path", DEPRECATED_GET)
    def test_get_returns_410(self, test_client, seed_personas, path):
        resp = test_client.get(path, headers=HEADERS_CTRL)
        assert resp.status_code == 410, f"{path} returned {resp.status_code}"
        body = resp.json()
        assert body["detail"]["error"] == "v4_intake_removed"

    @pytest.mark.parametrize("path", DEPRECATED_PUT)
    def test_put_returns_410(self, test_client, seed_personas, path):
        resp = test_client.put(path, headers=HEADERS_CTRL, json={})
        assert resp.status_code == 410, f"{path} returned {resp.status_code}"
        body = resp.json()
        assert body["detail"]["error"] == "v4_intake_removed"
