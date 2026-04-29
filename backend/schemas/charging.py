"""Pydantic schemas for Cluster F charging-master admin endpoints."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Country
# ---------------------------------------------------------------------------

class CountryCreate(BaseModel):
    iso_code: str = Field(min_length=2, max_length=3)
    name: str = Field(min_length=1, max_length=100)


class CountryUpdate(BaseModel):
    iso_code: Optional[str] = Field(default=None, min_length=2, max_length=3)
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)


class CountryResponse(BaseModel):
    id: str
    iso_code: str
    name: str
    is_active: bool


# ---------------------------------------------------------------------------
# Region
# ---------------------------------------------------------------------------

class RegionCreate(BaseModel):
    code: str = Field(min_length=1, max_length=20)
    name: str = Field(min_length=1, max_length=100)


class RegionUpdate(BaseModel):
    code: Optional[str] = Field(default=None, min_length=1, max_length=20)
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)


class RegionResponse(BaseModel):
    id: str
    code: str
    name: str
    is_active: bool


# ---------------------------------------------------------------------------
# ChargingLocation
# ---------------------------------------------------------------------------

class ChargingLocationCreate(BaseModel):
    code: str = Field(min_length=1, max_length=20)
    name: str = Field(min_length=1, max_length=200)
    division: Optional[str] = Field(default=None, max_length=100)
    region_id: Optional[str] = None
    country_id: Optional[str] = None


class ChargingLocationUpdate(BaseModel):
    code: Optional[str] = Field(default=None, min_length=1, max_length=20)
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    division: Optional[str] = Field(default=None, max_length=100)
    region_id: Optional[str] = None
    country_id: Optional[str] = None


class ChargingLocationResponse(BaseModel):
    id: str
    code: str
    name: str
    division: Optional[str]
    region_id: Optional[str]
    region_name: Optional[str]
    country_id: Optional[str]
    country_name: Optional[str]
    country_iso_code: Optional[str]
    is_active: bool


# ---------------------------------------------------------------------------
# LegalEntity
# ---------------------------------------------------------------------------

class LegalEntityCreate(BaseModel):
    code: str = Field(min_length=1, max_length=20)
    name: str = Field(min_length=1, max_length=200)
    charging_location_id: Optional[str] = None
    country_id: Optional[str] = None


class LegalEntityUpdate(BaseModel):
    code: Optional[str] = Field(default=None, min_length=1, max_length=20)
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    charging_location_id: Optional[str] = None
    country_id: Optional[str] = None


class LegalEntityResponse(BaseModel):
    id: str
    code: str
    name: str
    charging_location_id: Optional[str]
    charging_location_code: Optional[str]
    charging_location_name: Optional[str]
    country_id: Optional[str]
    country_iso_code: Optional[str]
    country_name: Optional[str]
    is_active: bool
