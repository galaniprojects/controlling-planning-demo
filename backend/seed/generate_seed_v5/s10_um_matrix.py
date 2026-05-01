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
            c["year"],
            c["quarter"],
            c["s_code"],
            c["charging_location_id"],
        ),
    )


def _row_sql(c: dict) -> str:
    return (
        f"({c['year']}, {c['quarter']}, {sql_str(c['s_code'])}, "
        f"{sql_str(c['charging_location_id'])}, {c['value']}, "
        f"{sql_str(c['source'])}, '{c['imported_at']}', NULL)"
    )


def _emit_insert_batch(rows: list[dict]) -> list[str]:
    """Emit a multi-row INSERT for a chunk of UM cells."""
    lines = [
        "INSERT INTO user_measurements (year, quarter, s_code, charging_location_id, "
        "value, source, imported_at, imported_by_person_id) VALUES"
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
    lines.append("-- Imported batch headers:")
    for b in UM_BATCHES:
        loc_count_per_batch = sum(len(locs) for _, locs in S_CODE_LOCS)
        lines.append(
            f"--   {b['year']}-Q{b['quarter']} source='{b['source']}' "
            f"imported_at='{b['imported_at']}' rows={loc_count_per_batch}"
        )
    lines.append("-- =============================================================================")
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
