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
    """
    fixtures = {"manuals": [], "faq": [], "advisor_goals": []}

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
    fixtures = load_fixtures()
    print("[seed] Seed complete.")
    return fixtures


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
    fixtures = load_fixtures()
    print("[seed] Reset complete.")
    return fixtures
