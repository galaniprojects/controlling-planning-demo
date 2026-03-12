# Session 6 — End-to-End Verification & Polish

**Goal:** Structured demo walkthrough with all 4 roles. Fix any issues found. Tune data for visual impact. This session is about quality, not new features.

**Prerequisites:** Sessions 1–5 complete. All features built, seed data generated and validated.

**Reference documents:** `CRETA_v3_Change_Specification.md` §15 (walkthrough anchors), §16 (testing strategy), §1.4 (pending action types). `CRETA_v3_Section9_Seed_Data.md` §9.13 (consistency rules).

---

## Step 1: Full Walkthrough — All 20 Anchors

Walk through every anchor from §15 of the change specification as the specified role. For each anchor, confirm: the screen renders correctly, the data makes sense, interactions work, and deep-links navigate to the correct target.

| # | Anchor | Role |
|---|---|---|
| 1 | Switch between all 4 roles, see different Launchpad views | All |
| 2 | PL pending actions — forecast due, overdue, CR returned, CR approved, project approved | Priya (PL) |
| 3 | CC Owner pending actions — CR pending confirmation | Thomas (CC Owner) |
| 4 | Controller pending actions — CR pending approval, new project, forecast overdue (info), scenario published | Anna (Controller) |
| 5 | Portfolio tree browse, KPI filter recalculation | Anna (Controller) |
| 6 | Intake detail — Autonomous Braking Prototype | Anna (Controller) |
| 7 | Approvals detail — CR-C or CR-D | Anna (Controller) |
| 8 | Timeline with full phase data, toggle, slip | Priya (PL) |
| 9 | Timeline with no phase data — graceful degradation | Priya (PL) |
| 10 | Forecast wizard all 5 phases including Phase 4 review | Priya (PL) |
| 11 | Change History full detail on ERP Integration | Priya (PL) |
| 12 | CapEx/OpEx mixed classification on planning grid | Priya (PL) |
| 13 | Team heatmap with over-allocated person | Thomas (CC Owner) |
| 14 | Resource request response | Thomas (CC Owner) |
| 15 | Organization-wide heatmap, all pivot dimensions | Anna (Controller) |
| 16 | Open existing What-If scenario | Anna (Controller) |
| 17 | Compare two scenarios side by side | Anna (Controller) |
| 18 | AI Advisor — goal, paths, apply | Anna (Controller) |
| 19 | Report with year selector and collapsible columns | Anna (Controller) |
| 20 | Submit new project from Workbench | Priya (PL) |

Document any issues as a punch list.

---

## Step 2: Action Cycle Verification

Complete one full action cycle end to end:

1. As Priya (PL): open a project, start a forecast cycle, make changes, submit
2. As Thomas (CC Owner): see the CR appear on Launchpad, open Capacity Management, confirm the CR
3. As Anna (Controller): see the CR advance to Approvals, open full detail, approve it
4. As Priya (PL): see the "CR approved" notification on Launchpad, verify forecast values updated

This tests the entire CR lifecycle: submission → CC confirmation → Controller approval → forecast update → notification clearing.

---

## Step 3: Cross-Cutting Verification

These items span multiple modules and weren't fully testable until everything was in place:

1. **Collapsible year columns** — verify they work in at least 3 contexts: FC&Planning grid, Approvals detail, Reporting
2. **Timeline visualization** — verify all three phase data states: full (ERP Integration), partial (Rail Diagnostics), none (any service)
3. **CapEx/OpEx aggregation** — verify per-line-item tags display in the planning grid and aggregate correctly in Portfolio KPIs and detail view KPI strips
4. **Pending action reactivity** — after completing an action (e.g., approving a CR), verify it disappears from the actor's Launchpad and any downstream actions appear on the next actor's Launchpad
5. **European number formatting** — spot check financial values across 3+ screens for consistent formatting

---

## Step 4: Data Tuning

If the walkthrough reveals data that looks odd or doesn't demo well:

- Financial values that are too similar (hard to distinguish in charts) — adjust for visual contrast
- KPI values that look unrealistic at portfolio level — tune project budgets
- Timeline chart that doesn't show enough visual interest — adjust phase dates or actuals patterns
- Scenarios with impact numbers that are hard to interpret — adjust action parameters

The goal is visual impact during a live demo, not accounting precision. Round numbers, clear contrasts, and obvious patterns.

---

## Step 5: Re-run Consistency Checks

After any data fixes in Step 4, re-run the validation scripts from Session 5 to confirm nothing was broken.

---

## Final Verification Checklist

- [ ] All 20 walkthrough anchors pass
- [ ] Full CR lifecycle works end to end (submit → confirm → approve → forecast update → notification)
- [ ] All 9 pending action types fire and clear correctly
- [ ] Collapsible year columns work across all deployment contexts
- [ ] Timeline visualization degrades gracefully across all three phase data states
- [ ] CapEx/OpEx per-line-item displays and aggregates correctly
- [ ] European number formatting consistent across all screens
- [ ] Consistency validation scripts pass after any data tuning
- [ ] No visual glitches or broken layouts during role switching
- [ ] Demo is ready for a live walkthrough
