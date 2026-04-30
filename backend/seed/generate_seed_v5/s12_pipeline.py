"""Stage 12 — Pipeline stage + DoI lifecycle columns [A-PS-02], [A-DOI-01..03].

Emits ``UPDATE projects SET pipeline_stage, doi, frozen_doi,
ai_council_approved, ai_council_doc_url, within_cutoff`` per project.

ChargeableEntity carries no pipeline columns of its own — pipeline state lives
exclusively on Project (Offerings + InternalServices are always Run by
construction; Project ↔ ChargeableEntity bridges to Run via ``project.doi == 5``
in ``ChargeableEntity.is_change_or_run``).

Distribution per the plan doc:
- proj-greenedge & proj-connveh    → Proposed,            DoI 0
- proj-dwh                          → Under Evaluation,    DoI 1 (early)
- proj-autobrake                    → Under Evaluation,    DoI 2 (late, intake)
- proj-railsafety, proj-predmaint   → Approved,            DoI 3
- proj-mdh-rollout, proj-erp2,
  proj-sensor                       → Active,              DoI 3
- proj-cloud3-run, proj-iam-run     → Operate,             DoI 5
"""
from __future__ import annotations

from _utils import sql_str

# Pipeline configuration per project.
# (project_id, pipeline_stage, doi, ai_council_approved, ai_council_doc_url, within_cutoff, frozen_doi)
PIPELINE_STATE: list[tuple] = [
    ("proj-greenedge",    "Proposed",          0, False, None, True,  None),
    ("proj-connveh",      "Proposed",          0, False, None, True,  None),
    ("proj-dwh",          "Under Evaluation",  1, True,  "https://kb.sharepoint.com/aicouncil/proj-dwh-2026-01.pdf",  True,  None),
    ("proj-autobrake",    "Under Evaluation",  2, True,  "https://kb.sharepoint.com/aicouncil/proj-autobrake-2026-02.pdf", True, None),
    ("proj-railsafety",   "Approved",          3, True,  "https://kb.sharepoint.com/aicouncil/proj-railsafety-2025-11.pdf", True, None),
    ("proj-predmaint",    "Approved",          3, True,  "https://kb.sharepoint.com/aicouncil/proj-predmaint-2025-05.pdf", True, None),
    ("proj-mdh-rollout",  "Active",            3, True,  "https://kb.sharepoint.com/aicouncil/proj-mdh-rollout-2025-09.pdf", True, None),
    ("proj-erp2",         "Active",            3, True,  "https://kb.sharepoint.com/aicouncil/proj-erp2-2024-06.pdf", True, None),
    ("proj-sensor",       "Active",            3, True,  "https://kb.sharepoint.com/aicouncil/proj-sensor-2025-02.pdf", True, None),
    ("proj-cloud3-run",   "Operate",           5, True,  None, True,  None),
    ("proj-iam-run",      "Operate",           5, True,  None, True,  None),
]


def generate() -> str:
    parts: list[str] = []
    parts.append("-- =============================================================================")
    parts.append("-- s12_pipeline — Pipeline stage + DoI gates per [A-PS-02] [A-DOI-01..03]")
    parts.append("-- =============================================================================")
    parts.append("")

    # Sort by id for determinism.
    for row in sorted(PIPELINE_STATE, key=lambda r: r[0]):
        proj_id, stage, doi, ai_council, doc_url, within_cutoff, frozen_doi = row
        parts.append(
            "UPDATE projects SET "
            f"pipeline_stage = {sql_str(stage)}, "
            f"doi = {doi}, "
            f"frozen_doi = {sql_str(frozen_doi)}, "
            f"ai_council_approved = {1 if ai_council else 0}, "
            f"ai_council_doc_url = {sql_str(doc_url)}, "
            f"within_cutoff = {1 if within_cutoff else 0} "
            f"WHERE id = {sql_str(proj_id)};"
        )

    parts.append("")
    parts.append(f"-- {len(PIPELINE_STATE)} projects updated.")
    return "\n".join(parts)
