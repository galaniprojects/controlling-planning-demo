"""Unit tests for services/scenario_project_scope/rates.py (S6 rate-at-month +
location-aware rates).

``effective_hourly_rate(db, role_key, location_id, month)`` is the single rate
function shared by the resolver and the write paths. It must price hours at the
``RateTable`` rate **in force at the cell's month** (latest ``effective_date``
on-or-before the first of that month) for the line's **workforce location**, NOT
a single latest-wins / location-blind rate — per CLAUDE.md "historical cost
calculations use the rate in effect at the time". It delegates to the canonical
``services.calculations.resolve_hourly_rate`` (precedence: exact location → Munich
→ CC → any → DEFAULT) and falls back to ``DEFAULT_HOURLY_RATE`` (€120) when the
role is unknown/unset or has no rate yet in force.
"""
from decimal import Decimal

from models.people import RateTable
from services.calculations import DEFAULT_HOURLY_RATE
from services.scenario_project_scope.rates import effective_hourly_rate


def _rate(db, role_id, amount, effective_date, location_id=None, cc="cc-x"):
    db.add(RateTable(
        role_type_id=role_id, competence_center_id=cc, location_id=location_id,
        hourly_rate=Decimal(amount), effective_date=effective_date,
    ))


# ---------------------------------------------------------------------------
# Fallback behaviour
# ---------------------------------------------------------------------------

def test_none_role_key_returns_default(db):
    """A line with no role (role_key None) prices at DEFAULT_HOURLY_RATE."""
    assert effective_hourly_rate(db, None, None, "2026-06") == float(DEFAULT_HOURLY_RATE)


def test_empty_role_key_returns_default(db):
    """An empty-string role key is treated as unset → DEFAULT."""
    assert effective_hourly_rate(db, "", None, "2026-06") == float(DEFAULT_HOURLY_RATE)


def test_unknown_role_returns_default(db):
    """A role with no RateTable row at all falls back to DEFAULT (€120)."""
    assert effective_hourly_rate(db, "R-NONE", None, "2026-06") == 120.0


def test_month_before_earliest_effective_date_returns_default(db):
    """No rate yet in force at the cell's month → DEFAULT, even though a later
    row exists (the later row is not yet effective)."""
    _rate(db, "R-LATE", "150.00", "2026-07-01")
    db.commit()
    assert effective_hourly_rate(db, "R-LATE", None, "2026-06") == float(DEFAULT_HOURLY_RATE)


# ---------------------------------------------------------------------------
# Rate-at-month — the core S6 contract
# ---------------------------------------------------------------------------

def test_prices_at_rate_in_force_at_month(db):
    """Two rate rows bracket the window; each month resolves to the latest row
    on-or-before it — earlier month → earlier rate, later month → later rate."""
    _rate(db, "R-STEP", "100.00", "2025-01-01")
    _rate(db, "R-STEP", "150.00", "2026-07-01")
    db.commit()

    assert effective_hourly_rate(db, "R-STEP", None, "2026-06") == 100.0   # 150 not yet in force
    assert effective_hourly_rate(db, "R-STEP", None, "2026-07") == 150.0   # step month
    assert effective_hourly_rate(db, "R-STEP", None, "2026-08") == 150.0   # carried forward


def test_not_latest_wins(db):
    """Regression guard: the function must NOT always take the latest-effective
    row. A June cell with a December step-up present prices at the June rate."""
    _rate(db, "R-STEP", "100.00", "2025-01-01")
    _rate(db, "R-STEP", "200.00", "2026-12-01")
    db.commit()
    assert effective_hourly_rate(db, "R-STEP", None, "2026-06") == 100.0


def test_role_only_rate_found_without_location(db):
    """A location-less rate row (pre-regen seed shape) still resolves via the
    'any rate for the role' fallback when no location-specific row exists."""
    _rate(db, "R-ANY", "90.00", "2025-01-01")
    db.commit()
    assert effective_hourly_rate(db, "R-ANY", None, "2026-06") == 90.0


def test_on_boundary_month_is_in_force(db):
    """The effective_date's own month is in force (on-or-before the 1st)."""
    _rate(db, "R-BND", "110.00", "2026-06-01")
    db.commit()
    assert effective_hourly_rate(db, "R-BND", None, "2026-06") == 110.0


# ---------------------------------------------------------------------------
# Location-aware pricing (S6) — the line's workforce location is threaded through
# ---------------------------------------------------------------------------

def test_exact_location_preferred_over_others(db):
    """When per-location rows exist, the line prices at its own location's rate."""
    _rate(db, "R-LOC", "100.00", "2025-01-01", location_id="loc-muc")
    _rate(db, "R-LOC", "60.00", "2025-01-01", location_id="loc-bud")
    _rate(db, "R-LOC", "40.00", "2025-01-01", location_id="loc-pun")
    db.commit()

    assert effective_hourly_rate(db, "R-LOC", "loc-muc", "2026-06") == 100.0
    assert effective_hourly_rate(db, "R-LOC", "loc-bud", "2026-06") == 60.0
    assert effective_hourly_rate(db, "R-LOC", "loc-pun", "2026-06") == 40.0


def test_location_none_falls_back_to_munich(db):
    """A line with no location takes the deterministic Munich fallback, so
    location-less callers stay stable as the rate table gains per-location rows."""
    _rate(db, "R-LOC", "100.00", "2025-01-01", location_id="loc-muc")
    _rate(db, "R-LOC", "60.00", "2025-01-01", location_id="loc-bud")
    db.commit()
    assert effective_hourly_rate(db, "R-LOC", None, "2026-06") == 100.0


def test_location_rate_at_month_step(db):
    """Location pricing is still rate-at-month: a Budapest step-up applies only
    from its effective month onward."""
    _rate(db, "R-LOC", "60.00", "2025-01-01", location_id="loc-bud")
    _rate(db, "R-LOC", "80.00", "2026-07-01", location_id="loc-bud")
    db.commit()
    assert effective_hourly_rate(db, "R-LOC", "loc-bud", "2026-06") == 60.0
    assert effective_hourly_rate(db, "R-LOC", "loc-bud", "2026-07") == 80.0
