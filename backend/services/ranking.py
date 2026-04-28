"""Ranking engine and cutoff line computation [A-PRI-01..A-PRI-04] [A-BK-09..A-BK-14].

Pure functions plus a single DB-mutating orchestrator that recomputes the
``within_cutoff`` flag on Approved projects per [A-PS-06].

Layout mirrors ``services/tech_navigator.py``: a snapshot dataclass for the
admin-configurable parameters, a ``load_config`` helper, pure helpers for
the budget walks, and a ``recompute_within_cutoff_for_backlog`` orchestrator
called from the trigger sites enumerated in Session A3 [A-BK-14]:

1. ``routers/portfolio.py::approve_project`` — project enters Approved.
2. ``routers/admin.py::recompute_scores`` — TN composite scores changed.
3. ``routers/portfolio.py::approve_cr`` and ``routers/workbench.py::accept_cr_changes``
   — CR-driven forecast/budget changes.
4. ``routers/admin.py::update_parameters`` — when key is in ``ranking_*`` or ``tn_*``.
5. ``routers/pipeline.py::transition_pipeline`` — stage change in/out of backlog.
6. ``routers/workbench.py::submit_forecast_cycle`` — cycle completion.
7. ``routers/ranking.py::rebalance`` — manual controller-driven recompute.

Algorithm (cutoff walk per [A-BK-09..A-BK-12]):

1. ``contestable_envelope = total_available_budget − Type 3 pre-funded total
   − Hyper-maintenance committed total`` per [A-BK-09]. Type 3 projects are
   excluded from the ranked competition; their budgets are deducted off the
   top per [A-TN-08].
2. Filter projects: ``is_active=True, pipeline_stage IN BACKLOG_STAGES,
   project_type != 3``. Order by composite_score DESC, then by tie-breakers
   (DoI ASC per [A-BK-06], then total_budget DESC).
3. **Should-be cutoff** [A-BK-10]: walk the ranked list top-to-bottom,
   accumulating each project's budget. The line falls at the first rank
   where cumulative budget exceeds the contestable envelope.
4. **Reality cutoff** [A-BK-11]: walk the same ranked list, but only count
   the budgets of projects that are currently committed (``Active`` or
   ``Approved`` with ``within_cutoff == True``). The line falls at the rank
   where cumulative *committed* budget exceeds the envelope.
5. **`within_cutoff` flag** [A-PS-06]: for each Approved project at rank N,
   set ``within_cutoff = (cumulative_should_be[N] <= envelope)``. Cleared
   (None) on non-Approved backlog projects.

Working assumptions (flagged in PROGRESS.md):

- 12-month horizon is hard-coded per [A-BK-12]; not yet configurable.
- Pre-approval (DoI 0–2) projects use ``total_budget`` as walk input until
  the ``estimated_budget`` field per [A-BK-15] lands.
- Hyper-maintenance committed spend = ``SUM(total_budget)`` for projects in
  ``OPERATE_STAGES`` (Hyper-maintenance + Operate + Retired). Whole-project
  totals rather than 12-month-slice forecast aggregation, pending a future
  refinement.
- Default tie-breaker order is ``composite_score:desc, doi:asc,
  total_budget:desc``. DESC/ASC encoded per-field in the
  ``ranking_tiebreakers`` PlanningParameter.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable, Optional

from sqlalchemy.orm import Session

from services.pipeline import BACKLOG_STAGES, OPERATE_STAGES


# ---------------------------------------------------------------------------
# Constants and defaults
# ---------------------------------------------------------------------------

# Hard-coded 12-month horizon per [A-BK-12]. Not admin-configurable in v5.
BACKLOG_HORIZON_MONTHS: int = 12

# Default total available budget. Working assumption pending KB confirmation.
DEFAULT_TOTAL_AVAILABLE_BUDGET: float = 50_000_000.0

# Default tie-breaker order. Format: comma-separated "field:direction" tokens.
# Direction is ``desc`` or ``asc``. The first sort key is always
# ``composite_score:desc`` and is implicit; subsequent fields are configurable.
DEFAULT_TIEBREAKERS: str = "composite_score:desc,doi:asc,total_budget:desc"

# Allowed tie-breaker field names. Anything outside this set is ignored
# silently so a corrupt admin entry can't crash the recompute pipeline.
_VALID_TIEBREAKER_FIELDS: frozenset[str] = frozenset({
    "composite_score", "doi", "total_budget",
})


# ---------------------------------------------------------------------------
# Configuration snapshot
# ---------------------------------------------------------------------------

@dataclass
class RankingConfig:
    """Snapshot of admin-configurable ranking parameters.

    Loaded once per request/recompute via :func:`load_config` and threaded
    through the pure helpers so a single recompute reads
    ``planning_parameters`` exactly once.
    """

    total_available_budget: float = DEFAULT_TOTAL_AVAILABLE_BUDGET
    tiebreakers: tuple[tuple[str, str], ...] = field(
        default_factory=lambda: _parse_tiebreakers(DEFAULT_TIEBREAKERS),
    )
    horizon_months: int = BACKLOG_HORIZON_MONTHS


def _parse_tiebreakers(raw: str) -> tuple[tuple[str, str], ...]:
    """Parse a tie-breaker string ``field:dir,field:dir`` into pairs.

    Skips unknown fields and bad direction tokens silently. Returns an empty
    tuple if the input is missing or unparseable; callers fall back on the
    primary sort (composite_score) only.
    """
    if not raw:
        return ()
    out: list[tuple[str, str]] = []
    for token in raw.split(","):
        token = token.strip()
        if not token:
            continue
        if ":" in token:
            fld, _, direction = token.partition(":")
        else:
            fld, direction = token, "desc"
        fld = fld.strip()
        direction = direction.strip().lower()
        if fld not in _VALID_TIEBREAKER_FIELDS:
            continue
        if direction not in ("asc", "desc"):
            direction = "desc"
        out.append((fld, direction))
    return tuple(out)


_RANKING_KEY_MAP: dict[str, tuple[str, type]] = {
    "ranking_total_available_budget": ("total_available_budget", float),
    # ``ranking_tiebreakers`` is parsed via ``_parse_tiebreakers`` rather
    # than a simple cast, so it is special-cased in load_config.
}


def load_config(db: Session) -> RankingConfig:
    """Load all ``ranking_*`` PlanningParameters into a RankingConfig.

    Missing keys fall back to module-level defaults. Bad values fall back
    silently; a corrupt admin entry should not crash the recompute pipeline.
    """
    from models.system import PlanningParameter

    cfg = RankingConfig()
    rows = db.query(PlanningParameter).filter(
        PlanningParameter.key.like("ranking_%"),
    ).all()
    for row in rows:
        if row.key == "ranking_tiebreakers":
            parsed = _parse_tiebreakers(row.current_value or "")
            if parsed:
                cfg.tiebreakers = parsed
            continue
        target = _RANKING_KEY_MAP.get(row.key)
        if not target:
            continue
        attr_name, caster = target
        try:
            setattr(cfg, attr_name, caster(row.current_value))
        except (TypeError, ValueError):
            continue
    return cfg


# ---------------------------------------------------------------------------
# Project budget helpers
# ---------------------------------------------------------------------------

def _project_walk_budget(project: Any) -> float:
    """Return the budget value used in the cutoff walk for one project.

    Working assumption [A-BK-15] follow-up: pre-approval (DoI 0–2) projects
    use ``total_budget`` until the dedicated ``estimated_budget`` field
    lands. Returns 0.0 when ``total_budget`` is null so unscored entries
    don't crash the walk.
    """
    if project.total_budget is None:
        return 0.0
    return float(project.total_budget)


def compute_pre_funded_total(db: Session) -> float:
    """Sum of ``total_budget`` for Type 3 projects that are still funded.

    Type 3 projects (legal/compliance/security/lifecycle) are funded off the
    top of the envelope per [A-TN-08]; only those still consuming budget
    count. Cancelled and Retired Type 3s are excluded.
    """
    from models.projects import Project

    valid_stages = list(BACKLOG_STAGES | OPERATE_STAGES)
    rows = (
        db.query(Project)
        .filter(
            Project.is_active.is_(True),
            Project.project_type == 3,
            Project.pipeline_stage.in_(valid_stages),
        )
        .all()
    )
    return sum(_project_walk_budget(p) for p in rows)


def compute_hyper_maintenance_total(db: Session) -> float:
    """Sum of ``total_budget`` for projects in ``OPERATE_STAGES`` per [A-BK-09].

    Hyper-maintenance is a committed overhead deducted before the ranked
    competition begins. Working assumption: we count all OPERATE_STAGES
    (Hyper-maintenance, Operate, Retired) — the spec is silent on whether
    Retired contributes; treating it as zero-cost would require an
    additional filter and the demo data uses Operate as the bucket anyway.
    """
    from models.projects import Project

    rows = (
        db.query(Project)
        .filter(
            Project.is_active.is_(True),
            Project.pipeline_stage.in_(list(OPERATE_STAGES)),
        )
        .all()
    )
    return sum(_project_walk_budget(p) for p in rows)


def compute_contestable_envelope(
    config: RankingConfig,
    type3_total: float,
    hyper_maint_total: float,
) -> float:
    """Contestable envelope per [A-BK-09].

    ``contestable = total_available − type 3 pre-funded − hyper-maintenance committed``.
    Clamped to a non-negative floor so a misconfigured admin value can't
    produce a negative envelope.
    """
    return max(0.0, float(config.total_available_budget) - type3_total - hyper_maint_total)


# ---------------------------------------------------------------------------
# Sort key — composite score plus configured tie-breakers
# ---------------------------------------------------------------------------

# Sentinel for missing values. Pushed to the bottom of the ranking regardless
# of asc/desc — projects without composite_score are unscored placeholders
# (DoI 0 entries, brand-new submissions) and should rank last in DESC order.
_MISSING_DESC = float("-inf")
_MISSING_ASC = float("inf")


def _project_sort_key(project: Any, config: RankingConfig) -> tuple:
    """Build a sort key tuple respecting the tie-breaker order.

    The primary key is always ``-composite_score`` (DESC) so Python's natural
    ascending sort produces highest-score-first. Tie-breakers are applied in
    config order; for each, DESC fields are negated, ASC are kept positive.
    Missing values sink to the bottom regardless of direction.
    """
    primary_score = project.composite_score
    primary_part: tuple = (
        -float(primary_score) if primary_score is not None else _MISSING_ASC,
    )

    tail: list[float] = []
    for field_name, direction in config.tiebreakers:
        if field_name == "composite_score":
            # The primary axis already covers composite_score; ignore here
            # to avoid double-application breaking equality detection.
            continue
        raw = getattr(project, field_name, None)
        if raw is None:
            tail.append(_MISSING_ASC if direction == "asc" else _MISSING_ASC)
            # Note: missing always pushes to the end. For ASC and DESC alike,
            # we use +inf so missing-valued rows lose ties to filled rows.
            continue
        value = float(raw)
        tail.append(value if direction == "asc" else -value)

    # Final stable-sort tiebreaker on project ID so the order is deterministic
    # across test runs and re-renders.
    return primary_part + tuple(tail) + (project.id,)


# ---------------------------------------------------------------------------
# Ranked backlog computation
# ---------------------------------------------------------------------------

def compute_ranked_backlog(
    db: Session,
    config: Optional[RankingConfig] = None,
) -> dict:
    """Build the ranked backlog response per [A-BK-01] [A-PRI-04].

    Two project sets are returned:

    - ``items`` — projects competing in the ranked competition. Filter:
      ``is_active=True, pipeline_stage IN BACKLOG_STAGES,
      (project_type IS NULL OR project_type != 3)``. Sorted by
      :func:`_project_sort_key`. Each item carries cumulative budget
      values (should-be and reality) so the consumer can render the cutoff
      bands without reimplementing the walk.
    - ``pre_funded`` — Type 3 projects in the same stages, shown in the
      separate "Pre-funded" section above the ranked list per [A-TN-08].

    Cutoff lines are computed alongside; see :func:`compute_cutoff_lines`
    for the standalone helper.
    """
    from models.projects import Project

    if config is None:
        config = load_config(db)

    # Pre-funded type 3 first — used both for the response section and for
    # the contestable-envelope calculation.
    type3_rows = (
        db.query(Project)
        .filter(
            Project.is_active.is_(True),
            Project.project_type == 3,
            Project.pipeline_stage.in_(list(BACKLOG_STAGES | OPERATE_STAGES)),
        )
        .all()
    )
    type3_pre_funded_total = sum(_project_walk_budget(p) for p in type3_rows)

    hyper_maintenance_total = compute_hyper_maintenance_total(db)
    envelope = compute_contestable_envelope(
        config, type3_pre_funded_total, hyper_maintenance_total,
    )

    # Ranked competition pool.
    backlog_rows = (
        db.query(Project)
        .filter(
            Project.is_active.is_(True),
            Project.pipeline_stage.in_(list(BACKLOG_STAGES)),
        )
        .all()
    )
    competing = [p for p in backlog_rows if (p.project_type or 0) != 3]
    competing.sort(key=lambda p: _project_sort_key(p, config))

    items: list[dict] = []
    cum_should_be = 0.0
    cum_reality = 0.0
    should_be_cutoff_rank: Optional[int] = None
    reality_cutoff_rank: Optional[int] = None

    for idx, project in enumerate(competing, start=1):
        b = _project_walk_budget(project)
        cum_should_be += b

        # Reality walk uses only currently-committed projects' budgets:
        # ``Active`` (all) plus ``Approved`` with ``within_cutoff == True``.
        # ``within_cutoff is None`` (e.g. Approved during transition) is
        # treated as not-yet-committed and contributes 0 to the walk.
        is_committed = (
            project.pipeline_stage == "Active"
            or (
                project.pipeline_stage == "Approved"
                and project.within_cutoff is True
            )
        )
        if is_committed:
            cum_reality += b

        # First rank where cumulative exceeds envelope marks the cutoff line.
        if should_be_cutoff_rank is None and cum_should_be > envelope:
            should_be_cutoff_rank = idx
        if reality_cutoff_rank is None and cum_reality > envelope:
            reality_cutoff_rank = idx

        items.append({
            "rank": idx,
            "project_id": project.id,
            "project_name": project.name,
            "pipeline_stage": project.pipeline_stage,
            "doi": project.doi,
            "project_type": project.project_type,
            "composite_score": (
                float(project.composite_score)
                if project.composite_score is not None else None
            ),
            "complexity_score": (
                float(project.complexity_score)
                if project.complexity_score is not None else None
            ),
            "value_creation_score": (
                float(project.value_creation_score)
                if project.value_creation_score is not None else None
            ),
            "transformation_level": project.transformation_level,
            "tshirt_size": project.tshirt_size,
            "total_budget": (
                float(project.total_budget)
                if project.total_budget is not None else None
            ),
            "within_cutoff": project.within_cutoff,
            "cumulative_budget_should_be": round(cum_should_be, 2),
            "cumulative_budget_reality": round(cum_reality, 2),
        })

    # Pre-funded section — Type 3 projects sorted by composite score (DESC)
    # for predictable display, even though they don't compete on rank.
    pre_funded = sorted(
        type3_rows,
        key=lambda p: _project_sort_key(p, config),
    )
    pre_funded_items: list[dict] = []
    for project in pre_funded:
        pre_funded_items.append({
            "rank": None,
            "project_id": project.id,
            "project_name": project.name,
            "pipeline_stage": project.pipeline_stage,
            "doi": project.doi,
            "project_type": project.project_type,
            "composite_score": (
                float(project.composite_score)
                if project.composite_score is not None else None
            ),
            "complexity_score": (
                float(project.complexity_score)
                if project.complexity_score is not None else None
            ),
            "value_creation_score": (
                float(project.value_creation_score)
                if project.value_creation_score is not None else None
            ),
            "transformation_level": project.transformation_level,
            "tshirt_size": project.tshirt_size,
            "total_budget": (
                float(project.total_budget)
                if project.total_budget is not None else None
            ),
            "within_cutoff": project.within_cutoff,
            "cumulative_budget_should_be": None,
            "cumulative_budget_reality": None,
        })

    misalignment_start: Optional[int] = None
    misalignment_end: Optional[int] = None
    if should_be_cutoff_rank is not None and reality_cutoff_rank is not None:
        misalignment_start = min(should_be_cutoff_rank, reality_cutoff_rank)
        misalignment_end = max(should_be_cutoff_rank, reality_cutoff_rank)

    cutoff = {
        "total_available_budget": float(config.total_available_budget),
        "type3_pre_funded_total": round(type3_pre_funded_total, 2),
        "hyper_maintenance_committed_total": round(hyper_maintenance_total, 2),
        "contestable_envelope": round(envelope, 2),
        "should_be_cutoff_rank": should_be_cutoff_rank,
        "reality_cutoff_rank": reality_cutoff_rank,
        "misalignment_zone_start": misalignment_start,
        "misalignment_zone_end": misalignment_end,
    }

    return {
        "items": items,
        "total": len(items),
        "pre_funded": pre_funded_items,
        "pre_funded_total": len(pre_funded_items),
        "cutoff": cutoff,
        "config": {
            "total_available_budget": float(config.total_available_budget),
            "tiebreaker_order": [f"{f}:{d}" for f, d in config.tiebreakers],
            "horizon_months": config.horizon_months,
        },
    }


def compute_cutoff_lines(
    db: Session,
    config: Optional[RankingConfig] = None,
) -> dict:
    """Standalone cutoff-lines helper that re-uses :func:`compute_ranked_backlog`.

    Returns just the ``cutoff`` payload — useful for KPI strips that don't
    need the full ranked list.
    """
    return compute_ranked_backlog(db, config=config)["cutoff"]


# ---------------------------------------------------------------------------
# Recompute orchestrator (only DB-mutating function in this module)
# ---------------------------------------------------------------------------

def recompute_within_cutoff_for_backlog(
    db: Session,
    *,
    config: Optional[RankingConfig] = None,
) -> dict:
    """Recompute the ``within_cutoff`` flag for all backlog projects [A-PS-06].

    Logic:

    - For each Approved project at rank N: ``within_cutoff = (cumulative_should_be[N] <= envelope)``.
    - For each non-Approved backlog project (Proposed, Under Evaluation,
      Active, Paused): clear ``within_cutoff`` to ``None``. The flag is only
      meaningful on Approved projects per [A-PS-06]; persisting it elsewhere
      causes confusion in the UI.

    Commits the session before returning. Audit log entries are NOT written
    here because the trigger context is system-driven (no
    :class:`CurrentUser`); the manual rebalance endpoint in
    ``routers/ranking.py`` writes a single high-level audit row covering
    the whole rebalance event.

    Returns ``{"recomputed": int, "changed": int, "cutoff": dict}``.
    """
    if config is None:
        config = load_config(db)

    payload = compute_ranked_backlog(db, config=config)
    envelope = payload["cutoff"]["contestable_envelope"]

    from models.projects import Project

    # Build a project_id -> cumulative_should_be map from the ranked items.
    rank_map: dict[str, float] = {
        item["project_id"]: item["cumulative_budget_should_be"]
        for item in payload["items"]
    }

    backlog_projects = (
        db.query(Project)
        .filter(
            Project.is_active.is_(True),
            Project.pipeline_stage.in_(list(BACKLOG_STAGES)),
        )
        .all()
    )

    recomputed = 0
    changed = 0
    for project in backlog_projects:
        recomputed += 1
        previous = project.within_cutoff
        if project.pipeline_stage == "Approved":
            cumulative = rank_map.get(project.id)
            if cumulative is None:
                # Type 3 (excluded from ranked competition) — clear.
                new_value: Optional[bool] = None
            else:
                new_value = cumulative <= envelope
        else:
            # Non-Approved backlog projects don't carry a within_cutoff flag.
            new_value = None

        if previous != new_value:
            project.within_cutoff = new_value
            changed += 1

    db.commit()

    return {
        "recomputed": recomputed,
        "changed": changed,
        "cutoff": payload["cutoff"],
    }


# ---------------------------------------------------------------------------
# Trigger key sets — used by routers/admin.py to decide whether a parameter
# update should fan out to the ranking recompute.
# ---------------------------------------------------------------------------

# Param key prefixes that should trigger a within_cutoff recompute on edit.
RANKING_RELEVANT_PREFIXES: tuple[str, ...] = ("ranking_", "tn_")


def parameter_key_triggers_recompute(key: str) -> bool:
    """Return True if editing this PlanningParameter key should rebalance.

    ``ranking_*`` keys directly drive the cutoff math (envelope size,
    tie-breakers). ``tn_*`` keys flow through the Tech Navigator scores into
    composite_score which drives the ranking; A1's ``recompute_all_scores``
    runs first, then the ranking recompute updates within_cutoff.
    """
    return any(key.startswith(prefix) for prefix in RANKING_RELEVANT_PREFIXES)
