# CRETA Demo App — E2E Bug Report

**Date:** 2026-03-09
**Tester:** Claude (automated E2E walkthrough)
**Environment:** macOS, Chrome (via preview tooling), Backend port 8000, Frontend port 5173
**Persona coverage:** All 4 personas tested (Anna Meier, Thomas Brenner, Priya Sharma, Dr. Klaus Weber)

---

## Summary

Overall the app is **stable and functional**. All 6 modules load correctly, role switching works, no console errors, no failed API requests, and no 500 errors in the backend logs. The issues found are primarily **UI/cosmetic** (text truncation, formatting inconsistencies) with one **functional bug** (notification deep-linking).

### Issue Counts
- **Functional bugs:** 2
- **UI/Cosmetic issues:** 8
- **Data display issues:** 2

---

## Functional Bugs

### BUG-1: Notification deep-link does not activate correct tab (Medium)
- **Module:** Launchpad → Portfolio Overview
- **Steps:** As Anna Meier, click notification "3 change requests pending your approval"
- **Expected:** Navigate to Portfolio Overview → Approvals tab
- **Actual:** Navigates to Portfolio Overview → Dashboard tab (default). User must manually click Approvals.
- **Impact:** Medium — defeats the purpose of actionable notifications

### BUG-2: Role selection not persisted across page refresh (Low)
- **Module:** Global (Role Switcher)
- **Steps:** Switch to any non-default persona (e.g., Thomas Brenner), then refresh the browser (F5)
- **Expected:** Selected persona persists after refresh
- **Actual:** Resets to default persona (Anna Meier / Controller)
- **Root cause:** Role state is stored in React context only — no localStorage/sessionStorage persistence
- **Impact:** Low — demo context, but annoying if user accidentally refreshes. Also means bookmarked URLs always load as Controller.

---

## UI / Cosmetic Issues

### UI-1: Widespread text/column truncation at viewport edge (Low)
Multiple tables and cards have content clipped at the right edge of the viewport. This is a recurring pattern across the app rather than isolated incidents.

**Affected locations:**
- **Portfolio Overview Dashboard:** KPI cards "Forecast at C..." and "Run / Chang..." truncated. "Actuals YTD" column values cut off in tree table.
- **Portfolio Overview Approvals:** "Confirmed By" column → "Thomas Brenne..." truncated.
- **Project Workbench Overview:** Status badge "Activ..." clipped. Last table column header ("P...") cut off. Chart legend "Baselin..." truncated.
- **Project Workbench Change History:** Status badges truncated → "Pending CC Confirma...", "Pending Controller Appr..."
- **Capacity Management Org Overview:** Cost center names truncated → "MUC Application Dev...", "BUD Business Solutio..."
- **Capacity Management Resource Requests:** "Type: Res...", "Hours/mo...", "Priority: ..." truncated in detail panel.
- **What-If Simulator list:** "Headline" column values truncated ("Saves...", "Net in...", "Tota...")
- **What-If Simulator detail:** Scenario name truncated, headline text cut off, Portfolio Impact table RAG badges clipped.
- **Reporting tables:** "Actuals" column headers truncated across reports.
- **Administration:** Third KPI card label and Competence Center column truncated.

**Suggestion:** Consider adding horizontal scroll on table containers, using responsive breakpoints, or implementing `text-overflow: ellipsis` with tooltips on hover.

### UI-2: Project Workbench shows LoB internal code instead of display name (Medium)
- **Module:** Project Workbench → Overview tab
- **Steps:** Select any project (e.g., ERP Integration Phase 2)
- **Expected:** "LoB: Truck Systems"
- **Actual:** "LoB: lob-ts" (internal slug)
- **Also affects:** AI/ML Experimentation Lab shows "LoB: lob-cv" instead of "Commercial Vehicle"
- **Impact:** Medium — exposes internal identifiers to end users

### UI-3: Change Request category badge shows snake_case (Low)
- **Module:** Portfolio Overview → Approvals → CR Detail side panel
- **Steps:** Click any CR in the Approvals list
- **Expected:** Category badge shows "External Cost"
- **Actual:** Category badge shows "External_cost" (snake_case from backend)
- **Impact:** Low — cosmetic, but looks unprofessional

### UI-4: Reporting breadcrumb shows kebab-case slug instead of friendly name (Low)
- **Module:** Reporting → Any report
- **Steps:** Open any report (e.g., Programme / Multi-Project Rollup)
- **Expected:** Breadcrumb shows "CRETA / Reporting / Programme Rollup"
- **Actual:** Breadcrumb shows "CRETA / Reporting / programme-rollup"
- **Also affects:** "forecast-accuracy", "cost-center-summary", etc.
- **Impact:** Low — cosmetic

### UI-5: Reporting table currency format inconsistent with rest of app (Medium)
- **Module:** Reporting → All report table views
- **Steps:** Open any report and view the Table tab
- **Expected:** Currency format consistent with rest of app: "€1,3M" or "€213K" (abbreviated European with € prefix)
- **Actual:** Full decimal German format with € suffix: "1.314.600,00 €", "213.200,00 €"
- **Impact:** Medium — creates a jarring inconsistency between the report KPI cards (which use €11,2M format correctly) and the report table data. The KPI cards use `formatCurrency()` but the table rows appear to use raw `Intl.NumberFormat` or `formatCurrencyDetailed()`.
- **Note:** This may be intentional (detailed reports showing exact amounts) but the € symbol placement (suffix vs prefix) should at minimum be consistent.

### UI-6: Change History CR card shows stray icon (Low)
- **Module:** Project Workbench → Change History tab
- **Steps:** Scroll to "Increase Senior Developer hours Mar-Jun 2026" CR card
- **Expected:** Clean card layout
- **Actual:** A small sparkle/merge icon appears below the text with no apparent purpose
- **Impact:** Low — cosmetic

### UI-7: Capacity Management "My Team" tab doesn't work for Controller persona (Low)
- **Module:** Capacity Management
- **Steps:** As Anna Meier (Controller), navigate to Capacity Management. Click "My Team" tab.
- **Expected:** Either show a message like "No team assigned" or hide the tab entirely for users without a cost center
- **Actual:** Tab is visible and clickable but nothing happens — stays on Organization Overview
- **Impact:** Low — confusing UX for Controller persona who doesn't own a cost center

### UI-8: Compare Scenarios button text truncated (Low)
- **Module:** What-If Simulator → Scenario list
- **Steps:** View scenario list page
- **Expected:** Button shows "Compare Scenarios" (plural)
- **Actual:** Button shows "Compare Scenario" (singular, text cut off at right edge)
- **Impact:** Low — cosmetic

---

## Data Display Issues

### DATA-1: Portfolio dashboard says "23 projects" but RAG donut shows "22 projects" (Low)
- **Module:** Portfolio Overview → Dashboard
- **Steps:** Check Launchpad tile ("23 projects, 1 pending approval") vs RAG Distribution donut ("22 projects")
- **Expected:** Consistent project count
- **Actual:** Discrepancy of 1 project
- **Likely explanation:** The RAG donut excludes "Pending Approval" projects (Autonomous Braking Prototype) which have no RAG status yet. This may be intentional, but the messaging is confusing — the tile says "23 projects" including pending ones, while the donut only counts active ones with a RAG rating.
- **Suggestion:** Either label the donut "22 active projects" or add a gray "Pending" slice

### DATA-2: Accelerate Rail Digitalization scenario shows very large budget drop (Low)
- **Module:** What-If Simulator → Compare Scenarios
- **Steps:** Compare "Accelerate Rail Digitalization" scenario
- **Expected:** Scenario total reflects realistic adjustments
- **Actual:** Current State €11,4M → Scenario €2,2M with delta -€9,3M. This appears to be a 80% budget reduction which seems extreme for an "acceleration" scenario.
- **Likely explanation:** The scenario may only include the affected Rail Systems projects (€2,2M scope), not the full portfolio. If so, the comparison card is misleading by putting it next to "Current State: €11,4M" without clarifying scope.
- **Impact:** Low — demo data, but may confuse during presentation

---

## What Worked Well

- **Role switching:** All 4 personas load correctly with appropriate notifications, modules, and data scoping
- **All 6 modules functional:** Launchpad, Portfolio Overview, Project Workbench, Capacity Management, What-If Simulator, Reporting, Administration — all load and display data
- **No runtime errors:** Zero console errors, zero failed network requests, zero backend 500 errors throughout entire test
- **Tree table expansion:** Portfolio tree (LoB → Program → Project) expands/collapses correctly
- **Side panels:** Intake detail, CR approval detail, and resource request detail panels all work correctly with full data
- **Charts:** All Recharts components render (bar charts, line charts, donut charts, heatmaps)
- **Filter bars:** All dropdown filters present and functional across modules
- **Breadcrumb navigation:** CRETA logo correctly navigates to Launchpad from any module
- **Help & FAQ:** "?" button opens Help panel with relevant FAQ items
- **Module Guide:** "Guide" buttons visible on appropriate modules

---

## Test Coverage Matrix

| Module | Tested | Personas | Result |
|--------|--------|----------|--------|
| Launchpad | Yes | All 4 | Pass |
| Portfolio Overview - Dashboard | Yes | Anna Meier | Pass |
| Portfolio Overview - Intake Queue | Yes | Anna Meier | Pass |
| Portfolio Overview - Approvals | Yes | Anna Meier | Pass |
| Project Workbench - Overview | Yes | Anna Meier | Pass (UI-2) |
| Project Workbench - Forecast & Planning | Yes | Anna Meier | Pass |
| Project Workbench - Change History | Yes | Anna Meier | Pass (UI-6) |
| Capacity Management - My Team | Yes | Thomas Brenner | Pass |
| Capacity Management - Org Overview | Yes | Anna Meier | Pass (UI-7) |
| Capacity Management - Resource Requests | Yes | Thomas Brenner | Pass |
| What-If Simulator - Scenario List | Yes | Anna Meier | Pass |
| What-If Simulator - Scenario Detail | Yes | Anna Meier | Pass |
| What-If Simulator - Compare | Yes | Anna Meier | Pass |
| Reporting - Library | Yes | Anna Meier | Pass |
| Reporting - Programme Rollup | Yes | Anna Meier | Pass (UI-5) |
| Reporting - Forecast Accuracy | Yes | Anna Meier | Pass (UI-5) |
| Administration - All Entities | Yes | Anna Meier | Pass |
| Administration - Audit Log | Yes | Anna Meier | Pass |
| Cross-module: Notifications | Yes | Anna Meier | Fail (BUG-1) |
| Cross-module: CRETA → Launchpad | Yes | All | Pass |
| Cross-module: Help & FAQ | Yes | Anna Meier | Pass |

---

## Recommended Priority for Fixes

### High Priority (fix before demo)
1. **UI-2** — LoB internal code shown in Workbench (exposes internals)
2. **BUG-1** — Notification deep-link doesn't activate Approvals tab

### Medium Priority (should fix)
3. **UI-5** — Reporting table currency format inconsistency
4. **UI-3** — Snake_case in CR category badge
5. **UI-1** — Table/card truncation (at least the worst offenders)

### Low Priority (nice to have)
6. **UI-4** — Breadcrumb kebab-case slug
7. **UI-7** — My Team tab for Controller persona
8. **BUG-2** — Role persistence across refresh
9. **DATA-1** — Project count discrepancy messaging
10. **UI-6** — Stray icon in Change History
11. **UI-8** — Compare button text
12. **DATA-2** — Scenario comparison scope clarity
