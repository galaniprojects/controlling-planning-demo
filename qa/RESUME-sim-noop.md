# RESUME — Simulator no-op lever fix (updated 2026-06-08)

**Status: WORK COMPLETE & VERIFIED + independent code review addressed.** No code pending.
Code review (`code-reviewer-fresh`): no blockers, 2 should-fix + 2 nits — **all 4 fixed (R1-R4)**,
+4 unit tests, full suite **2448 passed**, isolation harness still ALL PASS. Commits b6a0885 / 08d265b / e00b2db.

## Branch
`fix/sim-noop-levers` (off `origin/main` @ 3e16194 / #129). Tree clean, all work committed.
Last commit: `71d9030` (PROGRESS + bug-report docs).

## What's done (all 15 tasks)
- 7 levers fixed: cut_by_hierarchy, cut_by_transformation, adjust_rate_table, change_budget_envelope,
  inject_hypothetical_project, reassign_hierarchy (engine branches) + rate_escalation (contract reconcile).
- NEW-1/2/3/4 FE: hierarchy node picker, project picker, backlog filter bar, apply-modal copy.
- Verified: full backend suite **2444 passed**; 49 targeted unit tests; isolated harness
  `qa/verify_sim_noop.py` ALL PASS; browser spot-check (Impact +€766K, pickers, filter bar → `qa/screenshots/`).
- Mid-session correction: A3 role scoping → `Forecast.sub_category` (data-model accurate, not allocations);
  contract in `qa/CONTRACTS-sim-noop.md`.
- Docs: PROGRESS.md entry + bug-report resolution section. No model/schema change (in-memory only).
- Agent team `sim-noop-fix` torn down; demo reset.

## RESUME HERE — open decisions
Fix done + reviewed. Remaining:
1. **Open a PR** — `fix/sim-noop-levers` → `main`. NOT yet opened (CLAUDE.md: ask first). Needs confirmation.
2. **Fold in `cut_by_type`** — out-of-scope finding: `catalogueDef.ts` sends `target_type` `'1'|'2'|'non_type_3'`
   but engine reads `'all'|'service'|'project'` → catalogue entry never matches. Needs sign-off.
3. **Stop** — leave as committed.
(Done: independent code review → R1-R4 all fixed + tested.)

## Note on the round-2 finding doc
The NEW-SIM-NOOP *finding* was committed on branch `session/sim-e2e-regression` (f5d8299, 51db753), NOT on
`origin/main`, so this branch's `qa/bug-report-simulator-e2e.md` carries a self-contained resolution section
instead. When both branches reach main the finding + resolution reconcile.

## To restart the app later
- Backend: `cd backend && .venv/bin/python main.py` (:8000)
- Frontend: `cd frontend && npm run dev` (:5173)
- Re-run harness: `cd backend && .venv/bin/python ../qa/verify_sim_noop.py`
