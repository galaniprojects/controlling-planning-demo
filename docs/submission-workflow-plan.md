# Project Submission Workflow Overhaul

## Context

The current project submission workflow is cosmetic — a single dialog collects metadata and immediately submits, the "send back" feature stores feedback by appending to the project description, and the PL can't see or act on requested changes. This plan transforms the workflow into a fully functional multi-step process with resource planning, CC Owner confirmation, controller review with editable grids, and a diff view for change requests.

---

## New Status Lifecycle

```
draft → pending_cc_confirmation → pending_approval → active
                                                   → rejected
                                                   → changes_requested → (PL edits) → pending_cc_confirmation (loop)
```

New status: **`pending_cc_confirmation`** — project awaits CC Owner resource sign-off before reaching the controller.

---

## Session 1: Database & Backend Foundation

### 1.1 Schema Changes

**New model: `ProjectSubmissionSnapshot`** (in `backend/models/submissions.py`)
- `id` (PK), `project_id` (FK), `snapshot_type` ("original" | "controller_proposed"), `created_by_id` (FK to people), `forecast_data_json` (Text — JSON array of forecast entries), `comments` (Text, nullable), `created_at`, `is_active`
- Purpose: Stores PL's original plan and controller's proposed edits separately for diff computation

**New column on `Project`** (`backend/models/projects.py`):
- `submission_feedback: Text, nullable` — Stores controller feedback text (replaces the hacky description-appending)

**New column on `Notification`** (`backend/models/system.py`):
- `deep_link_tab: String(50), nullable` — Enables notifications to deep-link to specific tabs (e.g., `intake`, `requests`)

### 1.2 Modified API Endpoints

**`POST /api/projects`** (`backend/routers/global_launchpad.py`)
- Accept an optional `resource_plan` array in the request body: `[{category, sub_category, months: [{month, hours, amount_eur}]}]`
- Generate Forecast rows from the plan (existing logic) and save an "original" snapshot
- Keep project in `draft` status — don't auto-submit

**`PUT /api/projects/{id}/submit`** (`backend/routers/global_launchpad.py`)
- Change target status from `pending_approval` → `pending_cc_confirmation`
- Create `ResourceRequest` rows from the project's Forecast data (one request per internal role + per external cost type)
- All requests go to the single CC in the demo (cc-rail-systems, owned by Thomas)
- Create notification for CC Owner: "Project '{name}' needs resource confirmation"
- Deep link: module=capacity_management, tab=requests

**`PUT /api/portfolio/intake/{id}/send-back`** → **rename to `request-changes`** (`backend/routers/portfolio.py`)
- Accept `changes` array in request body (the controller's edited forecast data)
- Store controller text feedback in `project.submission_feedback` (not description)
- Save a "controller_proposed" snapshot from the changes
- Update Forecast rows to reflect the controller's proposed values
- Status → `changes_requested`
- Create notification for PL with deep link to diff view

**`PUT /api/portfolio/intake/{id}/resubmit`** (`backend/routers/portfolio.py`)
- Accept updated `resource_plan` array (PL's edited version)
- Update Forecast rows, save new "original" snapshot
- Clear `submission_feedback`
- Target status → `pending_cc_confirmation` (full cycle repeats)
- Recreate ResourceRequest rows for CC Owner
- Notify CC Owner

### 1.3 New API Endpoints

| Endpoint | Router | Description |
|---|---|---|
| `PUT /api/capacity/project-confirmation/{project_id}/confirm` | `capacity.py` | CC Owner confirms resources. Status → `pending_approval`. Notify controller ("Project ready for review") + PL ("Project in intake queue"). |
| `PUT /api/capacity/project-confirmation/{project_id}/decline` | `capacity.py` | CC Owner declines with reason. Status → `changes_requested`. Notify PL. |
| `GET /api/portfolio/intake/{id}/diff` | `portfolio.py` | Loads "original" and "controller_proposed" snapshots. Returns `DetailViewGridData` with `current`/`proposed`/`is_changed` per cell for the comparison view. |
| `PUT /api/portfolio/intake/{id}/accept-changes` | `portfolio.py` | PL accepts controller's changes. Updates "original" snapshot to match proposed. Status → `pending_cc_confirmation`. Notify CC Owner. |
| `GET /api/portfolio/intake/{id}/editable-grid` | `portfolio.py` | Returns current forecast data in an editable structure for the controller's editing view. |

### 1.4 Updated Pending Actions (`global_launchpad.py`)

| Role | Condition | Message | Deep Link |
|---|---|---|---|
| CC Owner (Thomas) | Projects with `pending_cc_confirmation` | "Resource confirmation needed for '{name}'" | module=capacity_management, tab=requests |
| Controller (Anna) | Projects with `pending_approval` | "New project pending review" (already exists) | module=portfolio, tab=intake |
| PL (Priya) | Projects with `pending_approval` | "Your project '{name}' is in the intake queue" | module=portfolio, tab=intake |
| PL (Priya) | Projects with `changes_requested` + controller_proposed snapshot exists | "Controller requested changes on '{name}'" | module=workbench, entity_id=project_id, tab=diff |

---

## Session 2: Frontend — Multi-Step Submission (Steps 1 & 2)

### 2.1 Remove Launchpad Tile

**File**: `frontend/src/modules/launchpad/ModuleTilesGrid.tsx` (lines 59-70)
- Remove the "Submit New Project" dashed card block
- Remove the `isProjectLead` and `onSubmitProject` props (clean up Launchpad.tsx too)

### 2.2 Refactor SubmitProjectDialog → Step 1 Only

**File**: `frontend/src/components/shared/SubmitProjectDialog.tsx`
- Keep existing metadata form (name, description, LoB, start/end month)
- Change button from "Submit for Approval" → "Next: Resource Plan"
- On click: call `launchpadApi.createProject()` to save as draft, then close dialog and navigate to `/workbench/new-project/{projectId}`
- Remove the `submitProject()` call — that happens after resource planning

### 2.3 New Route & Component: ResourcePlanPage

**New file**: `frontend/src/modules/workbench/submission/ResourcePlanPage.tsx`
**Route**: `/workbench/new-project/:projectId`

Layout:
- **Top bar**: Project name, LoB, timeline (read-only summary from Step 1)
- **Year management**: Buttons to add/remove years (adjusts project end_month via API)
- **Grid** using `useCollapsibleYears` hook:
  - **INTERNAL RESOURCES** section header
    - Rows for each added role
    - "Add Resource" button → dropdown of available roles from `referenceApi.getRoles()`
    - Each row: role name (sticky left) + monthly hour inputs + row total + delete button
    - EUR auto-calculated: hours * hourly rate (rate fetched from reference data)
  - **EXTERNAL COSTS** section header
    - Rows for each added cost type
    - "Add Resource" button → dropdown from `referenceApi.getCostTypes()`
    - Each row: cost type name + monthly EUR inputs + row total + delete button
- **Footer**: Grand total (internal EUR + external EUR)
- **Submit button**: "Submit for CC Confirmation" → calls `PUT /api/projects/{id}/submit`
- **Back button**: Returns to workbench (project stays as draft)

**Pattern reference**: Follow `Phase3EditForecast.tsx` for click-to-edit cells. Local state tracks the resource plan as an array. On submit, send the full plan to the backend.

### 2.4 API Client Updates

**File**: `frontend/src/api/endpoints.ts`
- Add endpoint wrappers for new APIs
- Add `resource_plan` parameter to `createProject`

**File**: `frontend/src/types/api.ts`
- Add types for resource plan structures, CC confirmation, diff response

---

## Session 3: Frontend — CC Confirmation & Controller Review (Steps 3 & 4)

### 3.1 CC Owner Resource Assignment & Confirmation (**IMPLEMENTED**)

The CC Owner assignment step is fully functional with a unified tabular grid for per-month employee assignments:

**New model**: `ResourceRequestAssignment` — per-month person assignment (unique constraint: one person per month per request)

**New endpoints**:
- `GET /api/capacity/requests/{cc_id}/{req_id}/monthly-hours` — actual per-month forecast hours
- `GET/PUT /api/capacity/requests/{cc_id}/{req_id}/assignments` — per-month person assignments
- `GET /api/capacity/project-assignment/{project_id}` — project with all requests and assignment status

**Components**:
- `ProjectAssignmentPage.tsx` — dedicated full-page view with project header, assignment grid, team availability reference, confirm/decline actions
- `AssignmentGrid.tsx` — tabular grid (rows = roles, columns = months) with collapsible years, click-to-select cells, and "Assign All" column for bulk assignment
- `ProjectConfirmationBanner.tsx` — banner in My Team tab with "Review & Assign Resources" navigation

**Grid features**:
- Matches ResourcePlanPage visual pattern (sticky left column, collapsible year headers, section headers)
- Click any cell to open person dropdown (grouped by matching role + others, with utilization % hints)
- "Assign All" column assigns one person to every month for a role in a single click
- Year summary column shows person name (uniform), "Mixed" (varied), or "--" (empty)
- Status badge per row (X/Y months assigned)
- External cost requests hidden from CC Owner view (not assignable)

**Flow**: CC Owner clicks "Review & Assign Resources" → assigns employees via grid (per-cell or "Assign All") → "Confirm All & Send to Controller" creates Allocation records and moves project to `pending_approval`

**Confirmation creates Allocation records** from assignments, making employee names visible in:
- Controller's intake detail view (Resource Assignments section)
- Forecast & Planning tab (reads from Allocation table automatically)

### 3.2 Controller's Editable Intake Grid

**Modify**: `frontend/src/modules/portfolio/intake/IntakeDetailWorkspace.tsx`

- Rename "Send Back" button to "Request Changes" (already done in workspace, line 213-215)
- Also rename in `IntakeDetailPanel.tsx` (line 182-186 still says "Send Back")
- When controller clicks "Request Changes":
  1. Existing read-only `DetailViewGrid` switches to a new `EditableIntakeGrid` component
  2. All future month cells become editable (click-to-edit pattern from Phase3EditForecast)
  3. Controller can modify hours/EUR values per cell
  4. Controller can delete entire rows (remove icon per row)
  5. A feedback textarea appears for the controller's comments
  6. "Confirm Changes" button → sends edited data to `PUT /api/portfolio/intake/{id}/request-changes`
  7. "Cancel" reverts to read-only view

**New sub-component**: `frontend/src/modules/portfolio/intake/EditableIntakeGrid.tsx`
- Reuses `useCollapsibleYears` for column management
- Editable cells: click to enter number, blur/Enter to confirm
- Row deletion with confirmation
- Tracks all changes in local state
- On confirm: sends full edited plan to backend

---

## Session 4: Frontend — Diff View & Full Round-Trip (Steps 5 & 6)

### 4.1 PL Diff View

**New file**: `frontend/src/modules/workbench/submission/SubmissionDiffView.tsx`

Accessed when PL clicks the "Changes requested" notification, or via a tab/view in the workbench for the project.

Layout:
- Header: "Controller Requested Changes" with project name
- Controller's feedback text (from `submission_feedback`)
- `DetailViewGrid` with `cellPattern="comparison"` — shows original (current) vs controller's proposed values with delta coloring
  - Green: cost reduction
  - Red: significant increase (>=25%)
  - Blue: moderate change (<25%)
- Two action buttons:
  - **"Accept Changes"** → calls `PUT /api/portfolio/intake/{id}/accept-changes`, then navigates to workbench
  - **"Edit and Resubmit"** → navigates to an editable version of the resource plan (similar to ResourcePlanPage but pre-populated with the current plan, allowing PL to make modifications)
- After either action, project goes back to `pending_cc_confirmation`

### 4.2 Notification Deep-Linking

**Modify**: `frontend/src/modules/launchpad/PendingActionsPanel.tsx` and notification click handlers

- Handle new deep link pattern for diff view: when `deep_link_module="project_workbench"` and `deep_link_tab="diff"`, navigate to `/workbench?project={id}&view=diff`
- Handle CC Owner deep links to capacity management requests tab

### 4.3 Full Round-Trip Testing

Walk through the complete cycle:
1. Priya (PL) creates project via Workbench → fills resource plan → submits
2. Thomas (CC Owner) sees notification → goes to Capacity Management → confirms resources with assignments
3. Anna (Controller) sees notification → goes to Intake Queue → reviews grid
4. Anna clicks "Request Changes" → edits the grid → confirms
5. Priya sees notification → views diff → chooses "Edit and Resubmit" or "Accept"
6. Cycle repeats from step 2

---

## Critical Files to Modify

| File | Changes |
|---|---|
| `backend/models/projects.py` | Add `submission_feedback` column |
| `backend/models/system.py` | Add `deep_link_tab` column to Notification |
| `backend/models/submissions.py` | **NEW** — ProjectSubmissionSnapshot model |
| `backend/routers/global_launchpad.py` | Modify project creation/submission, update pending actions |
| `backend/routers/portfolio.py` | Modify send-back/resubmit, add diff/accept-changes/editable-grid endpoints |
| `backend/routers/capacity.py` | Add project-confirmation endpoints |
| `backend/seed/seed.sql` | Add demo data for new tables, potentially a project in `pending_cc_confirmation` |
| `frontend/src/components/shared/SubmitProjectDialog.tsx` | Convert to Step 1 only |
| `frontend/src/modules/launchpad/ModuleTilesGrid.tsx` | Remove Submit tile |
| `frontend/src/modules/workbench/submission/ResourcePlanPage.tsx` | **NEW** — Step 2 resource plan |
| `frontend/src/modules/workbench/submission/SubmissionDiffView.tsx` | **NEW** — PL diff view |
| `frontend/src/modules/portfolio/intake/IntakeDetailWorkspace.tsx` | Add editable mode for controller |
| `frontend/src/modules/portfolio/intake/EditableIntakeGrid.tsx` | **NEW** — Editable grid sub-component |
| `frontend/src/modules/portfolio/intake/IntakeDetailPanel.tsx` | Rename "Send Back" → "Request Changes" |
| `frontend/src/modules/capacity/requests/RequestManagement.tsx` | Add project confirmation flow |
| `frontend/src/api/endpoints.ts` | Add new endpoint wrappers |
| `frontend/src/types/api.ts` | Add new TypeScript types |
| `frontend/src/modules/launchpad/PendingActionsPanel.tsx` | Handle new deep-link patterns |

## Reusable Existing Code

- `DetailViewGrid` (`frontend/src/components/shared/DetailViewGrid.tsx`) — comparison and intake cell patterns
- `useCollapsibleYears` (`frontend/src/hooks/useCollapsibleYears.ts`) — year grouping/toggle for all grids
- `Phase3EditForecast` (`frontend/src/modules/workbench/forecast/Phase3EditForecast.tsx`) — click-to-edit cell pattern
- `ResourceRequest` model (`backend/models/capacity.py`) — existing capacity request workflow
- `Notification` creation pattern (used in `portfolio.py` approve/send-back)
- `referenceApi.getRoles()` / `referenceApi.getCostTypes()` — dropdown data sources
- `formatCurrency` / `formatCurrencyDetailed` (`frontend/src/lib/formatters.ts`) — EUR formatting

## Verification

After each session:
1. Start backend (`python main.py`) and frontend (`npm run dev`)
2. Walk through the workflow steps built in that session
3. Verify notifications appear on launchpad for correct roles
4. Verify deep-links navigate to correct pages/tabs
5. Check browser console for errors
6. After Session 4: full end-to-end test of the complete cycle (PL → CC Owner → Controller → PL → repeat)
