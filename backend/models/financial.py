from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text,
    UniqueConstraint,
)
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
    description: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)  # External cost line item description
    capex_opex: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # Per-line-item CapEx/OpEx
    vendor: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    ext_status: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)

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
    description: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)  # External cost line item description
    capex_opex: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # Per-line-item CapEx/OpEx
    # External cost procurement tracking (nullable — only for category='external')
    ext_status: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    po_number: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    vendor: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    # C1 [C-FG-07]: provisional flag — True for months beyond the granularity boundary
    is_provisional: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="0"
    )

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
    description: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)  # External cost line item description
    capex_opex: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # Per-line-item CapEx/OpEx
    vendor: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    ext_status: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)

    # Relationships
    project: Mapped["Project"] = relationship(back_populates="actuals")


# ---------------------------------------------------------------------------
# C1 — v5 Session C1: Mixed-Granularity Forecast + Versioning [C-FV-01..07]
# ---------------------------------------------------------------------------

class ForecastVersion(Base):
    """Immutable point-in-time snapshot of a project forecast.

    Created automatically on CR approval [C-FV-02], cycle completion [C-FV-05],
    or manually by a controller [C-FV-03]. version_number is sequential per
    project (UniqueConstraint) [C-FV-04]. payload_json stores the full grid
    snapshot per the schema defined in services/forecast_versioning.py [C-FV-07].
    """

    __tablename__ = "forecast_versions"
    __table_args__ = (
        UniqueConstraint("project_id", "version_number", name="uq_fv_project_version"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), nullable=False)

    # Sequential version number per project [C-FV-04]
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)

    # version_type: 'cycle' | 'cr_approval' | 'manual' [C-FV-02, C-FV-03, C-FV-05]
    version_type: Mapped[str] = mapped_column(String(20), nullable=False)

    # Human-readable cycle label, e.g. "Q2 2026 Cycle"
    cycle_label: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    # cycle_id links to an in-memory ForecastCycleState.cycle_id for traceability
    cycle_id: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    # FK to the CR that triggered this version (null for cycle/manual)
    change_request_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("change_requests.id"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    created_by_id: Mapped[str] = mapped_column(ForeignKey("people.id"), nullable=False)

    # Horizon parameters at snapshot time
    granularity_boundary_months: Mapped[int] = mapped_column(Integer, nullable=False, default=12)
    planning_horizon_months: Mapped[int] = mapped_column(Integer, nullable=False, default=60)

    # Full grid snapshot (JSON text) — schema_version 1
    payload_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Denormalized stats for fast list queries
    cell_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    total_amount_eur: Mapped[Optional[float]] = mapped_column(
        Numeric(14, 2), nullable=True
    )

    # Relationships
    project: Mapped["Project"] = relationship(back_populates="forecast_versions")
    created_by: Mapped["Person"] = relationship(foreign_keys=[created_by_id])
