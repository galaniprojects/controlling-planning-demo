"""Unit tests for services/advisor.py — AI Advisor goal matching."""

import pytest

from services.advisor import find_path_by_id, get_paths_for_goal, match_goal


# ---------------------------------------------------------------------------
# Test data
# ---------------------------------------------------------------------------

GOAL_BUDGET = {
    "goal_id": "g1",
    "keywords": ["budget", "cost reduction"],
    "goal_pattern": r"reduce.*spend",
    "paths": [
        {"path_id": "p1", "name": "Cut consulting"},
        {"path_id": "p2", "name": "Delay projects"},
    ],
}

GOAL_TIMELINE = {
    "goal_id": "g2",
    "keywords": ["timeline", "schedule"],
    "goal_pattern": r"accelerat",
    "paths": [
        {"path_id": "p3", "name": "Add resources"},
    ],
}

ADVISOR_GOALS = [GOAL_BUDGET, GOAL_TIMELINE]


# ---------------------------------------------------------------------------
# match_goal
# ---------------------------------------------------------------------------

class TestMatchGoal:
    def test_keyword_match(self):
        result = match_goal("I want to reduce budget", ADVISOR_GOALS)
        assert result["goal_id"] == "g1"

    def test_keyword_case_insensitive(self):
        result = match_goal("BUDGET issues", ADVISOR_GOALS)
        assert result["goal_id"] == "g1"

    def test_regex_fallback(self):
        # No keyword match, but regex matches
        result = match_goal("reduce total spend by 10%", ADVISOR_GOALS)
        assert result["goal_id"] == "g1"

    def test_keyword_priority_over_regex(self):
        # "timeline" is a keyword for g2, even though "reduce.*spend" regex matches g1
        result = match_goal("timeline reduce spend", ADVISOR_GOALS)
        assert result["goal_id"] == "g2"

    def test_fallback_to_first_goal(self):
        result = match_goal("something completely unrelated", ADVISOR_GOALS)
        assert result["goal_id"] == "g1"  # first goal as fallback

    def test_empty_goals_returns_none(self):
        assert match_goal("anything", []) is None


# ---------------------------------------------------------------------------
# get_paths_for_goal
# ---------------------------------------------------------------------------

class TestGetPathsForGoal:
    def test_returns_paths(self):
        paths = get_paths_for_goal(GOAL_BUDGET)
        assert len(paths) == 2
        assert paths[0]["path_id"] == "p1"

    def test_no_paths_key(self):
        assert get_paths_for_goal({"goal_id": "x"}) == []


# ---------------------------------------------------------------------------
# find_path_by_id
# ---------------------------------------------------------------------------

class TestFindPathById:
    def test_found(self):
        goal, path = find_path_by_id(ADVISOR_GOALS, "p1")
        assert goal["goal_id"] == "g1"
        assert path["name"] == "Cut consulting"

    def test_found_in_second_goal(self):
        goal, path = find_path_by_id(ADVISOR_GOALS, "p3")
        assert goal["goal_id"] == "g2"
        assert path["name"] == "Add resources"

    def test_not_found(self):
        goal, path = find_path_by_id(ADVISOR_GOALS, "nonexistent")
        assert goal is None
        assert path is None

    def test_empty_goals(self):
        goal, path = find_path_by_id([], "p1")
        assert goal is None
        assert path is None
