"""Frozen interface contract for the project-scope recompute core (spec §5, §6).

These dataclasses are the seam between the four Session-1 workstreams:
  - resolution.py / macros.py (Stream A) PRODUCE a ``ResolvedGrid``.
  - rollup.py (Stream B) CONSUMES a ``ResolvedGrid`` → ``ProjectStateDict`` + ``GridSplits``.
  - routing.py (Stream C) turns Layer-2 overlay entries into ``RoutableDiff`` and
    routes them directly, and the write paths consume the resolved grid.

Do NOT change these shapes without re-freezing the contract — every stream
builds against them. These are in-memory only; persistence lives in the
Layer-1/Layer-2 models (``models/scenarios.py``) and the live Forecast /
external-cost rows.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional, TypedDict


# Resolved-grid line kinds (mirror models.scenarios.OVERLAY_LINE_KINDS).
LINE_KIND_INTERNAL = "internal_role"
LINE_KIND_EXTERNAL = "external_cost"


@dataclass
class ResolvedCell:
    """One (line, month) cell after anchor → macros → overlay resolution.

    ``hours`` is populated for internal role lines (None for external lines);
    ``amount_eur`` is always the resolved euro value for the cell.
    """

    amount_eur: float
    hours: Optional[float] = None


@dataclass
class ResolvedLine:
    """One forecast line in the resolved grid, with its per-month cells.

    ``line_key`` is the natural composite ("category|sub_category|role_type_id")
    for existing lines, or a minted id ("new:role:<uuid>" / "new:ext:<uuid>")
    for lines added via the overlay. ``cells`` maps absolute "YYYY-MM" →
    ResolvedCell. ``kind`` is one of LINE_KIND_*.
    """

    line_key: str
    category: str                       # "internal" | "external"
    kind: str                           # LINE_KIND_INTERNAL | LINE_KIND_EXTERNAL
    sub_category: Optional[str] = None
    role_type_id: Optional[str] = None
    vendor: Optional[str] = None
    cells: dict[str, ResolvedCell] = field(default_factory=dict)


@dataclass
class ResolvedGrid:
    """The fully-resolved project plan: per-line, per-month internal hours /
    external €, plus the resolved project start/end. Stream B rolls this up into
    the per-project state shape the existing engine already emits, so the impact
    dashboard is insulated from the change (spec §6).
    """

    project_id: str
    lines: list[ResolvedLine] = field(default_factory=list)
    start_month: Optional[str] = None   # YYYY-MM
    end_month: Optional[str] = None     # YYYY-MM


@dataclass
class MacroApplyResult:
    """Result of applying the ordered macro list (Layer 1) to a grid: the
    transformed grid plus human-readable notes — e.g. an accelerate clamp
    message the recalculate response surfaces to the user (spec §4).
    """

    grid: ResolvedGrid
    notes: list[str] = field(default_factory=list)


class ProjectStateDict(TypedDict):
    """The per-project state shape the existing engine emits
    (``recalculate_scenario`` → ``project_states[]``). Stream B's rollup MUST
    reproduce this exactly so the impact dashboard stays insulated (spec §6).
    Project start/end are NOT part of this dict (matching the current engine);
    they are read from ``ResolvedGrid.start_month`` / ``end_month`` when the
    caller persists a ``ScenarioState`` row.
    """

    project_id: str
    project_name: str
    original_budget: float
    adjusted_budget: float
    budget_delta: float
    original_rag: Optional[str]
    adjusted_rag: Optional[str]
    is_affected: bool


@dataclass
class GridSplits:
    """Internal/external and per-role euro splits read off the resolved grid for
    the investment-mix and outsourcing-ratio dashboard dimensions (spec §6, §7) —
    additive to the per-project state shape, which the legacy single-budget
    scalar could not express.
    """

    internal_eur: float = 0.0
    external_eur: float = 0.0
    by_role: dict[str, float] = field(default_factory=dict)   # role_type_id → €


# Routing kinds an overlay entry can present (drives the lever_category mapping).
ROUTABLE_KIND_CELL = "cell"
ROUTABLE_KIND_LINE = "line"
ROUTABLE_KIND_MIX = "mix"
ROUTABLE_KIND_PLAN = "plan"


@dataclass
class RoutableDiff:
    """A single routable unit fed DIRECTLY to the promote routing decision
    (spec §6) — no synthetic-action round-trip. Both a ``ScenarioAction`` (macros,
    portfolio, lever-12) and an individual Layer-2 overlay entry can present this
    shape, so each overlay entry is individually routable and promotable (partial
    promote preserved).

    ``lever_category`` is the existing routing key (forecast_grid, people,
    pipeline_stage, cost_allocation, ...). ``own`` is resolved by the caller
    (project.pl_person_id vs the acting controller) where it applies, else None.
    ``ref`` carries the originating row id / line_key for audit + write-back.
    """

    lever_category: str
    project_id: Optional[str]
    scope: str                          # "project" | "portfolio"
    kind: str                           # ROUTABLE_KIND_*
    line_key: Optional[str] = None
    month: Optional[str] = None
    field: Optional[str] = None
    own: Optional[bool] = None
    ref: Optional[str] = None
