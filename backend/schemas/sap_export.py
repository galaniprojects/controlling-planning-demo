"""Pydantic schemas for the SAP export endpoint per FD-4 [F-EXP-01]."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class SAPExportRowResponse(BaseModel):
    wbs_element: str
    entity_id: str
    entity_identifier: str
    entity_name: str
    entity_type: str
    charging_location_id: str
    charging_location_code: str
    charging_location_name: str
    year: int
    percentage: float
    annual_amount_eur: Optional[float] = None


class SAPExportListResponse(BaseModel):
    """JSON envelope for ``GET /api/charging/sap-export?format=json``.

    The ``items`` / ``total`` keys mirror the standard list-response shape
    used elsewhere in the module; ``missing_profiles`` is the controller's
    punch-list of entities with ``to_business_pct > 0`` but no active BTC
    profile for ``year``.
    """
    year: int
    entity_type: Optional[str] = None
    items: list[SAPExportRowResponse]
    missing_profiles: list[str]
    total: int
