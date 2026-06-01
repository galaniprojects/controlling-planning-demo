"""Stage 12 — Pipeline stage + DoI lifecycle columns [A-PS-02], [A-DOI-01..03].

Emits ``UPDATE projects SET pipeline_stage, doi, frozen_doi,
ai_council_approved, ai_council_doc_url, within_cutoff, run_entity_id``
per project.

ChargeableEntity carries no pipeline columns of its own — pipeline state lives
exclusively on Project (Offerings + InternalServices are always Run by
construction; ``ChargeableEntity.is_change_or_run`` is now entity-type-based
per VIPER §5.1 — DoI no longer drives it).

Target stage vocabulary [VIPER §2.3]:
  On-path:  Proposed → Under Evaluation → Approved → Active →
            Hyper-maintenance → { Run entity spawned | Completed }
  Off-path: Paused, Cancelled  (carry frozen_doi)
  Removed:  Operate, Retired   (migrated below)

Distribution per the plan doc:
- proj-greenedge & proj-connveh    → Proposed,            DoI 0
- proj-dwh                          → Under Evaluation,    DoI 1 (early)
- proj-autobrake                    → Under Evaluation,    DoI 2 (late, intake)
- proj-railsafety, proj-predmaint   → Approved,            DoI 3
- proj-mdh-rollout, proj-erp2,
  proj-sensor                       → Active,              DoI 3
- proj-cloud3-run                   → Completed,           DoI 5
    (cloud platform absorbed across multiple services; no single run entity)
- proj-iam-run                      → Run entity spawned,  DoI 5
    (IAM capabilities handed to off-eunify — Enterprise Unified Workspace
    receives 18 % of IAM's distribution confirming the dependency)

Note: "Operate" in milestone *names* (project_milestones / progress_snapshots
rows in s17/s18) is a milestone-type label, not a pipeline_stage value — those
rows are outside this lane's scope and are unchanged here.
"""
from __future__ import annotations

from _utils import sql_str

# Pipeline configuration per project.
# Columns:
#   (project_id, pipeline_stage, doi, ai_council_approved, ai_council_doc_url,
#    within_cutoff, frozen_doi, run_entity_id)
#
# run_entity_id — populated only for 'Run entity spawned' projects; points to
# the Offering or InternalService (chargeable_entities.id) that now carries the
# ongoing cost.  NULL for all other stages.
PIPELINE_STATE: list[tuple] = [
    ("proj-greenedge",    "Proposed",           0, False, None, True,  None, None),
    ("proj-connveh",      "Proposed",           0, False, None, True,  None, None),
    ("proj-dwh",          "Under Evaluation",   1, True,  "https://kb.sharepoint.com/aicouncil/proj-dwh-2026-01.pdf",      True,  None, None),
    ("proj-autobrake",    "Under Evaluation",   2, True,  "https://kb.sharepoint.com/aicouncil/proj-autobrake-2026-02.pdf", True, None, None),
    ("proj-railsafety",   "Approved",           3, True,  "https://kb.sharepoint.com/aicouncil/proj-railsafety-2025-11.pdf", True, None, None),
    ("proj-predmaint",    "Approved",           3, True,  "https://kb.sharepoint.com/aicouncil/proj-predmaint-2025-05.pdf",  True, None, None),
    ("proj-mdh-rollout",  "Active",             3, True,  "https://kb.sharepoint.com/aicouncil/proj-mdh-rollout-2025-09.pdf", True, None, None),
    ("proj-erp2",         "Active",             3, True,  "https://kb.sharepoint.com/aicouncil/proj-erp2-2024-06.pdf",       True, None, None),
    ("proj-sensor",       "Active",             3, True,  "https://kb.sharepoint.com/aicouncil/proj-sensor-2025-02.pdf",     True, None, None),
    # --- Terminal stages (migrated from Operate per VIPER §11.4 / §2.3) ---
    # proj-cloud3-run: Completed — cloud infra responsibilities distributed
    # across svc-infra-platform / svc-monitoring / svc-data-platform; no single
    # spawned entity; run_entity_id = NULL.
    ("proj-cloud3-run",   "Completed",          5, True,  None, True,  None, None),
    # proj-iam-run: Run entity spawned — IAM capabilities now embodied in the
    # Enterprise Unified Workspace offering (off-eunify); 18 % distribution edge
    # confirms the dependency.  run_entity_id → off-eunify (Offering).
    ("proj-iam-run",      "Run entity spawned", 5, True,  None, True,  None, "off-eunify"),
    # --- Backlog expansion (v6) — 9 Proposed, 5 Under Evaluation, 2 Approved.
    #     within_cutoff is re-derived at load time by the ranking recompute;
    #     the True seed value is a placeholder.
    ("proj-cloudmig",     "Proposed",           0, False, None, True,  None, None),
    ("proj-datalake",     "Proposed",           0, False, None, True,  None, None),
    ("proj-mes",          "Proposed",           0, False, None, True,  None, None),
    ("proj-zerotrust",    "Proposed",           0, False, None, True,  None, None),
    ("proj-mdm",          "Proposed",           0, False, None, True,  None, None),
    ("proj-elearning",    "Proposed",           0, False, None, True,  None, None),
    ("proj-apigateway",   "Proposed",           0, False, None, True,  None, None),
    ("proj-fielddx2",     "Proposed",           0, False, None, True,  None, None),
    ("proj-greenit",      "Proposed",           0, False, None, True,  None, None),
    ("proj-aiops",        "Under Evaluation",   2, True,  "https://kb.sharepoint.com/aicouncil/proj-aiops-2026-03.pdf",     True, None, None),
    ("proj-iam2",         "Under Evaluation",   2, True,  "https://kb.sharepoint.com/aicouncil/proj-iam2-2026-02.pdf",      True, None, None),
    ("proj-ehs",          "Under Evaluation",   2, True,  "https://kb.sharepoint.com/aicouncil/proj-ehs-2026-02.pdf",       True, None, None),
    ("proj-crmnext",      "Under Evaluation",   1, True,  "https://kb.sharepoint.com/aicouncil/proj-crmnext-2026-01.pdf",   True, None, None),
    ("proj-warehouse",    "Under Evaluation",   1, True,  "https://kb.sharepoint.com/aicouncil/proj-warehouse-2026-01.pdf", True, None, None),
    ("proj-sapupg",       "Approved",           3, True,  "https://kb.sharepoint.com/aicouncil/proj-sapupg-2025-12.pdf",    True, None, None),
    ("proj-paymtsec",     "Approved",           3, True,  "https://kb.sharepoint.com/aicouncil/proj-paymtsec-2025-11.pdf",  True, None, None),
]


def generate() -> str:
    parts: list[str] = []
    parts.append("-- =============================================================================")
    parts.append("-- s12_pipeline — Pipeline stage + DoI gates per [A-PS-02] [A-DOI-01..03]")
    parts.append("-- VIPER §11.4: Operate migrated → Completed / Run entity spawned.")
    parts.append("-- run_entity_id set for 'Run entity spawned' rows only.")
    parts.append("-- =============================================================================")
    parts.append("")

    # Sort by id for determinism.
    for row in sorted(PIPELINE_STATE, key=lambda r: r[0]):
        proj_id, stage, doi, ai_council, doc_url, within_cutoff, frozen_doi, run_entity_id = row
        parts.append(
            "UPDATE projects SET "
            f"pipeline_stage = {sql_str(stage)}, "
            f"doi = {doi}, "
            f"frozen_doi = {sql_str(frozen_doi)}, "
            f"ai_council_approved = {1 if ai_council else 0}, "
            f"ai_council_doc_url = {sql_str(doc_url)}, "
            f"within_cutoff = {1 if within_cutoff else 0}, "
            f"run_entity_id = {sql_str(run_entity_id)} "
            f"WHERE id = {sql_str(proj_id)};"
        )

    parts.append("")
    parts.append(f"-- {len(PIPELINE_STATE)} projects updated.")
    parts.append("-- Paused projects: none in seed — no frozen_doi fixups required.")
    parts.append("-- Retired projects: none in seed — no migration required.")
    return "\n".join(parts)
