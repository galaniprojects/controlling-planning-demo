"""Simulator Project-Scope Redesign (Session 1) — seed re-expression checks.

Verifies the three demo scenarios load from the freshly-regenerated seed.sql
in the two-layer model (spec §4/§5):

- ``scn-budget-pressure-15``: delay + accelerate STAY as Layer-1 macro
  ScenarioActions (action_type ∈ PROJECT_MACRO_ACTION_TYPES); the former
  ``reduce_budget`` blanket-scale macro is GONE and re-expressed as Layer-2
  ScenarioForecastCellEdit overlay rows on proj-dwh's external lines (uniform
  ×0.70), summing to the −€58.500,00 the ScenarioState/headline encode.
- ``scn-cco-mdh-staffing``: the senior→mid dev swap is mapped to a
  ScenarioMixChange overlay row mirroring the change_allocation params.
- ``scn-mdh-rebalance``: lever-12 BTC scenario UNCHANGED.

Mirrors test_seed_role_assignments.py: schema via Base.metadata.create_all()
then load seed.sql, matching the backend's first-launch bootstrap path.
"""

from __future__ import annotations

import os

import pytest
from sqlalchemy import create_engine

from services.scenario_project_scope.resolution import _natural_line_key

SEED_PATH = os.path.join(os.path.dirname(__file__), "..", "seed", "seed.sql")

# Layer-1 macro action types that legitimately remain ScenarioAction rows.
MACRO_ACTION_TYPES = {
    "delay_project", "accelerate_project", "pause_project", "remove_project",
}


@pytest.fixture
def seed_conn():
    """Bootstrap a fresh in-memory SQLite engine + apply seed.sql."""
    from database import Base
    import models  # noqa: F401 — load all model registrations

    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)

    with open(SEED_PATH) as f:
        seed_sql = f.read()

    conn = engine.raw_connection()
    try:
        conn.executescript(seed_sql)
        conn.commit()
        yield conn
    finally:
        conn.close()
        engine.dispose()


def _scenario_id(conn, stable_name: str) -> int:
    cur = conn.execute("SELECT id FROM scenarios WHERE name = ?", (stable_name,))
    row = cur.fetchone()
    assert row is not None, f"scenario {stable_name!r} not found in seed"
    return row[0]


def test_four_scenarios_present(seed_conn):
    """All four demo scenarios load, with the expected author/visibility.

    Session 4 added a fourth, PL-authored scenario (``scn-pl-predmaint-defer``)
    exercising the Project-Lead authoring path.
    """
    cur = seed_conn.execute(
        "SELECT name, author_id, status, visibility FROM scenarios ORDER BY id"
    )
    rows = cur.fetchall()
    names = {r[0] for r in rows}
    assert names == {
        "MDH BTC Rebalance — DE/PL/CZ",
        "Budget Pressure: 15% Reduction",
        "MDH Staffing Mix — MUC/APD",
        "Predictive Maintenance — Defer 3 Months",
    }, names
    by_name = {r[0]: r for r in rows}
    # Published cross-portfolio scenario visible to all_users.
    assert by_name["Budget Pressure: 15% Reduction"][2] == "published"
    assert by_name["Budget Pressure: 15% Reduction"][3] == "all_users"
    # CC-Owner sandbox stays private, authored by Thomas Brenner.
    assert by_name["MDH Staffing Mix — MUC/APD"][1] == "p-brenner"
    assert by_name["MDH Staffing Mix — MUC/APD"][3] == "private"
    # PL-authored scenario: private, authored by Priya Sharma (p-sharma),
    # not CC-scoped.
    assert by_name["Predictive Maintenance — Defer 3 Months"][1] == "p-sharma"
    assert by_name["Predictive Maintenance — Defer 3 Months"][2] == "private"
    assert by_name["Predictive Maintenance — Defer 3 Months"][3] == "private"


def test_pl_scenario_authoring_path(seed_conn):
    """The Session-4 PL scenario is project-scoped (not CC-scoped) with a
    Tier-1 delay macro on a Priya-owned project + a paired end_month plan edit."""
    sid = _scenario_id(seed_conn, "Predictive Maintenance — Defer 3 Months")

    # CC scope is NULL — a PL scenario is project-scoped, not CC-scoped.
    cc = seed_conn.execute(
        "SELECT cc_owner_scope_cc_id FROM scenarios WHERE id = ?", (sid,)
    ).fetchone()[0]
    assert cc is None

    # One Tier-1 delay macro on proj-predmaint.
    acts = seed_conn.execute(
        "SELECT action_type, project_id, tier FROM scenario_actions "
        "WHERE scenario_id = ? ORDER BY action_order", (sid,)
    ).fetchall()
    assert acts == [("delay_project", "proj-predmaint", 1)], acts

    # Paired end_month plan edit (value shifts with the living-seed delta; at
    # the canonical 2026-04 anchor with no shift it is 2027-06).
    plan = seed_conn.execute(
        "SELECT project_id, target, value FROM scenario_plan_edits "
        "WHERE scenario_id = ?", (sid,)
    ).fetchall()
    assert plan == [("proj-predmaint", "end_month", "2027-06")], plan


def test_budget_scenario_macros_only_no_reduce_budget(seed_conn):
    """proj-dwh reduce_budget macro is gone; only Layer-1 macros remain, and
    action_order is contiguous 1..N."""
    sid = _scenario_id(seed_conn, "Budget Pressure: 15% Reduction")
    cur = seed_conn.execute(
        "SELECT action_order, action_type, project_id FROM scenario_actions "
        "WHERE scenario_id = ? ORDER BY action_order",
        (sid,),
    )
    rows = cur.fetchall()
    action_types = [r[1] for r in rows]
    assert "reduce_budget" not in action_types, (
        "reduce_budget blanket-scale macro must be removed (spec §4)"
    )
    # delay + accelerate remain, both Layer-1 macros.
    assert action_types == ["delay_project", "accelerate_project"], action_types
    for at in action_types:
        assert at in MACRO_ACTION_TYPES, at
    # Contiguous order with no gap left by the removal.
    assert [r[0] for r in rows] == [1, 2], rows
    # Targets preserved.
    by_type = {r[1]: r[2] for r in rows}
    assert by_type["delay_project"] == "proj-connveh"
    assert by_type["accelerate_project"] == "proj-railsafety"


def test_dwh_external_descope_cell_edits(seed_conn):
    """The external descope is re-expressed as Layer-2 cell edits applying ×0.70
    to EVERY future external cell on BOTH proj-dwh external lines, totalling
    −€58.500 vs the live anchor (external €195.000 → €136.500)."""
    sid = _scenario_id(seed_conn, "Budget Pressure: 15% Reduction")
    cur = seed_conn.execute(
        "SELECT line_key, month, field, value FROM scenario_forecast_cell_edits "
        "WHERE scenario_id = ? AND project_id = 'proj-dwh' "
        "ORDER BY line_key, month",
        (sid,),
    )
    edits = cur.fetchall()
    assert edits, "expected proj-dwh external cell edits in seed"

    cloud_key = _natural_line_key("external", "ext-cloud", None)
    consulting_key = _natural_line_key("external", "ext-consulting", None)

    # Every future external Forecast cell on both lines must be covered, each
    # with value = anchor × 0.70, and nothing else touched.
    anchor_cells = seed_conn.execute(
        "SELECT sub_category, month, amount_eur FROM forecasts "
        "WHERE project_id = 'proj-dwh' AND category = 'external'"
    ).fetchall()
    expected = {
        (_natural_line_key("external", sub, None), month): float(amt)
        for sub, month, amt in anchor_cells
    }
    assert len(edits) == len(expected), (
        f"expected one edit per external cell ({len(expected)}), got {len(edits)}"
    )

    total_delta = 0.0
    for line_key, month, field, value in edits:
        assert field == "amount_eur", (line_key, month, field)
        assert line_key in (cloud_key, consulting_key), line_key
        assert line_key.endswith("|"), line_key  # empty role slot
        anchor_val = expected.get((line_key, month))
        assert anchor_val is not None, f"unexpected cell {line_key} {month}"
        assert abs(float(value) - round(anchor_val * 0.70, 2)) < 0.005, (
            f"{line_key} {month}: expected {anchor_val}×0.70, got {value}"
        )
        total_delta += float(value) - anchor_val
    assert abs(total_delta - (-58500.0)) < 0.01, (
        f"external descope must total -58500.00, got {total_delta:.2f}"
    )


def test_dwh_state_reconciled_to_descope(seed_conn):
    """The proj-dwh ScenarioState is reconciled to the −€58.500 descope
    (delta = −58500, adjusted = original − 58500). The connveh/railsafety rows
    are macro-driven placeholders the recompute engine regenerates at
    integration, so their numbers are NOT asserted — only that all 3 load."""
    sid = _scenario_id(seed_conn, "Budget Pressure: 15% Reduction")
    n = seed_conn.execute(
        "SELECT COUNT(*) FROM scenario_states WHERE scenario_id = ?", (sid,)
    ).fetchone()[0]
    assert n == 3, f"expected 3 ScenarioState rows, got {n}"

    row = seed_conn.execute(
        "SELECT original_budget, adjusted_budget, budget_delta FROM scenario_states "
        "WHERE scenario_id = ? AND project_id = 'proj-dwh'",
        (sid,),
    ).fetchone()
    assert row is not None, "proj-dwh ScenarioState row missing"
    original, adjusted, delta = float(row[0]), float(row[1]), float(row[2])
    assert abs(delta - (-58500.0)) < 0.01, delta
    assert abs((original + delta) - adjusted) < 0.01, (original, adjusted, delta)


def test_promotion_audit_references_overlay_descope(seed_conn):
    """The partial-promote audit references the renumbered accelerate macro
    (action 2) and the proj-dwh descope as an overlay diff, not a synthetic
    action :2."""
    sid = _scenario_id(seed_conn, "Budget Pressure: 15% Reduction")
    cur = seed_conn.execute(
        "SELECT routing_summary_json, promoted_count, skipped_count "
        "FROM scenario_promotions WHERE scenario_id = ?",
        (sid,),
    )
    row = cur.fetchone()
    assert row is not None, "scenario_promotions row missing"
    summary, promoted, skipped = row
    assert promoted == 1 and skipped == 2, (promoted, skipped)
    assert "scn-budget-pressure-15:2" in summary  # accelerate promoted
    assert "overlay:proj-dwh-external" in summary  # descope as overlay diff


def test_cco_staffing_mix_change(seed_conn):
    """The senior→mid dev swap is mapped to a ScenarioMixChange overlay row
    mirroring the change_allocation params."""
    sid = _scenario_id(seed_conn, "MDH Staffing Mix — MUC/APD")
    cur = seed_conn.execute(
        "SELECT project_id, cost_center_id, swap_from_role_id, swap_to_role_id, "
        "hours_per_month_swap, effective_from FROM scenario_mix_changes "
        "WHERE scenario_id = ?",
        (sid,),
    )
    rows = cur.fetchall()
    assert len(rows) == 1, rows
    project_id, cc, frm, to, hours, eff = rows[0]
    assert project_id == "proj-mdh-rollout"
    assert cc == "cc-muc-apd"
    assert frm == "role-sr-dev"
    assert to == "role-dev"
    assert abs(float(hours) - 40.0) < 0.01
    assert eff == "2026-05"

    # FK targets resolve to real rows.
    for table, col, val in (
        ("role_types", "id", frm),
        ("role_types", "id", to),
        ("cost_centers", "id", cc),
    ):
        got = seed_conn.execute(
            f"SELECT 1 FROM {table} WHERE {col} = ?", (val,)
        ).fetchone()
        assert got is not None, f"{val} missing from {table}"

    # The change_allocation ScenarioAction is kept for continuity (Tier 3).
    act = seed_conn.execute(
        "SELECT tier, lever_category FROM scenario_actions "
        "WHERE scenario_id = ? AND action_type = 'change_allocation'",
        (sid,),
    ).fetchone()
    assert act is not None and act[0] == 3 and act[1] == "people", act


def test_mdh_rebalance_lever12_unchanged(seed_conn):
    """The lever-12 BTC scenario is left as-is: one btc_profile_line_change
    action, no overlay rows."""
    sid = _scenario_id(seed_conn, "MDH BTC Rebalance — DE/PL/CZ")
    cur = seed_conn.execute(
        "SELECT action_type, lever_category FROM scenario_actions "
        "WHERE scenario_id = ?",
        (sid,),
    )
    rows = cur.fetchall()
    assert len(rows) == 1, rows
    assert rows[0] == ("btc_profile_line_change", "cost_allocation"), rows[0]
    # No Layer-2 overlay rows for the untouched lever-12 scenario.
    for table in (
        "scenario_forecast_cell_edits",
        "scenario_line_edits",
        "scenario_mix_changes",
        "scenario_plan_edits",
    ):
        n = seed_conn.execute(
            f"SELECT COUNT(*) FROM {table} WHERE scenario_id = ?", (sid,)
        ).fetchone()[0]
        assert n == 0, f"{table} should have 0 rows for scn-mdh-rebalance, got {n}"
