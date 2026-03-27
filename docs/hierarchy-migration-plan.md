# Full Schema Migration: Replace LineOfBusiness & Program with GroupingEntity Hierarchy

## Context

The app has two separate organizational systems: `LineOfBusiness` + `Program` tables (hardcoded, static) and the `GroupingEntity` hierarchy system (dynamic, configurable from admin). The user wants the hierarchy to be the **single source of truth** so admins can restructure the organization (add departments above LoB, reorganize programs) without developer intervention. All views must adapt automatically.

**Approach**: Remove `LineOfBusiness` table, `Program` table, `Project.lob_id`, and `Project.program_id`. Migrate all organizational structure to `GroupingEntity` + `ProjectGroupingAssignment`. Every consumer gets updated to read from the hierarchy.

**Branch**: New branch (not `feature/demo-polish-april`).

---

## Schema Changes

### Remove
- `LineOfBusiness` model + `lines_of_business` table
- `Program` model + `programs` table
- `Project.lob_id` FK column
- `Project.program_id` FK column
- `Project.lob` and `Project.program` relationships

### Keep (unchanged)
- `GroupingEntityType`, `GroupingEntity`, `GroupingHierarchy`, `GroupingHierarchyLevel`, `ProjectGroupingAssignment` — these become the primary system
- All other Project fields (status, rag, budget, timeline, etc.)

### Files
- `backend/models/organization.py` — Remove `LineOfBusiness` class
- `backend/models/projects.py` — Remove `Program` class, remove `lob_id`/`program_id` from `Project`

---

## Seed Data (`backend/seed/seed.sql`)

### Remove
- `lines_of_business` INSERT (line 11)
- `programs` INSERT (lines 209-213)
- `lob_id` and `program_id` columns from all `projects` INSERTs (lines 220-261)

### Add (after projects, ~line 262)

**Entity Types:**
```sql
INSERT INTO grouping_entity_types (id, name, is_active, created_at) VALUES
('get-lob', 'Line of Business', 1, '2026-01-15 10:00:00'),
('get-prog', 'Program', 1, '2026-01-15 10:00:00');
```

**Entities — 4 LoBs + 4 Programs (programs have parent_entity_id → LoB):**
```sql
-- LoB entities (no parent)
('lob-tbs', 'get-lob', 'Truck & Bus Systems (TBS)', NULL, ...),
('lob-rvs', 'get-lob', 'Rail Vehicle Systems (RVS)', NULL, ...),
('lob-cit', 'get-lob', 'Corporate IT', NULL, ...),
('lob-dnd', 'get-lob', 'Digital & Data', NULL, ...),
-- Program entities (parent = their LoB)
('prog-dbp', 'get-prog', 'Digital Braking Platform', 'lob-tbs', ...),
('prog-rail', 'get-prog', 'Rail Modernization', 'lob-rvs', ...),
('prog-infra', 'get-prog', 'Infrastructure Optimization', 'lob-cit', ...),
('prog-fleet', 'get-prog', 'Fleet Intelligence', 'lob-dnd', ...);
```

**Hierarchy:**
```sql
INSERT INTO grouping_hierarchies VALUES ('hier-standard', 'Standard Portfolio Hierarchy', 1, ...);
INSERT INTO grouping_hierarchy_levels VALUES
('hier-standard', 0, 'get-lob'),
('hier-standard', 1, 'get-prog');
```

**ProjectGroupingAssignment — 33 rows:**
- Projects with a former program_id → assigned to their program entity (e.g., `proj-erp2` → `prog-dbp`)
- Projects without a program → assigned to their LoB entity (e.g., `proj-sap` → `lob-tbs`)

---

## Backend Changes

### 1. Models (`backend/models/organization.py`, `backend/models/projects.py`)

- **Remove** `LineOfBusiness` class entirely
- **Remove** `Program` class entirely
- **Remove** from `Project`: `lob_id` column, `program_id` column, `lob` relationship, `program` relationship
- Add to `Project`: `entity_assignments` relationship to `ProjectGroupingAssignment` (for convenient access)

### 2. Portfolio Service (`backend/services/portfolio_service.py`)

**`build_portfolio_tree()` — Full rewrite:**
1. Load active hierarchy + its entity tree
2. For each entity, load assigned projects via `ProjectGroupingAssignment`
3. Compute financials for each project (reuse existing `compute_project_financials()`)
4. Build tree nodes recursively from entity tree, attaching projects at each entity that has them
5. Aggregate financials bottom-up through the entity tree
6. Each entity node gets `type` = lowercase entity type name (e.g., `"lob"`, `"program"`)
7. Project nodes keep `type: "project"` or `"service"`
8. When `grouping_entity` filter is provided, return only that entity's subtree (use existing `_get_projects_for_entity_recursive()`)
9. Fallback: if no active hierarchy, return flat project list

**`_get_projects_for_entity_recursive()` — Simplify:**
Remove the LoB fallback (no longer needed since LoB IS a GroupingEntity now). Keep only the GroupingEntity + ProjectGroupingAssignment logic.

**`compute_portfolio_kpis()` — Update:**
Replace `Project.lob_id` filter with `_get_projects_for_entity_recursive()` call.

### 3. Portfolio Router (`backend/routers/portfolio.py`)

**`/kpis` endpoint:**
- Remove `lob` query parameter
- Keep `grouping_entity` parameter (already works)

**`/projects` endpoint:**
- Remove `lob` query parameter
- Keep `grouping_entity` parameter

**`/charts` endpoint (lines 264-281):**
- Replace hardcoded `LineOfBusiness` loop with hierarchy top-level entity loop
- Load active hierarchy → top-level entity type → query entities of that type
- For each top-level entity, get project IDs via `_get_projects_for_entity_recursive()`
- Compute forecast/baseline per entity
- Return `forecast_by_lob` array (keep field name for backward compat) with entity id/name

**Intake endpoints:**
- Replace `p.lob.name` / `p.lob_id` lookups with entity name from `ProjectGroupingAssignment` join

### 4. Reference Router (`backend/routers/reference.py`)

**`GET /api/reference/lobs`:**
- Query `GroupingEntity` records of the LoB entity type (or the leaf-level type from active hierarchy)
- Return same response shape: `id`, `name`, `is_active`, `project_count`, `total_budget`
- Compute `project_count` via `ProjectGroupingAssignment` count
- Compute `total_budget` via join to `Project.total_budget`

### 5. Report Service (`backend/services/report_service.py`)

**`_get_scoped_project_ids()`:**
- Replace `Project.lob_id == filters["lob"]` with `_get_projects_for_entity_recursive(db, filters["lob"])` → filter by project IDs

**LoB name lookups:**
- Replace `{l.id: l.name for l in db.query(LineOfBusiness).all()}` with `{e.id: e.name for e in db.query(GroupingEntity).filter(GroupingEntity.entity_type_id == 'get-lob').all()}`

**Row data:**
- Keep field names `lob_id`/`lob_name` in responses (they represent the leaf-level entity)
- Resolve entity name via `ProjectGroupingAssignment` → `GroupingEntity` join

### 6. Report Router (`backend/routers/reports.py`)

- Accept both `lob` and `grouping_entity` params (or just `grouping_entity`)
- Pass to `_get_scoped_project_ids()` for filtering

### 7. Admin Router (`backend/routers/admin.py`)

**Remove** separate LoB CRUD endpoints:
- `POST /admin/lobs` — use entity creation instead
- `PUT /admin/lobs/{id}` — use entity update instead
- `GET /admin/lobs/{id}/projects` — use `GET /admin/grouping/entities/{id}/projects`
- `PUT /admin/lobs/{id}/projects/{pid}/assign` — use project assignment instead

**Admin context:**
- Replace `lob_count` with entity count or hierarchy info

### 8. Capacity Router (`backend/routers/capacity.py`)

**Heatmap pivot `lob`:**
- Replace `LineOfBusiness.all()` with top-level hierarchy entities
- Replace `Project.lob_id == lob.id` filter with `_get_projects_for_entity_recursive()`

**Project list (resource requests):**
- Replace `LineOfBusiness` lookup with entity lookup via `ProjectGroupingAssignment`

### 9. Scenarios (`backend/routers/scenarios.py`, `backend/services/scenario_engine.py`)

**Drill-down `level="lob"`:**
- Replace `Project.lob_id` grouping with entity grouping from `ProjectGroupingAssignment`

**`reduce_lob` action:**
- Replace `Project.lob_id` filter with `_get_projects_for_entity_recursive()` to find projects under an entity

**Scenario state:**
- Replace `lob_id` in working state with entity assignment lookup

### 10. Workbench Router (`backend/routers/workbench.py`)

**Project overview metadata:**
- Replace `project.lob.name` with entity name from `ProjectGroupingAssignment` → `GroupingEntity`

### 11. Global Launchpad (`backend/routers/global_launchpad.py`)

**Project creation:**
- Replace `lob_id=body.lob_id` with `ProjectGroupingAssignment(project_id=project.id, grouping_entity_id=body.lob_id)`
- The `lob_id` field in the request body now means "entity_id" — which entity to assign the project to
- Keep the field name `lob_id` in the request schema for now (frontend sends entity ID)

### 12. Schemas

- `backend/schemas/portfolio.py` — Remove `lob_id` from project schemas where it's a column reference
- `backend/schemas/global_launchpad.py` — `lob_id` field now refers to entity ID
- `backend/schemas/reference.py` — `LoBResponse` can stay (or rename), populated from GroupingEntity

---

## Frontend Changes

### 1. Types (`frontend/src/types/api.ts`)
- Keep `LoBRef` type (populated from entities now)
- Keep `BudgetByLob` type (populated from entities)
- Response types with `lob_id`/`lob_name` fields stay (backend populates from entities)

### 2. API (`frontend/src/api/endpoints.ts`)
- `referenceApi.getLobs()` — no change needed (backend returns entity data in same shape)
- `adminApi.createLoB/updateLoB/getLoBProjects/assignProjectToLoB` — can redirect to entity endpoints, or backend keeps these routes as aliases
- Report API calls — no change (backend handles the filter internally)

### 3. Admin LoBs Panel (`frontend/src/modules/admin/entities/LoBsPanel.tsx`)
- **Option A**: Remove entirely (LoB management moves to hierarchy panel)
- **Option B**: Keep as a convenience view that reads from `referenceApi.getLobs()` (which now returns entities). CRUD actions call entity endpoints.
- **Recommended**: Keep as read-only convenience view; creation/management happens in hierarchy panel

### 4. Portfolio Tree (`frontend/src/modules/portfolio/dashboard/PortfolioTree.tsx`)
- Update `TYPE_LABELS` map to handle dynamic entity type names
- Make node type badge styling work with any entity type (not just hardcoded `lob`/`program`)

### 5. Report Components
- `ProgrammeRollupReport.tsx` — already uses `useActiveHierarchy()` for filter label
- `ForecastAccuracyReport.tsx` — add `useActiveHierarchy()` for filter label
- `VendorSpendReport.tsx`, `YoYReport.tsx` — same pattern
- All report filters already call `referenceApi.getLobs()` → will get entity data automatically

### 6. Other Components
- `SubmitProjectDialog.tsx` — calls `getLobs()` → works (returns entities)
- `AddActionForm.tsx` — already has `getActiveHierarchy()` fallback
- `MetadataBar.tsx` — displays `project.lob` string (backend populates from entity)

---

## Utility Function: Get Project's Entity Info

Create a reusable helper in `portfolio_service.py`:
```python
def get_project_entity_name(db, project_id, entity_type_id='get-lob'):
    """Get the name of the entity (of given type) that a project belongs to."""
    # Walk up from project's assigned entity to find the entity of the requested type
```

This replaces the pattern `project.lob.name` used throughout the backend.

---

## Implementation Order

1. **Schema + Models** — Remove LoB/Program, update Project model
2. **Seed data** — Replace LoB/Program inserts with entity inserts + assignments
3. **Core service** — Rewrite `build_portfolio_tree()`, update `_get_projects_for_entity_recursive()`
4. **Portfolio router** — Update KPIs, charts, intake endpoints
5. **Reference router** — Make `getLobs()` return entities
6. **Report service + router** — Update filters and row data
7. **Admin router** — Remove LoB CRUD (or alias to entity endpoints)
8. **Capacity, Scenarios, Workbench, Launchpad** — Update all LoB references
9. **Frontend** — Update tree type labels, report filter labels, admin panel

---

## Files to Modify

| File | Change |
|------|--------|
| `backend/models/organization.py` | Remove `LineOfBusiness` class |
| `backend/models/projects.py` | Remove `Program` class, remove `lob_id`/`program_id` from `Project` |
| `backend/seed/seed.sql` | Replace LoB/Program inserts with entity/hierarchy inserts |
| `backend/services/portfolio_service.py` | Rewrite tree builder, simplify recursive fn, update KPIs |
| `backend/routers/portfolio.py` | Update charts, KPIs, intake to use entities |
| `backend/routers/reference.py` | `getLobs()` returns from GroupingEntity |
| `backend/services/report_service.py` | Replace LoB filters and lookups |
| `backend/routers/reports.py` | Update filter params |
| `backend/routers/admin.py` | Remove/alias LoB CRUD endpoints |
| `backend/routers/capacity.py` | Heatmap pivot uses entities |
| `backend/routers/scenarios.py` | Drill-down uses entities |
| `backend/services/scenario_engine.py` | `reduce_lob` uses entities |
| `backend/routers/workbench.py` | Project metadata uses entity lookup |
| `backend/routers/global_launchpad.py` | Project creation uses assignment |
| `backend/schemas/portfolio.py` | Update schemas |
| `backend/schemas/global_launchpad.py` | Update schemas |
| `frontend/src/modules/portfolio/dashboard/PortfolioTree.tsx` | Dynamic type labels |
| `frontend/src/modules/admin/entities/LoBsPanel.tsx` | Adapt to entity system |
| `frontend/src/modules/reporting/reports/*.tsx` | Filter label from hierarchy |

---

## Verification

1. `curl -X POST http://localhost:8000/api/admin/reset-demo` to re-seed
2. Admin → Portfolio Hierarchy: shows "Line of Business" and "Program" entity types, 4+4 entities, active 2-level hierarchy, all 33 projects assigned
3. Portfolio tree: shows LoB → Program → Project with correct financial numbers
4. Portfolio LoB filter: selecting a LoB shows correct filtered data
5. Portfolio charts: "Forecast by Line of Business" with correct bars
6. Reports: LoB filter works in all 4 reports
7. Capacity: heatmap pivot by LoB works
8. **Key test — hierarchy change**: Create "Division" entity type, create 2 divisions, assign LoBs as children, create Division → LoB → Program hierarchy, activate it:
   - Portfolio tree shows Division → LoB → Program → Project
   - Filter shows Divisions
   - Charts show "Forecast by Division"
   - Reports filter by Division
9. Workbench project metadata still shows LoB name
10. Scenario drill-down by LoB still works
