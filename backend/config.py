import logging
import os
from datetime import date

logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Database connection. Driven by the DATABASE_URL environment variable so the
# same code runs against PostgreSQL (Docker / KB on-prem hosting) and falls back
# to the embedded SQLite file for no-Docker local development and the test suite.
# Postgres example: postgresql+psycopg://app:app@db:5432/viper
DATABASE_URL = os.environ.get(
    "DATABASE_URL", f"sqlite:///{os.path.join(BASE_DIR, 'viper_demo.db')}"
)


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


def reanchor_demo_date() -> str:
    """Re-pin the process-wide ``DEMO_DATE`` to the real current month.

    ``DEMO_DATE`` is pinned once at import for intra-run consistency, and many
    modules captured it by value via ``from config import DEMO_DATE``. On a
    long-running server that means the demo's notion of "today" freezes at the
    month the process started. Calling this on reseed (``/admin/reset-demo``)
    advances the whole process to the live month *without* a restart, so the
    re-shifted seed and the application agree on "today".

    Mirrors the ``sys.modules`` walk in ``tests/conftest.py::pin_demo_date`` —
    the same mechanism, but using the live value instead of the test anchor.

    Caveat: this refreshes only modules that hold a direct ``DEMO_DATE`` alias.
    A module that computed a *derived* constant from ``DEMO_DATE`` at import
    time is not recomputed — prefer ``get_current_period()`` for derived values.
    """
    import sys

    global DEMO_DATE
    DEMO_DATE = get_current_period()
    this_module = sys.modules[__name__]
    for mod in list(sys.modules.values()):
        if mod is None or mod is this_module:
            continue
        if getattr(mod, "DEMO_DATE", None) is not None:
            try:
                setattr(mod, "DEMO_DATE", DEMO_DATE)
            except Exception:
                logger.warning(
                    "reanchor_demo_date: could not update DEMO_DATE on module %r",
                    getattr(mod, "__name__", mod),
                    exc_info=True,
                )
    return DEMO_DATE

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
