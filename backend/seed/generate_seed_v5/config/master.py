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
    {"key": "max_utilization",     "name": "Max Utilization",         "description": "Maximum person utilization percentage",  "current": "100", "default": "100", "type": "percentage", "group": "limits"},
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
    {"id": "he-tbs", "name": "Manufacturing Systems",     "description": "Largest business unit by budget. Factory and production line IT."},
    {"id": "he-rvs", "name": "Supply Chain & Logistics",  "description": "Second business unit. Fewer but bigger projects."},
    {"id": "he-cit", "name": "Enterprise Services",       "description": "Shared/cross-divisional IT. Infrastructure, platforms, security."},
    {"id": "he-dnd", "name": "Digital & Innovation",      "description": "Emerging business unit. Analytics, AI, IoT initiatives."},
]

# Tier-2 programmes (parent_entity_id = LoB).
PROGRAMMES: list[dict] = [
    {"id": "he-tbs-prog-dbp",   "name": "Smart Factory Platform",       "lob_id": "he-tbs"},
    {"id": "he-tbs-prog-fleet", "name": "Production Analytics",         "lob_id": "he-tbs"},
    {"id": "he-rvs-prog-rail",  "name": "Logistics Optimization",       "lob_id": "he-rvs"},
    {"id": "he-cit-prog-infra", "name": "Infrastructure Modernization", "lob_id": "he-cit"},
    {"id": "he-dnd-prog-data",  "name": "Data Intelligence",            "lob_id": "he-dnd"},
]
