# Session 5 — Seed Data

**Goal:** Generate the complete seed data following the authoritative seed data specification. Validate all consistency rules. Verify walkthrough anchors and pending action types with the new data.

**Prerequisites:** Sessions 1–4 complete. All structural/UI changes and data model changes (especially CapEx/OpEx per line item) must be in place before generating seed data.

**Reference documents:** `CRETA_v3_Section9_Seed_Data.md` is the **primary** document for this session. `CRETA_v3_Change_Specification.md` §15 for walkthrough anchors, §1.4 for pending action type definitions.

---

## Generation Approach

**Output:** Single SQL seed file (`seed.sql`) containing all INSERT statements. JSON fixtures remain for static content (module manuals, FAQ walkthroughs, AI Advisor responses).

**Demo date:** March 2026. All time-dependent logic is calibrated to this date.

**Data span:** January 2021 – December 2029 (108 months, 9 fiscal years). Not every entity spans the full range — see §9.1 of the seed data spec.

**Arithmetic integrity is paramount.** Every project's total budget must equal the sum of its monthly line items. Cost calculations must use the correct per-role, per-location hourly rates. This is the most common source of seed data bugs — take extra care here.

---

## What to Generate

Work through the seed data specification section by section:

1. **Organizational structure (§9.2):** 4 LoBs, 10 cost centres, 3 locations, 4 competence centres
2. **Role catalogue and rates (§9.3):** 12 roles with per-location hourly rates
3. **People (§9.4):** 50 people following the distribution table. Culturally appropriate names per location. Ensure the over-allocated Senior Developer in BUD/APD and the scarce role bottlenecks.
4. **Programmes (§9.5):** 4 programmes, one per LoB
5. **Projects and services (§9.6):** 32 entities with full metadata. Pay attention to the narrative descriptions — they dictate the financial data patterns.
6. **External cost line items (§9.7):** 3–8 per project, with categories, vendors, procurement lifecycle statuses, and monthly baseline/forecast/actuals. Use the detailed examples for ERP Integration, Cloud Migration Wave 3, and IAM Overhaul as templates.
7. **Change requests (§9.8):** ~25–30 historical CRs plus 5 active CRs at demo start. The active CRs drive specific pending action types — get these exactly right.
8. **Workflow states (§9.9):** Forecast cycle states for Priya's projects, the pending resource request, the intake queue state. Every one of the 9 action types must be triggerable.
9. **Phase data (§9.10):** Full phases for 4 projects, partial for 3, none for the rest.
10. **CapEx/OpEx classification (§9.11):** Per-line-item tags. Three projects with mixed classification.
11. **What-If scenarios (§9.12):** Three pre-built scenarios with all their actions.

---

## Consistency Validation

After generating the seed data, write and run validation scripts (Python or SQL) that check every rule from §9.13:

1. **Summation integrity:** Project total = sum of monthly line item values (baseline, forecast, actuals independently)
2. **Temporal consistency:** No actuals after February 2026. March 2026 may have partial actuals. No forecast-only values in months where actuals exist.
3. **Allocation consistency:** No person exceeds available capacity except the intentionally over-allocated Senior Developer in BUD/APD
4. **CR consistency:** Historical approved CRs are reflected in current forecast values. Active CRs at the correct lifecycle stage.
5. **Status consistency:** Stage 2 CRs have CC Owner confirmation records. Returned CRs have Controller feedback text.
6. **Timeline consistency:** No allocations or costs outside a project's active timeline
7. **Rate consistency:** Cost = hours × correct per-role, per-location rate
8. **CapEx/OpEx consistency:** Project-level classification matches dominant line-item classification

These scripts should be re-runnable — they'll be used again in Session 6 after any data fixes.

---

## Walkthrough Anchor Spot Check

Walk through at least 5 anchors from §15 of the change specification, spanning all 4 roles:

- **Anchor #2** (PL Launchpad): Switch to Priya, verify action types #1, #2, #6, #7, #8 visible
- **Anchor #6** (Intake detail): Open Autonomous Braking Prototype, verify full resource plan and external cost breakdown renders
- **Anchor #7** (Approvals detail): Open CR-C or CR-D, verify comparison cell pattern renders correctly
- **Anchor #11** (Change History): Open ERP Integration Phase 2 CR history, verify 8–10 CRs present, open one in full detail
- **Anchor #13** (Capacity heatmap): Switch to Thomas Brenner, verify over-allocated person visible

---

## Verification Checklist

- [ ] All 32 entities present with correct metadata
- [ ] All 50 people generated with correct role/location/cost centre assignments
- [ ] All consistency validation scripts pass
- [ ] All 9 pending action types fire on the correct role's Launchpad
- [ ] At least 5 walkthrough anchors verified
- [ ] External cost line items have correct procurement lifecycle statuses relative to timeline
- [ ] What-If scenarios load with their pre-built actions
- [ ] CapEx/OpEx per-line-item tags present on mixed-classification projects
- [ ] Phase data present for the correct projects (4 full, 3 partial, rest none)
