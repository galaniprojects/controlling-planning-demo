"""Integration tests for routers/user_measurement.py — UM matrix viewer + import.

Covers:
- /refresh-status returns 200 with not_connected payload [F-UM-02]
- /versions group-by metadata
- / cell list (latest version + specific imported_at)
- /import CSV parsing, sparse skip, version creation [F-UM-01..03]
- Read access permitted for non-controllers per [F-UM-04]
- Import requires controller role
"""

from __future__ import annotations

from datetime import datetime, timedelta
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
    """Seed a single UM version (2026 Q1)."""
    from models.charging import UserMeasurement
    ts = datetime(2026, 4, 1, 10, 0, 0)
    db.add_all([
        UserMeasurement(
            year=2026, quarter=1, s_code="S0001", charging_location_id="cl-de-muc",
            value=12.5, source="seed", imported_at=ts,
        ),
        UserMeasurement(
            year=2026, quarter=1, s_code="S0001", charging_location_id="cl-de-bln",
            value=3.0, source="seed", imported_at=ts,
        ),
        UserMeasurement(
            year=2026, quarter=1, s_code="S0002", charging_location_id="cl-de-muc",
            value=8.0, source="seed", imported_at=ts,
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
        # Per [F-UM-04] the read endpoints are visible to all CRETA users.
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

    def test_versions_groups_by_imported_at(self, test_client, db, seed_personas, seed_um_v1):
        from models.charging import UserMeasurement
        # Add a second version (different imported_at)
        ts2 = datetime(2026, 4, 15, 10, 0, 0)
        db.add(UserMeasurement(
            year=2026, quarter=1, s_code="S0001", charging_location_id="cl-de-muc",
            value=15.0, source="csv_upload", imported_at=ts2,
        ))
        db.commit()

        resp = test_client.get("/api/admin/user-measurement/versions", headers=HEADERS_CTRL)
        body = resp.json()
        assert body["total"] == 2
        # Most recent first
        assert body["items"][0]["imported_at"] == ts2.isoformat()
        assert body["items"][0]["row_count"] == 1
        assert body["items"][1]["imported_at"] == seed_um_v1.isoformat()
        assert body["items"][1]["row_count"] == 3

    def test_list_latest(self, test_client, seed_personas, seed_um_v1):
        resp = test_client.get(
            "/api/admin/user-measurement?year=2026&quarter=1", headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 3
        assert body["imported_at"] == seed_um_v1.isoformat()
        assert {row["charging_location_code"] for row in body["items"]} == {"DE-MUC-001", "DE-BLN-001"}

    def test_list_unknown_year_returns_empty(self, test_client, seed_personas):
        resp = test_client.get(
            "/api/admin/user-measurement?year=2099&quarter=1", headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["items"] == []
        assert body["imported_at"] is None

    def test_list_specific_imported_at(self, test_client, db, seed_personas, seed_um_v1):
        from models.charging import UserMeasurement
        ts2 = datetime(2026, 4, 15, 10, 0, 0)
        db.add(UserMeasurement(
            year=2026, quarter=1, s_code="S0001", charging_location_id="cl-de-muc",
            value=99.0, source="csv_upload", imported_at=ts2,
        ))
        db.commit()
        # Address the OLDER version explicitly
        resp = test_client.get(
            f"/api/admin/user-measurement?year=2026&quarter=1&imported_at={seed_um_v1.isoformat()}",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 3
        # Confirm we got the v1 values, not 99.0
        values = {row["value"] for row in body["items"]}
        assert 99.0 not in values

    def test_list_invalid_imported_at_400(self, test_client, seed_personas):
        resp = test_client.get(
            "/api/admin/user-measurement?year=2026&quarter=1&imported_at=not-a-date",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Regression: seed.sql TEXT format (no microseconds)
# ---------------------------------------------------------------------------

class TestSeedFormatRegression:
    """The seed inserts ``imported_at`` TEXT without microseconds; SQLAlchemy's
    ``DateTime`` binding appends ``.000000`` to Python ``datetime`` parameters.
    A Python-bound filter against seed rows would silently return zero cells.
    The ORM-based tests above can't catch this because they round-trip
    ``.000000`` on both write and read; raw SQL inserts are required to
    reproduce the seed format end-to-end.
    """

    def _insert_seed_format_row(
        self, db, *, s_code="S0001", cl_id="cl-de-muc", value=12.5,
        imported_at="2026-01-15 10:00:00",
    ):
        from sqlalchemy import text
        db.execute(text(
            "INSERT INTO user_measurements "
            "(year, quarter, s_code, charging_location_id, value, source, imported_at) "
            "VALUES (2026, 1, :s_code, :cl_id, :value, 'seed', :imported_at)"
        ), {"s_code": s_code, "cl_id": cl_id, "value": value, "imported_at": imported_at})
        db.commit()

    def test_latest_path_finds_seed_format_rows(
        self, test_client, db, seed_personas, seed_charging_locations,
    ):
        self._insert_seed_format_row(db)
        resp = test_client.get(
            "/api/admin/user-measurement?year=2026&quarter=1",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 1
        assert body["imported_at"].startswith("2026-01-15T10:00:00")

    def test_explicit_path_finds_seed_format_rows(
        self, test_client, db, seed_personas, seed_charging_locations,
    ):
        self._insert_seed_format_row(db)
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
    def _make_csv(self, lines: list[str]) -> tuple[str, BytesIO, str]:
        """Return a TestClient files-tuple for the upload endpoint."""
        text = "\n".join(lines).encode("utf-8")
        return ("um.csv", BytesIO(text), "text/csv")

    def test_import_creates_new_version(self, test_client, db, seed_personas, seed_charging_locations):
        from models.charging import UserMeasurement
        csv_text = "\n".join([
            "year,quarter,s_code,charging_location_code,value,source",
            "2026,2,S0001,DE-MUC-001,10.5,csv_upload",
            "2026,2,S0001,DE-BLN-001,5.0,csv_upload",
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

    def test_import_appends_new_version_does_not_overwrite(self, test_client, db, seed_personas, seed_um_v1):
        # seed_um_v1 has 3 rows for 2026 Q1
        csv_text = "\n".join([
            "year,quarter,s_code,charging_location_code,value,source",
            "2026,1,S0001,DE-MUC-001,99.9,csv_upload",
        ])
        resp = test_client.post(
            "/api/admin/user-measurement/import",
            headers=HEADERS_CTRL,
            files={"file": ("um.csv", csv_text, "text/csv")},
        )
        assert resp.status_code == 200
        from models.charging import UserMeasurement
        # Original 3 + 1 new = 4 (no overwrite per [F-UM-03])
        assert db.query(UserMeasurement).count() == 4

    def test_import_missing_required_column(self, test_client, seed_personas, seed_charging_locations):
        csv_text = "year,quarter,s_code,value\n2026,1,S0001,1.0"
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
            "2026,1,S0001,XX-FAKE,1.0,csv_upload",
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
        csv_text = "year,quarter,s_code,charging_location_code,value\n2026,1,S0001,DE-MUC-001,1.0"
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

        Working assumption: per-row tolerance is friendlier than a hard fail —
        the admin can fix the offending rows in the source CSV and re-import
        without losing the rows that did parse cleanly. Each import is its
        own version per [F-UM-03] so re-imports do not overwrite.
        """
        csv_text = "\n".join([
            "year,quarter,s_code,charging_location_code,value,source",
            "2026,1,S0001,DE-MUC-001,1.0,csv_upload",
            "2026,2,S0001,DE-MUC-001,2.0,csv_upload",
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
