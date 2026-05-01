"""Stage 8 — Stage 1 distribution edges (the ``distributions`` table).

Per ``[F-S1-01..05]``:
- One row per actually-flowing edge (sparse storage).
- ``year=2026, version='forecast'`` for every row in the demo seed; the
  ``baseline`` and ``actuals`` versions are not seeded (Cluster F's
  service-layer cycle creates them lazily as cycles run).
- Sum-rule per source: ``to_business_pct + Σ(distribute %) ≤ 100``. The
  per-entity ``to_business_pct`` is on ``chargeable_entities`` (emitted in
  s06); this stage emits only the edge rows.
- ``schema check`` enforces non-zero, ≤100% percentages and no self-loops.

The flagship narrative (Master Data Hub) is encoded entirely via these edges
plus the ``off-mdh.to_business_pct=95`` already on the entity row:

    proj-cloud3-run ──50%──▶ svc-infra-platform ──22%──▶ svc-data-platform
                                  │                          │
                                  │ 18%                      │ 20%
                                  ▼                          ▼
                              ┌────────┐                 ┌────────┐
       proj-iam-run ─12%─▶    │ off-mdh│ ─5%─▶ svc-data-stewardship
                              └────────┘
                                  │
                                  │ 95% (to_business_pct on entity row)
                                  ▼
                                Business

       svc-ident-auth ─30%─▶ off-mdh        (10% self-retained)
       svc-monitoring ─50%─▶ off-bizinsights (10% self-retained)
"""
from __future__ import annotations

from _utils import sql_str
from generate_seed_v5.config.branding import CREATED_AT
from generate_seed_v5.config.distribution import (
    STAGE1_EDGES,
    TO_BUSINESS_OVERRIDES,
)


def _sorted_edges() -> list[dict]:
    """Edges sorted by (year, version, source, destination) for stable output."""
    return sorted(
        STAGE1_EDGES,
        key=lambda e: (
            e["year"], e["version"], e["source"], e["destination"],
        ),
    )


def generate() -> str:
    lines: list[str] = []

    lines.append("-- =============================================================================")
    lines.append("-- s08_distribution / Stage 1 distribution edges [F-S1-01..05]")
    lines.append(
        f"-- {len(STAGE1_EDGES)} edges total, year=2026, version='forecast'."
    )
    lines.append("-- Sparse storage: only flowing edges; self-retained = 100 - to_business - Σ(out%).")
    lines.append("-- Multi-step path: svc-infra-platform → svc-data-platform → off-bizinsights → To-Business.")
    lines.append("-- =============================================================================")
    lines.append("")
    lines.append(
        "INSERT INTO distributions (year, version, source_entity_id, "
        "destination_entity_id, percentage, created_at, modified_at) VALUES"
    )

    rows: list[str] = []
    for e in _sorted_edges():
        rows.append(
            f"({e['year']}, {sql_str(e['version'])}, {sql_str(e['source'])}, "
            f"{sql_str(e['destination'])}, {e['percentage']}, "
            f"'{CREATED_AT}', '{CREATED_AT}')"
        )
    lines.append(",\n".join(rows) + ";")
    lines.append("")

    # Optional to_business_pct overrides (kept empty by design — entities.py
    # already encodes the per-entity to_business share).
    if TO_BUSINESS_OVERRIDES:
        lines.append("-- to_business_pct overrides (per-entity post-edge tuning).")
        for o in sorted(TO_BUSINESS_OVERRIDES, key=lambda x: x["entity_id"]):
            lines.append(
                f"UPDATE chargeable_entities SET to_business_pct = "
                f"{o['to_business_pct']} WHERE id = {sql_str(o['entity_id'])};"
            )
        lines.append("")

    # Sanity-check sums per source — emitted as a SQL comment for human review.
    lines.append(
        "-- Sum-rule check (informational): for every source entity,"
    )
    lines.append(
        "--   Σ(distribution.percentage WHERE source=...) + chargeable_entities.to_business_pct ≤ 100."
    )
    by_source: dict[str, float] = {}
    for e in STAGE1_EDGES:
        by_source[e["source"]] = by_source.get(e["source"], 0.0) + float(e["percentage"])
    for src in sorted(by_source):
        lines.append(f"--   {src}: Σ(out)={by_source[src]:.2f}%")

    return "\n".join(lines) + "\n"
