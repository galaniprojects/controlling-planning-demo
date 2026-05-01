"""Stage 5 — people, demo_personas, users.

Per [F-DG-02]: the executive persona is renamed from ``p-becker-exec`` to
``p-weber`` (Dr. Klaus Weber). Owned-projects JSON for the PL persona is
generated from ``entities.PL_OWNED_PROJECT_IDS`` so the FK references stay
in sync with the entity roster.
"""
from __future__ import annotations

import json

from _utils import sql_str
from generate_seed_v5.config.branding import CREATED_AT
from generate_seed_v5.config.entities import PL_OWNED_PROJECT_IDS
from generate_seed_v5.config.people import DEMO_PERSONAS, PEOPLE, USERS


def _resolve_owned_projects(persona: dict) -> str | None:
    """Return JSON-encoded owned project list for the PL persona, else None."""
    val = persona.get("owned_projects")
    if val == "__from_entities__":
        return json.dumps(PL_OWNED_PROJECT_IDS)
    return val


def generate() -> str:
    lines: list[str] = []

    # --- People (sorted by id for determinism) ------------------------------
    lines.append("-- =============================================================================")
    lines.append("-- s05_people / 1. People")
    lines.append("-- =============================================================================")
    lines.append("")
    lines.append(
        "INSERT INTO people (id, name, role_type_id, cost_center_id, is_active, created_at, modified_at) VALUES"
    )
    sorted_people = sorted(PEOPLE, key=lambda p: p["id"])
    rows = [
        (
            f"({sql_str(p['id'])}, {sql_str(p['name'])}, {sql_str(p['role'])}, "
            f"{sql_str(p['cc'])}, 1, '{CREATED_AT}', '{CREATED_AT}')"
        )
        for p in sorted_people
    ]
    lines.append(",\n".join(rows) + ";")
    lines.append("")

    # --- Demo Personas ------------------------------------------------------
    lines.append("-- =============================================================================")
    lines.append("-- s05_people / 2. Demo Personas")
    lines.append("-- p-weber replaces v4 p-becker-exec per [F-DG-02].")
    lines.append("-- =============================================================================")
    lines.append("")
    lines.append(
        "INSERT INTO demo_personas (id, person_id, role, display_name, title, default_module, managed_cost_center_id, owned_project_ids_json) VALUES"
    )
    rows = []
    for dp in DEMO_PERSONAS:
        owned = _resolve_owned_projects(dp)
        rows.append(
            f"({sql_str(dp['id'])}, {sql_str(dp['person_id'])}, {sql_str(dp['role'])}, "
            f"{sql_str(dp['display_name'])}, {sql_str(dp['title'])}, "
            f"{sql_str(dp['default_module'])}, {sql_str(dp['managed_cc'])}, {sql_str(owned)})"
        )
    lines.append(",\n".join(rows) + ";")
    lines.append("")

    # --- Users (system access — controller + executive carry tier3) ---------
    lines.append("-- =============================================================================")
    lines.append("-- s05_people / 3. Users (one per persona) [D-AC-01..03]")
    lines.append("-- =============================================================================")
    lines.append("")
    lines.append(
        "INSERT INTO users (id, username, display_name, email, role, person_id, tier3_flag, change_reviewer_flag, is_active, created_at, modified_at) VALUES"
    )
    rows = [
        (
            f"({sql_str(u['id'])}, {sql_str(u['username'])}, {sql_str(u['display_name'])}, "
            f"{sql_str(u['email'])}, {sql_str(u['role'])}, {sql_str(u['person_id'])}, "
            f"{1 if u['tier3_flag'] else 0}, {1 if u['change_reviewer_flag'] else 0}, "
            f"1, '{CREATED_AT}', '{CREATED_AT}')"
        )
        for u in USERS
    ]
    lines.append(",\n".join(rows) + ";")

    return "\n".join(lines)
