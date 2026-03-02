"""Shared schema types used across all endpoint groups."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


@dataclass
class CurrentUser:
    """Resolved from X-Current-User header via get_current_user dependency."""

    user_id: str  # DemoPersona.id, e.g. "persona-controller"
    person_id: str  # DemoPersona.person_id, e.g. "p-meier"
    name: str  # DemoPersona.display_name
    role: str  # controller | cost_center_owner | project_lead | executive
    cost_center_id: str | None = None  # DemoPersona.managed_cost_center_id
    project_ids: list[str] = field(default_factory=list)  # parsed from owned_project_ids_json


class PaginatedResponse(BaseModel, Generic[T]):
    """Standard list response shape: { items: [...], total: N }."""

    items: list[T]
    total: int


class ErrorResponse(BaseModel):
    detail: str
