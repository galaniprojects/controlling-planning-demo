"""AI Advisor — keyword matching against pre-computed goals."""
from __future__ import annotations
import re


def match_goal(goal_text: str, advisor_goals: list) -> dict | None:
    """Match user input against pre-computed goal patterns."""
    goal_lower = goal_text.lower()
    
    for goal in advisor_goals:
        keywords = goal.get("keywords", [])
        if any(kw.lower() in goal_lower for kw in keywords):
            return goal
    
    # Check goal_pattern regex if available
    for goal in advisor_goals:
        pattern = goal.get("goal_pattern", "")
        if pattern and re.search(pattern, goal_text, re.IGNORECASE):
            return goal
    
    # Fallback: return first goal if any exist
    if advisor_goals:
        return advisor_goals[0]
    return None


def get_paths_for_goal(goal: dict) -> list[dict]:
    """Extract paths from a matched goal."""
    return goal.get("paths", [])


def find_path_by_id(advisor_goals: list, path_id: str) -> tuple[dict | None, dict | None]:
    """Find a specific path across all goals. Returns (goal, path) or (None, None)."""
    for goal in advisor_goals:
        for path in goal.get("paths", []):
            if path.get("path_id") == path_id:
                return goal, path
    return None, None
