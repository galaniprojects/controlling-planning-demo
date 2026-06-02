from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer,
    Numeric, String, Text, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class Scenario(Base):
    """What-If scenario container per Cluster B [B-AC-01..03] [B-SL-01..05].

    v4 fields (kept verbatim for backward-compat with existing seed + tests):
      ``name``, ``description``, ``author_id``, ``status``, ``headline_impact``,
      ``created_at``, ``modified_at``.

    v5 Cluster B Session B1 additions (all nullable / defaulted to preserve
    existing seed and test expectations):

    - ``anchor_forecast_version_id`` per [B-SL-01]: FK to forecast_versions.
      Default at creation = the latest cycle version. Diffs are computed
      relative to this anchor. Nullable for backward-compat.
    - ``visibility`` per [B-SL-03]: 'private' | 'tier3_only' | 'all_users'.
      v4 ``status`` of 'private'/'published' continues to drive the broad
      published/unpublished split; ``visibility`` refines published scenarios
      so Tier 3 content can be gated even when published. Default 'private'.
    - ``tier3_content_flag`` per [B-SL-03]: True when the scenario has any
      Tier 3 diff (people/rate tables/capacity parameters/restructuring
      actions). Set automatically by the impact engine; consumed by the
      publish endpoint to default visibility to 'tier3_only'.
    - ``archived`` / ``archived_at`` per [B-SL-05]: soft archive — never
      delete. Archived scenarios hide from active list, remain clonable.
    - ``tags`` (JSON list of free-text tags) per [B-AC-01] tag filter UX.
    - ``last_recalculated_at`` per [B-ID-02]: timestamp of last impact
      recalculation. UI uses ``modified_at > last_recalculated_at`` to show
      the stale indicator.
    - ``cc_owner_scope_cc_id`` per [E-06b]: when a CC Owner creates a
      scenario it is scoped to a specific cost centre and only resource
      levers within that CC are editable. Nullable; only set for CC-Owner
      scenarios.
    - ``rebased_from_version_id`` per [B-SL-02]: previous anchor before the
      most recent rebase, retained for audit context. Nullable.
    - ``anchor_distribution_version_id`` per Charging/UM rework FD-3 / spec §4:
      Stage 1 distribution-version anchor. Pinned at scenario creation to the
      production ``DistributionVersion`` that was in force at the time, so
      a subsequent production reactivation does not shift impact deltas
      underneath an open scenario. NULL = legacy fallback (resolve by
      ``evaluated_date`` at read time). Wired into the lever-12 union read in
      ``services/scenario_lever12.py``.
    """
    __tablename__ = "scenarios"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    author_id: Mapped[str] = mapped_column(ForeignKey("people.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="private")
    # Status: private / published
    headline_impact: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON summary
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    modified_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # ---- v5 B1 additions ----
    anchor_forecast_version_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("forecast_versions.id"), nullable=True,
    )
    rebased_from_version_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("forecast_versions.id"), nullable=True,
    )
    visibility: Mapped[str] = mapped_column(
        String(20), nullable=False, default="private", server_default="private",
    )
    # 'private' | 'tier3_only' | 'all_users'
    tier3_content_flag: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, server_default="0",
    )
    archived: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, server_default="0",
    )
    archived_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    tags: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON array
    last_recalculated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    cc_owner_scope_cc_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("cost_centers.id"), nullable=True,
    )

    # Charging/UM rework FD-3: Stage 1 distribution-version anchor per
    # spec §4 Open-Question #3. Pinned at scenario creation so production
    # reactivations don't shift impact deltas mid-flight. NULL = legacy
    # behaviour (resolve by evaluated_date at read time). Wired up by
    # services/scenario_lever12.py — the column is added here so the FK
    # exists ahead of the service refactor.
    #
    # ``use_alter=True`` breaks the create_all/drop_all dependency cycle
    # between this FK (→ distribution_versions) and DistributionVersion.scenario_id
    # (→ scenarios). Same pattern Project.current_milestone_id uses against
    # ProjectMilestone.project_id.
    anchor_distribution_version_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey(
            "distribution_versions.id",
            use_alter=True,
            name="fk_scenario_anchor_distribution_version",
        ),
        nullable=True,
    )

    # Relationships
    author: Mapped["Person"] = relationship()
    actions: Mapped[list["ScenarioAction"]] = relationship(back_populates="scenario", order_by="ScenarioAction.action_order")
    states: Mapped[list["ScenarioState"]] = relationship(back_populates="scenario")
    capacity_impacts: Mapped[list["ScenarioCapacityImpact"]] = relationship(back_populates="scenario")
    promotions: Mapped[list["ScenarioPromotion"]] = relationship(
        back_populates="scenario", order_by="ScenarioPromotion.promoted_at.desc()",
    )
    anchor_version = relationship(
        "ForecastVersion", foreign_keys=[anchor_forecast_version_id],
    )
    rebased_from_version = relationship(
        "ForecastVersion", foreign_keys=[rebased_from_version_id],
    )
    cc_owner_scope_cc = relationship(
        "CostCenter", foreign_keys=[cc_owner_scope_cc_id],
    )
    anchor_distribution_version = relationship(
        "DistributionVersion", foreign_keys=[anchor_distribution_version_id],
    )


class ScenarioAction(Base):
    __tablename__ = "scenario_actions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    scenario_id: Mapped[int] = mapped_column(ForeignKey("scenarios.id"), nullable=False)
    action_order: Mapped[int] = mapped_column(Integer, nullable=False)
    scope: Mapped[str] = mapped_column(String(20), nullable=False)  # project / portfolio
    action_type: Mapped[str] = mapped_column(String(50), nullable=False)
    # action_type: delay_project, remove_project, reduce_budget, cut_consulting,
    #              accelerate_project, add_budget, across_the_board_cut,
    #              change_allocation, reduce_lob, cost_allocation_change,
    #              btc_profile_change, distribution_edge_change, ...
    project_id: Mapped[Optional[str]] = mapped_column(ForeignKey("projects.id"), nullable=True)
    parameters_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON
    impact_delta_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON
    group_label: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)  # For AI Advisor groups
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    # Promote tracking [B-PR-04]: marked when this action's diff has been
    # promoted to live data. Nullable until promoted. Format: ISO timestamp.
    promoted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    promoted_by_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("people.id"), nullable=True,
    )
    # Lever / category classification per [B-ES-01]. Free-form so future
    # surfaces can opt in without a schema change. Examples:
    # 'forecast_grid' | 'rate_table' | 'people' | 'pipeline_stage' |
    # 'tech_navigator' | 'cost_allocation' | 'capacity_param' |
    # 'hierarchy' | 'budget_envelope' | 'milestone' | 'vendor_contract' |
    # 'sourcing_mix' | 'capex_opex' | 'escalation' | 'running_cost' |
    # 'hypothetical_project' | 'restructuring' .
    lever_category: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    # Tier flag (1/2/3) per [B-AC-02]; absence = Tier 1.
    tier: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default="1",
    )

    # Relationships
    scenario: Mapped["Scenario"] = relationship(back_populates="actions")
    project: Mapped[Optional["Project"]] = relationship()


class ScenarioState(Base):
    """Pre-calculated full snapshot per project within a scenario."""
    __tablename__ = "scenario_states"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    scenario_id: Mapped[int] = mapped_column(ForeignKey("scenarios.id"), nullable=False)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), nullable=False)
    original_budget: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    adjusted_budget: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    budget_delta: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    original_rag: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    adjusted_rag: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    original_start: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)
    adjusted_start: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)
    original_end: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)
    adjusted_end: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)
    is_affected: Mapped[bool] = mapped_column(default=False)

    # Relationships
    scenario: Mapped["Scenario"] = relationship(back_populates="states")
    project: Mapped["Project"] = relationship()


class ScenarioCapacityImpact(Base):
    """Pre-calculated capacity impact per cost center within a scenario."""
    __tablename__ = "scenario_capacity_impacts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    scenario_id: Mapped[int] = mapped_column(ForeignKey("scenarios.id"), nullable=False)
    cost_center_id: Mapped[str] = mapped_column(ForeignKey("cost_centers.id"), nullable=False)
    month: Mapped[str] = mapped_column(String(7), nullable=False)  # YYYY-MM
    original_utilization_pct: Mapped[float] = mapped_column(Numeric(5, 1), nullable=False)
    adjusted_utilization_pct: Mapped[float] = mapped_column(Numeric(5, 1), nullable=False)
    fte_delta: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)

    # Relationships
    scenario: Mapped["Scenario"] = relationship(back_populates="capacity_impacts")
    cost_center: Mapped["CostCenter"] = relationship()


# ---------------------------------------------------------------------------
# v5 B1 — Promote audit + Lever-12 sandbox tracking
# ---------------------------------------------------------------------------

# Visibility values for the Tier 3 content gating per [B-SL-03].
SCENARIO_VISIBILITIES = ("private", "tier3_only", "all_users")

# Routing types per [B-PR-03]. Each diff routes through its native workflow.
SCENARIO_ROUTING_TYPES = (
    "direct_forecast_update",       # PL own-project forecast diffs
    "change_request",               # Other-PL forecast diffs
    "doi_gate_check",               # Pipeline stage transitions
    "tech_navigator_direct",        # Own-project TN
    "tech_navigator_send_back",     # Other-PL TN
    "rate_table_update",            # Rate edits
    "people_action_item",           # People hire/depart/reassign
    "budget_envelope_update",       # Budget envelope
    "hypothetical_to_proposed",     # Hypothetical project promoted to DoI 0
    "hierarchy_update",             # Hierarchy reassignment
    "cost_allocation_update",       # Lever 12 — distribution + BTC
    "capacity_param_update",        # Available hours per location
    "no_route",                     # Diff cannot be promoted
)


class ScenarioPromotion(Base):
    """Audit record for a single Promote event per [B-PR-03..04].

    Each Promote click that executes ≥1 routable diff creates one row.
    Per-diff detail (action_id, routing_type, accepted/skipped, message)
    is stored in ``routing_summary_json``. Promoted actions also carry
    ``promoted_at`` / ``promoted_by_id`` on the action row itself for fast
    badge rendering in the change summary drawer.
    """

    __tablename__ = "scenario_promotions"
    __table_args__ = (
        Index("ix_scenario_promotions_scenario", "scenario_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    scenario_id: Mapped[int] = mapped_column(
        ForeignKey("scenarios.id"), nullable=False,
    )
    promoted_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow,
    )
    promoted_by_id: Mapped[str] = mapped_column(
        ForeignKey("people.id"), nullable=False,
    )
    # JSON: list of {action_id, routing_type, status, message, target_id}.
    routing_summary_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    promoted_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0",
    )
    skipped_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0",
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    scenario: Mapped["Scenario"] = relationship(back_populates="promotions")
    promoted_by: Mapped["Person"] = relationship(foreign_keys=[promoted_by_id])


class ScenarioApplyToForecastEvent(Base):
    """Audit record for the PL Apply-to-forecast action per [B-PR-05].

    Captures which scenario was applied, by which PL, into which cycle,
    and the count of diffs carried forward. The actual provenance
    indicator on the resulting forecast cells is stored on the cells via
    Cluster C's ``is_provisional`` mechanism — this table only records
    the application event for audit + UI affordance.
    """

    __tablename__ = "scenario_apply_to_forecast_events"
    __table_args__ = (
        Index("ix_scenario_atf_scenario", "scenario_id"),
        Index("ix_scenario_atf_applied_by", "applied_by_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    scenario_id: Mapped[int] = mapped_column(
        ForeignKey("scenarios.id"), nullable=False,
    )
    applied_by_id: Mapped[str] = mapped_column(
        ForeignKey("people.id"), nullable=False,
    )
    applied_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow,
    )
    cycle_id: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    cycle_label: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    diffs_carried_forward: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0",
    )
    diffs_skipped: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0",
    )
    # JSON: list of {project_id, action_id, status, message}.
    summary_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    scenario: Mapped["Scenario"] = relationship()
    applied_by: Mapped["Person"] = relationship(foreign_keys=[applied_by_id])


# ---------------------------------------------------------------------------
# Project-Scope Redesign — Layer-2 hand-edit overlay (spec §5)
# ---------------------------------------------------------------------------
#
# A project-scope scenario stores its edits in two layers:
#   Layer 1 — macros as ordered transforms. Reuses ``ScenarioAction`` rows
#     (scope='project', action_type ∈ PROJECT_MACRO_ACTION_TYPES); these are
#     functions of the anchor curve and re-derive against a rebased anchor.
#     No new table.
#   Layer 2 — hand edits as a sparse overlay. The four tables below. Keyed by
#     (project, line, month) for cell values, with companion rows for
#     added/removed lines, mix changes, and plan (date/stage/DoI/milestone)
#     edits. This is the WYSIWYG plan-delta the promote/apply diff consumes
#     DIRECTLY (spec §6) — it is never replayed as a coarse action.
#
# Resolution order (spec §5.1): anchor → apply macros in order → overlay hand
# edits on top, hand-edits-win. Absolute-month keying (spec §5.2): a cell edit
# stays on its ``month`` and does NOT travel when a macro shifts the curve.

# Frozen overlay vocab (imported by the project-scope recompute core + routing).
OVERLAY_CELL_FIELDS = ("hours", "amount_eur")
OVERLAY_LINE_OPS = ("add", "remove")
OVERLAY_LINE_KINDS = ("internal_role", "external_cost")
OVERLAY_PLAN_TARGETS = ("start_month", "end_month", "stage", "doi", "milestone")

# Layer-1 macro action_types (stored as ScenarioAction rows, scope='project').
PROJECT_MACRO_ACTION_TYPES = (
    "delay_project",
    "accelerate_project",
    "pause_project",
    "remove_project",
)


class ScenarioForecastCellEdit(Base):
    """Layer-2 hand-edit overlay — a single forecast cell value (spec §5).

    Sparse overlay keyed by (scenario, project, line, month, field). One row
    per edited cell; clean upsert/dedup via the unique constraint, so
    re-editing June overwrites the same row rather than appending. This *is*
    the diff Promote / Apply-to-forecast consume directly (spec §6).

    ``line_key`` identifies the forecast line the cell sits on:
      - existing line: the natural composite "category|sub_category|role_type_id"
        (role_type_id omitted for external lines), matching the live Forecast
        cell key (project_id, month, category, sub_category, role_type_id).
      - added line: a minted stable id ("new:role:<uuid>" / "new:ext:<uuid>")
        also recorded on a companion ``ScenarioLineEdit`` row, so the overlay
        can reference a line absent from live data (spec §5).

    ``field`` ∈ OVERLAY_CELL_FIELDS: internal role lines carry ``hours`` edits
    (€ derived via the effective rate at rollup); external lines carry
    ``amount_eur`` edits. ``month`` is absolute (spec §5.2).
    """

    __tablename__ = "scenario_forecast_cell_edits"
    __table_args__ = (
        UniqueConstraint(
            "scenario_id", "project_id", "line_key", "month", "field",
            name="uq_scenario_cell_edit",
        ),
        Index("ix_scenario_cell_edit_scope", "scenario_id", "project_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    scenario_id: Mapped[int] = mapped_column(ForeignKey("scenarios.id"), nullable=False)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), nullable=False)
    line_key: Mapped[str] = mapped_column(String(120), nullable=False)
    month: Mapped[str] = mapped_column(String(7), nullable=False)  # YYYY-MM, absolute
    field: Mapped[str] = mapped_column(String(20), nullable=False)  # hours | amount_eur
    value: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow,
    )

    scenario: Mapped["Scenario"] = relationship()
    project: Mapped["Project"] = relationship()


class ScenarioLineEdit(Base):
    """Layer-2 companion overlay — structural add/remove of a forecast line
    (spec §5). Covers internal role lines and external-cost line items.

    ``op`` ∈ OVERLAY_LINE_OPS. Added lines get a minted stable ``line_key``
    ("new:role:<uuid>" / "new:ext:<uuid>") so the cell overlay and the later
    promote/apply diff can reference a line not yet in live data; removed lines
    reference an existing natural ``line_key`` and suppress it at resolution.

    ``line_kind`` ∈ OVERLAY_LINE_KINDS. The metadata columns describe the line
    so resolution can synthesise it into the grid and routing can classify it.
    External-cost items carry vendor / cost_type_id / capex_opex / description;
    internal role lines carry role_type_id. Per-month values for the line live
    in ``ScenarioForecastCellEdit`` rows under the same ``line_key``.
    """

    __tablename__ = "scenario_line_edits"
    __table_args__ = (
        UniqueConstraint(
            "scenario_id", "project_id", "line_key",
            name="uq_scenario_line_edit",
        ),
        Index("ix_scenario_line_edit_scope", "scenario_id", "project_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    scenario_id: Mapped[int] = mapped_column(ForeignKey("scenarios.id"), nullable=False)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), nullable=False)
    line_key: Mapped[str] = mapped_column(String(120), nullable=False)
    op: Mapped[str] = mapped_column(String(10), nullable=False)  # add | remove
    line_kind: Mapped[str] = mapped_column(String(20), nullable=False)  # internal_role | external_cost
    category: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # internal | external
    sub_category: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    role_type_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("role_types.id"), nullable=True,
    )
    cost_type_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("external_cost_types.id"), nullable=True,
    )
    vendor: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    capex_opex: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    scenario: Mapped["Scenario"] = relationship()
    project: Mapped["Project"] = relationship()


class ScenarioMixChange(Base):
    """Layer-2 companion overlay — seniority/sourcing mix change (spec §5, §8).

    Mirrors the existing ``change_allocation`` action representation — a monthly
    hour swap between two role types within a cost centre — so the Tier-3 mix
    control reuses the shape rather than inventing a new one. Routes as a
    ``people_action_item`` at promote. Designed now; the UI control lands in
    Session 3 (Tier-3 authors only).
    """

    __tablename__ = "scenario_mix_changes"
    __table_args__ = (
        Index("ix_scenario_mix_change_scope", "scenario_id", "project_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    scenario_id: Mapped[int] = mapped_column(ForeignKey("scenarios.id"), nullable=False)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), nullable=False)
    cost_center_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("cost_centers.id"), nullable=True,
    )
    swap_from_role_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("role_types.id"), nullable=True,
    )
    swap_to_role_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("role_types.id"), nullable=True,
    )
    hours_per_month_swap: Mapped[Optional[float]] = mapped_column(
        Numeric(10, 2), nullable=True,
    )
    effective_from: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)  # YYYY-MM
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    scenario: Mapped["Scenario"] = relationship()
    project: Mapped["Project"] = relationship()


class ScenarioPlanEdit(Base):
    """Layer-2 companion overlay — project-plan edits (spec §3, §5): project
    start/end dates, pipeline stage, DoI gate, and milestones. Low-volume,
    project- or milestone-level. Designed now; exercised in Session 3.

    ``target`` ∈ OVERLAY_PLAN_TARGETS:
      - date/stage/doi targets: scalar ``value`` (e.g. "2026-09", a stage name);
        ``milestone_id`` stays "" (sentinel, not NULL, so the unique constraint
        dedupes one row per target).
      - milestone target: ``milestone_id`` set; structured payload in
        ``entry_json`` (name, due month, deliverables).
    Stage/DoI edits route through the existing DoI gate check at promote; date
    edits feed the resolved grid's start/end (spec §6).
    """

    __tablename__ = "scenario_plan_edits"
    __table_args__ = (
        UniqueConstraint(
            "scenario_id", "project_id", "target", "milestone_id",
            name="uq_scenario_plan_edit",
        ),
        Index("ix_scenario_plan_edit_scope", "scenario_id", "project_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    scenario_id: Mapped[int] = mapped_column(ForeignKey("scenarios.id"), nullable=False)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), nullable=False)
    target: Mapped[str] = mapped_column(String(20), nullable=False)
    # "" sentinel (not NULL) for non-milestone targets so the unique constraint
    # dedupes to one row per (scenario, project, target).
    milestone_id: Mapped[str] = mapped_column(
        String(50), nullable=False, default="", server_default="",
    )
    value: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    entry_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    scenario: Mapped["Scenario"] = relationship()
    project: Mapped["Project"] = relationship()
