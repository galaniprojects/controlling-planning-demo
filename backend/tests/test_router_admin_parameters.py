"""Integration tests for the PUT /api/admin/parameters max_allocation_depth hook.

Service Workbench Session 1 (Teammate B). Exercises the change-validation
branch added to ``routers/admin.update_parameters``: when the change set
includes ``max_allocation_depth``, the new value is pre-validated against
every active production :class:`~models.charging.DistributionVersion`.
If any graph would exceed the new cap, the endpoint returns 409 with a
``violations`` payload and the parameter value remains unchanged.

The basic update flow (Tech Navigator weight changes, ranking-envelope
resets, etc.) is covered by ``test_router_admin.py``. This module focuses
exclusively on the depth-cap path.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

from models.charging import (
    ChargeableEntity, Distribution, DistributionVersion,
)
from models.system import AuditLog, PlanningParameter


HEADERS_CTRL = {"X-Current-User": "persona-controller"}
HEADERS_PL = {"X-Current-User": "persona-pl"}
HEADERS_EXEC = {"X-Current-User": "persona-exec"}
HEADERS_CC = {"X-Current-User": "persona-cc-owner"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _seed_max_depth_param(db, value: str = "6") -> PlanningParameter:
    existing = (
        db.query(PlanningParameter)
        .filter(PlanningParameter.key == "max_allocation_depth")
        .first()
    )
    if existing:
        existing.current_value = value
        db.commit()
        return existing
    p = PlanningParameter(
        key="max_allocation_depth",
        name="Max Allocation Depth",
        description="Maximum Stage 1 distribution chain length",
        current_value=value,
        default_value="6",
        data_type="integer",
        param_group="limits",
    )
    db.add(p)
    db.commit()
    return p


def _seed_active_chain(db, node_ids: list[str]) -> DistributionVersion:
    """Build an active production version with a linear chain of edges.

    Creates the entities, the version, and N-1 edges connecting them.
    """
    for nid in node_ids:
        if db.query(ChargeableEntity).filter_by(id=nid).first() is None:
            db.add(ChargeableEntity(
                id=nid, entity_type="InternalService",
                identifier=f"ITF-{nid}", name=f"Entity {nid}",
                to_business_pct=0.0, annual_cost=100_000.0,
            ))
    db.flush()
    v = DistributionVersion(
        active_from=date(2025, 1, 1), status="active",
        origin="seed", rationale="test seed",
    )
    db.add(v)
    db.flush()
    for src, dst in zip(node_ids, node_ids[1:]):
        db.add(Distribution(
            version_id=v.id,
            source_entity_id=src, destination_entity_id=dst,
            percentage=Decimal("100"),
        ))
    db.commit()
    return v


# ---------------------------------------------------------------------------
# Acceptance — value flows through unchanged paths
# ---------------------------------------------------------------------------


class TestMaxAllocationDepthAcceptance:
    def test_accepts_higher_value(self, test_client, db, seed_personas):
        """Raising the cap is always safe."""
        _seed_max_depth_param(db, "6")
        _seed_active_chain(db, ["A", "B", "C"])  # length 2
        resp = test_client.put(
            "/api/admin/parameters", headers=HEADERS_CTRL,
            json={"changes": [
                {"key": "max_allocation_depth", "new_value": "10"},
            ]},
        )
        assert resp.status_code == 200, resp.json()
        # Value persisted.
        db.expire_all()
        param = db.query(PlanningParameter).filter_by(
            key="max_allocation_depth",
        ).first()
        assert param.current_value == "10"

    def test_accepts_lower_value_when_graph_fits(
        self, test_client, db, seed_personas,
    ):
        """A 2-edge chain fits under cap=4 — lowering from 6→4 is safe."""
        _seed_max_depth_param(db, "6")
        _seed_active_chain(db, ["A", "B", "C"])  # length 2 edges
        resp = test_client.put(
            "/api/admin/parameters", headers=HEADERS_CTRL,
            json={"changes": [
                {"key": "max_allocation_depth", "new_value": "4"},
            ]},
        )
        assert resp.status_code == 200, resp.json()
        db.expire_all()
        param = db.query(PlanningParameter).filter_by(
            key="max_allocation_depth",
        ).first()
        assert param.current_value == "4"

    def test_accepts_at_exact_boundary(
        self, test_client, db, seed_personas,
    ):
        """Cap equal to current longest path passes (inclusive boundary)."""
        _seed_max_depth_param(db, "6")
        _seed_active_chain(db, ["A", "B", "C", "D"])  # length 3
        resp = test_client.put(
            "/api/admin/parameters", headers=HEADERS_CTRL,
            json={"changes": [
                {"key": "max_allocation_depth", "new_value": "3"},
            ]},
        )
        assert resp.status_code == 200, resp.json()


# ---------------------------------------------------------------------------
# Rejection — 409 with violations payload
# ---------------------------------------------------------------------------


class TestMaxAllocationDepthRejection:
    def test_rejects_when_active_graph_too_deep(
        self, test_client, db, seed_personas,
    ):
        """5-edge active chain → attempt to lower cap to 4 → 409."""
        _seed_max_depth_param(db, "6")
        v = _seed_active_chain(
            db, ["N0", "N1", "N2", "N3", "N4", "N5"],  # 5 edges
        )
        resp = test_client.put(
            "/api/admin/parameters", headers=HEADERS_CTRL,
            json={"changes": [
                {"key": "max_allocation_depth", "new_value": "4"},
            ]},
        )
        assert resp.status_code == 409
        body = resp.json()
        # FastAPI wraps custom HTTPException detail in {"detail": ...}
        detail = body.get("detail", body)
        assert "Cannot lower max_allocation_depth" in detail["message"]
        assert len(detail["violations"]) == 1
        violation = detail["violations"][0]
        assert violation["version_id"] == v.id
        assert violation["violating_path"] == [
            "N0", "N1", "N2", "N3", "N4", "N5",
        ]

    def test_value_unchanged_after_409_rejection(
        self, test_client, db, seed_personas,
    ):
        """After a 409, the PlanningParameter row keeps its old value."""
        _seed_max_depth_param(db, "6")
        _seed_active_chain(db, ["N0", "N1", "N2", "N3", "N4", "N5"])
        resp = test_client.put(
            "/api/admin/parameters", headers=HEADERS_CTRL,
            json={"changes": [
                {"key": "max_allocation_depth", "new_value": "2"},
            ]},
        )
        assert resp.status_code == 409
        db.expire_all()
        param = db.query(PlanningParameter).filter_by(
            key="max_allocation_depth",
        ).first()
        assert param.current_value == "6", (
            "Rejected change must not be committed"
        )

    def test_rejects_non_integer_value(
        self, test_client, db, seed_personas,
    ):
        """Non-integer new_value is rejected with 422."""
        _seed_max_depth_param(db, "6")
        resp = test_client.put(
            "/api/admin/parameters", headers=HEADERS_CTRL,
            json={"changes": [
                {"key": "max_allocation_depth", "new_value": "abc"},
            ]},
        )
        assert resp.status_code == 422
        db.expire_all()
        param = db.query(PlanningParameter).filter_by(
            key="max_allocation_depth",
        ).first()
        assert param.current_value == "6"

    def test_rejects_zero_or_negative(
        self, test_client, db, seed_personas,
    ):
        """new_value < 1 is rejected with 422."""
        _seed_max_depth_param(db, "6")
        resp = test_client.put(
            "/api/admin/parameters", headers=HEADERS_CTRL,
            json={"changes": [
                {"key": "max_allocation_depth", "new_value": "0"},
            ]},
        )
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Authorization
# ---------------------------------------------------------------------------


class TestMaxAllocationDepthAuthorization:
    @pytest.mark.parametrize("headers", [HEADERS_PL, HEADERS_EXEC, HEADERS_CC])
    def test_non_controller_forbidden(
        self, test_client, db, seed_personas, headers,
    ):
        """Only controllers may edit planning parameters; PL / Exec / CC
        Owner all get 403 (existing role guard, unchanged by this hook)."""
        _seed_max_depth_param(db, "6")
        resp = test_client.put(
            "/api/admin/parameters", headers=headers,
            json={"changes": [
                {"key": "max_allocation_depth", "new_value": "5"},
            ]},
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Audit logging
# ---------------------------------------------------------------------------


class TestMaxAllocationDepthAudit:
    def test_audit_row_written_with_master_data_category(
        self, test_client, db, seed_personas,
    ):
        """A successful max_allocation_depth change writes exactly one
        AuditLog row in the ``master_data`` category."""
        _seed_max_depth_param(db, "6")
        # No edges = no violations = the change is accepted.
        resp = test_client.put(
            "/api/admin/parameters", headers=HEADERS_CTRL,
            json={"changes": [
                {"key": "max_allocation_depth", "new_value": "5"},
            ]},
        )
        assert resp.status_code == 200, resp.json()
        rows = (
            db.query(AuditLog)
            .filter(
                AuditLog.category == "master_data",
                AuditLog.entity_type == "planning_parameter",
                AuditLog.entity_id == "max_allocation_depth",
            )
            .all()
        )
        assert len(rows) == 1
        row = rows[0]
        assert row.action == "update"
        assert row.field_changed == "current_value"
        assert row.old_value == "6"
        assert row.new_value == "5"

    def test_no_audit_row_on_rejection(
        self, test_client, db, seed_personas,
    ):
        """A 409-rejected change must not leave an audit row behind."""
        _seed_max_depth_param(db, "6")
        _seed_active_chain(db, ["N0", "N1", "N2", "N3", "N4", "N5"])
        before = (
            db.query(AuditLog)
            .filter(AuditLog.entity_id == "max_allocation_depth")
            .count()
        )
        resp = test_client.put(
            "/api/admin/parameters", headers=HEADERS_CTRL,
            json={"changes": [
                {"key": "max_allocation_depth", "new_value": "2"},
            ]},
        )
        assert resp.status_code == 409
        after = (
            db.query(AuditLog)
            .filter(AuditLog.entity_id == "max_allocation_depth")
            .count()
        )
        assert before == after, (
            "Audit row must not be written when the change is rejected"
        )
