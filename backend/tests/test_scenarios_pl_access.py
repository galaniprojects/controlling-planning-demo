"""Simulator Session 4 — Project-Lead scenario authoring & access (spec §8/§9/§9.1/§9.2).

Covers the backend access layer that admits Project Leads as scenario authors,
scoped per-action to their own projects, with directional (non-lateral)
publication and the leadership→PL targeted handoff.

Scenarios exercised:
- PL can create a scenario and add an action scoped to a project they lead.
- PL gets 403 adding an action for a project they do not lead.
- PL list shows only own-authored scenarios plus published handoffs that touch
  their projects; a peer PL's scenario is never laterally visible.
- A controller sees a PL's published scenario.
- A PL cannot promote (403).

Fixtures from conftest: test_client, seed_personas, create_test_project,
seed_hierarchy. The autouse pin_demo_date fixture pins DEMO_DATE="2026-04".

Persona → person mapping (conftest seed_personas):
    persona-controller → p-dev-1
    persona-exec       → p-dev-2
    persona-pl         → p-pm-1 (owns proj-alpha, proj-beta via seed list)
    persona-cc-owner   → p-dev-1
"""

import pytest

from models.financial import ForecastVersion
from models.scenarios import Scenario, ScenarioAction


HEADERS_CTRL = {"X-Current-User": "persona-controller"}
HEADERS_EXEC = {"X-Current-User": "persona-exec"}
HEADERS_PL = {"X-Current-User": "persona-pl"}


@pytest.fixture
def world(db, seed_personas, create_test_project):
    """Build projects: two led by the PL persona (p-pm-1) and one led by a peer.

    proj-alpha / proj-beta are in the PL persona's seed list AND have
    pl_person_id=p-pm-1. proj-foreign is led by a different person (p-dev-2) and
    is NOT in the PL persona's seed list, so it is outside the PL's led set.
    """
    create_test_project("proj-alpha", forecast_amt=1000, pl_person_id="p-pm-1")
    create_test_project("proj-beta", forecast_amt=2000, pl_person_id="p-pm-1")
    create_test_project("proj-foreign", forecast_amt=3000, pl_person_id="p-dev-2")

    fv = ForecastVersion(
        project_id="proj-alpha", version_number=1, version_type="cycle",
        cycle_label="Q1 2026", created_by_id="p-dev-1",
        granularity_boundary_months=12, planning_horizon_months=60,
    )
    db.add(fv)
    db.commit()
    db.refresh(fv)
    return {"version_id": fv.id}


def _create_scenario(test_client, headers, name, anchor_id=None):
    # Per Session 3, scenarios no longer accept a scalar
    # ``anchor_forecast_version_id`` in the create body — anchors are pinned
    # per-project when a project is first touched. ``anchor_id`` is accepted
    # for call-site compatibility but intentionally ignored.
    payload = {"name": name}
    resp = test_client.post("/api/scenarios", headers=headers, json=payload)
    return resp


# ---------------------------------------------------------------------------
# 1. PL authoring — create + scoped action
# ---------------------------------------------------------------------------

def test_pl_can_create_scenario(test_client, world):
    resp = _create_scenario(test_client, HEADERS_PL, "PL Plan", world["version_id"])
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "private"


def test_pl_can_add_action_for_led_project(test_client, world, db):
    sid = _create_scenario(
        test_client, HEADERS_PL, "PL Plan", world["version_id"],
    ).json()["id"]

    resp = test_client.post(
        f"/api/scenarios/{sid}/actions", headers=HEADERS_PL,
        json={
            "scope": "project", "action_type": "reduce_budget",
            "project_id": "proj-alpha", "lever_category": "forecast_grid",
            "parameters": {"pct": 10},
        },
    )
    assert resp.status_code == 200, resp.text
    actions = (
        db.query(ScenarioAction)
        .filter(ScenarioAction.scenario_id == sid)
        .all()
    )
    assert len(actions) == 1
    assert actions[0].project_id == "proj-alpha"


# ---------------------------------------------------------------------------
# 2. Per-action scoping — 403 on non-led project
# ---------------------------------------------------------------------------

def test_pl_cannot_add_action_for_non_led_project(test_client, world):
    sid = _create_scenario(
        test_client, HEADERS_PL, "PL Plan", world["version_id"],
    ).json()["id"]

    resp = test_client.post(
        f"/api/scenarios/{sid}/actions", headers=HEADERS_PL,
        json={
            "scope": "project", "action_type": "reduce_budget",
            "project_id": "proj-foreign", "lever_category": "forecast_grid",
            "parameters": {"pct": 10},
        },
    )
    assert resp.status_code == 403, resp.text


def test_pl_cannot_add_portfolio_action_without_project(test_client, world):
    """A PL action must be project-scoped to a led project; a None target 403s."""
    sid = _create_scenario(
        test_client, HEADERS_PL, "PL Plan", world["version_id"],
    ).json()["id"]

    resp = test_client.post(
        f"/api/scenarios/{sid}/actions", headers=HEADERS_PL,
        json={
            "scope": "portfolio", "action_type": "across_the_board_cut",
            "lever_category": "budget_envelope", "parameters": {"pct": 5},
        },
    )
    assert resp.status_code == 403, resp.text


def test_controller_unrestricted_on_any_project(test_client, world, db):
    """Controllers are not scope-gated — may target any project."""
    sid = _create_scenario(
        test_client, HEADERS_CTRL, "Ctrl Plan", world["version_id"],
    ).json()["id"]

    resp = test_client.post(
        f"/api/scenarios/{sid}/actions", headers=HEADERS_CTRL,
        json={
            "scope": "project", "action_type": "reduce_budget",
            "project_id": "proj-foreign", "lever_category": "forecast_grid",
            "parameters": {"pct": 10},
        },
    )
    assert resp.status_code == 200, resp.text


# ---------------------------------------------------------------------------
# 3. PL list = own-authored only, plus published handoffs
# ---------------------------------------------------------------------------

def _seed_scenario(db, author_id, name, status="private", visibility="private"):
    sc = Scenario(
        name=name, author_id=author_id, status=status, visibility=visibility,
    )
    db.add(sc)
    db.flush()
    return sc


def test_pl_list_shows_only_own_authored(test_client, world, db):
    # PL's own scenario.
    own = _seed_scenario(db, "p-pm-1", "Mine")
    # A controller's private scenario — must not appear in PL list.
    _seed_scenario(db, "p-dev-1", "Controller private")
    db.commit()

    resp = test_client.get("/api/scenarios", headers=HEADERS_PL)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    my_ids = {s["id"] for s in body["my_scenarios"]}
    pub_ids = {s["id"] for s in body["published_scenarios"]}
    assert own.id in my_ids
    assert len(pub_ids) == 0


def test_pl_sees_published_handoff_touching_their_project(test_client, world, db):
    # Controller publishes a scenario that touches proj-alpha (PL leads it).
    strat = _seed_scenario(
        db, "p-dev-1", "Strategy 15% cut",
        status="published", visibility="all_users",
    )
    db.add(ScenarioAction(
        scenario_id=strat.id, action_order=1, scope="project",
        action_type="reduce_budget", project_id="proj-alpha",
        lever_category="forecast_grid",
    ))
    # A published scenario that does NOT touch any PL project.
    foreign = _seed_scenario(
        db, "p-dev-1", "Foreign only",
        status="published", visibility="all_users",
    )
    db.add(ScenarioAction(
        scenario_id=foreign.id, action_order=1, scope="project",
        action_type="reduce_budget", project_id="proj-foreign",
        lever_category="forecast_grid",
    ))
    db.commit()

    resp = test_client.get("/api/scenarios", headers=HEADERS_PL)
    assert resp.status_code == 200, resp.text
    pub_ids = {s["id"] for s in resp.json()["published_scenarios"]}
    assert strat.id in pub_ids       # handoff touches proj-alpha
    assert foreign.id not in pub_ids  # does not touch any led project


def test_pl_cannot_see_peer_pl_published_scenario(test_client, world, db):
    """A peer PL's published scenario that does not touch this PL's projects
    is never laterally visible (spec §9.2)."""
    # Peer PL is p-dev-2; their scenario touches proj-foreign only.
    peer = _seed_scenario(
        db, "p-dev-2", "Peer PL plan",
        status="published", visibility="all_users",
    )
    db.add(ScenarioAction(
        scenario_id=peer.id, action_order=1, scope="project",
        action_type="reduce_budget", project_id="proj-foreign",
        lever_category="forecast_grid",
    ))
    db.commit()

    resp = test_client.get("/api/scenarios", headers=HEADERS_PL)
    pub_ids = {s["id"] for s in resp.json()["published_scenarios"]}
    my_ids = {s["id"] for s in resp.json()["my_scenarios"]}
    assert peer.id not in pub_ids
    assert peer.id not in my_ids

    # And the detail endpoint denies access.
    detail = test_client.get(f"/api/scenarios/{peer.id}", headers=HEADERS_PL)
    assert detail.status_code == 403, detail.text


# ---------------------------------------------------------------------------
# 4. Directional publication — controller oversight
# ---------------------------------------------------------------------------

def test_pl_can_publish_own_scenario(test_client, world, db):
    sid = _create_scenario(
        test_client, HEADERS_PL, "PL Plan", world["version_id"],
    ).json()["id"]
    resp = test_client.put(f"/api/scenarios/{sid}/publish", headers=HEADERS_PL)
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "published"


def test_controller_sees_pl_published_scenario(test_client, world, db):
    # PL authors and publishes a scenario.
    pl_sc = _seed_scenario(
        db, "p-pm-1", "PL published",
        status="published", visibility="all_users",
    )
    db.commit()

    resp = test_client.get("/api/scenarios", headers=HEADERS_CTRL)
    assert resp.status_code == 200, resp.text
    pub_ids = {s["id"] for s in resp.json()["published_scenarios"]}
    assert pl_sc.id in pub_ids

    detail = test_client.get(f"/api/scenarios/{pl_sc.id}", headers=HEADERS_CTRL)
    # Detail also needs scenario state; we only assert access is not 403.
    assert detail.status_code != 403, detail.text


# ---------------------------------------------------------------------------
# 5. PL cannot promote
# ---------------------------------------------------------------------------

def test_pl_cannot_promote(test_client, world, db):
    sid = _create_scenario(
        test_client, HEADERS_PL, "PL Plan", world["version_id"],
    ).json()["id"]

    preview = test_client.post(
        f"/api/scenarios/{sid}/promote/preview", headers=HEADERS_PL, json={},
    )
    assert preview.status_code == 403, preview.text

    execute = test_client.post(
        f"/api/scenarios/{sid}/promote", headers=HEADERS_PL, json={},
    )
    assert execute.status_code == 403, execute.text


# ---------------------------------------------------------------------------
# 6. Per-action scoping reaches the project-scope overlay-write endpoints
# ---------------------------------------------------------------------------

def test_pl_cell_write_scoped_to_led_project(test_client, world):
    """The project-scope cell-write endpoint enforces PL scoping too: a led
    project is permitted (not 403), a non-led project is rejected (403)."""
    sid = _create_scenario(
        test_client, HEADERS_PL, "PL Plan", world["version_id"],
    ).json()["id"]

    # Non-led project -> 403 (scoping), regardless of payload validity.
    foreign = test_client.put(
        f"/api/scenarios/{sid}/projects/proj-foreign/cells", headers=HEADERS_PL,
        json={"line_key": "internal|role-dev|", "month": "2026-08",
              "field": "hours", "value": 10},
    )
    assert foreign.status_code == 403, foreign.text

    # Led project -> the scoping gate passes (NOT 403); any non-403 is fine here.
    led = test_client.put(
        f"/api/scenarios/{sid}/projects/proj-alpha/cells", headers=HEADERS_PL,
        json={"line_key": "internal|role-dev|", "month": "2026-08",
              "field": "hours", "value": 10},
    )
    assert led.status_code != 403, led.text
