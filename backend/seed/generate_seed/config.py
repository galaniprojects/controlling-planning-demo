"""
Shared configuration for seed data generation.
Single source of truth for rates, project roster, and utility functions.
"""

DEMO_DATE = "2026-03"
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
# Lines of Business
# ---------------------------------------------------------------------------

LOBS = [
    {"id": "lob-tbs", "name": "Truck & Bus Systems (TBS)", "description": "Largest LoB by budget. Maps to KB CVS division."},
    {"id": "lob-rvs", "name": "Rail Vehicle Systems (RVS)", "description": "Second division. Fewer but bigger projects."},
    {"id": "lob-cit", "name": "Corporate IT",              "description": "Shared/cross-divisional IT. Infrastructure, platforms, security."},
    {"id": "lob-dnd", "name": "Digital & Data",             "description": "Emerging LoB. Analytics, AI, IoT initiatives."},
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
    {"id": "prog-dbp",  "name": "Digital Braking Platform",      "lob_id": "lob-tbs"},
    {"id": "prog-rail", "name": "Rail Modernization",            "lob_id": "lob-rvs"},
    {"id": "prog-infra","name": "Infrastructure Optimization",   "lob_id": "lob-cit"},
    {"id": "prog-fleet","name": "Fleet Intelligence",            "lob_id": "lob-dnd"},
]

# ---------------------------------------------------------------------------
# Project & Service Roster (32 entities)
# ---------------------------------------------------------------------------

PROJECTS = [
    # --- TBS (9) ---
    {"id": "proj-erp2",      "name": "ERP Integration Phase 2",       "lob": "lob-tbs", "prog": "prog-dbp",  "type": "project", "status": "active",           "rag": "red",   "capex_opex": "capex", "start": "2024-07", "end": "2026-09", "budget": 1200000, "narrative": "troubled",           "pl": "p-sharma"},
    {"id": "proj-sap",       "name": "SAP S/4HANA Migration",         "lob": "lob-tbs", "prog": None,        "type": "project", "status": "active",           "rag": "green", "capex_opex": "capex", "start": "2022-01", "end": "2026-06", "budget": 4500000, "narrative": "well_managed",       "pl": None},
    {"id": "proj-brake",     "name": "Brake Control Unit Refresh",    "lob": "lob-tbs", "prog": "prog-dbp",  "type": "project", "status": "active",           "rag": "green", "capex_opex": "capex", "start": "2025-03", "end": "2026-03", "budget": 250000,  "narrative": "nearing_completion", "pl": None},
    {"id": "proj-autobrake", "name": "Autonomous Braking Prototype",  "lob": "lob-tbs", "prog": None,        "type": "project", "status": "pending_approval", "rag": None,    "capex_opex": "capex", "start": "2026-06", "end": "2027-12", "budget": 900000,  "narrative": "intake",            "pl": "p-sharma"},
    {"id": "proj-legacy",    "name": "Legacy System Decommission",    "lob": "lob-tbs", "prog": None,        "type": "project", "status": "completed",        "rag": "green", "capex_opex": "opex",  "start": "2022-06", "end": "2024-03", "budget": 180000,  "narrative": "completed",         "pl": None},
    {"id": "proj-connveh",   "name": "Connected Vehicle Platform",    "lob": "lob-tbs", "prog": None,        "type": "project", "status": "planned",          "rag": "green", "capex_opex": "capex", "start": "2026-10", "end": "2028-12", "budget": 1800000, "narrative": "future",            "pl": None},
    {"id": "svc-sap-ops",    "name": "SAP Basis Operations",          "lob": "lob-tbs", "prog": None,        "type": "service", "status": "active",           "rag": "green", "capex_opex": "opex",  "start": "2024-01", "end": None,      "budget": 400000,  "narrative": "steady_service",    "pl": None},
    {"id": "svc-euc",        "name": "End User Computing Support",    "lob": "lob-tbs", "prog": None,        "type": "service", "status": "active",           "rag": "green", "capex_opex": "opex",  "start": "2024-01", "end": None,      "budget": 200000,  "narrative": "steady_service",    "pl": None},
    {"id": "svc-tbs-maint",  "name": "TBS Application Maintenance",   "lob": "lob-tbs", "prog": None,        "type": "service", "status": "active",           "rag": "green", "capex_opex": "opex",  "start": "2024-01", "end": None,      "budget": 280000,  "narrative": "steady_service",    "pl": None},

    # --- RVS (8) ---
    {"id": "proj-signal",    "name": "Signaling System Upgrade",      "lob": "lob-rvs", "prog": "prog-rail", "type": "project", "status": "active",           "rag": "green", "capex_opex": "capex", "start": "2023-01", "end": "2026-06", "budget": 1500000, "narrative": "nearing_completion", "pl": None},
    {"id": "proj-raildiag",  "name": "Rail Diagnostics Platform",     "lob": "lob-rvs", "prog": "prog-rail", "type": "project", "status": "active",           "rag": "green", "capex_opex": "capex", "start": "2024-06", "end": "2027-06", "budget": 700000,  "narrative": "well_managed",       "pl": None},
    {"id": "proj-predmaint", "name": "Predictive Maintenance PoC",    "lob": "lob-rvs", "prog": None,        "type": "project", "status": "active",           "rag": "amber", "capex_opex": "capex", "start": "2025-06", "end": "2027-03", "budget": 500000,  "narrative": "scope_change",       "pl": "p-sharma"},
    {"id": "proj-workshop",  "name": "Workshop Management Tool",      "lob": "lob-rvs", "prog": None,        "type": "project", "status": "completed",        "rag": "green", "capex_opex": "capex", "start": "2023-01", "end": "2025-06", "budget": 220000,  "narrative": "completed",         "pl": None},
    {"id": "proj-railsafety","name": "Rail Safety Compliance System",  "lob": "lob-rvs", "prog": None,        "type": "project", "status": "planned",          "rag": "green", "capex_opex": "capex", "start": "2026-09", "end": "2028-06", "budget": 650000,  "narrative": "future",            "pl": None},
    {"id": "svc-rail-desk",  "name": "Rail IT Service Desk",          "lob": "lob-rvs", "prog": None,        "type": "service", "status": "active",           "rag": "green", "capex_opex": "opex",  "start": "2024-01", "end": None,      "budget": 250000,  "narrative": "steady_service",    "pl": None},
    {"id": "svc-rail-maint", "name": "Rail Application Maintenance",  "lob": "lob-rvs", "prog": None,        "type": "service", "status": "active",           "rag": "green", "capex_opex": "opex",  "start": "2024-01", "end": None,      "budget": 300000,  "narrative": "steady_service",    "pl": None},
    {"id": "svc-signal-sup", "name": "Signaling Systems Support",     "lob": "lob-rvs", "prog": None,        "type": "service", "status": "active",           "rag": "green", "capex_opex": "opex",  "start": "2024-01", "end": None,      "budget": 180000,  "narrative": "steady_service",    "pl": None},

    # --- Corporate IT (8) ---
    {"id": "proj-cloud3",    "name": "Cloud Migration Wave 3",        "lob": "lob-cit", "prog": "prog-infra","type": "project", "status": "active",           "rag": "green", "capex_opex": "opex",  "start": "2025-01", "end": "2026-06", "budget": 400000,  "narrative": "well_managed",       "pl": None},
    {"id": "proj-iam",       "name": "Identity & Access Management Overhaul", "lob": "lob-cit", "prog": None, "type": "project", "status": "active",          "rag": "amber", "capex_opex": "capex", "start": "2025-01", "end": "2026-09", "budget": 350000,  "narrative": "troubled",          "pl": None},
    {"id": "proj-workplace", "name": "Workplace Modernization",       "lob": "lob-cit", "prog": None,        "type": "project", "status": "active",           "rag": "green", "capex_opex": "opex",  "start": "2025-06", "end": "2026-06", "budget": 300000,  "narrative": "well_managed",       "pl": None},
    {"id": "proj-datacenter","name": "Data Center Consolidation",     "lob": "lob-cit", "prog": None,        "type": "project", "status": "completed",        "rag": "green", "capex_opex": "opex",  "start": "2021-06", "end": "2023-12", "budget": 800000,  "narrative": "completed",         "pl": None},
    {"id": "proj-wan",       "name": "Global WAN Refresh",            "lob": "lob-cit", "prog": None,        "type": "project", "status": "completed",        "rag": "green", "capex_opex": "capex", "start": "2022-01", "end": "2024-06", "budget": 600000,  "narrative": "completed",         "pl": None},
    {"id": "svc-netsec",     "name": "Network & Security Operations", "lob": "lob-cit", "prog": None,        "type": "service", "status": "active",           "rag": "green", "capex_opex": "opex",  "start": "2024-01", "end": None,      "budget": 350000,  "narrative": "steady_service",    "pl": None},
    {"id": "svc-middleware", "name": "Enterprise Middleware",          "lob": "lob-cit", "prog": None,        "type": "service", "status": "active",           "rag": "green", "capex_opex": "opex",  "start": "2024-01", "end": None,      "budget": 280000,  "narrative": "steady_service",    "pl": None},
    {"id": "svc-dba",        "name": "Database Administration",       "lob": "lob-cit", "prog": None,        "type": "service", "status": "active",           "rag": "green", "capex_opex": "opex",  "start": "2024-01", "end": None,      "budget": 180000,  "narrative": "steady_service",    "pl": None},

    # --- Digital & Data (7) ---
    {"id": "proj-sensor",    "name": "Sensor Data Pipeline",          "lob": "lob-dnd", "prog": "prog-fleet","type": "project", "status": "active",           "rag": "amber", "capex_opex": "capex", "start": "2025-03", "end": "2026-12", "budget": 600000,  "narrative": "troubled",          "pl": "p-sharma"},
    {"id": "proj-fleet",     "name": "Fleet Portal v2",               "lob": "lob-dnd", "prog": "prog-fleet","type": "project", "status": "active",           "rag": "green", "capex_opex": "capex", "start": "2025-01", "end": "2026-06", "budget": 450000,  "narrative": "well_managed",       "pl": "p-sharma"},
    {"id": "proj-telematics","name": "Telematics Dashboard",          "lob": "lob-dnd", "prog": "prog-fleet","type": "project", "status": "active",           "rag": "amber", "capex_opex": "capex", "start": "2025-06", "end": "2026-09", "budget": 300000,  "narrative": "troubled",          "pl": None},
    {"id": "proj-dwh",       "name": "Data Warehouse Consolidation",  "lob": "lob-dnd", "prog": None,        "type": "project", "status": "planned",          "rag": "green", "capex_opex": "capex", "start": "2026-07", "end": "2027-09", "budget": 550000,  "narrative": "future",            "pl": None},
    {"id": "proj-aiml",      "name": "AI/ML Experimentation Lab",     "lob": "lob-dnd", "prog": None,        "type": "project", "status": "active",           "rag": "green", "capex_opex": "opex",  "start": "2025-09", "end": "2026-06", "budget": 200000,  "narrative": "well_managed",       "pl": None},
    {"id": "svc-dataplatform","name": "Data Platform Operations",     "lob": "lob-dnd", "prog": None,        "type": "service", "status": "active",           "rag": "green", "capex_opex": "opex",  "start": "2024-01", "end": None,      "budget": 220000,  "narrative": "steady_service",    "pl": None},
    {"id": "svc-iot",        "name": "IoT Infrastructure Support",    "lob": "lob-dnd", "prog": None,        "type": "service", "status": "active",           "rag": "green", "capex_opex": "opex",  "start": "2024-01", "end": None,      "budget": 150000,  "narrative": "steady_service",    "pl": None},
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
    {"id": "p-richter",   "name": "Katharina Richter",  "role": "role-sysadmin", "cc": "cc-muc-inf"},
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
    {"id": "p-biber",     "name": "Attila Biber",       "role": "role-sr-arch",  "cc": None},          # Executive
]

# Demo personas mapping
DEMO_PERSONAS = [
    {"id": "persona-controller", "person_id": "p-meier",   "role": "controller",        "display_name": "Anna Meier",     "title": "IT Controller",                     "default_module": "portfolio", "managed_cc": None,        "owned_projects": None},
    {"id": "persona-cc-owner",   "person_id": "p-brenner", "role": "cost_center_owner",  "display_name": "Thomas Brenner", "title": "Head of Application Development",   "default_module": "capacity",  "managed_cc": "cc-muc-apd","owned_projects": None},
    {"id": "persona-pl",         "person_id": "p-sharma",  "role": "project_lead",       "display_name": "Priya Sharma",   "title": "Senior Project Lead",               "default_module": "workbench", "managed_cc": None,        "owned_projects": '["proj-erp2","proj-sensor","proj-predmaint","proj-fleet","proj-autobrake"]'},
    {"id": "persona-exec",       "person_id": "p-biber",   "role": "executive",          "display_name": "Attila Biber",   "title": "VP IT Strategy & Governance",       "default_module": "portfolio", "managed_cc": None,        "owned_projects": None},
]
