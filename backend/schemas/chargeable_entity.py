"""Pydantic schemas for the v5 Cluster F ChargeableEntity polymorphic model.

Per [F-DM-01]: three subtypes (Project, Offering, InternalService) share one
table. Identifier formats are enforced at the schema layer:

- ``Project``      → ``IT0<PPM>``     where PPM is 5 digits (e.g. ``IT012345``)
- ``Offering``     → ``IT00<S-code>`` where S-code is uppercase alphanumeric
- ``InternalService`` → ``ITF<NNNNN>`` where NNNNN is 5 digits

Server-side validation lives in ``services.identifier_validation`` (referenced
from the router). The schemas keep validation light — strict enough to reject
obvious typos, permissive enough to allow KB to evolve the format without a
schema rewrite.
"""

from __future__ import annotations

import re
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

# Subtype identifier patterns per [F-DM-01].
PROJECT_ID_PATTERN = re.compile(r"^IT0\d{5,6}$")
OFFERING_ID_PATTERN = re.compile(r"^IT00[A-Z0-9]{2,8}$")
INTERNAL_SERVICE_ID_PATTERN = re.compile(r"^ITF\d{5}$")

EntityType = Literal["Project", "Offering", "InternalService"]


def validate_identifier_for_type(entity_type: str, identifier: str) -> str:
    """Validate the identifier against the entity_type pattern.

    Returns the identifier unchanged on success; raises ``ValueError`` with
    a human-readable message on mismatch. Centralised here so the router and
    seed-time validation share the same rules.
    """
    patterns = {
        "Project": (PROJECT_ID_PATTERN, "IT0<PPM 5-6 digits>"),
        "Offering": (OFFERING_ID_PATTERN, "IT00<S-code 2-8 alphanumerics>"),
        "InternalService": (INTERNAL_SERVICE_ID_PATTERN, "ITF<5 digits>"),
    }
    if entity_type not in patterns:
        raise ValueError(
            f"entity_type must be one of Project/Offering/InternalService, got '{entity_type}'",
        )
    pattern, hint = patterns[entity_type]
    if not pattern.match(identifier):
        raise ValueError(
            f"Identifier '{identifier}' does not match {entity_type} format ({hint})",
        )
    return identifier


class ChargeableEntityBase(BaseModel):
    """Common fields across create/update/response."""

    name: str = Field(..., min_length=1, max_length=300)
    description: Optional[str] = None
    hierarchy_node_id: Optional[str] = Field(None, max_length=50)
    responsible_person_id: Optional[str] = Field(None, max_length=50)
    to_business_pct: float = Field(0.0, ge=0, le=100)
    termination_month: Optional[str] = Field(None, pattern=r"^\d{4}-\d{2}$")
    # F3: own running cost in EUR; primary source for Offerings/InternalServices.
    annual_cost: Optional[float] = Field(None, ge=0)


class ChargeableEntityCreate(ChargeableEntityBase):
    """Request body for POST /api/admin/chargeable-entities.

    For ``entity_type='Project'`` rows, ``project_id`` MUST be supplied and
    point at an existing project row; the identifier is then derived from the
    project's id (or the request's identifier if explicit). Offerings and
    InternalServices have no underlying project — they are created here and
    nowhere else.
    """

    entity_type: EntityType
    identifier: str = Field(..., min_length=4, max_length=40)
    project_id: Optional[str] = Field(None, max_length=50)

    @field_validator("identifier")
    @classmethod
    def _strip_identifier(cls, v: str) -> str:
        return v.strip()


class ChargeableEntityUpdate(BaseModel):
    """Partial update — all fields optional. ``entity_type`` and ``identifier``
    are immutable after creation; changing them would require migrating all
    Distribution edges and is out of scope for v5.
    """

    name: Optional[str] = Field(None, min_length=1, max_length=300)
    description: Optional[str] = None
    hierarchy_node_id: Optional[str] = Field(None, max_length=50)
    responsible_person_id: Optional[str] = Field(None, max_length=50)
    to_business_pct: Optional[float] = Field(None, ge=0, le=100)
    termination_month: Optional[str] = Field(None, pattern=r"^\d{4}-\d{2}$")
    # F3: own running cost in EUR.
    annual_cost: Optional[float] = Field(None, ge=0)


class ChargeableEntityResponse(BaseModel):
    """Response shape — flattens the property-derived ``is_change_or_run``."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    entity_type: EntityType
    identifier: str
    name: str
    description: Optional[str] = None
    hierarchy_node_id: Optional[str] = None
    responsible_person_id: Optional[str] = None
    to_business_pct: float
    annual_cost: Optional[float] = None
    project_id: Optional[str] = None
    termination_month: Optional[str] = None
    is_active: bool
    is_change_or_run: str  # Derived; populated by router from the model property


class ChargeableEntityListResponse(BaseModel):
    items: list[ChargeableEntityResponse]
    total: int
