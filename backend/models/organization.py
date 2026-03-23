from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class LineOfBusiness(Base):
    __tablename__ = "lines_of_business"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    modified_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    programs: Mapped[list["Program"]] = relationship(back_populates="lob")
    projects: Mapped[list["Project"]] = relationship(back_populates="lob")


class Location(Base):
    __tablename__ = "locations"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    city: Mapped[str] = mapped_column(String(100), nullable=False)
    country: Mapped[str] = mapped_column(String(100), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    modified_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    cost_centers: Mapped[list["CostCenter"]] = relationship(back_populates="location")


class CompetenceCenter(Base):
    __tablename__ = "competence_centers"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    modified_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    cost_centers: Mapped[list["CostCenter"]] = relationship(back_populates="competence_center")
    rate_entries: Mapped[list["RateTable"]] = relationship(back_populates="competence_center")
    people: Mapped[list["Person"]] = relationship(back_populates="competence_center")


class CostCenter(Base):
    __tablename__ = "cost_centers"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    location_id: Mapped[str] = mapped_column(ForeignKey("locations.id"), nullable=False)
    competence_center_id: Mapped[str] = mapped_column(ForeignKey("competence_centers.id"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    modified_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    location: Mapped["Location"] = relationship(back_populates="cost_centers")
    competence_center: Mapped["CompetenceCenter"] = relationship(back_populates="cost_centers")
    people: Mapped[list["Person"]] = relationship(back_populates="cost_center")


# ---------------------------------------------------------------------------
# Dynamic Portfolio Hierarchy (ADM-01)
# ---------------------------------------------------------------------------

class GroupingEntityType(Base):
    __tablename__ = "grouping_entity_types"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    entities: Mapped[list["GroupingEntity"]] = relationship(back_populates="entity_type")
    hierarchy_levels: Mapped[list["GroupingHierarchyLevel"]] = relationship(back_populates="entity_type")


class GroupingEntity(Base):
    __tablename__ = "grouping_entities"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    entity_type_id: Mapped[str] = mapped_column(ForeignKey("grouping_entity_types.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    parent_entity_id: Mapped[Optional[str]] = mapped_column(ForeignKey("grouping_entities.id"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    entity_type: Mapped["GroupingEntityType"] = relationship(back_populates="entities")
    parent: Mapped[Optional["GroupingEntity"]] = relationship(remote_side="GroupingEntity.id")
    project_assignments: Mapped[list["ProjectGroupingAssignment"]] = relationship(back_populates="grouping_entity")


class GroupingHierarchy(Base):
    __tablename__ = "grouping_hierarchies"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    is_active_hierarchy: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    levels: Mapped[list["GroupingHierarchyLevel"]] = relationship(back_populates="hierarchy", order_by="GroupingHierarchyLevel.level_order")


class GroupingHierarchyLevel(Base):
    __tablename__ = "grouping_hierarchy_levels"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    hierarchy_id: Mapped[str] = mapped_column(ForeignKey("grouping_hierarchies.id"), nullable=False)
    level_order: Mapped[int] = mapped_column(Integer, nullable=False)
    entity_type_id: Mapped[str] = mapped_column(ForeignKey("grouping_entity_types.id"), nullable=False)

    # Relationships
    hierarchy: Mapped["GroupingHierarchy"] = relationship(back_populates="levels")
    entity_type: Mapped["GroupingEntityType"] = relationship(back_populates="hierarchy_levels")


class ProjectGroupingAssignment(Base):
    __tablename__ = "project_grouping_assignments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), nullable=False)
    grouping_entity_id: Mapped[str] = mapped_column(ForeignKey("grouping_entities.id"), nullable=False)

    # Relationships
    grouping_entity: Mapped["GroupingEntity"] = relationship(back_populates="project_assignments")
