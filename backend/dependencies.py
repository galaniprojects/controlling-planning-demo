"""FastAPI dependencies — get_current_user, authorization helpers."""

from __future__ import annotations

import json
from typing import Optional

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.users import DemoPersona
from schemas.common import CurrentUser


def get_current_user(
    x_current_user: str = Header(..., alias="X-Current-User"),
    db: Session = Depends(get_db),
) -> CurrentUser:
    """Resolve X-Current-User header to a CurrentUser context object.

    The header value must be a valid DemoPersona ID
    (e.g. 'persona-controller', 'persona-cc-owner', 'persona-pl', 'persona-exec').
    """
    persona = db.query(DemoPersona).filter(DemoPersona.id == x_current_user).first()
    if not persona:
        raise HTTPException(status_code=401, detail=f"Unknown persona: {x_current_user}")
    project_ids = json.loads(persona.owned_project_ids_json) if persona.owned_project_ids_json else []
    return CurrentUser(
        user_id=persona.id,
        person_id=persona.person_id,
        name=persona.display_name,
        role=persona.role,
        cost_center_id=persona.managed_cost_center_id,
        project_ids=project_ids,
    )


def pl_project_filter(user: CurrentUser):
    """Return a SQLAlchemy filter for projects visible to a project-lead user.

    Matches projects where the user is the assigned PL (``pl_person_id``) **or**
    the project ID is in the user's static seed-data list.  This ensures both
    dynamically-created projects and pre-seeded projects are included.
    """
    from sqlalchemy import or_
    from models.projects import Project

    conditions = [Project.pl_person_id == user.person_id]
    if user.project_ids:
        conditions.append(Project.id.in_(user.project_ids))
    return or_(*conditions)


def pl_leads_project(db: Session, user: CurrentUser, project_id: str) -> bool:
    """Return True if ``user`` is the Project Lead for ``project_id``.

    Mirrors :func:`pl_project_filter`: a PL leads a project when they are the
    assigned ``pl_person_id`` **or** the project ID is in their static seed
    list. Used by per-action scoping (Simulator §9) to decide whether a PL may
    author an action/overlay against a given project.
    """
    from models.projects import Project

    if project_id in (user.project_ids or []):
        return True
    proj = db.query(Project).filter(Project.id == project_id).first()
    return bool(proj is not None and proj.pl_person_id == user.person_id)


def assert_pl_may_touch_project(
    db: Session, user: CurrentUser, project_id: Optional[str],
) -> None:
    """Enforce per-action project scoping for Project-Lead authors (Simulator §9).

    Controllers and executives are unrestricted (no scope wall). A
    cost-centre owner falls back to its existing per-action CC scoping (handled
    elsewhere) and is not gated here. A ``project_lead`` may only author
    actions/overlays against projects they lead; anything else raises
    ``HTTPException(403)``.

    A ``None`` ``project_id`` (portfolio-scope / project-agnostic action) is
    not project-scopable and is rejected for PLs, since a PL scenario must be
    project-scoped to the projects they lead.
    """
    if user.role != "project_lead":
        return
    if not project_id:
        raise HTTPException(
            status_code=403,
            detail=(
                "Project Leads may only author project-scoped actions for "
                "projects they lead; this action has no project target."
            ),
        )
    if not pl_leads_project(db, user, project_id):
        raise HTTPException(
            status_code=403,
            detail=(
                f"Project Leads may only act on projects they lead. "
                f"Project '{project_id}' is outside your led set."
            ),
        )


def user_has_tier3(db: Session, user: CurrentUser) -> bool:
    """Return True if the persona has Tier 3 simulator access per [D-AC-02].

    Tier 3 is a flag on the ``User`` row (not on ``DemoPersona``). For demo
    purposes we look up the User by person_id; if no User row exists or the
    flag is False we deny Tier 3.
    """
    from models.users import User

    if not user.person_id:
        return False
    row = (
        db.query(User)
        .filter(User.person_id == user.person_id, User.is_active.is_(True))
        .first()
    )
    return bool(row and row.tier3_flag)


def require_role(*allowed_roles: str):
    """Return a FastAPI dependency that checks the current user has one of the allowed roles.

    Usage in router:
        @router.get("/admin/something")
        def something(user: CurrentUser = Depends(require_role("controller"))):
            ...
    """
    def checker(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail=f"Role '{current_user.role}' not permitted. Required: {', '.join(allowed_roles)}",
            )
        return current_user
    return checker
