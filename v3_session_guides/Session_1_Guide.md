# Session 1 — Global Patterns + Launchpad

**Goal:** Build the foundational global components (collapsible year columns, design patterns) and completely rebuild the Launchpad from scratch.

**Prerequisites:** None — this is the first session.

**Reference documents:** `CRETA_v3_Change_Specification.md` (§1, §5, §7) and `CRETA_v3_Section9_Seed_Data.md` for data context.

**Important:** This document supersedes whatever exists in the current codebase. Where the spec describes a component or behaviour, build it as specified even if the existing code does something different.

---

## Item 1: Collapsible Year Columns (Global Component)

**Spec reference:** §5

**What to build:** A reusable column component that makes year headers clickable to expand/collapse monthly columns. This component will be used in every grid across the application — FC&Planning, detail views, reporting. Build it as a shared component from the start.

**Key behaviours:**
- Current year (2026) expanded by default, all other years collapsed
- Collapsed state shows a single summary column with yearly sums
- Chevron indicator: ▸ collapsed, ▾ expanded
- Year labels styled in primary blue (#1e40af) to signal interactivity
- Heavier left border at January columns (year boundary styling)

**Wire it up** to at least the FC&Planning grid in the Project Workbench so it can be verified. Other grids will use it in later sessions.

---

## Item 2: Global Design Patterns

**Spec reference:** §7

**What to build:** Foundational CSS/styling patterns that apply across the entire application. These are not components but shared styles.

**Patterns to implement:**
1. Year separator lines — heavier left border at January columns, bolded January labels
2. Elapsed month tinting — months before the current month (March 2026) get `#fafafa` background in all monthly grids
3. No emojis anywhere — text and Lucide icons only
4. European number formatting — dot for thousands, comma for decimals (€14.400,00)
5. Monospace for financial data — tabular numbers in data cells (IBM Plex Mono or similar)

Items 1–2 are CSS. Items 3–5 may involve utility functions or formatting helpers. Build them as shared utilities.

---

## Item 3: Launchpad Redesign

**Spec reference:** §1 (all subsections)

**What to build:** Complete replacement of the existing Launchpad. Delete the old Launchpad code and build new.

**Three-zone layout:**
- Zone 1 (top centre): CRETA branding with acronym treatment, personal greeting, role badge
- Zone 2 (left, ~2/3 width): Module tiles in 2-column grid with contextual metrics
- Zone 3 (right, ~280px): Pending Actions panel

**The pending actions engine is the most complex part.** The actions list must be dynamically generated from actual system state — not static seed data. See §1.4 for the nine action type definitions including triggers, audience, display text, deep-link targets, and clear conditions.

Key implementation notes:
- Each action deep-links to the relevant module and entity
- Actions are reactive — completing an action removes it, creating work adds to someone's list
- The "Submit New Project" tile (dashed border, "+" icon) appears only for the PL role, integrated into the module tile grid
- Role switch must always land on the Launchpad

---

## Verification Checklist

After completing this session, confirm:

- [ ] Collapsible year columns work in the FC&Planning grid — click to expand/collapse, current year starts expanded, others collapsed
- [ ] Year separator styling visible at January boundaries
- [ ] Elapsed months have subtle background tint
- [ ] Launchpad renders all three zones correctly
- [ ] Role switch from any module lands on the Launchpad
- [ ] Pending actions list populates from system state (with current seed data, at least some action types should be visible depending on role)
- [ ] Module tiles show for each role with correct access
- [ ] "Submit New Project" tile visible only for PL role
- [ ] European number formatting applied where financial data appears
