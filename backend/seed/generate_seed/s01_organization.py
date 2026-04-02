"""Generate organizational structure: grouping entities/hierarchy, locations, competence centres, cost centres, external cost types."""

from .config import LOBS, PROGRAMMES, LOCATIONS, COMPETENCE_CENTRES, COST_CENTRES, EXTERNAL_COST_TYPES, CREATED_AT, sql_str


def generate() -> str:
    lines = []

    # --- Grouping Entity Types ---
    lines.append("-- =============================================================================")
    lines.append("-- 1. Grouping Entity Types (portfolio hierarchy levels)")
    lines.append("-- =============================================================================")
    lines.append("")
    lines.append("INSERT INTO grouping_entity_types (id, name, is_active, created_at) VALUES")
    lines.append(f"('get-lob', 'Business Unit', 1, '{CREATED_AT}'),")
    lines.append(f"('get-prog', 'Initiative', 1, '{CREATED_AT}');")
    lines.append("")

    # --- Grouping Entities (Business Unit + Initiative) ---
    lines.append("-- =============================================================================")
    lines.append("-- 1b. Grouping Entities (Business Unit + Initiative entities)")
    lines.append("-- =============================================================================")
    lines.append("")
    lines.append("INSERT INTO grouping_entities (id, entity_type_id, name, parent_entity_id, is_active, created_at) VALUES")
    rows = []
    # LoB entities
    for lob in LOBS:
        rows.append(f"({sql_str(lob['id'])}, 'get-lob', {sql_str(lob['name'])}, NULL, 1, '{CREATED_AT}')")
    # Program entities (with parent_entity_id pointing to their LoB)
    for prog in PROGRAMMES:
        rows.append(f"({sql_str(prog['id'])}, 'get-prog', {sql_str(prog['name'])}, {sql_str(prog['lob_id'])}, 1, '{CREATED_AT}')")
    lines.append(",\n".join(rows) + ";")
    lines.append("")

    # --- Grouping Hierarchy ---
    lines.append("-- =============================================================================")
    lines.append("-- 1c. Grouping Hierarchy (Standard: Business Unit -> Initiative)")
    lines.append("-- =============================================================================")
    lines.append("")
    lines.append(f"INSERT INTO grouping_hierarchies (id, name, is_active_hierarchy, created_at) VALUES")
    lines.append(f"('hier-standard', 'Standard Portfolio Hierarchy', 1, '{CREATED_AT}');")
    lines.append("")
    lines.append("INSERT INTO grouping_hierarchy_levels (hierarchy_id, level_order, entity_type_id) VALUES")
    lines.append("('hier-standard', 0, 'get-lob'),")
    lines.append("('hier-standard', 1, 'get-prog');")
    lines.append("")

    # --- Locations ---
    lines.append("-- =============================================================================")
    lines.append("-- 2. Locations")
    lines.append("-- =============================================================================")
    lines.append("")
    lines.append("INSERT INTO locations (id, city, country, is_active, created_at, modified_at) VALUES")
    rows = []
    for loc in LOCATIONS:
        rows.append(f"({sql_str(loc['id'])}, {sql_str(loc['city'])}, {sql_str(loc['country'])}, 1, '{CREATED_AT}', '{CREATED_AT}')")
    lines.append(",\n".join(rows) + ";")
    lines.append("")

    # --- Competence Centres ---
    lines.append("-- =============================================================================")
    lines.append("-- 3. Competence Centres")
    lines.append("-- =============================================================================")
    lines.append("")
    lines.append("INSERT INTO competence_centers (id, name, is_active, created_at, modified_at) VALUES")
    rows = []
    for cc in COMPETENCE_CENTRES:
        rows.append(f"({sql_str(cc['id'])}, {sql_str(cc['name'])}, 1, '{CREATED_AT}', '{CREATED_AT}')")
    lines.append(",\n".join(rows) + ";")
    lines.append("")

    # --- Cost Centres ---
    lines.append("-- =============================================================================")
    lines.append("-- 4. Cost Centres")
    lines.append("-- =============================================================================")
    lines.append("")
    lines.append("INSERT INTO cost_centers (id, name, location_id, competence_center_id, is_active, created_at, modified_at) VALUES")
    rows = []
    for c in COST_CENTRES:
        rows.append(f"({sql_str(c['id'])}, {sql_str(c['name'])}, {sql_str(c['location_id'])}, {sql_str(c['cc_id'])}, 1, '{CREATED_AT}', '{CREATED_AT}')")
    lines.append(",\n".join(rows) + ";")
    lines.append("")

    # --- External Cost Types ---
    lines.append("-- =============================================================================")
    lines.append("-- 5. External Cost Types")
    lines.append("-- =============================================================================")
    lines.append("")
    lines.append("INSERT INTO external_cost_types (id, name, created_at) VALUES")
    rows = []
    for ect in EXTERNAL_COST_TYPES:
        rows.append(f"({sql_str(ect['id'])}, {sql_str(ect['name'])}, '{CREATED_AT}')")
    lines.append(",\n".join(rows) + ";")

    return "\n".join(lines)
