"""Unit tests for backend/services/pipeline.py [A-PS-04] [A-DOI-04..A-DOI-10]."""

from __future__ import annotations

import pytest

from services.pipeline import (
    BACKLOG_STAGES,
    OFF_PATH_STAGES,
    OPERATE_STAGES,
    STAGES,
    VALID_TRANSITIONS,
    doi_for_stage,
    is_transition_allowed,
    validate_doi_gate,
)


class TestStageGroupings:
    def test_stages_contain_all_working_names(self):
        assert "Proposed" in STAGES
        assert "Cancelled" in STAGES
        assert len(STAGES) == 9

    def test_backlog_stages_subset(self):
        assert BACKLOG_STAGES.issubset(set(STAGES))
        assert "Proposed" in BACKLOG_STAGES
        assert "Hyper-maintenance" not in BACKLOG_STAGES

    def test_operate_stages_disjoint_from_backlog(self):
        assert BACKLOG_STAGES.isdisjoint(OPERATE_STAGES)

    def test_off_path_stages(self):
        assert OFF_PATH_STAGES == frozenset({"Paused", "Cancelled"})


class TestIsTransitionAllowed:
    def test_forward_proposed_to_under_evaluation(self):
        ok, err = is_transition_allowed("Proposed", "Under Evaluation", None)
        assert ok and err is None

    def test_forward_under_evaluation_to_approved(self):
        ok, err = is_transition_allowed("Under Evaluation", "Approved", None)
        assert ok

    def test_backwards_approved_to_under_evaluation_allowed(self):
        # [A-PS-11]: backwards transitions are permitted on the on-path graph.
        ok, err = is_transition_allowed("Approved", "Under Evaluation", None)
        assert ok and err is None

    def test_self_transition_rejected(self):
        ok, err = is_transition_allowed("Active", "Active", None)
        assert not ok
        assert "Already in stage" in err

    def test_unknown_target_rejected(self):
        ok, err = is_transition_allowed("Proposed", "Bogus", None)
        assert not ok and "Unknown target stage" in err

    def test_cancelled_to_anywhere_without_override_blocked(self):
        ok, err = is_transition_allowed("Cancelled", "Proposed", None)
        assert not ok and "override_reason" in err

    def test_cancelled_with_override_allowed(self):
        ok, err = is_transition_allowed("Cancelled", "Proposed", "demo unblock")
        assert ok and err is None

    def test_paused_can_resume_to_any_stage(self):
        for target in STAGES:
            if target == "Paused":
                continue
            ok, err = is_transition_allowed("Paused", target, None)
            assert ok, f"Paused -> {target} unexpectedly blocked: {err}"

    def test_no_edge_in_graph_blocked(self):
        # Retired -> Proposed is intentionally not in the graph.
        ok, err = is_transition_allowed("Retired", "Proposed", None)
        assert not ok and "not a defined edge" in err

    def test_first_assignment_from_none_allowed(self):
        ok, err = is_transition_allowed(None, "Proposed", None)
        assert ok and err is None


class TestDoiForStage:
    @pytest.mark.parametrize("stage,expected", [
        ("Proposed", 0),
        ("Under Evaluation", 2),
        ("Approved", 3),
        ("Active", 3),
        ("Hyper-maintenance", 4),
        ("Operate", 5),
        ("Paused", None),
        ("Cancelled", None),
    ])
    def test_default_doi_for_each_stage(self, stage, expected):
        assert doi_for_stage(stage) == expected

    def test_unknown_stage_returns_none(self):
        assert doi_for_stage("Bogus") is None


class _StubProject:
    """Minimal stand-in for Project that exposes only what the gate checks need."""

    def __init__(self, **kwargs):
        # Default everything to None so individual tests opt fields in.
        defaults = dict(
            name=None, description=None, pl_person_id=None, project_type=None,
            composite_score=None, tshirt_size=None, transformation_level=None,
            ai_council_approved=False, ai_council_doc_url=None,
            tn_standardization=None, tn_usage=None, tn_maintenance=None,
            tn_financial_benefit=None, tn_payback=None, tn_competitive_advantage=None,
            total_budget=None, capex_opex=None, start_month=None, end_month=None,
            phases=[], milestones=None, baselines=[],
        )
        defaults.update(kwargs)
        for k, v in defaults.items():
            setattr(self, k, v)


class TestValidateDoiGate:
    def test_doi_0_minimum_fields(self):
        proj = _StubProject()
        missing = validate_doi_gate(proj, 0, db=None)
        assert "Project name" in missing
        assert "Structured description" in missing
        assert "Proposing person (Project Lead)" in missing
        assert "Project Type (1/2/3)" in missing

    def test_doi_0_passes_when_all_filled(self):
        proj = _StubProject(
            name="X", description="d", pl_person_id="p1", project_type=1,
        )
        assert validate_doi_gate(proj, 0, db=None) == []

    def test_doi_1_requires_ai_council_truthy(self):
        proj = _StubProject(
            composite_score=4.0, tshirt_size="M", transformation_level="T1",
            ai_council_approved=False, ai_council_doc_url="https://x",
        )
        missing = validate_doi_gate(proj, 1, db=None)
        assert "AI Council approval flag" in missing

    def test_doi_1_passes_when_complete(self):
        proj = _StubProject(
            composite_score=4.0, tshirt_size="M", transformation_level="T1",
            ai_council_approved=True, ai_council_doc_url="https://x",
        )
        assert validate_doi_gate(proj, 1, db=None) == []

    def test_doi_2_requires_all_tn_subcriteria(self):
        proj = _StubProject(
            tn_standardization=4, tn_usage=5,  # tn_maintenance missing
            tn_financial_benefit=4, tn_payback=4, tn_competitive_advantage=4,
            total_budget=200_000, capex_opex="capex",
        )
        missing = validate_doi_gate(proj, 2, db=None)
        assert any("Maintenance" in m for m in missing)

    def test_doi_3_requires_milestone(self):
        proj = _StubProject(start_month="2026-04", phases=[])
        missing = validate_doi_gate(proj, 3, db=None)
        assert any("milestone" in m.lower() for m in missing)

    def test_doi_3_passes_with_milestone(self):
        proj = _StubProject(start_month="2026-04", phases=[object()])
        assert validate_doi_gate(proj, 3, db=None) == []

    def test_doi_4_requires_baseline_rows(self):
        proj = _StubProject(baselines=[])
        missing = validate_doi_gate(proj, 4, db=None)
        assert any("baseline" in m.lower() for m in missing)

    def test_doi_5_requires_end_month(self):
        proj = _StubProject(end_month=None)
        missing = validate_doi_gate(proj, 5, db=None)
        assert any("termination" in m.lower() or "end_month" in m.lower() for m in missing)


class TestValidTransitionsCoverage:
    def test_every_stage_has_transitions_entry(self):
        for stage in STAGES:
            assert stage in VALID_TRANSITIONS, f"missing transitions for {stage}"
