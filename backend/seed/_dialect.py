"""Dialect-portability transforms applied to the canonical ``seed.sql`` at load.

The committed seed is authored for SQLite, where booleans are integer ``0``/``1``
literals. PostgreSQL has a real ``BOOLEAN`` type and does **not** coerce integer
literals in raw SQL (``INSERT ... VALUES (..., 1, ...)`` into a boolean column
errors with *"column is of type boolean but expression is of type integer"*).

``convert_booleans`` rewrites the ``0``/``1`` value in every **boolean column
position** to ``FALSE``/``TRUE`` (driven by the SQLAlchemy model metadata, so
non-boolean ``0``/``1`` values — amounts, counts, ids — are left untouched). The
output loads on both engines: ``TRUE``/``FALSE`` are valid SQLite literals
(>= 3.23) and the function is idempotent. Applied right after the date-shift
transform in ``seed/loader.load_seed_sql`` — same "transform the canonical SQL
string at load" pattern as ``seed/date_shift.shift_sql_dates``.
"""

import re

from sqlalchemy import Boolean

_INSERT_HEAD_RE = re.compile(
    r"INSERT\s+INTO\s+(\w+)\s*\(([^)]*)\)\s*VALUES",
    re.IGNORECASE | re.DOTALL,
)

_UPDATE_HEAD_RE = re.compile(r"UPDATE\s+(\w+)\s+SET\b", re.IGNORECASE)


def _boolean_columns_by_table() -> dict[str, set[str]]:
    """Map ``{table_name: {boolean column names}}`` from the ORM metadata."""
    # Import for the side effect of registering every model on Base.metadata.
    import models  # noqa: F401
    from database import Base

    result: dict[str, set[str]] = {}
    for table_name, table in Base.metadata.tables.items():
        bools = {c.name for c in table.columns if isinstance(c.type, Boolean)}
        if bools:
            result[table_name] = bools
    return result


def _strip_sql_comments(sql: str) -> str:
    """Remove SQL line (``--``) and block (``/* */``) comments, quote-aware.

    Apostrophes inside comments (``-- ... all FK'd into v1``) would otherwise
    flip the string-state tracking in the parsers below and desync everything
    after them. Comments are non-functional, so dropping them from the in-memory
    seed before parsing is safe; the committed ``seed.sql`` keeps its comments.
    Comment markers *inside* string literals are preserved.
    """
    out: list[str] = []
    i, n = 0, len(sql)
    in_str = False
    while i < n:
        ch = sql[i]
        if in_str:
            out.append(ch)
            if ch == "'":
                if i + 1 < n and sql[i + 1] == "'":  # escaped quote
                    out.append(sql[i + 1])
                    i += 2
                    continue
                in_str = False
            i += 1
            continue
        # outside a string literal
        if ch == "'":
            in_str = True
            out.append(ch)
            i += 1
        elif ch == "-" and i + 1 < n and sql[i + 1] == "-":
            j = sql.find("\n", i)
            if j == -1:
                break  # line comment runs to EOF
            i = j  # keep the newline (handled next iteration)
        elif ch == "/" and i + 1 < n and sql[i + 1] == "*":
            j = sql.find("*/", i + 2)
            i = n if j == -1 else j + 2
        else:
            out.append(ch)
            i += 1
    return "".join(out)


def _split_statements(sql: str) -> list[str]:
    """Split SQL into statements on top-level ``;`` (quote-aware, ``''`` escapes).

    Each returned chunk keeps its trailing ``;`` so re-joining reproduces the
    input verbatim.
    """
    stmts: list[str] = []
    buf: list[str] = []
    in_str = False
    i, n = 0, len(sql)
    while i < n:
        ch = sql[i]
        buf.append(ch)
        if ch == "'":
            if in_str:
                if i + 1 < n and sql[i + 1] == "'":  # escaped quote
                    buf.append(sql[i + 1])
                    i += 2
                    continue
                in_str = False
            else:
                in_str = True
        elif ch == ";" and not in_str:
            stmts.append("".join(buf))
            buf = []
        i += 1
    if buf:
        stmts.append("".join(buf))
    return stmts


def _split_top_level_commas(inner: str) -> list[str]:
    """Split a tuple's interior on top-level commas (quote- and paren-aware)."""
    parts: list[str] = []
    buf: list[str] = []
    in_str = False
    depth = 0
    i, n = 0, len(inner)
    while i < n:
        ch = inner[i]
        if ch == "'":
            buf.append(ch)
            if in_str:
                if i + 1 < n and inner[i + 1] == "'":
                    buf.append(inner[i + 1])
                    i += 2
                    continue
                in_str = False
            else:
                in_str = True
        elif not in_str and ch in "([":
            depth += 1
            buf.append(ch)
        elif not in_str and ch in ")]":
            depth -= 1
            buf.append(ch)
        elif ch == "," and not in_str and depth == 0:
            parts.append("".join(buf))
            buf = []
        else:
            buf.append(ch)
        i += 1
    parts.append("".join(buf))
    return parts


def _transform_tuple(inner: str, bool_positions: list[int]) -> str:
    """Convert ``0``/``1`` → ``FALSE``/``TRUE`` at the boolean column positions."""
    vals = _split_top_level_commas(inner)
    for pos in bool_positions:
        if pos >= len(vals):
            continue
        raw = vals[pos]
        token = raw.strip()
        if token == "1":
            vals[pos] = raw.replace("1", "TRUE", 1)
        elif token == "0":
            vals[pos] = raw.replace("0", "FALSE", 1)
        # NULL / already TRUE|FALSE / anything else: leave untouched
    return ",".join(vals)


def _transform_insert(stmt: str, bool_positions: list[int]) -> str:
    """Rewrite every top-level ``(...)`` value tuple after ``VALUES``."""
    m = re.search(r"\bVALUES\b", stmt, re.IGNORECASE)
    if not m:
        return stmt
    head, body = stmt[: m.end()], stmt[m.end():]
    out: list[str] = []
    i, n = 0, len(body)
    in_str = False
    while i < n:
        ch = body[i]
        if ch == "'":
            out.append(ch)
            if in_str:
                if i + 1 < n and body[i + 1] == "'":
                    out.append(body[i + 1])
                    i += 2
                    continue
                in_str = False
            else:
                in_str = True
            i += 1
        elif ch == "(" and not in_str:
            # Capture the matching close paren for this tuple.
            j = i + 1
            depth = 1
            t_in_str = False
            while j < n and depth > 0:
                c = body[j]
                if c == "'":
                    if t_in_str:
                        if j + 1 < n and body[j + 1] == "'":
                            j += 2
                            continue
                        t_in_str = False
                    else:
                        t_in_str = True
                elif not t_in_str and c == "(":
                    depth += 1
                elif not t_in_str and c == ")":
                    depth -= 1
                j += 1
            inner = body[i + 1 : j - 1]
            out.append("(" + _transform_tuple(inner, bool_positions) + ")")
            i = j
        else:
            out.append(ch)
            i += 1
    return head + "".join(out)


def _convert_update(stmt: str, bool_cols: set[str]) -> str:
    """Convert ``<boolcol> = 0|1`` to ``FALSE``/``TRUE`` in an UPDATE statement.

    Applies to assignments (SET) and any comparisons (WHERE) on boolean columns —
    both forms break on PostgreSQL (``boolean = integer``). Replacements happen
    only *outside* string literals, so quoted values (e.g. URLs) are never touched.
    """
    pats = [
        re.compile(r"(?<![\w.])(" + re.escape(c) + r")(\s*=\s*)([01])(?![\w.])")
        for c in bool_cols
    ]

    def _repl(m: "re.Match") -> str:
        return f"{m.group(1)}{m.group(2)}{'TRUE' if m.group(3) == '1' else 'FALSE'}"

    def _xform(seg: str) -> str:
        for p in pats:
            seg = p.sub(_repl, seg)
        return seg

    result: list[str] = []
    buf: list[str] = []
    in_str = False
    i, n = 0, len(stmt)
    while i < n:
        ch = stmt[i]
        if in_str:
            buf.append(ch)
            if ch == "'":
                if i + 1 < n and stmt[i + 1] == "'":  # escaped quote
                    buf.append(stmt[i + 1])
                    i += 2
                    continue
                in_str = False
                result.append("".join(buf))  # flush string verbatim
                buf = []
            i += 1
        else:
            if ch == "'":
                result.append(_xform("".join(buf)))  # flush transformed non-string
                buf = [ch]
                in_str = True
                i += 1
            else:
                buf.append(ch)
                i += 1
    result.append("".join(buf) if in_str else _xform("".join(buf)))
    return "".join(result)


def convert_booleans(sql: str) -> str:
    """Convert integer boolean literals to ``TRUE``/``FALSE`` in boolean columns.

    Metadata-driven and idempotent. Handles both INSERTs (boolean column
    positions in each VALUES tuple) and UPDATEs (``SET``/``WHERE`` assignments on
    boolean columns) against tables that have boolean columns.
    """
    bool_map = _boolean_columns_by_table()
    if not bool_map:
        return sql

    sql = _strip_sql_comments(sql)
    rewritten: list[str] = []
    for stmt in _split_statements(sql):
        ins = _INSERT_HEAD_RE.search(stmt)
        if ins:
            bool_cols = bool_map.get(ins.group(1))
            if bool_cols:
                columns = [c.strip().strip('"') for c in ins.group(2).split(",")]
                bool_positions = [
                    i for i, c in enumerate(columns) if c in bool_cols
                ]
                if bool_positions:
                    rewritten.append(_transform_insert(stmt, bool_positions))
                    continue
            rewritten.append(stmt)
            continue

        upd = _UPDATE_HEAD_RE.search(stmt)
        if upd:
            bool_cols = bool_map.get(upd.group(1))
            if bool_cols:
                rewritten.append(_convert_update(stmt, bool_cols))
                continue

        rewritten.append(stmt)
    return "".join(rewritten)
