"""Audit log export service — Cluster D Session D2.

Exports audit log rows for compliance / external review (spec line ~1853).
CSV is the primary supported format (stdlib, no extra deps); XLSX is
best-effort via openpyxl when available. The pattern mirrors
``services/report_builder_export.py``: build a list of rows, write to a
``BytesIO`` buffer, return for the router to stream.

Working assumption noted in PROGRESS.md: openpyxl is present in the demo
backend's virtualenv but is not in ``requirements.txt``. If absent at
runtime we raise a clear error so the router can fall back to CSV.
"""

from __future__ import annotations

import csv
import io
from datetime import datetime
from typing import Iterable, Sequence

from services.audit_query import AuditEntry


CSV_COLUMNS: Sequence[str] = (
    "id",
    "timestamp",
    "category",
    "user_name",
    "user_person_id",
    "entity_type",
    "entity_id",
    "entity_name",
    "action",
    "field_changed",
    "old_value",
    "new_value",
)


def export_csv(
    rows: Iterable[AuditEntry],
    *,
    exported_by: str = "",
    filter_summary: str = "",
) -> io.BytesIO:
    """Render audit rows as UTF-8 BOM CSV for Excel compatibility.

    Includes a comment preamble (``# Exported: …``) for traceability,
    matching the format used by ``report_builder_export.py``.
    """
    sio = io.StringIO()
    writer = csv.writer(sio)

    writer.writerow([f"# VIPER Audit Log Export"])
    writer.writerow([f"# Exported At: {datetime.utcnow().isoformat()}Z"])
    if exported_by:
        writer.writerow([f"# Exported By: {exported_by}"])
    if filter_summary:
        writer.writerow([f"# Filters: {filter_summary}"])
    writer.writerow([])

    writer.writerow(CSV_COLUMNS)
    for row in rows:
        writer.writerow([_safe(getattr(row, col)) for col in CSV_COLUMNS])

    buf = io.BytesIO(b"\xef\xbb\xbf" + sio.getvalue().encode("utf-8"))
    buf.seek(0)
    return buf


def export_xlsx(
    rows: Iterable[AuditEntry],
    *,
    exported_by: str = "",
    filter_summary: str = "",
) -> io.BytesIO:
    """Render audit rows as an .xlsx file (best-effort).

    Raises ``RuntimeError`` if openpyxl is not installed — the caller should
    fall back to CSV with a documented note. ``requirements.txt`` does not
    pin openpyxl in the v5 demo, so callers must handle this case.
    """
    try:
        from openpyxl import Workbook  # type: ignore
        from openpyxl.styles import Font  # type: ignore
    except ImportError as exc:  # pragma: no cover — environment dependent
        raise RuntimeError(
            "openpyxl is not installed; XLSX export unavailable. "
            "Install openpyxl or use format=csv."
        ) from exc

    wb = Workbook()
    ws = wb.active
    ws.title = "Audit Log"

    # Metadata preamble
    ws.append(["VIPER Audit Log Export"])
    ws.append([f"Exported At: {datetime.utcnow().isoformat()}Z"])
    if exported_by:
        ws.append([f"Exported By: {exported_by}"])
    if filter_summary:
        ws.append([f"Filters: {filter_summary}"])
    ws.append([])

    # Header row (bold)
    ws.append(list(CSV_COLUMNS))
    header_font = Font(bold=True)
    for cell in ws[ws.max_row]:
        cell.font = header_font

    for row in rows:
        ws.append([_safe(getattr(row, col)) for col in CSV_COLUMNS])

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


def _safe(value):
    """Coerce ``None`` to '' and pass through everything else as a string."""
    if value is None:
        return ""
    return value if isinstance(value, (int, float)) else str(value)
