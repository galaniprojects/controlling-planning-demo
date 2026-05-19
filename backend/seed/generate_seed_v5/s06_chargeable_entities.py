"""Stage 6 — chargeable_entities + projects (polymorphic emission).

Per [F-DM-01]: ChargeableEntity is the polymorphic root over Project /
Offering / InternalService. For ``entity_type='Project'`` rows we emit BOTH:
1. A row in ``projects`` (the v4-anchored entity carrying lifecycle / Tech
   Navigator / progress columns; v5 columns left NULL — Phase 2 T2 fills
   them in s11/s12/s17/s18).
2. A row in ``chargeable_entities`` with ``project_id`` FK back into
   projects, plus ``annual_cost`` / ``to_business_pct`` / hierarchy.

Offerings and InternalServices have no underlying ``projects`` row — only a
``chargeable_entities`` row.

Order of emission inside this stage:
- Pass 1: insert ``projects`` rows for every Project subtype.
- Pass 2: insert ``chargeable_entities`` rows for all 34 entities.

This keeps the FK from chargeable_entities.project_id → projects.id valid
when SQLite enforces foreign keys at insert time.

Identifier validation note: every identifier in
``config/entities.py`` is shape-checked at config-load time by
``schemas/chargeable_entity.validate_identifier_for_type``; this stage emits
the values verbatim.
"""
from __future__ import annotations

from _utils import sql_str
from generate_seed_v5.config.branding import CREATED_AT
from generate_seed_v5.config.entities import (
    INTERNAL_SERVICES,
    OFFERINGS,
    PROJECTS,
    all_chargeable_entities,
)


def _project_v4_status_for_seed(p: dict) -> str:
    """Return the legacy projects.status value for a v5 project row."""
    return p["v4_status"]


def _project_last_forecast_submitted_month(p: dict) -> str | None:
    """Mirror the v4 hueristic so existing pending-action wiring still fires."""
    if p["v4_status"] != "active":
        return None
    if p["id"] == "proj-erp2":
        return "2026-02"  # Overdue — March not submitted (drives Anna's queue).
    if p["id"] in {"proj-sensor", "proj-predmaint", "proj-mdh-rollout"}:
        return "2026-03"  # Due — April not yet submitted.
    return "2026-03"


def generate() -> str:
    lines: list[str] = []

    # --- Pass 1: projects rows ---------------------------------------------
    lines.append("-- =============================================================================")
    lines.append("-- s06_chargeable_entities / 1. Projects (11 rows; v5 lifecycle fields NULL)")
    lines.append("-- Polymorphic ChargeableEntity row inserted in pass 2 [F-DM-01].")
    lines.append("-- v5 columns (pipeline_stage, doi, tech_navigator, progress) populated by")
    lines.append("-- Phase 2 T2 in s11 / s12 / s17 / s18.")
    lines.append("-- =============================================================================")
    lines.append("")
    # Note: ai_council_approved is NOT NULL with no server_default — must be
    # explicit. progress_pct_manual_override has server_default='0' but we
    # emit it for clarity. Other v5 lifecycle / Tech Navigator / progress
    # columns are nullable and left NULL here; T2 fills them in s11/s12/s17/s18.
    lines.append(
        "INSERT INTO projects (id, name, description, status, rag_status, capex_opex, "
        "start_month, end_month, projected_end_month, pl_person_id, is_service, "
        "annual_budget, total_budget, last_forecast_submitted_month, "
        "ai_council_approved, progress_pct_manual_override, "
        "is_active, created_at, modified_at) VALUES"
    )
    rows: list[str] = []
    for p in PROJECTS:
        is_service = p["annual_cost"] is not None  # Run-stage projects mark as service
        annual_budget = p["annual_cost"] if is_service else None
        total_budget = p["total_budget"] if not is_service else None
        last_fc = _project_last_forecast_submitted_month(p)
        # projected_end mirrors end_month except for the troubled red project.
        projected_end = p["end_month"]
        if p["id"] == "proj-erp2":
            projected_end = "2026-09"
        # modified_at: differs from created_at for proj-mdh-rollout (recently
        # approved → drives PL Launchpad).
        modified = CREATED_AT
        rows.append(
            f"({sql_str(p['id'])}, {sql_str(p['name'])}, NULL, "
            f"{sql_str(_project_v4_status_for_seed(p))}, {sql_str(p['rag_status'])}, "
            f"{sql_str(p['capex_opex'])}, {sql_str(p['start_month'])}, "
            f"{sql_str(p['end_month'])}, {sql_str(projected_end)}, "
            f"{sql_str(p['pl_id'])}, {1 if is_service else 0}, "
            f"{sql_str(annual_budget)}, {sql_str(total_budget)}, "
            f"{sql_str(last_fc)}, 0, 0, "
            f"1, '{CREATED_AT}', '{modified}')"
        )
    lines.append(",\n".join(rows) + ";")
    lines.append("")

    # --- Pass 2: chargeable_entities (all 34) -------------------------------
    lines.append("-- =============================================================================")
    lines.append("-- s06_chargeable_entities / 2. Chargeable Entities (34 — polymorphic) [F-DM-01]")
    lines.append("-- Identifier formats: IT0<5d> for Project, IT00S<3d> for Offering, ITF<5d> for InternalService.")
    lines.append("-- WBS is algorithmic (services/wbs_generator.py) per [F-DM-03] — never stored.")
    lines.append("-- =============================================================================")
    lines.append("")
    lines.append(
        "INSERT INTO chargeable_entities (id, entity_type, identifier, name, description, "
        "hierarchy_node_id, responsible_person_id, allocation_key, to_business_pct, "
        "project_id, termination_month, annual_cost, is_active, created_at, "
        "modified_at) VALUES"
    )
    rows = []
    for ent in all_chargeable_entities():
        rows.append(
            f"({sql_str(ent['id'])}, {sql_str(ent['entity_type'])}, "
            f"{sql_str(ent['identifier'])}, {sql_str(ent['name'])}, NULL, "
            f"{sql_str(ent['hierarchy_node_id'])}, {sql_str(ent['responsible_person_id'])}, "
            f"{sql_str(ent['allocation_key'])}, "
            f"{ent['to_business_pct']}, {sql_str(ent['project_id'])}, "
            f"{sql_str(ent['termination_month'])}, {sql_str(ent['annual_cost'])}, "
            f"1, '{CREATED_AT}', '{CREATED_AT}')"
        )
    lines.append(",\n".join(rows) + ";")
    lines.append("")

    # --- Counters comment ---------------------------------------------------
    lines.append(
        f"-- chargeable_entities counts: {len(PROJECTS)} Project, "
        f"{len(OFFERINGS)} Offering, {len(INTERNAL_SERVICES)} InternalService."
    )

    return "\n".join(lines)
