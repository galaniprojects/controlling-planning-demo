"""What-If scenario definitions per Cluster B [B-AC-01..03] [B-SL-01..05].

T3 owns this file. Three scenarios drive the simulator demo:

1. ``scn-mdh-rebalance`` — controller-private Tier-1 lever-12 demo on the
   Master Data Hub flagship offering. Shifts the BTC profile percentages on
   ``off-mdh`` to rebalance from German cost centres into Polish + Czech
   locations. Demonstrates the [F-AC-01] controller-edit gate and the
   sandbox-storage pattern for lever 12 (per CLAUDE.md "Lever 12 sandbox
   storage pattern (B1)"). Anchor forecast version is left NULL at seed
   time — ``loader._seed_forecast_versions()`` runs post-load and the
   simulator endpoint snaps the anchor to the latest cycle when the
   scenario is opened.

2. ``scn-budget-pressure-15`` — published cross-portfolio scenario authored
   by the controller. Three actions target three different projects:
   delay ``proj-connveh`` 6 months, descope ``proj-dwh`` 30%, accelerate
   ``proj-railsafety`` from 2026-09 to 2026-07. Visibility is
   ``all_users`` so every persona sees it on the simulator landing.
   Includes pre-computed ScenarioState snapshots per [B-SL-01..05] and
   a small ScenarioCapacityImpact strip to demonstrate the capacity
   roll-up pattern. One ScenarioPromotion row demonstrates the partial
   promote audit shape per [B-PR-03..04].

3. ``scn-cco-mdh-staffing`` — CC-Owner-scoped private scenario per
   [F-AC-01] / [E-06b]: scoped to ``cc-muc-apd`` so only resource-mix
   levers within that CC are editable by Thomas Brenner. One people-tier
   action targeting the Master Data Hub project (``proj-mdh-rollout``).

All ScenarioAction rows carry the v5 ``lever_category`` + ``tier`` columns.
The ``parameters_json`` and ``impact_delta_json`` columns are JSON strings
serialised once here (so seed regen is byte-identical).

Per the v5 ``Scenario`` model: ``status`` is the legacy v4 column
('private'/'published'); ``visibility`` is the v5 refinement
('private'/'tier3_only'/'all_users'). Tier-1 actions never set
``tier3_content_flag``; only Tier-3 levers (people, rates, restructuring,
capacity params) flip that flag. ``scn-cco-mdh-staffing`` carries Tier 3
actions (people sourcing-mix), so it has ``tier3_content_flag`` True; its
visibility stays ``private`` because it's CC-Owner-scoped.
"""
from __future__ import annotations


# Created/modified timestamps anchor in early April 2026 — scenarios were
# drafted by the controller / CC owner in the run-up to the demo.
_CREATED_REBALANCE = "2026-03-25 10:00:00"
_CREATED_BUDGET    = "2026-03-12 09:30:00"
_CREATED_CCO       = "2026-04-02 14:00:00"
_PROMOTED_BUDGET   = "2026-04-15 10:00:00"

# Scenario id is an autoincrement integer (per Scenario.__tablename__);
# we assign deterministic ids 1..N here so downstream JSON stays stable.
SCENARIOS: list[dict] = [
    {
        "id": 1,
        "stable_key": "scn-mdh-rebalance",
        "name": "MDH BTC Rebalance — DE/PL/CZ",
        "description": (
            "Lever 12 demo. Rebalance Master Data Hub BTC: shift 10pp from "
            "DE-Munich onto PL-Poznan (+5pp) and CZ-Prague (+5pp). Tier 1, "
            "controller-private until impact verified."
        ),
        "author_id": "p-meier",
        "status": "private",
        "visibility": "private",
        "tier3_content_flag": False,
        "archived": False,
        "tags": '["lever-12", "btc", "flagship"]',
        "cc_owner_scope_cc_id": None,
        "headline_impact": (
            '{"total_btc_pct_shift": 10, "affected_locations": 3, '
            '"action_count": 1}'
        ),
        "created_at": _CREATED_REBALANCE,
        "modified_at": _CREATED_REBALANCE,
        "last_recalculated_at": _CREATED_REBALANCE,
        "actions": [
            {
                "action_order": 1,
                "scope": "project",
                "action_type": "btc_profile_change",
                "project_id": "proj-mdh-rollout",  # FK target — flagship project
                "lever_category": "cost_allocation",
                "tier": 1,
                "group_label": "Lever 12 / Stage 2 BTC",
                "parameters_json": (
                    '{"entity_id": "off-mdh", "year": 2026, '
                    '"changes": ['
                    '{"charging_location_id": "cl-de-muc", "from_pct": 28.0, "to_pct": 18.0}, '
                    '{"charging_location_id": "cl-pl-poz", "from_pct": 3.0,  "to_pct": 8.0}, '
                    '{"charging_location_id": "cl-cz-prg", "from_pct": 2.0,  "to_pct": 7.0}'
                    ']}'
                ),
                "impact_delta_json": (
                    '{"to_business_pct_delta": 0, '
                    '"location_amount_delta_eur": ['
                    '{"charging_location_id": "cl-de-muc", "delta": -228000}, '
                    '{"charging_location_id": "cl-pl-poz", "delta":  114000}, '
                    '{"charging_location_id": "cl-cz-prg", "delta":  114000}'
                    ']}'
                ),
            },
        ],
        "states": [],
        "capacity_impacts": [],
    },
    {
        "id": 2,
        "stable_key": "scn-budget-pressure-15",
        "name": "Budget Pressure: 15% Reduction",
        "description": (
            "Cross-portfolio response to the 15% budget reduction directive. "
            "Defers Connected Vehicle Platform 6 months, descopes Data "
            "Warehouse Consolidation 30%, accelerates Rail Safety to recover "
            "regulatory window. Published portfolio-wide for executive review."
        ),
        "author_id": "p-meier",
        "status": "published",
        "visibility": "all_users",
        "tier3_content_flag": False,
        "archived": False,
        "tags": '["budget", "cross-portfolio", "executive-readout"]',
        "cc_owner_scope_cc_id": None,
        "headline_impact": (
            '{"total_budget_delta": -705000, "action_count": 3, '
            '"projects_affected": 3}'
        ),
        "created_at": _CREATED_BUDGET,
        "modified_at": "2026-04-15 11:00:00",
        "last_recalculated_at": "2026-04-15 11:00:00",
        "actions": [
            {
                "action_order": 1,
                "scope": "project",
                "action_type": "delay_project",
                "project_id": "proj-connveh",
                "lever_category": "forecast_grid",
                "tier": 1,
                "group_label": "Budget pressure response",
                "parameters_json": '{"delay_months": 6, "reason": "Budget pressure — 15% directive"}',
                "impact_delta_json": '{"budget_delta": -540000, "schedule_shift_months": 6}',
            },
            {
                "action_order": 2,
                "scope": "project",
                "action_type": "reduce_budget",
                "project_id": "proj-dwh",
                "lever_category": "forecast_grid",
                "tier": 1,
                "group_label": "Budget pressure response",
                "parameters_json": '{"cut_pct": 30, "scope": "external_consulting"}',
                "impact_delta_json": '{"budget_delta": -165000}',
            },
            {
                "action_order": 3,
                "scope": "project",
                "action_type": "accelerate_project",
                "project_id": "proj-railsafety",
                "lever_category": "milestone",
                "tier": 1,
                "group_label": "Regulatory recovery",
                "parameters_json": (
                    '{"advance_months": 2, "from_start": "2026-09", '
                    '"to_start": "2026-07", "reason": "Recover regulatory window"}'
                ),
                "impact_delta_json": '{"budget_delta": 0, "schedule_shift_months": -2}',
            },
        ],
        # Pre-calculated state snapshots for the 3 affected projects
        # (per [B-SL-01..05] published-scenario shape).
        "states": [
            {
                "project_id": "proj-connveh",
                "original_budget": 1800000.00,
                "adjusted_budget": 1260000.00,
                "budget_delta": -540000.00,
                "original_rag": None,
                "adjusted_rag": "amber",
                "original_start": "2026-10",
                "adjusted_start": "2027-04",
                "original_end": "2028-12",
                "adjusted_end": "2029-06",
                "is_affected": True,
            },
            {
                "project_id": "proj-dwh",
                "original_budget": 550000.00,
                "adjusted_budget": 385000.00,
                "budget_delta": -165000.00,
                "original_rag": "green",
                "adjusted_rag": "amber",
                "original_start": "2026-07",
                "adjusted_start": "2026-07",
                "original_end": "2027-09",
                "adjusted_end": "2027-09",
                "is_affected": True,
            },
            {
                "project_id": "proj-railsafety",
                "original_budget": 650000.00,
                "adjusted_budget": 650000.00,
                "budget_delta": 0.00,
                "original_rag": "green",
                "adjusted_rag": "green",
                "original_start": "2026-09",
                "adjusted_start": "2026-07",
                "original_end": "2028-06",
                "adjusted_end": "2028-04",
                "is_affected": True,
            },
        ],
        # One pre-computed capacity-impact strip — narrow but illustrative
        # (cc-muc-apd is the most visible CC for the demo personas).
        "capacity_impacts": [
            {
                "cost_center_id": "cc-muc-apd",
                "month": "2026-10",
                "original_utilization_pct": 88.0,
                "adjusted_utilization_pct": 74.0,
                "fte_delta": -1.10,
            },
            {
                "cost_center_id": "cc-muc-apd",
                "month": "2026-11",
                "original_utilization_pct": 91.0,
                "adjusted_utilization_pct": 76.0,
                "fte_delta": -1.20,
            },
            {
                "cost_center_id": "cc-muc-apd",
                "month": "2026-12",
                "original_utilization_pct": 92.0,
                "adjusted_utilization_pct": 78.0,
                "fte_delta": -1.10,
            },
        ],
        # Optional: one ScenarioPromotion row demonstrating the partial-promote
        # audit pattern per [B-PR-03..04]. Action 3 (accelerate) was promoted
        # to the live forecast cycle; actions 1+2 remain in scenario-only state.
        "promotions": [
            {
                "promoted_at": _PROMOTED_BUDGET,
                "promoted_by_id": "p-meier",
                "promoted_count": 1,
                "skipped_count": 2,
                "notes": "Partial promote — accelerate Rail Safety only.",
                "routing_summary_json": (
                    '[{"action_id": "scn-budget-pressure-15:3", '
                    '"routing_type": "direct_forecast_update", '
                    '"status": "promoted", '
                    '"message": "Forecast cells updated for proj-railsafety", '
                    '"target_id": "proj-railsafety"}, '
                    '{"action_id": "scn-budget-pressure-15:1", '
                    '"routing_type": "change_request", '
                    '"status": "skipped", '
                    '"message": "Skipped by promoter — pending CFO sign-off", '
                    '"target_id": "proj-connveh"}, '
                    '{"action_id": "scn-budget-pressure-15:2", '
                    '"routing_type": "change_request", '
                    '"status": "skipped", '
                    '"message": "Skipped by promoter — pending CFO sign-off", '
                    '"target_id": "proj-dwh"}]'
                ),
            },
        ],
    },
    {
        "id": 3,
        "stable_key": "scn-cco-mdh-staffing",
        "name": "MDH Staffing Mix — MUC/APD",
        "description": (
            "CC Owner sandbox: rebalance Master Data Hub Rollout staffing "
            "from senior developers onto a 60/40 senior/mid mix to free "
            "senior capacity for incoming intakes. Scoped to MUC/APD per "
            "[F-AC-01] CC-Owner authoring rules."
        ),
        "author_id": "p-brenner",
        "status": "private",
        "visibility": "private",
        "tier3_content_flag": True,  # people lever flips Tier-3 content flag
        "archived": False,
        "tags": '["staffing", "cco-sandbox", "mdh"]',
        "cc_owner_scope_cc_id": "cc-muc-apd",
        "headline_impact": (
            '{"total_capacity_shift_fte": 0.0, '
            '"senior_to_mid_swap_pct": 40, "action_count": 1}'
        ),
        "created_at": _CREATED_CCO,
        "modified_at": _CREATED_CCO,
        "last_recalculated_at": _CREATED_CCO,
        "actions": [
            {
                "action_order": 1,
                "scope": "project",
                "action_type": "change_allocation",
                "project_id": "proj-mdh-rollout",
                "lever_category": "people",  # lever 6 — sourcing mix
                "tier": 3,
                "group_label": "Sourcing mix rebalance",
                "parameters_json": (
                    '{"cost_center_id": "cc-muc-apd", '
                    '"swap_from_role": "role-sr-dev", '
                    '"swap_to_role": "role-dev", '
                    '"hours_per_month_swap": 40, '
                    '"effective_from": "2026-05"}'
                ),
                "impact_delta_json": (
                    '{"budget_delta_eur_per_month": -1280, '
                    '"fte_change_sr_dev": -0.25, '
                    '"fte_change_dev": 0.25}'
                ),
            },
        ],
        "states": [],
        "capacity_impacts": [],
        "promotions": [],
    },
]


# Sanity checks — fail loudly at import time so seed runs surface errors fast.
def _validate() -> None:
    ids = [s["id"] for s in SCENARIOS]
    assert len(ids) == len(set(ids)), "scenario ids must be unique"
    keys = [s["stable_key"] for s in SCENARIOS]
    assert len(keys) == len(set(keys)), "scenario stable_keys must be unique"
    for s in SCENARIOS:
        assert s["status"] in ("private", "published"), s["stable_key"]
        assert s["visibility"] in ("private", "tier3_only", "all_users"), s["stable_key"]
        for a in s["actions"]:
            assert a["tier"] in (1, 2, 3), s["stable_key"]


_validate()
