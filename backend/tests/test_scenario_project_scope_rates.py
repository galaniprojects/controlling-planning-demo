"""Unit tests for services/scenario_project_scope/rates.py (S6 rate-at-month).

``effective_hourly_rate`` is the single rate function shared by the resolver and
the write paths. It must price hours at the ``RateTable`` rate **in force at the
cell's month** (latest ``effective_date`` on-or-before the first of that month),
NOT a single latest-wins rate — per CLAUDE.md "historical cost calculations use
the rate in effect at the time". It delegates to the canonical
``services.calculations.resolve_hourly_rate`` with a CC-less lookup and falls
back to ``DEFAULT_HOURLY_RATE`` (€120) when the role is unknown/unset or has no
rate yet in force.
"""
from decimal import Decimal

from models.people import RateTable
from services.calculations import DEFAULT_HOURLY_RATE
from services.scenario_project_scope.rates import effective_hourly_rate


def _rate(db, role_id, amount, effective_date, cc="cc-x"):
    db.add(RateTable(
        role_type_id=role_id, competence_center_id=cc,
        hourly_rate=Decimal(amount), effective_date=effective_date,
    ))


# ---------------------------------------------------------------------------
# Fallback behaviour
# ---------------------------------------------------------------------------

def test_none_role_key_returns_default(db):
    """A line with no role (role_key None) prices at DEFAULT_HOURLY_RATE."""
    assert effective_hourly_rate(db, None, "2026-06") == float(DEFAULT_HOURLY_RATE)


def test_empty_role_key_returns_default(db):
    """An empty-string role key is treated as unset → DEFAULT."""
    assert effective_hourly_rate(db, "", "2026-06") == float(DEFAULT_HOURLY_RATE)


def test_unknown_role_returns_default(db):
    """A role with no RateTable row at all falls back to DEFAULT (€120)."""
    assert effective_hourly_rate(db, "R-NONE", "2026-06") == 120.0


def test_month_before_earliest_effective_date_returns_default(db):
    """No rate yet in force at the cell's month → DEFAULT, even though a later
    row exists (the later row is not yet effective)."""
    _rate(db, "R-LATE", "150.00", "2026-07-01")
    db.commit()
    assert effective_hourly_rate(db, "R-LATE", "2026-06") == float(DEFAULT_HOURLY_RATE)


# ---------------------------------------------------------------------------
# Rate-at-month — the core S6 contract
# ---------------------------------------------------------------------------

def test_prices_at_rate_in_force_at_month(db):
    """Two rate rows bracket the window; each month resolves to the latest row
    on-or-before it — earlier month → earlier rate, later month → later rate."""
    _rate(db, "R-STEP", "100.00", "2025-01-01")
    _rate(db, "R-STEP", "150.00", "2026-07-01")
    db.commit()

    assert effective_hourly_rate(db, "R-STEP", "2026-06") == 100.0   # 150 not yet in force
    assert effective_hourly_rate(db, "R-STEP", "2026-07") == 150.0   # step month
    assert effective_hourly_rate(db, "R-STEP", "2026-08") == 150.0   # carried forward


def test_not_latest_wins(db):
    """Regression guard: the function must NOT always take the latest-effective
    row. A June cell with a July step-up present prices at the June rate."""
    _rate(db, "R-STEP", "100.00", "2025-01-01")
    _rate(db, "R-STEP", "200.00", "2026-12-01")
    db.commit()
    assert effective_hourly_rate(db, "R-STEP", "2026-06") == 100.0


def test_cc_less_lookup_finds_rate_under_any_cc(db):
    """Scenario project-scope cells carry no competence-centre, so the lookup
    must find a rate stored under any CC for the role (mirrors the capacity
    router's CC-less fallback)."""
    _rate(db, "R-CC", "90.00", "2025-01-01", cc="some-other-cc")
    db.commit()
    assert effective_hourly_rate(db, "R-CC", "2026-06") == 90.0


def test_on_boundary_month_is_in_force(db):
    """The effective_date's own month is in force (on-or-before the 1st)."""
    _rate(db, "R-BND", "110.00", "2026-06-01")
    db.commit()
    assert effective_hourly_rate(db, "R-BND", "2026-06") == 110.0
