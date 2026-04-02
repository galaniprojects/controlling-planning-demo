"""
Shared configuration for seed data generation.
Single source of truth for rates, project roster, and utility functions.
"""

DEMO_DATE = "2026-04"
CREATED_AT = "2026-01-15 10:00:00"

# ---------------------------------------------------------------------------
# Month utilities
# ---------------------------------------------------------------------------

def month_range(start: str, end: str) -> list[str]:
    """Generate list of YYYY-MM strings from start to end (inclusive)."""
    sy, sm = int(start[:4]), int(start[5:7])
    ey, em = int(end[:4]), int(end[5:7])
    months = []
    y, m = sy, sm
    while (y, m) <= (ey, em):
        months.append(f"{y:04d}-{m:02d}")
        m += 1
        if m > 12:
            m = 1
            y += 1
    return months


def months_between(start: str, end: str) -> int:
    """Number of months between two YYYY-MM strings (inclusive)."""
    return len(month_range(start, end))


def sql_str(v) -> str:
    """Escape a value for SQL: strings get quoted, None becomes NULL."""
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, (int, float)):
        return str(v)
    # Escape single quotes
    return f"'{str(v).replace(chr(39), chr(39)+chr(39))}'"


# ---------------------------------------------------------------------------
# Locations
# ---------------------------------------------------------------------------

LOCATIONS = [
    {"id": "loc-muc", "city": "Munich",   "country": "Germany"},
    {"id": "loc-bud", "city": "Budapest", "country": "Hungary"},
    {"id": "loc-pun", "city": "Pune",     "country": "India"},
]

LOC_HOURS_PER_YEAR = {"loc-muc": 1720, "loc-bud": 1800, "loc-pun": 1850}
LOC_HOURS_PER_MONTH = {k: round(v / 12) for k, v in LOC_HOURS_PER_YEAR.items()}
# Approx: MUC=143, BUD=150, PUN=154  — but we use 160 as standard FTE for simplicity
FTE_HOURS = 160

# ---------------------------------------------------------------------------
# Business Units (portfolio hierarchy level 1)
# ---------------------------------------------------------------------------

LOBS = [
    {"id": "lob-tbs", "name": "Manufacturing Systems",       "description": "Largest business unit by budget. Factory and production line IT."},
    {"id": "lob-rvs", "name": "Supply Chain & Logistics",    "description": "Second business unit. Fewer but bigger projects."},
    {"id": "lob-cit", "name": "Enterprise Services",         "description": "Shared/cross-divisional IT. Infrastructure, platforms, security."},
    {"id": "lob-dnd", "name": "Digital & Innovation",        "description": "Emerging business unit. Analytics, AI, IoT initiatives."},
]

# ---------------------------------------------------------------------------
# Competence Centres
# ---------------------------------------------------------------------------

COMPETENCE_CENTRES = [
    {"id": "cc-apd", "name": "Application Development"},
    {"id": "cc-inf", "name": "Infrastructure & Cloud"},
    {"id": "cc-bso", "name": "Business Solutions"},
    {"id": "cc-dda", "name": "Digital & Data Analytics"},
]

# ---------------------------------------------------------------------------
# Cost Centres  (location + competence centre combos)
# Not every CC exists at every location — intentional gaps.
# ---------------------------------------------------------------------------

COST_CENTRES = [
    {"id": "cc-muc-apd", "name": "MUC / Application Development",     "location_id": "loc-muc", "cc_id": "cc-apd"},
    {"id": "cc-muc-inf", "name": "MUC / Infrastructure & Cloud",       "location_id": "loc-muc", "cc_id": "cc-inf"},
    {"id": "cc-muc-bso", "name": "MUC / Business Solutions",           "location_id": "loc-muc", "cc_id": "cc-bso"},
    {"id": "cc-muc-dda", "name": "MUC / Digital & Data Analytics",     "location_id": "loc-muc", "cc_id": "cc-dda"},
    {"id": "cc-bud-apd", "name": "BUD / Application Development",     "location_id": "loc-bud", "cc_id": "cc-apd"},
    {"id": "cc-bud-inf", "name": "BUD / Infrastructure & Cloud",       "location_id": "loc-bud", "cc_id": "cc-inf"},
    {"id": "cc-bud-dda", "name": "BUD / Digital & Data Analytics",     "location_id": "loc-bud", "cc_id": "cc-dda"},
    {"id": "cc-pun-apd", "name": "PUN / Application Development",     "location_id": "loc-pun", "cc_id": "cc-apd"},
    {"id": "cc-pun-inf", "name": "PUN / Infrastructure & Cloud",       "location_id": "loc-pun", "cc_id": "cc-inf"},
    {"id": "cc-pun-bso", "name": "PUN / Business Solutions",           "location_id": "loc-pun", "cc_id": "cc-bso"},
]
# No BSO in Budapest, no DDA in Pune — intentional gaps

# ---------------------------------------------------------------------------
# Role Types & Per-Location Hourly Rates (from spec §9.3)
# ---------------------------------------------------------------------------

ROLE_TYPES = [
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

# Per-role, per-location hourly rates (EUR)
# None = role not available at that location
RATES = {
    #                        MUC    BUD    PUN
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
    """Get hourly rate for a role at a location. Returns None if unavailable."""
    if role_id not in RATES:
        return None
    idx = LOCATION_INDEX.get(location_id)
    if idx is None:
        return None
    return RATES[role_id][idx]


# ---------------------------------------------------------------------------
# External Cost Types (10 categories)
# ---------------------------------------------------------------------------

EXTERNAL_COST_TYPES = [
    {"id": "ext-consulting",   "name": "Consulting"},
    {"id": "ext-leased-staff", "name": "Leased Staff"},
    {"id": "ext-cloud",        "name": "Cloud Services"},
    {"id": "ext-sw-licenses",  "name": "Software Licenses"},
    {"id": "ext-sw-maint",     "name": "Software Maintenance"},
    {"id": "ext-hw-maint",     "name": "Hardware Maintenance"},
    {"id": "ext-training",     "name": "Training"},
    {"id": "ext-travel",       "name": "Travel"},
    {"id": "ext-infra-onprem", "name": "Infrastructure (On-Prem)"},
    {"id": "ext-other",        "name": "Other Third Party Services"},
]

# ---------------------------------------------------------------------------
# Programmes
# ---------------------------------------------------------------------------

PROGRAMMES = [
    {"id": "prog-dbp",  "name": "Smart Factory Platform",        "lob_id": "lob-tbs"},
    {"id": "prog-rail", "name": "Logistics Optimization",        "lob_id": "lob-rvs"},
    {"id": "prog-infra","name": "Infrastructure Modernization",  "lob_id": "lob-cit"},
    {"id": "prog-fleet","name": "Data Intelligence",             "lob_id": "lob-dnd"},
]

# ---------------------------------------------------------------------------
# Project & Service Roster (32 entities)
# ---------------------------------------------------------------------------

PROJECTS = [
    # --- Manufacturing Systems (9) ---
    {"id": "proj-erp2",      "name": "ERP Integration Phase 2",            "lob": "lob-tbs", "prog": "prog-dbp",  "type": "project", "status": "active",           "rag": "red",   "capex_opex": "capex", "start": "2024-07", "end": "2026-09", "budget": 1200000, "narrative": "troubled",           "pl": "p-sharma"},
    {"id": "proj-sap",       "name": "MES Platform Migration",             "lob": "lob-tbs", "prog": None,        "type": "project", "status": "active",           "rag": "green", "capex_opex": "capex", "start": "2022-01", "end": "2026-06", "budget": 4500000, "narrative": "well_managed",       "pl": None},
    {"id": "proj-brake",     "name": "Production Line Controller Upgrade", "lob": "lob-tbs", "prog": "prog-dbp",  "type": "project", "status": "active",           "rag": "green", "capex_opex": "capex", "start": "2025-03", "end": "2026-03", "budget": 250000,  "narrative": "nearing_completion", "pl": None},
    {"id": "proj-autobrake", "name": "Automated Assembly Prototype",       "lob": "lob-tbs", "prog": None,        "type": "project", "status": "pending_cc_confirmation", "rag": None, "capex_opex": "capex", "start": "2026-06", "end": "2027-12", "budget": 900000, "narrative": "intake",            "pl": "p-sharma"},
    {"id": "proj-legacy",    "name": "Legacy System Decommission",         "lob": "lob-tbs", "prog": None,        "type": "project", "status": "completed",        "rag": "green", "capex_opex": "opex",  "start": "2022-06", "end": "2024-03", "budget": 180000,  "narrative": "completed",         "pl": None},
    {"id": "proj-connveh",   "name": "Digital Twin Platform",              "lob": "lob-tbs", "prog": None,        "type": "project", "status": "planned",          "rag": "green", "capex_opex": "capex", "start": "2026-10", "end": "2028-12", "budget": 1800000, "narrative": "future",            "pl": None},
    {"id": "svc-sap-ops",    "name": "MES Operations",                     "lob": "lob-tbs", "prog": None,        "type": "service", "status": "active",           "rag": "green", "capex_opex": "opex",  "start": "2024-01", "end": None,      "budget": 400000,  "narrative": "steady_service",    "pl": None},
    {"id": "svc-euc",        "name": "End User Computing Support",         "lob": "lob-tbs", "prog": None,        "type": "service", "status": "active",           "rag": "green", "capex_opex": "opex",  "start": "2024-01", "end": None,      "budget": 200000,  "narrative": "steady_service",    "pl": None},
    {"id": "svc-tbs-maint",  "name": "Factory Application Maintenance",    "lob": "lob-tbs", "prog": None,        "type": "service", "status": "active",           "rag": "green", "capex_opex": "opex",  "start": "2024-01", "end": None,      "budget": 280000,  "narrative": "steady_service",    "pl": None},

    # --- Supply Chain & Logistics (8) ---
    {"id": "proj-signal",    "name": "Warehouse Management Upgrade",       "lob": "lob-rvs", "prog": "prog-rail", "type": "project", "status": "active",           "rag": "green", "capex_opex": "capex", "start": "2023-01", "end": "2026-06", "budget": 1500000, "narrative": "nearing_completion", "pl": None},
    {"id": "proj-raildiag",  "name": "Supplier Portal v2",                 "lob": "lob-rvs", "prog": "prog-rail", "type": "project", "status": "active",           "rag": "green", "capex_opex": "capex", "start": "2024-06", "end": "2027-06", "budget": 700000,  "narrative": "well_managed",       "pl": None},
    {"id": "proj-predmaint", "name": "Predictive Inventory System",        "lob": "lob-rvs", "prog": None,        "type": "project", "status": "active",           "rag": "amber", "capex_opex": "capex", "start": "2025-06", "end": "2027-03", "budget": 500000,  "narrative": "scope_change",       "pl": "p-sharma"},
    {"id": "proj-workshop",  "name": "Returns Processing Tool",            "lob": "lob-rvs", "prog": None,        "type": "project", "status": "completed",        "rag": "green", "capex_opex": "capex", "start": "2023-01", "end": "2025-06", "budget": 220000,  "narrative": "completed",         "pl": None},
    {"id": "proj-railsafety","name": "Supply Chain Compliance System",     "lob": "lob-rvs", "prog": None,        "type": "project", "status": "planned",          "rag": "green", "capex_opex": "capex", "start": "2026-09", "end": "2028-06", "budget": 650000,  "narrative": "future",            "pl": None},
    {"id": "svc-rail-desk",  "name": "Logistics IT Service Desk",          "lob": "lob-rvs", "prog": None,        "type": "service", "status": "active",           "rag": "green", "capex_opex": "opex",  "start": "2024-01", "end": None,      "budget": 250000,  "narrative": "steady_service",    "pl": None},
    {"id": "svc-rail-maint", "name": "Supply Chain App Maintenance",       "lob": "lob-rvs", "prog": None,        "type": "service", "status": "active",           "rag": "green", "capex_opex": "opex",  "start": "2024-01", "end": None,      "budget": 300000,  "narrative": "steady_service",    "pl": None},
    {"id": "svc-signal-sup", "name": "Warehouse Systems Support",          "lob": "lob-rvs", "prog": None,        "type": "service", "status": "active",           "rag": "green", "capex_opex": "opex",  "start": "2024-01", "end": None,      "budget": 180000,  "narrative": "steady_service",    "pl": None},

    # --- Enterprise Services (8) ---
    {"id": "proj-cloud3",    "name": "Cloud Migration Wave 3",             "lob": "lob-cit", "prog": "prog-infra","type": "project", "status": "active",           "rag": "green", "capex_opex": "opex",  "start": "2025-01", "end": "2026-06", "budget": 400000,  "narrative": "well_managed",       "pl": None},
    {"id": "proj-iam",       "name": "Identity & Access Management Overhaul", "lob": "lob-cit", "prog": None, "type": "project", "status": "active",          "rag": "amber", "capex_opex": "capex", "start": "2025-01", "end": "2026-09", "budget": 350000,  "narrative": "troubled",          "pl": None},
    {"id": "proj-workplace", "name": "Workplace Modernization",            "lob": "lob-cit", "prog": "prog-infra","type": "project", "status": "active",           "rag": "green", "capex_opex": "opex",  "start": "2025-06", "end": "2026-06", "budget": 300000,  "narrative": "well_managed",       "pl": None},
    {"id": "proj-datacenter","name": "Data Center Consolidation",          "lob": "lob-cit", "prog": None,        "type": "project", "status": "completed",        "rag": "green", "capex_opex": "opex",  "start": "2021-06", "end": "2023-12", "budget": 800000,  "narrative": "completed",         "pl": None},
    {"id": "proj-wan",       "name": "Global WAN Refresh",                 "lob": "lob-cit", "prog": None,        "type": "project", "status": "completed",        "rag": "green", "capex_opex": "capex", "start": "2022-01", "end": "2024-06", "budget": 600000,  "narrative": "completed",         "pl": None},
    {"id": "svc-netsec",     "name": "Network & Security Operations",      "lob": "lob-cit", "prog": None,        "type": "service", "status": "active",           "rag": "green", "capex_opex": "opex",  "start": "2024-01", "end": None,      "budget": 350000,  "narrative": "steady_service",    "pl": None},
    {"id": "svc-middleware", "name": "Enterprise Middleware",               "lob": "lob-cit", "prog": None,        "type": "service", "status": "active",           "rag": "green", "capex_opex": "opex",  "start": "2024-01", "end": None,      "budget": 280000,  "narrative": "steady_service",    "pl": None},
    {"id": "svc-dba",        "name": "Database Administration",            "lob": "lob-cit", "prog": None,        "type": "service", "status": "active",           "rag": "green", "capex_opex": "opex",  "start": "2024-01", "end": None,      "budget": 180000,  "narrative": "steady_service",    "pl": None},

    # --- Digital & Innovation (7) ---
    {"id": "proj-sensor",    "name": "IoT Sensor Data Pipeline",           "lob": "lob-dnd", "prog": "prog-fleet","type": "project", "status": "active",           "rag": "amber", "capex_opex": "capex", "start": "2025-03", "end": "2026-12", "budget": 600000,  "narrative": "troubled",          "pl": "p-sharma"},
    {"id": "proj-fleet",     "name": "Asset Tracking Portal v2",           "lob": "lob-dnd", "prog": "prog-fleet","type": "project", "status": "active",           "rag": "green", "capex_opex": "capex", "start": "2025-01", "end": "2026-06", "budget": 450000,  "narrative": "well_managed",       "pl": "p-sharma"},
    {"id": "proj-telematics","name": "Operations Analytics Dashboard",     "lob": "lob-dnd", "prog": "prog-fleet","type": "project", "status": "active",           "rag": "amber", "capex_opex": "capex", "start": "2025-06", "end": "2026-09", "budget": 300000,  "narrative": "troubled",          "pl": None},
    {"id": "proj-dwh",       "name": "Data Warehouse Consolidation",       "lob": "lob-dnd", "prog": None,        "type": "project", "status": "planned",          "rag": "green", "capex_opex": "capex", "start": "2026-07", "end": "2027-09", "budget": 550000,  "narrative": "future",            "pl": None},
    {"id": "proj-aiml",      "name": "AI/ML Experimentation Lab",          "lob": "lob-dnd", "prog": None,        "type": "project", "status": "active",           "rag": "green", "capex_opex": "opex",  "start": "2025-09", "end": "2026-06", "budget": 200000,  "narrative": "well_managed",       "pl": None},
    {"id": "svc-dataplatform","name": "Data Platform Operations",          "lob": "lob-dnd", "prog": None,        "type": "service", "status": "active",           "rag": "green", "capex_opex": "opex",  "start": "2024-01", "end": None,      "budget": 220000,  "narrative": "steady_service",    "pl": None},
    {"id": "svc-iot",        "name": "IoT Infrastructure Support",         "lob": "lob-dnd", "prog": None,        "type": "service", "status": "active",           "rag": "green", "capex_opex": "opex",  "start": "2024-01", "end": None,      "budget": 150000,  "narrative": "steady_service",    "pl": None},
]

# ---------------------------------------------------------------------------
# People (50)  — culturally appropriate names per location
# ---------------------------------------------------------------------------

PEOPLE = [
    # --- MUC / APD (8) — German names ---
    {"id": "p-brenner",   "name": "Thomas Brenner",     "role": "role-sr-arch",  "cc": "cc-muc-apd"},  # CC Owner persona
    {"id": "p-fischer",   "name": "Lena Fischer",       "role": "role-sr-dev",   "cc": "cc-muc-apd"},
    {"id": "p-wolf",      "name": "Markus Wolf",        "role": "role-sr-dev",   "cc": "cc-muc-apd"},
    {"id": "p-keller",    "name": "Felix Keller",       "role": "role-sr-dev",   "cc": "cc-muc-apd"},
    {"id": "p-schmidt",   "name": "Jan Schmidt",        "role": "role-dev",      "cc": "cc-muc-apd"},
    {"id": "p-bauer",     "name": "Sophie Bauer",       "role": "role-dev",      "cc": "cc-muc-apd"},
    {"id": "p-neumann",   "name": "Niklas Neumann",     "role": "role-dev",      "cc": "cc-muc-apd"},
    {"id": "p-hoffmann",  "name": "Laura Hoffmann",     "role": "role-jr-dev",   "cc": "cc-muc-apd"},
    # NOTE: QA in MUC/APD counted below under separate rows

    # --- MUC / INF (5) ---
    {"id": "p-wagner",    "name": "Michael Wagner",     "role": "role-cloud",    "cc": "cc-muc-inf"},
    {"id": "p-braun",     "name": "Stefan Braun",       "role": "role-cloud",    "cc": "cc-muc-inf"},
    {"id": "p-becker",   "name": "Katharina Richter",  "role": "role-sysadmin", "cc": "cc-muc-inf"},
    {"id": "p-frank",     "name": "Andreas Frank",      "role": "role-network",  "cc": "cc-muc-inf"},
    {"id": "p-jung",      "name": "Sabine Jung",        "role": "role-qa",       "cc": "cc-muc-apd"},  # QA #1 MUC

    # --- MUC / BSO (5) ---
    {"id": "p-mueller",   "name": "Eva Mueller",        "role": "role-sap",      "cc": "cc-muc-bso"},
    {"id": "p-hartmann",  "name": "Klaus Hartmann",     "role": "role-sap",      "cc": "cc-muc-bso"},
    {"id": "p-krause",    "name": "Petra Krause",       "role": "role-ba",       "cc": "cc-muc-bso"},
    {"id": "p-berger",    "name": "Martin Berger",      "role": "role-qa",       "cc": "cc-muc-apd"},  # QA #2 MUC — housed in APD for headcount

    # --- MUC / DDA (4) ---
    {"id": "p-schubert",  "name": "Daniel Schubert",    "role": "role-data-eng", "cc": "cc-muc-dda"},
    {"id": "p-winter",    "name": "Christina Winter",   "role": "role-data-eng", "cc": "cc-muc-dda"},
    {"id": "p-lorenz",    "name": "Florian Lorenz",     "role": "role-data-sci", "cc": "cc-muc-dda"},

    # --- BUD / APD (8) — Hungarian names ---
    {"id": "p-nagy",      "name": "Zoltan Nagy",        "role": "role-sr-arch",  "cc": "cc-bud-apd"},
    {"id": "p-szabo",     "name": "Istvan Szabo",       "role": "role-sr-dev",   "cc": "cc-bud-apd"},  # OVER-ALLOCATED
    {"id": "p-toth",      "name": "Gabor Toth",         "role": "role-sr-dev",   "cc": "cc-bud-apd"},
    {"id": "p-horvath",   "name": "Anna Horvath",       "role": "role-sr-dev",   "cc": "cc-bud-apd"},
    {"id": "p-kovacs",    "name": "Peter Kovacs",       "role": "role-dev",      "cc": "cc-bud-apd"},
    {"id": "p-molnar",    "name": "Katalin Molnar",     "role": "role-dev",      "cc": "cc-bud-apd"},
    {"id": "p-varga",     "name": "Laszlo Varga",       "role": "role-dev",      "cc": "cc-bud-apd"},
    {"id": "p-kiss",      "name": "Eszter Kiss",        "role": "role-dev",      "cc": "cc-bud-apd"},
    # BUD APD also has: 1 jr-dev + 2 QA counted with BUD below

    # --- BUD / INF (4) ---
    {"id": "p-farkas",    "name": "Tamas Farkas",       "role": "role-cloud",    "cc": "cc-bud-inf"},
    {"id": "p-balogh",    "name": "Andras Balogh",      "role": "role-sysadmin", "cc": "cc-bud-inf"},
    {"id": "p-takacs",    "name": "Krisztina Takacs",   "role": "role-network",  "cc": "cc-bud-inf"},
    {"id": "p-fekete",    "name": "Daniel Fekete",      "role": "role-jr-dev",   "cc": "cc-bud-apd"},  # jr-dev BUD

    # --- BUD / DDA (3) ---
    {"id": "p-simon",     "name": "Balazs Simon",       "role": "role-data-eng", "cc": "cc-bud-dda"},
    {"id": "p-nemeth",    "name": "Eva Nemeth",         "role": "role-data-sci", "cc": "cc-bud-dda"},
    {"id": "p-papp",      "name": "Janos Papp",         "role": "role-qa",       "cc": "cc-bud-apd"},  # QA #1 BUD
    {"id": "p-lukacs",    "name": "Marta Lukacs",       "role": "role-qa",       "cc": "cc-bud-apd"},  # QA #2 BUD

    # --- PUN / APD (6) — Indian names ---
    {"id": "p-sharma",    "name": "Priya Sharma",       "role": "role-sr-arch",  "cc": None},          # PL persona — no CC
    {"id": "p-patel",     "name": "Rajesh Patel",       "role": "role-sr-dev",   "cc": "cc-pun-apd"},
    {"id": "p-kumar",     "name": "Amit Kumar",         "role": "role-sr-dev",   "cc": "cc-pun-apd"},
    {"id": "p-gupta",     "name": "Sneha Gupta",        "role": "role-dev",      "cc": "cc-pun-apd"},
    {"id": "p-singh",     "name": "Vikram Singh",       "role": "role-dev",      "cc": "cc-pun-apd"},
    {"id": "p-das",       "name": "Ananya Das",         "role": "role-dev",      "cc": "cc-pun-apd"},
    {"id": "p-joshi",     "name": "Deepak Joshi",       "role": "role-jr-dev",   "cc": "cc-pun-apd"},
    {"id": "p-iyer",      "name": "Kavitha Iyer",       "role": "role-jr-dev",   "cc": "cc-pun-apd"},
    {"id": "p-reddy",     "name": "Sanjay Reddy",       "role": "role-qa",       "cc": "cc-pun-apd"},  # QA PUN

    # --- PUN / INF (4) ---
    {"id": "p-nair",      "name": "Arun Nair",          "role": "role-cloud",    "cc": "cc-pun-inf"},
    {"id": "p-menon",     "name": "Lakshmi Menon",      "role": "role-sysadmin", "cc": "cc-pun-inf"},
    {"id": "p-pillai",    "name": "Suresh Pillai",      "role": "role-network",  "cc": "cc-pun-inf"},

    # --- PUN / BSO (3) ---
    {"id": "p-rao",       "name": "Meera Rao",          "role": "role-sap",      "cc": "cc-pun-bso"},
    {"id": "p-desai",     "name": "Nikhil Desai",       "role": "role-ba",       "cc": "cc-pun-bso"},

    # --- Portfolio-level personas (no CC) ---
    {"id": "p-meier",     "name": "Anna Meier",         "role": "role-sr-arch",  "cc": None},          # Controller
    {"id": "p-becker-exec","name": "Thomas Becker",       "role": "role-sr-arch",  "cc": None},          # Executive
]

# Demo personas mapping
DEMO_PERSONAS = [
    {"id": "persona-controller", "person_id": "p-meier",   "role": "controller",        "display_name": "Anna Meier",     "title": "IT Controller",                     "default_module": "portfolio", "managed_cc": None,        "owned_projects": None},
    {"id": "persona-cc-owner",   "person_id": "p-brenner", "role": "cost_center_owner",  "display_name": "Thomas Brenner", "title": "Head of Application Development",   "default_module": "capacity",  "managed_cc": "cc-muc-apd","owned_projects": None},
    {"id": "persona-pl",         "person_id": "p-sharma",  "role": "project_lead",       "display_name": "Priya Sharma",   "title": "Senior Project Lead",               "default_module": "workbench", "managed_cc": None,        "owned_projects": '["proj-erp2","proj-sensor","proj-predmaint","proj-fleet","proj-autobrake"]'},
    {"id": "persona-exec",       "person_id": "p-becker-exec","role": "executive",          "display_name": "Thomas Becker",   "title": "VP IT Strategy & Governance",       "default_module": "portfolio", "managed_cc": None,        "owned_projects": None},
]

# ---------------------------------------------------------------------------
# Internal Staffing Profiles per Project/Service
# Each entry: {role, loc, hours, capex_opex}
# hours = monthly hours for that role on the project
# ---------------------------------------------------------------------------

PROJECT_STAFFING = {
    # --- Manufacturing Systems ---
    "proj-erp2": [
        {"role": "role-sr-dev",  "loc": "loc-muc", "hours": 80,  "co": "capex"},
        {"role": "role-sr-dev",  "loc": "loc-pun", "hours": 40,  "co": "capex"},
        {"role": "role-dev",     "loc": "loc-muc", "hours": 60,  "co": "capex"},
        {"role": "role-dev",     "loc": "loc-pun", "hours": 40,  "co": "capex"},
        {"role": "role-qa",      "loc": "loc-muc", "hours": 40,  "co": "capex"},
        {"role": "role-sap",     "loc": "loc-muc", "hours": 40,  "co": "capex"},
        {"role": "role-ba",      "loc": "loc-muc", "hours": 30,  "co": "capex"},
    ],
    "proj-sap": [
        {"role": "role-sap",     "loc": "loc-muc", "hours": 80,  "co": "capex"},
        {"role": "role-sap",     "loc": "loc-pun", "hours": 40,  "co": "capex"},
        {"role": "role-sr-dev",  "loc": "loc-bud", "hours": 60,  "co": "capex"},
        {"role": "role-dev",     "loc": "loc-bud", "hours": 80,  "co": "capex"},
        {"role": "role-ba",      "loc": "loc-pun", "hours": 30,  "co": "capex"},
        {"role": "role-qa",      "loc": "loc-bud", "hours": 40,  "co": "capex"},
    ],
    "proj-brake": [
        {"role": "role-sr-dev",  "loc": "loc-bud", "hours": 40,  "co": "capex"},
        {"role": "role-dev",     "loc": "loc-bud", "hours": 60,  "co": "capex"},
        {"role": "role-qa",      "loc": "loc-bud", "hours": 30,  "co": "capex"},
    ],
    "proj-autobrake": [
        {"role": "role-sr-arch", "loc": "loc-muc", "hours": 40,  "co": "capex"},
        {"role": "role-sr-dev",  "loc": "loc-muc", "hours": 80,  "co": "capex"},
        {"role": "role-dev",     "loc": "loc-bud", "hours": 120, "co": "capex"},
        {"role": "role-dev",     "loc": "loc-pun", "hours": 80,  "co": "capex"},
        {"role": "role-qa",      "loc": "loc-bud", "hours": 40,  "co": "capex"},
        {"role": "role-ba",      "loc": "loc-muc", "hours": 20,  "co": "capex"},
    ],
    "proj-legacy": [
        {"role": "role-sysadmin","loc": "loc-muc", "hours": 60,  "co": "opex"},
        {"role": "role-dev",     "loc": "loc-muc", "hours": 40,  "co": "opex"},
    ],
    "proj-connveh": [
        {"role": "role-sr-arch", "loc": "loc-muc", "hours": 40,  "co": "capex"},
        {"role": "role-sr-dev",  "loc": "loc-muc", "hours": 60,  "co": "capex"},
        {"role": "role-dev",     "loc": "loc-bud", "hours": 100, "co": "capex"},
        {"role": "role-dev",     "loc": "loc-pun", "hours": 80,  "co": "capex"},
        {"role": "role-qa",      "loc": "loc-bud", "hours": 40,  "co": "capex"},
        {"role": "role-cloud",   "loc": "loc-muc", "hours": 30,  "co": "capex"},
    ],
    "svc-sap-ops": [
        {"role": "role-sap",     "loc": "loc-muc", "hours": 60,  "co": "opex"},
        {"role": "role-sysadmin","loc": "loc-pun", "hours": 40,  "co": "opex"},
    ],
    "svc-euc": [
        {"role": "role-sysadmin","loc": "loc-muc", "hours": 60,  "co": "opex"},
        {"role": "role-jr-dev",  "loc": "loc-muc", "hours": 40,  "co": "opex"},
    ],
    "svc-tbs-maint": [
        {"role": "role-dev",     "loc": "loc-muc", "hours": 60,  "co": "opex"},
        {"role": "role-dev",     "loc": "loc-pun", "hours": 40,  "co": "opex"},
        {"role": "role-qa",      "loc": "loc-muc", "hours": 20,  "co": "opex"},
    ],

    # --- Supply Chain & Logistics ---
    "proj-signal": [
        {"role": "role-sr-dev",  "loc": "loc-bud", "hours": 60,  "co": "capex"},
        {"role": "role-dev",     "loc": "loc-bud", "hours": 80,  "co": "capex"},
        {"role": "role-sr-arch", "loc": "loc-bud", "hours": 30,  "co": "capex"},
        {"role": "role-qa",      "loc": "loc-bud", "hours": 30,  "co": "capex"},
    ],
    "proj-raildiag": [
        {"role": "role-sr-dev",  "loc": "loc-bud", "hours": 40,  "co": "capex"},
        {"role": "role-dev",     "loc": "loc-bud", "hours": 60,  "co": "capex"},
        {"role": "role-qa",      "loc": "loc-bud", "hours": 20,  "co": "capex"},
        {"role": "role-ba",      "loc": "loc-pun", "hours": 20,  "co": "capex"},
    ],
    "proj-predmaint": [
        {"role": "role-sr-dev",  "loc": "loc-muc", "hours": 40,  "co": "capex"},
        {"role": "role-dev",     "loc": "loc-pun", "hours": 60,  "co": "capex"},
        {"role": "role-data-eng","loc": "loc-muc", "hours": 30,  "co": "capex"},
        {"role": "role-qa",      "loc": "loc-pun", "hours": 20,  "co": "capex"},
    ],
    "proj-workshop": [
        {"role": "role-dev",     "loc": "loc-bud", "hours": 60,  "co": "capex"},
        {"role": "role-ba",      "loc": "loc-pun", "hours": 20,  "co": "capex"},
        {"role": "role-qa",      "loc": "loc-bud", "hours": 20,  "co": "capex"},
    ],
    "proj-railsafety": [
        {"role": "role-sr-arch", "loc": "loc-muc", "hours": 30,  "co": "capex"},
        {"role": "role-sr-dev",  "loc": "loc-bud", "hours": 60,  "co": "capex"},
        {"role": "role-dev",     "loc": "loc-bud", "hours": 80,  "co": "capex"},
        {"role": "role-qa",      "loc": "loc-bud", "hours": 30,  "co": "capex"},
    ],
    "svc-rail-desk": [
        {"role": "role-sysadmin","loc": "loc-bud", "hours": 60,  "co": "opex"},
        {"role": "role-dev",     "loc": "loc-bud", "hours": 40,  "co": "opex"},
    ],
    "svc-rail-maint": [
        {"role": "role-dev",     "loc": "loc-bud", "hours": 60,  "co": "opex"},
        {"role": "role-qa",      "loc": "loc-bud", "hours": 30,  "co": "opex"},
    ],
    "svc-signal-sup": [
        {"role": "role-sysadmin","loc": "loc-bud", "hours": 40,  "co": "opex"},
        {"role": "role-network", "loc": "loc-bud", "hours": 30,  "co": "opex"},
    ],

    # --- Enterprise Services ---
    "proj-cloud3": [
        {"role": "role-cloud",   "loc": "loc-muc", "hours": 60,  "co": "opex"},
        {"role": "role-cloud",   "loc": "loc-pun", "hours": 40,  "co": "opex"},
        {"role": "role-sysadmin","loc": "loc-muc", "hours": 30,  "co": "opex"},
    ],
    "proj-iam": [
        {"role": "role-network", "loc": "loc-muc", "hours": 40,  "co": "capex"},
        {"role": "role-cloud",   "loc": "loc-muc", "hours": 30,  "co": "capex"},
        {"role": "role-sysadmin","loc": "loc-bud", "hours": 30,  "co": "capex"},
        {"role": "role-dev",     "loc": "loc-muc", "hours": 40,  "co": "capex"},
    ],
    "proj-workplace": [
        {"role": "role-sysadmin","loc": "loc-muc", "hours": 40,  "co": "opex"},
        {"role": "role-cloud",   "loc": "loc-bud", "hours": 40,  "co": "opex"},
        {"role": "role-dev",     "loc": "loc-pun", "hours": 60,  "co": "opex"},
    ],
    "proj-datacenter": [
        {"role": "role-cloud",   "loc": "loc-muc", "hours": 80,  "co": "opex"},
        {"role": "role-sysadmin","loc": "loc-muc", "hours": 60,  "co": "opex"},
        {"role": "role-network", "loc": "loc-muc", "hours": 40,  "co": "opex"},
    ],
    "proj-wan": [
        {"role": "role-network", "loc": "loc-muc", "hours": 60,  "co": "capex"},
        {"role": "role-network", "loc": "loc-bud", "hours": 40,  "co": "capex"},
        {"role": "role-sysadmin","loc": "loc-pun", "hours": 40,  "co": "capex"},
    ],
    "svc-netsec": [
        {"role": "role-network", "loc": "loc-muc", "hours": 40,  "co": "opex"},
        {"role": "role-cloud",   "loc": "loc-muc", "hours": 30,  "co": "opex"},
        {"role": "role-sysadmin","loc": "loc-pun", "hours": 40,  "co": "opex"},
    ],
    "svc-middleware": [
        {"role": "role-sysadmin","loc": "loc-muc", "hours": 50,  "co": "opex"},
        {"role": "role-dev",     "loc": "loc-muc", "hours": 40,  "co": "opex"},
        {"role": "role-dev",     "loc": "loc-bud", "hours": 40,  "co": "opex"},
    ],
    "svc-dba": [
        {"role": "role-sysadmin","loc": "loc-pun", "hours": 50,  "co": "opex"},
        {"role": "role-dev",     "loc": "loc-pun", "hours": 30,  "co": "opex"},
    ],

    # --- Digital & Innovation ---
    "proj-sensor": [
        {"role": "role-data-eng","loc": "loc-muc", "hours": 40,  "co": "capex"},
        {"role": "role-sr-dev",  "loc": "loc-muc", "hours": 40,  "co": "capex"},
        {"role": "role-dev",     "loc": "loc-pun", "hours": 40,  "co": "capex"},
        {"role": "role-cloud",   "loc": "loc-bud", "hours": 30,  "co": "capex"},
    ],
    "proj-fleet": [
        {"role": "role-sr-dev",  "loc": "loc-bud", "hours": 40,  "co": "capex"},
        {"role": "role-dev",     "loc": "loc-bud", "hours": 60,  "co": "capex"},
        {"role": "role-dev",     "loc": "loc-pun", "hours": 40,  "co": "capex"},
        {"role": "role-qa",      "loc": "loc-bud", "hours": 20,  "co": "capex"},
    ],
    "proj-telematics": [
        {"role": "role-data-eng","loc": "loc-bud", "hours": 40,  "co": "capex"},
        {"role": "role-dev",     "loc": "loc-bud", "hours": 40,  "co": "capex"},
        {"role": "role-qa",      "loc": "loc-bud", "hours": 20,  "co": "capex"},
    ],
    "proj-dwh": [
        {"role": "role-data-eng","loc": "loc-muc", "hours": 60,  "co": "capex"},
        {"role": "role-data-eng","loc": "loc-bud", "hours": 40,  "co": "capex"},
        {"role": "role-data-sci","loc": "loc-muc", "hours": 30,  "co": "capex"},
        {"role": "role-dev",     "loc": "loc-pun", "hours": 40,  "co": "capex"},
    ],
    "proj-aiml": [
        {"role": "role-data-sci","loc": "loc-muc", "hours": 40,  "co": "opex"},
        {"role": "role-data-eng","loc": "loc-bud", "hours": 40,  "co": "opex"},
        {"role": "role-dev",     "loc": "loc-pun", "hours": 30,  "co": "opex"},
    ],
    "svc-dataplatform": [
        {"role": "role-data-eng","loc": "loc-muc", "hours": 40,  "co": "opex"},
        {"role": "role-sysadmin","loc": "loc-bud", "hours": 30,  "co": "opex"},
    ],
    "svc-iot": [
        {"role": "role-cloud",   "loc": "loc-bud", "hours": 30,  "co": "opex"},
        {"role": "role-sysadmin","loc": "loc-pun", "hours": 30,  "co": "opex"},
    ],
}

# ---------------------------------------------------------------------------
# External Cost Line Items per Project
# Each: {desc, cat, vendor, co (capex/opex), base (monthly baseline EUR),
#         fcst (monthly forecast if differs from base, or None)}
# ---------------------------------------------------------------------------

PROJECT_EXTERNALS = {
    "proj-erp2": [
        {"desc": "SAP Implementation Support",       "cat": "ext-consulting",   "vendor": "Deloitte",         "co": "capex", "base": 15000},
        {"desc": "Process Advisory",                  "cat": "ext-consulting",   "vendor": "MHP Consulting",   "co": "capex", "base": 5000},
        {"desc": "Application Developers (3 FTE)",    "cat": "ext-leased-staff", "vendor": "TCS",              "co": "capex", "base": 12000},
        {"desc": "Azure DevOps Licenses",             "cat": "ext-sw-licenses",  "vendor": "Microsoft",        "co": "opex",  "base": 2000},
        {"desc": "SAP S/4HANA Certification",         "cat": "ext-training",     "vendor": "SAP Education",    "co": "opex",  "base": 3000},
        {"desc": "Munich-Budapest Team Visits",       "cat": "ext-travel",       "vendor": None,               "co": "opex",  "base": 1500},
        {"desc": "Penetration Testing",               "cat": "ext-other",        "vendor": "SecureWorks",      "co": "opex",  "base": 2000},
    ],
    "proj-sap": [
        {"desc": "SAP Consulting Services",           "cat": "ext-consulting",   "vendor": "Accenture",        "co": "capex", "base": 20000},
        {"desc": "SAP License Fees",                  "cat": "ext-sw-licenses",  "vendor": "SAP",              "co": "capex", "base": 8000},
        {"desc": "Cloud Infrastructure",              "cat": "ext-cloud",        "vendor": "AWS",              "co": "capex", "base": 5000},
        {"desc": "SAP Training Programme",            "cat": "ext-training",     "vendor": "SAP Education",    "co": "opex",  "base": 2000},
        {"desc": "SAP Maintenance Support",           "cat": "ext-sw-maint",     "vendor": "SAP",              "co": "opex",  "base": 3000},
    ],
    "proj-brake": [
        {"desc": "Embedded Systems Consulting",       "cat": "ext-consulting",   "vendor": "Vector Informatik","co": "capex", "base": 4000},
        {"desc": "Test Equipment Maintenance",        "cat": "ext-hw-maint",     "vendor": "National Instruments","co": "capex","base": 2000},
        {"desc": "Munich-Budapest Travel",            "cat": "ext-travel",       "vendor": None,               "co": "opex",  "base": 1000},
    ],
    "proj-autobrake": [
        {"desc": "ADAS Consulting",                   "cat": "ext-consulting",   "vendor": "Continental Engineering","co": "capex","base": 8000},
        {"desc": "Simulation Platform License",       "cat": "ext-sw-licenses",  "vendor": "dSPACE",           "co": "capex", "base": 5000},
        {"desc": "GPU Cloud Compute",                 "cat": "ext-cloud",        "vendor": "AWS",              "co": "capex", "base": 6000},
        {"desc": "Safety Certification",              "cat": "ext-other",        "vendor": "TUV Rheinland",    "co": "capex", "base": 3000},
    ],
    "proj-legacy": [
        {"desc": "Decommission Advisory",             "cat": "ext-consulting",   "vendor": "Capgemini",        "co": "opex",  "base": 3000},
        {"desc": "Data Migration Tools",              "cat": "ext-sw-licenses",  "vendor": "Informatica",      "co": "opex",  "base": 2000},
    ],
    "proj-connveh": [
        {"desc": "Connected Platform Consulting",     "cat": "ext-consulting",   "vendor": "Bosch Engineering","co": "capex", "base": 10000},
        {"desc": "Azure IoT Hub",                     "cat": "ext-cloud",        "vendor": "Microsoft",        "co": "capex", "base": 8000},
        {"desc": "V2X Communication Licenses",        "cat": "ext-sw-licenses",  "vendor": "Qualcomm",         "co": "capex", "base": 5000},
        {"desc": "Cybersecurity Assessment",          "cat": "ext-other",        "vendor": "NCC Group",        "co": "capex", "base": 3000},
    ],
    "svc-sap-ops": [
        {"desc": "SAP Basis Support",                 "cat": "ext-sw-maint",     "vendor": "SAP",              "co": "opex",  "base": 5000},
        {"desc": "Infrastructure Hosting",            "cat": "ext-cloud",        "vendor": "AWS",              "co": "opex",  "base": 4000},
    ],
    "svc-euc": [
        {"desc": "Helpdesk Software License",         "cat": "ext-sw-licenses",  "vendor": "ServiceNow",       "co": "opex",  "base": 2500},
        {"desc": "Hardware Refresh Cycle",             "cat": "ext-hw-maint",     "vendor": "Dell",             "co": "opex",  "base": 3000},
    ],
    "svc-tbs-maint": [
        {"desc": "Application Monitoring",            "cat": "ext-sw-licenses",  "vendor": "Datadog",          "co": "opex",  "base": 2000},
        {"desc": "Vendor Support Contracts",          "cat": "ext-sw-maint",     "vendor": "Various",          "co": "opex",  "base": 3000},
    ],

    # --- Supply Chain & Logistics ---
    "proj-signal": [
        {"desc": "Signaling Consulting",              "cat": "ext-consulting",   "vendor": "Siemens Mobility", "co": "capex", "base": 10000},
        {"desc": "Safety Certification",              "cat": "ext-other",        "vendor": "TUV Rheinland",    "co": "capex", "base": 4000},
        {"desc": "Test Equipment Maintenance",        "cat": "ext-hw-maint",     "vendor": "Keysight",         "co": "capex", "base": 3000},
        {"desc": "Cross-Location Travel",             "cat": "ext-travel",       "vendor": None,               "co": "opex",  "base": 1500},
    ],
    "proj-raildiag": [
        {"desc": "Diagnostics Platform License",      "cat": "ext-sw-licenses",  "vendor": "PTC",              "co": "capex", "base": 3000},
        {"desc": "Cloud Hosting",                     "cat": "ext-cloud",        "vendor": "Azure",            "co": "capex", "base": 4000},
        {"desc": "Domain Consulting",                 "cat": "ext-consulting",   "vendor": "Ricardo Rail",     "co": "capex", "base": 3000},
    ],
    "proj-predmaint": [
        {"desc": "ML Platform License",               "cat": "ext-sw-licenses",  "vendor": "Databricks",       "co": "capex", "base": 4000},
        {"desc": "Predictive Analytics Consulting",   "cat": "ext-consulting",   "vendor": "McKinsey Digital", "co": "capex", "base": 6000},
        {"desc": "Sensor Data Cloud Storage",         "cat": "ext-cloud",        "vendor": "AWS",              "co": "capex", "base": 3000},
    ],
    "proj-workshop": [
        {"desc": "UX Design Consulting",              "cat": "ext-consulting",   "vendor": "Ergosign",         "co": "capex", "base": 3000},
        {"desc": "Cloud Hosting",                     "cat": "ext-cloud",        "vendor": "Azure",            "co": "capex", "base": 2000},
    ],
    "proj-railsafety": [
        {"desc": "Safety Standards Consulting",       "cat": "ext-consulting",   "vendor": "Ricardo Rail",     "co": "capex", "base": 6000},
        {"desc": "Compliance Software License",       "cat": "ext-sw-licenses",  "vendor": "Siemens",          "co": "capex", "base": 4000},
        {"desc": "Hardware Certification Equipment",  "cat": "ext-hw-maint",     "vendor": "Keysight",         "co": "capex", "base": 2000},
    ],
    "svc-rail-desk": [
        {"desc": "ITSM Platform License",             "cat": "ext-sw-licenses",  "vendor": "ServiceNow",       "co": "opex",  "base": 3000},
        {"desc": "Remote Support Tools",              "cat": "ext-sw-maint",     "vendor": "TeamViewer",       "co": "opex",  "base": 1500},
    ],
    "svc-rail-maint": [
        {"desc": "Application Monitoring",            "cat": "ext-sw-licenses",  "vendor": "Dynatrace",        "co": "opex",  "base": 3000},
        {"desc": "Vendor Support Agreements",         "cat": "ext-sw-maint",     "vendor": "Various",          "co": "opex",  "base": 2500},
    ],
    "svc-signal-sup": [
        {"desc": "Signaling Equipment Support",       "cat": "ext-hw-maint",     "vendor": "Siemens Mobility", "co": "opex",  "base": 3000},
        {"desc": "Remote Monitoring License",         "cat": "ext-sw-licenses",  "vendor": "Siemens",          "co": "opex",  "base": 2000},
    ],

    # --- Enterprise Services ---
    "proj-cloud3": [
        {"desc": "AWS EC2 Reserved Instances",        "cat": "ext-cloud",        "vendor": "AWS",              "co": "opex",  "base": 10000},
        {"desc": "AWS S3 Storage",                    "cat": "ext-cloud",        "vendor": "AWS",              "co": "opex",  "base": 4000},
        {"desc": "Cloud Architecture Advisory",       "cat": "ext-consulting",   "vendor": "Accenture",        "co": "opex",  "base": 5000},
        {"desc": "AWS Training",                      "cat": "ext-training",     "vendor": "AWS Training",     "co": "opex",  "base": 2000},
    ],
    "proj-iam": [
        {"desc": "ServiceNow ITSM Licenses",         "cat": "ext-sw-licenses",  "vendor": "ServiceNow",       "co": "capex", "base": 4000},
        {"desc": "Security Assessment",               "cat": "ext-consulting",   "vendor": "PwC",              "co": "capex", "base": 5000},
        {"desc": "Security Consultant (1 FTE)",       "cat": "ext-leased-staff", "vendor": "Hays",             "co": "capex", "base": 6000},
        {"desc": "Cisco Network Equipment Support",   "cat": "ext-hw-maint",     "vendor": "Cisco",            "co": "opex",  "base": 2000},
        {"desc": "Cybersecurity Awareness Training",  "cat": "ext-training",     "vendor": "Internal",         "co": "opex",  "base": 1500},
    ],
    "proj-workplace": [
        {"desc": "Workplace Design Consulting",       "cat": "ext-consulting",   "vendor": "Accenture",        "co": "opex",  "base": 4000},
        {"desc": "Microsoft 365 Licenses",            "cat": "ext-sw-licenses",  "vendor": "Microsoft",        "co": "opex",  "base": 5000},
        {"desc": "Device Management Platform",        "cat": "ext-sw-maint",     "vendor": "VMware",           "co": "opex",  "base": 2000},
    ],
    "proj-datacenter": [
        {"desc": "Migration Consulting",              "cat": "ext-consulting",   "vendor": "IBM",              "co": "opex",  "base": 8000},
        {"desc": "Server Decommission Services",      "cat": "ext-infra-onprem", "vendor": "HP Enterprise",    "co": "opex",  "base": 5000},
        {"desc": "Network Infrastructure",            "cat": "ext-hw-maint",     "vendor": "Cisco",            "co": "opex",  "base": 4000},
    ],
    "proj-wan": [
        {"desc": "WAN Equipment",                     "cat": "ext-infra-onprem", "vendor": "Cisco",            "co": "capex", "base": 8000},
        {"desc": "Network Consulting",                "cat": "ext-consulting",   "vendor": "NTT Communications","co":"capex", "base": 5000},
        {"desc": "Installation Services",             "cat": "ext-other",        "vendor": "Local contractors", "co": "capex", "base": 3000},
    ],
    "svc-netsec": [
        {"desc": "Firewall Licenses",                 "cat": "ext-sw-licenses",  "vendor": "Palo Alto",        "co": "opex",  "base": 4000},
        {"desc": "SIEM Platform",                     "cat": "ext-sw-licenses",  "vendor": "Splunk",           "co": "opex",  "base": 5000},
        {"desc": "Managed SOC Service",               "cat": "ext-consulting",   "vendor": "SecureWorks",      "co": "opex",  "base": 3000},
    ],
    "svc-middleware": [
        {"desc": "Middleware Licenses",               "cat": "ext-sw-licenses",  "vendor": "IBM",              "co": "opex",  "base": 4000},
        {"desc": "Vendor Support",                    "cat": "ext-sw-maint",     "vendor": "IBM",              "co": "opex",  "base": 2000},
    ],
    "svc-dba": [
        {"desc": "Database Licenses",                 "cat": "ext-sw-licenses",  "vendor": "Oracle",           "co": "opex",  "base": 3000},
        {"desc": "Database Support Contract",         "cat": "ext-sw-maint",     "vendor": "Oracle",           "co": "opex",  "base": 2000},
    ],

    # --- Digital & Innovation ---
    "proj-sensor": [
        {"desc": "Data Engineering Consulting",       "cat": "ext-consulting",   "vendor": "Thoughtworks",     "co": "capex", "base": 10000},
        {"desc": "AWS Kinesis + S3 Pipeline",         "cat": "ext-cloud",        "vendor": "AWS",              "co": "capex", "base": 6000},
        {"desc": "Kafka License",                     "cat": "ext-sw-licenses",  "vendor": "Confluent",        "co": "capex", "base": 3000},
        {"desc": "IoT Sensor Calibration",            "cat": "ext-other",        "vendor": "Bosch Sensortec",  "co": "capex", "base": 2000},
    ],
    "proj-fleet": [
        {"desc": "UX/UI Design Agency",               "cat": "ext-consulting",   "vendor": "Frog Design",      "co": "capex", "base": 5000},
        {"desc": "Cloud Hosting",                     "cat": "ext-cloud",        "vendor": "Azure",            "co": "capex", "base": 4000},
        {"desc": "Mapping API License",               "cat": "ext-sw-licenses",  "vendor": "HERE Technologies","co": "capex", "base": 2000},
    ],
    "proj-telematics": [
        {"desc": "Telematics Platform License",       "cat": "ext-sw-licenses",  "vendor": "Geotab",           "co": "capex", "base": 4000},
        {"desc": "Cloud Infrastructure",              "cat": "ext-cloud",        "vendor": "AWS",              "co": "capex", "base": 5000},
        {"desc": "Domain Consulting",                 "cat": "ext-consulting",   "vendor": "Bosch Connected",  "co": "capex", "base": 3000},
    ],
    "proj-dwh": [
        {"desc": "Snowflake Enterprise",              "cat": "ext-cloud",        "vendor": "Snowflake",        "co": "capex", "base": 8000},
        {"desc": "ETL Consulting",                    "cat": "ext-consulting",   "vendor": "Informatica",      "co": "capex", "base": 5000},
        {"desc": "Data Quality Tools",                "cat": "ext-sw-licenses",  "vendor": "Talend",           "co": "capex", "base": 3000},
    ],
    "proj-aiml": [
        {"desc": "GPU Cloud Compute",                 "cat": "ext-cloud",        "vendor": "AWS",              "co": "opex",  "base": 5000},
        {"desc": "ML Platform License",               "cat": "ext-sw-licenses",  "vendor": "Weights & Biases", "co": "opex",  "base": 2000},
        {"desc": "AI Consulting",                     "cat": "ext-consulting",   "vendor": "DataRobot",        "co": "opex",  "base": 3000},
    ],
    "svc-dataplatform": [
        {"desc": "Data Platform Hosting",             "cat": "ext-cloud",        "vendor": "AWS",              "co": "opex",  "base": 4000},
        {"desc": "Monitoring & Observability",        "cat": "ext-sw-licenses",  "vendor": "Datadog",          "co": "opex",  "base": 2000},
    ],
    "svc-iot": [
        {"desc": "IoT Hub Hosting",                   "cat": "ext-cloud",        "vendor": "Azure",            "co": "opex",  "base": 3000},
        {"desc": "Device Management License",         "cat": "ext-sw-licenses",  "vendor": "AWS IoT",          "co": "opex",  "base": 2000},
    ],
}

# ---------------------------------------------------------------------------
# Forecast Adjustments for troubled/scope-change projects
# Key = project_id.  internal/external overrides with from_month.
# ---------------------------------------------------------------------------

FORECAST_ADJUSTMENTS = {
    "proj-erp2": {
        "internal": [
            # SR Dev MUC hours increased from 80 to 100 from 2025-07 (CR impact)
            {"role": "role-sr-dev", "loc": "loc-muc", "from": "2025-07", "hours": 100},
        ],
        "external": [
            # Deloitte consulting increased from 15K to 22K from 2025-07
            {"desc": "SAP Implementation Support", "from": "2025-07", "amount": 22000},
            # TCS leased staff increased from 12K to 15K from 2025-10
            {"desc": "Application Developers (3 FTE)", "from": "2025-10", "amount": 15000},
        ],
    },
    "proj-sensor": {
        "internal": [
            # Dev PUN increased from 40 to 50 from 2026-03
            {"role": "role-dev", "loc": "loc-pun", "from": "2026-03", "hours": 50},
        ],
        "external": [
            # Consulting increased from 10K to 14K from 2026-01
            {"desc": "Data Engineering Consulting", "from": "2026-01", "amount": 14000},
            # Cloud costs increased from 6K to 9K from 2026-01
            {"desc": "AWS Kinesis + S3 Pipeline", "from": "2026-01", "amount": 9000},
        ],
    },
    "proj-iam": {
        "external": [
            # ServiceNow licensing surprise: 4K to 5600 from 2025-09 (40% increase)
            {"desc": "ServiceNow ITSM Licenses", "from": "2025-09", "amount": 5600},
            # Additional security consultant added from 2025-07
            {"desc": "Security Consultant (1 FTE)", "from": "2025-07", "amount": 8000},
        ],
    },
    "proj-telematics": {
        "external": [
            # Cloud costs up due to scope (5K to 6500)
            {"desc": "Cloud Infrastructure", "from": "2026-01", "amount": 6500},
        ],
    },
}

# ---------------------------------------------------------------------------
# Allocation overrides — narrative-specific person assignments
# These override the auto-generated allocations from PROJECT_STAFFING
# to create specific demo narratives (over-allocation, unconfirmed, etc.)
# ---------------------------------------------------------------------------

ASSIGNMENT_OVERRIDES = {
    # p-fischer over-allocation on proj-erp2 (troubled project narrative)
    # Shows 106% utilization in Mar-May 2026 on capacity heatmap
    ("p-fischer", "proj-erp2"): {
        "base_hours": 80,
        "overrides": {"2026-03": 110, "2026-04": 110, "2026-05": 110},
        "unconfirmed_range": ("2026-04", "2026-07"),
    },
    # p-szabo over-allocation on proj-fleet
    # Shows over-utilization in Mar-May 2026 (combined with signal + raildiag)
    ("p-szabo", "proj-fleet"): {
        "base_hours": 40,
        "overrides": {"2026-03": 80, "2026-04": 80, "2026-05": 80},
    },
}

# ---------------------------------------------------------------------------
# Change Request definitions
# ---------------------------------------------------------------------------

CHANGE_REQUESTS = [
    # ---- ERP Integration Phase 2: 8 historical + 1 active (CR-A) ----
    {"id": 1,  "proj": "proj-erp2", "by": "p-sharma", "ts": "2024-10-15 09:30:00", "status": "approved", "cat": "resource",      "summary": "Increase Sr Developer hours to address integration backlog",
     "justification": "Integration testing revealed more complex data mappings than anticipated.", "cc_owner": "p-brenner", "cc_ts": "2024-10-16 11:00:00", "cc_status": "confirmed", "ctrl": "p-meier", "ctrl_ts": "2024-10-17 14:00:00", "ctrl_status": "approved",
     "details": [{"field": "role-sr-dev (MUC) hours", "old": "80", "new": "100", "delta": "+20 hrs/mo", "type": "role-sr-dev", "month": "2025-07"}]},
    {"id": 2,  "proj": "proj-erp2", "by": "p-sharma", "ts": "2024-11-20 10:00:00", "status": "approved", "cat": "external_cost", "summary": "Increase Deloitte consulting budget for extended SAP support",
     "justification": "Deloitte advisory scope expanded to cover additional module integrations.", "cc_owner": "p-brenner", "cc_ts": "2024-11-21 09:00:00", "cc_status": "confirmed", "ctrl": "p-meier", "ctrl_ts": "2024-11-22 16:00:00", "ctrl_status": "approved",
     "details": [{"field": "SAP Implementation Support", "old": "15000", "new": "22000", "delta": "+7000 EUR/mo", "type": "ext-consulting", "month": "2025-07"}]},
    {"id": 3,  "proj": "proj-erp2", "by": "p-sharma", "ts": "2025-01-10 11:00:00", "status": "approved", "cat": "resource",      "summary": "Add TCS developers for data migration sprint",
     "justification": "Data migration requires additional hands-on development capacity.", "cc_owner": "p-brenner", "cc_ts": "2025-01-11 10:00:00", "cc_status": "confirmed", "ctrl": "p-meier", "ctrl_ts": "2025-01-13 09:00:00", "ctrl_status": "approved",
     "details": [{"field": "Leased Staff (TCS) amount", "old": "12000", "new": "15000", "delta": "+3000 EUR/mo", "type": "ext-leased-staff", "month": "2025-10"}]},
    {"id": 4,  "proj": "proj-erp2", "by": "p-sharma", "ts": "2025-03-18 14:00:00", "status": "approved", "cat": "scope",         "summary": "Extend scope to include warehouse management module",
     "justification": "Business stakeholders requested WMS integration as part of Phase 2.", "cc_owner": "p-brenner", "cc_ts": "2025-03-19 10:00:00", "cc_status": "confirmed", "ctrl": "p-meier", "ctrl_ts": "2025-03-20 11:00:00", "ctrl_status": "approved",
     "details": [{"field": "Project scope", "old": "Core ERP modules", "new": "Core + WMS", "delta": "Added WMS module", "type": None, "month": None}]},
    {"id": 5,  "proj": "proj-erp2", "by": "p-sharma", "ts": "2025-06-05 09:00:00", "status": "approved", "cat": "timeline",      "summary": "Extend project end date by 3 months",
     "justification": "WMS integration and testing require additional time.", "cc_owner": "p-brenner", "cc_ts": "2025-06-06 15:00:00", "cc_status": "confirmed", "ctrl": "p-meier", "ctrl_ts": "2025-06-09 10:00:00", "ctrl_status": "approved",
     "details": [{"field": "End date", "old": "2026-06", "new": "2026-09", "delta": "+3 months", "type": None, "month": None}]},
    {"id": 6,  "proj": "proj-erp2", "by": "p-sharma", "ts": "2025-08-12 10:30:00", "status": "approved", "cat": "resource",      "summary": "Increase QA hours for regression testing",
     "justification": "Extended scope requires more thorough regression testing cycles.", "cc_owner": "p-brenner", "cc_ts": "2025-08-13 11:00:00", "cc_status": "confirmed", "ctrl": "p-meier", "ctrl_ts": "2025-08-14 14:00:00", "ctrl_status": "approved",
     "details": [{"field": "role-qa (MUC) hours", "old": "40", "new": "50", "delta": "+10 hrs/mo", "type": "role-qa", "month": "2025-09"}]},
    {"id": 7,  "proj": "proj-erp2", "by": "p-sharma", "ts": "2025-11-03 09:00:00", "status": "approved", "cat": "external_cost", "summary": "Additional penetration testing round for WMS",
     "justification": "Security team mandated pen-test for new WMS module before go-live.", "cc_owner": "p-brenner", "cc_ts": "2025-11-04 10:00:00", "cc_status": "confirmed", "ctrl": "p-meier", "ctrl_ts": "2025-11-05 11:00:00", "ctrl_status": "approved",
     "details": [{"field": "Penetration Testing", "old": "2000", "new": "3500", "delta": "+1500 EUR/mo", "type": "ext-other", "month": "2026-01"}]},
    {"id": 8,  "proj": "proj-erp2", "by": "p-sharma", "ts": "2026-01-20 10:00:00", "status": "approved", "cat": "resource",      "summary": "Extend Sr Dev PUN allocation through project end",
     "justification": "Pune team essential for final integration and go-live support.", "cc_owner": "p-brenner", "cc_ts": "2026-01-21 09:00:00", "cc_status": "confirmed", "ctrl": "p-meier", "ctrl_ts": "2026-01-22 14:00:00", "ctrl_status": "approved",
     "details": [{"field": "role-sr-dev (PUN) hours", "old": "40", "new": "50", "delta": "+10 hrs/mo", "type": "role-sr-dev", "month": "2026-02"}]},

    # CR-A: Active — pending CC confirmation
    {"id": 9,  "proj": "proj-erp2", "by": "p-sharma", "ts": "2026-03-05 09:00:00", "status": "pending_cc_confirmation", "cat": "resource",
     "summary": "Increase Sr Developer MUC hours Apr-Jun 2026 + extend Deloitte consulting through Q3",
     "justification": "Final sprint for go-live requires additional senior capacity and continued advisory support.",
     "cc_owner": "p-brenner", "cc_ts": None, "cc_status": "pending", "ctrl": None, "ctrl_ts": None, "ctrl_status": None,
     "details": [
         {"field": "role-sr-dev (MUC) hours Apr-Jun", "old": "100", "new": "120", "delta": "+20 hrs/mo", "type": "role-sr-dev", "month": "2026-04"},
         {"field": "SAP Implementation Support extension", "old": "Ends 2026-06", "new": "Extends to 2026-09", "delta": "+3 months", "type": "ext-consulting", "month": "2026-07"},
     ]},

    # ---- SAP S/4HANA: 3 CRs ----
    {"id": 10, "proj": "proj-sap",  "by": "p-mueller","ts": "2024-06-10 10:00:00", "status": "approved", "cat": "resource",      "summary": "Rebalance developer hours between MUC and BUD",
     "justification": "Budapest team has capacity to take on more migration tasks.", "cc_owner": "p-brenner", "cc_ts": "2024-06-11 11:00:00", "cc_status": "confirmed", "ctrl": "p-meier", "ctrl_ts": "2024-06-12 09:00:00", "ctrl_status": "approved",
     "details": [{"field": "role-dev (BUD) hours", "old": "60", "new": "80", "delta": "+20 hrs/mo", "type": "role-dev", "month": "2024-07"}]},
    {"id": 11, "proj": "proj-sap",  "by": "p-mueller","ts": "2025-04-15 09:00:00", "status": "approved", "cat": "external_cost", "summary": "Switch SAP consulting vendor for cutover phase",
     "justification": "Accenture cutover team better suited than original vendor.", "cc_owner": "p-brenner", "cc_ts": "2025-04-16 10:00:00", "cc_status": "confirmed", "ctrl": "p-meier", "ctrl_ts": "2025-04-17 14:00:00", "ctrl_status": "approved",
     "details": [{"field": "SAP Consulting vendor", "old": "Deloitte", "new": "Accenture", "delta": "Vendor change", "type": "ext-consulting", "month": None}]},

    # CR-C: Active — pending controller approval (reduction)
    {"id": 12, "proj": "proj-sap",  "by": "p-mueller","ts": "2026-03-01 10:00:00", "status": "pending_controller_approval", "cat": "resource",
     "summary": "Cut 2 roles for final 3 months as project winds down",
     "justification": "Migration complete, only monitoring and handover remaining. Proactive cost reduction.",
     "cc_owner": "p-brenner", "cc_ts": "2026-03-02 11:00:00", "cc_status": "confirmed", "ctrl": "p-meier", "ctrl_ts": None, "ctrl_status": "pending",
     "details": [
         {"field": "role-dev (BUD) hours", "old": "80", "new": "0", "delta": "-80 hrs/mo", "type": "role-dev", "month": "2026-04"},
         {"field": "role-qa (BUD) hours", "old": "40", "new": "0", "delta": "-40 hrs/mo", "type": "role-qa", "month": "2026-04"},
     ]},

    # ---- Sensor Data Pipeline: 2 historical + CR-B active ----
    {"id": 13, "proj": "proj-sensor","by": "p-sharma", "ts": "2025-10-01 09:00:00", "status": "approved", "cat": "external_cost", "summary": "Increase consulting budget for data quality issues",
     "justification": "Sensor data quality worse than expected, requiring additional Thoughtworks support.", "cc_owner": "p-brenner", "cc_ts": "2025-10-02 11:00:00", "cc_status": "confirmed", "ctrl": "p-meier", "ctrl_ts": "2025-10-03 14:00:00", "ctrl_status": "approved",
     "details": [{"field": "Data Engineering Consulting", "old": "10000", "new": "14000", "delta": "+4000 EUR/mo", "type": "ext-consulting", "month": "2026-01"}]},
    {"id": 14, "proj": "proj-sensor","by": "p-sharma", "ts": "2025-12-15 10:00:00", "status": "approved", "cat": "external_cost", "summary": "Scale up AWS pipeline infrastructure",
     "justification": "Production data volumes require larger Kinesis streams and S3 capacity.", "cc_owner": "p-brenner", "cc_ts": "2025-12-16 09:00:00", "cc_status": "confirmed", "ctrl": "p-meier", "ctrl_ts": "2025-12-17 11:00:00", "ctrl_status": "approved",
     "details": [{"field": "AWS Kinesis + S3 Pipeline", "old": "6000", "new": "9000", "delta": "+3000 EUR/mo", "type": "ext-cloud", "month": "2026-01"}]},

    # CR-B: Active — pending CC confirmation
    {"id": 15, "proj": "proj-sensor","by": "p-sharma", "ts": "2026-03-08 09:30:00", "status": "pending_cc_confirmation", "cat": "external_cost",
     "summary": "Add AWS infrastructure scaling costs for production rollout",
     "justification": "Production deployment requires additional infrastructure capacity beyond development estimates.",
     "cc_owner": "p-brenner", "cc_ts": None, "cc_status": "pending", "ctrl": None, "ctrl_ts": None, "ctrl_status": None,
     "details": [{"field": "New: AWS Production Infrastructure", "old": "0", "new": "5000", "delta": "+5000 EUR/mo", "type": "ext-cloud", "month": "2026-04"}]},

    # ---- IAM Overhaul: 2 approved + 1 rejected ----
    {"id": 16, "proj": "proj-iam",  "by": "p-frank",  "ts": "2025-05-20 10:00:00", "status": "approved", "cat": "external_cost", "summary": "Extend PwC security assessment for additional scope",
     "justification": "Initial assessment revealed need for extended evaluation of legacy IAM components.", "cc_owner": "p-brenner", "cc_ts": "2025-05-21 11:00:00", "cc_status": "confirmed", "ctrl": "p-meier", "ctrl_ts": "2025-05-22 14:00:00", "ctrl_status": "approved",
     "details": [{"field": "Security Assessment", "old": "5000", "new": "7000", "delta": "+2000 EUR/mo", "type": "ext-consulting", "month": "2025-06"}]},
    {"id": 17, "proj": "proj-iam",  "by": "p-frank",  "ts": "2025-09-10 09:00:00", "status": "approved", "cat": "external_cost", "summary": "ServiceNow licensing cost increase due to vendor pricing change",
     "justification": "ServiceNow changed licensing model. 40% price increase effective immediately. No alternative vendor available in timeline.",
     "cc_owner": "p-brenner", "cc_ts": "2025-09-11 10:00:00", "cc_status": "confirmed", "ctrl": "p-meier", "ctrl_ts": "2025-09-12 16:00:00", "ctrl_status": "approved", "ctrl_comments": "Approved with concern. Please explore alternative vendors for next renewal cycle.",
     "details": [{"field": "ServiceNow ITSM Licenses", "old": "4000", "new": "5600", "delta": "+1600 EUR/mo (+40%)", "type": "ext-sw-licenses", "month": "2025-09"}]},
    {"id": 18, "proj": "proj-iam",  "by": "p-frank",  "ts": "2026-01-15 10:00:00", "status": "rejected", "cat": "scope",         "summary": "Request additional budget for extended timeline",
     "justification": "Project needs 3 more months and additional security consultant to complete migration.",
     "cc_owner": "p-brenner", "cc_ts": "2026-01-16 11:00:00", "cc_status": "confirmed", "ctrl": "p-meier", "ctrl_ts": "2026-01-18 14:00:00", "ctrl_status": "rejected", "ctrl_comments": "Budget increase not justified. Please reduce scope to fit within existing timeline and budget. Consider phasing the migration.",
     "details": [
         {"field": "End date", "old": "2026-09", "new": "2026-12", "delta": "+3 months", "type": None, "month": None},
         {"field": "Security Consultant hours", "old": "6000", "new": "8000", "delta": "+2000 EUR/mo", "type": "ext-leased-staff", "month": "2026-04"},
     ]},

    # CR-D: Active — pending controller approval
    {"id": 19, "proj": "proj-iam",  "by": "p-frank",  "ts": "2026-03-03 10:00:00", "status": "pending_controller_approval", "cat": "external_cost",
     "summary": "Licensing cost increase + additional security consultant for migration complexity",
     "justification": "Vendor licensing model change and additional complexity discovered during implementation require budget adjustment.",
     "cc_owner": "p-brenner", "cc_ts": "2026-03-04 11:00:00", "cc_status": "confirmed", "ctrl": "p-meier", "ctrl_ts": None, "ctrl_status": "pending",
     "details": [
         {"field": "ServiceNow ITSM Licenses", "old": "5600", "new": "6200", "delta": "+600 EUR/mo", "type": "ext-sw-licenses", "month": "2026-04"},
         {"field": "Security Consultant (1 FTE)", "old": "8000", "new": "9500", "delta": "+1500 EUR/mo", "type": "ext-leased-staff", "month": "2026-04"},
     ]},

    # ---- Well-managed projects: 1-2 CRs each ----
    {"id": 20, "proj": "proj-brake", "by": "p-kovacs","ts": "2025-08-15 10:00:00", "status": "approved", "cat": "resource",      "summary": "Adjust QA hours for final testing phase",
     "justification": "Testing phase requires focused QA allocation.", "cc_owner": "p-brenner", "cc_ts": "2025-08-16 09:00:00", "cc_status": "confirmed", "ctrl": "p-meier", "ctrl_ts": "2025-08-17 11:00:00", "ctrl_status": "approved",
     "details": [{"field": "role-qa (BUD) hours", "old": "30", "new": "40", "delta": "+10 hrs/mo", "type": "role-qa", "month": "2025-09"}]},

    {"id": 21, "proj": "proj-raildiag","by": "p-nagy","ts": "2025-11-10 10:00:00", "status": "approved", "cat": "external_cost", "summary": "Upgrade cloud hosting tier for diagnostics platform",
     "justification": "Data volume growth requires higher hosting tier.", "cc_owner": "p-brenner", "cc_ts": "2025-11-11 11:00:00", "cc_status": "confirmed", "ctrl": "p-meier", "ctrl_ts": "2025-11-12 14:00:00", "ctrl_status": "approved",
     "details": [{"field": "Cloud Hosting", "old": "4000", "new": "5000", "delta": "+1000 EUR/mo", "type": "ext-cloud", "month": "2026-01"}]},

    {"id": 22, "proj": "proj-cloud3","by": "p-wagner","ts": "2025-09-20 09:00:00", "status": "approved", "cat": "resource",      "summary": "Reduce consulting hours as migration nears completion",
     "justification": "Internal team now fully ramped, less advisory needed.", "cc_owner": "p-brenner", "cc_ts": "2025-09-21 10:00:00", "cc_status": "confirmed", "ctrl": "p-meier", "ctrl_ts": "2025-09-22 11:00:00", "ctrl_status": "approved",
     "details": [{"field": "Cloud Architecture Advisory", "old": "5000", "new": "3000", "delta": "-2000 EUR/mo", "type": "ext-consulting", "month": "2025-10"}]},

    {"id": 23, "proj": "proj-workplace","by":"p-neumann","ts": "2025-10-05 10:00:00", "status": "approved", "cat": "external_cost","summary": "Add VMware license for expanded device management",
     "justification": "Rollout to additional offices requires expanded device management.", "cc_owner": "p-brenner", "cc_ts": "2025-10-06 09:00:00", "cc_status": "confirmed", "ctrl": "p-meier", "ctrl_ts": "2025-10-07 11:00:00", "ctrl_status": "approved",
     "details": [{"field": "Device Management Platform", "old": "2000", "new": "2500", "delta": "+500 EUR/mo", "type": "ext-sw-maint", "month": "2025-11"}]},

    # Signaling: 2 reduction CRs (winding down)
    {"id": 24, "proj": "proj-signal","by": "p-nagy",  "ts": "2025-12-01 10:00:00", "status": "approved", "cat": "resource",      "summary": "Release developer capacity as commissioning completes",
     "justification": "Commissioning phase completed ahead of schedule. Releasing resources early.", "cc_owner": "p-brenner", "cc_ts": "2025-12-02 09:00:00", "cc_status": "confirmed", "ctrl": "p-meier", "ctrl_ts": "2025-12-03 11:00:00", "ctrl_status": "approved",
     "details": [{"field": "role-dev (BUD) hours", "old": "80", "new": "40", "delta": "-40 hrs/mo", "type": "role-dev", "month": "2026-01"}]},
    {"id": 25, "proj": "proj-signal","by": "p-nagy",  "ts": "2026-02-01 10:00:00", "status": "approved", "cat": "resource",      "summary": "Final resource reduction for project closeout",
     "justification": "Project entering final documentation and handover phase.", "cc_owner": "p-brenner", "cc_ts": "2026-02-02 09:00:00", "cc_status": "confirmed", "ctrl": "p-meier", "ctrl_ts": "2026-02-03 14:00:00", "ctrl_status": "approved",
     "details": [{"field": "role-sr-dev (BUD) hours", "old": "60", "new": "30", "delta": "-30 hrs/mo", "type": "role-sr-dev", "month": "2026-03"}]},

    # Telematics: 1 reduction CR (descoped feature)
    {"id": 26, "proj": "proj-telematics","by":"p-horvath","ts": "2026-01-10 10:00:00", "status": "approved", "cat": "scope",      "summary": "Descope real-time alerting feature to recover schedule",
     "justification": "Behind schedule by 1 month. Removing real-time alerting (moved to v2) to meet delivery date.",
     "cc_owner": "p-brenner", "cc_ts": "2026-01-11 09:00:00", "cc_status": "confirmed", "ctrl": "p-meier", "ctrl_ts": "2026-01-12 11:00:00", "ctrl_status": "approved",
     "details": [{"field": "Scope reduction", "old": "Full feature set", "new": "Core features (no real-time alerts)", "delta": "Descoped 1 feature", "type": None, "month": None}]},

    # CR-E: Active — returned with controller feedback
    {"id": 27, "proj": "proj-predmaint","by":"p-sharma","ts": "2026-02-20 10:00:00", "status": "sent_back_by_controller", "cat": "timeline",
     "summary": "Extend project end date by 3 months for production pilot",
     "justification": "PoC results justify production pilot but require additional time and resources.",
     "cc_owner": "p-brenner", "cc_ts": "2026-02-21 11:00:00", "cc_status": "confirmed", "ctrl": "p-meier", "ctrl_ts": "2026-02-25 14:00:00", "ctrl_status": "sent_back",
     "ctrl_comments": "Timeline extension needs more justification. Please provide detailed milestone plan for the production pilot phase and demonstrate how the additional 3 months maps to specific deliverables.",
     "ctrl_feedback": "The 3-month extension is reasonable but the resource increase is too high. I have reduced Sr Developer hours from 60 to 50 hrs/mo for the extended period and capped the ML Platform License at 3500 EUR/mo instead of 4000.",
     "details": [
         {"field": "End date", "old": "2027-03", "new": "2027-06", "delta": "+3 months", "type": None, "month": None},
         {"field": "role-sr-dev (MUC) hours", "old": "40", "new": "60", "delta": "+20 hrs/mo", "type": "role-sr-dev", "month": "2027-04"},
         {"field": "ML Platform License extension", "old": "Ends 2027-03", "new": "Extends to 2027-06", "delta": "+3 months", "type": "ext-sw-licenses", "month": "2027-04"},
     ],
     "snapshots": [
         {"type": "original", "by": "p-sharma", "data": [
             {"category": "internal", "sub_category": "role-sr-dev", "month": "2027-04", "hours": 60, "amount_eur": 7200},
             {"category": "internal", "sub_category": "role-sr-dev", "month": "2027-05", "hours": 60, "amount_eur": 7200},
             {"category": "internal", "sub_category": "role-sr-dev", "month": "2027-06", "hours": 60, "amount_eur": 7200},
             {"category": "external", "sub_category": "ext-sw-licenses", "month": "2027-04", "hours": None, "amount_eur": 4000},
             {"category": "external", "sub_category": "ext-sw-licenses", "month": "2027-05", "hours": None, "amount_eur": 4000},
             {"category": "external", "sub_category": "ext-sw-licenses", "month": "2027-06", "hours": None, "amount_eur": 4000},
         ]},
         {"type": "controller_proposed", "by": "p-meier", "comments": "Reduced Sr Dev hours to 50/mo and ML license to 3500/mo for extended period.", "data": [
             {"category": "internal", "sub_category": "role-sr-dev", "month": "2027-04", "hours": 50, "amount_eur": 6000},
             {"category": "internal", "sub_category": "role-sr-dev", "month": "2027-05", "hours": 50, "amount_eur": 6000},
             {"category": "internal", "sub_category": "role-sr-dev", "month": "2027-06", "hours": 50, "amount_eur": 6000},
             {"category": "external", "sub_category": "ext-sw-licenses", "month": "2027-04", "hours": None, "amount_eur": 3500},
             {"category": "external", "sub_category": "ext-sw-licenses", "month": "2027-05", "hours": None, "amount_eur": 3500},
             {"category": "external", "sub_category": "ext-sw-licenses", "month": "2027-06", "hours": None, "amount_eur": 3500},
         ]},
     ]},

    # Fleet Portal: recently approved CR (action type #7 for PL)
    {"id": 28, "proj": "proj-fleet","by": "p-sharma", "ts": "2026-03-07 09:00:00", "status": "approved", "cat": "resource",
     "summary": "Adjust developer allocation for final testing sprint",
     "justification": "Final sprint before go-live requires dedicated testing focus.",
     "cc_owner": "p-brenner", "cc_ts": "2026-03-08 10:00:00", "cc_status": "confirmed", "ctrl": "p-meier", "ctrl_ts": "2026-03-10 11:00:00", "ctrl_status": "approved",
     "details": [{"field": "role-dev (BUD) hours", "old": "60", "new": "80", "delta": "+20 hrs/mo", "type": "role-dev", "month": "2026-04"}]},
]

# ---------------------------------------------------------------------------
# Project Phases
# ---------------------------------------------------------------------------

PROJECT_PHASES = {
    # Full phases (4-5)
    "proj-erp2": [
        {"n": 1, "name": "Discovery",  "bs": "2024-07", "be": "2024-10", "fs": "2024-07", "fe": "2024-10", "color": "blue"},
        {"n": 2, "name": "Design",     "bs": "2024-11", "be": "2025-03", "fs": "2024-11", "fe": "2025-04", "color": "teal"},
        {"n": 3, "name": "Build",      "bs": "2025-04", "be": "2025-12", "fs": "2025-05", "fe": "2026-02", "color": "amber"},
        {"n": 4, "name": "Test",       "bs": "2026-01", "be": "2026-04", "fs": "2026-03", "fe": "2026-06", "color": "emerald"},
        {"n": 5, "name": "Rollout",    "bs": "2026-05", "be": "2026-06", "fs": "2026-07", "fe": "2026-09", "color": "violet"},
    ],
    "proj-sap": [
        {"n": 1, "name": "Assessment", "bs": "2022-01", "be": "2022-06", "fs": "2022-01", "fe": "2022-06", "color": "blue"},
        {"n": 2, "name": "Design",     "bs": "2022-07", "be": "2023-06", "fs": "2022-07", "fe": "2023-06", "color": "teal"},
        {"n": 3, "name": "Migration",  "bs": "2023-07", "be": "2025-06", "fs": "2023-07", "fe": "2025-06", "color": "amber"},
        {"n": 4, "name": "Validation", "bs": "2025-07", "be": "2026-03", "fs": "2025-07", "fe": "2026-03", "color": "emerald"},
        {"n": 5, "name": "Go-Live",    "bs": "2026-04", "be": "2026-06", "fs": "2026-04", "fe": "2026-06", "color": "violet"},
    ],
    "proj-signal": [
        {"n": 1, "name": "Requirements",    "bs": "2023-01", "be": "2023-06", "fs": "2023-01", "fe": "2023-06", "color": "blue"},
        {"n": 2, "name": "Engineering",      "bs": "2023-07", "be": "2024-12", "fs": "2023-07", "fe": "2024-12", "color": "teal"},
        {"n": 3, "name": "Integration",      "bs": "2025-01", "be": "2025-09", "fs": "2025-01", "fe": "2025-10", "color": "amber"},
        {"n": 4, "name": "Commissioning",    "bs": "2025-10", "be": "2026-06", "fs": "2025-11", "fe": "2026-06", "color": "emerald"},
    ],
    "proj-connveh": [
        {"n": 1, "name": "Concept",       "bs": "2026-10", "be": "2027-03", "fs": "2026-10", "fe": "2027-03", "color": "blue"},
        {"n": 2, "name": "Architecture",   "bs": "2027-04", "be": "2027-09", "fs": "2027-04", "fe": "2027-09", "color": "teal"},
        {"n": 3, "name": "Development",    "bs": "2027-10", "be": "2028-06", "fs": "2027-10", "fe": "2028-06", "color": "amber"},
        {"n": 4, "name": "Integration",    "bs": "2028-07", "be": "2028-09", "fs": "2028-07", "fe": "2028-09", "color": "emerald"},
        {"n": 5, "name": "Launch",         "bs": "2028-10", "be": "2028-12", "fs": "2028-10", "fe": "2028-12", "color": "violet"},
    ],

    # Partial phases (2-3)
    "proj-raildiag": [
        {"n": 1, "name": "Planning",        "bs": "2024-06", "be": "2024-12", "fs": "2024-06", "fe": "2024-12", "color": "blue"},
        {"n": 2, "name": "Implementation",   "bs": "2025-01", "be": "2026-09", "fs": "2025-01", "fe": "2026-10", "color": "teal"},
        {"n": 3, "name": "Go-Live",          "bs": "2026-10", "be": "2027-06", "fs": "2026-11", "fe": "2027-06", "color": "emerald"},
    ],
    "proj-fleet": [
        {"n": 1, "name": "Development",     "bs": "2025-01", "be": "2025-09", "fs": "2025-01", "fe": "2025-09", "color": "blue"},
        {"n": 2, "name": "Testing",          "bs": "2025-10", "be": "2026-02", "fs": "2025-10", "fe": "2026-03", "color": "teal"},
        {"n": 3, "name": "Deployment",       "bs": "2026-03", "be": "2026-06", "fs": "2026-04", "fe": "2026-06", "color": "emerald"},
    ],
    "proj-iam": [
        {"n": 1, "name": "Assessment",      "bs": "2025-01", "be": "2025-06", "fs": "2025-01", "fe": "2025-06", "color": "blue"},
        {"n": 2, "name": "Implementation",   "bs": "2025-07", "be": "2026-06", "fs": "2025-07", "fe": "2026-07", "color": "teal"},
        {"n": 3, "name": "Rollout",          "bs": "2026-07", "be": "2026-09", "fs": "2026-08", "fe": "2026-09", "color": "emerald"},
    ],
}

# ---------------------------------------------------------------------------
# Scenario Definitions
# ---------------------------------------------------------------------------

SCENARIO_DEFS = [
    {
        "id": 1, "name": "Budget Pressure: 15% Reduction", "status": "published", "author": "p-meier",
        "description": "Targeted budget cuts to achieve 15% reduction across portfolio. Prioritizes deferral of new initiatives and reduction of external consulting spend.",
        "created": "2026-03-07 10:00:00",
        "actions": [
            {"order": 1, "scope": "project", "type": "delay_project",   "proj": "proj-connveh",  "params": '{"delay_months": 6}',                   "impact": '{"budget_delta": -180000}', "label": "Defer new starts"},
            {"order": 2, "scope": "project", "type": "cut_consulting",  "proj": "proj-sensor",   "params": '{"cut_pct": 30, "line": "Data Engineering Consulting"}', "impact": '{"budget_delta": -42000}', "label": "Reduce external consulting"},
            {"order": 3, "scope": "project", "type": "remove_project",  "proj": "proj-aiml",     "params": '{}',                                    "impact": '{"budget_delta": -200000}', "label": "Cancel low-priority"},
            {"order": 4, "scope": "project", "type": "reduce_budget",   "proj": "proj-cloud3",   "params": '{"cut_roles": 2, "from_month": "2026-07"}', "impact": '{"budget_delta": -80000}', "label": "Reduce project scope"},
        ],
    },
    {
        "id": 2, "name": "Accelerate Digital & Data", "status": "private", "author": "p-meier",
        "description": "Invest in data capabilities by accelerating Digital & Data initiatives. Increases headcount in DDA competence centre.",
        "created": "2026-03-10 14:00:00",
        "actions": [
            {"order": 1, "scope": "project", "type": "accelerate_project","proj": "proj-dwh",    "params": '{"advance_months": 3}',                "impact": '{"budget_delta": 120000}', "label": "Pull forward DWH"},
            {"order": 2, "scope": "project", "type": "add_budget",       "proj": "proj-sensor",   "params": '{"add_roles": 3, "role": "role-data-eng"}', "impact": '{"budget_delta": 210000}', "label": "Add Data Engineers"},
            {"order": 3, "scope": "project", "type": "add_budget",       "proj": "proj-aiml",     "params": '{"amount": 100000, "extend_to": "2026-12"}', "impact": '{"budget_delta": 100000}', "label": "Extend AI/ML Lab"},
            {"order": 4, "scope": "project", "type": "add_budget",       "proj": "svc-dataplatform","params": '{"line": "Snowflake Enterprise", "amount": 5000}', "impact": '{"budget_delta": 60000}', "label": "Add Snowflake license"},
        ],
    },
    {
        "id": 3, "name": "Conservative: Freeze New Starts", "status": "published", "author": "p-becker-exec",
        "description": "Freeze all planned future projects and reduce intake pipeline. Models 5% rate escalation for 2027 to assess long-term cost pressure.",
        "created": "2026-03-01 09:00:00",
        "actions": [
            {"order": 1, "scope": "project", "type": "remove_project",  "proj": "proj-connveh",  "params": '{}',                                    "impact": '{"budget_delta": -1800000}', "label": "Freeze future projects"},
            {"order": 2, "scope": "project", "type": "remove_project",  "proj": "proj-railsafety","params": '{}',                                    "impact": '{"budget_delta": -650000}', "label": "Freeze future projects"},
            {"order": 3, "scope": "project", "type": "remove_project",  "proj": "proj-dwh",      "params": '{}',                                    "impact": '{"budget_delta": -550000}', "label": "Freeze future projects"},
            {"order": 4, "scope": "project", "type": "reduce_budget",   "proj": "proj-autobrake", "params": '{"cut_pct": 20}',                       "impact": '{"budget_delta": -180000}', "label": "Reduce intake estimation"},
            {"order": 5, "scope": "portfolio","type": "across_the_board_cut","proj": None,        "params": '{"rate_increase_pct": 5, "from_year": 2027}', "impact": '{"budget_delta": 400000}', "label": "Rate escalation 2027"},
        ],
    },
]
