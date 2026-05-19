"""Integration tests for routers/user_measurement.py — UM matrix viewer + import.

Charging/UM rework (FD-1): UM is CRETA-authored with a draft/active version
state machine; this router is the legacy shim that keeps the old paths/shapes
working. Covers:
- /refresh-status returns 200 with not_connected payload
- /versions lists UMVersion headers
- / cell list resolves the active version (or a specific version by stamp)
- /import parses an integer CSV into a draft, auto-activates it (FD-1 shim
  concession), sparse-skips zeros, rejects non-integers per-row [F-UM-01]
- Read access permitted for non-controllers per [F-DIR-03]
- Import requires controller role
"""

from __future__ import annotations

from datetime import datetime
from io import BytesIO

import pytest


HEADERS_CTRL = {"X-Current-User": "persona-controller"}
HEADERS_PL = {"X-Current-User": "persona-pl"}


@pytest.fixture
def seed_charging_locations(db):
    from models.charging import ChargingLocation
    db.add_all([
        ChargingLocation(id="cl-de-muc", code="DE-MUC-001", name="Munich"),
        ChargingLocation(id="cl-de-bln", code="DE-BLN-001", name="Berlin"),
    ])
    db.commit()


@pytest.fixture
def seed_um_v1(db, seed_charging_locations):
    """Seed a single active UM version (2026 Q1) with 3 integer cells."""
    from models.charging import UMVersion, UserMeasurement
    ts = datetime(2026, 4, 1, 10, 0, 0)
    v = UMVersion(
        year=2026, quarter=1, status="active", source="seed", activated_at=ts,
    )
    db.add(v)
    db.flush()
    db.add_all([
        UserMeasurement(
            version_id=v.id, s_code="S0001",
            charging_location_id="cl-de-muc", value=12,
        ),
        UserMeasurement(
            version_id=v.id, s_code="S0001",
            charging_location_id="cl-de-bln", value=3,
        ),
        UserMeasurement(
            version_id=v.id, s_code="S0002",
            charging_location_id="cl-de-muc", value=8,
        ),
    ])
    db.commit()
    return ts


# ---------------------------------------------------------------------------
# Refresh-status stub
# ---------------------------------------------------------------------------

class TestRefreshStatus:
    def test_returns_200_not_501(self, test_client, seed_personas):
        resp = test_client.get(
            "/api/admin/user-measurement/refresh-status", headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "not_connected"
        assert "Automatic refresh" in body["message"]

    def test_pl_can_read_status(self, test_client, seed_personas):
        # Per [F-DIR-03] the read endpoints are visible to all CRETA users.
        resp = test_client.get(
            "/api/admin/user-measurement/refresh-status", headers=HEADERS_PL,
        )
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Versions / list
# ---------------------------------------------------------------------------

class TestVersionsAndList:
    def test_versions_empty(self, test_client, seed_personas):
        resp = test_client.get("/api/admin/user-measurement/versions", headers=HEADERS_CTRL)
        assert resp.status_code == 200
        assert resp.json() == {"items": [], "total": 0}

    def test_versions_lists_headers(self, test_client, db, seed_personas, seed_um_v1):
        from models.charging import UMVersion, UserMeasurement
        # A second, later-activated version for the same (year, quarter).
        ts2 = datetime(2026, 4, 15, 10, 0, 0)
        v2 = UMVersion(
            year=2026, quarter=1, status="active", source="csv_upload",
            activated_at=ts2,
        )
        db.add(v2)
        db.flush()
        db.add(UserMeasurement(
            version_id=v2.id, s_code="S0001",
            charging_location_id="cl-de-muc", value=15,
        ))
        db.commit()

        resp = test_client.get("/api/admin/user-measurement/versions", headers=HEADERS_CTRL)
        body = resp.json()
        assert body["total"] == 2
        # Most-recently-activated first
        assert body["items"][0]["imported_at"] == ts2.isoformat()
        assert body["items"][0]["row_count"] == 1
        assert body["items"][1]["imported_at"] == seed_um_v1.isoformat()
        assert body["items"][1]["row_count"] == 3

    def test_list_resolves_active_version(self, test_client, seed_personas, seed_um_v1):
        resp = test_client.get(
            "/api/admin/user-measurement?year=2026&quarter=1", headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 3
        assert body["imported_at"] == seed_um_v1.isoformat()
        assert {row["charging_location_code"] for row in body["items"]} == {
            "DE-MUC-001", "DE-BLN-001",
        }

    def test_list_unknown_year_returns_empty(self, test_client, seed_personas):
        resp = test_client.get(
            "/api/admin/user-measurement?year=2099&quarter=1", headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["items"] == []
        assert body["imported_at"] is None

    def test_list_specific_version_by_stamp(self, test_client, db, seed_personas, seed_um_v1):
        from models.charging import UMVersion, UserMeasurement
        ts2 = datetime(2026, 4, 15, 10, 0, 0)
        v2 = UMVersion(
            year=2026, quarter=1, status="active", source="csv_upload",
            activated_at=ts2,
        )
        db.add(v2)
        db.flush()
        db.add(UserMeasurement(
            version_id=v2.id, s_code="S0001",
            charging_location_id="cl-de-muc", value=99,
        ))
        db.commit()
        # Address the OLDER version explicitly by its stamp.
        resp = test_client.get(
            f"/api/admin/user-measurement?year=2026&quarter=1&imported_at={seed_um_v1.isoformat()}",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 3
        values = {row["value"] for row in body["items"]}
        assert 99.0 not in values

    def test_list_unknown_stamp_returns_empty(self, test_client, seed_personas, seed_um_v1):
        # The reworked shim resolves by version stamp; a non-matching stamp
        # is simply "no such version" (empty 200), not a 400. The old
        # datetime.fromisoformat 400 path is gone with the timestamp model.
        resp = test_client.get(
            "/api/admin/user-measurement?year=2026&quarter=1&imported_at=not-a-date",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["items"] == []
        assert body["imported_at"] is None


# ---------------------------------------------------------------------------
# Regression: seed.sql raw-SQL format resolves end-to-end
# ---------------------------------------------------------------------------

class TestSeedFormatResolution:
    """seed.sql inserts a ``um_versions`` header + ``user_measurements`` cells
    via raw SQL (no ORM round-trip). This asserts the reworked resolver finds
    raw-SQL-seeded rows through the active-version path. Supersedes the old
    ``.000000`` DateTime-binding regression — version_id resolution removed
    that fragility entirely; the preserved knowledge is that raw-SQL seed
    rows resolve, not the timestamp workaround.
    """

    def _insert_seed_format_version(self, db):
        from sqlalchemy import text
        db.execute(text(
            "INSERT INTO um_versions "
            "(id, year, quarter, status, source, activated_at, created_at, "
            "modified_at) VALUES (9001, 2026, 1, 'active', 'seed', "
            "'2026-01-15 10:00:00', '2026-01-15 10:00:00', "
            "'2026-01-15 10:00:00')"
        ))
        db.execute(text(
            "INSERT INTO user_measurements (version_id, s_code, "
            "charging_location_id, value) VALUES (9001, 'S0001', "
            "'cl-de-muc', 12)"
        ))
        db.commit()

    def test_active_path_finds_seed_format_rows(
        self, test_client, db, seed_personas, seed_charging_locations,
    ):
        self._insert_seed_format_version(db)
        resp = test_client.get(
            "/api/admin/user-measurement?year=2026&quarter=1",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 1
        assert body["imported_at"].startswith("2026-01-15T10:00:00")

    def test_explicit_stamp_finds_seed_format_rows(
        self, test_client, db, seed_personas, seed_charging_locations,
    ):
        self._insert_seed_format_version(db)
        resp = test_client.get(
            "/api/admin/user-measurement?year=2026&quarter=1"
            "&imported_at=2026-01-15T10:00:00",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        assert resp.json()["total"] == 1


# ---------------------------------------------------------------------------
# CSV import
# ---------------------------------------------------------------------------

class TestImport:
    def test_import_creates_and_activates_version(
        self, test_client, db, seed_personas, seed_charging_locations,
    ):
        from models.charging import UMVersion, UserMeasurement
        csv_text = "\n".join([
            "year,quarter,s_code,charging_location_code,value,source",
            "2026,2,S0001,DE-MUC-001,10,csv_upload",
            "2026,2,S0001,DE-BLN-001,5,csv_upload",
            "2026,2,S0002,DE-MUC-001,0,csv_upload",  # zero-value -> skipped
        ])
        resp = test_client.post(
            "/api/admin/user-measurement/import",
            headers=HEADERS_CTRL,
            files={"file": ("um.csv", csv_text, "text/csv")},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["year"] == 2026
        assert body["quarter"] == 2
        assert body["inserted"] == 2
        assert body["skipped_zero_rows"] == 1
        rows = db.query(UserMeasurement).all()
        assert len(rows) == 2
        # FD-1 shim: the imported version is auto-activated and resolvable.
        v = db.query(UMVersion).filter_by(year=2026, quarter=2).one()
        assert v.status == "active"
        assert v.activated_at is not None
        assert v.source == "csv_upload"

    def test_import_creates_new_version_does_not_overwrite(
        self, test_client, db, seed_personas, seed_um_v1,
    ):
        # seed_um_v1 has 3 cells in an active 2026-Q1 version.
        csv_text = "\n".join([
            "year,quarter,s_code,charging_location_code,value,source",
            "2026,1,S0001,DE-MUC-001,99,csv_upload",
        ])
        resp = test_client.post(
            "/api/admin/user-measurement/import",
            headers=HEADERS_CTRL,
            files={"file": ("um.csv", csv_text, "text/csv")},
        )
        assert resp.status_code == 200
        from models.charging import UMVersion, UserMeasurement
        # Original 3 cells + 1 new cell in a NEW version = 4; the old version
        # is untouched (no overwrite — historical versions remain intact).
        assert db.query(UserMeasurement).count() == 4
        assert db.query(UMVersion).filter_by(year=2026, quarter=1).count() == 2

    def test_import_rejects_non_integer_value(
        self, test_client, db, seed_personas, seed_charging_locations,
    ):
        # [F-UM-01]: non-integer values are rejected with a row-level error.
        csv_text = "\n".join([
            "year,quarter,s_code,charging_location_code,value,source",
            "2026,3,S0001,DE-MUC-001,10.5,csv_upload",
        ])
        resp = test_client.post(
            "/api/admin/user-measurement/import",
            headers=HEADERS_CTRL,
            files={"file": ("um.csv", csv_text, "text/csv")},
        )
        # No usable cells -> 422 with the row error surfaced.
        assert resp.status_code == 422
        detail = resp.json()["detail"]
        assert "must be an integer" in str(detail)

    def test_import_missing_required_column(self, test_client, seed_personas, seed_charging_locations):
        csv_text = "year,quarter,s_code,value\n2026,1,S0001,1"
        resp = test_client.post(
            "/api/admin/user-measurement/import",
            headers=HEADERS_CTRL,
            files={"file": ("um.csv", csv_text, "text/csv")},
        )
        assert resp.status_code == 400
        assert "missing required" in resp.json()["detail"]

    def test_import_unknown_charging_location(self, test_client, seed_personas, seed_charging_locations):
        csv_text = "\n".join([
            "year,quarter,s_code,charging_location_code,value,source",
            "2026,1,S0001,XX-FAKE,1,csv_upload",
        ])
        resp = test_client.post(
            "/api/admin/user-measurement/import",
            headers=HEADERS_CTRL,
            files={"file": ("um.csv", csv_text, "text/csv")},
        )
        assert resp.status_code == 422
        detail = resp.json()["detail"]
        assert "unknown charging_location_code" in str(detail)

    def test_import_pl_forbidden(self, test_client, seed_personas):
        csv_text = "year,quarter,s_code,charging_location_code,value\n2026,1,S0001,DE-MUC-001,1"
        resp = test_client.post(
            "/api/admin/user-measurement/import",
            headers=HEADERS_PL,
            files={"file": ("um.csv", csv_text, "text/csv")},
        )
        assert resp.status_code == 403

    def test_import_mixed_year_quarter_recorded_as_parse_error(
        self, test_client, seed_personas, seed_charging_locations,
    ):
        """Mixed (year, quarter) rows are rejected per-row; the well-formed
        first row still imports and the bad row surfaces in parse_errors.
        """
        csv_text = "\n".join([
            "year,quarter,s_code,charging_location_code,value,source",
            "2026,1,S0001,DE-MUC-001,1,csv_upload",
            "2026,2,S0001,DE-MUC-001,2,csv_upload",
        ])
        resp = test_client.post(
            "/api/admin/user-measurement/import",
            headers=HEADERS_CTRL,
            files={"file": ("um.csv", csv_text, "text/csv")},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["inserted"] == 1
        assert any("mixed (year, quarter)" in err for err in body["parse_errors"])
