"""Stage 8 — Stage 1 distribution versions + edges.

Per ``[F-S1-01..05]`` and the Charging/UM rework cluster FD-3 (spec §4):

- ``distribution_versions`` is the new effective-dated header table replacing
  the v4 row-column ``Distribution.version`` string. Mirrors the FD-1
  ``UMVersion`` pattern: draft is editable, active is frozen and immutable.
- Two production versions seeded (both ``scenario_id=NULL``):
    v1 — id=1, active_from='2025-01-01', status='active', origin='seed',
         rationale='Initial seed distribution'. Every Stage 1 edge below
         FKs into this version.
    v2 — id=2, active_from=NULL, status='draft', origin='copy_active',
         copied_from_version_id=1, rationale=''. Empty draft — surfaces the
         prepare-ahead affordance in the demo.
- Scenario versions (``scenario_id IS NOT NULL``, permanent draft) are NOT
  seeded; the lever-12 service eager-creates them on first mutation.
- One row per actually-flowing edge (sparse storage). Edges reference v1 via
  ``version_id`` FK. Cadence-agnostic per [F-S1-02] — no ``year`` column on
  edges; the year axis lives on the cost being distributed.
- Per-edge ``rationale`` (Text NULL per `[F-S1-05]`) is NULL in seed — the
  UI nudges for a value on subsequent edits.
- Sum-rule per source: ``to_business_pct + Σ(distribute %) ≤ 100``. The
  per-entity ``to_business_pct`` is on ``chargeable_entities`` (emitted in
  s06); this stage emits only the version headers and edges.
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
    DISTRIBUTION_VERSIONS,
    STAGE1_EDGES,
    TO_BUSINESS_OVERRIDES,
)


def _sorted_edges() -> list[dict]:
    """Edges sorted by (version_id, source, destination) for stable output."""
    return sorted(
        STAGE1_EDGES,
        key=lambda e: (e["version_id"], e["source"], e["destination"]),
    )


def _sql_or_null(value) -> str:
    """Render a value as SQL: quoted string, NULL for None, or int as-is."""
    if value is None:
        return "NULL"
    if isinstance(value, int) and not isinstance(value, bool):
        return str(value)
    return sql_str(str(value))


def _version_row_sql(v: dict) -> str:
    return (
        f"({v['id']}, {_sql_or_null(v['active_from'])}, "
        f"{sql_str(v['status'])}, {sql_str(v['rationale'])}, "
        f"{sql_str(v['origin'])}, {_sql_or_null(v['copied_from_version_id'])}, "
        f"{_sql_or_null(v['scenario_id'])}, '{CREATED_AT}', NULL, "
        f"{_sql_or_null(v['activated_at'])})"
    )


def _edge_row_sql(e: dict) -> str:
    return (
        f"({e['version_id']}, {sql_str(e['source'])}, "
        f"{sql_str(e['destination'])}, {e['percentage']}, NULL, "
        f"'{CREATED_AT}', '{CREATED_AT}')"
    )


def generate() -> str:
    lines: list[str] = []

    lines.append("-- =============================================================================")
    lines.append("-- s08_distribution / Stage 1 versions + edges [F-S1-01..05]  (FD-3 effective-dated rework)")
    lines.append(
        f"-- {len(DISTRIBUTION_VERSIONS)} version headers, "
        f"{len(STAGE1_EDGES)} edges (all FK'd into v1 / id=1)."
    )
    for v in DISTRIBUTION_VERSIONS:
        lines.append(
            f"--   v{v['id']} active_from={v['active_from']} status={v['status']} "
            f"origin={v['origin']} copied_from={v['copied_from_version_id']} "
            f"scenario_id={v['scenario_id']}"
        )
    lines.append("-- Sparse storage: only flowing edges; self-retained = 100 - to_business - Σ(out%).")
    lines.append("-- Multi-step path: svc-infra-platform → svc-data-platform → off-bizinsights → To-Business.")
    lines.append("-- =============================================================================")
    lines.append("")

    # DistributionVersion header rows first so distributions.version_id FK resolves.
    lines.append(
        "INSERT INTO distribution_versions (id, active_from, status, "
        "rationale, origin, copied_from_version_id, scenario_id, created_at, "
        "created_by_person_id, activated_at) VALUES"
    )
    lines.append(
        ",\n".join(_version_row_sql(v) for v in DISTRIBUTION_VERSIONS) + ";"
    )
    lines.append("")

    lines.append(
        "INSERT INTO distributions (version_id, source_entity_id, "
        "destination_entity_id, percentage, rationale, created_at, "
        "modified_at) VALUES"
    )
    lines.append(
        ",\n".join(_edge_row_sql(e) for e in _sorted_edges()) + ";"
    )
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
