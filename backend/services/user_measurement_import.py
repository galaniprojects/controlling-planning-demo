"""CSV import for the UserMeasurement matrix per [F-UM-02] and [F-UM-03].

Working assumption captured in PROGRESS.md:
- Expected columns (header row required): ``year, quarter, s_code,
  charging_location_code, value, source``.
- The ``source`` column is optional in the row payload — when absent or empty
  the import endpoint uses the import-level default ``csv_upload`` per
  [F-UM-02].
- Rows with ``value == 0`` are skipped (sparse storage per [F-UM-01]).
- charging_location_code must match an existing ChargingLocation row.
- Each invocation creates a new "version" identified by its ``imported_at``
  timestamp; rows from prior versions are NEVER overwritten — every import is
  append-only per [F-UM-03].
- Parse errors are collected and returned alongside successful inserts; the
  function does not raise — the router wraps the result for the caller.
"""

from __future__ import annotations

import csv
from dataclasses import dataclass, field
from datetime import datetime
from io import StringIO
from typing import Optional

from sqlalchemy.orm import Session

from models.charging import ChargingLocation, UserMeasurement


REQUIRED_COLUMNS = ("year", "quarter", "s_code", "charging_location_code", "value")
OPTIONAL_COLUMNS = ("source",)


@dataclass
class ImportResult:
    year: int
    quarter: int
    imported_at: datetime
    source: str
    row_count: int  # successful inserts (zero-rows skipped)
    inserted: int
    skipped_zero_rows: int
    parse_errors: list[str] = field(default_factory=list)


def _parse_int(s: str, field_name: str, line: int) -> Optional[int]:
    try:
        return int(s.strip())
    except (ValueError, AttributeError):
        raise ValueError(f"line {line}: invalid {field_name} '{s}'")


def _parse_float(s: str, line: int) -> Optional[float]:
    try:
        return float(s.strip())
    except (ValueError, AttributeError):
        raise ValueError(f"line {line}: invalid value '{s}'")


def import_csv(
    db: Session,
    csv_text: str,
    *,
    default_source: str = "csv_upload",
    imported_by_person_id: Optional[str] = None,
) -> ImportResult:
    """Parse ``csv_text`` and insert non-zero cells as a new UM version.

    Returns the import summary; commits on success. Per [F-UM-03] this NEVER
    overwrites — it always appends a new version with a fresh ``imported_at``.
    """
    reader = csv.DictReader(StringIO(csv_text))
    if not reader.fieldnames:
        raise ValueError("CSV is empty (no header row)")

    missing = [c for c in REQUIRED_COLUMNS if c not in reader.fieldnames]
    if missing:
        raise ValueError(
            f"missing required CSV columns: {', '.join(missing)}; "
            f"expected: {', '.join(REQUIRED_COLUMNS + OPTIONAL_COLUMNS)}"
        )

    imported_at = datetime.utcnow()
    parse_errors: list[str] = []
    inserted = 0
    skipped_zero_rows = 0
    detected_year: Optional[int] = None
    detected_quarter: Optional[int] = None

    # Cache of charging_location_code -> id for fast lookup. Loading all rows
    # into memory is fine at the demo's ~90-row scale.
    cl_by_code: dict[str, str] = {
        cl.code: cl.id
        for cl in db.query(ChargingLocation).all()
    }

    for line_no, row in enumerate(reader, start=2):  # start=2: header is line 1
        try:
            year = _parse_int(row["year"], "year", line_no)
            quarter = _parse_int(row["quarter"], "quarter", line_no)
            if quarter is None or quarter < 1 or quarter > 4:
                raise ValueError(f"line {line_no}: quarter must be 1-4, got {quarter}")
            s_code = (row["s_code"] or "").strip()
            if not s_code:
                raise ValueError(f"line {line_no}: empty s_code")
            cl_code = (row["charging_location_code"] or "").strip()
            if not cl_code:
                raise ValueError(f"line {line_no}: empty charging_location_code")
            cl_id = cl_by_code.get(cl_code)
            if cl_id is None:
                raise ValueError(
                    f"line {line_no}: unknown charging_location_code '{cl_code}'"
                )
            value = _parse_float(row["value"], line_no)
            if value is None:
                raise ValueError(f"line {line_no}: missing value")
            row_source = (row.get("source") or "").strip() or default_source

            # Track first year/quarter for the version header. CSVs are
            # expected to carry a single (year, quarter) per import; mismatches
            # produce a parse error so the caller can correct upstream data.
            if detected_year is None:
                detected_year = year
                detected_quarter = quarter
            elif year != detected_year or quarter != detected_quarter:
                raise ValueError(
                    f"line {line_no}: mixed (year, quarter) in single import "
                    f"(saw {(detected_year, detected_quarter)} earlier, "
                    f"now {(year, quarter)})"
                )

            if value == 0:
                skipped_zero_rows += 1
                continue

            db.add(
                UserMeasurement(
                    year=year,
                    quarter=quarter,
                    s_code=s_code,
                    charging_location_id=cl_id,
                    value=value,
                    source=row_source,
                    imported_at=imported_at,
                    imported_by_person_id=imported_by_person_id,
                )
            )
            inserted += 1
        except ValueError as exc:
            parse_errors.append(str(exc))

    if inserted == 0 and parse_errors and detected_year is None:
        # Never seeded a year/quarter — surface a clear diagnostic.
        db.rollback()
        return ImportResult(
            year=0,
            quarter=0,
            imported_at=imported_at,
            source=default_source,
            row_count=0,
            inserted=0,
            skipped_zero_rows=skipped_zero_rows,
            parse_errors=parse_errors,
        )

    if inserted == 0 and detected_year is None:
        db.rollback()
        return ImportResult(
            year=0,
            quarter=0,
            imported_at=imported_at,
            source=default_source,
            row_count=0,
            inserted=0,
            skipped_zero_rows=skipped_zero_rows,
            parse_errors=parse_errors or ["CSV had no data rows"],
        )

    db.commit()
    return ImportResult(
        year=detected_year or 0,
        quarter=detected_quarter or 0,
        imported_at=imported_at,
        source=default_source,
        row_count=inserted,
        inserted=inserted,
        skipped_zero_rows=skipped_zero_rows,
        parse_errors=parse_errors,
    )
