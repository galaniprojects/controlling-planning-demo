"""B1 router integration tests — covers the new endpoints introduced in
Cluster B Session B1.

Endpoints exercised here:
- Lifecycle: create with anchor, archive, rebase, publish with Tier 3 gating
- Lever 12: distributions, to-business, btc-lines, cost-allocation-impact
- Impact dashboard
- Promote preview + execute (controller-only)
- Apply-to-forecast (PL-only)
- Tier 3 redaction in get_detail

These tests use the existing FastAPI test_client + seed_personas pattern
to mirror real HTTP request shapes.
"""

import json
from datetime import datetime
from decimal import Decimal
from unittest.mock import patch

import pytest

from models.charging import (
    BTCProfile, BTCProfileLine, ChargeableEntity, ChargingLocation, Distribution,
)
from models.financial import ForecastVersion
from models.organization import ProjectGroupingAssignment
from models.people import Person
from models.projects import Project
from models.scenarios import Scenario, ScenarioAction, ScenarioPromotion
from models.system import RolePermissionGrant
from models.users import User


HEADERS_CTRL = {"X-Current-User": "persona-controller"}
HEADERS_EXEC = {"X-Current-User": "persona-exec"}
HEADERS_PL = {"X-Current-User": "persona-pl"}
HEADERS_CC = {"X-Current-User": "persona-cc-owner"}


@pytest.fixture
def b1_setup(db, seed_personas, seed_hierarchy, create_test_project):
    """Build a tiny world: one project, one ChargeableEntity, ForecastVersion."""
    create_test_project("proj-alpha", forecast_amt=1000, pl_person_id="p-pm-1")
    create_test_project("proj-beta", forecast_amt=2000, pl_person_id="p-pm-1")
    db.add(ProjectGroupingAssignment(
        project_id="proj-alpha",
        grouping_entity_id=seed_hierarchy["prog_one_id"],
    ))
    db.add(ProjectGroupingAssignment(
        project_id="proj-beta",
        grouping_entity_id=seed_hierarchy["prog_one_id"],
    ))

    cl = ChargingLocation(id="cl-a", code="CL-A", name="Loc A")
    db.add(cl)

    ent = ChargeableEntity(
        id="ent-a", entity_type="Offering", identifier="IT00S001",
        name="Test Offering", annual_cost=Decimal("100000"),
        to_business_pct=Decimal("0"),
    )
    db.add(ent)

    fv = ForecastVersion(
        project_id="proj-alpha", version_number=1, version_type="cycle",
        cycle_label="Q1 2026", created_by_id="p-dev-1",
        granularity_boundary_months=12, planning_horizon_months=60,
    )
    db.add(fv)
    db.commit()
    db.refresh(fv)
    return {"version_id": fv.id, "ent_id": "ent-a", "cl_id": "cl-a"}


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------

class TestB1Lifecycle:
    def test_create_with_anchor_and_tags(self, test_client, b1_setup):
        resp = test_client.post(
            "/api/scenarios", headers=HEADERS_CTRL,
            json={
                "name": "Anchored",
                "anchor_forecast_version_id": b1_setup["version_id"],
                "tags": ["budget-cut", "q3"],
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["anchor_forecast_version_id"] == b1_setup["version_id"]

    def test_create_default_anchor_uses_latest_cycle(self, test_client, b1_setup):
        resp = test_client.post(
            "/api/scenarios", headers=HEADERS_CTRL, json={"name": "Auto Anchor"},
        )
        assert resp.status_code == 200
        assert resp.json()["anchor_forecast_version_id"] == b1_setup["version_id"]

    def test_pl_cannot_create(self, test_client, b1_setup):
        resp = test_client.post(
            "/api/scenarios", headers=HEADERS_PL, json={"name": "PL"},
        )
        assert resp.status_code == 403

    def test_cc_owner_create_auto_scopes(self, test_client, b1_setup):
        resp = test_client.post(
            "/api/scenarios", headers=HEADERS_CC, json={"name": "CC scoped"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["cc_owner_scope_cc_id"] == "cc-muc-dev"

    def test_cc_owner_mismatch_rejected(self, test_client, b1_setup):
        resp = test_client.post(
            "/api/scenarios", headers=HEADERS_CC,
            json={"name": "Wrong CC", "cc_owner_scope_cc_id": "cc-other"},
        )
        assert resp.status_code == 403

    def test_archive_endpoint(self, test_client, b1_setup):
        create_resp = test_client.post(
            "/api/scenarios", headers=HEADERS_CTRL, json={"name": "ToArchive"},
        )
        sid = create_resp.json()["id"]
        archive_resp = test_client.put(
            f"/api/scenarios/{sid}/archive",
            headers=HEADERS_CTRL, json={"archived": True},
        )
        assert archive_resp.status_code == 200
        assert archive_resp.json()["archived"] is True

    def test_archive_filters_default_list(self, test_client, b1_setup):
        create_resp = test_client.post(
            "/api/scenarios", headers=HEADERS_CTRL, json={"name": "Hidden"},
        )
        sid = create_resp.json()["id"]
        test_client.put(
            f"/api/scenarios/{sid}/archive",
            headers=HEADERS_CTRL, json={"archived": True},
        )
        list_resp = test_client.get("/api/scenarios", headers=HEADERS_CTRL)
        assert list_resp.status_code == 200
        ids = [s["id"] for s in list_resp.json()["my_scenarios"]]
        assert sid not in ids

        list_resp_inc = test_client.get(
            "/api/scenarios?include_archived=true", headers=HEADERS_CTRL,
        )
        archived_ids = [s["id"] for s in list_resp_inc.json()["archived_scenarios"]]
        assert sid in archived_ids

    def test_rebase_endpoint(self, test_client, b1_setup, db):
        create_resp = test_client.post(
            "/api/scenarios", headers=HEADERS_CTRL, json={"name": "ToRebase"},
        )
        sid = create_resp.json()["id"]
        # Make a second cycle version
        fv2 = ForecastVersion(
            project_id="proj-alpha", version_number=2, version_type="cycle",
            cycle_label="Q2 2026", created_by_id="p-dev-1",
            granularity_boundary_months=12, planning_horizon_months=60,
        )
        db.add(fv2)
        db.commit()
        rebase_resp = test_client.put(
            f"/api/scenarios/{sid}/rebase", headers=HEADERS_CTRL,
            json={"new_anchor_version_id": fv2.id},
        )
        assert rebase_resp.status_code == 200
        assert rebase_resp.json()["anchor_forecast_version_id"] == fv2.id


# ---------------------------------------------------------------------------
# Lever 12 endpoints
# ---------------------------------------------------------------------------

class TestB1Lever12Endpoints:
    def _create_scenario(self, test_client, b1_setup):
        resp = test_client.post(
            "/api/scenarios", headers=HEADERS_CTRL, json={"name": "L12"},
        )
        return resp.json()["id"]

    def test_to_business_change_endpoint(self, test_client, b1_setup):
        sid = self._create_scenario(test_client, b1_setup)
        resp = test_client.post(
            f"/api/scenarios/{sid}/lever12/to-business",
            headers=HEADERS_CTRL,
            json={"entity_id": b1_setup["ent_id"], "year": 2026, "new_pct": 25},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["scenario_pct"] == 25.0

    def test_btc_lines_change_endpoint(self, test_client, b1_setup):
        sid = self._create_scenario(test_client, b1_setup)
        resp = test_client.post(
            f"/api/scenarios/{sid}/lever12/btc-lines",
            headers=HEADERS_CTRL,
            json={
                "entity_id": b1_setup["ent_id"], "year": 2026,
                "lines": [
                    {"charging_location_id": b1_setup["cl_id"], "percentage": 100},
                ],
            },
        )
        assert resp.status_code == 200
        assert len(resp.json()["scenario_lines"]) == 1

    def test_btc_sum_violation_409(self, test_client, b1_setup):
        sid = self._create_scenario(test_client, b1_setup)
        resp = test_client.post(
            f"/api/scenarios/{sid}/lever12/btc-lines",
            headers=HEADERS_CTRL,
            json={
                "entity_id": b1_setup["ent_id"], "year": 2026,
                "lines": [
                    {"charging_location_id": b1_setup["cl_id"], "percentage": 50},
                ],
            },
        )
        assert resp.status_code == 409

    def test_cost_allocation_impact(self, test_client, b1_setup, db):
        sid = self._create_scenario(test_client, b1_setup)
        # First set to_business=20% then BTC line 100%
        test_client.post(
            f"/api/scenarios/{sid}/lever12/to-business",
            headers=HEADERS_CTRL,
            json={"entity_id": b1_setup["ent_id"], "year": 2026, "new_pct": 20},
        )
        test_client.post(
            f"/api/scenarios/{sid}/lever12/btc-lines",
            headers=HEADERS_CTRL,
            json={
                "entity_id": b1_setup["ent_id"], "year": 2026,
                "lines": [
                    {"charging_location_id": b1_setup["cl_id"], "percentage": 100},
                ],
            },
        )
        resp = test_client.get(
            f"/api/scenarios/{sid}/lever12/cost-allocation-impact?year=2026",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        body = resp.json()
        # Anchor: to_business=0 → no allocation. Scenario: 20% of 100k → 20k to cl-a.
        assert body["totals"]["scenario_total"] == 20000.0
        assert body["totals"]["anchor_total"] == 0.0
        assert body["totals"]["delta"] == 20000.0


# ---------------------------------------------------------------------------
# Impact dashboard
# ---------------------------------------------------------------------------

class TestB1ImpactDashboard:
    @patch("services.scenario_engine.DEMO_DATE", "2026-04")
    @patch("services.portfolio_service.DEMO_DATE", "2026-04")
    def test_dashboard_returns_dimensions(self, test_client, b1_setup):
        create = test_client.post(
            "/api/scenarios", headers=HEADERS_CTRL, json={"name": "Dash"},
        )
        sid = create.json()["id"]
        # Add at least one action
        test_client.post(
            f"/api/scenarios/{sid}/actions", headers=HEADERS_CTRL,
            json={
                "scope": "project", "action_type": "reduce_budget",
                "project_id": "proj-alpha",
                "parameters": {"percentage": 10},
                "lever_category": "forecast_grid", "tier": 1,
            },
        )
        resp = test_client.get(
            f"/api/scenarios/{sid}/impact?year=2026", headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        dim = resp.json()["dimensions"]
        for key in (
            "financial", "backlog_ranking", "capacity", "people",
            "outsourcing_ratio", "investment_mix", "running_cost",
            "change_summary", "cost_allocation",
        ):
            assert key in dim

    @patch("services.scenario_engine.DEMO_DATE", "2026-04")
    @patch("services.portfolio_service.DEMO_DATE", "2026-04")
    def test_recalculate_endpoint(self, test_client, b1_setup):
        create = test_client.post(
            "/api/scenarios", headers=HEADERS_CTRL, json={"name": "Recalc"},
        )
        sid = create.json()["id"]
        resp = test_client.post(
            f"/api/scenarios/{sid}/recalculate", headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        assert resp.json()["last_recalculated_at"] is not None


# ---------------------------------------------------------------------------
# Promote workflow
# ---------------------------------------------------------------------------

class TestB1Promote:
    def _make_promotable(self, test_client, b1_setup):
        create = test_client.post(
            "/api/scenarios", headers=HEADERS_CTRL,
            json={
                "name": "Promote me",
                "anchor_forecast_version_id": b1_setup["version_id"],
            },
        )
        sid = create.json()["id"]
        test_client.post(
            f"/api/scenarios/{sid}/lever12/to-business",
            headers=HEADERS_CTRL,
            json={"entity_id": b1_setup["ent_id"], "year": 2026, "new_pct": 15},
        )
        return sid

    def test_preview_returns_decisions(self, test_client, b1_setup):
        sid = self._make_promotable(test_client, b1_setup)
        resp = test_client.post(
            f"/api/scenarios/{sid}/promote/preview",
            headers=HEADERS_CTRL, json={},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["decisions"]) >= 1
        assert body["decisions"][0]["routing_type"] == "cost_allocation_update"

    def test_execute_promotes(self, test_client, b1_setup, db):
        sid = self._make_promotable(test_client, b1_setup)
        resp = test_client.post(
            f"/api/scenarios/{sid}/promote",
            headers=HEADERS_CTRL, json={},
        )
        assert resp.status_code == 200
        assert resp.json()["promoted_count"] >= 1
        # Live entity updated
        ent = db.query(ChargeableEntity).filter_by(id=b1_setup["ent_id"]).first()
        assert float(ent.to_business_pct) == 15.0

    def test_promote_executive_forbidden(self, test_client, b1_setup):
        sid = self._make_promotable(test_client, b1_setup)
        resp = test_client.post(
            f"/api/scenarios/{sid}/promote",
            headers=HEADERS_EXEC, json={},
        )
        assert resp.status_code == 403

    def test_promote_pl_forbidden(self, test_client, b1_setup):
        sid = self._make_promotable(test_client, b1_setup)
        resp = test_client.post(
            f"/api/scenarios/{sid}/promote",
            headers=HEADERS_PL, json={},
        )
        assert resp.status_code == 403

    def test_promotions_list(self, test_client, b1_setup):
        sid = self._make_promotable(test_client, b1_setup)
        test_client.post(
            f"/api/scenarios/{sid}/promote", headers=HEADERS_CTRL, json={},
        )
        resp = test_client.get(
            f"/api/scenarios/{sid}/promotions", headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        assert resp.json()["total"] >= 1


# ---------------------------------------------------------------------------
# PL Apply-to-forecast endpoint
# ---------------------------------------------------------------------------

class TestB1ApplyToForecast:
    def test_pl_apply_own_scenario(self, test_client, b1_setup, db):
        # PL creates is forbidden, so we seed a scenario authored by PL.
        sc = Scenario(name="PL ATF", author_id="p-pm-1", status="private")
        db.add(sc)
        db.flush()
        db.add(ScenarioAction(
            scenario_id=sc.id, action_order=1, scope="project",
            action_type="reduce_budget", project_id="proj-alpha",
            parameters_json='{"percentage": 10}',
            lever_category="forecast_grid", tier=1,
        ))
        db.commit()
        resp = test_client.post(
            f"/api/scenarios/{sc.id}/apply-to-forecast",
            headers=HEADERS_PL, json={"cycle_label": "Q3 2026"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["diffs_carried_forward"] >= 1

    def test_controller_cannot_apply_to_forecast(self, test_client, b1_setup, db):
        sc = Scenario(name="ATF", author_id="p-pm-1", status="published")
        db.add(sc)
        db.commit()
        resp = test_client.post(
            f"/api/scenarios/{sc.id}/apply-to-forecast",
            headers=HEADERS_CTRL, json={},
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Tier 3 visibility / redaction
# ---------------------------------------------------------------------------

class TestB1Tier3:
    def test_tier3_publish_defaults_to_tier3_only(self, test_client, b1_setup, db):
        create = test_client.post(
            "/api/scenarios", headers=HEADERS_CTRL,
            json={"name": "T3 scenario"},
        )
        sid = create.json()["id"]
        # Add a Tier 3 action
        test_client.post(
            f"/api/scenarios/{sid}/actions", headers=HEADERS_CTRL,
            json={
                "scope": "portfolio", "action_type": "rate_escalation",
                "parameters": {
                    "increase_pct": 5,
                    "scope_type": "role", "scope_values": ["role-dev"],
                },
                "lever_category": "rate_table", "tier": 2,
            },
        )
        # Recalculate to flip the tier3_content_flag
        test_client.post(
            f"/api/scenarios/{sid}/recalculate", headers=HEADERS_CTRL,
        )
        publish = test_client.put(
            f"/api/scenarios/{sid}/publish", headers=HEADERS_CTRL, json={},
        )
        assert publish.status_code == 200
        assert publish.json()["visibility"] == "tier3_only"

    def test_non_tier3_user_cannot_view_tier3_only(self, test_client, b1_setup, db):
        # Set up a Tier 3 published scenario by another author
        from models.people import Person
        author = Person(
            id="p-other-author", name="Other",
            role_type_id="role-dev", cost_center_id="cc-muc-dev",
            competence_center_id="comp-dev",
        )
        db.add(author)
        sc = Scenario(
            name="T3 only", author_id="p-other-author", status="published",
            visibility="tier3_only", tier3_content_flag=True,
        )
        db.add(sc)
        db.commit()

        # exec persona has no User row → no Tier 3 → cannot view
        resp = test_client.get(
            f"/api/scenarios/{sc.id}", headers=HEADERS_EXEC,
        )
        assert resp.status_code == 403
