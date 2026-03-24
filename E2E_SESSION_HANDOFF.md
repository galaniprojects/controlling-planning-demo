# E2E Testing Session Handoff

**Date:** 2026-03-14
**Status:** Partial — 20 of 38 scenarios tested (53%)

## What was done

Ran the first half of `E2E_TEST_PLAN.md` against the live app using preview tooling (1440×900 viewport). All 4 personas were tested. Findings written to `E2E_BUG_REPORT.md` — 7 spec gaps, 3 bugs, 6 UI issues, 2 data issues.

## What still needs testing

18 scenarios remain. Grouped by reason they were skipped:

### Skipped due to context window limit (read-only, safe to test)
| # | Scenario | Module |
|---|----------|--------|
| 14 | Monthly Forecast Wizard | Project Workbench |
| 16 | Change History tab | Project Workbench |
| 18 | Resource Request flow | Capacity Management |
| 19 | Org Overview tab | Capacity Management |
| 24 | Compare Scenarios side-by-side | What-If Simulator |
| 25 | AI Advisor panel | What-If Simulator |
| 28 | Cost Centre Report | Reporting |
| 29 | LoB Report | Reporting |
| 30 | Variance Analysis Report | Reporting |
| 31 | Year-over-Year Report | Reporting |
| 32 | Report Configurator | Reporting |
| 33 | Excel Export | Reporting |

### Skipped because they mutate demo data
| # | Scenario | Module |
|---|----------|--------|
| 15 | CR Routing E2E (approve/reject) | Project Workbench |
| 21 | Create new scenario | What-If Simulator |
| 22 | Edit scenario (add/remove projects) | What-If Simulator |
| 23 | Publish scenario | What-If Simulator |
| 37 | Full CR lifecycle | Cross-module |
| 38 | Submit new project intake | Cross-module |

**Note on mutating tests:** These are safe to run — just call `curl -X POST http://localhost:8000/api/admin/reset-demo` afterward to restore seed data.

## How to continue

1. Start servers: `preview_start` for both `backend` and `frontend` (see `.claude/launch.json`)
2. Reset demo data before starting
3. Work through the 18 untested scenarios using `E2E_TEST_PLAN.md` as the script
4. Append new findings to `E2E_BUG_REPORT.md` (don't overwrite existing issues)
5. Update the coverage matrix at the bottom of the bug report

## Tips from this session

- **Role switching:** Radix dropdown menus need PointerEvent dispatching, not simple `click()`. Use `preview_click` on the trigger, then `preview_click` on the menu item.
- **Navigation:** Don't use `preview_eval('window.location.href = ...')` — it resets React state. Navigate via Launchpad tiles or sidebar links.
- **Viewport:** Resize to 1440×900 at session start for proper table rendering.
