from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class RoleType(Base):
    __tablename__ = "role_types"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    people: Mapped[list["Person"]] = relationship(back_populates="role_type")
    rate_entries: Mapped[list["RateTable"]] = relationship(back_populates="role_type")


class Person(Base):
    __tablename__ = "people"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    role_type_id: Mapped[str] = mapped_column(ForeignKey("role_types.id"), nullable=False)
    cost_center_id: Mapped[Optional[str]] = mapped_column(ForeignKey("cost_centers.id"), nullable=True)
    competence_center_id: Mapped[Optional[str]] = mapped_column(ForeignKey("competence_centers.id"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    modified_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    role_type: Mapped["RoleType"] = relationship(back_populates="people")
    cost_center: Mapped[Optional["CostCenter"]] = relationship(back_populates="people")
    competence_center: Mapped[Optional["CompetenceCenter"]] = relationship(back_populates="people")
    allocations: Mapped[list["Allocation"]] = relationship(back_populates="person")


class RateTable(Base):
    __tablename__ = "rate_table"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    role_type_id: Mapped[str] = mapped_column(ForeignKey("role_types.id"), nullable=False)
    competence_center_id: Mapped[str] = mapped_column(ForeignKey("competence_centers.id"), nullable=False)
    # S6 location-aware rates: workforce location this rate applies to
    # (loc-muc / loc-bud / loc-pun). Nullable for back-compat; resolve_hourly_rate
    # prefers an exact-location row, then loc-muc, then any location for the role.
    location_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("locations.id"), nullable=True
    )
    hourly_rate: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    effective_date: Mapped[str] = mapped_column(String(10), nullable=False)  # YYYY-MM-DD
    previous_rate: Mapped[Optional[float]] = mapped_column(Numeric(10, 2), nullable=True)
    previous_effective_date: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    role_type: Mapped["RoleType"] = relationship(back_populates="rate_entries")
    competence_center: Mapped["CompetenceCenter"] = relationship(back_populates="rate_entries")
