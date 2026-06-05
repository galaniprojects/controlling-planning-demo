"""Unit tests for services/scenario_anchor.py — per-project scenario anchoring
per [B-SL-01..02] (What-If Simulator E2E Fixes Session 3).

The single scalar ``Scenario.anchor_forecast_version_id`` was replaced by the
``ScenarioProjectAnchor`` association — one row per project a scenario touches,
each pinned to *that project's* latest cycle ``ForecastVersion``. These tests
cover the service that owns that logic:

  * deterministic latest-cycle resolution (the core tie-break bug fix),
  * idempotent anchoring of touched projects,
  * the per-project stale-guard (only the stale project is named),
  * rebase validation (project match + cycle-type),
  * the multi-project anchor total,
  * the ``GET /api/scenarios/{id}/rebase-options`` endpoint.

Fixtures follow the inline style of ``tests/test_scenario_promote.py``: a
Person author (with a RoleType for the FK), Projects, ForecastVersions, a
Scenario and its anchor rows are constructed directly. The autouse
``pin_demo_date`` fixture pins DEMO_DATE to "2026-04".
"""

import pytest

from models.financial import ForecastVersion
from models.people import Person, RoleType
from models.projects import Project
from models.scenarios import (
    Scenario, ScenarioAction, ScenarioForecastCellEdit, ScenarioProjectAnchor,
)
from services.scenario_anchor import (
    AnchorError,
    anchor_total,
    anchor_version_ids,
    ensure_anchors_for_touched,
    latest_cycle_version_for_project,
    rebase_anchors,
    stale_projects,
)
from services.scenario_promote import PromoteError, assert_anchor_is_latest_cycle


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def author(db):
    """A Person author + RoleType — Scenario.author_id and Person.role_type_id
    are both NOT NULL."""
    role = RoleType(id="role-anchor", name="Anchor Dev")
    db.add(role)
    db.flush()
    p = Person(id="p-author", name="Author", role_type_id="role-anchor")
    db.add(p)
    db.commit()
    return p


def _project(db, pid: str, pl_person_id=None) -> Project:
    proj = Project(
        id=pid, name=pid, pipeline_stage="Active", capex_opex="capex",
        start_month="2025-01", end_month="2026-12", pl_person_id=pl_person_id,
    )
    db.add(proj)
    db.flush()
    return proj


def _cycle(
    db, project_id: str, version_number: int, *,
    label: str | None = None, total=None, version_type: str = "cycle",
) -> ForecastVersion:
    fv = ForecastVersion(
        project_id=project_id, version_number=version_number,
        version_type=version_type, cycle_label=label or f"v{version_number}",
        created_by_id="p-author",
        granularity_boundary_months=12, planning_horizon_months=60,
        total_amount_eur=total,
    )
    db.add(fv)
    db.flush()
    return fv


def _scenario(db, author_id: str = "p-author") -> Scenario:
    sc = Scenario(name="S", author_id=author_id, status="private")
    db.add(sc)
    db.flush()
    return sc


def _touch(db, sc: Scenario, project_id: str, order: int = 1) -> None:
    """Make the scenario *touch* a project via a minimal action.

    Anchors only ever exist for touched projects (anchoring happens at the
    touch chokepoints); the readers filter to the touched set, so fixtures that
    anchor a project must also touch it to reflect a real scenario.
    """
    db.add(ScenarioAction(
        scenario_id=sc.id, action_order=order, scope="project",
        action_type="reduce_budget", project_id=project_id,
        lever_category="forecast_grid", tier=1,
    ))
    db.flush()


# ---------------------------------------------------------------------------
# 1. Deterministic latest-cycle resolution (the core bug fix)
# ---------------------------------------------------------------------------

class TestLatestCycleVersionForProject:
    def test_picks_highest_version_number_under_tied_created_at(self, db, author):
        """Two cycle versions sharing an identical ``created_at`` — the resolver
        must pick the one with the highest ``version_number`` (deterministic),
        NOT fall back to lowest/highest id ordering."""
        _project(db, "proj-x")
        # Insert the higher version_number FIRST so it has the LOWER id — if the
        # resolver leaned on id ordering it would pick the wrong row.
        from datetime import datetime
        fixed_ts = datetime(2026, 1, 1, 12, 0, 0)
        v3 = _cycle(db, "proj-x", 3, label="Q3")
        v1 = _cycle(db, "proj-x", 1, label="Q1")
        v2 = _cycle(db, "proj-x", 2, label="Q2")
        for fv in (v1, v2, v3):
            fv.created_at = fixed_ts
        db.commit()
        # The highest version_number (v3) was inserted first → it has the LOWEST
        # id; v2 was inserted last → highest id. A created_at-tie-break that fell
        # back to id ordering (the old scalar bug) would mis-pick.
        assert v3.id < v1.id < v2.id

        latest = latest_cycle_version_for_project(db, "proj-x")
        assert latest.version_number == 3
        assert latest.id == v3.id
        # The correct row is neither the lowest- nor the highest-id row by
        # accident — it is the highest version_number.
        assert latest.id != v2.id  # v2 has the highest id but version 2

    def test_ignores_non_cycle_versions(self, db, author):
        _project(db, "proj-x")
        _cycle(db, "proj-x", 1, label="cycle1")
        _cycle(db, "proj-x", 2, label="cr", version_type="cr_approval")
        db.commit()
        latest = latest_cycle_version_for_project(db, "proj-x")
        assert latest.version_number == 1

    def test_none_when_no_cycle(self, db, author):
        _project(db, "proj-x")
        db.commit()
        assert latest_cycle_version_for_project(db, "proj-x") is None


# ---------------------------------------------------------------------------
# 2. ensure_anchors_for_touched — one row per touched project, idempotent
# ---------------------------------------------------------------------------

class TestEnsureAnchorsForTouched:
    def test_creates_one_anchor_per_touched_project_at_latest_cycle(
        self, db, author,
    ):
        _project(db, "proj-a")
        _project(db, "proj-b")
        a2 = _cycle(db, "proj-a", 2)  # proj-a latest
        _cycle(db, "proj-a", 1)
        b1 = _cycle(db, "proj-b", 1)  # proj-b latest
        sc = _scenario(db)
        # Touch proj-a via an action, proj-b via an overlay edit.
        db.add(ScenarioAction(
            scenario_id=sc.id, action_order=1, scope="project",
            action_type="reduce_budget", project_id="proj-a",
            lever_category="forecast_grid", tier=1,
        ))
        db.add(ScenarioForecastCellEdit(
            scenario_id=sc.id, project_id="proj-b",
            line_key="internal|role-dev||", month="2026-06",
            field="hours", value=20.0,
        ))
        db.commit()

        created = ensure_anchors_for_touched(db, sc)
        db.commit()
        assert len(created) == 2
        ids = anchor_version_ids(db, sc)
        assert ids == {"proj-a": a2.id, "proj-b": b1.id}

    def test_idempotent_second_call_adds_zero(self, db, author):
        _project(db, "proj-a")
        _cycle(db, "proj-a", 1)
        sc = _scenario(db)
        db.add(ScenarioAction(
            scenario_id=sc.id, action_order=1, scope="project",
            action_type="reduce_budget", project_id="proj-a",
            lever_category="forecast_grid", tier=1,
        ))
        db.commit()

        first = ensure_anchors_for_touched(db, sc)
        db.commit()
        assert len(first) == 1
        second = ensure_anchors_for_touched(db, sc)
        db.commit()
        assert second == []
        assert len(sc.project_anchors) == 1

    def test_skips_project_without_cycle(self, db, author):
        _project(db, "proj-a")  # no cycle version
        sc = _scenario(db)
        db.add(ScenarioAction(
            scenario_id=sc.id, action_order=1, scope="project",
            action_type="reduce_budget", project_id="proj-a",
            lever_category="forecast_grid", tier=1,
        ))
        db.commit()

        created = ensure_anchors_for_touched(db, sc)
        db.commit()
        assert created == []
        assert sc.project_anchors == []


# ---------------------------------------------------------------------------
# 3. Per-project stale-guard
# ---------------------------------------------------------------------------

class TestStaleProjects:
    def _two_project_scenario(self, db):
        """proj-a anchored to its latest cycle (current); proj-b anchored to an
        older cycle while a newer cycle exists (stale)."""
        _project(db, "proj-a")
        _project(db, "proj-b")
        a1 = _cycle(db, "proj-a", 1)            # proj-a latest
        b1 = _cycle(db, "proj-b", 1)            # proj-b anchor (old)
        _cycle(db, "proj-b", 2)                 # proj-b latest (newer)
        sc = _scenario(db)
        _touch(db, sc, "proj-a", 1)
        _touch(db, sc, "proj-b", 2)
        db.add(ScenarioProjectAnchor(
            scenario_id=sc.id, project_id="proj-a", forecast_version_id=a1.id,
        ))
        db.add(ScenarioProjectAnchor(
            scenario_id=sc.id, project_id="proj-b", forecast_version_id=b1.id,
        ))
        db.commit()
        return sc

    def test_only_the_stale_project_is_returned(self, db, author):
        sc = self._two_project_scenario(db)
        stale = stale_projects(db, sc)
        assert [s.project_id for s in stale] == ["proj-b"]
        s = stale[0]
        assert s.anchored_version_number == 1
        assert s.latest_version_number == 2

    def test_promote_guard_raises_naming_only_the_stale_project(self, db, author):
        sc = self._two_project_scenario(db)
        with pytest.raises(PromoteError) as exc:
            assert_anchor_is_latest_cycle(db, sc)
        assert exc.value.hint == "rebase"
        assert "proj-b" in exc.value.message
        assert "proj-a" not in exc.value.message

    def test_all_current_does_not_raise(self, db, author):
        _project(db, "proj-a")
        a1 = _cycle(db, "proj-a", 1)
        sc = _scenario(db)
        _touch(db, sc, "proj-a")
        db.add(ScenarioProjectAnchor(
            scenario_id=sc.id, project_id="proj-a", forecast_version_id=a1.id,
        ))
        db.commit()
        assert stale_projects(db, sc) == []
        assert assert_anchor_is_latest_cycle(db, sc) is None

    def test_project_without_cycle_is_not_stale(self, db, author):
        """No-cycle tolerance: an anchor on a project that somehow has no cycle
        version is not evaluated (cannot be 'behind' a non-existent latest)."""
        _project(db, "proj-a")
        a1 = _cycle(db, "proj-a", 1)
        sc = _scenario(db)
        _touch(db, sc, "proj-a")
        db.add(ScenarioProjectAnchor(
            scenario_id=sc.id, project_id="proj-a", forecast_version_id=a1.id,
        ))
        db.commit()
        # Delete the only cycle version → project now has no cycle. The anchor
        # row dangles, but with no latest cycle the project is not evaluated.
        db.query(ForecastVersion).filter(ForecastVersion.id == a1.id).delete()
        db.commit()
        assert stale_projects(db, sc) == []


# ---------------------------------------------------------------------------
# 4. rebase_anchors — validation + selective update + audit
# ---------------------------------------------------------------------------

class TestRebaseAnchors:
    def _anchored(self, db):
        _project(db, "proj-a")
        _project(db, "proj-b")
        a1 = _cycle(db, "proj-a", 1)
        a2 = _cycle(db, "proj-a", 2)
        b1 = _cycle(db, "proj-b", 1)
        sc = _scenario(db)
        _touch(db, sc, "proj-a", 1)
        _touch(db, sc, "proj-b", 2)
        db.add(ScenarioProjectAnchor(
            scenario_id=sc.id, project_id="proj-a", forecast_version_id=a1.id,
        ))
        db.add(ScenarioProjectAnchor(
            scenario_id=sc.id, project_id="proj-b", forecast_version_id=b1.id,
        ))
        db.commit()
        return sc, a1, a2, b1

    def test_rejects_version_belonging_to_another_project(self, db, author):
        sc, a1, a2, b1 = self._anchored(db)
        # Try to anchor proj-a to b1 (which belongs to proj-b).
        with pytest.raises(AnchorError) as exc:
            rebase_anchors(db, sc, {"proj-a": b1.id})
        assert "does not belong" in exc.value.message.lower()

    def test_rejects_non_cycle_version(self, db, author):
        sc, a1, a2, b1 = self._anchored(db)
        cr = _cycle(db, "proj-a", 3, version_type="cr_approval")
        db.commit()
        with pytest.raises(AnchorError) as exc:
            rebase_anchors(db, sc, {"proj-a": cr.id})
        assert "not a cycle" in exc.value.message.lower()

    def test_rejects_missing_version_with_404(self, db, author):
        sc, *_ = self._anchored(db)
        with pytest.raises(AnchorError) as exc:
            rebase_anchors(db, sc, {"proj-a": 999999})
        assert exc.value.status_code == 404

    def test_updates_only_listed_projects_and_records_prior_anchor(
        self, db, author,
    ):
        sc, a1, a2, b1 = self._anchored(db)
        rebase_anchors(db, sc, {"proj-a": a2.id})
        db.commit()
        ids = anchor_version_ids(db, sc)
        # proj-a moved to a2; proj-b untouched.
        assert ids == {"proj-a": a2.id, "proj-b": b1.id}
        # The prior anchor is recorded for audit.
        row_a = next(r for r in sc.project_anchors if r.project_id == "proj-a")
        assert row_a.rebased_from_version_id == a1.id

    def test_noop_rebase_to_current_writes_no_audit_entry(self, db, author):
        """Rebasing a project to the version it is already anchored to is a
        no-op — it must not write a spurious self-rebase audit entry."""
        sc, a1, _a2, _b1 = self._anchored(db)
        updated = rebase_anchors(db, sc, {"proj-a": a1.id})  # same as current
        db.commit()
        assert updated == []
        row_a = next(r for r in sc.project_anchors if r.project_id == "proj-a")
        assert row_a.forecast_version_id == a1.id
        assert row_a.rebased_from_version_id is None


# ---------------------------------------------------------------------------
# 5. anchor_total — sum across the anchored versions
# ---------------------------------------------------------------------------

class TestAnchorTotal:
    def test_sums_anchored_version_totals(self, db, author):
        _project(db, "proj-a")
        _project(db, "proj-b")
        a1 = _cycle(db, "proj-a", 1, total=100000)
        b1 = _cycle(db, "proj-b", 1, total=40000)
        sc = _scenario(db)
        _touch(db, sc, "proj-a", 1)
        _touch(db, sc, "proj-b", 2)
        db.add(ScenarioProjectAnchor(
            scenario_id=sc.id, project_id="proj-a", forecast_version_id=a1.id,
        ))
        db.add(ScenarioProjectAnchor(
            scenario_id=sc.id, project_id="proj-b", forecast_version_id=b1.id,
        ))
        db.commit()
        assert anchor_total(db, sc) == 140000.0

    def test_none_when_no_version_carries_a_total(self, db, author):
        _project(db, "proj-a")
        a1 = _cycle(db, "proj-a", 1, total=None)
        sc = _scenario(db)
        _touch(db, sc, "proj-a")
        db.add(ScenarioProjectAnchor(
            scenario_id=sc.id, project_id="proj-a", forecast_version_id=a1.id,
        ))
        db.commit()
        assert anchor_total(db, sc) is None


# ---------------------------------------------------------------------------
# 6. GET /api/scenarios/{id}/rebase-options
# ---------------------------------------------------------------------------

class TestRebaseOptionsEndpoint:
    def test_returns_per_project_labeled_candidates_with_stale_flag(
        self, db, test_client, seed_personas, create_test_project,
    ):
        # proj-alpha + proj-beta exist via the create_test_project factory
        # (pl_person_id matches the PL persona). The controller persona authors.
        create_test_project("proj-alpha", forecast_amt=1000, pl_person_id="p-pm-1")
        create_test_project("proj-beta", forecast_amt=2000, pl_person_id="p-pm-1")
        # proj-alpha: two cycles — anchor to the OLDER one (stale).
        alpha1 = _cycle(db, "proj-alpha", 1, label="Q1")
        _cycle(db, "proj-alpha", 2, label="Q2")
        # proj-beta: one cycle — anchored to it (current).
        beta1 = _cycle(db, "proj-beta", 1, label="Q1")
        sc = Scenario(name="Opts", author_id="p-dev-1", status="private")
        db.add(sc)
        db.flush()
        _touch(db, sc, "proj-alpha", 1)
        _touch(db, sc, "proj-beta", 2)
        db.add(ScenarioProjectAnchor(
            scenario_id=sc.id, project_id="proj-alpha",
            forecast_version_id=alpha1.id,
        ))
        db.add(ScenarioProjectAnchor(
            scenario_id=sc.id, project_id="proj-beta",
            forecast_version_id=beta1.id,
        ))
        db.commit()

        resp = test_client.get(
            f"/api/scenarios/{sc.id}/rebase-options",
            headers={"X-Current-User": "persona-controller"},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["scenario_id"] == sc.id
        by_pid = {p["project_id"]: p for p in body["projects"]}
        assert set(by_pid) == {"proj-alpha", "proj-beta"}

        # proj-alpha is stale (anchored to v1 while v2 is the latest), and offers
        # both cycle versions as labeled candidates.
        alpha = by_pid["proj-alpha"]
        assert alpha["is_stale"] is True
        assert alpha["current_anchor"]["version_number"] == 1
        assert {c["version_number"] for c in alpha["candidates"]} == {1, 2}
        assert all("cycle_label" in c for c in alpha["candidates"])

        # proj-beta is current.
        beta = by_pid["proj-beta"]
        assert beta["is_stale"] is False
        assert beta["current_anchor"]["version_number"] == 1
        assert {c["version_number"] for c in beta["candidates"]} == {1}


# ---------------------------------------------------------------------------
# 7. Orphan anchors — a project the scenario no longer touches is ignored
# ---------------------------------------------------------------------------

class TestOrphanAnchors:
    def _scenario_with_orphan(self, db):
        """proj-a is touched (current); proj-b has an anchor row but is NOT
        touched, and a newer cycle exists for it (would be 'stale' if evaluated).
        """
        _project(db, "proj-a")
        _project(db, "proj-b")
        a1 = _cycle(db, "proj-a", 1, total=100000)         # proj-a latest
        b1 = _cycle(db, "proj-b", 1, total=40000)          # proj-b orphan anchor
        _cycle(db, "proj-b", 2)                            # proj-b newer cycle
        sc = _scenario(db)
        _touch(db, sc, "proj-a")                           # only proj-a is touched
        db.add(ScenarioProjectAnchor(
            scenario_id=sc.id, project_id="proj-a", forecast_version_id=a1.id,
        ))
        db.add(ScenarioProjectAnchor(
            scenario_id=sc.id, project_id="proj-b", forecast_version_id=b1.id,
        ))
        db.commit()
        return sc, a1, b1

    def test_orphan_anchor_does_not_make_scenario_stale(self, db, author):
        sc, _a1, _b1 = self._scenario_with_orphan(db)
        # proj-b's anchor is behind its latest cycle, but proj-b is no longer
        # touched — it must NOT be reported stale and must NOT block promote.
        assert stale_projects(db, sc) == []
        assert assert_anchor_is_latest_cycle(db, sc) is None

    def test_orphan_anchor_excluded_from_ids_and_total(self, db, author):
        sc, a1, _b1 = self._scenario_with_orphan(db)
        # Only the touched project appears in the anchor map / total.
        assert anchor_version_ids(db, sc) == {"proj-a": a1.id}
        assert anchor_total(db, sc) == 100000.0


# ---------------------------------------------------------------------------
# 8. rebase_anchors rejects a project the scenario does not touch
# ---------------------------------------------------------------------------

class TestRebaseMembership:
    def test_rejects_untouched_project(self, db, author):
        _project(db, "proj-a")
        _project(db, "proj-other")
        a1 = _cycle(db, "proj-a", 1)
        other2 = _cycle(db, "proj-other", 1)
        sc = _scenario(db)
        _touch(db, sc, "proj-a")                           # proj-other untouched
        db.add(ScenarioProjectAnchor(
            scenario_id=sc.id, project_id="proj-a", forecast_version_id=a1.id,
        ))
        db.commit()
        with pytest.raises(AnchorError) as exc:
            rebase_anchors(db, sc, {"proj-other": other2.id})
        assert "not part of this scenario" in exc.value.message.lower()
