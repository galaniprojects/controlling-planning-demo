"""Pydantic schemas for the v5 intake workflow [A-BK-26..A-BK-29] [A-DOI-04].

Six shapes:

- ``IntakeProjectCreate`` — body for ``POST /api/intake/projects``. Lightweight
  per [A-DOI-04]; only fields required *to be a backlog entry at DoI 0*.
- ``IntakeProjectResponse`` — response after creation, embeds the new
  pipeline state so the caller can render the backlog row immediately.
- ``IntakeApproveAction`` / ``IntakeSendBackAction`` / ``IntakeRejectAction`` —
  bodies for the three controller actions on Under Evaluation projects per
  [A-BK-27].
- ``IntakeResubmitAction`` — body for the PL's resubmission per [A-BK-29].
- ``IntakeDiffResponse`` — diff payload for the before/after view per
  [A-BK-29].
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class IntakeProjectCreate(BaseModel):
    """Lightweight DoI 0 (Proposed) project creation body per [A-DOI-04].

    Required: ``name``, ``description``, ``lob_id``, ``project_type``,
    ``capex_opex``, ``start_month``. All other [A-DOI-04] fields
    (Problem Statement / Business Driver / Expected Outcome / Current State
    structured prompts, requesting business unit, demand type, value stream,
    Wave ID, attachments) are deferred to a follow-on session per [A-DA-02]
    and [A-DA-03] — the columns do not exist on ``Project`` yet. ``description``
    is treated as the proxy holder for the structured sections until then.

    ``pl_person_id`` is optional: when omitted and the caller is a Project
    Lead, the service substitutes ``current_user.person_id``. Controllers
    must supply ``pl_person_id`` explicitly when creating on behalf of a PL.
    """

    name: str = Field(min_length=1, max_length=300)
    description: str = Field(min_length=1)
    lob_id: str
    project_type: int = Field(ge=1, le=3)
    capex_opex: str = Field(default="capex", pattern="^(capex|opex)$")
    start_month: str = Field(pattern=r"^\d{4}-\d{2}$")
    end_month: Optional[str] = Field(default=None, pattern=r"^\d{4}-\d{2}$")
    pl_person_id: Optional[str] = None
    is_service: bool = False


class IntakeProjectResponse(BaseModel):
    """Response after intake creation — enough to render the new backlog row."""

    id: str
    name: str
    pipeline_stage: str
    doi: int
    review_state: Optional[str]
    pl_person_id: Optional[str]
    project_type: int
    composite_score: Optional[float]
    total_budget: Optional[float]


class IntakeApproveAction(BaseModel):
    """Controller approve from Under Evaluation per [A-BK-27].

    Optional comments are captured in the audit log and notified to the PL.
    """

    comments: Optional[str] = None


class IntakeSendBackAction(BaseModel):
    """Controller send back from Under Evaluation per [A-BK-27] / [A-BK-29].

    ``comments`` is mandatory — the PL needs a reason to revise.
    """

    comments: str = Field(min_length=1)


class IntakeRejectAction(BaseModel):
    """Controller reject from Under Evaluation per [A-BK-27].

    Cancellation is "nearly one-way" per [A-PS-10]; ``reason`` is mandatory
    so the audit trail captures intent. The reject endpoint also writes the
    reason into ``Project.submission_feedback`` so the rejected card can
    surface why.
    """

    reason: str = Field(min_length=1)


class IntakeResubmitAction(BaseModel):
    """PL resubmit after Send Back per [A-BK-29].

    ``resubmission_notes`` are optional; when supplied they go onto the
    snapshot row and the controller notification.
    """

    resubmission_notes: Optional[str] = None


class IntakeDiffField(BaseModel):
    """Single field-level diff entry. ``before`` and ``after`` are stringified
    so the UI can render them uniformly across types (numeric scores, enums,
    strings, IDs). The ``changed`` flag short-circuits "everything is the same"
    rendering."""

    field: str
    label: str
    before: Optional[str]
    after: Optional[str]
    changed: bool


class IntakeDiffResponse(BaseModel):
    """Before/after diff for a project that has been sent back and resubmitted
    per [A-BK-29]. The two snapshots compared are:

    - ``before``: the most recent ``controller_sent_back`` snapshot (taken at
      the moment the controller pressed Send Back).
    - ``after``: the most recent ``pl_resubmitted`` snapshot when present,
      else the project's live state (PL is actively editing).

    The caller passes ``?type=resubmit`` (default) to compare the two
    snapshots, or ``?type=current`` to compare the sent-back snapshot against
    the project's current live values (used when the PL has not yet pressed
    Resubmit but the controller wants to peek at edits in flight).
    """

    project_id: str
    project_name: str
    diff_type: str
    has_baseline: bool
    fields: list[IntakeDiffField]
    sent_back_at: Optional[str]
    resubmitted_at: Optional[str]
    sent_back_comments: Optional[str]
    resubmission_notes: Optional[str]
