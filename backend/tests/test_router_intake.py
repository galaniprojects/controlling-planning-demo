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
        review_state="pending_approval",
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
        assert data["review_state"] is None
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
        assert data["review_state"] is None

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
        assert data["review_state"] is None

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


# ---------------------------------------------------------------------------
# 9. DoI 2→3 BTC gate [A-PL-06] (F3)
# ---------------------------------------------------------------------------

def _seed_eval_project_with_ce(
    db, seed_hierarchy,
    to_business_pct=60.0,
    project_id="proj-btc-gate",
) -> tuple:
    """Insert an Under Evaluation project with a linked ChargeableEntity."""
    from models.charging import ChargeableEntity
    from models.organization import GroupingEntityType, GroupingEntity

    et = GroupingEntityType(id="get-lob-g", name="LoBGate")
    lob = GroupingEntity(id="lob-gate", entity_type_id="get-lob-g", name="Gate LoB")
    db.add_all([et, lob])
    db.flush()

    proj = Project(
        id=project_id,
        name="BTC Gate Project",
        description="gate",
        review_state="pending_approval",
        capex_opex="capex",
        start_month="2026-06",
        pl_person_id="p-pm-1",
        project_type=1,
        pipeline_stage=UNDER_EVALUATION,
        doi=2,
        ai_council_approved=True,
        is_active=True,
    )
    db.add(proj)
    db.flush()

    ce = ChargeableEntity(
        id=f"ce-{project_id}", entity_type="Project",
        identifier=f"IT0{project_id[-3:]}001" if len(project_id) >= 3 else "IT0999",
        name="CE for Gate Project",
        project_id=project_id,
        to_business_pct=to_business_pct,
        hierarchy_node_id="lob-gate",
        is_active=True,
    )
    db.add(ce)
    db.commit()
    return proj, ce


class TestDoiBTCGate:
    def test_approve_no_ce_succeeds(
        self, test_client, seed_personas, seed_hierarchy, db,
    ):
        """Project with no ChargeableEntity skips BTC gate — should approve normally."""
        proj = _seed_eval_project(db, None, seed_hierarchy, project_id="proj-no-ce")
        resp = test_client.post(
            f"/api/intake/projects/{proj.id}/approve",
            json={"comments": "ok"}, headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["doi"] == 3

    def test_approve_zero_to_business_pct_skips_gate(
        self, test_client, seed_personas, seed_hierarchy, db,
    ):
        """CE with to_business_pct=0 has no BTC requirement — should approve normally."""
        proj, _ = _seed_eval_project_with_ce(
            db, seed_hierarchy, to_business_pct=0.0, project_id="proj-zero-pct",
        )
        resp = test_client.post(
            f"/api/intake/projects/{proj.id}/approve",
            json={"comments": "ok"}, headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["doi"] == 3

    def test_approve_with_active_btc_profile_succeeds(
        self, test_client, seed_personas, seed_hierarchy, db,
    ):
        """CE with to_business_pct>0 AND an active BTC profile — gate passes."""
        from models.charging import BTCProfile, BTCProfileLine, ChargingLocation
        proj, ce = _seed_eval_project_with_ce(
            db, seed_hierarchy, to_business_pct=50.0, project_id="proj-has-btc",
        )
        cl = ChargingLocation(id="cl-gate", code="DE-G-001", name="Gate CL", is_active=True)
        db.add(cl)
        db.flush()
        profile = BTCProfile(entity_id=ce.id, year=2026, mode="manual", status="active")
        db.add(profile)
        db.flush()
        line = BTCProfileLine(
            profile_id=profile.id, charging_location_id="cl-gate", percentage=100.0,
        )
        db.add(line)
        db.commit()

        resp = test_client.post(
            f"/api/intake/projects/{proj.id}/approve",
            json={"comments": "BTC present"}, headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["doi"] == 3

    def test_approve_missing_btc_profile_returns_409(
        self, test_client, seed_personas, seed_hierarchy, db,
    ):
        """CE with to_business_pct>0 but NO active BTC profile — gate blocks with 409."""
        proj, _ = _seed_eval_project_with_ce(
            db, seed_hierarchy, to_business_pct=80.0, project_id="proj-no-btc",
        )
        resp = test_client.post(
            f"/api/intake/projects/{proj.id}/approve",
            json={"comments": "attempt"}, headers=HEADERS_CTRL,
        )
        assert resp.status_code == 409, resp.text
        detail = resp.json()["detail"]
        # Error message should reference BTC
        assert "btc" in detail.lower() or "charging" in detail.lower()

    def test_approve_draft_btc_profile_still_blocks(
        self, test_client, seed_personas, seed_hierarchy, db,
    ):
        """Draft BTC profile does NOT satisfy the gate — must be active."""
        from models.charging import BTCProfile, BTCProfileLine, ChargingLocation
        proj, ce = _seed_eval_project_with_ce(
            db, seed_hierarchy, to_business_pct=40.0, project_id="proj-draft-btc",
        )
        cl = ChargingLocation(id="cl-gate2", code="DE-G-002", name="Gate CL2", is_active=True)
        db.add(cl)
        db.flush()
        # Only a DRAFT profile, not active
        profile = BTCProfile(entity_id=ce.id, year=2026, mode="manual", status="draft")
        db.add(profile)
        db.flush()
        line = BTCProfileLine(
            profile_id=profile.id, charging_location_id="cl-gate2", percentage=100.0,
        )
        db.add(line)
        db.commit()

        resp = test_client.post(
            f"/api/intake/projects/{proj.id}/approve",
            json={"comments": "draft only"}, headers=HEADERS_CTRL,
        )
        assert resp.status_code == 409, resp.text

    def test_approve_with_active_automatic_internal_service_btc_succeeds(
        self, test_client, seed_personas, seed_hierarchy, db,
    ):
        """FD-4 [F-S2-01]: an active *automatic* BTC profile for an
        InternalService CE satisfies the DoI 2→3 gate. This is the only
        supported path now that InternalService manual mode is gated.
        """
        from datetime import datetime as _dt
        from models.charging import (
            BTCProfile, BTCProfileLine, ChargingLocation, ChargeableEntity,
        )
        from models.organization import GroupingEntityType, GroupingEntity

        # Standalone setup (this CE has entity_type='InternalService', not 'Project'
        # — so we can't reuse _seed_eval_project_with_ce which hard-codes Project).
        et = GroupingEntityType(id="get-lob-svc", name="LoBSvc")
        lob = GroupingEntity(id="lob-svc", entity_type_id="get-lob-svc", name="Svc LoB")
        db.add_all([et, lob])
        db.flush()

        proj = Project(
            id="proj-svc-btc",
            name="Service-BTC Gate Project",
            description="gate-svc",
            review_state="pending_approval",
            capex_opex="capex",
            start_month="2026-06",
            pl_person_id="p-pm-1",
            project_type=1,
            pipeline_stage=UNDER_EVALUATION,
            doi=2,
            ai_council_approved=True,
            is_active=True,
        )
        db.add(proj)
        db.flush()

        ce = ChargeableEntity(
            id="ce-proj-svc-btc", entity_type="InternalService",
            identifier="ITF20088", name="Linked Internal Service",
            project_id="proj-svc-btc",
            to_business_pct=25.0,
            hierarchy_node_id="lob-svc",
            is_active=True,
        )
        db.add(ce)
        db.flush()

        cl = ChargingLocation(
            id="cl-svc", code="DE-S-001", name="Svc CL", is_active=True,
        )
        db.add(cl)
        db.flush()

        profile = BTCProfile(
            entity_id=ce.id, year=2026, mode="automatic",
            s_code="S301", status="active",
            um_snapshot_at=_dt(2026, 1, 15, 10, 0, 0),
        )
        db.add(profile)
        db.flush()
        db.add(BTCProfileLine(
            profile_id=profile.id, charging_location_id="cl-svc", percentage=100.0,
        ))
        db.commit()

        resp = test_client.post(
            f"/api/intake/projects/{proj.id}/approve",
            json={"comments": "auto svc BTC active"}, headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["doi"] == 3
