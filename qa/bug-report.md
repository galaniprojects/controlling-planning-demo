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
| **TOTAL** | **74** | **69** | **1** | **4** | |

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
