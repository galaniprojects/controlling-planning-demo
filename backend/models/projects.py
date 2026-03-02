from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class Program(Base):
    __tablename__ = "programs"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    lob_id: Mapped[str] = mapped_column(ForeignKey("lines_of_business.id"), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    lob: Mapped["LineOfBusiness"] = relationship(back_populates="programs")
    projects: Mapped[list["Project"]] = relationship(back_populates="program")


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    lob_id: Mapped[str] = mapped_column(ForeignKey("lines_of_business.id"), nullable=False)
    program_id: Mapped[Optional[str]] = mapped_column(ForeignKey("programs.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    # Status: draft, pending_approval, active, planned, completed, rejected
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
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    modified_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    lob: Mapped["LineOfBusiness"] = relationship(back_populates="projects")
    program: Mapped[Optional["Program"]] = relationship(back_populates="projects")
    pl: Mapped[Optional["Person"]] = relationship()
    baselines: Mapped[list["Baseline"]] = relationship(back_populates="project")
    forecasts: Mapped[list["Forecast"]] = relationship(back_populates="project")
    actuals: Mapped[list["Actuals"]] = relationship(back_populates="project")
    allocations: Mapped[list["Allocation"]] = relationship(back_populates="project")
    change_requests: Mapped[list["ChangeRequest"]] = relationship(back_populates="project")
