"""Pydantic schemas for v5 Cluster F BTC Profile endpoints.

Per [F-S2-01..08], [F-OQ-05].
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


# ---------------------------------------------------------------------------
# BTC Profile Line
# ---------------------------------------------------------------------------

class BTCProfileLineBase(BaseModel):
    charging_location_id: str = Field(..., min_length=1, max_length=50)
    percentage: float = Field(..., gt=0, le=100)


class BTCProfileLineCreate(BTCProfileLineBase):
    pass


class BTCProfileLineResponse(BTCProfileLineBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    profile_id: int
    charging_location_code: Optional[str] = None
    charging_location_name: Optional[str] = None
    # FD-5 [F-DSH-01]: the raw UM integer behind the derived ``percentage``,
    # read from the frozen UM version. Populated for automatic profiles only;
    # ``None`` for manual profiles or when the frozen version is unresolvable.
    raw_um_value: Optional[int] = None


# ---------------------------------------------------------------------------
# BTC Profile
# ---------------------------------------------------------------------------

class BTCProfileBase(BaseModel):
    entity_id: str = Field(..., min_length=1, max_length=50)
    year: int = Field(..., ge=2020, le=2040)
    mode: str = Field(..., pattern="^(manual|automatic)$")
    s_code: Optional[str] = Field(None, max_length=20)
    status: str = Field("draft", pattern="^(draft|active)$")


class BTCProfileCreate(BaseModel):
    """Request body for POST /api/charging/btc-profiles.

    For manual mode: ``lines`` is required; ``s_code`` is ignored.
    For automatic mode: ``s_code`` is required; ``lines`` is ignored (derived from UM).
    """
    entity_id: str = Field(..., min_length=1, max_length=50)
    year: int = Field(..., ge=2020, le=2040)
    mode: str = Field(..., pattern="^(manual|automatic)$")
    s_code: Optional[str] = Field(None, max_length=20)
    status: str = Field("draft", pattern="^(draft|active)$")
    # Manual-mode lines (ignored for automatic).
    lines: list[BTCProfileLineCreate] = Field(default_factory=list)
    # Optional UM year/quarter override for automatic mode.
    um_year: Optional[int] = Field(None, ge=2020, le=2040)
    um_quarter: Optional[int] = Field(None, ge=1, le=4)


class BTCProfileUpdate(BaseModel):
    """Request body for PUT /api/charging/btc-profiles/{id}.

    For manual profiles: replaces all lines.
    For automatic profiles: use POST .../refresh-um instead.
    """
    lines: list[BTCProfileLineCreate] = Field(..., min_length=1)


class BTCProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    entity_id: str
    year: int
    mode: str
    s_code: Optional[str] = None
    # FD-5 [F-DSH-01]: service-level allocation key — the legend explaining
    # what the raw UM integers mean. Sourced from the InternalService entity;
    # ``None`` for non-InternalService entities or when unset.
    allocation_key: Optional[str] = None
    um_snapshot_at: Optional[datetime] = None
    status: str
    copied_from_profile_id: Optional[int] = None
    lines: list[BTCProfileLineResponse] = Field(default_factory=list)
    sums_to_100: bool = False
    created_at: Optional[datetime] = None
    modified_at: Optional[datetime] = None


class BTCProfileListResponse(BaseModel):
    items: list[BTCProfileResponse]
    total: int


# ---------------------------------------------------------------------------
# BTC Refresh Diff (dry-run vs commit)
# ---------------------------------------------------------------------------

class BTCRefreshDiffRequest(BaseModel):
    um_year: Optional[int] = Field(None, ge=2020, le=2040)
    um_quarter: Optional[int] = Field(None, ge=1, le=4)
    dry_run: bool = True


class BTCRefreshDiffLine(BaseModel):
    cl_id: str
    old_pct: Optional[float] = None
    new_pct: Optional[float] = None


class BTCRefreshDiffResponse(BaseModel):
    profile_id: int
    s_code: str
    year: int
    quarter: int
    added: list[str]
    removed: list[str]
    changed: list[dict]
    would_sum_to_100: bool
    committed: bool


# ---------------------------------------------------------------------------
# Activate (draft → active) — FD-4 [F-S2-02]
# ---------------------------------------------------------------------------

class BTCActivateRequest(BaseModel):
    """Optional UM (year, quarter) override for the automatic snapshot freeze.

    With both omitted, the service resolves the currently active UM version
    for the demo's default (year, quarter). Manual profiles ignore both.
    """
    um_year: Optional[int] = Field(None, ge=2020, le=2040)
    um_quarter: Optional[int] = Field(None, ge=1, le=4)


# ---------------------------------------------------------------------------
# Mode change
# ---------------------------------------------------------------------------

class BTCModeChangeRequest(BaseModel):
    new_mode: str = Field(..., pattern="^(manual|automatic)$")
    s_code: Optional[str] = Field(None, max_length=20)
    confirm: bool = False
    um_year: Optional[int] = Field(None, ge=2020, le=2040)
    um_quarter: Optional[int] = Field(None, ge=1, le=4)


# ---------------------------------------------------------------------------
# Copy from profile
# ---------------------------------------------------------------------------

class BTCCopyFromRequest(BaseModel):
    source_profile_id: int
    target_entity_id: str = Field(..., min_length=1, max_length=50)
    target_year: int = Field(..., ge=2020, le=2040)
    target_status: str = Field("draft", pattern="^(draft|active)$")


# ---------------------------------------------------------------------------
# WBS Matrix
# ---------------------------------------------------------------------------

class WBSMatrixRowResponse(BaseModel):
    charging_location_id: str
    charging_location_code: str
    charging_location_name: str
    wbs_element: str
    btc_percentage: Optional[float] = None
    annual_amount_eur: Optional[float] = None


class WBSMatrixResponse(BaseModel):
    entity_id: str
    entity_name: str
    identifier: str
    year: int
    rows: list[WBSMatrixRowResponse]
    sums_to_100: bool
    has_active_profile: bool
    effective_cost: Optional[float] = None


# ---------------------------------------------------------------------------
# Year rollover
# ---------------------------------------------------------------------------

class YearRolloverRequest(BaseModel):
    """Request body for POST /api/admin/btc-profiles/year-rollover.

    Optional scope filters narrow the set of source-year profiles considered:

    - ``entity_types``: only roll over profiles whose entity belongs to one of
      the listed types (``project`` / ``offering`` / ``internal_service``).
    - ``entity_ids``: only roll over profiles for the listed entity ids.

    At most one of ``entity_types`` and ``entity_ids`` may be set; both
    ``None`` means "all profiles" (preserves the original behaviour).
    """
    source_year: int = Field(..., ge=2020, le=2040)
    target_year: int = Field(..., ge=2020, le=2040)
    entity_types: Optional[list[Literal["project", "offering", "internal_service"]]] = None
    entity_ids: Optional[list[str]] = None

    @model_validator(mode="after")
    def _validate_scope_exclusive(self) -> "YearRolloverRequest":
        if self.entity_types is not None and self.entity_ids is not None:
            raise ValueError(
                "At most one of entity_types and entity_ids may be set; "
                "leave both None to roll over all profiles.",
            )
        if self.entity_types is not None and len(self.entity_types) == 0:
            raise ValueError("entity_types must contain at least one type when set.")
        if self.entity_ids is not None and len(self.entity_ids) == 0:
            raise ValueError("entity_ids must contain at least one id when set.")
        return self


class YearRolloverResponse(BaseModel):
    source_year: int
    target_year: int
    rolled_over: list[int]   # new profile ids
    skipped: list[str]       # entity_ids skipped
    errors: list[str]        # entity_ids that failed
