import os
from datetime import date

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_URL = f"sqlite:///{os.path.join(BASE_DIR, 'viper_demo.db')}"


def get_current_period() -> str:
    """The current planning month as ``"YYYY-MM"``, derived from the real date.

    VIPER's notion of "today" is dynamic: the application always reflects the
    real current month rather than a frozen demo date. The in-progress month is
    locked for forecasting — the first editable forecast month is the *next* one
    (see :func:`services.calendar.open_forecast_month`). Computed fresh from the
    system clock on each call; the module-level :data:`DEMO_DATE` pins it once
    per process at import so the many constant reads across the codebase stay
    internally consistent within a single run (it refreshes on restart/reseed).
    """
    return date.today().strftime("%Y-%m")


# Current planning month, computed once at import. Historically a fixed literal
# ("2026-04"); now dynamic so the demo always understands the present. The name
# is retained as a stable, backward-compatible alias for the ~hundreds of
# existing reads — new code should prefer get_current_period() /
# services.calendar.open_forecast_month().
DEMO_DATE = get_current_period()
SEED_DIR = os.path.join(BASE_DIR, "seed")
FIXTURES_DIR = os.path.join(SEED_DIR, "fixtures")

# ---------------------------------------------------------------------------
# Branding — change these values to re-brand the entire application
# ---------------------------------------------------------------------------

BRANDING = {
    "app_name": "VIPER",
    # VIPER is not an acronym and has no word expansion.
    "app_full_name": "IT Financial Planning Platform",
    "company_name": "Knorr-Bremse",
    "csv_export_prefix": "VIPER",
    # Persona display names (used in fixture templates)
    "controller_name": "Anna Meier",
    "cc_owner_name": "Thomas Brenner",
    "pl_name": "Priya Sharma",
    "executive_name": "Thomas Becker",
}
