"""Stage 1 distribution graph (inter-service edges).

Owned by Phase 2 T1 (charging). Per ``[F-S1-01..05]``:

- Sparse storage: one row per actually-flowing edge between two
  ChargeableEntities. The ``to_business`` share lives on
  ``ChargeableEntity.to_business_pct`` (already encoded in
  ``config/entities.py``) and is *not* an edge here.
- Sum rule: for every source entity,
  ``to_business_pct + Σ(distribute %) ≤ 100``. The residual is
  *self-retained* (cost stays on the entity).
- No self-loops; cycle detection at the service layer rejects circular
  graphs. The seed graph below is acyclic by construction.
- Multi-step path requirement (Cluster F upstream-chain demo per
  ``[F-RV-04]``):
      ``svc-infra-platform`` → ``svc-data-platform`` →
      ``off-bizinsights`` → To-Business (via off-bizinsights.to_business_pct)
- Self-retained residual demonstrators per the plan doc:
      ``svc-ident-auth``  10% self-retained (90% distributed)
      ``svc-monitoring``  10% self-retained (90% distributed)

Flagship narrative (Master Data Hub, off-mdh / S042):
  Upstream feeders: svc-ident-auth (30%), svc-infra-platform (18%),
                    proj-iam-run (12%); + indirect via svc-data-platform.
  Downstream:       svc-data-stewardship (5%); To-Business 95%.

Year/version: every edge below is for ``year=2026, version='forecast'``.
Scenario forks are created lazily by Cluster B's lever-12 engine and never
seeded directly.

The seed totals 39 edges across 16 source entities (12 internal services,
1 offering, 2 Run-stage projects, 1 service that retains 100% — counted
implicitly by absence of edges).
"""
from __future__ import annotations

# ---------------------------------------------------------------------------
# Master data: every edge is { source, destination, percentage, year, version }.
# Order is significant for SQL determinism: groups sorted by source id, then by
# destination id within each group.
# ---------------------------------------------------------------------------
STAGE1_EDGES: list[dict] = [
    # --- off-mdh: 5% downstream (95% to-Business via to_business_pct on entity)
    {"source": "off-mdh",            "destination": "svc-data-stewardship", "percentage": 5.0,  "year": 2026, "version": "forecast"},

    # --- proj-cloud3-run: cloud platform Run feeds platform-tier services
    {"source": "proj-cloud3-run",    "destination": "svc-data-platform",    "percentage": 30.0, "year": 2026, "version": "forecast"},
    {"source": "proj-cloud3-run",    "destination": "svc-infra-platform",   "percentage": 50.0, "year": 2026, "version": "forecast"},
    {"source": "proj-cloud3-run",    "destination": "svc-monitoring",       "percentage": 20.0, "year": 2026, "version": "forecast"},

    # --- proj-iam-run: IAM Run feeds the Identity service + flagship offering
    {"source": "proj-iam-run",       "destination": "off-ecollab",          "percentage": 10.0, "year": 2026, "version": "forecast"},
    {"source": "proj-iam-run",       "destination": "off-eunify",           "percentage": 18.0, "year": 2026, "version": "forecast"},
    {"source": "proj-iam-run",       "destination": "off-mdh",              "percentage": 12.0, "year": 2026, "version": "forecast"},
    {"source": "proj-iam-run",       "destination": "svc-ident-auth",       "percentage": 60.0, "year": 2026, "version": "forecast"},

    # --- svc-data-platform: middle node on the multi-step path
    {"source": "svc-data-platform",  "destination": "off-bizinsights",      "percentage": 72.0, "year": 2026, "version": "forecast"},
    {"source": "svc-data-platform",  "destination": "off-mdh",              "percentage":  8.0, "year": 2026, "version": "forecast"},
    {"source": "svc-data-platform",  "destination": "off-supplyvis",        "percentage": 20.0, "year": 2026, "version": "forecast"},

    # --- svc-data-stewardship: downstream of off-mdh, redistributes
    {"source": "svc-data-stewardship", "destination": "off-bizinsights",    "percentage": 70.0, "year": 2026, "version": "forecast"},
    {"source": "svc-data-stewardship", "destination": "off-supplyvis",      "percentage": 30.0, "year": 2026, "version": "forecast"},

    # --- svc-dba: database administration
    {"source": "svc-dba",            "destination": "off-bizinsights",      "percentage": 70.0, "year": 2026, "version": "forecast"},
    {"source": "svc-dba",            "destination": "off-eunify",           "percentage": 30.0, "year": 2026, "version": "forecast"},

    # --- svc-devsec-tools
    {"source": "svc-devsec-tools",   "destination": "off-bizinsights",      "percentage": 100.0,"year": 2026, "version": "forecast"},

    # --- svc-euc-support
    {"source": "svc-euc-support",    "destination": "off-ecollab",          "percentage": 40.0, "year": 2026, "version": "forecast"},
    {"source": "svc-euc-support",    "destination": "off-eunify",           "percentage": 60.0, "year": 2026, "version": "forecast"},

    # --- svc-ident-auth (10% self-retained — sum 90)
    {"source": "svc-ident-auth",     "destination": "off-bizinsights",      "percentage": 15.0, "year": 2026, "version": "forecast"},
    {"source": "svc-ident-auth",     "destination": "off-ecollab",          "percentage": 20.0, "year": 2026, "version": "forecast"},
    {"source": "svc-ident-auth",     "destination": "off-eunify",           "percentage": 25.0, "year": 2026, "version": "forecast"},
    {"source": "svc-ident-auth",     "destination": "off-mdh",              "percentage": 30.0, "year": 2026, "version": "forecast"},

    # --- svc-infra-platform (multi-step source — feeds data-platform)
    {"source": "svc-infra-platform", "destination": "off-ecollab",          "percentage": 20.0, "year": 2026, "version": "forecast"},
    {"source": "svc-infra-platform", "destination": "off-eunify",           "percentage": 25.0, "year": 2026, "version": "forecast"},
    {"source": "svc-infra-platform", "destination": "off-mdh",              "percentage": 18.0, "year": 2026, "version": "forecast"},
    {"source": "svc-infra-platform", "destination": "svc-data-platform",    "percentage": 22.0, "year": 2026, "version": "forecast"},
    {"source": "svc-infra-platform", "destination": "svc-monitoring",       "percentage": 15.0, "year": 2026, "version": "forecast"},

    # --- svc-iot-infra: IoT focused
    {"source": "svc-iot-infra",      "destination": "off-supplyvis",        "percentage": 100.0,"year": 2026, "version": "forecast"},

    # --- svc-itsm: ticketing platform
    {"source": "svc-itsm",           "destination": "off-ecollab",          "percentage": 40.0, "year": 2026, "version": "forecast"},
    {"source": "svc-itsm",           "destination": "off-eunify",           "percentage": 60.0, "year": 2026, "version": "forecast"},

    # --- svc-middleware
    {"source": "svc-middleware",     "destination": "off-bizinsights",      "percentage": 50.0, "year": 2026, "version": "forecast"},
    {"source": "svc-middleware",     "destination": "off-eunify",           "percentage": 50.0, "year": 2026, "version": "forecast"},

    # --- svc-monitoring (10% self-retained — sum 90)
    {"source": "svc-monitoring",     "destination": "off-bizinsights",      "percentage": 50.0, "year": 2026, "version": "forecast"},
    {"source": "svc-monitoring",     "destination": "off-eunify",           "percentage": 40.0, "year": 2026, "version": "forecast"},

    # --- svc-net-sec
    {"source": "svc-net-sec",        "destination": "off-bizinsights",      "percentage": 30.0, "year": 2026, "version": "forecast"},
    {"source": "svc-net-sec",        "destination": "off-ecollab",          "percentage": 20.0, "year": 2026, "version": "forecast"},
    {"source": "svc-net-sec",        "destination": "off-eunify",           "percentage": 50.0, "year": 2026, "version": "forecast"},

    # --- svc-sap-basis: feeds the SAP-based offerings
    {"source": "svc-sap-basis",      "destination": "off-ecollab",          "percentage": 40.0, "year": 2026, "version": "forecast"},
    {"source": "svc-sap-basis",      "destination": "off-eunify",           "percentage": 60.0, "year": 2026, "version": "forecast"},
]


# ---------------------------------------------------------------------------
# to_business_pct overrides per source entity.
#
# Empty by design: the per-entity to_business_pct is already encoded in
# ``config/entities.py`` and emitted by ``s06_chargeable_entities`` directly.
# The sum-rule check uses those values; no UPDATE is necessary at this stage.
#
# Kept here for future plan-doc tweaks where a Stage 1 distribution edit also
# requires nudging the entity's to_business share without re-emitting s06.
# ---------------------------------------------------------------------------
TO_BUSINESS_OVERRIDES: list[dict] = []


def edges_for_source(source_id: str) -> list[dict]:
    """Return the ordered list of distribution edges for one source entity."""
    return [e for e in STAGE1_EDGES if e["source"] == source_id]


def all_source_ids() -> list[str]:
    """Return the deterministic set of source ids appearing in STAGE1_EDGES."""
    return sorted({e["source"] for e in STAGE1_EDGES})
