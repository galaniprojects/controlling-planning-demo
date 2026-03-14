"""Generate people and demo personas."""

from .config import PEOPLE, DEMO_PERSONAS, CREATED_AT, sql_str


def generate() -> str:
    lines = []

    # --- People ---
    lines.append("-- =============================================================================")
    lines.append("-- 8. People (50)")
    lines.append("-- =============================================================================")
    lines.append("")

    # Group by cost centre for readability
    by_cc: dict[str, list] = {}
    for p in PEOPLE:
        cc = p["cc"] or "portfolio"
        by_cc.setdefault(cc, []).append(p)

    for cc_id, people in by_cc.items():
        lines.append(f"-- {cc_id}")
        lines.append("INSERT INTO people (id, name, role_type_id, cost_center_id, is_active, created_at, modified_at) VALUES")
        rows = []
        for p in people:
            rows.append(
                f"({sql_str(p['id'])}, {sql_str(p['name'])}, {sql_str(p['role'])}, "
                f"{sql_str(p['cc'])}, 1, '{CREATED_AT}', '{CREATED_AT}')"
            )
        lines.append(",\n".join(rows) + ";")
        lines.append("")

    # --- Demo Personas ---
    lines.append("-- =============================================================================")
    lines.append("-- 9. Demo Personas")
    lines.append("-- =============================================================================")
    lines.append("")
    lines.append("INSERT INTO demo_personas (id, person_id, role, display_name, title, default_module, managed_cost_center_id, owned_project_ids_json) VALUES")
    rows = []
    for dp in DEMO_PERSONAS:
        rows.append(
            f"({sql_str(dp['id'])}, {sql_str(dp['person_id'])}, {sql_str(dp['role'])}, "
            f"{sql_str(dp['display_name'])}, {sql_str(dp['title'])}, {sql_str(dp['default_module'])}, "
            f"{sql_str(dp['managed_cc'])}, {sql_str(dp['owned_projects'])})"
        )
    lines.append(",\n".join(rows) + ";")

    return "\n".join(lines)
