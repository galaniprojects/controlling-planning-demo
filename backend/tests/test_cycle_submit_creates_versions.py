"""Tests that cycle submission creates forecast versions [C-FV-05]."""
from __future__ import annotations

from unittest.mock import patch
import pytest

HEADERS_CTRL = {"X-Current-User": "persona-controller"}
HEADERS_PL = {"X-Current-User": "persona-pl"}


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
@patch("config.DEMO_DATE", "2026-04")
class TestCycleSubmitCreatesVersions:
    def _run_cycle(self, test_client, project_id="proj-alpha"):
        """Helper: run through the 5-phase cycle wizard for a project."""
        start_resp = test_client.post(
            f"/api/projects/{project_id}/forecast-cycle/start",
            headers=HEADERS_CTRL,
        )
        assert start_resp.status_code == 200, f"start failed: {start_resp.text}"
        cycle_id = start_resp.json()["cycle_id"]

        test_client.post(
            f"/api/projects/{project_id}/forecast-cycle/acknowledge",
            json={"explanations": {}},
            headers=HEADERS_CTRL,
        )
        test_client.post(
            f"/api/projects/{project_id}/forecast-cycle/edit",
            json={"changes": []},
            headers=HEADERS_CTRL,
        )
        submit_resp = test_client.put(
            f"/api/projects/{project_id}/forecast-cycle/{cycle_id}/submit",
            json={"groups": [], "cost_centre_groups": []},
            headers=HEADERS_CTRL,
        )
        return submit_resp

    def test_cycle_submit_creates_versions(self, test_client, seed_personas, create_test_project, db):
        """Submitting a forecast cycle creates cycle-type versions [C-FV-05]."""
        _setup_params(db)
        create_test_project("proj-alpha")

        submit_resp = self._run_cycle(test_client)
        assert submit_resp.status_code == 200, f"submit failed: {submit_resp.text}"

        # Check versions were created
        from models.financial import ForecastVersion
        cycle_versions = db.query(ForecastVersion).filter(
            ForecastVersion.version_type == "cycle",
        ).all()
        assert len(cycle_versions) >= 1

    def test_cycle_label_derived_from_demo_date(self, test_client, seed_personas, create_test_project, db):
        """Cycle label should be derived from DEMO_DATE = 'Q2 2026 Cycle' for April 2026."""
        _setup_params(db)
        create_test_project("proj-alpha")

        self._run_cycle(test_client)

        from models.financial import ForecastVersion
        versions = db.query(ForecastVersion).filter(
            ForecastVersion.version_type == "cycle",
        ).all()
        if versions:
            # Should be Q2 2026 Cycle (April = Q2)
            assert versions[0].cycle_label == "Q2 2026 Cycle"

    def test_derive_cycle_label_function(self):
        """Unit-test the derive_cycle_label helper directly."""
        from services.forecast_cycle import derive_cycle_label
        assert derive_cycle_label("2026-04") == "Q2 2026 Cycle"
        assert derive_cycle_label("2026-01") == "Q1 2026 Cycle"
        assert derive_cycle_label("2026-07") == "Q3 2026 Cycle"
        assert derive_cycle_label("2026-10") == "Q4 2026 Cycle"
        assert derive_cycle_label("2027-01") == "Q1 2027 Cycle"
