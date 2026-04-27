"""Pydantic schemas for the Tech Navigator scoring API [A-TN-04].

The PUT body is fully partial — any subset of fields can be updated; omitted
fields preserve their existing value. The GET response carries both the raw
sub-criteria entered by the user and the recomputed composites, alongside a
snapshot of the active admin weights so the UI can render attribution.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


# Reusable type aliases. Sub-criteria are integers 1-5 per spec; rubric labels
# at intermediate values are defined in the KB Tech Navigator slide deck.
SubCriterion = int  # validated via Field(ge=1, le=5) in the model
TransformationLevel = Literal["T0", "T1", "T2"]
ProjectType = Literal[1, 2, 3]


class TechNavigatorUpdate(BaseModel):
    """Partial-update request body for PUT /api/projects/{id}/tech-navigator.

    All fields are optional; only fields present in the request are updated.
    """

    project_type: Optional[ProjectType] = None
    transformation_level: Optional[TransformationLevel] = None
    tn_standardization: Optional[SubCriterion] = Field(default=None, ge=1, le=5)
    tn_usage: Optional[SubCriterion] = Field(default=None, ge=1, le=5)
    tn_maintenance: Optional[SubCriterion] = Field(default=None, ge=1, le=5)
    tn_financial_benefit: Optional[SubCriterion] = Field(default=None, ge=1, le=5)
    tn_payback: Optional[SubCriterion] = Field(default=None, ge=1, le=5)
    tn_competitive_advantage: Optional[SubCriterion] = Field(default=None, ge=1, le=5)
    tn_value_reserved_1: Optional[SubCriterion] = Field(default=None, ge=1, le=5)
    tn_value_reserved_2: Optional[SubCriterion] = Field(default=None, ge=1, le=5)


class ComplexityWeights(BaseModel):
    standardization: float
    usage: float
    maintenance: float


class ValueCreationWeights(BaseModel):
    financial: float
    payback: float
    competitive: float


class RankingWeights(BaseModel):
    value: float
    complexity: float


class TshirtThresholds(BaseModel):
    xs_max: int
    s_max: int
    m_max: int
    l_max: int


class WeightsSnapshotResponse(BaseModel):
    """Snapshot of active admin weights, embedded in the read response."""

    complexity: ComplexityWeights
    value_creation: ValueCreationWeights
    ranking: RankingWeights
    tshirt: TshirtThresholds


class TechNavigatorResponse(BaseModel):
    """Full Tech Navigator profile for a project, including computed scores."""

    project_id: str
    project_type: Optional[ProjectType]
    transformation_level: Optional[TransformationLevel]

    # Raw sub-criteria
    tn_standardization: Optional[int]
    tn_usage: Optional[int]
    tn_maintenance: Optional[int]
    tn_financial_benefit: Optional[int]
    tn_payback: Optional[int]
    tn_competitive_advantage: Optional[int]
    tn_value_reserved_1: Optional[int]
    tn_value_reserved_2: Optional[int]

    # Denormalized computed scores
    complexity_score: Optional[float]
    value_creation_score: Optional[float]
    composite_score: Optional[float]

    # Derived from total_budget
    tshirt_size: Optional[Literal["XS", "S", "M", "L", "XL"]]
    total_budget: Optional[float]

    # Active weights at read time
    weights: WeightsSnapshotResponse
