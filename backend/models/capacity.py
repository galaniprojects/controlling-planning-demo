from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class Allocation(Base):
    """Person × ChargeableEntity × Month allocation hours.

    Originally introduced in v5 Session A2 as a project-only allocation table
    (``project_id`` FK to ``projects.id``). v5 Session F2 (Cluster F) extends
    the model to be polymorphic per [F-DM-01]: an allocation can be made
    against any ``ChargeableEntity`` (Project, Offering, or InternalService).

    The ``project_id`` column is retained for backward compatibility with the
    capacity router and CR-allocation code paths that still address allocations
    by project. The new ``chargeable_entity_id`` column is populated alongside
    it for entity_type='Project' rows (1:1 with the project's ChargeableEntity)
    and is the canonical FK for new code paths consuming Cluster F semantics.
    A future session may drop ``project_id`` once all callers migrate.
    """
    __tablename__ = "allocations"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    person_id: Mapped[str] = mapped_column(ForeignKey("people.id"), nullable=False)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), nullable=False)
    chargeable_entity_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("chargeable_entities.id"), nullable=True,
    )
    # NULL on legacy rows; backfilled by seed.sql for all v5 rows. Nullable so
    # existing v4 capacity-router paths that insert allocations without a
    # ChargeableEntity reference continue to work — F-cluster code paths that
    # need polymorphic semantics fall back to looking up the ChargeableEntity
    # by project_id when this column is NULL.
    month: Mapped[str] = mapped_column(String(7), nullable=False)  # YYYY-MM
    hours: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    is_confirmed: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Relationships
    person: Mapped["Person"] = relationship(back_populates="allocations")
    project: Mapped["Project"] = relationship(back_populates="allocations")
    chargeable_entity = relationship(
        "ChargeableEntity", foreign_keys=[chargeable_entity_id],
    )


class ResourceRequest(Base):
    """Stage 1 items — resource or external cost requests directed to CC Owners."""
    __tablename__ = "resource_requests"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    change_request_id: Mapped[Optional[int]] = mapped_column(ForeignKey("change_requests.id"), nullable=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), nullable=False)
    cost_center_id: Mapped[str] = mapped_column(ForeignKey("cost_centers.id"), nullable=False)
    request_type: Mapped[str] = mapped_column(String(20), nullable=False)
    # request_type: resource / external_cost
    role_type_id: Mapped[Optional[str]] = mapped_column(ForeignKey("role_types.id"), nullable=True)
    cost_type_id: Mapped[Optional[str]] = mapped_column(ForeignKey("external_cost_types.id"), nullable=True)
    hours_or_amount_per_month: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    period_start: Mapped[str] = mapped_column(String(7), nullable=False)  # YYYY-MM
    period_end: Mapped[str] = mapped_column(String(7), nullable=False)  # YYYY-MM
    priority: Mapped[str] = mapped_column(String(10), nullable=False)  # high / medium / low
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    # status: pending / confirmed / partially_fulfilled / counter_proposed / declined
    assigned_person_id: Mapped[Optional[str]] = mapped_column(ForeignKey("people.id"), nullable=True)
    adjusted_value: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    explanation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    original_hours_per_month: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    change_direction: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # "increase" / "decrease"
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    modified_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    project: Mapped["Project"] = relationship()
    cost_center: Mapped["CostCenter"] = relationship()
    role_type: Mapped[Optional["RoleType"]] = relationship()
    assigned_person: Mapped[Optional["Person"]] = relationship()
    assignments: Mapped[list["ResourceRequestAssignment"]] = relationship(
        back_populates="resource_request", cascade="all, delete-orphan"
    )


class ResourceRequestAssignment(Base):
    """Per-month person assignment for a resource request.

    Each row represents one person assigned to one month of a resource request.
    The unique constraint on (resource_request_id, month, person_id) allows multiple
    people to share a single request-month (multi-person partial assignment per §9.5).
    Previously constrained to (resource_request_id, month) — relaxed in v5.2 W1.
    """
    __tablename__ = "resource_request_assignments"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    resource_request_id: Mapped[int] = mapped_column(ForeignKey("resource_requests.id"), nullable=False)
    month: Mapped[str] = mapped_column(String(7), nullable=False)  # YYYY-MM
    person_id: Mapped[str] = mapped_column(ForeignKey("people.id"), nullable=False)
    hours: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    modified_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint(
            "resource_request_id", "month", "person_id",
            name="uq_rra_request_month_person",
        ),
    )

    # Relationships
    resource_request: Mapped["ResourceRequest"] = relationship(back_populates="assignments")
    person: Mapped["Person"] = relationship()


class CapacityActionLog(Base):
    """Audit trail for every significant capacity action (v5.2 §12.10).

    Records confirmation, decline, assignment-save, and re-confirmation
    events with structured detail for the history page (§12.11–§12.15).
    Written server-side only — no client-side writes.

    ``acting_user_id`` references ``people.id`` (a string), consistent with
    the existing ``AuditLog.user_person_id`` FK pattern.  The raw-SQL DDL in
    the spec uses ``INTEGER`` because the spec was drafted before the string-ID
    convention was confirmed; the SQLAlchemy model is authoritative.

    Action types (``action_type``) per spec §12.10:
        confirm          — project-level confirmation (all roles covered)
        partial_confirm  — project- or request-level partial confirmation
        decline          — project-level decline
        decline_request  — single-request decline within the assignment panel
        assign_draft     — assignment draft saved (not yet confirmed)
        cr_reconfirm     — re-confirmation triggered by a Change Request
    """
    __tablename__ = "capacity_action_log"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        server_default="CURRENT_TIMESTAMP",
    )
    action_type: Mapped[str] = mapped_column(String(20), nullable=False)
    acting_user_id: Mapped[str] = mapped_column(ForeignKey("people.id"), nullable=False)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), nullable=False)
    cost_center_id: Mapped[str] = mapped_column(ForeignKey("cost_centers.id"), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    # Human-readable: "Confirmed 3 roles, 720h total for Predictive Maintenance PoC"
    detail_payload: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # JSON blob — see §12.10 for schema:
    # {
    #   "requests_affected": [{"request_id": N, "role": "...", "months": N, "hours": N}],
    #   "assignments": [{"person_id": "...", "person_name": "...", "months": [...], "hours_per_month": N}],
    #   "cr_id": null | N,
    #   "decline_reason": null | "..."
    # }
    cr_id: Mapped[Optional[int]] = mapped_column(ForeignKey("change_requests.id"), nullable=True)
    # Non-null when the action was triggered by a Change Request.

    __table_args__ = (
        Index("ix_capacity_action_log_user", "acting_user_id", "timestamp"),
        Index("ix_capacity_action_log_project", "project_id", "timestamp"),
        Index("ix_capacity_action_log_cc", "cost_center_id", "timestamp"),
        Index("ix_capacity_action_log_time", "timestamp"),
    )

    # Relationships
    acting_user: Mapped["Person"] = relationship(foreign_keys=[acting_user_id])
    project: Mapped["Project"] = relationship(foreign_keys=[project_id])
    cost_center: Mapped["CostCenter"] = relationship(foreign_keys=[cost_center_id])
    change_request = relationship("ChangeRequest", foreign_keys=[cr_id])
