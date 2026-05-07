"""Integration tests for v5.2 W1 capacity audit-trail endpoint.

Per spec §12.15: GET /api/capacity/history reads from the new
``CapacityActionLog`` table, applies role-based scoping (§12.14), and
returns a paginated, joined view (project_name, user_name, cc_name).

Role scoping (§12.14):
  * Controller — all CCs / all users
  * CC Owner   — auto-scoped to managed CC (server-side WHERE filter)
  * Executive  — all CCs / all users (read-only)
  * PL         — 403 Forbidden
"""

from __future__ import annotations

from datetime import datetime, timedelta
from unittest.mock import patch

import pytest


HEADERS_CTRL = {"X-Current-User": "persona-controller"}
HEADERS_CCO = {"X-Current-User": "persona-cc-owner"}
HEADERS_EXEC = {"X-Current-User": "persona-exec"}
HEADERS_PL = {"X-Current-User": "persona-pl"}


# ---------------------------------------------------------------------------
# Fixture: seed CapacityActionLog rows directly (bypasses route writes)
# ---------------------------------------------------------------------------

@pytest.fixture
def seed_history(db, seed_org_base, seed_personas):
    """Seed a handful of CapacityActionLog rows across CCs and users.

    We import the model lazily because Teammate A may not have landed
    the ``CapacityActionLog`` model yet — let the import fail loudly if so.
    """
    from models.capacity import CapacityActionLog  # type: ignore  # noqa: F401
    from models.organization import CostCenter, Location
    from models.projects import Project

    # Add a second CC so CC Owner scoping can be exercised
    bud = Location(id="loc-bud", city="Budapest", country="Hungary")
    cc_bud = CostCenter(
        id="cc-bud-dev", name="Budapest Development",
        location_id="loc-bud", competence_center_id="comp-dev",
    )
    proj_alpha = Project(
        id="proj-alpha", name="Alpha", status="active",
        capex_opex="capex", start_month="2026-01", end_month="2026-12",
    )
    proj_beta = Project(
        id="proj-beta", name="Beta", status="active",
        capex_opex="capex", start_month="2026-01", end_month="2026-12",
    )
    db.add_all([bud, cc_bud, proj_alpha, proj_beta])
    db.flush()

    base = datetime(2026, 5, 1, 9, 0, 0)
    rows = [
        # 1. CC Owner confirmed proj-alpha on cc-muc-dev
        CapacityActionLog(
            timestamp=base, action_type="confirm",
            acting_user_id="p-dev-1",  # cc owner persona's person_id
            project_id="proj-alpha", cost_center_id="cc-muc-dev",
            summary="Confirmed 2 roles, 320h total for Alpha",
            detail_payload='{"requests_affected": [], "assignments": []}',
        ),
        # 2. Controller declined proj-beta on cc-muc-dev
        CapacityActionLog(
            timestamp=base + timedelta(hours=2), action_type="decline",
            acting_user_id="p-dev-1",  # controller persona's person_id (test fixture)
            project_id="proj-beta", cost_center_id="cc-muc-dev",
            summary="Declined Beta — insufficient capacity",
            detail_payload='{"decline_reason": "Insufficient capacity"}',
        ),
        # 3. Controller saved draft on cc-bud-dev (different CC)
        CapacityActionLog(
            timestamp=base + timedelta(days=1), action_type="assign_draft",
            acting_user_id="p-dev-1",
            project_id="proj-alpha", cost_center_id="cc-bud-dev",
            summary="Saved draft assignments for Alpha on Budapest CC",
            detail_payload='{"requests_affected": []}',
        ),
        # 4. Partial confirm — older entry to test date filter
        CapacityActionLog(
            timestamp=base - timedelta(days=10), action_type="partial_confirm",
            acting_user_id="p-dev-2",
            project_id="proj-beta", cost_center_id="cc-bud-dev",
            summary="Partially confirmed Beta — 1 month assigned",
            detail_payload='{"requests_affected": []}',
        ),
        # 5. CR re-confirm
        CapacityActionLog(
            timestamp=base + timedelta(days=2), action_type="cr_reconfirm",
            acting_user_id="p-dev-1",
            project_id="proj-alpha", cost_center_id="cc-muc-dev",
            summary="Re-confirmed after CR-15",
            detail_payload='{"cr_id": 15}',
            cr_id=None,  # CR FK optional
        ),
    ]
    db.add_all(rows)
    db.commit()
    return {"base_date": base, "row_count": len(rows)}


# ---------------------------------------------------------------------------
# Shape and basic contract
# ---------------------------------------------------------------------------

class TestHistoryShape:
    def test_returns_200_for_controller(self, test_client, seed_history):
        resp = test_client.get(
            "/api/capacity/history?page=1&page_size=50",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200

    def test_response_envelope(self, test_client, seed_history):
        resp = test_client.get(
            "/api/capacity/history",
            headers=HEADERS_CTRL,
        )
        data = resp.json()
        # Spec §12.15 — paginated. We accept either {items, total, page, page_size}
        # or {items, total} envelope.
        assert "items" in data
        assert "total" in data
        assert isinstance(data["items"], list)
        assert isinstance(data["total"], int)

    def test_each_row_has_required_fields(self, test_client, seed_history):
        resp = test_client.get(
            "/api/capacity/history",
            headers=HEADERS_CTRL,
        )
        data = resp.json()
        assert len(data["items"]) >= 1
        for row in data["items"]:
            assert "id" in row
            assert "timestamp" in row
            assert "action_type" in row
            # Joined display fields per §12.15
            assert "project_id" in row
            assert "project_name" in row
            assert "cost_center_id" in row
            # CC name might be omitted when CC Owner sees own CC only — but
            # it's required for Controller view.
            assert "cost_center_name" in row
            # Acting user details
            assert "acting_user_id" in row or "user_id" in row
            assert "user_name" in row or "acting_user_name" in row
            assert "summary" in row

    def test_detail_payload_is_parsed_json(self, test_client, seed_history):
        """Per §12.15: detail_payload returned as parsed JSON object, not string."""
        resp = test_client.get(
            "/api/capacity/history",
            headers=HEADERS_CTRL,
        )
        data = resp.json()
        for row in data["items"]:
            if "detail_payload" in row and row["detail_payload"] is not None:
                # MUST be a dict, not a JSON-encoded string
                assert isinstance(row["detail_payload"], (dict, list)), (
                    f"detail_payload should be parsed JSON, got "
                    f"{type(row['detail_payload']).__name__}: {row['detail_payload']!r}"
                )


# ---------------------------------------------------------------------------
# Default sort: timestamp descending
# ---------------------------------------------------------------------------

class TestHistorySort:
    def test_default_sort_is_timestamp_desc(self, test_client, seed_history):
        resp = test_client.get(
            "/api/capacity/history",
            headers=HEADERS_CTRL,
        )
        data = resp.json()
        timestamps = [row["timestamp"] for row in data["items"]]
        # ISO timestamps are lexically sortable
        for i in range(len(timestamps) - 1):
            assert timestamps[i] >= timestamps[i + 1], \
                f"history not sorted desc by timestamp: {timestamps}"

    def test_sort_dir_asc_reverses_order(self, test_client, seed_history):
        resp = test_client.get(
            "/api/capacity/history?sort_dir=asc",
            headers=HEADERS_CTRL,
        )
        # 200 expected; if endpoint doesn't yet honor sort_dir, accept that.
        data = resp.json()
        if len(data["items"]) >= 2:
            timestamps = [row["timestamp"] for row in data["items"]]
            for i in range(len(timestamps) - 1):
                assert timestamps[i] <= timestamps[i + 1]


# ---------------------------------------------------------------------------
# Filters
# ---------------------------------------------------------------------------

class TestHistoryFilters:
    def test_filter_by_action_type(self, test_client, seed_history):
        resp = test_client.get(
            "/api/capacity/history?action_type=confirm",
            headers=HEADERS_CTRL,
        )
        data = resp.json()
        assert all(row["action_type"] == "confirm" for row in data["items"])

    def test_filter_by_action_type_csv(self, test_client, seed_history):
        """action_type accepts comma-separated values per §12.15."""
        resp = test_client.get(
            "/api/capacity/history?action_type=confirm,decline",
            headers=HEADERS_CTRL,
        )
        data = resp.json()
        for row in data["items"]:
            assert row["action_type"] in ("confirm", "decline")

    def test_filter_by_project_id(self, test_client, seed_history):
        resp = test_client.get(
            "/api/capacity/history?project_id=proj-alpha",
            headers=HEADERS_CTRL,
        )
        data = resp.json()
        assert all(row["project_id"] == "proj-alpha" for row in data["items"])

    def test_filter_by_cost_center_id(self, test_client, seed_history):
        resp = test_client.get(
            "/api/capacity/history?cost_center_id=cc-bud-dev",
            headers=HEADERS_CTRL,
        )
        data = resp.json()
        assert all(row["cost_center_id"] == "cc-bud-dev" for row in data["items"])

    def test_filter_by_acting_user(self, test_client, seed_history):
        resp = test_client.get(
            "/api/capacity/history?acting_user_id=p-dev-2",
            headers=HEADERS_CTRL,
        )
        data = resp.json()
        for row in data["items"]:
            uid = row.get("acting_user_id") or row.get("user_id")
            assert uid == "p-dev-2"

    def test_filter_date_range(self, test_client, seed_history):
        """from/to are inclusive ISO date bounds — the 10-day-old row should be
        excluded by a `from=2026-05-01` filter."""
        resp = test_client.get(
            "/api/capacity/history?from=2026-05-01&to=2026-05-31",
            headers=HEADERS_CTRL,
        )
        data = resp.json()
        for row in data["items"]:
            ts = row["timestamp"]
            assert ts >= "2026-05-01"


# ---------------------------------------------------------------------------
# Pagination
# ---------------------------------------------------------------------------

class TestHistoryPagination:
    def test_page_size_limits_returned_rows(self, test_client, seed_history):
        resp = test_client.get(
            "/api/capacity/history?page=1&page_size=2",
            headers=HEADERS_CTRL,
        )
        data = resp.json()
        assert len(data["items"]) <= 2
        # total should reflect the unfiltered count, not the page size
        assert data["total"] >= 2

    def test_page_2_returns_different_rows(self, test_client, seed_history):
        page1 = test_client.get(
            "/api/capacity/history?page=1&page_size=2",
            headers=HEADERS_CTRL,
        ).json()
        page2 = test_client.get(
            "/api/capacity/history?page=2&page_size=2",
            headers=HEADERS_CTRL,
        ).json()
        ids1 = {r["id"] for r in page1["items"]}
        ids2 = {r["id"] for r in page2["items"]}
        # No overlap between consecutive pages
        assert ids1.isdisjoint(ids2)


# ---------------------------------------------------------------------------
# Role-based scoping per §12.14
# ---------------------------------------------------------------------------

class TestHistoryRoleScoping:
    def test_pl_forbidden(self, test_client, seed_history):
        resp = test_client.get(
            "/api/capacity/history",
            headers=HEADERS_PL,
        )
        assert resp.status_code == 403, \
            f"PL should not have access to capacity history (got {resp.status_code})"

    def test_controller_sees_all_ccs(self, test_client, seed_history):
        resp = test_client.get(
            "/api/capacity/history",
            headers=HEADERS_CTRL,
        )
        data = resp.json()
        cc_ids = {row["cost_center_id"] for row in data["items"]}
        # Controller sees both Munich AND Budapest entries
        assert "cc-muc-dev" in cc_ids
        assert "cc-bud-dev" in cc_ids

    def test_cc_owner_sees_own_cc_only(self, test_client, seed_history):
        """Per §12.14: server applies WHERE cost_center_id = managed CC."""
        resp = test_client.get(
            "/api/capacity/history",
            headers=HEADERS_CCO,
        )
        assert resp.status_code == 200
        data = resp.json()
        # The CC Owner fixture is scoped to cc-muc-dev — Budapest entries must
        # not appear regardless of any `cost_center_id` query param.
        cc_ids = {row["cost_center_id"] for row in data["items"]}
        assert cc_ids <= {"cc-muc-dev"}, \
            f"CC Owner saw entries from other CCs: {cc_ids}"

    def test_cc_owner_cannot_override_scope_with_query_param(
        self, test_client, seed_history,
    ):
        """A CC Owner explicitly filtering for another CC must STILL be scoped
        to their own. The server-side filter wins per §12.14."""
        resp = test_client.get(
            "/api/capacity/history?cost_center_id=cc-bud-dev",
            headers=HEADERS_CCO,
        )
        assert resp.status_code in (200, 403)
        if resp.status_code == 200:
            data = resp.json()
            cc_ids = {row["cost_center_id"] for row in data["items"]}
            assert "cc-bud-dev" not in cc_ids, \
                "CC Owner managed to read entries from another CC"

    def test_executive_sees_all_ccs(self, test_client, seed_history):
        resp = test_client.get(
            "/api/capacity/history",
            headers=HEADERS_EXEC,
        )
        assert resp.status_code == 200
        data = resp.json()
        cc_ids = {row["cost_center_id"] for row in data["items"]}
        assert "cc-muc-dev" in cc_ids
        assert "cc-bud-dev" in cc_ids


# ---------------------------------------------------------------------------
# Performance sanity smoke test (per task wave plan)
# ---------------------------------------------------------------------------

class TestHistoryPerformanceSmoke:
    """Sanity: querying a 5k+-row CapacityActionLog table with the standard
    indexed filters returns in well under 1s. This is NOT a strict perf gate
    — just a smoke test that the indexes from §12.10 DDL are in place.
    """

    def test_5k_row_query_completes_quickly(self, test_client, db, seed_personas):
        from models.capacity import CapacityActionLog  # type: ignore
        from models.organization import CostCenter, Location
        from models.projects import Project
        import time

        # Seed a project and an extra CC for the bulk insert
        bud = Location(id="loc-bud", city="Budapest", country="Hungary")
        cc_bud = CostCenter(
            id="cc-bud-dev", name="Budapest",
            location_id="loc-bud", competence_center_id="comp-dev",
        )
        proj = Project(
            id="proj-perf", name="Perf", status="active",
            capex_opex="capex", start_month="2026-01", end_month="2026-12",
        )
        db.add_all([bud, cc_bud, proj])
        db.flush()

        base = datetime(2026, 4, 1)
        rows = []
        for i in range(5_000):
            rows.append(CapacityActionLog(
                timestamp=base + timedelta(minutes=i),
                action_type=("confirm" if i % 2 == 0 else "decline"),
                acting_user_id=("p-dev-1" if i % 3 == 0 else "p-dev-2"),
                project_id="proj-perf",
                cost_center_id=("cc-muc-dev" if i % 4 == 0 else "cc-bud-dev"),
                summary=f"Bulk row {i}",
                detail_payload="{}",
            ))
        db.add_all(rows)
        db.commit()

        # Indexed query — by timestamp DESC + filter by acting_user
        t0 = time.perf_counter()
        resp = test_client.get(
            "/api/capacity/history?acting_user_id=p-dev-1&page_size=50",
            headers=HEADERS_CTRL,
        )
        elapsed = time.perf_counter() - t0

        assert resp.status_code == 200
        assert elapsed < 1.0, \
            f"5k-row indexed query took {elapsed:.3f}s — investigate indexes"
