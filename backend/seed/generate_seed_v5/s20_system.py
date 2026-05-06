"""Stage 20 — Notifications, system suggestions, audit log seed entries.

Per CLAUDE.md the four demo personas drive different Launchpad action lists.
This stage seeds:

- ``notifications`` — 13 rows differentiated per persona so the Launchpad
  pending-actions tile shows non-empty role-differentiated content.
- ``system_suggestions`` — 4 rows mirroring the v4 narrative shape (forecast
  wizard pre-filled change suggestions). The flagship project
  ``proj-mdh-rollout`` carries a data-steward FTE recommendation.
- ``audit_log`` — 4 last-login rows (one per persona) + 5 master-data /
  forecast / pipeline / simulator events, each tagged with a ``category``
  from ``models.system.AUDIT_CATEGORIES``.
"""
from __future__ import annotations

from _utils import sql_str


# ---------------------------------------------------------------------------
# Notifications — differentiated per persona.
#
# Schema: (user_person_id, message, severity, deep_link_module,
#          deep_link_entity_id, deep_link_tab, is_read, created_at).
# Severity: 'info' | 'warning' | 'action'.
# ---------------------------------------------------------------------------
_NOTIFICATIONS: list[tuple] = [
    # --- p-sharma (PL) — 6 rows ---
    ("p-sharma",
     "Forecast cycle reminder: ERP Integration Phase 2 — April 2026 forecast is due in 3 days",
     "action", "workbench", "proj-erp2", None, False,
     "2026-04-09 08:00:00"),
    ("p-sharma",
     "Forecast cycle reminder: Sensor Data Pipeline — April 2026 forecast is due in 3 days",
     "action", "workbench", "proj-sensor", None, False,
     "2026-04-09 08:00:00"),
    ("p-sharma",
     "Forecast overdue: ERP Integration Phase 2 — March 2026 forecast was not submitted",
     "action", "workbench", "proj-erp2", None, False,
     "2026-04-01 08:00:00"),
    ("p-sharma",
     "Change request returned: CR #27 for Predictive Maintenance PoC sent back by Controller with feedback",
     "action", "workbench", "proj-predmaint", "change-requests", False,
     "2026-03-25 14:00:00"),
    ("p-sharma",
     "Change request approved: CR #28 for Sensor Data Pipeline has been approved by Controller",
     "info", "workbench", "proj-sensor", "change-requests", True,
     "2026-03-18 11:00:00"),
    ("p-sharma",
     "Project decision: Master Data Hub Rollout has cleared its DoI 3 gate — controller approval recorded",
     "info", "workbench", "proj-mdh-rollout", None, False,
     "2026-04-05 10:30:00"),

    # --- p-meier (Controller) — 5 rows ---
    ("p-meier",
     "CR pending approval: CR #9 for ERP Integration Phase 2 is ready for your review",
     "action", "portfolio", "proj-erp2", "approvals", False,
     "2026-04-08 11:00:00"),
    ("p-meier",
     "CR pending approval: CR #15 for Sensor Data Pipeline is ready for your review",
     "action", "portfolio", "proj-sensor", "approvals", False,
     "2026-04-09 11:00:00"),
    ("p-meier",
     "CR pending approval: CR #19 for Identity & Access Management Run is ready for your review",
     "action", "portfolio", "proj-iam-run", "approvals", False,
     "2026-04-10 11:00:00"),
    ("p-meier",
     "Forecast overdue: ERP Integration Phase 2 — March 2026 forecast not submitted by Project Lead",
     "warning", "workbench", "proj-erp2", None, False,
     "2026-04-01 08:00:00"),
    ("p-meier",
     "Scenario reminder: 'Budget Pressure: 15% Reduction' was published 28 days ago — review readout",
     "info", "simulator", None, None, False,
     "2026-04-09 09:00:00"),
    ("p-meier",
     "Scenario draft: 'MDH BTC Rebalance — DE/PL/CZ' is your private draft — recalc available",
     "info", "simulator", None, None, False,
     "2026-04-12 10:00:00"),

    # --- p-brenner (CC Owner) — 5 rows ---
    ("p-brenner",
     "CR pending confirmation: CR #9 for ERP Integration Phase 2 requires your review",
     "action", "portfolio", "proj-erp2", "approvals", False,
     "2026-04-05 09:00:00"),
    ("p-brenner",
     "CR pending confirmation: CR #15 for Sensor Data Pipeline requires your review",
     "action", "portfolio", "proj-sensor", "approvals", False,
     "2026-04-08 09:30:00"),
    ("p-brenner",
     "Resource request: Predictive Maintenance PoC is requesting a Senior Developer from MUC/APD",
     "action", "capacity", "proj-predmaint", "requests", False,
     "2026-04-02 10:00:00"),
    ("p-brenner",
     "Resource request: Smart Logistics Pilot is requesting capacity confirmation from MUC/APD",
     "action", "capacity", "proj-autobrake", "requests", False,
     "2026-04-04 10:00:00"),
    ("p-brenner",
     "Scenario draft: 'MDH Staffing Mix — MUC/APD' is your private CC-Owner sandbox",
     "info", "simulator", None, None, False,
     "2026-04-02 14:30:00"),

    # --- p-weber (Executive) — 2 rows ---
    ("p-weber",
     "Scenario published: 'Budget Pressure: 15% Reduction' published by Sarah Mitchell — executive readout available",
     "info", "simulator", None, None, False,
     "2026-03-12 10:00:00"),
    ("p-weber",
     "Scenario digest: 1 scenario published this month, 1 promoted (partial), 0 rejected",
     "info", "simulator", None, None, True,
     "2026-04-15 09:00:00"),
]


# ---------------------------------------------------------------------------
# System suggestions — pre-computed forecast-wizard recommendations.
# Schema: (project_id, suggestion_type, observation, recommendation,
#          impact_description, pre_filled_changes_json, created_at).
# ---------------------------------------------------------------------------
_SUGGESTIONS: list[tuple] = [
    ("proj-erp2", "trend_based",
     "Consulting costs have exceeded forecast by 15-20% for the past 6 months. The trend suggests continued overrun through project end.",
     "Consider renegotiating the Deloitte advisory scope or capping monthly consulting spend at current forecast levels.",
     "Potential savings of EUR 18,000-25,000 over remaining project months if consulting costs are capped.",
     '{"changes": [{"type": "external", "line": "SAP Implementation Support", "action": "cap_at_forecast"}]}',
     "2026-04-01 08:00:00"),
    ("proj-sensor", "burn_rate",
     "External costs (consulting + cloud) are running 25% above baseline. At current burn rate, the project will exceed its approved budget by EUR 45,000.",
     "Submit a change request to formally adjust the external cost forecast, or identify areas where internal effort can replace external consulting.",
     "Without intervention, projected budget overrun of EUR 45,000 by project end (December 2026).",
     '{"changes": [{"type": "external", "line": "Data Engineering Consulting", "action": "reduce_by_pct", "pct": 15}]}',
     "2026-04-01 08:00:00"),
    ("proj-iam-run", "actuals_correction",
     "ServiceNow licensing costs increased 40% after vendor pricing change. Current run-cost forecast may not fully reflect the compounding impact.",
     "Review forecast for ServiceNow ITSM Licenses line item and ensure all remaining months reflect the updated pricing.",
     "Forecast accuracy improvement: ensures remaining 6 months correctly reflect EUR 5,600/month vs potential underestimate.",
     '{"changes": [{"type": "external", "line": "ServiceNow ITSM Licenses", "action": "update_forecast", "amount": 5600}]}',
     "2026-04-01 08:00:00"),
    ("proj-mdh-rollout", "utilization",
     "Master Data Hub steady-state operation will require dedicated data-steward capacity by Q3 2026. Current allocation does not reflect this transition.",
     "Add 0.5 FTE Data Steward (role-data-eng) starting July 2026, ramping to 1.0 FTE by October 2026 as the offering goes live.",
     "Without this capacity, expect ~3-week MDH change-request lead times; with it, lead time stays under 1 week.",
     '{"changes": [{"type": "internal", "role": "role-data-eng", "action": "increase_hours", "delta": 80, "from_month": "2026-07"}]}',
     "2026-04-05 09:00:00"),
]


# ---------------------------------------------------------------------------
# Audit log — last-login per persona + a handful of representative master-data
# / forecast / pipeline / simulator events tagged per AUDIT_CATEGORIES.
#
# Schema: (timestamp, user_person_id, entity_type, entity_id, entity_name,
#          action, field_changed, old_value, new_value, category).
# ---------------------------------------------------------------------------
_AUDIT_LOG: list[tuple] = [
    # --- 4 last-login rows (one per persona) ---
    ("2026-04-29 07:55:00", "p-meier",   "user", "user-sarah",   "Sarah Mitchell",        "login", None, None, None, "access_control"),
    ("2026-04-29 08:02:00", "p-brenner", "user", "user-james", "James Cooper",    "login", None, None, None, "access_control"),
    ("2026-04-29 08:11:00", "p-sharma",  "user", "user-anita",  "Anita Desai",      "login", None, None, None, "access_control"),
    ("2026-04-29 08:24:00", "p-weber",   "user", "user-robert",  "Robert Chen",   "login", None, None, None, "access_control"),

    # --- 5 representative master-data / lifecycle events ---
    ("2026-04-05 10:30:00", "p-meier", "project", "proj-mdh-rollout", "Master Data Hub Rollout",
     "update", "pipeline_stage", "approved", "active", "pipeline_transitions"),
    ("2026-04-08 11:00:00", "p-brenner", "change_request", "9", "CR #9 - ERP Integration Phase 2",
     "update", "cc_status", "pending", "confirmed", "forecast_actions"),
    ("2026-04-12 10:00:00", "p-meier", "scenario", "1", "MDH BTC Rebalance — DE/PL/CZ",
     "create", None, None, None, "simulator"),
    ("2026-04-15 10:00:00", "p-meier", "scenario_action", "scn-budget-pressure-15:3",
     "Accelerate Supply Compliance", "promote", "promoted_at", None, "2026-04-15T10:00:00", "simulator"),
    ("2026-04-22 10:00:00", "p-meier", "planning_parameter", "rag_amber_threshold",
     "RAG Amber Threshold", "create", None, None, "scheduled_change_pending", "scheduled_change_lifecycle"),
]


def _bool(v: bool) -> str:
    return "1" if v else "0"


def generate() -> str:
    parts: list[str] = []
    parts.append("-- =============================================================================")
    parts.append("-- s20 / Notifications + System Suggestions + Audit Log")
    parts.append("-- =============================================================================")

    # --- notifications -------------------------------------------------------
    nrows: list[str] = []
    for (uid, msg, sev, mod, ent, tab, is_read, ts) in _NOTIFICATIONS:
        nrows.append(
            "(" + ", ".join([
                sql_str(uid),
                sql_str(msg),
                sql_str(sev),
                sql_str(mod),
                sql_str(ent),
                sql_str(tab),
                _bool(is_read),
                sql_str(ts),
            ]) + ")"
        )
    parts.append(
        "\nINSERT INTO notifications (user_person_id, message, severity, "
        "deep_link_module, deep_link_entity_id, deep_link_tab, is_read, "
        "created_at) VALUES\n"
        + ",\n".join(nrows) + ";"
    )

    # --- system_suggestions --------------------------------------------------
    srows: list[str] = []
    for (pid, stype, obs, rec, impact, prefilled, ts) in _SUGGESTIONS:
        srows.append(
            "(" + ", ".join([
                sql_str(pid),
                sql_str(stype),
                sql_str(obs),
                sql_str(rec),
                sql_str(impact),
                sql_str(prefilled),
                sql_str(ts),
            ]) + ")"
        )
    parts.append(
        "\nINSERT INTO system_suggestions (project_id, suggestion_type, "
        "observation, recommendation, impact_description, "
        "pre_filled_changes_json, created_at) VALUES\n"
        + ",\n".join(srows) + ";"
    )

    # --- audit_log -----------------------------------------------------------
    arows: list[str] = []
    for (ts, uid, ent_type, ent_id, ent_name, action, field, old_v, new_v, cat) in _AUDIT_LOG:
        arows.append(
            "(" + ", ".join([
                sql_str(ts),
                sql_str(uid),
                sql_str(ent_type),
                sql_str(ent_id),
                sql_str(ent_name),
                sql_str(action),
                sql_str(field),
                sql_str(old_v),
                sql_str(new_v),
                sql_str(cat),
            ]) + ")"
        )
    parts.append(
        "\nINSERT INTO audit_log (timestamp, user_person_id, entity_type, "
        "entity_id, entity_name, action, field_changed, old_value, new_value, "
        "category) VALUES\n"
        + ",\n".join(arows) + ";"
    )

    return "\n".join(parts) + "\n"
