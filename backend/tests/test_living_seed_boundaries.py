"""Living-seed temporal-boundary tests.

The committed ``seed.sql`` is anchored on the canonical demo month
(``CANONICAL_BASE == "2026-04"``) and is date-shifted at load / reset time by
``date_shift.shift_sql_dates`` so the seeded narrative always reflects the
present. These tests load the canonical seed into a throwaway in-memory SQLite
schema, shift it by a known delta, and assert the temporal seam holds:

  * Actuals end **at** the (shifted) current month — the in-progress month
    carries partial actuals — and never extend **strictly after** it.
  * Forecasts extend into the future (beyond the current month).
  * The relationships survive any shift delta (0 = canonical, +2, +14).

Mirrors the lead's loader approach: ``Base.metadata.create_all`` on a temp
sqlite, then ``executescript(shift_sql_dates(seed_sql, delta))``.

The autouse ``pin_demo_date`` fixture is irrelevant here — these tests drive the
shift delta explicitly off ``CANONICAL_BASE`` rather than the live clock, so the
assertions are deterministic regardless of when the suite runs.
"""
from __future__ import annotations

import os
import sqlite3
import sys
import tempfile

import pytest
from sqlalchemy import create_engine

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import Base
import models  # noqa: F401 — register all tables on Base.metadata
from seed.date_shift import CANONICAL_BASE, shift_sql_dates


SEED_PATH = os.path.join(os.path.dirname(__file__), "..", "seed", "seed.sql")


def _shift_month(ym: str, delta: int) -> str:
    """Shift a ``YYYY-MM`` string by *delta* whole months."""
    y, m = int(ym[:4]), int(ym[5:7])
    total = y * 12 + (m - 1) + delta
    return f"{total // 12:04d}-{total % 12 + 1:02d}"


@pytest.fixture
def loaded_seed():
    """Factory: load the canonical seed.sql into a temp DB shifted by *delta*.

    Yields a callable ``load(delta) -> (sqlite3.Connection, current_period)``
    where ``current_period`` is ``CANONICAL_BASE`` shifted by ``delta``. The
    caller owns the connection; the temp files are cleaned up on teardown.
    """
    with open(SEED_PATH, "r") as f:
        seed_sql = f.read()

    created: list[tuple] = []  # (conn, path)

    def _load(delta: int):
        tf = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        tf.close()
        eng = create_engine(f"sqlite:///{tf.name}")
        Base.metadata.create_all(eng)
        eng.dispose()
        conn = sqlite3.connect(tf.name)
        conn.executescript(shift_sql_dates(seed_sql, delta))
        created.append((conn, tf.name))
        return conn, _shift_month(CANONICAL_BASE, delta)

    yield _load

    for conn, path in created:
        conn.close()
        if os.path.exists(path):
            os.remove(path)


def _max_month(conn: sqlite3.Connection, table: str, col: str = "month") -> str | None:
    row = conn.execute(f"SELECT MAX({col}) FROM {table}").fetchone()
    return row[0]


def _count_after(conn: sqlite3.Connection, table: str, month: str, col: str = "month") -> int:
    return conn.execute(
        f"SELECT COUNT(*) FROM {table} WHERE {col} > ?", (month,)
    ).fetchone()[0]


@pytest.mark.parametrize("delta", [0, 2, 14])
class TestActualsBoundary:
    def test_actuals_do_not_extend_after_current_month(self, loaded_seed, delta):
        conn, current = loaded_seed(delta)
        # The in-progress current month may carry partial actuals; nothing
        # strictly after it should exist.
        assert _count_after(conn, "actuals", current) == 0, (
            f"actuals leaked past current month {current} (delta={delta})"
        )

    def test_actuals_end_at_current_month(self, loaded_seed, delta):
        conn, current = loaded_seed(delta)
        # Actuals run right up to the in-progress month (the demo always has
        # fresh actuals "as of now").
        assert _max_month(conn, "actuals") == current, (
            f"actuals max should be current month {current} (delta={delta})"
        )


@pytest.mark.parametrize("delta", [0, 2, 14])
class TestForecastBoundary:
    def test_forecasts_extend_into_the_future(self, loaded_seed, delta):
        conn, current = loaded_seed(delta)
        fc_max = _max_month(conn, "forecasts")
        assert fc_max is not None and fc_max > current, (
            f"forecasts must extend beyond current month {current}, "
            f"got max {fc_max} (delta={delta})"
        )

    def test_baselines_extend_into_the_future(self, loaded_seed, delta):
        conn, current = loaded_seed(delta)
        bl_max = _max_month(conn, "baselines")
        assert bl_max is not None and bl_max > current, (
            f"baselines must extend beyond current month {current}, "
            f"got max {bl_max} (delta={delta})"
        )


@pytest.mark.parametrize("delta", [0, 2, 14])
class TestRelativeNarrativePreserved:
    def test_actuals_before_forecast_horizon(self, loaded_seed, delta):
        """Actuals end at/before where the forecast horizon begins to dominate —
        i.e. the past/future seam moves together under the shift."""
        conn, current = loaded_seed(delta)
        ac_max = _max_month(conn, "actuals")
        fc_max = _max_month(conn, "forecasts")
        assert ac_max == current
        assert fc_max > ac_max


class TestPLScenarioSurvivesShift:
    """The Session-4 PL-authored scenario (id=4, author p-sharma) must load and
    its end_month plan-edit must shift with the rest of the narrative."""

    @pytest.mark.parametrize(
        "delta,expected_end",
        [(0, "2027-06"), (2, "2027-08"), (14, "2028-08")],
    )
    def test_pl_scenario_plan_edit_shifts(self, loaded_seed, delta, expected_end):
        conn, _ = loaded_seed(delta)
        row = conn.execute(
            "SELECT author_id, status, value FROM scenarios "
            "JOIN scenario_plan_edits ON scenarios.id = scenario_plan_edits.scenario_id "
            "WHERE scenarios.id = 4"
        ).fetchone()
        assert row is not None, "PL scenario id=4 missing from seed"
        author, status, plan_value = row
        assert author == "p-sharma"
        assert status == "private"
        assert plan_value == expected_end
