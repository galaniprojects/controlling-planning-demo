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
    "app_name": "CPC",
    "app_full_name": "Controlling & Planning Center",
    "app_acronym_words": ["Controlling", "Planning", "Center"],
    "company_name": "",
    "csv_export_prefix": "CPC",
    # Persona display names (used in fixture templates)
    "controller_name": "Sarah Mitchell",
    "cc_owner_name": "James Cooper",
    "pl_name": "Anita Desai",
    "executive_name": "Robert Chen",
}
