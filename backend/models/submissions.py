from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class ProjectSubmissionSnapshot(Base):
    """Stores PL's original plan and controller's proposed edits for diff computation."""
    __tablename__ = "project_submission_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), nullable=False)
    snapshot_type: Mapped[str] = mapped_column(String(30), nullable=False)
    # snapshot_type: "original" | "controller_proposed"
    created_by_id: Mapped[str] = mapped_column(ForeignKey("people.id"), nullable=False)
    forecast_data_json: Mapped[str] = mapped_column(Text, nullable=False)
    # JSON array of {category, sub_category, month, hours, amount_eur}
    comments: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Relationships
    project: Mapped["Project"] = relationship()
    created_by: Mapped["Person"] = relationship()
