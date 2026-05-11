"""Pydantic schemas for Administration endpoints (Section 10.9)."""

from __future__ import annotations

from pydantic import BaseModel, field_validator


# --- Cost Center ---
class CostCenterCreate(BaseModel):
    name: str
    location_id: str
    competence_center_id: str


class CostCenterUpdate(BaseModel):
    name: str | None = None
    location_id: str | None = None
    competence_center_id: str | None = None


# --- Competence Center ---
class CompetenceCenterCreate(BaseModel):
    name: str


class CompetenceCenterUpdate(BaseModel):
    name: str | None = None


# --- LoB ---
class LoBCreate(BaseModel):
    name: str
    description: str | None = None


class LoBUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


# --- Location ---
class LocationCreate(BaseModel):
    city: str
    country: str


class LocationUpdate(BaseModel):
    city: str | None = None
    country: str | None = None


# --- People ---
class PersonCreate(BaseModel):
    name: str
    role_type_id: str
    cost_center_id: str | None = None
    competence_center_id: str | None = None


class PersonUpdate(BaseModel):
    name: str | None = None
    role_type_id: str | None = None
    cost_center_id: str | None = None
    competence_center_id: str | None = None


# --- Rates ---
class RateChange(BaseModel):
    role_type_id: str
    competence_center_id: str
    new_rate: float
    effective_date: str


class RatesUpdate(BaseModel):
    changes: list[RateChange]


# --- Parameters ---
class ParameterChange(BaseModel):
    key: str
    new_value: str


class ParametersUpdate(BaseModel):
    changes: list[ParameterChange]


class ParametersReset(BaseModel):
    keys: list[str] | None = None


# --- Responses ---
class AdminContextResponse(BaseModel):
    cost_center_count: int
    people_count: int
    lob_count: int
    location_count: int
    competence_center_count: int
    last_rate_update: str | None
    last_parameter_change: str | None


class AuditLogEntry(BaseModel):
    id: int
    timestamp: str
    user_name: str
    entity_type: str
    entity_id: str
    entity_name: str | None
    action: str
    field_changed: str | None
    old_value: str | None
    new_value: str | None


# ---------------------------------------------------------------------------
# v5 Session D1 — RoleType, ExternalCostType, ProjectDependency, User,
# RolePermissionGrant. Appended at end-of-file to minimise merge conflicts.
# ---------------------------------------------------------------------------

# --- RoleType ---
class RoleTypeCreate(BaseModel):
    name: str


class RoleTypeUpdate(BaseModel):
    name: str | None = None


class RoleTypeResponse(BaseModel):
    id: str
    name: str


# --- ExternalCostType ---
class ExternalCostTypeCreate(BaseModel):
    name: str


class ExternalCostTypeUpdate(BaseModel):
    name: str | None = None


class ExternalCostTypeResponse(BaseModel):
    id: str
    name: str


# --- ProjectDependency ---
class ProjectDependencyCreate(BaseModel):
    predecessor_project_id: str
    successor_project_id: str
    dependency_type: str
    # finish_to_start, start_to_start, finish_to_finish, start_to_finish
    lag_days: int | None = None
    notes: str | None = None


class ProjectDependencyUpdate(BaseModel):
    dependency_type: str | None = None
    lag_days: int | None = None
    notes: str | None = None


class ProjectDependencyResponse(BaseModel):
    id: int
    predecessor_project_id: str
    predecessor_project_name: str | None
    successor_project_id: str
    successor_project_name: str | None
    dependency_type: str
    lag_days: int | None
    notes: str | None


# --- User ---
class UserCreate(BaseModel):
    username: str
    display_name: str
    email: str | None = None
    role: str
    person_id: str | None = None
    tier3_flag: bool = False
    change_reviewer_flag: bool = False


class UserUpdate(BaseModel):
    username: str | None = None
    display_name: str | None = None
    email: str | None = None
    role: str | None = None
    person_id: str | None = None
    tier3_flag: bool | None = None
    change_reviewer_flag: bool | None = None


class UserResponse(BaseModel):
    id: str
    username: str
    display_name: str
    email: str | None
    role: str
    person_id: str | None
    person_name: str | None
    tier3_flag: bool
    change_reviewer_flag: bool
    is_active: bool


# --- RolePermissionGrant ---
class RolePermissionGrantCreate(BaseModel):
    role: str
    entity_type: str
    can_edit: bool = True
    notes: str | None = None


class RolePermissionGrantUpdate(BaseModel):
    can_edit: bool | None = None
    notes: str | None = None


class RolePermissionGrantResponse(BaseModel):
    id: int
    role: str
    entity_type: str
    can_edit: bool
    notes: str | None


class RolePermissionGrantBulkUpdate(BaseModel):
    """Bulk replace grants — convenient for Section 5 admin grid UI."""

    grants: list[RolePermissionGrantCreate]


# --- Tech Navigator Scoring page ---
class TechNavigatorScoringProject(BaseModel):
    """One row in the scoring-data payload — sub-criteria + budget + stage.

    Drives the client-side live preview on the Tech Navigator Scoring admin
    page. Frontend recomputes complexity_score, value_creation_score,
    composite_score, and tshirt_size from these inputs against the
    currently-edited (unsaved) weights so the scatter animates as sliders
    move, without an API round-trip per drag.

    ``competes_in_ranking`` mirrors the walk pool used in
    services.ranking.compute_ranked_backlog (BACKLOG_STAGES, project_type != 3)
    so the client's cutoff math is provably identical to the server's.
    ``doi`` is included so the client can apply the configured tiebreakers.
    """

    id: str
    name: str
    project_type: int | None
    pipeline_stage: str
    doi: int | None
    total_budget: float | None
    competes_in_ranking: bool
    tn_standardization: int
    tn_usage: int
    tn_maintenance: int
    tn_financial_benefit: int
    tn_payback: int
    tn_competitive_advantage: int


class TechNavigatorScoringWeights(BaseModel):
    complexity: dict[str, float]
    value_creation: dict[str, float]
    ranking: dict[str, float]
    tshirt: dict[str, int]


class TechNavigatorScoringEnvelope(BaseModel):
    """Budget envelope breakdown for the backlog cutoff math.

    contestable_envelope is what the should-be / reality walks compare
    cumulative budget against, NOT total_available_budget directly. The
    backend computes it as total_available − type3_pre_funded
    − hyper_maintenance_committed, clamped to a non-negative floor.
    """

    total_available_budget: float
    type3_pre_funded_total: float
    hyper_maintenance_committed_total: float
    contestable_envelope: float


class TechNavigatorScoringResponse(BaseModel):
    weights: TechNavigatorScoringWeights
    envelope: TechNavigatorScoringEnvelope
    # Tiebreakers as a list of (field, direction) pairs in apply order. The
    # primary composite_score:desc sort is implicit and not included here.
    # Wire format is JSON `[["field", "asc"], ...]`; runtime validator
    # enforces exact arity-2 and direction ∈ {"asc", "desc"}.
    tiebreakers: list[list[str]]
    projects: list[TechNavigatorScoringProject]

    @field_validator("tiebreakers")
    @classmethod
    def _check_tiebreaker_entries(cls, v: list[list[str]]) -> list[list[str]]:
        for entry in v:
            if len(entry) != 2:
                raise ValueError(
                    f"tiebreaker entry must be a 2-element [field, direction] pair, got {entry!r}"
                )
            if entry[1] not in ("asc", "desc"):
                raise ValueError(
                    f"tiebreaker direction must be 'asc' or 'desc', got {entry[1]!r}"
                )
        return v
