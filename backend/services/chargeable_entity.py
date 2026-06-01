"""Keep a Project's polymorphic ChargeableEntity row in sync on create.

In-app project creation — the Define page (``POST /api/projects/define``) and
the legacy intake (``POST /api/intake/projects``) — must mint a
``ChargeableEntity`` for the new ``Project`` so it surfaces in the Workbench,
Charging, and cost-rollup modules exactly like seeded projects do. The
Workbench sidebar is built from ``ChargeableEntity`` rows (not ``Project``
rows), so a project with no matching entity is silently dropped from the list.

The seed builds these rows in
``generate_seed_v5/s06_chargeable_entities.py`` (via
``config/entities.py::all_chargeable_entities``); this module mirrors that
Project-row shape for the runtime create paths: ``id`` == project id, a fresh
``IT0NNNNN`` PPM ``identifier``, ``s_code``/``allocation_key`` NULL, and
``to_business_pct`` 0 (Change-stage projects release nothing to business).
"""
from __future__ import annotations

import re
from typing import Optional

from sqlalchemy.orm import Session

from models.charging import ChargeableEntity
from models.projects import Project

# Project PPMs are "IT0" + digits (e.g. IT012001). Offerings (IT00S###) and
# internal services (ITF#####) use other prefixes and other entity_types, so
# filtering on entity_type='Project' keeps this parse unambiguous.
_PROJECT_IDENTIFIER_RE = re.compile(r"^IT0(\d+)$")
# First runtime PPM if the table somehow has no Project entities yet. Sits
# above the seed's IT01xxxx band so a cold-start create never collides.
_IDENTIFIER_FALLBACK_START = 20001


def generate_project_identifier(db: Session) -> str:
    """Return the next free ``IT0NNNNN`` PPM identifier for a Project entity.

    Parses the numeric tail of every existing ``entity_type='Project'``
    ChargeableEntity identifier (``IT012001`` -> 12001), takes the max, and
    increments. Loops until the candidate is unused so the
    ``uq_chargeable_entity_identifier`` constraint can never be violated.
    """
    rows = (
        db.query(ChargeableEntity.identifier)
        .filter(ChargeableEntity.entity_type == "Project")
        .all()
    )
    max_n = 0
    for (ident,) in rows:
        m = _PROJECT_IDENTIFIER_RE.match(ident or "")
        if m:
            max_n = max(max_n, int(m.group(1)))

    nxt = max(max_n + 1, _IDENTIFIER_FALLBACK_START)
    while (
        db.query(ChargeableEntity.id)
        .filter(ChargeableEntity.identifier == f"IT0{nxt:05d}")
        .first()
        is not None
    ):
        nxt += 1
    return f"IT0{nxt:05d}"


def ensure_project_chargeable_entity(
    db: Session,
    project: Project,
    *,
    hierarchy_node_id: Optional[str] = None,
) -> ChargeableEntity:
    """Create the 1:1 ChargeableEntity for ``project`` if it has none.

    Idempotent: returns the existing row when one already exists (the
    ``uq_chargeable_entity_project`` constraint permits at most one). The
    caller must have flushed ``project`` so ``project.id`` is populated.
    """
    existing = (
        db.query(ChargeableEntity)
        .filter(ChargeableEntity.project_id == project.id)
        .first()
    )
    if existing is not None:
        return existing

    entity = ChargeableEntity(
        id=project.id,
        entity_type="Project",
        identifier=generate_project_identifier(db),
        s_code=None,
        name=project.name,
        description=None,
        hierarchy_node_id=hierarchy_node_id,
        responsible_person_id=project.pl_person_id,
        allocation_key=None,
        to_business_pct=0,
        project_id=project.id,
        termination_month=None,
        annual_cost=None,
        is_active=True,
    )
    db.add(entity)
    db.flush()
    return entity
