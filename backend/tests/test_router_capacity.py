"""Integration tests for routers/capacity.py."""

from unittest.mock import patch

import pytest


HEADERS_CCO = {"X-Current-User": "persona-cc-owner"}
HEADERS_CTRL = {"X-Current-User": "persona-controller"}


@patch("routers.capacity.DEMO_DATE", "2026-04")
class TestCapacityRouter:
    def test_get_context(self, test_client, seed_personas):
        resp = test_client.get("/api/capacity/context", headers=HEADERS_CCO)
        assert resp.status_code == 200
        data = resp.json()
        assert "default_tab" in data
        assert "managed_cost_center_id" in data

    def test_get_context_controller(self, test_client, seed_personas):
        resp = test_client.get("/api/capacity/context", headers=HEADERS_CTRL)
        assert resp.status_code == 200

    def test_get_team_summary(self, test_client, seed_personas):
        resp = test_client.get("/api/capacity/my-team/cc-muc-dev/summary",
                               headers=HEADERS_CCO)
        assert resp.status_code == 200
        data = resp.json()
        assert "headcount" in data

    def test_get_team_heatmap(self, test_client, seed_personas):
        resp = test_client.get("/api/capacity/my-team/cc-muc-dev/heatmap",
                               headers=HEADERS_CCO)
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "total" in data

    def test_get_requests(self, test_client, seed_personas):
        resp = test_client.get("/api/capacity/requests/cc-muc-dev",
                               headers=HEADERS_CCO)
        assert resp.status_code == 200

    def test_no_auth(self, test_client, seed_personas):
        resp = test_client.get("/api/capacity/context")
        assert resp.status_code == 422

    def test_org_summary(self, test_client, seed_personas):
        resp = test_client.get("/api/capacity/org/summary", headers=HEADERS_CTRL)
        assert resp.status_code == 200

    def test_org_heatmap(self, test_client, seed_personas):
        resp = test_client.get("/api/capacity/org/heatmap", headers=HEADERS_CTRL)
        assert resp.status_code == 200

    def test_project_confirmation_pending(self, test_client, seed_personas):
        resp = test_client.get("/api/capacity/project-confirmation/pending",
                               headers=HEADERS_CCO)
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# v5.1 C-07 — synthetic 'External' role row in team heatmap
# ---------------------------------------------------------------------------


def _seed_c07_external_fixture(
    db,
    *,
    role_id: str = "role-senior-consultant",
    project_id: str = "proj-c07",
    pl_person_id: str | None = None,
    rate_eur: float = 120.0,
    rate_effective_date: str = "2024-01-01",
):
    """Insert the org base needed for C-07 tests on top of ``seed_org_base``.

    Adds:
      * a 'role-senior-consultant' RoleType
      * one Person with that role in cc-muc-dev (so the team heatmap
        produces a role group the External row can attach to)
      * a RateTable row (€120/h by default)
      * a Project the cost-center person is allocated to in 2026-04
        (so the project is "in scope" for the heatmap)

    Returns a dict with the IDs the caller can use to add Forecast rows.
    """
    from models.capacity import Allocation
    from models.financial import Forecast
    from models.people import Person, RateTable, RoleType
    from models.projects import Project

    role = RoleType(id=role_id, name="Senior Consultant")
    person = Person(
        id="p-sc-1", name="Senior Consultant One",
        role_type_id=role_id, cost_center_id="cc-muc-dev",
        competence_center_id="comp-dev",
    )
    rate = RateTable(
        role_type_id=role_id,
        competence_center_id="comp-dev",
        hourly_rate=rate_eur,
        effective_date=rate_effective_date,
    )
    project = Project(
        id=project_id, name="C07 Test Project", pipeline_stage="Active",
        capex_opex="opex", start_month="2026-01", end_month="2026-12",
        pl_person_id=pl_person_id,
    )
    alloc = Allocation(
        person_id="p-sc-1", project_id=project_id,
        month="2026-04", hours=80.0, is_confirmed=True,
    )
    db.add_all([role, person, rate, project, alloc])
    db.commit()

    return {
        "role_id": role_id,
        "person_id": "p-sc-1",
        "project_id": project_id,
        "rate_eur": rate_eur,
    }


def _add_external_forecast(
    db,
    *,
    project_id: str,
    role_type_id: str,
    month: str,
    amount_eur: float,
    vendor: str = "Accenture",
):
    from models.financial import Forecast
    f = Forecast(
        project_id=project_id, month=month,
        category="external", sub_category="consulting",
        amount_eur=amount_eur, role_type_id=role_type_id,
        vendor=vendor,
    )
    db.add(f)
    db.commit()


@patch("routers.capacity.DEMO_DATE", "2026-04")
class TestTeamHeatmapExternalRow:
    """Tests for the C-07 'External' synthetic row on the team heatmap."""

    def test_team_heatmap_external_row_present_when_external_role_seed(
        self, test_client, seed_personas, db,
    ):
        """A project with role-tagged external rows surfaces an External row."""
        ids = _seed_c07_external_fixture(db)
        _add_external_forecast(
            db, project_id=ids["project_id"],
            role_type_id=ids["role_id"], month="2026-04",
            amount_eur=19_200.0,
        )

        resp = test_client.get(
            "/api/capacity/my-team/cc-muc-dev/heatmap",
            headers=HEADERS_CCO,
        )
        assert resp.status_code == 200
        data = resp.json()

        # Find the role group for senior consultant
        sc_row = next(
            (r for r in data["items"] if r["role_id"] == ids["role_id"]),
            None,
        )
        assert sc_row is not None
        assert sc_row["external"] is not None
        assert sc_row["external"]["label"] == "External"
        # 12 months in the default window (Apr 2026 → Mar 2027)
        assert len(sc_row["external"]["fte_equivalent"]) == 12

    def test_team_heatmap_external_fte_calculation(
        self, test_client, seed_personas, db,
    ):
        """€19,200 / €120/h / 160h = 1.0 FTE for the matching month."""
        ids = _seed_c07_external_fixture(db)
        _add_external_forecast(
            db, project_id=ids["project_id"],
            role_type_id=ids["role_id"], month="2026-04",
            amount_eur=19_200.0,
        )

        resp = test_client.get(
            "/api/capacity/my-team/cc-muc-dev/heatmap",
            headers=HEADERS_CCO,
        )
        assert resp.status_code == 200
        data = resp.json()
        sc_row = next(r for r in data["items"] if r["role_id"] == ids["role_id"])
        cells = {c["month"]: c["value"] for c in sc_row["external"]["fte_equivalent"]}

        # Exact arithmetic: 19200 / 120 / 160 = 1.0
        assert cells["2026-04"] == 1.0
        # Other months are zero-filled
        assert cells["2026-05"] == 0.0
        assert cells["2027-03"] == 0.0

    def test_team_heatmap_external_row_absent_when_no_role_assignment(
        self, test_client, seed_personas, db,
    ):
        """Category='external' WITHOUT role_type_id must not produce an
        External row — RoleHeatmapRow.external stays None."""
        ids = _seed_c07_external_fixture(db)
        # Add an external forecast row WITHOUT role_type_id (simulating
        # a generic licence / hardware line item).
        _add_external_forecast(
            db, project_id=ids["project_id"],
            role_type_id=None, month="2026-04",
            amount_eur=50_000.0,
            vendor="Microsoft",
        )

        resp = test_client.get(
            "/api/capacity/my-team/cc-muc-dev/heatmap",
            headers=HEADERS_CCO,
        )
        assert resp.status_code == 200
        data = resp.json()
        sc_row = next(
            (r for r in data["items"] if r["role_id"] == ids["role_id"]),
            None,
        )
        # The role group exists (because we have a Person with that role)
        # but `external` should be None — no role-tagged external lines.
        assert sc_row is not None
        assert sc_row["external"] is None

    def test_team_heatmap_aggregates_multiple_vendors_per_role(
        self, test_client, seed_personas, db,
    ):
        """Two vendors on the same role+month sum into one External row cell."""
        ids = _seed_c07_external_fixture(db)
        # Accenture + Thoughtworks, both role-senior-consultant on the same project
        _add_external_forecast(
            db, project_id=ids["project_id"],
            role_type_id=ids["role_id"], month="2026-04",
            amount_eur=19_200.0, vendor="Accenture",
        )
        _add_external_forecast(
            db, project_id=ids["project_id"],
            role_type_id=ids["role_id"], month="2026-04",
            amount_eur=9_600.0, vendor="Thoughtworks",
        )

        resp = test_client.get(
            "/api/capacity/my-team/cc-muc-dev/heatmap",
            headers=HEADERS_CCO,
        )
        assert resp.status_code == 200
        data = resp.json()
        sc_row = next(r for r in data["items"] if r["role_id"] == ids["role_id"])
        ext_cells = {c["month"]: c["value"] for c in sc_row["external"]["fte_equivalent"]}

        # (19200 + 9600) / 120 / 160 = 28800 / 19200 = 1.5 FTE
        assert ext_cells["2026-04"] == 1.5
