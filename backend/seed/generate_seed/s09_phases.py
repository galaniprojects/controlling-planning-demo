"""
Generate project phases for 7 projects (4 full, 3 partial).
"""
from .config import PROJECT_PHASES, sql_str


def generate() -> str:
    parts = []
    parts.append("-- =============================================================================")
    parts.append("-- Project Phases")
    parts.append("-- =============================================================================")

    rows = []
    for proj_id, phases in PROJECT_PHASES.items():
        for p in phases:
            rows.append(
                f"({sql_str(proj_id)}, {p['n']}, {sql_str(p['name'])}, "
                f"{sql_str(p['bs'])}, {sql_str(p['be'])}, "
                f"{sql_str(p['fs'])}, {sql_str(p['fe'])}, {sql_str(p['color'])})"
            )

    cols = "(project_id, phase_number, name, baseline_start, baseline_end, forecast_start, forecast_end, color)"
    parts.append(f"\nINSERT INTO project_phases {cols} VALUES\n" + ",\n".join(rows) + ";")

    return "\n".join(parts)
