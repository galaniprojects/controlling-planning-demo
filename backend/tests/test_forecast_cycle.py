"""Unit tests for services/forecast_cycle.py — in-memory state machine."""

import pytest

from services.forecast_cycle import (
    ForecastCycleState,
    clear_all_cycles,
    clear_cycle,
    get_active_cycle,
    get_cycle_by_id,
    start_cycle,
)


@pytest.fixture(autouse=True)
def clean_cycles():
    """Ensure global state is clean before and after each test."""
    clear_all_cycles()
    yield
    clear_all_cycles()


class TestStartCycle:
    def test_creates_cycle(self):
        cycle = start_cycle("proj-1")
        assert isinstance(cycle, ForecastCycleState)
        assert cycle.project_id == "proj-1"
        assert cycle.phase == 1
        assert len(cycle.cycle_id) == 8

    def test_cycle_stored_in_state(self):
        cycle = start_cycle("proj-1")
        assert get_active_cycle("proj-1") is cycle

    def test_overwrites_existing(self):
        cycle1 = start_cycle("proj-1")
        cycle2 = start_cycle("proj-1")
        assert cycle2.cycle_id != cycle1.cycle_id
        assert get_active_cycle("proj-1") is cycle2


class TestGetActiveCycle:
    def test_found(self):
        cycle = start_cycle("proj-1")
        assert get_active_cycle("proj-1") is cycle

    def test_not_found(self):
        assert get_active_cycle("nonexistent") is None


class TestGetCycleById:
    def test_match(self):
        cycle = start_cycle("proj-1")
        assert get_cycle_by_id("proj-1", cycle.cycle_id) is cycle

    def test_wrong_cycle_id(self):
        start_cycle("proj-1")
        assert get_cycle_by_id("proj-1", "wrong-id") is None

    def test_no_active_cycle(self):
        assert get_cycle_by_id("proj-1", "any-id") is None


class TestClearCycle:
    def test_removes_cycle(self):
        start_cycle("proj-1")
        clear_cycle("proj-1")
        assert get_active_cycle("proj-1") is None

    def test_noop_for_missing(self):
        # Should not raise
        clear_cycle("nonexistent")


class TestClearAllCycles:
    def test_clears_all(self):
        start_cycle("proj-1")
        start_cycle("proj-2")
        clear_all_cycles()
        assert get_active_cycle("proj-1") is None
        assert get_active_cycle("proj-2") is None

    def test_noop_when_empty(self):
        # Should not raise
        clear_all_cycles()


class TestCycleDataclass:
    def test_default_fields(self):
        cycle = start_cycle("proj-1")
        assert cycle.retrospective_data == []
        assert cycle.suggestions == []
        assert cycle.working_changes == []
        assert cycle.applied_suggestion_ids == []
        assert cycle.review_groups == []
        assert cycle.cost_centre_groups == []

    def test_independent_projects(self):
        c1 = start_cycle("proj-1")
        c2 = start_cycle("proj-2")
        assert c1.cycle_id != c2.cycle_id
        assert c1.project_id != c2.project_id
