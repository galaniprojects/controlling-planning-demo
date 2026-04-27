"""
Generate the global milestone-type catalogue per [A-BK-34].

Ten default types provided by the spec. Colours align with the existing
project-phase palette so timelines look consistent before per-milestone
overrides are applied.
"""
from .config import sql_str


MILESTONE_TYPES = [
    {"id": "mt-planning",      "name": "Planning",                       "color": "blue",    "ordering": 1},
    {"id": "mt-requirements",  "name": "Requirements & Analysis",        "color": "teal",    "ordering": 2},
    {"id": "mt-development",   "name": "Development",                    "color": "emerald", "ordering": 3},
    {"id": "mt-testing",       "name": "Testing/QA",                     "color": "amber",   "ordering": 4},
    {"id": "mt-uat",           "name": "UAT",                            "color": "violet",  "ordering": 5},
    {"id": "mt-pilot",         "name": "Pilot",                          "color": "indigo",  "ordering": 6},
    {"id": "mt-rollout",       "name": "Rollout",                        "color": "sky",     "ordering": 7},
    {"id": "mt-data-migration","name": "Data Migration",                 "color": "cyan",    "ordering": 8},
    {"id": "mt-training",      "name": "Training/Change Management",     "color": "rose",    "ordering": 9},
    {"id": "mt-hypermaint",    "name": "Hyper-maintenance",              "color": "slate",   "ordering": 10},
]


def generate() -> str:
    parts = []
    parts.append("-- =============================================================================")
    parts.append("-- Milestone Types [A-BK-34]")
    parts.append("-- =============================================================================")

    rows = []
    for mt in MILESTONE_TYPES:
        rows.append(
            f"({sql_str(mt['id'])}, {sql_str(mt['name'])}, "
            f"{sql_str(mt['color'])}, {mt['ordering']}, 1, "
            f"'2026-01-15 10:00:00')"
        )

    cols = "(id, name, default_color, suggested_ordering, is_active, created_at)"
    parts.append(f"\nINSERT INTO milestone_types {cols} VALUES\n" + ",\n".join(rows) + ";")

    return "\n".join(parts)
