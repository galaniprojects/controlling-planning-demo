# CPC Demo App — End-to-End Visual Test Plan

This document provides step-by-step instructions for a **full visual browser walkthrough** of all 17 demo scenarios. Give this to a fresh Claude Code session to execute.

---

## Prerequisites

### 1. Reset Demo Data
```bash
curl -X POST http://localhost:8000/api/admin/reset-demo
```

### 2. Start Servers
- **Backend:** `cd backend && source .venv/bin/activate && python main.py` (port 8000)
- **Frontend:** `cd frontend && npm run dev` (port 5173, bound to 127.0.0.1)

Use `preview_start` for the frontend (there should be a `.claude/launch.json` config named `"frontend"`). Start the backend via Bash in the background.

### 3. Open the App
Navigate to `http://localhost:5173` in the preview browser. The default role is **Controller (Anna Meier)**.

---

## Personas (role switcher in top-right dropdown)

| Persona | Role | Default Module | Key Access |
|---------|------|---------------|------------|
| Anna Meier | Controller | Portfolio Overview | All modules |
| Thomas Brenner | CC Owner | Capacity Management | Capacity + limited portfolio |
| Priya Sharma | Project Lead | Project Workbench | Workbench + intake |
| Dr. Klaus Weber | Executive | Portfolio Overview | Portfolio + Simulator (read-only) |

---

## Test Scenarios

### Scenario 1: Role Switching
**Goal:** Verify all 4 personas load correct landing pages and module access.

1. Start as Anna Meier (Controller) — should land on Portfolio Overview
2. Click role dropdown → switch to **Thomas Brenner** (CC Owner)
   - Should navigate to Capacity Management
   - Verify sidebar/tile shows Capacity module
3. Switch to **Priya Sharma** (Project Lead)
   - Should navigate to Project Workbench
   - Verify Intake Queue accessible in Portfolio
4. Switch to **Dr. Klaus Weber** (Executive)
   - Should navigate to Portfolio Overview
   - Verify read-only access (no intake/approvals tabs)
5. Switch back to **Anna Meier**

**Verify:** Each role sees different notifications on the Launchpad, different module tiles, and lands on the correct default module.

---

### Scenario 2: Portfolio Tree Browsing
**Role:** Controller (Anna Meier)
**Module:** Portfolio Overview → Dashboard tab

1. Navigate to Portfolio Overview (should already be there)
2. Verify KPI cards at top (total budget, YTD spend, forecast, variance, CapEx/OpEx)
3. In the portfolio tree table, expand **Truck Systems** LoB (click chevron)
4. Expand **Digital Braking Platform** program
5. Click on **ERP Integration Phase 2** project row
6. Verify right-side summary panel opens with:
   - Red RAG indicator
   - Budget snapshot (baseline vs forecast vs actuals)
   - Timeline info
   - Forecast sparkline
   - Last CR summary

**Verify:** Tree expands/collapses smoothly, indentation is correct, RAG colors show, summary panel has all data.

---

### Scenario 3: Intake Queue — Approve Project
**Role:** Controller (Anna Meier)
**Module:** Portfolio Overview → Intake Queue tab

1. Click the **Intake Queue** tab
2. Verify the tab loads (this tests the URL sync fix — should NOT flash Dashboard)
3. Find **Autonomous Braking Prototype** in the list
4. Click on it to open the detail panel
5. Review the project details (LoB, budget estimate, start month, CapEx/OpEx)
6. Click **Approve** button
7. Verify status changes to "Approved" and item moves/updates in the list

**Verify:** Tab navigation works cleanly, detail panel shows full info, approve action succeeds.

---

### Scenario 4: Approvals — Review Change Request
**Role:** Controller (Anna Meier)
**Module:** Portfolio Overview → Approvals tab

1. Click the **Approvals** tab
2. Verify 2–3 pending CRs are listed
3. Click on a pending CR to see details
4. Review: summary, justification, budget impact delta, who submitted, CC owner confirmation status
5. Click **Approve** (or Reject)
6. Verify the CR status updates

**Verify:** CR detail shows all fields, approval action works, list updates.

---

### Scenario 5: Monthly Forecast Wizard (5 phases)
**Role:** Project Lead (Priya Sharma)
**Module:** Project Workbench

1. Switch to **Priya Sharma** role
2. Should land on Project Workbench
3. Select **ERP Integration Phase 2** from the project list (or it may auto-select via URL param)
4. Go to the **Forecast & Planning** tab
5. Click **"Start Monthly Review"** button
6. **Phase 1 — Retrospective:** Review actuals vs forecast variance table. Check "significant" flags. Click Next (or Skip if available).
7. **Phase 2 — System Suggestions:** Review AI-generated suggestions (observation + recommendation + impact). Accept/skip suggestions.
8. **Phase 3 — Manual Adjustments:** Edit forecast grid cells directly. Verify changes highlight.
9. **Phase 4 — Review & Justify:** See grouped changes summary. Add justification text for each group.
10. **Phase 5 — Submit:** Review final summary. Click Submit. Verify CRs are created.

**Verify:** Each phase transitions correctly, data persists between phases, suggestions pre-fill values, submit creates CRs.

---

### Scenario 6: Change History
**Role:** Project Lead (Priya Sharma)
**Module:** Project Workbench → Change History tab

1. With **ERP Integration Phase 2** selected, click the **Change History** tab
2. Verify 8–10 CRs listed with various statuses (approved, pending, rejected)
3. Try filters (by status, category)
4. Click on a CR to expand its details
5. Verify: changes array with field_changed, old_value, new_value, delta

**Verify:** CR list is populated, filters work, detail expansion shows change breakdown.

---

### Scenario 7: Capacity Heatmap — Over-Allocated Person
**Role:** Cost Center Owner (Thomas Brenner)
**Module:** Capacity Management → My Team

1. Switch to **Thomas Brenner** role
2. Should land on Capacity Management
3. Verify **My Team** tab is active
4. Check team summary cards (headcount, avg utilization, over-allocated count)
5. View the heatmap grid — look for **Lena Fischer** with red cells (>100% utilization)
6. Also note **Markus Wolf** with blue cells (~48%, under-utilized)
7. Click on **Lena Fischer** row
8. Verify bottom drawer opens with:
   - Month-by-month allocation breakdown
   - Per-project hours allocation
   - Pending requests affecting her

**Verify:** Heatmap colors are correct (blue/green/amber/red), person drill-down shows project breakdown.

---

### Scenario 8: Resource Request — Assignment Preview
**Role:** Cost Center Owner (Thomas Brenner)
**Module:** Capacity Management → Resource Requests

1. Navigate to **Resource Requests** tab/section
2. Verify 4 pending requests listed
3. Click on a pending request to see details
4. Click **Confirm** (or other response action)
5. System should show assignment preview: available people with utilization projections
6. Select a person for assignment
7. Verify the utilization impact preview (monthly projections, exceeds 100% warning if applicable)
8. Submit the response

**Verify:** Request list loads, detail view works, assignment preview shows utilization impact.

---

### Scenario 9: Organization Overview
**Role:** Controller (Anna Meier)
**Module:** Capacity Management → Organization Overview

1. Switch back to **Anna Meier**
2. Navigate to Capacity Management
3. Click **Organization Overview** tab
4. Verify org summary cards (total headcount ~29, avg utilization ~77%)
5. View the org-wide heatmap
6. Test pivot dimensions (by Cost Center, by Role, by LoB)
7. Expand a row to see children
8. Click a row to see drill-down detail

**Verify:** All 3 pivot views render, heatmap is populated, drill-down works.

---

### Scenario 10: Open Existing What-If Scenario
**Role:** Controller (Anna Meier)
**Module:** What-If Simulator

1. Navigate to What-If Simulator
2. Should see scenario list (My Scenarios + Published)
3. Click **"FY2026 Budget Pressure — Conservative"** (Published, by Anna Meier)
4. Verify workspace loads with:
   - Scenario name + Published badge
   - Description text
   - 5 applied actions (2 defers + 3 consulting cuts)
   - Impact dashboard: Total Budget (€4.5M → €4.3M), RAG distribution, budget change %, projects affected
5. Scroll to Portfolio Impact table (5 projects)
6. Click a project row (e.g., **AI/ML Experimentation Lab**)
7. Verify bottom drawer opens with drill-down detail (budget/RAG changes)

**Verify:** Scenario loads fully, all impact metrics display, drill-down works.

---

### Scenario 11: Create New Scenario
**Role:** Controller (Anna Meier)
**Module:** What-If Simulator

1. Go back to scenario list
2. Click **"Create New Scenario"**
3. Enter name: "Test Scenario"
4. Verify empty workspace opens
5. In **Add Action** section:
   - Select "Project Actions" tab
   - Choose action type "Defer Planned Projects"
   - Select a project → Apply
6. Verify action appears in Applied Actions list and impact recalculates
7. Add another action (e.g., "Reduce Budget" on a different project)
8. Verify cumulative impact updates

**Verify:** Scenario creation works, actions apply, impact recalculates after each action.

---

### Scenario 12: Compare Scenarios
**Role:** Controller (Anna Meier)
**Module:** What-If Simulator

1. From scenario list or workspace, click **"Compare Scenarios"**
2. Scenario selector should appear — "Current State" is pinned
3. Select **"FY2026 Budget Pressure — Conservative"** and **"Worst Case — 20% Across-the-Board Cut"**
4. Click Compare
5. Verify comparison table shows:
   - Columns: Current State, Conservative, Worst Case
   - Rows: projects with budget and delta for each scenario
   - RAG color changes highlighted

**Verify:** Comparison loads with all columns, deltas are correct, RAG changes visible.

---

### Scenario 13: AI Advisor
**Role:** Controller (Anna Meier)
**Module:** What-If Simulator → AI Advisor

1. Open a scenario workspace (or create new)
2. Click **"AI Advisor"** button
3. Indigo panel should slide in from the right
4. Type: **"Find 2M in savings"** and submit
5. Verify 3 paths appear:
   - Path A — Conservative (delay & defer, ~€2.1M)
   - Path B — Moderate (targeted cuts, ~€2.0M)
   - Path C — Aggressive (consolidate, ~€2.4M)
6. Each path shows: headline numbers, approach description, trade-offs
7. Click **"Apply"** on one path
8. Verify actions are added to the scenario with group labels
9. Close AI Advisor panel

**Verify:** Goal input matches pre-computed paths, 3 paths display with details, Apply creates grouped actions.

---

### Scenario 14: Module Guide
**Role:** Any
**Module:** Any module

1. On any module page, look for the **guide/book icon button** (near the page title, top-right area)
2. Click it
3. Verify side panel (380px, content shrinks) opens with module manual
4. Content should include sections relevant to the current module
5. Close the panel

**Verify:** Guide loads correct content for the module, panel renders properly.

---

### Scenario 15: FAQ Help Panel
**Role:** Controller (Anna Meier), then Project Lead (Priya Sharma)

1. As Controller, click the **"?"** button in the top bar
2. Side panel opens with FAQ list
3. Verify ~7-8 FAQs visible (filtered for controller role)
4. Click an FAQ (e.g., "How do I submit my monthly forecast?")
5. Verify detail view with:
   - "Back to FAQs" link
   - Question + summary
   - Numbered steps with blue circles
   - Steps with `target_module` have clickable "Open [Module]" links
6. Click "Back to FAQs" — returns to list
7. Switch to **Priya Sharma** and reopen FAQ
8. Verify fewer FAQs (~3, filtered for project_lead role)

**Verify:** Role filtering works, detail view renders steps, deep-link buttons navigate to correct modules.

---

### Scenario 16: Administration — Add Cost Center
**Role:** Controller (Anna Meier)
**Module:** Administration

1. Navigate to Administration module
2. Click **"Cost Centers"** in the left entity selector
3. Click **"Add Cost Center"** (or + button)
4. Fill form:
   - Name: "SHG Data Analytics"
   - Select a location and competence center from dropdowns
5. Click Create
6. Verify new cost center appears in the table

**Verify:** Create dialog works, form validates, new entity appears in table.

---

### Scenario 17: Administration — Update Hourly Rate
**Role:** Controller (Anna Meier)
**Module:** Administration → Rate Tables

1. In Administration, click **"Rate Tables"** in the left nav
2. Find **Senior Developer** role rates
3. Edit the hourly rate from €95 to €105
4. Verify the row highlights (amber) to indicate unsaved change
5. Click **Save**
6. Verify the rate updates and highlight clears

**Verify:** Inline editing works, change highlighting works, save persists the change.

---

## Cross-Cutting Checks (verify throughout)

- [ ] **Zero console errors** — check `preview_console_logs` after each scenario
- [ ] **Loading skeletons** — appear briefly on every data fetch
- [ ] **Hover states** — slate-50 bg on table rows, pointer cursor on clickable elements
- [ ] **Side panel** — 380px fixed width, main content shrinks (not overlaid)
- [ ] **Bottom drawer** — ~40vh height, semi-transparent overlay, closes via X or overlay click
- [ ] **RAG colors** — Green (#22c55e), Amber (#f59e0b), Red (#ef4444) used consistently
- [ ] **Responsive breadcrumb** — top bar shows correct module name on each navigation
- [ ] **Role dropdown** — shows current user name and allows switching

---

## After All Scenarios

1. Check for console errors one final time
2. Reset demo data: `curl -X POST http://localhost:8000/api/admin/reset-demo`
3. Take a final screenshot of the Launchpad as proof of clean state

---

## Troubleshooting

- **Backend not responding:** Check `http://localhost:8000/health`. Restart with `cd backend && source .venv/bin/activate && python main.py`
- **Frontend HMR stuck:** Stop and restart the dev server
- **Stale data after testing:** Reset with `POST /api/admin/reset-demo`
- **Scenario data lost after actions:** Expected — What-If engine recalculates. Reset DB by deleting `backend/cpc_demo.db` and restarting backend.
- **Tab URL sync issue:** If portfolio tabs don't match URL, check that `PortfolioOverview.tsx` has the pathname sync useEffect.
