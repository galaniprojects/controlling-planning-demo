"""Integration tests for the SAP export endpoint (FD-4 [F-EXP-01]).

The endpoint reads from the frozen BTC profile lines, *not* the live UM
matrix, so an export for a given year is reproducible across UM updates.
"""

from __future__ import annotations

import pytest

from datetime import datetime

from models.charging import (
    BTCProfile, BTCProfileLine, ChargeableEntity, ChargingLocation,
)
from models.organization import GroupingEntityType, GroupingEntity
from models.system import AuditLog


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _seed_base(db):
    """Three entities (one of each type), two charging locations, an
    active BTC profile for each entity in 2026."""
    get_type = GroupingEntityType(id="get-lob", name="LoB")
    ge = GroupingEntity(id="lob-a", entity_type_id="get-lob", name="LoB A")
    db.add_all([get_type, ge])

    off = ChargeableEntity(
        id="ce-off", entity_type="Offering", identifier="IT00S111",
        name="Offering Alpha", to_business_pct=90.0,
        hierarchy_node_id="lob-a", is_active=True, annual_cost=1000000.0,
    )
    proj = ChargeableEntity(
        id="ce-proj", entity_type="Project", identifier="IT0PPM1",
        name="Project Beta", to_business_pct=50.0,
        hierarchy_node_id="lob-a", is_active=True, annual_cost=500000.0,
    )
    svc = ChargeableEntity(
        id="ce-svc", entity_type="InternalService", identifier="ITF20099",
        name="Internal Service Gamma", to_business_pct=20.0,
        hierarchy_node_id="lob-a", is_active=True, annual_cost=200000.0,
    )
    db.add_all([off, proj, svc])

    cl1 = ChargingLocation(id="cl-a", code="DE-A-001", name="Germany A", is_active=True)
    cl2 = ChargingLocation(id="cl-b", code="DE-B-001", name="Germany B", is_active=True)
    db.add_all([cl1, cl2])
    db.flush()

    # One active 2026 profile per entity, all 60/40 split.
    for ent_id, mode, s_code in (
        ("ce-off", "manual", None),
        ("ce-proj", "manual", None),
        ("ce-svc", "automatic", "S301"),
    ):
        profile = BTCProfile(
            entity_id=ent_id, year=2026, mode=mode,
            s_code=s_code, status="active",
            um_snapshot_at=datetime(2026, 1, 15, 10, 0, 0) if mode == "automatic" else None,
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


def _seed_missing_profile_entity(db):
    """Add a fourth entity with to_business_pct > 0 but no BTC profile."""
    miss = ChargeableEntity(
        id="ce-missing", entity_type="Offering", identifier="IT00S999",
        name="Missing Profile Entity", to_business_pct=75.0,
        hierarchy_node_id="lob-a", is_active=True,
    )
    db.add(miss)
    db.commit()


def _seed_exempt_entity(db):
    """Add an entity with to_business_pct == 0 (exempt from BTC charge)."""
    exempt = ChargeableEntity(
        id="ce-exempt", entity_type="Offering", identifier="IT00S888",
        name="Zero-Pct Entity", to_business_pct=0.0,
        hierarchy_node_id="lob-a", is_active=True,
    )
    db.add(exempt)
    db.commit()


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

class TestSAPExportAuth:
    def test_non_controller_returns_403(self, test_client, seed_personas, db):
        _seed_base(db)
        for persona in ("persona-pl", "persona-cc-owner", "persona-exec"):
            resp = test_client.get(
                "/api/charging/sap-export?year=2026",
                headers={"X-Current-User": persona},
            )
            assert resp.status_code == 403, persona

    def test_unknown_persona_returns_401(self, test_client, seed_personas, db):
        _seed_base(db)
        resp = test_client.get(
            "/api/charging/sap-export?year=2026",
            headers={"X-Current-User": "persona-does-not-exist"},
        )
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# JSON format
# ---------------------------------------------------------------------------

class TestSAPExportJSON:
    def test_happy_path_returns_rows(self, test_client, seed_personas, db):
        _seed_base(db)
        resp = test_client.get(
            "/api/charging/sap-export?year=2026",
            headers={"X-Current-User": "persona-controller"},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["year"] == 2026
        assert body["entity_type"] is None
        # 3 entities × 2 charging locations = 6 rows.
        assert body["total"] == 6
        assert len(body["items"]) == 6
        assert body["missing_profiles"] == []
        # Spot-check WBS shape: <identifier>-64-99-<cl_code>.
        wbs_set = {item["wbs_element"] for item in body["items"]}
        assert "IT00S111-64-99-DE-A-001" in wbs_set
        assert "ITF20099-64-99-DE-B-001" in wbs_set

    def test_entity_type_filter(self, test_client, seed_personas, db):
        _seed_base(db)
        resp = test_client.get(
            "/api/charging/sap-export?year=2026&entity_type=InternalService",
            headers={"X-Current-User": "persona-controller"},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["entity_type"] == "InternalService"
        assert body["total"] == 2
        for item in body["items"]:
            assert item["entity_type"] == "InternalService"

    def test_missing_profile_listed(self, test_client, seed_personas, db):
        _seed_base(db)
        _seed_missing_profile_entity(db)
        resp = test_client.get(
            "/api/charging/sap-export?year=2026",
            headers={"X-Current-User": "persona-controller"},
        )
        body = resp.json()
        assert body["missing_profiles"] == ["ce-missing"]
        # ce-missing produces no rows.
        rows_for_missing = [
            i for i in body["items"] if i["entity_id"] == "ce-missing"
        ]
        assert rows_for_missing == []

    def test_zero_pct_entity_omitted(self, test_client, seed_personas, db):
        """Exempt entities (to_business_pct == 0) contribute nothing."""
        _seed_base(db)
        _seed_exempt_entity(db)
        resp = test_client.get(
            "/api/charging/sap-export?year=2026",
            headers={"X-Current-User": "persona-controller"},
        )
        body = resp.json()
        # Same row count as the base case — the exempt entity neither
        # produces rows nor lands in missing_profiles.
        assert body["total"] == 6
        assert "ce-exempt" not in body["missing_profiles"]

    def test_annual_amount_computed(self, test_client, seed_personas, db):
        _seed_base(db)
        resp = test_client.get(
            "/api/charging/sap-export?year=2026&entity_type=Offering",
            headers={"X-Current-User": "persona-controller"},
        )
        body = resp.json()
        # ce-off has own_cost=1000000, 60/40 split → 600000/400000.
        amounts = sorted([item["annual_amount_eur"] for item in body["items"]])
        assert amounts == [400000.0, 600000.0]

    def test_invalid_entity_type_returns_422(self, test_client, seed_personas, db):
        _seed_base(db)
        resp = test_client.get(
            "/api/charging/sap-export?year=2026&entity_type=Bogus",
            headers={"X-Current-User": "persona-controller"},
        )
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# CSV format
# ---------------------------------------------------------------------------

class TestSAPExportCSV:
    def test_csv_download_sets_content_disposition(
        self, test_client, seed_personas, db,
    ):
        _seed_base(db)
        resp = test_client.get(
            "/api/charging/sap-export?year=2026&format=csv",
            headers={"X-Current-User": "persona-controller"},
        )
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/csv")
        assert "attachment" in resp.headers["content-disposition"]
        assert "creta-sap-export-2026.csv" in resp.headers["content-disposition"]

    def test_csv_body_has_header_plus_rows(self, test_client, seed_personas, db):
        _seed_base(db)
        resp = test_client.get(
            "/api/charging/sap-export?year=2026&format=csv",
            headers={"X-Current-User": "persona-controller"},
        )
        body = resp.text
        lines = [ln for ln in body.split("\n") if ln]
        # Header + 6 rows (3 entities × 2 locations).
        assert len(lines) == 7
        assert lines[0].startswith("wbs_element,entity_id")
        # Spot-check a known row contains the right WBS.
        assert any("IT00S111-64-99-DE-A-001" in ln for ln in lines[1:])

    def test_csv_filtered_filename_carries_entity_type(
        self, test_client, seed_personas, db,
    ):
        _seed_base(db)
        resp = test_client.get(
            "/api/charging/sap-export?year=2026&format=csv&entity_type=Project",
            headers={"X-Current-User": "persona-controller"},
        )
        assert resp.status_code == 200
        assert "creta-sap-export-2026-project.csv" in resp.headers["content-disposition"]


# ---------------------------------------------------------------------------
# Audit
# ---------------------------------------------------------------------------

class TestSAPExportAudit:
    def test_audit_row_written(self, test_client, seed_personas, db):
        _seed_base(db)
        test_client.get(
            "/api/charging/sap-export?year=2026",
            headers={"X-Current-User": "persona-controller"},
        )
        log = (
            db.query(AuditLog)
            .filter_by(entity_type="sap_export", action="export")
            .first()
        )
        assert log is not None
        assert log.entity_id == "2026"
        assert "rows=6" in log.new_value
        assert "missing=0" in log.new_value
        # Master_data category mirrors the BTC write category — 'export' is
        # not in AUDIT_CATEGORIES so it would be invisible to the audit
        # filter UI; documented deviation from the literal plan text.
        assert log.category == "master_data"

    def test_audit_row_written_for_csv(self, test_client, seed_personas, db):
        _seed_base(db)
        test_client.get(
            "/api/charging/sap-export?year=2026&format=csv",
            headers={"X-Current-User": "persona-controller"},
        )
        log = (
            db.query(AuditLog)
            .filter_by(entity_type="sap_export", action="export")
            .first()
        )
        assert log is not None
        assert "format=csv" in log.new_value
