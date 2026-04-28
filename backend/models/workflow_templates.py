"""Workflow Template models — Cluster D Session D2.

Implements the data model behind the Workflow Template Editor per
spec ``[D-CAT-07]`` (line ~1660). Each business process — forecast cycle,
intake, change request, send back, milestone baseline override, scheduled
master data activation — is a ``WorkflowTemplate`` with a fixed sequence of
``WorkflowStep`` rows. Steps cannot be structurally rearranged by admins;
``step_order`` is set at seed time and is **not** mutable through the API.
Each step exposes configurable touchpoints (required/skippable, role
assignment, data gates, notifications, time constraints, escalation actions)
stored as plain attributes plus JSON-serialised structures where the shape is
list-like.

Note for Session D2: workflow templates are shipped as **configurable data
only**. Wiring them into live CR / intake / submission flows is a future
session — ``[D-CAT-07]`` editor surface is the deliverable here.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


# Allowed values for a step's ``step_type``. Display only — used by the
# editor UI to render the right card variant per spec line ~1684.
STEP_TYPES = ("action", "review", "gate", "notification")

# Workflow template keys shipped in v5 per spec line ~1673. Used as the
# stable identifier admins reference; ``id`` is the surrogate primary key.
SHIPPED_TEMPLATE_KEYS = (
    "forecast_cycle",
    "intake",
    "change_request",
    "send_back",
    "milestone_baseline_override",
    "scheduled_master_data_activation",
)

# Predefined escalation actions per spec line ~1671. Steps store one of
# these strings (or NULL for "none").
ESCALATION_ACTIONS = ("reminder", "escalate_to_manager", "auto_skip", "block")


class WorkflowTemplate(Base):
    """A business-process workflow with a fixed sequence of configurable steps.

    Six templates ship in v5 — see ``SHIPPED_TEMPLATE_KEYS``. Admins can
    toggle ``is_active``, edit step touchpoints, and view the template, but
    cannot add or reorder steps (per ``[D-CAT-07]`` "fixed sequence").
    """

    __tablename__ = "workflow_templates"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    key: Mapped[str] = mapped_column(String(60), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    modified_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    steps: Mapped[list["WorkflowStep"]] = relationship(
        back_populates="template",
        cascade="all, delete-orphan",
        order_by="WorkflowStep.step_order",
    )


class WorkflowStep(Base):
    """A single step within a ``WorkflowTemplate``.

    ``step_order`` is set at template creation and is **not** mutable
    through the admin API (per ``[D-CAT-07]`` "admin cannot structurally
    rearrange"). ``required`` / ``skippable`` and the touchpoint columns are
    editable. ``data_gates_json`` stores a JSON list of completeness criteria
    (DoI gate pattern). ``notifications_json`` stores a JSON object with
    ``on_start`` / ``on_overdue`` / ``on_completion`` recipient configs.
    """

    __tablename__ = "workflow_steps"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    template_id: Mapped[int] = mapped_column(
        ForeignKey("workflow_templates.id"), nullable=False
    )
    step_order: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    step_type: Mapped[str] = mapped_column(String(20), nullable=False, default="action")

    # Touchpoint: required or skippable
    required: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    skippable: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Touchpoint: who performs this step (CRETA role string).
    assigned_role: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)

    # Touchpoint: data gates (JSON list of field-completeness criteria).
    data_gates_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Touchpoint: notifications (JSON object). See module docstring.
    notifications_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Touchpoint: per-step deadline in days from step start. NULL = open-ended.
    time_constraint_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Touchpoint: escalation action on missed deadline. One of ESCALATION_ACTIONS or NULL.
    escalation_action: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)

    template: Mapped["WorkflowTemplate"] = relationship(back_populates="steps")
    actions: Mapped[list["StepAction"]] = relationship(
        back_populates="step",
        cascade="all, delete-orphan",
        order_by="StepAction.action_order",
    )


class StepAction(Base):
    """A predefined action attached to a step.

    Multi-action steps (e.g., a review step with both "approve" and "send back"
    actions) carry one ``StepAction`` row per action. ``config_json`` holds
    action-specific parameters (e.g., target stage for a transition action).
    """

    __tablename__ = "workflow_step_actions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    step_id: Mapped[int] = mapped_column(ForeignKey("workflow_steps.id"), nullable=False)
    action_order: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    action_type: Mapped[str] = mapped_column(String(40), nullable=False)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    config_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    step: Mapped["WorkflowStep"] = relationship(back_populates="actions")
