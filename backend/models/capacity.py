from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class Allocation(Base):
    """Person x Project x Month allocation hours."""
    __tablename__ = "allocations"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    person_id: Mapped[str] = mapped_column(ForeignKey("people.id"), nullable=False)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), nullable=False)
    month: Mapped[str] = mapped_column(String(7), nullable=False)  # YYYY-MM
    hours: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    is_confirmed: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Relationships
    person: Mapped["Person"] = relationship(back_populates="allocations")
    project: Mapped["Project"] = relationship(back_populates="allocations")


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
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    modified_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    project: Mapped["Project"] = relationship()
    cost_center: Mapped["CostCenter"] = relationship()
    role_type: Mapped[Optional["RoleType"]] = relationship()
    assigned_person: Mapped[Optional["Person"]] = relationship()
