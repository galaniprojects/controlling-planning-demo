"""Stage 17 — Milestone types catalogue + per-project milestones [A-MS-01..03] [A-BK-34].

Emits:
1. ``milestone_types`` — global 10-row catalogue with default colours and
   suggested ordering [A-BK-34].
2. ``project_milestones`` — per-project sequenced milestones with both
   baseline and forecast date windows [A-MS-01]; ``baseline_locked_at`` is
   set to a fixed timestamp mirroring the runtime "lock on first save"
   behaviour [A-MS-02].
3. ``UPDATE projects SET current_milestone_id`` — resolves the circular
   ``Project ↔ ProjectMilestone`` FK by sub-SELECTing the milestone whose
   forecast window contains DEMO_DATE = "2026-04". When the demo date is
   before the first milestone, the first milestone is selected; when after
   the last, the last milestone is selected.

DoI 0 projects (proj-greenedge, proj-connveh) carry no milestone schedule
and their ``current_milestone_id`` stays NULL — the verification step in
the plan doc explicitly accepts this.
"""
from __future__ import annotations

from _utils import sql_str
from generate_seed_v5.config.branding import CREATED_AT
from generate_seed_v5.config.milestones import (
    MILESTONE_TYPES,
    PROJECT_MILESTONES,
    resolve_milestone_type_id,
)

DEMO_DATE = "2026-04"
BASELINE_LOCK_TIMESTAMP = "2024-01-01 00:00:00"


def _pick_current_seq(milestones: list[dict]) -> int:
    """Choose sequence_number of the milestone whose forecast window covers
    DEMO_DATE; fall back to first/last if DEMO_DATE is out of range."""
    if not milestones:
        return 0
    for m in milestones:
        if m["fs"] <= DEMO_DATE <= m["fe"]:
            return m["n"]
    if DEMO_DATE < milestones[0]["fs"]:
        return milestones[0]["n"]
    return milestones[-1]["n"]


def generate() -> str:
    parts: list[str] = []
    parts.append("-- =============================================================================")
    parts.append("-- s17_milestones — milestone_types catalogue [A-BK-34] + project_milestones [A-MS-01]")
    parts.append("-- Bottom: UPDATE projects SET current_milestone_id (resolves circular FK)")
    parts.append("-- =============================================================================")

    # --- milestone_types catalogue ----------------------------------------
    parts.append("")
    parts.append("-- Milestone Types (10 rows)")
    parts.append(
        "INSERT INTO milestone_types (id, name, default_color, suggested_ordering, is_active, created_at) VALUES"
    )
    mt_rows: list[str] = []
    for mt in MILESTONE_TYPES:
        mt_rows.append(
            f"({sql_str(mt['id'])}, {sql_str(mt['name'])}, "
            f"{sql_str(mt['color'])}, {mt['ordering']}, 1, '{CREATED_AT}')"
        )
    parts.append(",\n".join(mt_rows) + ";")

    # --- project_milestones -----------------------------------------------
    parts.append("")
    parts.append("-- Project Milestones (sequence_number 1..N per project; baseline_locked_at set)")
    pm_rows: list[str] = []
    for proj_id in sorted(PROJECT_MILESTONES.keys()):
        for m in PROJECT_MILESTONES[proj_id]:
            type_id = resolve_milestone_type_id(m["name"])
            pm_rows.append(
                f"({sql_str(proj_id)}, {m['n']}, {sql_str(m['name'])}, "
                f"{sql_str(type_id)}, "
                f"{sql_str(m['bs'])}, {sql_str(m['be'])}, "
                f"{sql_str(m['fs'])}, {sql_str(m['fe'])}, "
                f"{sql_str(m.get('color'))}, "
                f"'{BASELINE_LOCK_TIMESTAMP}')"
            )

    cols_pm = (
        "(project_id, sequence_number, name, milestone_type_id, "
        "baseline_start, baseline_end, forecast_start, forecast_end, "
        "color, baseline_locked_at)"
    )
    parts.append(f"INSERT INTO project_milestones {cols_pm} VALUES")
    parts.append(",\n".join(pm_rows) + ";")

    # --- UPDATE projects.current_milestone_id (resolve circular FK) -------
    parts.append("")
    parts.append("-- Resolve Project ↔ ProjectMilestone circular FK [A-MS-01]")
    parts.append("-- DEMO_DATE = '2026-04': pick milestone whose forecast window contains it.")
    for proj_id in sorted(PROJECT_MILESTONES.keys()):
        seq = _pick_current_seq(PROJECT_MILESTONES[proj_id])
        if seq == 0:
            continue
        parts.append(
            "UPDATE projects SET current_milestone_id = "
            f"(SELECT id FROM project_milestones WHERE project_id = {sql_str(proj_id)} "
            f"AND sequence_number = {seq}) "
            f"WHERE id = {sql_str(proj_id)};"
        )

    parts.append("")
    parts.append(f"-- {len(PROJECT_MILESTONES)} projects milestoned; "
                 "DoI 0 projects (proj-greenedge / proj-connveh) intentionally skipped.")
    return "\n".join(parts)
