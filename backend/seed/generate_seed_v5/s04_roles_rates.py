"""Stage 4 — role_types + rate_table.

Rates are stored at competence-centre granularity (using MUC rates as the
primary). The seed generator carries per-location rates separately for
financial calculations; this DB-level rate table is what runtime services
read.
"""
from __future__ import annotations

from _utils import sql_str
from generate_seed_v5.config.branding import CREATED_AT
from generate_seed_v5.config.master import RATES, ROLE_TYPES


def generate() -> str:
    lines: list[str] = []

    # --- Role Types ---------------------------------------------------------
    lines.append("-- =============================================================================")
    lines.append("-- s04_roles_rates / 1. Role Types (12)")
    lines.append("-- =============================================================================")
    lines.append("")
    lines.append("INSERT INTO role_types (id, name, created_at) VALUES")
    rows = [
        f"({sql_str(rt['id'])}, {sql_str(rt['name'])}, '{CREATED_AT}')"
        for rt in ROLE_TYPES
    ]
    lines.append(",\n".join(rows) + ";")
    lines.append("")

    # --- Rate Table --------------------------------------------------------
    lines.append("-- =============================================================================")
    lines.append("-- s04_roles_rates / 2. Rate Table (per competence centre, MUC primary)")
    lines.append("-- Previous rate ≈ 5% lower (effective 2025-01-01); current effective 2026-01-01.")
    lines.append("-- =============================================================================")
    lines.append("")
    lines.append(
        "INSERT INTO rate_table (role_type_id, competence_center_id, hourly_rate, effective_date, previous_rate, previous_effective_date, created_at) VALUES"
    )
    rows: list[str] = []
    for rt in ROLE_TYPES:
        muc_rate = RATES[rt["id"]][0]
        if muc_rate is None:
            continue  # Role unavailable at MUC; skip rate seeding (rare).
        prev_rate = round(muc_rate * 0.95, 2)
        rows.append(
            f"({sql_str(rt['id'])}, {sql_str(rt['cc'])}, {muc_rate:.2f}, "
            f"'2026-01-01', {prev_rate:.2f}, '2025-01-01', '{CREATED_AT}')"
        )
    lines.append(",\n".join(rows) + ";")

    return "\n".join(lines)
