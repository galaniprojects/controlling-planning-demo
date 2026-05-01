"""Stage 19 — What-If scenarios + actions + states + capacity impacts + promotions.

Emits SQL for these v5 tables (all in Cluster B's lifecycle):
- ``scenarios`` — 3 scenarios driven by ``config/scenarios.py``.
- ``scenario_actions`` — ordered action list per scenario, carrying the
  v5 columns (``lever_category``, ``tier``).
- ``scenario_states`` — pre-computed snapshot per affected project for the
  published scenario per [B-SL-01..05].
- ``scenario_capacity_impacts`` — per-CC × month capacity rollup snapshot
  for the published scenario.
- ``scenario_promotions`` — partial-promote audit row per [B-PR-03..04].
- ``scenario_apply_to_forecast_events`` — left empty in seed (created at
  runtime by the PL Apply-to-forecast endpoint per [B-PR-05]).

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

    return "\n".join(parts) + "\n"
