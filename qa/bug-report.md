# CRETA Demo App — E2E Bug Report
**Date started:** 2026-03-24
**Tester:** Claude Code (automated via preview tooling)
**Environment:** macOS, Chromium (preview tools, 1440x900 viewport), Backend port 8000, Frontend port 5173

## Summary
| Suite | Scenarios | Pass | Fail | Partial | Notes |
|-------|-----------|------|------|---------|-------|
| Suite 1 — Global Shell & Launchpad | 7 (GLB-01 to GLB-07) | 7 | 0 | 0 | All pass. Test plan updated to reflect 7 tiles (Documentation added). |
| Suite 2 — Portfolio Overview Dashboard | 13 (PO-01 to PO-13) | 13 | 0 | 0 | All pass. Zero console errors, zero failed network requests. |
| Suite 3 — Portfolio Intake & CR Approvals | 13 (INT-01 to INT-13) | 12 | 0 | 1 | INT-09 partial — Impact column showed "—" in table. Fixed: reuse `_compute_cr_impact_eur` from workbench. |
| Suite 4 — Project Workbench | 17 (WB-01 to WB-17) | 16 | 0 | 1 | WB-12 partial: completed projects don't auto-expand final year in Forecast Grid. |
| Suite 5 — Forecast Wizard | 10 (FW-01 to FW-10) | 7 | 1 | 2 | FW-05 FAIL: Phase 3 crashes (blank screen). FW-06/FW-07 blocked by Phase 3 crash. |
| Suite 6 — Capacity Management | 14 (CAP-01 to CAP-14) | 14 | 0 | 0 | All pass. All role gates, heatmap, drill-down, requests, and pivot views working. |
| Suite 7 — What-If Simulator | 16 (SIM-01 to SIM-16) | 14 | 0 | 2 | SIM-14 partial: AI Advisor opens but no pre-loaded suggestions. SIM-16 partial: Executive read-only not enforced. |
| Suite 8 — Reporting | 13 (RPT-01 to RPT-13) | 13 | 0 | 0 | All pass. All 5 reports, saved views, custom groups, drill-down, monthly toggle, column config working. |
| Suite 9 — Administration | 18 (ADM-01 to ADM-18) | 18 | 0 | 0 | All pass. Role gate, CRUD, hierarchy, deactivation, reset all working. |
| Suite 10 — Cross-Module Integration | 12 (XM-01 to XM-12) | 10 | 0 | 2 | XM-01 partial: overdue forecast action links to /portfolio not /workbench. XM-11 partial: PL has no Resubmit button after send-back. |
| **TOTAL** | **133** | **124** | **1** | **8** | |

## Issues

### UI-001: CR Approvals table Impact column shows "—" for all CRs (P3) — FIXED
- **Category:** Functional Bug
- **Suite/Scenario:** Suite 3 / INT-09
- **Persona:** Anna Meier (Controller)
- **Root Cause:** `portfolio.py` `get_pending_approvals()` tried to parse `d.delta` strings (e.g., "+20 hrs/mo") as floats, which always failed. The Workbench had a correct helper `_compute_cr_impact_eur()` that parses `old_value`/`new_value` and converts hours to EUR via rate tables.
- **Fix:** Replaced the naive delta parsing loop with a call to `_compute_cr_impact_eur(cr, db)` imported from `workbench.py`.
- **Files Changed:** `backend/routers/portfolio.py`

### SPEC-001: Test plan expects 6 Controller tiles, app shows 7 (P3) — FIXED
- **Category:** Spec Gap
- **Fix:** Updated `qa/test-plan.md` GLB-03 to expect 7 tiles (added Documentation).

---

## Session B Issues (Suites 4-6)

### UI-002: Completed projects don't auto-expand final year in Forecast Grid (P3) — FIXED
- **Category:** Functional Bug
- **Suite/Scenario:** Suite 4 / WB-12
- **Persona:** Anna Meier (Controller)
- **Root Cause:** Race condition in `useCollapsibleYears.ts`. The hook seeds year states when forecast data loads, but the `defaultExpandedYear` prop arrives later (async overview API call). By the time the correct year arrives, the years are already seeded as collapsed. The hook's `useEffect` skipped existing years.
- **Fix:** Updated the useEffect to re-apply expansion when `EXPAND_YEAR` changes — collapses the previously expanded year and expands the new target.
- **Files Changed:** `frontend/src/hooks/useCollapsibleYears.ts`

### UI-003: Forecast Wizard Phase 3 (Edit Forecast) crashes — blank screen (P1) — FIXED
- **Category:** Crash / Functional Bug
- **Suite/Scenario:** Suite 5 / FW-05
- **Persona:** Priya Sharma (Project Lead)
- **Root Cause:** Variable name typo in `Phase3EditForecast.tsx`. Line 100 defined `totalDeltaEurEur` (doubled suffix) but lines 384/391 referenced `totalDeltaEur`, causing a ReferenceError that crashed the entire component (no error boundary).
- **Fix:** Renamed `totalDeltaEurEur` to `totalDeltaEur` on line 100.
- **Files Changed:** `frontend/src/modules/workbench/forecast/Phase3EditForecast.tsx`

### SPEC-002: Test plan persona IDs don't match actual role IDs (P3)
- **Category:** Spec Gap
- **Details:** Test plan Section 4 lists persona storage IDs as `persona-project-lead` and `persona-executive`, but actual IDs are `persona-pl` and `persona-exec`.
- **Impact:** Informational only — testers using localStorage directly would get 404s.
- **Fix needed:** Update `qa/test-plan.md` persona table to use correct IDs.

---

## Session C Issues (Suites 7-8)

### UI-004: Simulator Executive read-only not enforced (P2) — FIXED
- **Category:** Functional Bug
- **Suite/Scenario:** Suite 7 / SIM-16
- **Persona:** Thomas Becker (Executive)
- **Details:** Executive role can access the Simulator (correct) but all modification controls are visible and enabled:
  - "Create New Scenario" button is enabled on the Scenario Manager page
  - "ADD ACTION" form with action type dropdown, project selector, and "Apply Action" button visible in workspace
  - Remove (X) buttons visible on applied actions
- **Expected:** Executive should have view-only access — "Create New Scenario" button hidden/disabled, ADD ACTION section hidden, remove buttons hidden.
- **Impact:** Executive can modify scenarios that should be read-only for them.
- **Fix:** Added `readOnly` prop chain: `ScenarioManager` hides Create button for executive, `ScenarioWorkspace` passes `readOnly` to `ActionPanel`, which hides AddActionForm/metadata editing and passes to `ActionItem` to hide remove buttons.
- **Files Changed:** `ScenarioManager.tsx`, `ScenarioWorkspace.tsx`, `ActionPanel.tsx`, `ActionItem.tsx`

### UI-005: AI Advisor panel has no pre-loaded suggestions (P3)
- **Category:** UX Gap
- **Suite/Scenario:** Suite 7 / SIM-14
- **Persona:** Anna Meier (Controller)
- **Details:** AI Advisor panel opens with a text input field and "Analyze Portfolio" button, but does not show pre-loaded optimization suggestions with "Apply" buttons as described in the test plan. The user must type a goal and click Analyze to get recommendations.
- **Expected:** Panel should show pre-loaded AI-generated optimization paths/recommendations with Apply buttons.
- **Impact:** Low — the panel works functionally (input + analyze), just no pre-loaded suggestions. May be by design for the demo.
- **Files to check:** `frontend/src/modules/simulator/AIAdvisorPanel.tsx`, `backend/seed/fixtures/advisor_goals.json`

---

## Session D Issues (Suites 9-10)

### UI-006: Overdue forecast pending action links to Portfolio instead of Workbench (P3) — FIXED
- **Category:** Navigation Bug
- **Suite/Scenario:** Suite 10 / XM-01
- **Persona:** Anna Meier (Controller)
- **Details:** On the Launchpad, clicking the "Projects with overdue forecasts — ERP Integration Phase 2" pending action navigates to `/portfolio` (Dashboard tab) instead of `/workbench?project=proj-erp2`. CR-related pending actions correctly navigate to `/portfolio/approvals?cr=19`.
- **Expected:** Overdue forecast actions should navigate to the Workbench with the relevant project pre-selected.
- **Impact:** Low — user must manually navigate to Workbench after clicking. CR deep links work correctly.
- **Fix:** Changed Controller's overdue forecast pending action to use `deep_link_module="workbench"` with first overdue project ID and `deep_link_tab="forecast"`.
- **Files Changed:** `backend/routers/global_launchpad.py`

### UI-007: PL cannot resubmit after Controller send-back (P2) — FIXED
- **Category:** Functional Bug
- **Suite/Scenario:** Suite 10 / XM-11
- **Persona:** Priya Sharma (Project Lead)
- **Details:** After Controller sends back a submission with feedback, the PL can see the "Changes Requested" status and the controller's feedback text in the Intake Queue side panel. However, there is no "Resubmit for Approval" button available for the PL to resubmit the project. The side panel shows only "Open Full Detail" with no action buttons.
- **Expected:** PL should see a "Resubmit for Approval" button in the side panel (or on the full detail page) to resubmit the project after addressing feedback.
- **Impact:** Medium — the send-back workflow is incomplete without the resubmit action. Controller can send back, PL sees feedback, but cannot complete the cycle.
- **Fix:** Added `handleResubmit` function and "Resubmit for Approval" button block to `IntakeDetailPanel.tsx` for non-Controller users when status is `changes_requested`. Shows amber feedback banner and button that calls `portfolioApi.resubmitIntake()`.
- **Files Changed:** `frontend/src/modules/portfolio/intake/IntakeDetailPanel.tsx`

### UI-008: React key warning in CompetenceCentersPanel (P3) — FIXED
- **Category:** Code Quality
- **Suite/Scenario:** Suite 9 / ADM-05
- **Persona:** Anna Meier (Controller)
- **Details:** When expanding a Competence Center to view assigned employees, React logs "Each child in a list should have a unique key prop" warnings from `CompetenceCentersPanel` `tbody`. This occurs 4 times (once per expanded CC).
- **Expected:** No console warnings.
- **Impact:** Cosmetic — functionality works correctly, but React dev warnings indicate missing key props on list items.
- **Fix:** Changed bare `<>` fragment to `<Fragment key={item.id}>` in the `.map()` loop.
- **Files Changed:** `frontend/src/modules/admin/entities/CompetenceCentersPanel.tsx`

### SPEC-003: Test plan persona storage key mismatch (P3) — FIXED
- **Category:** Spec Gap
- **Details:** Test plan Section 4 lists persona storage key as `selected-persona` but actual localStorage key used by the app is `creta-persona`.
- **Impact:** Informational — testers switching roles via localStorage need to use the correct key.
- **Fix needed:** Update `qa/test-plan.md` Section 4 to reference `creta-persona` as the storage key.
