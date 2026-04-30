"""Stage 7 — project_grouping_assignments.

Per the configurable-hierarchy model, every Project gets one
``ProjectGroupingAssignment`` linking ``project_id`` → ``grouping_entity_id``.
The grouping entity is whichever node the project's ``hierarchy_id`` points
at in ``config/entities.py`` (LoB or program-level, depending on whether the
project sits under a programme).

Offerings and InternalServices participate in the hierarchy via
``ChargeableEntity.hierarchy_node_id`` only — no separate assignment row
because they're not v4 ``Project`` entities.
"""
from __future__ import annotations

from _utils import sql_str
from generate_seed_v5.config.entities import PROJECTS


def generate() -> str:
    lines: list[str] = []

    lines.append("-- =============================================================================")
    lines.append("-- s07_assignments / Project Grouping Assignments")
    lines.append("-- One row per project, FK → grouping_entities.id (LoB or program tier).")
    lines.append("-- =============================================================================")
    lines.append("")
    lines.append(
        "INSERT INTO project_grouping_assignments (project_id, grouping_entity_id) VALUES"
    )
    rows = [
        f"({sql_str(p['id'])}, {sql_str(p['hierarchy_id'])})"
        for p in PROJECTS
    ]
    lines.append(",\n".join(rows) + ";")

    return "\n".join(lines)
