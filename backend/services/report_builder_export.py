"""CSV export service for Report Builder reports."""

from __future__ import annotations

import csv
import io
import json
from collections import defaultdict
from datetime import date

from sqlalchemy.orm import Session

from schemas.common import CurrentUser
from services.report_builder_catalog import DIMENSIONS, MEASURES
from services.report_builder_engine import execute_report


def _fmt_value(val, fmt: str | None) -> str | float:
    """Format a numeric value for display."""
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
        if d.id == dim_id:
            return d.display_name
    return dim_id


def _get_measure_info(measure_id: str) -> dict:
    for m in MEASURES:
        if m.id == measure_id:
            return {"id": m.id, "display_name": m.display_name, "format": m.format}
    return {"id": measure_id, "display_name": measure_id, "format": "number"}


def export_report_to_csv(
    db: Session,
    user: CurrentUser,
    definition: dict,
    report_name: str = "Unsaved Report",
) -> io.BytesIO:
    """Generate a CSV file from a report definition."""

    rows_dims = definition.get("rows", [])
    cols_dims = definition.get("columns", [])
    filters = definition.get("filters", {})
    values = definition.get("values", [])
    calc_measures = definition.get("calculatedMeasures", [])

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

    # Compute calculated measures
    for cm in calc_measures:
        calc_def = cm.get("calculated", {})
        op_a = calc_def.get("operandA")
        op_b = calc_def.get("operandB")
        operator = calc_def.get("operator", "+")
        cm_id = cm["id"]
        for row in result["rows"]:
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

    # Write CSV
    sio = io.StringIO()
    writer = csv.writer(sio)

    # Metadata preamble
    writer.writerow([f"# Report: {report_name}"])
    writer.writerow([f"# Exported: {date.today().isoformat()}"])
    writer.writerow([f"# Exported By: {user.name}"])
    if filters:
        filter_parts = []
        for dim_id, sel_values in filters.items():
            if sel_values:
                filter_parts.append(f"{_get_dim_name(dim_id)}={', '.join(sel_values)}")
        if filter_parts:
            writer.writerow([f"# Filters: {'; '.join(filter_parts)}"])
    writer.writerow([])

    has_cross_tab = len(cols_dims) > 0

    if has_cross_tab:
        _write_cross_tab_csv(writer, result, rows_dims, cols_dims, measure_infos)
    else:
        _write_flat_csv(writer, result, rows_dims, measure_infos)

    # Convert to BytesIO with UTF-8 BOM for Excel compatibility
    buf = io.BytesIO(b"\xef\xbb\xbf" + sio.getvalue().encode("utf-8"))
    buf.seek(0)
    return buf


def _write_flat_csv(writer, result, rows_dims, measure_infos):
    """Write a flat (non-cross-tab) table as CSV."""
    # Header row
    headers = [_get_dim_name(d) for d in rows_dims] + [m["display_name"] for m in measure_infos]
    writer.writerow(headers)

    # Group by first row dimension for subtotals
    row_groups: dict[str, list[dict]] = defaultdict(list)
    for data_row in result["rows"]:
        group_key = str(data_row.get(rows_dims[0], "")) if rows_dims else "__all__"
        row_groups[group_key].append(data_row)

    # Data rows with subtotals
    for group_key, group_rows in row_groups.items():
        subtotals: dict[int, float] = defaultdict(float)
        subtotal_counts: dict[int, int] = defaultdict(int)

        for data_row in group_rows:
            row = []
            for dim_id in rows_dims:
                row.append(data_row.get(dim_id, ""))
            for i, m_info in enumerate(measure_infos):
                raw_val = data_row.get(m_info["id"])
                row.append(_fmt_value(raw_val, m_info["format"]))
                if raw_val is not None:
                    try:
                        subtotals[i] += float(raw_val)
                        subtotal_counts[i] += 1
                    except (ValueError, TypeError):
                        pass
            writer.writerow(row)

        # Subtotal row
        if len(group_rows) > 1 and rows_dims:
            row = [f"Subtotal: {group_key}"] + [""] * (len(rows_dims) - 1)
            for i, m_info in enumerate(measure_infos):
                val = subtotals.get(i)
                row.append(_fmt_value(val, m_info["format"]) if val else "")
            writer.writerow(row)

    # Grand total row
    grand_totals: dict[int, float] = defaultdict(float)
    for data_row in result["rows"]:
        for i, m_info in enumerate(measure_infos):
            raw_val = data_row.get(m_info["id"])
            if raw_val is not None:
                try:
                    grand_totals[i] += float(raw_val)
                except (ValueError, TypeError):
                    pass

    row = ["Grand Total"] + [""] * (len(rows_dims) - 1) if rows_dims else ["Grand Total"]
    for i, m_info in enumerate(measure_infos):
        val = grand_totals.get(i)
        row.append(_fmt_value(val, m_info["format"]) if val else "")
    writer.writerow(row)


def _write_cross_tab_csv(writer, result, rows_dims, cols_dims, measure_infos):
    """Write a cross-tabulated table as flattened CSV."""
    data_rows = result["rows"]

    # Collect unique column dimension value combos
    col_combos = set()
    for row in data_rows:
        combo = tuple(str(row.get(d, "")) for d in cols_dims)
        col_combos.add(combo)
    col_combos_sorted = sorted(col_combos, key=lambda x: x)

    # Build flattened column headers: "DimVal1 - DimVal2 - MeasureName"
    col_leaves = []
    for combo in col_combos_sorted:
        for m_info in measure_infos:
            col_leaves.append({"combo": combo, "measure": m_info})

    headers = [_get_dim_name(d) for d in rows_dims]
    for leaf in col_leaves:
        combo_label = " - ".join(leaf["combo"])
        headers.append(f"{combo_label} - {leaf['measure']['display_name']}")
    writer.writerow(headers)

    # Group by first row dimension for subtotals
    row_groups: dict[str, list[dict]] = defaultdict(list)
    for data_row in data_rows:
        group_key = str(data_row.get(rows_dims[0], "")) if rows_dims else "__all__"
        row_groups[group_key].append(data_row)

    # Data rows with subtotals
    for group_key, group_rows in row_groups.items():
        subtotals: dict[int, float] = defaultdict(float)
        subtotal_counts: dict[int, int] = defaultdict(int)

        for data_row in group_rows:
            row = [data_row.get(dim_id, "") for dim_id in rows_dims]

            for leaf_idx, leaf in enumerate(col_leaves):
                combo = leaf["combo"]
                m_info = leaf["measure"]
                matches = all(
                    str(data_row.get(cols_dims[i], "")) == combo[i]
                    for i in range(len(cols_dims))
                )
                if matches:
                    raw_val = data_row.get(m_info["id"])
                    row.append(_fmt_value(raw_val, m_info["format"]))
                    if raw_val is not None:
                        try:
                            subtotals[leaf_idx] += float(raw_val)
                            subtotal_counts[leaf_idx] += 1
                        except (ValueError, TypeError):
                            pass
                else:
                    row.append("")
            writer.writerow(row)

        # Subtotal row
        if len(group_rows) > 1 and rows_dims:
            row = [f"Subtotal: {group_key}"] + [""] * (len(rows_dims) - 1)
            for leaf_idx, leaf in enumerate(col_leaves):
                val = subtotals.get(leaf_idx)
                m_info = leaf["measure"]
                row.append(_fmt_value(val, m_info["format"]) if val else "")
            writer.writerow(row)

    # Grand total row
    grand_totals: dict[int, float] = defaultdict(float)
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
                        grand_totals[leaf_idx] += float(raw_val)
                    except (ValueError, TypeError):
                        pass

    row = ["Grand Total"] + [""] * (len(rows_dims) - 1) if rows_dims else ["Grand Total"]
    for leaf_idx, leaf in enumerate(col_leaves):
        val = grand_totals.get(leaf_idx)
        m_info = leaf["measure"]
        row.append(_fmt_value(val, m_info["format"]) if val else "")
    writer.writerow(row)
