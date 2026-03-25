from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class ChangeRequest(Base):
    __tablename__ = "change_requests"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), nullable=False)
    submitted_by_id: Mapped[str] = mapped_column(ForeignKey("people.id"), nullable=False)
    submission_timestamp: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    # Status: draft, pending_cc_confirmation, sent_back_by_cc,
    #         pending_controller_approval, sent_back_by_controller,
    #         approved, rejected
    change_category: Mapped[str] = mapped_column(String(20), nullable=False)
    # Category: scope, timeline, resource, external_cost, other
    summary: Mapped[str] = mapped_column(String(500), nullable=False)
    justification: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_system_suggested: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Stage 1 — CC Owner confirmation
    cc_owner_id: Mapped[Optional[str]] = mapped_column(ForeignKey("people.id"), nullable=True)
    cc_confirmation_timestamp: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    cc_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # cc_status: pending, confirmed, declined
    cc_comments: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Stage 2 — Controller approval
    controller_id: Mapped[Optional[str]] = mapped_column(ForeignKey("people.id"), nullable=True)
    controller_approval_timestamp: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    controller_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # controller_status: pending, approved, rejected, sent_back
    controller_comments: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    controller_feedback: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    project: Mapped["Project"] = relationship(back_populates="change_requests")
    submitted_by: Mapped["Person"] = relationship(foreign_keys=[submitted_by_id])
    cc_owner: Mapped[Optional["Person"]] = relationship(foreign_keys=[cc_owner_id])
    controller: Mapped[Optional["Person"]] = relationship(foreign_keys=[controller_id])
    change_details: Mapped[list["CRChangeDetail"]] = relationship(back_populates="change_request")


class CRChangeDetail(Base):
    """Per-line-item detail of what changed in a CR."""
    __tablename__ = "cr_change_details"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    change_request_id: Mapped[int] = mapped_column(ForeignKey("change_requests.id"), nullable=False)
    field_changed: Mapped[str] = mapped_column(String(100), nullable=False)
    old_value: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    new_value: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    delta: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    line_item_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # role or cost type
    month: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)  # YYYY-MM

    # Relationships
    change_request: Mapped["ChangeRequest"] = relationship(back_populates="change_details")


class CRSubmissionSnapshot(Base):
    """Stores original forecast and controller-proposed edits for CR diff computation."""
    __tablename__ = "cr_submission_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    change_request_id: Mapped[int] = mapped_column(ForeignKey("change_requests.id"), nullable=False)
    snapshot_type: Mapped[str] = mapped_column(String(30), nullable=False)
    # snapshot_type: "original" | "controller_proposed"
    created_by_id: Mapped[str] = mapped_column(ForeignKey("people.id"), nullable=False)
    forecast_data_json: Mapped[str] = mapped_column(Text, nullable=False)
    # JSON array of {category, sub_category, month, hours, amount_eur}
    comments: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Relationships
    change_request: Mapped["ChangeRequest"] = relationship()
    created_by: Mapped["Person"] = relationship()
