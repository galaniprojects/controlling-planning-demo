"""Integration tests for backend/routers/ranking.py [A-BK-09..A-BK-14].

Exercises the three new endpoints plus the trigger hooks wired into the
existing pipeline / admin / portfolio / workbench routers.
"""

from __future__ import annotations

import pytest

from models.projects import Project
from models.system import AuditLog, PlanningParameter


HEADERS_CTRL = {"X-Current-User": "persona-controller"}
HEADERS_PL = {"X-Current-User": "persona-pl"}
HEADERS_EXEC = {"X-Current-User": "persona-exec"}
HEADERS_CC = {"X-Current-User": "persona-cc-owner"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _seed_envelope(db, value: float = 1000.0) -> None:
    db.add(PlanningParameter(
        key="ranking_total_available_budget",
        name="Total Available Budget",
        current_value=str(int(value)),
        default_value=str(int(value)),
        data_type="integer", param_group="ranking",
    ))
    db.commit()


def _add_project(
    db,
    *,
    project_id: str,
    pipeline_stage: str = "Approved",
    composite_score: float | None = 4.0,
    doi: int | None = 3,
    project_type: int | None = 1,
    total_budget: float | None = 100.0,
    within_cutoff: bool | None = None,
    name: str | None = None,
    is_active: bool = True,
) -> Project:
    proj = Project(
        id=project_id,
        name=name or project_id,
        status="active",
        capex_opex="capex",
        start_month="2026-01",
        end_month="2026-12",
        is_service=False,
        is_active=is_active,
        pipeline_stage=pipeline_stage,
        doi=doi,
        project_type=project_type,
        total_budget=total_budget,
        within_cutoff=within_cutoff,
        composite_score=composite_score,
    )
    db.add(proj)
    db.commit()
    return proj


# ---------------------------------------------------------------------------
# GET /api/portfolio/backlog
# ---------------------------------------------------------------------------

class TestGetBacklog:
    @pytest.mark.parametrize("headers", [
        HEADERS_CTRL, HEADERS_PL, HEADERS_EXEC, HEADERS_CC,
    ])
    def test_open_to_all_authenticated_roles(self, test_client, db, seed_personas, headers):
        _seed_envelope(db)
        _add_project(db, project_id="p-a")
        resp = test_client.get("/api/portfolio/backlog", headers=headers)
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert "items" in data
        assert "cutoff" in data
        assert "config" in data

    def test_unauthenticated_returns_422(self, test_client, db, seed_personas):
        _seed_envelope(db)
        resp = test_client.get("/api/portfolio/backlog")
        assert resp.status_code == 422

    def test_unknown_persona_rejected(self, test_client, db, seed_personas):
        _seed_envelope(db)
        resp = test_client.get(
            "/api/portfolio/backlog",
            headers={"X-Current-User": "persona-bogus"},
        )
        assert resp.status_code == 401

    def test_items_ordered_with_sequential_ranks(self, test_client, db, seed_personas):
        _seed_envelope(db)
        _add_project(db, project_id="p-low", composite_score=2.0, doi=2)
        _add_project(db, project_id="p-high", composite_score=5.0, doi=2)
        _add_project(db, project_id="p-mid", composite_score=3.5, doi=2)
        resp = test_client.get("/api/portfolio/backlog", headers=HEADERS_CTRL)
        items = resp.json()["items"]
        assert [i["project_id"] for i in items] == ["p-high", "p-mid", "p-low"]
        assert [i["rank"] for i in items] == [1, 2, 3]

    def test_type_3_segregated_to_pre_funded(self, test_client, db, seed_personas):
        _seed_envelope(db)
        _add_project(db, project_id="p-t1", project_type=1, composite_score=5.0)
        _add_project(db, project_id="p-t3", project_type=3, composite_score=5.0,
                     pipeline_stage="Approved")
        resp = test_client.get("/api/portfolio/backlog", headers=HEADERS_CTRL)
        body = resp.json()
        item_ids = [i["project_id"] for i in body["items"]]
        pre_ids = [i["project_id"] for i in body["pre_funded"]]
        assert item_ids == ["p-t1"]
        assert "p-t3" in pre_ids

    def test_filter_by_pipeline_stage(self, test_client, db, seed_personas):
        # Both projects are backlog stages (VIPER §3.3); the pipeline_stage
        # query param narrows visibility to one of them.
        _seed_envelope(db)
        _add_project(db, project_id="p-app", pipeline_stage="Approved", composite_score=5.0)
        _add_project(db, project_id="p-prop", pipeline_stage="Proposed", composite_score=4.0)
        resp = test_client.get(
            "/api/portfolio/backlog?pipeline_stage=Approved",
            headers=HEADERS_CTRL,
        )
        items = resp.json()["items"]
        assert [i["project_id"] for i in items] == ["p-app"]
        # Filter is visibility-only — both backlog projects still drive the cutoff math.
        assert resp.json()["cutoff"]["contestable_envelope"] == 1000.0

    def test_filter_by_project_type(self, test_client, db, seed_personas):
        _seed_envelope(db)
        _add_project(db, project_id="p-t1", project_type=1, composite_score=5.0)
        _add_project(db, project_id="p-t2", project_type=2, composite_score=4.0)
        resp = test_client.get(
            "/api/portfolio/backlog?project_type=1",
            headers=HEADERS_CTRL,
        )
        items = resp.json()["items"]
        assert [i["project_id"] for i in items] == ["p-t1"]


# ---------------------------------------------------------------------------
# GET /api/portfolio/backlog/cutoff
# ---------------------------------------------------------------------------

class TestGetCutoff:
    def test_returns_cutoff_summary(self, test_client, db, seed_personas):
        _seed_envelope(db, 1500.0)
        _add_project(db, project_id="p-a", total_budget=400, composite_score=5.0)
        _add_project(db, project_id="p-b", total_budget=400, composite_score=4.0)
        resp = test_client.get("/api/portfolio/backlog/cutoff", headers=HEADERS_EXEC)
        assert resp.status_code == 200
        body = resp.json()
        assert body["cutoff"]["total_available_budget"] == 1500.0
        assert body["cutoff"]["contestable_envelope"] == 1500.0
        assert body["config"]["horizon_months"] == 12

    def test_matches_full_backlog_endpoint(self, test_client, db, seed_personas):
        _seed_envelope(db, 500.0)
        _add_project(db, project_id="p-a", total_budget=300, composite_score=5.0)
        _add_project(db, project_id="p-b", total_budget=300, composite_score=4.0)
        full = test_client.get("/api/portfolio/backlog", headers=HEADERS_CTRL).json()
        slim = test_client.get("/api/portfolio/backlog/cutoff", headers=HEADERS_CTRL).json()
        assert full["cutoff"] == slim["cutoff"]


# ---------------------------------------------------------------------------
# POST /api/portfolio/backlog/rebalance
# ---------------------------------------------------------------------------

class TestRebalance:
    def test_controller_can_rebalance(self, test_client, db, seed_personas):
        _seed_envelope(db, 500.0)
        top = _add_project(db, project_id="p-top",
                           pipeline_stage="Approved",
                           composite_score=5.0, total_budget=300)
        bot = _add_project(db, project_id="p-bot",
                           pipeline_stage="Approved",
                           composite_score=2.0, total_budget=300)

        resp = test_client.post("/api/portfolio/backlog/rebalance", headers=HEADERS_CTRL)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["recomputed"] >= 2
        assert body["changed"] >= 1

        db.refresh(top)
        db.refresh(bot)
        assert top.within_cutoff is True
        assert bot.within_cutoff is False

    @pytest.mark.parametrize("headers", [HEADERS_PL, HEADERS_EXEC, HEADERS_CC])
    def test_non_controller_forbidden(self, test_client, db, seed_personas, headers):
        _seed_envelope(db)
        _add_project(db, project_id="p-a")
        resp = test_client.post("/api/portfolio/backlog/rebalance", headers=headers)
        assert resp.status_code == 403

    def test_idempotent(self, test_client, db, seed_personas):
        _seed_envelope(db, 500.0)
        _add_project(db, project_id="p-1", pipeline_stage="Approved",
                     composite_score=5.0, total_budget=300)
        _add_project(db, project_id="p-2", pipeline_stage="Approved",
                     composite_score=2.0, total_budget=300)

        first = test_client.post("/api/portfolio/backlog/rebalance",
                                 headers=HEADERS_CTRL).json()
        second = test_client.post("/api/portfolio/backlog/rebalance",
                                  headers=HEADERS_CTRL).json()
        assert second["changed"] == 0
        assert first["cutoff"] == second["cutoff"]

    def test_audit_row_written(self, test_client, db, seed_personas):
        _seed_envelope(db)
        _add_project(db, project_id="p-1", pipeline_stage="Approved")
        resp = test_client.post("/api/portfolio/backlog/rebalance", headers=HEADERS_CTRL)
        assert resp.status_code == 200
        rows = (
            db.query(AuditLog)
            .filter(AuditLog.entity_type == "within_cutoff")
            .filter(AuditLog.action == "rebalance")
            .all()
        )
        assert len(rows) == 1
        assert rows[0].entity_id == "portfolio"
        assert "envelope=" in (rows[0].new_value or "")


# ---------------------------------------------------------------------------
# Trigger hook integrations
# ---------------------------------------------------------------------------

class TestTriggerHooks:
    """Confirm the recompute hook fires from the existing endpoints."""

    def test_pipeline_transition_triggers_recompute(
        self, test_client, db, seed_personas
    ):
        # Two Approved projects — one fits, one doesn't. The hook should
        # mark the lower-scored one as outside the cutoff.
        _seed_envelope(db, 500.0)
        top = _add_project(db, project_id="p-top",
                           pipeline_stage="Approved",
                           composite_score=5.0, total_budget=300,
                           within_cutoff=None)
        bot = _add_project(db, project_id="p-bot",
                           pipeline_stage="Under Evaluation",
                           composite_score=2.0, doi=2, total_budget=300,
                           within_cutoff=None)
        # Transitioning Under Evaluation -> Approved should fire the hook
        # and recompute within_cutoff for both projects.
        resp = test_client.post(
            f"/api/projects/{bot.id}/pipeline/transition",
            json={"target_stage": "Approved", "target_doi": 3,
                  "override_reason": "test fixture"},
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200, resp.text

        db.refresh(top)
        db.refresh(bot)
        # Top now fits within envelope (cum=300 ≤ 500) → True.
        assert top.within_cutoff is True
        # Bot pushes cumulative to 600 > 500 → False.
        assert bot.within_cutoff is False

    def test_admin_recompute_scores_triggers_recompute(
        self, test_client, db, seed_personas
    ):
        _seed_envelope(db, 500.0)
        proj = _add_project(db, project_id="p-app",
                            pipeline_stage="Approved",
                            composite_score=4.0, total_budget=300,
                            within_cutoff=None)
        resp = test_client.post(
            "/api/admin/recompute-scores",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200, resp.text
        db.refresh(proj)
        # 300 ≤ 500 → True after recompute.
        assert proj.within_cutoff is True

    def test_admin_update_parameters_triggers_recompute_on_ranking_key(
        self, test_client, db, seed_personas
    ):
        _seed_envelope(db, 500.0)
        proj = _add_project(db, project_id="p-app",
                            pipeline_stage="Approved",
                            composite_score=4.0, total_budget=300,
                            within_cutoff=None)
        # Change envelope to 100 — project should now be outside cutoff.
        resp = test_client.put(
            "/api/admin/parameters",
            json={"changes": [
                {"key": "ranking_total_available_budget", "new_value": "100"}
            ]},
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200, resp.text
        db.refresh(proj)
        assert proj.within_cutoff is False
