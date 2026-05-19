"""Tests for ChargeableEntity.allocation_key + the distinct-values helper.

Charging/UM rework cluster FD-1, tag [F-AK-01]: a free-text-with-presets
allocation key on the InternalService subtype; FD-1 ships the column + the
distinct-values helper feeding FD-6's autocomplete.
"""

from __future__ import annotations

from models.charging import ChargeableEntity
from services import user_measurement_service as ums


def _ce(db, eid, etype, key=None):
    db.add(ChargeableEntity(
        id=eid, entity_type=etype, identifier=eid.upper(),
        name=eid, is_active=True, allocation_key=key,
    ))
    db.flush()


class TestAllocationKeyColumn:
    def test_persists_on_internal_service(self, db):
        _ce(db, "svc-x", "InternalService", "Number of users")
        db.commit()
        row = db.query(ChargeableEntity).filter_by(id="svc-x").one()
        assert row.allocation_key == "Number of users"

    def test_nullable_default(self, db):
        _ce(db, "proj-x", "Project")
        db.commit()
        assert db.query(ChargeableEntity).filter_by(id="proj-x").one().allocation_key is None


class TestDistinctAllocationKeys:
    def test_dedupes_and_filters_empties(self, db):
        _ce(db, "svc-a", "InternalService", "Number of users")
        _ce(db, "svc-b", "InternalService", "Number of users")  # dup
        _ce(db, "svc-c", "InternalService", "Sales volume, EUR thousands")
        _ce(db, "svc-d", "InternalService", None)               # null filtered
        _ce(db, "svc-e", "InternalService", "")                 # empty filtered
        _ce(db, "proj-z", "Project", None)
        db.commit()
        keys = ums.list_allocation_keys(db)
        assert keys == ["Number of users", "Sales volume, EUR thousands"]
