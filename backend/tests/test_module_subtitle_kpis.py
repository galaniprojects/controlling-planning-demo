"""Integration tests for v5.1 W6 [C-01] module-card subtitle KPIs.

Each visible module card on the Launchpad now carries 1–2 short
role-differentiated KPI strings. The strings are rendered under the
description and replace the previous role-tile grid.

Tests are grouped one class per role so the cross-cutting Portfolio canary
(``All`` row in the spec — must be byte-identical across roles) lives
alongside the role-specific format checks.
"""

from __future__ import annotations

import re
from unittest.mock import patch

import pytest


HEADERS_CTRL = {"X-Current-User": "persona-controller"}
HEADERS_PL = {"X-Current-User": "persona-pl"}
HEADERS_CCO = {"X-Current-User": "persona-cc-owner"}
HEADERS_EXEC = {"X-Current-User": "persona-exec"}


# ---------------------------------------------------------------------------
# Fixture — projects + scenarios + allocations + admin master data so every
# subtitle string has non-empty data to render.
# ---------------------------------------------------------------------------

@pytest.fixture
def seed_launchpad_data(db, seed_org_base, seed_personas):
    """Seed the spread of records that drive subtitle KPI math.

    Mirrors the legacy ``test_router_launchpad_tiles`` fixture so the same
    persona/role conftest contract is used. Adds Distribution, BTCProfile,
    SavedReport, and ScheduledChange rows that exercise the new modules.
    """
    from datetime import datetime, date

    from models.capacity import Allocation, ResourceRequest
    from models.change_requests import ChangeRequest
    from models.charging import (
        BTCProfile, ChargeableEntity, Distribution,
    )
    from models.financial import Forecast, Actuals
    from models.projects import Project
    from models.reporting import SavedReport
    from models.scenarios import Scenario
    from models.scheduled_changes import ScheduledChange

    # --- Projects -----------------------------------------------------------
    proj_alpha = Project(
        id="proj-alpha", name="Alpha", status="active",
        capex_opex="capex", start_month="2026-01", end_month="2026-12",
        pl_person_id="p-pm-1",
        rag_status="green", total_budget=100000.0,
        progress_pct=60.0, last_forecast_submitted_month="2026-04",
        pipeline_stage="Active",
        within_cutoff=True,
    )
    proj_beta = Project(
        id="proj-beta", name="Beta", status="active",
        capex_opex="capex", start_month="2026-01", end_month="2026-12",
        pl_person_id="p-pm-1",
        rag_status="amber", total_budget=50000.0,
        progress_pct=20.0,
        # Last submitted in Feb -> overdue under DEMO_DATE 2026-04
        last_forecast_submitted_month="2026-02",
        pipeline_stage="Active",
    )
    proj_gamma = Project(
        id="proj-gamma", name="Gamma", status="active",
        capex_opex="capex", start_month="2026-01", end_month="2026-12",
        rag_status="red", total_budget=200000.0,
        last_forecast_submitted_month="2026-04",
        pipeline_stage="Proposed",
        within_cutoff=True,
    )
    proj_delta = Project(
        id="proj-delta", name="Delta", status="pending_approval",
        capex_opex="capex", start_month="2026-01",
        pipeline_stage="Under Evaluation",
        within_cutoff=False,
    )
    db.add_all([proj_alpha, proj_beta, proj_gamma, proj_delta])
    db.flush()

    # --- Forecast / actuals so portfolio KPIs are non-zero -----------------
    db.add(Forecast(project_id="proj-alpha", month="2026-01", category="internal",
                    sub_category="role-dev", amount_eur=5000.0, hours=40))
    db.add(Forecast(project_id="proj-beta", month="2026-01", category="internal",
                    sub_category="role-dev", amount_eur=3000.0, hours=24))
    db.add(Actuals(project_id="proj-alpha", month="2026-01", category="internal",
                   sub_category="role-dev", amount_eur=5500.0, hours=42))

    # --- Scenarios (1 published, 1 private) --------------------------------
    db.add_all([
        Scenario(
            id=1, name="Published Scenario", description="Test",
            status="published", author_id="p-dev-1", visibility="all_users",
        ),
        Scenario(
            id=2, name="Private Scenario", description="Test",
            status="private", author_id="p-pm-1", visibility="private",
        ),
    ])

    # --- Allocations so cc-muc-dev utilisation is computable ---------------
    db.add(Allocation(person_id="p-dev-1", project_id="proj-alpha",
                      month="2026-04", hours=80, is_confirmed=True))
    db.add(Allocation(person_id="p-dev-2", project_id="proj-alpha",
                      month="2026-04", hours=80, is_confirmed=True))
    db.add(Allocation(person_id="p-pm-1", project_id="proj-alpha",
                      month="2026-04", hours=80, is_confirmed=True))

    # --- One pending resource request ------------------------------------
    db.add(ResourceRequest(
        project_id="proj-alpha", cost_center_id="cc-muc-dev",
        request_type="resource", role_type_id="role-dev",
        hours_or_amount_per_month=80.0,
        period_start="2026-01", period_end="2026-12",
        priority="high", status="pending",
    ))
    db.add(ChangeRequest(
        project_id="proj-alpha", summary="Test CR",
        submitted_by_id="p-pm-1", status="pending_controller_approval",
        cc_owner_id="p-dev-1", submission_timestamp=datetime.utcnow(),
        change_category="resource",
    ))

    # --- Charging Distribution + BTC profile pair --------------------------
    src = ChargeableEntity(
        id="ce-src", name="Source", entity_type="Offering",
        identifier="IT00S001", to_business_pct=0, hierarchy_node_id=None,
        is_active=True,
    )
    dst = ChargeableEntity(
        id="ce-dst", name="Destination", entity_type="Offering",
        identifier="IT00S002", to_business_pct=0, hierarchy_node_id=None,
        is_active=True,
    )
    db.add_all([src, dst])
    db.flush()
    db.add(Distribution(
        year=2026, version="forecast",
        source_entity_id="ce-src", destination_entity_id="ce-dst",
        percentage=50.0,
    ))
    # One draft + one active BTC profile so both role variants have data.
    db.add(BTCProfile(entity_id="ce-src", year=2026, mode="manual", status="draft"))
    db.add(BTCProfile(entity_id="ce-dst", year=2026, mode="manual", status="active"))

    # --- Saved reports + scheduled changes ---------------------------------
    db.add(SavedReport(
        id=1, name="My Report", description=None, created_by="persona-controller",
        definition="{}", is_published=True, is_active=True,
        modified_at=datetime(2026, 4, 10, 12, 0, 0),
    ))
    db.add(ScheduledChange(
        id=1, entity_type="planning_parameter", entity_id="param-1",
        description="bump threshold", pending_values_json="{}",
        activation_date=date(2026, 6, 1), review_status="pending_review",
        created_by_person_id="p-dev-1",
    ))

    db.commit()
    return {
        "alpha": proj_alpha, "beta": proj_beta,
        "gamma": proj_gamma, "delta": proj_delta,
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _modules_by_id(payload: dict) -> dict:
    return {m["id"]: m for m in payload["items"]}


def _visible_modules(payload: dict) -> list[dict]:
    return [m for m in payload["items"] if m["visible"]]


# v5.1 W6 [C-01] — card-availability table from spec lines 175–234.
# Controller: 9 (all). PL: 8 (no admin). CC Owner: 7 (no backlog, no admin).
# Executive: 6 (no workbench, no capacity, no admin).
EXPECTED_VISIBLE = {
    "controller": {
        "portfolio", "workbench", "charging", "capacity",
        "simulator", "reporting", "admin", "documentation", "backlog",
    },
    "project_lead": {
        "portfolio", "workbench", "charging", "capacity", "simulator",
        "reporting", "documentation", "backlog",
    },
    "cost_center_owner": {
        "portfolio", "workbench", "charging", "capacity", "simulator",
        "reporting", "documentation",
    },
    "executive": {
        "portfolio", "charging", "simulator",
        "reporting", "documentation", "backlog",
    },
}


# ---------------------------------------------------------------------------
# Cross-role canary — Portfolio line is identical across all roles.
# ---------------------------------------------------------------------------

@patch("services.module_card_kpis.DEMO_DATE", "2026-04")
class TestPortfolioCanary:
    """The Portfolio Overview row in the spec table reads ``All`` — the same
    string must be returned for every role."""

    def test_portfolio_subtitle_identical_across_roles(self, test_client, seed_launchpad_data):
        results: dict[str, str] = {}
        for header in (HEADERS_CTRL, HEADERS_PL, HEADERS_CCO, HEADERS_EXEC):
            resp = test_client.get("/api/modules", headers=header)
            assert resp.status_code == 200
            mods = _modules_by_id(resp.json())
            kpis = mods["portfolio"]["subtitle_kpis"]
            assert len(kpis) == 1
            results[header["X-Current-User"]] = kpis[0]
        # All four entries equal each other.
        assert len(set(results.values())) == 1, f"Portfolio subtitle drift across roles: {results}"

    def test_portfolio_subtitle_format(self, test_client, seed_launchpad_data):
        resp = test_client.get("/api/modules", headers=HEADERS_CTRL)
        mods = _modules_by_id(resp.json())
        kpis = mods["portfolio"]["subtitle_kpis"]
        # e.g. "Forecast: €0,0m · Run/Change: 50%/50% · Plan drift: +0.0%"
        pattern = (
            r"^Forecast: €[\d.]+,\dm "
            r"· Run/Change: \d+%/\d+% "
            r"· Plan drift: [+-]\d+\.\d%$"
        )
        assert re.match(pattern, kpis[0]), f"Portfolio format mismatch: {kpis[0]}"


# ---------------------------------------------------------------------------
# Controller
# ---------------------------------------------------------------------------

@patch("services.module_card_kpis.DEMO_DATE", "2026-04")
class TestControllerSubtitles:
    def test_visible_modules_match_spec(self, test_client, seed_launchpad_data):
        resp = test_client.get("/api/modules", headers=HEADERS_CTRL)
        visible_ids = {m["id"] for m in _visible_modules(resp.json())}
        assert visible_ids == EXPECTED_VISIBLE["controller"]

    def test_every_visible_module_has_subtitle(self, test_client, seed_launchpad_data):
        resp = test_client.get("/api/modules", headers=HEADERS_CTRL)
        for mod in _visible_modules(resp.json()):
            kpis = mod["subtitle_kpis"]
            assert 1 <= len(kpis) <= 2, f"{mod['id']} returned {len(kpis)} subtitles"
            for s in kpis:
                assert s.strip(), f"{mod['id']} returned empty subtitle"

    def test_backlog_format(self, test_client, seed_launchpad_data):
        resp = test_client.get("/api/modules", headers=HEADERS_CTRL)
        kpis = _modules_by_id(resp.json())["backlog"]["subtitle_kpis"]
        assert re.match(
            r"^\d+ projects in pipeline · \d+ within cutoff$",
            kpis[0],
        )

    def test_workbench_overdue_format(self, test_client, seed_launchpad_data):
        resp = test_client.get("/api/modules", headers=HEADERS_CTRL)
        kpis = _modules_by_id(resp.json())["workbench"]["subtitle_kpis"]
        assert re.match(
            r"^Forecast cycle: Q\d \d{4} Cycle · \d+ projects overdue$",
            kpis[0],
        )

    def test_capacity_my_team_format(self, test_client, seed_launchpad_data):
        resp = test_client.get("/api/modules", headers=HEADERS_CTRL)
        kpis = _modules_by_id(resp.json())["capacity"]["subtitle_kpis"]
        assert re.match(
            r"^My team: \d+% · Org: \d+% · \d+ open requests$",
            kpis[0],
        )

    def test_simulator_format(self, test_client, seed_launchpad_data):
        resp = test_client.get("/api/modules", headers=HEADERS_CTRL)
        kpis = _modules_by_id(resp.json())["simulator"]["subtitle_kpis"]
        # 2 active (1 private + 1 published) and 1 published
        assert re.match(
            r"^\d+ active scenarios · \d+ recently published$",
            kpis[0],
        )
        assert "2 active scenarios" in kpis[0]
        assert "1 recently published" in kpis[0]

    def test_charging_review_variant(self, test_client, seed_launchpad_data):
        resp = test_client.get("/api/modules", headers=HEADERS_CTRL)
        kpis = _modules_by_id(resp.json())["charging"]["subtitle_kpis"]
        assert re.match(
            r"^\d+ distribution edges · \d+ BTC profiles needing review$",
            kpis[0],
        )

    def test_reporting_format(self, test_client, seed_launchpad_data):
        resp = test_client.get("/api/modules", headers=HEADERS_CTRL)
        kpis = _modules_by_id(resp.json())["reporting"]["subtitle_kpis"]
        assert re.match(
            r"^\d+ saved reports · Last generated: (\d{4}-\d{2}-\d{2}|never)$",
            kpis[0],
        )

    def test_admin_format(self, test_client, seed_launchpad_data):
        resp = test_client.get("/api/modules", headers=HEADERS_CTRL)
        mods = _modules_by_id(resp.json())
        assert mods["admin"]["visible"] is True
        kpis = mods["admin"]["subtitle_kpis"]
        assert re.match(
            r"^\d+ pending scheduled changes · Data quality: \w+$",
            kpis[0],
        )

    def test_documentation_static(self, test_client, seed_launchpad_data):
        resp = test_client.get("/api/modules", headers=HEADERS_CTRL)
        kpis = _modules_by_id(resp.json())["documentation"]["subtitle_kpis"]
        assert kpis == ["Guides, API Reference & FAQ"]


# ---------------------------------------------------------------------------
# Project Lead
# ---------------------------------------------------------------------------

@patch("services.module_card_kpis.DEMO_DATE", "2026-04")
class TestPLSubtitles:
    def test_visible_modules_match_spec(self, test_client, seed_launchpad_data):
        resp = test_client.get("/api/modules", headers=HEADERS_PL)
        visible_ids = {m["id"] for m in _visible_modules(resp.json())}
        assert visible_ids == EXPECTED_VISIBLE["project_lead"]

    def test_every_visible_module_has_subtitle(self, test_client, seed_launchpad_data):
        resp = test_client.get("/api/modules", headers=HEADERS_PL)
        for mod in _visible_modules(resp.json()):
            kpis = mod["subtitle_kpis"]
            assert 1 <= len(kpis) <= 2

    def test_backlog_pl_personalised(self, test_client, seed_launchpad_data):
        resp = test_client.get("/api/modules", headers=HEADERS_PL)
        kpis = _modules_by_id(resp.json())["backlog"]["subtitle_kpis"]
        assert re.match(
            r"^Your \d+ projects in pipeline · \d+ within cutoff$",
            kpis[0],
        )

    def test_workbench_pl_personalised(self, test_client, seed_launchpad_data):
        resp = test_client.get("/api/modules", headers=HEADERS_PL)
        kpis = _modules_by_id(resp.json())["workbench"]["subtitle_kpis"]
        assert re.match(
            r"^Forecast cycle: Q\d \d{4} Cycle · Your \d+ projects$",
            kpis[0],
        )
        # PL persona owns proj-alpha + proj-beta
        assert "Your 2 projects" in kpis[0]

    def test_charging_pl_others_variant(self, test_client, seed_launchpad_data):
        resp = test_client.get("/api/modules", headers=HEADERS_PL)
        kpis = _modules_by_id(resp.json())["charging"]["subtitle_kpis"]
        # PL gets the read-only "active BTC profiles" variant
        assert "active BTC profiles" in kpis[0]
        assert "needing review" not in kpis[0]


# ---------------------------------------------------------------------------
# CC Owner
# ---------------------------------------------------------------------------

@patch("services.module_card_kpis.DEMO_DATE", "2026-04")
class TestCCOwnerSubtitles:
    def test_visible_modules_match_spec(self, test_client, seed_launchpad_data):
        resp = test_client.get("/api/modules", headers=HEADERS_CCO)
        visible_ids = {m["id"] for m in _visible_modules(resp.json())}
        assert visible_ids == EXPECTED_VISIBLE["cost_center_owner"]

    def test_every_visible_module_has_subtitle(self, test_client, seed_launchpad_data):
        resp = test_client.get("/api/modules", headers=HEADERS_CCO)
        for mod in _visible_modules(resp.json()):
            kpis = mod["subtitle_kpis"]
            assert 1 <= len(kpis) <= 2

    def test_workbench_cc_scoped(self, test_client, seed_launchpad_data):
        resp = test_client.get("/api/modules", headers=HEADERS_CCO)
        kpis = _modules_by_id(resp.json())["workbench"]["subtitle_kpis"]
        assert re.match(
            r"^Forecast cycle: Q\d \d{4} Cycle · \d+ projects in your CC$",
            kpis[0],
        )

    def test_capacity_cc_format(self, test_client, seed_launchpad_data):
        resp = test_client.get("/api/modules", headers=HEADERS_CCO)
        kpis = _modules_by_id(resp.json())["capacity"]["subtitle_kpis"]
        assert re.match(
            r"^My team: \d+% · Org: \d+% · \d+ open requests$",
            kpis[0],
        )

    def test_admin_hidden(self, test_client, seed_launchpad_data):
        resp = test_client.get("/api/modules", headers=HEADERS_CCO)
        mods = _modules_by_id(resp.json())
        assert mods["admin"]["visible"] is False
        # Hidden modules must not carry subtitle data.
        assert mods["admin"]["subtitle_kpis"] == []


# ---------------------------------------------------------------------------
# Executive
# ---------------------------------------------------------------------------

@patch("services.module_card_kpis.DEMO_DATE", "2026-04")
class TestExecutiveSubtitles:
    def test_visible_modules_match_spec(self, test_client, seed_launchpad_data):
        resp = test_client.get("/api/modules", headers=HEADERS_EXEC)
        visible_ids = {m["id"] for m in _visible_modules(resp.json())}
        assert visible_ids == EXPECTED_VISIBLE["executive"]

    def test_every_visible_module_has_subtitle(self, test_client, seed_launchpad_data):
        resp = test_client.get("/api/modules", headers=HEADERS_EXEC)
        for mod in _visible_modules(resp.json()):
            kpis = mod["subtitle_kpis"]
            assert 1 <= len(kpis) <= 2

    def test_backlog_exec_format(self, test_client, seed_launchpad_data):
        resp = test_client.get("/api/modules", headers=HEADERS_EXEC)
        kpis = _modules_by_id(resp.json())["backlog"]["subtitle_kpis"]
        # Exec uses the same impersonal phrasing as Controller.
        assert re.match(
            r"^\d+ projects in pipeline · \d+ within cutoff$",
            kpis[0],
        )

    def test_workbench_hidden(self, test_client, seed_launchpad_data):
        resp = test_client.get("/api/modules", headers=HEADERS_EXEC)
        mods = _modules_by_id(resp.json())
        assert mods["workbench"]["visible"] is False
        assert mods["workbench"]["subtitle_kpis"] == []

    def test_simulator_format(self, test_client, seed_launchpad_data):
        resp = test_client.get("/api/modules", headers=HEADERS_EXEC)
        kpis = _modules_by_id(resp.json())["simulator"]["subtitle_kpis"]
        assert re.match(
            r"^\d+ active scenarios · \d+ recently published$",
            kpis[0],
        )


# ---------------------------------------------------------------------------
# Auth + edge cases
# ---------------------------------------------------------------------------

@patch("services.module_card_kpis.DEMO_DATE", "2026-04")
class TestAuthAndEdges:
    def test_unknown_persona_rejected(self, test_client, seed_launchpad_data):
        resp = test_client.get(
            "/api/modules",
            headers={"X-Current-User": "persona-unknown"},
        )
        assert resp.status_code == 401

    def test_empty_db_still_returns_full_module_inventory(self, test_client, seed_personas):
        # Without seed_launchpad_data the metric math sees zeros — the response
        # should still carry one subtitle per visible module so the frontend
        # never has to render "None".
        resp = test_client.get("/api/modules", headers=HEADERS_CTRL)
        assert resp.status_code == 200
        for mod in _visible_modules(resp.json()):
            assert len(mod["subtitle_kpis"]) >= 1

    def test_contextual_metric_mirrors_first_subtitle(self, test_client, seed_launchpad_data):
        resp = test_client.get("/api/modules", headers=HEADERS_CTRL)
        for mod in _visible_modules(resp.json()):
            kpis = mod["subtitle_kpis"]
            if kpis:
                assert mod["contextual_metric"] == kpis[0], (
                    f"{mod['id']} contextual_metric drift: "
                    f"{mod['contextual_metric']!r} vs {kpis[0]!r}"
                )
