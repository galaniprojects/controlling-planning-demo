from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class Scenario(Base):
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

    # Relationships
    author: Mapped["Person"] = relationship()
    actions: Mapped[list["ScenarioAction"]] = relationship(back_populates="scenario", order_by="ScenarioAction.action_order")
    states: Mapped[list["ScenarioState"]] = relationship(back_populates="scenario")
    capacity_impacts: Mapped[list["ScenarioCapacityImpact"]] = relationship(back_populates="scenario")


class ScenarioAction(Base):
    __tablename__ = "scenario_actions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    scenario_id: Mapped[int] = mapped_column(ForeignKey("scenarios.id"), nullable=False)
    action_order: Mapped[int] = mapped_column(Integer, nullable=False)
    scope: Mapped[str] = mapped_column(String(20), nullable=False)  # project / portfolio
    action_type: Mapped[str] = mapped_column(String(50), nullable=False)
    # action_type: delay_project, remove_project, reduce_budget, cut_consulting,
    #              accelerate_project, add_budget, across_the_board_cut,
    #              change_allocation, reduce_lob
    project_id: Mapped[Optional[str]] = mapped_column(ForeignKey("projects.id"), nullable=True)
    parameters_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON
    impact_delta_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON
    group_label: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)  # For AI Advisor groups
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

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
