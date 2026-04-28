"""Workflow Template Editor endpoints — Cluster D Session D2 [D-CAT-07].

Configurable backing store for the six workflow templates listed in spec
line ~1673:

1. Forecast cycle (5 phases)
2. Intake / pipeline progression
3. Change Request
4. Send Back
5. Milestone baseline override
6. Scheduled master data activation

Steps are **not** reorderable through the API per spec — admins toggle
required/skippable, change role assignments, set notifications, time
constraints, escalation actions, and data gates. Adding/removing steps is
not supported in v5; templates ship with a fixed step set.

D2 ships templates as configurable data only — wiring them into live
CR/intake flows is a future session.
"""

from __future__ import annotations

import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from database import get_db
from dependencies import require_role
from models.workflow_templates import (
    ESCALATION_ACTIONS,
    STEP_TYPES,
    StepAction,
    WorkflowStep,
    WorkflowTemplate,
)
from routers.admin import _log_audit
from schemas.common import CurrentUser


router = APIRouter(prefix="/api/admin/workflow-templates", tags=["Workflow Templates"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class StepActionResponse(BaseModel):
    id: int
    action_order: int
    action_type: str
    label: str
    config: Optional[dict] = None


class WorkflowStepResponse(BaseModel):
    id: int
    step_order: int
    name: str
    description: Optional[str] = None
    step_type: str
    required: bool
    skippable: bool
    assigned_role: Optional[str] = None
    data_gates: Optional[list] = None
    notifications: Optional[dict] = None
    time_constraint_days: Optional[int] = None
    escalation_action: Optional[str] = None
    actions: list[StepActionResponse] = Field(default_factory=list)


class WorkflowTemplateResponse(BaseModel):
    id: int
    key: str
    name: str
    description: Optional[str] = None
    is_active: bool
    steps: list[WorkflowStepResponse] = Field(default_factory=list)


class WorkflowTemplateSummary(BaseModel):
    id: int
    key: str
    name: str
    description: Optional[str] = None
    is_active: bool
    step_count: int


class WorkflowStepUpdate(BaseModel):
    """Touchpoints editable per ``[D-CAT-07]``. ``step_order`` is intentionally
    omitted — steps are not reorderable through the API."""

    name: Optional[str] = None
    description: Optional[str] = None
    required: Optional[bool] = None
    skippable: Optional[bool] = None
    assigned_role: Optional[str] = None
    data_gates: Optional[list] = None
    notifications: Optional[dict] = None
    time_constraint_days: Optional[int] = None
    escalation_action: Optional[str] = None


class WorkflowTemplateActiveUpdate(BaseModel):
    is_active: bool


# ---------------------------------------------------------------------------
# Serialization helpers
# ---------------------------------------------------------------------------

def _decode_json(text: Optional[str], default):
    if text is None or text == "":
        return default
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return default


def _step_to_response(step: WorkflowStep) -> WorkflowStepResponse:
    return WorkflowStepResponse(
        id=step.id,
        step_order=step.step_order,
        name=step.name,
        description=step.description,
        step_type=step.step_type,
        required=step.required,
        skippable=step.skippable,
        assigned_role=step.assigned_role,
        data_gates=_decode_json(step.data_gates_json, None),
        notifications=_decode_json(step.notifications_json, None),
        time_constraint_days=step.time_constraint_days,
        escalation_action=step.escalation_action,
        actions=[
            StepActionResponse(
                id=a.id,
                action_order=a.action_order,
                action_type=a.action_type,
                label=a.label,
                config=_decode_json(a.config_json, None),
            )
            for a in step.actions
        ],
    )


def _template_to_response(template: WorkflowTemplate) -> WorkflowTemplateResponse:
    return WorkflowTemplateResponse(
        id=template.id,
        key=template.key,
        name=template.name,
        description=template.description,
        is_active=template.is_active,
        steps=[_step_to_response(s) for s in template.steps],
    )


# ---------------------------------------------------------------------------
# GET / — list all templates
# ---------------------------------------------------------------------------

@router.get("")
def list_workflow_templates(
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role("controller")),
):
    """List all workflow templates with step counts (no step bodies)."""
    templates = db.query(WorkflowTemplate).order_by(WorkflowTemplate.id.asc()).all()
    items = [
        WorkflowTemplateSummary(
            id=t.id,
            key=t.key,
            name=t.name,
            description=t.description,
            is_active=t.is_active,
            step_count=len(t.steps),
        ).model_dump()
        for t in templates
    ]
    return {"items": items, "total": len(items)}


# ---------------------------------------------------------------------------
# GET /{id_or_key} — full template detail with steps + actions
# ---------------------------------------------------------------------------

@router.get("/{id_or_key}")
def get_workflow_template(
    id_or_key: str,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role("controller")),
):
    """Fetch a template by numeric id or its stable ``key``."""
    template = _resolve_template(db, id_or_key)
    if not template:
        raise HTTPException(status_code=404, detail=f"Workflow template not found: {id_or_key}")
    return _template_to_response(template).model_dump()


# ---------------------------------------------------------------------------
# PUT /{id_or_key}/steps/{step_id} — edit a single step's touchpoints
# ---------------------------------------------------------------------------

@router.put("/{id_or_key}/steps/{step_id}")
def update_workflow_step(
    id_or_key: str,
    step_id: int,
    body: WorkflowStepUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Update touchpoints on a single step. ``step_order`` is not editable.

    Each changed attribute writes its own audit row under category
    ``configuration`` to mirror the planning-parameter pattern.
    """
    template = _resolve_template(db, id_or_key)
    if not template:
        raise HTTPException(status_code=404, detail=f"Workflow template not found: {id_or_key}")

    step = (
        db.query(WorkflowStep)
        .filter(WorkflowStep.id == step_id, WorkflowStep.template_id == template.id)
        .first()
    )
    if not step:
        raise HTTPException(status_code=404, detail=f"Step not found: {step_id}")

    payload = body.model_dump(exclude_unset=True)

    # Validate constrained values
    if "step_type" in payload and payload["step_type"] not in STEP_TYPES:
        raise HTTPException(status_code=400, detail=f"step_type must be one of {STEP_TYPES}")
    if (
        "escalation_action" in payload
        and payload["escalation_action"] is not None
        and payload["escalation_action"] not in ESCALATION_ACTIONS
    ):
        raise HTTPException(
            status_code=400,
            detail=f"escalation_action must be one of {ESCALATION_ACTIONS} or null",
        )
    if "time_constraint_days" in payload and payload["time_constraint_days"] is not None:
        if payload["time_constraint_days"] < 0:
            raise HTTPException(status_code=400, detail="time_constraint_days must be >= 0")

    audit_entity = f"{template.key}/{step.name}"

    for field_name, new_value in payload.items():
        if field_name == "data_gates":
            new_serialised = json.dumps(new_value) if new_value is not None else None
            if step.data_gates_json != new_serialised:
                _log_audit(
                    db, user, "workflow_step", str(step.id), audit_entity, "update",
                    field_changed="data_gates",
                    old_value=step.data_gates_json, new_value=new_serialised,
                    category="configuration",
                )
                step.data_gates_json = new_serialised
        elif field_name == "notifications":
            new_serialised = json.dumps(new_value) if new_value is not None else None
            if step.notifications_json != new_serialised:
                _log_audit(
                    db, user, "workflow_step", str(step.id), audit_entity, "update",
                    field_changed="notifications",
                    old_value=step.notifications_json, new_value=new_serialised,
                    category="configuration",
                )
                step.notifications_json = new_serialised
        else:
            old_value = getattr(step, field_name)
            if old_value != new_value:
                _log_audit(
                    db, user, "workflow_step", str(step.id), audit_entity, "update",
                    field_changed=field_name,
                    old_value=str(old_value) if old_value is not None else None,
                    new_value=str(new_value) if new_value is not None else None,
                    category="configuration",
                )
                setattr(step, field_name, new_value)

    db.commit()
    db.refresh(step)
    return _step_to_response(step).model_dump()


# ---------------------------------------------------------------------------
# PUT /{id_or_key}/active — toggle whole-template active flag
# ---------------------------------------------------------------------------

@router.put("/{id_or_key}/active")
def toggle_workflow_template_active(
    id_or_key: str,
    body: WorkflowTemplateActiveUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Toggle a whole template active/inactive. Audit-logged."""
    template = _resolve_template(db, id_or_key)
    if not template:
        raise HTTPException(status_code=404, detail=f"Workflow template not found: {id_or_key}")
    if template.is_active != body.is_active:
        _log_audit(
            db, user, "workflow_template", str(template.id), template.name, "update",
            field_changed="is_active",
            old_value=str(template.is_active), new_value=str(body.is_active),
            category="configuration",
        )
        template.is_active = body.is_active
        db.commit()
        db.refresh(template)
    return WorkflowTemplateSummary(
        id=template.id, key=template.key, name=template.name,
        description=template.description, is_active=template.is_active,
        step_count=len(template.steps),
    ).model_dump()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _resolve_template(db: Session, id_or_key: str) -> Optional[WorkflowTemplate]:
    q = db.query(WorkflowTemplate).options(
        joinedload(WorkflowTemplate.steps).joinedload(WorkflowStep.actions)
    )
    if id_or_key.isdigit():
        return q.filter(WorkflowTemplate.id == int(id_or_key)).first()
    return q.filter(WorkflowTemplate.key == id_or_key).first()
