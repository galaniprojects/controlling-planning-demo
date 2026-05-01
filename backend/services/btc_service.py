"""BTC (Business Transfer Charging) profile service for v5 Cluster F.

Per [F-S2-01..08], [F-RV-01..06], [F-OQ-05], [A-PL-06].

BTC profiles map a chargeable entity's to-business cost across the 90
charging locations using percentage-based allocations. Two modes:

- ``'manual'``:  Controller sets percentages directly. Sum must equal 100%
  within the tolerance defined in BTC_SUM_TOLERANCE.
- ``'automatic'``: Percentages are derived from the UM (User Measurement)
  matrix for the entity's S-code. A snapshot is captured at compute time and
  stored in BTCProfile rows. Any future UM import can trigger a
  ``refresh_from_um`` to re-derive the percentages.

Year-rollover copies a prior year's active profile into a new draft profile
for the target year, allowing the controller to review before activating.

The BTC gate (``assert_btc_required``) is called by the intake-workflow
service when approving a project at DoI 2→3 per [A-PL-06]:
- The associated ChargeableEntity must have an active BTCProfile for the
  current or next calendar year when ``to_business_pct > 0``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from models.charging import (
    BTCProfile, BTCProfileLine, ChargeableEntity, ChargingLocation,
    UserMeasurement,
)

# ---------------------------------------------------------------------------
# Validation constants
# ---------------------------------------------------------------------------

BTC_SUM_TOLERANCE = 0.01  # 1% of rounding tolerance for sum-to-100 check

# Supported mode-change transitions per [F-S2-03].
# Tuple: (from_mode, to_mode)
VALID_MODE_TRANSITIONS = [
    ("manual", "automatic"),
    ("automatic", "manual"),
]


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------

class BTCValidationError(Exception):
    """Raised by the BTC service when a write would violate business rules.

    The router catches this and returns HTTP 409 Conflict.
    """

    def __init__(self, message: str, *, warnings: Optional[list[str]] = None):
        super().__init__(message)
        self.message = message
        self.warnings = warnings or []


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _latest_um_batch_timestamp(db: Session, year: int, quarter: int) -> Optional[datetime]:
    """Return the most recent ``imported_at`` for the given (year, quarter) UM batch."""
    row = (
        db.query(UserMeasurement.imported_at)
        .filter(
            UserMeasurement.year == year,
            UserMeasurement.quarter == quarter,
        )
        .order_by(UserMeasurement.imported_at.desc())
        .first()
    )
    return row.imported_at if row else None


def _current_quarter(year: int | None = None, quarter: int | None = None) -> tuple[int, int]:
    """Return (year, quarter) for looking up UM data.

    Default is Q1 2026 (the seeded UM data is Q1; demo date is April 2026 = Q2
    but the Q1 data is the most recent seeded batch). When callers supply
    explicit values they override the defaults.
    """
    demo_year = year if year is not None else 2026
    demo_quarter = quarter if quarter is not None else 1  # Q1 2026 is seeded
    return demo_year, demo_quarter


# ---------------------------------------------------------------------------
# Core read operations
# ---------------------------------------------------------------------------

def get_profile(db: Session, profile_id: int) -> BTCProfile:
    """Fetch a profile by id or raise BTCValidationError."""
    profile = db.query(BTCProfile).filter_by(id=profile_id).first()
    if profile is None:
        raise BTCValidationError(f"BTCProfile {profile_id} not found")
    return profile


def get_profile_for_entity(
    db: Session, entity_id: str, year: int,
) -> Optional[BTCProfile]:
    """Return the BTCProfile for (entity, year), or None."""
    return (
        db.query(BTCProfile)
        .filter(BTCProfile.entity_id == entity_id, BTCProfile.year == year)
        .first()
    )


def list_profiles(
    db: Session,
    *,
    entity_id: Optional[str] = None,
    year: Optional[int] = None,
    status: Optional[str] = None,
    mode: Optional[str] = None,
) -> list[BTCProfile]:
    """List BTC profiles with optional filters."""
    q = db.query(BTCProfile)
    if entity_id is not None:
        q = q.filter(BTCProfile.entity_id == entity_id)
    if year is not None:
        q = q.filter(BTCProfile.year == year)
    if status is not None:
        q = q.filter(BTCProfile.status == status)
    if mode is not None:
        q = q.filter(BTCProfile.mode == mode)
    return q.order_by(BTCProfile.entity_id, BTCProfile.year).all()


# ---------------------------------------------------------------------------
# Sum-to-100 validation
# ---------------------------------------------------------------------------

def assert_sums_to_100(lines: list[BTCProfileLine]) -> None:
    """Raise BTCValidationError if the lines do not sum to 100 within tolerance."""
    total = sum(float(line.percentage) for line in lines)
    if abs(total - 100.0) > BTC_SUM_TOLERANCE:
        raise BTCValidationError(
            f"BTC profile lines must sum to 100% within ±{BTC_SUM_TOLERANCE}%. "
            f"Current sum: {round(total, 4)}%",
        )


def compute_sums_to_100(lines: list[BTCProfileLine]) -> bool:
    """Return True when lines sum to 100 within tolerance (non-raising form)."""
    total = sum(float(line.percentage) for line in lines)
    return abs(total - 100.0) <= BTC_SUM_TOLERANCE


# ---------------------------------------------------------------------------
# UM snapshot computation (automatic mode)
# ---------------------------------------------------------------------------

@dataclass
class UMSnapshotRow:
    charging_location_id: str
    charging_location_code: str
    percentage: float
    raw_value: float
    total_value: float


@dataclass
class UMSnapshot:
    s_code: str
    year: int
    quarter: int
    rows: list[UMSnapshotRow] = field(default_factory=list)
    imported_at: Optional[datetime] = None
    sums_to_100: bool = False


def compute_um_snapshot(
    db: Session, s_code: str, year: int, quarter: int,
) -> UMSnapshot:
    """Compute the BTC percentage distribution from the UM matrix.

    Reads all UserMeasurement rows for the given (year, quarter, s_code)
    from the most-recent import batch. Normalises values to percentages that
    sum to 100%.

    Raises ``BTCValidationError`` when no UM data is found for the given
    parameters — the service raises rather than silently zeroing per F3's
    design decision (Key Risk 3 in the plan).
    """
    # Find the most recent batch timestamp for this (year, quarter).
    latest_ts = _latest_um_batch_timestamp(db, year, quarter)
    if latest_ts is None:
        raise BTCValidationError(
            f"No UM data found for year={year}, quarter={quarter}. "
            f"Import a UM CSV before creating an automatic BTC profile.",
        )

    # Fetch all rows for this s_code in the most recent batch.
    rows = (
        db.query(UserMeasurement)
        .filter(
            UserMeasurement.year == year,
            UserMeasurement.quarter == quarter,
            UserMeasurement.s_code == s_code,
            UserMeasurement.imported_at == latest_ts,
        )
        .all()
    )
    if not rows:
        raise BTCValidationError(
            f"No UM rows found for s_code='{s_code}' in year={year}, "
            f"quarter={quarter} (latest batch {latest_ts.isoformat()}). "
            f"Verify the S-code is present in the UM data.",
        )

    total_value = sum(float(r.value) for r in rows)
    if total_value <= 0:
        raise BTCValidationError(
            f"Total UM value for s_code='{s_code}' is zero or negative "
            f"({total_value}). Cannot derive percentages.",
        )

    snapshot_rows: list[UMSnapshotRow] = []
    for r in rows:
        cl = db.query(ChargingLocation).filter_by(id=r.charging_location_id).first()
        pct = round(float(r.value) / total_value * 100.0, 4)
        snapshot_rows.append(UMSnapshotRow(
            charging_location_id=r.charging_location_id,
            charging_location_code=cl.code if cl else r.charging_location_id,
            percentage=pct,
            raw_value=float(r.value),
            total_value=total_value,
        ))

    # Normalise to ensure sum == 100.00 — add rounding residual to the first row.
    total_pct = sum(row.percentage for row in snapshot_rows)
    if snapshot_rows and abs(total_pct - 100.0) > 0:
        snapshot_rows[0] = UMSnapshotRow(
            charging_location_id=snapshot_rows[0].charging_location_id,
            charging_location_code=snapshot_rows[0].charging_location_code,
            percentage=round(snapshot_rows[0].percentage + (100.0 - total_pct), 4),
            raw_value=snapshot_rows[0].raw_value,
            total_value=total_value,
        )

    snapshot = UMSnapshot(
        s_code=s_code, year=year, quarter=quarter,
        rows=snapshot_rows, imported_at=latest_ts, sums_to_100=True,
    )
    return snapshot


# ---------------------------------------------------------------------------
# Create operations
# ---------------------------------------------------------------------------

def create_manual_profile(
    db: Session,
    entity_id: str,
    year: int,
    lines: list[dict],  # [{"charging_location_id": str, "percentage": float}, ...]
    *,
    status: str = "draft",
) -> BTCProfile:
    """Create a manual BTC profile.

    ``lines`` must sum to 100 within tolerance (validated here before insert).
    ``status`` defaults to ``'draft'``.

    Does not commit — caller commits within the audit-log transaction.
    """
    entity = db.query(ChargeableEntity).filter_by(id=entity_id).first()
    if entity is None:
        raise BTCValidationError(f"ChargeableEntity '{entity_id}' not found")
    if status not in ("draft", "active"):
        raise BTCValidationError(f"Invalid status '{status}'; must be 'draft' or 'active'")

    # Check for duplicate profile.
    existing = get_profile_for_entity(db, entity_id, year)
    if existing is not None:
        raise BTCValidationError(
            f"BTCProfile for entity '{entity_id}' year {year} already exists "
            f"(id={existing.id}). Use PUT to update or DELETE first.",
        )

    # Validate charging location existence.
    for line_data in lines:
        cl = db.query(ChargingLocation).filter_by(
            id=line_data["charging_location_id"],
        ).first()
        if cl is None:
            raise BTCValidationError(
                f"ChargingLocation '{line_data['charging_location_id']}' not found",
            )

    profile = BTCProfile(
        entity_id=entity_id,
        year=year,
        mode="manual",
        status=status,
    )
    db.add(profile)
    db.flush()  # populate profile.id

    line_objects = []
    for line_data in lines:
        line = BTCProfileLine(
            profile_id=profile.id,
            charging_location_id=line_data["charging_location_id"],
            percentage=Decimal(str(round(float(line_data["percentage"]), 2))),
        )
        db.add(line)
        line_objects.append(line)
    db.flush()

    assert_sums_to_100(line_objects)
    return profile


def create_automatic_profile(
    db: Session,
    entity_id: str,
    year: int,
    s_code: str,
    *,
    um_year: Optional[int] = None,
    um_quarter: Optional[int] = None,
    status: str = "draft",
) -> BTCProfile:
    """Create an automatic BTC profile derived from the UM matrix.

    Fetches UM data for ``s_code`` in the given (year, quarter) and normalises
    values to percentages. Raises ``BTCValidationError`` when UM data is absent.

    Does not commit — caller commits.
    """
    entity = db.query(ChargeableEntity).filter_by(id=entity_id).first()
    if entity is None:
        raise BTCValidationError(f"ChargeableEntity '{entity_id}' not found")

    # Check for duplicate profile.
    existing = get_profile_for_entity(db, entity_id, year)
    if existing is not None:
        raise BTCValidationError(
            f"BTCProfile for entity '{entity_id}' year {year} already exists "
            f"(id={existing.id}).",
        )

    snap_year, snap_quarter = _current_quarter(um_year)
    if um_quarter is not None:
        snap_quarter = um_quarter

    snapshot = compute_um_snapshot(db, s_code, snap_year, snap_quarter)

    profile = BTCProfile(
        entity_id=entity_id,
        year=year,
        mode="automatic",
        s_code=s_code,
        um_snapshot_at=snapshot.imported_at,
        status=status,
    )
    db.add(profile)
    db.flush()

    for row in snapshot.rows:
        line = BTCProfileLine(
            profile_id=profile.id,
            charging_location_id=row.charging_location_id,
            percentage=Decimal(str(round(row.percentage, 2))),
        )
        db.add(line)
    db.flush()

    return profile


# ---------------------------------------------------------------------------
# Update operations
# ---------------------------------------------------------------------------

def update_profile(
    db: Session,
    profile_id: int,
    lines: list[dict],
) -> BTCProfile:
    """Replace all lines on a manual profile.

    Only manual-mode profiles can be updated this way. For automatic profiles,
    use ``refresh_from_um``. Only draft profiles are mutable.

    Does not commit — caller commits.
    """
    profile = get_profile(db, profile_id)
    if profile.mode != "manual":
        raise BTCValidationError(
            f"Profile {profile_id} is in '{profile.mode}' mode. "
            "Use POST /btc-profiles/{id}/refresh-um for automatic profiles.",
        )
    if profile.status == "active":
        raise BTCValidationError(
            f"Profile {profile_id} is 'active' — activate a new draft instead of editing.",
        )

    # Validate charging locations.
    for line_data in lines:
        cl = db.query(ChargingLocation).filter_by(
            id=line_data["charging_location_id"],
        ).first()
        if cl is None:
            raise BTCValidationError(
                f"ChargingLocation '{line_data['charging_location_id']}' not found",
            )

    # Replace lines: delete old, flush, then add new.
    for old_line in list(profile.lines):
        db.delete(old_line)
    db.flush()
    # Expire the profile so the 'lines' collection reflects the deletion.
    db.expire(profile)

    line_objects = []
    for line_data in lines:
        line = BTCProfileLine(
            profile_id=profile.id,
            charging_location_id=line_data["charging_location_id"],
            percentage=Decimal(str(round(float(line_data["percentage"]), 2))),
        )
        db.add(line)
        line_objects.append(line)
    db.flush()

    assert_sums_to_100(line_objects)
    profile.modified_at = datetime.utcnow()
    return profile


# ---------------------------------------------------------------------------
# Refresh from UM (automatic mode only)
# ---------------------------------------------------------------------------

@dataclass
class BTCRefreshDiff:
    """Dry-run diff showing how an automatic profile's lines would change."""
    profile_id: int
    s_code: str
    year: int
    quarter: int
    current_lines: list[dict]  # [{"cl_id": str, "old_pct": float}]
    new_lines: list[dict]      # [{"cl_id": str, "new_pct": float}]
    added: list[str]           # cl_ids that would be added
    removed: list[str]         # cl_ids that would be removed
    changed: list[dict]        # [{"cl_id": str, "old_pct": float, "new_pct": float}]
    would_sum_to_100: bool


def refresh_from_um(
    db: Session, profile_id: int,
    *,
    um_year: Optional[int] = None,
    um_quarter: Optional[int] = None,
    dry_run: bool = False,
) -> BTCRefreshDiff:
    """Re-derive an automatic profile's lines from the latest UM data.

    When ``dry_run=True``, returns the diff without committing any changes.
    When ``dry_run=False``, replaces the lines in-place (does not commit).

    Raises BTCValidationError when UM data is absent.
    """
    profile = get_profile(db, profile_id)
    if profile.mode != "automatic":
        raise BTCValidationError(
            f"Profile {profile_id} is '{profile.mode}' mode; "
            "refresh_from_um is only valid for automatic profiles.",
        )
    if not profile.s_code:
        raise BTCValidationError(
            f"Profile {profile_id} has no s_code; cannot refresh from UM.",
        )

    snap_year, snap_quarter = _current_quarter(um_year)
    if um_quarter is not None:
        snap_quarter = um_quarter

    snapshot = compute_um_snapshot(db, profile.s_code, snap_year, snap_quarter)

    # Compute diff.
    current_map = {line.charging_location_id: float(line.percentage) for line in profile.lines}
    new_map = {row.charging_location_id: round(row.percentage, 2) for row in snapshot.rows}

    added = [cl_id for cl_id in new_map if cl_id not in current_map]
    removed = [cl_id for cl_id in current_map if cl_id not in new_map]
    changed = [
        {"cl_id": cl_id, "old_pct": current_map[cl_id], "new_pct": new_map[cl_id]}
        for cl_id in new_map
        if cl_id in current_map and abs(current_map[cl_id] - new_map[cl_id]) > BTC_SUM_TOLERANCE
    ]

    diff = BTCRefreshDiff(
        profile_id=profile_id,
        s_code=profile.s_code,
        year=snap_year,
        quarter=snap_quarter,
        current_lines=[{"cl_id": k, "old_pct": v} for k, v in current_map.items()],
        new_lines=[{"cl_id": k, "new_pct": v} for k, v in new_map.items()],
        added=added,
        removed=removed,
        changed=changed,
        would_sum_to_100=snapshot.sums_to_100,
    )

    if not dry_run:
        # Replace lines.
        for old_line in list(profile.lines):
            db.delete(old_line)
        db.flush()

        for row in snapshot.rows:
            line = BTCProfileLine(
                profile_id=profile.id,
                charging_location_id=row.charging_location_id,
                percentage=Decimal(str(round(row.percentage, 2))),
            )
            db.add(line)
        db.flush()
        profile.um_snapshot_at = snapshot.imported_at
        profile.modified_at = datetime.utcnow()

    return diff


# ---------------------------------------------------------------------------
# Mode change
# ---------------------------------------------------------------------------

@dataclass
class BTCModeChangeWarning:
    profile_id: int
    from_mode: str
    to_mode: str
    message: str
    requires_confirm: bool


def change_mode(
    db: Session, profile_id: int, new_mode: str,
    *,
    confirm: bool = False,
    s_code: Optional[str] = None,
    um_year: Optional[int] = None,
    um_quarter: Optional[int] = None,
) -> BTCProfile:
    """Change the mode of a BTC profile.

    Transitions per [F-S2-03]:
    1. manual → automatic: requires s_code; derives lines from UM.
    2. automatic → manual: warns that UM link is severed; preserves current
       lines as a starting point for manual editing.

    For transitions that could lose data, ``confirm=False`` returns a warning;
    ``confirm=True`` proceeds.

    Does not commit — caller commits.
    """
    profile = get_profile(db, profile_id)

    if (profile.mode, new_mode) not in VALID_MODE_TRANSITIONS:
        raise BTCValidationError(
            f"Mode change '{profile.mode}' → '{new_mode}' is not supported. "
            f"Valid transitions: {VALID_MODE_TRANSITIONS}",
        )

    if profile.mode == new_mode:
        raise BTCValidationError(f"Profile {profile_id} is already in '{new_mode}' mode.")

    if new_mode == "automatic":
        if not s_code:
            raise BTCValidationError(
                "s_code is required when changing to 'automatic' mode.",
            )
        # Replacing lines from UM — warn if the profile is active.
        if profile.status == "active" and not confirm:
            raise BTCValidationError(
                "Changing an active profile's mode will replace all lines. "
                "Pass confirm=true to proceed.",
                warnings=["Active profile lines will be replaced from UM data."],
            )

        snap_year, snap_quarter = _current_quarter(um_year)
        if um_quarter is not None:
            snap_quarter = um_quarter
        snapshot = compute_um_snapshot(db, s_code, snap_year, snap_quarter)

        for old_line in list(profile.lines):
            db.delete(old_line)
        db.flush()

        for row in snapshot.rows:
            line = BTCProfileLine(
                profile_id=profile.id,
                charging_location_id=row.charging_location_id,
                percentage=Decimal(str(round(row.percentage, 2))),
            )
            db.add(line)
        db.flush()
        profile.s_code = s_code
        profile.um_snapshot_at = snapshot.imported_at

    else:  # automatic → manual
        # Warn that UM link is severed; preserve current lines.
        if not confirm:
            raise BTCValidationError(
                "Changing to manual mode severs the UM link. "
                "Current lines are preserved as a starting point. "
                "Pass confirm=true to proceed.",
                warnings=["UM link will be severed; current lines preserved."],
            )
        profile.s_code = None
        profile.um_snapshot_at = None

    profile.mode = new_mode
    profile.modified_at = datetime.utcnow()
    return profile


# ---------------------------------------------------------------------------
# Copy from profile
# ---------------------------------------------------------------------------

def copy_from_profile(
    db: Session,
    source_profile_id: int,
    target_entity_id: str,
    target_year: int,
    *,
    target_status: str = "draft",
) -> BTCProfile:
    """Create a new profile by copying lines from an existing profile.

    Useful for the year-rollover workflow: controller picks last year's active
    profile as the starting point for the next year's draft.

    Does not commit — caller commits.
    """
    source = get_profile(db, source_profile_id)

    # Check for duplicate profile.
    existing = get_profile_for_entity(db, target_entity_id, target_year)
    if existing is not None:
        raise BTCValidationError(
            f"BTCProfile for entity '{target_entity_id}' year {target_year} "
            f"already exists (id={existing.id}).",
        )

    entity = db.query(ChargeableEntity).filter_by(id=target_entity_id).first()
    if entity is None:
        raise BTCValidationError(f"ChargeableEntity '{target_entity_id}' not found")

    new_profile = BTCProfile(
        entity_id=target_entity_id,
        year=target_year,
        mode=source.mode,
        s_code=source.s_code,
        um_snapshot_at=None,  # not inherited — will require a fresh snapshot
        status=target_status,
        copied_from_profile_id=source.id,
    )
    db.add(new_profile)
    db.flush()

    for src_line in source.lines:
        new_line = BTCProfileLine(
            profile_id=new_profile.id,
            charging_location_id=src_line.charging_location_id,
            percentage=src_line.percentage,
        )
        db.add(new_line)
    db.flush()
    return new_profile


# ---------------------------------------------------------------------------
# Year rollover
# ---------------------------------------------------------------------------

@dataclass
class YearRolloverResult:
    rolled_over: list[int]  # new profile ids created
    skipped: list[str]      # entity_ids skipped (already have a target-year profile)
    errors: list[str]       # entity_ids that failed


# Map external lowercase entity-type filter values to the DB's TitleCase form.
_ENTITY_TYPE_FILTER_MAP = {
    "project": "Project",
    "offering": "Offering",
    "internal_service": "InternalService",
}


def year_rollover(
    db: Session,
    source_year: int,
    target_year: int,
    *,
    entity_types: Optional[list[str]] = None,
    entity_ids: Optional[list[str]] = None,
) -> YearRolloverResult:
    """Copy all active profiles from source_year to draft profiles for target_year.

    Profiles that already exist for the target year are skipped (not overwritten).
    Entities with errors are collected and reported; the rollover continues.

    Optional scope filters narrow the source-year query before iteration:

    - ``entity_types``: list of lowercase type names (``project`` / ``offering`` /
      ``internal_service``). When set, only profiles whose entity belongs to one
      of these types are rolled. Mutually exclusive with ``entity_ids``.
    - ``entity_ids``: explicit list of chargeable-entity ids to restrict to.
      Mutually exclusive with ``entity_types``.

    When both filters are ``None``, behaviour matches the original "roll all"
    contract.

    Does not commit — caller commits.
    """
    if entity_types is not None and entity_ids is not None:
        raise ValueError(
            "year_rollover: at most one of entity_types/entity_ids may be set",
        )

    query = (
        db.query(BTCProfile)
        .filter(BTCProfile.year == source_year, BTCProfile.status == "active")
    )

    if entity_ids:
        query = query.filter(BTCProfile.entity_id.in_(entity_ids))
    elif entity_types:
        # Translate lowercase API form → DB TitleCase form. Unknown values are
        # ignored (validator at the schema layer rejects them up-front).
        db_types = [
            _ENTITY_TYPE_FILTER_MAP[t]
            for t in entity_types
            if t in _ENTITY_TYPE_FILTER_MAP
        ]
        if not db_types:
            # No recognised types → no source profiles, return empty result.
            return YearRolloverResult(rolled_over=[], skipped=[], errors=[])
        query = query.join(
            ChargeableEntity, ChargeableEntity.id == BTCProfile.entity_id,
        ).filter(ChargeableEntity.entity_type.in_(db_types))

    source_profiles = query.all()

    rolled_over = []
    skipped = []
    errors = []

    for source in source_profiles:
        existing = get_profile_for_entity(db, source.entity_id, target_year)
        if existing is not None:
            skipped.append(source.entity_id)
            continue
        try:
            new_profile = copy_from_profile(
                db, source.id, source.entity_id, target_year, target_status="draft",
            )
            rolled_over.append(new_profile.id)
        except BTCValidationError as e:
            errors.append(f"{source.entity_id}: {e.message}")

    return YearRolloverResult(
        rolled_over=rolled_over,
        skipped=skipped,
        errors=errors,
    )


# ---------------------------------------------------------------------------
# BTC gate for DoI 2→3 per [A-PL-06]
# ---------------------------------------------------------------------------

def assert_btc_required(
    db: Session, entity_id: str, current_year: int,
) -> None:
    """Raise BTCValidationError if the entity needs a BTC profile but lacks one.

    Called by the intake workflow when approving a project at DoI 2→3 per
    [A-PL-06]. The gate checks whether an active BTCProfile exists for the
    entity for the current or next calendar year.

    An entity "needs" a BTC profile when its ``to_business_pct > 0``.
    Entities with ``to_business_pct == 0`` are exempt from the gate.
    """
    entity = db.query(ChargeableEntity).filter_by(id=entity_id).first()
    if entity is None:
        # Entity not found — skip the gate (not our concern; intake owns the project).
        return

    if float(entity.to_business_pct or 0) <= 0:
        return  # Exempt — no BTC charge configured.

    # Check current or next year.
    for year in (current_year, current_year + 1):
        profile = get_profile_for_entity(db, entity_id, year)
        if profile is not None and profile.status == "active":
            return  # Gate passed.

    raise BTCValidationError(
        f"ChargeableEntity '{entity_id}' has to_business_pct="
        f"{float(entity.to_business_pct):.2f}% but no active BTC profile "
        f"for year {current_year} or {current_year + 1}. "
        f"Create and activate a BTC profile before approving this project at DoI 3 "
        f"per [A-PL-06].",
    )


# ---------------------------------------------------------------------------
# WBS matrix
# ---------------------------------------------------------------------------

@dataclass
class WBSMatrixRow:
    charging_location_id: str
    charging_location_code: str
    charging_location_name: str
    wbs_element: str
    btc_percentage: Optional[float]  # None when no active BTC profile
    annual_amount_eur: Optional[float]


@dataclass
class WBSMatrixResponse:
    entity_id: str
    entity_name: str
    identifier: str
    year: int
    rows: list[WBSMatrixRow]
    sums_to_100: bool
    has_active_profile: bool
    effective_cost: Optional[float]


def build_wbs_matrix(
    db: Session, entity_id: str, year: int,
) -> WBSMatrixResponse:
    """Build the 90-row WBS matrix for an entity.

    Each row is one ChargingLocation. The BTC percentage comes from the active
    profile for the given year (or None when no active profile exists). The
    annual_amount_eur is computed as effective_cost × percentage / 100.

    ``effective_cost`` is sourced from the entity's own_cost (dag_resolver)
    for simplicity — the full recursive cost is available via the rollup
    endpoint.
    """
    from services.dag_resolver import get_own_cost
    from services.wbs_generator import build_wbs_element

    entity = db.query(ChargeableEntity).filter_by(id=entity_id).first()
    if entity is None:
        raise BTCValidationError(f"ChargeableEntity '{entity_id}' not found")

    # Load active profile (or None).
    profile = (
        db.query(BTCProfile)
        .filter(
            BTCProfile.entity_id == entity_id,
            BTCProfile.year == year,
            BTCProfile.status == "active",
        )
        .first()
    )

    # Build a map from charging_location_id → percentage.
    pct_map: dict[str, float] = {}
    if profile is not None:
        for line in profile.lines:
            pct_map[line.charging_location_id] = float(line.percentage)

    # Load the entity's own cost (direct cost, not DAG-resolved, for the matrix).
    own_cost = get_own_cost(entity)

    # Fetch all active charging locations.
    cls = (
        db.query(ChargingLocation)
        .filter(ChargingLocation.is_active.is_(True))
        .order_by(ChargingLocation.code)
        .all()
    )

    rows: list[WBSMatrixRow] = []
    for cl in cls:
        pct = pct_map.get(cl.id)
        amount = round(own_cost * (pct / 100.0), 2) if (pct is not None and own_cost > 0) else None
        wbs = build_wbs_element(entity.identifier, cl.code)
        rows.append(WBSMatrixRow(
            charging_location_id=cl.id,
            charging_location_code=cl.code,
            charging_location_name=cl.name,
            wbs_element=wbs,
            btc_percentage=pct,
            annual_amount_eur=amount,
        ))

    sums_to_100 = compute_sums_to_100(profile.lines) if profile else False

    return WBSMatrixResponse(
        entity_id=entity.id,
        entity_name=entity.name,
        identifier=entity.identifier,
        year=year,
        rows=rows,
        sums_to_100=sums_to_100,
        has_active_profile=profile is not None,
        effective_cost=own_cost if own_cost > 0 else None,
    )
