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
    BTCValidationError, activate_profile, assert_btc_required,
    assert_sums_to_100, build_wbs_matrix, change_mode, compute_sums_to_100,
    compute_um_snapshot, copy_from_profile, create_automatic_profile,
    create_manual_profile, get_frozen_um_values, get_profile,
    get_profile_for_entity, list_profiles, load_active_um_versions,
    refresh_from_um, update_profile, year_rollover,
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


def _make_um(db, s_code="S0001", year=2026, quarter=1, values=None,
             *, status="active", activated_at=None):
    """Create an active UMVersion + integer cells; return its activated_at.

    Charging/UM rework: a version replaces the (year,quarter,imported_at)
    batch. Zero-valued entries are skipped (sparse storage / ck_um_cell_nonzero
    invariant) — an s_code with only zero values therefore has no cells, which
    ``compute_um_snapshot`` reports as "no UM rows" (the new equivalent of the
    old zero-total path). ``compute_um_snapshot`` resolves the active version
    and reports ``activated_at`` as the snapshot's ``imported_at``.
    """
    from models.charging import UMVersion

    if values is None:
        values = [("cl-test", 100.0)]
    ts = activated_at or datetime(2026, 1, 15, 10, 0, 0)
    version = (
        db.query(UMVersion)
        .filter_by(year=year, quarter=quarter, status=status)
        .first()
    )
    if version is None:
        version = UMVersion(
            year=year, quarter=quarter, status=status, source="seed",
            activated_at=ts if status == "active" else None,
        )
        db.add(version)
        db.flush()
    for cl_id, val in values:
        if int(val) == 0:
            continue
        db.add(
            UserMeasurement(
                version_id=version.id, s_code=s_code,
                charging_location_id=cl_id, value=int(val),
            )
        )
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
        with pytest.raises(BTCValidationError, match="No active UM version"):
            compute_um_snapshot(db, "S9999", 2026, 1)

    def test_s_code_not_in_batch_raises(self, db):
        _make_cl(db, "cl-a", "DE-A-001")
        _make_um(db, "S0001", values=[("cl-a", 100.0)])  # different s_code seeded
        with pytest.raises(BTCValidationError, match="No UM rows"):
            compute_um_snapshot(db, "S9999", 2026, 1)

    def test_zero_values_skipped_yield_no_rows(self, db):
        # Sparse storage: a zero-valued cell is never stored
        # (ck_um_cell_nonzero), so an s_code with only zeros has no rows —
        # the new equivalent of the old zero-total path.
        _make_cl(db, "cl-a", "DE-A-001")
        _make_um(db, "S0001", values=[("cl-a", 0.0)])
        with pytest.raises(BTCValidationError, match="No UM rows"):
            compute_um_snapshot(db, "S0001", 2026, 1)


# ---------------------------------------------------------------------------
# get_frozen_um_values — FD-5 [F-DSH-01] dashboard triple-display
# ---------------------------------------------------------------------------

class TestGetFrozenUMValues:
    """Raw UM integers behind the derived %, read from the frozen version."""

    def test_returns_raw_values_keyed_by_cl(self, db):
        _make_cl(db, "cl-a", "DE-A-001")
        _make_cl(db, "cl-b", "DE-B-001")
        ts = _make_um(db, "S0001", values=[("cl-a", 60.0), ("cl-b", 40.0)])
        assert get_frozen_um_values(db, "S0001", ts) == {"cl-a": 60, "cl-b": 40}

    def test_manual_profile_inputs_return_empty(self, db):
        # Manual profiles carry neither an s_code nor a snapshot timestamp.
        assert get_frozen_um_values(db, None, None) == {}
        assert get_frozen_um_values(db, "S0001", None) == {}
        assert get_frozen_um_values(db, None, datetime(2026, 1, 15, 10, 0)) == {}

    def test_unresolvable_snapshot_returns_empty(self, db):
        # A timestamp matching no version's activated_at degrades gracefully.
        _make_cl(db, "cl-a", "DE-A-001")
        _make_um(db, "S0001", values=[("cl-a", 100.0)])
        assert get_frozen_um_values(db, "S0001", datetime(2020, 1, 1)) == {}

    def test_reads_frozen_version_not_latest(self, db):
        # Two active versions; the snapshot timestamp pins the frozen one so
        # the raw integers always agree with the snapshotted percentages.
        _make_cl(db, "cl-a", "DE-A-001")
        old_ts = datetime(2025, 6, 1, 9, 0)
        new_ts = datetime(2026, 3, 1, 9, 0)
        _make_um(db, "S0001", year=2026, quarter=1,
                 values=[("cl-a", 11.0)], activated_at=old_ts)
        _make_um(db, "S0001", year=2026, quarter=2,
                 values=[("cl-a", 99.0)], activated_at=new_ts)
        assert get_frozen_um_values(db, "S0001", old_ts) == {"cl-a": 11}
        assert get_frozen_um_values(db, "S0001", new_ts) == {"cl-a": 99}

    def test_filters_to_requested_s_code(self, db):
        _make_cl(db, "cl-a", "DE-A-001")
        ts = _make_um(db, "S0001", values=[("cl-a", 50.0)])
        _make_um(db, "S0002", values=[("cl-a", 70.0)])  # same version, other s_code
        assert get_frozen_um_values(db, "S0001", ts) == {"cl-a": 50}
        assert get_frozen_um_values(db, "S0002", ts) == {"cl-a": 70}

    def test_first_match_on_shared_activated_at(self, db):
        # A UMVersion's identity is (year, quarter, activated_at); resolution
        # here keys on activated_at alone. Two versions sharing an activated_at
        # is unreachable in practice (utcnow precision) — pin first-match-wins
        # so the behaviour is intentional, not incidental: the result is one
        # version's cells, never a merge of both, and never a crash.
        _make_cl(db, "cl-a", "DE-A-001")
        shared = datetime(2026, 2, 2, 8, 0)
        _make_um(db, "S0001", year=2026, quarter=1,
                 values=[("cl-a", 10.0)], activated_at=shared)
        _make_um(db, "S0001", year=2026, quarter=2,
                 values=[("cl-a", 20.0)], activated_at=shared)
        result = get_frozen_um_values(db, "S0001", shared)
        # First-inserted version (q1) wins; cells are not merged.
        assert result == {"cl-a": 10}

    def test_accepts_prefetched_versions(self, db):
        # A batch caller (list_btc_profiles) passes a pre-loaded version list
        # so the frozen-version lookup is not re-queried per profile. The
        # result must match the self-query path; an empty list resolves nothing.
        _make_cl(db, "cl-a", "DE-A-001")
        ts = _make_um(db, "S0001", values=[("cl-a", 80.0)])
        prefetched = load_active_um_versions(db)
        assert get_frozen_um_values(
            db, "S0001", ts, versions=prefetched,
        ) == {"cl-a": 80}
        assert get_frozen_um_values(db, "S0001", ts, versions=[]) == {}


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
        with pytest.raises(BTCValidationError, match="No active UM version"):
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
        # Initial active version: only cl-a
        _make_um(db, "S0001", values=[("cl-a", 100.0)])
        profile = create_automatic_profile(
            db, "ce-test", 2026, "S0001", um_year=2026, um_quarter=1,
        )
        db.commit()
        assert len(profile.lines) == 1

        # Re-consolidation: the active version now also carries cl-b. (The
        # test mutates the active version directly to simulate a new authored
        # consolidation; the service guard against editing an active version
        # is exercised separately in test_user_measurement_service.)
        from services.user_measurement_service import get_active_version
        version = get_active_version(db, 2026, 1)
        um_a = (
            db.query(UserMeasurement)
            .filter_by(version_id=version.id, s_code="S0001",
                       charging_location_id="cl-a")
            .first()
        )
        um_a.value = 60
        db.add(
            UserMeasurement(
                version_id=version.id, s_code="S0001",
                charging_location_id="cl-b", value=40,
            )
        )
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
        # Active 2026 profiles for all three. Construct the InternalService
        # profile directly (FD-4 [F-S2-01] forbids manual create on
        # InternalService); year_rollover semantics don't care how the source
        # profile was built, only that it exists with status='active'.
        for ent_id in ("ce-off", "ce-proj"):
            create_manual_profile(
                db, ent_id, 2026,
                [{"charging_location_id": "cl-a", "percentage": 60.0},
                 {"charging_location_id": "cl-b", "percentage": 40.0}],
                status="active",
            )
        svc_profile = BTCProfile(
            entity_id="ce-svc", year=2026, mode="manual", status="active",
        )
        db.add(svc_profile)
        db.flush()
        db.add_all([
            BTCProfileLine(
                profile_id=svc_profile.id,
                charging_location_id="cl-a", percentage=60.0,
            ),
            BTCProfileLine(
                profile_id=svc_profile.id,
                charging_location_id="cl-b", percentage=40.0,
            ),
        ])
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


# ---------------------------------------------------------------------------
# Regression: seed.sql TEXT format (no microseconds)
# ---------------------------------------------------------------------------

class TestComputeUmSnapshotVersionResolution:
    """Charging/UM rework: ``compute_um_snapshot`` resolves the active UM
    version for (year, quarter) — the latest-activated one — and never a
    draft. This supersedes the old ``max(imported_at)`` seed-TEXT-timestamp
    regression (PR #99): version_id resolution removed that fragility
    entirely. The institutional knowledge preserved here is the resolution
    *rule*, not the timestamp-binding workaround.
    """

    def test_resolves_latest_activated_active_version(self, db):
        from models.charging import UMVersion

        _make_cl(db, "cl-a", "DE-A-001")
        _make_cl(db, "cl-b", "DE-B-001")
        # An older active version (cl-a only) and a newer active version
        # (cl-b only) for the same (year, quarter).
        old_v = UMVersion(
            year=2026, quarter=1, status="active", source="seed",
            activated_at=datetime(2026, 1, 15, 10, 0, 0),
        )
        db.add(old_v)
        db.flush()
        db.add(UserMeasurement(
            version_id=old_v.id, s_code="S0001",
            charging_location_id="cl-a", value=100,
        ))
        new_v = UMVersion(
            year=2026, quarter=1, status="active", source="seed",
            activated_at=datetime(2026, 2, 20, 9, 0, 0),
        )
        db.add(new_v)
        db.flush()
        db.add(UserMeasurement(
            version_id=new_v.id, s_code="S0001",
            charging_location_id="cl-b", value=100,
        ))
        db.commit()

        snap = compute_um_snapshot(db, "S0001", 2026, 1)
        assert len(snap.rows) == 1
        assert snap.rows[0].charging_location_id == "cl-b"
        assert snap.imported_at == datetime(2026, 2, 20, 9, 0, 0)

    def test_draft_version_never_resolved(self, db):
        from models.charging import UMVersion

        _make_cl(db, "cl-a", "DE-A-001")
        draft = UMVersion(
            year=2026, quarter=1, status="draft", source="seed",
        )
        db.add(draft)
        db.flush()
        db.add(UserMeasurement(
            version_id=draft.id, s_code="S0001",
            charging_location_id="cl-a", value=100,
        ))
        db.commit()
        with pytest.raises(BTCValidationError, match="No active UM version"):
            compute_um_snapshot(db, "S0001", 2026, 1)


# ---------------------------------------------------------------------------
# FD-4: InternalService manual-mode gate per [F-S2-01]
# ---------------------------------------------------------------------------

class TestInternalServiceGate:
    """InternalService entities cannot use manual mode — BTC is UM-derived only."""

    def _make_internal_service(self, db, entity_id="ce-svc"):
        get_type = GroupingEntityType(id="get-t", name="LoB")
        ge = GroupingEntity(id="lob-t", entity_type_id="get-t", name="Test LoB")
        db.add_all([get_type, ge])
        db.flush()
        ce = ChargeableEntity(
            id=entity_id, entity_type="InternalService", identifier="ITF20099",
            name="Test Internal Service", to_business_pct=0.0,
            hierarchy_node_id="lob-t", is_active=True,
        )
        db.add(ce)
        db.flush()
        return ce

    def test_create_manual_for_internal_service_raises(self, db):
        _make_cl(db, "cl-a", "DE-A-001")
        self._make_internal_service(db)
        with pytest.raises(BTCValidationError, match="InternalService"):
            create_manual_profile(
                db, "ce-svc", 2026,
                [{"charging_location_id": "cl-a", "percentage": 100.0}],
            )

    def test_change_mode_on_internal_service_raises(self, db):
        """An InternalService profile (constructed directly) cannot change mode."""
        _make_cl(db, "cl-a", "DE-A-001")
        self._make_internal_service(db)
        # Construct an automatic profile directly (bypass the create function).
        profile = BTCProfile(
            entity_id="ce-svc", year=2026, mode="automatic",
            s_code="S301", status="draft",
        )
        db.add(profile)
        db.flush()
        db.add(BTCProfileLine(
            profile_id=profile.id,
            charging_location_id="cl-a", percentage=100.0,
        ))
        db.commit()
        with pytest.raises(BTCValidationError, match="InternalService"):
            change_mode(db, profile.id, "manual", confirm=True)

    def test_create_automatic_for_internal_service_succeeds(self, db):
        """Automatic mode remains the supported path for InternalService."""
        _make_cl(db, "cl-a", "DE-A-001")
        self._make_internal_service(db)
        _make_um(db, "S301", year=2026, quarter=1, values=[("cl-a", 100.0)])
        profile = create_automatic_profile(
            db, "ce-svc", 2026, "S301", um_year=2026, um_quarter=1,
        )
        assert profile.mode == "automatic"
        assert profile.s_code == "S301"


# ---------------------------------------------------------------------------
# FD-4: activate_profile — snapshot freezes at activate-time
# ---------------------------------------------------------------------------

class TestActivateProfile:
    def test_activate_manual_draft_flips_status(self, db):
        _make_cl(db, "cl-a", "DE-A-001")
        _make_entity(db)
        profile = create_manual_profile(
            db, "ce-test", 2026,
            [{"charging_location_id": "cl-a", "percentage": 100.0}],
        )
        assert profile.status == "draft"
        activate_profile(db, profile.id)
        assert profile.status == "active"

    def test_activate_manual_with_bad_sum_raises(self, db):
        """Manual profile lines must still sum to 100 at activate time."""
        _make_cl(db, "cl-a", "DE-A-001")
        _make_cl(db, "cl-b", "DE-B-001")
        _make_entity(db)
        profile = create_manual_profile(
            db, "ce-test", 2026,
            [{"charging_location_id": "cl-a", "percentage": 60.0},
             {"charging_location_id": "cl-b", "percentage": 40.0}],
        )
        # Mutate a line after creation to break the invariant.
        profile.lines[0].percentage = 50.0
        db.flush()
        with pytest.raises(BTCValidationError, match="sum"):
            activate_profile(db, profile.id)

    def test_activate_automatic_freezes_against_current_um(self, db):
        """Activate freezes against the UM version active at activate-time.

        Draft created when UM v1 was the active version; we then activate
        UM v2 between draft create and profile activate, and confirm that
        the activated profile reflects UM v2 (lines + um_snapshot_at).
        """
        from models.charging import UMVersion

        _make_cl(db, "cl-a", "DE-A-001")
        _make_cl(db, "cl-b", "DE-B-001")
        _make_entity(db)
        # UM v1 (active at draft-create time) — single location cl-a.
        v1 = UMVersion(
            year=2026, quarter=1, status="active", source="seed",
            activated_at=datetime(2026, 1, 10, 9, 0, 0),
        )
        db.add(v1)
        db.flush()
        db.add(UserMeasurement(
            version_id=v1.id, s_code="S0001",
            charging_location_id="cl-a", value=100,
        ))
        db.flush()
        # Draft profile created — freezes against v1 lines.
        profile = create_automatic_profile(
            db, "ce-test", 2026, "S0001",
            um_year=2026, um_quarter=1, status="draft",
        )
        assert profile.um_snapshot_at == datetime(2026, 1, 10, 9, 0, 0)
        assert len(profile.lines) == 1
        assert profile.lines[0].charging_location_id == "cl-a"
        # UM v2 takes over — both stay status='active' (FD-1: resolution
        # picks the latest activated_at). Adds cl-b alongside cl-a so the
        # s_code has rows in both locations.
        v2 = UMVersion(
            year=2026, quarter=1, status="active", source="csv_upload",
            activated_at=datetime(2026, 3, 15, 9, 0, 0),
        )
        db.add(v2)
        db.flush()
        db.add_all([
            UserMeasurement(
                version_id=v2.id, s_code="S0001",
                charging_location_id="cl-a", value=50,
            ),
            UserMeasurement(
                version_id=v2.id, s_code="S0001",
                charging_location_id="cl-b", value=50,
            ),
        ])
        db.flush()
        # Activate now — should re-snapshot against v2.
        activated = activate_profile(db, profile.id, um_year=2026, um_quarter=1)
        db.flush()
        db.expire(activated)
        assert activated.status == "active"
        assert activated.um_snapshot_at == datetime(2026, 3, 15, 9, 0, 0)
        cl_ids = {line.charging_location_id for line in activated.lines}
        assert cl_ids == {"cl-a", "cl-b"}

    def test_activate_already_active_raises(self, db):
        _make_cl(db, "cl-a", "DE-A-001")
        _make_entity(db)
        profile = create_manual_profile(
            db, "ce-test", 2026,
            [{"charging_location_id": "cl-a", "percentage": 100.0}],
            status="active",
        )
        with pytest.raises(BTCValidationError, match="already active"):
            activate_profile(db, profile.id)


# ---------------------------------------------------------------------------
# FD-4: refresh_from_um — reframed as "advance UM snapshot deliberately"
# ---------------------------------------------------------------------------

class TestRefreshAdvancesSnapshot:
    def test_advance_moves_snapshot_watermark(self, db):
        """Activated profile + newer UM version: refresh advances the snapshot."""
        from models.charging import UMVersion

        _make_cl(db, "cl-a", "DE-A-001")
        _make_cl(db, "cl-b", "DE-B-001")
        _make_entity(db)
        # UM v1 — only cl-a; create + activate against this version.
        v1 = UMVersion(
            year=2026, quarter=1, status="active", source="seed",
            activated_at=datetime(2026, 1, 10, 9, 0, 0),
        )
        db.add(v1)
        db.flush()
        db.add(UserMeasurement(
            version_id=v1.id, s_code="S0001",
            charging_location_id="cl-a", value=100,
        ))
        db.flush()
        profile = create_automatic_profile(
            db, "ce-test", 2026, "S0001",
            um_year=2026, um_quarter=1, status="active",
        )
        original_watermark = profile.um_snapshot_at
        # Now publish v2 (different distribution). Both versions stay
        # status='active'; resolution picks the latest activated_at.
        v2 = UMVersion(
            year=2026, quarter=1, status="active", source="csv_upload",
            activated_at=datetime(2026, 4, 1, 9, 0, 0),
        )
        db.add(v2)
        db.flush()
        db.add(UserMeasurement(
            version_id=v2.id, s_code="S0001",
            charging_location_id="cl-b", value=100,
        ))
        db.flush()
        # Advance — should pull v2 values + advance watermark.
        refresh_from_um(db, profile.id, um_year=2026, um_quarter=1, dry_run=False)
        db.flush()
        db.expire(profile)
        assert profile.um_snapshot_at == datetime(2026, 4, 1, 9, 0, 0)
        assert profile.um_snapshot_at != original_watermark
        cl_ids = {line.charging_location_id for line in profile.lines}
        assert cl_ids == {"cl-b"}
