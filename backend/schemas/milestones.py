"""Pydantic schemas for the Project Milestones API [A-MS-02] [A-MS-03].

Mirrors the project's existing schema conventions:
- List responses follow ``{items: [...], total: N}``.
- Update bodies are partial — any subset of fields can be supplied.
- Baseline-date edits require an ``override_reason`` per [A-MS-03];
  authorization for that path is enforced in the router.
- The ``color`` field on ``MilestoneResponse`` is the *resolved* colour:
  the per-milestone override when set, otherwise the
  ``MilestoneType.default_color`` for the linked type. Resolution happens
  in the router so clients never need to look up the type catalogue.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# MilestoneType — read-only reference catalogue
# ---------------------------------------------------------------------------


class MilestoneTypeResponse(BaseModel):
    """A single entry in the global milestone-type catalogue per [A-BK-34]."""

    id: str
    name: str
    default_color: str
    suggested_ordering: int
    is_active: bool


class MilestoneTypeListResponse(BaseModel):
    """Standard list shape for ``GET /api/admin/milestone-types``."""

    items: list[MilestoneTypeResponse]
    total: int


# ---------------------------------------------------------------------------
# ProjectMilestone — CRUD shapes
# ---------------------------------------------------------------------------


class MilestoneResponse(BaseModel):
    """Full project-milestone record returned by GET / mutation endpoints."""

    id: int
    project_id: str
    sequence_number: int
    name: str
    milestone_type_id: Optional[str]
    baseline_start: str
    baseline_end: str
    forecast_start: str
    forecast_end: str
    color: Optional[str]
    # Resolved colour — own override when set, else MilestoneType.default_color.
    slip_months: int
    # Baseline-end vs forecast-end month delta. Computed in the router.
    baseline_locked_at: Optional[datetime]


class MilestoneListResponse(BaseModel):
    """Standard list shape for ``GET /api/projects/{id}/milestones``."""

    items: list[MilestoneResponse]
    total: int


class MilestoneCreate(BaseModel):
    """Request body for ``POST /api/projects/{id}/milestones``.

    All baseline / forecast dates are required at creation. ``color`` is
    optional — when omitted, the response colour falls back to the linked
    type's ``default_color``.
    """

    sequence_number: int = Field(ge=1)
    name: str = Field(min_length=1, max_length=100)
    milestone_type_id: Optional[str] = None
    baseline_start: str = Field(min_length=7, max_length=7)  # YYYY-MM
    baseline_end: str = Field(min_length=7, max_length=7)
    forecast_start: str = Field(min_length=7, max_length=7)
    forecast_end: str = Field(min_length=7, max_length=7)
    color: Optional[str] = None


class MilestoneUpdate(BaseModel):
    """Partial-update body for ``PUT /api/projects/{id}/milestones/{mid}``.

    Any subset of fields may be supplied. ``override_reason`` is required
    by the router (controller-only) when ``baseline_start`` or
    ``baseline_end`` is included; see [A-MS-03].
    """

    sequence_number: Optional[int] = Field(default=None, ge=1)
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    milestone_type_id: Optional[str] = None
    baseline_start: Optional[str] = Field(default=None, min_length=7, max_length=7)
    baseline_end: Optional[str] = Field(default=None, min_length=7, max_length=7)
    forecast_start: Optional[str] = Field(default=None, min_length=7, max_length=7)
    forecast_end: Optional[str] = Field(default=None, min_length=7, max_length=7)
    color: Optional[str] = None
    override_reason: Optional[str] = None
