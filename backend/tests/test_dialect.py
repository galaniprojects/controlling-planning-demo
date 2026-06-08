"""Tests for the SQLite→PostgreSQL seed portability transform (``seed/_dialect``).

``convert_booleans`` rewrites integer ``0/1`` boolean literals to ``TRUE/FALSE``
(PostgreSQL doesn't coerce integers into BOOLEAN) for both INSERT tuples and
UPDATE assignments, driven by the ORM metadata, leaving non-boolean values and
string contents untouched. These tests guard the data-corruption-prone parsing.
"""

from seed._dialect import (
    convert_booleans,
    _boolean_columns_by_table,
    _strip_sql_comments,
)


def test_boolean_columns_mapped_from_metadata():
    bm = _boolean_columns_by_table()
    # representative known boolean columns
    assert "is_active" in bm.get("people", set())
    assert "is_active" in bm.get("locations", set())
    assert {"ai_council_approved", "within_cutoff"} <= bm.get("projects", set())
    assert "is_provisional" in bm.get("forecasts", set())


def test_insert_boolean_conversion():
    sql = (
        "INSERT INTO locations (id, city, country, is_active, created_at) VALUES\n"
        "('loc-muc', 'Munich', 'Germany', 1, '2026-01-15 10:00:00'),\n"
        "('loc-bud', 'Budapest', 'Hungary', 0, '2026-01-15 10:00:00');"
    )
    out = convert_booleans(sql)
    assert "'Germany', TRUE," in out
    assert "'Hungary', FALSE," in out


def test_insert_non_boolean_integers_untouched():
    # `hours` and `amount_eur` are not boolean — their 0/1 must survive;
    # only `is_provisional` (boolean) converts.
    sql = (
        "INSERT INTO forecasts (project_id, month, category, hours, amount_eur, "
        "is_provisional, location_id) VALUES\n"
        "('p-1', '2026-05', 'internal', 1, 1.00, 1, 'loc-muc'),\n"
        "('p-1', '2026-06', 'internal', 0, 0.00, 0, NULL);"
    )
    out = convert_booleans(sql)
    assert "'internal', 1, 1.00, TRUE," in out
    assert "'internal', 0, 0.00, FALSE, NULL" in out


def test_update_boolean_conversion_leaves_integers():
    sql = (
        "UPDATE projects SET pipeline_stage = 'Under Evaluation', doi = 2, "
        "ai_council_approved = 1, within_cutoff = 0 WHERE id = 'proj-aiops';"
    )
    out = convert_booleans(sql)
    assert "ai_council_approved = TRUE" in out
    assert "within_cutoff = FALSE" in out
    assert "doi = 2" in out  # non-boolean integer untouched


def test_update_substring_column_safety():
    # `archived` is boolean on scenarios; `archived_at` must NOT be touched by
    # the `archived` rule (the (?<![\w.]) / (?![\w.]) guards).
    sql = (
        "UPDATE scenarios SET archived = 1, archived_at = '2026-01-01 00:00:00' "
        "WHERE id = 1;"
    )
    out = convert_booleans(sql)
    assert "archived = TRUE" in out
    assert "archived_at = '2026-01-01 00:00:00'" in out


def test_idempotent():
    sql = (
        "INSERT INTO locations (id, city, country, is_active) VALUES "
        "('loc-muc', 'Munich', 'Germany', 1);\n"
        "UPDATE projects SET within_cutoff = 0 WHERE id = 'proj-x';"
    )
    once = convert_booleans(sql)
    twice = convert_booleans(once)
    assert once == twice


def test_comment_with_apostrophe_does_not_desync():
    # A `--` comment containing an apostrophe (e.g. "FK'd") must not flip the
    # string-state tracking and swallow the following INSERT's conversion.
    sql = (
        "INSERT INTO locations (id, city, country, is_active) VALUES "
        "('a', 'A', 'X', 1);\n"
        "-- everything below was FK'd into v1 manually; don't touch\n"
        "INSERT INTO locations (id, city, country, is_active) VALUES "
        "('b', 'B', 'Y', 0);"
    )
    out = convert_booleans(sql)
    assert "'X', TRUE)" in out
    assert "'Y', FALSE)" in out  # the row after the apostrophe-comment converted


def test_string_values_with_embedded_comment_markers_preserved():
    # `--` inside a quoted string is data, not a comment.
    sql = (
        "INSERT INTO projects (id, name, is_active) VALUES "
        "('p-1', 'Phase 1 -- final', 1);"
    )
    out = convert_booleans(sql)
    assert "'Phase 1 -- final'" in out
    assert ", TRUE)" in out


def test_strip_comments_preserves_string_with_double_dash():
    sql = "INSERT INTO t (url) VALUES ('http://a--b.com');"
    assert _strip_sql_comments(sql) == sql
