"""Stage 10 — UM (User Measurement) matrix rows.

Per ``[F-UM-01..04]``:
- Sparse, versioned storage. A "version" is the set of rows sharing the same
  ``(year, quarter, imported_at)`` triple.
- Two batches seeded: 2025-Q1 (historical) and 2026-Q1 (current). Both cover
  the same 12 S-codes and the same per-S-code location subsets; values drift
  slightly year-over-year per the deterministic seeding scheme in
  ``config/um.py``.
- Rows are inserted in chunks of 50 for readability; total ≈ 312 rows
  (156 per quarter × 2 quarters).

Counts per S-code per quarter:
  S042 (flagship)  17 locs   S118  25 locs    S067  12 locs
  S155             14 locs   S210  10 locs    S088   4 locs
  S301              9 locs   S312  30 locs    S408   6 locs
  S503              8 locs   S720  18 locs    S999   3 locs (uncovered sentinel)
"""
from __future__ import annotations

from _utils import sql_str
from generate_seed_v5.config.branding import CREATED_AT
from generate_seed_v5.config.um import (
    S_CODE_LOCS,
    UM_BATCHES,
    UM_CELLS,
)

# Multi-row INSERTs are chunked so seed.sql remains diffable.
_CHUNK_SIZE = 50


def _sorted_cells() -> list[dict]:
    return sorted(
        UM_CELLS,
        key=lambda c: (
            c["version_id"],
            c["s_code"],
            c["charging_location_id"],
        ),
    )


def _version_row_sql(b: dict) -> str:
    activated = f"'{b['activated_at']}'" if b["activated_at"] else "NULL"
    return (
        f"({b['version_id']}, {b['year']}, {b['quarter']}, "
        f"{sql_str(b['status'])}, {sql_str(b['source'])}, {activated}, "
        f"NULL, '{CREATED_AT}', NULL, '{CREATED_AT}')"
    )


def _row_sql(c: dict) -> str:
    return (
        f"({c['version_id']}, {sql_str(c['s_code'])}, "
        f"{sql_str(c['charging_location_id'])}, {c['value']})"
    )


def _emit_insert_batch(rows: list[dict]) -> list[str]:
    """Emit a multi-row INSERT for a chunk of UM cells."""
    lines = [
        "INSERT INTO user_measurements (version_id, s_code, "
        "charging_location_id, value) VALUES"
    ]
    sql_rows = [_row_sql(c) for c in rows]
    lines.append(",\n".join(sql_rows) + ";")
    return lines


def generate() -> str:
    lines: list[str] = []

    lines.append("-- =============================================================================")
    lines.append("-- s10_um_matrix / UM matrix snapshots [F-UM-01..04]")
    lines.append(
        f"-- {len(UM_CELLS)} rows total, {len(UM_BATCHES)} batches "
        f"({', '.join(f'{b['year']}-Q{b['quarter']}' for b in UM_BATCHES)}), "
        f"{len(S_CODE_LOCS)} S-codes."
    )
    lines.append("-- UM version headers (FK target — emitted before cells):")
    for b in UM_BATCHES:
        lines.append(
            f"--   v{b['version_id']} {b['year']}-Q{b['quarter']} "
            f"status={b['status']} source={b['source']} "
            f"activated_at={b['activated_at']}"
        )
    lines.append("-- =============================================================================")
    lines.append("")

    # UMVersion header rows first so user_measurements.version_id FK resolves.
    lines.append(
        "INSERT INTO um_versions (id, year, quarter, status, source, "
        "activated_at, copied_from_version_id, created_at, "
        "created_by_person_id, modified_at) VALUES"
    )
    lines.append(
        ",\n".join(_version_row_sql(b) for b in UM_BATCHES) + ";"
    )
    lines.append("")

    # Chunk the cell list into 50-row INSERTs for readability.
    cells = _sorted_cells()
    for chunk_start in range(0, len(cells), _CHUNK_SIZE):
        chunk = cells[chunk_start:chunk_start + _CHUNK_SIZE]
        lines.extend(_emit_insert_batch(chunk))
        lines.append("")  # blank line between chunks

    # Trailing summary comment for human review.
    by_s_code: dict[str, int] = {}
    for c in UM_CELLS:
        by_s_code[c["s_code"]] = by_s_code.get(c["s_code"], 0) + 1
    lines.append("-- UM rows per S-code (across all batches):")
    for s_code in sorted(by_s_code):
        lines.append(f"--   {s_code}: {by_s_code[s_code]} rows")

    # Suppress reference to CREATED_AT lint (kept import-stable across stages).
    _ = CREATED_AT  # noqa: F841

    return "\n".join(lines) + "\n"
