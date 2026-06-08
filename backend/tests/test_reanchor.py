"""Tests for ``config.reanchor_demo_date`` (the reset-time living-demo re-pin).

Re-anchoring sets the process-wide ``DEMO_DATE`` to the real current month and
propagates it to modules that captured it by value (``from config import
DEMO_DATE``), so a reset on a long-running server refreshes "today" without a
restart. Failures to propagate to a single module are logged, not raised.
"""

import sys

import config


def test_reanchor_sets_and_propagates(monkeypatch):
    # Override the (fixture-pinned) clock with a distinct value.
    monkeypatch.setattr(config, "get_current_period", lambda: "2030-09")

    # A stand-in module that captured DEMO_DATE by value.
    import types

    dummy = types.ModuleType("dummy_reanchor_target")
    dummy.DEMO_DATE = "2000-01"
    monkeypatch.setitem(sys.modules, "dummy_reanchor_target", dummy)

    result = config.reanchor_demo_date()

    assert result == "2030-09"
    assert config.DEMO_DATE == "2030-09"
    assert dummy.DEMO_DATE == "2030-09"


def test_reanchor_logs_and_continues_on_propagation_failure(monkeypatch, caplog):
    monkeypatch.setattr(config, "get_current_period", lambda: "2031-02")

    class _Frozen:
        DEMO_DATE = "x"  # non-None so reanchor attempts to update it

        def __setattr__(self, key, value):
            raise RuntimeError("frozen module")

    monkeypatch.setitem(sys.modules, "frozen_reanchor_target", _Frozen())

    with caplog.at_level("WARNING"):
        result = config.reanchor_demo_date()  # must not raise

    assert result == "2031-02"
    assert config.DEMO_DATE == "2031-02"
    assert any("reanchor_demo_date" in r.message for r in caplog.records)
