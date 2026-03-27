"""Unit tests for the AI Report Builder service guardrails."""

import os
import sys
import json
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest

# Ensure backend is on the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.ai_report_service import (
    validate_sql,
    extract_report_spec,
    build_scoping_context,
    start_conversation,
    get_conversation,
    delete_conversation,
    _conversations,
    _cleanup_expired,
    CONVERSATION_TTL_MINUTES,
)
from schemas.ai_reports import ReportSpec
from schemas.common import CurrentUser


# ---------------------------------------------------------------------------
# SQL Safety Tests
# ---------------------------------------------------------------------------


class TestValidateSQL:
    """Tests for SQL statement validation / DDL blocking."""

    def test_allows_select(self):
        assert validate_sql("SELECT * FROM projects") is None

    def test_allows_select_with_whitespace(self):
        assert validate_sql("  SELECT name FROM people  ") is None

    def test_allows_with_cte(self):
        assert validate_sql("WITH cte AS (SELECT 1) SELECT * FROM cte") is None

    def test_rejects_create(self):
        assert validate_sql("CREATE TABLE evil (id int)") is not None

    def test_rejects_drop(self):
        assert validate_sql("DROP TABLE projects") is not None

    def test_rejects_insert(self):
        assert validate_sql("INSERT INTO projects VALUES ('x')") is not None

    def test_rejects_update(self):
        assert validate_sql("UPDATE projects SET name='hacked'") is not None

    def test_rejects_delete(self):
        assert validate_sql("DELETE FROM projects") is not None

    def test_rejects_alter(self):
        assert validate_sql("ALTER TABLE projects ADD COLUMN evil TEXT") is not None

    def test_rejects_pragma(self):
        assert validate_sql("PRAGMA table_info(projects)") is not None

    def test_rejects_attach(self):
        assert validate_sql("ATTACH DATABASE '/tmp/evil.db' AS evil") is not None

    def test_rejects_replace(self):
        assert validate_sql("REPLACE INTO projects VALUES ('x')") is not None

    def test_rejects_non_select_non_with(self):
        error = validate_sql("EXPLAIN SELECT * FROM projects")
        assert error is not None

    def test_rejects_ddl_in_subquery(self):
        # Even if it starts with SELECT, embedded DDL keywords are caught
        error = validate_sql("SELECT * FROM projects; DROP TABLE projects")
        assert error is not None

    def test_case_insensitive(self):
        assert validate_sql("drop table Projects") is not None
        assert validate_sql("Delete from people") is not None


# ---------------------------------------------------------------------------
# Role Scoping Tests
# ---------------------------------------------------------------------------


class TestBuildScopingContext:
    def _make_user(self, role, **kwargs):
        return CurrentUser(
            user_id=f"persona-{role}",
            person_id=f"p-{role}",
            name=f"Test {role}",
            role=role,
            **kwargs,
        )

    def test_controller_full_access(self):
        ctx = build_scoping_context(self._make_user("controller"))
        assert "full access" in ctx.lower()
        assert "filter" not in ctx.lower()

    def test_executive_full_access(self):
        ctx = build_scoping_context(self._make_user("executive"))
        assert "full access" in ctx.lower()

    def test_project_lead_scoped(self):
        user = self._make_user("project_lead", project_ids=["proj-a", "proj-b"])
        ctx = build_scoping_context(user)
        assert "proj-a" in ctx
        assert "proj-b" in ctx
        assert "MUST filter" in ctx

    def test_cc_owner_scoped(self):
        user = self._make_user("cost_center_owner", cost_center_id="cc-muc-dev")
        ctx = build_scoping_context(user)
        assert "cc-muc-dev" in ctx
        assert "cost center" in ctx.lower()


# ---------------------------------------------------------------------------
# ReportSpec Validation Tests
# ---------------------------------------------------------------------------


class TestReportSpecValidation:
    def test_valid_spec_parses(self):
        data = {
            "title": "Test Report",
            "kpis": [{"label": "Total", "value": 1234.56, "format": "currency"}],
            "table": {
                "columns": [{"key": "name", "label": "Name", "type": "text"}],
                "rows": [{"name": "Test"}],
            },
            "charts": [],
        }
        spec = ReportSpec(**data)
        assert spec.title == "Test Report"
        assert len(spec.kpis) == 1

    def test_missing_title_fails(self):
        with pytest.raises(Exception):
            ReportSpec(kpis=[], charts=[])  # type: ignore — missing title

    def test_empty_table_allowed(self):
        data = {
            "title": "Empty Report",
            "table": {
                "columns": [{"key": "a", "label": "A", "type": "text"}],
                "rows": [],
            },
        }
        spec = ReportSpec(**data)
        assert spec.table is not None
        assert len(spec.table.rows) == 0

    def test_invalid_chart_type_accepted(self):
        # Chart type is a free string — validation happens at frontend level
        data = {
            "title": "Report",
            "charts": [
                {
                    "type": "unknown_type",
                    "title": "Chart",
                    "data": [],
                    "data_key": "val",
                    "category_key": "cat",
                }
            ],
        }
        spec = ReportSpec(**data)
        assert spec.charts[0].type == "unknown_type"

    def test_kpi_with_string_value(self):
        data = {
            "title": "Report",
            "kpis": [{"label": "Status", "value": "Active", "format": "text"}],
        }
        spec = ReportSpec(**data)
        assert spec.kpis[0].value == "Active"


# ---------------------------------------------------------------------------
# Report Spec Extraction Tests
# ---------------------------------------------------------------------------


class TestExtractReportSpec:
    def test_extracts_valid_spec(self):
        text = '''Here's your report:

```report_spec
{"title": "Test", "kpis": [], "charts": []}
```

Hope this helps!'''
        result = extract_report_spec(text)
        assert result is not None
        assert result["title"] == "Test"

    def test_returns_none_for_no_spec(self):
        assert extract_report_spec("Just some regular text") is None

    def test_returns_none_for_invalid_json(self):
        text = '''```report_spec
{invalid json here}
```'''
        assert extract_report_spec(text) is None

    def test_ignores_regular_code_blocks(self):
        text = '''```json
{"title": "Not a report"}
```'''
        assert extract_report_spec(text) is None


# ---------------------------------------------------------------------------
# Conversation Management Tests
# ---------------------------------------------------------------------------


class TestConversationManagement:
    def setup_method(self):
        """Clear conversations before each test."""
        _conversations.clear()

    def _make_user(self):
        return CurrentUser(
            user_id="persona-controller",
            person_id="p-meier",
            name="Anna Meier",
            role="controller",
        )

    def test_create_conversation(self):
        db = MagicMock()
        user = self._make_user()
        conv = start_conversation(db, user, "Test message")
        assert conv.conversation_id
        assert len(conv.messages) == 1
        assert conv.messages[0]["content"] == "Test message"

    def test_get_conversation(self):
        db = MagicMock()
        conv = start_conversation(db, self._make_user(), "Hello")
        found = get_conversation(conv.conversation_id)
        assert found is not None
        assert found.conversation_id == conv.conversation_id

    def test_conversation_not_found(self):
        assert get_conversation("nonexistent-id") is None

    def test_delete_conversation(self):
        db = MagicMock()
        conv = start_conversation(db, self._make_user(), "Hello")
        assert delete_conversation(conv.conversation_id) is True
        assert get_conversation(conv.conversation_id) is None

    def test_delete_nonexistent_returns_false(self):
        assert delete_conversation("nonexistent") is False

    def test_conversation_expiry(self):
        db = MagicMock()
        conv = start_conversation(db, self._make_user(), "Hello")
        # Manually expire the conversation
        conv.last_active = datetime.utcnow() - timedelta(
            minutes=CONVERSATION_TTL_MINUTES + 1
        )
        _cleanup_expired()
        assert get_conversation(conv.conversation_id) is None


# ---------------------------------------------------------------------------
# API Key Resolution Tests
# ---------------------------------------------------------------------------


class TestGetAPIKey:
    def test_key_from_db(self):
        from services.ai_report_service import get_api_key

        db = MagicMock()
        param = MagicMock()
        param.current_value = "sk-ant-test-key"
        db.query.return_value.filter.return_value.first.return_value = param

        assert get_api_key(db) == "sk-ant-test-key"

    def test_fallback_to_env(self):
        from services.ai_report_service import get_api_key

        db = MagicMock()
        param = MagicMock()
        param.current_value = ""
        db.query.return_value.filter.return_value.first.return_value = param

        with patch.dict(os.environ, {"ANTHROPIC_API_KEY": "sk-env-key"}):
            assert get_api_key(db) == "sk-env-key"

    def test_no_key_returns_none(self):
        from services.ai_report_service import get_api_key

        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None

        with patch.dict(os.environ, {}, clear=True):
            # Remove ANTHROPIC_API_KEY if present
            os.environ.pop("ANTHROPIC_API_KEY", None)
            assert get_api_key(db) is None

    def test_whitespace_only_key_treated_as_empty(self):
        from services.ai_report_service import get_api_key

        db = MagicMock()
        param = MagicMock()
        param.current_value = "   "
        db.query.return_value.filter.return_value.first.return_value = param

        with patch.dict(os.environ, {}, clear=True):
            os.environ.pop("ANTHROPIC_API_KEY", None)
            assert get_api_key(db) is None
