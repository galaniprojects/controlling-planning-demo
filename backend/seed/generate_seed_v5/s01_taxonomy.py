"""Stage 1 — taxonomy: grouping entity types, locations, competence centres,
cost centres, external cost types, planning parameters, KPI definitions.

No FKs out (apart from FKs internal to this stage). All v5 column names
match ``models/organization.py``, ``models/system.py``.
"""
from __future__ import annotations

from _utils import sql_str
from generate_seed_v5.config.branding import CREATED_AT
from generate_seed_v5.config.master import (
    COMPETENCE_CENTRES,
    COST_CENTRES,
    EXTERNAL_COST_TYPES,
    KPI_DEFINITIONS,
    PLANNING_PARAMETERS,
    WORKFORCE_LOCATIONS,
)


def generate() -> str:
    lines: list[str] = []

    # --- Grouping Entity Types ---------------------------------------------
    lines.append("-- =============================================================================")
    lines.append("-- s01_taxonomy / 1. Grouping Entity Types (LoB, Program)")
    lines.append("-- =============================================================================")
    lines.append("")
    lines.append("INSERT INTO grouping_entity_types (id, name, is_active, created_at) VALUES")
    rows = [
        f"({sql_str('get-lob')}, 'Line of Business', 1, '{CREATED_AT}')",
        f"({sql_str('get-prog')}, 'Program', 1, '{CREATED_AT}')",
    ]
    lines.append(",\n".join(rows) + ";")
    lines.append("")

    # --- Workforce Locations -----------------------------------------------
    lines.append("-- =============================================================================")
    lines.append("-- s01_taxonomy / 2. Workforce Locations (Munich, Budapest, Pune)")
    lines.append("-- The new ChargingLocation master is seeded in s03 per [F-MD-01].")
    lines.append("-- =============================================================================")
    lines.append("")
    lines.append("INSERT INTO locations (id, city, country, is_active, created_at, modified_at) VALUES")
    rows = [
        f"({sql_str(loc['id'])}, {sql_str(loc['city'])}, {sql_str(loc['country'])}, 1, '{CREATED_AT}', '{CREATED_AT}')"
        for loc in WORKFORCE_LOCATIONS
    ]
    lines.append(",\n".join(rows) + ";")
    lines.append("")

    # --- Competence Centres ------------------------------------------------
    lines.append("-- =============================================================================")
    lines.append("-- s01_taxonomy / 3. Competence Centres (cost pools)")
    lines.append("-- =============================================================================")
    lines.append("")
    lines.append("INSERT INTO competence_centers (id, name, is_active, created_at, modified_at) VALUES")
    rows = [
        f"({sql_str(cc['id'])}, {sql_str(cc['name'])}, 1, '{CREATED_AT}', '{CREATED_AT}')"
        for cc in COMPETENCE_CENTRES
    ]
    lines.append(",\n".join(rows) + ";")
    lines.append("")

    # --- Cost Centres ------------------------------------------------------
    lines.append("-- =============================================================================")
    lines.append("-- s01_taxonomy / 4. Cost Centres (location × competence centre)")
    lines.append("-- =============================================================================")
    lines.append("")
    lines.append("INSERT INTO cost_centers (id, name, location_id, competence_center_id, is_active, created_at, modified_at) VALUES")
    rows = [
        f"({sql_str(c['id'])}, {sql_str(c['name'])}, {sql_str(c['location_id'])}, {sql_str(c['cc_id'])}, 1, '{CREATED_AT}', '{CREATED_AT}')"
        for c in COST_CENTRES
    ]
    lines.append(",\n".join(rows) + ";")
    lines.append("")

    # --- External Cost Types ------------------------------------------------
    lines.append("-- =============================================================================")
    lines.append("-- s01_taxonomy / 5. External Cost Types (admin-managed per [E-08e])")
    lines.append("-- =============================================================================")
    lines.append("")
    lines.append("INSERT INTO external_cost_types (id, name, created_at) VALUES")
    rows = [
        f"({sql_str(ect['id'])}, {sql_str(ect['name'])}, '{CREATED_AT}')"
        for ect in EXTERNAL_COST_TYPES
    ]
    lines.append(",\n".join(rows) + ";")
    lines.append("")

    # --- Planning Parameters ------------------------------------------------
    lines.append("-- =============================================================================")
    lines.append("-- s01_taxonomy / 6. Planning Parameters")
    lines.append("-- =============================================================================")
    lines.append("")
    lines.append("INSERT INTO planning_parameters (key, name, description, current_value, default_value, data_type, param_group, created_at, modified_at) VALUES")
    rows = [
        (
            f"({sql_str(p['key'])}, {sql_str(p['name'])}, {sql_str(p['description'])}, "
            f"{sql_str(p['current'])}, {sql_str(p['default'])}, {sql_str(p['type'])}, "
            f"{sql_str(p['group'])}, '{CREATED_AT}', '{CREATED_AT}')"
        )
        for p in PLANNING_PARAMETERS
    ]
    lines.append(",\n".join(rows) + ";")
    lines.append("")

    # --- KPI Definitions ----------------------------------------------------
    lines.append("-- =============================================================================")
    lines.append("-- s01_taxonomy / 7. KPI Definitions (built-in catalogue)")
    lines.append("-- =============================================================================")
    lines.append("")
    lines.append("INSERT INTO kpi_definitions (name, description, formula, display_format, target_value, is_built_in, is_active, created_at) VALUES")
    rows = [
        (
            f"({sql_str(k['name'])}, {sql_str(k['description'])}, {sql_str(k['formula'])}, "
            f"{sql_str(k['format'])}, {sql_str(k['target'])}, "
            f"{1 if k['is_built_in'] else 0}, {1 if k['is_active'] else 0}, '{CREATED_AT}')"
        )
        for k in KPI_DEFINITIONS
    ]
    lines.append(",\n".join(rows) + ";")

    return "\n".join(lines)
