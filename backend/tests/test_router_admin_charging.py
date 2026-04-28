"""Integration tests for routers/charging.py — Cluster F master data CRUD.

Covers:
- Country (4)
- Region (4)
- ChargingLocation (6)
- LegalEntity (6)

per [F-MD-01], [F-MD-02], [F-MD-03].
"""

from __future__ import annotations

import pytest


HEADERS_CTRL = {"X-Current-User": "persona-controller"}
HEADERS_PL = {"X-Current-User": "persona-pl"}


@pytest.fixture
def seed_charging_lookups(db):
    """Seed a couple of countries and regions for charging-location FK targets."""
    from models.charging import Country, Region

    db.add_all([
        Country(id="ctry-de", iso_code="DE", name="Germany"),
        Country(id="ctry-hu", iso_code="HU", name="Hungary"),
        Region(id="rgn-emea", code="EMEA", name="Europe, Middle East, Africa"),
        Region(id="rgn-apac", code="APAC", name="Asia-Pacific"),
    ])
    db.commit()
    return {
        "country_de": "ctry-de",
        "country_hu": "ctry-hu",
        "region_emea": "rgn-emea",
        "region_apac": "rgn-apac",
    }


# ---------------------------------------------------------------------------
# Country
# ---------------------------------------------------------------------------

class TestCountry:
    def test_list_empty(self, test_client, seed_personas):
        resp = test_client.get("/api/admin/countries", headers=HEADERS_CTRL)
        assert resp.status_code == 200
        assert resp.json() == {"items": [], "total": 0}

    def test_create_country(self, test_client, seed_personas):
        resp = test_client.post(
            "/api/admin/countries", headers=HEADERS_CTRL,
            json={"iso_code": "DE", "name": "Germany"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["iso_code"] == "DE"
        assert body["name"] == "Germany"
        assert body["is_active"] is True

    def test_create_duplicate_iso_code_409(self, test_client, seed_personas, seed_charging_lookups):
        resp = test_client.post(
            "/api/admin/countries", headers=HEADERS_CTRL,
            json={"iso_code": "DE", "name": "Deutschland"},
        )
        assert resp.status_code == 409

    def test_update_country(self, test_client, seed_personas, seed_charging_lookups):
        resp = test_client.put(
            "/api/admin/countries/ctry-de", headers=HEADERS_CTRL,
            json={"name": "Federal Republic of Germany"},
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Federal Republic of Germany"

    def test_update_country_not_found(self, test_client, seed_personas):
        resp = test_client.put(
            "/api/admin/countries/ctry-missing", headers=HEADERS_CTRL,
            json={"name": "Mars"},
        )
        assert resp.status_code == 404

    def test_deactivate_country(self, test_client, seed_personas, seed_charging_lookups):
        resp = test_client.put(
            "/api/admin/countries/ctry-de/deactivate", headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        assert resp.json()["is_active"] is False

    def test_pl_forbidden(self, test_client, seed_personas):
        resp = test_client.get("/api/admin/countries", headers=HEADERS_PL)
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Region
# ---------------------------------------------------------------------------

class TestRegion:
    def test_list_then_create(self, test_client, seed_personas):
        assert test_client.get("/api/admin/regions", headers=HEADERS_CTRL).json()["total"] == 0
        resp = test_client.post(
            "/api/admin/regions", headers=HEADERS_CTRL,
            json={"code": "EMEA", "name": "Europe, Middle East, Africa"},
        )
        assert resp.status_code == 200
        listed = test_client.get("/api/admin/regions", headers=HEADERS_CTRL).json()
        assert listed["total"] == 1
        assert listed["items"][0]["code"] == "EMEA"

    def test_duplicate_code_409(self, test_client, seed_personas, seed_charging_lookups):
        resp = test_client.post(
            "/api/admin/regions", headers=HEADERS_CTRL,
            json={"code": "EMEA", "name": "duplicate"},
        )
        assert resp.status_code == 409

    def test_update_code(self, test_client, seed_personas, seed_charging_lookups):
        resp = test_client.put(
            "/api/admin/regions/rgn-emea", headers=HEADERS_CTRL,
            json={"code": "EU"},
        )
        assert resp.status_code == 200
        assert resp.json()["code"] == "EU"

    def test_deactivate(self, test_client, seed_personas, seed_charging_lookups):
        resp = test_client.put(
            "/api/admin/regions/rgn-emea/deactivate", headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        assert resp.json()["is_active"] is False


# ---------------------------------------------------------------------------
# ChargingLocation
# ---------------------------------------------------------------------------

class TestChargingLocation:
    def test_create_with_rollups(self, test_client, seed_personas, seed_charging_lookups):
        resp = test_client.post(
            "/api/admin/charging-locations", headers=HEADERS_CTRL,
            json={
                "code": "DE-MUC-001",
                "name": "Munich HQ",
                "division": "Corporate IT",
                "region_id": "rgn-emea",
                "country_id": "ctry-de",
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == "DE-MUC-001"
        assert body["region_id"] == "rgn-emea"
        assert body["region_name"] == "Europe, Middle East, Africa"
        assert body["country_iso_code"] == "DE"
        assert body["division"] == "Corporate IT"

    def test_create_unknown_region_404(self, test_client, seed_personas, seed_charging_lookups):
        resp = test_client.post(
            "/api/admin/charging-locations", headers=HEADERS_CTRL,
            json={"code": "DE-NOWHERE", "name": "Nowhere", "region_id": "rgn-fake"},
        )
        assert resp.status_code == 404

    def test_create_unknown_country_404(self, test_client, seed_personas, seed_charging_lookups):
        resp = test_client.post(
            "/api/admin/charging-locations", headers=HEADERS_CTRL,
            json={"code": "XX-XXX-001", "name": "X", "country_id": "ctry-fake"},
        )
        assert resp.status_code == 404

    def test_update_division_audited(self, test_client, db, seed_personas, seed_charging_lookups):
        from models.charging import ChargingLocation
        from models.system import AuditLog
        db.add(ChargingLocation(
            id="cl-test", code="DE-MUC-002", name="Test", division="IT",
            region_id="rgn-emea", country_id="ctry-de",
        ))
        db.commit()
        resp = test_client.put(
            "/api/admin/charging-locations/cl-test", headers=HEADERS_CTRL,
            json={"division": "Manufacturing"},
        )
        assert resp.status_code == 200
        assert resp.json()["division"] == "Manufacturing"
        log = db.query(AuditLog).filter(
            AuditLog.entity_type == "charging_location",
            AuditLog.field_changed == "division",
        ).first()
        assert log is not None
        assert log.new_value == "Manufacturing"

    def test_duplicate_code_409(self, test_client, db, seed_personas, seed_charging_lookups):
        from models.charging import ChargingLocation
        db.add(ChargingLocation(id="cl-1", code="DE-MUC-003", name="A"))
        db.commit()
        resp = test_client.post(
            "/api/admin/charging-locations", headers=HEADERS_CTRL,
            json={"code": "DE-MUC-003", "name": "Duplicate"},
        )
        assert resp.status_code == 409

    def test_deactivate_charging_location(self, test_client, db, seed_personas, seed_charging_lookups):
        from models.charging import ChargingLocation
        db.add(ChargingLocation(id="cl-deact", code="DE-X-001", name="X"))
        db.commit()
        resp = test_client.put(
            "/api/admin/charging-locations/cl-deact/deactivate", headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        assert resp.json()["is_active"] is False


# ---------------------------------------------------------------------------
# LegalEntity
# ---------------------------------------------------------------------------

class TestLegalEntity:
    @pytest.fixture
    def seeded_cl(self, db, seed_charging_lookups):
        from models.charging import ChargingLocation
        cl = ChargingLocation(
            id="cl-le-test", code="DE-MUC-LE", name="Munich for LE",
            region_id="rgn-emea", country_id="ctry-de",
        )
        db.add(cl)
        db.commit()
        return "cl-le-test"

    def test_create_with_rollup(self, test_client, seed_personas, seeded_cl):
        resp = test_client.post(
            "/api/admin/legal-entities", headers=HEADERS_CTRL,
            json={
                "code": "LE-001",
                "name": "Knorr-Bremse Munich GmbH",
                "charging_location_id": seeded_cl,
                "country_id": "ctry-de",
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["charging_location_id"] == seeded_cl
        assert body["charging_location_code"] == "DE-MUC-LE"
        assert body["country_iso_code"] == "DE"

    def test_filter_by_charging_location(self, test_client, db, seed_personas, seeded_cl):
        from models.charging import LegalEntity
        db.add_all([
            LegalEntity(id="le-1", code="LE-A", name="A", charging_location_id=seeded_cl),
            LegalEntity(id="le-2", code="LE-B", name="B", charging_location_id=None),
        ])
        db.commit()
        resp = test_client.get(
            f"/api/admin/legal-entities?charging_location_id={seeded_cl}",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 1
        assert body["items"][0]["code"] == "LE-A"

    def test_create_unknown_charging_location_404(self, test_client, seed_personas, seed_charging_lookups):
        resp = test_client.post(
            "/api/admin/legal-entities", headers=HEADERS_CTRL,
            json={"code": "LE-X", "name": "X", "charging_location_id": "cl-fake"},
        )
        assert resp.status_code == 404

    def test_update_rollup(self, test_client, db, seed_personas, seeded_cl):
        from models.charging import LegalEntity
        db.add(LegalEntity(id="le-up", code="LE-UP", name="Up", charging_location_id=None))
        db.commit()
        resp = test_client.put(
            "/api/admin/legal-entities/le-up", headers=HEADERS_CTRL,
            json={"charging_location_id": seeded_cl},
        )
        assert resp.status_code == 200
        assert resp.json()["charging_location_id"] == seeded_cl

    def test_duplicate_code_409(self, test_client, db, seed_personas, seed_charging_lookups):
        from models.charging import LegalEntity
        db.add(LegalEntity(id="le-dup", code="LE-D", name="D"))
        db.commit()
        resp = test_client.post(
            "/api/admin/legal-entities", headers=HEADERS_CTRL,
            json={"code": "LE-D", "name": "Duplicate"},
        )
        assert resp.status_code == 409

    def test_deactivate(self, test_client, db, seed_personas, seed_charging_lookups):
        from models.charging import LegalEntity
        db.add(LegalEntity(id="le-deact", code="LE-Z", name="Z"))
        db.commit()
        resp = test_client.put(
            "/api/admin/legal-entities/le-deact/deactivate", headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        assert resp.json()["is_active"] is False
