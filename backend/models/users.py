from typing import Optional

from sqlalchemy import ForeignKey, String, Text
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
