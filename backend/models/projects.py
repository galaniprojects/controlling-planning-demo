from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy import text as sa_text  # aliased: a column named ``text`` shadows it in-class
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Intake/submission review sub-state — orthogonal to pipeline_stage (the
    # lifecycle source of truth). Null whenever the project is not mid-review.
    # Values: pending_cc_confirmation, pending_approval, changes_requested.
    # (Replaced the former overloaded `status` column; lifecycle now lives
    # exclusively on pipeline_stage.)
    review_state: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    submission_feedback: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Controller/CC Owner feedback text for the changes_requested review_state
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
    # pipeline_stage is the single lifecycle source of truth (every create path
    # and the seed set it); non-null since the status-column retirement.
    # server_default so the raw-SQL seed INSERT (which sets the stage via the
    # later s12 UPDATE) and create_all both satisfy the NOT NULL constraint.
    pipeline_stage: Mapped[str] = mapped_column(
        String(30), nullable=False, server_default="Proposed",
    )
    # Working stage names (VIPER §2.3 target set): Proposed, Under Evaluation,
    # Approved, Active, Hyper-maintenance, Completed, Run entity spawned, Paused,
    # Cancelled. Operate and Retired removed (VIPER §13.4); Completed and
    # Run entity spawned added as terminal stages. See services/pipeline.py STAGES.
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

    # VIPER §7.1 — Run entity link.
    # Nullable FK; populated when pipeline_stage == 'Run entity spawned'. Points
    # to the Offering or Internal Service that now carries this project's ongoing
    # cost after handover. Null for all other stages (including Completed, where
    # no Run entity was spawned). The transition gate enforcing non-null on
    # 'Run entity spawned' is wired router-side in Wave 3.
    run_entity_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey(
            "chargeable_entities.id",
            use_alter=True,
            name="fk_project_run_entity",
        ),
        nullable=True,
    )
    # VIPER §7 (Wave 3) — month (YYYY-MM) the project was handed over to its Run
    # entity, set when the transition to 'Run entity spawned' is applied
    # (router-side). Drives handover_year and cumulative-since-handover in the
    # project-summary payload. Null until handover.
    handover_month: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)

    # v5 Session E1 progress tracker [E-04c]. Milestone-anchored qualitative
    # progress with optional deliverable checklist enrichment. All fields
    # nullable so existing rows survive schema migration. Live-editable via
    # PATCH /api/projects/{id}/progress; snapshotted at forecast cycle
    # completion via services/progress_tracker.capture_progress_for_cycle.
    current_milestone_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey(
            "project_milestones.id",
            use_alter=True,
            name="fk_project_current_milestone",
        ),
        nullable=True,
    )
    # Pointer to the milestone the project is currently executing. When null,
    # the service derives it from the milestone whose forecast window contains
    # the demo date.
    progress_pct: Mapped[Optional[float]] = mapped_column(Numeric(5, 2), nullable=True)
    # Intra-milestone progress percentage (0-100). Auto-computed from the
    # current milestone's deliverable checklist when items exist; manually
    # overridable when ``progress_pct_manual_override`` is True.
    progress_pct_manual_override: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, server_default=sa_text("false"),
    )
    status_narrative: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # PL's free-text status narrative (1-2 sentences). Mandatory at forecast
    # cycle submission per [E-04c]; advisory elsewhere.
    next_milestone_confidence: Mapped[Optional[str]] = mapped_column(
        String(20), nullable=True,
    )
    # Three-value enum: 'on_track' | 'at_risk' | 'blocked'. Service layer
    # enforces ``confidence_reason`` is non-empty when value is at_risk/blocked.
    confidence_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    progress_updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True,
    )
    progress_updated_by_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("people.id"), nullable=True,
    )

    last_forecast_submitted_month: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)  # YYYY-MM — last month PL submitted forecast
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    modified_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships — disambiguate by foreign-key list since Project now has
    # multiple FKs into people.id (pl_person_id + progress_updated_by_id).
    pl: Mapped[Optional["Person"]] = relationship(foreign_keys="Project.pl_person_id")
    baselines: Mapped[list["Baseline"]] = relationship(back_populates="project")
    forecasts: Mapped[list["Forecast"]] = relationship(back_populates="project")
    actuals: Mapped[list["Actuals"]] = relationship(back_populates="project")
    allocations: Mapped[list["Allocation"]] = relationship(back_populates="project")
    change_requests: Mapped[list["ChangeRequest"]] = relationship(back_populates="project")
    milestones: Mapped[list["ProjectMilestone"]] = relationship(
        back_populates="project",
        order_by="ProjectMilestone.sequence_number",
        foreign_keys="ProjectMilestone.project_id",
    )
    entity_assignments: Mapped[list["ProjectGroupingAssignment"]] = relationship(back_populates="project")
    # C1: forecast version history [C-FV-01]
    forecast_versions: Mapped[list["ForecastVersion"]] = relationship(
        back_populates="project",
        order_by="ForecastVersion.version_number",
    )
    # E1: progress snapshot history [E-04c]
    progress_snapshots: Mapped[list["ProgressSnapshot"]] = relationship(
        back_populates="project",
        order_by="ProgressSnapshot.snapshot_at",
    )
    current_milestone: Mapped[Optional["ProjectMilestone"]] = relationship(
        foreign_keys=[current_milestone_id],
        post_update=True,
    )
    # Passive relationship to the Run entity this project spawned (VIPER §7.1).
    # No back_populate — keeps the charging side read-only (F2 ownership rule).
    run_entity: Mapped[Optional["ChargeableEntity"]] = relationship(
        "ChargeableEntity", foreign_keys=[run_entity_id],
    )


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
    project: Mapped["Project"] = relationship(
        back_populates="milestones",
        foreign_keys=[project_id],
    )
    milestone_type: Mapped[Optional["MilestoneType"]] = relationship()
    # E1: per-milestone deliverable checklist [E-04c] (max 10 items enforced
    # at the service layer; cascade delete keeps the catalogue tidy when a
    # milestone is removed).
    deliverables: Mapped[list["MilestoneDeliverable"]] = relationship(
        back_populates="milestone",
        order_by="MilestoneDeliverable.sequence",
        cascade="all, delete-orphan",
    )


class MilestoneDeliverable(Base):
    """Per-milestone deliverable checklist item per [E-04c].

    Free-text PL-defined items, max 10 per milestone (enforced in
    ``services/progress_tracker.MAX_CHECKLIST_ITEMS``). When deliverables
    exist on the current milestone, ``Project.progress_pct`` auto-computes
    from the completion ratio; PL retains a manual override flag.
    """

    __tablename__ = "milestone_deliverables"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    milestone_id: Mapped[int] = mapped_column(
        ForeignKey("project_milestones.id", ondelete="CASCADE"), nullable=False,
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    # Stable display ordering. PL controls insertion order; sequence values are
    # contiguous (1..N) but service-layer reorder is not implemented in E1.
    text: Mapped[str] = mapped_column(Text, nullable=False)
    is_complete: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, server_default=sa_text("false"),
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    completed_by_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("people.id"), nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    modified_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow,
    )

    # Relationships
    milestone: Mapped["ProjectMilestone"] = relationship(back_populates="deliverables")


class ProgressSnapshot(Base):
    """Versioned snapshot of project progress at forecast cycle completion [E-04c].

    Live progress fields on ``Project`` are mutable. ProgressSnapshot freezes
    a copy at each forecast cycle for the History view (Workbench Overview
    Progress tile drill-down per [E-03f]). Created by
    ``services/progress_tracker.capture_progress_for_cycle`` alongside
    Cluster C1's ``capture_versions_for_cycle`` at cycle submission.
    """

    __tablename__ = "progress_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), nullable=False)
    cycle_label: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    cycle_id: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    snapshot_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow,
    )
    created_by_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("people.id"), nullable=True,
    )

    # Captured project progress state — denormalised for history-without-FK-walks
    current_milestone_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("project_milestones.id"), nullable=True,
    )
    current_milestone_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    current_milestone_sequence: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    progress_pct: Mapped[Optional[float]] = mapped_column(Numeric(5, 2), nullable=True)
    progress_pct_manual_override: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, server_default=sa_text("false"),
    )
    status_narrative: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    next_milestone_confidence: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    confidence_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Full deliverable checklist captured as JSON keyed by milestone_id, so
    # the History view can render the checklist state at snapshot time
    # without back-walking the live deliverables table.
    checklist_payload_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    project: Mapped["Project"] = relationship(back_populates="progress_snapshots")


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
