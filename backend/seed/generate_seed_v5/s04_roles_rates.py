"""Stage 4 — role_types + rate_table.

S6 location-aware rates: the rate table is emitted at (role, workforce-location)
granularity — one row per (role, location) for each of two effective periods
(2025-01-01 previous, 2026-01-01 current). ``competence_center_id`` stays the
role's primary CC (unchanged). ``resolve_hourly_rate`` prefers an exact-location
row, then loc-muc, then any location for the role, so the runtime engine prices
each internal line at its own workforce-location rate (Munich/Budapest/Pune).
"""
from __future__ import annotations

from _utils import sql_str
from generate_seed_v5.config.branding import CREATED_AT
from generate_seed_v5.config.master import (
    ROLE_TYPES,
    WORKFORCE_LOCATIONS,
    get_rate,
)


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
    lines.append("-- s04_roles_rates / 2. Rate Table (per role x workforce location)")
    lines.append("-- Two real effective periods per (role, location): previous 2025-01-01")
    lines.append("-- (= 95% of current), current 2026-01-01. competence_center_id = role's")
    lines.append("-- primary CC. Locations a role is not staffed at (get_rate None) are skipped.")
    lines.append("-- =============================================================================")
    lines.append("")
    lines.append(
        "INSERT INTO rate_table (role_type_id, competence_center_id, location_id, "
        "hourly_rate, effective_date, previous_rate, previous_effective_date, created_at) VALUES"
    )
    rows: list[str] = []
    for rt in ROLE_TYPES:
        for loc in WORKFORCE_LOCATIONS:
            loc_id = loc["id"]
            rate = get_rate(rt["id"], loc_id)
            if rate is None:
                continue  # role not staffed at this location
            prev_rate = round(rate * 0.95, 2)
            # Current period (effective 2026-01-01), carrying the prior rate in the
            # previous_* columns as the in-row history pointer.
            rows.append(
                f"({sql_str(rt['id'])}, {sql_str(rt['cc'])}, {sql_str(loc_id)}, "
                f"{rate:.2f}, '2026-01-01', {prev_rate:.2f}, '2025-01-01', '{CREATED_AT}')"
            )
            # Previous period as a REAL row (effective 2025-01-01) so a month before
            # 2026-01 resolves to a real rate, not the DEFAULT_HOURLY_RATE fallback.
            rows.append(
                f"({sql_str(rt['id'])}, {sql_str(rt['cc'])}, {sql_str(loc_id)}, "
                f"{prev_rate:.2f}, '2025-01-01', NULL, NULL, '{CREATED_AT}')"
            )
    lines.append(",\n".join(rows) + ";")

    return "\n".join(lines)
