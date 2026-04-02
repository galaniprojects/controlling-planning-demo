import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_URL = f"sqlite:///{os.path.join(BASE_DIR, 'creta_demo.db')}"
DEMO_DATE = "2026-04"
SEED_DIR = os.path.join(BASE_DIR, "seed")
FIXTURES_DIR = os.path.join(SEED_DIR, "fixtures")

# ---------------------------------------------------------------------------
# Branding — change these values to re-brand the entire application
# ---------------------------------------------------------------------------

BRANDING = {
    "app_name": "CRETA",
    "app_full_name": "Controlling, Reporting, Estimation, Tracking & Allocations",
    "app_acronym_words": ["Controlling", "Reporting", "Estimation", "Tracking", "Allocations"],
    "company_name": "Knorr-Bremse",
    "csv_export_prefix": "CRETA",
    # Persona display names (used in fixture templates)
    "controller_name": "Anna Meier",
    "cc_owner_name": "Thomas Brenner",
    "pl_name": "Priya Sharma",
    "executive_name": "Thomas Becker",
}
