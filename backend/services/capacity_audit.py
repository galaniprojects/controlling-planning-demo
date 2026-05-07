"""Capacity audit log helper.

Writes entries to the ``CapacityActionLog`` table introduced in v5.2 W1 per
spec §12.10. Distinct from the system-wide ``AuditLog`` (8 categories,
``models/system.py``): capacity actions get their own table because the
dashboard/history surface needs richer per-action structured data
(roles affected, people assigned, CR info, decline reason) than the generic
audit log carries.

Pattern reference: ``routers/admin._log_audit()`` (lines 52–73) — same
session-per-write + commit shape, different target table.

Spec references:
- §12.10 (CapacityActionLog DDL + write triggers + detail_payload schema)
- §12.14 (server-side scope enforcement on history reads — implemented in
  the router, not here)
- §12.15 (history endpoint contract)

This file is a stub created in v5.2 W1 lead pre-work. Implementation lives
under Teammate B (fastapi-developer); the ``CapacityActionLog`` model
this helper writes to lands in Teammate A's commit.
"""
from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.orm import Session

# NOTE: import is staged for Teammate A's model commit. Once
# ``models/capacity.CapacityActionLog`` exists, uncomment:
# from models import CapacityActionLog
from schemas.common import CurrentUser


def log_capacity_action(
    db: Session,
    user: CurrentUser,
    *,
    action_type: str,  # confirm / partial_confirm / decline / decline_request / assign_draft / cr_reconfirm
    project_id: str,
    cost_center_id: str,
    summary: str,
    detail_payload: dict[str, Any],
    change_request_id: Optional[int] = None,
) -> None:
    """Insert a CapacityActionLog row for a capacity workflow action.

    Called from the four mutating handlers in ``routers/capacity.py`` per
    spec §12.10:
      - PUT /project-confirmation/{pid}/confirm  → 'confirm' or 'partial_confirm'
      - PUT /project-confirmation/{pid}/decline  → 'decline'
      - PUT /requests/{cc}/{rid}/assignments     → 'assign_draft'
      - PUT /requests/{cc}/{rid}/partially-fulfill → 'partial_confirm'

    ``detail_payload`` shape per spec §12.10 — must include enough structured
    detail for the history page's expandable detail rows (roles affected,
    people assigned, CR info, decline reason).
    """
    raise NotImplementedError(
        "v5.2 W1 Teammate B: implement after Teammate A's CapacityActionLog model lands"
    )
