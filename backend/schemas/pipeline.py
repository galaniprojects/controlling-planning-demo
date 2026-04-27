"""Pydantic schemas for the pipeline-stage / DoI API [A-PS-05] [A-PS-06].

The router exposes four shapes:

- ``PipelineStateResponse`` — full GET payload, embeds ``GateStatus``.
- ``StageTransitionRequest`` — body for POST .../transition.
- ``AICouncilUpdate`` — body for PUT .../ai-council ([A-DOI-03]).
- ``WithinCutoffSet`` — body for PUT .../within-cutoff (manual setter for A2;
  A3 replaces with the computed value driven by the envelope walk).
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class GateStatus(BaseModel):
    """Snapshot of the active DoI gate vs. the project's current data state."""

    current_doi: Optional[int]
    next_doi: Optional[int]
    missing_fields: list[str] = Field(default_factory=list)
    can_advance: bool
    override_available: bool


class PipelineStateResponse(BaseModel):
    """Full pipeline state for a project, returned by GET .../pipeline."""

    project_id: str
    pipeline_stage: Optional[str]
    doi: Optional[int]
    frozen_doi: Optional[int]
    ai_council_approved: bool
    ai_council_doc_url: Optional[str]
    within_cutoff: Optional[bool]
    transitions_available: list[str] = Field(default_factory=list)
    gate_status: GateStatus


class StageTransitionRequest(BaseModel):
    """POST body for stage transitions.

    ``target_doi`` is optional — when omitted the service applies the default
    DoI for the target stage. ``override_reason`` is required when crossing a
    failed DoI gate or leaving Cancelled per [A-PS-10] / [A-BK-30].
    """

    target_stage: str
    target_doi: Optional[int] = Field(default=None, ge=0, le=5)
    override_reason: Optional[str] = None


class AICouncilUpdate(BaseModel):
    """PUT body for setting the AI Council screening flag + document link."""

    ai_council_approved: bool
    ai_council_doc_url: Optional[str] = None


class WithinCutoffSet(BaseModel):
    """PUT body for the manual within_cutoff setter (A2-only).

    A3 will replace this endpoint with the computed value coming out of the
    ranking engine's envelope walk per [A-PS-06]. ``reason`` is captured in
    the audit log so manual overrides are traceable.
    """

    within_cutoff: bool
    reason: Optional[str] = None
