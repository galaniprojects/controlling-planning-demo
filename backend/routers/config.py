"""Application config endpoint — exposes VIPER's dynamic temporal anchor.

The single source of truth for "today" lives on the backend (``config.DEMO_DATE``
/ ``config.get_current_period``). The frontend fetches it here on bootstrap so the
two layers can never disagree on the current period or the editable boundary.
"""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from config import get_current_period
from services.calculations import add_months
from services.calendar import fiscal_year_of

router = APIRouter(prefix="/api", tags=["Config"])


class AppConfigResponse(BaseModel):
    current_period: str          # "YYYY-MM" — the in-progress month (locked for forecasting)
    open_forecast_month: str     # "YYYY-MM" — first month open for forecast editing (next month)
    fiscal_year: int             # calendar-aligned fiscal year of the current period


@router.get("/config", response_model=AppConfigResponse)
def get_app_config() -> AppConfigResponse:
    """Return the application's temporal context, derived from the real date.

    All three fields are derived from a single ``current_period`` snapshot so
    they can never disagree (e.g. across a month boundary in a long-running
    process), rather than mixing a live read with import-pinned ``DEMO_DATE``.
    """
    cp = get_current_period()
    return AppConfigResponse(
        current_period=cp,
        open_forecast_month=add_months(cp, 1),
        fiscal_year=fiscal_year_of(cp),
    )
