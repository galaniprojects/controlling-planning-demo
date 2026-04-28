"""Integration tests for D1 admin extensions:

- RoleType CRUD
- ExternalCostType CRUD
- ProjectDependency CRUD [D-AC-05]
- User CRUD (separate from Person per spec §1584) [D-AC-01..03]
"""

from __future__ import annotations

import pytest


HEADERS_CTRL = {"X-Current-User": "persona-controller"}
HEADERS_PL = {"X-Current-User": "persona-pl"}


# ---------------------------------------------------------------------------
# RoleType
# ---------------------------------------------------------------------------

class TestRoleType:
    def test_list(self, test_client, seed_personas):
        # seed_org_base provides 2 RoleTypes (role-dev, role-pm)
        resp = test_client.get("/api/admin/role-types", headers=HEADERS_CTRL)
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] >= 2
        names = {r["name"] for r in body["items"]}
        assert "Developer" in names

    def test_create(self, test_client, seed_personas):
        resp = test_client.post(
            "/api/admin/role-types", headers=HEADERS_CTRL,
            json={"name": "Solution Architect"},
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Solution Architect"

    def test_create_duplicate_409(self, test_client, seed_personas):
        # role-dev "Developer" already seeded
        resp = test_client.post(
            "/api/admin/role-types", headers=HEADERS_CTRL,
            json={"name": "Developer"},
        )
        assert resp.status_code == 409

    def test_update(self, test_client, seed_personas):
        resp = test_client.put(
            "/api/admin/role-types/role-dev", headers=HEADERS_CTRL,
            json={"name": "Senior Developer"},
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Senior Developer"

    def test_update_404(self, test_client, seed_personas):
        resp = test_client.put(
            "/api/admin/role-types/role-missing", headers=HEADERS_CTRL,
            json={"name": "X"},
        )
        assert resp.status_code == 404

    def test_pl_forbidden(self, test_client, seed_personas):
        resp = test_client.get("/api/admin/role-types", headers=HEADERS_PL)
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# ExternalCostType
# ---------------------------------------------------------------------------

class TestExternalCostType:
    @pytest.fixture
    def seed_ects(self, db):
        from models.financial import ExternalCostType
        db.add_all([
            ExternalCostType(id="ext-consulting", name="Consulting"),
            ExternalCostType(id="ext-licenses", name="Licenses"),
        ])
        db.commit()

    def test_list(self, test_client, seed_personas, seed_ects):
        resp = test_client.get("/api/admin/external-cost-types", headers=HEADERS_CTRL)
        assert resp.status_code == 200
        assert resp.json()["total"] == 2

    def test_create(self, test_client, seed_personas, seed_ects):
        resp = test_client.post(
            "/api/admin/external-cost-types", headers=HEADERS_CTRL,
            json={"name": "Hardware"},
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Hardware"

    def test_create_duplicate_409(self, test_client, seed_personas, seed_ects):
        resp = test_client.post(
            "/api/admin/external-cost-types", headers=HEADERS_CTRL,
            json={"name": "Consulting"},
        )
        assert resp.status_code == 409

    def test_update_audited(self, test_client, db, seed_personas, seed_ects):
        from models.system import AuditLog
        resp = test_client.put(
            "/api/admin/external-cost-types/ext-consulting", headers=HEADERS_CTRL,
            json={"name": "External Consulting"},
        )
        assert resp.status_code == 200
        log = db.query(AuditLog).filter(
            AuditLog.entity_type == "external_cost_type",
            AuditLog.field_changed == "name",
        ).first()
        assert log is not None
        assert log.new_value == "External Consulting"


# ---------------------------------------------------------------------------
# ProjectDependency [D-AC-05]
# ---------------------------------------------------------------------------

class TestProjectDependency:
    @pytest.fixture
    def two_projects(self, db, seed_org_base):
        from models.projects import Project
        proj_a = Project(
            id="proj-a", name="Alpha", status="active", capex_opex="capex",
            start_month="2026-01", end_month="2026-12",
        )
        proj_b = Project(
            id="proj-b", name="Beta", status="active", capex_opex="capex",
            start_month="2026-03", end_month="2027-06",
        )
        db.add_all([proj_a, proj_b])
        db.commit()
        return ("proj-a", "proj-b")

    def test_create_dependency(self, test_client, seed_personas, two_projects):
        pred, succ = two_projects
        resp = test_client.post(
            "/api/admin/project-dependencies", headers=HEADERS_CTRL,
            json={
                "predecessor_project_id": pred,
                "successor_project_id": succ,
                "dependency_type": "finish_to_start",
                "lag_days": 5,
                "notes": "Beta requires Alpha's API",
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["predecessor_project_id"] == pred
        assert body["successor_project_id"] == succ
        assert body["dependency_type"] == "finish_to_start"
        assert body["lag_days"] == 5
        assert body["predecessor_project_name"] == "Alpha"

    def test_self_dependency_400(self, test_client, seed_personas, two_projects):
        pred, _ = two_projects
        resp = test_client.post(
            "/api/admin/project-dependencies", headers=HEADERS_CTRL,
            json={
                "predecessor_project_id": pred,
                "successor_project_id": pred,
                "dependency_type": "finish_to_start",
            },
        )
        assert resp.status_code == 400

    def test_unknown_predecessor_404(self, test_client, seed_personas, two_projects):
        _, succ = two_projects
        resp = test_client.post(
            "/api/admin/project-dependencies", headers=HEADERS_CTRL,
            json={
                "predecessor_project_id": "proj-fake",
                "successor_project_id": succ,
                "dependency_type": "finish_to_start",
            },
        )
        assert resp.status_code == 404

    def test_duplicate_dependency_409(self, test_client, db, seed_personas, two_projects):
        from models.projects import ProjectDependency
        pred, succ = two_projects
        db.add(ProjectDependency(
            predecessor_project_id=pred,
            successor_project_id=succ,
            dependency_type="finish_to_start",
        ))
        db.commit()
        resp = test_client.post(
            "/api/admin/project-dependencies", headers=HEADERS_CTRL,
            json={
                "predecessor_project_id": pred,
                "successor_project_id": succ,
                "dependency_type": "start_to_start",
            },
        )
        assert resp.status_code == 409

    def test_filter_by_project(self, test_client, db, seed_personas, two_projects):
        from models.projects import Project, ProjectDependency
        pred, succ = two_projects
        proj_c = Project(
            id="proj-c", name="Gamma", status="active", capex_opex="capex",
            start_month="2026-06",
        )
        db.add(proj_c)
        db.commit()
        db.add_all([
            ProjectDependency(
                predecessor_project_id=pred, successor_project_id=succ,
                dependency_type="finish_to_start",
            ),
            ProjectDependency(
                predecessor_project_id=succ, successor_project_id="proj-c",
                dependency_type="start_to_start",
            ),
        ])
        db.commit()

        resp = test_client.get(
            f"/api/admin/project-dependencies?project_id={succ}",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        assert resp.json()["total"] == 2

        resp = test_client.get(
            "/api/admin/project-dependencies?project_id=proj-c", headers=HEADERS_CTRL,
        )
        assert resp.json()["total"] == 1

    def test_update_lag(self, test_client, db, seed_personas, two_projects):
        from models.projects import ProjectDependency
        pred, succ = two_projects
        d = ProjectDependency(
            predecessor_project_id=pred, successor_project_id=succ,
            dependency_type="finish_to_start", lag_days=0,
        )
        db.add(d)
        db.commit()
        resp = test_client.put(
            f"/api/admin/project-dependencies/{d.id}", headers=HEADERS_CTRL,
            json={"lag_days": 14},
        )
        assert resp.status_code == 200
        assert resp.json()["lag_days"] == 14

    def test_delete(self, test_client, db, seed_personas, two_projects):
        from models.projects import ProjectDependency
        pred, succ = two_projects
        d = ProjectDependency(
            predecessor_project_id=pred, successor_project_id=succ,
            dependency_type="finish_to_start",
        )
        db.add(d)
        db.commit()
        dep_id = d.id
        resp = test_client.delete(
            f"/api/admin/project-dependencies/{dep_id}", headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        assert db.query(ProjectDependency).filter(ProjectDependency.id == dep_id).first() is None


# ---------------------------------------------------------------------------
# User entity (separate from Person per spec §1584)
# ---------------------------------------------------------------------------

class TestUser:
    def test_create_user(self, test_client, seed_personas):
        resp = test_client.post(
            "/api/admin/users", headers=HEADERS_CTRL,
            json={
                "username": "alice",
                "display_name": "Alice Anderson",
                "email": "alice@example.com",
                "role": "project_lead",
                "tier3_flag": False,
                "change_reviewer_flag": False,
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["username"] == "alice"
        assert body["role"] == "project_lead"
        assert body["tier3_flag"] is False
        assert body["is_active"] is True

    def test_create_with_person_link(self, test_client, seed_personas, seed_org_base):
        resp = test_client.post(
            "/api/admin/users", headers=HEADERS_CTRL,
            json={
                "username": "dev1",
                "display_name": "Dev One",
                "role": "project_lead",
                "person_id": "p-dev-1",
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["person_id"] == "p-dev-1"
        assert body["person_name"] == "Dev One"

    def test_create_invalid_role_400(self, test_client, seed_personas):
        resp = test_client.post(
            "/api/admin/users", headers=HEADERS_CTRL,
            json={"username": "bob", "display_name": "Bob", "role": "tenant"},
        )
        assert resp.status_code == 400

    def test_create_unknown_person_404(self, test_client, seed_personas):
        resp = test_client.post(
            "/api/admin/users", headers=HEADERS_CTRL,
            json={
                "username": "carol", "display_name": "Carol",
                "role": "controller", "person_id": "p-missing",
            },
        )
        assert resp.status_code == 404

    def test_duplicate_username_409(self, test_client, db, seed_personas):
        from models.users import User
        db.add(User(
            id="user-1", username="dave", display_name="Dave D",
            role="controller",
        ))
        db.commit()
        resp = test_client.post(
            "/api/admin/users", headers=HEADERS_CTRL,
            json={"username": "dave", "display_name": "Other Dave", "role": "executive"},
        )
        assert resp.status_code == 409

    def test_update_tier3_audited(self, test_client, db, seed_personas):
        from models.system import AuditLog
        from models.users import User
        db.add(User(
            id="user-tier3", username="eve", display_name="Eve",
            role="controller", tier3_flag=False,
        ))
        db.commit()
        resp = test_client.put(
            "/api/admin/users/user-tier3", headers=HEADERS_CTRL,
            json={"tier3_flag": True},
        )
        assert resp.status_code == 200
        assert resp.json()["tier3_flag"] is True
        log = db.query(AuditLog).filter(
            AuditLog.entity_type == "user",
            AuditLog.field_changed == "tier3_flag",
        ).first()
        assert log is not None
        assert log.new_value == "True"

    def test_update_change_reviewer_flag(self, test_client, db, seed_personas):
        from models.users import User
        db.add(User(
            id="user-cr", username="frank", display_name="Frank",
            role="controller", change_reviewer_flag=False,
        ))
        db.commit()
        resp = test_client.put(
            "/api/admin/users/user-cr", headers=HEADERS_CTRL,
            json={"change_reviewer_flag": True},
        )
        assert resp.status_code == 200
        assert resp.json()["change_reviewer_flag"] is True

    def test_deactivate_user(self, test_client, db, seed_personas):
        from models.users import User
        db.add(User(id="user-deact", username="grace", display_name="Grace", role="executive"))
        db.commit()
        resp = test_client.put(
            "/api/admin/users/user-deact/deactivate", headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        assert resp.json()["is_active"] is False

    def test_get_user(self, test_client, db, seed_personas):
        from models.users import User
        db.add(User(id="user-get", username="hank", display_name="Hank", role="executive"))
        db.commit()
        resp = test_client.get("/api/admin/users/user-get", headers=HEADERS_CTRL)
        assert resp.status_code == 200
        assert resp.json()["username"] == "hank"

    def test_get_user_404(self, test_client, seed_personas):
        resp = test_client.get("/api/admin/users/user-missing", headers=HEADERS_CTRL)
        assert resp.status_code == 404
