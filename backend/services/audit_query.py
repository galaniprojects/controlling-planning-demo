"""Audit log query service — Cluster D Session D2.

Centralised filter + pagination for ``AuditLog`` rows. Surfaces the v5
spec line ~1849 enhancements:

1. **Categorised entries** — filter by ``category`` (one of
   ``models.system.AUDIT_CATEGORIES``).
2. **Entity-scoped trails** — filter by ``entity_type`` + ``entity_id`` to
   render an entity detail view's audit history.
3. Multi-criterion filters (date range, user) for the global audit log view.

All queries are read-only; no mutations.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Iterable, Optional

from sqlalchemy import desc
from sqlalchemy.orm import Session, joinedload

from models.system import AUDIT_CATEGORIES, AuditLog


@dataclass
class AuditEntry:
    """Plain DTO returned by the query helpers — easier to serialise than the ORM row."""

    id: int
    timestamp: str
    user_person_id: str
    user_name: Optional[str]
    entity_type: str
    entity_id: str
    entity_name: Optional[str]
    action: str
    field_changed: Optional[str]
    old_value: Optional[str]
    new_value: Optional[str]
    category: str

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "timestamp": self.timestamp,
            "user_person_id": self.user_person_id,
            "user_name": self.user_name,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "entity_name": self.entity_name,
            "action": self.action,
            "field_changed": self.field_changed,
            "old_value": self.old_value,
            "new_value": self.new_value,
            "category": self.category,
        }


def _coerce_categories(categories: Optional[Iterable[str]]) -> Optional[list[str]]:
    if not categories:
        return None
    cats = [c for c in categories if c]
    if not cats:
        return None
    bad = [c for c in cats if c not in AUDIT_CATEGORIES]
    if bad:
        raise ValueError(f"Unknown audit categories: {bad}. Allowed: {AUDIT_CATEGORIES}")
    return cats


def query_audit_log(
    db: Session,
    *,
    categories: Optional[Iterable[str]] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    user_person_id: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[AuditEntry], int]:
    """Return a page of ``AuditLog`` rows plus the total matching count.

    All filters are AND-combined. ``categories`` is validated against
    ``AUDIT_CATEGORIES``; passing an unknown value raises ``ValueError``.
    Pagination defaults match the existing ``/api/admin/audit-log`` endpoint
    (limit=50). Results are ordered by ``timestamp DESC``.
    """
    cats = _coerce_categories(categories)

    base = db.query(AuditLog).options(joinedload(AuditLog.user))
    if cats:
        base = base.filter(AuditLog.category.in_(cats))
    if entity_type:
        base = base.filter(AuditLog.entity_type == entity_type)
    if entity_id:
        base = base.filter(AuditLog.entity_id == entity_id)
    if user_person_id:
        base = base.filter(AuditLog.user_person_id == user_person_id)
    if start_date:
        base = base.filter(AuditLog.timestamp >= start_date)
    if end_date:
        base = base.filter(AuditLog.timestamp <= end_date)

    total = base.count()

    rows = (
        base.order_by(desc(AuditLog.timestamp), desc(AuditLog.id))
        .offset(offset)
        .limit(limit)
        .all()
    )

    items = [
        AuditEntry(
            id=r.id,
            timestamp=r.timestamp.isoformat() if r.timestamp else "",
            user_person_id=r.user_person_id,
            user_name=r.user.name if r.user else None,
            entity_type=r.entity_type,
            entity_id=r.entity_id,
            entity_name=r.entity_name,
            action=r.action,
            field_changed=r.field_changed,
            old_value=r.old_value,
            new_value=r.new_value,
            category=r.category,
        )
        for r in rows
    ]
    return items, total


def query_entity_trail(
    db: Session,
    entity_type: str,
    entity_id: str,
    *,
    limit: int = 100,
    offset: int = 0,
) -> tuple[list[AuditEntry], int]:
    """Convenience wrapper for the entity-scoped audit trail (spec line ~1851)."""
    return query_audit_log(
        db,
        entity_type=entity_type,
        entity_id=entity_id,
        limit=limit,
        offset=offset,
    )


def list_categories() -> list[dict]:
    """Reference list — returns each category with a stable display label."""
    labels = {
        "master_data": "Master Data",
        "configuration": "Configuration",
        "hierarchy": "Hierarchy",
        "forecast_actions": "Forecast Actions",
        "pipeline_transitions": "Pipeline Transitions",
        "simulator": "Simulator",
        "access_control": "Access Control",
        "scheduled_change_lifecycle": "Scheduled Change Lifecycle",
        "export": "Export",
    }
    return [{"key": k, "label": labels[k]} for k in AUDIT_CATEGORIES]
