"""Reporting module models — SavedView and ForecastSnapshot."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class ForecastSnapshot(Base):
    """Point-in-time capture of a project's total forecast.

    Used by the Forecast Accuracy report to compare historical forecasts
    against actual spend.
    """

    __tablename__ = "forecast_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), nullable=False)
    snapshot_month: Mapped[str] = mapped_column(String(7), nullable=False)  # YYYY-MM
    forecast_total: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)

    project = relationship("Project")


class SavedView(Base):
    """User-saved report configuration (filters, columns, grouping, sort)."""

    __tablename__ = "saved_views"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(50), nullable=False)  # persona ID
    report_id: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    config_json: Mapped[str] = mapped_column(Text, nullable=False)  # JSON blob
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    modified_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)
