"""v5.1 W4 C-07 — verify the seed contains role-tagged external Forecast rows.

The W4 spec requires at least 5 external cost line items with non-null
``role_type_id`` so the F&P grid label, External Costs tab Role column,
and Capacity External badge all have demo-quality data to render. The
runner emits these from PROJECT_EXTERNALS[].role.

This test runs against the freshly-regenerated seed by creating the
schema via SQLAlchemy then loading seed.sql — mirroring the backend's
auto-seed bootstrap path on first launch.
"""

from __future__ import annotations

import os

import pytest
from sqlalchemy import create_engine, text

SEED_PATH = os.path.join(
    os.path.dirname(__file__),
    "..",
    "seed",
    "seed.sql",
)


@pytest.fixture
def seed_conn():
    """Bootstrap a fresh SQLite engine + apply seed.sql.

    Yields a SQLAlchemy connection so callers can run arbitrary SELECTs.
    The schema is created via Base.metadata.create_all() to mirror what
    the backend does at first-launch before executing the SQL seed.
    """
    from database import Base
    import models  # noqa: F401 — load all model registrations

    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)

    with open(SEED_PATH) as f:
        seed_sql = f.read()

    # SQLAlchemy doesn't have executescript; use the raw DBAPI connection.
    conn = engine.raw_connection()
    try:
        conn.executescript(seed_sql)
        conn.commit()
        yield conn
    finally:
        conn.close()
        engine.dispose()


def test_external_cost_role_seed_present(seed_conn):
    """At least 5 distinct (project, vendor) pairs carry role_type_id.

    Counted at the line-item level (distinct project/desc/vendor) rather
    than per-month so we don't double-count a single line that spans
    24+ months.
    """
    cur = seed_conn.execute(
        """
        SELECT DISTINCT project_id, description, vendor, role_type_id
        FROM forecasts
        WHERE category = 'external'
          AND role_type_id IS NOT NULL
        """
    )
    rows = cur.fetchall()
    assert len(rows) >= 5, (
        f"Expected at least 5 role-tagged external cost line items in "
        f"seed.sql; found {len(rows)}: {rows}"
    )

    # Confirm proj-mdh-rollout has at least 2 distinct roles so the
    # mixed-role parent fallback (C-07) is exercised by the demo.
    cur2 = seed_conn.execute(
        """
        SELECT DISTINCT role_type_id
        FROM forecasts
        WHERE project_id = 'proj-mdh-rollout'
          AND category = 'external'
          AND role_type_id IS NOT NULL
        """
    )
    mdh_roles = {r[0] for r in cur2.fetchall()}
    assert len(mdh_roles) >= 2, (
        f"proj-mdh-rollout should carry at least 2 distinct external "
        f"role_type_ids for the C-07 mixed-roles demo; got {mdh_roles}"
    )

    # Confirm role_type_ids resolve to real RoleType rows
    cur3 = seed_conn.execute(
        """
        SELECT DISTINCT f.role_type_id
        FROM forecasts f
        WHERE f.category = 'external'
          AND f.role_type_id IS NOT NULL
        """
    )
    assigned_role_ids = {r[0] for r in cur3.fetchall()}
    cur4 = seed_conn.execute("SELECT id FROM role_types")
    catalogue_ids = {r[0] for r in cur4.fetchall()}
    missing = assigned_role_ids - catalogue_ids
    assert not missing, (
        f"role_type_id values not present in role_types catalogue: {missing}"
    )


def test_role_assignments_propagate_to_baselines_and_actuals(seed_conn):
    """Baselines + Actuals tables also carry the role_type_id column.

    The C-07 schema is symmetric across the three financial sources so
    capacity views can derive role attribution regardless of which
    source the row exists in.
    """
    for table in ("baselines", "actuals"):
        cur = seed_conn.execute(
            f"""
            SELECT COUNT(*) FROM {table}
            WHERE category = 'external'
              AND role_type_id IS NOT NULL
            """
        )
        count = cur.fetchone()[0]
        assert count > 0, (
            f"Expected role-tagged rows in {table}; found 0"
        )
