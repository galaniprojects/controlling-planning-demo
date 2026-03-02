from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class ExternalCostType(Base):
    __tablename__ = "external_cost_types"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Baseline(Base):
    """Immutable approved plan — one row per project x month x line item."""
    __tablename__ = "baselines"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), nullable=False)
    month: Mapped[str] = mapped_column(String(7), nullable=False)  # YYYY-MM
    category: Mapped[str] = mapped_column(String(20), nullable=False)  # internal / external
    sub_category: Mapped[str] = mapped_column(String(50), nullable=False)  # role_type_id or cost_type_id
    hours: Mapped[Optional[float]] = mapped_column(Numeric(10, 2), nullable=True)  # Internal only
    amount_eur: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)

    # Relationships
    project: Mapped["Project"] = relationship(back_populates="baselines")


class Forecast(Base):
    """Living plan — updated via approved CRs."""
    __tablename__ = "forecasts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), nullable=False)
    month: Mapped[str] = mapped_column(String(7), nullable=False)  # YYYY-MM
    category: Mapped[str] = mapped_column(String(20), nullable=False)  # internal / external
    sub_category: Mapped[str] = mapped_column(String(50), nullable=False)
    hours: Mapped[Optional[float]] = mapped_column(Numeric(10, 2), nullable=True)
    amount_eur: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)

    # Relationships
    project: Mapped["Project"] = relationship(back_populates="forecasts")


class Actuals(Base):
    """Recorded costs from SAP/CATS — read-only historical."""
    __tablename__ = "actuals"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), nullable=False)
    month: Mapped[str] = mapped_column(String(7), nullable=False)  # YYYY-MM
    category: Mapped[str] = mapped_column(String(20), nullable=False)
    sub_category: Mapped[str] = mapped_column(String(50), nullable=False)
    hours: Mapped[Optional[float]] = mapped_column(Numeric(10, 2), nullable=True)
    amount_eur: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)

    # Relationships
    project: Mapped["Project"] = relationship(back_populates="actuals")
