"""Seed data loading mechanism — populates SQLite from seed.sql and JSON fixtures."""

import json
import os
import sqlite3

import config
from config import DATABASE_URL, SEED_DIR, FIXTURES_DIR


def apply_branding(text: str) -> str:
    """Replace {placeholder} tokens in fixture text with branding values."""
    replacements = {
        "{app_name}": config.BRANDING["app_name"],
        "{company_name}": config.BRANDING["company_name"],
        "{controller_name}": config.BRANDING["controller_name"],
        "{cc_owner_name}": config.BRANDING["cc_owner_name"],
        "{pl_name}": config.BRANDING["pl_name"],
        "{executive_name}": config.BRANDING["executive_name"],
    }
    for token, value in replacements.items():
        text = text.replace(token, value)
    return text


def get_db_path() -> str:
    """Extract file path from sqlite:/// URL."""
    return DATABASE_URL.replace("sqlite:///", "")


def load_seed_sql() -> None:
    """Execute seed.sql against the SQLite database."""
    db_path = get_db_path()
    sql_path = os.path.join(SEED_DIR, "seed.sql")

    if not os.path.exists(sql_path):
        print("[seed] seed.sql not found — skipping SQL seed.")
        return

    conn = sqlite3.connect(db_path)
    try:
        with open(sql_path, "r") as f:
            sql = f.read()
        conn.executescript(sql)
        print(f"[seed] Loaded seed.sql ({os.path.getsize(sql_path)} bytes)")
    finally:
        conn.close()


def load_fixtures() -> dict:
    """Load all JSON fixtures and return them as a dictionary.

    Returns a dict with keys:
      - "manuals": list of module manual dicts
      - "faq": list of FAQ entry dicts
      - "advisor_goals": list of AI Advisor goal dicts
      - "changelog": list of release entries (version → sections)
    """
    fixtures = {"manuals": [], "faq": [], "advisor_goals": [], "changelog": []}

    # Load module manuals
    manuals_dir = os.path.join(FIXTURES_DIR, "manuals")
    if os.path.isdir(manuals_dir):
        for fname in sorted(os.listdir(manuals_dir)):
            if fname.endswith(".json"):
                with open(os.path.join(manuals_dir, fname), "r") as f:
                    raw = f.read()
                fixtures["manuals"].append(json.loads(apply_branding(raw)))
        print(f"[seed] Loaded {len(fixtures['manuals'])} module manuals")

    # Load FAQ
    faq_path = os.path.join(FIXTURES_DIR, "faq", "faq.json")
    if os.path.exists(faq_path):
        with open(faq_path, "r") as f:
            raw = f.read()
        fixtures["faq"] = json.loads(apply_branding(raw))
        print(f"[seed] Loaded {len(fixtures['faq'])} FAQ entries")

    # Load AI Advisor goals
    advisor_path = os.path.join(FIXTURES_DIR, "advisor", "goals.json")
    if os.path.exists(advisor_path):
        with open(advisor_path, "r") as f:
            raw = f.read()
        fixtures["advisor_goals"] = json.loads(apply_branding(raw))
        print(f"[seed] Loaded {len(fixtures['advisor_goals'])} AI Advisor goals")

    # Load Changelog
    changelog_path = os.path.join(FIXTURES_DIR, "changelog", "changelog.json")
    if os.path.exists(changelog_path):
        with open(changelog_path, "r") as f:
            raw = f.read()
        fixtures["changelog"] = json.loads(apply_branding(raw))
        print(f"[seed] Loaded {len(fixtures['changelog'])} changelog entries")

    return fixtures


def is_db_seeded(db_path: str) -> bool:
    """Check if the database already has seed data."""
    if not os.path.exists(db_path):
        return False
    conn = sqlite3.connect(db_path)
    try:
        cur = conn.execute(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='projects'"
        )
        if cur.fetchone()[0] == 0:
            return False
        cur = conn.execute("SELECT COUNT(*) FROM projects")
        return cur.fetchone()[0] > 0
    except Exception:
        return False
    finally:
        conn.close()


def seed_database() -> dict:
    """Full seed: load SQL data + return JSON fixtures.

    Only seeds if the database is empty (no projects).
    Returns the loaded fixtures dict.
    """
    db_path = get_db_path()

    if is_db_seeded(db_path):
        print("[seed] Database already seeded — loading fixtures only.")
        return load_fixtures()

    print("[seed] Database empty — running full seed...")
    load_seed_sql()
    # Progress tracker rows + deliverable checklists + historical snapshots are
    # emitted directly by `generate_seed_v5/s18_progress.py` as deterministic
    # SQL — the legacy `_seed_progress_tracker_data` Python helper has been
    # retired by S1 [F-DG-01..03] [E-04c].
    _seed_forecast_versions()
    fixtures = load_fixtures()
    print("[seed] Seed complete.")
    return fixtures


def _seed_forecast_versions() -> None:
    """Python seed helper: create 2 ForecastVersions per project [C-FV-05].

    v1: 'Q1 2026 Cycle' — payload = current forecast * 1.05 (prior-cycle estimate)
    v2: 'Q2 2026 Cycle' — payload = current forecast (current state)

    Uses SQLAlchemy ORM against the live database, matching the C1 schema.
    Runs after load_seed_sql() so all tables and rows exist.
    """
    import sys, os
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from database import Base

    engine = create_engine(
        f"sqlite:///{get_db_path()}",
        connect_args={"check_same_thread": False},
    )
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()

    try:
        import models  # noqa: F401 — registers all ORM classes
        from models.financial import Forecast, ForecastVersion
        from models.projects import Project
        from schemas.common import CurrentUser
        from services.forecast_versioning import (
            build_mixed_grid, serialize_forecast_payload, _next_version_number
        )
        from decimal import Decimal
        from datetime import datetime
        import json

        # Synthetic "seed" user (controller persona)
        seed_user = CurrentUser(
            user_id="persona-controller",
            person_id="p-controller",
            name="Anna Meier",
            role="controller",
            cost_center_id=None,
            project_ids=[],
        )

        DEMO_DATE = "2026-04"
        projects = db.query(Project).filter(Project.is_active.is_(True)).all()
        count = 0

        for project in projects:
            has_forecast = db.query(Forecast).filter(
                Forecast.project_id == project.id
            ).limit(1).first()
            if not has_forecast:
                continue

            # v1: 'Q1 2026 Cycle' — snapshot with a 5% uplift (prior-cycle estimate)
            grid_v1 = build_mixed_grid(db, project.id, DEMO_DATE)
            # Uplift amounts by 5%
            for row in grid_v1["rows"]:
                for cell in row["cells"]:
                    cell["amount_eur"] = round(cell["amount_eur"] * 1.05, 2)
                row["row_total"] = round(sum(c["amount_eur"] for c in row["cells"]), 2)
            grid_v1["totals_by_column"] = {
                k: round(v * 1.05, 2) for k, v in grid_v1["totals_by_column"].items()
            }
            grid_v1["grand_total"] = round(grid_v1["grand_total"] * 1.05, 2)

            payload_v1 = serialize_forecast_payload(
                project.id, grid_v1, "2026-01-15T10:00:00"
            )
            cell_count_v1 = sum(
                1 for row in grid_v1["rows"]
                for cell in row["cells"] if cell["amount_eur"] != 0.0
            )

            fv1 = ForecastVersion(
                project_id=project.id,
                version_number=_next_version_number(db, project.id),
                version_type="cycle",
                cycle_label="Q1 2026 Cycle",
                cycle_id="seed-q1-2026",
                change_request_id=None,
                created_by_id="p-controller",
                created_at=datetime(2026, 1, 15, 10, 0, 0),
                granularity_boundary_months=grid_v1["granularity_boundary_months"],
                planning_horizon_months=grid_v1["planning_horizon_months"],
                payload_json=payload_v1,
                cell_count=cell_count_v1,
                total_amount_eur=Decimal(str(grid_v1["grand_total"])) if grid_v1["grand_total"] else None,
            )
            db.add(fv1)
            db.flush()

            # v2: 'Q2 2026 Cycle' — current state snapshot
            grid_v2 = build_mixed_grid(db, project.id, DEMO_DATE)
            payload_v2 = serialize_forecast_payload(
                project.id, grid_v2, "2026-04-15T10:00:00"
            )
            cell_count_v2 = sum(
                1 for row in grid_v2["rows"]
                for cell in row["cells"] if cell["amount_eur"] != 0.0
            )

            fv2 = ForecastVersion(
                project_id=project.id,
                version_number=_next_version_number(db, project.id),
                version_type="cycle",
                cycle_label="Q2 2026 Cycle",
                cycle_id="seed-q2-2026",
                change_request_id=None,
                created_by_id="p-controller",
                created_at=datetime(2026, 4, 15, 10, 0, 0),
                granularity_boundary_months=grid_v2["granularity_boundary_months"],
                planning_horizon_months=grid_v2["planning_horizon_months"],
                payload_json=payload_v2,
                cell_count=cell_count_v2,
                total_amount_eur=Decimal(str(grid_v2["grand_total"])) if grid_v2["grand_total"] else None,
            )
            db.add(fv2)
            db.flush()

            count += 1

        db.commit()
        print(f"[seed] Created 2 forecast versions for {count} projects (C1 [C-FV-05])")

    except Exception as exc:
        db.rollback()
        print(f"[seed] WARNING: _seed_forecast_versions failed: {exc}")
    finally:
        db.close()


# Retired by S1: `_seed_progress_tracker_data` v4 helper is subsumed by
# `generate_seed_v5/s18_progress.py` emitting deterministic SQL [E-04c].


def reset_database() -> dict:
    """Drop all data and re-seed from scratch.

    Deletes all rows from every table (respecting FK order),
    then reloads seed data and fixtures.

    Returns the loaded fixtures dict.
    """
    db_path = get_db_path()
    print("[seed] Resetting database...")

    # Use raw sqlite3 to delete all data (faster and avoids SQLAlchemy pool issues)
    conn = sqlite3.connect(db_path)
    try:
        # Get all tables
        cur = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name != 'sqlite_sequence'"
        )
        tables = [row[0] for row in cur.fetchall()]

        # Disable FK checks, delete all data, re-enable
        conn.execute("PRAGMA foreign_keys = OFF")
        for table in tables:
            conn.execute(f"DELETE FROM {table}")
        conn.execute("PRAGMA foreign_keys = ON")
        conn.commit()
        print(f"[seed] Cleared {len(tables)} tables")
    finally:
        conn.close()

    # Reload seed data and fixtures
    load_seed_sql()
    # Progress tracker state seeded inline by s18_progress.py (S1).
    # C1: generate 2 forecast versions per project [C-FV-05]
    _seed_forecast_versions()
    fixtures = load_fixtures()
    print("[seed] Reset complete.")
    return fixtures
