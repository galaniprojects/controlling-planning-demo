"""Stage 15 — Change Requests + per-line details + submission snapshots.

Emits the v5 demo CR set across multiple workflow states:
- Approved historical CR on proj-erp2 (the red, troubled project's CR-A
  ancestor).
- Pending CC Owner confirmation: 1 on proj-erp2 (CR-A) and 1 on proj-sensor
  (CR-B AWS scaling).
- Pending Controller approval: 1 on proj-iam-run (CR-D).
- Sent back by controller: CR #27 on proj-predmaint per the plan doc PL
  Launchpad action target.
- Approved recent: 1 on proj-mdh-rollout.

CR ids are stable (1..N) so resource_requests.change_request_id FKs from
``s14_allocations`` resolve. Per-line ``cr_change_details`` rows + JSON
``cr_submission_snapshots`` rows are emitted for the sent-back CR (#27)
to power the Workbench review surface diff.
"""
from __future__ import annotations

import json

from _utils import sql_str

# ---------------------------------------------------------------------------
# Change Request specifications.
#
# Schema columns: id, project_id, submitted_by_id, submission_timestamp,
#                 status, change_category, summary, justification,
#                 is_system_suggested, cc_owner_id, cc_confirmation_timestamp,
#                 cc_status, cc_comments, controller_id,
#                 controller_approval_timestamp, controller_status,
#                 controller_comments, controller_feedback, created_at.
# ---------------------------------------------------------------------------

CHANGE_REQUESTS: list[dict] = [
    # CR #1 — historical approval on proj-erp2 (Sr Dev hours uplift)
    {
        "id": 1,
        "proj": "proj-erp2",
        "by": "p-sharma",
        "ts": "2025-06-15 09:30:00",
        "status": "approved",
        "cat": "resource",
        "summary": "Increase Sr Developer MUC hours to address integration backlog",
        "justification": "Integration testing revealed more complex data mappings than anticipated.",
        "cc_owner": "p-brenner",
        "cc_ts": "2025-06-16 11:00:00",
        "cc_status": "confirmed",
        "ctrl": "p-meier",
        "ctrl_ts": "2025-06-17 14:00:00",
        "ctrl_status": "approved",
        "details": [
            {"field": "role-sr-dev (MUC) hours", "old": "80", "new": "100",
             "delta": "+20 hrs/mo", "type": "role-sr-dev", "month": "2025-07"},
        ],
    },

    # CR #2 — historical approval on proj-erp2 (consulting uplift)
    {
        "id": 2,
        "proj": "proj-erp2",
        "by": "p-sharma",
        "ts": "2025-06-20 10:00:00",
        "status": "approved",
        "cat": "external_cost",
        "summary": "Increase Deloitte consulting budget for extended SAP support",
        "justification": "Deloitte advisory scope expanded to cover additional module integrations.",
        "cc_owner": "p-brenner",
        "cc_ts": "2025-06-21 09:00:00",
        "cc_status": "confirmed",
        "ctrl": "p-meier",
        "ctrl_ts": "2025-06-22 16:00:00",
        "ctrl_status": "approved",
        "details": [
            {"field": "SAP Implementation Support", "old": "15000", "new": "22000",
             "delta": "+7000 EUR/mo", "type": "ext-consulting", "month": "2025-07"},
        ],
    },

    # CR #9 — Active, pending CC Owner confirmation on proj-erp2 (CR-A demo target)
    {
        "id": 9,
        "proj": "proj-erp2",
        "by": "p-sharma",
        "ts": "2026-03-05 09:00:00",
        "status": "pending_cc_confirmation",
        "cat": "resource",
        "summary": "Increase Sr Developer MUC hours Apr-Jun 2026 + extend Deloitte consulting through Q3",
        "justification": "Final sprint for go-live requires additional senior capacity and continued advisory support.",
        "cc_owner": "p-brenner",
        "cc_ts": None,
        "cc_status": "pending",
        "ctrl": None,
        "ctrl_ts": None,
        "ctrl_status": None,
        "details": [
            {"field": "role-sr-dev (MUC) hours Apr-Jun", "old": "100", "new": "120",
             "delta": "+20 hrs/mo", "type": "role-sr-dev", "month": "2026-04"},
            {"field": "SAP Implementation Support extension",
             "old": "Ends 2026-06", "new": "Extends to 2026-09",
             "delta": "+3 months", "type": "ext-consulting", "month": "2026-07"},
        ],
    },

    # CR #15 — Active, pending CC Owner confirmation on proj-sensor (CR-B demo target)
    {
        "id": 15,
        "proj": "proj-sensor",
        "by": "p-sharma",
        "ts": "2026-03-08 09:30:00",
        "status": "pending_cc_confirmation",
        "cat": "external_cost",
        "summary": "Add AWS infrastructure scaling costs for production rollout",
        "justification": "Production deployment requires additional infrastructure capacity beyond development estimates.",
        "cc_owner": "p-brenner",
        "cc_ts": None,
        "cc_status": "pending",
        "ctrl": None,
        "ctrl_ts": None,
        "ctrl_status": None,
        "details": [
            {"field": "New: AWS Production Infrastructure", "old": "0", "new": "5000",
             "delta": "+5000 EUR/mo", "type": "ext-cloud", "month": "2026-04"},
        ],
    },

    # CR #19 — Active, pending Controller approval on proj-iam-run (CR-D demo target)
    {
        "id": 19,
        "proj": "proj-iam-run",
        "by": "p-brenner",
        "ts": "2026-03-03 10:00:00",
        "status": "pending_controller_approval",
        "cat": "external_cost",
        "summary": "Licensing cost increase + additional security consultant for migration complexity",
        "justification": "Vendor licensing model change and additional complexity discovered during implementation require budget adjustment.",
        "cc_owner": "p-brenner",
        "cc_ts": "2026-03-04 11:00:00",
        "cc_status": "confirmed",
        "ctrl": "p-meier",
        "ctrl_ts": None,
        "ctrl_status": "pending",
        "details": [
            {"field": "ServiceNow ITSM Licenses", "old": "5600", "new": "6200",
             "delta": "+600 EUR/mo", "type": "ext-sw-licenses", "month": "2026-04"},
            {"field": "Security Operations Retainer", "old": "4000", "new": "5500",
             "delta": "+1500 EUR/mo", "type": "ext-consulting", "month": "2026-04"},
        ],
    },

    # CR #27 — Sent back by Controller on proj-predmaint (CR-E demo target;
    # populates the PL Launchpad sent-back tile per the plan doc).
    {
        "id": 27,
        "proj": "proj-predmaint",
        "by": "p-sharma",
        "ts": "2026-02-20 10:00:00",
        "status": "sent_back_by_controller",
        "cat": "timeline",
        "summary": "Extend project end date by 3 months for production pilot",
        "justification": "PoC results justify production pilot but require additional time and resources.",
        "cc_owner": "p-brenner",
        "cc_ts": "2026-02-21 11:00:00",
        "cc_status": "confirmed",
        "ctrl": "p-meier",
        "ctrl_ts": "2026-02-25 14:00:00",
        "ctrl_status": "sent_back",
        "ctrl_comments": (
            "Timeline extension needs more justification. Please provide a "
            "detailed milestone plan for the production pilot phase and "
            "demonstrate how the additional 3 months maps to specific deliverables."
        ),
        "ctrl_feedback": (
            "The 3-month extension is reasonable but the resource increase is too "
            "high. I have reduced Sr Developer hours from 60 to 50 hrs/mo for the "
            "extended period and capped the ML Platform License at 3500 EUR/mo "
            "instead of 4000."
        ),
        "details": [
            {"field": "End date", "old": "2027-03", "new": "2027-06",
             "delta": "+3 months", "type": None, "month": None},
            {"field": "role-sr-dev (MUC) hours", "old": "40", "new": "60",
             "delta": "+20 hrs/mo", "type": "role-sr-dev", "month": "2027-04"},
            {"field": "ML Platform License extension",
             "old": "Ends 2027-03", "new": "Extends to 2027-06",
             "delta": "+3 months", "type": "ext-sw-licenses", "month": "2027-04"},
        ],
        "snapshots": [
            {
                "type": "original", "by": "p-sharma",
                "data": [
                    {"category": "internal", "sub_category": "role-sr-dev", "month": "2027-04", "hours": 60, "amount_eur": 7200},
                    {"category": "internal", "sub_category": "role-sr-dev", "month": "2027-05", "hours": 60, "amount_eur": 7200},
                    {"category": "internal", "sub_category": "role-sr-dev", "month": "2027-06", "hours": 60, "amount_eur": 7200},
                    {"category": "external", "sub_category": "ext-sw-licenses", "month": "2027-04", "hours": None, "amount_eur": 4000},
                    {"category": "external", "sub_category": "ext-sw-licenses", "month": "2027-05", "hours": None, "amount_eur": 4000},
                    {"category": "external", "sub_category": "ext-sw-licenses", "month": "2027-06", "hours": None, "amount_eur": 4000},
                ],
            },
            {
                "type": "controller_proposed", "by": "p-meier",
                "comments": "Reduced Sr Dev hours to 50/mo and ML license to 3500/mo for extended period.",
                "data": [
                    {"category": "internal", "sub_category": "role-sr-dev", "month": "2027-04", "hours": 50, "amount_eur": 6000},
                    {"category": "internal", "sub_category": "role-sr-dev", "month": "2027-05", "hours": 50, "amount_eur": 6000},
                    {"category": "internal", "sub_category": "role-sr-dev", "month": "2027-06", "hours": 50, "amount_eur": 6000},
                    {"category": "external", "sub_category": "ext-sw-licenses", "month": "2027-04", "hours": None, "amount_eur": 3500},
                    {"category": "external", "sub_category": "ext-sw-licenses", "month": "2027-05", "hours": None, "amount_eur": 3500},
                    {"category": "external", "sub_category": "ext-sw-licenses", "month": "2027-06", "hours": None, "amount_eur": 3500},
                ],
            },
        ],
    },

    # CR #28 — Recently approved on proj-mdh-rollout (drives the PL "recent
    # approvals" surface on the flagship project).
    {
        "id": 28,
        "proj": "proj-mdh-rollout",
        "by": "p-sharma",
        "ts": "2026-03-07 09:00:00",
        "status": "approved",
        "cat": "resource",
        "summary": "Add Data Engineer BUD for Build phase parallelism",
        "justification": "Build phase scope expanded with additional source-system integrations.",
        "cc_owner": "p-brenner",
        "cc_ts": "2026-03-08 10:00:00",
        "cc_status": "confirmed",
        "ctrl": "p-meier",
        "ctrl_ts": "2026-03-10 11:00:00",
        "ctrl_status": "approved",
        "details": [
            {"field": "role-data-eng (BUD) hours", "old": "40", "new": "60",
             "delta": "+20 hrs/mo", "type": "role-data-eng", "month": "2026-04"},
        ],
    },
]


def generate() -> str:
    parts: list[str] = []
    parts.append("-- =============================================================================")
    parts.append("-- s15_change_requests — Change Requests, line details, submission snapshots")
    parts.append("-- =============================================================================")

    # --- change_requests --------------------------------------------------
    cr_rows: list[str] = []
    for cr in CHANGE_REQUESTS:
        cc_comments = cr.get("cc_comments")
        ctrl_comments = cr.get("ctrl_comments")
        ctrl_feedback = cr.get("ctrl_feedback")
        cr_rows.append(
            f"({cr['id']}, {sql_str(cr['proj'])}, {sql_str(cr['by'])}, "
            f"{sql_str(cr['ts'])}, {sql_str(cr['status'])}, {sql_str(cr['cat'])}, "
            f"{sql_str(cr['summary'])}, {sql_str(cr.get('justification'))}, 0, "
            f"{sql_str(cr.get('cc_owner'))}, {sql_str(cr.get('cc_ts'))}, "
            f"{sql_str(cr.get('cc_status'))}, {sql_str(cc_comments)}, "
            f"{sql_str(cr.get('ctrl'))}, {sql_str(cr.get('ctrl_ts'))}, "
            f"{sql_str(cr.get('ctrl_status'))}, {sql_str(ctrl_comments)}, "
            f"{sql_str(ctrl_feedback)}, "
            f"{sql_str(cr['ts'])})"
        )

    cols_cr = (
        "(id, project_id, submitted_by_id, submission_timestamp, status, change_category, "
        "summary, justification, is_system_suggested, "
        "cc_owner_id, cc_confirmation_timestamp, cc_status, cc_comments, "
        "controller_id, controller_approval_timestamp, controller_status, controller_comments, "
        "controller_feedback, "
        "created_at)"
    )
    parts.append(f"\n-- Change Requests ({len(cr_rows)} rows)")
    parts.append(f"INSERT INTO change_requests {cols_cr} VALUES\n" + ",\n".join(cr_rows) + ";")

    # --- cr_change_details ------------------------------------------------
    detail_rows: list[str] = []
    detail_id = 0
    for cr in CHANGE_REQUESTS:
        for d in cr.get("details", []):
            detail_id += 1
            detail_rows.append(
                f"({detail_id}, {cr['id']}, {sql_str(d['field'])}, "
                f"{sql_str(d.get('old'))}, {sql_str(d.get('new'))}, "
                f"{sql_str(d.get('delta'))}, {sql_str(d.get('type'))}, "
                f"{sql_str(d.get('month'))})"
            )

    cols_d = (
        "(id, change_request_id, field_changed, old_value, new_value, delta, line_item_type, month)"
    )
    parts.append(f"\n-- CR Change Details ({len(detail_rows)} rows)")
    parts.append(f"INSERT INTO cr_change_details {cols_d} VALUES\n" + ",\n".join(detail_rows) + ";")

    # --- cr_submission_snapshots ------------------------------------------
    snapshot_rows: list[str] = []
    snap_id = 0
    for cr in CHANGE_REQUESTS:
        for snap in cr.get("snapshots", []):
            snap_id += 1
            snapshot_rows.append(
                f"({snap_id}, {cr['id']}, {sql_str(snap['type'])}, "
                f"{sql_str(snap['by'])}, {sql_str(json.dumps(snap['data']))}, "
                f"{sql_str(snap.get('comments'))}, {sql_str(cr['ts'])}, 1)"
            )

    if snapshot_rows:
        cols_s = (
            "(id, change_request_id, snapshot_type, created_by_id, "
            "forecast_data_json, comments, created_at, is_active)"
        )
        parts.append(f"\n-- CR Submission Snapshots ({len(snapshot_rows)} rows)")
        parts.append(
            f"INSERT INTO cr_submission_snapshots {cols_s} VALUES\n"
            + ",\n".join(snapshot_rows) + ";"
        )

    # ----------------------------------------------------------------------
    # v5.2 W1 [C] — CR-triggered re-confirmation ResourceRequest rows.
    #
    # Per Capacity Module Redesign Spec §1 acceptance criteria, ≥1 project
    # must have a pending CR-triggered re-confirmation showing
    # ``change_direction`` indicators on affected months (§9.8 + §12.5).
    #
    # When a Change Request that affects future allocation hours hits the CC
    # Owner queue, the system writes ResourceRequest rows referencing the CR
    # via ``change_request_id`` plus:
    #   - ``original_hours_per_month``: the pre-CR baseline value
    #   - ``hours_or_amount_per_month``: the post-CR proposed value
    #   - ``change_direction``: 'increase' (post > pre) or 'decrease' (post < pre)
    # The assignment panel renders the diff (e.g. ``80h → 120h (+40h)``) and
    # the timeline marks affected months with the change_direction badge.
    #
    # Two re-confirmations are seeded:
    #   * RR 120 — CR #9 (proj-erp2 CR-A): role-sr-dev MUC, 100h → 120h/mo.
    #   * RR 121 — CR #15 (proj-sensor CR-B): ext-cloud, 0 → 5000 EUR/mo.
    # ----------------------------------------------------------------------
    parts.append(
        "\n-- v5.2 W1 [C]: CR-triggered re-confirmation requests with change_direction"
    )
    parts.append(
        "INSERT INTO resource_requests (id, project_id, cost_center_id, "
        "request_type, role_type_id, cost_type_id, hours_or_amount_per_month, "
        "period_start, period_end, priority, status, assigned_person_id, "
        "adjusted_value, explanation, change_request_id, "
        "original_hours_per_month, change_direction, "
        "created_at, modified_at) VALUES\n"
        "(120, 'proj-erp2', 'cc-muc-apd', 'resource', 'role-sr-dev', NULL, "
        "120, '2026-04', '2026-06', 'high', 'pending', NULL, NULL, NULL, "
        "9, 100, 'increase', "
        "'2026-03-05 09:00:00', '2026-03-05 09:00:00'),\n"
        "(121, 'proj-sensor', 'cc-muc-apd', 'external_cost', NULL, "
        "'ext-cloud', 5000, '2026-04', '2027-12', 'high', 'pending', NULL, "
        "NULL, NULL, 15, 0, 'increase', "
        "'2026-03-08 09:30:00', '2026-03-08 09:30:00');"
    )

    return "\n".join(parts)
