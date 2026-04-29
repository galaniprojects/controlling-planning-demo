"""Tests that cycle submission creates progress snapshots [E-04c] [E-05a].

Mirrors the structure of test_cycle_submit_creates_versions.py for the
companion progress-tracker fan-out hook added in services/progress_tracker.
"""
from __future__ import annotations

from unittest.mock import patch


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
@patch("config.DEMO_DATE", "2026-04")
class TestCycleSubmitCreatesProgressSnapshots:
    """End-to-end: 5-phase cycle wizard → ProgressSnapshot rows materialise."""

    def _run_cycle(self, test_client, project_id="proj-alpha"):
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

    def test_cycle_submit_creates_progress_snapshot(
        self, test_client, seed_personas, create_test_project, db,
    ):
        _setup_params(db)
        create_test_project("proj-alpha")

        submit_resp = self._run_cycle(test_client)
        assert submit_resp.status_code == 200, f"submit failed: {submit_resp.text}"

        from models.projects import ProgressSnapshot
        snaps = db.query(ProgressSnapshot).all()
        assert len(snaps) >= 1
        # Cycle label derived from DEMO_DATE = April 2026 → "Q2 2026 Cycle"
        labels = {s.cycle_label for s in snaps}
        assert "Q2 2026 Cycle" in labels

    def test_cycle_progress_snapshot_failure_does_not_abort_cycle(
        self, test_client, seed_personas, create_test_project, db,
    ):
        """Best-effort hook — exception in progress capture must not 500."""
        _setup_params(db)
        create_test_project("proj-alpha")

        with patch(
            "services.progress_tracker.capture_progress_for_cycle",
            side_effect=RuntimeError("boom"),
        ):
            submit_resp = self._run_cycle(test_client)
        # Cycle still succeeds even if progress hook errors
        assert submit_resp.status_code == 200

    def test_cycle_with_progress_state_captures_full_payload(
        self, test_client, seed_personas, create_test_project, db,
    ):
        from decimal import Decimal
        from models.projects import Project, ProjectMilestone
        _setup_params(db)
        proj = create_test_project("proj-alpha")
        # Set live progress state before cycle submission
        ms = ProjectMilestone(
            project_id=proj.id, sequence_number=1, name="Plan",
            baseline_start="2026-01", baseline_end="2026-12",
            forecast_start="2026-01", forecast_end="2026-12",
        )
        db.add(ms)
        db.commit()
        db.refresh(ms)
        proj.current_milestone_id = ms.id
        proj.progress_pct = Decimal("75.0")
        proj.progress_pct_manual_override = True
        proj.status_narrative = "Strong delivery momentum"
        proj.next_milestone_confidence = "on_track"
        db.commit()

        self._run_cycle(test_client)

        from models.projects import ProgressSnapshot
        snap = db.query(ProgressSnapshot).filter(
            ProgressSnapshot.project_id == "proj-alpha"
        ).first()
        assert snap is not None
        assert float(snap.progress_pct) == 75.0
        assert snap.progress_pct_manual_override is True
        assert snap.status_narrative == "Strong delivery momentum"
        assert snap.next_milestone_confidence == "on_track"
        assert snap.current_milestone_id == ms.id
        assert snap.current_milestone_name == "Plan"
