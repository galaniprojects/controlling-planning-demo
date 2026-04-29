"""Service-level unit tests for the E1 progress tracker [E-04c]."""

from __future__ import annotations

import json
from datetime import datetime
from decimal import Decimal

import pytest

from models.projects import (
    MilestoneDeliverable, ProgressSnapshot, ProjectMilestone,
)
from services.progress_tracker import (
    CONFIDENCE_REASON_REQUIRED_VALUES,
    MAX_CHECKLIST_ITEMS,
    VALID_CONFIDENCE,
    apply_progress_update,
    build_progress_response_payload,
    capture_progress_for_cycle,
    capture_progress_snapshot,
    compute_checklist_completion,
    compute_portfolio_progress_indicators,
    derive_current_milestone,
    effective_progress_pct,
    resolve_current_milestone,
    serialize_checklist_for_snapshot,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _add_milestone(
    db,
    project_id: str,
    sequence: int,
    name: str,
    forecast_start: str,
    forecast_end: str,
) -> ProjectMilestone:
    ms = ProjectMilestone(
        project_id=project_id,
        sequence_number=sequence,
        name=name,
        baseline_start=forecast_start,
        baseline_end=forecast_end,
        forecast_start=forecast_start,
        forecast_end=forecast_end,
    )
    db.add(ms)
    db.commit()
    db.refresh(ms)
    return ms


def _add_deliverable(db, milestone_id: int, sequence: int, text: str, complete: bool = False) -> MilestoneDeliverable:
    d = MilestoneDeliverable(
        milestone_id=milestone_id, sequence=sequence,
        text=text, is_complete=complete,
    )
    db.add(d)
    db.commit()
    db.refresh(d)
    return d


# ---------------------------------------------------------------------------
# Constants surface area
# ---------------------------------------------------------------------------


class TestConstants:
    def test_max_checklist_items_is_ten(self):
        assert MAX_CHECKLIST_ITEMS == 10

    def test_valid_confidence_values(self):
        assert VALID_CONFIDENCE == ("on_track", "at_risk", "blocked")

    def test_confidence_reason_required_values(self):
        assert "at_risk" in CONFIDENCE_REASON_REQUIRED_VALUES
        assert "blocked" in CONFIDENCE_REASON_REQUIRED_VALUES
        assert "on_track" not in CONFIDENCE_REASON_REQUIRED_VALUES


# ---------------------------------------------------------------------------
# Current milestone derivation
# ---------------------------------------------------------------------------


class TestDeriveCurrentMilestone:
    def test_in_window_match(self, db, create_test_project):
        proj = create_test_project(project_id="proj-A", months=["2026-04"])
        _add_milestone(db, proj.id, 1, "Plan", "2026-01", "2026-03")
        _add_milestone(db, proj.id, 2, "Build", "2026-04", "2026-08")
        _add_milestone(db, proj.id, 3, "Ship", "2026-09", "2026-12")
        db.refresh(proj)

        ms = derive_current_milestone(proj, "2026-04")
        assert ms is not None
        assert ms.sequence_number == 2

    def test_past_final_milestone(self, db, create_test_project):
        proj = create_test_project(project_id="proj-B", months=["2026-04"])
        _add_milestone(db, proj.id, 1, "A", "2024-01", "2024-06")
        _add_milestone(db, proj.id, 2, "B", "2024-07", "2024-12")
        db.refresh(proj)

        ms = derive_current_milestone(proj, "2026-04")
        assert ms is not None
        assert ms.sequence_number == 2  # last milestone

    def test_before_first_milestone(self, db, create_test_project):
        proj = create_test_project(project_id="proj-C", months=["2026-04"])
        _add_milestone(db, proj.id, 1, "A", "2027-01", "2027-06")
        _add_milestone(db, proj.id, 2, "B", "2027-07", "2027-12")
        db.refresh(proj)

        ms = derive_current_milestone(proj, "2026-04")
        assert ms is not None
        assert ms.sequence_number == 1  # first milestone

    def test_no_milestones_returns_none(self, db, create_test_project):
        proj = create_test_project(project_id="proj-D", months=["2026-04"])
        db.refresh(proj)
        assert derive_current_milestone(proj, "2026-04") is None


class TestResolveCurrentMilestone:
    def test_explicit_id_wins(self, db, create_test_project):
        proj = create_test_project(project_id="proj-E", months=["2026-04"])
        ms1 = _add_milestone(db, proj.id, 1, "A", "2026-01", "2026-03")
        ms2 = _add_milestone(db, proj.id, 2, "B", "2026-04", "2026-08")
        proj.current_milestone_id = ms1.id
        db.commit()
        db.refresh(proj)

        # demo date 2026-04 would normally pick ms2; explicit override picks ms1
        result = resolve_current_milestone(db, proj, "2026-04")
        assert result.id == ms1.id

    def test_stale_explicit_id_falls_back_to_derive(self, db, create_test_project):
        proj = create_test_project(project_id="proj-F", months=["2026-04"])
        ms = _add_milestone(db, proj.id, 1, "A", "2026-01", "2026-12")
        proj.current_milestone_id = 99999  # nonexistent
        db.commit()
        db.refresh(proj)

        result = resolve_current_milestone(db, proj, "2026-04")
        assert result.id == ms.id


# ---------------------------------------------------------------------------
# Checklist rollup
# ---------------------------------------------------------------------------


class TestComputeChecklistCompletion:
    def test_no_milestone_id(self, db):
        result = compute_checklist_completion(db, None)
        assert result == {"total_items": 0, "completed_items": 0, "completion_pct": None}

    def test_no_items(self, db, create_test_project):
        proj = create_test_project(project_id="proj-G", months=["2026-04"])
        ms = _add_milestone(db, proj.id, 1, "A", "2026-01", "2026-12")
        result = compute_checklist_completion(db, ms.id)
        assert result["total_items"] == 0
        assert result["completion_pct"] is None

    def test_partial_completion(self, db, create_test_project):
        proj = create_test_project(project_id="proj-H", months=["2026-04"])
        ms = _add_milestone(db, proj.id, 1, "A", "2026-01", "2026-12")
        _add_deliverable(db, ms.id, 1, "Item 1", complete=True)
        _add_deliverable(db, ms.id, 2, "Item 2", complete=True)
        _add_deliverable(db, ms.id, 3, "Item 3", complete=False)

        result = compute_checklist_completion(db, ms.id)
        assert result["total_items"] == 3
        assert result["completed_items"] == 2
        assert result["completion_pct"] == 66.67

    def test_full_completion(self, db, create_test_project):
        proj = create_test_project(project_id="proj-I", months=["2026-04"])
        ms = _add_milestone(db, proj.id, 1, "A", "2026-01", "2026-12")
        _add_deliverable(db, ms.id, 1, "Item 1", complete=True)
        _add_deliverable(db, ms.id, 2, "Item 2", complete=True)

        result = compute_checklist_completion(db, ms.id)
        assert result["completion_pct"] == 100.0

    def test_zero_completion(self, db, create_test_project):
        proj = create_test_project(project_id="proj-J", months=["2026-04"])
        ms = _add_milestone(db, proj.id, 1, "A", "2026-01", "2026-12")
        _add_deliverable(db, ms.id, 1, "Item 1", complete=False)
        _add_deliverable(db, ms.id, 2, "Item 2", complete=False)

        result = compute_checklist_completion(db, ms.id)
        assert result["completion_pct"] == 0.0


# ---------------------------------------------------------------------------
# Effective percentage logic
# ---------------------------------------------------------------------------


class TestEffectiveProgressPct:
    def test_auto_compute_when_checklist_present(self, db, create_test_project):
        proj = create_test_project(project_id="proj-K", months=["2026-04"])
        ms = _add_milestone(db, proj.id, 1, "A", "2026-01", "2026-12")
        _add_deliverable(db, ms.id, 1, "Item 1", complete=True)
        _add_deliverable(db, ms.id, 2, "Item 2", complete=False)

        proj.progress_pct = Decimal("99.0")
        proj.progress_pct_manual_override = False
        db.commit()
        db.refresh(proj)

        # checklist 50% wins over stored 99 because override flag is False
        eff = effective_progress_pct(db, proj, ms.id)
        assert eff == 50.0

    def test_manual_override_wins(self, db, create_test_project):
        proj = create_test_project(project_id="proj-L", months=["2026-04"])
        ms = _add_milestone(db, proj.id, 1, "A", "2026-01", "2026-12")
        _add_deliverable(db, ms.id, 1, "Item 1", complete=True)
        _add_deliverable(db, ms.id, 2, "Item 2", complete=False)

        proj.progress_pct = Decimal("75.0")
        proj.progress_pct_manual_override = True
        db.commit()
        db.refresh(proj)

        eff = effective_progress_pct(db, proj, ms.id)
        assert eff == 75.0

    def test_no_checklist_uses_stored(self, db, create_test_project):
        proj = create_test_project(project_id="proj-M", months=["2026-04"])
        ms = _add_milestone(db, proj.id, 1, "A", "2026-01", "2026-12")

        proj.progress_pct = Decimal("42.0")
        proj.progress_pct_manual_override = False
        db.commit()
        db.refresh(proj)

        eff = effective_progress_pct(db, proj, ms.id)
        assert eff == 42.0

    def test_no_data_returns_none(self, db, create_test_project):
        proj = create_test_project(project_id="proj-N", months=["2026-04"])
        ms = _add_milestone(db, proj.id, 1, "A", "2026-01", "2026-12")
        eff = effective_progress_pct(db, proj, ms.id)
        assert eff is None


# ---------------------------------------------------------------------------
# apply_progress_update — validation + delta map
# ---------------------------------------------------------------------------


class TestApplyProgressUpdate:
    def test_invalid_confidence_raises(self, db, create_test_project, controller_user):
        proj = create_test_project(project_id="proj-O", months=["2026-04"])
        with pytest.raises(ValueError, match="must be one of"):
            apply_progress_update(
                db, proj, controller_user,
                next_milestone_confidence="weird-value",
                set_explicit={"next_milestone_confidence"},
            )

    def test_at_risk_requires_reason(self, db, create_test_project, controller_user):
        proj = create_test_project(project_id="proj-P", months=["2026-04"])
        with pytest.raises(ValueError, match="confidence_reason is required"):
            apply_progress_update(
                db, proj, controller_user,
                next_milestone_confidence="at_risk",
                set_explicit={"next_milestone_confidence"},
            )

    def test_blocked_requires_reason(self, db, create_test_project, controller_user):
        proj = create_test_project(project_id="proj-Q", months=["2026-04"])
        with pytest.raises(ValueError, match="confidence_reason is required"):
            apply_progress_update(
                db, proj, controller_user,
                next_milestone_confidence="blocked",
                confidence_reason="",
                set_explicit={"next_milestone_confidence", "confidence_reason"},
            )

    def test_on_track_does_not_require_reason(self, db, create_test_project, controller_user):
        proj = create_test_project(project_id="proj-R", months=["2026-04"])
        deltas = apply_progress_update(
            db, proj, controller_user,
            next_milestone_confidence="on_track",
            set_explicit={"next_milestone_confidence"},
        )
        assert "next_milestone_confidence" in deltas
        assert proj.next_milestone_confidence == "on_track"

    def test_normalizes_confidence_value(self, db, create_test_project, controller_user):
        proj = create_test_project(project_id="proj-S", months=["2026-04"])
        deltas = apply_progress_update(
            db, proj, controller_user,
            next_milestone_confidence="On Track",
            set_explicit={"next_milestone_confidence"},
        )
        assert proj.next_milestone_confidence == "on_track"
        assert deltas["next_milestone_confidence"] == (None, "on_track")

    def test_pct_out_of_range_raises(self, db, create_test_project, controller_user):
        proj = create_test_project(project_id="proj-T", months=["2026-04"])
        with pytest.raises(ValueError, match=r"\[0, 100\]"):
            apply_progress_update(
                db, proj, controller_user,
                progress_pct=120.0,
                set_explicit={"progress_pct"},
            )

    def test_pct_negative_raises(self, db, create_test_project, controller_user):
        proj = create_test_project(project_id="proj-U", months=["2026-04"])
        with pytest.raises(ValueError):
            apply_progress_update(
                db, proj, controller_user,
                progress_pct=-5.0,
                set_explicit={"progress_pct"},
            )

    def test_unchanged_field_not_in_delta(self, db, create_test_project, controller_user):
        proj = create_test_project(project_id="proj-V", months=["2026-04"])
        proj.next_milestone_confidence = "on_track"
        db.commit()
        db.refresh(proj)

        deltas = apply_progress_update(
            db, proj, controller_user,
            next_milestone_confidence="on_track",
            set_explicit={"next_milestone_confidence"},
        )
        assert deltas == {}

    def test_current_milestone_must_belong_to_project(self, db, create_test_project, controller_user):
        proj_a = create_test_project(project_id="proj-WA", months=["2026-04"])
        proj_b = create_test_project(project_id="proj-WB", months=["2026-04"])
        ms_b = _add_milestone(db, proj_b.id, 1, "B-MS", "2026-01", "2026-12")

        with pytest.raises(ValueError, match="not a milestone"):
            apply_progress_update(
                db, proj_a, controller_user,
                current_milestone_id=ms_b.id,
                set_explicit={"current_milestone_id"},
            )

    def test_current_milestone_assigns_correctly(self, db, create_test_project, controller_user):
        proj = create_test_project(project_id="proj-X", months=["2026-04"])
        ms = _add_milestone(db, proj.id, 1, "M1", "2026-01", "2026-12")
        deltas = apply_progress_update(
            db, proj, controller_user,
            current_milestone_id=ms.id,
            set_explicit={"current_milestone_id"},
        )
        assert proj.current_milestone_id == ms.id
        assert deltas["current_milestone_id"] == (None, ms.id)

    def test_status_narrative_strip_and_empty_to_none(self, db, create_test_project, controller_user):
        proj = create_test_project(project_id="proj-Y", months=["2026-04"])
        proj.status_narrative = "Existing"
        db.commit()
        db.refresh(proj)

        deltas = apply_progress_update(
            db, proj, controller_user,
            status_narrative="   ",
            set_explicit={"status_narrative"},
        )
        assert proj.status_narrative is None
        assert deltas["status_narrative"] == ("Existing", None)

    def test_progress_updated_at_set_on_change(self, db, create_test_project, controller_user):
        proj = create_test_project(project_id="proj-Z", months=["2026-04"])
        assert proj.progress_updated_at is None

        apply_progress_update(
            db, proj, controller_user,
            status_narrative="On track for May ship",
            set_explicit={"status_narrative"},
        )
        assert proj.progress_updated_at is not None
        assert proj.progress_updated_by_id == controller_user.person_id

    def test_no_changes_does_not_set_updated_at(self, db, create_test_project, controller_user):
        proj = create_test_project(project_id="proj-AA", months=["2026-04"])
        proj.status_narrative = "Stable"
        db.commit()
        db.refresh(proj)

        deltas = apply_progress_update(
            db, proj, controller_user,
            status_narrative="Stable",
            set_explicit={"status_narrative"},
        )
        assert deltas == {}
        assert proj.progress_updated_at is None


# ---------------------------------------------------------------------------
# Snapshot capture
# ---------------------------------------------------------------------------


class TestCaptureProgressSnapshot:
    def test_captures_current_state(self, db, create_test_project, controller_user):
        proj = create_test_project(project_id="proj-BB", months=["2026-04"])
        ms = _add_milestone(db, proj.id, 1, "Build", "2026-01", "2026-12")
        proj.current_milestone_id = ms.id
        proj.progress_pct = Decimal("60.0")
        proj.progress_pct_manual_override = True
        proj.status_narrative = "Going well"
        proj.next_milestone_confidence = "on_track"
        db.commit()

        snap = capture_progress_snapshot(
            db, proj, controller_user,
            cycle_label="Q2 2026 Cycle", cycle_id="seed-q2",
        )
        db.commit()

        assert snap.id is not None
        assert snap.project_id == proj.id
        assert snap.cycle_label == "Q2 2026 Cycle"
        assert snap.current_milestone_id == ms.id
        assert snap.current_milestone_name == "Build"
        assert snap.current_milestone_sequence == 1
        assert float(snap.progress_pct) == 60.0
        assert snap.progress_pct_manual_override is True
        assert snap.status_narrative == "Going well"
        assert snap.next_milestone_confidence == "on_track"

    def test_captures_checklist_payload(self, db, create_test_project, controller_user):
        proj = create_test_project(project_id="proj-CC", months=["2026-04"])
        ms = _add_milestone(db, proj.id, 1, "Build", "2026-01", "2026-12")
        _add_deliverable(db, ms.id, 1, "Spec done", complete=True)
        _add_deliverable(db, ms.id, 2, "Code done", complete=False)

        snap = capture_progress_snapshot(
            db, proj, controller_user,
            cycle_label="X", cycle_id="x1",
        )
        db.commit()

        assert snap.checklist_payload_json is not None
        payload = json.loads(snap.checklist_payload_json)
        assert len(payload) == 1
        assert payload[0]["milestone_id"] == ms.id
        assert len(payload[0]["items"]) == 2

    def test_no_checklist_leaves_payload_null(self, db, create_test_project, controller_user):
        proj = create_test_project(project_id="proj-DD", months=["2026-04"])
        _add_milestone(db, proj.id, 1, "Build", "2026-01", "2026-12")

        snap = capture_progress_snapshot(
            db, proj, controller_user, cycle_label="X", cycle_id="x1",
        )
        db.commit()
        assert snap.checklist_payload_json is None


class TestCaptureProgressForCycle:
    def test_skips_projects_without_forecast(self, db, controller_user):
        from models.projects import Project
        # No forecasts created, just bare project
        p = Project(
            id="proj-bare", name="Bare", status="active",
            capex_opex="capex", start_month="2026-01", end_month="2026-12",
        )
        db.add(p)
        db.commit()

        result = capture_progress_for_cycle(
            db, controller_user, "Q2 2026 Cycle", cycle_id="x",
        )
        assert result == []

    def test_one_snapshot_per_active_project_with_forecast(
        self, db, create_test_project, controller_user,
    ):
        create_test_project(project_id="proj-w-fc-1", months=["2026-04"])
        create_test_project(project_id="proj-w-fc-2", months=["2026-04"])

        result = capture_progress_for_cycle(
            db, controller_user, "Q2 2026 Cycle", cycle_id="cycle-1",
        )
        db.commit()

        assert len(result) == 2
        snaps = db.query(ProgressSnapshot).all()
        assert len(snaps) == 2
        assert all(s.cycle_label == "Q2 2026 Cycle" for s in snaps)
        assert all(s.cycle_id == "cycle-1" for s in snaps)


# ---------------------------------------------------------------------------
# Serialize checklist for snapshot
# ---------------------------------------------------------------------------


class TestSerializeChecklistForSnapshot:
    def test_only_milestones_with_items(self, db, create_test_project):
        proj = create_test_project(project_id="proj-EE", months=["2026-04"])
        ms1 = _add_milestone(db, proj.id, 1, "A", "2026-01", "2026-06")
        ms2 = _add_milestone(db, proj.id, 2, "B", "2026-07", "2026-12")
        _add_deliverable(db, ms1.id, 1, "Task 1", complete=False)
        # ms2 has no deliverables — should be excluded

        result = serialize_checklist_for_snapshot(db, proj)
        assert len(result) == 1
        assert result[0]["milestone_id"] == ms1.id

    def test_empty_when_no_deliverables(self, db, create_test_project):
        proj = create_test_project(project_id="proj-FF", months=["2026-04"])
        _add_milestone(db, proj.id, 1, "A", "2026-01", "2026-12")
        result = serialize_checklist_for_snapshot(db, proj)
        assert result == []


# ---------------------------------------------------------------------------
# Portfolio aggregation
# ---------------------------------------------------------------------------


class TestPortfolioProgressIndicators:
    def test_summary_buckets(self, db, create_test_project):
        p1 = create_test_project(project_id="agg-1", months=["2026-04"])
        p2 = create_test_project(project_id="agg-2", months=["2026-04"])
        p3 = create_test_project(project_id="agg-3", months=["2026-04"])

        p1.next_milestone_confidence = "on_track"
        p2.next_milestone_confidence = "at_risk"
        p2.confidence_reason = "Vendor delay"
        # p3 left unreported
        db.commit()

        result = compute_portfolio_progress_indicators(db)
        assert result["total"] == 3
        assert result["summary"] == {
            "on_track": 1, "at_risk": 1, "blocked": 0, "unreported": 1,
        }

    def test_filter_by_project_ids(self, db, create_test_project):
        create_test_project(project_id="agg-A", months=["2026-04"])
        create_test_project(project_id="agg-B", months=["2026-04"])

        result = compute_portfolio_progress_indicators(
            db, project_ids=["agg-A"],
        )
        assert result["total"] == 1
        assert result["items"][0]["project_id"] == "agg-A"

    def test_empty_project_id_filter_returns_empty(self, db, create_test_project):
        create_test_project(project_id="agg-only", months=["2026-04"])
        result = compute_portfolio_progress_indicators(db, project_ids=[])
        assert result == {
            "items": [], "total": 0,
            "summary": {"on_track": 0, "at_risk": 0, "blocked": 0, "unreported": 0},
        }

    def test_has_progress_data_flag(self, db, create_test_project):
        p1 = create_test_project(project_id="agg-x", months=["2026-04"])
        p2 = create_test_project(project_id="agg-y", months=["2026-04"])

        p1.next_milestone_confidence = "on_track"
        db.commit()

        result = compute_portfolio_progress_indicators(db)
        items_by_id = {i["project_id"]: i for i in result["items"]}
        assert items_by_id["agg-x"]["has_progress_data"] is True
        assert items_by_id["agg-y"]["has_progress_data"] is False


# ---------------------------------------------------------------------------
# Build response payload
# ---------------------------------------------------------------------------


class TestBuildProgressResponsePayload:
    def test_returns_full_shape(self, db, create_test_project, controller_user):
        proj = create_test_project(project_id="proj-GG", months=["2026-04"])
        ms = _add_milestone(db, proj.id, 1, "Build", "2026-01", "2026-12")
        _add_deliverable(db, ms.id, 1, "Spec", complete=True)
        _add_deliverable(db, ms.id, 2, "Code", complete=False)
        proj.next_milestone_confidence = "on_track"
        proj.progress_updated_by_id = "p-pm-1"
        db.commit()

        payload = build_progress_response_payload(db, proj, demo_date="2026-04")

        assert payload["project_id"] == proj.id
        assert payload["current_milestone"]["id"] == ms.id
        assert payload["effective_progress_pct"] == 50.0
        assert payload["checklist"]["total_items"] == 2
        assert payload["checklist"]["completed_items"] == 1
        assert len(payload["deliverables"]) == 2
        assert payload["progress_updated_by_name"] == "PM One"
