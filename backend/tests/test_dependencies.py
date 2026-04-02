"""Unit tests for dependencies.py — pure helper functions (no DB)."""

import pytest
from fastapi import HTTPException

from dependencies import pl_project_filter, require_role
from schemas.common import CurrentUser


# ---------------------------------------------------------------------------
# pl_project_filter
# ---------------------------------------------------------------------------

class TestPlProjectFilter:
    def test_with_project_ids(self):
        user = CurrentUser(
            user_id="persona-pl", person_id="p-pl", name="PL",
            role="project_lead", project_ids=["proj-1", "proj-2"],
        )
        filt = pl_project_filter(user)
        # Should produce an OR clause — verify it compiles without error
        assert filt is not None
        # The filter is a SQLAlchemy BinaryExpression/BooleanClauseList
        compiled = str(filt)
        assert "pl_person_id" in compiled
        assert "IN" in compiled.upper()

    def test_without_project_ids(self):
        user = CurrentUser(
            user_id="persona-pl", person_id="p-pl", name="PL",
            role="project_lead", project_ids=[],
        )
        filt = pl_project_filter(user)
        compiled = str(filt)
        assert "pl_person_id" in compiled


# ---------------------------------------------------------------------------
# require_role
# ---------------------------------------------------------------------------

class TestRequireRole:
    def test_returns_callable(self):
        checker = require_role("controller")
        assert callable(checker)

    def test_allowed_role_passes(self):
        checker = require_role("controller", "executive")
        user = CurrentUser(
            user_id="u1", person_id="p1", name="Test",
            role="controller",
        )
        # Call the inner checker directly (bypassing FastAPI's DI)
        # The checker signature expects current_user as a keyword arg
        result = checker(current_user=user)
        assert result is user

    def test_disallowed_role_raises_403(self):
        checker = require_role("controller")
        user = CurrentUser(
            user_id="u1", person_id="p1", name="Test",
            role="project_lead",
        )
        with pytest.raises(HTTPException) as exc_info:
            checker(current_user=user)
        assert exc_info.value.status_code == 403

    def test_multiple_allowed_roles(self):
        checker = require_role("controller", "executive", "cost_center_owner")
        user = CurrentUser(
            user_id="u1", person_id="p1", name="Test",
            role="executive",
        )
        result = checker(current_user=user)
        assert result.role == "executive"
