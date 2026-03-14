"""Generate role types and rate table entries."""

from .config import ROLE_TYPES, RATES, COST_CENTRES, CREATED_AT, sql_str


def _cc_location(cost_centre_id: str) -> str:
    """Extract location from cost centre ID: cc-muc-apd -> loc-muc."""
    parts = cost_centre_id.split("-")
    return f"loc-{parts[1]}"


def generate() -> str:
    lines = []

    # --- Role Types ---
    lines.append("-- =============================================================================")
    lines.append("-- 6. Role Types")
    lines.append("-- =============================================================================")
    lines.append("")
    lines.append("INSERT INTO role_types (id, name, created_at) VALUES")
    rows = []
    for rt in ROLE_TYPES:
        rows.append(f"({sql_str(rt['id'])}, {sql_str(rt['name'])}, '{CREATED_AT}')")
    lines.append(",\n".join(rows) + ";")
    lines.append("")

    # --- Rate Table ---
    # One entry per (role_type, competence_center) — using MUC rates as the primary.
    # The generator uses per-location rates from config.py for financial calculations,
    # but the DB rate_table stores CC-level rates for runtime operations.
    lines.append("-- =============================================================================")
    lines.append("-- 7. Rate Table")
    lines.append("-- Per competence centre rates (MUC rates as primary).")
    lines.append("-- Per-location rate differentials handled by the seed generator.")
    lines.append("-- =============================================================================")
    lines.append("")
    lines.append("INSERT INTO rate_table (role_type_id, competence_center_id, hourly_rate, effective_date, previous_rate, previous_effective_date, created_at) VALUES")

    rows = []
    for rt in ROLE_TYPES:
        rid = rt["id"]
        cc_id = rt["cc"]  # competence centre this role belongs to
        muc_bud_pun = RATES[rid]
        muc_rate = muc_bud_pun[0]
        if muc_rate is None:
            continue
        # Previous rate: ~5% lower, effective from 2025-01-01
        prev_rate = round(muc_rate * 0.95, 2)
        rows.append(
            f"({sql_str(rid)}, {sql_str(cc_id)}, {muc_rate:.2f}, '2026-01-01', {prev_rate:.2f}, '2025-01-01', '{CREATED_AT}')"
        )
    lines.append(",\n".join(rows) + ";")

    return "\n".join(lines)
