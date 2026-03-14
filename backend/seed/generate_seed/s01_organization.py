"""Generate organizational structure: LoBs, locations, competence centres, cost centres, external cost types."""

from .config import LOBS, LOCATIONS, COMPETENCE_CENTRES, COST_CENTRES, EXTERNAL_COST_TYPES, CREATED_AT, sql_str


def generate() -> str:
    lines = []

    # --- Lines of Business ---
    lines.append("-- =============================================================================")
    lines.append("-- 1. Lines of Business")
    lines.append("-- =============================================================================")
    lines.append("")
    lines.append("INSERT INTO lines_of_business (id, name, description, is_active, created_at, modified_at) VALUES")
    rows = []
    for lob in LOBS:
        rows.append(f"({sql_str(lob['id'])}, {sql_str(lob['name'])}, {sql_str(lob['description'])}, 1, '{CREATED_AT}', '{CREATED_AT}')")
    lines.append(",\n".join(rows) + ";")
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
