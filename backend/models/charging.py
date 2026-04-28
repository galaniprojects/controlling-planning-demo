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
    """Sparse, versioned UM matrix per [F-UM-01].

    A "version" is the set of rows sharing the same
    ``(year, quarter, imported_at)`` triple. Each CSV import inserts a new
    batch with a fresh ``imported_at`` timestamp; rows are never updated in
    place per [F-UM-03]. The ``source`` column documents the import origin
    (``csv_upload``, ``sap_api``, ``seed``, ``manual``) per [F-UM-02].

    Only non-zero cells are stored; absence implies zero. Full-matrix
    reconstruction at SAP export time (Cluster F session F3) walks all 90
    charging locations and emits zeros for missing rows — that logic does not
    live here.
    """

    __tablename__ = "user_measurements"
    __table_args__ = (
        # A single import batch should not contain duplicate
        # (s_code, charging_location_id) cells. Allows re-imports because
        # ``imported_at`` differs per batch.
        UniqueConstraint(
            "year", "quarter", "imported_at", "s_code", "charging_location_id",
            name="uq_um_cell_per_version",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    quarter: Mapped[int] = mapped_column(Integer, nullable=False)  # 1-4
    s_code: Mapped[str] = mapped_column(String(20), nullable=False)
    charging_location_id: Mapped[str] = mapped_column(
        ForeignKey("charging_locations.id"), nullable=False,
    )
    value: Mapped[float] = mapped_column(Numeric(14, 4), nullable=False)
    source: Mapped[str] = mapped_column(String(30), nullable=False)
    # csv_upload, sap_api, seed, manual
    imported_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    imported_by_person_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("people.id"), nullable=True,
    )

    # Relationships
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
