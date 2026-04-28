"""WBS Element generator for v5 Cluster F per [F-DM-03].

Format: ``<prefix>-64-99-<location_code>``

Where:
- ``prefix`` is the ChargeableEntity's identifier (already in the right
  shape per its subtype — IT0<PPM>, IT00<S-code>, ITF<NNNNN>).
- ``64-99-`` is the constant company-code marker per the working assumption
  in [F-DM-03] / [F-OQ-05]. The ``64-`` is KB's IT-area code; ``99-`` is the
  spec-mandated separator. Both are constants for v5.
- ``location_code`` is the ChargingLocation's ``code`` column (e.g. 3-digit
  KB charging code).

WBS Elements are **algorithmic, never stored** per [F-DM-03]. This module is
a pure-function builder used at SAP-export time and as a UI preview.

For Stage 2 BTC profile rendering (F3 territory), the SAP export walks all
~90 charging locations and emits zeros for absent rows; that walk lives in
the BTC export service (F3) and consumes ``build_wbs_element`` for each cell.
"""

from __future__ import annotations

from dataclasses import dataclass

# Spec-mandated constants per [F-DM-03] / [F-OQ-05].
COMPANY_CODE_MARKER = "64"
SEPARATOR = "99"


@dataclass(frozen=True)
class WBSComponents:
    """Decomposed WBS element for diagnostics or alternate renderers."""

    prefix: str
    company_code: str
    separator: str
    location_code: str

    def render(self) -> str:
        return f"{self.prefix}-{self.company_code}-{self.separator}-{self.location_code}"


def build_wbs_components(entity_identifier: str, charging_location_code: str) -> WBSComponents:
    """Decompose a WBS element into its parts. Pure function.

    Raises ``ValueError`` on empty inputs so callers fail fast on misconfigured
    entities (e.g. an offering created without an identifier — caught at
    schema time but defensive here).
    """
    if not entity_identifier or not entity_identifier.strip():
        raise ValueError("entity_identifier is required for WBS generation")
    if not charging_location_code or not charging_location_code.strip():
        raise ValueError("charging_location_code is required for WBS generation")
    return WBSComponents(
        prefix=entity_identifier.strip(),
        company_code=COMPANY_CODE_MARKER,
        separator=SEPARATOR,
        location_code=charging_location_code.strip(),
    )


def build_wbs_element(entity_identifier: str, charging_location_code: str) -> str:
    """Build a WBS element string per [F-DM-03]. Pure function."""
    return build_wbs_components(entity_identifier, charging_location_code).render()
