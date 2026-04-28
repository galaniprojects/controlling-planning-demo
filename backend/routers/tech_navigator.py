"""Tech Navigator scoring API [A-TN-05].

Two endpoints, both mounted at /api/projects:
- GET  /{project_id}/tech-navigator — readable by any authenticated user.
- PUT  /{project_id}/tech-navigator — controller (any project) or PL on own
  projects. Each changed field emits an audit_log entry; computed scores are
  recomputed and persisted in the same transaction.

Authorization:
- Spec role-access table: controllers can edit Tech Navigator scores; PL can
  edit own projects' master data; executive and cost_center_owner are
  read-only. Confirmed in plan with the user.
- The spec's "controller should use Send Back instead of free-editing" rule
  is enforced at the UI layer (A7) and via the Send Back workflow (A5);
  controller writes here are still permitted at the API and audit-logged.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user
from models.projects import Project
from routers.admin import _log_audit
from schemas.common import CurrentUser
from schemas.tech_navigator import TechNavigatorResponse, TechNavigatorUpdate
from services.tech_navigator import (
    WeightsSnapshot,
    load_weights,
    recompute_project,
)

router = APIRouter(prefix="/api/projects", tags=["Tech Navigator"])


_EDITABLE_FIELDS = (
    "project_type",
    "transformation_level",
    "tn_standardization",
    "tn_usage",
    "tn_maintenance",
    "tn_financial_benefit",
    "tn_payback",
    "tn_competitive_advantage",
    "tn_value_reserved_1",
    "tn_value_reserved_2",
)


def _can_edit_tn(user: CurrentUser, project: Project) -> bool:
    """Authorization gate for PUT.

    Controller: any project. PL: only projects where they are the assigned PL
    or the project ID is in their static seed-data list (matches the
    pl_project_filter convention in dependencies.py).
    """
    if user.role == "controller":
        return True
    if user.role == "project_lead":
        if project.pl_person_id == user.person_id:
            return True
        if project.id in user.project_ids:
            return True
    return False


def _build_response(project: Project, weights: WeightsSnapshot) -> TechNavigatorResponse:
    return TechNavigatorResponse(
        project_id=project.id,
        project_type=project.project_type,
        transformation_level=project.transformation_level,
        tn_standardization=project.tn_standardization,
        tn_usage=project.tn_usage,
        tn_maintenance=project.tn_maintenance,
        tn_financial_benefit=project.tn_financial_benefit,
        tn_payback=project.tn_payback,
        tn_competitive_advantage=project.tn_competitive_advantage,
        tn_value_reserved_1=project.tn_value_reserved_1,
        tn_value_reserved_2=project.tn_value_reserved_2,
        complexity_score=float(project.complexity_score) if project.complexity_score is not None else None,
        value_creation_score=float(project.value_creation_score) if project.value_creation_score is not None else None,
        composite_score=float(project.composite_score) if project.composite_score is not None else None,
        tshirt_size=project.tshirt_size,
        total_budget=float(project.total_budget) if project.total_budget is not None else None,
        weights={
            "complexity": weights.complexity,
            "value_creation": weights.value_creation,
            "ranking": weights.ranking,
            "tshirt": weights.tshirt,
        },
    )


@router.get("/{project_id}/tech-navigator", response_model=TechNavigatorResponse)
def get_tech_navigator(
    project_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Return the Tech Navigator profile for a project.

    Open to all authenticated roles. Returns null sub-criteria and null
    composites for unscored projects.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    weights = load_weights(db)
    return _build_response(project, weights)


@router.put("/{project_id}/tech-navigator", response_model=TechNavigatorResponse)
def update_tech_navigator(
    project_id: str,
    body: TechNavigatorUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Update Tech Navigator scores for a project.

    Partial update — any subset of fields may be supplied. After applying the
    changes, recompute the denormalized complexity_score, value_creation_score,
    composite_score, and tshirt_size. Each changed field emits an audit_log
    entry under entity_type='tech_navigator'.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not _can_edit_tn(user, project):
        raise HTTPException(
            status_code=403,
            detail="Only controllers or the assigned project lead can edit Tech Navigator scores",
        )

    payload = body.model_dump(exclude_unset=True)
    for field_name in _EDITABLE_FIELDS:
        if field_name not in payload:
            continue
        new_value = payload[field_name]
        old_value = getattr(project, field_name)
        if old_value == new_value:
            continue
        setattr(project, field_name, new_value)
        _log_audit(
            db,
            user,
            entity_type="tech_navigator",
            entity_id=project.id,
            entity_name=project.name,
            action="update",
            field_changed=field_name,
            old_value=str(old_value) if old_value is not None else None,
            new_value=str(new_value) if new_value is not None else None,
            category="master_data",
        )

    weights = load_weights(db)
    recompute_project(project, weights)
    db.commit()
    db.refresh(project)
    return _build_response(project, weights)
