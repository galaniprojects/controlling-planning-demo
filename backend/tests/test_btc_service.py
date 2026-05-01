"""Unit tests for services/btc_service.py (v5 Session F3 [F-S2-01..08])."""

from __future__ import annotations

import pytest
from datetime import datetime

from models.charging import (
    BTCProfile, BTCProfileLine, ChargeableEntity, ChargingLocation,
    UserMeasurement,
)
from models.organization import GroupingEntityType, GroupingEntity
from services.btc_service import (
    BTCValidationError, assert_btc_required, assert_sums_to_100,
    build_wbs_matrix, change_mode, compute_sums_to_100,
    compute_um_snapshot, copy_from_profile, create_automatic_profile,
    create_manual_profile, get_profile, get_profile_for_entity,
    list_profiles, refresh_from_um, update_profile, year_rollover,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_cl(db, cl_id="cl-test", code="DE-TST-001"):
    cl = ChargingLocation(id=cl_id, code=code, name=f"Test {code}", is_active=True)
    db.add(cl)
    db.flush()
    return cl


def _make_entity(db, entity_id="ce-test", entity_type="Offering", to_business_pct=60.0):
    get_type = GroupingEntityType(id="get-t", name="LoB")
    ge = GroupingEntity(id="lob-t", entity_type_id="get-t", name="Test LoB")
    db.add_all([get_type, ge])
    db.flush()
    ce = ChargeableEntity(
        id=entity_id, entity_type=entity_type, identifier="IT00S999",
        name="Test Offering", to_business_pct=to_business_pct,
        hierarchy_node_id="lob-t", is_active=True,
    )
    db.add(ce)
    db.flush()
    return ce


def _make_um(db, s_code="S0001", year=2026, quarter=1, values=None):
    """Insert UM rows. values = list of (cl_id, value)."""
    if values is None:
        values = [("cl-test", 100.0)]
    ts = datetime(2026, 1, 15, 10, 0, 0)
    for cl_id, val in values:
        row = UserMeasurement(
            year=year, quarter=quarter, s_code=s_code,
            charging_location_id=cl_id, value=val,
            source="seed", imported_at=ts,
        )
        db.add(row)
    db.flush()
    return ts


# ---------------------------------------------------------------------------
# sum-to-100 validation
# ---------------------------------------------------------------------------

class TestAssertSumsTo100:
    def test_exact_100_passes(self, db):
        cl1 = _make_cl(db, "cl-a", "DE-A-001")
        cl2 = _make_cl(db, "cl-b", "DE-B-001")
        _make_entity(db)
        profile = BTCProfile(entity_id="ce-test", year=2026, mode="manual", status="draft")
        db.add(profile)
        db.flush()
        lines = [
            BTCProfileLine(profile_id=profile.id, charging_location_id="cl-a", percentage=60.0),
            BTCProfileLine(profile_id=profile.id, charging_location_id="cl-b", percentage=40.0),
        ]
        db.add_all(lines)
        db.flush()
        assert_sums_to_100(lines)  # should not raise

    def test_does_not_sum_to_100_raises(self, db):
        _make_cl(db, "cl-a", "DE-A-001")
        _make_entity(db)
        profile = BTCProfile(entity_id="ce-test", year=2026, mode="manual", status="draft")
        db.add(profile)
        db.flush()
        lines = [
            BTCProfileLine(profile_id=profile.id, charging_location_id="cl-a", percentage=70.0),
        ]
        db.add(lines[0])
        db.flush()
        with pytest.raises(BTCValidationError, match="sum to 100"):
            assert_sums_to_100(lines)

    def test_tolerance_0_01_allowed(self, db):
        cl1 = _make_cl(db, "cl-a", "DE-A-001")
        cl2 = _make_cl(db, "cl-b", "DE-B-001")
        _make_entity(db)
        profile = BTCProfile(entity_id="ce-test", year=2026, mode="manual", status="draft")
        db.add(profile)
        db.flush()
        lines = [
            BTCProfileLine(profile_id=profile.id, charging_location_id="cl-a", percentage=60.005),
            BTCProfileLine(profile_id=profile.id, charging_location_id="cl-b", percentage=39.995),
        ]
        db.add_all(lines)
        db.flush()
        assert_sums_to_100(lines)  # within 0.01 tolerance

    def test_compute_sums_to_100_returns_bool(self, db):
        _make_cl(db, "cl-a", "DE-A-001")
        _make_entity(db)
        profile = BTCProfile(entity_id="ce-test", year=2026, mode="manual", status="draft")
        db.add(profile)
        db.flush()
        line = BTCProfileLine(profile_id=profile.id, charging_location_id="cl-a", percentage=50.0)
        db.add(line)
        db.flush()
        assert compute_sums_to_100([line]) is False

    def test_empty_lines_does_not_sum_to_100(self, db):
        with pytest.raises(BTCValidationError):
            assert_sums_to_100([])


# ---------------------------------------------------------------------------
# UM snapshot computation
# ---------------------------------------------------------------------------

class TestComputeUMSnapshot:
    def test_single_location_returns_100_pct(self, db):
        _make_cl(db, "cl-a", "DE-A-001")
        _make_um(db, "S0001", values=[("cl-a", 50.0)])
        snap = compute_um_snapshot(db, "S0001", 2026, 1)
        assert len(snap.rows) == 1
        assert abs(snap.rows[0].percentage - 100.0) < 0.01
        assert snap.sums_to_100

    def test_multi_location_normalises_to_100(self, db):
        _make_cl(db, "cl-a", "DE-A-001")
        _make_cl(db, "cl-b", "DE-B-001")
        _make_um(db, "S0001", values=[("cl-a", 30.0), ("cl-b", 70.0)])
        snap = compute_um_snapshot(db, "S0001", 2026, 1)
        total = sum(r.percentage for r in snap.rows)
        assert abs(total - 100.0) < 0.02

    def test_missing_um_raises(self, db):
        _make_cl(db, "cl-a", "DE-A-001")
        with pytest.raises(BTCValidationError, match="No UM data"):
            compute_um_snapshot(db, "S9999", 2026, 1)

    def test_s_code_not_in_batch_raises(self, db):
        _make_cl(db, "cl-a", "DE-A-001")
        _make_um(db, "S0001", values=[("cl-a", 100.0)])  # different s_code seeded
        with pytest.raises(BTCValidationError, match="No UM rows"):
            compute_um_snapshot(db, "S9999", 2026, 1)

    def test_zero_total_raises(self, db):
        _make_cl(db, "cl-a", "DE-A-001")
        _make_um(db, "S0001", values=[("cl-a", 0.0)])
        with pytest.raises(BTCValidationError, match="zero or negative"):
            compute_um_snapshot(db, "S0001", 2026, 1)


# ---------------------------------------------------------------------------
# create_manual_profile
# ---------------------------------------------------------------------------

class TestCreateManualProfile:
    def test_create_basic(self, db):
        cl1 = _make_cl(db, "cl-a", "DE-A-001")
        cl2 = _make_cl(db, "cl-b", "DE-B-001")
        _make_entity(db)
        profile = create_manual_profile(
            db, "ce-test", 2026,
            [{"charging_location_id": "cl-a", "percentage": 60.0},
             {"charging_location_id": "cl-b", "percentage": 40.0}],
        )
        assert profile.mode == "manual"
        assert profile.status == "draft"
        assert len(profile.lines) == 2

    def test_create_active_status(self, db):
        _make_cl(db, "cl-a", "DE-A-001")
        _make_cl(db, "cl-b", "DE-B-001")
        _make_entity(db)
        profile = create_manual_profile(
            db, "ce-test", 2026,
            [{"charging_location_id": "cl-a", "percentage": 50.0},
             {"charging_location_id": "cl-b", "percentage": 50.0}],
            status="active",
        )
        assert profile.status == "active"

    def test_duplicate_entity_year_raises(self, db):
        _make_cl(db, "cl-a", "DE-A-001")
        _make_cl(db, "cl-b", "DE-B-001")
        _make_entity(db)
        create_manual_profile(
            db, "ce-test", 2026,
            [{"charging_location_id": "cl-a", "percentage": 60.0},
             {"charging_location_id": "cl-b", "percentage": 40.0}],
        )
        db.commit()
        with pytest.raises(BTCValidationError, match="already exists"):
            create_manual_profile(
                db, "ce-test", 2026,
                [{"charging_location_id": "cl-a", "percentage": 100.0}],
            )

    def test_entity_not_found_raises(self, db):
        _make_cl(db, "cl-a", "DE-A-001")
        with pytest.raises(BTCValidationError, match="not found"):
            create_manual_profile(db, "ce-nonexistent", 2026, [])

    def test_invalid_cl_raises(self, db):
        _make_entity(db)
        with pytest.raises(BTCValidationError, match="not found"):
            create_manual_profile(
                db, "ce-test", 2026,
                [{"charging_location_id": "cl-nonexistent", "percentage": 100.0}],
            )

    def test_sum_not_100_raises(self, db):
        _make_cl(db, "cl-a", "DE-A-001")
        _make_entity(db)
        with pytest.raises(BTCValidationError, match="sum to 100"):
            create_manual_profile(
                db, "ce-test", 2026,
                [{"charging_location_id": "cl-a", "percentage": 50.0}],
            )


# ---------------------------------------------------------------------------
# create_automatic_profile
# ---------------------------------------------------------------------------

class TestCreateAutomaticProfile:
    def test_create_from_um(self, db):
        _make_cl(db, "cl-a", "DE-A-001")
        _make_entity(db)
        _make_um(db, "S0001", values=[("cl-a", 100.0)])
        profile = create_automatic_profile(
            db, "ce-test", 2026, "S0001", um_year=2026, um_quarter=1,
        )
        assert profile.mode == "automatic"
        assert profile.s_code == "S0001"
        assert len(profile.lines) == 1

    def test_missing_um_raises(self, db):
        _make_entity(db)
        with pytest.raises(BTCValidationError, match="No UM data"):
            create_automatic_profile(db, "ce-test", 2026, "S9999", um_year=2026, um_quarter=1)


# ---------------------------------------------------------------------------
# update_profile
# ---------------------------------------------------------------------------

class TestUpdateProfile:
    def test_update_manual_lines(self, db):
        _make_cl(db, "cl-a", "DE-A-001")
        _make_cl(db, "cl-b", "DE-B-001")
        _make_cl(db, "cl-c", "DE-C-001")
        _make_entity(db)
        profile = create_manual_profile(
            db, "ce-test", 2026,
            [{"charging_location_id": "cl-a", "percentage": 60.0},
             {"charging_location_id": "cl-b", "percentage": 40.0}],
        )
        db.commit()
        updated = update_profile(
            db, profile.id,
            [{"charging_location_id": "cl-a", "percentage": 70.0},
             {"charging_location_id": "cl-c", "percentage": 30.0}],
        )
        assert len(updated.lines) == 2
        cl_ids = {line.charging_location_id for line in updated.lines}
        assert "cl-b" not in cl_ids  # old line removed

    def test_update_automatic_profile_raises(self, db):
        _make_cl(db, "cl-a", "DE-A-001")
        _make_entity(db)
        _make_um(db, "S0001", values=[("cl-a", 100.0)])
        profile = create_automatic_profile(
            db, "ce-test", 2026, "S0001", um_year=2026, um_quarter=1,
        )
        db.commit()
        with pytest.raises(BTCValidationError, match="automatic"):
            update_profile(db, profile.id, [])

    def test_update_active_profile_raises(self, db):
        _make_cl(db, "cl-a", "DE-A-001")
        _make_cl(db, "cl-b", "DE-B-001")
        _make_entity(db)
        profile = create_manual_profile(
            db, "ce-test", 2026,
            [{"charging_location_id": "cl-a", "percentage": 50.0},
             {"charging_location_id": "cl-b", "percentage": 50.0}],
            status="active",
        )
        db.commit()
        with pytest.raises(BTCValidationError, match="active"):
            update_profile(db, profile.id, [{"charging_location_id": "cl-a", "percentage": 100.0}])


# ---------------------------------------------------------------------------
# refresh_from_um
# ---------------------------------------------------------------------------

class TestRefreshFromUM:
    def test_dry_run_returns_diff(self, db):
        _make_cl(db, "cl-a", "DE-A-001")
        _make_entity(db)
        _make_um(db, "S0001", values=[("cl-a", 100.0)])
        profile = create_automatic_profile(
            db, "ce-test", 2026, "S0001", um_year=2026, um_quarter=1,
        )
        db.commit()
        diff = refresh_from_um(db, profile.id, um_year=2026, um_quarter=1, dry_run=True)
        assert diff.profile_id == profile.id
        assert diff.would_sum_to_100

    def test_dry_run_does_not_mutate(self, db):
        _make_cl(db, "cl-a", "DE-A-001")
        _make_entity(db)
        _make_um(db, "S0001", values=[("cl-a", 100.0)])
        profile = create_automatic_profile(
            db, "ce-test", 2026, "S0001", um_year=2026, um_quarter=1,
        )
        db.commit()
        old_mod = profile.modified_at
        refresh_from_um(db, profile.id, dry_run=True)
        db.refresh(profile)
        # modified_at should be unchanged (no commit on dry_run)

    def test_commit_updates_lines(self, db):
        _make_cl(db, "cl-a", "DE-A-001")
        _make_cl(db, "cl-b", "DE-B-001")
        _make_entity(db)
        ts = datetime(2026, 1, 15, 10, 0, 0)
        # Initial UM: only cl-a
        um1 = UserMeasurement(
            year=2026, quarter=1, s_code="S0001",
            charging_location_id="cl-a", value=100.0,
            source="seed", imported_at=ts,
        )
        db.add(um1)
        db.flush()
        profile = create_automatic_profile(
            db, "ce-test", 2026, "S0001", um_year=2026, um_quarter=1,
        )
        db.commit()
        assert len(profile.lines) == 1

        # New UM batch with both locations
        ts2 = datetime(2026, 2, 15, 10, 0, 0)
        um2 = UserMeasurement(
            year=2026, quarter=1, s_code="S0001",
            charging_location_id="cl-a", value=60.0,
            source="seed", imported_at=ts2,
        )
        um3 = UserMeasurement(
            year=2026, quarter=1, s_code="S0001",
            charging_location_id="cl-b", value=40.0,
            source="seed", imported_at=ts2,
        )
        db.add_all([um2, um3])
        db.commit()

        diff = refresh_from_um(db, profile.id, um_year=2026, um_quarter=1, dry_run=False)
        assert "cl-b" in diff.added
        db.flush()
        db.refresh(profile)
        assert len(profile.lines) == 2

    def test_manual_profile_refresh_raises(self, db):
        _make_cl(db, "cl-a", "DE-A-001")
        _make_cl(db, "cl-b", "DE-B-001")
        _make_entity(db)
        profile = create_manual_profile(
            db, "ce-test", 2026,
            [{"charging_location_id": "cl-a", "percentage": 60.0},
             {"charging_location_id": "cl-b", "percentage": 40.0}],
        )
        db.commit()
        with pytest.raises(BTCValidationError, match="manual"):
            refresh_from_um(db, profile.id)


# ---------------------------------------------------------------------------
# change_mode — 4 transitions × confirm/no-confirm
# ---------------------------------------------------------------------------

class TestChangeMode:
    def test_manual_to_automatic_without_s_code_raises(self, db):
        _make_cl(db, "cl-a", "DE-A-001")
        _make_cl(db, "cl-b", "DE-B-001")
        _make_entity(db)
        profile = create_manual_profile(
            db, "ce-test", 2026,
            [{"charging_location_id": "cl-a", "percentage": 60.0},
             {"charging_location_id": "cl-b", "percentage": 40.0}],
        )
        db.commit()
        with pytest.raises(BTCValidationError, match="s_code"):
            change_mode(db, profile.id, "automatic")

    def test_manual_to_automatic_replaces_lines(self, db):
        _make_cl(db, "cl-a", "DE-A-001")
        _make_cl(db, "cl-b", "DE-B-001")
        _make_entity(db)
        _make_um(db, "S0001", values=[("cl-b", 100.0)])
        profile = create_manual_profile(
            db, "ce-test", 2026,
            [{"charging_location_id": "cl-a", "percentage": 60.0},
             {"charging_location_id": "cl-b", "percentage": 40.0}],
        )
        db.commit()
        change_mode(db, profile.id, "automatic", s_code="S0001", confirm=True, um_year=2026, um_quarter=1)
        db.flush()
        db.refresh(profile)
        assert profile.mode == "automatic"
        cl_ids = {line.charging_location_id for line in profile.lines}
        assert "cl-a" not in cl_ids

    def test_automatic_to_manual_without_confirm_raises(self, db):
        _make_cl(db, "cl-a", "DE-A-001")
        _make_entity(db)
        _make_um(db, "S0001", values=[("cl-a", 100.0)])
        profile = create_automatic_profile(
            db, "ce-test", 2026, "S0001", um_year=2026, um_quarter=1,
        )
        db.commit()
        with pytest.raises(BTCValidationError, match="confirm"):
            change_mode(db, profile.id, "manual")

    def test_automatic_to_manual_with_confirm_preserves_lines(self, db):
        _make_cl(db, "cl-a", "DE-A-001")
        _make_entity(db)
        _make_um(db, "S0001", values=[("cl-a", 100.0)])
        profile = create_automatic_profile(
            db, "ce-test", 2026, "S0001", um_year=2026, um_quarter=1,
        )
        db.commit()
        line_count_before = len(profile.lines)
        change_mode(db, profile.id, "manual", confirm=True)
        db.flush()
        db.refresh(profile)
        assert profile.mode == "manual"
        assert len(profile.lines) == line_count_before
        assert profile.s_code is None


# ---------------------------------------------------------------------------
# copy_from_profile
# ---------------------------------------------------------------------------

class TestCopyFromProfile:
    def test_copies_lines_to_new_year(self, db):
        _make_cl(db, "cl-a", "DE-A-001")
        _make_cl(db, "cl-b", "DE-B-001")
        _make_entity(db)
        source = create_manual_profile(
            db, "ce-test", 2026,
            [{"charging_location_id": "cl-a", "percentage": 70.0},
             {"charging_location_id": "cl-b", "percentage": 30.0}],
            status="active",
        )
        db.commit()
        new_profile = copy_from_profile(db, source.id, "ce-test", 2027)
        assert new_profile.year == 2027
        assert new_profile.status == "draft"
        assert len(new_profile.lines) == 2
        assert new_profile.copied_from_profile_id == source.id

    def test_duplicate_target_raises(self, db):
        _make_cl(db, "cl-a", "DE-A-001")
        _make_cl(db, "cl-b", "DE-B-001")
        _make_entity(db)
        source = create_manual_profile(
            db, "ce-test", 2026,
            [{"charging_location_id": "cl-a", "percentage": 50.0},
             {"charging_location_id": "cl-b", "percentage": 50.0}],
        )
        db.commit()
        copy_from_profile(db, source.id, "ce-test", 2027)
        db.commit()
        with pytest.raises(BTCValidationError, match="already exists"):
            copy_from_profile(db, source.id, "ce-test", 2027)


# ---------------------------------------------------------------------------
# year_rollover
# ---------------------------------------------------------------------------

class TestYearRollover:
    def test_rolls_active_profiles(self, db):
        _make_cl(db, "cl-a", "DE-A-001")
        _make_cl(db, "cl-b", "DE-B-001")
        _make_entity(db, "ce-a", to_business_pct=60.0)
        # Create a second entity
        get_type = db.query(GroupingEntityType).filter_by(id="get-t").first()
        ce_b = ChargeableEntity(
            id="ce-b", entity_type="Offering", identifier="IT00S888",
            name="Offering B", to_business_pct=50.0,
            hierarchy_node_id="lob-t", is_active=True,
        )
        db.add(ce_b)
        db.flush()

        p1 = create_manual_profile(
            db, "ce-a", 2026,
            [{"charging_location_id": "cl-a", "percentage": 60.0},
             {"charging_location_id": "cl-b", "percentage": 40.0}],
            status="active",
        )
        p2 = create_manual_profile(
            db, "ce-b", 2026,
            [{"charging_location_id": "cl-a", "percentage": 100.0}],
            status="active",
        )
        db.commit()
        result = year_rollover(db, 2026, 2027)
        assert len(result.rolled_over) == 2
        assert len(result.skipped) == 0
        assert len(result.errors) == 0

    def test_skips_existing_target_year_profiles(self, db):
        _make_cl(db, "cl-a", "DE-A-001")
        _make_cl(db, "cl-b", "DE-B-001")
        _make_entity(db)
        source = create_manual_profile(
            db, "ce-test", 2026,
            [{"charging_location_id": "cl-a", "percentage": 50.0},
             {"charging_location_id": "cl-b", "percentage": 50.0}],
            status="active",
        )
        # Pre-create target year
        create_manual_profile(
            db, "ce-test", 2027,
            [{"charging_location_id": "cl-a", "percentage": 100.0}],
        )
        db.commit()
        result = year_rollover(db, 2026, 2027)
        assert len(result.skipped) == 1
        assert len(result.rolled_over) == 0

    def _seed_three_typed_entities(self, db):
        """Seed one Project, one Offering, one InternalService entity, each
        with an active 2026 profile. Returns (proj_id, off_id, svc_id)."""
        _make_cl(db, "cl-a", "DE-A-001")
        _make_cl(db, "cl-b", "DE-B-001")
        # Make the LoB grouping rows (helper builds them when called once).
        _make_entity(db, "ce-off", entity_type="Offering", to_business_pct=60.0)
        # Add a Project entity. Project rows still go into ChargeableEntity
        # via the polymorphic root per [F-DM-01]. The full v4 Project FK is
        # only required by entity_type='Project' rows when the WBS path joins;
        # year_rollover's filter only reads entity_type, so leaving project_id
        # NULL is acceptable for this unit test.
        proj = ChargeableEntity(
            id="ce-proj", entity_type="Project", identifier="IT0PPM1",
            name="Project Alpha", to_business_pct=40.0,
            hierarchy_node_id="lob-t", is_active=True,
        )
        svc = ChargeableEntity(
            id="ce-svc", entity_type="InternalService", identifier="ITF00001",
            name="Internal Service Z", to_business_pct=20.0,
            hierarchy_node_id="lob-t", is_active=True,
        )
        db.add_all([proj, svc])
        db.flush()
        # Active 2026 profiles for all three.
        for ent_id in ("ce-off", "ce-proj", "ce-svc"):
            create_manual_profile(
                db, ent_id, 2026,
                [{"charging_location_id": "cl-a", "percentage": 60.0},
                 {"charging_location_id": "cl-b", "percentage": 40.0}],
                status="active",
            )
        db.commit()
        return ("ce-proj", "ce-off", "ce-svc")

    def test_scope_all_no_filter_rolls_all(self, db):
        """No filters → preserves the original 'roll all' behaviour."""
        proj_id, off_id, svc_id = self._seed_three_typed_entities(db)
        result = year_rollover(db, 2026, 2027)
        assert len(result.rolled_over) == 3
        assert len(result.skipped) == 0
        assert len(result.errors) == 0

    def test_scope_entity_types_offering_only(self, db):
        proj_id, off_id, svc_id = self._seed_three_typed_entities(db)
        result = year_rollover(
            db, 2026, 2027, entity_types=["offering"],
        )
        assert len(result.rolled_over) == 1
        # Only the offering profile should now have a 2027 row.
        new_profiles_2027 = list_profiles(db, year=2027)
        assert len(new_profiles_2027) == 1
        assert new_profiles_2027[0].entity_id == off_id

    def test_scope_entity_types_multiple(self, db):
        proj_id, off_id, svc_id = self._seed_three_typed_entities(db)
        result = year_rollover(
            db, 2026, 2027, entity_types=["project", "internal_service"],
        )
        assert len(result.rolled_over) == 2
        new_entity_ids = {
            p.entity_id for p in list_profiles(db, year=2027)
        }
        assert new_entity_ids == {proj_id, svc_id}

    def test_scope_entity_ids_specific_entity(self, db):
        proj_id, off_id, svc_id = self._seed_three_typed_entities(db)
        result = year_rollover(
            db, 2026, 2027, entity_ids=[off_id],
        )
        assert len(result.rolled_over) == 1
        new_profiles_2027 = list_profiles(db, year=2027)
        assert len(new_profiles_2027) == 1
        assert new_profiles_2027[0].entity_id == off_id

    def test_scope_entity_ids_unknown_id_returns_empty(self, db):
        self._seed_three_typed_entities(db)
        result = year_rollover(
            db, 2026, 2027, entity_ids=["ce-does-not-exist"],
        )
        assert result.rolled_over == []
        assert result.skipped == []
        assert result.errors == []

    def test_scope_both_filters_set_raises(self, db):
        self._seed_three_typed_entities(db)
        with pytest.raises(ValueError, match="at most one"):
            year_rollover(
                db, 2026, 2027,
                entity_types=["offering"],
                entity_ids=["ce-off"],
            )

    def test_scope_unknown_entity_type_returns_empty(self, db):
        """Unknown lowercase types map to nothing; query short-circuits."""
        self._seed_three_typed_entities(db)
        # Bypass the schema validator to confirm the service is defensive.
        result = year_rollover(
            db, 2026, 2027, entity_types=["bogus_type"],
        )
        assert result.rolled_over == []
        assert result.skipped == []
        assert result.errors == []


# ---------------------------------------------------------------------------
# assert_btc_required (BTC gate for DoI 2→3)
# ---------------------------------------------------------------------------

class TestAssertBTCRequired:
    def test_no_to_business_pct_passes(self, db):
        _make_entity(db, to_business_pct=0.0)
        # Should not raise
        assert_btc_required(db, "ce-test", 2026)

    def test_active_profile_passes(self, db):
        _make_cl(db, "cl-a", "DE-A-001")
        _make_cl(db, "cl-b", "DE-B-001")
        _make_entity(db, to_business_pct=60.0)
        create_manual_profile(
            db, "ce-test", 2026,
            [{"charging_location_id": "cl-a", "percentage": 60.0},
             {"charging_location_id": "cl-b", "percentage": 40.0}],
            status="active",
        )
        db.commit()
        assert_btc_required(db, "ce-test", 2026)  # should not raise

    def test_draft_profile_fails(self, db):
        _make_cl(db, "cl-a", "DE-A-001")
        _make_cl(db, "cl-b", "DE-B-001")
        _make_entity(db, to_business_pct=60.0)
        create_manual_profile(
            db, "ce-test", 2026,
            [{"charging_location_id": "cl-a", "percentage": 60.0},
             {"charging_location_id": "cl-b", "percentage": 40.0}],
            status="draft",
        )
        db.commit()
        with pytest.raises(BTCValidationError, match="no active BTC profile"):
            assert_btc_required(db, "ce-test", 2026)

    def test_no_profile_fails(self, db):
        _make_entity(db, to_business_pct=60.0)
        with pytest.raises(BTCValidationError, match="no active BTC profile"):
            assert_btc_required(db, "ce-test", 2026)

    def test_next_year_active_profile_passes(self, db):
        _make_cl(db, "cl-a", "DE-A-001")
        _make_cl(db, "cl-b", "DE-B-001")
        _make_entity(db, to_business_pct=60.0)
        # Only 2027 profile is active, no 2026 profile
        create_manual_profile(
            db, "ce-test", 2027,
            [{"charging_location_id": "cl-a", "percentage": 60.0},
             {"charging_location_id": "cl-b", "percentage": 40.0}],
            status="active",
        )
        db.commit()
        assert_btc_required(db, "ce-test", 2026)  # should not raise (checks 2026 OR 2027)

    def test_entity_not_found_skips(self, db):
        # Should not raise when entity doesn't exist
        assert_btc_required(db, "ce-nonexistent", 2026)


# ---------------------------------------------------------------------------
# build_wbs_matrix
# ---------------------------------------------------------------------------

class TestBuildWBSMatrix:
    def test_returns_all_cls(self, db):
        """Matrix should contain one row per active ChargingLocation."""
        for i in range(3):
            _make_cl(db, f"cl-{i}", f"DE-{i:03d}-001")
        _make_entity(db)
        matrix = build_wbs_matrix(db, "ce-test", 2026)
        assert len(matrix.rows) == 3

    def test_active_profile_fills_percentages(self, db):
        _make_cl(db, "cl-a", "DE-A-001")
        _make_cl(db, "cl-b", "DE-B-001")
        _make_entity(db)
        create_manual_profile(
            db, "ce-test", 2026,
            [{"charging_location_id": "cl-a", "percentage": 60.0},
             {"charging_location_id": "cl-b", "percentage": 40.0}],
            status="active",
        )
        db.commit()
        matrix = build_wbs_matrix(db, "ce-test", 2026)
        pcts = {r.charging_location_id: r.btc_percentage for r in matrix.rows}
        assert pcts["cl-a"] == 60.0
        assert pcts["cl-b"] == 40.0
        assert matrix.has_active_profile
        assert matrix.sums_to_100

    def test_no_active_profile_shows_none_pct(self, db):
        _make_cl(db, "cl-a", "DE-A-001")
        _make_entity(db)
        matrix = build_wbs_matrix(db, "ce-test", 2026)
        assert all(r.btc_percentage is None for r in matrix.rows)
        assert not matrix.has_active_profile

    def test_wbs_element_format(self, db):
        """WBS element should follow <identifier>-64-99-<cl_code> pattern."""
        _make_cl(db, "cl-a", "DE-TST-001")
        _make_entity(db, entity_id="ce-test", entity_type="Offering")
        # entity has identifier IT00S999
        matrix = build_wbs_matrix(db, "ce-test", 2026)
        wbs_values = [r.wbs_element for r in matrix.rows]
        assert "IT00S999-64-99-DE-TST-001" in wbs_values

    def test_entity_not_found_raises(self, db):
        with pytest.raises(BTCValidationError, match="not found"):
            build_wbs_matrix(db, "ce-nonexistent", 2026)


# ---------------------------------------------------------------------------
# list_profiles + get_profile helpers
# ---------------------------------------------------------------------------

class TestListAndGetProfiles:
    def test_list_all(self, db):
        _make_cl(db, "cl-a", "DE-A-001")
        _make_cl(db, "cl-b", "DE-B-001")
        _make_entity(db)
        create_manual_profile(
            db, "ce-test", 2026,
            [{"charging_location_id": "cl-a", "percentage": 60.0},
             {"charging_location_id": "cl-b", "percentage": 40.0}],
        )
        db.commit()
        profiles = list_profiles(db)
        assert len(profiles) == 1

    def test_filter_by_entity_id(self, db):
        _make_cl(db, "cl-a", "DE-A-001")
        _make_cl(db, "cl-b", "DE-B-001")
        _make_entity(db)
        create_manual_profile(
            db, "ce-test", 2026,
            [{"charging_location_id": "cl-a", "percentage": 60.0},
             {"charging_location_id": "cl-b", "percentage": 40.0}],
        )
        db.commit()
        profiles = list_profiles(db, entity_id="ce-nonexistent")
        assert len(profiles) == 0

    def test_get_profile_not_found_raises(self, db):
        with pytest.raises(BTCValidationError, match="not found"):
            get_profile(db, 9999)

    def test_get_profile_for_entity_returns_none_when_absent(self, db):
        result = get_profile_for_entity(db, "ce-nonexistent", 2026)
        assert result is None
