"""Shared seed-generation utilities.

Lifted from `generate_seed/config.py` so v4 (`generate_seed/`) and v5
(`generate_seed_v5/`) can share the same primitives during the cutover.
After the legacy package is deleted, these helpers stay here.
"""


def month_range(start: str, end: str) -> list[str]:
    """Generate list of YYYY-MM strings from start to end (inclusive)."""
    sy, sm = int(start[:4]), int(start[5:7])
    ey, em = int(end[:4]), int(end[5:7])
    months: list[str] = []
    y, m = sy, sm
    while (y, m) <= (ey, em):
        months.append(f"{y:04d}-{m:02d}")
        m += 1
        if m > 12:
            m = 1
            y += 1
    return months


def months_between(start: str, end: str) -> int:
    """Number of months between two YYYY-MM strings (inclusive)."""
    return len(month_range(start, end))


def sql_str(v) -> str:
    """Escape a value for SQL: strings get quoted, None becomes NULL."""
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, (int, float)):
        return str(v)
    return f"'{str(v).replace(chr(39), chr(39) + chr(39))}'"


def quote_ident(name: str) -> str:
    """Quote a SQL identifier (column/table) defensively."""
    return f'"{name}"'
