"""Unit tests for services/user_measurement_service.py — Charging/UM rework
cluster FD-1. Covers the authored-version state machine, integer validation,
per-cell audit, copy-from lineage, and active-version resolution.

Tags: [F-UM-01] integer values, [F-UM-02] draft/active immutability,
[F-UM-03] authoring origins, [F-UM-04] provenance, [F-UM-05] per-cell audit.
"""

from __future__ import annotations

import pytest

from models.charging import UMVersion, UserMeasurement
from models.system import AuditLog
from services import user_measurement_service as ums

ACTOR = "p-controller"


def _cl(db, cl_id="cl-a", code="DE-A-001"):
    from models.charging import ChargingLocation
    db.add(ChargingLocation(id=cl_id, code=code, name=cl_id))
    db.flush()


# ---------------------------------------------------------------------------
# [F-UM-01] integer validation
# ---------------------------------------------------------------------------

class TestIntegerValidation:
    def test_coerce_accepts_int_and_integral_float(self):
        assert ums.coerce_um_int(42, context="x") == 42
        assert ums.coerce_um_int("42", context="x") == 42
        assert ums.coerce_um_int(42.0, context="x") == 42

    def test_coerce_rejects_fractional(self):
        with pytest.raises(ums.UMValidationError, match="must be an integer"):
            ums.coerce_um_int(42.5, context="cell")

    def test_coerce_rejects_non_numeric(self):
        with pytest.raises(ums.UMValidationError, match="must be an integer"):
            ums.coerce_um_int("abc", context="cell")

    def test_set_cell_rejects_non_integer_at_field(self, db):
        _cl(db)
        v = ums.create_draft(db, 2027, 1)
        with pytest.raises(ums.UMValidationError, match="must be an integer"):
            ums.set_cell(db, v.id, "S1", "cl-a", 12.5, actor_person_id=ACTOR)

    def test_csv_rejects_non_integer_row(self, db):
        _cl(db)
        csv_text = (
            "year,quarter,s_code,charging_location_code,value\n"
            "2027,1,S1,DE-A-001,10\n"
            "2027,1,S1,DE-A-001,3.7\n"
        )
        v, parsed = ums.create_draft_from_csv(db, csv_text, created_by_person_id=ACTOR)
        assert parsed.row_count == 1  # only the integer row
        assert any("must be an integer" in e for e in parsed.parse_errors)


# ---------------------------------------------------------------------------
# [F-UM-02] draft/active state machine + immutability
# ---------------------------------------------------------------------------

class TestStateMachine:
    def test_create_draft_is_draft(self, db):
        v = ums.create_draft(db, 2027, 2)
        assert v.status == "draft"
        assert v.activated_at is None
        assert v.source == "manual"

    def test_activate_freezes(self, db):
        v = ums.create_draft(db, 2027, 2)
        ums.activate_version(db, v.id, actor_person_id=ACTOR)
        assert v.status == "active"
        assert v.activated_at is not None

    def test_cannot_mutate_active(self, db):
        _cl(db)
        v = ums.create_draft(db, 2027, 2)
        ums.set_cell(db, v.id, "S1", "cl-a", 10, actor_person_id=ACTOR)
        ums.activate_version(db, v.id, actor_person_id=ACTOR)
        with pytest.raises(ums.UMValidationError, match="immutable"):
            ums.set_cell(db, v.id, "S1", "cl-a", 20, actor_person_id=ACTOR)

    def test_double_activate_raises(self, db):
        v = ums.create_draft(db, 2027, 2)
        ums.activate_version(db, v.id, actor_person_id=ACTOR)
        with pytest.raises(ums.UMValidationError, match="already active"):
            ums.activate_version(db, v.id, actor_person_id=ACTOR)

    def test_reentry_creates_new_draft_history_intact(self, db):
        _cl(db)
        v1 = ums.create_draft(db, 2027, 3)
        ums.set_cell(db, v1.id, "S1", "cl-a", 10, actor_person_id=ACTOR)
        ums.activate_version(db, v1.id, actor_person_id=ACTOR)
        # Re-entry: a new draft, the active one stays intact.
        v2 = ums.copy_from_version(db, v1.id, created_by_person_id=ACTOR)
        assert v2.status == "draft"
        v1_reloaded = ums.get_version(db, v1.id)
        assert v1_reloaded.status == "active"
        assert len(ums.list_cells(db, v1.id)) == 1


# ---------------------------------------------------------------------------
# [F-UM-03] authoring origins + sparse semantics
# ---------------------------------------------------------------------------

class TestAuthoring:
    def test_set_cell_zero_deletes(self, db):
        _cl(db)
        v = ums.create_draft(db, 2027, 4)
        ums.set_cell(db, v.id, "S1", "cl-a", 10, actor_person_id=ACTOR)
        assert len(ums.list_cells(db, v.id)) == 1
        ums.set_cell(db, v.id, "S1", "cl-a", 0, actor_person_id=ACTOR)
        assert len(ums.list_cells(db, v.id)) == 0

    def test_copy_from_version_clones_cells_and_lineage(self, db):
        _cl(db, "cl-a", "DE-A-001")
        _cl(db, "cl-b", "DE-B-001")
        src = ums.create_draft(db, 2028, 1)
        ums.set_cell(db, src.id, "S1", "cl-a", 7, actor_person_id=ACTOR)
        ums.set_cell(db, src.id, "S1", "cl-b", 3, actor_person_id=ACTOR)
        ums.activate_version(db, src.id, actor_person_id=ACTOR)
        copy = ums.copy_from_version(db, src.id, created_by_person_id=ACTOR)
        assert copy.source == "copy"
        assert copy.copied_from_version_id == src.id
        assert copy.year == src.year and copy.quarter == src.quarter
        assert len(ums.list_cells(db, copy.id)) == 2

    def test_create_draft_from_csv_does_not_activate(self, db):
        _cl(db)
        csv_text = (
            "year,quarter,s_code,charging_location_code,value\n"
            "2029,1,S1,DE-A-001,5\n"
        )
        v, parsed = ums.create_draft_from_csv(db, csv_text, created_by_person_id=ACTOR)
        assert v.status == "draft"
        assert v.source == "csv_upload"
        assert parsed.row_count == 1


# ---------------------------------------------------------------------------
# [F-UM-04] provenance constraint
# ---------------------------------------------------------------------------

class TestProvenance:
    def test_invalid_source_rejected(self, db):
        with pytest.raises(ums.UMValidationError, match="invalid UM source"):
            ums.create_draft(db, 2027, 1, source="sap_api")

    def test_sap_api_rejected_at_db_check(self, db):
        # The model CHECK constraint is the backstop.
        from sqlalchemy.exc import IntegrityError
        db.add(UMVersion(year=2027, quarter=1, status="draft", source="sap_api"))
        with pytest.raises(IntegrityError):
            db.flush()
        db.rollback()


# ---------------------------------------------------------------------------
# [F-UM-05] per-cell audit
# ---------------------------------------------------------------------------

class TestPerCellAudit:
    def _um_audits(self, db):
        return (
            db.query(AuditLog)
            .filter(AuditLog.entity_type == "user_measurement_cell")
            .all()
        )

    def test_set_cell_writes_audit_with_before_after(self, db):
        _cl(db)
        v = ums.create_draft(db, 2030, 1)
        ums.set_cell(db, v.id, "S1", "cl-a", 10, actor_person_id=ACTOR)
        ums.set_cell(db, v.id, "S1", "cl-a", 25, actor_person_id=ACTOR)
        rows = self._um_audits(db)
        assert len(rows) == 2
        create, update = rows
        assert create.action == "create"
        assert create.old_value is None and create.new_value == "10"
        assert create.field_changed == "S1:cl-a"
        assert create.user_person_id == ACTOR
        assert create.category == "master_data"
        assert update.action == "update"
        assert update.old_value == "10" and update.new_value == "25"

    def test_delete_writes_deactivate_audit(self, db):
        _cl(db)
        v = ums.create_draft(db, 2030, 2)
        ums.set_cell(db, v.id, "S1", "cl-a", 10, actor_person_id=ACTOR)
        ums.delete_cell(db, v.id, "S1", "cl-a", actor_person_id=ACTOR)
        rows = self._um_audits(db)
        assert rows[-1].action == "deactivate"
        assert rows[-1].old_value == "10" and rows[-1].new_value is None

    def test_no_op_set_writes_no_audit(self, db):
        _cl(db)
        v = ums.create_draft(db, 2030, 3)
        ums.set_cell(db, v.id, "S1", "cl-a", 10, actor_person_id=ACTOR)
        ums.set_cell(db, v.id, "S1", "cl-a", 10, actor_person_id=ACTOR)  # no change
        assert len(self._um_audits(db)) == 1

    def test_activation_writes_single_version_audit_not_per_cell(self, db):
        _cl(db, "cl-a", "DE-A-001")
        _cl(db, "cl-b", "DE-B-001")
        v = ums.create_draft(db, 2030, 4)
        ums.set_cell(db, v.id, "S1", "cl-a", 1, actor_person_id=ACTOR)
        ums.set_cell(db, v.id, "S1", "cl-b", 2, actor_person_id=ACTOR)
        ums.activate_version(db, v.id, actor_person_id=ACTOR)
        version_audits = (
            db.query(AuditLog)
            .filter(
                AuditLog.entity_type == "user_measurement",
                AuditLog.action == "activate",
            )
            .all()
        )
        assert len(version_audits) == 1
        assert version_audits[0].old_value == "draft"
        assert version_audits[0].new_value == "active"


# ---------------------------------------------------------------------------
# Active-version resolution
# ---------------------------------------------------------------------------

class TestResolution:
    def test_get_active_version_latest_activated(self, db):
        v1 = ums.create_draft(db, 2031, 1, source="seed")
        ums.activate_version(db, v1.id, actor_person_id=ACTOR)
        v2 = ums.create_draft(db, 2031, 1, source="seed")
        ums.activate_version(db, v2.id, actor_person_id=ACTOR)
        resolved = ums.get_active_version(db, 2031, 1)
        assert resolved.id == v2.id

    def test_draft_not_resolved(self, db):
        ums.create_draft(db, 2031, 2)
        assert ums.get_active_version(db, 2031, 2) is None

    def test_or_raise(self, db):
        with pytest.raises(ums.UMValidationError, match="No active UM version"):
            ums.get_active_version_or_raise(db, 2031, 3)
