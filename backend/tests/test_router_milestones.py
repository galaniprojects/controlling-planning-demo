"""Integration tests for routers/milestones.py [A-MS-02] [A-MS-03] [A-BK-34]."""

from __future__ import annotations

import pytest

from models.projects import MilestoneType, ProjectMilestone
from models.system import AuditLog


HEADERS_CTRL = {"X-Current-User": "persona-controller"}
HEADERS_PL = {"X-Current-User": "persona-pl"}
HEADERS_EXEC = {"X-Current-User": "persona-exec"}
HEADERS_CC = {"X-Current-User": "persona-cc-owner"}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _seed_milestone_types(db) -> None:
    """Insert the 10 default milestone types per [A-BK-34]."""
    rows = [
        ("mt-planning",      "Planning",                   "blue",    1),
        ("mt-requirements",  "Requirements & Analysis",    "teal",    2),
        ("mt-development",   "Development",                "emerald", 3),
        ("mt-testing",       "Testing/QA",                 "amber",   4),
        ("mt-uat",           "UAT",                        "violet",  5),
        ("mt-pilot",         "Pilot",                      "indigo",  6),
        ("mt-rollout",       "Rollout",                    "sky",     7),
        ("mt-data-migration","Data Migration",             "cyan",    8),
        ("mt-training",      "Training/Change Management", "rose",    9),
        ("mt-hypermaint",    "Hyper-maintenance",          "slate",   10),
    ]
    for id_, name, color, ordering in rows:
        db.add(MilestoneType(
            id=id_, name=name, default_color=color,
            suggested_ordering=ordering, is_active=True,
        ))
    db.commit()


@pytest.fixture
def proj_with_milestones(db, seed_personas, create_test_project):
    """Project owned by persona-pl with three milestones already in place."""
    _seed_milestone_types(db)
    create_test_project(project_id="proj-alpha", months=["2026-01"], pl_person_id="p-pm-1")
    db.add_all([
        ProjectMilestone(
            project_id="proj-alpha", sequence_number=1, name="Discovery",
            milestone_type_id="mt-requirements",
            baseline_start="2026-01", baseline_end="2026-02",
            forecast_start="2026-01", forecast_end="2026-02",
            color=None,
        ),
        ProjectMilestone(
            project_id="proj-alpha", sequence_number=2, name="Build",
            milestone_type_id="mt-development",
            baseline_start="2026-03", baseline_end="2026-06",
            forecast_start="2026-03", forecast_end="2026-07",
            color="purple",  # explicit override
        ),
        ProjectMilestone(
            project_id="proj-alpha", sequence_number=3, name="Rollout",
            milestone_type_id=None,  # unmapped — color must come from override
            baseline_start="2026-07", baseline_end="2026-08",
            forecast_start="2026-08", forecast_end="2026-09",
            color="orange",
        ),
    ])
    db.commit()
    return "proj-alpha"


@pytest.fixture
def empty_proj(db, seed_personas, create_test_project):
    """Project with zero milestones — list endpoint must return [] with total 0."""
    _seed_milestone_types(db)
    create_test_project(project_id="proj-empty", months=["2026-01"], pl_person_id="p-pm-1")
    return "proj-empty"


@pytest.fixture
def other_proj(db, seed_personas, create_test_project):
    """Project NOT owned by persona-pl (and not in their owned-id list)."""
    _seed_milestone_types(db)
    create_test_project(project_id="proj-other", months=["2026-01"], pl_person_id="p-dev-1")
    db.add(ProjectMilestone(
        project_id="proj-other", sequence_number=1, name="Discovery",
        milestone_type_id="mt-requirements",
        baseline_start="2026-01", baseline_end="2026-02",
        forecast_start="2026-01", forecast_end="2026-02",
        color=None,
    ))
    db.commit()
    return "proj-other"


# ---------------------------------------------------------------------------
# GET /api/projects/{id}/milestones
# ---------------------------------------------------------------------------


class TestListMilestones:
    def test_returns_milestones_in_sequence_order(self, test_client, proj_with_milestones):
        resp = test_client.get(
            f"/api/projects/{proj_with_milestones}/milestones",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 3
        sequence_numbers = [m["sequence_number"] for m in data["items"]]
        assert sequence_numbers == [1, 2, 3]

    def test_resolved_color_falls_back_to_type_default(self, test_client, proj_with_milestones):
        resp = test_client.get(
            f"/api/projects/{proj_with_milestones}/milestones",
            headers=HEADERS_CTRL,
        )
        items = {m["sequence_number"]: m for m in resp.json()["items"]}
        # Discovery (mt-requirements, no override) -> teal from type default
        assert items[1]["color"] == "teal"
        # Build (mt-development, override 'purple') -> purple wins
        assert items[2]["color"] == "purple"
        # Rollout (no type, override 'orange') -> orange
        assert items[3]["color"] == "orange"

    def test_slip_months_computed(self, test_client, proj_with_milestones):
        resp = test_client.get(
            f"/api/projects/{proj_with_milestones}/milestones",
            headers=HEADERS_CTRL,
        )
        items = {m["sequence_number"]: m for m in resp.json()["items"]}
        # Discovery: baseline 02 forecast 02 -> 0
        assert items[1]["slip_months"] == 0
        # Build: baseline 06 forecast 07 -> 1
        assert items[2]["slip_months"] == 1
        # Rollout: baseline 08 forecast 09 -> 1
        assert items[3]["slip_months"] == 1

    def test_empty_list_is_valid(self, test_client, empty_proj):
        resp = test_client.get(
            f"/api/projects/{empty_proj}/milestones",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 0
        assert body["items"] == []

    def test_404_for_unknown_project(self, test_client, db, seed_personas):
        _seed_milestone_types(db)
        resp = test_client.get(
            "/api/projects/no-such/milestones",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 404

    @pytest.mark.parametrize("headers", [HEADERS_CTRL, HEADERS_PL, HEADERS_EXEC, HEADERS_CC])
    def test_open_to_all_authenticated_roles(self, test_client, proj_with_milestones, headers):
        resp = test_client.get(
            f"/api/projects/{proj_with_milestones}/milestones",
            headers=headers,
        )
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# POST /api/projects/{id}/milestones
# ---------------------------------------------------------------------------


class TestCreateMilestone:
    BODY = {
        "sequence_number": 4,
        "name": "Hypercare",
        "milestone_type_id": "mt-hypermaint",
        "baseline_start": "2026-10",
        "baseline_end": "2026-11",
        "forecast_start": "2026-10",
        "forecast_end": "2026-12",
    }

    def test_controller_creates(self, test_client, proj_with_milestones):
        resp = test_client.post(
            f"/api/projects/{proj_with_milestones}/milestones",
            headers=HEADERS_CTRL, json=self.BODY,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["sequence_number"] == 4
        assert data["name"] == "Hypercare"
        assert data["color"] == "slate"  # falls back to type default
        assert data["baseline_locked_at"] is not None

    def test_pl_creates_on_own_project(self, test_client, proj_with_milestones):
        resp = test_client.post(
            f"/api/projects/{proj_with_milestones}/milestones",
            headers=HEADERS_PL, json=self.BODY,
        )
        assert resp.status_code == 200

    def test_sequence_collision_returns_409(self, test_client, proj_with_milestones):
        body = dict(self.BODY)
        body["sequence_number"] = 1  # collides with existing Discovery
        resp = test_client.post(
            f"/api/projects/{proj_with_milestones}/milestones",
            headers=HEADERS_CTRL, json=body,
        )
        assert resp.status_code == 409

    def test_unknown_milestone_type_returns_400(self, test_client, proj_with_milestones):
        body = dict(self.BODY)
        body["milestone_type_id"] = "mt-no-such"
        resp = test_client.post(
            f"/api/projects/{proj_with_milestones}/milestones",
            headers=HEADERS_CTRL, json=body,
        )
        assert resp.status_code == 400

    def test_pl_forbidden_on_other_project(self, test_client, other_proj):
        resp = test_client.post(
            f"/api/projects/{other_proj}/milestones",
            headers=HEADERS_PL, json=self.BODY,
        )
        assert resp.status_code == 403

    @pytest.mark.parametrize("headers", [HEADERS_EXEC, HEADERS_CC])
    def test_role_denied(self, test_client, proj_with_milestones, headers):
        resp = test_client.post(
            f"/api/projects/{proj_with_milestones}/milestones",
            headers=headers, json=self.BODY,
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# PUT /api/projects/{id}/milestones/{milestone_id}
# ---------------------------------------------------------------------------


class TestUpdateMilestone:
    def _milestone_id(self, db, project_id: str, sequence: int) -> int:
        m = (
            db.query(ProjectMilestone)
            .filter(
                ProjectMilestone.project_id == project_id,
                ProjectMilestone.sequence_number == sequence,
            )
            .first()
        )
        return m.id

    def test_pl_updates_forecast_dates_on_own_project(self, test_client, db, proj_with_milestones):
        mid = self._milestone_id(db, proj_with_milestones, 1)
        resp = test_client.put(
            f"/api/projects/{proj_with_milestones}/milestones/{mid}",
            headers=HEADERS_PL,
            json={"forecast_end": "2026-04"},
        )
        assert resp.status_code == 200
        assert resp.json()["forecast_end"] == "2026-04"

    def test_pl_forecast_update_on_other_project_forbidden(self, test_client, db, other_proj):
        mid = self._milestone_id(db, other_proj, 1)
        resp = test_client.put(
            f"/api/projects/{other_proj}/milestones/{mid}",
            headers=HEADERS_PL,
            json={"forecast_end": "2026-04"},
        )
        assert resp.status_code == 403

    def test_pl_baseline_update_forbidden(self, test_client, db, proj_with_milestones):
        mid = self._milestone_id(db, proj_with_milestones, 1)
        resp = test_client.put(
            f"/api/projects/{proj_with_milestones}/milestones/{mid}",
            headers=HEADERS_PL,
            json={"baseline_end": "2026-05", "override_reason": "trying"},
        )
        assert resp.status_code == 403

    def test_controller_baseline_without_reason_forbidden(self, test_client, db, proj_with_milestones):
        mid = self._milestone_id(db, proj_with_milestones, 1)
        resp = test_client.put(
            f"/api/projects/{proj_with_milestones}/milestones/{mid}",
            headers=HEADERS_CTRL,
            json={"baseline_end": "2026-05"},
        )
        assert resp.status_code == 403

    def test_controller_baseline_with_reason_succeeds_and_logs(
        self, test_client, db, proj_with_milestones,
    ):
        mid = self._milestone_id(db, proj_with_milestones, 1)
        resp = test_client.put(
            f"/api/projects/{proj_with_milestones}/milestones/{mid}",
            headers=HEADERS_CTRL,
            json={"baseline_end": "2026-05", "override_reason": "Scope change approved by steerco"},
        )
        assert resp.status_code == 200
        assert resp.json()["baseline_end"] == "2026-05"

        log_rows = (
            db.query(AuditLog)
            .filter(AuditLog.entity_type == "milestone")
            .filter(AuditLog.field_changed == "baseline_end")
            .all()
        )
        assert len(log_rows) == 1
        # Override reason is embedded in new_value
        assert "Scope change approved by steerco" in log_rows[0].new_value
        assert log_rows[0].old_value == "2026-02"

    def test_unchanged_value_does_not_log(self, test_client, db, proj_with_milestones):
        mid = self._milestone_id(db, proj_with_milestones, 1)
        # Same baseline_end as current
        test_client.put(
            f"/api/projects/{proj_with_milestones}/milestones/{mid}",
            headers=HEADERS_CTRL,
            json={"baseline_end": "2026-02", "override_reason": "no actual change"},
        )
        rows = db.query(AuditLog).filter(
            AuditLog.entity_type == "milestone",
            AuditLog.field_changed == "baseline_end",
        ).all()
        assert rows == []


# ---------------------------------------------------------------------------
# DELETE
# ---------------------------------------------------------------------------


class TestDeleteMilestone:
    def test_pl_can_delete_on_own_project(self, test_client, db, proj_with_milestones):
        mid = (
            db.query(ProjectMilestone)
            .filter(
                ProjectMilestone.project_id == proj_with_milestones,
                ProjectMilestone.sequence_number == 1,
            )
            .first()
            .id
        )
        resp = test_client.delete(
            f"/api/projects/{proj_with_milestones}/milestones/{mid}",
            headers=HEADERS_PL,
        )
        assert resp.status_code == 200
        # And it's actually gone
        remaining = (
            db.query(ProjectMilestone)
            .filter(ProjectMilestone.project_id == proj_with_milestones)
            .count()
        )
        assert remaining == 2

    @pytest.mark.parametrize("headers", [HEADERS_EXEC, HEADERS_CC])
    def test_role_denied(self, test_client, db, proj_with_milestones, headers):
        mid = (
            db.query(ProjectMilestone)
            .filter(ProjectMilestone.project_id == proj_with_milestones)
            .first()
            .id
        )
        resp = test_client.delete(
            f"/api/projects/{proj_with_milestones}/milestones/{mid}",
            headers=headers,
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# GET /api/admin/milestone-types
# ---------------------------------------------------------------------------


class TestListMilestoneTypes:
    def test_returns_ten_rows_in_suggested_ordering(self, test_client, db, seed_personas):
        _seed_milestone_types(db)
        resp = test_client.get("/api/admin/milestone-types", headers=HEADERS_CTRL)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 10
        ordering = [t["suggested_ordering"] for t in data["items"]]
        assert ordering == [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
        assert data["items"][0]["id"] == "mt-planning"
        assert data["items"][-1]["id"] == "mt-hypermaint"

    @pytest.mark.parametrize("headers", [HEADERS_CTRL, HEADERS_PL, HEADERS_EXEC, HEADERS_CC])
    def test_open_to_all_authenticated_roles(self, test_client, db, seed_personas, headers):
        _seed_milestone_types(db)
        resp = test_client.get("/api/admin/milestone-types", headers=headers)
        assert resp.status_code == 200
