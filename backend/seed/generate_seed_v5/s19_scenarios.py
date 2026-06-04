"""Stage 19 — What-If scenarios + actions + states + capacity impacts + promotions.

Emits SQL for these v5 tables (all in Cluster B's lifecycle):
- ``scenarios`` — 3 scenarios driven by ``config/scenarios.py``.
- ``scenario_actions`` — ordered action list per scenario, carrying the
  v5 columns (``lever_category``, ``tier``). Layer-1 macros for project-scope
  scenarios (delay / accelerate / pause / remove ∈ PROJECT_MACRO_ACTION_TYPES)
  live here as ordered transforms (spec §4, §5).
- ``scenario_states`` — pre-computed snapshot per affected project for the
  published scenario per [B-SL-01..05].
- ``scenario_capacity_impacts`` — per-CC × month capacity rollup snapshot
  for the published scenario.
- ``scenario_promotions`` — partial-promote audit row per [B-PR-03..04].
- ``scenario_apply_to_forecast_events`` — left empty in seed (created at
  runtime by the PL Apply-to-forecast endpoint per [B-PR-05]).

Project-Scope Redesign (spec §5) — Layer-2 hand-edit overlay tables, emitted
from the optional per-scenario keys ``cell_edits`` / ``line_edits`` /
``mix_changes`` / ``plan_edits``:
- ``scenario_forecast_cell_edits`` — sparse per-(project, line, month, field)
  cell overlay. The 30%% external descope on ``proj-dwh`` (formerly the removed
  ``reduce_budget`` blanket-scale macro, spec §4) is re-expressed here as
  explicit ``amount_eur`` cell edits on the external lines.
- ``scenario_line_edits`` — structural add/remove of a forecast line.
- ``scenario_mix_changes`` — seniority/sourcing mix swap (the
  ``scn-cco-mdh-staffing`` senior→mid dev swap maps here, mirroring the
  legacy ``change_allocation`` action params).
- ``scenario_plan_edits`` — project-plan (date/stage/DoI/milestone) edits.

Determinism: all rows emitted in stable scenario-id × action-order ×
project-id order (no hashing, no time.time()). Anchor forecast version FKs
are NULL because forecast_versions are seeded post-load by
``loader._seed_forecast_versions()`` — the simulator endpoint snaps the
anchor to the latest cycle on first scenario open.
"""
from __future__ import annotations

from _utils import sql_str
from generate_seed_v5.config.scenarios import SCENARIOS


def _bool(v: bool) -> str:
    return "1" if v else "0"


def generate() -> str:
    parts: list[str] = []
    parts.append("-- =============================================================================")
    parts.append("-- s19 / What-If Scenarios + Actions + States + Capacity Impacts + Promotions")
    parts.append("-- Cluster B Session B1 — [B-AC-01..03] [B-SL-01..05] [B-PR-03..05] [B-ES-01]")
    parts.append("-- =============================================================================")

    # --- scenarios -----------------------------------------------------------
    rows: list[str] = []
    for s in SCENARIOS:
        rows.append(
            "(" + ", ".join([
                str(s["id"]),
                sql_str(s["name"]),
                sql_str(s["description"]),
                sql_str(s["author_id"]),
                sql_str(s["status"]),
                sql_str(s["headline_impact"]),
                sql_str(s["created_at"]),
                sql_str(s["modified_at"]),
                "NULL",  # anchor_forecast_version_id — set post-load
                "NULL",  # rebased_from_version_id
                sql_str(s["visibility"]),
                _bool(s["tier3_content_flag"]),
                _bool(s["archived"]),
                sql_str(None),  # archived_at
                sql_str(s["tags"]),
                sql_str(s.get("last_recalculated_at")),
                sql_str(s["cc_owner_scope_cc_id"]),
            ]) + ")"
        )
    parts.append(
        "\nINSERT INTO scenarios (id, name, description, author_id, status, "
        "headline_impact, created_at, modified_at, "
        "anchor_forecast_version_id, rebased_from_version_id, visibility, "
        "tier3_content_flag, archived, archived_at, tags, "
        "last_recalculated_at, cc_owner_scope_cc_id) VALUES\n"
        + ",\n".join(rows) + ";"
    )

    # --- scenario_actions ----------------------------------------------------
    action_rows: list[str] = []
    action_id = 0
    for s in sorted(SCENARIOS, key=lambda r: r["id"]):
        for a in sorted(s["actions"], key=lambda r: r["action_order"]):
            action_id += 1
            action_rows.append(
                "(" + ", ".join([
                    str(action_id),
                    str(s["id"]),
                    str(a["action_order"]),
                    sql_str(a["scope"]),
                    sql_str(a["action_type"]),
                    sql_str(a.get("project_id")),
                    sql_str(a.get("parameters_json")),
                    sql_str(a.get("impact_delta_json")),
                    sql_str(a.get("group_label")),
                    sql_str(s["created_at"]),  # action created_at = scenario created_at
                    "NULL",  # promoted_at — set per-promotion (see promotions block below)
                    "NULL",  # promoted_by_id
                    sql_str(a.get("lever_category")),
                    str(a.get("tier", 1)),
                ]) + ")"
            )
    if action_rows:
        parts.append(
            "\nINSERT INTO scenario_actions (id, scenario_id, action_order, scope, "
            "action_type, project_id, parameters_json, impact_delta_json, "
            "group_label, created_at, promoted_at, promoted_by_id, "
            "lever_category, tier) VALUES\n"
            + ",\n".join(action_rows) + ";"
        )

    # --- scenario_states -----------------------------------------------------
    state_rows: list[str] = []
    for s in sorted(SCENARIOS, key=lambda r: r["id"]):
        for st in sorted(s.get("states", []), key=lambda r: r["project_id"]):
            state_rows.append(
                "(" + ", ".join([
                    str(s["id"]),
                    sql_str(st["project_id"]),
                    f"{st['original_budget']:.2f}",
                    f"{st['adjusted_budget']:.2f}",
                    f"{st['budget_delta']:.2f}",
                    sql_str(st.get("original_rag")),
                    sql_str(st.get("adjusted_rag")),
                    sql_str(st.get("original_start")),
                    sql_str(st.get("adjusted_start")),
                    sql_str(st.get("original_end")),
                    sql_str(st.get("adjusted_end")),
                    _bool(st.get("is_affected", False)),
                ]) + ")"
            )
    if state_rows:
        parts.append(
            "\nINSERT INTO scenario_states (scenario_id, project_id, "
            "original_budget, adjusted_budget, budget_delta, "
            "original_rag, adjusted_rag, original_start, adjusted_start, "
            "original_end, adjusted_end, is_affected) VALUES\n"
            + ",\n".join(state_rows) + ";"
        )

    # --- scenario_capacity_impacts ------------------------------------------
    impact_rows: list[str] = []
    for s in sorted(SCENARIOS, key=lambda r: r["id"]):
        for ci in sorted(
            s.get("capacity_impacts", []),
            key=lambda r: (r["cost_center_id"], r["month"]),
        ):
            impact_rows.append(
                "(" + ", ".join([
                    str(s["id"]),
                    sql_str(ci["cost_center_id"]),
                    sql_str(ci["month"]),
                    f"{ci['original_utilization_pct']:.1f}",
                    f"{ci['adjusted_utilization_pct']:.1f}",
                    f"{ci['fte_delta']:.2f}",
                ]) + ")"
            )
    if impact_rows:
        parts.append(
            "\nINSERT INTO scenario_capacity_impacts (scenario_id, "
            "cost_center_id, month, original_utilization_pct, "
            "adjusted_utilization_pct, fte_delta) VALUES\n"
            + ",\n".join(impact_rows) + ";"
        )

    # --- scenario_promotions (partial-promote audit per [B-PR-03..04]) -----
    promo_rows: list[str] = []
    for s in sorted(SCENARIOS, key=lambda r: r["id"]):
        for pr in s.get("promotions", []):
            promo_rows.append(
                "(" + ", ".join([
                    str(s["id"]),
                    sql_str(pr["promoted_at"]),
                    sql_str(pr["promoted_by_id"]),
                    sql_str(pr.get("routing_summary_json")),
                    str(pr.get("promoted_count", 0)),
                    str(pr.get("skipped_count", 0)),
                    sql_str(pr.get("notes")),
                ]) + ")"
            )
    if promo_rows:
        parts.append(
            "\nINSERT INTO scenario_promotions (scenario_id, promoted_at, "
            "promoted_by_id, routing_summary_json, promoted_count, "
            "skipped_count, notes) VALUES\n"
            + ",\n".join(promo_rows) + ";"
        )

    # scenario_apply_to_forecast_events: empty at seed time per [B-PR-05].

    # --- scenario_forecast_cell_edits (Layer-2 cell overlay, spec §5) -------
    # The 30% external descope on proj-dwh is re-expressed here: explicit
    # absolute-month amount_eur cell edits on the external lines, replacing the
    # removed reduce_budget blanket-scale macro (spec §4). created_at/updated_at
    # anchor to the scenario created_at for byte-stable seed.
    cell_rows: list[str] = []
    for s in sorted(SCENARIOS, key=lambda r: r["id"]):
        for ce in sorted(
            s.get("cell_edits", []),
            key=lambda r: (r["project_id"], r["line_key"], r["month"], r["field"]),
        ):
            value = ce.get("value")
            cell_rows.append(
                "(" + ", ".join([
                    str(s["id"]),
                    sql_str(ce["project_id"]),
                    sql_str(ce["line_key"]),
                    sql_str(ce["month"]),
                    sql_str(ce["field"]),
                    "NULL" if value is None else f"{value:.2f}",
                    sql_str(s["created_at"]),
                    sql_str(s["created_at"]),
                ]) + ")"
            )
    if cell_rows:
        parts.append(
            "\nINSERT INTO scenario_forecast_cell_edits (scenario_id, "
            "project_id, line_key, month, field, value, created_at, "
            "updated_at) VALUES\n"
            + ",\n".join(cell_rows) + ";"
        )

    # --- scenario_line_edits (Layer-2 structural add/remove, spec §5) -------
    line_rows: list[str] = []
    for s in sorted(SCENARIOS, key=lambda r: r["id"]):
        for le in sorted(
            s.get("line_edits", []),
            key=lambda r: (r["project_id"], r["line_key"]),
        ):
            line_rows.append(
                "(" + ", ".join([
                    str(s["id"]),
                    sql_str(le["project_id"]),
                    sql_str(le["line_key"]),
                    sql_str(le["op"]),
                    sql_str(le["line_kind"]),
                    sql_str(le.get("category")),
                    sql_str(le.get("sub_category")),
                    sql_str(le.get("role_type_id")),
                    sql_str(le.get("cost_type_id")),
                    sql_str(le.get("vendor")),
                    sql_str(le.get("description")),
                    sql_str(le.get("capex_opex")),
                    sql_str(s["created_at"]),
                ]) + ")"
            )
    if line_rows:
        parts.append(
            "\nINSERT INTO scenario_line_edits (scenario_id, project_id, "
            "line_key, op, line_kind, category, sub_category, role_type_id, "
            "cost_type_id, vendor, description, capex_opex, created_at) VALUES\n"
            + ",\n".join(line_rows) + ";"
        )

    # --- scenario_mix_changes (Layer-2 seniority/sourcing mix, spec §5/§8) --
    # scn-cco-mdh-staffing's senior->mid dev swap maps here, mirroring the
    # legacy change_allocation action params (CC, swap roles, hours/mo, eff_from).
    mix_rows: list[str] = []
    for s in sorted(SCENARIOS, key=lambda r: r["id"]):
        for mc in sorted(
            s.get("mix_changes", []),
            key=lambda r: (r["project_id"], r.get("effective_from") or ""),
        ):
            hpm = mc.get("hours_per_month_swap")
            mix_rows.append(
                "(" + ", ".join([
                    str(s["id"]),
                    sql_str(mc["project_id"]),
                    sql_str(mc.get("cost_center_id")),
                    sql_str(mc.get("swap_from_role_id")),
                    sql_str(mc.get("swap_from_location_id")),
                    sql_str(mc.get("swap_to_role_id")),
                    sql_str(mc.get("swap_to_location_id")),
                    "NULL" if hpm is None else f"{hpm:.2f}",
                    sql_str(mc.get("effective_from")),
                    sql_str(s["created_at"]),
                ]) + ")"
            )
    if mix_rows:
        parts.append(
            "\nINSERT INTO scenario_mix_changes (scenario_id, project_id, "
            "cost_center_id, swap_from_role_id, swap_from_location_id, "
            "swap_to_role_id, swap_to_location_id, "
            "hours_per_month_swap, effective_from, created_at) VALUES\n"
            + ",\n".join(mix_rows) + ";"
        )

    # --- scenario_plan_edits (Layer-2 date/stage/DoI/milestone, spec §3/§5) -
    plan_rows: list[str] = []
    for s in sorted(SCENARIOS, key=lambda r: r["id"]):
        for pe in sorted(
            s.get("plan_edits", []),
            key=lambda r: (r["project_id"], r["target"], r.get("milestone_id") or ""),
        ):
            plan_rows.append(
                "(" + ", ".join([
                    str(s["id"]),
                    sql_str(pe["project_id"]),
                    sql_str(pe["target"]),
                    sql_str(pe.get("milestone_id", "")),
                    sql_str(pe.get("value")),
                    sql_str(pe.get("entry_json")),
                    sql_str(s["created_at"]),
                ]) + ")"
            )
    if plan_rows:
        parts.append(
            "\nINSERT INTO scenario_plan_edits (scenario_id, project_id, "
            "target, milestone_id, value, entry_json, created_at) VALUES\n"
            + ",\n".join(plan_rows) + ";"
        )

    return "\n".join(parts) + "\n"
