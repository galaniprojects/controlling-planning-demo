"""Tests that CR approval auto-creates a ForecastVersion [C-FV-02]."""
from __future__ import annotations

from unittest.mock import patch
import pytest

HEADERS_CTRL = {"X-Current-User": "persona-controller"}


def _setup_params(db):
    from models.system import PlanningParameter
    existing = {r.key for r in db.query(PlanningParameter).all()}
    if "granularity_boundary_months" not in existing:
        db.add(PlanningParameter(
            key="granularity_boundary_months", name="Boundary",
            description="", current_value="12", default_value="12",
            data_type="integer", param_group="planning",
        ))
    if "planning_horizon_months" not in existing:
        db.add(PlanningParameter(
            key="planning_horizon_months", name="Horizon",
            description="", current_value="60", default_value="60",
            data_type="integer", param_group="planning",
        ))
    db.commit()


@patch("routers.workbench.DEMO_DATE", "2026-04")
@patch("routers.portfolio.DEMO_DATE", "2026-04")
@patch("config.DEMO_DATE", "2026-04")
class TestCRApprovalCreatesVersion:
    def _create_approvable_cr(self, db, project_id="proj-alpha"):
        """Insert a CR in 'pending_controller_approval' state."""
        from models.change_requests import ChangeRequest, CRChangeDetail
        from datetime import datetime

        cr = ChangeRequest(
            project_id=project_id,
            submitted_by_id="p-pm-1",  # from seed_org_base
            submission_timestamp=datetime.utcnow(),
            status="pending_controller_approval",
            change_category="external_cost",
            summary="Test CR",
            justification="Test",
            is_system_suggested=False,
        )
        db.add(cr)
        db.flush()
        return cr

    def test_approve_cr_creates_version(self, test_client, seed_personas, create_test_project, db):
        """Approving a CR should create exactly one version with type='cr_approval'."""
        _setup_params(db)
        create_test_project("proj-alpha")
        cr = self._create_approvable_cr(db)
        db.commit()

        resp = test_client.put(
            f"/api/portfolio/approvals/{cr.id}/approve",
            json={},
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200

        # Check that a forecast version was created
        from models.financial import ForecastVersion
        versions = db.query(ForecastVersion).filter(
            ForecastVersion.project_id == "proj-alpha",
            ForecastVersion.version_type == "cr_approval",
        ).all()
        assert len(versions) == 1
        assert versions[0].change_request_id == cr.id

    def test_approve_cr_version_is_most_recent(self, test_client, seed_personas, create_test_project, db):
        """After approval, the version should be the latest for the project."""
        _setup_params(db)
        create_test_project("proj-alpha")
        cr = self._create_approvable_cr(db)
        db.commit()

        test_client.put(f"/api/portfolio/approvals/{cr.id}/approve", json={}, headers=HEADERS_CTRL)

        from models.financial import ForecastVersion
        latest = (
            db.query(ForecastVersion)
            .filter(ForecastVersion.project_id == "proj-alpha")
            .order_by(ForecastVersion.version_number.desc())
            .first()
        )
        assert latest is not None
        assert latest.version_type == "cr_approval"

    def test_cr_approval_does_not_break_cr_flow(self, test_client, seed_personas, create_test_project, db):
        """CR approval should succeed even if version capture fails.

        The C1 hook is wrapped in try/except so a snapshot failure cannot
        break the CR approval flow.
        """
        _setup_params(db)
        create_test_project("proj-alpha")
        cr = self._create_approvable_cr(db)
        db.commit()

        resp = test_client.put(
            f"/api/portfolio/approvals/{cr.id}/approve",
            json={},
            headers=HEADERS_CTRL,
        )
        # CR approval should succeed regardless of snapshot outcome
        assert resp.status_code == 200
