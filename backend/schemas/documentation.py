"""Pydantic schemas for Documentation endpoints (Section 10.7)."""

from __future__ import annotations

from pydantic import BaseModel


class ModuleManualSection(BaseModel):
    title: str
    body: str


class ModuleManualSummary(BaseModel):
    module_id: str
    module_name: str
    description: str


class ModuleManualDetail(BaseModel):
    module_id: str
    module_name: str
    sections: list[ModuleManualSection]


class FAQStep(BaseModel):
    step_number: int
    instruction: str
    target_module: str | None = None


class FAQSummary(BaseModel):
    id: str
    question: str
    summary: str
    applicable_roles: list[str]
    modules_involved: list[str]


class FAQDetail(BaseModel):
    id: str
    question: str
    summary: str
    applicable_roles: list[str]
    modules_involved: list[str]
    steps: list[FAQStep]


class ChangelogSection(BaseModel):
    title: str
    body: str


class ChangelogEntry(BaseModel):
    version: str
    date: str
    title: str
    summary: str
    sections: list[ChangelogSection]
