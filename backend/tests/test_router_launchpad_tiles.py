"""Integration tests for v5 Session E2 launchpad role tiles.

Per [E-06d]–[E-06j]. Verifies per-role tile counts and tile content.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest


HEADERS_CTRL = {"X-Current-User": "persona-controller"}
HEADERS_PL = {"X-Current-User": "persona-pl"}
HEADERS_CCO = {"X-Current-User": "persona-cc-owner"}
HEADERS_EXEC = {"X-Current-User": "persona-exec"}


@pytest.fixture
def seed_launchpad_data(db, seed_org_base, seed_personas):
    """Seed projects + scenarios + allocations for tile metric computation."""
    from datetime import datetime
    from models.financial import Forecast, Actuals, ExternalCostType
    from models.projects import Project
    from models.scenarios import Scenario
    from models.capacity import Allocation, ResourceRequest
    from models.change_requests import ChangeRequest

    # Three active projects, two owned by PL, one with red RAG
    proj_alpha = Project(
        id="proj-alpha", name="Alpha", status="active",
        capex_opex="capex", start_month="2026-01", end_month="2026-12",
        pl_person_id="p-pm-1",
        rag_status="green", total_budget=100000.0,
        progress_pct=60.0, last_forecast_submitted_month="2026-04",
        pipeline_stage="Active",
    )
    proj_beta = Project(
        id="proj-beta", name="Beta", status="active",
        capex_opex="capex", start_month="2026-01", end_month="2026-12",
        pl_person_id="p-pm-1",
        rag_status="amber", total_budget=50000.0,
        progress_pct=20.0,
        # Last submitted in Feb — overdue
        last_forecast_submitted_month="2026-02",
        pipeline_stage="Active",
    )
    proj_gamma = Project(
        id="proj-gamma", name="Gamma", status="active",
        capex_opex="capex", start_month="2026-01", end_month="2026-12",
        rag_status="red", total_budget=200000.0,
        last_forecast_submitted_month="2026-04",
        pipeline_stage="Proposed",
        within_cutoff=True,
    )
    proj_delta = Project(
        id="proj-delta", name="Delta", status="pending_approval",
        capex_opex="capex", start_month="2026-01",
        pipeline_stage="Under Evaluation",
        within_cutoff=False,
    )

    db.add_all([proj_alpha, proj_beta, proj_gamma, proj_delta])
    db.flush()

    # Forecast & actuals so YTD figures are non-zero
    db.add(Forecast(project_id="proj-alpha", month="2026-01", category="internal",
                    sub_category="role-dev", amount_eur=5000.0, hours=40))
    db.add(Forecast(project_id="proj-beta", month="2026-01", category="internal",
                    sub_category="role-dev", amount_eur=3000.0, hours=24))
    db.add(Actuals(project_id="proj-alpha", month="2026-01", category="internal",
                   sub_category="role-dev", amount_eur=5500.0, hours=42))
    db.add(Actuals(project_id="proj-beta", month="2026-02", category="internal",
                   sub_category="role-dev", amount_eur=2900.0, hours=22))

    # Two scenarios — one published, one private
    sc_pub = Scenario(
        id=1, name="Published Scenario", description="Test",
        status="published", author_id="p-dev-1", visibility="all_users",
    )
    sc_priv = Scenario(
        id=2, name="Private Scenario", description="Test",
        status="private", author_id="p-pm-1", visibility="private",
    )
    db.add_all([sc_pub, sc_priv])

    # Allocation rows for the CC Owner's CC (cc-muc-dev)
    db.add(Allocation(person_id="p-dev-1", project_id="proj-alpha",
                      month="2026-04", hours=80, is_confirmed=True))
    db.add(Allocation(person_id="p-dev-2", project_id="proj-alpha",
                      month="2026-04", hours=80, is_confirmed=True))
    db.add(Allocation(person_id="p-pm-1", project_id="proj-alpha",
                      month="2026-04", hours=80, is_confirmed=True))

    # Pending CR + open resource request
    db.add(ResourceRequest(
        project_id="proj-alpha", cost_center_id="cc-muc-dev",
        request_type="resource", role_type_id="role-dev",
        hours_or_amount_per_month=80.0,
        period_start="2026-01", period_end="2026-12",
        priority="high", status="pending",
    ))
    db.add(ChangeRequest(
        project_id="proj-alpha", summary="Test CR",
        submitted_by_id="p-pm-1", status="pending_controller_approval",
        cc_owner_id="p-dev-1", submission_timestamp=datetime.utcnow(),
        change_category="resource",
    ))

    db.commit()
    return {"proj-alpha": proj_alpha, "proj-beta": proj_beta}


# ---------------------------------------------------------------------------
# Happy path: counts per role
# ---------------------------------------------------------------------------

@patch("routers.global_launchpad.DEMO_DATE", "2026-04")
class TestLaunchpadTileCounts:
    def test_pl_returns_seven_tiles(self, test_client, seed_launchpad_data):
        resp = test_client.get("/api/launchpad/tiles", headers=HEADERS_PL)
        assert resp.status_code == 200
        data = resp.json()
        assert data["role"] == "project_lead"
        assert data["total"] == 7
        assert len(data["items"]) == 7

    def test_controller_returns_nine_tiles(self, test_client, seed_launchpad_data):
        resp = test_client.get("/api/launchpad/tiles", headers=HEADERS_CTRL)
        assert resp.status_code == 200
        data = resp.json()
        assert data["role"] == "controller"
        assert data["total"] == 9

    def test_cc_owner_returns_eight_tiles(self, test_client, seed_launchpad_data):
        resp = test_client.get("/api/launchpad/tiles", headers=HEADERS_CCO)
        assert resp.status_code == 200
        data = resp.json()
        assert data["role"] == "cost_center_owner"
        assert data["total"] == 8

    def test_executive_returns_seven_tiles(self, test_client, seed_launchpad_data):
        resp = test_client.get("/api/launchpad/tiles", headers=HEADERS_EXEC)
        assert resp.status_code == 200
        data = resp.json()
        assert data["role"] == "executive"
        assert data["total"] == 7


# ---------------------------------------------------------------------------
# PL tile content
# ---------------------------------------------------------------------------

@patch("routers.global_launchpad.DEMO_DATE", "2026-04")
class TestPLTiles:
    def test_pl_tile_shape(self, test_client, seed_launchpad_data):
        resp = test_client.get("/api/launchpad/tiles", headers=HEADERS_PL)
        items = resp.json()["items"]
        for it in items:
            assert "tile_id" in it
            assert "title" in it
            assert "primary_metric" in it
            assert "link_module" in it
            assert "tone" in it

    def test_pl_includes_my_projects(self, test_client, seed_launchpad_data):
        resp = test_client.get("/api/launchpad/tiles", headers=HEADERS_PL)
        ids = {it["tile_id"] for it in resp.json()["items"]}
        assert ids == {
            "pl-my-projects", "pl-my-budget", "pl-my-progress",
            "pl-my-forecast", "pl-recent-changes", "pl-scenario-explorer",
            "pl-resource-availability",
        }

    def test_pl_my_projects_count(self, test_client, seed_launchpad_data):
        resp = test_client.get("/api/launchpad/tiles", headers=HEADERS_PL)
        items = {it["tile_id"]: it for it in resp.json()["items"]}
        # PL owns proj-alpha + proj-beta
        assert "2 project" in items["pl-my-projects"]["primary_metric"]

    def test_pl_forecast_overdue_warning(self, test_client, seed_launchpad_data):
        resp = test_client.get("/api/launchpad/tiles", headers=HEADERS_PL)
        items = {it["tile_id"]: it for it in resp.json()["items"]}
        # proj-beta last submitted Feb so it is pending in Apr
        assert "pending" in items["pl-my-forecast"]["primary_metric"].lower()
        assert items["pl-my-forecast"]["tone"] in {"warning", "alert"}

    def test_pl_my_progress_average(self, test_client, seed_launchpad_data):
        resp = test_client.get("/api/launchpad/tiles", headers=HEADERS_PL)
        items = {it["tile_id"]: it for it in resp.json()["items"]}
        # avg(60, 20) = 40
        assert "40" in items["pl-my-progress"]["primary_metric"]


# ---------------------------------------------------------------------------
# Controller tile content
# ---------------------------------------------------------------------------

@patch("routers.global_launchpad.DEMO_DATE", "2026-04")
class TestControllerTiles:
    def test_controller_tile_ids(self, test_client, seed_launchpad_data):
        resp = test_client.get("/api/launchpad/tiles", headers=HEADERS_CTRL)
        ids = {it["tile_id"] for it in resp.json()["items"]}
        assert ids == {
            "ctrl-portfolio-kpis", "ctrl-pipeline", "ctrl-budget-vs-cutoff",
            "ctrl-reporting", "ctrl-forecast-cycle", "ctrl-pending-reviews",
            "ctrl-capacity-overview", "ctrl-scenario-activity", "ctrl-admin",
        }

    def test_controller_pending_reviews(self, test_client, seed_launchpad_data):
        resp = test_client.get("/api/launchpad/tiles", headers=HEADERS_CTRL)
        items = {it["tile_id"]: it for it in resp.json()["items"]}
        # 1 pending CR + 1 pending intake (proj-delta)
        primary = items["ctrl-pending-reviews"]["primary_metric"]
        assert "2" in primary

    def test_controller_pipeline_count(self, test_client, seed_launchpad_data):
        resp = test_client.get("/api/launchpad/tiles", headers=HEADERS_CTRL)
        items = {it["tile_id"]: it for it in resp.json()["items"]}
        # proj-gamma (Proposed) + proj-delta (Under Evaluation) = 2
        assert "2" in items["ctrl-pipeline"]["primary_metric"]

    def test_controller_scenario_activity(self, test_client, seed_launchpad_data):
        resp = test_client.get("/api/launchpad/tiles", headers=HEADERS_CTRL)
        items = {it["tile_id"]: it for it in resp.json()["items"]}
        assert "1 published" in items["ctrl-scenario-activity"]["primary_metric"]


# ---------------------------------------------------------------------------
# CC Owner tile content
# ---------------------------------------------------------------------------

@patch("routers.global_launchpad.DEMO_DATE", "2026-04")
class TestCCOwnerTiles:
    def test_cco_tile_ids(self, test_client, seed_launchpad_data):
        resp = test_client.get("/api/launchpad/tiles", headers=HEADERS_CCO)
        ids = {it["tile_id"] for it in resp.json()["items"]}
        assert ids == {
            "cco-team-utilization", "cco-open-requests", "cco-headcount",
            "cco-cc-budget", "cco-portfolio", "cco-my-cc-projects",
            "cco-published-scenarios", "cco-cc-simulator",
        }

    def test_cco_open_requests(self, test_client, seed_launchpad_data):
        resp = test_client.get("/api/launchpad/tiles", headers=HEADERS_CCO)
        items = {it["tile_id"]: it for it in resp.json()["items"]}
        assert "1" in items["cco-open-requests"]["primary_metric"]
        assert items["cco-open-requests"]["tone"] in {"warning", "alert"}

    def test_cco_headcount(self, test_client, seed_launchpad_data):
        resp = test_client.get("/api/launchpad/tiles", headers=HEADERS_CCO)
        items = {it["tile_id"]: it for it in resp.json()["items"]}
        # seed_org_base creates 3 active people in cc-muc-dev
        assert "3" in items["cco-headcount"]["primary_metric"]


# ---------------------------------------------------------------------------
# Executive tile content
# ---------------------------------------------------------------------------

@patch("routers.global_launchpad.DEMO_DATE", "2026-04")
class TestExecutiveTiles:
    def test_exec_tile_ids(self, test_client, seed_launchpad_data):
        resp = test_client.get("/api/launchpad/tiles", headers=HEADERS_EXEC)
        ids = {it["tile_id"] for it in resp.json()["items"]}
        assert ids == {
            "exec-portfolio-kpis", "exec-investment-mix",
            "exec-pipeline-health", "exec-top-risks",
            "exec-scenario-activity", "exec-budget-trajectory",
            "exec-backlog",
        }

    def test_exec_top_risks_red_alert(self, test_client, seed_launchpad_data):
        resp = test_client.get("/api/launchpad/tiles", headers=HEADERS_EXEC)
        items = {it["tile_id"]: it for it in resp.json()["items"]}
        # 1 red (gamma), 1 amber (beta) — expect alert tone
        assert "1 red" in items["exec-top-risks"]["primary_metric"]
        assert items["exec-top-risks"]["tone"] == "alert"

    def test_exec_pipeline_health(self, test_client, seed_launchpad_data):
        resp = test_client.get("/api/launchpad/tiles", headers=HEADERS_EXEC)
        items = {it["tile_id"]: it for it in resp.json()["items"]}
        # proj-gamma + proj-delta = 2 pipeline candidates
        assert "2 candidate" in items["exec-pipeline-health"]["primary_metric"]


# ---------------------------------------------------------------------------
# Auth + edge cases
# ---------------------------------------------------------------------------

@patch("routers.global_launchpad.DEMO_DATE", "2026-04")
class TestAuth:
    def test_no_auth(self, test_client, seed_launchpad_data):
        resp = test_client.get("/api/launchpad/tiles")
        assert resp.status_code == 422

    def test_unknown_persona(self, test_client, seed_launchpad_data):
        resp = test_client.get(
            "/api/launchpad/tiles",
            headers={"X-Current-User": "persona-mystery"},
        )
        assert resp.status_code == 401

    def test_empty_db_still_returns_correct_count(self, test_client, seed_personas):
        # Without seed_launchpad_data — tiles should still come back even if metrics are zero
        resp = test_client.get("/api/launchpad/tiles", headers=HEADERS_CTRL)
        assert resp.status_code == 200
        assert resp.json()["total"] == 9

    def test_pl_with_no_projects(self, test_client, seed_personas):
        resp = test_client.get("/api/launchpad/tiles", headers=HEADERS_PL)
        assert resp.status_code == 200
        items = {it["tile_id"]: it for it in resp.json()["items"]}
        assert "0 project" in items["pl-my-projects"]["primary_metric"]
