"""Integration tests for the per-entity BTC allocation breakdown endpoint.

GET /api/charging/entities/{entity_id}/allocation-breakdown?year=YYYY

Added in v5 Session F6 per [E-09] for the Workbench BTC tab.
"""

from __future__ import annotations

import pytest

from datetime import date

from models.charging import (
    BTCProfile, BTCProfileLine, ChargeableEntity, ChargingLocation,
    Country, DistributionVersion, LegalEntity, Region,
)
from models.organization import GroupingEntityType, GroupingEntity


HEADERS_CTRL = {"X-Current-User": "persona-controller"}
HEADERS_PL = {"X-Current-User": "persona-pl"}
HEADERS_EXEC = {"X-Current-User": "persona-exec"}
HEADERS_CC = {"X-Current-User": "persona-cc-owner"}
HEADERS_BAD = {"X-Current-User": "persona-nonexistent"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _seed_base(db, *, to_business_pct=60.0, annual_cost=1_000_000.0):
    """Seed entity + 3 charging locations with region/country metadata.

    Also seeds a production-active ``DistributionVersion`` so the
    allocation-breakdown endpoint's version resolver can find an
    in-force version (FD-3 rework — replaces the v4 implicit
    ``version='forecast'`` default).
    """
    get_type = GroupingEntityType(id="get-lob", name="LoB")
    ge = GroupingEntity(id="lob-a", entity_type_id="get-lob", name="LoB A")
    db.add_all([get_type, ge])

    dist_v = DistributionVersion(
        active_from=date(2025, 1, 1), status="active", origin="seed",
        rationale="Allocation-breakdown test seed", scenario_id=None,
    )
    db.add(dist_v)

    ce = ChargeableEntity(
        id="ce-off-1", entity_type="Offering", identifier="IT00S101",
        name="Offering One", to_business_pct=to_business_pct,
        hierarchy_node_id="lob-a", is_active=True, annual_cost=annual_cost,
    )
    db.add(ce)

    region = Region(id="reg-emea", code="EMEA", name="Europe-EMEA", is_active=True)
    country_de = Country(id="country-de", iso_code="DEU", name="Germany", is_active=True)
    country_hu = Country(id="country-hu", iso_code="HUN", name="Hungary", is_active=True)
    db.add_all([region, country_de, country_hu])

    cl_a = ChargingLocation(
        id="cl-a", code="DE-A-001", name="Munich Charging",
        division="Knorr-Bremse Brake Systems", region_id="reg-emea",
        country_id="country-de", is_active=True,
    )
    cl_b = ChargingLocation(
        id="cl-b", code="DE-B-002", name="Hannover Charging",
        division="Knorr-Bremse Brake Systems", region_id="reg-emea",
        country_id="country-de", is_active=True,
    )
    cl_c = ChargingLocation(
        id="cl-c", code="HU-C-001", name="Budapest Charging",
        division="Knorr-Bremse Rail", region_id="reg-emea",
        country_id="country-hu", is_active=True,
    )
    db.add_all([cl_a, cl_b, cl_c])

    le = LegalEntity(
        id="le-de-1", code="LE-DE-001", name="Knorr-Bremse SfS GmbH",
        charging_location_id="cl-a", country_id="country-de", is_active=True,
    )
    db.add(le)

    db.commit()
    return ce


def _make_profile(db, *, entity_id="ce-off-1", year=2026,
                  status="active", lines=None, mode="manual"):
    """Insert a BTCProfile + lines. ``lines`` is list of (cl_id, percentage)."""
    profile = BTCProfile(
        entity_id=entity_id, year=year, mode=mode, status=status,
    )
    db.add(profile)
    db.flush()
    for cl_id, pct in (lines or []):
        db.add(BTCProfileLine(
            profile_id=profile.id,
            charging_location_id=cl_id, percentage=pct,
        ))
    db.commit()
    return profile


URL = "/api/charging/entities/{eid}/allocation-breakdown"


# ---------------------------------------------------------------------------
# 1. Basic shape + happy path
# ---------------------------------------------------------------------------

class TestAllocationBreakdownHappyPath:
    def test_returns_200_and_expected_shape(self, test_client, seed_personas, db):
        _seed_base(db)
        _make_profile(db, lines=[("cl-a", 50.0), ("cl-b", 30.0), ("cl-c", 20.0)])

        resp = test_client.get(
            URL.format(eid="ce-off-1") + "?year=2026", headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()

        # Top-level shape.
        assert data["entity_id"] == "ce-off-1"
        assert data["entity_name"] == "Offering One"
        assert data["year"] == 2026
        # FD-3 rework — response carries the resolved DistributionVersion id
        # (int) instead of the legacy `version` String.
        assert isinstance(data["version_id"], int)
        assert data["version_id"] >= 1
        assert data["to_business_pct"] == 60.0
        assert data["has_profile"] is True
        assert data["sums_to_100"] is True
        assert data["profile_status"] == "active"
        assert data["profile_mode"] == "manual"
        assert data["total"] == 3

        rows = data["rows"]
        assert len(rows) == 3
        # Row keys present.
        for r in rows:
            assert "charging_location_id" in r
            assert "percentage" in r
            assert "amount_eur" in r
            assert "region_name" in r
            assert "division" in r

    def test_amount_calculation_matches_spec(self, test_client, seed_personas, db):
        # effective_cost = own_cost = 1_000_000 (no inflows).
        # business_total = 1_000_000 * 60% = 600_000.
        # cl-a gets 60% of business = 360_000.
        _seed_base(db, to_business_pct=60.0, annual_cost=1_000_000.0)
        _make_profile(db, lines=[("cl-a", 60.0), ("cl-b", 40.0)])

        resp = test_client.get(
            URL.format(eid="ce-off-1") + "?year=2026", headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()

        assert data["effective_cost"] == 1_000_000.0
        assert data["business_amount_total"] == 600_000.0

        rows_by_cl = {r["charging_location_id"]: r for r in data["rows"]}
        assert rows_by_cl["cl-a"]["amount_eur"] == 360_000.0
        assert rows_by_cl["cl-b"]["amount_eur"] == 240_000.0

    def test_rows_enriched_with_region_country_division(
        self, test_client, seed_personas, db,
    ):
        _seed_base(db)
        _make_profile(db, lines=[("cl-a", 100.0)])

        resp = test_client.get(
            URL.format(eid="ce-off-1") + "?year=2026", headers=HEADERS_CTRL,
        )
        data = resp.json()
        row = data["rows"][0]
        assert row["region_name"] == "Europe-EMEA"
        assert row["country_iso_code"] == "DEU"
        assert row["division"] == "Knorr-Bremse Brake Systems"
        assert row["charging_location_code"] == "DE-A-001"
        assert row["charging_location_name"] == "Munich Charging"
        # Optional LE field — populated when there's an active LE on the CL.
        assert row["legal_entity_name"] == "Knorr-Bremse SfS GmbH"


# ---------------------------------------------------------------------------
# 2. Empty / no-profile cases
# ---------------------------------------------------------------------------

class TestAllocationBreakdownEmptyCases:
    def test_no_profile_returns_empty_rows_and_has_profile_false(
        self, test_client, seed_personas, db,
    ):
        _seed_base(db)
        # No BTC profile created.

        resp = test_client.get(
            URL.format(eid="ce-off-1") + "?year=2026", headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["has_profile"] is False
        assert data["profile_id"] is None
        assert data["profile_status"] is None
        assert data["rows"] == []
        assert data["total"] == 0
        assert data["business_amount_total"] == 600_000.0  # still computed

    def test_zero_to_business_pct_returns_zero_amounts(
        self, test_client, seed_personas, db,
    ):
        _seed_base(db, to_business_pct=0.0)
        _make_profile(db, lines=[("cl-a", 100.0)])

        resp = test_client.get(
            URL.format(eid="ce-off-1") + "?year=2026", headers=HEADERS_CTRL,
        )
        data = resp.json()
        assert data["to_business_pct"] == 0.0
        assert data["business_amount_total"] == 0.0
        # Row exists but amount is 0.
        assert data["rows"][0]["amount_eur"] == 0.0


# ---------------------------------------------------------------------------
# 3. 404 / not-found
# ---------------------------------------------------------------------------

class TestAllocationBreakdownNotFound:
    def test_unknown_entity_returns_404(self, test_client, seed_personas, db):
        # Seed a production version so the resolver returns 200; the entity
        # lookup is the one that should 404.
        db.add(DistributionVersion(
            active_from=date(2025, 1, 1), status="active", origin="seed",
            rationale="seed", scenario_id=None,
        ))
        db.commit()
        resp = test_client.get(
            URL.format(eid="no-such-entity") + "?year=2026",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 404, resp.text


# ---------------------------------------------------------------------------
# 4. Sorting
# ---------------------------------------------------------------------------

class TestAllocationBreakdownSorting:
    def test_default_sort_amount_desc(self, test_client, seed_personas, db):
        _seed_base(db)
        _make_profile(db, lines=[("cl-a", 20.0), ("cl-b", 30.0), ("cl-c", 50.0)])

        resp = test_client.get(
            URL.format(eid="ce-off-1") + "?year=2026", headers=HEADERS_CTRL,
        )
        rows = resp.json()["rows"]
        amounts = [r["amount_eur"] for r in rows]
        assert amounts == sorted(amounts, reverse=True)

    def test_sort_percentage_asc(self, test_client, seed_personas, db):
        _seed_base(db)
        _make_profile(db, lines=[("cl-a", 20.0), ("cl-b", 30.0), ("cl-c", 50.0)])

        resp = test_client.get(
            URL.format(eid="ce-off-1") + "?year=2026"
            "&sort_by=percentage&sort_dir=asc",
            headers=HEADERS_CTRL,
        )
        rows = resp.json()["rows"]
        pcts = [r["percentage"] for r in rows]
        assert pcts == [20.0, 30.0, 50.0]

    def test_sort_location_name_asc(self, test_client, seed_personas, db):
        _seed_base(db)
        _make_profile(db, lines=[("cl-a", 30.0), ("cl-b", 30.0), ("cl-c", 40.0)])

        resp = test_client.get(
            URL.format(eid="ce-off-1") + "?year=2026"
            "&sort_by=location&sort_dir=asc",
            headers=HEADERS_CTRL,
        )
        rows = resp.json()["rows"]
        names = [r["charging_location_name"] for r in rows]
        # Sorted alphabetically: "Budapest..", "Hannover..", "Munich..".
        assert names == sorted(names)

    def test_sort_region_desc(self, test_client, seed_personas, db):
        _seed_base(db)
        _make_profile(db, lines=[("cl-a", 50.0), ("cl-b", 50.0)])

        resp = test_client.get(
            URL.format(eid="ce-off-1") + "?year=2026"
            "&sort_by=region&sort_dir=desc",
            headers=HEADERS_CTRL,
        )
        # All same region so no error; rows still return.
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# 5. Role gating — all 4 roles can read
# ---------------------------------------------------------------------------

class TestAllocationBreakdownRoleGating:
    def test_pl_can_read(self, test_client, seed_personas, db):
        _seed_base(db)
        _make_profile(db, lines=[("cl-a", 100.0)])

        resp = test_client.get(
            URL.format(eid="ce-off-1") + "?year=2026", headers=HEADERS_PL,
        )
        assert resp.status_code == 200, resp.text

    def test_executive_can_read(self, test_client, seed_personas, db):
        _seed_base(db)
        _make_profile(db, lines=[("cl-a", 100.0)])

        resp = test_client.get(
            URL.format(eid="ce-off-1") + "?year=2026", headers=HEADERS_EXEC,
        )
        assert resp.status_code == 200, resp.text

    def test_cc_owner_can_read(self, test_client, seed_personas, db):
        _seed_base(db)
        _make_profile(db, lines=[("cl-a", 100.0)])

        resp = test_client.get(
            URL.format(eid="ce-off-1") + "?year=2026", headers=HEADERS_CC,
        )
        assert resp.status_code == 200, resp.text

    def test_unknown_persona_returns_401(self, test_client, seed_personas, db):
        _seed_base(db)
        resp = test_client.get(
            URL.format(eid="ce-off-1") + "?year=2026", headers=HEADERS_BAD,
        )
        assert resp.status_code in (401, 403), resp.text


# ---------------------------------------------------------------------------
# 6. Sums-to-100 flag
# ---------------------------------------------------------------------------

class TestEntityReadOnlyEndpoint:
    """Tests for the new charging-namespaced entity read endpoints (F6 helper)."""

    def test_get_entity_read_only_works_for_pl(self, test_client, seed_personas, db):
        _seed_base(db)

        resp = test_client.get(
            "/api/charging/entities/ce-off-1", headers=HEADERS_PL,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["id"] == "ce-off-1"
        assert data["entity_type"] == "Offering"

    def test_get_entity_read_only_404(self, test_client, seed_personas, db):
        resp = test_client.get(
            "/api/charging/entities/no-such-id", headers=HEADERS_CTRL,
        )
        assert resp.status_code == 404

    def test_get_entity_by_project_id_works(self, test_client, seed_personas, db):
        from models.projects import Project
        from models.charging import ChargeableEntity

        # Seed a project + linked chargeable entity.
        proj = Project(
            id="proj-x", name="Linked", pipeline_stage="Active",
            capex_opex="capex", start_month="2026-01", end_month="2026-12",
        )
        db.add(proj)
        ce = ChargeableEntity(
            id="ce-proj-x", entity_type="Project", identifier="IT0001",
            name="Project X CE", to_business_pct=10.0,
            project_id="proj-x", is_active=True,
        )
        db.add(ce)
        db.commit()

        resp = test_client.get(
            "/api/charging/entities/by-project/proj-x", headers=HEADERS_PL,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["id"] == "ce-proj-x"
        assert data["project_id"] == "proj-x"

    def test_get_entity_by_project_id_404(self, test_client, seed_personas, db):
        resp = test_client.get(
            "/api/charging/entities/by-project/no-such-proj",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 404


class TestAllocationBreakdownSumsTo100:
    def test_sum_lines_match_100_flag_true(self, test_client, seed_personas, db):
        _seed_base(db)
        _make_profile(db, lines=[("cl-a", 50.0), ("cl-b", 50.0)])

        resp = test_client.get(
            URL.format(eid="ce-off-1") + "?year=2026", headers=HEADERS_CTRL,
        )
        assert resp.json()["sums_to_100"] is True

    def test_sum_lines_off_flag_false(self, test_client, seed_personas, db):
        # Manually create a profile with sum != 100 (skipping service validation
        # to test the read endpoint surfaces the discrepancy).
        _seed_base(db)
        prof = BTCProfile(entity_id="ce-off-1", year=2026, mode="manual", status="draft")
        db.add(prof)
        db.flush()
        db.add(BTCProfileLine(
            profile_id=prof.id, charging_location_id="cl-a", percentage=40.0,
        ))
        db.add(BTCProfileLine(
            profile_id=prof.id, charging_location_id="cl-b", percentage=40.0,
        ))
        db.commit()

        resp = test_client.get(
            URL.format(eid="ce-off-1") + "?year=2026", headers=HEADERS_CTRL,
        )
        data = resp.json()
        assert data["sums_to_100"] is False
        # Falls back to draft profile when no active exists.
        assert data["profile_status"] == "draft"
