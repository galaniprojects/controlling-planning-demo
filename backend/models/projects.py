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

    # Tech Navigator profile [A-TN-01..09]. All fields nullable; populated via
    # PUT /api/projects/{id}/tech-navigator. Composite scores are denormalized
    # for ORDER BY in the ranking engine (Session A3) and recomputed on every
    # write or admin weight change.
    project_type: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # 1=business case, 2=strategic, 3=legal/compliance
    transformation_level: Mapped[Optional[str]] = mapped_column(String(3), nullable=True)  # T0, T1, T2
    tn_standardization: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # Complexity sub-criterion 1-5
    tn_usage: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # Complexity sub-criterion 1-5
    tn_maintenance: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # Complexity sub-criterion 1-5
    tn_financial_benefit: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # Value Creation sub-criterion 1-5
    tn_payback: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # Value Creation sub-criterion 1-5
    tn_competitive_advantage: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # Value Creation sub-criterion 1-5
    tn_value_reserved_1: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # Reserved sub-criterion slot, not surfaced in UI
    tn_value_reserved_2: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # Reserved sub-criterion slot, not surfaced in UI
    complexity_score: Mapped[Optional[float]] = mapped_column(Numeric(4, 2), nullable=True)  # Computed weighted composite
    value_creation_score: Mapped[Optional[float]] = mapped_column(Numeric(4, 2), nullable=True)  # Computed weighted composite
    composite_score: Mapped[Optional[float]] = mapped_column(Numeric(4, 2), nullable=True)  # Computed ranking score
    tshirt_size: Mapped[Optional[str]] = mapped_column(String(2), nullable=True)  # XS/S/M/L/XL, derived from total_budget

    # v5 Session A2 lifecycle: pipeline stage + DoI gate columns [A-PS-01] [A-DOI-01].
    # All nullable so existing rows survive re-seed; defaults set in seed.sql.
    pipeline_stage: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    # Working stage names per [A-PS-02]: Proposed, Under Evaluation, Approved, Active,
    # Hyper-maintenance, Operate, Retired, Paused, Cancelled.
    doi: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # 0-5 per [A-DOI-01]
    frozen_doi: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # Preserved DoI for off-path stages (Paused/Cancelled) per [A-PS-03].
    ai_council_approved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # AI Council screening flag for the DoI 0->1 gate per [A-DOI-03].
    ai_council_doc_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # OneDrive link for the AI Council confirmation document per [A-DA-01].
    within_cutoff: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    # Settable in A2; A3 replaces with computed value driven by the ranking
    # engine's envelope walk per [A-PS-06].

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
    milestones: Mapped[list["ProjectMilestone"]] = relationship(
        back_populates="project",
        order_by="ProjectMilestone.sequence_number",
    )
    entity_assignments: Mapped[list["ProjectGroupingAssignment"]] = relationship(back_populates="project")


class MilestoneType(Base):
    """Global catalogue of milestone types per [A-BK-34].

    Provides a default colour and a suggested display ordering used by the
    milestone picker UI. Per-milestone colour overrides on
    ``ProjectMilestone.color`` take precedence; when null the router falls
    back to ``MilestoneType.default_color``.
    """

    __tablename__ = "milestone_types"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    default_color: Mapped[str] = mapped_column(String(20), nullable=False)
    suggested_ordering: Mapped[int] = mapped_column(Integer, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ProjectMilestone(Base):
    """Project milestones with baseline + forecast date ranges per [A-MS-01].

    Renamed from ``ProjectPhase`` (table ``project_phases``) for consistency
    with KB workshop terminology. ``baseline_locked_at`` is set on first save;
    baseline dates are immutable thereafter except via controller override
    with audit log entry per [A-MS-03].
    """

    __tablename__ = "project_milestones"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), nullable=False)
    sequence_number: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    milestone_type_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("milestone_types.id"), nullable=True,
    )
    baseline_start: Mapped[str] = mapped_column(String(7), nullable=False)  # YYYY-MM
    baseline_end: Mapped[str] = mapped_column(String(7), nullable=False)
    forecast_start: Mapped[str] = mapped_column(String(7), nullable=False)
    forecast_end: Mapped[str] = mapped_column(String(7), nullable=False)
    color: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # Per-milestone override; falls back to MilestoneType.default_color when null.
    baseline_locked_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    # Set on first save; baseline dates immutable thereafter except via controller override.

    # Relationships
    project: Mapped["Project"] = relationship(back_populates="milestones")
    milestone_type: Mapped[Optional["MilestoneType"]] = relationship()


class ProjectDependency(Base):
    """Inter-project dependency edge per [D-AC-05].

    Soft constraint only — the graph is presented as a warning surface (cycle
    detection per [D-AC-08] flags problems on save) but does not block
    transitions or scheduling. Lag/lead is optional and stored in days. The
    ``dependency_type`` column carries values from the catalogue described in
    [D-CAT-03] (finish-to-start / start-to-start / finish-to-finish /
    start-to-finish); the catalogue itself is admin-managed and lives in a
    follow-on session — for D1 we accept any string and let the admin UI
    constrain it.
    """

    __tablename__ = "project_dependencies"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    predecessor_project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id"), nullable=False,
    )
    successor_project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id"), nullable=False,
    )
    dependency_type: Mapped[str] = mapped_column(String(30), nullable=False)
    # finish_to_start, start_to_start, finish_to_finish, start_to_finish
    lag_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    modified_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow,
    )
    created_by_person_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("people.id"), nullable=True,
    )

    # Relationships — disambiguated by foreign-key list because both FKs point
    # at ``projects.id``.
    predecessor: Mapped["Project"] = relationship(
        foreign_keys="ProjectDependency.predecessor_project_id",
    )
    successor: Mapped["Project"] = relationship(
        foreign_keys="ProjectDependency.successor_project_id",
    )
