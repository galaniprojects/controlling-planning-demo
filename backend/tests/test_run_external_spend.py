"""Tests for Run-scoped external spend — VIPER Wave 5 §10.

The Run external-spend endpoints reuse the Change services unchanged; the only
difference is an additive ``population='run'`` branch in
``report_service._get_scoped_project_ids`` that restricts the population to
projects linked to a Run entity (``Project.run_entity_id IS NOT NULL``).
"""

from __future__ import annotations

import pytest

from models.charging import ChargeableEntity
from models.projects import Project
from services.report_service import _get_scoped_project_ids


@pytest.fixture
def seed_run_linked_projects(db):
    """Two active projects: one linked to a Run entity, one not."""
    run_entity = ChargeableEntity(
        id="svc-run", entity_type="InternalService", identifier="ITF20055",
        name="Run Service", annual_cost=500.0,
    )
    db.add(run_entity)
    db.flush()

    common = dict(status="active", capex_opex="opex",
                  start_month="2025-01", end_month="2026-12")
    linked = Project(id="proj-run", name="Handed-over Project",
                     run_entity_id="svc-run", **common)
    unlinked = Project(id="proj-change", name="Change Project", **common)
    db.add_all([linked, unlinked])
    db.commit()
    return {"linked": "proj-run", "unlinked": "proj-change"}


def test_run_population_includes_only_run_linked(
    db, controller_user, seed_run_linked_projects
):
    """(d) Run scoping includes ONLY run_entity_id-linked projects."""
    ids = _get_scoped_project_ids(db, controller_user, {"population": "run"})
    assert ids == [seed_run_linked_projects["linked"]]
    assert seed_run_linked_projects["unlinked"] not in ids


def test_change_population_unchanged(
    db, controller_user, seed_run_linked_projects
):
    """(e) Existing (Change / unfiltered) behaviour is unchanged — full population."""
    # No population filter → both active projects visible.
    ids_all = _get_scoped_project_ids(db, controller_user, {})
    assert set(ids_all) == {
        seed_run_linked_projects["linked"],
        seed_run_linked_projects["unlinked"],
    }

    # An unrelated population value is not treated as 'run' → no extra filter.
    ids_change = _get_scoped_project_ids(db, controller_user, {"population": "change"})
    assert set(ids_change) == set(ids_all)


def test_run_population_respects_role_scoping(
    db, pl_user, seed_run_linked_projects
):
    """Run filter composes with role scoping (PL sees only own projects)."""
    # pl_user owns proj-alpha / proj-beta (neither is run-linked here).
    ids = _get_scoped_project_ids(db, pl_user, {"population": "run"})
    assert ids == []
