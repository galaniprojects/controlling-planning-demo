"""User Measurement authored-version service — Charging/UM rework cluster FD-1.

CRETA is the system of record for the consolidated UM matrix (spec §2):
a controller authors it; SAP is export-only ([F-DIR-01]). This service owns
the UM version state machine, cell mutation, activation (freeze), version
resolution, and the per-cell audit trail. It is the structural peer of
``btc_service`` and mirrors its conventions:

- ``UMValidationError`` is raised when a write would violate a rule; the
  router maps it to HTTP 409 (mirrors ``BTCValidationError``).
- Functions take ``db: Session`` and **do not commit** — the caller commits
  inside the same transaction (so per-cell audit rows land atomically with the
  mutation). Mirrors the ``btc_service`` + ``_audit`` convention.
- Active versions are immutable; "the resolved current version for a
  (year, quarter)" is the ``active`` version with the latest ``activated_at``.
  Both are enforced here, not by DB constraint — the same pattern
  ``btc_service`` uses for BTCProfile immutability.

Tags: [F-UM-01] integer values, [F-UM-02] draft/active state machine,
[F-UM-03] authoring surfaces, [F-UM-04] provenance, [F-UM-05] per-cell audit,
[F-AK-01] allocation-key distinct-values helper.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from models.charging import (
    UM_VERSION_SOURCES,
    ChargeableEntity,
    UMVersion,
    UserMeasurement,
)
from models.system import AuditLog
from services.user_measurement_import import (
    ImportResult,
    ParsedCSV,
    parse_um_csv,
)


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------

class UMValidationError(Exception):
    """Raised when a UM write would violate a business rule.

    The router catches this and returns HTTP 409 Conflict (mirrors
    ``BTCValidationError``).
    """


# ---------------------------------------------------------------------------
# Audit payload carrier
# ---------------------------------------------------------------------------

@dataclass
class CellMutation:
    s_code: str
    charging_location_id: str
    old_value: Optional[int]
    new_value: Optional[int]

    @property
    def action(self) -> str:
        if self.old_value is None:
            return "create"
        if self.new_value is None:
            return "deactivate"  # cell removed (sparse delete)
        return "update"


# ---------------------------------------------------------------------------
# Integer coercion (the field-level gate per [F-UM-01])
# ---------------------------------------------------------------------------

def coerce_um_int(raw, *, context: str) -> int:
    """Coerce ``raw`` to an integer or raise ``UMValidationError``.

    Accepts ints and integral floats/strings (``42``, ``"42"``, ``42.0``);
    rejects true fractionals (``42.5``) and non-numerics. The Python boundary
    is the authoritative integer gate — SQLite INTEGER affinity silently
    accepts floats, so the DB cannot enforce [F-UM-01].
    """
    try:
        f = float(raw)
    except (ValueError, TypeError):
        raise UMValidationError(
            f"{context}: value must be an integer, got {raw!r}",
        )
    if f != int(f):
        raise UMValidationError(
            f"{context}: value must be an integer, got {raw!r}",
        )
    return int(f)


# ---------------------------------------------------------------------------
# Audit helper (per-cell trail per [F-UM-05])
# ---------------------------------------------------------------------------

def _audit_cell(
    db: Session,
    *,
    actor_person_id: str,
    version: UMVersion,
    mut: CellMutation,
) -> None:
    """Write one AuditLog row for a single cell mutation per [F-UM-05].

    Reuses the generic AuditLog (who/when/before/after) — no dedicated table.
    ``entity_id`` is kept short (the version id); the cell coordinate lives in
    ``field_changed`` so the String(50) ``entity_id`` is never overrun.
    """
    db.add(
        AuditLog(
            user_person_id=actor_person_id,
            entity_type="user_measurement_cell",
            entity_id=str(version.id),
            entity_name=f"UM v{version.id} {version.year}-Q{version.quarter}",
            action=mut.action,
            field_changed=f"{mut.s_code}:{mut.charging_location_id}",
            old_value=None if mut.old_value is None else str(mut.old_value),
            new_value=None if mut.new_value is None else str(mut.new_value),
            category="master_data",
        )
    )


def _audit_version(
    db: Session,
    *,
    actor_person_id: str,
    version: UMVersion,
    action: str,
    field_changed: Optional[str] = None,
    old_value: Optional[str] = None,
    new_value: Optional[str] = None,
) -> None:
    db.add(
        AuditLog(
            user_person_id=actor_person_id,
            entity_type="user_measurement",
            entity_id=str(version.id),
            entity_name=f"UM v{version.id} {version.year}-Q{version.quarter}",
            action=action,
            field_changed=field_changed,
            old_value=old_value,
            new_value=new_value,
            category="master_data",
        )
    )


# ---------------------------------------------------------------------------
# Resolution
# ---------------------------------------------------------------------------

def get_version(db: Session, version_id: int) -> UMVersion:
    v = db.query(UMVersion).filter(UMVersion.id == version_id).first()
    if v is None:
        raise UMValidationError(f"UM version {version_id} not found")
    return v


def get_active_version(
    db: Session, year: int, quarter: int,
) -> Optional[UMVersion]:
    """The resolved current version for (year, quarter).

    The ``active`` version with the latest ``activated_at``. Multiple active
    versions may exist over time (historical versions remain intact for
    SAP-export reproducibility per spec §2); resolution is deterministic by
    latest activation. Behaviour-equivalent to the pre-rework
    ``max(imported_at)`` for the single-current-version seeded data.
    """
    return (
        db.query(UMVersion)
        .filter(
            UMVersion.year == year,
            UMVersion.quarter == quarter,
            UMVersion.status == "active",
        )
        .order_by(UMVersion.activated_at.desc(), UMVersion.id.desc())
        .first()
    )


def get_active_version_or_raise(
    db: Session, year: int, quarter: int,
) -> UMVersion:
    v = get_active_version(db, year, quarter)
    if v is None:
        raise UMValidationError(
            f"No active UM version for year={year}, quarter={quarter}",
        )
    return v


def list_versions(
    db: Session,
    *,
    year: Optional[int] = None,
    quarter: Optional[int] = None,
    status: Optional[str] = None,
) -> list[UMVersion]:
    q = db.query(UMVersion)
    if year is not None:
        q = q.filter(UMVersion.year == year)
    if quarter is not None:
        q = q.filter(UMVersion.quarter == quarter)
    if status is not None:
        q = q.filter(UMVersion.status == status)
    return q.order_by(
        UMVersion.year.desc(),
        UMVersion.quarter.desc(),
        UMVersion.activated_at.desc(),
        UMVersion.id.desc(),
    ).all()


def list_cells(db: Session, version_id: int) -> list[UserMeasurement]:
    return (
        db.query(UserMeasurement)
        .filter(UserMeasurement.version_id == version_id)
        .all()
    )


# ---------------------------------------------------------------------------
# Draft creation (three origins per [F-UM-03])
# ---------------------------------------------------------------------------

def _new_draft(
    db: Session,
    year: int,
    quarter: int,
    source: str,
    created_by_person_id: Optional[str],
    *,
    copied_from_version_id: Optional[int] = None,
) -> UMVersion:
    if source not in UM_VERSION_SOURCES:
        raise UMValidationError(
            f"invalid UM source '{source}'; expected one of "
            f"{', '.join(UM_VERSION_SOURCES)}",
        )
    if quarter < 1 or quarter > 4:
        raise UMValidationError(f"quarter must be 1-4, got {quarter}")
    v = UMVersion(
        year=year,
        quarter=quarter,
        status="draft",
        source=source,
        created_by_person_id=created_by_person_id,
        copied_from_version_id=copied_from_version_id,
    )
    db.add(v)
    db.flush()  # assign v.id for audit + cell FKs (no commit)
    return v


def create_draft(
    db: Session,
    year: int,
    quarter: int,
    *,
    source: str = "manual",
    created_by_person_id: Optional[str] = None,
) -> UMVersion:
    """Create an empty draft version per [F-UM-03]."""
    v = _new_draft(db, year, quarter, source, created_by_person_id)
    if created_by_person_id:
        _audit_version(
            db, actor_person_id=created_by_person_id, version=v,
            action="create", new_value=f"draft source={source}",
        )
    return v


def create_draft_from_csv(
    db: Session,
    csv_text: str,
    *,
    created_by_person_id: Optional[str] = None,
) -> tuple[UMVersion, ParsedCSV]:
    """Parse a CSV into a new draft version per [F-UM-03].

    The CSV populates a draft; it does **not** activate (the controller
    reviews, then activates). Returns the version and the parse result so the
    caller can surface skipped/error rows. Raises ``UMValidationError`` if the
    CSV produced no usable cells.
    """
    parsed = parse_um_csv(db, csv_text)
    if not parsed.cells:
        raise UMValidationError(
            "CSV produced no usable rows"
            + (f": {parsed.parse_errors[0]}" if parsed.parse_errors else ""),
        )
    v = _new_draft(
        db, parsed.year, parsed.quarter, "csv_upload", created_by_person_id,
    )
    for cell in parsed.cells:
        db.add(
            UserMeasurement(
                version_id=v.id,
                s_code=cell.s_code,
                charging_location_id=cell.charging_location_id,
                value=cell.value,
            )
        )
        if created_by_person_id:
            _audit_cell(
                db,
                actor_person_id=created_by_person_id,
                version=v,
                mut=CellMutation(
                    cell.s_code, cell.charging_location_id, None, cell.value,
                ),
            )
    return v, parsed


def copy_from_version(
    db: Session,
    source_version_id: int,
    *,
    created_by_person_id: Optional[str] = None,
) -> UMVersion:
    """Create a new draft pre-filled from a prior version per [F-UM-03].

    Same (year, quarter); ``source='copy'``; ``copied_from_version_id`` set
    for provenance (mirrors BTCProfile.copied_from_profile_id).
    """
    src = get_version(db, source_version_id)
    v = _new_draft(
        db, src.year, src.quarter, "copy", created_by_person_id,
        copied_from_version_id=src.id,
    )
    for cell in list_cells(db, src.id):
        db.add(
            UserMeasurement(
                version_id=v.id,
                s_code=cell.s_code,
                charging_location_id=cell.charging_location_id,
                value=cell.value,
            )
        )
    if created_by_person_id:
        _audit_version(
            db, actor_person_id=created_by_person_id, version=v,
            action="create",
            new_value=f"draft source=copy from version {src.id}",
        )
    return v


# ---------------------------------------------------------------------------
# Cell mutation (in-grid authoring per [F-UM-03]); active is immutable
# ---------------------------------------------------------------------------

def _require_draft(version: UMVersion) -> None:
    if version.status == "active":
        raise UMValidationError(
            f"UM version {version.id} is 'active' and immutable — create a "
            f"new draft (or copy from this version) instead of editing.",
        )


def _get_cell(
    db: Session, version_id: int, s_code: str, charging_location_id: str,
) -> Optional[UserMeasurement]:
    return (
        db.query(UserMeasurement)
        .filter(
            UserMeasurement.version_id == version_id,
            UserMeasurement.s_code == s_code,
            UserMeasurement.charging_location_id == charging_location_id,
        )
        .first()
    )


def set_cell(
    db: Session,
    version_id: int,
    s_code: str,
    charging_location_id: str,
    value,
    *,
    actor_person_id: str,
) -> CellMutation:
    """Upsert a single cell. ``value == 0`` deletes the cell (sparse).

    Integer-validated at the field per [F-UM-01]. Writes one per-cell audit
    row per [F-UM-05]. Raises if the version is active per [F-UM-02].
    """
    version = get_version(db, version_id)
    _require_draft(version)
    int_value = coerce_um_int(
        value, context=f"cell {s_code}:{charging_location_id}",
    )
    existing = _get_cell(db, version_id, s_code, charging_location_id)
    old_value = int(existing.value) if existing is not None else None

    if int_value == 0:
        if existing is not None:
            db.delete(existing)
        mut = CellMutation(s_code, charging_location_id, old_value, None)
    elif existing is not None:
        existing.value = int_value
        mut = CellMutation(s_code, charging_location_id, old_value, int_value)
    else:
        db.add(
            UserMeasurement(
                version_id=version_id,
                s_code=s_code,
                charging_location_id=charging_location_id,
                value=int_value,
            )
        )
        mut = CellMutation(s_code, charging_location_id, None, int_value)

    if mut.old_value != mut.new_value:
        _audit_cell(
            db, actor_person_id=actor_person_id, version=version, mut=mut,
        )
    return mut


def delete_cell(
    db: Session,
    version_id: int,
    s_code: str,
    charging_location_id: str,
    *,
    actor_person_id: str,
) -> CellMutation:
    """Delete a cell (sparse). Convenience wrapper over ``set_cell(0)``."""
    return set_cell(
        db, version_id, s_code, charging_location_id, 0,
        actor_person_id=actor_person_id,
    )


def bulk_set_cells(
    db: Session,
    version_id: int,
    cells: list[dict],
    *,
    actor_person_id: str,
) -> list[CellMutation]:
    """Row/column paste — one audit row per changed cell per [F-UM-05].

    Each dict: ``{s_code, charging_location_id, value}``.
    """
    muts: list[CellMutation] = []
    for c in cells:
        muts.append(
            set_cell(
                db,
                version_id,
                c["s_code"],
                c["charging_location_id"],
                c["value"],
                actor_person_id=actor_person_id,
            )
        )
    return muts


# ---------------------------------------------------------------------------
# Activation (the freeze point per [F-UM-02])
# ---------------------------------------------------------------------------

def activate_version(
    db: Session,
    version_id: int,
    *,
    actor_person_id: Optional[str] = None,
) -> UMVersion:
    """Freeze a draft into an immutable active version per [F-UM-02].

    Sets ``activated_at``. Historical active versions for the same
    (year, quarter) remain intact; resolution picks the latest-activated.
    Writes a single version-level ``activate`` audit row (not per cell).
    """
    version = get_version(db, version_id)
    if version.status == "active":
        raise UMValidationError(
            f"UM version {version_id} is already active.",
        )
    version.status = "active"
    version.activated_at = datetime.utcnow()
    if actor_person_id:
        _audit_version(
            db, actor_person_id=actor_person_id, version=version,
            action="activate", field_changed="status",
            old_value="draft", new_value="active",
        )
    return version


# ---------------------------------------------------------------------------
# Allocation key — distinct-values helper for the FD-6 autocomplete [F-AK-01]
# ---------------------------------------------------------------------------

def list_allocation_keys(db: Session) -> list[str]:
    """Distinct non-empty allocation keys across the catalogue (sorted).

    Feeds FD-6's free-text-with-presets editor; FD-1 deliverable.
    """
    rows = (
        db.query(ChargeableEntity.allocation_key)
        .filter(
            ChargeableEntity.allocation_key.isnot(None),
            ChargeableEntity.allocation_key != "",
        )
        .distinct()
        .order_by(ChargeableEntity.allocation_key)
        .all()
    )
    return [r[0] for r in rows]


__all__ = [
    "UMValidationError",
    "CellMutation",
    "ImportResult",
    "coerce_um_int",
    "get_version",
    "get_active_version",
    "get_active_version_or_raise",
    "list_versions",
    "list_cells",
    "create_draft",
    "create_draft_from_csv",
    "copy_from_version",
    "set_cell",
    "delete_cell",
    "bulk_set_cells",
    "activate_version",
    "list_allocation_keys",
]
