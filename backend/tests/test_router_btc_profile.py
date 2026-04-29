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
    ts = datetime(2026, 1, 15, 10, 0, 0)
    um1 = UserMeasurement(
        year=2026, quarter=1, s_code="S0001",
        charging_location_id="cl-a", value=60.0,
        source="seed", imported_at=ts,
    )
    um2 = UserMeasurement(
        year=2026, quarter=1, s_code="S0001",
        charging_location_id="cl-b", value=40.0,
        source="seed", imported_at=ts,
    )
    db.add_all([um1, um2])
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
