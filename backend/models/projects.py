from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    # Status: draft, pending_cc_confirmation, pending_approval, active, planned, completed, rejected, changes_requested
    submission_feedback: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Controller/CC Owner feedback text for changes_requested status
    rag_status: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    # RAG: green, amber, red, or null for pending/draft
    capex_opex: Mapped[str] = mapped_column(String(10), nullable=False)
    # capex or opex
    start_month: Mapped[str] = mapped_column(String(7), nullable=False)  # YYYY-MM
    end_month: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)  # YYYY-MM, null for services
    projected_end_month: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)  # YYYY-MM
    pl_person_id: Mapped[Optional[str]] = mapped_column(ForeignKey("people.id"), nullable=True)
    is_service: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    annual_budget: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)  # For services
    total_budget: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)  # Total baseline budget
    last_forecast_submitted_month: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)  # YYYY-MM — last month PL submitted forecast
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    modified_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    pl: Mapped[Optional["Person"]] = relationship()
    baselines: Mapped[list["Baseline"]] = relationship(back_populates="project")
    forecasts: Mapped[list["Forecast"]] = relationship(back_populates="project")
    actuals: Mapped[list["Actuals"]] = relationship(back_populates="project")
    allocations: Mapped[list["Allocation"]] = relationship(back_populates="project")
    change_requests: Mapped[list["ChangeRequest"]] = relationship(back_populates="project")
    phases: Mapped[list["ProjectPhase"]] = relationship(back_populates="project", order_by="ProjectPhase.phase_number")
    entity_assignments: Mapped[list["ProjectGroupingAssignment"]] = relationship(back_populates="project")


class ProjectPhase(Base):
    __tablename__ = "project_phases"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), nullable=False)
    phase_number: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    baseline_start: Mapped[str] = mapped_column(String(7), nullable=False)  # YYYY-MM
    baseline_end: Mapped[str] = mapped_column(String(7), nullable=False)
    forecast_start: Mapped[str] = mapped_column(String(7), nullable=False)
    forecast_end: Mapped[str] = mapped_column(String(7), nullable=False)
    color: Mapped[str] = mapped_column(String(20), nullable=False)

    # Relationships
    project: Mapped["Project"] = relationship(back_populates="phases")
