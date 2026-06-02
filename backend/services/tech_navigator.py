"""Tech Navigator scoring engine [A-TN-01..A-TN-09].

Pure functions plus DB helpers for loading admin-configurable weights and
recomputing scores on the Project model. Composite scores are denormalized
on Project to enable ORDER BY in the ranking engine (Session A3).

The Tech Navigator profile has:
- Complexity (Y-axis): weighted average of Standardization, Usage, Maintenance.
- Value Creation (X-axis): weighted average of Financial benefit, Payback,
  Competitive advantage. Two reserved slots exist on the model but are not
  surfaced in the UI ([A-TN-04]) and not consumed here.
- Composite ranking score: w_value*ValueCreation + w_complexity*Complexity.
- T-shirt size: derived from total_budget against admin thresholds.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from sqlalchemy.orm import Session


# Spec defaults — used only when the matching planning_parameters row is
# missing. The seed pins these via tn_* rows (e.g. the t-shirt thresholds are
# seeded to wider demo bands than the DEFAULT_TSHIRT_THRESHOLDS below), so the
# live values come from the DB; these constants are the no-DB-row fallback.
DEFAULT_COMPLEXITY_WEIGHTS = {
    "standardization": 40.0,
    "usage": 40.0,
    "maintenance": 20.0,
}
DEFAULT_VALUE_WEIGHTS = {
    "financial": 50.0,
    "payback": 40.0,
    "competitive": 10.0,
}
DEFAULT_RANKING_WEIGHTS = {"value": 70.0, "complexity": 30.0}
DEFAULT_TSHIRT_THRESHOLDS = {
    "xs_max": 100_000,
    "s_max": 250_000,
    "m_max": 500_000,
    "l_max": 1_000_000,
}


@dataclass
class WeightsSnapshot:
    """Snapshot of all admin-configurable Tech Navigator weights and thresholds.

    Loaded once per request/recompute and passed through the compute helpers
    so a single PUT or admin update reads planning_parameters exactly once.
    """

    complexity: dict[str, float] = field(default_factory=lambda: dict(DEFAULT_COMPLEXITY_WEIGHTS))
    value_creation: dict[str, float] = field(default_factory=lambda: dict(DEFAULT_VALUE_WEIGHTS))
    ranking: dict[str, float] = field(default_factory=lambda: dict(DEFAULT_RANKING_WEIGHTS))
    tshirt: dict[str, int] = field(default_factory=lambda: dict(DEFAULT_TSHIRT_THRESHOLDS))


_KEY_MAP = {
    "tn_complexity_weight_standardization": ("complexity", "standardization", float),
    "tn_complexity_weight_usage": ("complexity", "usage", float),
    "tn_complexity_weight_maintenance": ("complexity", "maintenance", float),
    "tn_value_weight_financial": ("value_creation", "financial", float),
    "tn_value_weight_payback": ("value_creation", "payback", float),
    "tn_value_weight_competitive": ("value_creation", "competitive", float),
    "tn_w_value": ("ranking", "value", float),
    "tn_w_complexity": ("ranking", "complexity", float),
    "tn_tshirt_xs_max": ("tshirt", "xs_max", int),
    "tn_tshirt_s_max": ("tshirt", "s_max", int),
    "tn_tshirt_m_max": ("tshirt", "m_max", int),
    "tn_tshirt_l_max": ("tshirt", "l_max", int),
}


def load_weights(db: Session) -> WeightsSnapshot:
    """Load all tn_* planning parameters into a single WeightsSnapshot.

    Missing keys fall back to spec defaults. Bad values fall back to defaults
    silently so a corrupt admin entry can't crash the recompute pipeline.
    """
    from models.system import PlanningParameter

    snap = WeightsSnapshot()
    rows = db.query(PlanningParameter).filter(PlanningParameter.key.like("tn_%")).all()
    for row in rows:
        target = _KEY_MAP.get(row.key)
        if not target:
            continue
        bucket, field_name, caster = target
        try:
            getattr(snap, bucket)[field_name] = caster(row.current_value)
        except (TypeError, ValueError):
            continue
    return snap


def _weighted_average(values: list[Optional[int]], weights: list[float]) -> Optional[float]:
    """Weighted average where any None value yields None.

    Weights are expressed as percentages (e.g. 40, 40, 20) and are normalized
    against their sum so non-100 totals still produce a sensible 1-5 result.
    """
    if any(v is None for v in values):
        return None
    total_weight = sum(weights)
    if total_weight <= 0:
        return None
    weighted = sum(v * w for v, w in zip(values, weights))
    return round(weighted / total_weight, 2)


def compute_complexity(project, weights: WeightsSnapshot) -> Optional[float]:
    """Compute Complexity score from sub-criteria. None if any sub-criterion missing."""
    return _weighted_average(
        [project.tn_standardization, project.tn_usage, project.tn_maintenance],
        [
            weights.complexity["standardization"],
            weights.complexity["usage"],
            weights.complexity["maintenance"],
        ],
    )


def compute_value_creation(project, weights: WeightsSnapshot) -> Optional[float]:
    """Compute Value Creation score from the 3 surfaced sub-criteria.

    Reserved slots ([A-TN-04]) carry weight 0 in v5 and are intentionally
    excluded from the calculation.
    """
    return _weighted_average(
        [
            project.tn_financial_benefit,
            project.tn_payback,
            project.tn_competitive_advantage,
        ],
        [
            weights.value_creation["financial"],
            weights.value_creation["payback"],
            weights.value_creation["competitive"],
        ],
    )


def compute_composite(
    complexity: Optional[float],
    value_creation: Optional[float],
    weights: WeightsSnapshot,
) -> Optional[float]:
    """Composite ranking score = w_value*value_creation + w_complexity*complexity.

    Returns None if either axis is None — partial profiles do not contribute
    to the ranking ([A-PRI-01]).
    """
    if complexity is None or value_creation is None:
        return None
    w_value = weights.ranking["value"]
    w_complexity = weights.ranking["complexity"]
    total = w_value + w_complexity
    if total <= 0:
        return None
    return round((value_creation * w_value + complexity * w_complexity) / total, 2)


def derive_tshirt(total_budget: Optional[float], weights: WeightsSnapshot) -> Optional[str]:
    """Derive XS/S/M/L/XL from total_budget against admin thresholds.

    Convention: XS for budgets <= xs_max, S for xs_max < b <= s_max, etc.
    XL is the implicit bucket above l_max.
    """
    if total_budget is None:
        return None
    b = float(total_budget)
    t = weights.tshirt
    if b <= t["xs_max"]:
        return "XS"
    if b <= t["s_max"]:
        return "S"
    if b <= t["m_max"]:
        return "M"
    if b <= t["l_max"]:
        return "L"
    return "XL"


def recompute_project(project, weights: WeightsSnapshot) -> None:
    """Recompute all denormalized Tech Navigator fields on a Project in place.

    Mutates project.complexity_score, value_creation_score, composite_score,
    and tshirt_size. Caller is responsible for the DB commit.
    """
    project.complexity_score = compute_complexity(project, weights)
    project.value_creation_score = compute_value_creation(project, weights)
    project.composite_score = compute_composite(
        project.complexity_score, project.value_creation_score, weights
    )
    project.tshirt_size = derive_tshirt(project.total_budget, weights)


def recompute_all_scores(db: Session) -> int:
    """Recompute Tech Navigator scores for every Project in the database.

    Used by:
    - PUT /api/admin/parameters when a tn_* key changes ([A-TN-07])
    - POST /api/admin/recompute-scores explicit invocation

    Returns the number of projects recomputed.
    """
    from models.projects import Project

    weights = load_weights(db)
    projects = db.query(Project).all()
    for project in projects:
        recompute_project(project, weights)
    db.commit()
    return len(projects)
