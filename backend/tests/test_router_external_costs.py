"""Integration tests for v5 Session E2 external cost aggregation endpoints.

Per [E-08a]–[E-08d]. Covers project-scoped (workbench) and portfolio-scoped
endpoints, role gating, and shape assertions.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest


HEADERS_CTRL = {"X-Current-User": "persona-controller"}
HEADERS_PL = {"X-Current-User": "persona-pl"}
HEADERS_CCO = {"X-Current-User": "persona-cc-owner"}
HEADERS_EXEC = {"X-Current-User": "persona-exec"}


@pytest.fixture
def seed_external_costs(db, seed_org_base, seed_personas):
    """Seed two projects with external cost lines across multiple vendors and types."""
    from models.financial import (
        Actuals, Baseline, ExternalCostType, Forecast,
    )
    from models.projects import Project

    # External cost types
    db.add_all([
        ExternalCostType(id="ect-consulting", name="Consulting"),
        ExternalCostType(id="ect-cloud", name="Cloud Infrastructure"),
        ExternalCostType(id="ect-licenses", name="Licenses"),
    ])

    # Two projects
    proj_a = Project(
        id="proj-alpha", name="Alpha", status="active",
        capex_opex="capex", start_month="2026-01", end_month="2026-12",
        pl_person_id="p-pm-1",
    )
    proj_b = Project(
        id="proj-beta", name="Beta", status="active",
        capex_opex="capex", start_month="2026-01", end_month="2026-12",
        pl_person_id="p-pm-1",
    )
    db.add_all([proj_a, proj_b])
    db.flush()

    # Project Alpha: Consulting via Acme + Cloud via AWS
    months = ["2026-01", "2026-02", "2026-03"]
    for m in months:
        db.add(Forecast(
            project_id="proj-alpha", month=m, category="external",
            sub_category="ect-consulting", amount_eur=10000.0,
            vendor="Acme", po_number=f"PO-A-{m}", ext_status="ordered",
        ))
        db.add(Baseline(
            project_id="proj-alpha", month=m, category="external",
            sub_category="ect-consulting", amount_eur=9000.0, vendor="Acme",
        ))
        db.add(Forecast(
            project_id="proj-alpha", month=m, category="external",
            sub_category="ect-cloud", amount_eur=5000.0, vendor="AWS",
        ))
    # Single actuals row for Alpha
    db.add(Actuals(
        project_id="proj-alpha", month="2026-01", category="external",
        sub_category="ect-consulting", amount_eur=9500.0, vendor="Acme",
    ))

    # Project Beta: Cloud via AWS + Licenses via Contoso
    for m in months:
        db.add(Forecast(
            project_id="proj-beta", month=m, category="external",
            sub_category="ect-cloud", amount_eur=3000.0, vendor="AWS",
        ))
        db.add(Forecast(
            project_id="proj-beta", month=m, category="external",
            sub_category="ect-licenses", amount_eur=2500.0,
            vendor="Contoso", po_number=f"PO-B-LIC-{m}",
        ))

    # Some internal forecast to ensure the filter excludes them
    db.add(Forecast(
        project_id="proj-alpha", month="2026-01", category="internal",
        sub_category="role-dev", amount_eur=12000.0, hours=100,
    ))

    db.commit()
    return {"alpha": proj_a, "beta": proj_b}


# ---------------------------------------------------------------------------
# Project-scoped: vendor summary
# ---------------------------------------------------------------------------

class TestProjectVendorSummary:
    def test_basic_shape(self, test_client, seed_external_costs):
        resp = test_client.get(
            "/api/workbench/projects/proj-alpha/external-costs/vendor-summary",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "total" in data
        assert data["project_id"] == "proj-alpha"

        # Acme + AWS expected
        names = {row["vendor_name"] for row in data["items"]}
        assert names == {"Acme", "AWS"}

    def test_acme_totals(self, test_client, seed_external_costs):
        resp = test_client.get(
            "/api/workbench/projects/proj-alpha/external-costs/vendor-summary",
            headers=HEADERS_CTRL,
        )
        items = {r["vendor_name"]: r for r in resp.json()["items"]}
        acme = items["Acme"]
        # 3 months × 10k = 30000 forecast, 9k × 3 = 27000 baseline, 9500 actuals
        assert acme["forecast_total"] == 30000.0
        assert acme["baseline_total"] == 27000.0
        assert acme["actuals_total"] == 9500.0
        assert acme["remaining"] == 30000.0 - 9500.0
        assert acme["variance"] == 30000.0 - 27000.0
        assert acme["po_count"] == 3
        assert acme["expense_cost_type"] == "Consulting"

    def test_internal_lines_excluded(self, test_client, seed_external_costs):
        resp = test_client.get(
            "/api/workbench/projects/proj-alpha/external-costs/vendor-summary",
            headers=HEADERS_CTRL,
        )
        # Internal forecast row should not show up as a vendor
        items = {r["vendor_name"] for r in resp.json()["items"]}
        assert all(v in {"Acme", "AWS"} for v in items)

    def test_year_filter(self, test_client, seed_external_costs):
        # No 2025 data — should be empty
        resp = test_client.get(
            "/api/workbench/projects/proj-alpha/external-costs/vendor-summary?year=2025",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        assert resp.json()["total"] == 0

    def test_pl_can_see_own_project(self, test_client, seed_external_costs):
        resp = test_client.get(
            "/api/workbench/projects/proj-alpha/external-costs/vendor-summary",
            headers=HEADERS_PL,
        )
        # persona-pl owns proj-alpha + proj-beta in seed_personas
        assert resp.status_code == 200
        assert resp.json()["total"] == 2

    def test_pl_blocked_from_other_project(self, test_client, db, seed_external_costs):
        from models.projects import Project as P
        # Insert a project the PL doesn't own (no pl_person_id, not in
        # persona-pl's owned_project_ids list)
        db.add(P(
            id="proj-secret", name="Secret", status="active",
            capex_opex="capex", start_month="2026-01", end_month="2026-12",
        ))
        db.commit()

        resp = test_client.get(
            "/api/workbench/projects/proj-secret/external-costs/vendor-summary",
            headers=HEADERS_PL,
        )
        assert resp.status_code == 403

    def test_not_found(self, test_client, seed_external_costs):
        resp = test_client.get(
            "/api/workbench/projects/does-not-exist/external-costs/vendor-summary",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 404

    def test_no_auth(self, test_client, seed_external_costs):
        resp = test_client.get(
            "/api/workbench/projects/proj-alpha/external-costs/vendor-summary",
        )
        assert resp.status_code == 422

    def test_unknown_persona(self, test_client, seed_external_costs):
        resp = test_client.get(
            "/api/workbench/projects/proj-alpha/external-costs/vendor-summary",
            headers={"X-Current-User": "persona-mystery"},
        )
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Project-scoped: category rollup
# ---------------------------------------------------------------------------

class TestProjectCategoryRollup:
    def test_basic_shape(self, test_client, seed_external_costs):
        resp = test_client.get(
            "/api/workbench/projects/proj-alpha/external-costs/category-rollup",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        ct_ids = {row["cost_type_id"] for row in data["items"]}
        assert ct_ids == {"ect-consulting", "ect-cloud"}

    def test_consulting_total(self, test_client, seed_external_costs):
        resp = test_client.get(
            "/api/workbench/projects/proj-alpha/external-costs/category-rollup",
            headers=HEADERS_CTRL,
        )
        rows = {r["cost_type_id"]: r for r in resp.json()["items"]}
        cons = rows["ect-consulting"]
        assert cons["cost_type_name"] == "Consulting"
        assert cons["forecast_total"] == 30000.0
        assert cons["baseline_total"] == 27000.0
        assert cons["actuals_total"] == 9500.0
        assert cons["vendor_count"] == 1  # only Acme

    def test_cost_type_name_resolved(self, test_client, seed_external_costs):
        resp = test_client.get(
            "/api/workbench/projects/proj-alpha/external-costs/category-rollup",
            headers=HEADERS_CTRL,
        )
        names = {row["cost_type_name"] for row in resp.json()["items"]}
        assert "Consulting" in names
        assert "Cloud Infrastructure" in names

    def test_pl_visibility(self, test_client, seed_external_costs):
        resp = test_client.get(
            "/api/workbench/projects/proj-alpha/external-costs/category-rollup",
            headers=HEADERS_PL,
        )
        assert resp.status_code == 200

    def test_year_filter_excludes_other_years(self, test_client, seed_external_costs):
        resp = test_client.get(
            "/api/workbench/projects/proj-alpha/external-costs/category-rollup?year=2030",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        assert resp.json()["total"] == 0


# ---------------------------------------------------------------------------
# Portfolio-scoped: vendor summary
# ---------------------------------------------------------------------------

class TestPortfolioVendorSummary:
    def test_aggregates_across_projects(self, test_client, seed_external_costs):
        resp = test_client.get(
            "/api/portfolio/external-costs/vendor-summary",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        rows = {r["vendor_name"]: r for r in resp.json()["items"]}
        # AWS shows up in both projects
        assert "AWS" in rows
        aws = rows["AWS"]
        assert aws["project_count"] == 2
        # 3 months × (5k alpha + 3k beta) = 24k
        assert aws["forecast_total"] == 24000.0

    def test_top_project_correct(self, test_client, seed_external_costs):
        resp = test_client.get(
            "/api/portfolio/external-costs/vendor-summary",
            headers=HEADERS_CTRL,
        )
        rows = {r["vendor_name"]: r for r in resp.json()["items"]}
        aws = rows["AWS"]
        # Alpha contributes more (15k vs 9k)
        assert aws["top_project_id"] == "proj-alpha"
        assert aws["top_project_name"] == "Alpha"
        assert aws["top_project_amount"] == 15000.0

    def test_acme_single_project(self, test_client, seed_external_costs):
        resp = test_client.get(
            "/api/portfolio/external-costs/vendor-summary",
            headers=HEADERS_CTRL,
        )
        rows = {r["vendor_name"]: r for r in resp.json()["items"]}
        acme = rows["Acme"]
        assert acme["project_count"] == 1
        assert acme["top_project_id"] == "proj-alpha"

    def test_pl_sees_only_own_projects(self, test_client, seed_external_costs):
        resp = test_client.get(
            "/api/portfolio/external-costs/vendor-summary",
            headers=HEADERS_PL,
        )
        assert resp.status_code == 200
        # PL owns alpha + beta — same as controller view here
        # but the helper should still accept PL
        rows = {r["vendor_name"]: r for r in resp.json()["items"]}
        assert "AWS" in rows

    def test_executive_can_read(self, test_client, seed_external_costs):
        resp = test_client.get(
            "/api/portfolio/external-costs/vendor-summary",
            headers=HEADERS_EXEC,
        )
        assert resp.status_code == 200

    def test_year_filter(self, test_client, seed_external_costs):
        resp = test_client.get(
            "/api/portfolio/external-costs/vendor-summary?year=2030",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        assert resp.json()["total"] == 0

    def test_no_auth(self, test_client, seed_external_costs):
        resp = test_client.get("/api/portfolio/external-costs/vendor-summary")
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Portfolio-scoped: category analysis
# ---------------------------------------------------------------------------

class TestPortfolioCategoryAnalysis:
    def test_three_categories(self, test_client, seed_external_costs):
        resp = test_client.get(
            "/api/portfolio/external-costs/category-analysis",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        rows = {r["cost_type_id"]: r for r in resp.json()["items"]}
        assert rows.keys() == {"ect-consulting", "ect-cloud", "ect-licenses"}

    def test_pct_sums_to_100(self, test_client, seed_external_costs):
        resp = test_client.get(
            "/api/portfolio/external-costs/category-analysis",
            headers=HEADERS_CTRL,
        )
        total_pct = sum(r["pct_of_external_total"] for r in resp.json()["items"])
        assert abs(total_pct - 100.0) < 1.0  # rounding tolerance

    def test_cloud_in_both_projects(self, test_client, seed_external_costs):
        resp = test_client.get(
            "/api/portfolio/external-costs/category-analysis",
            headers=HEADERS_CTRL,
        )
        rows = {r["cost_type_id"]: r for r in resp.json()["items"]}
        assert rows["ect-cloud"]["project_count"] == 2

    def test_year_filter(self, test_client, seed_external_costs):
        resp = test_client.get(
            "/api/portfolio/external-costs/category-analysis?year=2026",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        assert resp.json()["total"] == 3


# ---------------------------------------------------------------------------
# Portfolio-scoped: project × vendor matrix
# ---------------------------------------------------------------------------

class TestProjectVendorMatrix:
    def test_basic_shape(self, test_client, seed_external_costs):
        resp = test_client.get(
            "/api/portfolio/external-costs/project-vendor-matrix",
            headers=HEADERS_CTRL,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "projects" in data
        assert "vendors" in data
        assert "cells" in data
        assert "total" in data

    def test_projects_sorted_by_total(self, test_client, seed_external_costs):
        resp = test_client.get(
            "/api/portfolio/external-costs/project-vendor-matrix",
            headers=HEADERS_CTRL,
        )
        projects = resp.json()["projects"]
        # Alpha (45k) should rank above Beta (16.5k)
        assert projects[0]["id"] == "proj-alpha"

    def test_cells_present(self, test_client, seed_external_costs):
        resp = test_client.get(
            "/api/portfolio/external-costs/project-vendor-matrix",
            headers=HEADERS_CTRL,
        )
        cells = resp.json()["cells"]
        # Alpha+AWS, Alpha+Acme, Beta+AWS, Beta+Contoso = 4 cells
        keys = {(c["project_id"], c["vendor_name"]) for c in cells}
        assert keys == {
            ("proj-alpha", "AWS"), ("proj-alpha", "Acme"),
            ("proj-beta", "AWS"), ("proj-beta", "Contoso"),
        }

    def test_grand_total_correct(self, test_client, seed_external_costs):
        resp = test_client.get(
            "/api/portfolio/external-costs/project-vendor-matrix",
            headers=HEADERS_CTRL,
        )
        # Alpha: 30k consulting + 15k cloud = 45k
        # Beta: 9k cloud + 7.5k licenses = 16.5k
        assert resp.json()["total"] == 61500.0

    def test_pl_scoped(self, test_client, seed_external_costs):
        resp = test_client.get(
            "/api/portfolio/external-costs/project-vendor-matrix",
            headers=HEADERS_PL,
        )
        assert resp.status_code == 200

    def test_no_auth(self, test_client, seed_external_costs):
        resp = test_client.get(
            "/api/portfolio/external-costs/project-vendor-matrix",
        )
        assert resp.status_code == 422
