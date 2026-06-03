"""Router tests for GET /api/charging/cascade/{entity_id} (Service Workbench S2).

Exercises the bidirectional cascade endpoint:

- Payload shape: focal + upstream + downstream nodes + edges + business
  terminals + version + max_allocation_depth.
- Diamond-pattern correctness — the cascade payload's effective_cost
  values must match the memoized resolver, catching any regression of A's
  diamond fix.
- Version resolution — implicit (active production via today) vs explicit
  ``version_id`` query param.
- 404 on unknown entity.
- Access-control parity: all four roles can read.

A ``max_allocation_depth`` PlanningParameter row is seeded inside each
fixture (the foundation-commit's seeded value lives in seed.sql but the
in-memory test DB starts empty).
"""

from __future__ import annotations

from datetime import date

import pytest

from models.charging import (
    BTCProfile, BTCProfileLine, ChargeableEntity, ChargingLocation,
    Country, Distribution, DistributionVersion, Region,
)
from models.organization import GroupingEntity, GroupingEntityType
from models.system import PlanningParameter


def _seed_max_depth_param(db, value: int = 6) -> None:
    """Seed the max_allocation_depth PlanningParameter row.

    Mirrors the foundation-commit seed entry. The in-memory test DB doesn't
    run seed.sql, so we materialise the row per-fixture for the
    depth-aware cascade response to populate ``max_allocation_depth``.
    """
    existing = (
        db.query(PlanningParameter)
        .filter(PlanningParameter.key == "max_allocation_depth")
        .first()
    )
    if existing is None:
        db.add(PlanningParameter(
            key="max_allocation_depth",
            name="Max allocation depth",
            data_type="integer",
            param_group="limits",
            current_value=str(value),
            default_value=str(value),
        ))
        db.flush()


# ---------------------------------------------------------------------------
# Shared seeds
# ---------------------------------------------------------------------------


def _seed_hierarchy_node(db, lob_id: str = "lob-cascade") -> None:
    """Create the LoB hierarchy node ChargeableEntity FKs against."""
    if db.query(GroupingEntityType).filter_by(id="get-lob-c").first() is None:
        db.add(GroupingEntityType(id="get-lob-c", name="LoB-C"))
    if db.query(GroupingEntity).filter_by(id=lob_id).first() is None:
        db.add(GroupingEntity(
            id=lob_id, entity_type_id="get-lob-c", name="LoB Cascade",
        ))
    db.flush()


def _seed_charging_location(db) -> str:
    """Insert a Country + ChargingLocation; return the location id."""
    if db.query(Country).filter_by(id="ctry-de").first() is None:
        db.add(Country(id="ctry-de", iso_code="DE", name="Germany"))
    if db.query(Region).filter_by(id="rgn-emea").first() is None:
        db.add(Region(id="rgn-emea", code="EMEA", name="EMEA"))
    if db.query(ChargingLocation).filter_by(id="cl-muc").first() is None:
        db.add(ChargingLocation(
            id="cl-muc", code="DE-MUC-001", name="Munich",
            region_id="rgn-emea", country_id="ctry-de",
        ))
    db.flush()
    return "cl-muc"


@pytest.fixture
def seed_chain_pos(db, seed_personas):
    """Build P -> O -> S with S having a 50% to_business + 1 BTC line.

    - P (Project, own=1000) -> O (Offering, own=0) 100%
    - O -> S (InternalService, own=0) 100%
    - S.to_business_pct = 50, line at cl-muc 100%

    Effective costs:
      P.effective = 1000
      O.effective = 0 + 1000 * 1.00 = 1000
      S.effective = 0 + 1000 * 1.00 = 1000
      S.business_terminals: amount = 1000 * 0.50 * 1.00 = 500
    """
    _seed_max_depth_param(db)
    _seed_hierarchy_node(db)
    cl_id = _seed_charging_location(db)

    db.add_all([
        ChargeableEntity(
            id="ce-p", entity_type="Offering", identifier="IT00POS",
            name="Source Offering P", to_business_pct=0.0,
            hierarchy_node_id="lob-cascade", annual_cost=1000.0,
        ),
        ChargeableEntity(
            id="ce-o", entity_type="Offering", identifier="IT00MID",
            name="Mid Offering O", to_business_pct=0.0,
            hierarchy_node_id="lob-cascade", annual_cost=0.0,
        ),
        ChargeableEntity(
            id="ce-s", entity_type="InternalService", identifier="ITF00LEAF",
            name="Leaf Service S", to_business_pct=50.0,
            hierarchy_node_id="lob-cascade", annual_cost=0.0,
        ),
    ])
    db.flush()

    # active_from set to demo-year (2026) start so _derive_year matches the
    # BTC profile year. Service Workbench S1 review follow-up: cascade year
    # derivation prefers version.active_from.year for explicit version_id.
    v = DistributionVersion(
        active_from=date(2026, 1, 1), status="active",
        rationale="cascade seed", origin="seed",
    )
    db.add(v)
    db.flush()
    db.add_all([
        Distribution(
            version_id=v.id, source_entity_id="ce-p",
            destination_entity_id="ce-o", percentage=100.0,
        ),
        Distribution(
            version_id=v.id, source_entity_id="ce-o",
            destination_entity_id="ce-s", percentage=100.0,
        ),
    ])
    profile = BTCProfile(
        entity_id="ce-s", year=2026, mode="manual", status="active",
    )
    db.add(profile)
    db.flush()
    db.add(BTCProfileLine(
        profile_id=profile.id, charging_location_id=cl_id, percentage=100.0,
    ))
    db.commit()
    return {"version_id": v.id, "cl_id": cl_id}


@pytest.fixture
def seed_diamond_chain(db, seed_personas):
    """The diamond from A's resolver tests, exposed via the cascade endpoint.

    R -> A (100%), A -> B (40%), A -> C (30%), B -> C (50%)
    own: R=100, A=10, B=20, C=5.

    Expected (memoized):
      R.effective = 100
      A.effective = 110
      B.effective = 64
      C.effective = 70
    """
    _seed_max_depth_param(db)
    _seed_hierarchy_node(db, "lob-diamond-r")
    db.add_all([
        ChargeableEntity(
            id="r", entity_type="Offering", identifier="IT00RRR",
            name="Root R", to_business_pct=0.0,
            hierarchy_node_id="lob-diamond-r", annual_cost=100.0,
        ),
        ChargeableEntity(
            id="a", entity_type="InternalService", identifier="ITF000A1",
            name="Shared A", to_business_pct=0.0,
            hierarchy_node_id="lob-diamond-r", annual_cost=10.0,
        ),
        ChargeableEntity(
            id="b", entity_type="InternalService", identifier="ITF000B1",
            name="Mid B", to_business_pct=0.0,
            hierarchy_node_id="lob-diamond-r", annual_cost=20.0,
        ),
        ChargeableEntity(
            id="c", entity_type="Offering", identifier="IT000CC",
            name="Sink C", to_business_pct=0.0,
            hierarchy_node_id="lob-diamond-r", annual_cost=5.0,
        ),
    ])
    db.flush()
    v = DistributionVersion(
        active_from=date(2025, 1, 1), status="active",
        rationale="diamond seed", origin="seed",
    )
    db.add(v)
    db.flush()
    db.add_all([
        Distribution(version_id=v.id, source_entity_id="r",
                     destination_entity_id="a", percentage=100.0),
        Distribution(version_id=v.id, source_entity_id="a",
                     destination_entity_id="b", percentage=40.0),
        Distribution(version_id=v.id, source_entity_id="a",
                     destination_entity_id="c", percentage=30.0),
        Distribution(version_id=v.id, source_entity_id="b",
                     destination_entity_id="c", percentage=50.0),
    ])
    db.commit()
    return {"version_id": v.id}


def _h(persona: str) -> dict:
    return {"X-Current-User": persona}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestCascadeShape:
    def test_returns_focal_with_upstream_downstream_and_business(
        self, test_client, seed_chain_pos,
    ):
        # Hit the leaf — should have two upstream nodes (P and O), no
        # downstream, and one business terminal at cl-muc.
        r = test_client.get(
            "/api/charging/cascade/ce-s",
            headers=_h("persona-controller"),
        )
        assert r.status_code == 200, r.text
        data = r.json()

        # Focal
        assert data["focal"]["entity_id"] == "ce-s"
        assert data["focal"]["effective_cost"] == 1000.0
        assert data["focal"]["to_business_pct"] == 50.0

        # Upstream — deduped: P + O (in some deterministic order)
        upstream_ids = {n["entity_id"] for n in data["upstream"]}
        assert upstream_ids == {"ce-p", "ce-o"}

        # Downstream — leaf has none
        assert data["downstream"] == []

        # Edges — P->O and O->S
        edge_pairs = {
            (e["source_entity_id"], e["destination_entity_id"])
            for e in data["edges"]
        }
        assert edge_pairs == {("ce-p", "ce-o"), ("ce-o", "ce-s")}
        # Edge amount: O->S carries source=O.effective=1000 * 100% = 1000.
        os_edge = next(
            e for e in data["edges"]
            if e["source_entity_id"] == "ce-o"
        )
        assert os_edge["amount"] == 1000.0

        # Business terminals — one row at cl-muc, amount=500.
        terms = data["business_terminals"]
        assert len(terms) == 1
        assert terms[0]["charging_location_id"] == "cl-muc"
        assert terms[0]["amount"] == 500.0

        # Version block carries the seeded production version.
        assert data["version"]["id"] == seed_chain_pos["version_id"]
        assert data["version"]["status"] == "active"
        assert "max_allocation_depth" in data
        assert data["max_allocation_depth"] >= 1

    def test_focal_at_root_has_downstream_no_upstream(
        self, test_client, seed_chain_pos,
    ):
        r = test_client.get(
            "/api/charging/cascade/ce-p",
            headers=_h("persona-controller"),
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["focal"]["entity_id"] == "ce-p"
        assert data["upstream"] == []
        # Downstream: O and S transitively.
        downstream_ids = {n["entity_id"] for n in data["downstream"]}
        assert downstream_ids == {"ce-o", "ce-s"}


class TestCascadeDiamond:
    def test_diamond_chain_returns_correct_totals(
        self, test_client, seed_diamond_chain,
    ):
        """Decisive guard: cascade response surfaces the memoized C=70.

        If the buggy ``_seen`` resolver ever returns, C.effective would be
        40 here. The assertion below traps that regression at the router
        boundary.
        """
        r = test_client.get(
            "/api/charging/cascade/c",
            headers=_h("persona-controller"),
        )
        assert r.status_code == 200, r.text
        data = r.json()

        assert data["focal"]["entity_id"] == "c"
        assert data["focal"]["effective_cost"] == 70.0, (
            "Diamond regression: C.effective should be 70.0 (memoized "
            "resolver), got %s — _seen truncation bug may have returned."
            % data["focal"]["effective_cost"]
        )

        # Upstream contains R, A, B.
        upstream_costs = {
            n["entity_id"]: n["effective_cost"]
            for n in data["upstream"]
        }
        assert upstream_costs["r"] == 100.0
        assert upstream_costs["a"] == 110.0
        assert upstream_costs["b"] == 64.0


class TestVersionResolution:
    def test_default_version_resolution_uses_active_production(
        self, test_client, seed_chain_pos,
    ):
        # No version_id query param — resolver should pick the seeded
        # production active version (active_from=2025-01-01).
        r = test_client.get(
            "/api/charging/cascade/ce-s",
            headers=_h("persona-controller"),
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["version"]["id"] == seed_chain_pos["version_id"]
        assert data["version"]["status"] == "active"

    def test_explicit_version_id_override(self, test_client, db, seed_chain_pos):
        # Create a separate draft version with no edges; expect the cascade
        # to use it (focal has zero upstream/downstream then).
        v_draft = DistributionVersion(
            active_from=None, status="draft", rationale="", origin="blank",
        )
        db.add(v_draft)
        db.commit()
        r = test_client.get(
            f"/api/charging/cascade/ce-s?version_id={v_draft.id}",
            headers=_h("persona-controller"),
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["version"]["id"] == v_draft.id
        assert data["version"]["status"] == "draft"
        # No edges in the draft → no upstream / downstream / edges.
        assert data["upstream"] == []
        assert data["downstream"] == []
        assert data["edges"] == []


class TestCascadeYearDerivation:
    """Year for own-cost + BTC lookup is derived from evaluated_date / version.active_from.

    Default = DEMO_DATE.year (2026). Explicit evaluated_date overrides.
    Historical version_id with an active_from date drives the year too.
    """

    def test_cascade_year_from_evaluated_date(
        self, test_client, db, seed_chain_pos,
    ):
        # Add a separate BTC profile for 2027 on the same focal entity (ce-s)
        # at the same CL (cl-muc, already seeded). The 2027 profile uses 80%
        # at cl-muc so the amount differs from the 2026 100% profile.
        # With evaluated_date=2027-04-01 → year derives as 2027 → 2027 BTC used.
        # ce-s effective = 1000 (per fixture). to_business = 50.
        # Expected amount = 1000 * 0.50 * 0.80 = 400 (vs 500 with 2026 profile).
        from models.charging import BTCProfile, BTCProfileLine
        p2027 = BTCProfile(
            entity_id="ce-s", year=2027, mode="manual", status="active",
        )
        db.add(p2027)
        db.flush()
        db.add(BTCProfileLine(
            profile_id=p2027.id, charging_location_id="cl-muc",
            percentage=80.0,
        ))
        db.commit()

        r = test_client.get(
            "/api/charging/cascade/ce-s?evaluated_date=2027-04-01",
            headers=_h("persona-controller"),
        )
        assert r.status_code == 200, r.text
        terminals = r.json()["business_terminals"]
        assert len(terminals) == 1, terminals
        # Decisive: 2027 percentage (80) drives amount, not 2026 (100).
        assert terminals[0]["percentage"] == 80.0
        assert terminals[0]["amount"] == 400.0

    def test_cascade_year_from_active_from_when_version_explicit(
        self, test_client, db, seed_chain_pos,
    ):
        # Create a historical version with active_from=2024-01-01 and one
        # edge in it. Pin a 2024-year BTC profile so the cascade has
        # something to find when year derives as 2024. Decisive: with the
        # 2024-year version explicit, the BTC line uses the 2024 profile
        # (percentage=25.0), not the seeded 2026 one (percentage=100.0).
        from models.charging import (
            BTCProfile, BTCProfileLine, Distribution as Dist,
        )
        v_2024 = DistributionVersion(
            active_from=date(2024, 1, 1), status="active",
            rationale="2024 baseline", origin="seed",
        )
        db.add(v_2024)
        db.flush()
        db.add(Dist(
            version_id=v_2024.id, source_entity_id="ce-p",
            destination_entity_id="ce-s", percentage=50.0,
        ))
        p2024 = BTCProfile(
            entity_id="ce-s", year=2024, mode="manual", status="active",
        )
        db.add(p2024)
        db.flush()
        db.add(BTCProfileLine(
            profile_id=p2024.id, charging_location_id="cl-muc",
            percentage=25.0,
        ))
        db.commit()
        r = test_client.get(
            f"/api/charging/cascade/ce-s?version_id={v_2024.id}",
            headers=_h("persona-controller"),
        )
        assert r.status_code == 200, r.text
        data = r.json()
        # Version block reflects the chosen historical version.
        assert data["version"]["id"] == v_2024.id
        # Year derived from version.active_from → 2024 → 2024 profile used.
        terminals = data["business_terminals"]
        assert len(terminals) == 1
        assert terminals[0]["percentage"] == 25.0

    def test_cascade_year_falls_back_to_demo_year(
        self, test_client, db, seed_chain_pos,
    ):
        # Draft version with active_from=None — derive_year should fall
        # back to DEMO_DATE.year (2026). Verify the resolved version
        # behaves as expected (no crash; year-fallback path exercised).
        v_draft = DistributionVersion(
            active_from=None, status="draft",
            rationale="fallback", origin="blank",
        )
        db.add(v_draft)
        db.commit()
        r = test_client.get(
            f"/api/charging/cascade/ce-s?version_id={v_draft.id}",
            headers=_h("persona-controller"),
        )
        assert r.status_code == 200, r.text


class TestCascadeErrors:
    def test_404_unknown_entity(self, test_client, seed_chain_pos):
        r = test_client.get(
            "/api/charging/cascade/no-such-entity",
            headers=_h("persona-controller"),
        )
        assert r.status_code == 404


class TestCascadeAccessControl:
    @pytest.mark.parametrize("persona", [
        "persona-controller",
        "persona-exec",
        "persona-pl",
        "persona-cc-owner",
    ])
    def test_open_to_all_four_roles(
        self, test_client, seed_chain_pos, persona,
    ):
        r = test_client.get(
            "/api/charging/cascade/ce-s",
            headers=_h(persona),
        )
        assert r.status_code == 200, (
            f"Persona {persona} expected 200, got {r.status_code}: {r.text}"
        )


class TestCascadeSandboxScenarioId:
    """Simulator S3: ``?scenario_id`` returns the union-aware sandbox cascade
    so the Lever-12 editor (cascade + distribution-summary) shows its own
    added sandbox edge — while the canonical (no param) cascade is unaffected."""

    @pytest.fixture
    def sandbox_scenario(self, db, seed_chain_pos):
        """Anchor the chain (P→O→S) to a scenario and add a sandbox edge
        S→X (30%). S's incoming chain (P→O→S, un-forked) is untouched."""
        from models.scenarios import Scenario
        from services.scenario_cost_allocation import apply_distribution_create

        db.add(ChargeableEntity(
            id="ce-x", entity_type="InternalService", identifier="ITF00XXX",
            name="Sandbox Sink X", to_business_pct=0.0,
            hierarchy_node_id="lob-cascade", annual_cost=0.0,
        ))
        scenario = Scenario(
            name="Sandbox cascade scenario", author_id="p-dev-1",
            status="private",
            anchor_distribution_version_id=seed_chain_pos["version_id"],
        )
        db.add(scenario)
        db.commit()
        apply_distribution_create(
            db, scenario.id, year=2026,
            source_entity_id="ce-s", destination_entity_id="ce-x",
            percentage=30.0,
        )
        db.commit()
        return {"scenario_id": scenario.id}

    def test_sandbox_cascade_shows_added_edge(
        self, test_client, sandbox_scenario,
    ):
        r = test_client.get(
            f"/api/charging/cascade/ce-s?scenario_id={sandbox_scenario['scenario_id']}",
            headers=_h("persona-controller"),
        )
        assert r.status_code == 200, r.text
        body = r.json()
        # Focal effective cost preserved via the un-forked upstream chain.
        assert body["focal"]["effective_cost"] == 1000.0
        # The added sandbox destination is WYSIWYG-visible in the cascade.
        assert "ce-x" in {n["entity_id"] for n in body["downstream"]}
        assert any(
            e["source_entity_id"] == "ce-s" and e["destination_entity_id"] == "ce-x"
            for e in body["edges"]
        )

    def test_canonical_cascade_ignores_sandbox_edge(
        self, test_client, sandbox_scenario,
    ):
        # No scenario_id → production cascade, sandbox edge absent.
        r = test_client.get(
            "/api/charging/cascade/ce-s",
            headers=_h("persona-controller"),
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "ce-x" not in {n["entity_id"] for n in body["downstream"]}
        assert not any(
            e["destination_entity_id"] == "ce-x" for e in body["edges"]
        )

    def test_distribution_summary_shows_sandbox_edge(
        self, test_client, sandbox_scenario,
    ):
        # The editor's edge-id source must also reflect the sandbox edge.
        r = test_client.get(
            f"/api/charging/entities/ce-s/distribution-summary"
            f"?scenario_id={sandbox_scenario['scenario_id']}",
            headers=_h("persona-controller"),
        )
        assert r.status_code == 200, r.text
        body = r.json()
        dests = {d["destination_entity_id"] for d in body["distributions"]}
        assert "ce-x" in dests

    def test_scenario_id_enforces_visibility(self, test_client, sandbox_scenario):
        """A non-owner cannot read another author's private scenario sandbox via
        ``?scenario_id`` — the cascade + summary honour the scenario visibility
        rule. The scenario is authored by p-dev-1 (= persona-controller in the
        test seed); persona-exec (p-dev-2) is an allowed role but a non-owner."""
        sid = sandbox_scenario["scenario_id"]
        cascade = test_client.get(
            f"/api/charging/cascade/ce-s?scenario_id={sid}",
            headers=_h("persona-exec"),
        )
        assert cascade.status_code == 403, cascade.text
        summary = test_client.get(
            f"/api/charging/entities/ce-s/distribution-summary?scenario_id={sid}",
            headers=_h("persona-exec"),
        )
        assert summary.status_code == 403, summary.text

    def test_canonical_path_open_without_scenario_id(
        self, test_client, sandbox_scenario,
    ):
        """The visibility gate only applies to the sandbox branch — the canonical
        cascade (no scenario_id) stays open to the allowed roles."""
        r = test_client.get(
            "/api/charging/cascade/ce-s",
            headers=_h("persona-exec"),
        )
        assert r.status_code == 200, r.text
