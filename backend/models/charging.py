"""Cluster F master data — charging codes, legal entities, locations, UM matrix.

Per spec decisions [F-MD-01] [F-MD-02] [F-MD-03] [F-UM-01] through [F-UM-04]:

- Three distinct location masters exist in CRETA: ``WorkforceLocation``
  (the existing ``Location`` model in ``models.organization``, retained), the
  new ``ChargingLocation`` (~90 KB charging codes), and the new ``LegalEntity``
  (~120 registered companies with a many-to-one rollup to ChargingLocation).

- ``Country`` and ``Region`` are small lookup masters used by ``ChargingLocation``.
  ``LegalEntity`` carries its own country FK to support divergence cases per
  [F-MD-02]. There is no ``Division`` lookup — division is a free-text property
  of the charging location per the working assumption captured in PROGRESS.md.

- ``UserMeasurement`` is the sparse, versioned matrix from [F-UM-01]. Each
  CSV import creates a new "version" identified by the
  ``(year, quarter, imported_at)`` tuple shared across all rows imported in
  the same batch. No row is ever overwritten in-place per [F-UM-03] — this is
  enforced at the import-service layer, not at the schema layer.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class Country(Base):
    """ISO 3166-1 country lookup master per [F-MD-02]."""

    __tablename__ = "countries"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    iso_code: Mapped[str] = mapped_column(String(3), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    modified_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow,
    )


class Region(Base):
    """Regional grouping lookup (e.g. EMEA, APAC, Americas) per [F-MD-02]."""

    __tablename__ = "regions"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    code: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    modified_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow,
    )


class ChargingLocation(Base):
    """KB charging-code master per [F-MD-01] and [F-MD-02].

    ``code`` is the KB-internal charging code that drives WBS generation.
    ``division`` is intentionally free-text: KB does not maintain a controlled
    division list and the workshop confirmed division should be a property of
    the charging location rather than a separate lookup. A future session can
    promote it to a foreign-key reference if the demand emerges (refactoring
    opportunity flagged in PROGRESS.md).
    """

    __tablename__ = "charging_locations"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    code: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    division: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    region_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("regions.id"), nullable=True,
    )
    country_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("countries.id"), nullable=True,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    modified_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow,
    )

    # Relationships
    region: Mapped[Optional["Region"]] = relationship()
    country: Mapped[Optional["Country"]] = relationship()
    legal_entities: Mapped[list["LegalEntity"]] = relationship(
        back_populates="charging_location",
    )


class LegalEntity(Base):
    """KB legal entity master per [F-MD-01] with rollup to ChargingLocation.

    Many-to-one rollup to ``ChargingLocation`` per [F-MD-01]; carries its own
    ``country_id`` to support divergence cases per [F-MD-02] (e.g. a legal
    entity headquartered in country A but charged through a charging location
    in country B).
    """

    __tablename__ = "legal_entities"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    code: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    charging_location_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("charging_locations.id"), nullable=True,
    )
    country_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("countries.id"), nullable=True,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    modified_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow,
    )

    # Relationships
    charging_location: Mapped[Optional["ChargingLocation"]] = relationship(
        back_populates="legal_entities",
    )
    country: Mapped[Optional["Country"]] = relationship()


class UserMeasurement(Base):
    """Sparse UM matrix cell per [F-UM-01], FK'd to a ``UMVersion`` header.

    The Charging/UM rework (spec §2) makes CRETA the system of record for the
    consolidated UM matrix: it is authored by a controller, not imported from
    SAP. Version lifecycle, provenance, and the activation timestamp move to
    the ``UMVersion`` header (mirroring ``BTCProfile``/``BTCProfileLine``);
    this table now carries only the per-cell figure.

    ``value`` is **integer-typed** per [F-UM-01]: the consolidator
    pre-multiplies certain metrics to remove decimals; the meaning of the
    integer is carried by the service's allocation key, not inferred from the
    number. The Python boundary (service + CSV parser) is the integer gate —
    SQLite INTEGER affinity silently accepts floats, so the DB cannot enforce
    it. Negative values are permitted (the spec does not forbid signed
    pre-multiplied metrics).

    Only non-zero cells are stored; absence implies zero (``ck_um_cell_nonzero``
    enforces the sparse invariant). Full-matrix reconstruction at SAP export
    time walks all charging locations and emits zeros for missing cells — that
    logic does not live here.
    """

    __tablename__ = "user_measurements"
    __table_args__ = (
        # One cell per (version, s_code, charging_location). The
        # year/quarter/activation dimensions are reachable through version_id.
        UniqueConstraint(
            "version_id", "s_code", "charging_location_id",
            name="uq_um_cell_per_version",
        ),
        CheckConstraint("value <> 0", name="ck_um_cell_nonzero"),
        Index("ix_um_cells_version", "version_id"),
        Index("ix_um_cells_version_scode", "version_id", "s_code"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    version_id: Mapped[int] = mapped_column(
        ForeignKey("um_versions.id", ondelete="CASCADE"), nullable=False,
    )
    s_code: Mapped[str] = mapped_column(String(20), nullable=False)
    charging_location_id: Mapped[str] = mapped_column(
        ForeignKey("charging_locations.id"), nullable=False,
    )
    value: Mapped[int] = mapped_column(Integer, nullable=False)

    # Relationships
    version: Mapped["UMVersion"] = relationship(
        "UMVersion", back_populates="cells",
    )
    charging_location: Mapped["ChargingLocation"] = relationship()


# ---------------------------------------------------------------------------
# v5 Session F2 — ChargeableEntity polymorphic root + Stage 1 Distribution.
# Per [F-DM-01..04] and [F-S1-01..05]. Appended at end-of-file so the merge
# with D1 (top-of-file additions) and any concurrent F-cluster work has zero
# overlap.
# ---------------------------------------------------------------------------

# Subtype identifiers per [F-DM-01]. Stored as plain strings to match the
# rest of the codebase's enum-as-string convention; values referenced by
# the schemas, services, and seed.sql.
CHARGEABLE_ENTITY_TYPES = ("Project", "Offering", "InternalService")

# Distribution version model per [F-S1-04]. Distribution rules participate
# in CRETA's standard baseline/forecast/actuals lifecycle. Scenario versions
# use the scenario id (e.g. "scenario-42") so the engine can fork without
# touching live data.
DISTRIBUTION_VERSION_BASELINE = "baseline"
DISTRIBUTION_VERSION_FORECAST = "forecast"
DISTRIBUTION_VERSION_ACTUALS = "actuals"
DISTRIBUTION_BUILTIN_VERSIONS = (
    DISTRIBUTION_VERSION_BASELINE,
    DISTRIBUTION_VERSION_FORECAST,
    DISTRIBUTION_VERSION_ACTUALS,
)


class ChargeableEntity(Base):
    """Polymorphic cost-allocation root per [F-DM-01].

    Three subtypes share a single table: Project (existing v4 entity),
    Offering (new in v5), InternalService (new in v5). Cost allocation
    logic is identical across types per the design principles in
    `[F-DM-01]`; only the WBS prefix differs (`IT0<PPM>`, `IT00<S-code>`,
    `ITF<NNNNN>`) and that prefix is generated algorithmically by the
    services/wbs_generator.py module — never stored on the row per
    [F-DM-03].

    For ``entity_type='Project'`` rows, ``project_id`` FKs back to the
    existing ``projects`` table so capacity allocations, tech-navigator
    scores, and pipeline state remain anchored on the v4 ``Project``
    model. Offerings and InternalServices have no separate underlying
    row — the ChargeableEntity row is the entity.

    ``is_change_or_run`` is intentionally not a column. The classification
    derives from runtime state (Project DoI for projects; always 'Run'
    for Offerings and InternalServices) and changes whenever a project's
    DoI advances. Computing it as a property keeps the model
    de-normalized-but-correct.
    """

    __tablename__ = "chargeable_entities"
    __table_args__ = (
        # Each project maps to at most one ChargeableEntity row. Allows
        # rapid lookup-by-project from the workbench / portfolio modules.
        UniqueConstraint("project_id", name="uq_chargeable_entity_project"),
        # Identifier is globally unique across all subtypes — PPM numbers,
        # S-codes, and ITF numbers do not collide.
        UniqueConstraint("identifier", name="uq_chargeable_entity_identifier"),
        CheckConstraint(
            "entity_type IN ('Project', 'Offering', 'InternalService')",
            name="ck_chargeable_entity_type",
        ),
        Index("ix_chargeable_entities_entity_type", "entity_type"),
        Index("ix_chargeable_entities_hierarchy_node", "hierarchy_node_id"),
    )

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(20), nullable=False)
    identifier: Mapped[str] = mapped_column(String(40), nullable=False)
    # PPM (e.g. IT012345), S-code (IT00S321), or ITF (ITF12345) per [F-DM-01].
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Hierarchy attachment per [F-DM-04] — Cluster F entities use Cluster D's
    # configurable hierarchy via the same FK existing projects use.
    hierarchy_node_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("grouping_entities.id"), nullable=True,
    )
    responsible_person_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("people.id"), nullable=True,
    )

    # Allocation key per [F-AK-01] — the human-readable legend explaining what
    # an internal service's raw UM integer means and how it was derived
    # (e.g. "Number of users ×100 (decimal protection)"). Free-text with
    # presets; per service, not per cell or UM version. Semantically scoped to
    # the InternalService subtype but stored on the polymorphic root with no
    # type-branch constraint (the root carries no entity-type branches by
    # locked design / [F-OQ-11]). Editing surface = FD-6 admin panel; display
    # surface = FD-5 dashboard triple-display / spec §7.
    allocation_key: Mapped[Optional[str]] = mapped_column(
        String(200), nullable=True,
    )

    # Stage 2 input per [F-DM-02] — the percentage of rolled-up cost that
    # releases to KB business via BTC. Stored on the entity (not as a
    # distribution row) so the sum rule (sum(distribution %) + to_business_pct
    # ≤ 100) is a single-row read on the source side.
    to_business_pct: Mapped[float] = mapped_column(
        Numeric(5, 2), nullable=False, default=0,
    )

    # Project link — populated only for entity_type='Project'. NULL for
    # Offering and InternalService. Read-only relationship (no back_populates
    # on Project per F2 file-ownership rules — projects.py is owned by A5).
    project_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("projects.id"), nullable=True,
    )

    # Optional termination date for steady-state entities (Run-stage projects,
    # offerings, internal services). Empty means runs indefinitely until
    # explicit retirement per [A-PL-04]. YYYY-MM matches the rest of the
    # codebase's month-string convention.
    termination_month: Mapped[Optional[str]] = mapped_column(
        String(7), nullable=True,
    )

    # v5 Session F3 — own running cost in EUR per [F-S2-01].
    # Primary cost source for Offerings and InternalServices.
    # For Project subtypes, the DAG resolver falls back to this when
    # project.annual_budget / total_budget are null (covers the case where
    # the project cost is known but the budget columns are not populated yet).
    annual_cost: Mapped[Optional[float]] = mapped_column(
        Numeric(14, 2), nullable=True,
    )

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    modified_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow,
    )

    # Relationships — kept passive (no back_populates on Project) per F2's
    # read-only constraint on projects.py.
    project = relationship("Project", foreign_keys=[project_id])
    responsible = relationship("Person", foreign_keys=[responsible_person_id])
    hierarchy_node = relationship(
        "GroupingEntity", foreign_keys=[hierarchy_node_id],
    )
    outgoing_edges: Mapped[list["Distribution"]] = relationship(
        "Distribution",
        foreign_keys="Distribution.source_entity_id",
        back_populates="source_entity",
        cascade="all, delete-orphan",
    )
    incoming_edges: Mapped[list["Distribution"]] = relationship(
        "Distribution",
        foreign_keys="Distribution.destination_entity_id",
        back_populates="destination_entity",
    )

    @property
    def is_change_or_run(self) -> str:
        """Derive Change/Run classification per [F-DM-01].

        Projects in DoI 0–4 are Change; DoI 5 is Run. Offerings and
        InternalServices are always Run. Returns ``'Change'`` or ``'Run'``.
        Falls back to ``'Run'`` for projects with NULL DoI (operating
        steady-state legacy projects whose v5 lifecycle was not seeded).
        """
        if self.entity_type == "Project":
            if self.project is not None:
                doi = self.project.doi
                if doi is not None and doi < 5:
                    return "Change"
            return "Run"
        return "Run"


class Distribution(Base):
    """Stage 1 inter-service distribution edge per [F-S1-01..05].

    One row per actually-flowing edge between two ChargeableEntities for a
    given (year, version) pair. Sparse storage per [F-S1-01] — entities with
    no outgoing distributions have no rows. The "To Business" share is
    *not* an edge: it lives on ``ChargeableEntity.to_business_pct`` per
    [F-DM-02]. Self-retained percentage is derived per [F-S1-02]:
    ``100 − to_business_pct − sum(distribution %)``.

    Versioning per [F-S1-04]: ``version`` participates in CRETA's standard
    baseline/forecast/actuals lifecycle. Scenario versions use the scenario
    id so the simulator (Cluster B lever 12) can fork without touching live
    data. The unique constraint covers the version dimension so the same
    edge can carry different percentages across versions.
    """

    __tablename__ = "distributions"
    __table_args__ = (
        UniqueConstraint(
            "year", "version", "source_entity_id", "destination_entity_id",
            name="uq_distribution_edge",
        ),
        CheckConstraint(
            "source_entity_id <> destination_entity_id",
            name="ck_distribution_no_self_loop",
        ),
        CheckConstraint(
            "percentage >= 0 AND percentage <= 100",
            name="ck_distribution_pct_range",
        ),
        Index("ix_distributions_source", "source_entity_id", "year", "version"),
        Index("ix_distributions_dest", "destination_entity_id", "year", "version"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    version: Mapped[str] = mapped_column(String(40), nullable=False)
    # baseline / forecast / actuals / scenario-<id>
    source_entity_id: Mapped[str] = mapped_column(
        ForeignKey("chargeable_entities.id"), nullable=False,
    )
    destination_entity_id: Mapped[str] = mapped_column(
        ForeignKey("chargeable_entities.id"), nullable=False,
    )
    percentage: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    modified_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow,
    )

    # Relationships
    source_entity: Mapped["ChargeableEntity"] = relationship(
        "ChargeableEntity",
        foreign_keys=[source_entity_id],
        back_populates="outgoing_edges",
    )
    destination_entity: Mapped["ChargeableEntity"] = relationship(
        "ChargeableEntity",
        foreign_keys=[destination_entity_id],
        back_populates="incoming_edges",
    )


# ===========================================================================
# v5 Session F3 — BTC Profile + Stage 2 + Rollup Cache
# Per [F-S2-01..08], [F-RV-01..06], [F-OQ-05], [A-PL-06].
# Appended at end-of-file per F3's append-only ownership rule for models.
# ===========================================================================

# BTC mode and status values per [F-S2-02].
BTC_MODES = ("manual", "automatic")
BTC_STATUSES = ("draft", "active")


class BTCProfile(Base):
    """BTC (Business Transfer Charging) profile per [F-S2-01..04].

    One profile per (entity, year) pair; UniqueConstraint enforces this.
    Mode ``'manual'`` means the controller sets percentages directly.
    Mode ``'automatic'`` reads from the UM (User Measurement) matrix for the
    entity's S-code and snapshots the computed percentages. The snapshot
    timestamp is recorded in ``um_snapshot_at`` so auditors can see which
    UM version drove the percentages.

    A ``'draft'`` profile is editable and not yet used for billing. Promoting
    to ``'active'`` locks the entity-year pair for use in the rollup engine.
    The ``copied_from_profile_id`` FK supports the year-rollover workflow
    (copy prior year's profile as a starting point).
    """

    __tablename__ = "btc_profiles"
    __table_args__ = (
        UniqueConstraint("entity_id", "year", name="uq_btc_profile_entity_year"),
        CheckConstraint("mode IN ('manual', 'automatic')", name="ck_btc_profile_mode"),
        CheckConstraint("status IN ('draft', 'active')", name="ck_btc_profile_status"),
        Index("ix_btc_profiles_entity_year", "entity_id", "year"),
        Index("ix_btc_profiles_status", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    entity_id: Mapped[str] = mapped_column(
        ForeignKey("chargeable_entities.id", ondelete="CASCADE"), nullable=False,
    )
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    mode: Mapped[str] = mapped_column(String(10), nullable=False, default="manual")
    s_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # Populated when mode='automatic'; records the UM batch timestamp used.
    um_snapshot_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="draft")
    # FK to prior-year profile for year-rollover provenance chain.
    copied_from_profile_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("btc_profiles.id", ondelete="SET NULL"), nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    modified_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow,
    )

    # Relationships
    entity: Mapped["ChargeableEntity"] = relationship(
        "ChargeableEntity", foreign_keys=[entity_id],
    )
    lines: Mapped[list["BTCProfileLine"]] = relationship(
        "BTCProfileLine",
        back_populates="profile",
        cascade="all, delete-orphan",
    )
    copied_from: Mapped[Optional["BTCProfile"]] = relationship(
        "BTCProfile", remote_side="BTCProfile.id", foreign_keys=[copied_from_profile_id],
    )


class BTCProfileLine(Base):
    """One BTC percentage cell: (profile × charging_location) → percentage.

    Sparse storage — only non-zero cells are stored per [F-S2-01]. The
    profile's ``sums_to_100`` flag (computed at read time by the service)
    is not persisted; the service computes it on every read.

    ``percentage`` must be 0 < x ≤ 100. The sum rule (all lines must sum to
    exactly 100 within tolerance) is enforced at the service layer, not here —
    the DB layer only constrains individual values.
    """

    __tablename__ = "btc_profile_lines"
    __table_args__ = (
        UniqueConstraint(
            "profile_id", "charging_location_id",
            name="uq_btc_profile_line_profile_cl",
        ),
        CheckConstraint(
            "percentage > 0 AND percentage <= 100",
            name="ck_btc_profile_line_pct_range",
        ),
        Index("ix_btc_profile_lines_profile", "profile_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    profile_id: Mapped[int] = mapped_column(
        ForeignKey("btc_profiles.id", ondelete="CASCADE"), nullable=False,
    )
    charging_location_id: Mapped[str] = mapped_column(
        ForeignKey("charging_locations.id"), nullable=False,
    )
    percentage: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)

    # Relationships
    profile: Mapped["BTCProfile"] = relationship("BTCProfile", back_populates="lines")
    charging_location: Mapped["ChargingLocation"] = relationship("ChargingLocation")


class RollupCache(Base):
    """Persistent rollup cache for Stage 1 effective costs and Stage 2 location totals.

    Two cache layers per [F-RV-01..06]:
    - ``'stage1_effective'`` — stores the result of ``compute_effective_cost``
      for a given (entity, year, version). Key: entity_id. Payload: JSON of
      EffectiveCostResult.
    - ``'stage2_location'`` — stores the per-charging-location total for a
      given (entity, year, version) after applying BTC profile percentages.
      Key: ``<entity_id>:<charging_location_id>``. Payload: JSON ``{"amount": float}``.

    Justification for persistent over in-memory: simulator (B1) needs reads
    outside the writing request; survives uvicorn reload during demos; demo
    scale is trivial.

    Cache invalidation: each Distribution write, BTC write, and annual_cost
    write calls into ``services/rollup_cache.py::invalidate_for_*``. The
    ``POST /api/admin/rollup-cache/invalidate`` endpoint (controller-only)
    flushes everything for a manual recovery path.
    """

    __tablename__ = "rollup_cache"
    __table_args__ = (
        UniqueConstraint(
            "cache_layer", "year", "version", "key_id",
            name="uq_rollup_cache_entry",
        ),
        Index("ix_rollup_cache_layer_year_version", "cache_layer", "year", "version"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    cache_layer: Mapped[str] = mapped_column(String(30), nullable=False)
    # 'stage1_effective' | 'stage2_location'
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    version: Mapped[str] = mapped_column(String(40), nullable=False)
    key_id: Mapped[str] = mapped_column(String(100), nullable=False)
    # entity_id for stage1; "<entity_id>:<cl_id>" for stage2
    payload_json: Mapped[str] = mapped_column(Text, nullable=False)
    computed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# ===========================================================================
# Charging/UM rework — cluster FD-1: UM authored-version state machine.
# Per [F-UM-01..05], [F-DIR-01]. Appended at end-of-file per this file's
# established cluster-append convention (see the F2/F3 banners above).
# ===========================================================================

# UM version state machine, mirroring BTC_STATUSES per [F-UM-02]. Activation
# is the freeze point; an active version is immutable.
UM_VERSION_STATUSES = ("draft", "active")

# Provenance per [F-UM-04]. ``sap_api`` is retired — UM is authored in CRETA,
# SAP is export-only ([F-DIR-01]); it never described a real path.
#   manual     — in-grid authoring
#   csv_upload — CSV bulk-entry into a draft
#   copy       — copied from a prior version
#   seed       — greenfield seed data
UM_VERSION_SOURCES = ("manual", "csv_upload", "copy", "seed")


class UMVersion(Base):
    """Authored UM matrix version header per [F-UM-02].

    CRETA is the system of record for the consolidated UM matrix (spec §2):
    a controller authors it, SAP is a downstream export target only. A
    *version* is the set of cells sharing ``(year, quarter, activated_at)``.
    The lifecycle mirrors ``BTCProfile`` for mental-model consistency across
    the module:

    - **draft** — editable; created empty, by CSV bulk-entry, or by copy from
      a prior version.
    - **active** — frozen and immutable; ``activated_at`` is the freeze
      timestamp. Re-entry never overwrites an active version — it creates a
      new draft that, on activation, becomes a new version. Historical active
      versions remain intact for SAP-export reproducibility.

    Immutability and "the resolved current version is the latest-activated
    active version for a (year, quarter)" are enforced at the service layer
    (``services/user_measurement_service.py``), not by DB constraint — the
    same enforcement pattern ``BTCProfile`` uses, and SQLite partial unique
    indexes are not portable here.
    """

    __tablename__ = "um_versions"
    __table_args__ = (
        CheckConstraint(
            "status IN ('draft', 'active')", name="ck_um_version_status",
        ),
        CheckConstraint(
            "source IN ('manual', 'csv_upload', 'copy', 'seed')",
            name="ck_um_version_source",
        ),
        CheckConstraint(
            "quarter >= 1 AND quarter <= 4", name="ck_um_version_quarter",
        ),
        Index("ix_um_versions_yq_status", "year", "quarter", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    quarter: Mapped[int] = mapped_column(Integer, nullable=False)  # 1-4
    status: Mapped[str] = mapped_column(
        String(10), nullable=False, default="draft",
    )
    source: Mapped[str] = mapped_column(String(20), nullable=False)
    # Set on activate(); the version's freeze timestamp and the activation
    # component of its (year, quarter, activated_at) identity. NULL = draft.
    activated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True,
    )
    # Provenance for source='copy', mirrors BTCProfile.copied_from_profile_id.
    copied_from_version_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("um_versions.id", ondelete="SET NULL"), nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow,
    )
    # Carries the retired UserMeasurement.imported_by_person_id semantic.
    created_by_person_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("people.id"), nullable=True,
    )
    modified_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow,
    )

    # Relationships
    cells: Mapped[list["UserMeasurement"]] = relationship(
        "UserMeasurement",
        back_populates="version",
        cascade="all, delete-orphan",
    )
    copied_from: Mapped[Optional["UMVersion"]] = relationship(
        "UMVersion",
        remote_side="UMVersion.id",
        foreign_keys=[copied_from_version_id],
    )
