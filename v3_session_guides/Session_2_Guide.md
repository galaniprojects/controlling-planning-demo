# Session 2 — Detail View Component + Portfolio

**Goal:** Build the reusable detail view grid component and deploy it in the Portfolio Overview module (Approvals and Intake). Restructure the Portfolio KPIs and add per-filter reset.

**Prerequisites:** Session 1 complete (collapsible year columns, global design patterns, Launchpad).

**Reference documents:** `CRETA_v3_Change_Specification.md` (§2, §6) and `CRETA_v3_Section9_Seed_Data.md` for CR and intake data context.

---

## Item 1: Detail View Pattern (Reusable Component)

**Spec reference:** §6 (all subsections)

**What to build:** A month × line-item grid component that will be used in four locations across the app. Build it as a single configurable component with context-specific adaptations passed as props or configuration.

**Core grid structure (§6.1):**
- Rows: only affected line items, grouped by category ("Internal Resources" / "External Costs" as section headers)
- Columns: monthly timeline with collapsible years (use the component from Session 1), plus three summary columns (Current, Proposed, Delta)
- Row totals show primary unit + euro equivalent

**Two cell patterns:**

1. **Comparison pattern (§6.2)** — for Approvals, Change History, Forecast Review. Unchanged cells in muted gray. Changed cells with warm background (#fffbeb) and three-line stack: proposed → delta → current. Delta colour logic: green for reductions, blue for moderate increases (<25%), red for significant increases (≥25% or new from zero). Add a note in the UI that the 25% threshold is configurable.

2. **Intake pattern (§6.3)** — single values, no before/after. Muted gray for zero months, normal weight for months with values.

**KPI summary strip (§6.4):** Below the grid. Three KPIs horizontal. Intake variant simplifies to Total Internal / Total External / Grand Total.

**Build all four context adaptations (§6.5):** Approvals, Intake, Change History, Forecast Cycle Review. The first two are wired up in this session. Change History and Forecast Review are wired in Session 3.

---

## Item 2: KPI Restructuring

**Spec reference:** §2.1

**What to build:** Replace the current KPI row in Portfolio Overview Dashboard with: Baseline, Current Forecast, YTD Actuals, Plan Drift (amount + percentage). Keep Run/Change and CapEx/OpEx as secondary KPIs.

**Critical:** All KPIs must recalculate dynamically based on active filters. This was broken in v2 — verify it works after implementation.

---

## Item 3: Per-Filter Reset

**Spec reference:** §2.2

**What to build:** Each filter dropdown in the Portfolio Overview gets a "Select All" / "Clear" option for resetting individual filters without clearing all filters at once.

---

## Item 4: Approvals — Full Detail Workspace

**Spec reference:** §2.3 + §6.5 (Approvals variant)

**What to build:** Wire the detail view component into the Approvals tab. The existing two-level interaction pattern (drawer preview → full detail workspace) stays. The full detail workspace now uses the detail view component with the comparison cell pattern.

**Header content:** Breadcrumb, CR title, status badge, project name, category, submitted by + date, confirmed by (CC Owner) + date.

**Action buttons:** Approve / Reject / Request Changes (with comment field for Reject and Request Changes).

---

## Item 5: Intake — Full Detail Workspace

**Spec reference:** §2.4 + §6.5 (Intake variant)

**What to build:** Same two-level pattern as Approvals. The full detail workspace uses the detail view component with the intake cell pattern (single values, no deltas).

**Header content:** Breadcrumb, project name, status badge, requesting LoB, project lead, proposed timeline.

**Additional sections:** Business case / justification below KPIs. Timeline bar (simple start/end) if defined.

**Action buttons:** Approve / Reject / Request Changes.

---

## Verification Checklist

- [ ] Detail view component renders correctly with comparison cell pattern (test with an existing CR in Approvals)
- [ ] Detail view component renders correctly with intake cell pattern (test with Autonomous Braking Prototype)
- [ ] Changed cells show three-line stack with correct delta colours
- [ ] Collapsible year columns work within the detail view grids
- [ ] Elapsed month tinting applied in detail view grids
- [ ] KPI summary strip renders below the grid in both contexts
- [ ] Portfolio KPIs show Baseline / Current Forecast / YTD Actuals / Plan Drift
- [ ] KPIs recalculate when filters are changed
- [ ] Per-filter reset ("Select All" / "Clear") works on each individual filter
- [ ] Drawer → full detail navigation works for both Approvals and Intake
- [ ] Action buttons present and functional in both Approvals and Intake detail views
