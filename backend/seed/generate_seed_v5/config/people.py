"""People roster + demo personas + role permission grants.

The four demo personas are:
- ``persona-controller``  → Sarah Mitchell (p-meier)
- ``persona-cc-owner``    → James Cooper (p-brenner)
- ``persona-pl``          → Anita Desai (p-sharma)
- ``persona-exec``        → Robert Chen (p-weber)

The ``owned_projects`` JSON for the PL persona references the v5 project IDs
from ``config/entities.py``.

Per [F-AC-01]: role permission grants seed the controller's edit access for
btc_profile / distribution / charging_location / legal_entity (4 rows). Other
roles fall back to default-only access.
"""
from __future__ import annotations

# ---------------------------------------------------------------------------
# People (carried over from v4, with the executive persona renamed).
# ---------------------------------------------------------------------------
PEOPLE: list[dict] = [
    # --- MUC / APD (8) — German names ---
    {"id": "p-brenner",   "name": "James Cooper",     "role": "role-sr-arch",  "cc": "cc-muc-apd"},  # CC Owner persona
    {"id": "p-fischer",   "name": "Lena Fischer",       "role": "role-sr-dev",   "cc": "cc-muc-apd"},
    {"id": "p-wolf",      "name": "Markus Wolf",        "role": "role-sr-dev",   "cc": "cc-muc-apd"},
    {"id": "p-keller",    "name": "Felix Keller",       "role": "role-sr-dev",   "cc": "cc-muc-apd"},
    {"id": "p-schmidt",   "name": "Jan Schmidt",        "role": "role-dev",      "cc": "cc-muc-apd"},
    {"id": "p-bauer",     "name": "Sophie Bauer",       "role": "role-dev",      "cc": "cc-muc-apd"},
    {"id": "p-neumann",   "name": "Niklas Neumann",     "role": "role-dev",      "cc": "cc-muc-apd"},
    {"id": "p-hoffmann",  "name": "Laura Hoffmann",     "role": "role-jr-dev",   "cc": "cc-muc-apd"},

    # --- MUC / INF (5) ---
    {"id": "p-wagner",    "name": "Michael Wagner",     "role": "role-cloud",    "cc": "cc-muc-inf"},
    {"id": "p-braun",     "name": "Stefan Braun",       "role": "role-cloud",    "cc": "cc-muc-inf"},
    {"id": "p-becker",    "name": "Katharina Richter",  "role": "role-sysadmin", "cc": "cc-muc-inf"},
    {"id": "p-frank",     "name": "Andreas Frank",      "role": "role-network",  "cc": "cc-muc-inf"},
    {"id": "p-jung",      "name": "Sabine Jung",        "role": "role-qa",       "cc": "cc-muc-apd"},

    # --- MUC / BSO (4) ---
    {"id": "p-mueller",   "name": "Eva Mueller",        "role": "role-sap",      "cc": "cc-muc-bso"},
    {"id": "p-hartmann",  "name": "Klaus Hartmann",     "role": "role-sap",      "cc": "cc-muc-bso"},
    {"id": "p-krause",    "name": "Petra Krause",       "role": "role-ba",       "cc": "cc-muc-bso"},
    {"id": "p-berger",    "name": "Martin Berger",      "role": "role-qa",       "cc": "cc-muc-apd"},

    # --- MUC / DDA (3) ---
    {"id": "p-schubert",  "name": "Daniel Schubert",    "role": "role-data-eng", "cc": "cc-muc-dda"},
    {"id": "p-winter",    "name": "Christina Winter",   "role": "role-data-eng", "cc": "cc-muc-dda"},
    {"id": "p-lorenz",    "name": "Florian Lorenz",     "role": "role-data-sci", "cc": "cc-muc-dda"},

    # --- BUD / APD (8) — Hungarian names ---
    {"id": "p-nagy",      "name": "Zoltan Nagy",        "role": "role-sr-arch",  "cc": "cc-bud-apd"},
    {"id": "p-szabo",     "name": "Istvan Szabo",       "role": "role-sr-dev",   "cc": "cc-bud-apd"},
    {"id": "p-toth",      "name": "Gabor Toth",         "role": "role-sr-dev",   "cc": "cc-bud-apd"},
    {"id": "p-horvath",   "name": "Anna Horvath",       "role": "role-sr-dev",   "cc": "cc-bud-apd"},
    {"id": "p-kovacs",    "name": "Peter Kovacs",       "role": "role-dev",      "cc": "cc-bud-apd"},
    {"id": "p-molnar",    "name": "Katalin Molnar",     "role": "role-dev",      "cc": "cc-bud-apd"},
    {"id": "p-varga",     "name": "Laszlo Varga",       "role": "role-dev",      "cc": "cc-bud-apd"},
    {"id": "p-kiss",      "name": "Eszter Kiss",        "role": "role-dev",      "cc": "cc-bud-apd"},

    # --- BUD / INF (4) ---
    {"id": "p-farkas",    "name": "Tamas Farkas",       "role": "role-cloud",    "cc": "cc-bud-inf"},
    {"id": "p-balogh",    "name": "Andras Balogh",      "role": "role-sysadmin", "cc": "cc-bud-inf"},
    {"id": "p-takacs",    "name": "Krisztina Takacs",   "role": "role-network",  "cc": "cc-bud-inf"},
    {"id": "p-fekete",    "name": "Daniel Fekete",      "role": "role-jr-dev",   "cc": "cc-bud-apd"},

    # --- BUD / DDA (4) ---
    {"id": "p-simon",     "name": "Balazs Simon",       "role": "role-data-eng", "cc": "cc-bud-dda"},
    {"id": "p-nemeth",    "name": "Eva Nemeth",         "role": "role-data-sci", "cc": "cc-bud-dda"},
    {"id": "p-papp",      "name": "Janos Papp",         "role": "role-qa",       "cc": "cc-bud-apd"},
    {"id": "p-lukacs",    "name": "Marta Lukacs",       "role": "role-qa",       "cc": "cc-bud-apd"},

    # --- PUN / APD (9) — Indian names (Anita Desai is the PL persona — no CC) ---
    {"id": "p-sharma",    "name": "Anita Desai",       "role": "role-sr-arch",  "cc": None},
    {"id": "p-patel",     "name": "Rajesh Patel",       "role": "role-sr-dev",   "cc": "cc-pun-apd"},
    {"id": "p-kumar",     "name": "Amit Kumar",         "role": "role-sr-dev",   "cc": "cc-pun-apd"},
    {"id": "p-gupta",     "name": "Sneha Gupta",        "role": "role-dev",      "cc": "cc-pun-apd"},
    {"id": "p-singh",     "name": "Vikram Singh",       "role": "role-dev",      "cc": "cc-pun-apd"},
    {"id": "p-das",       "name": "Ananya Das",         "role": "role-dev",      "cc": "cc-pun-apd"},
    {"id": "p-joshi",     "name": "Deepak Joshi",       "role": "role-jr-dev",   "cc": "cc-pun-apd"},
    {"id": "p-iyer",      "name": "Kavitha Iyer",       "role": "role-jr-dev",   "cc": "cc-pun-apd"},
    {"id": "p-reddy",     "name": "Sanjay Reddy",       "role": "role-qa",       "cc": "cc-pun-apd"},

    # --- PUN / INF (3) ---
    {"id": "p-nair",      "name": "Arun Nair",          "role": "role-cloud",    "cc": "cc-pun-inf"},
    {"id": "p-menon",     "name": "Lakshmi Menon",      "role": "role-sysadmin", "cc": "cc-pun-inf"},
    {"id": "p-pillai",    "name": "Suresh Pillai",      "role": "role-network",  "cc": "cc-pun-inf"},

    # --- PUN / BSO (2) ---
    {"id": "p-rao",       "name": "Meera Rao",          "role": "role-sap",      "cc": "cc-pun-bso"},
    {"id": "p-desai",     "name": "Nikhil Desai",       "role": "role-ba",       "cc": "cc-pun-bso"},

    # --- Portfolio-level personas (no CC) ---
    {"id": "p-meier",     "name": "Sarah Mitchell",         "role": "role-sr-arch",  "cc": None},  # Controller
    {"id": "p-weber",     "name": "Robert Chen",    "role": "role-sr-arch",  "cc": None},  # Executive (renamed from p-becker-exec per [F-DG-02])
]


# ---------------------------------------------------------------------------
# Demo personas — owned_projects references entities.py via lazy import to
# avoid circulars during config-tier imports. The string list is supplied at
# emission time.
# ---------------------------------------------------------------------------
DEMO_PERSONAS: list[dict] = [
    {
        "id": "persona-controller",
        "person_id": "p-meier",
        "role": "controller",
        "display_name": "Sarah Mitchell",
        "title": "IT Controller",
        "default_module": "portfolio",
        "managed_cc": None,
        "owned_projects": None,
    },
    {
        "id": "persona-cc-owner",
        "person_id": "p-brenner",
        "role": "cost_center_owner",
        "display_name": "James Cooper",
        "title": "Head of Application Development",
        "default_module": "capacity",
        "managed_cc": "cc-muc-apd",
        "owned_projects": None,
    },
    {
        "id": "persona-pl",
        "person_id": "p-sharma",
        "role": "project_lead",
        "display_name": "Anita Desai",
        "title": "Senior Project Lead",
        "default_module": "workbench",
        "managed_cc": None,
        # owned_projects filled at emit time from entities.PL_OWNED_PROJECT_IDS.
        "owned_projects": "__from_entities__",
    },
    {
        "id": "persona-exec",
        "person_id": "p-weber",
        "role": "executive",
        "display_name": "Robert Chen",
        "title": "VP IT Strategy & Governance",
        "default_module": "portfolio",
        "managed_cc": None,
        "owned_projects": None,
    },
]


# ---------------------------------------------------------------------------
# Users — system-access entities tied to demo personas (one User per persona).
# Tier3 flag is enabled for the controller and the executive (per CLAUDE.md
# Tier-3 simulator gating). Change-reviewer is enabled for the controller only.
# ---------------------------------------------------------------------------
USERS: list[dict] = [
    {
        "id": "user-sarah",
        "username": "sarah.mitchell",
        "display_name": "Sarah Mitchell",
        "email": "sarah.mitchell@example.com",
        "role": "controller",
        "person_id": "p-meier",
        "tier3_flag": True,
        "change_reviewer_flag": True,
    },
    {
        "id": "user-james",
        "username": "james.cooper",
        "display_name": "James Cooper",
        "email": "james.cooper@example.com",
        "role": "cost_center_owner",
        "person_id": "p-brenner",
        "tier3_flag": False,
        "change_reviewer_flag": False,
    },
    {
        "id": "user-anita",
        "username": "anita.desai",
        "display_name": "Anita Desai",
        "email": "anita.desai@example.com",
        "role": "project_lead",
        "person_id": "p-sharma",
        "tier3_flag": False,
        "change_reviewer_flag": False,
    },
    {
        "id": "user-robert",
        "username": "robert.chen",
        "display_name": "Robert Chen",
        "email": "robert.chen@example.com",
        "role": "executive",
        "person_id": "p-weber",
        "tier3_flag": True,
        "change_reviewer_flag": False,
    },
]


# ---------------------------------------------------------------------------
# RolePermissionGrant seed rows per [F-AC-01].
#
# Defaults per the spec:
# - controller: explicit edit grant on btc_profile, distribution,
#   charging_location, legal_entity. (Controllers always have override
#   authority; the explicit row makes it discoverable in the admin UI.)
# - other roles: nothing — falls back to "responsible owns + controller
#   override" default.
# ---------------------------------------------------------------------------
ROLE_PERMISSION_GRANTS: list[dict] = [
    {"role": "controller", "entity_type": "btc_profile",       "can_edit": True, "notes": "Default controller override per [F-AC-01]."},
    {"role": "controller", "entity_type": "distribution",      "can_edit": True, "notes": "Default controller override per [F-AC-01]."},
    {"role": "controller", "entity_type": "charging_location", "can_edit": True, "notes": "Cluster F master data — controller-managed."},
    {"role": "controller", "entity_type": "legal_entity",      "can_edit": True, "notes": "Cluster F master data — controller-managed."},
]
