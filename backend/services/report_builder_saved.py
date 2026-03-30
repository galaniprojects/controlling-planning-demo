"""Service layer for saved Report Builder reports — CRUD + sharing."""

from __future__ import annotations

import json
from datetime import datetime

from sqlalchemy import or_
from sqlalchemy.orm import Session

from models.reporting import SavedReport, SavedReportShare


# ---------------------------------------------------------------------------
# List / Read
# ---------------------------------------------------------------------------

def list_saved_reports(db: Session, user_id: str) -> list[SavedReport]:
    """Return all active saved reports owned by the given user."""
    return (
        db.query(SavedReport)
        .filter(SavedReport.created_by == user_id, SavedReport.is_active.is_(True))
        .order_by(SavedReport.modified_at.desc())
        .all()
    )


def get_saved_report(db: Session, report_id: int) -> SavedReport | None:
    """Fetch a single saved report by ID (active only)."""
    return (
        db.query(SavedReport)
        .filter(SavedReport.id == report_id, SavedReport.is_active.is_(True))
        .first()
    )


# ---------------------------------------------------------------------------
# Create / Update / Delete
# ---------------------------------------------------------------------------

def create_saved_report(
    db: Session,
    user_id: str,
    name: str,
    definition: dict,
    description: str | None = None,
) -> SavedReport:
    """Create a new saved report."""
    report = SavedReport(
        name=name,
        description=description,
        created_by=user_id,
        definition=json.dumps(definition),
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


def update_saved_report(
    db: Session,
    report: SavedReport,
    name: str | None = None,
    description: str | None = None,
    definition: dict | None = None,
) -> SavedReport:
    """Update an existing saved report."""
    if name is not None:
        report.name = name
    if description is not None:
        report.description = description
    if definition is not None:
        report.definition = json.dumps(definition)
    report.modified_at = datetime.utcnow()
    db.commit()
    db.refresh(report)
    return report


def soft_delete_saved_report(db: Session, report: SavedReport) -> None:
    """Soft-delete a saved report and remove all share records."""
    report.is_active = False
    report.modified_at = datetime.utcnow()
    # Remove shares so it disappears for recipients too
    db.query(SavedReportShare).filter(SavedReportShare.report_id == report.id).delete()
    db.commit()


# ---------------------------------------------------------------------------
# Share / Publish
# ---------------------------------------------------------------------------

def share_report(
    db: Session,
    report: SavedReport,
    shares: list[dict],
    is_published: bool,
) -> None:
    """Replace share records and update publish flag."""
    # Remove existing shares
    db.query(SavedReportShare).filter(SavedReportShare.report_id == report.id).delete()
    # Create new shares
    for entry in shares:
        share = SavedReportShare(
            report_id=report.id,
            shared_with=entry["shared_with"],
            permission=entry["permission"],
        )
        db.add(share)
    report.is_published = is_published
    report.modified_at = datetime.utcnow()
    db.commit()


def list_shared_reports(db: Session, user_id: str) -> list[dict]:
    """Return reports shared with the user or published (excluding own reports)."""
    # Direct shares
    direct_shares = (
        db.query(SavedReport, SavedReportShare)
        .join(SavedReportShare, SavedReport.id == SavedReportShare.report_id)
        .filter(
            SavedReportShare.shared_with == user_id,
            SavedReport.is_active.is_(True),
            SavedReport.created_by != user_id,
        )
        .all()
    )

    # Published reports (not owned by user and not already in direct shares)
    direct_ids = {r.id for r, _ in direct_shares}
    published = (
        db.query(SavedReport)
        .filter(
            SavedReport.is_published.is_(True),
            SavedReport.is_active.is_(True),
            SavedReport.created_by != user_id,
            SavedReport.id.notin_(direct_ids) if direct_ids else True,
        )
        .all()
    )

    results = []
    for report, share in direct_shares:
        results.append({
            "report": report,
            "permission": share.permission,
            "shared_at": share.shared_at.isoformat() if share.shared_at else None,
        })
    for report in published:
        results.append({
            "report": report,
            "permission": None,
            "shared_at": None,
        })
    return results
