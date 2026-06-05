"""Part D verification — isolated harness for the NEW-SIM-NOOP fix.

Reproduces the round-2 lead method: apply a known-good control action, then each
previously-no-op lever, asserting the cumulative financial delta MOVES for the 6
cost-moving levers. reassign_hierarchy is checked separately: financial delta must
stay flat while the investment-mix dimension re-buckets the project's total.

Uses FastAPI TestClient against the live app (real config → current_period 2026-06,
real viper_demo.db), so it mirrors the browser/curl path, not the pinned test fixture.

Run:  cd backend && .venv/bin/python ../qa/verify_sim_noop.py
"""
import os
import sys

BACKEND = os.path.join(os.path.dirname(__file__), "..", "backend")
sys.path.insert(0, os.path.abspath(BACKEND))
os.chdir(os.path.abspath(BACKEND))

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import func  # noqa: E402
from main import app  # noqa: E402
from database import SessionLocal  # noqa: E402
from config import get_current_period  # noqa: E402
from services.calendar import open_forecast_month  # noqa: E402
from models.projects import Project  # noqa: E402
from models.financial import Forecast  # noqa: E402
from models.organization import ProjectGroupingAssignment, GroupingEntity  # noqa: E402
from services.portfolio_service import (  # noqa: E402
    get_project_entity_info, get_top_level_entity_type_id,
    _get_projects_for_entity_recursive,
)

client = TestClient(app)
H = {"X-Current-User": "persona-controller"}
FAILS = []


def check(name, cond, detail=""):
    status = "PASS" if cond else "FAIL"
    if not cond:
        FAILS.append(name)
    print(f"  [{status}] {name}{(' — ' + detail) if detail else ''}")


print("== Reset demo to clean state ==")
r = client.post("/api/admin/reset-demo")
assert r.status_code == 200, r.text
cp, ofm = get_current_period(), open_forecast_month()
print(f"  current_period={cp}  open_forecast_month={ofm}")

# ---- Discover reference IDs from the seeded DB --------------------------------
db = SessionLocal()
top_type = get_top_level_entity_type_id(db)

# A hierarchy node with member projects (for cut_by_hierarchy): pick a top-level
# node whose recursive membership is non-empty.
top_nodes = db.query(GroupingEntity).filter(
    GroupingEntity.entity_type_id == top_type,
    GroupingEntity.is_active.is_(True),
).all()
node_with_members = None
for n in top_nodes:
    if _get_projects_for_entity_recursive(db, n.id):
        node_with_members = n.id
        break

# A transformation level present on projects.
tlevel = (
    db.query(Project.transformation_level)
    .filter(Project.transformation_level.isnot(None), Project.is_active.is_(True))
    .first()
)
tlevel = tlevel[0] if tlevel else None

# A role_type_id that appears in internal forecast rows (sub_category).
role = (
    db.query(Forecast.sub_category)
    .filter(Forecast.category == "internal")
    .first()
)
role = role[0] if role else None

# A project to reassign + a DIFFERENT top-level target node.
proj = db.query(Project).filter(Project.is_active.is_(True)).first()
proj_id = proj.id
cur_info = get_project_entity_info(db, proj_id, top_type)
cur_node = cur_info["id"] if cur_info else None
target_node = next((n.id for n in top_nodes if n.id != cur_node), None)
db.close()

print("== Reference IDs ==")
print(f"  node_with_members={node_with_members}  tlevel={tlevel}  role={role}")
print(f"  reassign project={proj_id}  cur_node={cur_node} -> target_node={target_node}")
assert all([node_with_members, tlevel, role, proj_id, target_node]), "missing reference id"

# ---- Create scenario ---------------------------------------------------------
r = client.post("/api/scenarios", json={"name": "VERIFY noop levers"}, headers=H)
assert r.status_code == 200, r.text
sid = r.json()["id"]
print(f"== Scenario {sid} ==")


def apply(action_type, scope, params, project_id=None):
    body = {"scope": scope, "action_type": action_type, "parameters": params}
    if project_id:
        body["project_id"] = project_id
    rr = client.post(f"/api/scenarios/{sid}/actions", json=body, headers=H)
    assert rr.status_code == 200, (action_type, rr.status_code, rr.text)
    return rr.json()["impact_dashboard"]["total_budget_delta"]


# ---- Control -----------------------------------------------------------------
print("== Control ==")
prev = apply("across_the_board_cut", "portfolio", {"percentage": 10})
check("control across_the_board_cut moves delta", abs(prev) > 1.0, f"delta={prev:,.2f}")

# ---- 6 cost-moving levers (each must change the cumulative delta) -------------
emonth = ofm  # first editable forecast month
cost_levers = [
    ("cut_by_hierarchy", "portfolio",
     {"hierarchy_node_id": node_with_members, "percentage": 15}, None),
    ("cut_by_transformation", "portfolio",
     {"transformation_level": tlevel, "percentage": 10}, None),
    ("adjust_rate_table", "portfolio",
     {"rate_table_scope": "internal", "percentage": 5, "effective_month": emonth}, None),
    ("adjust_rate_table(role)", "portfolio",
     {"rate_table_scope": "internal", "role_type_id": role, "percentage": 5,
      "effective_month": emonth}, None),
    ("change_budget_envelope(percent)", "portfolio",
     {"mode": "percent", "value": -10, "year": int(cp[:4])}, None),
    ("change_budget_envelope(absolute)", "portfolio",
     {"mode": "absolute", "value": 5_000_000, "year": int(cp[:4])}, None),
    ("inject_hypothetical_project", "portfolio",
     {"name": "Phantom AI Platform", "total_budget": 750_000,
      "project_type": 2, "transformation_level": "T2"}, None),
    ("rate_escalation(rate_scope)", "portfolio",
     {"pct": 4, "rate_scope": "internal"}, None),
    ("rate_escalation(category)", "portfolio",
     {"pct": 3, "from_month": emonth, "category": "all"}, None),
]
print("== Cost-moving levers (cumulative delta must change each step) ==")
# real action_type strings (strip the parenthetical label used for display)
for label, scope, params, pid in cost_levers:
    atype = label.split("(")[0]
    d = apply(atype, scope, params, pid)
    check(f"{label} moves delta", abs(d - prev) > 1.0,
          f"{prev:,.2f} -> {d:,.2f} (Δ {d - prev:,.2f})")
    prev = d

# ---- reassign_hierarchy: financial flat, investment-mix re-buckets -----------
print("== reassign_hierarchy (re-bucket only) ==")


def invest_mix():
    rr = client.get(f"/api/scenarios/{sid}/impact", headers=H)
    assert rr.status_code == 200, rr.text
    dims = rr.json()["dimensions"]
    fin = dims["financial"]["total_delta"]
    mix = {i["node_id"]: i["scenario_total"] for i in dims["investment_mix"]["items"]}
    return fin, mix


fin_before, mix_before = invest_mix()
d = apply("reassign_hierarchy", "project", {"hierarchy_node_id": target_node}, proj_id)
fin_after, mix_after = invest_mix()
check("reassign leaves financial delta flat", abs(fin_after - fin_before) < 1.0,
      f"{fin_before:,.2f} -> {fin_after:,.2f}")
moved_nodes = [n for n in set(mix_before) | set(mix_after)
               if abs(mix_before.get(n, 0) - mix_after.get(n, 0)) > 1.0]
check("reassign re-buckets investment-mix (>=2 nodes shift)", len(moved_nodes) >= 2,
      f"nodes shifted: {moved_nodes}")

print()
if FAILS:
    print(f"RESULT: {len(FAILS)} FAILURE(S): {FAILS}")
    sys.exit(1)
print("RESULT: ALL CHECKS PASSED")
