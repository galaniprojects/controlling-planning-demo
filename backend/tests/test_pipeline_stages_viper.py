"""VIPER Wave 1 — pipeline stage vocabulary tests [VIPER §2/§5].

Verifies the new stage set, grouping constants, DoI defaults, and transition
edges introduced in Wave 1 (services/pipeline.py).  Focused on:

- New terminal stages present in STAGES; removed Operate/Retired absent.
- BACKLOG_STAGES / EXECUTION_STAGES / TERMINAL_STAGES / OFF_PATH_STAGES
  membership correct.
- OPERATE_STAGES is the transitional alias == frozenset({"Hyper-maintenance"}).
- doi_for_stage returns 5 for Completed and Run entity spawned; None for the
  removed Operate / Retired stages (no longer in _DOI_DEFAULTS).
- is_transition_allowed: Active/Hyper-maintenance → terminal stages allowed;
  transitions TO Operate/Retired blocked (not in STAGES).
- RUN_ENTITY_SPAWNED_REQUIREMENT constant exists (definition-only, Wave 3).
"""

from __future__ import annotations

import pytest

from services.pipeline import (
    BACKLOG_STAGES,
    EXECUTION_STAGES,
    OFF_PATH_STAGES,
    OPERATE_STAGES,
    STAGES,
    TERMINAL_STAGES,
    VALID_TRANSITIONS,
    RUN_ENTITY_SPAWNED_REQUIREMENT,
    doi_for_stage,
    is_transition_allowed,
)


# ---------------------------------------------------------------------------
# STAGES content
# ---------------------------------------------------------------------------

class TestViperStageSet:
    """Operate/Retired removed; Completed/Run entity spawned added."""

    def test_completed_in_stages(self):
        assert "Completed" in STAGES

    def test_run_entity_spawned_in_stages(self):
        assert "Run entity spawned" in STAGES

    def test_operate_absent_from_stages(self):
        assert "Operate" not in STAGES

    def test_retired_absent_from_stages(self):
        assert "Retired" not in STAGES

    def test_stage_count_unchanged(self):
        # Net zero: 2 removed, 2 added → still 9 stages.
        assert len(STAGES) == 9

    def test_all_expected_stages_present(self):
        expected = {
            "Proposed", "Under Evaluation", "Approved",
            "Active", "Hyper-maintenance",
            "Completed", "Run entity spawned",
            "Paused", "Cancelled",
        }
        assert set(STAGES) == expected


# ---------------------------------------------------------------------------
# Grouping constants
# ---------------------------------------------------------------------------

class TestGroupingConstants:
    """BACKLOG / EXECUTION / TERMINAL / OFF_PATH / OPERATE (alias) membership."""

    def test_backlog_stages_exact(self):
        assert BACKLOG_STAGES == frozenset({"Proposed", "Under Evaluation", "Approved"})

    def test_backlog_excludes_active(self):
        assert "Active" not in BACKLOG_STAGES

    def test_backlog_excludes_paused(self):
        assert "Paused" not in BACKLOG_STAGES

    def test_execution_stages_exact(self):
        assert EXECUTION_STAGES == frozenset({"Active", "Hyper-maintenance"})

    def test_terminal_stages_exact(self):
        assert TERMINAL_STAGES == frozenset({"Completed", "Run entity spawned"})

    def test_off_path_stages_exact(self):
        assert OFF_PATH_STAGES == frozenset({"Paused", "Cancelled"})

    # OPERATE_STAGES transitional alias — must equal frozenset({"Hyper-maintenance"})
    # until Wave 2 re-points ranking.py / admin.py callers.
    def test_operate_stages_transitional_alias(self):
        assert OPERATE_STAGES == frozenset({"Hyper-maintenance"})

    def test_four_groups_are_subsets_of_stages(self):
        stage_set = set(STAGES)
        assert BACKLOG_STAGES.issubset(stage_set)
        assert EXECUTION_STAGES.issubset(stage_set)
        assert TERMINAL_STAGES.issubset(stage_set)
        assert OFF_PATH_STAGES.issubset(stage_set)
        assert OPERATE_STAGES.issubset(stage_set)

    def test_groups_are_pairwise_disjoint(self):
        """Named on-path groups must not overlap each other."""
        groups = [BACKLOG_STAGES, EXECUTION_STAGES, TERMINAL_STAGES]
        for i, a in enumerate(groups):
            for b in groups[i + 1:]:
                assert a.isdisjoint(b), (
                    f"Groups overlap: {a & b}"
                )


# ---------------------------------------------------------------------------
# DoI defaults
# ---------------------------------------------------------------------------

class TestViperDoiDefaults:
    """Completed and Run entity spawned both default to DoI 5."""

    def test_completed_doi_is_5(self):
        assert doi_for_stage("Completed") == 5

    def test_run_entity_spawned_doi_is_5(self):
        assert doi_for_stage("Run entity spawned") == 5

    def test_operate_removed_returns_none(self):
        # Operate no longer in _DOI_DEFAULTS — must return None (key missing).
        assert doi_for_stage("Operate") is None

    def test_retired_removed_returns_none(self):
        # Retired no longer in _DOI_DEFAULTS — must return None (key missing).
        assert doi_for_stage("Retired") is None

    @pytest.mark.parametrize("stage,expected", [
        ("Proposed", 0),
        ("Under Evaluation", 2),
        ("Approved", 3),
        ("Active", 3),
        ("Hyper-maintenance", 4),
        ("Completed", 5),
        ("Run entity spawned", 5),
        ("Paused", None),
        ("Cancelled", None),
    ])
    def test_all_stage_doi_defaults(self, stage, expected):
        assert doi_for_stage(stage) == expected


# ---------------------------------------------------------------------------
# Transition edges to/from terminal stages
# ---------------------------------------------------------------------------

class TestViperTransitionEdges:
    """Active and Hyper-maintenance gain exits to both terminal stages."""

    @pytest.mark.parametrize("from_stage", ["Active", "Hyper-maintenance"])
    def test_transition_to_completed_allowed(self, from_stage):
        ok, err = is_transition_allowed(from_stage, "Completed", None)
        assert ok, f"{from_stage} → Completed blocked: {err}"

    @pytest.mark.parametrize("from_stage", ["Active", "Hyper-maintenance"])
    def test_transition_to_run_entity_spawned_allowed(self, from_stage):
        ok, err = is_transition_allowed(from_stage, "Run entity spawned", None)
        assert ok, f"{from_stage} → Run entity spawned blocked: {err}"

    def test_transition_to_operate_blocked_unknown_stage(self):
        # 'Operate' is not in STAGES — must return unknown-stage error.
        ok, err = is_transition_allowed("Active", "Operate", None)
        assert not ok
        assert "Unknown target stage" in err

    def test_transition_to_retired_blocked_unknown_stage(self):
        # 'Retired' is not in STAGES — must return unknown-stage error.
        ok, err = is_transition_allowed("Hyper-maintenance", "Retired", None)
        assert not ok
        assert "Unknown target stage" in err

    def test_completed_is_terminal_no_exits(self):
        """Completed has no valid transition targets."""
        # Every attempt to leave Completed must fail (empty frozenset in graph).
        for target in STAGES:
            if target == "Completed":
                continue
            ok, err = is_transition_allowed("Completed", target, None)
            assert not ok, (
                f"Completed → {target} should be blocked but was allowed"
            )

    def test_run_entity_spawned_is_terminal_no_exits(self):
        """Run entity spawned has no valid transition targets."""
        for target in STAGES:
            if target == "Run entity spawned":
                continue
            ok, err = is_transition_allowed("Run entity spawned", target, None)
            assert not ok, (
                f"Run entity spawned → {target} should be blocked but was allowed"
            )

    def test_paused_can_resume_to_completed(self):
        ok, err = is_transition_allowed("Paused", "Completed", None)
        assert ok, f"Paused → Completed blocked: {err}"

    def test_paused_can_resume_to_run_entity_spawned(self):
        ok, err = is_transition_allowed("Paused", "Run entity spawned", None)
        assert ok, f"Paused → Run entity spawned blocked: {err}"

    def test_valid_transitions_covers_all_stages(self):
        """Every stage in STAGES must have an entry in VALID_TRANSITIONS."""
        for stage in STAGES:
            assert stage in VALID_TRANSITIONS, (
                f"VALID_TRANSITIONS missing entry for stage: {stage!r}"
            )


# ---------------------------------------------------------------------------
# RUN_ENTITY_SPAWNED_REQUIREMENT (Wave 3 gate — definition only)
# ---------------------------------------------------------------------------

class TestRunEntitySpawnedRequirement:
    """Verify the Wave 3 gate constant is defined and correctly shaped."""

    def test_requirement_exists(self):
        assert RUN_ENTITY_SPAWNED_REQUIREMENT is not None

    def test_requirement_field_path(self):
        assert RUN_ENTITY_SPAWNED_REQUIREMENT.field_path == "run_entity_id"

    def test_requirement_label(self):
        assert RUN_ENTITY_SPAWNED_REQUIREMENT.label == "Spawned Run entity"

    def test_requirement_source(self):
        assert RUN_ENTITY_SPAWNED_REQUIREMENT.source == "project"
