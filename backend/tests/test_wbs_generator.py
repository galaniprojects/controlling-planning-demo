"""Unit tests for the algorithmic WBS generator (v5 Session F2 [F-DM-03])."""

from __future__ import annotations

import pytest

from services.wbs_generator import (
    COMPANY_CODE_MARKER, SEPARATOR, build_wbs_components, build_wbs_element,
)


class TestBuildWBSElement:
    """`build_wbs_element` returns the spec-mandated 4-part string."""

    def test_project_format(self):
        assert build_wbs_element("IT012345", "MUC") == "IT012345-64-99-MUC"

    def test_offering_format(self):
        assert build_wbs_element("IT00S321", "DE-MUC-001") == "IT00S321-64-99-DE-MUC-001"

    def test_internal_service_format(self):
        assert build_wbs_element("ITF13001", "001") == "ITF13001-64-99-001"

    def test_strips_whitespace(self):
        # Defensive — trim accidental whitespace on inputs.
        assert build_wbs_element("  IT012001  ", "  MUC  ") == "IT012001-64-99-MUC"

    @pytest.mark.parametrize("bad_id", ["", "   ", "\t"])
    def test_rejects_empty_identifier(self, bad_id: str):
        with pytest.raises(ValueError, match="entity_identifier"):
            build_wbs_element(bad_id, "MUC")

    @pytest.mark.parametrize("bad_loc", ["", "   "])
    def test_rejects_empty_location(self, bad_loc: str):
        with pytest.raises(ValueError, match="charging_location_code"):
            build_wbs_element("IT012345", bad_loc)


class TestBuildWBSComponents:
    """`build_wbs_components` decomposes the WBS for diagnostic renderers."""

    def test_components_round_trip(self):
        c = build_wbs_components("IT012001", "BUD")
        assert c.prefix == "IT012001"
        assert c.company_code == COMPANY_CODE_MARKER == "64"
        assert c.separator == SEPARATOR == "99"
        assert c.location_code == "BUD"
        assert c.render() == "IT012001-64-99-BUD"

    def test_constants_are_strings(self):
        # Regression — constants must remain strings to participate in the
        # f-string rendering. The spec's [F-OQ-05] permits these to vary in
        # future; for now they are constants.
        assert isinstance(COMPANY_CODE_MARKER, str)
        assert isinstance(SEPARATOR, str)
