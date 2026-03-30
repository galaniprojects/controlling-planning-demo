"""Unit tests for Report Builder saved reports CRUD service."""

import os
import sys
import json

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base
from models.reporting import SavedReport, SavedReportShare
from services.report_builder_saved import (
    create_saved_report,
    get_saved_report,
    list_saved_reports,
    list_shared_reports,
    share_report,
    soft_delete_saved_report,
    update_saved_report,
)

# Use in-memory SQLite for tests
engine = create_engine("sqlite:///:memory:")
SessionLocal = sessionmaker(bind=engine)


@pytest.fixture(autouse=True)
def setup_db():
    """Create tables before each test and drop after."""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


SAMPLE_DEFINITION = {
    "rows": ["D01"],
    "columns": ["D16"],
    "filters": {"D05": ["TBS"]},
    "values": ["M01", "M03"],
    "calculatedMeasures": [],
    "formatRules": [],
    "viewMode": "table",
}


class TestCreateSavedReport:
    def test_creates_report(self, db):
        report = create_saved_report(
            db, "persona-controller", "Test Report", SAMPLE_DEFINITION, "A description"
        )
        assert report.id is not None
        assert report.name == "Test Report"
        assert report.description == "A description"
        assert report.created_by == "persona-controller"
        assert report.is_active is True
        assert report.is_published is False
        defn = json.loads(report.definition)
        assert defn["rows"] == ["D01"]

    def test_creates_without_description(self, db):
        report = create_saved_report(db, "persona-controller", "No Desc", SAMPLE_DEFINITION)
        assert report.description is None


class TestListSavedReports:
    def test_lists_user_reports(self, db):
        create_saved_report(db, "persona-controller", "R1", SAMPLE_DEFINITION)
        create_saved_report(db, "persona-controller", "R2", SAMPLE_DEFINITION)
        create_saved_report(db, "persona-pl-weber", "R3", SAMPLE_DEFINITION)

        reports = list_saved_reports(db, "persona-controller")
        assert len(reports) == 2
        names = {r.name for r in reports}
        assert names == {"R1", "R2"}

    def test_excludes_inactive(self, db):
        r = create_saved_report(db, "persona-controller", "R1", SAMPLE_DEFINITION)
        soft_delete_saved_report(db, r)
        reports = list_saved_reports(db, "persona-controller")
        assert len(reports) == 0


class TestGetSavedReport:
    def test_returns_report_by_id(self, db):
        r = create_saved_report(db, "persona-controller", "R1", SAMPLE_DEFINITION)
        found = get_saved_report(db, r.id)
        assert found is not None
        assert found.name == "R1"

    def test_returns_none_for_missing(self, db):
        assert get_saved_report(db, 999) is None

    def test_returns_none_for_inactive(self, db):
        r = create_saved_report(db, "persona-controller", "R1", SAMPLE_DEFINITION)
        soft_delete_saved_report(db, r)
        assert get_saved_report(db, r.id) is None


class TestUpdateSavedReport:
    def test_updates_name(self, db):
        r = create_saved_report(db, "persona-controller", "Old Name", SAMPLE_DEFINITION)
        updated = update_saved_report(db, r, name="New Name")
        assert updated.name == "New Name"

    def test_updates_definition(self, db):
        r = create_saved_report(db, "persona-controller", "R1", SAMPLE_DEFINITION)
        new_def = {**SAMPLE_DEFINITION, "rows": ["D02"]}
        updated = update_saved_report(db, r, definition=new_def)
        defn = json.loads(updated.definition)
        assert defn["rows"] == ["D02"]

    def test_partial_update(self, db):
        r = create_saved_report(db, "persona-controller", "R1", SAMPLE_DEFINITION, "Desc")
        updated = update_saved_report(db, r, description="New Desc")
        assert updated.name == "R1"  # unchanged
        assert updated.description == "New Desc"


class TestSoftDeleteSavedReport:
    def test_sets_inactive(self, db):
        r = create_saved_report(db, "persona-controller", "R1", SAMPLE_DEFINITION)
        soft_delete_saved_report(db, r)
        # Direct query to check inactive
        from_db = db.query(SavedReport).filter(SavedReport.id == r.id).first()
        assert from_db.is_active is False

    def test_removes_shares(self, db):
        r = create_saved_report(db, "persona-controller", "R1", SAMPLE_DEFINITION)
        share_report(db, r, [{"shared_with": "persona-pl-weber", "permission": "view_only"}], False)
        assert db.query(SavedReportShare).count() == 1
        soft_delete_saved_report(db, r)
        assert db.query(SavedReportShare).count() == 0


class TestShareReport:
    def test_creates_share_records(self, db):
        r = create_saved_report(db, "persona-controller", "R1", SAMPLE_DEFINITION)
        share_report(
            db, r,
            [
                {"shared_with": "persona-pl-weber", "permission": "view_only"},
                {"shared_with": "persona-cco-schmidt", "permission": "can_edit"},
            ],
            is_published=False,
        )
        shares = db.query(SavedReportShare).filter(SavedReportShare.report_id == r.id).all()
        assert len(shares) == 2

    def test_replaces_shares_on_update(self, db):
        r = create_saved_report(db, "persona-controller", "R1", SAMPLE_DEFINITION)
        share_report(db, r, [{"shared_with": "persona-pl-weber", "permission": "view_only"}], False)
        assert db.query(SavedReportShare).count() == 1
        share_report(db, r, [{"shared_with": "persona-cco-schmidt", "permission": "can_edit"}], False)
        shares = db.query(SavedReportShare).all()
        assert len(shares) == 1
        assert shares[0].shared_with == "persona-cco-schmidt"

    def test_sets_published_flag(self, db):
        r = create_saved_report(db, "persona-controller", "R1", SAMPLE_DEFINITION)
        share_report(db, r, [], is_published=True)
        db.refresh(r)
        assert r.is_published is True


class TestListSharedReports:
    def test_returns_direct_shares(self, db):
        r = create_saved_report(db, "persona-controller", "R1", SAMPLE_DEFINITION)
        share_report(db, r, [{"shared_with": "persona-pl-weber", "permission": "view_only"}], False)
        shared = list_shared_reports(db, "persona-pl-weber")
        assert len(shared) == 1
        assert shared[0]["report"].name == "R1"
        assert shared[0]["permission"] == "view_only"

    def test_returns_published_reports(self, db):
        r = create_saved_report(db, "persona-controller", "R1", SAMPLE_DEFINITION)
        share_report(db, r, [], is_published=True)
        shared = list_shared_reports(db, "persona-pl-weber")
        assert len(shared) == 1
        assert shared[0]["permission"] is None  # published, not directly shared

    def test_excludes_own_reports(self, db):
        r = create_saved_report(db, "persona-controller", "R1", SAMPLE_DEFINITION)
        share_report(db, r, [], is_published=True)
        shared = list_shared_reports(db, "persona-controller")
        assert len(shared) == 0
