"""Integration tests for the per-role-per-entity-type permission grid [F-AC-01]."""

from __future__ import annotations

HEADERS_CTRL = {"X-Current-User": "persona-controller"}
HEADERS_PL = {"X-Current-User": "persona-pl"}


class TestRolePermissionGrant:
    def test_list_empty(self, test_client, seed_personas):
        resp = test_client.get("/api/admin/role-permissions", headers=HEADERS_CTRL)
        assert resp.status_code == 200
        assert resp.json() == {"items": [], "total": 0}

    def test_create_grant(self, test_client, seed_personas):
        resp = test_client.post(
            "/api/admin/role-permissions", headers=HEADERS_CTRL,
            json={
                "role": "project_lead",
                "entity_type": "btc_profile",
                "can_edit": True,
                "notes": "PL on own project may edit BTC for spec [F-AC-01]",
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["role"] == "project_lead"
        assert body["entity_type"] == "btc_profile"
        assert body["can_edit"] is True

    def test_create_invalid_role_400(self, test_client, seed_personas):
        resp = test_client.post(
            "/api/admin/role-permissions", headers=HEADERS_CTRL,
            json={"role": "tenant", "entity_type": "btc_profile", "can_edit": True},
        )
        assert resp.status_code == 400

    def test_duplicate_grant_409(self, test_client, db, seed_personas):
        from models.system import RolePermissionGrant
        db.add(RolePermissionGrant(role="project_lead", entity_type="btc_profile", can_edit=True))
        db.commit()
        resp = test_client.post(
            "/api/admin/role-permissions", headers=HEADERS_CTRL,
            json={"role": "project_lead", "entity_type": "btc_profile", "can_edit": False},
        )
        assert resp.status_code == 409

    def test_update_grant_audited(self, test_client, db, seed_personas):
        from models.system import AuditLog, RolePermissionGrant
        db.add(RolePermissionGrant(role="executive", entity_type="distribution", can_edit=True))
        db.commit()
        grant_id = db.query(RolePermissionGrant).first().id
        resp = test_client.put(
            f"/api/admin/role-permissions/{grant_id}", headers=HEADERS_CTRL,
            json={"can_edit": False},
        )
        assert resp.status_code == 200
        assert resp.json()["can_edit"] is False
        log = db.query(AuditLog).filter(
            AuditLog.entity_type == "role_permission_grant",
            AuditLog.field_changed == "can_edit",
        ).first()
        assert log is not None
        assert log.new_value == "False"

    def test_filter_by_role_and_entity_type(self, test_client, db, seed_personas):
        from models.system import RolePermissionGrant
        db.add_all([
            RolePermissionGrant(role="controller", entity_type="btc_profile", can_edit=True),
            RolePermissionGrant(role="project_lead", entity_type="btc_profile", can_edit=True),
            RolePermissionGrant(role="controller", entity_type="distribution", can_edit=True),
        ])
        db.commit()

        resp = test_client.get(
            "/api/admin/role-permissions?role=controller", headers=HEADERS_CTRL,
        )
        assert resp.json()["total"] == 2

        resp = test_client.get(
            "/api/admin/role-permissions?entity_type=btc_profile", headers=HEADERS_CTRL,
        )
        assert resp.json()["total"] == 2

        resp = test_client.get(
            "/api/admin/role-permissions?role=controller&entity_type=btc_profile",
            headers=HEADERS_CTRL,
        )
        assert resp.json()["total"] == 1

    def test_delete_grant(self, test_client, db, seed_personas):
        from models.system import RolePermissionGrant
        db.add(RolePermissionGrant(role="executive", entity_type="distribution", can_edit=False))
        db.commit()
        grant_id = db.query(RolePermissionGrant).first().id
        resp = test_client.delete(
            f"/api/admin/role-permissions/{grant_id}", headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        assert db.query(RolePermissionGrant).count() == 0

    def test_bulk_upsert(self, test_client, db, seed_personas):
        from models.system import RolePermissionGrant
        # Pre-existing grant for one of the pairs
        db.add(RolePermissionGrant(role="controller", entity_type="btc_profile", can_edit=True))
        db.commit()

        resp = test_client.put(
            "/api/admin/role-permissions/bulk", headers=HEADERS_CTRL,
            json={
                "grants": [
                    {"role": "controller", "entity_type": "btc_profile", "can_edit": False},
                    {"role": "project_lead", "entity_type": "btc_profile", "can_edit": True},
                    {"role": "executive", "entity_type": "distribution", "can_edit": True},
                ],
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 3
        # Existing grant updated to can_edit=False
        existing = db.query(RolePermissionGrant).filter(
            RolePermissionGrant.role == "controller",
            RolePermissionGrant.entity_type == "btc_profile",
        ).first()
        assert existing.can_edit is False

    def test_bulk_invalid_role_400(self, test_client, seed_personas):
        resp = test_client.put(
            "/api/admin/role-permissions/bulk", headers=HEADERS_CTRL,
            json={
                "grants": [
                    {"role": "controller", "entity_type": "btc_profile", "can_edit": True},
                    {"role": "tenant", "entity_type": "btc_profile", "can_edit": True},
                ],
            },
        )
        assert resp.status_code == 400

    def test_pl_forbidden(self, test_client, seed_personas):
        resp = test_client.get("/api/admin/role-permissions", headers=HEADERS_PL)
        assert resp.status_code == 403
