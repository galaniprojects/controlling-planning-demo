"""What-If scenario definitions per Cluster B [B-AC-01..03] [B-SL-01..05].

T3 owns this file. Four scenarios drive the simulator demo:

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

4. ``scn-pl-predmaint-defer`` — Project-Lead-authored private scenario
   (Session 4) exercising the PL authoring + Apply-to-Forecast path.
   Authored by Priya Sharma (``p-sharma``, persona ``persona-pl``) and
   scoped to one of her own projects, ``proj-predmaint`` (Predictive
   Maintenance PoC). A Tier-1 ``delay_project`` macro defers the project 3
   months to relieve a resource clash, paired with a Layer-2
   ``end_month`` ScenarioPlanEdit (2027-03 → 2027-06) so the resolution
   engine reshapes the window. ``status``/``visibility`` are ``private``;
   ``cc_owner_scope_cc_id`` is NULL (a PL scenario is project-scoped, not
   CC-scoped). Visible to Priya via the owner branch in
   ``routers.scenarios._user_can_view_scenario`` (author_id == person_id);
   not laterally visible to other PLs (Simulator §9.2). States/capacity/
   promotions are left empty — the simulator recompute engine computes the
   ScenarioState snapshot when the scenario is opened (same as scenarios 1
   and 3).

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
# PL-authored scenario (Session 4) — drafted by Priya Sharma in early April.
_CREATED_PL        = "2026-04-08 16:20:00"

# ---------------------------------------------------------------------------
# Project-Scope Redesign (spec §4/§5/§6) — proj-dwh external descope overlay.
#
# The former reduce_budget(proj-dwh, 30%, external) blanket-scale macro is
# removed (spec §4) and re-expressed as explicit Layer-2 ScenarioForecastCellEdit
# overlay rows: a faithful "descope external 30%" hand-edit applying ×0.70 to
# EVERY future cell on BOTH external lines (per human decision — 30% across all
# external, not consulting-only).
#
# Anchor cells = the LIVE proj-dwh Forecast rows (the same source
# services/scenario_project_scope/resolution.read_anchor_grid reads):
#   ext-cloud (Snowflake Enterprise): €8.000/mo Jul-2026..Mar-2027, then the
#     provisional ramp €24.000 in 2027-04 and 2027-07 → €120.000 total.
#   ext-consulting (Informatica ETL): €5.000/mo Jul-2026..Mar-2027, then
#     €15.000 in 2027-04 and 2027-07 → €75.000 total.
# External €195.000 → €136.500 (−€58.500). line_key is the natural composite
# the recompute core builds, "external|{sub_category}|" with an empty role slot.
#
# value is the ABSOLUTE resolved cell amount (overlay = WYSIWYG hand edit, not a
# delta — spec §5.3), = round(anchor × 0.70, 2). months are absolute (spec §5.2).
_DWH_EXTERNAL_DESCOPE_PCT = 0.70
_DWH_REGULAR_MONTHS = (
    "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12",
    "2027-01", "2027-02", "2027-03",
)
# (line_key, month, anchor_amount_eur) for every future external cell.
_DWH_EXTERNAL_ANCHOR_CELLS: list[tuple] = (
    [("external|ext-cloud|", m, 8000.0) for m in _DWH_REGULAR_MONTHS]
    + [("external|ext-cloud|", "2027-04", 24000.0),
       ("external|ext-cloud|", "2027-07", 24000.0)]
    + [("external|ext-consulting|", m, 5000.0) for m in _DWH_REGULAR_MONTHS]
    + [("external|ext-consulting|", "2027-04", 15000.0),
       ("external|ext-consulting|", "2027-07", 15000.0)]
)
_DWH_EXTERNAL_CELL_EDITS: list[dict] = [
    {
        "project_id": "proj-dwh",
        "line_key": line_key,
        "month": month,
        "field": "amount_eur",
        "value": round(anchor * _DWH_EXTERNAL_DESCOPE_PCT, 2),
    }
    for (line_key, month, anchor) in _DWH_EXTERNAL_ANCHOR_CELLS
]


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
            # Lever 12 BTC line shift on off-mdh per [B-ES-01] / [F-S2-*].
            # action_type MUST be 'btc_profile_line_change' so
            # services.scenario_lever12._collect_btc_overlay() picks this up
            # and feeds compute_cost_allocation_impact(). parameters_json
            # carries the COMPLETE post-rebalance line set (lever12 schema is
            # full state, not deltas) — sum-to-100 is enforced.
            #
            # Demo storyline: shift 10pp off cl-de-muc onto cl-pl-poz (+5pp)
            # and cl-cz-prg (+5pp, new line). The other 15 lines mirror the
            # live off-mdh 2026 profile (s09_btc Profile 7) so only the
            # touched locations show non-zero deltas in the Cost Allocation
            # impact tile.
            {
                "action_order": 1,
                "scope": "project",
                "action_type": "btc_profile_line_change",
                "project_id": "proj-mdh-rollout",  # FK target — flagship project
                "lever_category": "cost_allocation",
                "tier": 1,
                "group_label": "Lever 12 / Stage 2 BTC",
                "parameters_json": (
                    '{"entity_id": "off-mdh", "year": 2026, "lines": ['
                    '{"charging_location_id": "cl-de-ber", "percentage": 1.13}, '
                    '{"charging_location_id": "cl-de-fra", "percentage": 4.93}, '
                    '{"charging_location_id": "cl-de-ham", "percentage": 1.59}, '
                    '{"charging_location_id": "cl-de-muc", "percentage": 6.19}, '
                    '{"charging_location_id": "cl-de-stg", "percentage": 2.21}, '
                    '{"charging_location_id": "cl-de-wol", "percentage": 2.52}, '
                    '{"charging_location_id": "cl-es-mad", "percentage": 6.09}, '
                    '{"charging_location_id": "cl-fr-lyo", "percentage": 7.52}, '
                    '{"charging_location_id": "cl-fr-par", "percentage": 5.62}, '
                    '{"charging_location_id": "cl-hu-bud", "percentage": 3.48}, '
                    '{"charging_location_id": "cl-in-pun", "percentage": 11.28}, '
                    '{"charging_location_id": "cl-it-mil", "percentage": 9.38}, '
                    '{"charging_location_id": "cl-nl-ams", "percentage": 3.79}, '
                    '{"charging_location_id": "cl-pl-poz", "percentage": 11.11}, '
                    '{"charging_location_id": "cl-uk-lon", "percentage": 7.85}, '
                    '{"charging_location_id": "cl-uk-man", "percentage": 1.15}, '
                    '{"charging_location_id": "cl-us-det", "percentage": 9.16}, '
                    '{"charging_location_id": "cl-cz-prg", "percentage": 5.0}'
                    ']}'
                ),
                "impact_delta_json": (
                    '{"to_business_pct_delta": 0, '
                    '"location_amount_delta_eur": ['
                    '{"charging_location_id": "cl-de-muc", "delta": -283282}, '
                    '{"charging_location_id": "cl-pl-poz", "delta":  141641}, '
                    '{"charging_location_id": "cl-cz-prg", "delta":  141641}'
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
        # action_count counts conceptual levers (delay + accelerate + the DWH
        # overlay descope = 3), consistent with projects_affected=3 which counts
        # the overlay-only DWH project. Only 2 are ScenarioAction rows — the
        # descope is Layer-2 overlay, not an action.
        "headline_impact": (
            '{"total_budget_delta": -58500, "action_count": 3, '
            '"projects_affected": 3}'
        ),
        "created_at": _CREATED_BUDGET,
        "modified_at": "2026-04-15 11:00:00",
        "last_recalculated_at": "2026-04-15 11:00:00",
        # Project-Scope Redesign (spec §4/§5): delay + accelerate STAY as
        # Layer-1 macro ScenarioActions (action_type ∈ PROJECT_MACRO_ACTION_TYPES,
        # re-derivable curve transforms). The former reduce_budget action on
        # proj-dwh is GONE — the blanket-scale macro was removed in spec §4, so
        # the 30% external descope is now explicit Layer-2 cell edits (see
        # "cell_edits" below). Action order is contiguous (1 = delay, 2 =
        # accelerate); the descope carries no action_order (it is overlay).
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
                "impact_delta_json": '{"budget_delta": 0, "schedule_shift_months": 6}',
            },
            {
                "action_order": 2,
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
        # Pre-calculated state snapshots for the 3 affected projects, REGENERATED
        # from the project-scope recompute engine at integration (spec §6):
        #  - delay (connveh +6mo) and accelerate (railsafety −2mo) are
        #    total-preserving curve shifts → full-horizon budget_delta = 0; only
        #    start/end move. is_affected stays True (the curve moved).
        #  - proj-dwh: uniform 30% external descope (Layer-2 ×0.70 cell edits)
        #    cuts external €195.000 → €136.500 → budget_delta = −€58.500.
        # original_budget = the live forecast rollup the engine computes (not the
        # old notional). RAG = drift-vs-baseline per the engine.
        "states": [
            {
                "project_id": "proj-connveh",
                "original_budget": 1146690.00,
                "adjusted_budget": 1146690.00,
                "budget_delta": 0.00,
                "original_rag": None,
                "adjusted_rag": "green",
                "original_start": "2026-10",
                "adjusted_start": "2027-04",
                "original_end": "2028-12",
                "adjusted_end": "2029-06",
                "is_affected": True,
            },
            {
                "project_id": "proj-dwh",
                "original_budget": 398400.00,
                "adjusted_budget": 339900.00,
                "budget_delta": -58500.00,
                "original_rag": "green",
                "adjusted_rag": "red",
                "original_start": "2026-07",
                "adjusted_start": "2026-07",
                "original_end": "2027-09",
                "adjusted_end": "2027-09",
                "is_affected": True,
            },
            {
                "project_id": "proj-railsafety",
                "original_budget": 518540.00,
                "adjusted_budget": 518540.00,
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
        # audit pattern per [B-PR-03..04]. The accelerate macro (now action 2)
        # was promoted to the live forecast cycle; the delay macro (action 1)
        # and the proj-dwh external descope (now a Layer-2 overlay diff, not an
        # action — spec §4/§6, routed directly) remain in scenario-only state.
        # Per spec §6 each overlay entry is individually routable/promotable, so
        # the descope appears here as one skipped change_request keyed to the
        # overlay rather than to a synthetic action.
        "promotions": [
            {
                "promoted_at": _PROMOTED_BUDGET,
                "promoted_by_id": "p-meier",
                "promoted_count": 1,
                "skipped_count": 2,
                "notes": "Partial promote — accelerate Rail Safety only.",
                "routing_summary_json": (
                    '[{"action_id": "scn-budget-pressure-15:2", '
                    '"routing_type": "direct_forecast_update", '
                    '"status": "promoted", '
                    '"message": "Forecast cells updated for proj-railsafety", '
                    '"target_id": "proj-railsafety"}, '
                    '{"action_id": "scn-budget-pressure-15:1", '
                    '"routing_type": "change_request", '
                    '"status": "skipped", '
                    '"message": "Skipped by promoter — pending CFO sign-off", '
                    '"target_id": "proj-connveh"}, '
                    '{"action_id": "scn-budget-pressure-15:overlay:proj-dwh-external", '
                    '"routing_type": "change_request", '
                    '"status": "skipped", '
                    '"message": "Skipped by promoter — external descope pending CFO sign-off", '
                    '"target_id": "proj-dwh"}]'
                ),
            },
        ],
        # Project-Scope Redesign (spec §4/§5/§6): the former
        # reduce_budget(proj-dwh, 30%, external_consulting) blanket-scale macro
        # is removed (spec §4) and re-expressed as explicit Layer-2
        # ScenarioForecastCellEdit overlay rows on proj-dwh's external lines —
        # ×0.70 on every future external cell (both ext-cloud and
        # ext-consulting), the faithful "descope external 30%" hand-edit.
        # External €195.000 → €136.500 (−€58.500). See _DWH_EXTERNAL_CELL_EDITS
        # above for the anchor amounts + derivation. NOTE: the pre-computed
        # ScenarioState / capacity / promotion / headline_impact rows below are
        # left as legacy placeholders — they are regenerated by the new recompute
        # engine at integration (delay/accelerate are now total-preserving curve
        # shifts), so their numbers are intentionally NOT reconciled here.
        "cell_edits": _DWH_EXTERNAL_CELL_EDITS,
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
        # Project-Scope Redesign (spec §5/§8): the senior->mid dev swap is the
        # lone Tier-3 grid control, re-expressed as a Layer-2 ScenarioMixChange
        # overlay row. Mirrors the change_allocation action's parameters_json
        # exactly (CC, swap roles, hours/mo, effective_from) so the Tier-3 mix
        # control (Session 3) reuses the shape. The ScenarioAction above is kept
        # for continuity of the tier3_content_flag + impact_delta narrative; the
        # mix row is the canonical overlay representation the recompute core /
        # routing consume (routes as a people_action_item at promote).
        "mix_changes": [
            {
                "project_id": "proj-mdh-rollout",
                "cost_center_id": "cc-muc-apd",
                "swap_from_role_id": "role-sr-dev",
                "swap_to_role_id": "role-dev",
                "hours_per_month_swap": 40,
                "effective_from": "2026-05",
            },
        ],
    },
    {
        "id": 4,
        "stable_key": "scn-pl-predmaint-defer",
        "name": "Predictive Maintenance — Defer 3 Months",
        "description": (
            "Project Lead draft: defer Predictive Maintenance PoC 3 months "
            "to relieve a sensor-team resource clash with the Sensor Data "
            "Pipeline ramp. Total-preserving timeline shift — the curve moves "
            "right, the budget is unchanged. Private to the author until the "
            "re-plan is agreed with the CC owner."
        ),
        # Authored by the PL persona (persona-pl → p-sharma). proj-predmaint is
        # one of Priya's owned projects (entities.PL_OWNED_PROJECT_IDS), so the
        # PL filter and the owner-visibility branch both resolve cleanly.
        "author_id": "p-sharma",
        "status": "private",
        "visibility": "private",
        "tier3_content_flag": False,  # Tier-1 schedule lever only
        "archived": False,
        "tags": '["pl-authored", "schedule", "defer"]',
        "cc_owner_scope_cc_id": None,  # project-scoped, not CC-scoped
        "headline_impact": (
            '{"total_budget_delta": 0, "schedule_shift_months": 3, '
            '"action_count": 1, "projects_affected": 1}'
        ),
        "created_at": _CREATED_PL,
        "modified_at": _CREATED_PL,
        "last_recalculated_at": _CREATED_PL,
        "actions": [
            {
                "action_order": 1,
                "scope": "project",
                "action_type": "delay_project",
                "project_id": "proj-predmaint",
                "lever_category": "forecast_grid",
                "tier": 1,
                "group_label": "Resource-clash re-plan",
                "parameters_json": (
                    '{"delay_months": 3, '
                    '"reason": "Relieve sensor-team clash with Sensor Data Pipeline ramp"}'
                ),
                "impact_delta_json": '{"budget_delta": 0, "schedule_shift_months": 3}',
            },
        ],
        # States/capacity/promotions left empty: the simulator recompute engine
        # produces the ScenarioState snapshot on open (matches scenarios 1 & 3).
        "states": [],
        "capacity_impacts": [],
        "promotions": [],
        # Layer-2 end_month plan edit pairing the 3-month deferral: the PoC's end
        # boundary moves 2027-03 → 2027-06 so the resolved grid window reflects
        # the shift (resolution._apply_plan_dates consumes start_month/end_month).
        "plan_edits": [
            {
                "project_id": "proj-predmaint",
                "target": "end_month",
                "value": "2027-06",
            },
        ],
    },
]


# Frozen overlay vocab (mirrors models.scenarios — kept local so the config
# self-validates without importing the ORM at seed-generation time).
_CELL_FIELDS = ("hours", "amount_eur")
_LINE_OPS = ("add", "remove")
_LINE_KINDS = ("internal_role", "external_cost")
_PLAN_TARGETS = ("start_month", "end_month", "stage", "doi", "milestone")
_MACRO_ACTION_TYPES = ("delay_project", "accelerate_project", "pause_project", "remove_project")


# Sanity checks — fail loudly at import time so seed runs surface errors fast.
def _validate() -> None:
    ids = [s["id"] for s in SCENARIOS]
    assert len(ids) == len(set(ids)), "scenario ids must be unique"
    keys = [s["stable_key"] for s in SCENARIOS]
    assert len(keys) == len(set(keys)), "scenario stable_keys must be unique"
    for s in SCENARIOS:
        assert s["status"] in ("private", "published"), s["stable_key"]
        assert s["visibility"] in ("private", "tier3_only", "all_users"), s["stable_key"]
        # action_order must be contiguous 1..N (project-scope macros stay as
        # ordered transforms; no gaps after the reduce_budget removal, spec §4).
        orders = sorted(a["action_order"] for a in s["actions"])
        assert orders == list(range(1, len(orders) + 1)), \
            f"{s['stable_key']}: action_order must be contiguous 1..N, got {orders}"
        for a in s["actions"]:
            assert a["tier"] in (1, 2, 3), s["stable_key"]
        # Layer-2 cell overlay (spec §5).
        for ce in s.get("cell_edits", []):
            assert ce["field"] in _CELL_FIELDS, s["stable_key"]
            assert len(ce["month"]) == 7 and ce["month"][4] == "-", s["stable_key"]
            assert "|" in ce["line_key"], s["stable_key"]
        for le in s.get("line_edits", []):
            assert le["op"] in _LINE_OPS, s["stable_key"]
            assert le["line_kind"] in _LINE_KINDS, s["stable_key"]
        for mc in s.get("mix_changes", []):
            assert mc["project_id"], s["stable_key"]
        for pe in s.get("plan_edits", []):
            assert pe["target"] in _PLAN_TARGETS, s["stable_key"]

    # scn-budget-pressure-15: the proj-dwh external descope cell edits are a
    # ×0.70 cut on EVERY future external cell (both lines), totalling −€58.500
    # vs the live anchor (external €195.000 → €136.500). The pre-computed
    # ScenarioState/headline numbers are NOT reconciled here — the recompute
    # engine regenerates them at integration — so we do NOT cross-check them.
    budget = next(s for s in SCENARIOS if s["stable_key"] == "scn-budget-pressure-15")
    anchor_by_cell = {(lk, mo): amt for (lk, mo, amt) in _DWH_EXTERNAL_ANCHOR_CELLS}
    edits = budget.get("cell_edits", [])
    # One edit per future external cell on both lines (no cells missed/duplicated).
    assert len(edits) == len(_DWH_EXTERNAL_ANCHOR_CELLS), \
        f"expected {len(_DWH_EXTERNAL_ANCHOR_CELLS)} dwh external edits, got {len(edits)}"
    total_delta = 0.0
    for ce in edits:
        anchor_val = anchor_by_cell[(ce["line_key"], ce["month"])]
        assert abs(ce["value"] - round(anchor_val * 0.70, 2)) < 0.005, \
            f"dwh cell {ce['line_key']} {ce['month']} must be anchor×0.70"
        total_delta += (ce["value"] - anchor_val)
    assert abs(total_delta - (-58500.0)) < 0.01, \
        f"proj-dwh external descope must total -58500.00, got {total_delta:.2f}"
    # proj-dwh ScenarioState is reconciled to the descope: delta −58.500,
    # adjusted = original − 58.500 (connveh/railsafety stay placeholders).
    dwh_state = next(st for st in budget["states"] if st["project_id"] == "proj-dwh")
    assert abs(dwh_state["budget_delta"] - (-58500.0)) < 0.01, \
        f"proj-dwh ScenarioState budget_delta must be -58500.00, got {dwh_state['budget_delta']}"
    assert abs((dwh_state["original_budget"] + dwh_state["budget_delta"])
               - dwh_state["adjusted_budget"]) < 0.01, \
        "proj-dwh ScenarioState: original + delta must equal adjusted"


_validate()
