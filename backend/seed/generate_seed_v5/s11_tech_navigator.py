"""Stage 11 — Tech Navigator subscores [A-TN-01..09], [A-PRI-01].

Emits ``UPDATE projects SET ...`` per Change-stage project from
``config/financials.TECH_NAV_SCORES``. Run-stage projects (DoI 5) carry no
Tech Navigator profile per spec.

The composite scores (complexity / value_creation / composite) are
denormalised at emission time using the default 40/40/20 sub-criterion
weights and 50/50 ranking weights documented in
``services.tech_navigator``. Admins can recompute via
``POST /api/admin/recompute-scores`` once weights drift.

T-shirt size derives from ``Project.total_budget`` against the default
thresholds (XS ≤ 200K, S ≤ 500K, M ≤ 1M, L ≤ 2M, XL > 2M).
"""
from __future__ import annotations

from _utils import sql_str
from generate_seed_v5.config.entities import PROJECTS
from generate_seed_v5.config.financials import (
    TECH_NAV_DEFAULT_WEIGHTS,
    TECH_NAV_SCORES,
    derive_tshirt,
    weighted_avg,
)


def _compute_scores(scores: dict) -> tuple[float, float, float]:
    """Return (complexity_score, value_creation_score, composite_score)."""
    cw = TECH_NAV_DEFAULT_WEIGHTS["complexity"]
    vw = TECH_NAV_DEFAULT_WEIGHTS["value_creation"]
    rw = TECH_NAV_DEFAULT_WEIGHTS["ranking"]

    complexity = weighted_avg(
        [scores["complexity"]["standardization"],
         scores["complexity"]["usage"],
         scores["complexity"]["maintenance"]],
        [cw["standardization"], cw["usage"], cw["maintenance"]],
    )
    value_creation = weighted_avg(
        [scores["value_creation"]["financial"],
         scores["value_creation"]["payback"],
         scores["value_creation"]["competitive"]],
        [vw["financial"], vw["payback"], vw["competitive"]],
    )
    if complexity is None or value_creation is None:
        return (0.0, 0.0, 0.0)
    total_rank = rw["value"] + rw["complexity"]
    composite = round(
        (value_creation * rw["value"] + complexity * rw["complexity"]) / total_rank, 2,
    )
    return (complexity, value_creation, composite)


def generate() -> str:
    parts: list[str] = []
    parts.append("-- =============================================================================")
    parts.append("-- s11_tech_navigator — Tech Navigator subscores per project [A-TN-01..09]")
    parts.append("-- Composite ranking score per [A-PRI-01]; t-shirt sizing per [A-TN-05].")
    parts.append("-- Run-stage projects (DoI 5) carry no Tech Navigator profile.")
    parts.append("-- =============================================================================")
    parts.append("")

    project_lookup = {p["id"]: p for p in PROJECTS}

    # Iterate in deterministic id order.
    for proj_id in sorted(TECH_NAV_SCORES.keys()):
        scores = TECH_NAV_SCORES[proj_id]
        if proj_id not in project_lookup:
            continue
        proj = project_lookup[proj_id]

        complexity, value_creation, composite = _compute_scores(scores)
        tshirt = derive_tshirt(proj.get("total_budget"))

        c = scores["complexity"]
        v = scores["value_creation"]
        parts.append(
            "UPDATE projects SET "
            f"project_type = {scores['project_type']}, "
            f"transformation_level = {sql_str(scores['transformation_level'])}, "
            f"tn_standardization = {c['standardization']}, "
            f"tn_usage = {c['usage']}, "
            f"tn_maintenance = {c['maintenance']}, "
            f"tn_financial_benefit = {v['financial']}, "
            f"tn_payback = {v['payback']}, "
            f"tn_competitive_advantage = {v['competitive']}, "
            f"tn_value_reserved_1 = NULL, "
            f"tn_value_reserved_2 = NULL, "
            f"complexity_score = {complexity}, "
            f"value_creation_score = {value_creation}, "
            f"composite_score = {composite}, "
            f"tshirt_size = {sql_str(tshirt)} "
            f"WHERE id = {sql_str(proj_id)};"
        )

    parts.append("")
    parts.append(
        f"-- {len(TECH_NAV_SCORES)} projects scored; "
        f"{len(PROJECTS) - len(TECH_NAV_SCORES)} Run-stage skipped."
    )
    return "\n".join(parts)
