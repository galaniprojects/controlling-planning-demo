"""Stage 18 — Progress tracker live state + checklists + snapshots [E-04c].

Subsumes the legacy ``loader._seed_progress_tracker_data`` Python helper —
emits equivalent state for the three v5 demo entities
(proj-mdh-rollout / proj-erp2 / proj-iam-run).

Per [E-04c]:
- ``milestone_deliverables`` rows for each demo entity's current milestone
  (4-of-7 complete checklist; auto-computes ``Project.progress_pct``).
- ``UPDATE projects SET ... narrative columns`` for live progress state.
- ``progress_snapshots`` rows: 3 cycle closures (Q4 2025, Q1 2026, Q2 2026)
  per entity = 9 rows. Q2 2026 mirrors the live state.

All FK references to ``project_milestones`` use sub-SELECT lookups by
``(project_id, sequence_number)`` so this stage is independent of the
auto-generated milestone primary keys produced by s17.

The checklist payload JSON for each snapshot reconstructs the historical
checklist state with "first N items complete" semantics — a minimal but
deterministic approximation that lets the History view render a plausible
trajectory without requiring a full audit log.
"""
from __future__ import annotations

import json

from _utils import sql_str
from generate_seed_v5.config.entities import PROJECTS
from generate_seed_v5.config.milestones import (
    DELIVERABLE_CHECKLISTS,
    PROGRESS_LIVE,
    PROGRESS_SNAPSHOTS,
    PROJECT_MILESTONES,
)

PROGRESS_UPDATED_AT = "2026-04-15 09:00:00"


def _milestone_subselect(project_id: str, seq: int) -> str:
    """SQL fragment that resolves to the project_milestones.id for (project, seq)."""
    return (
        f"(SELECT id FROM project_milestones WHERE project_id = {sql_str(project_id)} "
        f"AND sequence_number = {seq})"
    )


def _milestone_name_for(project_id: str, seq: int) -> str | None:
    """Look up the milestone display name from PROJECT_MILESTONES."""
    for m in PROJECT_MILESTONES.get(project_id, []):
        if m["n"] == seq:
            return m["name"]
    return None


def _build_history_payload(
    project_id: str, snapshot_seq: int, items_complete_n: int,
) -> str | None:
    """Construct a checklist_payload_json for a historical snapshot.

    Uses "first N items complete" semantics — items in display order, with
    the leading ``items_complete_n`` items marked complete. Returns None if
    the snapshot's milestone has no checklist defined.
    """
    cfg = DELIVERABLE_CHECKLISTS.get(project_id)
    if cfg is None:
        return None
    if cfg["milestone_seq"] != snapshot_seq:
        return None  # No checklist on this milestone in the demo data.

    name = _milestone_name_for(project_id, snapshot_seq) or ""
    items_payload = []
    for idx, (text, _) in enumerate(cfg["items"], start=1):
        is_complete = idx <= items_complete_n
        items_payload.append({
            "sequence": idx,
            "text": text,
            "is_complete": is_complete,
            "completed_at": "2026-04-01T00:00:00" if is_complete else None,
        })
    payload = [{
        "milestone_name": name,
        "sequence_number": snapshot_seq,
        "items": items_payload,
    }]
    return json.dumps(payload)


def generate() -> str:
    parts: list[str] = []
    parts.append("-- =============================================================================")
    parts.append("-- s18_progress — milestone_deliverables + UPDATE projects (live narrative) +")
    parts.append("--                progress_snapshots history [E-04c]")
    parts.append("-- Subsumes legacy loader._seed_progress_tracker_data for v5 demo entities.")
    parts.append("-- =============================================================================")

    project_lookup = {p["id"]: p for p in PROJECTS}

    # --- milestone_deliverables ------------------------------------------
    parts.append("")
    parts.append("-- MilestoneDeliverable rows (3 demo entities × 7 items = 21 rows)")
    deliverable_inserts: list[str] = []
    for proj_id in sorted(DELIVERABLE_CHECKLISTS.keys()):
        cfg = DELIVERABLE_CHECKLISTS[proj_id]
        seq = cfg["milestone_seq"]
        items = cfg["items"]
        proj = project_lookup.get(proj_id)
        completer_id = proj.get("pl_id") if proj else None

        for idx, (text, complete) in enumerate(items, start=1):
            ms_subselect = _milestone_subselect(proj_id, seq)
            completed_at = "'2026-04-01 00:00:00'" if complete else "NULL"
            completed_by = sql_str(completer_id) if (complete and completer_id) else "NULL"
            deliverable_inserts.append(
                "INSERT INTO milestone_deliverables (milestone_id, sequence, text, is_complete, "
                "completed_at, completed_by_id, created_at, modified_at) "
                f"VALUES ({ms_subselect}, {idx}, {sql_str(text)}, "
                f"{1 if complete else 0}, {completed_at}, {completed_by}, "
                f"'{PROGRESS_UPDATED_AT}', '{PROGRESS_UPDATED_AT}');"
            )
    parts.extend(deliverable_inserts)

    # --- UPDATE projects (live narrative) --------------------------------
    parts.append("")
    parts.append("-- UPDATE projects SET narrative columns for the 3 demo entities")
    for proj_id in sorted(PROGRESS_LIVE.keys()):
        live = PROGRESS_LIVE[proj_id]
        proj = project_lookup.get(proj_id)
        updater_id = proj.get("pl_id") if proj else None
        confidence_reason = live.get("reason")
        parts.append(
            "UPDATE projects SET "
            f"progress_pct = {live['progress_pct']}, "
            f"progress_pct_manual_override = {1 if live['manual_override'] else 0}, "
            f"status_narrative = {sql_str(live['narrative'])}, "
            f"next_milestone_confidence = {sql_str(live['confidence'])}, "
            f"confidence_reason = {sql_str(confidence_reason)}, "
            f"progress_updated_at = '{PROGRESS_UPDATED_AT}', "
            f"progress_updated_by_id = {sql_str(updater_id)} "
            f"WHERE id = {sql_str(proj_id)};"
        )

    # --- progress_snapshots ----------------------------------------------
    parts.append("")
    parts.append("-- ProgressSnapshot rows (3 demo entities × 3 cycles = 9 rows)")
    for proj_id in sorted(PROGRESS_SNAPSHOTS.keys()):
        snaps = PROGRESS_SNAPSHOTS[proj_id]
        live = PROGRESS_LIVE[proj_id]
        proj = project_lookup.get(proj_id)
        creator_id = proj.get("pl_id") if proj else None

        for snap in snaps:
            seq = snap["milestone_seq"]
            ms_subselect = _milestone_subselect(proj_id, seq)
            ms_name = _milestone_name_for(proj_id, seq)
            confidence_reason = (
                live.get("reason") if snap["confidence"] in ("at_risk", "blocked") else None
            )
            checklist_payload = _build_history_payload(
                proj_id, seq, snap.get("items_complete", 0),
            )
            parts.append(
                "INSERT INTO progress_snapshots (project_id, cycle_label, cycle_id, "
                "snapshot_at, created_by_id, current_milestone_id, current_milestone_name, "
                "current_milestone_sequence, progress_pct, progress_pct_manual_override, "
                "status_narrative, next_milestone_confidence, confidence_reason, "
                "checklist_payload_json) VALUES ("
                f"{sql_str(proj_id)}, {sql_str(snap['cycle_label'])}, "
                f"{sql_str(snap['cycle_id'])}, '{snap['snapshot_at']}', "
                f"{sql_str(creator_id)}, {ms_subselect}, "
                f"{sql_str(ms_name)}, {seq}, "
                f"{snap['pct']}, {1 if live['manual_override'] else 0}, "
                f"{sql_str(snap['narrative'])}, {sql_str(snap['confidence'])}, "
                f"{sql_str(confidence_reason)}, "
                f"{sql_str(checklist_payload)});"
            )

    parts.append("")
    parts.append(
        f"-- Wrote {len(deliverable_inserts)} deliverables + "
        f"{len(PROGRESS_LIVE)} project updates + "
        f"{sum(len(v) for v in PROGRESS_SNAPSHOTS.values())} snapshots."
    )
    return "\n".join(parts)
