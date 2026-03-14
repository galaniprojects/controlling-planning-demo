# Session 3 — Project Workbench

**Goal:** Build the project timeline visualization, wire up the detail view component in Change History and Forecast Cycle Phase 4, add the Workbench submit entry point, and implement the CapEx/OpEx per-line-item data model change.

**Prerequisites:** Sessions 1–2 complete (collapsible years, global patterns, detail view component, Launchpad).

**Reference documents:** `CRETA_v3_Change_Specification.md` (§3, §6.5 Forecast Cycle Review, §10) and `CRETA_v3_Section9_Seed_Data.md` (§9.10 for phase data, §9.11 for CapEx/OpEx classification).

---

## Item 1: Project Timeline Visualization

**Spec reference:** §3.1

**What to build:** A new chart at the top of the Project Workbench Overview tab, above the existing forecast trajectory chart.

This is the most visually complex component in v3. Key elements:

**Monthly view (default):** Grouped bar chart — three bars per month (Baseline gray, Forecast blue, Actuals green). Past months where actuals exceed forecast get a red dot above the actuals bar. Elapsed months have a subtle background tint.

**Cumulative view (toggle):** Line chart showing running totals for all three series, plus a red dashed "Budget Ceiling" line.

**Phase strip:** Thin horizontal bar below month labels showing project phases as coloured segments. Must degrade gracefully:
- Full phase data → complete strip with baseline markers and slip indicators
- Partial phase data → simpler strip
- No phase data → no strip at all

See §9.10 for which projects have full, partial, and no phases.

**Today line:** Red dashed vertical line with "TODAY" badge.

**Year separators:** Use the global pattern from Session 1.

**Summary strip:** Below the chart — Baseline, Forecast, YTD Actuals, Plan Drift, Execution Variance.

**Scrollability:** Horizontally scrollable within fixed-width viewport. Default view centred ~3 months before today to ~6–9 months after. Y-axis labels stay fixed during scroll.

---

## Item 2: Change History — Full Detail View

**Spec reference:** §3.2 + §6.5 (Change History variant)

**What to build:** Add a "View Full Detail" button on compact CR cards in the Change History tab. Opens the detail view component (built in Session 2) in **read-only mode** — same layout as Approvals detail but without action buttons.

**Header:** Breadcrumb, CR title, lifecycle status badge (Approved / Rejected / Sent Back), project name, submitted by + date, decided by + date.

---

## Item 3: Submit New Project in Workbench

**Spec reference:** §3.3

**What to build:** A "Submit New Project" button in the Project Workbench left panel header. This is the second entry point alongside the Launchpad tile (built in Session 1). Both open the same submission form.

---

## Item 4: CapEx/OpEx Per Line Item

**Spec reference:** §10

**What to build:** Data model change — move CapEx/OpEx from a project-level flag to per-line-item classification. Each row in the planning grid (role allocations and external cost line items) gets tagged as CapEx or OpEx.

**Impact areas:**
- Database schema: add capex_opex field to the line item tables
- Planning grid display: show the CapEx/OpEx tag per row
- All summary/aggregation views: CapEx/OpEx splits must aggregate from line items, not project-level flags
- Detail view component: CapEx/OpEx visible per line item

See §9.11 for which projects have mixed classifications (ERP Integration Phase 2, SAP S/4HANA Migration, IAM Overhaul).

**Note:** The seed data will be regenerated in Session 5 with the correct per-line-item tags. For now, ensure the data model and UI support it. You can add temporary test data to verify.

---

## Item 5: Forecast Cycle Review — Phase 4

**Spec reference:** §6.5 (Forecast Cycle Review variant — expanded specification)

**What to build:** Wire up the detail view component in the forecast wizard's Phase 4 (Review & Submit). This is the most unique variant — the PL is composing their submission, not reviewing someone else's.

**Key differences from other detail view contexts:**
- **Unified grid** showing all line items affected by Phase 3 edits, using the comparison cell pattern
- **Justification section below the grid**, grouped by affected cost centre. Each group gets: cost centre name, list of affected line items, and an editable text field for justification. PL must provide justification per group before submitting.
- **System-suggested indicator** on line items that originated from Phase 2 suggestions — subtle "System suggested" tag that carries through to the CR record
- **Action buttons:** Submit / Save Draft / Cancel
- **On Submit:** backend creates separate CRs per affected cost centre, routed to the relevant CC Owner. The PL sees one submission action; the system handles the splitting.

---

## Verification Checklist

- [ ] Timeline chart renders with monthly view (three bars per month)
- [ ] Monthly ↔ cumulative toggle works
- [ ] Phase strip shows correctly for a project with full phase data (e.g., ERP Integration Phase 2)
- [ ] Phase strip degrades gracefully — partial phases show simpler strip, no phases show no strip
- [ ] Today line and year separators visible
- [ ] Chart scrolls horizontally, Y-axis labels stay fixed
- [ ] Change History "View Full Detail" opens read-only detail view with correct status badge
- [ ] Submit New Project button visible in Workbench left panel header, opens same form as Launchpad tile
- [ ] CapEx/OpEx tag visible per line item in the planning grid
- [ ] CapEx/OpEx aggregation in KPIs pulls from line items, not project-level flag
- [ ] Phase 4 review shows unified grid with all affected lines
- [ ] Per-cost-centre justification fields appear below the grid
- [ ] Submit in Phase 4 creates CRs and routes to CC Owners
