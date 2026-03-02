"""Pydantic schemas for What-If Simulator endpoints (Section 10.6)."""
from __future__ import annotations
from pydantic import BaseModel


class ScenarioListItem(BaseModel):
    id: int
    name: str
    description: str | None
    status: str
    author_name: str
    created_at: str
    modified_at: str
    headline_impact: str | None


class ScenarioCreate(BaseModel):
    name: str
    description: str | None = None
    clone_from: int | None = None


class ScenarioMetadataUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class ActionRequest(BaseModel):
    scope: str
    action_type: str
    project_id: str | None = None
    parameters: dict = {}


class ActionReorder(BaseModel):
    action_ids: list[int]


class CompareRequest(BaseModel):
    scenario_ids: list[int]


class AdvisorQuery(BaseModel):
    goal: str


class AdvisorApply(BaseModel):
    path_id: str
