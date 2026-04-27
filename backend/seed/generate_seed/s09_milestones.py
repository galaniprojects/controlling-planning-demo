"""
Generate project milestones for 7 projects (4 full, 3 partial).

Maps the legacy phase names to the new milestone_types catalogue from
s08b_milestone_types.py wherever the names overlap. When no clean match
exists, ``milestone_type_id`` is left NULL — the per-milestone ``color``
override still surfaces a colour in the UI.
"""
from .config import PROJECT_MILESTONES, sql_str


# Map legacy phase names (case-insensitive substring match) to the default
# milestone_type ids defined in s08b_milestone_types.py. Order matters:
# more specific labels first.
_NAME_TO_TYPE_ID = [
    ("requirements",   "mt-requirements"),
    ("discovery",      "mt-requirements"),
    ("assessment",     "mt-requirements"),
    ("planning",       "mt-planning"),
    ("concept",        "mt-planning"),
    ("design",         "mt-planning"),
    ("architecture",   "mt-planning"),
    ("engineering",    "mt-development"),
    ("development",    "mt-development"),
    ("build",          "mt-development"),
    ("implementation", "mt-development"),
    ("integration",    "mt-development"),
    ("migration",      "mt-data-migration"),
    ("test",           "mt-testing"),
    ("validation",     "mt-testing"),
    ("commissioning",  "mt-testing"),
    ("rollout",        "mt-rollout"),
    ("launch",         "mt-rollout"),
    ("go-live",        "mt-rollout"),
    ("deployment",     "mt-rollout"),
]


def _type_for(name: str) -> str | None:
    lower = name.lower()
    for needle, type_id in _NAME_TO_TYPE_ID:
        if needle in lower:
            return type_id
    return None


def generate() -> str:
    parts = []
    parts.append("-- =============================================================================")
    parts.append("-- Project Milestones [A-MS-01]")
    parts.append("-- =============================================================================")

    rows = []
    for proj_id, milestones in PROJECT_MILESTONES.items():
        for m in milestones:
            type_id = _type_for(m["name"])
            # baseline_locked_at: fixed timestamp mirroring runtime behaviour
            # where the lock is set on first save.
            rows.append(
                f"({sql_str(proj_id)}, {m['n']}, {sql_str(m['name'])}, "
                f"{sql_str(type_id)}, "
                f"{sql_str(m['bs'])}, {sql_str(m['be'])}, "
                f"{sql_str(m['fs'])}, {sql_str(m['fe'])}, "
                f"{sql_str(m['color'])}, "
                f"'2024-01-01 00:00:00')"
            )

    cols = (
        "(project_id, sequence_number, name, milestone_type_id, "
        "baseline_start, baseline_end, forecast_start, forecast_end, "
        "color, baseline_locked_at)"
    )
    parts.append(f"\nINSERT INTO project_milestones {cols} VALUES\n" + ",\n".join(rows) + ";")

    return "\n".join(parts)
