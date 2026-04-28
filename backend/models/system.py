from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class PlanningParameter(Base):
    __tablename__ = "planning_parameters"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    key: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    current_value: Mapped[str] = mapped_column(String(100), nullable=False)
    default_value: Mapped[str] = mapped_column(String(100), nullable=False)
    data_type: Mapped[str] = mapped_column(String(20), nullable=False)
    # data_type: month, integer, percentage
    param_group: Mapped[str] = mapped_column(String(30), nullable=False)
    # param_group: fiscal, planning, thresholds, limits
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    modified_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class KPIDefinition(Base):
    __tablename__ = "kpi_definitions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    formula: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    display_format: Mapped[str] = mapped_column(String(20), nullable=False)
    # display_format: currency, percentage, ratio
    target_value: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    is_built_in: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_person_id: Mapped[str] = mapped_column(ForeignKey("people.id"), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False, default="info")
    # severity: info, warning, action
    deep_link_module: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    deep_link_entity_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    deep_link_tab: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    user: Mapped["Person"] = relationship()


# Audit categories per CRETA v5 spec line ~1849. The 8 categories surfaced in
# the audit log filter UI. Tagged at write time at each ``_log_audit`` call site.
AUDIT_CATEGORIES = (
    "master_data",                # Cost centres, people, roles, locations, rate tables, project metadata
    "configuration",              # Planning parameters, system settings
    "hierarchy",                  # Grouping entities, hierarchies, project assignments
    "forecast_actions",           # Milestones, forecast edits, baseline overrides
    "pipeline_transitions",       # Pipeline stage / DoI / AI Council / within_cutoff
    "simulator",                  # Scenario actions, promotions, applies-to-forecast
    "access_control",             # User permissions, role grants, change-reviewer flag
    "scheduled_change_lifecycle", # ScheduledChange create / approve / reject / cancel / activate
)


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    user_person_id: Mapped[str] = mapped_column(ForeignKey("people.id"), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    action: Mapped[str] = mapped_column(String(20), nullable=False)
    # action: create, update, deactivate, override, activate
    field_changed: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    old_value: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    new_value: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    # category — one of AUDIT_CATEGORIES. Required at write time per [D-CAT-07].
    # ``server_default`` makes raw-SQL inserts (seed.sql) work without ORM defaults;
    # legacy rows that pre-date Session D2 land in 'master_data' which is the
    # safest neutral category for back-fill.
    category: Mapped[str] = mapped_column(
        String(40), nullable=False, default="master_data", server_default="master_data",
    )

    # Relationships
    user: Mapped["Person"] = relationship()


class SystemSuggestion(Base):
    """Pre-computed suggestions for the forecast wizard."""
    __tablename__ = "system_suggestions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), nullable=False)
    suggestion_type: Mapped[str] = mapped_column(String(30), nullable=False)
    # suggestion_type: trend_based, actuals_correction, burn_rate, utilization, seasonal
    observation: Mapped[str] = mapped_column(Text, nullable=False)
    recommendation: Mapped[str] = mapped_column(Text, nullable=False)
    impact_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    pre_filled_changes_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    project: Mapped["Project"] = relationship()
