"""Stream B tests: resolved-grid rollup (spec §6).

In-memory fixture ResolvedGrids only — no DB. Asserts budget sums, delta,
RAG transitions at threshold boundaries, is_affected, and internal/external/
per-role splits.

Run: cd backend && source .venv/bin/activate && \
    python -m pytest tests/test_scenario_project_scope_rollup.py -v
"""
from __future__ import annotations

import copy

from services.scenario_project_scope.rollup import grid_splits, rollup_grid
from services.scenario_project_scope.types import (
    LINE_KIND_EXTERNAL,
    LINE_KIND_INTERNAL,
    ResolvedCell,
    ResolvedGrid,
    ResolvedLine,
)


# ---------------------------------------------------------------------------
# Fixture builders
# ---------------------------------------------------------------------------

def _internal_line(line_key, role_type_id, cells):
    return ResolvedLine(
        line_key=line_key,
        category="internal",
        kind=LINE_KIND_INTERNAL,
        sub_category=None,
        role_type_id=role_type_id,
        cells={m: ResolvedCell(amount_eur=eur, hours=hrs) for m, (eur, hrs) in cells.items()},
    )


def _external_line(line_key, vendor, cells):
    return ResolvedLine(
        line_key=line_key,
        category="external",
        kind=LINE_KIND_EXTERNAL,
        vendor=vendor,
        cells={m: ResolvedCell(amount_eur=eur) for m, eur in cells.items()},
    )


def _grid(project_id="P1", lines=None, start="2026-01", end="2026-03"):
    return ResolvedGrid(
        project_id=project_id,
        lines=lines or [],
        start_month=start,
        end_month=end,
    )


def _simple_grid(internal_eur=0.0, external_eur=0.0, project_id="P1"):
    """Single internal + single external line, each one cell, totalling the given €."""
    lines = []
    if internal_eur:
        lines.append(_internal_line("internal|dev|R1", "R1", {"2026-01": (internal_eur, 100.0)}))
    if external_eur:
        lines.append(_external_line("external|vendor|V1", "Acme", {"2026-01": external_eur}))
    return _grid(project_id=project_id, lines=lines)


# ---------------------------------------------------------------------------
# rollup_grid: budgets + delta
# ---------------------------------------------------------------------------

def test_budget_sums_across_lines_and_cells():
    anchor = _grid(lines=[
        _internal_line("internal|dev|R1", "R1", {"2026-01": (1000.0, 10.0), "2026-02": (2000.0, 20.0)}),
        _external_line("external|v|V1", "Acme", {"2026-01": 500.0}),
    ])
    adjusted = _grid(lines=[
        _internal_line("internal|dev|R1", "R1", {"2026-01": (1500.0, 15.0), "2026-02": (2000.0, 20.0)}),
        _external_line("external|v|V1", "Acme", {"2026-01": 500.0}),
    ])
    state = rollup_grid(adjusted, anchor, project_name="Proj", baseline_eur=3500.0, original_rag="green")

    assert state["project_id"] == "P1"
    assert state["project_name"] == "Proj"
    assert state["original_budget"] == 3500.0   # 1000 + 2000 + 500
    assert state["adjusted_budget"] == 4000.0   # 1500 + 2000 + 500
    assert state["budget_delta"] == 500.0
    assert state["original_rag"] == "green"


def test_budget_rounds_to_two_decimals():
    anchor = _simple_grid(internal_eur=100.0)
    adjusted = _grid(lines=[
        _internal_line("internal|dev|R1", "R1", {"2026-01": (100.014, 0.5), "2026-02": (0.004, 0.5)}),
    ])
    state = rollup_grid(adjusted, anchor, project_name="P", baseline_eur=100.0, original_rag=None)
    # 100.014 + 0.004 = 100.018 -> round(.,2) == 100.02
    assert state["adjusted_budget"] == 100.02
    assert state["original_rag"] is None


def test_empty_grids_zero_budget():
    state = rollup_grid(_grid(), _grid(), project_name="Empty", baseline_eur=0.0, original_rag=None)
    assert state["original_budget"] == 0.0
    assert state["adjusted_budget"] == 0.0
    assert state["budget_delta"] == 0.0
    assert state["adjusted_rag"] == "green"   # falsy baseline -> drift 0 -> green


# ---------------------------------------------------------------------------
# rollup_grid: RAG transitions at threshold boundaries
# (compute_budget_rag: abs(drift) < 5 -> green; <= 10 -> amber; else red)
# ---------------------------------------------------------------------------

def test_rag_green_below_5_percent():
    # +4.99% drift -> green
    adjusted = _simple_grid(internal_eur=1049.9)
    anchor = _simple_grid(internal_eur=1000.0)
    state = rollup_grid(adjusted, anchor, project_name="P", baseline_eur=1000.0, original_rag="green")
    assert state["adjusted_rag"] == "green"


def test_rag_amber_at_5_percent_boundary():
    # exactly +5% drift -> amber (abs < 5 is False, abs <= 10 True)
    adjusted = _simple_grid(internal_eur=1050.0)
    anchor = _simple_grid(internal_eur=1000.0)
    state = rollup_grid(adjusted, anchor, project_name="P", baseline_eur=1000.0, original_rag="green")
    assert state["adjusted_rag"] == "amber"


def test_rag_amber_at_10_percent_boundary():
    # exactly +10% drift -> amber (abs <= 10 True)
    adjusted = _simple_grid(internal_eur=1100.0)
    anchor = _simple_grid(internal_eur=1000.0)
    state = rollup_grid(adjusted, anchor, project_name="P", baseline_eur=1000.0, original_rag="green")
    assert state["adjusted_rag"] == "amber"


def test_rag_red_above_10_percent():
    # +10.01% drift -> red
    adjusted = _simple_grid(internal_eur=1100.1)
    anchor = _simple_grid(internal_eur=1000.0)
    state = rollup_grid(adjusted, anchor, project_name="P", baseline_eur=1000.0, original_rag="green")
    assert state["adjusted_rag"] == "red"


def test_rag_red_on_negative_drift_below_minus_10():
    # -15% drift -> abs 15 > 10 -> red (under-spend also breaches)
    adjusted = _simple_grid(internal_eur=850.0)
    anchor = _simple_grid(internal_eur=1000.0)
    state = rollup_grid(adjusted, anchor, project_name="P", baseline_eur=1000.0, original_rag="green")
    assert state["adjusted_rag"] == "red"


def test_rag_falsy_baseline_is_green():
    adjusted = _simple_grid(internal_eur=999999.0)
    anchor = _simple_grid(internal_eur=1000.0)
    state = rollup_grid(adjusted, anchor, project_name="P", baseline_eur=0.0, original_rag="amber")
    assert state["adjusted_rag"] == "green"


# ---------------------------------------------------------------------------
# rollup_grid: is_affected
# ---------------------------------------------------------------------------

def test_is_affected_false_when_identical():
    anchor = _grid(lines=[
        _internal_line("internal|dev|R1", "R1", {"2026-01": (1000.0, 10.0)}),
        _external_line("external|v|V1", "Acme", {"2026-01": 500.0}),
    ])
    adjusted = copy.deepcopy(anchor)
    state = rollup_grid(adjusted, anchor, project_name="P", baseline_eur=1500.0, original_rag="green")
    assert state["is_affected"] is False


def test_is_affected_true_on_amount_change():
    anchor = _simple_grid(internal_eur=1000.0)
    adjusted = _simple_grid(internal_eur=1200.0)
    state = rollup_grid(adjusted, anchor, project_name="P", baseline_eur=1000.0, original_rag="green")
    assert state["is_affected"] is True


def test_is_affected_true_on_hours_change_same_eur():
    anchor = _grid(lines=[_internal_line("internal|dev|R1", "R1", {"2026-01": (1000.0, 10.0)})])
    adjusted = _grid(lines=[_internal_line("internal|dev|R1", "R1", {"2026-01": (1000.0, 12.0)})])
    state = rollup_grid(adjusted, anchor, project_name="P", baseline_eur=1000.0, original_rag="green")
    assert state["is_affected"] is True


def test_is_affected_true_on_added_line():
    anchor = _simple_grid(internal_eur=1000.0)
    adjusted = _grid(lines=[
        _internal_line("internal|dev|R1", "R1", {"2026-01": (1000.0, 100.0)}),
        _external_line("new:ext:abc", "Acme", {"2026-02": 300.0}),
    ])
    state = rollup_grid(adjusted, anchor, project_name="P", baseline_eur=1000.0, original_rag="green")
    assert state["is_affected"] is True


def test_is_affected_true_on_added_cell():
    anchor = _grid(lines=[_internal_line("internal|dev|R1", "R1", {"2026-01": (1000.0, 10.0)})])
    adjusted = _grid(lines=[
        _internal_line("internal|dev|R1", "R1", {"2026-01": (1000.0, 10.0), "2026-02": (500.0, 5.0)}),
    ])
    state = rollup_grid(adjusted, anchor, project_name="P", baseline_eur=1000.0, original_rag="green")
    assert state["is_affected"] is True


def test_is_affected_false_within_float_noise():
    anchor = _grid(lines=[_internal_line("internal|dev|R1", "R1", {"2026-01": (1000.0, 10.0)})])
    adjusted = _grid(lines=[_internal_line("internal|dev|R1", "R1", {"2026-01": (1000.0 + 1e-12, 10.0)})])
    state = rollup_grid(adjusted, anchor, project_name="P", baseline_eur=1000.0, original_rag="green")
    assert state["is_affected"] is False


def test_project_id_from_adjusted():
    anchor = _simple_grid(internal_eur=100.0, project_id="ANCHOR")
    adjusted = _simple_grid(internal_eur=100.0, project_id="ADJUSTED")
    state = rollup_grid(adjusted, anchor, project_name="P", baseline_eur=100.0, original_rag=None)
    assert state["project_id"] == "ADJUSTED"


# ---------------------------------------------------------------------------
# grid_splits
# ---------------------------------------------------------------------------

def test_grid_splits_internal_external_and_by_role():
    grid = _grid(lines=[
        _internal_line("internal|dev|R1", "R1", {"2026-01": (1000.0, 10.0), "2026-02": (500.0, 5.0)}),
        _internal_line("internal|qa|R2", "R2", {"2026-01": (800.0, 8.0)}),
        _external_line("external|v|V1", "Acme", {"2026-01": 2000.0}),
        _external_line("external|v|V2", "Globex", {"2026-02": 300.0}),
    ])
    splits = grid_splits(grid)
    assert splits.internal_eur == 2300.0   # 1000 + 500 + 800
    assert splits.external_eur == 2300.0   # 2000 + 300
    assert splits.by_role == {"R1": 1500.0, "R2": 800.0}


def test_grid_splits_aggregates_same_role_across_lines():
    grid = _grid(lines=[
        _internal_line("internal|dev|R1", "R1", {"2026-01": (1000.0, 10.0)}),
        _internal_line("internal|arch|R1", "R1", {"2026-01": (600.0, 6.0)}),
    ])
    splits = grid_splits(grid)
    assert splits.internal_eur == 1600.0
    assert splits.by_role == {"R1": 1600.0}


def test_grid_splits_skips_none_role():
    line = _internal_line("internal|misc|none", None, {"2026-01": (400.0, 4.0)})
    grid = _grid(lines=[line])
    splits = grid_splits(grid)
    assert splits.internal_eur == 400.0
    assert splits.by_role == {}


def test_grid_splits_falls_back_to_sub_category_for_role_key():
    # Seed/legacy internal lines carry the role in sub_category with a NULL
    # role_type_id — by_role must still attribute the € (review finding #2).
    line = ResolvedLine(
        line_key="internal|role-dev|", category="internal",
        kind=LINE_KIND_INTERNAL, sub_category="role-dev", role_type_id=None,
        cells={"2026-01": ResolvedCell(amount_eur=1500.0, hours=15.0)},
    )
    splits = grid_splits(_grid(lines=[line]))
    assert splits.internal_eur == 1500.0
    assert splits.by_role == {"role-dev": 1500.0}


def test_grid_splits_empty_grid():
    splits = grid_splits(_grid())
    assert splits.internal_eur == 0.0
    assert splits.external_eur == 0.0
    assert splits.by_role == {}
