"""Tests for services/audit_query.py and routers/audit.py filters/pagination."""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest

from models.system import AuditLog
from services.audit_query import list_categories, query_audit_log, query_entity_trail


HEADERS_CTRL = {"X-Current-User": "persona-controller"}
HEADERS_PL = {"X-Current-User": "persona-pl"}


@pytest.fixture
def seeded_audit(db, seed_personas):
    """Insert 6 audit rows across 3 categories spanning 3 days."""
    base = datetime(2026, 4, 20, 9, 0, 0)
    rows = [
        AuditLog(
            timestamp=base, user_person_id="p-dev-1",
            entity_type="cost_center", entity_id="cc-1", entity_name="CC One",
            action="update", field_changed="name",
            old_value="Old", new_value="New",
            category="master_data",
        ),
        AuditLog(
            timestamp=base + timedelta(hours=1), user_person_id="p-dev-1",
            entity_type="planning_parameter", entity_id="param_a", entity_name="Param A",
            action="update", field_changed="current_value",
            old_value="1", new_value="2",
            category="configuration",
        ),
        AuditLog(
            timestamp=base + timedelta(days=1), user_person_id="p-dev-2",
            entity_type="grouping_entity", entity_id="ge-1", entity_name="GE One",
            action="create",
            category="hierarchy",
        ),
        AuditLog(
            timestamp=base + timedelta(days=1, hours=2), user_person_id="p-dev-2",
            entity_type="cost_center", entity_id="cc-1", entity_name="CC One",
            action="deactivate",
            category="master_data",
        ),
        AuditLog(
            timestamp=base + timedelta(days=2), user_person_id="p-dev-1",
            entity_type="pipeline", entity_id="proj-x", entity_name="Project X",
            action="update", field_changed="pipeline_stage",
            old_value="proposed", new_value="under_evaluation",
            category="pipeline_transitions",
        ),
        AuditLog(
            timestamp=base + timedelta(days=2, hours=3), user_person_id="p-dev-1",
            entity_type="cost_center", entity_id="cc-2", entity_name="CC Two",
            action="create",
            category="master_data",
        ),
    ]
    db.add_all(rows)
    db.commit()
    return rows


class TestQueryAuditLog:
    def test_no_filter_returns_all(self, db, seeded_audit):
        items, total = query_audit_log(db)
        assert total == 6
        assert len(items) == 6

    def test_filter_single_category(self, db, seeded_audit):
        items, total = query_audit_log(db, categories=["master_data"])
        assert total == 3
        assert all(i.category == "master_data" for i in items)

    def test_filter_multiple_categories(self, db, seeded_audit):
        items, total = query_audit_log(
            db, categories=["master_data", "configuration"],
        )
        assert total == 4
        assert {i.category for i in items} == {"master_data", "configuration"}

    def test_invalid_category_raises(self, db, seeded_audit):
        with pytest.raises(ValueError):
            query_audit_log(db, categories=["bogus"])

    def test_filter_entity(self, db, seeded_audit):
        items, total = query_audit_log(
            db, entity_type="cost_center", entity_id="cc-1",
        )
        assert total == 2
        assert all(i.entity_id == "cc-1" for i in items)

    def test_filter_user(self, db, seeded_audit):
        items, total = query_audit_log(db, user_person_id="p-dev-2")
        assert total == 2

    def test_filter_date_range(self, db, seeded_audit):
        items, total = query_audit_log(
            db,
            start_date=datetime(2026, 4, 21),
            end_date=datetime(2026, 4, 21, 23, 59, 59),
        )
        assert total == 2  # Day 2 entries only

    def test_pagination(self, db, seeded_audit):
        items_page1, total = query_audit_log(db, limit=3, offset=0)
        items_page2, _ = query_audit_log(db, limit=3, offset=3)
        assert total == 6
        assert len(items_page1) == 3
        assert len(items_page2) == 3
        assert {i.id for i in items_page1}.isdisjoint({i.id for i in items_page2})

    def test_order_desc_by_timestamp(self, db, seeded_audit):
        items, _ = query_audit_log(db)
        ts_list = [i.timestamp for i in items]
        assert ts_list == sorted(ts_list, reverse=True)


class TestQueryEntityTrail:
    def test_returns_only_target_entity(self, db, seeded_audit):
        items, total = query_entity_trail(db, "cost_center", "cc-1")
        assert total == 2
        assert all(i.entity_type == "cost_center" and i.entity_id == "cc-1" for i in items)

    def test_returns_empty_for_unknown(self, db, seeded_audit):
        items, total = query_entity_trail(db, "cost_center", "nope")
        assert total == 0
        assert items == []


class TestListCategories:
    def test_returns_all_nine(self):
        cats = list_categories()
        assert len(cats) == 9
        keys = {c["key"] for c in cats}
        assert "master_data" in keys
        assert "scheduled_change_lifecycle" in keys
        assert "export" in keys
        assert all("label" in c for c in cats)


class TestAuditRouter:
    def test_global_log_endpoint(self, test_client, db, seeded_audit):
        resp = test_client.get("/api/audit/log", headers=HEADERS_CTRL)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 6
        assert len(data["items"]) == 6
        # Each item carries category
        assert all("category" in i for i in data["items"])

    def test_filter_by_category_query_param(self, test_client, db, seeded_audit):
        resp = test_client.get(
            "/api/audit/log?category=master_data&category=hierarchy",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 4

    def test_invalid_category_400(self, test_client, db, seeded_audit):
        resp = test_client.get(
            "/api/audit/log?category=nope", headers=HEADERS_CTRL,
        )
        assert resp.status_code == 400

    def test_pl_forbidden(self, test_client, seeded_audit):
        resp = test_client.get("/api/audit/log", headers=HEADERS_PL)
        assert resp.status_code == 403

    def test_entity_trail_endpoint(self, test_client, db, seeded_audit):
        resp = test_client.get(
            "/api/audit/log/entity/cost_center/cc-1", headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["entity_type"] == "cost_center"
        assert data["entity_id"] == "cc-1"
        assert data["total"] == 2

    def test_categories_endpoint(self, test_client, seeded_audit):
        resp = test_client.get("/api/audit/categories", headers=HEADERS_CTRL)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 9

    def test_invalid_pagination(self, test_client, seeded_audit):
        resp = test_client.get("/api/audit/log?limit=0", headers=HEADERS_CTRL)
        assert resp.status_code == 400
        resp2 = test_client.get("/api/audit/log?offset=-5", headers=HEADERS_CTRL)
        assert resp2.status_code == 400

    def test_invalid_date(self, test_client, seeded_audit):
        resp = test_client.get(
            "/api/audit/log?start_date=not-a-date", headers=HEADERS_CTRL,
        )
        assert resp.status_code == 400
