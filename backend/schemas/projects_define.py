"""Pydantic schemas for the Define-page API surface.

The Define page is the canonical project home at every DoI level (replaces
the legacy "+ New" popup and the Backlog detail page redirect). It is a
4-tab walkthrough: Identity, Tech Navigator, Financials, Approval &
Milestones. This module owns the request / response shapes for the four
new endpoints in ``routers/projects_define.py``:

- ``POST /api/projects/define``                          — name-only create.
- ``GET  /api/projects/{id}/define``                     — full project read.
- ``PUT  /api/projects/{id}/identity``                   — Identity tab save.
- ``PUT  /api/projects/{id}/approval-milestones``        — Approval tab save.
- ``PUT  /api/projects/{id}/baseline-grid``              — Financials tab save.

The Tech Navigator and milestone CRUD endpoints are reused as-is from
``routers/tech_navigator.py`` and ``routers/milestones.py``.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Shared response shape
# ---------------------------------------------------------------------------

class ProjectDefineResponse(BaseModel):
    """Full project read shared by every Define-page endpoint.

    This is the single canonical shape the Define page consumes — POST /define,
    GET /{id}/define, PUT /{id}/identity, and PUT /{id}/approval-milestones
    all return it so the frontend can rehydrate the tabs from one payload.

    ``problem_statement`` / ``business_driver`` / ``expected_outcome`` are
    declared so the frontend can bind to stable names today; the Project
    model only has ``description`` so the first reflects it and the latter
    two are always None until the structured-prompt columns land in a
    follow-on session per [A-DA-03].
    """

    id: str
    name: str
    description: Optional[str]
    status: str
    capex_opex: str
    start_month: str
    end_month: Optional[str]
    pl_person_id: Optional[str]
    is_service: bool
    project_type: Optional[int]
    transformation_level: Optional[str]
    total_budget: Optional[float]
    tshirt_size: Optional[str]
    complexity_score: Optional[float]
    value_creation_score: Optional[float]
    composite_score: Optional[float]
    pipeline_stage: Optional[str]
    doi: Optional[int]
    frozen_doi: Optional[int]
    ai_council_approved: bool
    ai_council_doc_url: Optional[str]
    rag_status: Optional[str]
    lob_id: Optional[str]
    # Structured pitch fields — for now only ``description`` is real; the
    # other two are reserved (always None) until the new columns ship.
    problem_statement: Optional[str]
    business_driver: Optional[str]
    expected_outcome: Optional[str]


# ---------------------------------------------------------------------------
# 1. POST /api/projects/define — name-only create
# ---------------------------------------------------------------------------

class ProjectDefineCreate(BaseModel):
    """Lightweight create body — only ``name`` is required.

    Backend supplies defaults for every NOT-NULL column on the Project model
    (status='draft', capex_opex='opex', start_month=config.DEMO_DATE,
    pipeline_stage='Proposed', doi=0). ``project_type`` is nullable on the
    model already so we leave it None until the user fills it in via the
    Identity tab.

    PL on own: when ``pl_person_id`` is omitted and the caller is a Project
    Lead, the service substitutes ``current_user.person_id``. Controllers and
    executives may omit it and create an un-assigned project.
    """

    name: str = Field(min_length=1, max_length=300)
    description: Optional[str] = None
    lob_id: Optional[str] = None
    pl_person_id: Optional[str] = None


# ---------------------------------------------------------------------------
# 2. PUT /api/projects/{id}/identity — Identity tab save
# ---------------------------------------------------------------------------

class ProjectIdentityUpdate(BaseModel):
    """Patch-style update for the Identity tab.

    Every field is optional; only fields present in the request body are
    written. Each changed field emits an ``audit_log`` row under
    ``entity_type='project'`` / category ``master_data``.

    Validation:
    - ``project_type`` must be 1, 2, or 3 (or null to clear).
    - ``capex_opex`` must be ``capex`` or ``opex``.
    - ``start_month`` / ``end_month`` must match ``YYYY-MM``.
    - The router enforces ``end_month >= start_month`` cross-field check.
    """

    name: Optional[str] = Field(default=None, min_length=1, max_length=300)
    description: Optional[str] = None
    project_type: Optional[int] = Field(default=None, ge=1, le=3)
    capex_opex: Optional[str] = Field(default=None, pattern="^(capex|opex)$")
    lob_id: Optional[str] = None
    pl_person_id: Optional[str] = None
    start_month: Optional[str] = Field(default=None, pattern=r"^\d{4}-\d{2}$")
    end_month: Optional[str] = Field(default=None, pattern=r"^\d{4}-\d{2}$")
    is_service: Optional[bool] = None


# ---------------------------------------------------------------------------
# 3. PUT /api/projects/{id}/approval-milestones — Approval tab save
# ---------------------------------------------------------------------------

class ProjectApprovalMilestonesUpdate(BaseModel):
    """Bundle Save for the Approval & Milestones tab.

    Combines AI Council screening + transformation level + an optional DoI
    advance into one round trip. Milestone CRUD continues to use the
    existing milestones router endpoints.

    ``advance_to_doi``:
    - When omitted, the endpoint just patches the AI Council / transformation
      level fields.
    - When present, after applying the field changes the endpoint attempts a
      forward DoI advance. PLs may only target DoI <= 2; controllers may
      target any DoI. If the gate fails and no ``override_reason`` is
      supplied, the response is 409 with the missing-field list. Controllers
      may supply ``override_reason`` to bypass the gate and audit-log the
      override.
    """

    ai_council_approved: Optional[bool] = None
    ai_council_doc_url: Optional[str] = None
    transformation_level: Optional[str] = Field(
        default=None, pattern="^(T0|T1|T2)$",
    )
    advance_to_doi: Optional[int] = Field(default=None, ge=0, le=5)
    override_reason: Optional[str] = None


# ---------------------------------------------------------------------------
# 4. PUT /api/projects/{id}/baseline-grid — Financials tab save
# ---------------------------------------------------------------------------

class BaselineGridMonthCell(BaseModel):
    """One month's value inside a baseline-grid row."""

    month: str = Field(pattern=r"^\d{4}-\d{2}$")
    amount_eur: float = Field(ge=0)
    hours: Optional[float] = Field(default=None, ge=0)


class BaselineGridRow(BaseModel):
    """One (category, sub_category) row in the Financials baseline grid.

    Conservative semantics: when this row is present in the request, the
    backend deletes every existing Baseline row matching
    ``(project_id, category, sub_category)`` and re-inserts from
    ``months``. Rows whose ``(category, sub_category)`` pair is NOT in the
    payload remain untouched.
    """

    category: Literal["internal", "external"]
    sub_category: str
    months: list[BaselineGridMonthCell] = Field(default_factory=list)
    capex_opex: Optional[str] = Field(default=None, pattern="^(capex|opex)$")
    description: Optional[str] = None
    vendor: Optional[str] = None
    role_type_id: Optional[str] = None


class ProjectFinancialsUpdate(BaseModel):
    """Financials tab Save body — Quick Sizing block + optional baseline grid.

    ``total_budget`` and ``capex_opex`` cover the Quick Sizing block at the
    top of the tab. ``rows`` covers the full baseline plan grid. Either may
    be supplied independently — the Save button persists whichever fields
    are dirty. When ``rows`` is omitted, the baseline grid is untouched.
    """

    total_budget: Optional[float] = Field(default=None, ge=0)
    capex_opex: Optional[str] = Field(default=None, pattern="^(capex|opex)$")
    rows: Optional[list[BaselineGridRow]] = None


class BaselineGridResponseRow(BaselineGridRow):
    """Same shape as the input row, plus the resolved display name and a
    monthly total for cheaper frontend rendering. Used in the GET response."""

    sub_category_name: Optional[str] = None


class BaselineGridResponse(BaseModel):
    """Hydrated baseline-grid response — returned alongside the project
    payload on PUT /baseline-grid so the frontend can re-render without a
    second round trip."""

    items: list[BaselineGridResponseRow]
    total: int


class ProjectFinancialsResponse(BaseModel):
    """Compound response for the Financials tab Save — both the project
    payload (with refreshed total_budget / capex_opex / tshirt_size) and
    the hydrated baseline grid."""

    project: ProjectDefineResponse
    baseline_rows: BaselineGridResponse
