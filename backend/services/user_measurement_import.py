"""CSV parser for the UM matrix per [F-UM-01] and [F-UM-03].

Charging/UM rework (cluster FD-1): this module is now a **pure parser**. It no
longer inserts ``UserMeasurement`` rows or owns a version/timestamp — that is
the responsibility of ``services/user_measurement_service.py`` (the state
machine). CSV bulk-entry populates a *draft* version per [F-UM-03]; activation
is a separate, deliberate controller action.

Contract (header row required):
- Expected columns: ``year, quarter, s_code, charging_location_code, value``;
  optional ``source``.
- ``value`` is **integer-valued** per [F-UM-01]. Integral floats (``"42"``,
  ``"42.0"``) are accepted; true fractionals (``"42.5"``) and non-numerics are
  rejected with a per-row error.
- Rows with ``value == 0`` are skipped (sparse storage per [F-UM-01]).
- ``charging_location_code`` must match an existing ChargingLocation.
- A single ``(year, quarter)`` per import; mixed values are a per-row error.
- Parse errors are collected and returned; the parser never raises for row
  problems (only for a missing/empty header) — the caller decides what to do.
"""

from __future__ import annotations

import csv
import re
from dataclasses import dataclass, field
from datetime import datetime
from io import StringIO
from typing import Optional

# Base-10 integer, optionally trailing-zero decimals; no exponent, no
# inf/nan. Shared shape with user_measurement_service._UM_INT_RE.
_UM_INT_RE = re.compile(r"[+-]?\d+(?:\.0+)?\Z")

from sqlalchemy.orm import Session

from models.charging import ChargingLocation


REQUIRED_COLUMNS = ("year", "quarter", "s_code", "charging_location_code", "value")
OPTIONAL_COLUMNS = ("source",)


@dataclass
class ParsedCell:
    s_code: str
    charging_location_id: str
    value: int


@dataclass
class ParsedCSV:
    """Result of parsing a UM CSV — no DB state created."""

    year: int
    quarter: int
    source: str
    cells: list[ParsedCell] = field(default_factory=list)
    skipped_zero_rows: int = 0
    parse_errors: list[str] = field(default_factory=list)

    @property
    def row_count(self) -> int:
        return len(self.cells)


@dataclass
class ImportResult:
    """Summary returned by the legacy import path (router response shape).

    Built by ``user_measurement_service.create_draft_from_csv`` from a
    ``ParsedCSV`` plus the created version's identity. ``imported_at`` carries
    the version's ``activated_at`` (the FD-1 legacy shim auto-activates a
    CSV-created draft so the old "import → usable" contract holds; the
    review-before-activate flow is FD-2).
    """

    year: int
    quarter: int
    imported_at: datetime
    source: str
    row_count: int  # successful cells (zero-rows skipped)
    inserted: int
    skipped_zero_rows: int
    parse_errors: list[str] = field(default_factory=list)


def _parse_int(s: str, field_name: str, line: int) -> int:
    try:
        return int((s or "").strip())
    except (ValueError, AttributeError):
        raise ValueError(f"line {line}: invalid {field_name} '{s}'")


def _parse_int_strict(s: str, line: int) -> int:
    """Parse a UM value as an integer per [F-UM-01].

    Accepted grammar: ``[+-]?digits`` optionally with trailing-zero decimals
    (``"42"``, ``"42.0"``, ``"-5"``). Rejects fractionals (``"42.5"``),
    scientific notation (``"1e3"``), ``inf``/``nan``, and non-numerics with a
    clear row-level message — the same narrow grammar the service-layer
    ``coerce_um_int`` gate enforces, so CSV and in-grid entry agree.
    """
    t = (s or "").strip()
    if not t:
        raise ValueError(f"line {line}: missing value")
    if not _UM_INT_RE.match(t):
        raise ValueError(f"line {line}: value must be an integer, got '{s}'")
    return int(float(t))


def parse_um_csv(
    db: Session,
    csv_text: str,
    *,
    default_source: str = "csv_upload",
) -> ParsedCSV:
    """Parse ``csv_text`` into validated integer cells. Performs NO DB writes.

    Reads ``ChargingLocation`` only to resolve ``code -> id``. The caller
    (``user_measurement_service``) owns version/cell creation.
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

    parse_errors: list[str] = []
    cells: list[ParsedCell] = []
    skipped_zero_rows = 0
    detected_year: Optional[int] = None
    detected_quarter: Optional[int] = None
    detected_source: Optional[str] = None

    # Cache code -> id; ~90-row scale, in-memory is fine.
    cl_by_code: dict[str, str] = {
        cl.code: cl.id for cl in db.query(ChargingLocation).all()
    }

    for line_no, row in enumerate(reader, start=2):  # header is line 1
        try:
            year = _parse_int(row["year"], "year", line_no)
            quarter = _parse_int(row["quarter"], "quarter", line_no)
            if quarter < 1 or quarter > 4:
                raise ValueError(
                    f"line {line_no}: quarter must be 1-4, got {quarter}"
                )
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
            value = _parse_int_strict(row["value"], line_no)
            row_source = (row.get("source") or "").strip() or default_source

            if detected_year is None:
                detected_year = year
                detected_quarter = quarter
                detected_source = row_source
            elif year != detected_year or quarter != detected_quarter:
                raise ValueError(
                    f"line {line_no}: mixed (year, quarter) in single import "
                    f"(saw {(detected_year, detected_quarter)} earlier, "
                    f"now {(year, quarter)})"
                )

            if value == 0:
                skipped_zero_rows += 1
                continue

            cells.append(ParsedCell(s_code, cl_id, value))
        except ValueError as exc:
            parse_errors.append(str(exc))

    return ParsedCSV(
        year=detected_year or 0,
        quarter=detected_quarter or 0,
        source=detected_source or default_source,
        cells=cells,
        skipped_zero_rows=skipped_zero_rows,
        parse_errors=parse_errors,
    )
