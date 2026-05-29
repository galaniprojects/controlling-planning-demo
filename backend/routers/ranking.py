"""Ranking / backlog API [A-PRI-01..A-PRI-04] [A-BK-09..A-BK-14].

Three endpoints mounted at ``/api/portfolio``:

- GET  ``/backlog``           — full ranked list + cutoff lines + pre-funded
                                  Type 3 section + config snapshot. Open to
                                  any authenticated role.
- GET  ``/backlog/cutoff``    — slim cutoff summary for KPI strips.
- POST ``/backlog/rebalance`` — controller-only manual recompute trigger.
                                  Writes a single high-level audit row covering
                                  the rebalance event.

The system-driven recompute hook ``recompute_within_cutoff_for_backlog`` is
called from six other endpoints listed in [A-BK-14]:

1. ``routers/portfolio.py::approve_project`` — project enters Approved.
2. ``routers/portfolio.py::approve_cr`` — CR-driven forecast/budget change.
3. ``routers/workbench.py::accept_cr_changes`` — workbench-driven forecast change.
4. ``routers/admin.py::recompute_scores`` — TN composite scores changed.
5. ``routers/admin.py::update_parameters`` — when key matches ``ranking_*``
   or ``tn_*`` (composite_score feeds the ranking).
6. ``routers/pipeline.py::transition_pipeline`` — stage change in/out of backlog.
7. ``routers/workbench.py::submit_forecast_cycle`` — cycle completion.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user, require_role
from routers.admin import _log_audit
from schemas.common import CurrentUser
from schemas.ranking import (
    CutoffLines,
    CutoffLinesResponse,
    RankedBacklogResponse,
    RankedProjectItem,
    RankingConfigSnapshot,
    RebalanceResponse,
)
from services.ranking import (
    compute_ranked_backlog,
    load_config,
    recompute_within_cutoff_for_backlog,
)


router = APIRouter(prefix="/api/portfolio", tags=["Backlog"])


# ---------------------------------------------------------------------------
# Internal builder
# ---------------------------------------------------------------------------

def _build_response(
    payload: dict,
    *,
    pipeline_stage_filter: list[str] | None = None,
    project_type_filter: int | None = None,
    tshirt_size_filter: list[str] | None = None,
) -> RankedBacklogResponse:
    """Convert the service payload into the Pydantic response model.

    Filters apply to ``items`` only; cutoff line positions remain unchanged
    regardless of any filter — per spec the cutoff bands always reflect the
    full portfolio reality so a sliced view doesn't produce misleading
    "everything fits" impressions.
    """
    cutoff = CutoffLines(**payload["cutoff"])
    config = RankingConfigSnapshot(**payload["config"])

    def _passes(item: dict) -> bool:
        if pipeline_stage_filter and item["pipeline_stage"] not in pipeline_stage_filter:
            return False
        if project_type_filter is not None and item["project_type"] != project_type_filter:
            return False
        if tshirt_size_filter and item["tshirt_size"] not in tshirt_size_filter:
            return False
        return True

    filtered_items = [item for item in payload["items"] if _passes(item)]
    filtered_pre_funded = [item for item in payload["pre_funded"] if _passes(item)]

    return RankedBacklogResponse(
        items=[RankedProjectItem(**item) for item in filtered_items],
        total=len(filtered_items),
        pre_funded=[RankedProjectItem(**item) for item in filtered_pre_funded],
        pre_funded_total=len(filtered_pre_funded),
        cutoff=cutoff,
        config=config,
    )


# ---------------------------------------------------------------------------
# GET — full ranked backlog
# ---------------------------------------------------------------------------

@router.get("/backlog", response_model=RankedBacklogResponse)
def get_backlog(
    pipeline_stage: list[str] | None = Query(default=None),
    project_type: int | None = Query(default=None),
    tshirt_size: list[str] | None = Query(default=None),
    start_year: int | None = Query(default=None),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Return the ranked backlog with cutoff lines and pre-funded section.

    Open to all authenticated roles (controller, executive, project lead,
    cost-centre owner) per the spec's "Full backlog, all projects" row.

    Optional query params:

    - ``pipeline_stage`` (multi) — narrow the visible stages.
    - ``project_type`` — narrow to one of 1/2/3.
    - ``tshirt_size`` (multi) — narrow to one or more size buckets.
    - ``start_year`` — scope the ranked pool AND the cutoff walk to projects
      starting in that fiscal year (VIPER §4.2). Unlike the visibility
      filters above, this re-scopes the envelope/lines: only projects that
      begin consuming budget in the selected year compete for it. Read-time
      only — never writes the persisted ``within_cutoff`` flag (§6.4).

    The ``pipeline_stage`` / ``project_type`` / ``tshirt_size`` filters affect
    visibility only; cutoff line positions reflect the (optionally
    year-scoped) portfolio reality per the spec.
    """
    payload = compute_ranked_backlog(db, start_year=start_year)
    return _build_response(
        payload,
        pipeline_stage_filter=pipeline_stage,
        project_type_filter=project_type,
        tshirt_size_filter=tshirt_size,
    )


# ---------------------------------------------------------------------------
# GET — cutoff summary only
# ---------------------------------------------------------------------------

@router.get("/backlog/cutoff", response_model=CutoffLinesResponse)
def get_cutoff(
    start_year: int | None = Query(default=None),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Return just the cutoff summary plus active config snapshot.

    Cheaper than ``/backlog`` for the launchpad / KPI strip use-case where
    the full ranked list isn't needed. ``start_year`` scopes the walk to one
    fiscal year (read-time view, VIPER §6.4), matching ``/backlog``.
    """
    payload = compute_ranked_backlog(db, start_year=start_year)
    return CutoffLinesResponse(
        cutoff=CutoffLines(**payload["cutoff"]),
        config=RankingConfigSnapshot(**payload["config"]),
    )


# ---------------------------------------------------------------------------
# POST — manual rebalance (controller-only)
# ---------------------------------------------------------------------------

@router.post("/backlog/rebalance", response_model=RebalanceResponse)
def rebalance_backlog(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Manually trigger a within_cutoff recompute across the backlog [A-BK-14].

    Controller-only — used when external context changes (e.g. KB confirms
    a new total available budget mid-cycle) and the controller wants to
    force a recompute outside the automatic trigger sites.

    Writes one audit row (``entity_type='within_cutoff', action='rebalance'``)
    summarising how many projects were touched. Per-project flag flips are
    not individually audited because the rebalance is intentionally
    deterministic given the inputs.
    """
    config = load_config(db)
    result = recompute_within_cutoff_for_backlog(db, config=config)

    _log_audit(
        db, user,
        entity_type="within_cutoff",
        entity_id="portfolio",
        entity_name="Backlog rebalance",
        action="rebalance",
        field_changed="within_cutoff",
        old_value=None,
        new_value=(
            f"{result['changed']} of {result['recomputed']} projects updated; "
            f"envelope={result['cutoff']['contestable_envelope']:.2f}, "
            f"should_be_rank={result['cutoff']['should_be_cutoff_rank']}, "
            f"reality_rank={result['cutoff']['reality_cutoff_rank']}"
        ),
        category="pipeline_transitions",
    )
    db.commit()

    return RebalanceResponse(
        recomputed=result["recomputed"],
        changed=result["changed"],
        cutoff=CutoffLines(**result["cutoff"]),
    )
