"""Excel export service for Report Builder reports."""

from __future__ import annotations

import io
import json
from collections import defaultdict
from datetime import date

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from sqlalchemy.orm import Session

from schemas.common import CurrentUser
from services.report_builder_catalog import DIMENSIONS, MEASURES
from services.report_builder_engine import execute_report

# European number formatting helpers
_thin_border = Border(
    left=Side(style="thin", color="D0D0D0"),
    right=Side(style="thin", color="D0D0D0"),
    top=Side(style="thin", color="D0D0D0"),
    bottom=Side(style="thin", color="D0D0D0"),
)


def _fmt_value(val, fmt: str | None) -> str | float:
    """Format a numeric value for Excel display."""
    if val is None:
        return ""
    try:
        num = float(val)
    except (ValueError, TypeError):
        return str(val)
    if fmt == "currency":
        return round(num, 2)
    if fmt == "percent":
        return round(num, 1)
    if fmt == "hours":
        return round(num, 1)
    return round(num, 0)


def _get_dim_name(dim_id: str) -> str:
    for d in DIMENSIONS:
        if d["id"] == dim_id:
            return d["display_name"]
    return dim_id


def _get_measure_info(measure_id: str) -> dict:
    for m in MEASURES:
        if m["id"] == measure_id:
            return m
    return {"id": measure_id, "display_name": measure_id, "format": "number"}


# Conditional format colour map
_FORMAT_COLOURS = {
    "green": "C6EFCE",
    "amber": "FFEB9C",
    "red": "FFC7CE",
    "blue": "BDD7EE",
}


def export_report_to_excel(
    db: Session,
    user: CurrentUser,
    definition: dict,
    report_name: str = "Unsaved Report",
) -> io.BytesIO:
    """Generate an Excel workbook from a report definition."""

    rows_dims = definition.get("rows", [])
    cols_dims = definition.get("columns", [])
    filters = definition.get("filters", {})
    values = definition.get("values", [])
    calc_measures = definition.get("calculatedMeasures", [])
    format_rules = definition.get("formatRules", [])

    # Collect base measure IDs (exclude calculated)
    calc_ids = {cm["id"] for cm in calc_measures}
    base_values = [v for v in values if v not in calc_ids]

    # Also include operands needed for calculated measures
    for cm in calc_measures:
        calc_def = cm.get("calculated", {})
        for operand_key in ("operandA", "operandB"):
            op_id = calc_def.get(operand_key)
            if op_id and op_id not in base_values and op_id not in calc_ids:
                base_values.append(op_id)

    # Execute query
    result = execute_report(
        db=db,
        user=user,
        rows=rows_dims,
        columns=cols_dims,
        filters=filters,
        values=base_values,
    )

    # Compute calculated measures client-side style
    for cm in calc_measures:
        calc_def = cm.get("calculated", {})
        op_a = calc_def.get("operandA")
        op_b = calc_def.get("operandB")
        operator = calc_def.get("operator", "+")
        cm_id = cm["id"]
        for row in result.rows:
            a = row.get(op_a)
            b = row.get(op_b)
            if a is not None and b is not None:
                try:
                    a, b = float(a), float(b)
                    if operator == "+":
                        row[cm_id] = a + b
                    elif operator == "-":
                        row[cm_id] = a - b
                    elif operator == "*":
                        row[cm_id] = a * b
                    elif operator == "/" and b != 0:
                        row[cm_id] = a / b
                    else:
                        row[cm_id] = None
                except (ValueError, TypeError):
                    row[cm_id] = None
            else:
                row[cm_id] = None

    # Build measure info list (in user's order)
    measure_infos = []
    for v_id in values:
        calc_match = next((cm for cm in calc_measures if cm["id"] == v_id), None)
        if calc_match:
            measure_infos.append({
                "id": calc_match["id"],
                "display_name": calc_match.get("display_name", calc_match["id"]),
                "format": calc_match.get("format", "number"),
            })
        else:
            measure_infos.append(_get_measure_info(v_id))

    # Build workbook
    wb = Workbook()

    # ── Sheet 1: Report Data ──
    ws = wb.active
    ws.title = "Report Data"

    header_font = Font(bold=True, color="FFFFFF", size=10)
    header_fill = PatternFill(start_color="1E40AF", end_color="1E40AF", fill_type="solid")
    subtotal_font = Font(bold=True, size=10)
    subtotal_fill = PatternFill(start_color="F0F0F0", end_color="F0F0F0", fill_type="solid")
    grand_font = Font(bold=True, size=10)
    grand_fill = PatternFill(start_color="D0D0D0", end_color="D0D0D0", fill_type="solid")

    has_cross_tab = len(cols_dims) > 0

    if has_cross_tab:
        _write_cross_tab(ws, result, rows_dims, cols_dims, measure_infos, format_rules,
                         header_font, header_fill, subtotal_font, subtotal_fill,
                         grand_font, grand_fill)
    else:
        _write_flat_table(ws, result, rows_dims, measure_infos, format_rules,
                          header_font, header_fill, subtotal_font, subtotal_fill,
                          grand_font, grand_fill)

    # Auto-width columns
    for col in ws.columns:
        max_length = 0
        for cell in col:
            try:
                if cell.value:
                    max_length = max(max_length, len(str(cell.value)))
            except Exception:
                pass
        ws.column_dimensions[get_column_letter(col[0].column)].width = min(max_length + 3, 30)

    # ── Sheet 2: Report Info ──
    meta_ws = wb.create_sheet("Report Info")
    bold = Font(bold=True)

    info_rows = [
        ("Report Name", report_name),
        ("Export Date", date.today().isoformat()),
        ("Exported By", user.name),
        ("", ""),
        ("Dimensions on Rows", ", ".join(_get_dim_name(d) for d in rows_dims) or "None"),
        ("Dimensions on Columns", ", ".join(_get_dim_name(d) for d in cols_dims) or "None"),
        ("Filters", ""),
    ]
    for dim_id, sel_values in filters.items():
        if sel_values:
            info_rows.append(("  " + _get_dim_name(dim_id), ", ".join(sel_values)))

    info_rows.append(("", ""))
    info_rows.append(("Measures", ", ".join(m["display_name"] for m in measure_infos)))

    if calc_measures:
        info_rows.append(("", ""))
        info_rows.append(("Calculated Measures", ""))
        for cm in calc_measures:
            calc_def = cm.get("calculated", {})
            formula = f'{calc_def.get("operandA", "?")} {calc_def.get("operator", "?")} {calc_def.get("operandB", "?")}'
            info_rows.append(("  " + cm.get("display_name", cm["id"]), formula))

    for row_idx, (label, value) in enumerate(info_rows, 1):
        cell_a = meta_ws.cell(row=row_idx, column=1, value=label)
        cell_a.font = bold
        meta_ws.cell(row=row_idx, column=2, value=value)

    meta_ws.column_dimensions["A"].width = 25
    meta_ws.column_dimensions["B"].width = 50

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


def _write_flat_table(ws, result, rows_dims, measure_infos, format_rules,
                      header_font, header_fill, subtotal_font, subtotal_fill,
                      grand_font, grand_fill):
    """Write a flat (non-cross-tab) table."""
    # Headers
    headers = [_get_dim_name(d) for d in rows_dims] + [m["display_name"] for m in measure_infos]
    for col_idx, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.border = _thin_border

    # Data rows
    for row_idx, data_row in enumerate(result.rows, 2):
        for col_idx, dim_id in enumerate(rows_dims, 1):
            cell = ws.cell(row=row_idx, column=col_idx, value=data_row.get(dim_id, ""))
            cell.border = _thin_border
        for col_idx_offset, m_info in enumerate(measure_infos):
            col_idx = len(rows_dims) + col_idx_offset + 1
            raw_val = data_row.get(m_info["id"])
            cell = ws.cell(row=row_idx, column=col_idx, value=_fmt_value(raw_val, m_info["format"]))
            cell.border = _thin_border
            _apply_format_rules(cell, m_info["id"], raw_val, format_rules)


def _write_cross_tab(ws, result, rows_dims, cols_dims, measure_infos, format_rules,
                     header_font, header_fill, subtotal_font, subtotal_fill,
                     grand_font, grand_fill):
    """Write a cross-tabulated table with nested headers."""
    data_rows = result.rows

    # Collect unique column dimension value combos
    col_combos = set()
    for row in data_rows:
        combo = tuple(str(row.get(d, "")) for d in cols_dims)
        col_combos.add(combo)
    col_combos_sorted = sorted(col_combos, key=lambda x: x)

    num_row_dims = len(rows_dims)
    num_measures = len(measure_infos)

    # Column leaves: one per (col_combo, measure) pair
    col_leaves = []
    for combo in col_combos_sorted:
        for m_info in measure_infos:
            col_leaves.append({"combo": combo, "measure": m_info})

    total_data_cols = len(col_leaves)

    # Write column headers
    # One header row per column dimension level, plus one for measure names
    current_row = 1

    for level_idx, dim_id in enumerate(cols_dims):
        col_offset = num_row_dims + 1
        # Row dimension headers in the leftmost cells
        if level_idx == 0:
            for rd_idx, rd_id in enumerate(rows_dims):
                cell = ws.cell(row=current_row, column=rd_idx + 1, value=_get_dim_name(rd_id))
                cell.font = header_font
                cell.fill = header_fill
                cell.border = _thin_border

        # Group consecutive columns with the same dim value for this level
        prev_val = None
        span_start = col_offset
        for leaf_idx, leaf in enumerate(col_leaves):
            val = leaf["combo"][level_idx] if level_idx < len(leaf["combo"]) else ""
            current_col = col_offset + leaf_idx

            if val != prev_val and prev_val is not None:
                # Write merged header for previous group
                cell = ws.cell(row=current_row, column=span_start, value=prev_val)
                cell.font = header_font
                cell.fill = header_fill
                cell.alignment = Alignment(horizontal="center")
                cell.border = _thin_border
                if current_col - span_start > 1:
                    ws.merge_cells(
                        start_row=current_row, start_column=span_start,
                        end_row=current_row, end_column=current_col - 1,
                    )
                span_start = current_col
            prev_val = val

        # Write last group
        if prev_val is not None:
            cell = ws.cell(row=current_row, column=span_start, value=prev_val)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal="center")
            cell.border = _thin_border
            end_col = col_offset + total_data_cols - 1
            if end_col > span_start:
                ws.merge_cells(
                    start_row=current_row, start_column=span_start,
                    end_row=current_row, end_column=end_col,
                )

        current_row += 1

    # Measure name header row (if multiple measures or always for clarity)
    if num_measures > 0:
        for leaf_idx, leaf in enumerate(col_leaves):
            col_idx = num_row_dims + 1 + leaf_idx
            cell = ws.cell(row=current_row, column=col_idx, value=leaf["measure"]["display_name"])
            cell.font = header_font
            cell.fill = header_fill
            cell.border = _thin_border
        current_row += 1

    # Group data rows by the first row dimension for subtotals
    row_groups: dict[str, list[dict]] = defaultdict(list)
    for data_row in data_rows:
        group_key = str(data_row.get(rows_dims[0], "")) if rows_dims else "__all__"
        row_groups[group_key].append(data_row)

    # Write data rows with subtotals per group
    for group_key, group_rows in row_groups.items():
        subtotals: dict[str, float] = defaultdict(float)
        subtotal_counts: dict[str, int] = defaultdict(int)

        for data_row in group_rows:
            # Row dimension values
            for rd_idx, rd_id in enumerate(rows_dims):
                cell = ws.cell(row=current_row, column=rd_idx + 1, value=data_row.get(rd_id, ""))
                cell.border = _thin_border

            # Data cells
            for leaf_idx, leaf in enumerate(col_leaves):
                col_idx = num_row_dims + 1 + leaf_idx
                combo = leaf["combo"]
                m_info = leaf["measure"]

                # Check if this row matches the column combo
                matches = all(
                    str(data_row.get(cols_dims[i], "")) == combo[i]
                    for i in range(len(cols_dims))
                )

                if matches:
                    raw_val = data_row.get(m_info["id"])
                    cell = ws.cell(row=current_row, column=col_idx, value=_fmt_value(raw_val, m_info["format"]))
                    cell.border = _thin_border
                    _apply_format_rules(cell, m_info["id"], raw_val, format_rules)

                    # Accumulate subtotals
                    leaf_key = f"{leaf_idx}"
                    if raw_val is not None:
                        try:
                            subtotals[leaf_key] += float(raw_val)
                            subtotal_counts[leaf_key] += 1
                        except (ValueError, TypeError):
                            pass
                else:
                    cell = ws.cell(row=current_row, column=col_idx, value="")
                    cell.border = _thin_border

            current_row += 1

        # Subtotal row
        if len(group_rows) > 1 and rows_dims:
            cell = ws.cell(row=current_row, column=1, value=f"Subtotal: {group_key}")
            cell.font = subtotal_font
            cell.fill = subtotal_fill
            cell.border = _thin_border
            # Merge across row dim columns
            if num_row_dims > 1:
                ws.merge_cells(
                    start_row=current_row, start_column=1,
                    end_row=current_row, end_column=num_row_dims,
                )

            for leaf_idx, leaf in enumerate(col_leaves):
                col_idx = num_row_dims + 1 + leaf_idx
                leaf_key = f"{leaf_idx}"
                val = subtotals.get(leaf_key)
                m_info = leaf["measure"]
                cell = ws.cell(row=current_row, column=col_idx,
                               value=_fmt_value(val, m_info["format"]) if val else "")
                cell.font = subtotal_font
                cell.fill = subtotal_fill
                cell.border = _thin_border

            current_row += 1

    # Grand total row
    grand_totals: dict[str, float] = defaultdict(float)
    for data_row in data_rows:
        for leaf_idx, leaf in enumerate(col_leaves):
            combo = leaf["combo"]
            m_info = leaf["measure"]
            matches = all(
                str(data_row.get(cols_dims[i], "")) == combo[i]
                for i in range(len(cols_dims))
            )
            if matches:
                raw_val = data_row.get(m_info["id"])
                if raw_val is not None:
                    try:
                        grand_totals[f"{leaf_idx}"] += float(raw_val)
                    except (ValueError, TypeError):
                        pass

    cell = ws.cell(row=current_row, column=1, value="Grand Total")
    cell.font = grand_font
    cell.fill = grand_fill
    cell.border = _thin_border
    if num_row_dims > 1:
        ws.merge_cells(
            start_row=current_row, start_column=1,
            end_row=current_row, end_column=num_row_dims,
        )
    for leaf_idx, leaf in enumerate(col_leaves):
        col_idx = num_row_dims + 1 + leaf_idx
        val = grand_totals.get(f"{leaf_idx}")
        m_info = leaf["measure"]
        cell = ws.cell(row=current_row, column=col_idx,
                       value=_fmt_value(val, m_info["format"]) if val else "")
        cell.font = grand_font
        cell.fill = grand_fill
        cell.border = _thin_border


def _apply_format_rules(cell, measure_id: str, raw_val, format_rules: list):
    """Apply conditional formatting colours to a cell."""
    if raw_val is None or not format_rules:
        return
    try:
        num = float(raw_val)
    except (ValueError, TypeError):
        return

    for rule in format_rules:
        if rule.get("measureId") != measure_id:
            continue
        op = rule.get("operator", "")
        threshold = rule.get("value", 0)
        threshold2 = rule.get("value2", 0)
        colour_key = rule.get("color", "")

        matched = False
        if op == "<" and num < threshold:
            matched = True
        elif op == "<=" and num <= threshold:
            matched = True
        elif op == ">" and num > threshold:
            matched = True
        elif op == ">=" and num >= threshold:
            matched = True
        elif op == "=" and num == threshold:
            matched = True
        elif op == "between" and threshold <= num <= threshold2:
            matched = True

        if matched and colour_key in _FORMAT_COLOURS:
            cell.fill = PatternFill(
                start_color=_FORMAT_COLOURS[colour_key],
                end_color=_FORMAT_COLOURS[colour_key],
                fill_type="solid",
            )
            return  # first matching rule wins
