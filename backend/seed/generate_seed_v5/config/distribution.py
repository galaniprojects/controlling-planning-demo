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

Versioning (Charging/UM rework cluster FD-3, spec §4 ``[F-S1-02..04]``):
The v4 row-column ``Distribution.version`` string is replaced by a first-class
effective-dated header (``DistributionVersion``). Seed emits two production
versions to surface the FD-3 prepare-ahead affordance in the demo:

  v1 — ``id=1``, ``active_from='2025-01-01'``, ``status='active'``,
       ``origin='seed'``, ``rationale='Initial seed distribution'``, all
       seeded edges below FK into this version.
  v2 — ``id=2``, ``active_from=NULL``, ``status='draft'``,
       ``origin='copy_active'``, ``copied_from_version_id=1``,
       ``rationale=''``. Empty draft (no edges); surfaces the
       "prepare-ahead" affordance for the controller authoring flow.

Cadence-agnostic per [F-S1-02]: there is no ``year`` on edges (the year
axis lives on the cost being distributed, not on the Stage 1 graph).
Scenario forks are created lazily by Cluster B's lever-12 engine and never
seeded directly — they live as ``DistributionVersion`` rows with
``scenario_id IS NOT NULL`` and stay in draft.

The seed totals 39 edges across 16 source entities (12 internal services,
1 offering, 2 Run-stage projects, 1 service that retains 100% — counted
implicitly by absence of edges).
"""
from __future__ import annotations

# ---------------------------------------------------------------------------
# Distribution version headers (FD-3, [F-S1-02..04]).
#
# Two production versions emitted; both have ``scenario_id=NULL``.
#
#   v1: the active production version every seeded edge FKs into. ``origin='seed'``
#       and ``active_from='2025-01-01'`` so the production resolver picks it
#       for any demo date ≥ 2025-01-01 (demo date = April 2026).
#   v2: an empty draft copy surfacing the prepare-ahead affordance — controller
#       can edit, add new edges, and activate to retire v1 in the demo
#       narrative. No edges initially.
#
# Scenario versions (status='draft', scenario_id IS NOT NULL) are NOT seeded —
# they are eager-created by the lever-12 service on first mutation per
# ``[F-S1-02]``.
# ---------------------------------------------------------------------------
DISTRIBUTION_VERSIONS: list[dict] = [
    {
        "id": 1,
        "active_from": "2025-01-01",
        "status": "active",
        "rationale": "Initial seed distribution",
        "origin": "seed",
        "copied_from_version_id": None,
        "scenario_id": None,
        "activated_at": "2025-01-01 00:00:00",
    },
    {
        "id": 2,
        "active_from": None,
        "status": "draft",
        "rationale": "",
        "origin": "blank",
        "copied_from_version_id": None,
        "scenario_id": None,
        "activated_at": None,
    },
]

# Active production version id every seeded edge points at — kept as a single
# source of truth so generators don't need to re-derive it.
ACTIVE_VERSION_ID: int = 1


# ---------------------------------------------------------------------------
# Master data: every edge is { source, destination, percentage, version_id }.
# Cadence-agnostic per [F-S1-02] — no year on edges (the year axis lives on
# the cost being distributed). Per-edge rationale (``[F-S1-05]``) is NULL in
# seed; UI nudges for a value on subsequent edits.
#
# Order is significant for SQL determinism: groups sorted by source id, then by
# destination id within each group.
# ---------------------------------------------------------------------------
STAGE1_EDGES: list[dict] = [
    # --- off-mdh: 5% downstream (95% to-Business via to_business_pct on entity)
    {"source": "off-mdh",            "destination": "svc-data-stewardship", "percentage": 5.0,  "version_id": 1},

    # --- proj-cloud3-run: cloud platform Run feeds platform-tier services
    {"source": "proj-cloud3-run",    "destination": "svc-data-platform",    "percentage": 30.0, "version_id": 1},
    {"source": "proj-cloud3-run",    "destination": "svc-infra-platform",   "percentage": 50.0, "version_id": 1},
    {"source": "proj-cloud3-run",    "destination": "svc-monitoring",       "percentage": 20.0, "version_id": 1},

    # --- proj-iam-run: IAM Run feeds the Identity service + flagship offering
    {"source": "proj-iam-run",       "destination": "off-ecollab",          "percentage": 10.0, "version_id": 1},
    {"source": "proj-iam-run",       "destination": "off-eunify",           "percentage": 18.0, "version_id": 1},
    {"source": "proj-iam-run",       "destination": "off-mdh",              "percentage": 12.0, "version_id": 1},
    {"source": "proj-iam-run",       "destination": "svc-ident-auth",       "percentage": 60.0, "version_id": 1},

    # --- svc-data-platform: middle node on the multi-step path
    {"source": "svc-data-platform",  "destination": "off-bizinsights",      "percentage": 72.0, "version_id": 1},
    {"source": "svc-data-platform",  "destination": "off-mdh",              "percentage":  8.0, "version_id": 1},
    {"source": "svc-data-platform",  "destination": "off-supplyvis",        "percentage": 20.0, "version_id": 1},

    # --- svc-data-stewardship: downstream of off-mdh, redistributes
    {"source": "svc-data-stewardship", "destination": "off-bizinsights",    "percentage": 70.0, "version_id": 1},
    {"source": "svc-data-stewardship", "destination": "off-supplyvis",      "percentage": 30.0, "version_id": 1},

    # --- svc-dba: database administration
    {"source": "svc-dba",            "destination": "off-bizinsights",      "percentage": 70.0, "version_id": 1},
    {"source": "svc-dba",            "destination": "off-eunify",           "percentage": 30.0, "version_id": 1},

    # --- svc-devsec-tools
    {"source": "svc-devsec-tools",   "destination": "off-bizinsights",      "percentage": 100.0,"version_id": 1},

    # --- svc-euc-support
    {"source": "svc-euc-support",    "destination": "off-ecollab",          "percentage": 40.0, "version_id": 1},
    {"source": "svc-euc-support",    "destination": "off-eunify",           "percentage": 60.0, "version_id": 1},

    # --- svc-ident-auth (10% self-retained — sum 90)
    {"source": "svc-ident-auth",     "destination": "off-bizinsights",      "percentage": 15.0, "version_id": 1},
    {"source": "svc-ident-auth",     "destination": "off-ecollab",          "percentage": 20.0, "version_id": 1},
    {"source": "svc-ident-auth",     "destination": "off-eunify",           "percentage": 25.0, "version_id": 1},
    {"source": "svc-ident-auth",     "destination": "off-mdh",              "percentage": 30.0, "version_id": 1},

    # --- svc-infra-platform (multi-step source — feeds data-platform)
    {"source": "svc-infra-platform", "destination": "off-ecollab",          "percentage": 20.0, "version_id": 1},
    {"source": "svc-infra-platform", "destination": "off-eunify",           "percentage": 25.0, "version_id": 1},
    {"source": "svc-infra-platform", "destination": "off-mdh",              "percentage": 18.0, "version_id": 1},
    {"source": "svc-infra-platform", "destination": "svc-data-platform",    "percentage": 22.0, "version_id": 1},
    {"source": "svc-infra-platform", "destination": "svc-monitoring",       "percentage": 15.0, "version_id": 1},

    # --- svc-iot-infra: IoT focused
    {"source": "svc-iot-infra",      "destination": "off-supplyvis",        "percentage": 100.0,"version_id": 1},

    # --- svc-itsm: ticketing platform
    {"source": "svc-itsm",           "destination": "off-ecollab",          "percentage": 40.0, "version_id": 1},
    {"source": "svc-itsm",           "destination": "off-eunify",           "percentage": 60.0, "version_id": 1},

    # --- svc-middleware
    {"source": "svc-middleware",     "destination": "off-bizinsights",      "percentage": 50.0, "version_id": 1},
    {"source": "svc-middleware",     "destination": "off-eunify",           "percentage": 50.0, "version_id": 1},

    # --- svc-monitoring (10% self-retained — sum 90)
    {"source": "svc-monitoring",     "destination": "off-bizinsights",      "percentage": 50.0, "version_id": 1},
    {"source": "svc-monitoring",     "destination": "off-eunify",           "percentage": 40.0, "version_id": 1},

    # --- svc-net-sec
    {"source": "svc-net-sec",        "destination": "off-bizinsights",      "percentage": 30.0, "version_id": 1},
    {"source": "svc-net-sec",        "destination": "off-ecollab",          "percentage": 20.0, "version_id": 1},
    {"source": "svc-net-sec",        "destination": "off-eunify",           "percentage": 50.0, "version_id": 1},

    # --- svc-sap-basis: feeds the SAP-based offerings
    {"source": "svc-sap-basis",      "destination": "off-ecollab",          "percentage": 40.0, "version_id": 1},
    {"source": "svc-sap-basis",      "destination": "off-eunify",           "percentage": 60.0, "version_id": 1},
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
