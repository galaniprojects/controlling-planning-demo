"""Integration tests for routers/tech_navigator.py [A-TN-08]."""

from __future__ import annotations

import pytest

from models.projects import Project
from models.system import AuditLog, PlanningParameter


HEADERS_CTRL = {"X-Current-User": "persona-controller"}
HEADERS_PL = {"X-Current-User": "persona-pl"}
HEADERS_EXEC = {"X-Current-User": "persona-exec"}
HEADERS_CC = {"X-Current-User": "persona-cc-owner"}


# ---------------------------------------------------------------------------
# Shared seed helper
# ---------------------------------------------------------------------------

def _seed_default_weights(db) -> None:
    rows = [
        ("tn_complexity_weight_standardization", "40", "percentage"),
        ("tn_complexity_weight_usage", "40", "percentage"),
        ("tn_complexity_weight_maintenance", "20", "percentage"),
        ("tn_value_weight_financial", "50", "percentage"),
        ("tn_value_weight_payback", "40", "percentage"),
        ("tn_value_weight_competitive", "10", "percentage"),
        ("tn_w_value", "70", "percentage"),
        ("tn_w_complexity", "30", "percentage"),
        ("tn_tshirt_xs_max", "100000", "integer"),
        ("tn_tshirt_s_max", "250000", "integer"),
        ("tn_tshirt_m_max", "500000", "integer"),
        ("tn_tshirt_l_max", "1000000", "integer"),
    ]
    for key, value, dtype in rows:
        db.add(PlanningParameter(
            key=key, name=key, current_value=value, default_value=value,
            data_type=dtype, param_group="tech_navigator",
        ))
    db.commit()


@pytest.fixture
def scored_proj(db, seed_personas, create_test_project):
    """A project owned by persona-pl (p-pm-1), partially scored."""
    _seed_default_weights(db)
    create_test_project(
        project_id="proj-alpha", months=["2026-01"],
        pl_person_id="p-pm-1",
    )
    return "proj-alpha"


@pytest.fixture
def other_proj(db, seed_personas, create_test_project):
    """A project NOT owned by persona-pl."""
    _seed_default_weights(db)
    create_test_project(
        project_id="proj-other", months=["2026-01"],
        pl_person_id="p-dev-1",  # owned by controller's person, not PL
    )
    # Persona-pl's owned_project_ids_json includes proj-alpha and proj-beta
    # (set in conftest); proj-other is intentionally outside that list.
    return "proj-other"


# ---------------------------------------------------------------------------
# GET endpoint
# ---------------------------------------------------------------------------

class TestGetTechNavigator:
    def test_returns_nulls_for_unscored_project(self, test_client, scored_proj):
        resp = test_client.get(f"/api/projects/{scored_proj}/tech-navigator", headers=HEADERS_CTRL)
        assert resp.status_code == 200
        data = resp.json()
        assert data["project_id"] == scored_proj
        assert data["tn_standardization"] is None
        assert data["complexity_score"] is None
        assert data["composite_score"] is None

    def test_includes_active_weights(self, test_client, scored_proj):
        resp = test_client.get(f"/api/projects/{scored_proj}/tech-navigator", headers=HEADERS_CTRL)
        data = resp.json()
        assert data["weights"]["complexity"]["standardization"] == 40
        assert data["weights"]["value_creation"]["financial"] == 50
        assert data["weights"]["ranking"]["value"] == 70
        assert data["weights"]["tshirt"]["xs_max"] == 100000

    @pytest.mark.parametrize("headers", [HEADERS_CTRL, HEADERS_PL, HEADERS_EXEC, HEADERS_CC])
    def test_open_to_all_roles(self, test_client, scored_proj, headers):
        resp = test_client.get(f"/api/projects/{scored_proj}/tech-navigator", headers=headers)
        assert resp.status_code == 200

    def test_404_for_unknown_project(self, test_client, db, seed_personas):
        _seed_default_weights(db)
        resp = test_client.get("/api/projects/nonexistent/tech-navigator", headers=HEADERS_CTRL)
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# PUT endpoint — happy paths
# ---------------------------------------------------------------------------

class TestPutTechNavigator:
    FULL_PAYLOAD = {
        "tn_standardization": 4,
        "tn_usage": 5,
        "tn_maintenance": 3,
        "tn_financial_benefit": 4,
        "tn_payback": 3,
        "tn_competitive_advantage": 5,
        "transformation_level": "T1",
        "project_type": 2,
    }

    def test_controller_updates_all_fields(self, test_client, scored_proj):
        resp = test_client.put(
            f"/api/projects/{scored_proj}/tech-navigator",
            headers=HEADERS_CTRL, json=self.FULL_PAYLOAD,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["tn_standardization"] == 4
        assert data["transformation_level"] == "T1"
        assert data["project_type"] == 2

    def test_recomputes_complexity_score(self, test_client, scored_proj):
        resp = test_client.put(
            f"/api/projects/{scored_proj}/tech-navigator",
            headers=HEADERS_CTRL, json=self.FULL_PAYLOAD,
        )
        # (4*40 + 5*40 + 3*20) / 100 = 4.2
        assert resp.json()["complexity_score"] == 4.2

    def test_recomputes_value_creation_score(self, test_client, scored_proj):
        resp = test_client.put(
            f"/api/projects/{scored_proj}/tech-navigator",
            headers=HEADERS_CTRL, json=self.FULL_PAYLOAD,
        )
        # (4*50 + 3*40 + 5*10) / 100 = 3.7
        assert resp.json()["value_creation_score"] == 3.7

    def test_recomputes_composite_with_default_70_30(self, test_client, scored_proj):
        resp = test_client.put(
            f"/api/projects/{scored_proj}/tech-navigator",
            headers=HEADERS_CTRL, json=self.FULL_PAYLOAD,
        )
        # value=3.7, complexity=4.2 → (3.7*70 + 4.2*30) / 100 = 3.85
        assert resp.json()["composite_score"] == 3.85

    def test_partial_update_preserves_existing_subscores(self, test_client, scored_proj):
        test_client.put(
            f"/api/projects/{scored_proj}/tech-navigator",
            headers=HEADERS_CTRL, json=self.FULL_PAYLOAD,
        )
        resp = test_client.put(
            f"/api/projects/{scored_proj}/tech-navigator",
            headers=HEADERS_CTRL, json={"tn_standardization": 5},
        )
        data = resp.json()
        assert data["tn_standardization"] == 5
        assert data["tn_usage"] == 5  # preserved
        assert data["tn_maintenance"] == 3  # preserved


# ---------------------------------------------------------------------------
# PUT endpoint — validation
# ---------------------------------------------------------------------------

class TestPutValidation:
    def test_rejects_subscore_above_5(self, test_client, scored_proj):
        resp = test_client.put(
            f"/api/projects/{scored_proj}/tech-navigator",
            headers=HEADERS_CTRL, json={"tn_standardization": 6},
        )
        assert resp.status_code == 422

    def test_rejects_subscore_below_1(self, test_client, scored_proj):
        resp = test_client.put(
            f"/api/projects/{scored_proj}/tech-navigator",
            headers=HEADERS_CTRL, json={"tn_standardization": 0},
        )
        assert resp.status_code == 422

    def test_rejects_invalid_transformation_level(self, test_client, scored_proj):
        resp = test_client.put(
            f"/api/projects/{scored_proj}/tech-navigator",
            headers=HEADERS_CTRL, json={"transformation_level": "T3"},
        )
        assert resp.status_code == 422

    def test_rejects_invalid_project_type(self, test_client, scored_proj):
        resp = test_client.put(
            f"/api/projects/{scored_proj}/tech-navigator",
            headers=HEADERS_CTRL, json={"project_type": 4},
        )
        assert resp.status_code == 422

    def test_404_for_unknown_project(self, test_client, db, seed_personas):
        _seed_default_weights(db)
        resp = test_client.put(
            "/api/projects/nonexistent/tech-navigator",
            headers=HEADERS_CTRL, json={"tn_standardization": 3},
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# PUT endpoint — authorization
# ---------------------------------------------------------------------------

class TestPutAuthorization:
    def test_pl_succeeds_for_own_project(self, test_client, scored_proj):
        resp = test_client.put(
            f"/api/projects/{scored_proj}/tech-navigator",
            headers=HEADERS_PL, json={"tn_standardization": 3},
        )
        assert resp.status_code == 200

    def test_pl_forbidden_for_other_project(self, test_client, other_proj):
        resp = test_client.put(
            f"/api/projects/{other_proj}/tech-navigator",
            headers=HEADERS_PL, json={"tn_standardization": 3},
        )
        assert resp.status_code == 403

    def test_executive_forbidden(self, test_client, scored_proj):
        resp = test_client.put(
            f"/api/projects/{scored_proj}/tech-navigator",
            headers=HEADERS_EXEC, json={"tn_standardization": 3},
        )
        assert resp.status_code == 403

    def test_cc_owner_forbidden(self, test_client, scored_proj):
        resp = test_client.put(
            f"/api/projects/{scored_proj}/tech-navigator",
            headers=HEADERS_CC, json={"tn_standardization": 3},
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Audit logging
# ---------------------------------------------------------------------------

class TestPutAuditLog:
    def test_writes_one_audit_entry_per_changed_field(self, test_client, db, scored_proj):
        test_client.put(
            f"/api/projects/{scored_proj}/tech-navigator",
            headers=HEADERS_CTRL,
            json={"tn_standardization": 4, "tn_usage": 5},
        )
        entries = db.query(AuditLog).filter(AuditLog.entity_type == "tech_navigator").all()
        assert len(entries) == 2
        fields_changed = {e.field_changed for e in entries}
        assert fields_changed == {"tn_standardization", "tn_usage"}

    def test_does_not_log_unchanged_fields(self, test_client, db, scored_proj):
        # First write
        test_client.put(
            f"/api/projects/{scored_proj}/tech-navigator",
            headers=HEADERS_CTRL, json={"tn_standardization": 4},
        )
        # Same value again — should not log a second entry
        test_client.put(
            f"/api/projects/{scored_proj}/tech-navigator",
            headers=HEADERS_CTRL, json={"tn_standardization": 4},
        )
        entries = db.query(AuditLog).filter(
            AuditLog.entity_type == "tech_navigator",
            AuditLog.field_changed == "tn_standardization",
        ).all()
        assert len(entries) == 1


# ---------------------------------------------------------------------------
# T-shirt derivation via PUT (uses project total_budget set by factory)
# ---------------------------------------------------------------------------

class TestTshirtSize:
    def test_derives_from_total_budget(self, test_client, db, scored_proj):
        # Set a budget then PUT to trigger recompute
        proj = db.query(Project).filter(Project.id == scored_proj).first()
        proj.total_budget = 200_000
        db.commit()
        resp = test_client.put(
            f"/api/projects/{scored_proj}/tech-navigator",
            headers=HEADERS_CTRL, json={"tn_standardization": 3},
        )
        assert resp.json()["tshirt_size"] == "S"

    def test_recomputes_when_threshold_param_changes(self, test_client, db, scored_proj):
        proj = db.query(Project).filter(Project.id == scored_proj).first()
        proj.total_budget = 100_000  # at boundary, currently XS
        db.commit()
        # First trigger compute
        test_client.put(
            f"/api/projects/{scored_proj}/tech-navigator",
            headers=HEADERS_CTRL, json={"tn_standardization": 3},
        )
        db.refresh(proj)
        assert proj.tshirt_size == "XS"

        # Change xs_max threshold to 50_000 — 100k now becomes S
        test_client.put("/api/admin/parameters", headers=HEADERS_CTRL, json={
            "changes": [{"key": "tn_tshirt_xs_max", "new_value": "50000"}],
        })
        db.refresh(proj)
        assert proj.tshirt_size == "S"


# ---------------------------------------------------------------------------
# Admin parameter PUT auto-recompute
# ---------------------------------------------------------------------------

class TestAdminParameterRecompute:
    def test_admin_parameter_update_recomputes_all_project_scores(self, test_client, db, scored_proj):
        # Score the project at default weights
        test_client.put(
            f"/api/projects/{scored_proj}/tech-navigator",
            headers=HEADERS_CTRL,
            json={
                "tn_standardization": 4, "tn_usage": 5, "tn_maintenance": 3,
                "tn_financial_benefit": 4, "tn_payback": 3, "tn_competitive_advantage": 5,
            },
        )
        proj = db.query(Project).filter(Project.id == scored_proj).first()
        assert float(proj.composite_score) == 3.85  # baseline at 70/30

        # Flip ranking weights to 100/0 — composite should equal value_creation
        test_client.put("/api/admin/parameters", headers=HEADERS_CTRL, json={
            "changes": [
                {"key": "tn_w_value", "new_value": "100"},
                {"key": "tn_w_complexity", "new_value": "0"},
            ],
        })
        db.refresh(proj)
        assert float(proj.composite_score) == 3.7  # now equals value_creation_score

    def test_admin_recompute_endpoint_returns_count(self, test_client, db, scored_proj, create_test_project):
        # scored_proj fixture creates one project; add another
        create_test_project(project_id="proj-second", months=["2026-01"])
        resp = test_client.post("/api/admin/recompute-scores", headers=HEADERS_CTRL)
        assert resp.status_code == 200
        assert resp.json()["recomputed"] == 2

    def test_admin_recompute_forbidden_for_pl(self, test_client, scored_proj):
        resp = test_client.post("/api/admin/recompute-scores", headers=HEADERS_PL)
        assert resp.status_code == 403

    def test_non_tn_parameter_change_does_not_trigger_recompute(self, test_client, db, scored_proj):
        # Score project so it has a composite
        test_client.put(
            f"/api/projects/{scored_proj}/tech-navigator",
            headers=HEADERS_CTRL,
            json={
                "tn_standardization": 4, "tn_usage": 5, "tn_maintenance": 3,
                "tn_financial_benefit": 4, "tn_payback": 3, "tn_competitive_advantage": 5,
            },
        )
        # Add a non-tn parameter to update
        db.add(PlanningParameter(
            key="standard_hours_global", name="Standard Hours",
            current_value="160", default_value="160",
            data_type="integer", param_group="planning",
        ))
        db.commit()
        proj = db.query(Project).filter(Project.id == scored_proj).first()
        baseline_composite = float(proj.composite_score)

        test_client.put("/api/admin/parameters", headers=HEADERS_CTRL, json={
            "changes": [{"key": "standard_hours_global", "new_value": "170"}],
        })
        db.refresh(proj)
        # Composite unchanged — recompute did not run
        assert float(proj.composite_score) == baseline_composite
