"""v5.1 W5 C-09 — Monthly grid endpoint integration tests.

Covers GET /api/workbench/projects/{id}/external-costs/monthly-grid:
  - Response shape (items / year_columns / year / project_id / total).
  - Per-cell zero/null omission.
  - Filter parameters (year, role_type_id, category).
  - Per-cell ext_status + line-level latest-status semantics.
  - Line-level open_po arithmetic (po_amount - actuals.amount_eur, clamped).
  - Row-expansion content (delivery_schedule + invoice_history) inlined.
"""

from __future__ import annotations

from datetime import date

import pytest

HEADERS_CTRL = {"X-Current-User": "persona-controller"}


@pytest.fixture
def seed_grid_project(db, seed_org_base, seed_personas):
    """Project with multiple lines exercising every cell shape and status.

    Three external lines:
      - Acme / consulting / role-sr-arch / PO-X1 — full procurement
        lifecycle across 2025-12 (accrual) → 2026-04 (goods_received) →
        2026-06 (ordered) → 2026-09 (planned). Has a delivery + invoice.
      - Globex / cloud / no-role / no-PO — pure planned line.
      - Initech / licenses / role-data-eng / PO-X2 — single open status
        row in 2026-04 with partial actuals.

    Year filter exercise: lines span 2025 + 2026 so a year=2025 query
    narrows to the December accrual cell only.
    """
    from datetime import date

    from models.financial import (
        Actuals, Baseline, ExternalCostDelivery, ExternalCostInvoice,
        ExternalCostType, Forecast,
    )
    from models.people import RoleType
    from models.projects import Project

    db.add_all([
        ExternalCostType(id="ect-consulting", name="Consulting"),
        ExternalCostType(id="ect-cloud", name="Cloud"),
        ExternalCostType(id="ect-licenses", name="Licenses"),
        RoleType(id="role-sr-arch", name="Senior Solution Architect"),
        RoleType(id="role-data-eng", name="Data Engineer"),
        Project(
            id="proj-grid", name="Grid Test", status="active",
            capex_opex="capex", start_month="2025-12", end_month="2026-12",
            pl_person_id="p-pm-1",
        ),
    ])
    db.flush()

    # ----- Acme line — full lifecycle -----
    months_states = [
        ("2025-12", "accrual"),
        ("2026-01", "invoiced"),
        ("2026-02", "invoiced"),
        ("2026-03", "invoiced"),
        ("2026-04", "goods_received"),
        ("2026-06", "ordered"),
        ("2026-09", "planned"),
    ]
    for month, status in months_states:
        is_accrual = status == "accrual"
        is_ordered = status == "ordered"
        db.add(Forecast(
            project_id="proj-grid", month=month, category="external",
            sub_category="ect-consulting", amount_eur=10000.0,
            description="Accenture consulting", vendor="Acme",
            ext_status=status, po_number="PO-X1",
            role_type_id="role-sr-arch",
            po_amount=10000.0 if is_ordered else 0,
            accrual_amount=10000.0 if is_accrual else 0,
            contract_end_month="2026-12",
        ))
        db.add(Baseline(
            project_id="proj-grid", month=month, category="external",
            sub_category="ect-consulting", amount_eur=9500.0,
            vendor="Acme", role_type_id="role-sr-arch",
        ))
    # Past actuals tied to the PO + invoiced.
    for month, status in months_states[:5]:  # past months only
        is_accrual = status == "accrual"
        amt_actuals = 0 if is_accrual else 10000.0
        invoiced = 10000.0 if status == "invoiced" else 0
        db.add(Actuals(
            project_id="proj-grid", month=month, category="external",
            sub_category="ect-consulting", amount_eur=amt_actuals,
            vendor="Acme", po_number="PO-X1",
            ext_status=status, role_type_id="role-sr-arch",
            invoiced_amount=invoiced,
        ))

    # Delivery + invoice rows for Acme PO.
    db.add_all([
        ExternalCostDelivery(
            project_id="proj-grid", vendor="Acme", po_number="PO-X1",
            sub_category="ect-consulting",
            milestone_name="Phase 1", expected_month="2026-01",
            expected_amount=10000.0, delivered_month="2026-01",
        ),
        ExternalCostDelivery(
            project_id="proj-grid", vendor="Acme", po_number="PO-X1",
            sub_category="ect-consulting",
            milestone_name="Phase 2", expected_month="2026-06",
            expected_amount=10000.0, delivered_month=None,
        ),
        ExternalCostInvoice(
            project_id="proj-grid", vendor="Acme", po_number="PO-X1",
            invoice_number="INV-001", invoice_date=date(2026, 1, 15),
            amount=10000.0, status="paid",
        ),
    ])

    # ----- Globex line — pure planned, no PO -----
    for month in ["2026-05", "2026-06"]:
        db.add(Forecast(
            project_id="proj-grid", month=month, category="external",
            sub_category="ect-cloud", amount_eur=2500.0,
            description="Globex cloud", vendor="Globex",
            ext_status="planned",
        ))

    # ----- Initech open PO line -----
    db.add(Forecast(
        project_id="proj-grid", month="2026-04", category="external",
        sub_category="ect-licenses", amount_eur=8000.0,
        description="Initech license", vendor="Initech",
        ext_status="open", po_number="PO-X2",
        role_type_id="role-data-eng",
        po_amount=8000.0, accrual_amount=0,
        contract_end_month="2027-06",
    ))
    db.add(Actuals(
        project_id="proj-grid", month="2026-04", category="external",
        sub_category="ect-licenses", amount_eur=3000.0,
        vendor="Initech", po_number="PO-X2", ext_status="open",
        role_type_id="role-data-eng", invoiced_amount=1000.0,
    ))

    db.commit()
    return {"project_id": "proj-grid"}


# ---------------------------------------------------------------------------
# Shape + filter coverage
# ---------------------------------------------------------------------------

class TestMonthlyGridShape:
    def test_monthly_grid_basic_shape(self, test_client, seed_grid_project):
        """Items / year_columns / year / project_id / total all present."""
        resp = test_client.get(
            "/api/workbench/projects/proj-grid/external-costs/monthly-grid",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        data = resp.json()
        for key in ("items", "year_columns", "year", "project_id", "total"):
            assert key in data
        assert data["project_id"] == "proj-grid"
        assert data["total"] == len(data["items"])
        # Three lines: Acme / Globex / Initech.
        assert data["total"] == 3
        # year_columns are sorted YYYY-MM strings.
        assert data["year_columns"] == sorted(data["year_columns"])
        assert "2025-12" in data["year_columns"]
        assert "2026-04" in data["year_columns"]


class TestMonthlyGridCells:
    def test_cell_omits_zero_values(self, test_client, seed_grid_project):
        """Cells with accrual=0 / actuals=0 / po_obligo=0 omit the key."""
        resp = test_client.get(
            "/api/workbench/projects/proj-grid/external-costs/monthly-grid",
            headers=HEADERS_CTRL,
        )
        items = {it["vendor"]: it for it in resp.json()["items"]}
        acme = items["Acme"]
        cell_by_month = {c["month"]: c for c in acme["monthly_cells"]}

        # 2025-12 = accrual: forecast + accrual + status, NO actuals key.
        dec = cell_by_month["2025-12"]
        assert "forecast" in dec
        assert "accrual" in dec
        assert "actuals" not in dec  # accrual rows have actuals=0
        assert "po_obligo" not in dec
        assert dec["status"] == "accrual"

        # 2026-01 = invoiced: forecast + actuals + status, NO accrual.
        jan = cell_by_month["2026-01"]
        assert "forecast" in jan
        assert "actuals" in jan
        assert "accrual" not in jan
        assert "po_obligo" not in jan

        # 2026-06 = ordered (future): forecast + po_obligo + status,
        # NO actuals (no actuals for future months).
        jun = cell_by_month["2026-06"]
        assert "forecast" in jun
        assert "po_obligo" in jun
        assert "actuals" not in jun
        assert "accrual" not in jun

    def test_status_per_cell_and_line(self, test_client, seed_grid_project):
        """Cell-level status comes from Forecast.ext_status; line-level
        status is the latest non-null past-month status capped at the demo
        date. Acme: months 2025-12 (accrual) → 2026-04 (goods_received)
        in the past, → 2026-06 (ordered) future. Demo date = 2026-04 →
        line status = goods_received.
        """
        resp = test_client.get(
            "/api/workbench/projects/proj-grid/external-costs/monthly-grid",
            headers=HEADERS_CTRL,
        )
        items = {it["vendor"]: it for it in resp.json()["items"]}
        acme = items["Acme"]
        # Per-cell statuses differ across months.
        statuses = {c.get("status") for c in acme["monthly_cells"]}
        assert "accrual" in statuses
        assert "invoiced" in statuses
        assert "goods_received" in statuses
        assert "ordered" in statuses
        assert "planned" in statuses
        # Line-level status = latest status at demo date (2026-04).
        assert acme["status"] == "goods_received"


# ---------------------------------------------------------------------------
# Filter parameters
# ---------------------------------------------------------------------------

class TestMonthlyGridFilters:
    def test_role_filter_narrows(self, test_client, seed_grid_project):
        """role_type_id filter excludes lines whose role differs."""
        resp = test_client.get(
            "/api/workbench/projects/proj-grid/external-costs/monthly-grid"
            "?role_type_id=role-sr-arch",
            headers=HEADERS_CTRL,
        )
        items = resp.json()["items"]
        assert len(items) == 1
        assert items[0]["vendor"] == "Acme"
        assert items[0]["role_type_id"] == "role-sr-arch"

    def test_role_filter_excludes_unrolled(self, test_client, seed_grid_project):
        """A role with no matching lines returns an empty result."""
        resp = test_client.get(
            "/api/workbench/projects/proj-grid/external-costs/monthly-grid"
            "?role_type_id=role-mystery",
            headers=HEADERS_CTRL,
        )
        assert resp.json()["items"] == []
        assert resp.json()["total"] == 0

    def test_category_filter_narrows(self, test_client, seed_grid_project):
        """category filter narrows to one sub_category."""
        resp = test_client.get(
            "/api/workbench/projects/proj-grid/external-costs/monthly-grid"
            "?category=ect-consulting",
            headers=HEADERS_CTRL,
        )
        items = resp.json()["items"]
        assert len(items) == 1
        assert items[0]["sub_category"] == "ect-consulting"
        assert items[0]["vendor"] == "Acme"

    def test_year_filter_narrows_cells(self, test_client, seed_grid_project):
        """year filter narrows cells to that fiscal year."""
        resp = test_client.get(
            "/api/workbench/projects/proj-grid/external-costs/monthly-grid"
            "?year=2025",
            headers=HEADERS_CTRL,
        )
        data = resp.json()
        # Only Acme has a 2025 cell (2025-12).
        items = data["items"]
        assert len(items) == 1
        assert items[0]["vendor"] == "Acme"
        cells = items[0]["monthly_cells"]
        assert len(cells) == 1
        assert cells[0]["month"] == "2025-12"
        assert data["year"] == 2025


# ---------------------------------------------------------------------------
# open_po arithmetic + row-expansion content
# ---------------------------------------------------------------------------

class TestOpenPoArithmetic:
    def test_open_po_arithmetic(self, test_client, seed_grid_project):
        """Per-line open_po = sum(po_amount) - sum(actuals.amount_eur),
        clamped at 0. remaining_not_invoiced = open_po - sum(invoiced),
        clamped at 0.

        Acme PO-X1: po_amount only on 2026-06 ordered row = 10000.
        Actuals.amount_eur tied to PO-X1: invoiced months total 30000
        (3 months × 10000), goods_received 2026-04 = 10000, accrual
        2025-12 = 0 → total 40000.
        open_po = max(0, 10000 - 40000) = 0.
        remaining_not_invoiced = max(0, 0 - 30000) = 0.

        Initech PO-X2: po_amount = 8000, actuals = 3000, invoiced = 1000.
        open_po = max(0, 8000 - 3000) = 5000.
        remaining_not_invoiced = max(0, 5000 - 1000) = 4000.
        """
        resp = test_client.get(
            "/api/workbench/projects/proj-grid/external-costs/monthly-grid",
            headers=HEADERS_CTRL,
        )
        items = {it["vendor"]: it for it in resp.json()["items"]}
        acme = items["Acme"]
        assert acme["open_po"] == 0.0
        assert acme["remaining_not_invoiced"] == 0.0

        initech = items["Initech"]
        assert initech["open_po"] == 5000.0
        assert initech["remaining_not_invoiced"] == 4000.0


class TestMonthlyGridExpansion:
    def test_delivery_schedule_present_on_expansion(
        self, test_client, seed_grid_project,
    ):
        """At least one item carries a non-empty delivery_schedule,
        and only PO-tagged lines populate it.
        """
        resp = test_client.get(
            "/api/workbench/projects/proj-grid/external-costs/monthly-grid",
            headers=HEADERS_CTRL,
        )
        items = {it["vendor"]: it for it in resp.json()["items"]}

        acme = items["Acme"]
        assert len(acme["delivery_schedule"]) >= 1
        # Each delivery row has the expected schema.
        ds = acme["delivery_schedule"][0]
        for key in ("milestone_name", "expected_month",
                    "expected_amount", "delivered_month"):
            assert key in ds

        # Globex (no PO) → empty list.
        assert items["Globex"]["delivery_schedule"] == []

    def test_invoice_history_present_on_expansion(
        self, test_client, seed_grid_project,
    ):
        """At least one item carries a non-empty invoice_history."""
        resp = test_client.get(
            "/api/workbench/projects/proj-grid/external-costs/monthly-grid",
            headers=HEADERS_CTRL,
        )
        items = {it["vendor"]: it for it in resp.json()["items"]}

        acme = items["Acme"]
        assert len(acme["invoice_history"]) >= 1
        inv = acme["invoice_history"][0]
        for key in ("invoice_number", "invoice_date", "amount", "status"):
            assert key in inv
        # Date is ISO-formatted YYYY-MM-DD.
        assert len(inv["invoice_date"]) == 10
        assert inv["invoice_date"][4] == "-" and inv["invoice_date"][7] == "-"

        # Globex (no PO) → empty list.
        assert items["Globex"]["invoice_history"] == []
