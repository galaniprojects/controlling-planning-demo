"""Pydantic schemas for the ranking / backlog API [A-BK-09..A-BK-14].

Shapes:

- ``RankedProjectItem`` — one row in the ranked list (or pre-funded section).
- ``CutoffLines`` — should-be / reality cutoff positions plus the envelope.
- ``RankingConfigSnapshot`` — active config returned alongside the data so
  the UI does not need a second admin call to render axis labels.
- ``RankedBacklogResponse`` — full GET payload (items + pre_funded + cutoff
  + config).
- ``CutoffLinesResponse`` — slimmer GET payload for KPI strips.
- ``RebalanceResponse`` — POST .../rebalance result.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class RankedProjectItem(BaseModel):
    """One row in the ranked backlog list.

    ``rank`` is None for items in the pre-funded (Type 3) section since
    those projects don't compete in the ranked competition. The cumulative
    budget fields are likewise None for pre-funded entries.
    """

    rank: Optional[int]
    project_id: str
    project_name: str
    pipeline_stage: Optional[str]
    doi: Optional[int]
    project_type: Optional[int]
    composite_score: Optional[float]
    complexity_score: Optional[float]
    value_creation_score: Optional[float]
    transformation_level: Optional[str]
    tshirt_size: Optional[str]
    total_budget: Optional[float]
    within_cutoff: Optional[bool]
    cumulative_budget_should_be: Optional[float]
    cumulative_budget_reality: Optional[float]


class CutoffLines(BaseModel):
    """Cutoff line positions and the envelope inputs that produced them.

    ``should_be_cutoff_rank`` and ``reality_cutoff_rank`` are 1-based
    positions of the FIRST project whose cumulative budget exceeds the
    contestable envelope. ``None`` means the envelope was never exhausted
    (every backlog project fits).
    """

    total_available_budget: float
    type3_pre_funded_total: float
    execution_committed_total: float
    contestable_envelope: float
    should_be_cutoff_rank: Optional[int]
    reality_cutoff_rank: Optional[int]
    misalignment_zone_start: Optional[int]
    misalignment_zone_end: Optional[int]


class RankingConfigSnapshot(BaseModel):
    """Active ranking configuration as observed at recompute time."""

    total_available_budget: float
    tiebreaker_order: list[str]
    horizon_months: int


class RankedBacklogResponse(BaseModel):
    """Full GET ``/api/portfolio/backlog`` payload.

    Items are ordered by composite_score with tie-breakers applied per the
    config snapshot. ``pre_funded`` carries Type 3 projects shown separately
    above the ranked list per [A-TN-08].
    """

    items: list[RankedProjectItem] = Field(default_factory=list)
    total: int
    pre_funded: list[RankedProjectItem] = Field(default_factory=list)
    pre_funded_total: int
    cutoff: CutoffLines
    config: RankingConfigSnapshot


class CutoffLinesResponse(BaseModel):
    """Slim GET ``/api/portfolio/backlog/cutoff`` payload."""

    cutoff: CutoffLines
    config: RankingConfigSnapshot


class RebalanceResponse(BaseModel):
    """POST ``/api/portfolio/backlog/rebalance`` response.

    ``recomputed`` is the number of projects considered; ``changed`` is the
    subset whose ``within_cutoff`` value actually moved.
    """

    recomputed: int
    changed: int
    cutoff: CutoffLines
