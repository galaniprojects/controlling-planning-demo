"""FastAPI dependencies — get_current_user, authorization helpers."""

from __future__ import annotations

import json

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
