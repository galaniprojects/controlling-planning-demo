"""Tests for ``database.run_migrations`` — the startup schema bootstrap.

Idempotent across three states: empty DB (baseline creates the schema),
pre-existing schema without an ``alembic_version`` table (stamp, don't recreate),
and already-at-head (no-op). Exercised against a throwaway **file** SQLite DB
(the deferrable-FK migration is a PostgreSQL-only no-op on SQLite).
"""

import config
import database
from sqlalchemy import create_engine, inspect


def _point_at(monkeypatch, tmp_path):
    """Repoint both config.DATABASE_URL and database.engine at a temp file DB.

    Alembic (via env.py) connects using config.DATABASE_URL; run_migrations'
    pre-check inspects database.engine — both must target the same DB.
    """
    url = f"sqlite:///{tmp_path / 'mig.db'}"
    monkeypatch.setattr(config, "DATABASE_URL", url)
    eng = create_engine(url)
    monkeypatch.setattr(database, "engine", eng)
    return eng


def test_empty_db_creates_schema(monkeypatch, tmp_path):
    eng = _point_at(monkeypatch, tmp_path)

    database.run_migrations()

    insp = inspect(eng)
    assert insp.has_table("projects")
    assert insp.has_table("alembic_version")


def test_preexisting_schema_is_stamped(monkeypatch, tmp_path):
    eng = _point_at(monkeypatch, tmp_path)

    # Simulate a dev DB created by an earlier create_all (no alembic_version).
    database.Base.metadata.create_all(bind=eng)
    insp = inspect(eng)
    assert insp.has_table("projects")
    assert not insp.has_table("alembic_version")

    database.run_migrations()  # should stamp, not recreate (no error)

    insp = inspect(eng)
    assert insp.has_table("alembic_version")
    assert insp.has_table("projects")
    with eng.connect() as conn:
        from sqlalchemy import text

        version = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
    assert version  # a revision was stamped


def test_already_at_head_is_noop(monkeypatch, tmp_path):
    eng = _point_at(monkeypatch, tmp_path)

    database.run_migrations()  # empty -> upgrade
    database.run_migrations()  # already at head -> no-op, must not error

    insp = inspect(eng)
    assert insp.has_table("projects")
    assert insp.has_table("alembic_version")
