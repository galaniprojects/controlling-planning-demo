"""Integration tests for BTC Profile router endpoints (v5 Session F3 [F-S2-01..08])."""

from __future__ import annotations

import pytest

from models.charging import (
    BTCProfile, BTCProfileLine, ChargeableEntity, ChargingLocation, UserMeasurement,
)
from models.organization import GroupingEntityType, GroupingEntity
from datetime import datetime


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _seed_base(db):
    """Seed minimal data for all BTC tests."""
    get_type = GroupingEntityType(id="get-lob", name="LoB")
    ge = GroupingEntity(id="lob-a", entity_type_id="get-lob", name="LoB A")
    db.add_all([get_type, ge])

    ce1 = ChargeableEntity(
        id="ce-off1", entity_type="Offering", identifier="IT00S111",
        name="Offering One", to_business_pct=60.0,
        hierarchy_node_id="lob-a", is_active=True, annual_cost=1000000.0,
    )
    ce2 = ChargeableEntity(
        id="ce-off2", entity_type="Offering", identifier="IT00S222",
        name="Offering Two", to_business_pct=0.0,
        hierarchy_node_id="lob-a", is_active=True,
    )
    db.add_all([ce1, ce2])

    cl1 = ChargingLocation(id="cl-a", code="DE-A-001", name="Germany A", is_active=True)
    cl2 = ChargingLocation(id="cl-b", code="DE-B-001", name="Germany B", is_active=True)
    db.add_all([cl1, cl2])

    db.commit()


def _seed_um(db):
    from models.charging import UMVersion
    ts = datetime(2026, 1, 15, 10, 0, 0)
    v = UMVersion(
        year=2026, quarter=1, status="active", source="seed", activated_at=ts,
    )
    db.add(v)
    db.flush()
    db.add_all([
        UserMeasurement(
            version_id=v.id, s_code="S0001",
            charging_location_id="cl-a", value=60,
        ),
        UserMeasurement(
            version_id=v.id, s_code="S0001",
            charging_location_id="cl-b", value=40,
        ),
    ])
    db.commit()


def _make_active_profile(db, entity_id="ce-off1", year=2026):
    profile = BTCProfile(entity_id=entity_id, year=year, mode="manual", status="active")
    db.add(profile)
    db.flush()
    l1 = BTCProfileLine(profile_id=profile.id, charging_location_id="cl-a", percentage=60.0)
    l2 = BTCProfileLine(profile_id=profile.id, charging_location_id="cl-b", percentage=40.0)
    db.add_all([l1, l2])
    db.commit()
    return profile


# ---------------------------------------------------------------------------
# GET /api/charging/btc-profiles
# ---------------------------------------------------------------------------

class TestListBTCProfiles:
    def test_returns_empty(self, test_client, seed_personas, db):
        # No profiles seeded — expect empty list.
        resp = test_client.get(
            "/api/charging/btc-profiles",
            headers={"X-Current-User": "persona-controller"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["items"] == []

    def test_returns_profile(self, test_client, seed_personas, db):
        _seed_base(db)
        _make_active_profile(db)
        resp = test_client.get(
            "/api/charging/btc-profiles",
            headers={"X-Current-User": "persona-controller"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["entity_id"] == "ce-off1"

    def test_filter_by_entity_id(self, test_client, seed_personas, db):
        _seed_base(db)
        _make_active_profile(db)
        resp = test_client.get(
            "/api/charging/btc-profiles?entity_id=ce-off2",
            headers={"X-Current-User": "persona-controller"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0

    def test_unauthorized_returns_401(self, test_client):
        resp = test_client.get("/api/charging/btc-profiles")
        assert resp.status_code in (401, 422)


# ---------------------------------------------------------------------------
# GET /api/charging/btc-profiles/{id}
# ---------------------------------------------------------------------------

class TestGetBTCProfile:
    def test_returns_profile_with_sums_to_100(self, test_client, seed_personas, db):
        _seed_base(db)
        profile = _make_active_profile(db)
        resp = test_client.get(
            f"/api/charging/btc-profiles/{profile.id}",
            headers={"X-Current-User": "persona-controller"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == profile.id
        assert data["sums_to_100"] is True
        assert len(data["lines"]) == 2

    def test_not_found_returns_404(self, test_client, seed_personas):
        resp = test_client.get(
            "/api/charging/btc-profiles/99999",
            headers={"X-Current-User": "persona-controller"},
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /api/charging/entities/{id}/btc-profile
# ---------------------------------------------------------------------------

class TestGetEntityBTCProfile:
    def test_returns_profile_for_entity_year(self, test_client, seed_personas, db):
        _seed_base(db)
        _make_active_profile(db)
        resp = test_client.get(
            "/api/charging/entities/ce-off1/btc-profile?year=2026",
            headers={"X-Current-User": "persona-controller"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["entity_id"] == "ce-off1"
        assert data["year"] == 2026

    def test_missing_profile_returns_404(self, test_client, seed_personas, db):
        _seed_base(db)
        resp = test_client.get(
            "/api/charging/entities/ce-off1/btc-profile?year=2026",
            headers={"X-Current-User": "persona-controller"},
        )
        assert resp.status_code == 404

    def test_entity_not_found_returns_404(self, test_client, seed_personas, db):
        _seed_base(db)
        resp = test_client.get(
            "/api/charging/entities/ce-nonexistent/btc-profile?year=2026",
            headers={"X-Current-User": "persona-controller"},
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /api/charging/btc-profiles (create)
# ---------------------------------------------------------------------------

class TestCreateBTCProfile:
    def test_create_manual_profile(self, test_client, seed_personas, db):
        _seed_base(db)
        resp = test_client.post(
            "/api/charging/btc-profiles",
            json={
                "entity_id": "ce-off1",
                "year": 2026,
                "mode": "manual",
                "status": "draft",
                "lines": [
                    {"charging_location_id": "cl-a", "percentage": 60.0},
                    {"charging_location_id": "cl-b", "percentage": 40.0},
                ],
            },
            headers={"X-Current-User": "persona-controller"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["mode"] == "manual"
        assert data["status"] == "draft"
        assert len(data["lines"]) == 2

    def test_create_automatic_profile(self, test_client, seed_personas, db):
        _seed_base(db)
        _seed_um(db)
        resp = test_client.post(
            "/api/charging/btc-profiles",
            json={
                "entity_id": "ce-off1",
                "year": 2026,
                "mode": "automatic",
                "s_code": "S0001",
                "status": "draft",
                "um_year": 2026,
                "um_quarter": 1,
                "lines": [],
            },
            headers={"X-Current-User": "persona-controller"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["mode"] == "automatic"
        assert data["s_code"] == "S0001"

    def test_non_controller_returns_403(self, test_client, seed_personas, db):
        _seed_base(db)
        resp = test_client.post(
            "/api/charging/btc-profiles",
            json={
                "entity_id": "ce-off1",
                "year": 2026,
                "mode": "manual",
                "lines": [
                    {"charging_location_id": "cl-a", "percentage": 100.0},
                ],
            },
            headers={"X-Current-User": "persona-pl"},
        )
        assert resp.status_code == 403

    def test_duplicate_entity_year_returns_409(self, test_client, seed_personas, db):
        _seed_base(db)
        _make_active_profile(db)
        resp = test_client.post(
            "/api/charging/btc-profiles",
            json={
                "entity_id": "ce-off1",
                "year": 2026,
                "mode": "manual",
                "lines": [
                    {"charging_location_id": "cl-a", "percentage": 100.0},
                ],
            },
            headers={"X-Current-User": "persona-controller"},
        )
        assert resp.status_code == 409

    def test_lines_not_summing_to_100_returns_409(self, test_client, seed_personas, db):
        _seed_base(db)
        resp = test_client.post(
            "/api/charging/btc-profiles",
            json={
                "entity_id": "ce-off1",
                "year": 2026,
                "mode": "manual",
                "lines": [
                    {"charging_location_id": "cl-a", "percentage": 50.0},
                ],
            },
            headers={"X-Current-User": "persona-controller"},
        )
        assert resp.status_code == 409

    def test_audit_log_written(self, test_client, seed_personas, db):
        from models.system import AuditLog
        _seed_base(db)
        test_client.post(
            "/api/charging/btc-profiles",
            json={
                "entity_id": "ce-off1",
                "year": 2026,
                "mode": "manual",
                "lines": [
                    {"charging_location_id": "cl-a", "percentage": 60.0},
                    {"charging_location_id": "cl-b", "percentage": 40.0},
                ],
            },
            headers={"X-Current-User": "persona-controller"},
        )
        audit = db.query(AuditLog).filter(AuditLog.entity_type == "btc_profile").first()
        assert audit is not None
        assert audit.action == "create"
        assert audit.category == "master_data"


# ---------------------------------------------------------------------------
# PUT /api/charging/btc-profiles/{id}
# ---------------------------------------------------------------------------

class TestUpdateBTCProfile:
    def test_update_manual_lines(self, test_client, seed_personas, db):
        _seed_base(db)
        profile = BTCProfile(entity_id="ce-off1", year=2026, mode="manual", status="draft")
        db.add(profile)
        db.flush()
        l1 = BTCProfileLine(profile_id=profile.id, charging_location_id="cl-a", percentage=60.0)
        l2 = BTCProfileLine(profile_id=profile.id, charging_location_id="cl-b", percentage=40.0)
        db.add_all([l1, l2])
        db.commit()

        resp = test_client.put(
            f"/api/charging/btc-profiles/{profile.id}",
            json={"lines": [
                {"charging_location_id": "cl-a", "percentage": 70.0},
                {"charging_location_id": "cl-b", "percentage": 30.0},
            ]},
            headers={"X-Current-User": "persona-controller"},
        )
        assert resp.status_code == 200
        data = resp.json()
        pcts = {line["charging_location_id"]: line["percentage"] for line in data["lines"]}
        assert pcts["cl-a"] == 70.0

    def test_update_not_found_returns_404(self, test_client, seed_personas):
        resp = test_client.put(
            "/api/charging/btc-profiles/99999",
            json={"lines": [{"charging_location_id": "cl-a", "percentage": 100.0}]},
            headers={"X-Current-User": "persona-controller"},
        )
        assert resp.status_code in (404, 409)


# ---------------------------------------------------------------------------
# DELETE /api/charging/btc-profiles/{id}
# ---------------------------------------------------------------------------

class TestDeleteBTCProfile:
    def test_delete_profile(self, test_client, seed_personas, db):
        _seed_base(db)
        profile = _make_active_profile(db)
        resp = test_client.delete(
            f"/api/charging/btc-profiles/{profile.id}",
            headers={"X-Current-User": "persona-controller"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["deleted"] is True

    def test_delete_not_found_returns_404(self, test_client, seed_personas):
        resp = test_client.delete(
            "/api/charging/btc-profiles/99999",
            headers={"X-Current-User": "persona-controller"},
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /api/charging/btc-profiles/{id}/refresh-um
# ---------------------------------------------------------------------------

class TestRefreshUM:
    def test_dry_run_returns_diff(self, test_client, seed_personas, db):
        _seed_base(db)
        _seed_um(db)
        profile = BTCProfile(
            entity_id="ce-off1", year=2026, mode="automatic",
            s_code="S0001", status="draft",
        )
        db.add(profile)
        db.flush()
        l1 = BTCProfileLine(profile_id=profile.id, charging_location_id="cl-a", percentage=100.0)
        db.add(l1)
        db.commit()

        resp = test_client.post(
            f"/api/charging/btc-profiles/{profile.id}/refresh-um",
            json={"dry_run": True, "um_year": 2026, "um_quarter": 1},
            headers={"X-Current-User": "persona-controller"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["committed"] is False

    def test_non_controller_returns_403(self, test_client, seed_personas, db):
        _seed_base(db)
        resp = test_client.post(
            "/api/charging/btc-profiles/1/refresh-um",
            json={"dry_run": True},
            headers={"X-Current-User": "persona-exec"},
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# GET /api/charging/entities/{id}/wbs-matrix
# ---------------------------------------------------------------------------

class TestWBSMatrix:
    def test_returns_matrix_rows(self, test_client, seed_personas, db):
        _seed_base(db)
        resp = test_client.get(
            "/api/charging/entities/ce-off1/wbs-matrix?year=2026",
            headers={"X-Current-User": "persona-controller"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["entity_id"] == "ce-off1"
        assert len(data["rows"]) >= 1
        assert "wbs_element" in data["rows"][0]

    def test_active_profile_sets_percentages(self, test_client, seed_personas, db):
        _seed_base(db)
        _make_active_profile(db)
        resp = test_client.get(
            "/api/charging/entities/ce-off1/wbs-matrix?year=2026",
            headers={"X-Current-User": "persona-controller"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["sums_to_100"] is True
        assert data["has_active_profile"] is True

    def test_entity_not_found_returns_404(self, test_client, seed_personas, db):
        _seed_base(db)
        resp = test_client.get(
            "/api/charging/entities/ce-nonexistent/wbs-matrix?year=2026",
            headers={"X-Current-User": "persona-controller"},
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /api/admin/btc-profiles/year-rollover
# ---------------------------------------------------------------------------

class TestYearRollover:
    def test_rolls_active_profiles(self, test_client, seed_personas, db):
        _seed_base(db)
        _make_active_profile(db)
        resp = test_client.post(
            "/api/admin/btc-profiles/year-rollover",
            json={"source_year": 2026, "target_year": 2027},
            headers={"X-Current-User": "persona-controller"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["source_year"] == 2026
        assert data["target_year"] == 2027
        assert len(data["rolled_over"]) == 1

    def test_invalid_years_returns_422(self, test_client, seed_personas):
        resp = test_client.post(
            "/api/admin/btc-profiles/year-rollover",
            json={"source_year": 2027, "target_year": 2026},  # target < source
            headers={"X-Current-User": "persona-controller"},
        )
        assert resp.status_code == 422

    def test_non_controller_returns_403(self, test_client, seed_personas):
        resp = test_client.post(
            "/api/admin/btc-profiles/year-rollover",
            json={"source_year": 2026, "target_year": 2027},
            headers={"X-Current-User": "persona-pl"},
        )
        assert resp.status_code == 403

    def _seed_two_typed_active_profiles(self, db):
        """Seed an active 2026 Offering profile (ce-off1) and an active 2026
        Project profile (ce-proj1). _seed_base already provides ce-off1."""
        _seed_base(db)
        _make_active_profile(db)  # ce-off1 (Offering)
        proj = ChargeableEntity(
            id="ce-proj1", entity_type="Project", identifier="IT0PPM2",
            name="Project One", to_business_pct=40.0,
            hierarchy_node_id="lob-a", is_active=True,
        )
        db.add(proj)
        db.flush()
        prof = BTCProfile(entity_id="ce-proj1", year=2026, mode="manual", status="active")
        db.add(prof)
        db.flush()
        db.add_all([
            BTCProfileLine(profile_id=prof.id, charging_location_id="cl-a", percentage=70.0),
            BTCProfileLine(profile_id=prof.id, charging_location_id="cl-b", percentage=30.0),
        ])
        db.commit()

    def test_scope_all_no_filter_rolls_all(self, test_client, seed_personas, db):
        self._seed_two_typed_active_profiles(db)
        resp = test_client.post(
            "/api/admin/btc-profiles/year-rollover",
            json={"source_year": 2026, "target_year": 2027},
            headers={"X-Current-User": "persona-controller"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["rolled_over"]) == 2

    def test_scope_entity_types_offering_only(self, test_client, seed_personas, db):
        self._seed_two_typed_active_profiles(db)
        resp = test_client.post(
            "/api/admin/btc-profiles/year-rollover",
            json={
                "source_year": 2026, "target_year": 2027,
                "entity_types": ["offering"],
            },
            headers={"X-Current-User": "persona-controller"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["rolled_over"]) == 1
        # New 2027 profile must belong to ce-off1 (Offering).
        new_prof = db.query(BTCProfile).filter_by(year=2027).one()
        assert new_prof.entity_id == "ce-off1"

    def test_scope_entity_ids_specific_entity(self, test_client, seed_personas, db):
        self._seed_two_typed_active_profiles(db)
        resp = test_client.post(
            "/api/admin/btc-profiles/year-rollover",
            json={
                "source_year": 2026, "target_year": 2027,
                "entity_ids": ["ce-proj1"],
            },
            headers={"X-Current-User": "persona-controller"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["rolled_over"]) == 1
        new_prof = db.query(BTCProfile).filter_by(year=2027).one()
        assert new_prof.entity_id == "ce-proj1"

    def test_validator_rejects_both_filters_set(self, test_client, seed_personas):
        resp = test_client.post(
            "/api/admin/btc-profiles/year-rollover",
            json={
                "source_year": 2026, "target_year": 2027,
                "entity_types": ["offering"],
                "entity_ids": ["ce-off1"],
            },
            headers={"X-Current-User": "persona-controller"},
        )
        assert resp.status_code == 422

    def test_validator_rejects_unknown_entity_type(self, test_client, seed_personas):
        resp = test_client.post(
            "/api/admin/btc-profiles/year-rollover",
            json={
                "source_year": 2026, "target_year": 2027,
                "entity_types": ["bogus_type"],
            },
            headers={"X-Current-User": "persona-controller"},
        )
        assert resp.status_code == 422

    def test_validator_rejects_empty_entity_types_list(self, test_client, seed_personas):
        resp = test_client.post(
            "/api/admin/btc-profiles/year-rollover",
            json={
                "source_year": 2026, "target_year": 2027,
                "entity_types": [],
            },
            headers={"X-Current-User": "persona-controller"},
        )
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# FD-4: InternalService manual create returns 409 [F-S2-01]
# ---------------------------------------------------------------------------

class TestInternalServiceManualGate:
    def test_post_manual_for_internal_service_returns_409(
        self, test_client, seed_personas, db,
    ):
        _seed_base(db)
        # Add an InternalService entity alongside the seed Offerings.
        svc = ChargeableEntity(
            id="ce-svc", entity_type="InternalService", identifier="ITF20099",
            name="Internal Service Demo", to_business_pct=0.0,
            hierarchy_node_id="lob-a", is_active=True,
        )
        db.add(svc)
        db.commit()
        resp = test_client.post(
            "/api/charging/btc-profiles",
            json={
                "entity_id": "ce-svc",
                "year": 2026,
                "mode": "manual",
                "lines": [
                    {"charging_location_id": "cl-a", "percentage": 100.0},
                ],
            },
            headers={"X-Current-User": "persona-controller"},
        )
        assert resp.status_code == 409
        body = resp.json()
        # _btc_error_to_http wraps the BTCValidationError into
        # {"detail": {"detail": "..."}} (with optional 'warnings').
        nested = body["detail"]
        msg = nested.get("detail") if isinstance(nested, dict) else nested
        assert "InternalService" in msg


# ---------------------------------------------------------------------------
# FD-4: POST /api/charging/btc-profiles/{id}/activate [F-S2-02]
# ---------------------------------------------------------------------------

class TestActivateBTCProfile:
    def _make_manual_draft(self, db, entity_id="ce-off1"):
        profile = BTCProfile(
            entity_id=entity_id, year=2026, mode="manual", status="draft",
        )
        db.add(profile)
        db.flush()
        db.add_all([
            BTCProfileLine(
                profile_id=profile.id, charging_location_id="cl-a", percentage=60.0,
            ),
            BTCProfileLine(
                profile_id=profile.id, charging_location_id="cl-b", percentage=40.0,
            ),
        ])
        db.commit()
        return profile

    def test_activate_manual_draft_returns_200(self, test_client, seed_personas, db):
        _seed_base(db)
        profile = self._make_manual_draft(db)
        resp = test_client.post(
            f"/api/charging/btc-profiles/{profile.id}/activate",
            json={},
            headers={"X-Current-User": "persona-controller"},
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["status"] == "active"
        assert data["id"] == profile.id

    def test_activate_writes_audit_row(self, test_client, seed_personas, db):
        from models.system import AuditLog
        _seed_base(db)
        profile = self._make_manual_draft(db)
        test_client.post(
            f"/api/charging/btc-profiles/{profile.id}/activate",
            json={},
            headers={"X-Current-User": "persona-controller"},
        )
        log = (
            db.query(AuditLog)
            .filter_by(entity_type="btc_profile", action="activate")
            .first()
        )
        assert log is not None
        assert log.entity_id == str(profile.id)
        assert log.old_value == "draft"
        assert log.new_value == "active"

    def test_activate_already_active_returns_409(self, test_client, seed_personas, db):
        _seed_base(db)
        profile = _make_active_profile(db)
        resp = test_client.post(
            f"/api/charging/btc-profiles/{profile.id}/activate",
            json={},
            headers={"X-Current-User": "persona-controller"},
        )
        assert resp.status_code == 409

    def test_activate_non_controller_returns_403(self, test_client, seed_personas, db):
        _seed_base(db)
        profile = self._make_manual_draft(db)
        resp = test_client.post(
            f"/api/charging/btc-profiles/{profile.id}/activate",
            json={},
            headers={"X-Current-User": "persona-pl"},
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# FD-5 [F-DSH-01] — dashboard triple-display
# ---------------------------------------------------------------------------

class TestTripleDisplay:
    """Automatic profiles surface the triple — raw UM integer + allocation
    key + derived % — so a dashboard cell can render all three (% primary)."""

    def _seed_automatic(self, db):
        """An InternalService with an allocation key, plus an automatic
        profile whose lines are frozen against a UM version."""
        from models.charging import UMVersion

        get_type = GroupingEntityType(id="get-lob", name="LoB")
        ge = GroupingEntity(id="lob-a", entity_type_id="get-lob", name="LoB A")
        db.add_all([get_type, ge])

        svc = ChargeableEntity(
            id="ce-svc1", entity_type="InternalService", identifier="ITF20099",
            name="Identity Service", to_business_pct=0.0,
            hierarchy_node_id="lob-a", is_active=True,
            allocation_key="Number of users",
        )
        db.add(svc)

        cl1 = ChargingLocation(id="cl-a", code="DE-A-001", name="Germany A", is_active=True)
        cl2 = ChargingLocation(id="cl-b", code="DE-B-001", name="Germany B", is_active=True)
        db.add_all([cl1, cl2])

        ts = datetime(2026, 1, 15, 10, 0, 0)
        v = UMVersion(
            year=2026, quarter=1, status="active", source="seed", activated_at=ts,
        )
        db.add(v)
        db.flush()
        db.add_all([
            UserMeasurement(
                version_id=v.id, s_code="S0001",
                charging_location_id="cl-a", value=60,
            ),
            UserMeasurement(
                version_id=v.id, s_code="S0001",
                charging_location_id="cl-b", value=40,
            ),
        ])

        profile = BTCProfile(
            entity_id="ce-svc1", year=2026, mode="automatic", status="active",
            s_code="S0001", um_snapshot_at=ts,
        )
        db.add(profile)
        db.flush()
        db.add_all([
            BTCProfileLine(profile_id=profile.id, charging_location_id="cl-a", percentage=60.0),
            BTCProfileLine(profile_id=profile.id, charging_location_id="cl-b", percentage=40.0),
        ])
        db.commit()
        return profile.id

    def test_automatic_profile_carries_raw_um_and_allocation_key(
        self, test_client, seed_personas, db,
    ):
        pid = self._seed_automatic(db)
        resp = test_client.get(
            f"/api/charging/btc-profiles/{pid}",
            headers={"X-Current-User": "persona-controller"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["allocation_key"] == "Number of users"
        by_cl = {ln["charging_location_id"]: ln for ln in data["lines"]}
        assert by_cl["cl-a"]["raw_um_value"] == 60
        assert by_cl["cl-b"]["raw_um_value"] == 40

    def test_manual_profile_has_no_triple_context(
        self, test_client, seed_personas, db,
    ):
        _seed_base(db)
        profile = _make_active_profile(db)  # manual, Offering entity
        resp = test_client.get(
            f"/api/charging/btc-profiles/{profile.id}",
            headers={"X-Current-User": "persona-controller"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["allocation_key"] is None
        assert all(ln["raw_um_value"] is None for ln in data["lines"])

    def test_triple_present_in_list_response(
        self, test_client, seed_personas, db,
    ):
        self._seed_automatic(db)
        resp = test_client.get(
            "/api/charging/btc-profiles?mode=automatic",
            headers={"X-Current-User": "persona-controller"},
        )
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert len(items) == 1
        assert items[0]["allocation_key"] == "Number of users"
        assert {ln["raw_um_value"] for ln in items[0]["lines"]} == {60, 40}
