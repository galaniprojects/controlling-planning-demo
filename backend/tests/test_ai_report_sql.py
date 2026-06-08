"""Tests for the AI Report Builder SQL safety + execution guards.

Covers the second-review hardening: ``validate_sql`` rejects multi-statement
payloads (quote-aware) and the extended keyword denylist, and ``execute_sql``
reports truncation correctly (no off-by-one at exactly ROW_LIMIT rows).
"""

import services.ai_report_service as ai


# --- validate_sql ---------------------------------------------------------

def test_allows_plain_select():
    assert ai.validate_sql("SELECT 1") is None
    assert ai.validate_sql("select id from projects") is None


def test_allows_with_cte():
    assert ai.validate_sql("WITH x AS (SELECT 1) SELECT * FROM x") is None


def test_allows_single_trailing_semicolon():
    assert ai.validate_sql("SELECT 1;") is None


def test_allows_semicolon_inside_string_literal():
    # A quoted ';' is data, not a statement terminator.
    assert ai.validate_sql("SELECT 'a;b' AS x") is None


def test_rejects_multi_statement_set_bypass():
    err = ai.validate_sql(
        "SELECT 1; SET SESSION default_transaction_read_only = off"
    )
    assert err is not None
    assert "single" in err.lower()


def test_rejects_multi_statement_ddl():
    err = ai.validate_sql("SELECT * FROM projects; DROP TABLE projects")
    assert err is not None


def test_rejects_set_keyword():
    assert ai.validate_sql("SET x = 1") is not None


def test_rejects_merge_keyword():
    assert ai.validate_sql("MERGE INTO projects USING t ON (1=1)") is not None


# --- execute_sql truncation ------------------------------------------------

def test_truncation_flag_false_at_exactly_row_limit(monkeypatch):
    monkeypatch.setattr(ai, "ROW_LIMIT", 2)
    result = ai.execute_sql("WITH t(x) AS (VALUES (1),(2)) SELECT x FROM t")
    assert "error" not in result, result
    assert result["row_count"] == 2
    assert result["truncated"] is False


def test_truncation_flag_true_beyond_row_limit(monkeypatch):
    monkeypatch.setattr(ai, "ROW_LIMIT", 2)
    result = ai.execute_sql("WITH t(x) AS (VALUES (1),(2),(3)) SELECT x FROM t")
    assert "error" not in result, result
    assert result["row_count"] == 2  # capped at ROW_LIMIT
    assert result["truncated"] is True
