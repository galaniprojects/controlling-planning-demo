from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class DemoPersona(Base):
    """Maps the 4 demo personas to Person rows with their role context."""
    __tablename__ = "demo_personas"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    person_id: Mapped[str] = mapped_column(ForeignKey("people.id"), nullable=False)
    role: Mapped[str] = mapped_column(String(30), nullable=False)
    # role: controller, cost_center_owner, project_lead, executive
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    title: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    default_module: Mapped[str] = mapped_column(String(50), nullable=False)
    managed_cost_center_id: Mapped[Optional[str]] = mapped_column(ForeignKey("cost_centers.id"), nullable=True)
    owned_project_ids_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON array

    # Relationships
    person: Mapped["Person"] = relationship()
    managed_cost_center: Mapped[Optional["CostCenter"]] = relationship()


class User(Base):
    """System-access entity, separate from Person per spec §1584.

    A ``Person`` is a master-data entity (name, cost centre, role, capacity).
    A ``User`` is a system-access entity (login identity, VIPER role,
    permission flags). Not every Person is a User; not every User maps to a
    Person — hence ``person_id`` is nullable.

    Decisions implemented:
    - [D-AC-01] Four-role model retained on ``role`` column.
    - [D-AC-02] Tier 3 simulator-access flag on ``tier3_flag`` (independent
      of role). Defaults to False; managed in admin Section 5.
    - [D-AC-03] "Change reviewer" permission on ``change_reviewer_flag``
      (controllers only). Defaults to False; not all controllers are
      automatic reviewers.

    Working assumption (D1): Users are admin-created. There is no auto-create
    on login — that workflow is deferred. ``DemoPersona`` continues to drive
    the demo's role-resolution flow until a future session unifies them.
    """

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    username: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    role: Mapped[str] = mapped_column(String(30), nullable=False)
    # role: controller, cost_center_owner, project_lead, executive (per [D-AC-01])
    person_id: Mapped[Optional[str]] = mapped_column(ForeignKey("people.id"), nullable=True)
    tier3_flag: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # [D-AC-02] sensitive simulator-surface access toggle.
    change_reviewer_flag: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # [D-AC-03] second-admin review authorisation. Only meaningful for controllers.
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    modified_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow,
    )

    # Relationships
    person: Mapped[Optional["Person"]] = relationship()
