"""Integration tests for routers/admin.py."""

import pytest

from models.system import PlanningParameter


HEADERS_CTRL = {"X-Current-User": "persona-controller"}
HEADERS_PL = {"X-Current-User": "persona-pl"}


class TestAdminRouter:
    def test_get_context(self, test_client, seed_personas):
        resp = test_client.get("/api/admin/context", headers=HEADERS_CTRL)
        assert resp.status_code == 200
        data = resp.json()
        assert "cost_center_count" in data

    def test_context_forbidden_for_pl(self, test_client, seed_personas):
        resp = test_client.get("/api/admin/context", headers=HEADERS_PL)
        assert resp.status_code == 403

    def test_get_parameters(self, test_client, seed_personas):
        resp = test_client.get("/api/admin/parameters", headers=HEADERS_CTRL)
        assert resp.status_code == 200

    def test_update_parameter(self, test_client, db, seed_personas):
        db.add(PlanningParameter(
            key="standard_hours_global", name="Standard Hours",
            current_value="160", default_value="160",
            data_type="integer", param_group="planning",
        ))
        db.commit()
        resp = test_client.put("/api/admin/parameters", headers=HEADERS_CTRL, json={
            "changes": [{"key": "standard_hours_global", "new_value": "170"}],
        })
        assert resp.status_code == 200

    def test_get_audit_log(self, test_client, seed_personas):
        resp = test_client.get("/api/admin/audit-log", headers=HEADERS_CTRL)
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data

    def test_create_location(self, test_client, seed_personas):
        resp = test_client.post("/api/admin/locations", headers=HEADERS_CTRL, json={
            "city": "Berlin",
            "country": "Germany",
        })
        assert resp.status_code == 200
        assert resp.json()["city"] == "Berlin"


HEADERS_EXEC = {"X-Current-User": "persona-exec"}


class TestTechNavigatorScoringData:
    """Tests for GET /api/admin/tech-navigator/scoring-data."""

    @pytest.fixture
    def seed_projects(self, db, seed_org_base):
        from models.projects import Project

        # Fully-scored competing project (P2 Approved) — should appear and
        # be flagged competes_in_ranking=True.
        db.add(Project(
            id="proj-scored", name="Scored Project",
            status="active", capex_opex="capex",
            start_month="2026-01", end_month="2026-12",
            pipeline_stage="Approved", doi=3,
            project_type=2, total_budget=500_000,
            tn_standardization=4, tn_usage=4, tn_maintenance=3,
            tn_financial_benefit=5, tn_payback=4, tn_competitive_advantage=4,
        ))
        # Type 3 (compliance) — should appear but flagged
        # competes_in_ranking=False (Type 3 is pre-funded, not in the walk).
        db.add(Project(
            id="proj-type3", name="Type 3 Pre-funded",
            status="active", capex_opex="capex",
            start_month="2026-01", end_month="2026-12",
            pipeline_stage="Approved", doi=3,
            project_type=3, total_budget=200_000,
            tn_standardization=3, tn_usage=3, tn_maintenance=3,
            tn_financial_benefit=4, tn_payback=4, tn_competitive_advantage=4,
        ))
        # Operate-stage project — should appear but flagged
        # competes_in_ranking=False (Operate is out of BACKLOG_STAGES).
        db.add(Project(
            id="proj-operate", name="Operate Project",
            status="active", capex_opex="opex",
            start_month="2025-01", end_month="2027-12",
            pipeline_stage="Operate", doi=5,
            project_type=1, total_budget=300_000,
            tn_standardization=4, tn_usage=4, tn_maintenance=4,
            tn_financial_benefit=4, tn_payback=4, tn_competitive_advantage=3,
        ))
        # Missing one sub-criterion — should be filtered out
        db.add(Project(
            id="proj-partial", name="Partial Project",
            status="active", capex_opex="capex",
            start_month="2026-01", end_month="2026-12",
            pipeline_stage="Proposed", doi=0,
            tn_standardization=4, tn_usage=4, tn_maintenance=3,
            tn_financial_benefit=5, tn_payback=4,
            # tn_competitive_advantage is null
        ))
        # Out-of-scope pipeline stage (Cancelled) — filtered out
        db.add(Project(
            id="proj-cancelled", name="Cancelled Project",
            status="active", capex_opex="capex",
            start_month="2026-01", end_month="2026-12",
            pipeline_stage="Cancelled", doi=0,
            tn_standardization=4, tn_usage=4, tn_maintenance=3,
            tn_financial_benefit=5, tn_payback=4, tn_competitive_advantage=4,
        ))
        # Soft-deleted (is_active=False) — filtered out even though
        # pipeline_stage and sub-criteria would otherwise qualify.
        db.add(Project(
            id="proj-deleted", name="Soft-deleted Project",
            status="active", capex_opex="capex",
            start_month="2026-01", end_month="2026-12",
            pipeline_stage="Approved", doi=3,
            project_type=2, total_budget=400_000,
            tn_standardization=4, tn_usage=4, tn_maintenance=4,
            tn_financial_benefit=4, tn_payback=4, tn_competitive_advantage=4,
            is_active=False,
        ))
        db.commit()

    def test_envelope(self, test_client, seed_personas, seed_projects):
        resp = test_client.get(
            "/api/admin/tech-navigator/scoring-data", headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert set(body.keys()) == {"weights", "envelope", "tiebreakers", "projects"}
        assert set(body["weights"].keys()) == {"complexity", "value_creation", "ranking", "tshirt"}
        assert set(body["envelope"].keys()) == {
            "total_available_budget",
            "type3_pre_funded_total",
            "hyper_maintenance_committed_total",
            "contestable_envelope",
        }
        # contestable = total − type3 − hyper, clamped >= 0
        env = body["envelope"]
        expected_contestable = max(
            0.0,
            env["total_available_budget"]
            - env["type3_pre_funded_total"]
            - env["hyper_maintenance_committed_total"],
        )
        assert env["contestable_envelope"] == expected_contestable
        # Tiebreakers default order from ranking.DEFAULT_TIEBREAKERS minus
        # the implicit primary composite_score:desc.
        assert isinstance(body["tiebreakers"], list)
        for entry in body["tiebreakers"]:
            assert len(entry) == 2

    def test_includes_fully_scored_project(self, test_client, seed_personas, seed_projects):
        resp = test_client.get(
            "/api/admin/tech-navigator/scoring-data", headers=HEADERS_CTRL,
        )
        body = resp.json()
        ids = {p["id"] for p in body["projects"]}
        assert "proj-scored" in ids

    def test_filters_partial_subcriteria(self, test_client, seed_personas, seed_projects):
        resp = test_client.get(
            "/api/admin/tech-navigator/scoring-data", headers=HEADERS_CTRL,
        )
        body = resp.json()
        ids = {p["id"] for p in body["projects"]}
        assert "proj-partial" not in ids, (
            "Projects missing any of the 6 sub-criteria must be filtered out"
        )

    def test_filters_out_of_scope_pipeline_stage(self, test_client, seed_personas, seed_projects):
        resp = test_client.get(
            "/api/admin/tech-navigator/scoring-data", headers=HEADERS_CTRL,
        )
        body = resp.json()
        ids = {p["id"] for p in body["projects"]}
        assert "proj-cancelled" not in ids, (
            "Cancelled projects are out of scope for the scoring page"
        )

    def test_filters_soft_deleted(self, test_client, seed_personas, seed_projects):
        resp = test_client.get(
            "/api/admin/tech-navigator/scoring-data", headers=HEADERS_CTRL,
        )
        body = resp.json()
        ids = {p["id"] for p in body["projects"]}
        assert "proj-deleted" not in ids, (
            "Soft-deleted (is_active=False) projects must not appear"
        )

    def test_competes_in_ranking_p2_backlog_true(self, test_client, seed_personas, seed_projects):
        resp = test_client.get(
            "/api/admin/tech-navigator/scoring-data", headers=HEADERS_CTRL,
        )
        body = resp.json()
        p = next(p for p in body["projects"] if p["id"] == "proj-scored")
        assert p["competes_in_ranking"] is True

    def test_competes_in_ranking_type3_false(self, test_client, seed_personas, seed_projects):
        resp = test_client.get(
            "/api/admin/tech-navigator/scoring-data", headers=HEADERS_CTRL,
        )
        body = resp.json()
        p = next(p for p in body["projects"] if p["id"] == "proj-type3")
        assert p["competes_in_ranking"] is False, (
            "Type 3 (compliance) projects are pre-funded and don't compete in the cutoff walk"
        )

    def test_competes_in_ranking_operate_stage_false(self, test_client, seed_personas, seed_projects):
        resp = test_client.get(
            "/api/admin/tech-navigator/scoring-data", headers=HEADERS_CTRL,
        )
        body = resp.json()
        p = next(p for p in body["projects"] if p["id"] == "proj-operate")
        assert p["competes_in_ranking"] is False, (
            "Operate-stage projects are run-portfolio, not backlog; don't compete in the walk"
        )

    def test_empty_pool_returns_empty_projects(self, test_client, seed_personas):
        # No projects seeded -> projects: [] with 200, not 404 or 500.
        resp = test_client.get(
            "/api/admin/tech-navigator/scoring-data", headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["projects"] == []
        # Envelope and tiebreakers still present even with no projects.
        assert "envelope" in body
        assert "tiebreakers" in body

    def test_controller_200(self, test_client, seed_personas):
        resp = test_client.get(
            "/api/admin/tech-navigator/scoring-data", headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200

    def test_project_lead_forbidden(self, test_client, seed_personas):
        resp = test_client.get(
            "/api/admin/tech-navigator/scoring-data", headers=HEADERS_PL,
        )
        assert resp.status_code == 403

    def test_executive_forbidden(self, test_client, seed_personas):
        resp = test_client.get(
            "/api/admin/tech-navigator/scoring-data", headers=HEADERS_EXEC,
        )
        assert resp.status_code == 403

    def test_project_shape(self, test_client, seed_personas, seed_projects):
        resp = test_client.get(
            "/api/admin/tech-navigator/scoring-data", headers=HEADERS_CTRL,
        )
        body = resp.json()
        matches = [p for p in body["projects"] if p["id"] == "proj-scored"]
        assert len(matches) == 1
        p = matches[0]
        assert set(p.keys()) == {
            "id", "name", "project_type", "pipeline_stage", "doi",
            "total_budget", "competes_in_ranking",
            "tn_standardization", "tn_usage", "tn_maintenance",
            "tn_financial_benefit", "tn_payback", "tn_competitive_advantage",
        }
        assert p["name"] == "Scored Project"
        assert p["pipeline_stage"] == "Approved"
        assert p["total_budget"] == 500_000.0
        assert p["doi"] == 3


class TestResetParametersRecomputesWithinCutoff:
    """End-to-end test for the bug fix where POST /parameters/reset on a
    ranking_* key wasn't fanning out to recompute_within_cutoff_for_backlog.

    Setup: seed an Approved project plus the ranking_total_available_budget
    parameter with a custom value where the project is currently within
    cutoff. POST reset on that key → default is much larger, so the project
    should still be within cutoff (or unchanged from before). The key
    behaviour to assert: recompute_within_cutoff_for_backlog ran, i.e. the
    within_cutoff flag is consistent with the formula at the default
    envelope. The simplest verifiable signal: a project whose flag was None
    (e.g. Approved-mid-transition) gets set to True/False after reset.
    """

    def test_reset_ranking_envelope_recomputes_within_cutoff(
        self, test_client, db, seed_personas,
    ):
        from models.projects import Project

        # Seed one Approved project that competes in ranking with a
        # composite_score set; within_cutoff starts as None so we can verify
        # the recompute fired (None → True or False).
        db.add(Project(
            id="proj-reset-test", name="Reset Test Project",
            status="active", capex_opex="capex",
            start_month="2026-01", end_month="2026-12",
            pipeline_stage="Approved", doi=3,
            project_type=2, total_budget=500_000,
            tn_standardization=4, tn_usage=4, tn_maintenance=3,
            tn_financial_benefit=5, tn_payback=4, tn_competitive_advantage=4,
            complexity_score=3.8, value_creation_score=4.6, composite_score=4.36,
            within_cutoff=None,
        ))
        # Seed the ranking envelope parameter with a non-default custom value
        # so the reset has something to reset *from*. default_value is large
        # enough that the project will land within cutoff post-reset.
        db.add(PlanningParameter(
            key="ranking_total_available_budget",
            name="Ranking: Total Available Budget",
            current_value="1000000",
            default_value="50000000",
            data_type="integer",
            param_group="ranking",
        ))
        db.commit()

        before = (
            db.query(Project)
            .filter(Project.id == "proj-reset-test")
            .first()
            .within_cutoff
        )
        assert before is None

        resp = test_client.post(
            "/api/admin/parameters/reset",
            headers=HEADERS_CTRL,
            json={"keys": ["ranking_total_available_budget"]},
        )
        assert resp.status_code == 200

        # Refresh from DB
        db.expire_all()
        after = (
            db.query(Project)
            .filter(Project.id == "proj-reset-test")
            .first()
            .within_cutoff
        )
        # within_cutoff must now be a bool (the recompute set it). The exact
        # value depends on whether the project's cumulative budget at its
        # rank crosses 50M; with this one project at 500k, it fits → True.
        assert after is True, (
            "Reset on ranking_total_available_budget must fan out to "
            "recompute_within_cutoff_for_backlog. within_cutoff is still None."
        )
