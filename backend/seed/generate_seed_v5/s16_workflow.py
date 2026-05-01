"""Stage 16 — Workflow templates + steps + step actions + scheduled changes.

Per Cluster D Session D2 [D-CAT-07]: workflow templates ship as configurable
data only. The four templates seeded here are the ones the demo persona
flows actually walk through:

- ``forecast_cycle`` (5 steps) — the rolling forecast cycle.
- ``intake``         (4 steps) — pipeline progression for new project ideas.
- ``change_request`` (4 steps) — CR lifecycle.
- ``send_back``      (3 steps) — controller send-back routing.

Two further keys exist in ``models.workflow_templates.SHIPPED_TEMPLATE_KEYS``
(milestone_baseline_override, scheduled_master_data_activation) but are not
demo-walkable in S1 and so are not seeded here. They can be added in a
follow-up commit without touching the four templates above.

Plus 3 ``scheduled_changes`` rows (one ``pending_review`` on a planning
parameter, one ``approved`` waiting activation, one ``cancelled`` for
diversity) demonstrating the lifecycle states surfaced in the global
Scheduled Changes panel.
"""
from __future__ import annotations

from _utils import sql_str

# ---------------------------------------------------------------------------
# Templates — fixed-step shape per [D-CAT-07]. Step ordering is set at seed
# time and is *not* mutable through the admin API.
# ---------------------------------------------------------------------------
_TEMPLATES: list[dict] = [
    {
        "id": 1,
        "key": "forecast_cycle",
        "name": "Forecast Cycle",
        "description": (
            "Five-phase rolling forecast cycle: Open cycle, PL submission, "
            "CC owner confirmation, Controller review, Cycle close."
        ),
    },
    {
        "id": 2,
        "key": "intake",
        "name": "Intake / Pipeline Progression",
        "description": (
            "Capture, AI Council screening, CC owner capacity feasibility, "
            "Controller approval to advance to DoI 2."
        ),
    },
    {
        "id": 3,
        "key": "change_request",
        "name": "Change Request",
        "description": (
            "PL drafts CR -> CC owner confirmation -> Controller approval "
            "-> Apply to baseline."
        ),
    },
    {
        "id": 4,
        "key": "send_back",
        "name": "Send Back",
        "description": (
            "Controller marks send-back, PL revises, request is re-routed "
            "into the originating workflow."
        ),
    },
]


# ---------------------------------------------------------------------------
# Steps. Schema per ``models/workflow_templates.WorkflowStep``:
#   step_order (int), name, description, step_type (action|review|gate|notification),
#   required (bool), skippable (bool), assigned_role,
#   data_gates_json (list-as-json), notifications_json (object-as-json),
#   time_constraint_days (int|null), escalation_action.
#
# Each entry below is (step_id, template_id, step_order, name, description,
# step_type, required, skippable, role, gates_json, notifs_json,
# time_days, escalation).
# ---------------------------------------------------------------------------
_STEPS: list[tuple] = [
    # --- Forecast Cycle (template 1, 5 steps) -------------------------------
    (1, 1, 1, "Open cycle",
     "Controller opens the forecast cycle for the period.",
     "action", True, False, "controller",
     None, '{"on_start": ["all_pls"]}', None, None),
    (2, 1, 2, "PL submission",
     "Project Leads complete forecast lines via the wizard and submit.",
     "action", True, False, "project_lead",
     '["actuals_loaded", "milestones_aligned"]',
     '{"on_overdue": ["controller"]}', 10, "reminder"),
    (3, 1, 3, "CC owner confirmation",
     "CC owners confirm capacity feasibility for the submitted forecast.",
     "review", True, False, "cost_center_owner",
     None, '{"on_start": ["cc_owner"]}', 5, "reminder"),
    (4, 1, 4, "Controller review",
     "Controller reviews submitted forecasts with inline-edit capability.",
     "review", True, False, "controller",
     None, None, 5, "escalate_to_manager"),
    (5, 1, 5, "Cycle close",
     "Controller approves; baseline is updated and forecast version snapshotted.",
     "gate", True, False, "controller",
     None, '{"on_completion": ["pl", "cc_owner"]}', None, None),

    # --- Intake (template 2, 4 steps) --------------------------------------
    (6, 2, 1, "Capture",
     "PL submits a new project intake (DoI 0) with title, description, t-shirt size.",
     "action", True, False, "project_lead",
     '["title", "description", "tshirt_size"]', None, None, None),
    (7, 2, 2, "AI Council screening",
     "AI Council screens AI-related intakes; non-AI intakes auto-skip per [A-DOI-03].",
     "gate", False, True, "controller",
     None, None, 14, "reminder"),
    (8, 2, 3, "CC owner capacity feasibility",
     "CC owner reviews capacity ask; flags conflicts with active commitments.",
     "review", True, False, "cost_center_owner",
     '["estimated_fte_by_role"]',
     '{"on_start": ["cc_owners"]}', 7, "reminder"),
    (9, 2, 4, "Controller approval to advance to DoI 2",
     "Controller approves; project advances to DoI 2 (Under Evaluation).",
     "gate", True, False, "controller",
     '["complexity_scores", "value_creation_scores"]',
     '{"on_completion": ["pl"]}', 21, "escalate_to_manager"),

    # --- Change Request (template 3, 4 steps) ------------------------------
    (10, 3, 1, "PL drafts CR",
     "Project Lead drafts the change request with delta summary.",
     "action", True, False, "project_lead",
     '["delta_summary", "rationale"]', None, None, None),
    (11, 3, 2, "CC owner confirmation",
     "CC owner confirms or declines the resource impact for the CR.",
     "review", True, False, "cost_center_owner",
     None, '{"on_start": ["cc_owner"]}', 5, "reminder"),
    (12, 3, 3, "Controller approval",
     "Controller approves, rejects, or sends back the CR.",
     "review", True, False, "controller",
     None, None, 7, "escalate_to_manager"),
    (13, 3, 4, "Apply to baseline",
     "On approval, forecast lines are updated and a forecast_version is snapshotted.",
     "action", True, False, "controller",
     None, '{"on_completion": ["pl", "cc_owner"]}', None, None),

    # --- Send Back (template 4, 3 steps) -----------------------------------
    (14, 4, 1, "Controller marks send-back",
     "Controller annotates the submission and routes it back to the PL.",
     "action", True, False, "controller",
     '["change_notes"]', '{"on_start": ["pl"]}', None, None),
    (15, 4, 2, "PL revises",
     "Project Lead addresses the controller feedback and updates the submission.",
     "action", True, False, "project_lead",
     None, None, 7, "reminder"),
    (16, 4, 3, "Re-route",
     "PL resubmits; the originating workflow resumes from the send-back point.",
     "action", True, False, "project_lead",
     None, None, None, None),
]


# Step action rows: (step_id, action_order, action_type, label, config_json).
_STEP_ACTIONS: list[tuple] = [
    # Forecast Cycle review (step 4)
    (4, 1, "approve",   "Approve forecast",       '{"updates_baseline": true}'),
    (4, 2, "send_back", "Send back to PL",        '{"target_workflow": "send_back"}'),
    # Forecast Cycle close (step 5)
    (5, 1, "close",     "Close forecast cycle",   '{"snapshot_version": true}'),
    # Intake AI Council (step 7)
    (7, 1, "approve",   "Pass AI Council screen", '{}'),
    (7, 2, "skip",      "Not applicable",         '{}'),
    (7, 3, "reject",    "Reject (AI Council)",    '{}'),
    # Intake controller approval (step 9)
    (9, 1, "approve",   "Advance to DoI 2",       '{"target_doi": 2}'),
    (9, 2, "reject",    "Reject intake",          '{}'),
    (9, 3, "send_back", "Send back to PL",        '{"target_workflow": "send_back"}'),
    # CR controller review (step 12)
    (12, 1, "approve",   "Approve CR",             '{"updates_forecast": true}'),
    (12, 2, "reject",    "Reject CR",              '{}'),
    (12, 3, "send_back", "Send back to PL",        '{"target_workflow": "send_back"}'),
]


# ---------------------------------------------------------------------------
# Scheduled changes — three lifecycle states for the demo.
# ---------------------------------------------------------------------------
_SCHEDULED_CHANGES: list[dict] = [
    {
        "id": 1,
        "entity_type": "planning_parameter",
        "entity_id": "rag_amber_threshold",
        "description": "Tighten RAG amber threshold from 5% to 4% effective May 2026.",
        "pending_values_json": '{"current_value": "4"}',
        "activation_date": "2026-05-15",
        "review_status": "pending_review",
        "created_by_person_id": "p-meier",
        "created_at": "2026-04-22 10:00:00",
        "reviewed_by_person_id": None,
        "reviewed_at": None,
        "review_comments": None,
        "activated_at": None,
        "activation_error": None,
    },
    {
        "id": 2,
        "entity_type": "planning_parameter",
        "entity_id": "forecast_deadline",
        "description": "Move forecast deadline from 15th to 12th for 2027 cycle.",
        "pending_values_json": '{"current_value": "12"}',
        "activation_date": "2026-12-01",
        "review_status": "approved",
        "created_by_person_id": "p-meier",
        "created_at": "2026-04-15 09:00:00",
        "reviewed_by_person_id": "p-meier",
        "reviewed_at": "2026-04-20 14:30:00",
        "review_comments": "Approved per finance steering committee minutes 2026-04-20.",
        "activated_at": None,
        "activation_error": None,
    },
    {
        "id": 3,
        "entity_type": "cost_center",
        "entity_id": "cc-muc-bso",
        "description": "Rename Munich BSO cost center per HR realignment (cancelled).",
        "pending_values_json": '{"name": "Munich BSO Strategic"}',
        "activation_date": "2026-06-01",
        "review_status": "cancelled",
        "created_by_person_id": "p-meier",
        "created_at": "2026-04-10 11:00:00",
        "reviewed_by_person_id": "p-meier",
        "reviewed_at": "2026-04-18 12:00:00",
        "review_comments": "Cancelled — HR pushed realignment to FY27.",
        "activated_at": None,
        "activation_error": None,
    },
]


def _bool(v: bool) -> str:
    return "1" if v else "0"


def generate() -> str:
    parts: list[str] = []
    parts.append("-- =============================================================================")
    parts.append("-- s16 / Workflow Templates + Steps + Step Actions + Scheduled Changes")
    parts.append("-- Cluster D Session D2 — [D-CAT-07]")
    parts.append("-- =============================================================================")

    # --- workflow_templates --------------------------------------------------
    tpl_rows: list[str] = []
    for t in _TEMPLATES:
        tpl_rows.append(
            "(" + ", ".join([
                str(t["id"]),
                sql_str(t["key"]),
                sql_str(t["name"]),
                sql_str(t["description"]),
                "1",  # is_active
                "'2026-01-01 00:00:00'",  # created_at
                "'2026-01-01 00:00:00'",  # modified_at
            ]) + ")"
        )
    parts.append(
        "\nINSERT INTO workflow_templates (id, key, name, description, is_active, "
        "created_at, modified_at) VALUES\n"
        + ",\n".join(tpl_rows) + ";"
    )

    # --- workflow_steps ------------------------------------------------------
    step_rows: list[str] = []
    for (step_id, tpl_id, step_order, name, descr, step_type, required, skippable,
         role, gates_json, notifs_json, time_days, escalation) in _STEPS:
        step_rows.append(
            "(" + ", ".join([
                str(step_id),
                str(tpl_id),
                str(step_order),
                sql_str(name),
                sql_str(descr),
                sql_str(step_type),
                _bool(required),
                _bool(skippable),
                sql_str(role),
                sql_str(gates_json),
                sql_str(notifs_json),
                sql_str(time_days) if time_days is not None else "NULL",
                sql_str(escalation),
            ]) + ")"
        )
    parts.append(
        "\nINSERT INTO workflow_steps (id, template_id, step_order, name, description, "
        "step_type, required, skippable, assigned_role, data_gates_json, "
        "notifications_json, time_constraint_days, escalation_action) VALUES\n"
        + ",\n".join(step_rows) + ";"
    )

    # --- workflow_step_actions ----------------------------------------------
    action_rows: list[str] = []
    for (step_id, action_order, action_type, label, config_json) in _STEP_ACTIONS:
        action_rows.append(
            "(" + ", ".join([
                str(step_id),
                str(action_order),
                sql_str(action_type),
                sql_str(label),
                sql_str(config_json),
            ]) + ")"
        )
    parts.append(
        "\nINSERT INTO workflow_step_actions (step_id, action_order, action_type, "
        "label, config_json) VALUES\n"
        + ",\n".join(action_rows) + ";"
    )

    # --- scheduled_changes ---------------------------------------------------
    sc_rows: list[str] = []
    for sc in _SCHEDULED_CHANGES:
        sc_rows.append(
            "(" + ", ".join([
                str(sc["id"]),
                sql_str(sc["entity_type"]),
                sql_str(sc["entity_id"]),
                sql_str(sc["description"]),
                sql_str(sc["pending_values_json"]),
                sql_str(sc["activation_date"]),
                sql_str(sc["review_status"]),
                sql_str(sc["created_by_person_id"]),
                sql_str(sc["created_at"]),
                sql_str(sc["reviewed_by_person_id"]),
                sql_str(sc["reviewed_at"]),
                sql_str(sc["review_comments"]),
                sql_str(sc["activated_at"]),
                sql_str(sc["activation_error"]),
            ]) + ")"
        )
    parts.append(
        "\nINSERT INTO scheduled_changes (id, entity_type, entity_id, description, "
        "pending_values_json, activation_date, review_status, "
        "created_by_person_id, created_at, "
        "reviewed_by_person_id, reviewed_at, review_comments, "
        "activated_at, activation_error) VALUES\n"
        + ",\n".join(sc_rows) + ";"
    )

    return "\n".join(parts) + "\n"
