"""Session-3 T1 tests — role lines (add/remove), plan edits (dates / stage / DoI
/ milestones), and the Tier-3 mix control.

Two layers:
  - Resolution unit tests: ScenarioPlanEdit date targets reshape the resolved
    window; ScenarioMixChange swaps hours between role lines in the resolved grid.
  - Router integration tests: the /lines, /plan and /mix endpoint families,
    including the Tier-3 write gate (403 for non-Tier-3) and the render-null
    contract's server half.

Personas: persona-controller → person_id p-dev-1 (scenario author / owner);
persona-exec → p-dev-2 (valid write role, non-owner); persona-pl → wrong role.
A ``User`` row with ``tier3_flag`` drives ``user_has_tier3`` for the mix gate.
"""
from decimal import Decimal

import pytest

from models.financial import Forecast
from models.people import RateTable, RoleType
from models.projects import Project, ProjectMilestone
from models.scenarios import (
    Scenario,
    ScenarioForecastCellEdit,
    ScenarioLineEdit,
    ScenarioMixChange,
    ScenarioPlanEdit,
)
from services.scenario_project_scope.resolution import resolve_project_grid


# ---------------------------------------------------------------------------
# Resolution-level helpers
# ---------------------------------------------------------------------------

def _project(db, pid="proj-t1", start="2026-05", end="2026-08"):
    p = Project(
        id=pid, name="T1 Project", pipeline_stage="Active", capex_opex="opex",
        start_month=start, end_month=end, doi=2,
    )
    db.add(p)
    db.commit()
    return p


def _forecast(db, pid, month, sub_category, hours, amount, role_type_id=None):
    db.add(Forecast(
        project_id=pid, month=month, category="internal",
        sub_category=sub_category, role_type_id=role_type_id,
        hours=hours, amount_eur=Decimal(str(amount)),
    ))


def _scenario(db, author="p-dev-1"):
    s = Scenario(name="T1 S", author_id=author, status="private", visibility="private")
    db.add(s)
    db.commit()
    return s


def _line(grid, key):
    return next((l for l in grid.lines if l.line_key == key), None)


def _internal_line_for_role(grid, role_id):
    for l in grid.lines:
        if (l.role_type_id or l.sub_category) == role_id:
            return l
    return None


# ===========================================================================
# Resolution — plan date targets reshape the window
# ===========================================================================

def test_plan_start_month_shifts_resolved_window(db):
    proj = _project(db, start="2026-05", end="2026-08")
    _forecast(db, proj.id, "2026-05", "R1", 100, 10000, role_type_id="R1")
    _forecast(db, proj.id, "2026-06", "R1", 110, 11000, role_type_id="R1")
    sc = _scenario(db)
    # Move the start two months later: the curve shifts with the window.
    db.add(ScenarioPlanEdit(
        scenario_id=sc.id, project_id=proj.id, target="start_month", value="2026-07",
    ))
    db.commit()

    grid = resolve_project_grid(db, sc, proj.id)

    assert grid.start_month == "2026-07"
    line = _line(grid, "internal|R1|R1")
    assert "2026-07" in line.cells and "2026-08" in line.cells
    # Original months no longer carry the curve (it travelled +2).
    assert "2026-05" not in line.cells and "2026-06" not in line.cells
    assert line.cells["2026-07"].hours == 100
    assert line.cells["2026-08"].hours == 110


def test_plan_end_month_sets_window_boundary(db):
    proj = _project(db, start="2026-05", end="2026-08")
    _forecast(db, proj.id, "2026-05", "R1", 100, 10000, role_type_id="R1")
    sc = _scenario(db)
    db.add(ScenarioPlanEdit(
        scenario_id=sc.id, project_id=proj.id, target="end_month", value="2026-11",
    ))
    db.commit()

    grid = resolve_project_grid(db, sc, proj.id)
    assert grid.end_month == "2026-11"
    # Cells are untouched by an end-only edit.
    assert _line(grid, "internal|R1|R1").cells["2026-05"].hours == 100


# ===========================================================================
# Resolution — Tier-3 mix swap
# ===========================================================================

def test_mix_swaps_hours_between_role_lines(db):
    proj = _project(db)
    _forecast(db, proj.id, "2026-06", "R1", 100, 10000, role_type_id="R1")
    db.add(RateTable(role_type_id="R1", competence_center_id="cc-x",
                     hourly_rate=Decimal("100.00"), effective_date="2025-01-01"))
    db.add(RateTable(role_type_id="R2", competence_center_id="cc-x",
                     hourly_rate=Decimal("60.00"), effective_date="2025-01-01"))
    sc = _scenario(db)
    db.add(ScenarioMixChange(
        scenario_id=sc.id, project_id=proj.id,
        swap_from_role_id="R1", swap_to_role_id="R2",
        hours_per_month_swap=Decimal("40"), effective_from="2026-06",
    ))
    db.commit()

    grid = resolve_project_grid(db, sc, proj.id)
    r1 = _internal_line_for_role(grid, "R1")
    r2 = _internal_line_for_role(grid, "R2")
    assert r1.cells["2026-06"].hours == 60
    assert r1.cells["2026-06"].amount_eur == 6000.0   # 60h x 100
    assert r2 is not None
    assert r2.cells["2026-06"].hours == 40
    assert r2.cells["2026-06"].amount_eur == 2400.0   # 40h x 60


def test_mix_does_not_swap_before_effective_from(db):
    proj = _project(db)
    _forecast(db, proj.id, "2026-06", "R1", 100, 10000, role_type_id="R1")
    _forecast(db, proj.id, "2026-09", "R1", 80, 8000, role_type_id="R1")
    sc = _scenario(db)
    db.add(ScenarioMixChange(
        scenario_id=sc.id, project_id=proj.id,
        swap_from_role_id="R1", swap_to_role_id="R2",
        hours_per_month_swap=Decimal("30"), effective_from="2026-09",
    ))
    db.commit()

    grid = resolve_project_grid(db, sc, proj.id)
    r1 = _internal_line_for_role(grid, "R1")
    assert r1.cells["2026-06"].hours == 100  # before effective_from — untouched
    assert r1.cells["2026-09"].hours == 50   # 80 - 30


def test_cell_edit_wins_over_mix(db):
    """Hand cell edits are the last word (§5.1) — applied after the mix swap."""
    proj = _project(db)
    _forecast(db, proj.id, "2026-06", "R1", 100, 10000, role_type_id="R1")
    db.add(RateTable(role_type_id="R1", competence_center_id="cc-x",
                     hourly_rate=Decimal("100.00"), effective_date="2025-01-01"))
    sc = _scenario(db)
    db.add(ScenarioMixChange(
        scenario_id=sc.id, project_id=proj.id,
        swap_from_role_id="R1", swap_to_role_id="R2",
        hours_per_month_swap=Decimal("40"), effective_from="2026-06",
    ))
    db.add(ScenarioForecastCellEdit(
        scenario_id=sc.id, project_id=proj.id, line_key="internal|R1|R1",
        month="2026-06", field="hours", value=Decimal("123"),
    ))
    db.commit()

    grid = resolve_project_grid(db, sc, proj.id)
    r1 = _internal_line_for_role(grid, "R1")
    assert r1.cells["2026-06"].hours == 123  # cell edit overrides the mix result


def test_mix_prices_each_month_at_rate_in_force(db):
    """S6 rate-at-month regression for the mix swap. A swap spanning two months
    across a rate step must re-price each month at the rate in force *that month*
    (rate moved inside the per-month loop), not a single rate for the window."""
    proj = _project(db, start="2026-05", end="2026-08")
    _forecast(db, proj.id, "2026-06", "R1", 100, 10000, role_type_id="R1")
    _forecast(db, proj.id, "2026-07", "R1", 100, 10000, role_type_id="R1")
    # R1 steps 100 -> 200 at 2026-07; R2 flat at 50.
    db.add(RateTable(role_type_id="R1", competence_center_id="cc-x",
                     hourly_rate=Decimal("100.00"), effective_date="2025-01-01"))
    db.add(RateTable(role_type_id="R1", competence_center_id="cc-x",
                     hourly_rate=Decimal("200.00"), effective_date="2026-07-01"))
    db.add(RateTable(role_type_id="R2", competence_center_id="cc-x",
                     hourly_rate=Decimal("50.00"), effective_date="2025-01-01"))
    sc = _scenario(db)
    db.add(ScenarioMixChange(
        scenario_id=sc.id, project_id=proj.id,
        swap_from_role_id="R1", swap_to_role_id="R2",
        hours_per_month_swap=Decimal("40"), effective_from="2026-06",
    ))
    db.commit()

    grid = resolve_project_grid(db, sc, proj.id)
    r1 = _internal_line_for_role(grid, "R1")
    r2 = _internal_line_for_role(grid, "R2")
    # 60h remain on R1 each month, priced at that month's rate (100 in June, 200 in July).
    assert r1.cells["2026-06"].hours == 60
    assert r1.cells["2026-06"].amount_eur == 6000.0    # 60h x 100
    assert r1.cells["2026-07"].hours == 60
    assert r1.cells["2026-07"].amount_eur == 12000.0   # 60h x 200 (step-up)
    # 40h swapped onto R2 each month, flat 50/h.
    assert r2.cells["2026-06"].amount_eur == 2000.0
    assert r2.cells["2026-07"].amount_eur == 2000.0


# ===========================================================================
# Router integration
# ===========================================================================

CONTROLLER = "persona-controller"   # p-dev-1, author/owner
EXEC = "persona-exec"               # p-dev-2, non-owner
PL = "persona-pl"                   # wrong role

ROLE_KEY = "internal|R1|R1"


def _hdr(p):
    return {"X-Current-User": p}


@pytest.fixture
def t1_world(db, seed_personas):
    """Controller-authored private scenario over one project with one internal
    role line (R1) and a milestone, plus a Tier-3 User row for the author."""
    from models.users import User

    proj = Project(
        id="proj-t1r", name="T1 Router Project", pipeline_stage="Active",
        capex_opex="opex", start_month="2026-05", end_month="2026-08", doi=2,
        pl_person_id="p-dev-1",
    )
    db.add(proj)
    db.add(RoleType(id="R1", name="Role One"))
    db.add(RoleType(id="R2", name="Role Two"))
    db.add(Forecast(
        project_id="proj-t1r", month="2026-06", category="internal",
        sub_category="R1", role_type_id="R1", hours=100, amount_eur=Decimal("10000"),
    ))
    db.add(RateTable(role_type_id="R1", competence_center_id="cc-x",
                     hourly_rate=Decimal("100.00"), effective_date="2025-01-01"))
    db.add(RateTable(role_type_id="R2", competence_center_id="cc-x",
                     hourly_rate=Decimal("60.00"), effective_date="2025-01-01"))
    db.add(ProjectMilestone(
        id=4101, project_id="proj-t1r", sequence_number=1, name="Design complete",
        baseline_start="2026-05", baseline_end="2026-06",
        forecast_start="2026-05", forecast_end="2026-06",
    ))
    sc = Scenario(name="T1 Router S", author_id="p-dev-1", status="private",
                  visibility="private")
    db.add(sc)
    # Author is Tier-3.
    db.add(User(id="u-dev-1", username="dev1", display_name="Dev One",
                role="controller", person_id="p-dev-1", tier3_flag=True))
    db.commit()
    return {"sid": sc.id, "pid": "proj-t1r"}


# --- role lines -------------------------------------------------------------

def test_add_role_line_mints_key_and_appears_in_grid(db, test_client, t1_world):
    sid, pid = t1_world["sid"], t1_world["pid"]
    resp = test_client.post(
        f"/api/scenarios/{sid}/projects/{pid}/lines",
        json={"role_type_id": "R2"}, headers=_hdr(CONTROLLER),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["line_key"].startswith("new:role:")
    keys = [r["line_key"] for r in body["grid"]["rows"]]
    assert body["line_key"] in keys
    # Persisted as an add ScenarioLineEdit.
    row = db.query(ScenarioLineEdit).filter(
        ScenarioLineEdit.scenario_id == sid,
        ScenarioLineEdit.line_key == body["line_key"],
    ).one()
    assert row.op == "add" and row.line_kind == "internal_role"


def test_add_role_line_requires_role_type(db, test_client, t1_world):
    sid, pid = t1_world["sid"], t1_world["pid"]
    resp = test_client.post(
        f"/api/scenarios/{sid}/projects/{pid}/lines",
        json={}, headers=_hdr(CONTROLLER),
    )
    assert resp.status_code == 422, resp.text


def test_add_role_line_rejects_unknown_role(db, test_client, t1_world):
    """A role_type_id that does not exist is rejected (no dangling reference)."""
    sid, pid = t1_world["sid"], t1_world["pid"]
    resp = test_client.post(
        f"/api/scenarios/{sid}/projects/{pid}/lines",
        json={"role_type_id": "role-does-not-exist"}, headers=_hdr(CONTROLLER),
    )
    assert resp.status_code == 422, resp.text


def test_plan_rejects_inverted_window(db, test_client, t1_world):
    """Moving start_month past the project's end_month (2026-08) is rejected."""
    sid, pid = t1_world["sid"], t1_world["pid"]
    resp = test_client.put(
        f"/api/scenarios/{sid}/projects/{pid}/plan",
        json={"target": "start_month", "value": "2026-09"},
        headers=_hdr(CONTROLLER),
    )
    assert resp.status_code == 422, resp.text


def test_plan_allows_valid_window(db, test_client, t1_world):
    """A start_month inside the window (>= open month, <= end) is accepted."""
    sid, pid = t1_world["sid"], t1_world["pid"]
    resp = test_client.put(
        f"/api/scenarios/{sid}/projects/{pid}/plan",
        json={"target": "start_month", "value": "2026-06"},
        headers=_hdr(CONTROLLER),
    )
    assert resp.status_code == 200, resp.text


def test_remove_existing_role_line_records_remove_overlay(db, test_client, t1_world):
    sid, pid = t1_world["sid"], t1_world["pid"]
    resp = test_client.delete(
        f"/api/scenarios/{sid}/projects/{pid}/lines/{ROLE_KEY}",
        headers=_hdr(CONTROLLER),
    )
    assert resp.status_code == 200, resp.text
    row = db.query(ScenarioLineEdit).filter(
        ScenarioLineEdit.scenario_id == sid,
        ScenarioLineEdit.line_key == ROLE_KEY,
    ).one()
    assert row.op == "remove"
    # The line is suppressed from the resolved grid.
    keys = [r["line_key"] for r in resp.json()["grid"]["rows"]]
    assert ROLE_KEY not in keys


def test_remove_added_line_deletes_add_row_and_cells(db, test_client, t1_world):
    sid, pid = t1_world["sid"], t1_world["pid"]
    add = test_client.post(
        f"/api/scenarios/{sid}/projects/{pid}/lines",
        json={"role_type_id": "R2"}, headers=_hdr(CONTROLLER),
    ).json()
    line_key = add["line_key"]
    # Put a cell on it, then remove the line — both should vanish.
    test_client.put(
        f"/api/scenarios/{sid}/projects/{pid}/cells",
        json={"line_key": line_key, "month": "2026-06", "field": "hours", "value": 20},
        headers=_hdr(CONTROLLER),
    )
    resp = test_client.delete(
        f"/api/scenarios/{sid}/projects/{pid}/lines/{line_key}",
        headers=_hdr(CONTROLLER),
    )
    assert resp.status_code == 200, resp.text
    assert db.query(ScenarioLineEdit).filter(
        ScenarioLineEdit.line_key == line_key).count() == 0
    assert db.query(ScenarioForecastCellEdit).filter(
        ScenarioForecastCellEdit.line_key == line_key).count() == 0


def test_line_add_non_owner_403(db, test_client, t1_world):
    sid, pid = t1_world["sid"], t1_world["pid"]
    resp = test_client.post(
        f"/api/scenarios/{sid}/projects/{pid}/lines",
        json={"role_type_id": "R2"}, headers=_hdr(EXEC),
    )
    assert resp.status_code == 403, resp.text


def test_line_add_wrong_role_403(db, test_client, t1_world):
    sid, pid = t1_world["sid"], t1_world["pid"]
    resp = test_client.post(
        f"/api/scenarios/{sid}/projects/{pid}/lines",
        json={"role_type_id": "R2"}, headers=_hdr(PL),
    )
    assert resp.status_code == 403, resp.text


# --- plan -------------------------------------------------------------------

def test_plan_get_returns_anchor_and_milestones(db, test_client, t1_world):
    sid, pid = t1_world["sid"], t1_world["pid"]
    resp = test_client.get(
        f"/api/scenarios/{sid}/projects/{pid}/plan", headers=_hdr(CONTROLLER),
    )
    assert resp.status_code == 200, resp.text
    plan = resp.json()
    assert plan["start_month"] == "2026-05"
    assert plan["anchor_start_month"] == "2026-05"
    assert plan["doi"] == 2
    assert plan["start_changed"] is False
    assert len(plan["milestones"]) == 1
    assert plan["milestones"][0]["name"] == "Design complete"


def test_plan_put_date_shifts_grid_and_marks_changed(db, test_client, t1_world):
    sid, pid = t1_world["sid"], t1_world["pid"]
    resp = test_client.put(
        f"/api/scenarios/{sid}/projects/{pid}/plan",
        json={"target": "start_month", "value": "2026-07"}, headers=_hdr(CONTROLLER),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["plan"]["start_month"] == "2026-07"
    assert body["plan"]["start_changed"] is True
    assert body["grid"]["start_month"] == "2026-07"


def test_plan_put_stage_and_doi(db, test_client, t1_world):
    sid, pid = t1_world["sid"], t1_world["pid"]
    test_client.put(
        f"/api/scenarios/{sid}/projects/{pid}/plan",
        json={"target": "stage", "value": "On Hold"}, headers=_hdr(CONTROLLER),
    )
    resp = test_client.put(
        f"/api/scenarios/{sid}/projects/{pid}/plan",
        json={"target": "doi", "value": "4"}, headers=_hdr(CONTROLLER),
    )
    plan = resp.json()["plan"]
    assert plan["stage"] == "On Hold" and plan["stage_changed"] is True
    assert plan["doi"] == 4 and plan["doi_changed"] is True


def test_plan_milestone_edit_overlays_payload(db, test_client, t1_world):
    sid, pid = t1_world["sid"], t1_world["pid"]
    resp = test_client.put(
        f"/api/scenarios/{sid}/projects/{pid}/plan",
        json={
            "target": "milestone", "milestone_id": "4101",
            "entry_json": {"name": "Design (revised)", "forecast_end": "2026-08"},
        },
        headers=_hdr(CONTROLLER),
    )
    assert resp.status_code == 200, resp.text
    ms = resp.json()["plan"]["milestones"][0]
    assert ms["name"] == "Design (revised)"
    assert ms["forecast_end"] == "2026-08"
    assert ms["is_changed"] is True


def test_plan_put_past_date_rejected(db, test_client, t1_world):
    sid, pid = t1_world["sid"], t1_world["pid"]
    resp = test_client.put(
        f"/api/scenarios/{sid}/projects/{pid}/plan",
        json={"target": "start_month", "value": "2026-01"}, headers=_hdr(CONTROLLER),
    )
    assert resp.status_code == 403, resp.text


def test_plan_bad_target_422(db, test_client, t1_world):
    sid, pid = t1_world["sid"], t1_world["pid"]
    resp = test_client.put(
        f"/api/scenarios/{sid}/projects/{pid}/plan",
        json={"target": "bananas", "value": "x"}, headers=_hdr(CONTROLLER),
    )
    assert resp.status_code == 422, resp.text


def test_plan_delete_reverts_target(db, test_client, t1_world):
    sid, pid = t1_world["sid"], t1_world["pid"]
    test_client.put(
        f"/api/scenarios/{sid}/projects/{pid}/plan",
        json={"target": "start_month", "value": "2026-07"}, headers=_hdr(CONTROLLER),
    )
    resp = test_client.delete(
        f"/api/scenarios/{sid}/projects/{pid}/plan?target=start_month",
        headers=_hdr(CONTROLLER),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["plan"]["start_month"] == "2026-05"  # back to anchor
    assert db.query(ScenarioPlanEdit).filter(
        ScenarioPlanEdit.scenario_id == sid,
        ScenarioPlanEdit.target == "start_month",
    ).count() == 0


# --- Tier-3 mix -------------------------------------------------------------

def test_mix_put_as_tier3_author(db, test_client, t1_world):
    sid, pid = t1_world["sid"], t1_world["pid"]
    resp = test_client.put(
        f"/api/scenarios/{sid}/projects/{pid}/mix",
        json={
            "swap_from_role_id": "R1", "swap_to_role_id": "R2",
            "hours_per_month_swap": 40, "effective_from": "2026-06",
        },
        headers=_hdr(CONTROLLER),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body["mix_changes"]) == 1
    assert body["mix_changes"][0]["swap_from_role_id"] == "R1"
    # The swap shows in the resolved grid.
    r1 = next(r for r in body["grid"]["rows"] if r["line_key"] == ROLE_KEY)
    jun = next(c for c in r1["cells"] if c["month"] == "2026-06")
    assert jun["display_value"] == 60.0


def test_mix_put_non_tier3_author_403(db, test_client, seed_personas):
    """Same persona role (controller) but NO Tier-3 User row → write gate 403."""
    proj = Project(
        id="proj-nt3", name="No T3", pipeline_stage="Active", capex_opex="opex",
        start_month="2026-05", end_month="2026-08", pl_person_id="p-dev-1",
    )
    db.add(proj)
    sc = Scenario(name="NT3 S", author_id="p-dev-1", status="private",
                  visibility="private")
    db.add(sc)
    db.commit()
    resp = test_client.put(
        f"/api/scenarios/{sc.id}/projects/proj-nt3/mix",
        json={
            "swap_from_role_id": "R1", "swap_to_role_id": "R2",
            "hours_per_month_swap": 40, "effective_from": "2026-06",
        },
        headers=_hdr(CONTROLLER),
    )
    assert resp.status_code == 403, resp.text
    assert db.query(ScenarioMixChange).filter(
        ScenarioMixChange.scenario_id == sc.id).count() == 0


def test_mix_put_same_role_422(db, test_client, t1_world):
    sid, pid = t1_world["sid"], t1_world["pid"]
    resp = test_client.put(
        f"/api/scenarios/{sid}/projects/{pid}/mix",
        json={
            "swap_from_role_id": "R1", "swap_to_role_id": "R1",
            "hours_per_month_swap": 40, "effective_from": "2026-06",
        },
        headers=_hdr(CONTROLLER),
    )
    assert resp.status_code == 422, resp.text


def test_mix_delete_clears(db, test_client, t1_world):
    sid, pid = t1_world["sid"], t1_world["pid"]
    test_client.put(
        f"/api/scenarios/{sid}/projects/{pid}/mix",
        json={
            "swap_from_role_id": "R1", "swap_to_role_id": "R2",
            "hours_per_month_swap": 40, "effective_from": "2026-06",
        },
        headers=_hdr(CONTROLLER),
    )
    resp = test_client.delete(
        f"/api/scenarios/{sid}/projects/{pid}/mix", headers=_hdr(CONTROLLER),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["mix_changes"] == []
    assert db.query(ScenarioMixChange).filter(
        ScenarioMixChange.scenario_id == sid).count() == 0
