"""Tests for v5.1 W4 C-07 role denormalisation in external cost aggregation.

Covers:
  - role_type_id + role_name on each ProjectVendorSummaryRow
  - mixed-role exclusion (vendor with multiple roles → role_type_id=None)
  - role_type_id filter parameter on compute_project_vendor_summary
"""

from __future__ import annotations

import pytest

from models.financial import Actuals, Baseline, ExternalCostType, Forecast
from models.organization import Location, CompetenceCenter, CostCenter
from models.people import RoleType
from models.projects import Project
from services.external_cost_aggregation import compute_project_vendor_summary


@pytest.fixture
def role_seed_project(db):
    """Project with three vendors: single-role, mixed-role, and no-role."""
    db.add_all([
        Location(id="loc-muc", city="Munich", country="Germany"),
        CompetenceCenter(id="comp-bso", name="BSO"),
        CostCenter(
            id="cc-muc-bso", name="Munich BSO",
            location_id="loc-muc", competence_center_id="comp-bso",
        ),
        RoleType(id="role-sr-arch", name="Senior Solution Architect"),
        RoleType(id="role-data-eng", name="Data Engineer"),
        RoleType(id="role-data-sci", name="Data Scientist"),
        ExternalCostType(id="ect-consulting", name="Consulting"),
        ExternalCostType(id="ect-cloud", name="Cloud Infrastructure"),
        Project(
            id="proj-roles", name="Role Test Project",
            status="active", capex_opex="capex",
            start_month="2026-01", is_service=False, is_active=True,
        ),
    ])
    db.commit()

    # Vendor "Acme" — single role across all rows (role-sr-arch)
    for month in ["2026-01", "2026-02"]:
        db.add(Forecast(
            project_id="proj-roles", month=month, category="external",
            sub_category="ect-consulting", amount_eur=10000.0,
            vendor="Acme", role_type_id="role-sr-arch",
            capex_opex="capex",
        ))

    # Vendor "Globex" — mixed roles (role-sr-arch + role-data-eng)
    db.add(Forecast(
        project_id="proj-roles", month="2026-01", category="external",
        sub_category="ect-consulting", amount_eur=8000.0,
        vendor="Globex", role_type_id="role-sr-arch",
        capex_opex="capex",
    ))
    db.add(Forecast(
        project_id="proj-roles", month="2026-02", category="external",
        sub_category="ect-consulting", amount_eur=6000.0,
        vendor="Globex", role_type_id="role-data-eng",
        capex_opex="capex",
    ))

    # Vendor "Initech" — no role assignment (NULL role_type_id)
    db.add(Forecast(
        project_id="proj-roles", month="2026-01", category="external",
        sub_category="ect-cloud", amount_eur=3000.0,
        vendor="Initech", role_type_id=None,
        capex_opex="capex",
    ))

    db.commit()
    return {"project_id": "proj-roles"}


class TestVendorSummaryRoleField:
    """v5.1 C-07: role_type_id + role_name denormalised onto each row."""

    def test_role_field_per_row(self, db, role_seed_project):
        """Each row carries role_type_id + role_name (or null)."""
        rows = compute_project_vendor_summary(db, "proj-roles")
        by_vendor = {r["vendor_name"]: r for r in rows}

        # Acme — single role → fields populated
        assert by_vendor["Acme"]["role_type_id"] == "role-sr-arch"
        assert by_vendor["Acme"]["role_name"] == "Senior Solution Architect"

        # Globex — mixed roles → fields null
        assert by_vendor["Globex"]["role_type_id"] is None
        assert by_vendor["Globex"]["role_name"] is None

        # Initech — no role → fields null
        assert by_vendor["Initech"]["role_type_id"] is None
        assert by_vendor["Initech"]["role_name"] is None

    def test_filter_by_role(self, db, role_seed_project):
        """role_type_id filter narrows to vendors with that role."""
        rows = compute_project_vendor_summary(
            db, "proj-roles", role_type_id="role-sr-arch",
        )
        assert len(rows) == 1
        assert rows[0]["vendor_name"] == "Acme"
        # Globex's mixed-role + Initech's null role both excluded — correct
        # per the spec (filter requires the vendor to share the role
        # uniformly, not just touch it once).

    def test_filter_unknown_role_returns_empty(self, db, role_seed_project):
        """A role with no matching vendors returns an empty list."""
        rows = compute_project_vendor_summary(
            db, "proj-roles", role_type_id="role-data-sci",
        )
        assert rows == []

    def test_no_filter_includes_all_vendors(self, db, role_seed_project):
        """Default behaviour (role_type_id=None) returns every vendor."""
        rows = compute_project_vendor_summary(db, "proj-roles")
        names = {r["vendor_name"] for r in rows}
        assert names == {"Acme", "Globex", "Initech"}
