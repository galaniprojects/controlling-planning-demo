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
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
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
