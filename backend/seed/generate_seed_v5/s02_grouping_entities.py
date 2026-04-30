"""Stage 2 — grouping_entities + grouping_hierarchies + grouping_hierarchy_levels.

Two-pass emission per the plan's "circular FK handling" note:
- Pass 1: insert LoB-root rows (parent_entity_id = NULL).
- Pass 2: insert tier-2 program rows (parent_entity_id → LoB id).

The 4 LoB roots match the workshop spec: TBS / RVS / CIT / DND. The tier-2
programmes reference the same IDs Phase 2 teams will read from
``config/master.py``.
"""
from __future__ import annotations

from _utils import sql_str
from generate_seed_v5.config.branding import CREATED_AT
from generate_seed_v5.config.master import LOBS, PROGRAMMES


def generate() -> str:
    lines: list[str] = []

    # --- Grouping Entities (LoB roots first, then program children) ---------
    lines.append("-- =============================================================================")
    lines.append("-- s02_grouping_entities / 1. Grouping Entities — LoB roots (pass 1)")
    lines.append("-- =============================================================================")
    lines.append("")
    lines.append(
        "INSERT INTO grouping_entities (id, entity_type_id, name, parent_entity_id, is_active, created_at) VALUES"
    )
    rows = [
        f"({sql_str(lob['id'])}, 'get-lob', {sql_str(lob['name'])}, NULL, 1, '{CREATED_AT}')"
        for lob in LOBS
    ]
    lines.append(",\n".join(rows) + ";")
    lines.append("")

    lines.append("-- =============================================================================")
    lines.append("-- s02_grouping_entities / 2. Grouping Entities — Programs (pass 2)")
    lines.append("-- =============================================================================")
    lines.append("")
    lines.append(
        "INSERT INTO grouping_entities (id, entity_type_id, name, parent_entity_id, is_active, created_at) VALUES"
    )
    rows = [
        (
            f"({sql_str(prog['id'])}, 'get-prog', {sql_str(prog['name'])}, "
            f"{sql_str(prog['lob_id'])}, 1, '{CREATED_AT}')"
        )
        for prog in PROGRAMMES
    ]
    lines.append(",\n".join(rows) + ";")
    lines.append("")

    # --- Grouping Hierarchy & Levels ----------------------------------------
    lines.append("-- =============================================================================")
    lines.append("-- s02_grouping_entities / 3. Standard hierarchy (LoB → Program)")
    lines.append("-- =============================================================================")
    lines.append("")
    lines.append(
        f"INSERT INTO grouping_hierarchies (id, name, is_active_hierarchy, created_at) VALUES"
    )
    lines.append(
        f"('hier-standard', 'Standard Portfolio Hierarchy', 1, '{CREATED_AT}');"
    )
    lines.append("")
    lines.append(
        "INSERT INTO grouping_hierarchy_levels (hierarchy_id, level_order, entity_type_id) VALUES"
    )
    lines.append("('hier-standard', 0, 'get-lob'),")
    lines.append("('hier-standard', 1, 'get-prog');")

    return "\n".join(lines)
