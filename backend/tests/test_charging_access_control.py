"""Role-permission-matrix tests for the Charging & Allocations endpoints [A-05].

Verifies the v5.1 access-control table:

| Role               | Reads  | Mutations |
|--------------------|--------|-----------|
| controller         | allow  | allow     |
| cost_center_owner  | allow  | deny (403)|
| project_lead       | allow  | deny (403)|
| executive          | allow  | deny (403)|

The matrix is enforced via ``require_role(...)`` on every endpoint in
``backend/routers/charging.py``. These tests exercise representative
endpoints from each surface (Country, Region, ChargingLocation, LegalEntity,
ChargeableEntity, Distribution, BTCProfile, RollupCache).

For mutation endpoints we assert HTTP 403 for the three non-controller roles.
For read endpoints we assert HTTP 200 (or any non-403, non-422 status that
indicates the role gate let the request through — for example a 404 for an
unknown entity ID is an acceptable signal that authorisation passed and the
business logic ran).
"""

from __future__ import annotations

import pytest

from datetime import date

from models.charging import (
    BTCProfile, BTCProfileLine, ChargeableEntity, ChargingLocation,
    Country, Distribution, DistributionVersion, LegalEntity, Region,
)
from models.organization import GroupingEntity, GroupingEntityType


# ---------------------------------------------------------------------------
# Persona constants
# ---------------------------------------------------------------------------

PERSONA_CONTROLLER = "persona-controller"
PERSONA_CC_OWNER = "persona-cc-owner"
PERSONA_PL = "persona-pl"
PERSONA_EXEC = "persona-exec"

ALL_FOUR_PERSONAS = [
    PERSONA_CONTROLLER,
    PERSONA_CC_OWNER,
    PERSONA_PL,
    PERSONA_EXEC,
]
NON_CONTROLLER_PERSONAS = [
    PERSONA_CC_OWNER,
    PERSONA_PL,
    PERSONA_EXEC,
]


# ---------------------------------------------------------------------------
# Shared seed helpers
# ---------------------------------------------------------------------------

@pytest.fixture
def seed_charging_data(db, seed_org_base, seed_personas):
    """Seed enough charging master data + a chargeable-entity graph to exercise
    every endpoint in the matrix.

    Returns a dict with handy IDs for tests to address specific rows.
    """
    # Master data
    country = Country(id="ctry-de", iso_code="DE", name="Germany")
    region = Region(id="rgn-emea", code="EMEA", name="Europe Middle East Africa")
    cl = ChargingLocation(
        id="cl-de-muc", code="DE-MUC-001", name="Munich",
        region_id="rgn-emea", country_id="ctry-de",
    )
    le = LegalEntity(
        id="le-kb-de", code="KB-DE", name="Knorr-Bremse Deutschland",
        charging_location_id="cl-de-muc", country_id="ctry-de",
    )
    db.add_all([country, region, cl, le])

    # Hierarchy node
    et = GroupingEntityType(id="get-lob", name="LoB")
    ge = GroupingEntity(id="lob-1", entity_type_id="get-lob", name="LoB One")
    db.add_all([et, ge])

    # Two chargeable entities so we can test distribution edges
    db.add_all([
        ChargeableEntity(
            id="ce-a", entity_type="InternalService", identifier="ITF99001",
            name="Internal A", to_business_pct=0.0, hierarchy_node_id="lob-1",
            annual_cost=100000.0,
        ),
        ChargeableEntity(
            id="ce-b", entity_type="Offering", identifier="IT00BBB",
            name="Offering B", to_business_pct=50.0, hierarchy_node_id="lob-1",
            annual_cost=200000.0,
        ),
    ])
    db.flush()

    # Stage 1 distribution versions + edge (FD-3 effective-dated model).
    # Active production version pinned to 2025-01-01 so the resolver picks
    # it at the demo date; a separate empty draft version exists for tests
    # that need to exercise edge-create mutations (active versions are
    # immutable per [F-S1-08]).
    dist_version = DistributionVersion(
        active_from=date(2025, 1, 1),
        status="active",
        origin="seed",
        rationale="Test seed distribution",
        scenario_id=None,
    )
    dist_draft_version = DistributionVersion(
        active_from=None,
        status="draft",
        origin="blank",
        rationale="",
        scenario_id=None,
    )
    db.add_all([dist_version, dist_draft_version])
    db.flush()
    edge = Distribution(
        version_id=dist_version.id,
        source_entity_id="ce-a", destination_entity_id="ce-b", percentage=20.0,
    )
    db.add(edge)

    # One BTC profile + line
    profile = BTCProfile(
        entity_id="ce-b", year=2026, mode="manual", status="active",
    )
    db.add(profile)
    db.flush()
    db.add(BTCProfileLine(
        profile_id=profile.id, charging_location_id="cl-de-muc", percentage=100.0,
    ))
    db.commit()

    return {
        "country_id": "ctry-de",
        "region_id": "rgn-emea",
        "cl_id": "cl-de-muc",
        "le_id": "le-kb-de",
        "ce_a_id": "ce-a",
        "ce_b_id": "ce-b",
        "edge_id": edge.id,
        "profile_id": profile.id,
        "dist_version_id": dist_version.id,
        "dist_draft_version_id": dist_draft_version.id,
    }


def _h(persona: str) -> dict:
    return {"X-Current-User": persona}


# ---------------------------------------------------------------------------
# READS — all four personas must succeed (non-403 status)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("persona", ALL_FOUR_PERSONAS)
class TestReadEndpointsOpenToAllRoles:
    """Every GET endpoint on Charging & Allocations must accept all four roles.

    A 200/404 outcome means the role gate let the request through. A 403 means
    the gate is wrong.
    """

    # --- Admin master data ---

    def test_get_countries(self, test_client, seed_charging_data, persona):
        r = test_client.get("/api/admin/countries", headers=_h(persona))
        assert r.status_code == 200

    def test_get_regions(self, test_client, seed_charging_data, persona):
        r = test_client.get("/api/admin/regions", headers=_h(persona))
        assert r.status_code == 200

    def test_get_charging_locations_admin(self, test_client, seed_charging_data, persona):
        r = test_client.get("/api/admin/charging-locations", headers=_h(persona))
        assert r.status_code == 200

    def test_get_legal_entities(self, test_client, seed_charging_data, persona):
        r = test_client.get("/api/admin/legal-entities", headers=_h(persona))
        assert r.status_code == 200

    def test_list_chargeable_entities(self, test_client, seed_charging_data, persona):
        r = test_client.get("/api/admin/chargeable-entities", headers=_h(persona))
        assert r.status_code == 200

    def test_get_chargeable_entity(self, test_client, seed_charging_data, persona):
        r = test_client.get(
            f"/api/admin/chargeable-entities/{seed_charging_data['ce_a_id']}",
            headers=_h(persona),
        )
        assert r.status_code == 200

    def test_rollup_cache_status(self, test_client, seed_charging_data, persona):
        r = test_client.get("/api/admin/rollup-cache/status", headers=_h(persona))
        assert r.status_code == 200

    # --- Charging consumer-facing reads ---

    def test_charging_locations_read_only(self, test_client, seed_charging_data, persona):
        r = test_client.get("/api/charging/charging-locations", headers=_h(persona))
        assert r.status_code == 200

    def test_distributions_list(self, test_client, seed_charging_data, persona):
        r = test_client.get("/api/charging/distributions", headers=_h(persona))
        assert r.status_code == 200

    def test_distributions_get(self, test_client, seed_charging_data, persona):
        edge_id = seed_charging_data["edge_id"]
        r = test_client.get(
            f"/api/charging/distributions/{edge_id}", headers=_h(persona),
        )
        assert r.status_code == 200

    def test_entity_distribution_summary(self, test_client, seed_charging_data, persona):
        # FD-3: rescoped from (year, version-string) to version_id FK.
        r = test_client.get(
            f"/api/charging/entities/{seed_charging_data['ce_b_id']}"
            f"/distribution-summary?version_id={seed_charging_data['dist_version_id']}",
            headers=_h(persona),
        )
        assert r.status_code == 200

    def test_entity_effective_cost(self, test_client, seed_charging_data, persona):
        # FD-3: year retained (own-cost is year-scoped); version string → version_id.
        r = test_client.get(
            f"/api/charging/entities/{seed_charging_data['ce_b_id']}"
            f"/effective-cost?year=2026&version_id={seed_charging_data['dist_version_id']}",
            headers=_h(persona),
        )
        assert r.status_code == 200

    def test_entity_upstream_chain(self, test_client, seed_charging_data, persona):
        # FD-3: rescoped from (year, version-string) to version_id FK.
        r = test_client.get(
            f"/api/charging/entities/{seed_charging_data['ce_b_id']}"
            f"/upstream-chain?version_id={seed_charging_data['dist_version_id']}",
            headers=_h(persona),
        )
        assert r.status_code == 200

    def test_entity_wbs(self, test_client, seed_charging_data, persona):
        r = test_client.get(
            f"/api/charging/entities/{seed_charging_data['ce_b_id']}"
            f"/wbs/{seed_charging_data['cl_id']}",
            headers=_h(persona),
        )
        assert r.status_code == 200

    def test_btc_profile_list(self, test_client, seed_charging_data, persona):
        r = test_client.get("/api/charging/btc-profiles", headers=_h(persona))
        assert r.status_code == 200

    def test_btc_profile_get(self, test_client, seed_charging_data, persona):
        profile_id = seed_charging_data["profile_id"]
        r = test_client.get(
            f"/api/charging/btc-profiles/{profile_id}", headers=_h(persona),
        )
        assert r.status_code == 200

    def test_entity_btc_profile(self, test_client, seed_charging_data, persona):
        r = test_client.get(
            f"/api/charging/entities/{seed_charging_data['ce_b_id']}"
            "/btc-profile?year=2026",
            headers=_h(persona),
        )
        assert r.status_code == 200

    def test_entity_wbs_matrix(self, test_client, seed_charging_data, persona):
        r = test_client.get(
            f"/api/charging/entities/{seed_charging_data['ce_b_id']}"
            "/wbs-matrix?year=2026",
            headers=_h(persona),
        )
        assert r.status_code == 200

    def test_rollup(self, test_client, seed_charging_data, persona):
        r = test_client.get(
            "/api/charging/rollup?year=2026&version=forecast&group_by=entity_type",
            headers=_h(persona),
        )
        assert r.status_code == 200

    def test_location_breakdown(self, test_client, seed_charging_data, persona):
        r = test_client.get(
            f"/api/charging/locations/{seed_charging_data['cl_id']}/breakdown"
            "?year=2026&version=forecast",
            headers=_h(persona),
        )
        # 200 if location has rollup data; 404 if not — both signals authz passed.
        assert r.status_code in (200, 404)

    def test_entity_by_project(self, test_client, seed_charging_data, persona):
        # No project linked yet — should 404 (not 403).
        r = test_client.get(
            "/api/charging/entities/by-project/proj-alpha", headers=_h(persona),
        )
        assert r.status_code == 404

    def test_entity_read_only(self, test_client, seed_charging_data, persona):
        r = test_client.get(
            f"/api/charging/entities/{seed_charging_data['ce_a_id']}",
            headers=_h(persona),
        )
        assert r.status_code == 200

    def test_entity_allocation_breakdown(self, test_client, seed_charging_data, persona):
        r = test_client.get(
            f"/api/charging/entities/{seed_charging_data['ce_b_id']}"
            "/allocation-breakdown?year=2026&version=forecast",
            headers=_h(persona),
        )
        # 200 if breakdown data present, 404 if entity/profile lookup fails — both signal authz passed.
        assert r.status_code in (200, 404)


# ---------------------------------------------------------------------------
# MUTATIONS — non-controller personas must get 403
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("persona", NON_CONTROLLER_PERSONAS)
class TestMutationsForbiddenForNonControllers:
    """Every POST/PUT/PATCH/DELETE endpoint on Charging & Allocations must
    reject non-controller roles with HTTP 403.

    The role gate must fire before any request body validation, so the JSON
    shape is irrelevant here — the gate must short-circuit the handler.
    """

    # --- Country mutations ---

    def test_create_country(self, test_client, seed_charging_data, persona):
        r = test_client.post(
            "/api/admin/countries", headers=_h(persona),
            json={"iso_code": "FR", "name": "France"},
        )
        assert r.status_code == 403

    def test_update_country(self, test_client, seed_charging_data, persona):
        r = test_client.put(
            f"/api/admin/countries/{seed_charging_data['country_id']}",
            headers=_h(persona), json={"name": "New Name"},
        )
        assert r.status_code == 403

    def test_deactivate_country(self, test_client, seed_charging_data, persona):
        r = test_client.put(
            f"/api/admin/countries/{seed_charging_data['country_id']}/deactivate",
            headers=_h(persona),
        )
        assert r.status_code == 403

    # --- Region mutations ---

    def test_create_region(self, test_client, seed_charging_data, persona):
        r = test_client.post(
            "/api/admin/regions", headers=_h(persona),
            json={"code": "NA", "name": "North America"},
        )
        assert r.status_code == 403

    def test_update_region(self, test_client, seed_charging_data, persona):
        r = test_client.put(
            f"/api/admin/regions/{seed_charging_data['region_id']}",
            headers=_h(persona), json={"name": "EMEA Updated"},
        )
        assert r.status_code == 403

    def test_deactivate_region(self, test_client, seed_charging_data, persona):
        r = test_client.put(
            f"/api/admin/regions/{seed_charging_data['region_id']}/deactivate",
            headers=_h(persona),
        )
        assert r.status_code == 403

    # --- ChargingLocation mutations ---

    def test_create_charging_location(self, test_client, seed_charging_data, persona):
        r = test_client.post(
            "/api/admin/charging-locations", headers=_h(persona),
            json={"code": "DE-BER-001", "name": "Berlin", "division": "Tech"},
        )
        assert r.status_code == 403

    def test_update_charging_location(self, test_client, seed_charging_data, persona):
        r = test_client.put(
            f"/api/admin/charging-locations/{seed_charging_data['cl_id']}",
            headers=_h(persona), json={"name": "Munich Updated"},
        )
        assert r.status_code == 403

    def test_deactivate_charging_location(self, test_client, seed_charging_data, persona):
        r = test_client.put(
            f"/api/admin/charging-locations/{seed_charging_data['cl_id']}/deactivate",
            headers=_h(persona),
        )
        assert r.status_code == 403

    # --- LegalEntity mutations ---

    def test_create_legal_entity(self, test_client, seed_charging_data, persona):
        r = test_client.post(
            "/api/admin/legal-entities", headers=_h(persona),
            json={"code": "KB-FR", "name": "KB France"},
        )
        assert r.status_code == 403

    def test_update_legal_entity(self, test_client, seed_charging_data, persona):
        r = test_client.put(
            f"/api/admin/legal-entities/{seed_charging_data['le_id']}",
            headers=_h(persona), json={"name": "KB DE Updated"},
        )
        assert r.status_code == 403

    def test_deactivate_legal_entity(self, test_client, seed_charging_data, persona):
        r = test_client.put(
            f"/api/admin/legal-entities/{seed_charging_data['le_id']}/deactivate",
            headers=_h(persona),
        )
        assert r.status_code == 403

    # --- ChargeableEntity mutations ---

    def test_create_chargeable_entity(self, test_client, seed_charging_data, persona):
        r = test_client.post(
            "/api/admin/chargeable-entities", headers=_h(persona),
            json={
                "entity_type": "Offering", "identifier": "IT00ZZZ", "name": "Z",
                "to_business_pct": 0.0,
            },
        )
        assert r.status_code == 403

    def test_update_chargeable_entity(self, test_client, seed_charging_data, persona):
        r = test_client.put(
            f"/api/admin/chargeable-entities/{seed_charging_data['ce_a_id']}",
            headers=_h(persona), json={"name": "Renamed A"},
        )
        assert r.status_code == 403

    def test_deactivate_chargeable_entity(self, test_client, seed_charging_data, persona):
        r = test_client.put(
            f"/api/admin/chargeable-entities/{seed_charging_data['ce_a_id']}/deactivate",
            headers=_h(persona),
        )
        assert r.status_code == 403

    # --- Distribution mutations ---

    def test_create_distribution(self, test_client, seed_charging_data, persona):
        r = test_client.post(
            "/api/charging/distributions", headers=_h(persona),
            json={
                "year": 2026, "version": "forecast",
                "source_entity_id": "ce-a", "destination_entity_id": "ce-b",
                "percentage": 5.0,
            },
        )
        assert r.status_code == 403

    def test_update_distribution(self, test_client, seed_charging_data, persona):
        edge_id = seed_charging_data["edge_id"]
        r = test_client.put(
            f"/api/charging/distributions/{edge_id}",
            headers=_h(persona), json={"percentage": 10.0},
        )
        assert r.status_code == 403

    def test_delete_distribution(self, test_client, seed_charging_data, persona):
        edge_id = seed_charging_data["edge_id"]
        r = test_client.delete(
            f"/api/charging/distributions/{edge_id}", headers=_h(persona),
        )
        assert r.status_code == 403

    def test_update_to_business_pct(self, test_client, seed_charging_data, persona):
        # FD-3: rescoped from (year, version-string) to version_id FK (required).
        r = test_client.put(
            f"/api/charging/entities/{seed_charging_data['ce_b_id']}"
            f"/to-business-pct?new_pct=40&version_id={seed_charging_data['dist_version_id']}",
            headers=_h(persona),
        )
        assert r.status_code == 403

    # --- BTC profile mutations ---

    def test_create_btc_profile(self, test_client, seed_charging_data, persona):
        r = test_client.post(
            "/api/charging/btc-profiles", headers=_h(persona),
            json={
                "entity_id": "ce-a", "year": 2027, "mode": "manual",
                "status": "draft", "lines": [],
            },
        )
        assert r.status_code == 403

    def test_update_btc_profile(self, test_client, seed_charging_data, persona):
        profile_id = seed_charging_data["profile_id"]
        r = test_client.put(
            f"/api/charging/btc-profiles/{profile_id}", headers=_h(persona),
            json={"lines": []},
        )
        assert r.status_code == 403

    def test_delete_btc_profile(self, test_client, seed_charging_data, persona):
        profile_id = seed_charging_data["profile_id"]
        r = test_client.delete(
            f"/api/charging/btc-profiles/{profile_id}", headers=_h(persona),
        )
        assert r.status_code == 403

    def test_refresh_btc_from_um(self, test_client, seed_charging_data, persona):
        profile_id = seed_charging_data["profile_id"]
        r = test_client.post(
            f"/api/charging/btc-profiles/{profile_id}/refresh-um",
            headers=_h(persona),
            json={"um_year": 2026, "um_quarter": 1, "dry_run": True},
        )
        assert r.status_code == 403

    def test_change_btc_mode(self, test_client, seed_charging_data, persona):
        profile_id = seed_charging_data["profile_id"]
        r = test_client.post(
            f"/api/charging/btc-profiles/{profile_id}/change-mode",
            headers=_h(persona),
            json={"new_mode": "automatic", "confirm": True},
        )
        assert r.status_code == 403

    def test_copy_btc_profile(self, test_client, seed_charging_data, persona):
        profile_id = seed_charging_data["profile_id"]
        r = test_client.post(
            f"/api/charging/btc-profiles/{profile_id}/copy-from",
            headers=_h(persona),
            json={
                "source_profile_id": profile_id,
                "target_entity_id": "ce-a", "target_year": 2027,
            },
        )
        assert r.status_code == 403

    def test_btc_year_rollover(self, test_client, seed_charging_data, persona):
        r = test_client.post(
            "/api/admin/btc-profiles/year-rollover", headers=_h(persona),
            json={"source_year": 2026, "target_year": 2027},
        )
        assert r.status_code == 403

    # --- Rollup cache mutations ---

    def test_invalidate_rollup_cache(self, test_client, seed_charging_data, persona):
        r = test_client.post(
            "/api/admin/rollup-cache/invalidate", headers=_h(persona),
        )
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# MUTATIONS — controller must succeed (not 403)
# ---------------------------------------------------------------------------

class TestControllerMutationsSucceed:
    """Spot-check that the role gate doesn't accidentally block the controller.

    The controller persona is the only role with full mutation access on
    Charging & Allocations. We test one mutation per surface to cover the
    affirmative case — full functional coverage lives in the per-router
    test files (test_router_distribution, test_router_btc_profile, etc.).
    """

    def test_controller_creates_country(self, test_client, seed_personas):
        r = test_client.post(
            "/api/admin/countries", headers=_h(PERSONA_CONTROLLER),
            json={"iso_code": "FR", "name": "France"},
        )
        assert r.status_code == 200

    def test_controller_creates_region(self, test_client, seed_personas):
        r = test_client.post(
            "/api/admin/regions", headers=_h(PERSONA_CONTROLLER),
            json={"code": "NA", "name": "North America"},
        )
        assert r.status_code == 200

    def test_controller_creates_distribution(self, test_client, seed_charging_data):
        # FD-3: edges are written against a *draft* version_id. The active
        # version (with the ce-a → ce-b edge already) is immutable per
        # [F-S1-08]; we create the new edge on the draft version so the
        # business-logic path executes (the role gate is what's under test).
        r = test_client.post(
            "/api/charging/distributions", headers=_h(PERSONA_CONTROLLER),
            json={
                "version_id": seed_charging_data["dist_draft_version_id"],
                "source_entity_id": "ce-b", "destination_entity_id": "ce-a",
                "percentage": 5.0,
            },
        )
        # 201 if the draft accepts the edge; 409 if business logic blocks
        # (cycle / sum-rule). 200 if the router returns the created object
        # at base path. Any non-403 signal proves the role gate passed.
        assert r.status_code in (200, 201, 409)

    def test_controller_invalidates_rollup_cache(self, test_client, seed_charging_data):
        r = test_client.post(
            "/api/admin/rollup-cache/invalidate", headers=_h(PERSONA_CONTROLLER),
        )
        assert r.status_code == 200
