"""
Generate change requests and CR change details.
"""
from .config import CHANGE_REQUESTS, sql_str


def generate() -> str:
    parts = []
    parts.append("-- =============================================================================")
    parts.append("-- Change Requests & CR Change Details")
    parts.append("-- =============================================================================")

    # --- Change Requests ---
    cr_rows = []
    for cr in CHANGE_REQUESTS:
        cc_comments = cr.get("cc_comments")
        ctrl_comments = cr.get("ctrl_comments")
        cr_rows.append(
            f"({cr['id']}, {sql_str(cr['proj'])}, {sql_str(cr['by'])}, "
            f"{sql_str(cr['ts'])}, {sql_str(cr['status'])}, {sql_str(cr['cat'])}, "
            f"{sql_str(cr['summary'])}, {sql_str(cr.get('justification'))}, 0, "
            f"{sql_str(cr.get('cc_owner'))}, {sql_str(cr.get('cc_ts'))}, "
            f"{sql_str(cr.get('cc_status'))}, {sql_str(cc_comments)}, "
            f"{sql_str(cr.get('ctrl'))}, {sql_str(cr.get('ctrl_ts'))}, "
            f"{sql_str(cr.get('ctrl_status'))}, {sql_str(ctrl_comments)}, "
            f"{sql_str(cr['ts'])})"
        )

    parts.append(f"\n-- Change Requests ({len(cr_rows)} rows)")
    cols = ("(id, project_id, submitted_by_id, submission_timestamp, status, change_category, "
            "summary, justification, is_system_suggested, "
            "cc_owner_id, cc_confirmation_timestamp, cc_status, cc_comments, "
            "controller_id, controller_approval_timestamp, controller_status, controller_comments, "
            "created_at)")
    parts.append(f"INSERT INTO change_requests {cols} VALUES\n" + ",\n".join(cr_rows) + ";")

    # --- CR Change Details ---
    detail_rows = []
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

    parts.append(f"\n-- CR Change Details ({len(detail_rows)} rows)")
    detail_cols = "(id, change_request_id, field_changed, old_value, new_value, delta, line_item_type, month)"
    parts.append(f"INSERT INTO cr_change_details {detail_cols} VALUES\n" + ",\n".join(detail_rows) + ";")

    return "\n".join(parts)
