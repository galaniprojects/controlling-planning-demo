"""Unit tests for ChargeableEntity.is_change_or_run — entity-type classification.

Per VIPER §5.1: all Projects are Change; Offerings and Internal Services
are Run. DoI is no longer consulted.

We invoke the property's fget directly on a SimpleNamespace to avoid
SQLAlchemy ORM initialization overhead — the property only reads
self.entity_type, so any object carrying that attribute works.
"""
from __future__ import annotations

import types

import pytest

from models.charging import ChargeableEntity

# ---------------------------------------------------------------------------
# Helper — no DB roundtrip needed; property only reads self.entity_type.
# ---------------------------------------------------------------------------

_fget = ChargeableEntity.is_change_or_run.fget  # type: ignore[attr-defined]


def _classify(entity_type: str) -> str:
    """Call is_change_or_run.fget on a minimal namespace with entity_type set."""
    obj = types.SimpleNamespace(entity_type=entity_type)
    return _fget(obj)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestIsChangeOrRun:
    def test_project_is_change(self):
        assert _classify("Project") == "Change"

    def test_offering_is_run(self):
        assert _classify("Offering") == "Run"

    def test_internal_service_is_run(self):
        assert _classify("InternalService") == "Run"

    def test_project_does_not_dereference_project_relationship(self):
        """Property must not touch self.project — DoI no longer consulted.

        SimpleNamespace has no .project attribute; if the property tried to
        access it, an AttributeError would be raised here.
        """
        result = _classify("Project")
        assert result == "Change"  # reached without AttributeError

    def test_returns_string(self):
        for entity_type in ("Project", "Offering", "InternalService"):
            result = _classify(entity_type)
            assert isinstance(result, str)
            assert result in ("Change", "Run")
