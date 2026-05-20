"""Integration tests for routers/user_measurement_charging.py — FD-2.

Charging/UM rework: the legacy /api/admin/user-measurement shim (deleted in
FD-2 commit 7) is replaced with this charging-namespaced authoring API. The
suite covers:

- /info reframes the SAP-stub language per [F-DIR-01] (CRETA = system of
  record; SAP = export-only).
- POST /versions handles all three create origins per [F-UM-03] (blank /
  copy_active / copy_prior), including the copy_active "no active to copy" 409.
- POST /versions/from-csv creates a DRAFT and does NOT auto-activate —
  the FD-1 shim closure that motivates this whole cluster.
- PATCH /versions/{id}/cells writes audit + 409s on active per [F-UM-02].
- POST /versions/{id}/activate freezes; double-activate → 409.
- DELETE /versions/{id} permits drafts only; 409 on active.
- Read endpoints are visible to all roles per [F-DIR-03]; writes are
  controller-only (403 for PL).
"""

from __future__ import annotations

from datetime import datetime

import pytest


HEADERS_CTRL = {"X-Current-User": "persona-controller"}
HEADERS_PL = {"X-Current-User": "persona-pl"}
HEADERS_EXEC = {"X-Current-User": "persona-exec"}
HEADERS_CC = {"X-Current-User": "persona-cc-owner"}


@pytest.fixture
def seed_charging_locations(db):
    from models.charging import ChargingLocation
    db.add_all([
        ChargingLocation(id="cl-de-muc", code="DE-MUC-001", name="Munich"),
        ChargingLocation(id="cl-de-bln", code="DE-BLN-001", name="Berlin"),
    ])
    db.commit()


@pytest.fixture
def seed_um_active(db, seed_charging_locations):
    """Seed one active UM version (2026 Q1) with 3 integer cells."""
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
    return v.id


# ---------------------------------------------------------------------------
# /info — the SAP-stub reframing
# ---------------------------------------------------------------------------

class TestInfo:
    def test_returns_creta_authoring_modes(self, test_client, seed_personas):
        resp = test_client.get(
            "/api/charging/user-measurement/info", headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        body = resp.json()
        # [F-DIR-01]: CRETA is the system of record; SAP is export-only.
        assert body["system_of_record"] == "creta"
        assert "in_grid" in body["authoring_modes"]
        assert "csv_bulk_entry" in body["authoring_modes"]
        # FD-4 flips this when the SAP export endpoint ships; until then false.
        assert body["sap_export_available"] is False

    def test_pl_can_read_info(self, test_client, seed_personas):
        # Reads are visible to all roles per [F-DIR-03].
        resp = test_client.get(
            "/api/charging/user-measurement/info", headers=HEADERS_PL,
        )
        assert resp.status_code == 200

    def test_no_sap_language(self, test_client, seed_personas):
        resp = test_client.get(
            "/api/charging/user-measurement/info", headers=HEADERS_CTRL,
        )
        body = resp.json()
        # No leakage of the old "SAP-API integration / not_connected" copy.
        assert "status" not in body  # the legacy 'not_connected' key is gone
        for v in body.values():
            assert "not_connected" != v if isinstance(v, str) else True


# ---------------------------------------------------------------------------
# /versions — list + detail
# ---------------------------------------------------------------------------

class TestVersionsList:
    def test_versions_empty(self, test_client, seed_personas):
        resp = test_client.get(
            "/api/charging/user-measurement/versions", headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        assert resp.json() == {"items": [], "total": 0}

    def test_versions_lists_with_counts(
        self, test_client, db, seed_personas, seed_um_active,
    ):
        resp = test_client.get(
            "/api/charging/user-measurement/versions", headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 1
        item = body["items"][0]
        assert item["status"] == "active"
        assert item["year"] == 2026
        assert item["quarter"] == 1
        assert item["cell_count"] == 3
        assert item["activated_at"].startswith("2026-04-01")

    def test_versions_filter_by_status(
        self, test_client, db, seed_personas, seed_um_active,
    ):
        # Add one draft.
        from models.charging import UMVersion
        db.add(UMVersion(year=2026, quarter=2, status="draft", source="manual"))
        db.commit()

        resp = test_client.get(
            "/api/charging/user-measurement/versions?status=draft",
            headers=HEADERS_CTRL,
        )
        body = resp.json()
        assert body["total"] == 1
        assert body["items"][0]["status"] == "draft"

    def test_pl_can_read_versions(
        self, test_client, db, seed_personas, seed_um_active,
    ):
        resp = test_client.get(
            "/api/charging/user-measurement/versions", headers=HEADERS_PL,
        )
        assert resp.status_code == 200


class TestVersionsDetail:
    def test_version_detail_returns_header_and_cells(
        self, test_client, seed_personas, seed_um_active,
    ):
        resp = test_client.get(
            f"/api/charging/user-measurement/versions/{seed_um_active}",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["version"]["id"] == seed_um_active
        assert body["version"]["cell_count"] == 3
        assert len(body["cells"]) == 3
        # Codes are surfaced for the matrix headers.
        codes = {c["charging_location_code"] for c in body["cells"]}
        assert codes == {"DE-MUC-001", "DE-BLN-001"}
        # Integer-typed cells per [F-UM-01].
        for cell in body["cells"]:
            assert isinstance(cell["value"], int)

    def test_version_detail_unknown_returns_404(
        self, test_client, seed_personas,
    ):
        resp = test_client.get(
            "/api/charging/user-measurement/versions/9999",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /versions — three-origin draft creation per [F-UM-03]
# ---------------------------------------------------------------------------

class TestCreateVersion:
    def test_create_blank_draft(
        self, test_client, db, seed_personas, seed_charging_locations,
    ):
        resp = test_client.post(
            "/api/charging/user-measurement/versions",
            json={"origin": "blank", "year": 2026, "quarter": 3},
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["version"]["status"] == "draft"
        assert body["version"]["source"] == "manual"
        assert body["version"]["year"] == 2026
        assert body["version"]["quarter"] == 3
        assert body["cells"] == []

    def test_create_blank_requires_year_quarter(
        self, test_client, seed_personas, seed_charging_locations,
    ):
        resp = test_client.post(
            "/api/charging/user-measurement/versions",
            json={"origin": "blank"},
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 409

    def test_copy_active_clones_cells(
        self, test_client, db, seed_personas, seed_um_active,
    ):
        resp = test_client.post(
            "/api/charging/user-measurement/versions",
            json={"origin": "copy_active", "year": 2026, "quarter": 1},
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["version"]["status"] == "draft"
        assert body["version"]["source"] == "copy"
        # 3 cells copied across.
        assert len(body["cells"]) == 3
        # Provenance back to the original active version.
        assert body["version"]["copied_from_version_id"] == seed_um_active

    def test_copy_active_409_when_no_active_present(
        self, test_client, seed_personas, seed_charging_locations,
    ):
        resp = test_client.post(
            "/api/charging/user-measurement/versions",
            json={"origin": "copy_active", "year": 2099, "quarter": 1},
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 409
        assert "No active" in resp.json()["detail"]

    def test_copy_prior_uses_source_version_id(
        self, test_client, db, seed_personas, seed_um_active,
    ):
        resp = test_client.post(
            "/api/charging/user-measurement/versions",
            json={"origin": "copy_prior", "source_version_id": seed_um_active},
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["version"]["source"] == "copy"
        assert body["version"]["copied_from_version_id"] == seed_um_active
        assert len(body["cells"]) == 3

    def test_copy_prior_requires_source(
        self, test_client, seed_personas,
    ):
        resp = test_client.post(
            "/api/charging/user-measurement/versions",
            json={"origin": "copy_prior"},
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 409

    def test_create_forbidden_for_pl(
        self, test_client, seed_personas, seed_charging_locations,
    ):
        resp = test_client.post(
            "/api/charging/user-measurement/versions",
            json={"origin": "blank", "year": 2026, "quarter": 3},
            headers=HEADERS_PL,
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# POST /versions/from-csv — closes the FD-1 auto-activate shim
# ---------------------------------------------------------------------------

class TestCsvImport:
    def test_csv_creates_draft_does_not_activate(
        self, test_client, db, seed_personas, seed_charging_locations,
    ):
        csv_text = "\n".join([
            "year,quarter,s_code,charging_location_code,value,source",
            "2026,2,S0001,DE-MUC-001,10,csv_upload",
            "2026,2,S0001,DE-BLN-001,5,csv_upload",
            "2026,2,S0002,DE-MUC-001,0,csv_upload",  # zero -> skipped
        ])
        resp = test_client.post(
            "/api/charging/user-measurement/versions/from-csv",
            headers=HEADERS_CTRL,
            files={"file": ("um.csv", csv_text, "text/csv")},
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        # FD-2: the CSV creates a DRAFT, not an active version.
        assert body["version"]["status"] == "draft"
        assert body["version"]["activated_at"] is None
        assert body["version"]["source"] == "csv_upload"
        assert body["preview"]["inserted"] == 2
        assert body["preview"]["skipped_zero_rows"] == 1
        # And confirm the DB matches.
        from models.charging import UMVersion
        v = db.query(UMVersion).filter_by(year=2026, quarter=2).one()
        assert v.status == "draft"
        assert v.activated_at is None

    def test_csv_rejects_non_integer_value(
        self, test_client, db, seed_personas, seed_charging_locations,
    ):
        csv_text = "\n".join([
            "year,quarter,s_code,charging_location_code,value,source",
            "2026,3,S0001,DE-MUC-001,10.5,csv_upload",
        ])
        resp = test_client.post(
            "/api/charging/user-measurement/versions/from-csv",
            headers=HEADERS_CTRL,
            files={"file": ("um.csv", csv_text, "text/csv")},
        )
        # No usable cells -> 422.
        assert resp.status_code == 422
        assert "integer" in resp.json()["detail"]

    def test_csv_missing_header_400(
        self, test_client, seed_personas, seed_charging_locations,
    ):
        csv_text = "year,quarter,s_code,value\n2026,1,S0001,1"
        resp = test_client.post(
            "/api/charging/user-measurement/versions/from-csv",
            headers=HEADERS_CTRL,
            files={"file": ("um.csv", csv_text, "text/csv")},
        )
        assert resp.status_code == 400
        assert "missing required" in resp.json()["detail"]

    def test_csv_forbidden_for_pl(
        self, test_client, seed_personas, seed_charging_locations,
    ):
        csv_text = "year,quarter,s_code,charging_location_code,value\n2026,1,S0001,DE-MUC-001,1"
        resp = test_client.post(
            "/api/charging/user-measurement/versions/from-csv",
            headers=HEADERS_PL,
            files={"file": ("um.csv", csv_text, "text/csv")},
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# PATCH /versions/{id}/cells — bulk paste + active immutability
# ---------------------------------------------------------------------------

class TestBulkPatchCells:
    def test_bulk_patch_creates_and_updates(
        self, test_client, db, seed_personas, seed_charging_locations,
    ):
        # Create a draft to mutate.
        resp = test_client.post(
            "/api/charging/user-measurement/versions",
            json={"origin": "blank", "year": 2026, "quarter": 3},
            headers=HEADERS_CTRL,
        )
        draft_id = resp.json()["version"]["id"]

        # First patch: create two cells.
        resp = test_client.patch(
            f"/api/charging/user-measurement/versions/{draft_id}/cells",
            json={"cells": [
                {"s_code": "S0001", "charging_location_id": "cl-de-muc", "value": 10},
                {"s_code": "S0001", "charging_location_id": "cl-de-bln", "value": 5},
            ]},
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["total"] == 2
        actions = [m["action"] for m in body["mutations"]]
        assert actions == ["create", "create"]

        # Second patch: update one + delete-via-zero one.
        resp = test_client.patch(
            f"/api/charging/user-measurement/versions/{draft_id}/cells",
            json={"cells": [
                {"s_code": "S0001", "charging_location_id": "cl-de-muc", "value": 99},
                {"s_code": "S0001", "charging_location_id": "cl-de-bln", "value": 0},  # delete
            ]},
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        body = resp.json()
        # Read back the version detail.
        resp = test_client.get(
            f"/api/charging/user-measurement/versions/{draft_id}",
            headers=HEADERS_CTRL,
        )
        cells = resp.json()["cells"]
        assert len(cells) == 1
        assert cells[0]["value"] == 99
        assert cells[0]["s_code"] == "S0001"
        assert cells[0]["charging_location_id"] == "cl-de-muc"

    def test_bulk_patch_409_on_active(
        self, test_client, db, seed_personas, seed_um_active,
    ):
        resp = test_client.patch(
            f"/api/charging/user-measurement/versions/{seed_um_active}/cells",
            json={"cells": [{
                "s_code": "S0001",
                "charging_location_id": "cl-de-muc",
                "value": 999,
            }]},
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 409
        assert "immutable" in resp.json()["detail"]

    def test_bulk_patch_404_unknown_version(
        self, test_client, seed_personas, seed_charging_locations,
    ):
        resp = test_client.patch(
            "/api/charging/user-measurement/versions/9999/cells",
            json={"cells": [{
                "s_code": "S0001",
                "charging_location_id": "cl-de-muc",
                "value": 5,
            }]},
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 404

    def test_bulk_patch_forbidden_for_pl(
        self, test_client, db, seed_personas, seed_charging_locations,
    ):
        resp = test_client.post(
            "/api/charging/user-measurement/versions",
            json={"origin": "blank", "year": 2026, "quarter": 3},
            headers=HEADERS_CTRL,
        )
        draft_id = resp.json()["version"]["id"]
        resp = test_client.patch(
            f"/api/charging/user-measurement/versions/{draft_id}/cells",
            json={"cells": [{
                "s_code": "S0001",
                "charging_location_id": "cl-de-muc",
                "value": 5,
            }]},
            headers=HEADERS_PL,
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# POST /versions/{id}/activate
# ---------------------------------------------------------------------------

class TestActivate:
    def test_activate_freezes_draft(
        self, test_client, db, seed_personas, seed_charging_locations,
    ):
        resp = test_client.post(
            "/api/charging/user-measurement/versions",
            json={"origin": "blank", "year": 2026, "quarter": 3},
            headers=HEADERS_CTRL,
        )
        draft_id = resp.json()["version"]["id"]
        # Drop in one cell so it's a meaningful version.
        test_client.patch(
            f"/api/charging/user-measurement/versions/{draft_id}/cells",
            json={"cells": [{
                "s_code": "S0001",
                "charging_location_id": "cl-de-muc",
                "value": 10,
            }]},
            headers=HEADERS_CTRL,
        )

        resp = test_client.post(
            f"/api/charging/user-measurement/versions/{draft_id}/activate",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["version"]["status"] == "active"
        assert body["version"]["activated_at"] is not None

    def test_double_activate_409(
        self, test_client, db, seed_personas, seed_um_active,
    ):
        resp = test_client.post(
            f"/api/charging/user-measurement/versions/{seed_um_active}/activate",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 409

    def test_activate_unknown_404(self, test_client, seed_personas):
        resp = test_client.post(
            "/api/charging/user-measurement/versions/9999/activate",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 404

    def test_activate_forbidden_for_pl(
        self, test_client, db, seed_personas, seed_charging_locations,
    ):
        resp = test_client.post(
            "/api/charging/user-measurement/versions",
            json={"origin": "blank", "year": 2026, "quarter": 3},
            headers=HEADERS_CTRL,
        )
        draft_id = resp.json()["version"]["id"]
        resp = test_client.post(
            f"/api/charging/user-measurement/versions/{draft_id}/activate",
            headers=HEADERS_PL,
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# DELETE /versions/{id}
# ---------------------------------------------------------------------------

class TestDelete:
    def test_delete_draft_succeeds(
        self, test_client, db, seed_personas, seed_charging_locations,
    ):
        resp = test_client.post(
            "/api/charging/user-measurement/versions",
            json={"origin": "blank", "year": 2026, "quarter": 3},
            headers=HEADERS_CTRL,
        )
        draft_id = resp.json()["version"]["id"]
        resp = test_client.delete(
            f"/api/charging/user-measurement/versions/{draft_id}",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        # Confirm it's gone.
        resp = test_client.get(
            f"/api/charging/user-measurement/versions/{draft_id}",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 404

    def test_delete_active_409(
        self, test_client, db, seed_personas, seed_um_active,
    ):
        resp = test_client.delete(
            f"/api/charging/user-measurement/versions/{seed_um_active}",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 409
        assert "active" in resp.json()["detail"].lower()

    def test_delete_unknown_404(self, test_client, seed_personas):
        resp = test_client.delete(
            "/api/charging/user-measurement/versions/9999",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 404

    def test_delete_forbidden_for_pl(
        self, test_client, db, seed_personas, seed_charging_locations,
    ):
        resp = test_client.post(
            "/api/charging/user-measurement/versions",
            json={"origin": "blank", "year": 2026, "quarter": 3},
            headers=HEADERS_CTRL,
        )
        draft_id = resp.json()["version"]["id"]
        resp = test_client.delete(
            f"/api/charging/user-measurement/versions/{draft_id}",
            headers=HEADERS_PL,
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# /allocation-keys
# ---------------------------------------------------------------------------

class TestAllocationKeys:
    def test_lists_distinct_allocation_keys(
        self, test_client, db, seed_personas, seed_hierarchy,
    ):
        from models.charging import ChargeableEntity
        node = seed_hierarchy["lob_alpha_id"]
        # Two entities sharing a key + one new key + one null.
        db.add_all([
            ChargeableEntity(
                id="ce-a", entity_type="InternalService",
                identifier="IS-A", name="Service A",
                allocation_key="Number of users",
                hierarchy_node_id=node,
            ),
            ChargeableEntity(
                id="ce-b", entity_type="InternalService",
                identifier="IS-B", name="Service B",
                allocation_key="Number of users",
                hierarchy_node_id=node,
            ),
            ChargeableEntity(
                id="ce-c", entity_type="InternalService",
                identifier="IS-C", name="Service C",
                allocation_key="Sales volume (EUR thousands)",
                hierarchy_node_id=node,
            ),
            ChargeableEntity(
                id="ce-d", entity_type="InternalService",
                identifier="IS-D", name="Service D",
                allocation_key=None,
                hierarchy_node_id=node,
            ),
        ])
        db.commit()

        resp = test_client.get(
            "/api/charging/user-measurement/allocation-keys",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        body = resp.json()
        # Distinct, non-null — duplicate "Number of users" collapses.
        assert body["total"] == 2
        assert set(body["items"]) == {
            "Number of users",
            "Sales volume (EUR thousands)",
        }

    def test_pl_can_read_allocation_keys(
        self, test_client, seed_personas,
    ):
        resp = test_client.get(
            "/api/charging/user-measurement/allocation-keys",
            headers=HEADERS_PL,
        )
        assert resp.status_code == 200
