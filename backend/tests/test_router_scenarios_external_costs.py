"""Integration tests for the Session-3 T2 external-cost line-item endpoints on
the project-scope scenarios router:

  GET    /api/scenarios/{id}/projects/{pid}/external-costs
  POST   /api/scenarios/{id}/projects/{pid}/external-costs
  PUT    /api/scenarios/{id}/projects/{pid}/external-costs/{line_key}
  DELETE /api/scenarios/{id}/projects/{pid}/external-costs/{line_key}

External-cost line items are the unit of edit (spec §3 item 5); add/remove/edit
all persist as ``ScenarioLineEdit`` rows (line_kind='external_cost'). EDIT of an
existing line's metadata uses the new ``op='edit'`` overlay op.

The controller persona (``persona-controller`` → person_id ``p-dev-1``) authors
the scenario so is the owner for the write gate. ``persona-exec`` (p-dev-2) is a
viewer-only non-owner; ``persona-pl`` is the wrong role; ``persona-cc-owner`` is
excluded (access layer is Session 4).
"""

from decimal import Decimal

import pytest

from models.financial import ExternalCostType, Forecast
from models.projects import Project
from models.scenarios import Scenario, ScenarioForecastCellEdit, ScenarioLineEdit


CONTROLLER_PERSONA = "persona-controller"   # author / owner
EXEC_PERSONA = "persona-exec"               # non-owner viewer
PL_PERSONA = "persona-pl"                    # wrong role
CC_PERSONA = "persona-cc-owner"              # excluded (Session 4)

PROJECT_ID = "proj-ext2"
EXTERNAL_KEY = "external|ext-lic|"           # natural key for the anchor line
EXTERNAL_MONTH = "2026-07"


def _hdr(persona: str) -> dict:
    return {"X-Current-User": persona}


@pytest.fixture
def ext_world(db, seed_org_base):
    """A controller-authored private scenario over one project with a single
    external-cost anchor line (ext-lic, vendor Globex, 5000 € in 2026-07) and a
    cost-type catalogue (ext-lic + ext-cons)."""
    db.add(ExternalCostType(id="ext-lic", name="Software Licenses"))
    db.add(ExternalCostType(id="ext-cons", name="Consulting"))
    db.add(Project(
        id=PROJECT_ID, name="Ext2 Project", pipeline_stage="Active",
        capex_opex="opex", start_month="2026-01", end_month="2026-12",
        pl_person_id="p-dev-1", rag_status="green",
    ))
    db.add(Forecast(
        project_id=PROJECT_ID, month=EXTERNAL_MONTH, category="external",
        sub_category="ext-lic", hours=None, amount_eur=Decimal("5000.00"),
        vendor="Globex", description="Annual licence", capex_opex="opex",
    ))
    sc = Scenario(
        name="Ext2 Scenario", author_id="p-dev-1", status="private",
        visibility="private",
    )
    db.add(sc)
    db.commit()
    return {"scenario_id": sc.id, "project_id": PROJECT_ID}


def _row(grid: dict, line_key: str) -> dict:
    return next(r for r in grid["rows"] if r["line_key"] == line_key)


def _item(payload: dict, line_key: str) -> dict:
    return next(i for i in payload["items"] if i["line_key"] == line_key)


# ---------------------------------------------------------------------------
# list
# ---------------------------------------------------------------------------

def test_list_returns_anchor_line_and_catalogue(
    db, test_client, seed_personas, ext_world,
):
    sid, pid = ext_world["scenario_id"], ext_world["project_id"]
    resp = test_client.get(
        f"/api/scenarios/{sid}/projects/{pid}/external-costs",
        headers=_hdr(CONTROLLER_PERSONA),
    )
    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["total"] == 1
    item = _item(payload, EXTERNAL_KEY)
    assert item["vendor"] == "Globex"
    assert item["cost_type_id"] == "ext-lic"
    assert item["cost_type_name"] == "Software Licenses"
    assert item["description"] == "Annual licence"
    assert item["capex_opex"] == "opex"
    assert item["total_eur"] == 5000.0
    assert item["origin"] == "anchor"
    cat_ids = {c["id"] for c in payload["available_cost_types"]}
    assert {"ext-lic", "ext-cons"} <= cat_ids


def test_list_non_viewer_returns_403(db, test_client, seed_personas, ext_world):
    sid, pid = ext_world["scenario_id"], ext_world["project_id"]
    resp = test_client.get(
        f"/api/scenarios/{sid}/projects/{pid}/external-costs",
        headers=_hdr(EXEC_PERSONA),
    )
    assert resp.status_code == 403, resp.text


# ---------------------------------------------------------------------------
# add
# ---------------------------------------------------------------------------

def test_add_rejects_unknown_cost_type(
    db, test_client, seed_personas, ext_world,
):
    """A cost_type_id with no ExternalCostType row is rejected (422)."""
    sid, pid = ext_world["scenario_id"], ext_world["project_id"]
    resp = test_client.post(
        f"/api/scenarios/{sid}/projects/{pid}/external-costs",
        json={"cost_type_id": "ext-nope", "vendor": "Initech"},
        headers=_hdr(CONTROLLER_PERSONA),
    )
    assert resp.status_code == 422, resp.text


def test_add_mints_line_and_appears_in_grid_and_list(
    db, test_client, seed_personas, ext_world,
):
    sid, pid = ext_world["scenario_id"], ext_world["project_id"]
    body = {
        "cost_type_id": "ext-cons", "vendor": "Initech",
        "description": "Implementation help", "capex_opex": "capex",
    }
    resp = test_client.post(
        f"/api/scenarios/{sid}/projects/{pid}/external-costs", json=body,
        headers=_hdr(CONTROLLER_PERSONA),
    )
    assert resp.status_code == 200, resp.text
    out = resp.json()
    line_key = out["line_key"]
    assert line_key.startswith("new:ext:")

    # A single add ScenarioLineEdit row was written with the metadata.
    rows = (
        db.query(ScenarioLineEdit)
        .filter(ScenarioLineEdit.scenario_id == sid, ScenarioLineEdit.op == "add")
        .all()
    )
    assert len(rows) == 1
    le = rows[0]
    assert le.line_kind == "external_cost"
    assert le.cost_type_id == "ext-cons"
    assert le.sub_category == "ext-cons"
    assert le.vendor == "Initech"
    assert le.description == "Implementation help"
    assert le.capex_opex == "capex"

    # It is present in the returned grid (empty row, ready for cell edits)…
    assert any(r["line_key"] == line_key for r in out["grid"]["rows"])
    # …and in the external-cost list with origin=added.
    item = _item(out["external_costs"], line_key)
    assert item["origin"] == "added"
    assert item["vendor"] == "Initech"
    assert item["cost_type_name"] == "Consulting"
    assert item["total_eur"] == 0.0


def test_add_invalid_capex_opex_returns_422(
    db, test_client, seed_personas, ext_world,
):
    sid, pid = ext_world["scenario_id"], ext_world["project_id"]
    resp = test_client.post(
        f"/api/scenarios/{sid}/projects/{pid}/external-costs",
        json={"cost_type_id": "ext-cons", "capex_opex": "bogus"},
        headers=_hdr(CONTROLLER_PERSONA),
    )
    assert resp.status_code == 422, resp.text
    assert db.query(ScenarioLineEdit).filter(
        ScenarioLineEdit.scenario_id == sid).count() == 0


# ---------------------------------------------------------------------------
# edit — existing anchor line (op='edit')
# ---------------------------------------------------------------------------

def test_edit_anchor_line_writes_edit_row_and_resolves(
    db, test_client, seed_personas, ext_world,
):
    sid, pid = ext_world["scenario_id"], ext_world["project_id"]
    body = {
        "vendor": "Umbrella", "cost_type_id": "ext-cons",
        "description": "Renegotiated scope",
    }
    resp = test_client.put(
        f"/api/scenarios/{sid}/projects/{pid}/external-costs/{EXTERNAL_KEY}",
        json=body, headers=_hdr(CONTROLLER_PERSONA),
    )
    assert resp.status_code == 200, resp.text

    # An op='edit' overlay row exists carrying the new metadata.
    le = (
        db.query(ScenarioLineEdit)
        .filter(
            ScenarioLineEdit.scenario_id == sid,
            ScenarioLineEdit.line_key == EXTERNAL_KEY,
        )
        .one()
    )
    assert le.op == "edit"
    assert le.vendor == "Umbrella"
    assert le.cost_type_id == "ext-cons"
    assert le.sub_category == "ext-cons"
    assert le.description == "Renegotiated scope"

    # The resolved line reflects the new vendor + cost-type grouping; the € total
    # (5000) is untouched by a metadata edit.
    item = _item(resp.json()["external_costs"], EXTERNAL_KEY)
    assert item["vendor"] == "Umbrella"
    assert item["cost_type_id"] == "ext-cons"
    assert item["cost_type_name"] == "Consulting"
    assert item["description"] == "Renegotiated scope"
    assert item["total_eur"] == 5000.0
    # The resolved grid row label now shows the new vendor.
    assert _row(resp.json()["grid"], EXTERNAL_KEY)["sub_category_name"] == "Umbrella"


def test_edit_partial_keeps_unset_fields(
    db, test_client, seed_personas, ext_world,
):
    """Editing only the vendor leaves cost-type/description at their anchor."""
    sid, pid = ext_world["scenario_id"], ext_world["project_id"]
    resp = test_client.put(
        f"/api/scenarios/{sid}/projects/{pid}/external-costs/{EXTERNAL_KEY}",
        json={"vendor": "Hooli"}, headers=_hdr(CONTROLLER_PERSONA),
    )
    assert resp.status_code == 200, resp.text
    item = _item(resp.json()["external_costs"], EXTERNAL_KEY)
    assert item["vendor"] == "Hooli"
    assert item["cost_type_id"] == "ext-lic"           # unchanged
    assert item["description"] == "Annual licence"     # anchor fallback


def test_edit_pending_added_line_patches_add_row(
    db, test_client, seed_personas, ext_world,
):
    sid, pid = ext_world["scenario_id"], ext_world["project_id"]
    add = test_client.post(
        f"/api/scenarios/{sid}/projects/{pid}/external-costs",
        json={"cost_type_id": "ext-cons", "vendor": "Initech"},
        headers=_hdr(CONTROLLER_PERSONA),
    ).json()
    line_key = add["line_key"]

    resp = test_client.put(
        f"/api/scenarios/{sid}/projects/{pid}/external-costs/{line_key}",
        json={"vendor": "Initech GmbH", "description": "Phase 2"},
        headers=_hdr(CONTROLLER_PERSONA),
    )
    assert resp.status_code == 200, resp.text
    # Still a single row, still op='add' (patched in place, not a new edit row).
    rows = (
        db.query(ScenarioLineEdit)
        .filter(
            ScenarioLineEdit.scenario_id == sid,
            ScenarioLineEdit.line_key == line_key,
        )
        .all()
    )
    assert len(rows) == 1
    assert rows[0].op == "add"
    assert rows[0].vendor == "Initech GmbH"
    assert rows[0].description == "Phase 2"


def test_edit_removed_line_returns_409(
    db, test_client, seed_personas, ext_world,
):
    sid, pid = ext_world["scenario_id"], ext_world["project_id"]
    # Remove the anchor line first.
    test_client.delete(
        f"/api/scenarios/{sid}/projects/{pid}/external-costs/{EXTERNAL_KEY}",
        headers=_hdr(CONTROLLER_PERSONA),
    )
    resp = test_client.put(
        f"/api/scenarios/{sid}/projects/{pid}/external-costs/{EXTERNAL_KEY}",
        json={"vendor": "Nope"}, headers=_hdr(CONTROLLER_PERSONA),
    )
    assert resp.status_code == 409, resp.text


def test_edit_no_fields_returns_422(db, test_client, seed_personas, ext_world):
    sid, pid = ext_world["scenario_id"], ext_world["project_id"]
    resp = test_client.put(
        f"/api/scenarios/{sid}/projects/{pid}/external-costs/{EXTERNAL_KEY}",
        json={}, headers=_hdr(CONTROLLER_PERSONA),
    )
    assert resp.status_code == 422, resp.text


def test_edit_internal_line_key_returns_422(
    db, test_client, seed_personas, ext_world,
):
    sid, pid = ext_world["scenario_id"], ext_world["project_id"]
    resp = test_client.put(
        f"/api/scenarios/{sid}/projects/{pid}/external-costs/internal|role-dev|",
        json={"vendor": "X"}, headers=_hdr(CONTROLLER_PERSONA),
    )
    assert resp.status_code == 422, resp.text


def test_edit_unknown_anchor_line_returns_404(
    db, test_client, seed_personas, ext_world,
):
    sid, pid = ext_world["scenario_id"], ext_world["project_id"]
    resp = test_client.put(
        f"/api/scenarios/{sid}/projects/{pid}/external-costs/external|ext-ghost|",
        json={"vendor": "X"}, headers=_hdr(CONTROLLER_PERSONA),
    )
    assert resp.status_code == 404, resp.text


# ---------------------------------------------------------------------------
# remove
# ---------------------------------------------------------------------------

def test_remove_anchor_line_suppresses_and_clears_cells(
    db, test_client, seed_personas, ext_world,
):
    sid, pid = ext_world["scenario_id"], ext_world["project_id"]
    # Seed a stray cell edit on the line to confirm it is cleared on removal.
    db.add(ScenarioForecastCellEdit(
        scenario_id=sid, project_id=pid, line_key=EXTERNAL_KEY,
        month=EXTERNAL_MONTH, field="amount_eur", value=Decimal("9999"),
    ))
    db.commit()

    resp = test_client.delete(
        f"/api/scenarios/{sid}/projects/{pid}/external-costs/{EXTERNAL_KEY}",
        headers=_hdr(CONTROLLER_PERSONA),
    )
    assert resp.status_code == 200, resp.text

    le = (
        db.query(ScenarioLineEdit)
        .filter(
            ScenarioLineEdit.scenario_id == sid,
            ScenarioLineEdit.line_key == EXTERNAL_KEY,
        )
        .one()
    )
    assert le.op == "remove"
    # Cell edits on the removed line are gone.
    assert (
        db.query(ScenarioForecastCellEdit)
        .filter(ScenarioForecastCellEdit.line_key == EXTERNAL_KEY)
        .count() == 0
    )
    # The line no longer appears in the resolved grid or the external list.
    assert not any(
        r["line_key"] == EXTERNAL_KEY for r in resp.json()["grid"]["rows"]
    )
    assert resp.json()["external_costs"]["total"] == 0


def test_remove_added_line_drops_row_and_cells(
    db, test_client, seed_personas, ext_world,
):
    sid, pid = ext_world["scenario_id"], ext_world["project_id"]
    add = test_client.post(
        f"/api/scenarios/{sid}/projects/{pid}/external-costs",
        json={"cost_type_id": "ext-cons", "vendor": "Initech"},
        headers=_hdr(CONTROLLER_PERSONA),
    ).json()
    line_key = add["line_key"]
    # Put a € cell on the added line.
    test_client.put(
        f"/api/scenarios/{sid}/projects/{pid}/cells",
        json={"line_key": line_key, "month": EXTERNAL_MONTH,
              "field": "amount_eur", "value": 1200},
        headers=_hdr(CONTROLLER_PERSONA),
    )

    resp = test_client.delete(
        f"/api/scenarios/{sid}/projects/{pid}/external-costs/{line_key}",
        headers=_hdr(CONTROLLER_PERSONA),
    )
    assert resp.status_code == 200, resp.text
    # The add row and its cell edit are gone entirely.
    assert (
        db.query(ScenarioLineEdit)
        .filter(ScenarioLineEdit.line_key == line_key)
        .count() == 0
    )
    assert (
        db.query(ScenarioForecastCellEdit)
        .filter(ScenarioForecastCellEdit.line_key == line_key)
        .count() == 0
    )
    assert not any(
        r["line_key"] == line_key for r in resp.json()["grid"]["rows"]
    )


def test_remove_unknown_added_line_returns_404(
    db, test_client, seed_personas, ext_world,
):
    sid, pid = ext_world["scenario_id"], ext_world["project_id"]
    resp = test_client.delete(
        f"/api/scenarios/{sid}/projects/{pid}/external-costs/new:ext:doesnotexist",
        headers=_hdr(CONTROLLER_PERSONA),
    )
    assert resp.status_code == 404, resp.text


# ---------------------------------------------------------------------------
# authorization
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("persona", [EXEC_PERSONA, PL_PERSONA, CC_PERSONA])
def test_add_unauthorized_returns_403(
    db, test_client, seed_personas, ext_world, persona,
):
    sid, pid = ext_world["scenario_id"], ext_world["project_id"]
    resp = test_client.post(
        f"/api/scenarios/{sid}/projects/{pid}/external-costs",
        json={"cost_type_id": "ext-cons"}, headers=_hdr(persona),
    )
    assert resp.status_code == 403, resp.text
    assert db.query(ScenarioLineEdit).filter(
        ScenarioLineEdit.scenario_id == sid).count() == 0


def test_edit_and_remove_unauthorized_returns_403(
    db, test_client, seed_personas, ext_world,
):
    sid, pid = ext_world["scenario_id"], ext_world["project_id"]
    # Exec is a valid write role but not the author → owner gate.
    e = test_client.put(
        f"/api/scenarios/{sid}/projects/{pid}/external-costs/{EXTERNAL_KEY}",
        json={"vendor": "X"}, headers=_hdr(EXEC_PERSONA),
    )
    assert e.status_code == 403, e.text
    d = test_client.delete(
        f"/api/scenarios/{sid}/projects/{pid}/external-costs/{EXTERNAL_KEY}",
        headers=_hdr(CC_PERSONA),
    )
    assert d.status_code == 403, d.text
