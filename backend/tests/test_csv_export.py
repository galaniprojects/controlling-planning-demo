"""Unit tests for CSV export services."""

import csv
import io
import os
import sys
from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.report_service import generate_csv_export


def _parse_csv(buf: io.BytesIO) -> list[list[str]]:
    """Parse a BytesIO CSV (with optional BOM) into rows."""
    raw = buf.read()
    # Strip UTF-8 BOM if present
    if raw.startswith(b"\xef\xbb\xbf"):
        raw = raw[3:]
    text = raw.decode("utf-8")
    reader = csv.reader(io.StringIO(text))
    return list(reader)


# ---------------------------------------------------------------------------
# Tests for generate_csv_export (standard reports)
# ---------------------------------------------------------------------------

class TestGenerateCsvExport:
    def test_basic_export(self):
        buf = generate_csv_export(
            report_name="Test Report",
            headers=["Name", "Amount"],
            data_rows=[["Alpha", 100], ["Beta", 200]],
        )
        rows = _parse_csv(buf)
        # Metadata rows
        assert rows[0][0].startswith("# Report: Test Report")
        assert rows[1][0].startswith("# Exported:")
        # Empty separator row
        assert rows[3] == [] or rows[3] == [""]
        # Header
        assert rows[4] == ["Name", "Amount"]
        # Data
        assert rows[5] == ["Alpha", "100"]
        assert rows[6] == ["Beta", "200"]

    def test_summary_row(self):
        buf = generate_csv_export(
            report_name="Summary Test",
            headers=["Name", "Amount"],
            data_rows=[["A", 10]],
            summary_row=["TOTAL", 10],
        )
        rows = _parse_csv(buf)
        # Last row should be the summary
        assert rows[-1] == ["TOTAL", "10"]

    def test_active_filters_in_metadata(self):
        buf = generate_csv_export(
            report_name="Filter Test",
            headers=["X"],
            data_rows=[],
            active_filters={"lob": "IT", "status": "active"},
        )
        rows = _parse_csv(buf)
        filter_row = rows[2][0]
        assert "lob=IT" in filter_row
        assert "status=active" in filter_row

    def test_no_filters_shows_none(self):
        buf = generate_csv_export(
            report_name="No Filter",
            headers=["X"],
            data_rows=[],
        )
        rows = _parse_csv(buf)
        filter_row = rows[2][0]
        assert "None" in filter_row

    def test_empty_data(self):
        buf = generate_csv_export(
            report_name="Empty",
            headers=["A", "B"],
            data_rows=[],
        )
        rows = _parse_csv(buf)
        # Should still have headers after metadata
        header_row = rows[4]
        assert header_row == ["A", "B"]

    def test_values_with_commas_and_quotes(self):
        buf = generate_csv_export(
            report_name="Escape Test",
            headers=["Name", "Desc"],
            data_rows=[['Foo, Inc.', 'He said "hello"']],
        )
        rows = _parse_csv(buf)
        assert rows[5] == ['Foo, Inc.', 'He said "hello"']

    def test_utf8_bom_present(self):
        buf = generate_csv_export(
            report_name="BOM Test",
            headers=["X"],
            data_rows=[],
        )
        buf.seek(0)
        raw = buf.read(3)
        assert raw == b"\xef\xbb\xbf"


# ---------------------------------------------------------------------------
# Tests for export_report_to_csv (Report Builder)
# ---------------------------------------------------------------------------

# Mock the catalog data so imports work
MOCK_DIMENSIONS = [
    SimpleNamespace(id="D01", display_name="Line of Business", type="text"),
    SimpleNamespace(id="D05", display_name="Status", type="text"),
    SimpleNamespace(id="D16", display_name="Fiscal Year", type="text"),
]

MOCK_MEASURES = [
    SimpleNamespace(id="M01", display_name="Baseline", format="currency"),
    SimpleNamespace(id="M03", display_name="Forecast", format="currency"),
]


@pytest.fixture
def mock_catalog():
    with patch("services.report_builder_export.DIMENSIONS", MOCK_DIMENSIONS), \
         patch("services.report_builder_export.MEASURES", MOCK_MEASURES):
        yield


class TestReportBuilderCsvExport:

    def _make_user(self):
        return SimpleNamespace(
            id="u1", name="Test User", role="controller",
            email="test@example.com", cost_center_id=None,
        )

    def test_flat_table(self, mock_catalog):
        mock_result = {"rows": [
            {"D01": "IT", "M01": 1000, "M03": 1200},
            {"D01": "IT", "M01": 2000, "M03": 2500},
            {"D01": "HR", "M01": 500, "M03": 600},
        ]}
        definition = {
            "rows": ["D01"],
            "columns": [],
            "filters": {},
            "values": ["M01", "M03"],
            "calculatedMeasures": [],
            "formatRules": [],
        }
        with patch("services.report_builder_export.execute_report", return_value=mock_result):
            from services.report_builder_export import export_report_to_csv
            buf = export_report_to_csv(MagicMock(), self._make_user(), definition, "Flat Test")

        rows = _parse_csv(buf)
        # Find header row (after metadata + blank line)
        header_idx = next(i for i, r in enumerate(rows) if r and r[0] == "Line of Business")
        assert rows[header_idx] == ["Line of Business", "Baseline", "Forecast"]
        # Data rows follow
        assert rows[header_idx + 1][0] == "IT"
        assert rows[header_idx + 2][0] == "IT"
        # Should have a subtotal for IT (2 rows)
        subtotal_row = rows[header_idx + 3]
        assert subtotal_row[0] == "Subtotal: IT"
        # Grand total at end
        grand_total = [r for r in rows if r and r[0] == "Grand Total"]
        assert len(grand_total) == 1

    def test_cross_tab(self, mock_catalog):
        mock_result = {"rows": [
            {"D01": "IT", "D16": "2025", "M01": 1000},
            {"D01": "IT", "D16": "2026", "M01": 1500},
            {"D01": "HR", "D16": "2025", "M01": 800},
        ]}
        definition = {
            "rows": ["D01"],
            "columns": ["D16"],
            "filters": {},
            "values": ["M01"],
            "calculatedMeasures": [],
            "formatRules": [],
        }
        with patch("services.report_builder_export.execute_report", return_value=mock_result):
            from services.report_builder_export import export_report_to_csv
            buf = export_report_to_csv(MagicMock(), self._make_user(), definition, "Cross Test")

        rows = _parse_csv(buf)
        header_idx = next(i for i, r in enumerate(rows) if r and r[0] == "Line of Business")
        headers = rows[header_idx]
        # Should have flattened column headers
        assert "Line of Business" in headers
        assert "2025 - Baseline" in headers
        assert "2026 - Baseline" in headers

    def test_calculated_measures(self, mock_catalog):
        mock_result = {"rows": [
            {"D01": "IT", "M01": 1000, "M03": 1200},
        ]}
        definition = {
            "rows": ["D01"],
            "columns": [],
            "filters": {},
            "values": ["M01", "M03", "calc_variance"],
            "calculatedMeasures": [{
                "id": "calc_variance",
                "display_name": "Variance",
                "format": "currency",
                "calculated": {
                    "operandA": "M03",
                    "operandB": "M01",
                    "operator": "-",
                },
            }],
            "formatRules": [],
        }
        with patch("services.report_builder_export.execute_report", return_value=mock_result):
            from services.report_builder_export import export_report_to_csv
            buf = export_report_to_csv(MagicMock(), self._make_user(), definition, "Calc Test")

        rows = _parse_csv(buf)
        header_idx = next(i for i, r in enumerate(rows) if r and r[0] == "Line of Business")
        headers = rows[header_idx]
        assert "Variance" in headers
        # Variance should be 1200 - 1000 = 200.0, formatted as currency → 200.0
        data_row = rows[header_idx + 1]
        variance_idx = headers.index("Variance")
        assert float(data_row[variance_idx]) == 200.0

    def test_metadata_preamble(self, mock_catalog):
        mock_result = {"rows": [{"D01": "IT", "M01": 100}]}
        definition = {
            "rows": ["D01"],
            "columns": [],
            "filters": {"D05": ["Active", "Pending"]},
            "values": ["M01"],
            "calculatedMeasures": [],
            "formatRules": [],
        }
        with patch("services.report_builder_export.execute_report", return_value=mock_result):
            from services.report_builder_export import export_report_to_csv
            buf = export_report_to_csv(MagicMock(), self._make_user(), definition, "Meta Test")

        rows = _parse_csv(buf)
        assert "# Report: Meta Test" in rows[0][0]
        assert "# Exported:" in rows[1][0]
        assert "# Exported By: Test User" in rows[2][0]
        # Filters row
        filter_row = rows[3][0]
        assert "Status" in filter_row
        assert "Active" in filter_row

    def test_division_by_zero_in_calc(self, mock_catalog):
        mock_result = {"rows": [
            {"D01": "IT", "M01": 100, "M03": 0},
        ]}
        definition = {
            "rows": ["D01"],
            "columns": [],
            "filters": {},
            "values": ["M01", "calc_ratio"],
            "calculatedMeasures": [{
                "id": "calc_ratio",
                "display_name": "Ratio",
                "format": "number",
                "calculated": {
                    "operandA": "M01",
                    "operandB": "M03",
                    "operator": "/",
                },
            }],
            "formatRules": [],
        }
        with patch("services.report_builder_export.execute_report", return_value=mock_result):
            from services.report_builder_export import export_report_to_csv
            buf = export_report_to_csv(MagicMock(), self._make_user(), definition, "Div Zero")

        rows = _parse_csv(buf)
        header_idx = next(i for i, r in enumerate(rows) if r and r[0] == "Line of Business")
        headers = rows[header_idx]
        data_row = rows[header_idx + 1]
        ratio_idx = headers.index("Ratio")
        # Division by zero should result in empty string (None → "")
        assert data_row[ratio_idx] == ""
