"""User Measurement (UM) matrix subset.

Owned by Phase 2 T1 (charging). Per ``[F-UM-01..04]``:

- Sparse storage — only cells with non-zero usage seeded; absence implies zero.
- Two snapshots seeded:
    * 2025-Q1 (``imported_at='2025-01-20 10:00:00'``,
      ``source='csv_import_2025Q1'``) — historical batch
    * 2026-Q1 (``imported_at='2026-01-15 10:00:00'``,
      ``source='csv_import_2026Q1'``) — current batch (drives 2026 BTC profiles)
- 12 S-codes seeded densely. The flagship S042 (Master Data Hub) covers 17
  locations; broader-usage S118 covers 25; the sentinel S999 covers 3
  rows so the UI's "uncovered S-code" handling has data to render.
- Per-S-code location lists are deterministic; per-cell values are produced
  via a seeded ``random.Random`` keyed on ``(s_code, year, quarter)`` so the
  output is reproducible byte-identically across runs.

Hub-weighting: locations marked as global hubs (DE-MUC, DE-STG, FR-LYO,
FR-PAR, UK-LON, US-DET, IN-PUN, CN-SHA, JP-TOK) receive a 2.0× value
multiplier so the BTC percentage distribution favours them, matching the
demo narrative where IT cost concentrates around the major sites.
"""
from __future__ import annotations

import random

# ---------------------------------------------------------------------------
# Per-S-code charging-location subsets. Each list is sorted by id so the
# emitted SQL is deterministic.
# ---------------------------------------------------------------------------

# S042 — Master Data Hub flagship (17 locs across DACH + key EMEA hubs + IN/US).
S042_LOCS = sorted([
    "cl-de-muc", "cl-de-stg", "cl-de-wol", "cl-de-fra", "cl-de-ber", "cl-de-ham",
    "cl-fr-lyo", "cl-fr-par",
    "cl-uk-lon", "cl-uk-man",
    "cl-it-mil", "cl-es-mad", "cl-nl-ams",
    "cl-pl-poz", "cl-hu-bud",
    "cl-in-pun", "cl-us-det",
])

# S118 — Enterprise Unified Workspace (25 locs, broad EMEA + US + APAC).
S118_LOCS = sorted([
    "cl-de-muc", "cl-de-stg", "cl-de-wol", "cl-de-fra", "cl-de-ber", "cl-de-ham",
    "cl-de-col", "cl-de-dus",
    "cl-fr-lyo", "cl-fr-par",
    "cl-uk-lon", "cl-uk-man", "cl-uk-bir",
    "cl-it-mil", "cl-it-rom",
    "cl-es-mad", "cl-es-bar",
    "cl-nl-ams",
    "cl-pl-poz", "cl-hu-bud", "cl-cz-prg", "cl-at-vie",
    "cl-us-det", "cl-in-pun", "cl-cn-sha",
])

# S067 — Business Insights (12 locs — analytics hubs).
S067_LOCS = sorted([
    "cl-de-muc", "cl-de-stg", "cl-de-fra", "cl-de-ber",
    "cl-fr-lyo", "cl-fr-par",
    "cl-uk-lon",
    "cl-it-mil", "cl-es-mad", "cl-nl-ams",
    "cl-us-det", "cl-in-pun",
])

# S155 — Supply Chain Visibility (14 locs — global supply hubs).
S155_LOCS = sorted([
    "cl-de-muc", "cl-de-stg", "cl-de-wol",
    "cl-fr-lyo",
    "cl-it-mil", "cl-es-mad",
    "cl-pl-poz", "cl-hu-bud", "cl-cz-prg",
    "cl-us-det", "cl-mx-mex",
    "cl-cn-sha", "cl-in-pun", "cl-br-sao",
])

# S210 — Enterprise Collaboration Suite (10 locs — office hubs).
S210_LOCS = sorted([
    "cl-de-muc", "cl-de-stg",
    "cl-fr-par",
    "cl-uk-lon",
    "cl-it-mil", "cl-es-mad", "cl-nl-ams",
    "cl-us-det", "cl-in-pun", "cl-jp-tok",
])

# S088 — Field Diagnostics (4 locs — truck telematics narrow).
S088_LOCS = sorted([
    "cl-de-muc", "cl-de-stg", "cl-de-wol",
    "cl-us-det",
])

# S301 — SAP Basis (9 locs — SAP-running locations).
S301_LOCS = sorted([
    "cl-de-muc", "cl-de-stg",
    "cl-fr-lyo",
    "cl-uk-lon",
    "cl-it-mil", "cl-es-mad",
    "cl-pl-poz", "cl-hu-bud",
    "cl-in-pun",
])

# S312 — End-User Computing Support (30 locs — widest coverage).
S312_LOCS = sorted([
    "cl-de-muc", "cl-de-stg", "cl-de-wol", "cl-de-fra", "cl-de-ber",
    "cl-de-ham", "cl-de-col", "cl-de-dus", "cl-de-nur", "cl-de-lei",
    "cl-fr-lyo", "cl-fr-par", "cl-fr-mar", "cl-fr-tou",
    "cl-uk-lon", "cl-uk-man", "cl-uk-bir",
    "cl-it-mil", "cl-it-rom",
    "cl-es-mad", "cl-es-bar",
    "cl-nl-ams",
    "cl-pl-poz", "cl-pl-war",
    "cl-hu-bud",
    "cl-cz-prg",
    "cl-us-det", "cl-us-nyc",
    "cl-in-pun",
    "cl-cn-sha",
])

# S408 — Rail Application Maintenance (6 locs — rail centers).
S408_LOCS = sorted([
    "cl-de-muc", "cl-de-stg", "cl-de-fra",
    "cl-fr-par",
    "cl-uk-lon",
    "cl-pl-poz",
])

# S503 — TBS Application Maintenance (8 locs — truck centers).
S503_LOCS = sorted([
    "cl-de-muc", "cl-de-stg", "cl-de-wol",
    "cl-fr-lyo",
    "cl-it-mil",
    "cl-pl-poz", "cl-hu-bud",
    "cl-us-det",
])

# S720 — ITSM Platform (18 locs — mid-broad coverage).
S720_LOCS = sorted([
    "cl-de-muc", "cl-de-stg", "cl-de-wol", "cl-de-fra", "cl-de-ber", "cl-de-ham",
    "cl-fr-lyo", "cl-fr-par",
    "cl-uk-lon", "cl-uk-man",
    "cl-it-mil",
    "cl-es-mad",
    "cl-nl-ams",
    "cl-pl-poz",
    "cl-hu-bud",
    "cl-us-det",
    "cl-in-pun",
    "cl-cn-sha",
])

# S999 — Sentinel uncovered S-code (3 locs — to exercise the "no auto profile" path).
S999_LOCS = sorted([
    "cl-de-muc", "cl-fr-par", "cl-uk-lon",
])


# ---------------------------------------------------------------------------
# (s_code, [locs]) tuples in deterministic order (alphabetical s_code).
# Used by the UM emitter and (read-only) by s09_btc when computing automatic
# profile percentages.
# ---------------------------------------------------------------------------
S_CODE_LOCS: list[tuple[str, list[str]]] = [
    ("S042", S042_LOCS),
    ("S067", S067_LOCS),
    ("S088", S088_LOCS),
    ("S118", S118_LOCS),
    ("S155", S155_LOCS),
    ("S210", S210_LOCS),
    ("S301", S301_LOCS),
    ("S312", S312_LOCS),
    ("S408", S408_LOCS),
    ("S503", S503_LOCS),
    ("S720", S720_LOCS),
    ("S999", S999_LOCS),
]


# ---------------------------------------------------------------------------
# Per-version metadata. Charging/UM rework: CRETA is the system of record for
# the authored UM matrix ([F-DIR-01]); ``source='seed'`` is the only
# [F-UM-04]-legal greenfield provenance. A version is identified by
# ``(year, quarter, activated_at)`` per [F-UM-02]:
#   v1  2025-Q1  active  — historical frozen version
#   v2  2026-Q1  active  — current version (drives 2026 BTC; resolved by
#                          user_measurement_service.get_active_version)
#   v3  2026-Q2  draft   — an editable draft (no activated_at) so the FD-2
#                          authoring UI and the state-machine tests have a
#                          draft fixture. Restricted to a small S-code subset
#                          to keep seed.sql diffable.
# Explicit ``version_id`` so cell rows can FK it deterministically.
# ---------------------------------------------------------------------------
_DRAFT_S_CODES = ("S042", "S999")

UM_BATCHES: list[dict] = [
    {
        "version_id": 1,
        "year": 2025,
        "quarter": 1,
        "status": "active",
        "source": "seed",
        "activated_at": "2025-01-20 10:00:00",
    },
    {
        "version_id": 2,
        "year": 2026,
        "quarter": 1,
        "status": "active",
        "source": "seed",
        "activated_at": "2026-01-15 10:00:00",
    },
    {
        "version_id": 3,
        "year": 2026,
        "quarter": 2,
        "status": "draft",
        "source": "seed",
        "activated_at": None,
    },
]


# Hub locations get a 2x value multiplier so BTC percentages favour them.
HUB_LOCATIONS = frozenset({
    "cl-de-muc", "cl-de-stg",
    "cl-fr-lyo", "cl-fr-par",
    "cl-uk-lon",
    "cl-us-det",
    "cl-in-pun",
    "cl-cn-sha",
    "cl-jp-tok",
})


def _value_for(s_code: str, year: int, quarter: int, loc_id: str, idx: int) -> int:
    """Compute a deterministic **integer** UM value for one cell per [F-UM-01].

    Uses a seeded ``random.Random`` keyed on ``(s_code, year, quarter)`` so the
    sequence is reproducible. Within a batch each location gets a draw from
    Uniform(8, 80); hub locations carry a 2.0× multiplier so flagship cells
    skew toward DE-MUC, UK-LON etc.

    Year-over-year drift: the 2026 batch advances the seed slightly so that
    percentages shift between 2025 and 2026 (visible in the BTC year-rollover
    UI). Magnitude order remains preserved (hubs still dominate).

    Values are integers per [F-UM-01] (the consolidator pre-multiplies metrics
    to remove decimals); ``max(1, ...)`` guarantees a non-zero cell so the
    sparse-storage invariant (``ck_um_cell_nonzero``) is never tripped by
    rounding a small draw to 0.
    """
    rng = random.Random(f"um|{s_code}|{year}|{quarter}|seed-v5")
    # Fast-forward the rng to position ``idx`` so per-loc sampling is stable
    # regardless of iteration order in the caller.
    for _ in range(idx):
        rng.random()
    base = rng.uniform(8.0, 80.0)
    multiplier = 2.0 if loc_id in HUB_LOCATIONS else 1.0
    drift = 1.0 + (year - 2025) * rng.uniform(-0.05, 0.10)
    return max(1, round(base * multiplier * drift))


def _build_um_cells() -> list[dict]:
    """Materialise all UM cells deterministically.

    ``year``/``quarter`` are kept on the cell dict for the read-only helpers
    (``cells_for`` / ``percentages_for`` / ``total_value``) consumed by
    s09_btc; the persisted cell row carries only ``version_id`` + ``value``
    (year/quarter/source/activation live on the UMVersion header).
    """
    out: list[dict] = []
    for batch in UM_BATCHES:
        for s_code, locs in S_CODE_LOCS:
            if batch["status"] == "draft" and s_code not in _DRAFT_S_CODES:
                continue
            for idx, loc_id in enumerate(locs):
                out.append(
                    {
                        "version_id": batch["version_id"],
                        "year": batch["year"],
                        "quarter": batch["quarter"],
                        "s_code": s_code,
                        "charging_location_id": loc_id,
                        "value": _value_for(
                            s_code, batch["year"], batch["quarter"], loc_id, idx,
                        ),
                    }
                )
    return out


UM_CELLS: list[dict] = _build_um_cells()


def cells_for(s_code: str, year: int, quarter: int) -> list[dict]:
    """Return all UM cells for one (s_code, year, quarter) batch."""
    return [
        c for c in UM_CELLS
        if c["s_code"] == s_code and c["year"] == year and c["quarter"] == quarter
    ]


def total_value(s_code: str, year: int, quarter: int) -> float:
    """Return the total UM value across all locations for one batch."""
    return float(sum(c["value"] for c in cells_for(s_code, year, quarter)))


def percentages_for(
    s_code: str, year: int, quarter: int,
) -> list[tuple[str, float]]:
    """Return ``[(charging_location_id, percentage), ...]`` for an automatic BTC profile.

    Mirrors ``services.btc_service.compute_um_snapshot``:
      * raw percentages = (value / total) × 100 rounded to 2 decimals
      * sum normalised to exactly 100.00 by adding the residual to the first row
      * preserves the same charging-location ordering as the UM cells (sorted)

    Empty result if no cells exist for the given batch (caller guards against this).
    """
    cells = cells_for(s_code, year, quarter)
    if not cells:
        return []
    total = float(sum(c["value"] for c in cells))
    if total <= 0:
        return []

    pcts: list[tuple[str, float]] = [
        (c["charging_location_id"], round(c["value"] / total * 100.0, 2))
        for c in cells
    ]
    # Normalise sum to exactly 100.00 by adjusting the first row with residual.
    sum_pct = round(sum(p for _, p in pcts), 2)
    if pcts and abs(sum_pct - 100.0) > 0:
        residual = round(100.0 - sum_pct, 2)
        first_loc, first_pct = pcts[0]
        pcts[0] = (first_loc, round(first_pct + residual, 2))
    return pcts
