"""Pydantic schemas for the v5 Cluster F Stage 1 Distribution edges.

Per [F-S1-01..05]: edges-as-list, sparse storage, sum-rule (≤100%) and
hard-block cycle detection on save. Versioning per [F-S1-04] uses CRETA's
standard baseline/forecast/actuals model with scenario versions identified
by their scenario id.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class DistributionBase(BaseModel):
    year: int = Field(..., ge=2000, le=2100)
    version: str = Field(..., min_length=1, max_length=40)
    percentage: float = Field(..., ge=0, le=100)


class DistributionCreate(DistributionBase):
    source_entity_id: str = Field(..., min_length=1, max_length=50)
    destination_entity_id: str = Field(..., min_length=1, max_length=50)

    @field_validator("destination_entity_id")
    @classmethod
    def _no_self_loop(cls, v: str, info) -> str:
        src = info.data.get("source_entity_id")
        if src is not None and v == src:
            raise ValueError(
                "source_entity_id and destination_entity_id must differ "
                "(self-loops are rejected per [F-S1-05])",
            )
        return v


class DistributionUpdate(BaseModel):
    """Partial update — only ``percentage`` is editable post-create.

    Year, version, source, and destination are immutable: changing them is
    semantically a different edge, so the caller deletes the old edge and
    creates a new one. This matches the spec's edges-as-list mechanic and
    keeps cycle detection simple.
    """

    percentage: float = Field(..., ge=0, le=100)


class DistributionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    year: int
    version: str
    source_entity_id: str
    destination_entity_id: str
    percentage: float
    # Convenience fields populated by the router/service for list views;
    # not stored on the model.
    source_entity_name: Optional[str] = None
    destination_entity_name: Optional[str] = None


class DistributionListResponse(BaseModel):
    items: list[DistributionResponse]
    total: int


class EntityDistributionSummary(BaseModel):
    """Single-entity distribution profile per [F-S1-03].

    Surfaces ``to_business_pct`` plus the outgoing edges and the derived
    self-retained percentage so a client can render the edges-as-list editor
    without separate calls.
    """

    entity_id: str
    entity_name: str
    year: int
    version: str
    to_business_pct: float
    distributions: list[DistributionResponse]
    self_retained_pct: float
    # Validation flag — true when (to_business + sum(distribute)) ≤ 100. Always
    # true for committed state; surfaced so the UI can highlight invalid drafts.
    sums_within_100: bool


class DistributionEffectiveCost(BaseModel):
    """DAG-resolved effective cost for a single entity per [F-S1-02].

    ``own_cost`` is the entity's own (Run-stage) annual cost. Resolution order:
    - Project subtypes: ``Project.annual_budget`` → ``Project.total_budget``
      → ``ChargeableEntity.annual_cost`` (F3).
    - Offering / InternalService: ``ChargeableEntity.annual_cost`` (F3).
    ``own_cost_source`` indicates which column provided the value.

    ``inflows`` lists the per-source contribution (source_entity_id, %, amount)
    walked through the DAG. ``effective_cost`` is ``own_cost + sum(inflows)``.
    """

    entity_id: str
    entity_name: str
    year: int
    version: str
    own_cost: float
    # F3: source field for own_cost (annual_budget | total_budget | annual_cost | zero)
    own_cost_source: Optional[str] = None
    inflows: list["DistributionInflow"]
    inflow_total: float
    effective_cost: float


class DistributionInflow(BaseModel):
    source_entity_id: str
    source_entity_name: str
    percentage: float
    amount: float


DistributionEffectiveCost.model_rebuild()


class CycleError(BaseModel):
    """Returned in the 409 body when a save would create a cycle.

    The chain is the ordered list of entity ids from the proposed source
    around back to itself. Renderers display it as
    ``A → B → C → A`` so the user can identify which existing edge to remove.
    """

    detail: str
    cycle_chain: list[str]


class WBSElementResponse(BaseModel):
    """Algorithmic WBS Element preview per [F-DM-03].

    Format: ``<prefix>-64-99-<location_code>`` where prefix is
    ``IT0<PPM>`` / ``IT00<S-code>`` / ``ITF<NNNNN>`` per the entity type.
    Generated; never stored.
    """

    entity_id: str
    charging_location_id: str
    wbs_element: str
