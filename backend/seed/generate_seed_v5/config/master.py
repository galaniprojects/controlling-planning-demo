"""Master data tokens — locations, competence centres, cost centres, role types,
rates, external cost types, planning parameters, KPI definitions, FTE constants.

Carried over from v4's monolithic ``generate_seed/config.py`` (do not import from
that package — it is being deleted at cutover). Lifted as a frozen master-data
slice consumed by ``s01_taxonomy``, ``s04_roles_rates``, and (read-only) by the
people / charging / financial config modules.
"""
from __future__ import annotations

# ---------------------------------------------------------------------------
# Workforce locations (the existing v4 ``Location`` model — distinct from the
# new v5 ``ChargingLocation`` master per [F-MD-01]).
# ---------------------------------------------------------------------------
WORKFORCE_LOCATIONS: list[dict] = [
    {"id": "loc-muc", "city": "Munich",   "country": "Germany"},
    {"id": "loc-bud", "city": "Budapest", "country": "Hungary"},
    {"id": "loc-pun", "city": "Pune",     "country": "India"},
]

LOC_HOURS_PER_YEAR: dict[str, int] = {
    "loc-muc": 1720,
    "loc-bud": 1800,
    "loc-pun": 1850,
}
LOC_HOURS_PER_MONTH: dict[str, int] = {k: round(v / 12) for k, v in LOC_HOURS_PER_YEAR.items()}
FTE_HOURS = 160  # Standard FTE-equivalent monthly hours used across the demo.

# ---------------------------------------------------------------------------
# Competence centres (cost pools).
# ---------------------------------------------------------------------------
COMPETENCE_CENTRES: list[dict] = [
    {"id": "cc-apd", "name": "Application Development"},
    {"id": "cc-inf", "name": "Infrastructure & Cloud"},
    {"id": "cc-bso", "name": "Business Solutions"},
    {"id": "cc-dda", "name": "Digital & Data Analytics"},
]

# ---------------------------------------------------------------------------
# Cost centres (location × competence centre — intentional gaps preserved).
# ---------------------------------------------------------------------------
COST_CENTRES: list[dict] = [
    {"id": "cc-muc-apd", "name": "MUC / Application Development",  "location_id": "loc-muc", "cc_id": "cc-apd"},
    {"id": "cc-muc-inf", "name": "MUC / Infrastructure & Cloud",   "location_id": "loc-muc", "cc_id": "cc-inf"},
    {"id": "cc-muc-bso", "name": "MUC / Business Solutions",       "location_id": "loc-muc", "cc_id": "cc-bso"},
    {"id": "cc-muc-dda", "name": "MUC / Digital & Data Analytics", "location_id": "loc-muc", "cc_id": "cc-dda"},
    {"id": "cc-bud-apd", "name": "BUD / Application Development",  "location_id": "loc-bud", "cc_id": "cc-apd"},
    {"id": "cc-bud-inf", "name": "BUD / Infrastructure & Cloud",   "location_id": "loc-bud", "cc_id": "cc-inf"},
    {"id": "cc-bud-dda", "name": "BUD / Digital & Data Analytics", "location_id": "loc-bud", "cc_id": "cc-dda"},
    {"id": "cc-pun-apd", "name": "PUN / Application Development",  "location_id": "loc-pun", "cc_id": "cc-apd"},
    {"id": "cc-pun-inf", "name": "PUN / Infrastructure & Cloud",   "location_id": "loc-pun", "cc_id": "cc-inf"},
    {"id": "cc-pun-bso", "name": "PUN / Business Solutions",       "location_id": "loc-pun", "cc_id": "cc-bso"},
]

# ---------------------------------------------------------------------------
# Role types and per-location hourly rates (carried over from v4 spec).
# ---------------------------------------------------------------------------
ROLE_TYPES: list[dict] = [
    {"id": "role-sr-arch",   "name": "Senior Solution Architect", "cc": "cc-apd"},
    {"id": "role-sr-dev",    "name": "Senior Developer",          "cc": "cc-apd"},
    {"id": "role-dev",       "name": "Developer",                 "cc": "cc-apd"},
    {"id": "role-jr-dev",    "name": "Junior Developer",          "cc": "cc-apd"},
    {"id": "role-qa",        "name": "QA / Test Engineer",        "cc": "cc-apd"},
    {"id": "role-cloud",     "name": "Cloud / Platform Engineer", "cc": "cc-inf"},
    {"id": "role-sysadmin",  "name": "Systems Administrator",     "cc": "cc-inf"},
    {"id": "role-network",   "name": "Network Engineer",          "cc": "cc-inf"},
    {"id": "role-sap",       "name": "SAP Functional Consultant", "cc": "cc-bso"},
    {"id": "role-ba",        "name": "Business Analyst",          "cc": "cc-bso"},
    {"id": "role-data-eng",  "name": "Data Engineer",             "cc": "cc-dda"},
    {"id": "role-data-sci",  "name": "Data Scientist",            "cc": "cc-dda"},
]

# Per-role, per-location hourly rates (EUR). None means role unavailable there.
RATES: dict[str, tuple] = {
    #                       MUC    BUD    PUN
    "role-sr-arch":         (115,    78,    52),
    "role-sr-dev":          (100,    68,    46),
    "role-dev":             ( 82,    56,    38),
    "role-jr-dev":          ( 65,    44,    30),
    "role-qa":              ( 75,    52,    35),
    "role-cloud":           (105,    72,    48),
    "role-sysadmin":        ( 80,    55,    38),
    "role-network":         ( 85,    58,    40),
    "role-sap":             (110,  None,    50),
    "role-ba":              ( 90,  None,    42),
    "role-data-eng":        (100,    70,  None),
    "role-data-sci":        (108,    75,  None),
}

LOCATION_INDEX = {"loc-muc": 0, "loc-bud": 1, "loc-pun": 2}


def get_rate(role_id: str, location_id: str) -> float | None:
    """Get hourly rate for a role at a workforce location."""
    if role_id not in RATES:
        return None
    idx = LOCATION_INDEX.get(location_id)
    if idx is None:
        return None
    return RATES[role_id][idx]


# ---------------------------------------------------------------------------
# External cost types — admin-managed under /api/admin/external-cost-types
# per [E-08e]. Default demo set per CLAUDE.md (Consulting / Cloud-Infra /
# Licenses / Hardware / Other) plus the v4-era extras for backwards-compat
# with existing cost lines.
# ---------------------------------------------------------------------------
EXTERNAL_COST_TYPES: list[dict] = [
    {"id": "ext-consulting",    "name": "Consulting"},
    {"id": "ext-leased-staff",  "name": "Leased Staff"},
    {"id": "ext-cloud",         "name": "Cloud-Infrastructure"},
    {"id": "ext-sw-licenses",   "name": "Licenses"},
    {"id": "ext-sw-maint",      "name": "Software Maintenance"},
    {"id": "ext-hw-maint",      "name": "Hardware"},
    {"id": "ext-training",      "name": "Training"},
    {"id": "ext-travel",        "name": "Travel"},
    {"id": "ext-infra-onprem",  "name": "Infrastructure (On-Prem)"},
    {"id": "ext-other",         "name": "Other"},
]

# ---------------------------------------------------------------------------
# Planning parameters (system config keys).
# ---------------------------------------------------------------------------
PLANNING_PARAMETERS: list[dict] = [
    {"key": "fiscal_year_start",   "name": "Fiscal Year Start",       "description": "Month when fiscal year begins",          "current": "01",  "default": "01",  "type": "month",      "group": "fiscal"},
    {"key": "planning_horizon",    "name": "Planning Horizon",        "description": "Number of months to plan ahead",         "current": "36",  "default": "36",  "type": "integer",    "group": "planning"},
    {"key": "forecast_deadline",   "name": "Forecast Deadline",       "description": "Day of month when forecast is due",      "current": "15",  "default": "15",  "type": "integer",    "group": "planning"},
    {"key": "rag_amber_threshold", "name": "RAG Amber Threshold",     "description": "Budget variance % for amber status",     "current": "5",   "default": "5",   "type": "percentage", "group": "thresholds"},
    {"key": "rag_red_threshold",   "name": "RAG Red Threshold",       "description": "Budget variance % for red status",       "current": "10",  "default": "10",  "type": "percentage", "group": "thresholds"},
    {"key": "max_utilization",        "name": "Max Utilization",         "description": "Maximum person utilization percentage",     "current": "100", "default": "100", "type": "percentage", "group": "limits"},
    {"key": "max_allocation_depth",   "name": "Max Allocation Depth",    "description": "Maximum Stage 1 distribution chain length", "current": "6",   "default": "6",   "type": "integer",    "group": "limits"},
    # Ranked-backlog budget envelope — consumed by services.ranking.load_config.
    # Lowered from the 50M default so the cutoff line falls mid-backlog.
    {"key": "ranking_total_available_budget", "name": "Ranking Total Available Budget", "description": "Total budget envelope for the ranked backlog competition", "current": "13000000", "default": "50000000", "type": "integer", "group": "planning"},
    # Tech Navigator t-shirt thresholds — consumed by services.tech_navigator.
    # Seeded to the generator's bands (XS<=200k / S<=500k / M<=1M / L<=2M) so a
    # live recompute keeps the same sizes the seed emitted (live default is
    # 100k/250k/500k/1M — seeding pins it to the wider demo bands).
    {"key": "tn_tshirt_xs_max", "name": "T-Shirt XS Max", "description": "Upper budget bound for XS sizing (EUR)", "current": "200000",  "default": "100000",  "type": "integer", "group": "thresholds"},
    {"key": "tn_tshirt_s_max",  "name": "T-Shirt S Max",  "description": "Upper budget bound for S sizing (EUR)",  "current": "500000",  "default": "250000",  "type": "integer", "group": "thresholds"},
    {"key": "tn_tshirt_m_max",  "name": "T-Shirt M Max",  "description": "Upper budget bound for M sizing (EUR)",  "current": "1000000", "default": "500000",  "type": "integer", "group": "thresholds"},
    {"key": "tn_tshirt_l_max",  "name": "T-Shirt L Max",  "description": "Upper budget bound for L sizing (EUR)",  "current": "2000000", "default": "1000000", "type": "integer", "group": "thresholds"},
]

# ---------------------------------------------------------------------------
# KPI definitions (built-in catalogue).
# ---------------------------------------------------------------------------
KPI_DEFINITIONS: list[dict] = [
    {"name": "Total Baseline",        "description": "Sum of all project baselines",            "formula": "SUM(baseline.amount_eur)",                          "format": "currency",   "target": None,  "is_built_in": True, "is_active": True},
    {"name": "Current Forecast",      "description": "Sum of all project forecasts",            "formula": "SUM(forecast.amount_eur)",                          "format": "currency",   "target": None,  "is_built_in": True, "is_active": True},
    {"name": "YTD Actuals",           "description": "Year-to-date recorded costs",             "formula": "SUM(actuals.amount_eur) WHERE year=current",        "format": "currency",   "target": None,  "is_built_in": True, "is_active": True},
    {"name": "Plan Drift",            "description": "Forecast minus Baseline",                 "formula": "forecast_total - baseline_total",                   "format": "currency",   "target": "0",   "is_built_in": True, "is_active": True},
    {"name": "Portfolio Utilization", "description": "Average resource utilization",            "formula": "AVG(person_utilization_pct)",                       "format": "percentage", "target": "85",  "is_built_in": True, "is_active": True},
    {"name": "Run/Change Ratio",      "description": "Services vs Projects budget split",       "formula": "services_budget / projects_budget",                 "format": "ratio",      "target": None,  "is_built_in": True, "is_active": True},
    {"name": "CapEx/OpEx Ratio",      "description": "Capital vs Operating expenditure split",  "formula": "capex_total / opex_total",                          "format": "ratio",      "target": None,  "is_built_in": True, "is_active": True},
]

# ---------------------------------------------------------------------------
# LoBs (4 — backed by GroupingEntity in v5; carried as a config list because
# s02_grouping_entities consumes both LoBs and tier-2 program children to emit
# the configurable hierarchy graph).
# ---------------------------------------------------------------------------
LOBS: list[dict] = [
    {"id": "he-tbs", "name": "Truck & Bus Systems (TBS)", "description": "Largest LoB by budget."},
    {"id": "he-rvs", "name": "Rail Vehicle Systems (RVS)", "description": "Rail division."},
    {"id": "he-cit", "name": "Corporate IT",              "description": "Shared/cross-divisional IT."},
    {"id": "he-dnd", "name": "Digital & Data",            "description": "Analytics, AI, IoT initiatives."},
]

# Tier-2 programmes (parent_entity_id = LoB).
PROGRAMMES: list[dict] = [
    {"id": "he-tbs-prog-dbp",   "name": "Digital Braking Platform",     "lob_id": "he-tbs"},
    {"id": "he-tbs-prog-fleet", "name": "Fleet Intelligence",           "lob_id": "he-tbs"},
    {"id": "he-rvs-prog-rail",  "name": "Rail Modernization",           "lob_id": "he-rvs"},
    {"id": "he-cit-prog-infra", "name": "Infrastructure Optimization",  "lob_id": "he-cit"},
    {"id": "he-dnd-prog-data",  "name": "Data Platform & Analytics",    "lob_id": "he-dnd"},
]
