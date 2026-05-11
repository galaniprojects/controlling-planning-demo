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

        # Fully-scored project — should appear in payload
        db.add(Project(
            id="proj-scored", name="Scored Project",
            status="active", capex_opex="capex",
            start_month="2026-01", end_month="2026-12",
            pipeline_stage="Approved", doi=3,
            project_type=2, total_budget=500_000,
            tn_standardization=4, tn_usage=4, tn_maintenance=3,
            tn_financial_benefit=5, tn_payback=4, tn_competitive_advantage=4,
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
        db.commit()

    def test_envelope(self, test_client, seed_personas, seed_projects):
        resp = test_client.get(
            "/api/admin/tech-navigator/scoring-data", headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert set(body.keys()) == {"weights", "ranking_envelope", "projects"}
        assert set(body["weights"].keys()) == {"complexity", "value_creation", "ranking", "tshirt"}
        assert isinstance(body["ranking_envelope"], (int, float))

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
            "id", "name", "project_type", "pipeline_stage", "total_budget",
            "tn_standardization", "tn_usage", "tn_maintenance",
            "tn_financial_benefit", "tn_payback", "tn_competitive_advantage",
        }
        assert p["name"] == "Scored Project"
        assert p["pipeline_stage"] == "Approved"
        assert p["total_budget"] == 500_000.0
