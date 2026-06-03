"""Pydantic schemas for the Stage 1 distribution surface.

History: introduced in v5 Session F2 (edges-as-list, sparse storage, sum-rule
≤100%, hard-block cycle detection on save). Reworked in the Charging/UM
rework cluster **FD-3** (spec §4 / `[F-S1-02..08]`) to align with the new
``DistributionVersion`` model: the edge no longer carries ``year`` /
``version`` strings — both move onto the version header. Edges now carry an
optional per-edge ``rationale`` and FK into ``DistributionVersion`` via
``version_id``.

This module ships **both**:

- **Edge schemas** (``DistributionCreate``, ``DistributionResponse``, etc.)
  rescoped to ``version_id``;
- **Version header schemas** (``DistributionVersionCreate``, ``…Update``,
  ``…Activate``, ``…Response``, ``…Detail``, ``…ListResponse``,
  ``DistributionVersionDiff``) that drive the new version-management API
  per `[F-S1-02..07]`;
- **Per-entity Stage 1 view** (``EntityStage1View``) per `[F-S1-06]`.

The contract shape is the B↔C checkpoint: teammate-c (frontend) consumes the
types defined here directly. Any change to a field name or shape here is a
contract break — coordinate before editing.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ---------------------------------------------------------------------------
# Edge schemas (rescoped to ``version_id`` per FD-3 [F-S1-02..04])
# ---------------------------------------------------------------------------


class DistributionCreate(BaseModel):
    """Create a Stage 1 distribution edge inside a draft version.

    ``version_id`` MUST point at a draft ``DistributionVersion`` — the service
    rejects writes against an active version (immutability per `[F-S1-08]`).
    No ``year`` field — Stage 1 is cadence-agnostic per `[F-S1-02]`.
    """

    version_id: int = Field(..., ge=1)
    source_entity_id: str = Field(..., min_length=1, max_length=50)
    destination_entity_id: str = Field(..., min_length=1, max_length=50)
    percentage: float = Field(..., ge=0, le=100)
    rationale: Optional[str] = Field(default=None, max_length=2000)

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
    """Partial update on an existing draft-version edge.

    Service rejects mutation when the edge's version is active (HTTP 409).
    Source/destination/version are immutable: changing any of those is
    semantically a different edge — delete + create instead.
    """

    percentage: float = Field(..., ge=0, le=100)
    rationale: Optional[str] = Field(default=None, max_length=2000)


class DistributionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    version_id: int
    source_entity_id: str
    destination_entity_id: str
    percentage: float
    rationale: Optional[str] = None
    # Convenience fields populated by the router/service for list views;
    # not stored on the model.
    source_entity_name: Optional[str] = None
    destination_entity_name: Optional[str] = None


class DistributionListResponse(BaseModel):
    items: list[DistributionResponse]
    total: int


# ---------------------------------------------------------------------------
# DistributionVersion header schemas (new — FD-3 [F-S1-02..05])
# ---------------------------------------------------------------------------


class DistributionVersionResponse(BaseModel):
    """Read shape for a ``DistributionVersion`` header.

    Mirrors the SQLAlchemy model directly; safe for both list and detail
    surfaces. ``edge_count`` is a server-computed convenience (not stored)
    so the version list can render the "X edges" badge without a per-row
    sub-request.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    status: str  # 'draft' | 'active'
    active_from: Optional[date]
    rationale: str
    origin: str  # 'blank' | 'copy_active' | 'copy_prior' | 'seed'
    copied_from_version_id: Optional[int]
    scenario_id: Optional[int]
    created_at: datetime
    created_by_person_id: Optional[str]
    activated_at: Optional[datetime]
    edge_count: Optional[int] = None


class DistributionVersionListResponse(BaseModel):
    items: list[DistributionVersionResponse]
    total: int


class DistributionVersionDetailResponse(BaseModel):
    """Header + edges for the version-detail surface per `[F-S1-06]`.

    Used by the version-creation modal (preview the copied edges) and the
    version-detail view in the distribution list.
    """

    version: DistributionVersionResponse
    edges: list[DistributionResponse]
    total_edges: int


class DistributionVersionCreate(BaseModel):
    """Create a new draft ``DistributionVersion`` per `[F-S1-04]`.

    Three origins:

    - ``blank`` — empty draft, no edges.
    - ``copy_active`` — copy edges from the production version in force
      *now* (the resolver returns the latest production active version with
      ``active_from`` ≤ today). ``copied_from_version_id`` is ignored.
    - ``copy_prior`` — copy edges from the specific version identified by
      ``copied_from_version_id``.

    Scenario-scoped versions are created lazily by the cost-allocation service
    (``services/scenario_cost_allocation.py``), not via this endpoint. The router
    rejects ``scenario_id`` here with HTTP 422.

    ``rationale`` is optional at draft creation; activation requires a
    non-empty value (the modal collects it then; this field is also editable
    via ``PUT /distribution-versions/{id}``).
    """

    origin: str = Field(..., pattern=r"^(blank|copy_active|copy_prior)$")
    copied_from_version_id: Optional[int] = Field(default=None, ge=1)
    rationale: Optional[str] = Field(default=None, max_length=4000)


class DistributionVersionUpdate(BaseModel):
    """Update a draft version's rationale per `[F-S1-05]`.

    Header-only — edges are mutated via the existing edge endpoints
    (`/api/charging/distributions`). Service rejects updates on an active
    version with HTTP 409 (immutable).
    """

    rationale: str = Field(..., max_length=4000)


class DistributionVersionActivate(BaseModel):
    """Activate a draft version per `[F-S1-02..03]`.

    Production-only:
    - ``active_from`` is required (the effective-date anchor).
    - ``rationale`` is required (final non-empty value supersedes the draft).

    The service rejects:
    - Activation of a scenario-scoped version (``scenario_id IS NOT NULL``) —
      scenario versions stay draft permanently.
    - Duplicate ``active_from`` across production active versions (HTTP 409).
    - Empty rationale (HTTP 409).
    """

    active_from: date
    rationale: str = Field(..., min_length=1, max_length=4000)


# ---------------------------------------------------------------------------
# Version diff schemas (FD-3 [F-S1-07])
# ---------------------------------------------------------------------------


class DistributionVersionDiffEdge(BaseModel):
    """One row in the version-diff report per `[F-S1-07]`.

    ``change_kind`` is one of:

    - ``added``    — present in ``version`` (the right-hand side), missing
      from ``compared_to_version``.
    - ``removed``  — present in ``compared_to_version`` only.
    - ``changed``  — present in both with a different percentage or
      rationale.

    For ``added`` rows ``old_percentage`` / ``old_rationale`` are NULL; for
    ``removed`` rows ``new_percentage`` / ``new_rationale`` are NULL.
    """

    change_kind: str  # 'added' | 'removed' | 'changed'
    source_entity_id: str
    destination_entity_id: str
    source_entity_name: Optional[str] = None
    destination_entity_name: Optional[str] = None
    old_percentage: Optional[float] = None
    new_percentage: Optional[float] = None
    old_rationale: Optional[str] = None
    new_rationale: Optional[str] = None


class DistributionVersionDiff(BaseModel):
    """Diff between two versions per `[F-S1-07]`.

    Default ``compared_to_version_id``:
    - For production versions: the version directly preceding by effective
      date (i.e. the version this one supersedes).
    - For scenario versions: the production anchor version the scenario
      forked from (``Scenario.anchor_distribution_version_id``, or the
      resolver's active production version at scenario creation if NULL).

    Returns the two version headers plus the ordered list of edge changes.
    """

    version: DistributionVersionResponse
    compared_to_version: DistributionVersionResponse
    changes: list[DistributionVersionDiffEdge]
    added_count: int
    removed_count: int
    changed_count: int
    total: int  # added + removed + changed


# ---------------------------------------------------------------------------
# Per-entity Stage 1 surface (FD-3 [F-S1-06]) — first-class
# ---------------------------------------------------------------------------


class EntityStage1Inflow(BaseModel):
    """One inflow contribution to an entity's effective cost.

    Mirrors ``DistributionInflow`` (below) but is intentionally re-declared
    here so the per-entity view payload is self-contained for the frontend
    typegen.
    """

    source_entity_id: str
    source_entity_name: str
    percentage: float
    amount: float


class EntityStage1VersionEntry(BaseModel):
    """One entry in the per-entity version history sidebar.

    ``is_in_force`` is true exactly for the production version currently
    resolved by ``resolve_active_version(db, evaluated_date)``. Scenario
    versions never appear in this list (the per-entity view operates on the
    production timeline).
    """

    version_id: int
    active_from: Optional[date]
    activated_at: Optional[datetime]
    status: str  # 'draft' | 'active'
    rationale: str
    origin: str
    is_in_force: bool
    edge_count_for_entity: int  # edges sourced at this entity in this version


class EntityStage1View(BaseModel):
    """Per-entity Stage 1 surface per `[F-S1-06]`.

    All the data the per-entity panel needs in one round trip:
    - The entity identity (id, name, type).
    - The resolved in-force production version metadata for the queried
      ``evaluated_date`` (or the explicitly-requested ``version_id``).
    - Outbound edges with per-edge percentage + rationale.
    - ``to_business_pct``, derived ``self_retained_pct``, and the
      ``sums_within_100`` flag (mirroring ``EntityDistributionSummary``).
    - Effective cost — own + sum of inflows — pre-computed server-side
      against the same version (no client-side rollup).
    - The version-history sidebar for the entity's outbound timeline.
    """

    entity_id: str
    entity_name: str
    entity_type: str
    evaluated_date: date
    version: DistributionVersionResponse
    to_business_pct: float
    self_retained_pct: float
    sums_within_100: bool
    outbound_edges: list[DistributionResponse]
    own_cost: float
    own_cost_source: Optional[str] = None
    inflows: list[EntityStage1Inflow]
    inflow_total: float
    effective_cost: float
    history: list[EntityStage1VersionEntry]


# ---------------------------------------------------------------------------
# Legacy single-entity surfaces (preserved — rescoped to ``version_id``)
# ---------------------------------------------------------------------------


class EntityDistributionSummary(BaseModel):
    """Single-entity outbound profile per `[F-S1-03]`.

    Surfaces ``to_business_pct`` plus outgoing edges and derived
    self-retained percentage for a specific ``version_id`` (or the
    in-force production version if unspecified — resolved server-side).
    Slimmer than ``EntityStage1View``; kept for callers that only need
    the edges + residual.
    """

    entity_id: str
    entity_name: str
    version_id: int
    to_business_pct: float
    distributions: list[DistributionResponse]
    self_retained_pct: float
    sums_within_100: bool


class DistributionInflow(BaseModel):
    source_entity_id: str
    source_entity_name: str
    percentage: float
    amount: float


class DistributionEffectiveCost(BaseModel):
    """DAG-resolved effective cost for a single entity per `[F-S1-02]`.

    ``year`` remains on this response (own_cost lookup keys on
    ``Project.annual_budget``/``ChargeableEntity.annual_cost`` which are
    year-scoped); ``version_id`` selects the Stage 1 graph used for the
    inflow rollup.
    """

    entity_id: str
    entity_name: str
    year: int
    version_id: int
    own_cost: float
    own_cost_source: Optional[str] = None
    inflows: list[DistributionInflow]
    inflow_total: float
    effective_cost: float


class CycleError(BaseModel):
    """Returned in the 409 body when a save would create a cycle.

    The chain is the ordered list of entity ids from the proposed source
    around back to itself. Renderers display it as ``A → B → C → A`` so
    the user can identify which existing edge to remove.
    """

    detail: str
    cycle_chain: list[str]


class WBSElementResponse(BaseModel):
    """Algorithmic WBS Element preview per `[F-DM-03]`.

    Format: ``<prefix>-64-99-<location_code>`` where prefix is
    ``IT0<PPM>`` / ``IT00<S-code>`` / ``ITF<NNNNN>`` per the entity type.
    Generated; never stored.
    """

    entity_id: str
    charging_location_id: str
    wbs_element: str


# ---------------------------------------------------------------------------
# Cascade surfaces (Service Workbench Session 2 — bidirectional chain view)
# ---------------------------------------------------------------------------


class CascadeNode(BaseModel):
    """One entity in the cascade response — focal, upstream, or downstream.

    ``own_cost`` is the entity's own annual cost (per the DAG resolver's
    own-cost lookup); ``effective_cost`` is own_cost + Σ inflows resolved
    against the targeted ``DistributionVersion``.
    """

    entity_id: str
    entity_name: str
    entity_type: Literal["Project", "Offering", "InternalService"]
    identifier: str
    own_cost: float
    effective_cost: float
    to_business_pct: float
    self_retained_pct: float


class CascadeEdge(BaseModel):
    """One distribution edge in the displayed cascade sub-graph.

    ``amount`` is the resolved EUR flow through the edge (source's
    effective_cost × percentage / 100). ``chain_depth`` is sourced from
    ``Distribution.chain_depth`` cache — may be NULL when the cache hasn't
    been populated yet (foundation-commit seeded edges, untouched draft
    versions).
    """

    source_entity_id: str
    destination_entity_id: str
    percentage: float
    amount: float
    chain_depth: Optional[int] = None
    rationale: Optional[str] = None


class CascadeBusinessTerminal(BaseModel):
    """One business-terminal contribution for the focal entity.

    Each row maps to one ``ChargingLocation`` via the focal entity's active
    BTC profile lines for the demo year. ``amount`` is
    ``focal.effective_cost × focal.to_business_pct/100 × line.percentage/100``
    — the EUR that releases to KB business through that charging location.
    """

    charging_location_id: str
    code: str
    name: str
    percentage: float
    amount: float


class CascadeChainResponse(BaseModel):
    """Full bidirectional cascade response for a focal entity.

    Flat shape (nodes + edges) per the frontend column-based layout
    (Service Workbench Session 4). ``upstream`` / ``downstream`` are
    transitively-collected, deduped entity lists; edges reference into the
    node lists via source/destination ids.
    """

    focal: CascadeNode
    upstream: list[CascadeNode]
    downstream: list[CascadeNode]
    edges: list[CascadeEdge]
    business_terminals: list[CascadeBusinessTerminal]
    version: DistributionVersionResponse
    evaluated_date: date
    max_allocation_depth: int


class DistributionCandidate(BaseModel):
    """One candidate distribution target for a source entity.

    ``resulting_chain_depth`` is the **edge-count** of the longest path
    that would pass through the hypothetical new edge: longest edge-path
    ending at source + 1 (the new edge) + longest edge-path starting at
    the candidate. Directly comparable to ``max_allocation_depth``.

    Two boolean flags surface relative to the cap (mutually exclusive):
    - ``near_max_depth_warning``: ``resulting_chain_depth >=
      max_allocation_depth - 1`` AND still saveable. Frontend renders a
      warning indicator.
    - ``would_violate_max_depth``: ``resulting_chain_depth >
      max_allocation_depth`` — server-side save would 409 with the
      violating path. Frontend should disable this candidate rather than
      render it as a warning.
    """

    entity_id: str
    entity_name: str
    entity_type: Literal["Project", "Offering", "InternalService"]
    identifier: str
    resulting_chain_depth: int
    near_max_depth_warning: bool
    would_violate_max_depth: bool


class DistributionCandidatesResponse(BaseModel):
    """List of eligible distribution targets from a source entity.

    Excludes the source itself, entities already on outgoing edges, and
    entities that would form a cycle if added.
    """

    source_entity_id: str
    version_id: int
    max_allocation_depth: int
    candidates: list[DistributionCandidate]
    total: int
