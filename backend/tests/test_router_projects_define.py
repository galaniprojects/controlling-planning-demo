"""Integration tests for routers/projects_define.py — Define page API.

Covers the five endpoints introduced for the Define-page redesign:

- ``POST /api/projects/define``                          — name-only create.
- ``GET  /api/projects/{id}/define``                     — full project read.
- ``PUT  /api/projects/{id}/identity``                   — Identity Save.
- ``PUT  /api/projects/{id}/approval-milestones``        — Approval Save.
- ``PUT  /api/projects/{id}/baseline-grid``              — Financials Save.

Authorization rules tested:
- Controller: full access.
- PL: only on own projects.
- CC owner / executive: 403 on writes.

Cross-cutting:
- Default-supply path on name-only create.
- Audit-log rows emitted on identity / approval changes.
- DoI gate enforcement on the approval-milestones advance path.
- Baseline-grid delete-then-insert semantics (untouched pairs preserved).
"""

from __future__ import annotations

import pytest

from config import DEMO_DATE
from models.financial import Baseline, ExternalCostType
from models.organization import ProjectGroupingAssignment
from models.projects import Project, ProjectMilestone
from models.system import AuditLog, PlanningParameter


HEADERS_CTRL = {"X-Current-User": "persona-controller"}
HEADERS_PL = {"X-Current-User": "persona-pl"}
HEADERS_EXEC = {"X-Current-User": "persona-exec"}
HEADERS_CC = {"X-Current-User": "persona-cc-owner"}


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _seed_default_weights(db) -> None:
    """Tech-Navigator weights so derive_tshirt / composite recompute work."""
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


def _seed_external_cost_type(db, ct_id="ext-consulting") -> str:
    db.add(ExternalCostType(id=ct_id, name="Consulting"))
    db.commit()
    return ct_id


def _seed_pl_owned_project(db, project_id="proj-alpha", pl="p-pm-1") -> Project:
    """Seed a project assigned to the PL persona."""
    proj = Project(
        id=project_id,
        name="Existing PL Project",
        description="Existing description",
        status="draft",
        capex_opex="opex",
        start_month="2026-04",
        end_month=None,
        pl_person_id=pl,
        is_service=False,
        project_type=None,
        pipeline_stage="Proposed",
        doi=0,
        ai_council_approved=False,
        is_active=True,
    )
    db.add(proj)
    db.commit()
    db.refresh(proj)
    return proj


def _seed_other_project(db, project_id="proj-other") -> Project:
    """Seed a project NOT owned by the PL persona."""
    proj = Project(
        id=project_id,
        name="Other PL Project",
        description=None,
        status="draft",
        capex_opex="opex",
        start_month="2026-04",
        end_month=None,
        pl_person_id="p-someone-else",
        is_service=False,
        project_type=None,
        pipeline_stage="Proposed",
        doi=0,
        ai_council_approved=False,
        is_active=True,
    )
    db.add(proj)
    db.commit()
    db.refresh(proj)
    return proj


# ---------------------------------------------------------------------------
# 1. POST /api/projects/define — name-only create
# ---------------------------------------------------------------------------

class TestCreateDefineProject:
    """``POST /api/projects/define`` — name-only create path."""

    def test_name_only_create_201_supplies_defaults(
        self, test_client, seed_personas,
    ):
        resp = test_client.post(
            "/api/projects/define",
            json={"name": "Brand new initiative"},
            headers=HEADERS_PL,
        )
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["name"] == "Brand new initiative"
        assert data["status"] == "draft"
        assert data["capex_opex"] == "opex"
        assert data["start_month"] == DEMO_DATE
        assert data["end_month"] is None
        assert data["pipeline_stage"] == "Proposed"
        assert data["doi"] == 0
        assert data["ai_council_approved"] is False
        assert data["project_type"] is None
        assert data["total_budget"] is None
        # PL persona is p-pm-1 — the service should substitute automatically.
        assert data["pl_person_id"] == "p-pm-1"
        # ID is the generated proj-XXXX form.
        assert data["id"].startswith("proj-")

    def test_controller_creates_unassigned_201(
        self, test_client, seed_personas,
    ):
        resp = test_client.post(
            "/api/projects/define",
            json={"name": "Controller created"},
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 201, resp.text
        data = resp.json()
        # Controller did not pass pl_person_id — un-assigned is OK.
        assert data["pl_person_id"] is None

    def test_cc_owner_forbidden_403(self, test_client, seed_personas):
        resp = test_client.post(
            "/api/projects/define",
            json={"name": "CC owner attempt"},
            headers=HEADERS_CC,
        )
        assert resp.status_code == 403

    def test_missing_name_422(self, test_client, seed_personas):
        resp = test_client.post(
            "/api/projects/define",
            json={"description": "no name"},
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 422

    def test_empty_name_422(self, test_client, seed_personas):
        resp = test_client.post(
            "/api/projects/define",
            json={"name": ""},
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 422

    def test_unknown_pl_person_id_422(self, test_client, seed_personas):
        resp = test_client.post(
            "/api/projects/define",
            json={"name": "Bad PL", "pl_person_id": "p-not-a-person"},
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 422

    def test_lob_assignment_created(
        self, test_client, seed_personas, seed_hierarchy,
    ):
        resp = test_client.post(
            "/api/projects/define",
            json={"name": "With LoB", "lob_id": "lob-alpha"},
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["lob_id"] == "lob-alpha"

    def test_unknown_lob_422(self, test_client, seed_personas):
        resp = test_client.post(
            "/api/projects/define",
            json={"name": "Bad LoB", "lob_id": "lob-nope"},
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# 2. GET /api/projects/{id}/define — full project read
# ---------------------------------------------------------------------------

class TestGetDefineProject:
    """``GET /api/projects/{id}/define`` — read path with PL filtering."""

    def test_404_unknown_project(self, test_client, seed_personas):
        resp = test_client.get(
            "/api/projects/proj-nope/define", headers=HEADERS_CTRL,
        )
        assert resp.status_code == 404

    def test_controller_can_read_any(
        self, test_client, seed_personas, db,
    ):
        proj = _seed_other_project(db)
        resp = test_client.get(
            f"/api/projects/{proj.id}/define", headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        assert resp.json()["id"] == proj.id

    def test_pl_can_read_own(self, test_client, seed_personas, db):
        proj = _seed_pl_owned_project(db)
        resp = test_client.get(
            f"/api/projects/{proj.id}/define", headers=HEADERS_PL,
        )
        assert resp.status_code == 200

    def test_pl_cannot_read_other(self, test_client, seed_personas, db):
        proj = _seed_other_project(db)
        resp = test_client.get(
            f"/api/projects/{proj.id}/define", headers=HEADERS_PL,
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# 3. PUT /api/projects/{id}/identity — Identity tab Save
# ---------------------------------------------------------------------------

class TestUpdateIdentity:
    """``PUT /api/projects/{id}/identity`` — patch-style Identity save."""

    def test_pl_updates_own_200(self, test_client, seed_personas, db):
        proj = _seed_pl_owned_project(db)
        resp = test_client.put(
            f"/api/projects/{proj.id}/identity",
            json={
                "description": "Updated description",
                "project_type": 1,
                "capex_opex": "capex",
            },
            headers=HEADERS_PL,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["description"] == "Updated description"
        assert data["project_type"] == 1
        assert data["capex_opex"] == "capex"
        # Audit log rows present for each changed field.
        rows = db.query(AuditLog).filter(
            AuditLog.entity_id == proj.id,
            AuditLog.action == "update",
        ).all()
        changed_fields = {r.field_changed for r in rows}
        assert {"description", "project_type", "capex_opex"} <= changed_fields

    def test_pl_cannot_update_other(self, test_client, seed_personas, db):
        proj = _seed_other_project(db)
        resp = test_client.put(
            f"/api/projects/{proj.id}/identity",
            json={"description": "PL attempted edit"},
            headers=HEADERS_PL,
        )
        assert resp.status_code == 403

    def test_cc_owner_cannot_update(self, test_client, seed_personas, db):
        proj = _seed_pl_owned_project(db)
        resp = test_client.put(
            f"/api/projects/{proj.id}/identity",
            json={"description": "CC attempted edit"},
            headers=HEADERS_CC,
        )
        assert resp.status_code == 403

    def test_executive_cannot_update(self, test_client, seed_personas, db):
        proj = _seed_pl_owned_project(db)
        resp = test_client.put(
            f"/api/projects/{proj.id}/identity",
            json={"description": "Exec attempted edit"},
            headers=HEADERS_EXEC,
        )
        assert resp.status_code == 403

    def test_end_before_start_422(self, test_client, seed_personas, db):
        proj = _seed_pl_owned_project(db)
        resp = test_client.put(
            f"/api/projects/{proj.id}/identity",
            json={"start_month": "2026-06", "end_month": "2026-04"},
            headers=HEADERS_PL,
        )
        assert resp.status_code == 422

    def test_invalid_project_type_422(
        self, test_client, seed_personas, db,
    ):
        proj = _seed_pl_owned_project(db)
        resp = test_client.put(
            f"/api/projects/{proj.id}/identity",
            json={"project_type": 9},
            headers=HEADERS_PL,
        )
        assert resp.status_code == 422

    def test_lob_assignment_updated(
        self, test_client, seed_personas, seed_hierarchy, db,
    ):
        proj = _seed_pl_owned_project(db)
        resp = test_client.put(
            f"/api/projects/{proj.id}/identity",
            json={"lob_id": "lob-beta"},
            headers=HEADERS_PL,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["lob_id"] == "lob-beta"

    def test_no_op_when_value_unchanged(
        self, test_client, seed_personas, db,
    ):
        proj = _seed_pl_owned_project(db)
        # First call changes description.
        test_client.put(
            f"/api/projects/{proj.id}/identity",
            json={"description": "first edit"},
            headers=HEADERS_PL,
        )
        before_count = db.query(AuditLog).filter(
            AuditLog.entity_id == proj.id,
            AuditLog.field_changed == "description",
        ).count()
        # Resending the same value should be a no-op (no extra audit row).
        test_client.put(
            f"/api/projects/{proj.id}/identity",
            json={"description": "first edit"},
            headers=HEADERS_PL,
        )
        after_count = db.query(AuditLog).filter(
            AuditLog.entity_id == proj.id,
            AuditLog.field_changed == "description",
        ).count()
        assert before_count == after_count


# ---------------------------------------------------------------------------
# 4. PUT /api/projects/{id}/approval-milestones — Approval Save
# ---------------------------------------------------------------------------

class TestUpdateApprovalMilestones:
    """``PUT /api/projects/{id}/approval-milestones`` — bundle Save."""

    def test_controller_sets_ai_council_200(
        self, test_client, seed_personas, db,
    ):
        proj = _seed_pl_owned_project(db)
        resp = test_client.put(
            f"/api/projects/{proj.id}/approval-milestones",
            json={
                "ai_council_approved": True,
                "ai_council_doc_url": "https://example.com/ac",
            },
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["ai_council_approved"] is True
        assert data["ai_council_doc_url"] == "https://example.com/ac"

    def test_pl_can_set_transformation_level(
        self, test_client, seed_personas, db,
    ):
        _seed_default_weights(db)
        proj = _seed_pl_owned_project(db)
        resp = test_client.put(
            f"/api/projects/{proj.id}/approval-milestones",
            json={"transformation_level": "T1"},
            headers=HEADERS_PL,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["transformation_level"] == "T1"

    def test_doi_advance_gate_unmet_409(
        self, test_client, seed_personas, db,
    ):
        proj = _seed_pl_owned_project(db)
        # Try to advance to DoI 3 with no milestones / start_month wired.
        resp = test_client.put(
            f"/api/projects/{proj.id}/approval-milestones",
            json={"advance_to_doi": 3},
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 409
        detail = resp.json()["detail"]
        assert detail["error"] == "doi_gate_unmet"
        assert detail["target_doi"] == 3
        assert isinstance(detail["missing_fields"], list)
        assert detail["missing_fields"]  # non-empty

    def test_doi_advance_with_override_bypasses_gate(
        self, test_client, seed_personas, db,
    ):
        proj = _seed_pl_owned_project(db)
        resp = test_client.put(
            f"/api/projects/{proj.id}/approval-milestones",
            json={
                "advance_to_doi": 3,
                "override_reason": "Out-of-band approval recorded.",
            },
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["doi"] == 3
        assert resp.json()["pipeline_stage"] == "Approved"

    def test_pl_cannot_advance_beyond_doi_2(
        self, test_client, seed_personas, db,
    ):
        proj = _seed_pl_owned_project(db)
        resp = test_client.put(
            f"/api/projects/{proj.id}/approval-milestones",
            json={
                "advance_to_doi": 3,
                "override_reason": "PL trying to bypass",
            },
            headers=HEADERS_PL,
        )
        assert resp.status_code == 403

    def test_pl_can_advance_to_doi_2_with_override(
        self, test_client, seed_personas, db,
    ):
        # Reach DoI 2 even without all DoI-2 fields — controller override
        # path is only for controllers, but PL can advance to DoI 2 when the
        # gate passes. We use override to confirm the auth boundary stops at
        # PL+DoI 3 rather than at PL using the endpoint at all.
        _seed_default_weights(db)
        proj = _seed_pl_owned_project(db)
        # Fill required DoI-2 fields so the gate passes for a PL caller.
        proj.tn_standardization = 3
        proj.tn_usage = 3
        proj.tn_maintenance = 3
        proj.tn_financial_benefit = 3
        proj.tn_payback = 3
        proj.tn_competitive_advantage = 3
        proj.total_budget = 100000
        db.commit()
        resp = test_client.put(
            f"/api/projects/{proj.id}/approval-milestones",
            json={"advance_to_doi": 2},
            headers=HEADERS_PL,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["doi"] == 2

    def test_invalid_transformation_level_422(
        self, test_client, seed_personas, db,
    ):
        proj = _seed_pl_owned_project(db)
        resp = test_client.put(
            f"/api/projects/{proj.id}/approval-milestones",
            json={"transformation_level": "T9"},
            headers=HEADERS_PL,
        )
        assert resp.status_code == 422

    def test_cc_owner_cannot_update(self, test_client, seed_personas, db):
        proj = _seed_pl_owned_project(db)
        resp = test_client.put(
            f"/api/projects/{proj.id}/approval-milestones",
            json={"ai_council_approved": True},
            headers=HEADERS_CC,
        )
        assert resp.status_code == 403

    def test_pl_cannot_update_other(self, test_client, seed_personas, db):
        proj = _seed_other_project(db)
        resp = test_client.put(
            f"/api/projects/{proj.id}/approval-milestones",
            json={"ai_council_approved": True},
            headers=HEADERS_PL,
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# 5. PUT /api/projects/{id}/baseline-grid — Financials tab Save
# ---------------------------------------------------------------------------

class TestUpdateBaselineGrid:
    """``PUT /api/projects/{id}/baseline-grid`` — Financials Save."""

    def test_pl_writes_grid_200(
        self, test_client, seed_personas, seed_org_base, db,
    ):
        _seed_default_weights(db)
        proj = _seed_pl_owned_project(db)
        resp = test_client.put(
            f"/api/projects/{proj.id}/baseline-grid",
            json={
                "total_budget": 250000,
                "capex_opex": "capex",
                "rows": [
                    {
                        "category": "internal",
                        "sub_category": "role-dev",
                        "months": [
                            {"month": "2026-04", "amount_eur": 15000, "hours": 80},
                            {"month": "2026-05", "amount_eur": 16000, "hours": 80},
                        ],
                    },
                ],
            },
            headers=HEADERS_PL,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["project"]["total_budget"] == 250000
        assert data["project"]["capex_opex"] == "capex"
        # tshirt_size derives from total_budget; 250000 should map to S/M
        # depending on weights — just ensure it's populated.
        assert data["project"]["tshirt_size"] is not None
        # Baseline grid hydrated.
        items = data["baseline_rows"]["items"]
        assert len(items) == 1
        assert items[0]["category"] == "internal"
        assert items[0]["sub_category"] == "role-dev"
        assert len(items[0]["months"]) == 2
        # DB rows actually written.
        baseline_count = db.query(Baseline).filter(
            Baseline.project_id == proj.id,
        ).count()
        assert baseline_count == 2

    def test_quick_sizing_only_no_rows(
        self, test_client, seed_personas, db,
    ):
        _seed_default_weights(db)
        proj = _seed_pl_owned_project(db)
        resp = test_client.put(
            f"/api/projects/{proj.id}/baseline-grid",
            json={"total_budget": 75000},
            headers=HEADERS_PL,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["project"]["total_budget"] == 75000
        # No baseline rows touched.
        assert db.query(Baseline).filter(
            Baseline.project_id == proj.id,
        ).count() == 0

    def test_delete_then_insert_replaces_row(
        self, test_client, seed_personas, seed_org_base, db,
    ):
        _seed_default_weights(db)
        proj = _seed_pl_owned_project(db)
        # Pre-seed two months on the role-dev row.
        db.add_all([
            Baseline(
                project_id=proj.id, month="2026-04",
                category="internal", sub_category="role-dev",
                hours=80, amount_eur=15000,
            ),
            Baseline(
                project_id=proj.id, month="2026-05",
                category="internal", sub_category="role-dev",
                hours=80, amount_eur=16000,
            ),
        ])
        db.commit()
        # Save with a single replacement month — delete-then-insert.
        resp = test_client.put(
            f"/api/projects/{proj.id}/baseline-grid",
            json={
                "rows": [
                    {
                        "category": "internal",
                        "sub_category": "role-dev",
                        "months": [
                            {"month": "2026-06", "amount_eur": 99999, "hours": 100},
                        ],
                    },
                ],
            },
            headers=HEADERS_PL,
        )
        assert resp.status_code == 200, resp.text
        rows = db.query(Baseline).filter(
            Baseline.project_id == proj.id,
        ).all()
        assert len(rows) == 1
        assert rows[0].month == "2026-06"
        assert float(rows[0].amount_eur) == 99999

    def test_untouched_pairs_preserved(
        self, test_client, seed_personas, seed_org_base, db,
    ):
        """Conservative semantics — rows whose (category, sub_category) is
        NOT in the payload survive unchanged."""
        _seed_default_weights(db)
        _seed_external_cost_type(db)
        proj = _seed_pl_owned_project(db)
        db.add_all([
            Baseline(
                project_id=proj.id, month="2026-04",
                category="internal", sub_category="role-dev",
                hours=80, amount_eur=15000,
            ),
            Baseline(
                project_id=proj.id, month="2026-04",
                category="external", sub_category="ext-consulting",
                hours=None, amount_eur=12000,
            ),
        ])
        db.commit()
        # Save only the internal row.
        resp = test_client.put(
            f"/api/projects/{proj.id}/baseline-grid",
            json={
                "rows": [
                    {
                        "category": "internal",
                        "sub_category": "role-dev",
                        "months": [
                            {"month": "2026-06", "amount_eur": 22000, "hours": 80},
                        ],
                    },
                ],
            },
            headers=HEADERS_PL,
        )
        assert resp.status_code == 200, resp.text
        # External row untouched.
        external = db.query(Baseline).filter(
            Baseline.project_id == proj.id,
            Baseline.category == "external",
        ).all()
        assert len(external) == 1
        assert float(external[0].amount_eur) == 12000

    def test_unknown_role_type_id_422(
        self, test_client, seed_personas, db,
    ):
        proj = _seed_pl_owned_project(db)
        resp = test_client.put(
            f"/api/projects/{proj.id}/baseline-grid",
            json={
                "rows": [
                    {
                        "category": "internal",
                        "sub_category": "role-not-a-thing",
                        "months": [
                            {"month": "2026-04", "amount_eur": 1, "hours": 1},
                        ],
                    },
                ],
            },
            headers=HEADERS_PL,
        )
        assert resp.status_code == 422

    def test_cc_owner_cannot_write_grid(
        self, test_client, seed_personas, db,
    ):
        proj = _seed_pl_owned_project(db)
        resp = test_client.put(
            f"/api/projects/{proj.id}/baseline-grid",
            json={"total_budget": 1000},
            headers=HEADERS_CC,
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# 6. Cross-endpoint: pl_project_filter parity smoke test
# ---------------------------------------------------------------------------

class TestPLProjectFilterParity:
    """PL on own project succeeds across all writes; PL on other fails 403."""

    def test_pl_full_round_trip_on_own(
        self, test_client, seed_personas, seed_hierarchy, db,
    ):
        _seed_default_weights(db)
        # Create via define -> PL substitutes self.
        create = test_client.post(
            "/api/projects/define",
            json={"name": "PL round-trip", "lob_id": "lob-alpha"},
            headers=HEADERS_PL,
        )
        assert create.status_code == 201
        pid = create.json()["id"]
        # Refresh persona to include the new project id — the PL filter
        # also accepts projects where the PL is the assigned owner.
        # Now perform a GET, identity Save, approval Save, baseline Save.
        for method, path, body in [
            ("get", f"/api/projects/{pid}/define", None),
            ("put", f"/api/projects/{pid}/identity",
             {"description": "PL round-trip description"}),
            ("put", f"/api/projects/{pid}/approval-milestones",
             {"transformation_level": "T0"}),
            ("put", f"/api/projects/{pid}/baseline-grid",
             {"total_budget": 50000}),
        ]:
            request = getattr(test_client, method)
            kwargs = {"headers": HEADERS_PL}
            if body is not None:
                kwargs["json"] = body
            resp = request(path, **kwargs)
            assert resp.status_code == 200, (
                f"{method.upper()} {path} -> {resp.status_code}: {resp.text}"
            )
