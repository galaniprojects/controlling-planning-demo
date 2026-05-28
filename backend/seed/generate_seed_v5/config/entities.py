"""FROZEN ChargeableEntity roster — the load-bearing artefact for v5 S1.

THIS FILE IS FROZEN AT END OF PHASE 1. Phase 2 teammates (T1 charging stack,
T2 financials/lifecycle, T3 scenarios/workflow) consume it as read-only.

Identifier formats per [F-DM-01] and ``schemas/chargeable_entity.py``:
- Project          → ``IT0<5 digits>`` (e.g. IT012001)
- Offering         → ``IT00S<3 digits>`` (e.g. IT00S042)
- InternalService  → ``ITF<5 digits>``  (e.g. ITF20011)

WBS is derived algorithmically from the identifier per [F-DM-03]; never stored.

The entity counts (per [F-DG-03]):
- 11 projects (9 Change-stage projects across DoI 0–3 + 2 Run-stage projects at DoI 5)
- 6 offerings (Master Data Hub flagship + 5 supporting)
- 17 internal services

Total: 34 chargeable entities.

Hierarchy mappings reference the IDs declared in ``config/master.py`` and
emitted by ``s02_grouping_entities``:
LoB roots: ``he-tbs``, ``he-rvs``, ``he-cit``, ``he-dnd``.
Tier-2 program children: ``he-tbs-prog-dbp``, ``he-tbs-prog-fleet``,
``he-rvs-prog-rail``, ``he-cit-prog-infra``, ``he-dnd-prog-data``.
"""
from __future__ import annotations

# ---------------------------------------------------------------------------
# 11 Projects — 9 Change-stage (DoI 0–3) + 2 Run-stage (DoI 5).
#
# Fields:
#   id              v5-style python id; underlying Project.id and ChargeableEntity.id share this value
#   identifier      WBS-derivation source (IT0NNNNN)
#   name            display
#   pl_id           project lead persona (Person.id)
#   hierarchy_id    GroupingEntity.id assignment (LoB or program-level)
#   tshirt          XS/S/M/L/XL — also drives total_budget for non-Run projects
#   total_budget    EUR (None for Run-stage; use annual_cost there)
#   annual_cost     EUR/yr (only for Run-stage projects + supplements steady-state)
#   capex_opex      'capex' | 'opex'
#   start_month     YYYY-MM
#   end_month       YYYY-MM (None for Run-stage)
#   rag_status      'green' | 'amber' | 'red' | None
#   v4_status       legacy projects.status enum value (for FK compatibility with Cluster A wiring)
#   to_business_pct Stage 2 input — 0 for Change-stage; varies for Run
#   responsible_id  responsible_person_id on ChargeableEntity (defaults to pl_id when None)
# ---------------------------------------------------------------------------
PROJECTS: list[dict] = [
    {
        "id": "proj-mdh-rollout",
        "identifier": "IT012001",
        "name": "Master Data Hub Rollout",
        "pl_id": "p-sharma",
        "hierarchy_id": "he-dnd",
        "tshirt": "M",
        "total_budget": 880000,
        "annual_cost": None,
        "capex_opex": "capex",
        "start_month": "2025-10",
        "end_month": "2026-12",
        "rag_status": "green",
        "v4_status": "active",
        "to_business_pct": 0,
        "responsible_id": "p-sharma",
        "narrative": "Implements the flagship Master Data Hub offering (off-mdh / S042).",
    },
    {
        "id": "proj-erp2",
        "identifier": "IT012345",
        "name": "ERP Integration Phase 2",
        "pl_id": "p-sharma",
        "hierarchy_id": "he-tbs-prog-dbp",
        "tshirt": "L",
        "total_budget": 1810000,
        "annual_cost": None,
        "capex_opex": "capex",
        "start_month": "2024-07",
        "end_month": "2026-09",
        "rag_status": "red",
        "v4_status": "active",
        "to_business_pct": 0,
        "responsible_id": "p-sharma",
        "narrative": "Drives Anna's CR queue (red, scope-creep).",
    },
    {
        "id": "proj-sensor",
        "identifier": "IT013477",
        "name": "Sensor Data Pipeline",
        "pl_id": "p-sharma",
        "hierarchy_id": "he-tbs-prog-fleet",
        "tshirt": "M",
        "total_budget": 720000,
        "annual_cost": None,
        "capex_opex": "capex",
        "start_month": "2025-03",
        "end_month": "2026-12",
        "rag_status": "amber",
        "v4_status": "active",
        "to_business_pct": 0,
        "responsible_id": "p-sharma",
        "narrative": "Fleet IoT data pipeline; burn-rate anomaly.",
    },
    {
        "id": "proj-predmaint",
        "identifier": "IT014821",
        "name": "Predictive Maintenance PoC",
        "pl_id": "p-sharma",
        "hierarchy_id": "he-rvs",
        "tshirt": "M",
        "total_budget": 510000,
        "annual_cost": None,
        "capex_opex": "capex",
        "start_month": "2025-06",
        "end_month": "2027-03",
        "rag_status": "amber",
        "v4_status": "active",
        "to_business_pct": 0,
        "responsible_id": "p-sharma",
        "narrative": "Scope-change pending; controller review queue.",
    },
    {
        "id": "proj-autobrake",
        "identifier": "IT015902",
        "name": "Autonomous Braking Prototype",
        "pl_id": "p-sharma",
        "hierarchy_id": "he-tbs",
        "tshirt": "M",
        "total_budget": 920000,
        "annual_cost": None,
        "capex_opex": "capex",
        "start_month": "2026-06",
        "end_month": "2027-12",
        "rag_status": None,
        "v4_status": "pending_cc_confirmation",
        "to_business_pct": 0,
        "responsible_id": "p-sharma",
        "narrative": "DoI 2 intake demo target.",
    },
    {
        "id": "proj-railsafety",
        "identifier": "IT016045",
        "name": "Rail Safety Compliance System",
        "pl_id": "p-weber",
        "hierarchy_id": "he-rvs",
        "tshirt": "M",
        "total_budget": 520000,
        "annual_cost": None,
        "capex_opex": "capex",
        "start_month": "2026-09",
        "end_month": "2028-06",
        "rag_status": "green",
        "v4_status": "planned",
        "to_business_pct": 0,
        "responsible_id": "p-weber",
        "narrative": "DoI 3 Approved — pipeline demo target.",
    },
    {
        "id": "proj-dwh",
        "identifier": "IT017210",
        "name": "Data Warehouse Consolidation",
        "pl_id": "p-weber",
        "hierarchy_id": "he-dnd",
        "tshirt": "S",
        "total_budget": 400000,
        "annual_cost": None,
        "capex_opex": "capex",
        "start_month": "2026-07",
        "end_month": "2027-09",
        "rag_status": "green",
        "v4_status": "planned",
        "to_business_pct": 0,
        "responsible_id": "p-weber",
        "narrative": "DoI 1 Under Evaluation — early pipeline.",
    },
    {
        "id": "proj-greenedge",
        "identifier": "IT018330",
        "name": "Green Edge Computing Pilot",
        "pl_id": "p-weber",
        "hierarchy_id": "he-cit",
        "tshirt": "XS",
        "total_budget": 28440,
        "annual_cost": None,
        "capex_opex": "capex",
        "start_month": "2026-11",
        "end_month": "2027-04",
        "rag_status": None,
        "v4_status": "draft",
        "to_business_pct": 0,
        "responsible_id": "p-weber",
        "narrative": "DoI 0 bottom-of-backlog — sustainability angle.",
    },
    {
        "id": "proj-connveh",
        "identifier": "IT019450",
        "name": "Connected Vehicle Platform",
        "pl_id": "p-weber",
        "hierarchy_id": "he-tbs",
        "tshirt": "L",
        "total_budget": 1150000,
        "annual_cost": None,
        "capex_opex": "capex",
        "start_month": "2026-10",
        "end_month": "2028-12",
        "rag_status": None,
        "v4_status": "draft",
        "to_business_pct": 0,
        "responsible_id": "p-weber",
        "narrative": "DoI 0 newest — XL T-shirt — capacity stress test.",
    },
    {
        "id": "proj-cloud3-run",
        "identifier": "IT011920",
        "name": "Cloud Platform Run",
        "pl_id": "p-brenner",
        "hierarchy_id": "he-cit-prog-infra",
        "tshirt": "M",
        "total_budget": None,
        "annual_cost": 240000,
        "capex_opex": "opex",
        "start_month": "2024-01",
        "end_month": None,
        "rag_status": "green",
        "v4_status": "active",
        "to_business_pct": 0,
        "responsible_id": "p-brenner",
        "narrative": "DoI 5 Operate — steady-state cloud platform.",
    },
    {
        "id": "proj-iam-run",
        "identifier": "IT011408",
        "name": "Identity & Access Management Run",
        "pl_id": "p-brenner",
        "hierarchy_id": "he-cit",
        "tshirt": "M",
        "total_budget": None,
        "annual_cost": 310000,
        "capex_opex": "opex",
        "start_month": "2024-01",
        "end_month": None,
        "rag_status": "green",
        "v4_status": "active",
        "to_business_pct": 0,
        "responsible_id": "p-brenner",
        "narrative": "DoI 5 Operate — feeds Master Data Hub 12% upstream.",
    },
]


# Project IDs the PL persona "owns" (drives PL filter and Launchpad action lists).
PL_OWNED_PROJECT_IDS: list[str] = [
    p["id"] for p in PROJECTS if p["pl_id"] == "p-sharma"
]


# ---------------------------------------------------------------------------
# 6 Offerings (the steady-state, customer-facing IT products).
#
# Fields:
#   id, identifier, name, hierarchy_id, responsible_id, btc_mode (manual|automatic),
#   s_code (only for automatic), annual_cost (EUR/yr), to_business_pct.
# ---------------------------------------------------------------------------
OFFERINGS: list[dict] = [
    {
        "id": "off-mdh",
        "identifier": "IT00S042",
        "name": "Master Data Hub",
        "hierarchy_id": "he-dnd",
        "responsible_id": "p-sharma",
        "btc_mode": "automatic",
        "s_code": "S042",
        "annual_cost": 2400000,
        "to_business_pct": 95,
        "narrative": "FLAGSHIP — automatic-mode BTC, upstream-from 2 services + 1 run project.",
    },
    {
        "id": "off-eunify",
        "identifier": "IT00S118",
        "name": "Enterprise Unified Workspace",
        "hierarchy_id": "he-cit",
        "responsible_id": "p-brenner",
        "btc_mode": "automatic",
        "s_code": "S118",
        "annual_cost": 980000,
        "to_business_pct": 90,
        "narrative": "Modern workplace bundle — automatic BTC.",
    },
    {
        "id": "off-bizinsights",
        "identifier": "IT00S067",
        "name": "Business Insights Platform",
        "hierarchy_id": "he-dnd",
        "responsible_id": "p-weber",
        "btc_mode": "automatic",
        "s_code": "S067",
        "annual_cost": 1600000,
        # Reduced 92 → 85 to make room for the 10% downstream edge
        # off-bizinsights → off-supplyvis that closes the diamond pattern
        # (§6.1, Wave C). Sum-rule: 85 to_business + 10 distribute = 95,
        # leaving 5% self-retained.
        "to_business_pct": 85,
        "narrative": "Analytics product — fed by svc-data-platform; closes the diamond pattern by also feeding off-supplyvis at 10%.",
    },
    {
        "id": "off-ecollab",
        "identifier": "IT00S210",
        "name": "Enterprise Collaboration Suite",
        "hierarchy_id": "he-cit",
        "responsible_id": "p-brenner",
        "btc_mode": "manual",
        "s_code": None,
        "annual_cost": 1200000,
        "to_business_pct": 88,
        "narrative": "Manual BTC — 10 charging locations.",
    },
    {
        "id": "off-fielddx",
        "identifier": "IT00S088",
        "name": "Field Diagnostics Service",
        "hierarchy_id": "he-tbs",
        "responsible_id": "p-weber",
        "btc_mode": "manual",
        "s_code": None,
        "annual_cost": 540000,
        "to_business_pct": 85,
        "narrative": "Manual BTC — 4 charging locations (truck telematics).",
    },
    {
        "id": "off-supplyvis",
        "identifier": "IT00S155",
        "name": "Supply Chain Visibility",
        "hierarchy_id": "he-tbs",
        "responsible_id": "p-weber",
        "btc_mode": "automatic",
        "s_code": "S155",
        "annual_cost": 720000,
        "to_business_pct": 80,
        "narrative": "Automatic BTC — supply-chain telemetry.",
    },
]


# ---------------------------------------------------------------------------
# 17 Internal services (ITF200xx). Internal services do not bill out to
# business; they distribute upstream to other entities. Most have manual BTC
# profiles (only used if/when they themselves expose to-business chargeback).
# ---------------------------------------------------------------------------
INTERNAL_SERVICES: list[dict] = [
    {"id": "svc-ident-auth",       "identifier": "ITF20011", "name": "Identity & Authentication Service",  "hierarchy_id": "he-cit",            "responsible_id": "p-brenner", "btc_mode": "manual",    "s_code": None,    "annual_cost": 620000, "to_business_pct": 0, "narrative": "Manual 3 lines — feeds Master Data Hub 30% upstream; 10% self-retained."},
    {"id": "svc-infra-platform",   "identifier": "ITF20012", "name": "Infrastructure Platform Service",     "hierarchy_id": "he-cit-prog-infra", "responsible_id": "p-brenner", "btc_mode": "manual",    "s_code": None,    "annual_cost": 1400000,"to_business_pct": 0, "narrative": "Manual 5 lines — feeds Master Data Hub 18% upstream."},
    {"id": "svc-data-stewardship", "identifier": "ITF20013", "name": "Data Stewardship Service",            "hierarchy_id": "he-dnd",            "responsible_id": "p-weber",   "btc_mode": "manual",    "s_code": None,    "annual_cost": 380000, "to_business_pct": 0, "narrative": "Manual 4 lines — downstream of MDH at 5%."},
    {"id": "svc-sap-basis",        "identifier": "ITF20014", "name": "SAP Basis Operations",                "hierarchy_id": "he-tbs",            "responsible_id": "p-brenner", "btc_mode": "automatic", "s_code": "S301",  "annual_cost": 420000, "to_business_pct": 0, "narrative": "Auto BTC."},
    {"id": "svc-euc-support",      "identifier": "ITF20015", "name": "End User Computing Support",          "hierarchy_id": "he-cit",            "responsible_id": "p-brenner", "btc_mode": "automatic", "s_code": "S312",  "annual_cost": 230000, "to_business_pct": 0, "narrative": "Auto BTC."},
    {"id": "svc-net-sec",          "identifier": "ITF20016", "name": "Network & Security Operations",       "hierarchy_id": "he-cit",            "responsible_id": "p-brenner", "btc_mode": "manual",    "s_code": None,    "annual_cost": 410000, "to_business_pct": 0, "narrative": "Manual 6 lines."},
    {"id": "svc-middleware",       "identifier": "ITF20017", "name": "Enterprise Middleware",               "hierarchy_id": "he-cit",            "responsible_id": "p-brenner", "btc_mode": "manual",    "s_code": None,    "annual_cost": 290000, "to_business_pct": 0, "narrative": "Manual 4 lines."},
    {"id": "svc-dba",              "identifier": "ITF20018", "name": "Database Administration",             "hierarchy_id": "he-cit",            "responsible_id": "p-brenner", "btc_mode": "manual",    "s_code": None,    "annual_cost": 190000, "to_business_pct": 0, "narrative": "Manual 3 lines."},
    {"id": "svc-rail-desk",        "identifier": "ITF20019", "name": "Rail IT Service Desk",                "hierarchy_id": "he-rvs",            "responsible_id": "p-weber",   "btc_mode": "manual",    "s_code": None,    "annual_cost": 260000, "to_business_pct": 0, "narrative": "Manual 3 lines."},
    {"id": "svc-rail-maint",       "identifier": "ITF20020", "name": "Rail Application Maintenance",        "hierarchy_id": "he-rvs",            "responsible_id": "p-weber",   "btc_mode": "automatic", "s_code": "S408",  "annual_cost": 310000, "to_business_pct": 0, "narrative": "Auto BTC."},
    {"id": "svc-signal-sup",       "identifier": "ITF20021", "name": "Signaling Systems Support",           "hierarchy_id": "he-rvs-prog-rail",  "responsible_id": "p-weber",   "btc_mode": "manual",    "s_code": None,    "annual_cost": 185000, "to_business_pct": 0, "narrative": "Manual 2 lines."},
    {"id": "svc-tbs-maint",        "identifier": "ITF20022", "name": "TBS Application Maintenance",         "hierarchy_id": "he-tbs",            "responsible_id": "p-weber",   "btc_mode": "automatic", "s_code": "S503",  "annual_cost": 295000, "to_business_pct": 0, "narrative": "Auto BTC."},
    {"id": "svc-data-platform",    "identifier": "ITF20023", "name": "Data Platform Operations",            "hierarchy_id": "he-dnd-prog-data",  "responsible_id": "p-weber",   "btc_mode": "manual",    "s_code": None,    "annual_cost": 100000, "to_business_pct": 0, "narrative": "Manual 4 lines — diamond apex: feeds off-bizinsights (72%) AND off-supplyvis (20%); the bizinsights→supplyvis edge creates a second path. Own-cost €100k chosen as a round number so memoization-fix deltas read cleanly in tile rollups + Allocation Flow amount labels."},
    {"id": "svc-iot-infra",        "identifier": "ITF20024", "name": "IoT Infrastructure Support",          "hierarchy_id": "he-dnd",            "responsible_id": "p-weber",   "btc_mode": "manual",    "s_code": None,    "annual_cost": 160000, "to_business_pct": 0, "narrative": "Manual 3 lines."},
    {"id": "svc-monitoring",       "identifier": "ITF20025", "name": "Application Monitoring Service",      "hierarchy_id": "he-cit",            "responsible_id": "p-brenner", "btc_mode": "manual",    "s_code": None,    "annual_cost": 210000, "to_business_pct": 0, "narrative": "Manual 2 lines — 10% self-retained."},
    {"id": "svc-itsm",             "identifier": "ITF20026", "name": "ITSM Platform Service",               "hierarchy_id": "he-cit",            "responsible_id": "p-brenner", "btc_mode": "automatic", "s_code": "S720",  "annual_cost": 175000, "to_business_pct": 0, "narrative": "Auto BTC."},
    {"id": "svc-devsec-tools",     "identifier": "ITF20027", "name": "DevSecOps Toolchain Service",         "hierarchy_id": "he-cit",            "responsible_id": "p-brenner", "btc_mode": "manual",    "s_code": None,    "annual_cost": 145000, "to_business_pct": 0, "narrative": "Manual 3 lines."},
]


# Allocation key per [F-AK-01] — the human-readable legend for what an
# internal service's raw UM integer means / how it was derived. Free-text
# with presets (FD-6 autocomplete); values intentionally repeat so the
# distinct-values helper has dedup to do, and two are ``None`` to prove the
# column is nullable and the helper filters empties. Keyed by service id.
ALLOCATION_KEYS: dict[str, str | None] = {
    "svc-ident-auth":       "Number of users",
    "svc-infra-platform":   "Number of users ×100 (decimal protection)",
    "svc-data-stewardship": "Number of managed data objects",
    "svc-sap-basis":        "Number of SAP named users",
    "svc-euc-support":      "Number of users",
    "svc-net-sec":          "Number of users",
    "svc-middleware":       "Number of transactions ×1000",
    "svc-dba":              "Number of database instances",
    "svc-rail-desk":        "Number of users",
    "svc-rail-maint":       "Sales volume, EUR thousands",
    "svc-signal-sup":       None,
    "svc-tbs-maint":        "Sales volume, EUR thousands",
    "svc-data-platform":    "Number of transactions ×1000",
    "svc-iot-infra":        "Number of connected devices",
    "svc-monitoring":       "Number of monitored endpoints",
    "svc-itsm":             "Number of users",
    "svc-devsec-tools":     None,
}


# ---------------------------------------------------------------------------
# Roster banner — printed by the runner so Phase 2 teammates can sanity-check
# the FROZEN entity counts.
# ---------------------------------------------------------------------------
ROSTER_BANNER_LINES: list[str] = [
    f"  • Projects:           {len(PROJECTS)}",
    f"  • Offerings:           {len(OFFERINGS)}",
    f"  • Internal Services:  {len(INTERNAL_SERVICES)}",
    f"  • Total entities:     {len(PROJECTS) + len(OFFERINGS) + len(INTERNAL_SERVICES)}",
    "",
    "  Flagship narrative (Master Data Hub / off-mdh / S042):",
    "  • Upstream feeders: svc-ident-auth (30%), svc-infra-platform (18%), proj-iam-run (12%)",
    "  • Downstream: svc-data-stewardship (5%), to-Business (95%)",
    "  • BTC mode: automatic (driven by S042 UM column)",
]


def all_chargeable_entities() -> list[dict]:
    """Return all 34 chargeable entities in deterministic order.

    Helper used by s06 (chargeable_entities emission) and Phase 2 teammates
    (read-only: do not mutate the returned dicts).
    """
    out: list[dict] = []
    for p in PROJECTS:
        out.append(
            {
                "id": p["id"],
                "entity_type": "Project",
                "identifier": p["identifier"],
                "name": p["name"],
                "hierarchy_node_id": p["hierarchy_id"],
                "responsible_person_id": p["responsible_id"],
                "to_business_pct": p["to_business_pct"],
                "annual_cost": p.get("annual_cost"),
                "project_id": p["id"],  # FK back into projects
                "termination_month": None,
                "allocation_key": None,  # [F-AK-01] — InternalService only
                "s_code": None,  # Projects do not participate in the UM matrix
            }
        )
    for o in OFFERINGS:
        out.append(
            {
                "id": o["id"],
                "entity_type": "Offering",
                "identifier": o["identifier"],
                "name": o["name"],
                "hierarchy_node_id": o["hierarchy_id"],
                "responsible_person_id": o["responsible_id"],
                "to_business_pct": o["to_business_pct"],
                "annual_cost": o["annual_cost"],
                "project_id": None,
                "termination_month": None,
                "allocation_key": None,  # [F-AK-01] — InternalService only
                "s_code": o.get("s_code"),  # UM-matrix lookup key
            }
        )
    for s in INTERNAL_SERVICES:
        out.append(
            {
                "id": s["id"],
                "entity_type": "InternalService",
                "identifier": s["identifier"],
                "name": s["name"],
                "hierarchy_node_id": s["hierarchy_id"],
                "responsible_person_id": s["responsible_id"],
                "to_business_pct": s["to_business_pct"],
                "annual_cost": s["annual_cost"],
                "project_id": None,
                "termination_month": None,
                "allocation_key": ALLOCATION_KEYS.get(s["id"]),  # [F-AK-01]
                "s_code": s.get("s_code"),  # UM-matrix lookup key
            }
        )
    return out
