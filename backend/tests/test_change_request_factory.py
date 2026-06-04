"""Unit tests for services/change_request_factory.py.

The factory is the shared CR-creation capability reused by the forecast-cycle
wizard and the What-If Simulator's promote / apply-to-forecast. Covers:
- one CR per group with details + per-group status,
- resource requests targeting the **per-group** cost centre (the previously
  hard-coded ``cc-muc-apd`` bug),
- re-run dedupe of prior *draft* CRs (and that non-draft CRs survive),
- empty groups skipped,
- cost-centre grouping mirrors the wizard.
"""
import pytest

from models.capacity import Allocation, ResourceRequest
from models.change_requests import ChangeRequest, CRChangeDetail
from models.scenarios import Scenario
from services.change_request_factory import (
    CRDetailInput,
    CRGroupInput,
    create_change_requests,
    group_details_by_cost_center,
)


def _internal(role="role-dev", month="2026-01", old="10", new="15"):
    return CRDetailInput(
        category="internal", field_changed=role, old_value=old, new_value=new,
        delta=str(float(new) - float(old)), line_item_type=role, month=month,
    )


def _external(ct="ct-licence", month="2026-01", old="0", new="5000"):
    return CRDetailInput(
        category="external", field_changed=ct, old_value=old, new_value=new,
        delta=str(float(new) - float(old)), line_item_type=ct, month=month,
    )


def _group(details, *, cc="cc-muc-dev", cat="resource", status=None):
    return CRGroupInput(
        cost_center_id=cc, cost_center_name="Munich Development",
        change_category=cat, summary="Forecast update: Munich Development",
        justification=None, details=details, status=status,
    )


@pytest.fixture
def factory_world(db, seed_org_base, create_test_project):
    create_test_project("proj-fac", pl_person_id="p-pm-1")
    sc = Scenario(name="Fac", author_id="p-pm-1", status="private")
    db.add(sc)
    db.flush()
    return {"scenario_id": sc.id}


class TestCreateChangeRequests:
    def test_one_cr_per_group_with_details(self, db, factory_world):
        sid = factory_world["scenario_id"]
        crs = create_change_requests(
            db, project_id="proj-fac", submitted_by_id="p-pm-1",
            groups=[_group([_internal(), _internal(month="2026-02")])],
            initial_status="draft", source_scenario_id=sid,
        )
        db.commit()
        assert len(crs) == 1
        cr = crs[0]
        assert cr.status == "draft"
        assert cr.change_category == "resource"
        assert cr.submitted_by_id == "p-pm-1"
        assert cr.source_scenario_id == sid
        details = db.query(CRChangeDetail).filter_by(change_request_id=cr.id).all()
        assert len(details) == 2

    def test_resource_request_uses_per_group_cost_centre(self, db, factory_world):
        """The RR targets the group's CC (cc-muc-dev), not the old hard-coded
        cc-muc-apd — the latent bug this refactor fixes."""
        crs = create_change_requests(
            db, project_id="proj-fac", submitted_by_id="p-pm-1",
            groups=[_group([_internal(), _internal(month="2026-02")])],
            initial_status="draft", source_scenario_id=factory_world["scenario_id"],
        )
        db.commit()
        rr = db.query(ResourceRequest).filter_by(change_request_id=crs[0].id).first()
        assert rr is not None
        assert rr.cost_center_id == "cc-muc-dev"
        assert rr.cost_center_id != "cc-muc-apd"
        assert rr.role_type_id == "role-dev"

    def test_per_group_status_overrides_call_status(self, db, factory_world):
        crs = create_change_requests(
            db, project_id="proj-fac", submitted_by_id="p-pm-1",
            groups=[_group([_internal()], status="pending_cc_confirmation")],
            initial_status="draft",
        )
        db.commit()
        assert crs[0].status == "pending_cc_confirmation"

    def test_empty_group_skipped(self, db, factory_world):
        crs = create_change_requests(
            db, project_id="proj-fac", submitted_by_id="p-pm-1",
            groups=[_group([])], initial_status="draft",
        )
        db.commit()
        assert crs == []
        assert db.query(ChangeRequest).filter_by(project_id="proj-fac").count() == 0

    def test_external_group_creates_no_resource_request(self, db, factory_world):
        crs = create_change_requests(
            db, project_id="proj-fac", submitted_by_id="p-pm-1",
            groups=[_group([_external()], cat="external_cost")],
            initial_status="draft",
        )
        db.commit()
        assert crs[0].change_category == "external_cost"
        assert db.query(ResourceRequest).filter_by(change_request_id=crs[0].id).count() == 0


class TestDedupe:
    def test_rerun_replaces_prior_drafts(self, db, factory_world):
        sid = factory_world["scenario_id"]
        first = create_change_requests(
            db, project_id="proj-fac", submitted_by_id="p-pm-1",
            groups=[_group([_internal()])], initial_status="draft",
            source_scenario_id=sid,
        )
        db.commit()
        first_id = first[0].id

        second = create_change_requests(
            db, project_id="proj-fac", submitted_by_id="p-pm-1",
            groups=[_group([_internal(new="20")])], initial_status="draft",
            source_scenario_id=sid,
        )
        db.commit()
        # Prior draft replaced, not duplicated.
        drafts = db.query(ChangeRequest).filter_by(
            source_scenario_id=sid, project_id="proj-fac", status="draft",
        ).all()
        assert len(drafts) == 1
        # The surviving draft reflects the second call's data (regenerated).
        surviving_detail = db.query(CRChangeDetail).filter_by(
            change_request_id=second[0].id,
        ).one()
        assert surviving_detail.new_value == "20"

    def test_non_draft_cr_survives_rerun(self, db, factory_world):
        sid = factory_world["scenario_id"]
        first = create_change_requests(
            db, project_id="proj-fac", submitted_by_id="p-pm-1",
            groups=[_group([_internal()])], initial_status="draft",
            source_scenario_id=sid,
        )
        db.commit()
        # PL submits it into the pipeline.
        first[0].status = "pending_cc_confirmation"
        db.commit()

        create_change_requests(
            db, project_id="proj-fac", submitted_by_id="p-pm-1",
            groups=[_group([_internal(new="20")])], initial_status="draft",
            source_scenario_id=sid,
        )
        db.commit()
        # The submitted one is untouched; a fresh draft also exists.
        assert db.query(ChangeRequest).filter_by(
            source_scenario_id=sid, status="pending_cc_confirmation",
        ).count() == 1
        assert db.query(ChangeRequest).filter_by(
            source_scenario_id=sid, status="draft",
        ).count() == 1


class TestGroupDetailsByCostCenter:
    def test_splits_by_cost_centre(self, db, seed_org_base, create_test_project):
        from models.organization import CostCenter
        from models.people import Person, RoleType

        create_test_project("proj-grp", pl_person_id="p-pm-1")
        # A second cost centre with its own role + allocated person.
        db.add(CostCenter(id="cc-bud", name="Budapest", location_id="loc-muc",
                          competence_center_id="comp-dev"))
        db.add(RoleType(id="role-arch", name="Architect"))
        db.add(Person(id="p-bud-1", name="Bud One", role_type_id="role-arch",
                      cost_center_id="cc-bud", competence_center_id="comp-dev"))
        db.add(Allocation(person_id="p-dev-1", project_id="proj-grp", month="2026-01", hours=10))
        db.add(Allocation(person_id="p-bud-1", project_id="proj-grp", month="2026-01", hours=10))
        db.commit()

        details = [_internal(role="role-dev"), _internal(role="role-arch")]
        groups = group_details_by_cost_center(db, "proj-grp", details)
        by_cc = {g.cost_center_id: g for g in groups}
        assert set(by_cc) == {"cc-muc-dev", "cc-bud"}
        assert all(g.change_category == "resource" for g in groups)
        assert by_cc["cc-bud"].cost_center_name == "Budapest"

    def test_external_defaults_to_primary_cost_centre(self, db, seed_org_base, create_test_project):
        create_test_project("proj-grp2", pl_person_id="p-pm-1")
        db.add(Allocation(person_id="p-dev-1", project_id="proj-grp2", month="2026-01", hours=10))
        db.commit()
        groups = group_details_by_cost_center(db, "proj-grp2", [_external()])
        assert len(groups) == 1
        assert groups[0].change_category == "external_cost"
