"""Run-entity-link invariant on the pipeline transition endpoint.

VIPER Wave 3: a transition to the terminal ``Run entity spawned`` stage must
name the ChargeableEntity (Offering / InternalService) the project hands off
to. The router (routers/pipeline.py) enforces this alongside the DoI gate and,
on success, stamps ``project.run_entity_id`` + ``project.handover_month``.

Tests use the same TestClient + X-Current-User pattern as
``test_router_pipeline.py``. The in-memory test DB is seeded only via fixtures
(no seed.sql), so ChargeableEntity rows are created here rather than relying on
``off-eunify`` / ``proj-iam-run`` from the production seed.
"""

from __future__ import annotations

import pytest

from config import DEMO_DATE
from models.charging import ChargeableEntity
from models.projects import Project
from models.system import AuditLog


HEADERS_CTRL = {"X-Current-User": "persona-controller"}


# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------

def _set_active(db, project_id, *, doi=3):
    """Put a project into Active stage — a structurally-valid source for the
    'Run entity spawned' transition (see VALID_TRANSITIONS)."""
    proj = db.query(Project).filter(Project.id == project_id).first()
    proj.pipeline_stage = "Active"
    proj.doi = doi
    db.commit()
    return proj


@pytest.fixture
def alpha(db, seed_personas, create_test_project):
    """Project owned by persona-pl, parked in Active stage."""
    create_test_project(
        project_id="proj-alpha", months=["2026-01"],
        pl_person_id="p-pm-1",
    )
    _set_active(db, "proj-alpha")
    return "proj-alpha"


@pytest.fixture
def offering(db):
    """A valid Run-entity target: an Offering ChargeableEntity."""
    ent = ChargeableEntity(
        id="off-eunify", entity_type="Offering",
        identifier="IT00S321", name="eUnify Offering",
    )
    db.add(ent)
    db.commit()
    return ent.id


@pytest.fixture
def project_entity(db):
    """A ChargeableEntity of type Project — NOT a valid Run-entity target."""
    ent = ChargeableEntity(
        id="ce-proj-iam-run", entity_type="Project",
        identifier="IT012345", name="IAM Run (project-type)",
    )
    db.add(ent)
    db.commit()
    return ent.id


# ---------------------------------------------------------------------------
# Negative paths
# ---------------------------------------------------------------------------

class TestRunEntityRequired:
    def test_missing_run_entity_id_409(self, test_client, db, alpha):
        resp = test_client.post(
            f"/api/projects/{alpha}/pipeline/transition",
            headers=HEADERS_CTRL,
            json={"target_stage": "Run entity spawned", "target_doi": 3},
        )
        assert resp.status_code == 409, resp.text
        body = resp.json()["detail"]
        assert body["error"] == "run_entity_required"
        # Stage must not have advanced.
        proj = db.query(Project).filter(Project.id == alpha).first()
        assert proj.pipeline_stage == "Active"
        assert proj.run_entity_id is None
        assert proj.handover_month is None

    def test_unknown_run_entity_404(self, test_client, db, alpha):
        resp = test_client.post(
            f"/api/projects/{alpha}/pipeline/transition",
            headers=HEADERS_CTRL,
            json={
                "target_stage": "Run entity spawned",
                "target_doi": 3,
                "run_entity_id": "does-not-exist",
            },
        )
        assert resp.status_code == 404, resp.text
        proj = db.query(Project).filter(Project.id == alpha).first()
        assert proj.pipeline_stage == "Active"

    def test_project_type_run_entity_409(self, test_client, db, alpha, project_entity):
        resp = test_client.post(
            f"/api/projects/{alpha}/pipeline/transition",
            headers=HEADERS_CTRL,
            json={
                "target_stage": "Run entity spawned",
                "target_doi": 3,
                "run_entity_id": project_entity,
            },
        )
        assert resp.status_code == 409, resp.text
        body = resp.json()["detail"]
        assert body["error"] == "invalid_run_entity"
        proj = db.query(Project).filter(Project.id == alpha).first()
        assert proj.pipeline_stage == "Active"
        assert proj.run_entity_id is None


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------

class TestRunEntitySpawnSuccess:
    def test_valid_offering_spawns_and_persists(self, test_client, db, alpha, offering):
        # Omit target_doi: the spawn resolves to DoI 5 (doi_for_stage) and so
        # goes through the real DoI-5 gate. ``alpha`` (via create_test_project)
        # has end_month set, satisfying that gate — this exercises the realistic
        # default-DoI path rather than skipping the gate with target_doi == 3.
        resp = test_client.post(
            f"/api/projects/{alpha}/pipeline/transition",
            headers=HEADERS_CTRL,
            json={
                "target_stage": "Run entity spawned",
                "run_entity_id": offering,
            },
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["pipeline_stage"] == "Run entity spawned"

        proj = db.query(Project).filter(Project.id == alpha).first()
        assert proj.doi == 5  # resolved by doi_for_stage, not the request
        assert proj.run_entity_id == offering
        assert proj.handover_month == DEMO_DATE[:7]

        # Audit row for the run-entity link must be written, with the enriched
        # human-readable new_value ("<id> (<name>)").
        rows = db.query(AuditLog).filter(
            AuditLog.entity_type == "pipeline",
            AuditLog.field_changed == "run_entity_id",
            AuditLog.entity_id == alpha,
        ).all()
        assert len(rows) == 1
        assert rows[0].new_value == f"{offering} (eUnify Offering)"

    def test_default_doi_spawn_without_end_month_hits_doi_gate(
        self, test_client, db, seed_personas, create_test_project, offering,
    ):
        """Spawning with no explicit target_doi resolves to DoI 5, so a project
        lacking end_month is blocked by the pre-existing DoI-5 gate (409) — the
        run-entity invariant passes first, then the gate fires."""
        create_test_project(
            project_id="proj-noend", months=["2026-01"],
            pl_person_id="p-pm-1", end_month=None,
        )
        _set_active(db, "proj-noend")

        resp = test_client.post(
            "/api/projects/proj-noend/pipeline/transition",
            headers=HEADERS_CTRL,
            json={
                "target_stage": "Run entity spawned",
                "run_entity_id": offering,
            },
        )
        assert resp.status_code == 409, resp.text
        body = resp.json()["detail"]
        assert body["error"] == "doi_gate_unmet"
        assert body["target_doi"] == 5
        assert any("end_month" in f for f in body["missing_fields"])
        # Nothing applied — still Active, no link stamped.
        proj = db.query(Project).filter(Project.id == "proj-noend").first()
        assert proj.pipeline_stage == "Active"
        assert proj.run_entity_id is None
        assert proj.handover_month is None

    def test_other_stage_does_not_touch_run_entity(self, test_client, db, alpha, offering):
        """A non-spawn transition must leave run_entity_id / handover_month
        untouched even if a run_entity_id is (spuriously) supplied."""
        resp = test_client.post(
            f"/api/projects/{alpha}/pipeline/transition",
            headers=HEADERS_CTRL,
            json={
                "target_stage": "Hyper-maintenance",
                "target_doi": 3,
                "run_entity_id": offering,
            },
        )
        assert resp.status_code == 200, resp.text
        proj = db.query(Project).filter(Project.id == alpha).first()
        assert proj.pipeline_stage == "Hyper-maintenance"
        assert proj.run_entity_id is None
        assert proj.handover_month is None
