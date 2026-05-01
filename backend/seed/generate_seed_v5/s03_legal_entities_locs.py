"""Stage 3 — Cluster F master data.

Tables:
- ``regions``         3 rows (EMEA / Americas / APAC).
- ``countries``       28 rows.
- ``charging_locations`` 90 rows per [F-MD-01].
- ``legal_entities``  120 rows per [F-MD-01..02].
- ``role_permission_grants`` 4 rows per [F-AC-01].

All FKs land within this stage (countries → regions, charging_locations →
countries / regions, legal_entities → charging_locations / countries).
"""
from __future__ import annotations

from _utils import sql_str
from generate_seed_v5.config.branding import CREATED_AT
from generate_seed_v5.config.legal import (
    CHARGING_LOCATIONS,
    COUNTRIES,
    LEGAL_ENTITIES,
    REGIONS,
)
from generate_seed_v5.config.people import ROLE_PERMISSION_GRANTS


def generate() -> str:
    lines: list[str] = []

    # --- Regions ------------------------------------------------------------
    lines.append("-- =============================================================================")
    lines.append("-- s03_legal_entities_locs / 1. Regions [F-MD-02]")
    lines.append("-- =============================================================================")
    lines.append("")
    lines.append("INSERT INTO regions (id, code, name, is_active, created_at, modified_at) VALUES")
    rows = [
        f"({sql_str(r['id'])}, {sql_str(r['code'])}, {sql_str(r['name'])}, 1, '{CREATED_AT}', '{CREATED_AT}')"
        for r in REGIONS
    ]
    lines.append(",\n".join(rows) + ";")
    lines.append("")

    # --- Countries ----------------------------------------------------------
    lines.append("-- =============================================================================")
    lines.append("-- s03_legal_entities_locs / 2. Countries [F-MD-02]")
    lines.append("-- =============================================================================")
    lines.append("")
    lines.append(
        "INSERT INTO countries (id, iso_code, name, is_active, created_at, modified_at) VALUES"
    )
    rows = [
        f"({sql_str(c['id'])}, {sql_str(c['iso_code'])}, {sql_str(c['name'])}, 1, '{CREATED_AT}', '{CREATED_AT}')"
        for c in COUNTRIES
    ]
    lines.append(",\n".join(rows) + ";")
    lines.append("")

    # --- Charging Locations -------------------------------------------------
    lines.append("-- =============================================================================")
    lines.append("-- s03_legal_entities_locs / 3. Charging Locations (90) [F-MD-01]")
    lines.append("-- Naming pattern: <FictionalDivision> <CountryName> <City>.")
    lines.append("-- =============================================================================")
    lines.append("")
    lines.append(
        "INSERT INTO charging_locations (id, code, name, division, region_id, country_id, is_active, created_at, modified_at) VALUES"
    )
    rows = []
    for cl in CHARGING_LOCATIONS:
        full_name = f"{cl['division']} {cl['country_name']} {cl['city']}"
        rows.append(
            f"({sql_str(cl['id'])}, {sql_str(cl['code'])}, {sql_str(full_name)}, "
            f"{sql_str(cl['division'])}, {sql_str(cl['region_id'])}, "
            f"{sql_str(cl['country_id'])}, 1, '{CREATED_AT}', '{CREATED_AT}')"
        )
    lines.append(",\n".join(rows) + ";")
    lines.append("")

    # --- Legal Entities -----------------------------------------------------
    lines.append("-- =============================================================================")
    lines.append("-- s03_legal_entities_locs / 4. Legal Entities (120) [F-MD-01..02]")
    lines.append("-- =============================================================================")
    lines.append("")
    lines.append(
        "INSERT INTO legal_entities (id, code, name, charging_location_id, country_id, is_active, created_at, modified_at) VALUES"
    )
    rows = [
        (
            f"({sql_str(le['id'])}, {sql_str(le['code'])}, {sql_str(le['name'])}, "
            f"{sql_str(le['charging_location_id'])}, {sql_str(le['country_id'])}, 1, "
            f"'{CREATED_AT}', '{CREATED_AT}')"
        )
        for le in LEGAL_ENTITIES
    ]
    lines.append(",\n".join(rows) + ";")
    lines.append("")

    # --- Role Permission Grants --------------------------------------------
    lines.append("-- =============================================================================")
    lines.append("-- s03_legal_entities_locs / 5. Role Permission Grants [F-AC-01]")
    lines.append("-- Controllers get explicit edit grants on Cluster F master data + BTC/distribution.")
    lines.append("-- =============================================================================")
    lines.append("")
    lines.append(
        "INSERT INTO role_permission_grants (role, entity_type, can_edit, notes, created_at, modified_at) VALUES"
    )
    rows = [
        (
            f"({sql_str(g['role'])}, {sql_str(g['entity_type'])}, "
            f"{1 if g['can_edit'] else 0}, {sql_str(g['notes'])}, "
            f"'{CREATED_AT}', '{CREATED_AT}')"
        )
        for g in ROLE_PERMISSION_GRANTS
    ]
    lines.append(",\n".join(rows) + ";")

    return "\n".join(lines)
