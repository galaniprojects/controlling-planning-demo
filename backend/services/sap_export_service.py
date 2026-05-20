"""SAP export service for v5 FD-4 per [F-EXP-01].

Renders the per-(entity × charging-location) WBS allocation matrix as the
SAP-handoff payload. Each output row carries:

- ``wbs_element`` — algorithmic per ``wbs_generator.build_wbs_element``
- ``entity_id`` / ``entity_identifier`` / ``entity_type`` — the source
- ``charging_location_id`` / ``charging_location_code`` — the target
- ``year``
- ``percentage`` — the frozen BTC profile line %
- ``annual_amount_eur`` — own_cost × percentage / 100 (when both present)

Reproducibility contract per spec §5:
the export reads lines from the *frozen* active BTC profile (the
``btc_profile_lines`` rows) rather than re-deriving from the live UM
matrix. That way an active SAP feed for year Y replays bit-identical
even after a newer UM batch goes live for the same year — the BTC
profile's ``um_snapshot_at`` records *which* UM batch is frozen here.

Entities whose ``to_business_pct > 0`` but no active BTC profile exists
for ``year`` are listed in ``missing_profiles[]`` — they do not produce
rows. Entities with ``to_business_pct == 0`` are exempt (no SAP charge).
"""

from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from models.charging import (
    BTCProfile, BTCProfileLine, ChargeableEntity, ChargingLocation,
)
from services.dag_resolver import get_own_cost
from services.wbs_generator import build_wbs_element


@dataclass
class SAPExportRow:
    wbs_element: str
    entity_id: str
    entity_identifier: str
    entity_name: str
    entity_type: str
    charging_location_id: str
    charging_location_code: str
    charging_location_name: str
    year: int
    percentage: float
    annual_amount_eur: float | None


@dataclass
class SAPExportResponse:
    year: int
    entity_type: str | None
    rows: list[SAPExportRow] = field(default_factory=list)
    # entity_ids with to_business_pct > 0 but no active BTC profile for the year
    missing_profiles: list[str] = field(default_factory=list)
    # total row count == len(rows) (mirrors the standard list-response shape)
    total: int = 0


def build_sap_export(
    db: Session,
    year: int,
    *,
    entity_type: str | None = None,
) -> SAPExportResponse:
    """Build the SAP-export payload for ``year``.

    Iterates every active ChargeableEntity (filtered by ``entity_type`` when
    given) and joins to its active BTC profile for ``year``. Walks each
    profile's frozen line set and emits one row per (entity, charging
    location) tuple.

    Args:
        db: SQLAlchemy session.
        year: Charging year to export.
        entity_type: Optional 'Project' / 'Offering' / 'InternalService'
            filter (case-sensitive — matches the DB TitleCase form).

    Returns:
        SAPExportResponse with ``rows`` ready for serialisation (JSON or CSV)
        and a ``missing_profiles`` punch list for the controller.
    """
    entity_query = (
        db.query(ChargeableEntity)
        .filter(ChargeableEntity.is_active.is_(True))
    )
    if entity_type is not None:
        entity_query = entity_query.filter(
            ChargeableEntity.entity_type == entity_type,
        )

    entities = entity_query.order_by(ChargeableEntity.id).all()

    # Pre-load charging locations once (keyed by id) for the cl_code/name fields.
    cl_by_id: dict[str, ChargingLocation] = {
        cl.id: cl
        for cl in db.query(ChargingLocation).all()
    }

    rows: list[SAPExportRow] = []
    missing: list[str] = []

    for ent in entities:
        # Entities exempt from BTC export contribute nothing.
        if float(ent.to_business_pct or 0) <= 0:
            continue

        profile = (
            db.query(BTCProfile)
            .filter(
                BTCProfile.entity_id == ent.id,
                BTCProfile.year == year,
                BTCProfile.status == "active",
            )
            .first()
        )
        if profile is None:
            missing.append(ent.id)
            continue

        own_cost = get_own_cost(ent)

        profile_lines = (
            db.query(BTCProfileLine)
            .filter(BTCProfileLine.profile_id == profile.id)
            .all()
        )
        for line in profile_lines:
            cl = cl_by_id.get(line.charging_location_id)
            cl_code = cl.code if cl else line.charging_location_id
            cl_name = cl.name if cl else line.charging_location_id

            wbs = build_wbs_element(ent.identifier, cl_code)
            pct = float(line.percentage)
            amount = (
                round(own_cost * (pct / 100.0), 2)
                if own_cost > 0 else None
            )
            rows.append(SAPExportRow(
                wbs_element=wbs,
                entity_id=ent.id,
                entity_identifier=ent.identifier,
                entity_name=ent.name,
                entity_type=ent.entity_type,
                charging_location_id=line.charging_location_id,
                charging_location_code=cl_code,
                charging_location_name=cl_name,
                year=year,
                percentage=pct,
                annual_amount_eur=amount,
            ))

    return SAPExportResponse(
        year=year,
        entity_type=entity_type,
        rows=rows,
        missing_profiles=missing,
        total=len(rows),
    )
