"""Scheduled change models — Cluster D Session D2.

Master-data changes can carry an optional activation date per spec
lines ~1592–1610 and ~2456. Default behaviour (no date specified) is
immediate; the calendar affordance schedules the change for a future date.
The five lifecycle states surfaced in the global Scheduled Changes panel
match spec lines ~1598–1605.

Activation runs through ``services.scheduled_change_activation``; it is a
manual-trigger endpoint in v5 (cron wiring is deployment concern — see
PROGRESS.md). All activation events are audit-logged under category
``scheduled_change_lifecycle``.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy import Date, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


# Lifecycle states per spec lines ~1598–1605.
SCHEDULED_CHANGE_STATES = (
    "pending_review",
    "approved",
    "activated",
    "rejected",
    "cancelled",
)


class ScheduledChange(Base):
    """A pending master-data change awaiting review and activation.

    The ``entity_type`` / ``entity_id`` pair identifies the live record being
    modified. ``pending_values_json`` is a JSON object of column→new-value pairs
    for the activation engine to apply. ``activation_date`` is the calendar day
    on which the change should land. Past correction → ``activation_date`` is
    today; scheduled change → today-or-future (validated at create time).
    """

    __tablename__ = "scheduled_changes"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(60), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    pending_values_json: Mapped[str] = mapped_column(Text, nullable=False)

    activation_date: Mapped[date] = mapped_column(Date, nullable=False)
    review_status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="pending_review"
    )

    created_by_person_id: Mapped[str] = mapped_column(
        ForeignKey("people.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    reviewed_by_person_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("people.id"), nullable=True
    )
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    review_comments: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    activated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    activation_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_by: Mapped["Person"] = relationship(foreign_keys=[created_by_person_id])
    reviewed_by: Mapped[Optional["Person"]] = relationship(
        foreign_keys=[reviewed_by_person_id]
    )
