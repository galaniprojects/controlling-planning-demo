"""Integration tests for the Session-2 editable forecast grid endpoints on the
scenarios router (project-scope redesign):

  GET    /api/scenarios/{id}/projects/{pid}/grid
  PUT    /api/scenarios/{id}/projects/{pid}/cells
  DELETE /api/scenarios/{id}/projects/{pid}/cells

Uses the shared TestClient + DemoPersona header fixtures. The controller persona
(``persona-controller`` → person_id ``p-dev-1``) authors the scenario, so it is
the owner for the write/revert ownership gate. ``persona-exec`` (person_id
``p-dev-2``) is a viewer-only non-owner; ``persona-pl`` is the wrong-role caller.
"""

from decimal import Decimal

import pytest

from models.financial import Forecast
from models.people import RateTable
from models.projects import Project
from models.scenarios import (
    Scenario,
    ScenarioAction,
    ScenarioForecastCellEdit,
    ScenarioLineEdit,
    ScenarioState,
)


CONTROLLER_PERSONA = "persona-controller"   # person_id p-dev-1 (scenario author)
EXEC_PERSONA = "persona-exec"               # person_id p-dev-2 (non-owner viewer)
PL_PERSONA = "persona-pl"                    # project_lead (wrong role for write)

PROJECT_ID = "proj-ps2"
INTERNAL_KEY = "internal|role-dev|"
EXTERNAL_KEY = "external|ext-lic|"
INTERNAL_MONTH = "2026-06"
EXTERNAL_MONTH = "2026-07"
ACTUALS_MONTH = "2026-01"


def _hdr(persona: str) -> dict:
    return {"X-Current-User": persona}


@pytest.fixture
def ps_world(db, seed_org_base):
    """A controller-authored private scenario over one project with an internal
    role line (future month 2026-06), an external line (2026-07), and one
    closed-actuals internal cell (2026-01). Effective rate for role-dev = 100."""
    db.add(RateTable(
        role_type_id="role-dev", competence_center_id="comp-dev",
        hourly_rate=Decimal("100.00"), effective_date="2025-06-01",
    ))
    proj = Project(
        id=PROJECT_ID, name="PS2 Project", pipeline_stage="Active",
        capex_opex="opex", start_month="2026-01", end_month="2026-12",
        pl_person_id="p-dev-1", rag_status="green",
    )
    db.add(proj)
    # Internal future cell — 10h @ 100 = 1000.
    db.add(Forecast(
        project_id=PROJECT_ID, month=INTERNAL_MONTH, category="internal",
        sub_category="role-dev", role_type_id=None, hours=10,
        amount_eur=Decimal("1000.00"),
    ))
    # External future cell — 5000 verbatim.
    db.add(Forecast(
        project_id=PROJECT_ID, month=EXTERNAL_MONTH, category="external",
        sub_category="ext-lic", hours=None, amount_eur=Decimal("5000.00"),
    ))
    # Closed-actuals internal cell (month < DEMO_DATE).
    db.add(Forecast(
        project_id=PROJECT_ID, month=ACTUALS_MONTH, category="internal",
        sub_category="role-dev", role_type_id=None, hours=8,
        amount_eur=Decimal("800.00"),
    ))
    sc = Scenario(
        name="PS2 Scenario", author_id="p-dev-1", status="private",
        visibility="private",
    )
    db.add(sc)
    db.commit()
    return {"scenario_id": sc.id, "project_id": PROJECT_ID}


def _row(grid: dict, line_key: str) -> dict:
    return next(r for r in grid["rows"] if r["line_key"] == line_key)


def _cell(grid: dict, line_key: str, month: str) -> dict:
    row = _row(grid, line_key)
    return next(c for c in row["cells"] if c["month"] == month)


# ---------------------------------------------------------------------------
# 1 + 2: grid read
# ---------------------------------------------------------------------------

def test_grid_read_reflects_overlay_euro_anchor_and_changed(
    db, test_client, seed_personas, ps_world,
):
    sid, pid = ps_world["scenario_id"], ps_world["project_id"]
    # Seed an overlay: bump internal June hours 10 -> 25.
    db.add(ScenarioForecastCellEdit(
        scenario_id=sid, project_id=pid, line_key=INTERNAL_KEY,
        month=INTERNAL_MONTH, field="hours", value=Decimal("25"),
    ))
    db.commit()

    resp = test_client.get(
        f"/api/scenarios/{sid}/projects/{pid}/grid", headers=_hdr(CONTROLLER_PERSONA),
    )
    assert resp.status_code == 200, resp.text
    grid = resp.json()

    cell = _cell(grid, INTERNAL_KEY, INTERNAL_MONTH)
    assert cell["display_value"] == 25.0          # resolved hours
    assert cell["amount_eur"] == 2500.0           # 25h x 100 = 2500 €
    assert cell["anchor_value"] == 10.0           # pre-overlay hours
    assert cell["anchor_amount_eur"] == 1000.0    # stored anchor € (10h x 100)
    assert cell["field"] == "hours"
    assert cell["is_changed"] is True
    assert cell["has_overlay"] is True            # an overlay row exists → revertable
    # A sibling cell with no overlay row carries has_overlay False even if present.
    others = [
        c for c in _row(grid, INTERNAL_KEY)["cells"]
        if c["month"] != INTERNAL_MONTH and not c["is_empty"]
    ]
    assert all(c["has_overlay"] is False for c in others)

    row = _row(grid, INTERNAL_KEY)
    assert row["hourly_rate"] == 100.0
    assert row["category"] == "internal"


def test_grid_hourly_rate_label_priced_at_open_forecast_month(
    db, test_client, seed_personas, ps_world,
):
    """The row ``hourly_rate`` display label prices at the first editable
    forecast month (open_forecast_month == 2026-05 in tests), so a future
    rate step-up that is not yet in force at the open month must NOT change the
    label (S6 rate-at-month: the label is the rate the user edits against)."""
    sid, pid = ps_world["scenario_id"], ps_world["project_id"]
    # ps_world seeds role-dev @ 100 from 2025-06. Add a later step-up that is
    # not yet effective at the open month (2026-05).
    db.add(RateTable(
        role_type_id="role-dev", competence_center_id="comp-dev",
        hourly_rate=Decimal("175.00"), effective_date="2026-09-01",
    ))
    db.commit()

    resp = test_client.get(
        f"/api/scenarios/{sid}/projects/{pid}/grid", headers=_hdr(CONTROLLER_PERSONA),
    )
    assert resp.status_code == 200, resp.text
    row = _row(resp.json(), INTERNAL_KEY)
    # Label stays at the rate in force at the open month, not the latest (175).
    assert row["hourly_rate"] == 100.0


def test_actuals_can_edit_flag_and_open_month(
    db, test_client, seed_personas, ps_world,
):
    sid, pid = ps_world["scenario_id"], ps_world["project_id"]
    resp = test_client.get(
        f"/api/scenarios/{sid}/projects/{pid}/grid", headers=_hdr(CONTROLLER_PERSONA),
    )
    assert resp.status_code == 200
    grid = resp.json()
    # Locked-current-month rule: open month is the month after DEMO_DATE
    # (pinned to 2026-04 in tests, so the open forecast month is 2026-05).
    assert grid["open_month"] == "2026-05"

    actuals_cell = _cell(grid, INTERNAL_KEY, ACTUALS_MONTH)
    assert actuals_cell["can_edit"] is False
    future_cell = _cell(grid, INTERNAL_KEY, INTERNAL_MONTH)
    assert future_cell["can_edit"] is True


# ---------------------------------------------------------------------------
# 3 + 4: cell write
# ---------------------------------------------------------------------------

def test_cell_write_insert_then_overwrite_single_row(
    db, test_client, seed_personas, ps_world,
):
    sid, pid = ps_world["scenario_id"], ps_world["project_id"]
    body = {
        "line_key": INTERNAL_KEY, "month": INTERNAL_MONTH,
        "field": "hours", "value": 20,
    }
    r1 = test_client.put(
        f"/api/scenarios/{sid}/projects/{pid}/cells", json=body,
        headers=_hdr(CONTROLLER_PERSONA),
    )
    assert r1.status_code == 200, r1.text
    # Overwrite same cell.
    body["value"] = 30
    r2 = test_client.put(
        f"/api/scenarios/{sid}/projects/{pid}/cells", json=body,
        headers=_hdr(CONTROLLER_PERSONA),
    )
    assert r2.status_code == 200, r2.text

    rows = (
        db.query(ScenarioForecastCellEdit)
        .filter(
            ScenarioForecastCellEdit.scenario_id == sid,
            ScenarioForecastCellEdit.line_key == INTERNAL_KEY,
            ScenarioForecastCellEdit.month == INTERNAL_MONTH,
            ScenarioForecastCellEdit.field == "hours",
        )
        .all()
    )
    assert len(rows) == 1
    assert float(rows[0].value) == 30.0

    grid = r2.json()["grid"]
    assert _cell(grid, INTERNAL_KEY, INTERNAL_MONTH)["display_value"] == 30.0
    assert "impact_dashboard" in r2.json()["state"]


def test_external_amount_written_verbatim(
    db, test_client, seed_personas, ps_world,
):
    sid, pid = ps_world["scenario_id"], ps_world["project_id"]
    body = {
        "line_key": EXTERNAL_KEY, "month": EXTERNAL_MONTH,
        "field": "amount_eur", "value": 7200,
    }
    resp = test_client.put(
        f"/api/scenarios/{sid}/projects/{pid}/cells", json=body,
        headers=_hdr(CONTROLLER_PERSONA),
    )
    assert resp.status_code == 200, resp.text
    cell = _cell(resp.json()["grid"], EXTERNAL_KEY, EXTERNAL_MONTH)
    assert cell["display_value"] == 7200.0
    assert cell["amount_eur"] == 7200.0
    assert cell["field"] == "amount_eur"


# ---------------------------------------------------------------------------
# 5: actuals write-guard
# ---------------------------------------------------------------------------

def test_actuals_guard_rejects_past_month(
    db, test_client, seed_personas, ps_world,
):
    sid, pid = ps_world["scenario_id"], ps_world["project_id"]
    body = {
        "line_key": INTERNAL_KEY, "month": ACTUALS_MONTH,
        "field": "hours", "value": 99,
    }
    resp = test_client.put(
        f"/api/scenarios/{sid}/projects/{pid}/cells", json=body,
        headers=_hdr(CONTROLLER_PERSONA),
    )
    assert resp.status_code == 403, resp.text
    rows = (
        db.query(ScenarioForecastCellEdit)
        .filter(
            ScenarioForecastCellEdit.scenario_id == sid,
            ScenarioForecastCellEdit.month == ACTUALS_MONTH,
        )
        .all()
    )
    assert rows == []


# ---------------------------------------------------------------------------
# 6: validation — bogus field, field/kind mismatch
# ---------------------------------------------------------------------------

def test_bogus_field_returns_422(
    db, test_client, seed_personas, ps_world,
):
    sid, pid = ps_world["scenario_id"], ps_world["project_id"]
    body = {
        "line_key": INTERNAL_KEY, "month": INTERNAL_MONTH,
        "field": "bananas", "value": 5,
    }
    resp = test_client.put(
        f"/api/scenarios/{sid}/projects/{pid}/cells", json=body,
        headers=_hdr(CONTROLLER_PERSONA),
    )
    assert resp.status_code == 422, resp.text


def test_hours_on_external_line_returns_422(
    db, test_client, seed_personas, ps_world,
):
    sid, pid = ps_world["scenario_id"], ps_world["project_id"]
    body = {
        "line_key": EXTERNAL_KEY, "month": EXTERNAL_MONTH,
        "field": "hours", "value": 5,
    }
    resp = test_client.put(
        f"/api/scenarios/{sid}/projects/{pid}/cells", json=body,
        headers=_hdr(CONTROLLER_PERSONA),
    )
    assert resp.status_code == 422, resp.text


# ---------------------------------------------------------------------------
# 7: authorization
# ---------------------------------------------------------------------------

def test_write_as_non_owner_returns_403(
    db, test_client, seed_personas, ps_world,
):
    sid, pid = ps_world["scenario_id"], ps_world["project_id"]
    body = {
        "line_key": INTERNAL_KEY, "month": INTERNAL_MONTH,
        "field": "hours", "value": 20,
    }
    # Exec is a valid write role but not the author -> owner gate 403.
    resp = test_client.put(
        f"/api/scenarios/{sid}/projects/{pid}/cells", json=body,
        headers=_hdr(EXEC_PERSONA),
    )
    assert resp.status_code == 403, resp.text


def test_write_as_wrong_role_returns_403(
    db, test_client, seed_personas, ps_world,
):
    sid, pid = ps_world["scenario_id"], ps_world["project_id"]
    body = {
        "line_key": INTERNAL_KEY, "month": INTERNAL_MONTH,
        "field": "hours", "value": 20,
    }
    resp = test_client.put(
        f"/api/scenarios/{sid}/projects/{pid}/cells", json=body,
        headers=_hdr(PL_PERSONA),
    )
    assert resp.status_code == 403, resp.text


def test_grid_read_as_non_viewer_returns_403(
    db, test_client, seed_personas, ps_world,
):
    sid, pid = ps_world["scenario_id"], ps_world["project_id"]
    # Private scenario, exec is not the author -> not viewable.
    resp = test_client.get(
        f"/api/scenarios/{sid}/projects/{pid}/grid", headers=_hdr(EXEC_PERSONA),
    )
    assert resp.status_code == 403, resp.text


# ---------------------------------------------------------------------------
# 8 + 9: revert per cell / per line
# ---------------------------------------------------------------------------

def test_revert_per_cell_removes_only_that_month(
    db, test_client, seed_personas, ps_world,
):
    sid, pid = ps_world["scenario_id"], ps_world["project_id"]
    db.add(ScenarioForecastCellEdit(
        scenario_id=sid, project_id=pid, line_key=INTERNAL_KEY,
        month=INTERNAL_MONTH, field="hours", value=Decimal("25"),
    ))
    db.add(ScenarioForecastCellEdit(
        scenario_id=sid, project_id=pid, line_key=INTERNAL_KEY,
        month="2026-08", field="hours", value=Decimal("12"),
    ))
    db.commit()

    resp = test_client.delete(
        f"/api/scenarios/{sid}/projects/{pid}/cells"
        f"?line_key={INTERNAL_KEY}&month={INTERNAL_MONTH}",
        headers=_hdr(CONTROLLER_PERSONA),
    )
    assert resp.status_code == 200, resp.text

    remaining = (
        db.query(ScenarioForecastCellEdit)
        .filter(
            ScenarioForecastCellEdit.scenario_id == sid,
            ScenarioForecastCellEdit.line_key == INTERNAL_KEY,
        )
        .all()
    )
    assert {r.month for r in remaining} == {"2026-08"}


def test_revert_per_line_keeps_other_line(
    db, test_client, seed_personas, ps_world,
):
    sid, pid = ps_world["scenario_id"], ps_world["project_id"]
    db.add(ScenarioForecastCellEdit(
        scenario_id=sid, project_id=pid, line_key=INTERNAL_KEY,
        month=INTERNAL_MONTH, field="hours", value=Decimal("25"),
    ))
    db.add(ScenarioForecastCellEdit(
        scenario_id=sid, project_id=pid, line_key=EXTERNAL_KEY,
        month=EXTERNAL_MONTH, field="amount_eur", value=Decimal("9999"),
    ))
    db.commit()

    resp = test_client.delete(
        f"/api/scenarios/{sid}/projects/{pid}/cells?line_key={INTERNAL_KEY}",
        headers=_hdr(CONTROLLER_PERSONA),
    )
    assert resp.status_code == 200, resp.text

    remaining = (
        db.query(ScenarioForecastCellEdit)
        .filter(ScenarioForecastCellEdit.scenario_id == sid)
        .all()
    )
    assert {r.line_key for r in remaining} == {EXTERNAL_KEY}


# ---------------------------------------------------------------------------
# 10: clear-all leaves non-cell overlays + actions untouched
# ---------------------------------------------------------------------------

def test_clear_all_leaves_macro_and_line_edit(
    db, test_client, seed_personas, ps_world,
):
    sid, pid = ps_world["scenario_id"], ps_world["project_id"]
    db.add(ScenarioForecastCellEdit(
        scenario_id=sid, project_id=pid, line_key=INTERNAL_KEY,
        month=INTERNAL_MONTH, field="hours", value=Decimal("25"),
    ))
    db.add(ScenarioForecastCellEdit(
        scenario_id=sid, project_id=pid, line_key=EXTERNAL_KEY,
        month=EXTERNAL_MONTH, field="amount_eur", value=Decimal("9999"),
    ))
    db.add(ScenarioAction(
        scenario_id=sid, action_order=1, scope="project",
        action_type="delay_project", project_id=pid,
        parameters_json='{"months": 2}',
    ))
    db.add(ScenarioLineEdit(
        scenario_id=sid, project_id=pid, line_key="new:ext:abc", op="add",
        line_kind="external_cost", category="external", sub_category="ext-new",
        vendor="Acme",
    ))
    db.commit()

    resp = test_client.delete(
        f"/api/scenarios/{sid}/projects/{pid}/cells",
        headers=_hdr(CONTROLLER_PERSONA),
    )
    assert resp.status_code == 200, resp.text

    assert (
        db.query(ScenarioForecastCellEdit)
        .filter(ScenarioForecastCellEdit.scenario_id == sid)
        .count() == 0
    )
    assert (
        db.query(ScenarioAction)
        .filter(ScenarioAction.scenario_id == sid)
        .count() == 1
    )
    assert (
        db.query(ScenarioLineEdit)
        .filter(ScenarioLineEdit.scenario_id == sid)
        .count() == 1
    )


# ---------------------------------------------------------------------------
# 11: macro apply via existing POST /actions still works + shifts the project
# ---------------------------------------------------------------------------

def test_macro_delay_via_actions_endpoint_shifts_project(
    db, test_client, seed_personas, ps_world,
):
    sid, pid = ps_world["scenario_id"], ps_world["project_id"]
    body = {
        "scope": "project", "action_type": "delay_project",
        "project_id": pid, "parameters": {"months": 2},
    }
    resp = test_client.post(
        f"/api/scenarios/{sid}/actions", json=body,
        headers=_hdr(CONTROLLER_PERSONA),
    )
    assert resp.status_code == 200, resp.text

    # Grid should reflect the shifted curve: internal hours now sit two months
    # later (2026-08 instead of 2026-06).
    grid_resp = test_client.get(
        f"/api/scenarios/{sid}/projects/{pid}/grid", headers=_hdr(CONTROLLER_PERSONA),
    )
    grid = grid_resp.json()
    shifted = _cell(grid, INTERNAL_KEY, "2026-08")
    assert shifted["display_value"] == 10.0
    # A macro shifts cells off anchor (is_changed) but creates NO overlay row,
    # so has_overlay stays False — the curve moved; nothing is per-cell revertable.
    assert shifted["is_changed"] is True
    assert shifted["has_overlay"] is False
    all_cells = [c for r in grid["rows"] for c in r["cells"]]
    assert any(c["is_changed"] for c in all_cells)
    assert not any(c["has_overlay"] for c in all_cells)


# ---------------------------------------------------------------------------
# 12: accelerate clamp note surfaced in the recalc impact dashboard
# ---------------------------------------------------------------------------

def test_accelerate_clamp_note_surfaced_on_write(
    db, test_client, seed_personas, ps_world,
):
    sid, pid = ps_world["scenario_id"], ps_world["project_id"]
    # Open month is 2026-04; earliest movable cell is 2026-06 (diff 2). Asking
    # to accelerate by 3 clamps to 2 and emits a note.
    db.add(ScenarioAction(
        scenario_id=sid, action_order=1, scope="project",
        action_type="accelerate_project", project_id=pid,
        parameters_json='{"months": 3}',
    ))
    db.commit()

    # Trigger a recalc via a cell write on a future month.
    body = {
        "line_key": EXTERNAL_KEY, "month": EXTERNAL_MONTH,
        "field": "amount_eur", "value": 6000,
    }
    resp = test_client.put(
        f"/api/scenarios/{sid}/projects/{pid}/cells", json=body,
        headers=_hdr(CONTROLLER_PERSONA),
    )
    assert resp.status_code == 200, resp.text
    notes = resp.json()["state"]["impact_dashboard"]["macro_notes"]
    assert any("clamp" in n.lower() for n in notes)


# ---------------------------------------------------------------------------
# 13: snapshot invalidation — a pre-seeded ScenarioState row is deleted on write
# ---------------------------------------------------------------------------

def test_write_invalidates_scenario_state_snapshot(
    db, test_client, seed_personas, ps_world,
):
    sid, pid = ps_world["scenario_id"], ps_world["project_id"]
    db.add(ScenarioState(
        scenario_id=sid, project_id=pid,
        original_budget=Decimal("1000.00"), adjusted_budget=Decimal("1000.00"),
        budget_delta=Decimal("0.00"),
    ))
    db.commit()
    assert (
        db.query(ScenarioState)
        .filter(ScenarioState.scenario_id == sid)
        .count() == 1
    )

    body = {
        "line_key": INTERNAL_KEY, "month": INTERNAL_MONTH,
        "field": "hours", "value": 20,
    }
    resp = test_client.put(
        f"/api/scenarios/{sid}/projects/{pid}/cells", json=body,
        headers=_hdr(CONTROLLER_PERSONA),
    )
    assert resp.status_code == 200, resp.text
    assert (
        db.query(ScenarioState)
        .filter(ScenarioState.scenario_id == sid)
        .count() == 0
    )


# ---------------------------------------------------------------------------
# 14: anchor_amount_eur reflects the STORED anchor € (not hours x latest rate)
# ---------------------------------------------------------------------------

def test_anchor_amount_eur_reflects_stored_euro_not_rate(
    db, test_client, seed_personas, ps_world,
):
    """The grid must hand the live-local panel the anchor cell's stored €, so the
    panel's anchor/delta can't drift when a stored forecast € was not priced at
    the current latest rate (role-dev rate = 100)."""
    sid, pid = ps_world["scenario_id"], ps_world["project_id"]
    # An internal cell whose stored € (380) != hours x latest-rate (10 x 100).
    db.add(Forecast(
        project_id=pid, month="2026-08", category="internal",
        sub_category="role-dev", role_type_id=None, hours=10,
        amount_eur=Decimal("380.00"),
    ))
    db.commit()

    resp = test_client.get(
        f"/api/scenarios/{sid}/projects/{pid}/grid", headers=_hdr(CONTROLLER_PERSONA),
    )
    assert resp.status_code == 200, resp.text
    cell = _cell(resp.json(), INTERNAL_KEY, "2026-08")
    assert cell["anchor_value"] == 10.0          # anchor hours
    assert cell["anchor_amount_eur"] == 380.0    # STORED €, not 10 x 100 = 1000
    assert cell["has_overlay"] is False


# ---------------------------------------------------------------------------
# 15: CC Owner is excluded from cell write + revert (access layer is Session 4)
# ---------------------------------------------------------------------------

def test_cc_owner_cannot_write_or_revert_cells(
    db, test_client, seed_personas, ps_world,
):
    sid, pid = ps_world["scenario_id"], ps_world["project_id"]
    body = {
        "line_key": INTERNAL_KEY, "month": INTERNAL_MONTH,
        "field": "hours", "value": 20,
    }
    w = test_client.put(
        f"/api/scenarios/{sid}/projects/{pid}/cells", json=body,
        headers=_hdr("persona-cc-owner"),
    )
    assert w.status_code == 403, w.text
    r = test_client.delete(
        f"/api/scenarios/{sid}/projects/{pid}/cells"
        f"?line_key={INTERNAL_KEY}&month={INTERNAL_MONTH}",
        headers=_hdr("persona-cc-owner"),
    )
    assert r.status_code == 403, r.text
    # No overlay row was created by the rejected write.
    assert (
        db.query(ScenarioForecastCellEdit)
        .filter(ScenarioForecastCellEdit.scenario_id == sid)
        .count() == 0
    )


# ---------------------------------------------------------------------------
# 16: revert with a field/month filter but no line_key is rejected (no bulk wipe)
# ---------------------------------------------------------------------------

def test_revert_field_without_line_key_returns_422(
    db, test_client, seed_personas, ps_world,
):
    sid, pid = ps_world["scenario_id"], ps_world["project_id"]
    # Seed two overlays on different lines so a bulk field-delete would be visible.
    db.add(ScenarioForecastCellEdit(
        scenario_id=sid, project_id=pid, line_key=INTERNAL_KEY,
        month=INTERNAL_MONTH, field="hours", value=Decimal("20"),
    ))
    db.add(ScenarioForecastCellEdit(
        scenario_id=sid, project_id=pid, line_key=EXTERNAL_KEY,
        month=EXTERNAL_MONTH, field="amount_eur", value=Decimal("4000"),
    ))
    db.commit()

    resp = test_client.delete(
        f"/api/scenarios/{sid}/projects/{pid}/cells?field=hours",
        headers=_hdr(CONTROLLER_PERSONA),
    )
    assert resp.status_code == 422, resp.text
    # Nothing was deleted.
    assert (
        db.query(ScenarioForecastCellEdit)
        .filter(ScenarioForecastCellEdit.scenario_id == sid)
        .count() == 2
    )


# ---------------------------------------------------------------------------
# 17: project selector lists all active projects regardless of stage (excl. Cancelled)
# ---------------------------------------------------------------------------

def test_list_scenario_projects_includes_all_active_stages(
    db, test_client, seed_personas, ps_world,
):
    sid = ps_world["scenario_id"]
    # A backlog-stage project (would be dropped by the Change-population filter)
    # and a Cancelled project (should be excluded).
    db.add(Project(
        id="proj-ps2-backlog", name="PS2 Backlog", pipeline_stage="Under Evaluation",
        capex_opex="opex", start_month="2026-03", end_month="2026-12",
        pl_person_id="p-dev-1", rag_status="green",
    ))
    db.add(Project(
        id="proj-ps2-cancelled", name="PS2 Cancelled", pipeline_stage="Cancelled",
        capex_opex="opex", start_month="2026-03", end_month="2026-12",
        pl_person_id="p-dev-1", rag_status="green",
    ))
    db.commit()

    resp = test_client.get(
        f"/api/scenarios/{sid}/projects", headers=_hdr(CONTROLLER_PERSONA),
    )
    assert resp.status_code == 200, resp.text
    ids = {p["id"] for p in resp.json()["items"]}
    assert "proj-ps2" in ids                 # Active
    assert "proj-ps2-backlog" in ids         # backlog stage still selectable
    assert "proj-ps2-cancelled" not in ids   # Cancelled excluded


def test_list_scenario_projects_non_viewer_403(
    db, test_client, seed_personas, ps_world,
):
    sid = ps_world["scenario_id"]
    resp = test_client.get(
        f"/api/scenarios/{sid}/projects", headers=_hdr(EXEC_PERSONA),
    )
    assert resp.status_code == 403, resp.text
