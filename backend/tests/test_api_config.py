"""Tests for the app-config endpoint (``GET /api/config``).

The endpoint is the single source of truth the frontend reads on bootstrap for
VIPER's dynamic temporal anchor: the in-progress ``current_period`` (locked for
forecasting), the ``open_forecast_month`` (first editable month = current + 1),
and the calendar-aligned ``fiscal_year``.

The autouse ``pin_demo_date`` fixture pins ``config.DEMO_DATE`` (and the
``DEMO_DATE`` import in ``services.calendar``) to the canonical ``"2026-04"``,
so ``open_forecast_month()`` resolves to ``"2026-05"`` and the fiscal year to
2026. The router binds ``get_current_period`` by name at import, so we patch
that bound name explicitly to keep ``current_period`` consistent with the pin.
"""
from __future__ import annotations

import os
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import routers.config as config_router
from main import app


@pytest.fixture
def client(monkeypatch):
    """Bare TestClient for the (unauthenticated) config endpoint.

    Pins ``routers.config.get_current_period`` to the canonical month so the
    response is deterministic under the autouse ``pin_demo_date`` fixture (which
    already pins ``services.calendar``'s ``DEMO_DATE`` to the same anchor).
    """
    monkeypatch.setattr(config_router, "get_current_period", lambda: "2026-04")
    # Stop the startup seed from touching the real DB.
    original_startup = app.router.on_startup.copy()
    app.router.on_startup.clear()
    c = TestClient(app, raise_server_exceptions=False)
    yield c
    app.router.on_startup = original_startup


class TestGetAppConfig:
    def test_returns_200(self, client):
        resp = client.get("/api/config")
        assert resp.status_code == 200

    def test_has_all_three_keys(self, client):
        body = client.get("/api/config").json()
        assert set(body.keys()) == {"current_period", "open_forecast_month", "fiscal_year"}

    def test_current_period_is_pinned_anchor(self, client):
        body = client.get("/api/config").json()
        assert body["current_period"] == "2026-04"

    def test_open_forecast_month_is_current_plus_one(self, client):
        body = client.get("/api/config").json()
        # The in-progress current month is LOCKED; the open month is the next one.
        assert body["open_forecast_month"] == "2026-05"

    def test_open_is_strictly_after_current(self, client):
        body = client.get("/api/config").json()
        assert body["open_forecast_month"] > body["current_period"]

    def test_fiscal_year_is_year_of_current_period(self, client):
        body = client.get("/api/config").json()
        # KB fiscal year is calendar-aligned (Jan-Dec).
        assert body["fiscal_year"] == int(body["current_period"][:4])
        assert body["fiscal_year"] == 2026

    def test_month_strings_are_yyyy_mm(self, client):
        body = client.get("/api/config").json()
        for key in ("current_period", "open_forecast_month"):
            val = body[key]
            assert len(val) == 7 and val[4] == "-", f"{key}={val!r} not YYYY-MM"


class TestConfigRelationshipHoldsForArbitraryMonth:
    """The open-month / fiscal-year relationships must hold for any anchor,
    not just the canonical pin — guards the next-month + FY-of-year logic."""

    @pytest.mark.parametrize(
        "current,expected_open",
        [
            ("2026-12", "2027-01"),  # year rollover
            ("2026-01", "2026-02"),
            ("2027-06", "2027-07"),
        ],
    )
    def test_open_is_next_month(self, monkeypatch, current, expected_open):
        import config as cfg
        import services.calendar as cal

        monkeypatch.setattr(config_router, "get_current_period", lambda: current)
        monkeypatch.setattr(cfg, "DEMO_DATE", current, raising=False)
        monkeypatch.setattr(cal, "DEMO_DATE", current, raising=False)

        original_startup = app.router.on_startup.copy()
        app.router.on_startup.clear()
        try:
            c = TestClient(app, raise_server_exceptions=False)
            body = c.get("/api/config").json()
        finally:
            app.router.on_startup = original_startup

        assert body["current_period"] == current
        assert body["open_forecast_month"] == expected_open
        assert body["fiscal_year"] == int(current[:4])
