# CRETA v5 — Implementation Guide

*Created: April 28, 2026*
*Supersedes: `CRETA_v5_Implementation_Guide.md` (April 27, 2026)*
*Companion to: `CRETA_v5_Workshop_Spec.md` (located in `/guides/`)*

This guide replaces the original v5 implementation guide following the addition of Cluster F (Charging & Allocations) and the related extensions to Clusters A, B, D, and E. The original guide was written before the controller-workshop follow-up sessions on the IT cost charging cycle. This version adds 7 new Cluster F sessions, adjusts dependencies for sessions that now consume Cluster F's data layer, and reframes the seed data session as a full reconstruction.

---

## How to use this guide

This guide tells you **how and when** to implement CRETA v5. The spec (`CRETA_v5_Workshop_Spec.md`) tells you **what and why**. Do not duplicate effort — when this guide references a decision tag like `[E-04a]` or `[F-S2-03]`, open the spec and read that decision's full context before implementing.

**Document locations:**

- This guide: `/guides/CRETA_v5_Implementation_Guide.md`
- Spec: `/guides/CRETA_v5_Workshop_Spec.md`
- Cluster F decisions reference: `/guides/CRETA_Cluster_F_Charging_and_Allocations_Decisions.md` (companion deep-dive document)
- Progress tracker: `/PROGRESS.md` (root of repository)

---

## Session protocol

Every implementation session follows these steps in order. No exceptions.

### 1. Orient

- Read this guide and identify your assigned session.
- Read `PROGRESS.md` for current state — what's been completed, what's in progress, any notes from prior sessions.
- Read the spec sections referenced by your session's decision tags.
- Read the current state of key files you will be modifying. The codebase may have changed since this guide was written (from other branches being merged or manual changes). Your plan must reflect the actual codebase, not assumptions from this guide.

### 2. Plan

- Before writing any code, produce a written plan using extended thinking.
- The plan must state: what you intend to change, in what order, and why.
- No code gets written until the plan is complete.
- If anything in the spec is ambiguous or contradicts the current codebase, note it in `PROGRESS.md` under "Ambiguities" and make a reasonable assumption. Do not block on ambiguities.

### 3. Implement

- Implement exactly what the session specifies. Nothing more, nothing less.
- If you notice an opportunity to refactor existing code, note it in `PROGRESS.md` under "Refactoring opportunities" but do not act on it unless the session explicitly calls for it.
- Follow commit discipline (see below).

### 4. Verify

- Run the dev server and confirm no console errors.
- **Backend sessions:** confirm new endpoints return expected responses (use curl or the test client).
- **Frontend sessions:** you MUST visually verify your work using the Playwright MCP tools:
  1. Navigate to the affected page(s) at localhost.
  2. Take a screenshot at desktop viewport (1440px width).
  3. Describe what you see in the screenshot before declaring the work complete.
  4. Compare what you see against the spec requirements for the session.
  5. If something looks wrong, fix it and screenshot again.
  6. Do not declare a frontend session complete without having taken and reviewed at least one screenshot. "It should look correct" is not verification — you must actually look.
- The session is not complete until verification passes.

### 5. Update progress

- Update `PROGRESS.md` with: session ID, completion status, any notes for the next session, any ambiguities encountered, any refactoring opportunities spotted.

---

## Branching rules

- Create a new descriptively named branch at the start of each session.
- Branch naming convention: `v5/cluster-{x}/{feature-name}`
  - Examples: `v5/cluster-a/tech-navigator-backend`, `v5/cluster-f/btc-profile-backend`, `v5/cluster-e/workbench-tile-grid`
- Branch from `main`.
- **Do not create a PR at the end of implementation without first asking about it.** Complete your session, update `PROGRESS.md`, and report what was done. The PR decision is made by the project lead.

---

## Commit discipline

- Atomic commits — one logical change per commit, not a mega-commit at the end of a session.
- Descriptive commit messages that reference the decision tag being implemented.
  - Example: `Add progress tracker model and API endpoints [E-04c]`
  - Example: `Implement BTC profile automatic-mode UM snapshot [F-S2-03]`
- If a session implements multiple decision tags, group related changes into commits by tag cluster, not by file type.

---

## Agent team coordination

Work should be split across agent teams wherever and whenever possible to accelerate implementation. The session dependency graph below indicates which sessions can run in parallel.

### Rules for parallel execution

- Sessions marked as parallelizable touch different modules or different layers (backend vs. frontend) and have no data dependencies on each other.
- Backend sessions for a module must complete before frontend sessions that consume their APIs.
- When two sessions modify the same files, they must run sequentially.

### Conflict resolution

- When multiple agent teams are running, merges will produce conflicts.
- The team merging second is responsible for resolving conflicts.
- Conflict resolution should be reviewed before continuing with the next session on that branch.

---

## Session dependency graph

```
CLUSTER A (Portfolio Pipeline & Backlog)
─────────────────────────────────────────
A1 (Backend: Tech Navigator) ───────────────────────────► [MERGED]
A2 (Backend: Pipeline/DoI)   ───────────────────────────► [MERGED]
A4 (Backend: Milestones)     ───────────────────────────► [MERGED]
                                  │
                                  ▼
                    A3 (Backend: Ranking engine) ──┐
                                                   │
                    A5 (Backend: Intake/workflow) ─┤   (depends on A2, A3)
                                                   │
                                                   ▼
                                A6 (Frontend: Backlog module)
                                A7 (Frontend: Tech Navigator UI)
                                ── A6, A7 can run in parallel ──
                                
                                A8 (Frontend: Pipeline/intake UI)
                                ── A8 ALSO requires F3 backend (Run Portfolio) ──

CLUSTER D (Admin & Master Data)
────────────────────────────────
D1 (Backend: Admin entities + CRUD — including Cluster F master data) ──┐
                                                                         ├──► D3 (Frontend: Admin module)
D2 (Backend: Workflows + audit)                                       ──┘

D1 includes new Cluster F master data entities (ChargingLocation, LegalEntity, Region,
Country, UserMeasurement). D1 can run in parallel with A3/A5 (different modules).

CLUSTER F (Charging & Allocations) — NEW
─────────────────────────────────────────
F1 (Backend: Master data + UM import)  ── runs as part of D1 (folded in)
                                          OR as a follow-on if D1 has already merged
                              ▼
F2 (Backend: ChargeableEntity polymorphic + Stage 1 Distribution)
   ── starts with refactor of merged A2 allocation table to polymorphic shape
                              ▼
F3 (Backend: BTCProfile + Stage 2 BTC + rollup data layer + cache)
                              ▼
                    ┌─────────┼─────────┬─────────────┐
                    ▼         ▼         ▼             ▼
              F4 (Frontend:  F5 (Frontend:  F6 (Frontend:  F7 (Frontend:
              Module nav +   Rollup map +   Workbench BTC  Portfolio
              editors)       table)         tile + tab)    Change/Run)
              ── F4, F5, F6, F7 can run in parallel ──

CLUSTER C (Temporal Model)
──────────────────────────
Depends on: Cluster A backend complete (A1–A5 merged)
Can run in parallel with: D1, D2, F1–F3 (different modules)

C1 (Backend: Mixed-granularity + versioning) ──► C2 (Frontend: Forecast grid + version UI)

CLUSTER B (What-If Simulator)
─────────────────────────────
Depends on: Cluster C complete AND F3 complete (lever 12 needs F's data layer)

B1 (Backend: Scenario engine, including lever 12 wiring) ──► B2 (Frontend: Simulator workspace)

CLUSTER E (UI Restyling)
────────────────────────
Depends on: All clusters A–D complete AND F3 complete (E1/E2 need F backend for BTC tile/tab data)

E1 (Backend: Progress tracker + external cost category) ──┐
                                                           ├──► E3 (Frontend: Workbench tiles)
E2 (Backend: External cost aggregation + Launchpad data) ──┤    E4 (Frontend: Charts)
                                                           │    E5 (Frontend: External cost views)
                                                           │    E6 (Frontend: Portfolio detail)
                                                           │    E7 (Frontend: Launchpad)
                                                           │    ── E3–E7 can run in parallel ──
                                                           │
                                                           └──► E8 (Frontend: Visual consistency)
                                                                ── E8 runs last, after E3–E7 merge ──

SEED DATA
─────────
S1 (Seed data full reconstruction) ── runs after all clusters merge.
   Reconstructs the full v5 seed from scratch per Cluster F decisions
   [F-DG-01], [F-DG-02], [F-DG-03] — retires the v4 project/service distinction.
```

### Parallelization summary

| Parallel group | Sessions | Condition |
|---|---|---|
| A-backend | A3, A5 sequential after A1/A2/A4 merged | A3 depends on A1+A2; A5 depends on A2+A3 |
| A-frontend | A6, A7 can run in parallel | All require A-backend complete; A8 also requires F3 |
| C + D + F backend | C1 and D1/D2 and F1/F2/F3 can overlap | Touch different modules; F1 may be part of D1 |
| F-frontend | F4, F5, F6, F7 can run in parallel | All require F3 (and D1's masters) complete |
| E-frontend | E3, E4, E5, E6, E7 can run in parallel | All require E1/E2 (which require F3) complete |

### Critical path

The longest sequential chain through v5 is:

> A1/A2/A4 [done] → A3 → A5 → D1 → F1 → F2 → F3 → C1 → B1 → E1 → E3-E7 → E8 → S1

Cluster F's three backend sessions (F1, F2, F3) are sequential because they build on each other's data model. F2's polymorphic refactor of the merged A2 allocation table is the entry point for the rest of Cluster F.

---

## Sessions

### Cluster A — Portfolio Pipeline & Backlog

#### Session A1: Backend — Tech Navigator data model and API ✅ MERGED

**Status:** Merged. No further work needed in this session. Documented here for reference.

**Spec references:** `[A-TN-01]` through `[A-TN-09]`, `[A-PRI-01]` through `[A-PRI-04]`

**Scope (as merged):** Tech Navigator profiles with sub-criteria, weights, Transformation level, project Type, budget t-shirt size. Composite score calculation. T-shirt size auto-derivation.

---

#### Session A2: Backend — Pipeline stages, DoI, project lifecycle ✅ MERGED

**Status:** Merged. No further work needed in this session. The polymorphic refactor of the allocation table introduced by A2 is part of session F2 (see below).

**Spec references:** `[A-PS-01]` through `[A-PS-13]`, `[A-DOI-01]` through `[A-DOI-11]`, `[A-PL-01]` through `[A-PL-07]`

**Scope (as merged):** Pipeline Stage as a project attribute. DoI 0–5. Stage transitions. `within_cutoff` flag. DoI as data completeness gate. Allocation table on the project model (A2 implementation used a project-only `project_id` FK; F2 will refactor this to a polymorphic shape).

**Note for F2:** The allocation table merged in A2 is the structural starting point for F2's polymorphic ChargeableEntity work. F2 will migrate the existing rows to `owner_type = 'Project'` and add Offering and InternalService as new owner types.

---

#### Session A3: Backend — Ranking engine and cutoff line calculation

**Spec references:** `[A-PRI-01]` through `[A-PRI-04]`, `[A-PS-05]` through `[A-PS-08]`, backlog view layout section (budget envelope and cutoff line calculation)

**Scope:** Ranking engine that orders backlog-eligible projects by composite Tech Navigator score. Two cutoff lines calculated on the ranked list (reality line and should-be line — see spec for the walk algorithm). Type 3 pre-funded deduction. `within_cutoff` flag recomputation on trigger events (new project approved, score change, budget change, stage transition, forecast update, manual rebalance). Backlog membership rules (which stages are in, which are out).

**Acceptance criteria:**
- Ranked list endpoint returns projects ordered by composite score
- Two cutoff line positions calculated correctly
- Type 3 projects deducted before cutoff calculation
- `within_cutoff` flag updates on trigger events
- Backlog membership correctly filters by stage

**Depends on:** A1, A2 (merged)

---

#### Session A4: Backend — Project Milestones API ✅ MERGED

**Status:** Merged. No further work needed in this session.

**Spec references:** `[A-MS-01]` through `[A-MS-04]`

**Scope (as merged):** ProjectMilestone entity (renamed from ProjectPhase). CRUD API endpoints. Baseline immutability. Milestone ordering and sequence validation.

---

#### Session A5: Backend — Intake workflow and backlog integration

**Spec references:** Cluster A intake and workflow sections, `[A-BK-28]` and surrounding decisions

**Scope:** New project creation at DoI 0 (Proposed) with lightweight required fields. Project appears immediately in backlog at bottom of ranked list (zero score if unscored). Controller review workflow within the backlog (no separate intake queue). Intake Queue deprecation — ensure old intake endpoints are removed or redirected. CR approval workflow updates. Send Back mechanism for corrections.

**Acceptance criteria:**
- New project creation endpoint places project at DoI 0 in backlog
- Intake Queue endpoints deprecated/removed
- Controller can advance project through DoI stages within backlog
- Send Back workflow functional
- CR approval workflow updated

**Depends on:** A2 (merged), A3

---

#### Session A6: Frontend — Backlog module

**Spec references:** Backlog view layout section (ranked list view, cube view, filter bar, cutoff band rendering, project detail), `[A-BK-19]` and surrounding decisions

**Scope:** New Backlog module in the application navigation. Ranked List view (default) with scrollable project table, two cutoff bands (visual bands with explanations, distinct colours, misalignment zone tinting), jump buttons. Cube view (Tech Navigator 3D scatter, toggle-switched). Filter bar (persistent, applies to both views, filters affect visibility only — never cutoff calculation). Sort override with "Reset to ranking" button. Type 3 pre-funded section (collapsed by default, summary header). Full-page project detail view with back button and four tabs (Scores & Ranking, Financial Overview, Master Data, Milestones) per `[A-BK-19]`.

**Acceptance criteria:**
- Backlog module accessible from navigation
- Ranked List renders with correct ordering and cutoff bands
- Cube view renders Tech Navigator scatter
- Toggle between views works
- Filter bar filters without affecting cutoff positions
- Project detail opens as full-page view with four tabs
- Back button returns to backlog preserving scroll/filter state

**Depends on:** A1, A2, A3, A4, A5 (all backend complete)
**Can parallel with:** A7

---

#### Session A7: Frontend — Tech Navigator scoring UI

**Spec references:** `[A-TN-01]` through `[A-TN-09]`, rubric UI section in spec

**Scope:** Tech Navigator scoring interface within the Backlog project detail view (Scores & Ranking tab). Rubric UI for Complexity sub-criteria (Standardization, Usage, Maintenance — with 1–5 scale and descriptive labels from the spec). Rubric UI for Value Creation sub-criteria (Financial benefit, Payback, Competitive advantage). Transformation level selector (T0/T1/T2). Project Type selector (1/2/3). Computed scores displayed (individual axis scores and composite). Weight display (read-only, weights come from admin configuration).

**Acceptance criteria:**
- Scoring rubric renders with correct sub-criteria and scales
- Score entry updates composite score in real time
- Transformation level and Type selectors work
- Weights displayed correctly from admin config

**Depends on:** A1 (backend API)
**Can parallel with:** A6

---

#### Session A8: Frontend — Pipeline stage UI and intake flow

**Spec references:** `[A-PS-01]` through `[A-PS-13]`, `[A-DOI-01]` through `[A-DOI-11]`, intake workflow section, `[E-11]` (Run Portfolio sub-module)

**Scope:** Pipeline stage badges throughout the application (Backlog, Portfolio, Workbench). DoI indicator rendering. Stage transition UI for controllers (advance, pause, cancel, reactivate). New project creation flow (lightweight form at DoI 0, immediate placement in backlog). DoI gate validation feedback (which fields are missing for the next stage). Under Evaluation filter in backlog for controller review queue. Intake Queue removal from Portfolio module navigation.

**Note on Run Portfolio:** This session lands the **Run Portfolio sub-module** scaffolding inside the Portfolio module per `[E-11]`. The actual Run Portfolio entity list and per-entity drill-down consume Cluster F's data layer. This session must wait until F3 backend is merged so the Run Portfolio query endpoint exists and returns Project + Offering + InternalService entities. Per `[F-DG-03]` seeding, entities of all three types must be present in the seed data before this session is exercised; if seed data is being held until S1, demo with whatever entities currently exist and rely on S1 for full coverage.

**Acceptance criteria:**
- Pipeline stage badges render correctly everywhere
- Stage transition controls available to controllers
- New project creation places project in backlog at DoI 0
- DoI gate validation shows missing fields
- Intake Queue tab removed from Portfolio module
- Run Portfolio sub-module accessible from Portfolio module with type filter (Project / Offering / InternalService)
- Entity list in Run Portfolio renders with type-aware columns

**Depends on:** A2 (merged), A5 (backend APIs), **F3 (Run Portfolio data layer)**
**Can parallel with:** A6, A7 (which do not depend on F)

---

### Cluster D — Admin & Master Data

#### Session D1: Backend — Admin entities and CRUD (including Cluster F master data)

**Spec references:** All Cluster D entity decisions — `[D-NAV-01]` through `[D-NAV-05]`, `[D-PRC-01]` through `[D-PRC-05]`, `[D-CAT-01]` through `[D-CAT-07]`, `[D-AC-01]` through `[D-AC-10]`. Cluster F master data: `[F-MD-01]` through `[F-MD-03]`, `[F-AC-01]`, `[F-UM-01]` through `[F-UM-04]`.

**Scope:** Admin API endpoints for all master data entities. The original Cluster D set: Locations (renamed to Workforce Locations per `[D-OQ-01]` resolution), Roles, Cost Centres, Competence Centres, Pipeline Stage configuration, External Cost Categories. The new Cluster F set: ChargingLocation (the ~90 KB charging codes with division/region/country attributes), LegalEntity (~120 KB legal entities with many-to-one rollup to ChargingLocation), Region (small lookup), Country (~30-row lookup), UserMeasurement (versioned matrix per `[F-UM-01]`). CRUD operations with validation. Configurable parameters: planning horizon, granularity boundary, forecast cycle cadence, ranking weights, t-shirt size thresholds, standard available hours per location. Workflow template data model. Scheduled changes with activation dates per Cluster D's standard pattern. Audit log entries (categorised, entity-scoped, exportable). Inter-project dependency data model per `[D-AC-05]`. User entity with Tier 3 flag and role assignments. **Per-entity-type role permission configuration** for BTC profile and inter-service distribution edits per `[F-AC-01]`. UserMeasurement CSV upload endpoint (validates schema, creates new versioned snapshot). Stubbed UM "automatic refresh" endpoint that returns a 501 with a tooltip-style message per `[F-UM-02]`.

**Acceptance criteria:**
- All master data entities have working CRUD endpoints
- ChargingLocation, LegalEntity, Region, Country, UserMeasurement entities exist with CRUD
- LegalEntity → ChargingLocation many-to-one rollup enforced
- Configurable parameters are readable and updatable
- Scheduled changes can be created with future activation dates
- Audit log captures changes with correct categorisation
- External Cost Categories entity exists with CRUD
- Dependency model stores project-to-project relationships with type and direction
- Per-entity-type role permission grid stored on User entity, reflecting `[F-AC-01]` defaults
- UserMeasurement CSV upload creates new version (no overwrite)
- UM matrix viewer endpoint returns paginated/filtered slices

**Can parallel with:** A3, A5, C1 (different modules / domains)

---

#### Session D2: Backend — Workflow templates and audit

**Spec references:** `[D-CAT-07]`, audit log decisions, scheduled change activation

**Scope:** Workflow Template Editor backend — template CRUD for forecast cycle, intake, CR, and Send Back workflows. Step definitions with role assignments and configurable actions. Scheduled change activation engine (checks activation dates, applies pending changes, logs activation). Audit log query API with filtering by category (8 categories per spec), entity-scoped trails, export endpoint (CSV/Excel).

**Acceptance criteria:**
- Workflow templates configurable with steps and role assignments
- Scheduled changes activate at their target dates
- Audit log queryable by category and entity
- Export produces valid CSV/Excel

**Can parallel with:** D1 (complementary backend work, can be same branch)

---

#### Session D3: Frontend — Admin module

**Spec references:** `[D-NAV-01]` through `[D-NAV-05]`, all Cluster D frontend patterns. Cluster F surfaces in admin: hover tooltips on three location-master labels per `[F-MD-01]`, UserMeasurement matrix viewer.

**Scope:** Admin module with left sidebar navigation (section list per `[D-NAV-01]`). Master data browser with breadcrumb drill-down per `[D-NAV-05]`. Entity list views with search, sort, pagination. Entity detail views (full-page with back button). Settings cards for configurable parameters. Workflow Template Editor UI. Scheduled Changes panel with calendar/timeline view. Audit log viewer with category filter and export button. External Cost Categories in master data browser. Demo Reset in Section 5 (removed in production per `[D-AC-10]`). **New Cluster F surfaces:** ChargingLocation list and detail views, LegalEntity list and detail views with ChargingLocation rollup display, Region and Country simple lookup editors, UserMeasurement matrix viewer (year/quarter selector, full ~99×90 grid with totals per row and column, "imported at" badge per cell, CSV upload form, stubbed "Automatic refresh" button with explanatory dialog). Per-entity-type role permission configuration UI under Section 5 (System).

**Acceptance criteria:**
- Admin module accessible from navigation (controller only)
- Sidebar navigation with all sections
- Master data browser renders entity lists with search
- Entity detail opens as full-page view
- Settings cards display and save configurable parameters
- Workflow Template Editor allows step configuration
- Scheduled Changes panel shows pending changes with dates
- Audit log viewer with filtering and export
- External Cost Categories browsable and editable
- ChargingLocation and LegalEntity browsable; LegalEntity detail shows rollup to ChargingLocation
- UserMeasurement matrix viewer displays correctly with version selector
- CSV upload form accepts a file and creates a new UM version
- Stubbed automatic-refresh button opens explanatory dialog (not a network error)
- Hover tooltips on all three location-master labels appear with correct disambiguation text
- Permission configuration UI saves per-role per-entity-type grants

**Depends on:** D1, D2

---

### Cluster F — Charging & Allocations

#### Session F1: Backend — Cluster F master data extensions

**Spec references:** `[F-MD-01]` through `[F-MD-03]`, `[F-UM-01]` through `[F-UM-04]`, `[F-AC-01]`

**Scope:** This session is **functionally part of D1** — if D1 is being implemented and has not yet merged, fold F1 into D1 so the Cluster F master data lands as part of D's master data work. If D1 has already merged without the F entities, F1 runs as a follow-on session adding the Cluster F entities to the existing master data infrastructure. Either way, the work is the same: ChargingLocation, LegalEntity, Region, Country, UserMeasurement entities and CRUD, plus the per-entity-type role permission configuration on User. UM CSV upload + stubbed automatic-refresh. UM matrix viewer endpoint.

**Acceptance criteria:** Same as D1's Cluster F additions (see D1).

**Depends on:** Cluster D's existing master data infrastructure (entity browser, scheduled changes, audit log) — if those are not yet in place from D1, this session implements them as well.

---

#### Session F2: Backend — ChargeableEntity polymorphic + Stage 1 Distribution

**Spec references:** `[F-DM-01]` through `[F-DM-04]`, `[F-S1-01]` through `[F-S1-05]`, `[A-PL-05]` through `[A-PL-07]`

**Scope:** This session begins with a refactor of the allocation table merged in A2. The current shape is a project-only allocation table with a hard `project_id` FK. The session refactors this into the polymorphic `ChargeableEntity` model:

1. **Refactor of A2 allocation table to polymorphic shape:**
   - Introduce `ChargeableEntity` table as the polymorphic root with fields per `[F-DM-01]`: `id`, `entity_type` (enum: Project / Offering / InternalService), `identifier`, `hierarchy_node_id` (FK to Cluster D hierarchy), `responsible_person_id`, `to_business_pct`, `is_change_or_run` (derived).
   - Migrate all existing project allocation rows: each project's allocation entry becomes a `ChargeableEntity` row with `entity_type = 'Project'` and the existing project's PPM identifier in `identifier`.
   - Update the existing project model to reference `ChargeableEntity` via foreign key (or a one-to-one extension pattern, whichever fits the codebase conventions better — decide during planning).
   - Add Offering and InternalService as new entity types with their own creation endpoints and identifier formats (`IT00<S-code>` and `ITF<NNNNN>` respectively).

2. **Stage 1 Distribution edges per `[F-S1-01]` through `[F-S1-05]`:**
   - `Distribution` table: `id`, `year`, `version`, `source_entity_id` (FK), `destination_entity_id` (FK), `percentage`. Sparse storage (one row per actually-flowing edge).
   - DAG resolution for effective costs (own cost + sum of inflows from upstream entities).
   - Cycle detection: hard-block on save if adding a destination would create a cycle. Error message includes the cycle chain.
   - Sum rule per `[F-S1-02]`: validate `to_business_pct + sum(distribute_to %) ≤ 100%`. Residual is derived (self-retained).
   - CRUD endpoints for distribution edges (create, update, delete; entity-scoped views for outgoing and incoming edges).
   - Versioning: distribution rules participate in CRETA's standard baseline/forecast/actuals model per `[F-S1-04]`.

**Acceptance criteria:**
- ChargeableEntity table exists with three subtypes
- Existing project allocation rows migrate to `entity_type = 'Project'` cleanly with no data loss
- Offering and InternalService can be created with their own identifier formats
- Distribution edges can be created, updated, deleted
- Sum validation rejects total > 100%
- Cycle detection rejects circular distributions with error message showing chain
- DAG resolution endpoint returns correct effective costs (own + inflows) for any entity
- WBS Element generator function returns correct format `<prefix>-64-99-<location_code>` per `[F-DM-03]`
- All Distribution edits flow through baseline/forecast/actuals versioning per `[F-S1-04]`

**Depends on:** A2 (merged), F1 (master data must exist for hierarchy_node_id, responsible_person_id, charging locations)

---

#### Session F3: Backend — BTCProfile + Stage 2 BTC + rollup data layer + cache

**Spec references:** `[F-S2-01]` through `[F-S2-08]`, `[F-RV-01]` through `[F-RV-06]`

**Scope:**

1. **BTCProfile per `[F-S2-01]` through `[F-S2-08]`:**
   - `BTCProfile` table: `id`, `entity_id` (FK to ChargeableEntity), `year`, `mode` (manual/automatic), `s_code` (if automatic), `um_snapshot_at` (if automatic).
   - `BTCProfileLine` table: `profile_id`, `charging_location_id` (FK), `percentage`. Sparse storage; full-matrix only at SAP export time.
   - Profile validation: required when `to_business_pct > 0`. Sum-to-100 validation on save.
   - DoI 2 → 3 gate enforcement (extends existing gate validation): if project will carry To-Business cost share, validate current-year profile exists and sums to 100%. Per `[A-PL-06]`.
   - Offering creation gate: profile required at creation per `[A-PL-06]` and `[F-S2-08]`.
   - Year rollover: scheduled job (or manual-trigger admin endpoint) auto-creates draft profile for new fiscal year. Manual mode inherits values verbatim; automatic mode re-snapshots from new year's UM.
   - Automatic mode UM snapshot logic per `[F-S2-03]`: pick S-code → query UM matrix → compute per-location percentages → snapshot into BTCProfileLine rows → store provenance metadata.
   - "Refresh from UM" endpoint per `[F-S2-04]`: re-snapshot from current UM matrix; return diff preview before commit.
   - Mode change endpoints per `[F-S2-05]`: automatic→manual snapshots verbatim; manual→automatic returns warning payload with current values for client-side confirm-to-proceed.
   - "Copy distribution from" endpoint per `[F-S2-07]`: source = entity_id + year, returns rows that the client can apply to a target profile.
   - WBS Element generator (returns full 90-row enumeration with zeros for absent rows per `[F-S2-01]` SAP-export rule).

2. **Rollup data layer per `[F-RV-01]` through `[F-RV-06]`:**
   - Two-layer cache per `[F-RV-02]`: Stage 1 effective costs per (year, version), Stage 2 location totals per (year, version). Invalidate on writes.
   - Rollup query endpoint exposing the dimensions and measures from `[F-RV-04]` and Cluster F spec section "Data layer specification".
   - Drill-down endpoint per `[F-RV-04]`: given a destination charging location, return contributing entities and their upstream chains.
   - Time-granularity support per `[F-RV-06]`: annual default, quarterly drill-down, no monthly.

**Acceptance criteria:**
- BTCProfile and BTCProfileLine tables exist
- Profile creation enforced at DoI 2→3 gate (for projects with To-Business share)
- Profile creation enforced at offering creation
- Sum-to-100 validation on save
- Automatic-mode snapshot computes correct UM-derived percentages
- "Refresh from UM" returns diff vs current values
- Mode change endpoints behave per spec (verbatim inherit vs warning-then-discard)
- Copy-from endpoint returns source profile rows
- WBS Element generator returns full 90-row matrix with zeros for absent rows
- Year rollover auto-creates drafts for next year
- Rollup query endpoint returns correct totals across all dimensions and measures specified in spec
- Drill-down endpoint returns contributing entities + upstream chains
- Two-layer cache invalidates on writes; cached reads are consistent with live data after invalidation

**Depends on:** F2 (ChargeableEntity model), F1 (ChargingLocation, UserMeasurement)

---

#### Session F4: Frontend — Charging & Allocations module navigation + editors

**Spec references:** `[F-RV-01]`, `[E-10]`, `[F-S1-03]` (Stage 1 edit interaction), `[F-S2-02]` (manual mode UX), `[F-S2-03]` (automatic mode UX), `[F-S2-05]` (mode change UX), `[F-S2-07]` (copy-from UX)

**Scope:** New top-level "Charging & Allocations" module added to the application navigation per `[E-10]`. Module placement: after Portfolio, before Capacity Management. Left-sidebar pattern matching Cluster D admin module per `[E-07c]`. Sidebar lists four primary surfaces; this session implements two of them:

1. **Inter-service Distribution editor:** Cross-entity view of all Stage 1 distribution edges. List view filterable by year, version, source entity, destination entity, hierarchy node. Drill into a single entity's distribution profile from any row. The single-entity edit view shows the entity's `to_business_pct` field (editable), a list of `(destination_entity, %)` rows (add/edit/delete), and a derived "Self-retained %" indicator. Validation: sum ≤ 100% on save; cycle-detection error inline with chain visualization. Searchable destination entity picker (filterable by type, hierarchy node).

2. **BTC Profile editor:** Cross-entity view of all BTC profiles. Filter by year, mode, entity type, hierarchy node. Drill into single-entity edit view. Manual mode: add-only list with searchable charging-location picker (filterable by region/division), sum-to-100 gate. Automatic mode: S-code dropdown, read-only preview of computed percentages, "Refresh from UM" action with diff preview before commit, "Switch to manual" action with snapshot inheritance. Mode-change UX: warning-with-values-visible dialog on manual→automatic transition. "Copy from..." picker on blank profiles per `[F-S2-07]`.

**Acceptance criteria:**
- Charging & Allocations module accessible from navigation (placed correctly between Portfolio and Capacity)
- Module sidebar follows Cluster D admin sidebar pattern
- Inter-service Distribution cross-entity list view filterable, sortable
- Single-entity distribution editor shows to_business_pct + edges + derived self-retained %
- Distribution validation rejects sum > 100% with clear error
- Cycle detection on save shows chain visualization
- BTC Profile cross-entity list view filterable
- Single-entity BTC editor in manual mode: add-only list, searchable picker, sum-to-100 gate
- Single-entity BTC editor in automatic mode: S-code dropdown, read-only preview, refresh action with diff preview
- Mode change between manual/automatic shows correct UX (warning before discard, verbatim inherit)
- "Copy from..." picker available on blank profiles
- Hover tooltips on charging-location labels disambiguate from workforce locations and legal entities

**Depends on:** F3 (backend), D3 (admin module patterns may inform shared components)
**Can parallel with:** F5, F6, F7

---

#### Session F5: Frontend — Location Cost Rollup map + table + Report Builder integration

**Spec references:** `[F-RV-03]`, `[F-RV-04]`, `[F-RV-06]`

**Scope:** Two of the four primary surfaces in the Charging & Allocations module (the other two are in F4):

1. **Location Cost Rollup — map view per `[F-RV-03]`:** Static SVG world map (no tile-based map service like Mapbox or Google Maps). Bubbles placed at country level by default; click a country to drill into individual charging locations within it. Bubble size = cost magnitude. Bubble color = division. Hover/click reveals a popup with the breakdown of contributing entities. Quiet, neutral palette — one tile among several, not the hero. Legend showing color-to-division mapping and bubble-size-to-cost-magnitude scale.

2. **Location Cost Rollup — tree-table view per `[F-RV-04]`:** Three pre-built rollup paths via dropdown selector: Region → Country → Charging Location, Division → Charging Location, Country → Charging Location. Pivot direction toggleable (rows = locations / columns = source dimension, or vice versa). Cell click drills into entity contributions and upstream chains (drill-down panel below the table). Year selector for time dimension. Annual default with quarterly drill-down where supported per `[F-RV-06]`.

3. **Report Builder integration:** Surface in the Charging & Allocations module that links to the existing Report Builder with Cluster F's data layer pre-selected. Builder consumes the dimensions and measures from `[F-RV-04]` and the spec's data layer specification.

**Acceptance criteria:**
- Map view renders with bubbles at country level
- Click a country drills into charging locations within it
- Bubble size and color encode cost magnitude and division correctly
- Legend renders correctly
- Tree-table view supports three rollup paths, pivot toggle, and cell drill-down
- Drill-down panel shows contributing entities and upstream chains
- Year selector switches displayed data
- Quarterly drill-down works where data supports it
- Report Builder integration pre-selects Cluster F data source

**Depends on:** F3 (backend rollup data layer)
**Can parallel with:** F4, F6, F7

---

#### Session F6: Frontend — Workbench BTC tile + Workbench BTC tab

**Spec references:** `[E-09]`

**Scope:** Per-entity Cluster F surfaces on the Workbench. Two integrations:

1. **Workbench Overview BTC tile per `[E-09]`:** New tile in the Workbench Overview tile grid for each chargeable entity. Tile displays: entity's To-Business total for the current year (€ amount or "No business charging" state for entities distributing entirely to other services or self-retained), top 3 charging locations with percentage bars, "+ N more" link revealing the rest of the profile in the BTC tab. Tile size and position match other Workbench Overview tiles. For entities without a To-Business share, tile shows "No business charging — costs distribute internally" with link to the inter-service distribution view.

2. **Workbench BTC tab per `[E-09]`:** New tab on every chargeable entity's Workbench, alongside Overview, F&P, Change History, and (for projects) External Costs. Three sections inside the tab:
   - **Profile editor** — manual or automatic mode (uses the same component as F4's single-entity BTC editor, scoped to this entity).
   - **Allocation breakdown** — per-charging-location allocation amount in € for the current fiscal year, sortable by location name, region, division, percentage, or absolute amount. Drill-down to legal entity level on click.
   - **Audit history** — chronological list of profile changes scoped to this entity, using the standard CRETA audit log component.
   
   For internal services that have no To-Business share but distribute fully to other services, the tab displays the Stage 1 distribution editor instead (using the same component as F4's single-entity distribution editor, scoped to this entity).

**Acceptance criteria:**
- BTC tile renders on Workbench Overview tile grid for all chargeable entities
- Tile shows correct To-Business total or "No business charging" state
- Top 3 charging locations render with percentage bars
- "+ N more" link opens BTC tab
- BTC tab appears as a Workbench tab on all chargeable entities
- Profile editor section reuses F4 component, scoped correctly
- Allocation breakdown section shows per-charging-location amounts in €
- Sortable columns work
- Drill-down to legal entity level works
- Audit history section shows entity-scoped change log
- For services with no To-Business share, tab shows distribution editor instead

**Depends on:** F3 (backend), F4 (component reuse from module editors)
**Can parallel with:** F5, F7

---

#### Session F7: Frontend — Portfolio module Change/Run sub-module restructure

**Spec references:** `[E-11]`, `[A-PL-07]`

**Scope:** Restructure the Portfolio module into two sibling sub-modules per `[E-11]`. Sub-module switcher at the top of the Portfolio module — two pill buttons (Change / Run) sharing module-level navigation. User's last-selected sub-module persists across sessions.

1. **Change Portfolio sub-module:** Holds entities currently in transformation (projects in DoI 0–4). Inherits the existing Portfolio module's dashboards, KPIs, project detail views, dependency map, and external spend tab. Backlog ranking surfaces remain accessible. (For implementation purposes, this is mostly a re-routing exercise: the existing Portfolio module surfaces become Change Portfolio surfaces under the new switcher.)

2. **Run Portfolio sub-module:** Holds entities currently in steady-state operation (DoI 5 projects + all offerings + all internal services). Single unified entity list with type filter (Project / Offering / Internal Service) at the top. Type-aware columns: identifier (PPM/S-code/ITF), responsible, total annual running cost, To-Business percentage, primary charging-location distribution summary, termination date (where applicable). Per-entity drill-down lands on the Workbench (entity's BTC tile and tab from F6 provide the per-entity view). Run Portfolio dashboards expose:
   - Run Portfolio KPIs — total annual cost across all run-stage entities, To-Business vs internal vs self-retained breakdown, count by entity type
   - By-region / by-division / by-country rollups — embedded panels from F5's Location Cost Rollup, scoped to Run Portfolio entities
   - Outsourcing ratio for the Run Portfolio

**Acceptance criteria:**
- Sub-module switcher renders at top of Portfolio module
- Last-selected sub-module persists across sessions
- Change Portfolio shows existing portfolio surfaces correctly
- Run Portfolio shows unified entity list with type filter
- Type filter narrows list correctly
- Type-aware columns render correctly per entity type
- Drill-down navigates to Workbench
- Run Portfolio KPIs render correctly
- By-region / by-division / by-country panels render with correct data
- Outsourcing ratio displays correctly for Run Portfolio scope

**Depends on:** F3 (backend Run Portfolio query), F5 (rollup panels, can also be a soft dependency if rollup panels are stubbed), F6 (Workbench BTC tile/tab for drill-down target)
**Can parallel with:** F4, F5, F6 (with the soft dependency note above)

---

### Cluster C — Temporal Model

#### Session C1: Backend — Mixed-granularity forecast model and versioning

**Spec references:** All Cluster C decisions — mixed-granularity model, forecast versioning, version comparison

**Scope:** Mixed-granularity forecast grid model (monthly in near zone, quarterly in outer zone, with configurable boundary). Forecast version creation (snapshot on cycle completion and CR approval). Version metadata (version number, type — cycle vs. CR, timestamp, cycle label). Version comparison API (diff between any two versions). Granularity boundary and planning horizon as admin-configurable parameters. Horizon advancement rules.

**Acceptance criteria:**
- Forecast grid supports monthly + quarterly mixed granularity
- Granularity boundary is configurable
- Forecast versions created on cycle completion and CR approval
- Version comparison endpoint returns diffs
- Planning horizon advances correctly

**Depends on:** Cluster A backend complete (A1–A5 merged)
**Can parallel with:** D1, D2, F1–F3 (different modules)

---

#### Session C2: Frontend — Mixed-granularity forecast grid and version UI

**Spec references:** All Cluster C frontend-relevant decisions, version comparison UI section

**Scope:** Updated Forecast & Planning tab with mixed-granularity grid (monthly columns in near zone, quarterly columns in outer zone, clear visual boundary between zones). Forecast version history panel (list of versions with metadata, selectable for comparison). Version comparison view (side-by-side or inline diff highlighting). Version overlay concept deferred for chart — see E4.

**Acceptance criteria:**
- Forecast grid renders monthly and quarterly columns correctly
- Zone boundary is visually clear
- Version history lists all versions with correct metadata
- Version comparison shows diffs between selected versions
- Editing works correctly in both monthly and quarterly cells

**Depends on:** C1

---

### Cluster B — What-If Simulator

#### Session B1: Backend — Scenario engine

**Spec references:** All Cluster B backend decisions — scenario model, sandbox, diff tracking, levers, impact dimensions, promote workflow, PL "Apply to forecast", CC Owner scoped access. **Lever 12 wiring** per the updated `[B-ES-01]` and Cluster F's data layer (`[F-RV-01]`–`[F-RV-06]`).

**Scope:** Scenario entity (metadata, status, owner, anchor version). Sandbox environment (copy of project data isolated from live system). Lever system (the manipulation interface — what can be changed in a scenario). Diff tracking (what changed relative to the anchor). Impact dimension calculations (all seven dimensions from the spec). Promote workflow (controller approval, applying diffs to live data). PL "Apply to forecast" endpoint per `[B-PR-05]`. Tier 3 permission flag enforcement. CC Owner scoped scenario creation.

**Lever 12 widening per Cluster F:** Lever 12 ("Cost allocation rules") covers both Stage 1 distribution edges and Stage 2 BTC profile percentages, scoped to all chargeable entity types (Project / Offering / InternalService). Sandbox mutations on these rules feed Cluster F's data layer in scenario mode. Per-location cost rollups in the sandbox are computed by re-running F3's rollup engine on the sandbox state. The simulator's "Cost allocation impact" sub-section of the impact dashboard shows per-charging-location deltas vs the anchor version.

**Acceptance criteria:**
- Scenario CRUD with correct status lifecycle
- Sandbox creates isolated copy of project data
- Levers modify sandbox data correctly
- Diffs computed relative to anchor version
- Impact dimensions calculate correctly
- Promote workflow applies approved diffs to live data
- PL "Apply to forecast" pre-populates forecast submission
- CC Owner creation restricted to own-CC resource modifications
- Tier 3 flag controls people-level data visibility
- **Lever 12 mutations affect Stage 1 distribution edges and Stage 2 BTC profiles in the sandbox**
- **Cost allocation impact sub-section returns per-charging-location deltas**
- **Promote of lever 12 diffs respects the per-entity-type permission grid from `[F-AC-01]`**

**Depends on:** C1 complete (scenarios anchor to forecast versions), **F3 complete (lever 12 needs Cluster F's data layer for sandbox mutations and per-location impact calculation)**

---

#### Session B2: Frontend — Simulator workspace

**Spec references:** All Cluster B frontend decisions — workspace layout, lever panels, impact dashboard, scenario comparison, scenario manager. Lever 12 UI panel exposing the widened scope.

**Scope:** Simulator module in navigation. Scenario Manager (list/create/archive scenarios). Scenario workspace (lever panels for each manipulation type, real-time impact preview). Impact dashboard (seven impact dimension cards with before/after values). Comparison view (side-by-side scenarios or scenario vs. live). Promote workflow UI (controller review and approval flow). PL view (read-only published scenarios, "Apply to forecast" button). CC Owner view (creation limited to own-CC levers, published scenario read-only viewing).

**Lever 12 UI panel:** When the user opens lever 12 in the sandbox, the panel exposes both Stage 1 distribution edges and Stage 2 BTC profile percentages for any chargeable entity. Reuses the F4 distribution editor and BTC profile editor components in sandbox-bound mode. Per-charging-location impact preview (compact map or table) shows deltas as the user edits. Scenario comparison view's eighth sub-section (Cost allocation impact) shows location-level deltas between scenarios.

**Acceptance criteria:**
- Simulator module accessible from navigation with correct role visibility
- Scenario creation, editing, and archival work
- Lever panels modify sandbox data with real-time impact updates
- Impact dashboard shows all seven dimensions
- Promote workflow renders correctly for controller role
- PL sees published scenarios and "Apply to forecast" option
- CC Owner can create scenarios but only own-CC resource levers are available
- **Lever 12 panel exposes both Stage 1 and Stage 2 mutations**
- **Lever 12 panel reuses F4 components**
- **Cost allocation impact preview renders per-location deltas**

**Depends on:** B1, F4 (component reuse for lever 12 panel)

---

### Cluster E — UI Restyling

#### Session E1: Backend — Progress tracker and external cost category

**Spec references:** `[E-04c]`, `[E-05a]`, `[E-05d]`, `[E-08e]`, `[E-08f]`

**Scope:** Progress tracker data model: intra-milestone progress percentage, status narrative, next-milestone confidence (on_track/at_risk/blocked with reason), optional deliverable checklist per milestone (max 10 items, free text, boolean completion status). All fields live-editable with snapshot captured at forecast cycle completion. Progress history (versioned snapshots). API endpoints for progress CRUD. External Cost Category entity if not already created in D1 (verify — D1 includes it, but confirm it's complete). Aggregation endpoint for portfolio-level progress indicators.

**Acceptance criteria:**
- Progress tracker fields exist on project model
- Deliverable checklist CRUD per milestone (max 10 items)
- Progress percentage auto-computes from checklist when items exist
- Manual override of percentage works when checklist exists
- Progress snapshots created at forecast cycle completion
- Progress history queryable
- Confidence indicator stores three-value enum plus optional reason

**Depends on:** Clusters A, C, D, **F backend (F1–F3)** complete

---

#### Session E2: Backend — External cost aggregation and Launchpad data

**Spec references:** `[E-08a]` through `[E-08d]`, `[E-06d]` through `[E-06j]`, `[E-06a]`

**Scope:** External cost aggregation endpoints: project-level vendor summary (grouped by vendor, with category, forecast/actuals/remaining/variance), project-level category rollup, portfolio-level vendor summary (cross-project, with project count and top project), portfolio-level category analysis, project × vendor matrix data. Launchpad data endpoints: role-personalized tile data for all four roles (PL, Controller, CC Owner, Executive — see spec for each role's tile content). PL capacity read-only endpoint: role-level availability by location and time period, aggregated without individual names per `[E-06a]`.

**Acceptance criteria:**
- Project-level external cost vendor summary endpoint works with correct grouping
- Portfolio-level vendor summary aggregates across projects correctly
- Project × vendor matrix data endpoint returns cross-tab structure
- Launchpad endpoints return role-appropriate tile data for each role
- PL capacity endpoint returns aggregated role availability (no person names)

**Depends on:** E1, **F3 (Launchpad tile data may include charging/allocation summaries)**
**Can parallel with:** E1 if external cost category entity is already in place from D1

---

#### Session E3: Frontend — Workbench Overview tile grid

**Spec references:** `[E-04a]`, `[E-04b]`, `[E-04c]`, `[E-04d]`

**Scope:** Replace the current Workbench Overview tab content with a 3×3 tile grid. Nine action card tiles in the specified positions (see spec for exact layout — Row 1: Project Header, Three-Point Summary, Milestone Status; Row 2: Resource Plan, Cost Mix, Progress Tracker; Row 3: External Costs, Forecast Health, Tech Navigator). Each tile is a clickable card with summary content and navigation target. Progress Tracker tile shows current milestone, progress bar, narrative excerpt, and confidence indicator. All tiles use the action card pattern per `[E-07d]`.

**Note:** The BTC tile from `[E-09]` is implemented in F6 as a separate tile placement (added to the Workbench Overview alongside the original 9 tiles). The Workbench Overview tile grid in this session does not include the BTC tile — F6 adds it.

**Acceptance criteria:**
- Overview tab renders 3×3 tile grid
- Each tile displays correct summary content from API data
- Each tile navigates to the correct target on click
- Progress Tracker tile shows milestone-anchored progress with confidence dot
- Tiles use consistent action card styling

**Depends on:** E1, E2
**Can parallel with:** E4, E5, E6, E7

---

#### Session E4: Frontend — Progress vs. Burn chart and variance waterfall

**Spec references:** `[E-05a]`, `[E-05b]`, `[E-05c]`, `[E-05d]`

**Scope:** Progress vs. Burn chart: the full interactive chart with monthly X-axis, milestone zone dividers (shaded, labelled), three lines (cumulative progress, cumulative budget consumed, baseline burn rate), milestone markers (solid/highlighted/dashed), and click-to-inspect version context. Handle data availability constraint (burn line only when no progress data). Variance waterfall chart: bridge chart showing baseline → change categories → current forecast, with clickable bars drilling into CR detail. Both charts accessible as expanded views from the Workbench Overview tiles (three-point summary tile → waterfall, progress tracker tile → progress vs. burn).

**Acceptance criteria:**
- Progress vs. Burn chart renders with correct lines and milestone zones
- Milestone markers render with correct styles per completion state
- Chart handles missing progress data gracefully (burn line only)
- Variance waterfall shows correct bridge from baseline to current forecast
- Clicking waterfall bars navigates to CR detail
- Both charts accessible from their respective tile expanded views

**Depends on:** E1, E2
**Can parallel with:** E3, E5, E6, E7

---

#### Session E5: Frontend — External cost views (Workbench tab + Portfolio tab)

**Spec references:** `[E-08a]` through `[E-08d]`

**Scope:** Workbench: new "External costs" fourth tab. Summary strip (4 KPI cards), vendor table (per-vendor rows, sortable, expandable to line items grouped by vendor), category breakdown (visual rollup, clickable to filter vendor table). Portfolio module: new "External spend" tab. Portfolio KPI strip, vendor summary table (cross-project, expandable to per-project breakdown), category analysis (with optional cross-cycle trend), project × vendor matrix (expandable section, collapsed by default).

**Acceptance criteria:**
- External Costs tab appears as fourth Workbench tab
- Vendor table renders with correct columns and is sortable
- Vendor row expansion shows line items from F&P data
- Category breakdown filters vendor table on click
- Portfolio External Spend tab renders with all four sections
- Project × vendor matrix displays correct cross-tab data
- Both views use summary card pattern for KPI strips

**Depends on:** E2
**Can parallel with:** E3, E4, E6, E7

---

#### Session E6: Frontend — Portfolio module project detail rework

**Spec references:** `[E-03a]` through `[E-03g]`

**Scope:** Replace the Portfolio module's slide-in summary panel with a full-page detail view. Back button returning to Dashboard (preserving scroll/filter state). Hierarchy breadcrumb (LoB → Programme → Project). Four tabs: Overview (tile grid content in linear read-only layout), Financial Detail (three-point comparison table with mixed-granularity + variance waterfall, read-only), Resources & Costs (resource plan summary + external cost breakdown, read-only), History (forecast version history, CR history, progress tracker history).

**Note on Change/Run sub-modules:** The Change/Run sub-module restructure is implemented in F7. This session implements the project detail view that lands inside whichever sub-module a project belongs to. F7's restructure may be in flight in parallel; this session must not assume the sub-module switcher exists.

**Acceptance criteria:**
- Clicking a project in Portfolio Dashboard opens full-page detail
- Back button returns to Dashboard at same scroll position and filter state
- Breadcrumb shows correct hierarchy path
- All four tabs render with correct content
- All content is read-only for all roles
- External cost breakdown in Resources & Costs tab pulls from same data as E5

**Depends on:** E1, E2 (for progress and external cost data)
**Can parallel with:** E3, E4, E5, E7, F7

---

#### Session E7: Frontend — Launchpad redesign

**Spec references:** `[E-06d]` through `[E-06j]`, `[E-06a]`, `[E-06b]`, `[E-06c]`

**Scope:** Complete Launchpad redesign with three zones. Zone 1: header (greeting with user name and role, current date, forecast cycle status). Zone 2: action strip (horizontal pending action cards sorted by urgency, collapsible when empty). Zone 3: role-personalized KPI tile grid. Implement all four role tile sets — PL (7 tiles), Controller (9 tiles, 3×3), CC Owner (8 tiles), Executive (7 tiles) — with correct content and navigation targets per the spec tables. PL resource availability tile connects to the new aggregated capacity view per `[E-06a]`.

**Acceptance criteria:**
- Launchpad renders three zones
- Header shows user name, role, date, and cycle status
- Action strip shows pending actions sorted by urgency
- Correct tile set renders for each role
- Each tile displays correct summary data
- Each tile navigates to the correct module surface on click
- PL resource availability tile shows aggregated role capacity (no person names)

**Depends on:** E2
**Can parallel with:** E3, E4, E5, E6

---

#### Session E8: Frontend — Cross-module visual consistency

**Spec references:** `[E-07a]` through `[E-07g]`

**Scope:** This session runs after E3–E7 have merged, and applies the visual consistency rules across the full application. Module header bar: standardize across all modules including the new Charging & Allocations module from F4. Tab component: shared component across Workbench, Portfolio, Capacity, Reporting, Charging & Allocations (same size, active/inactive treatment, position). Sidebar pattern: align Workbench project list with Admin sidebar pattern from Cluster D and Charging & Allocations sidebar from F4. Card types: audit all card usage and ensure three types are used consistently (summary, surface, action). Detail view pattern: confirm no slide-in panels remain anywhere. Empty states and loading skeletons: implement consistent treatment across all modules. Status badge vocabulary: implement the full badge/indicator system (pipeline stages, RAG dots, DoI badges, forecast cycle badges, confidence indicators with distinct shape, workflow state badges). **Hover tooltip pattern for the three location masters per `[F-MD-01]`** applied uniformly wherever Workforce Location, Charging Location, or Legal Entity appears in labels or column headers.

**Acceptance criteria:**
- Module header bar is visually identical across all modules (including Charging & Allocations)
- Tab component is shared and consistent
- Sidebar pattern matches between Workbench and Admin and Charging & Allocations
- Only three card types in use, consistently applied
- No slide-in panels remain in the application
- Empty states and loading skeletons follow consistent pattern
- All status badges and indicators use the defined vocabulary
- Confidence indicators use a distinct shape (diamond/triangle) from RAG dots
- Hover tooltips appear on all three location-master labels everywhere they're shown

**Depends on:** E3, E4, E5, E6, E7, F4, F5, F6, F7 (all must be merged first)

---

### Seed Data

#### Session S1: Full seed data reconstruction

**Spec references:** `[F-DG-01]`, `[F-DG-02]`, `[F-DG-03]`. Per the cross-cluster note in the spec: "v5 reconstructs the seed data from scratch to express the v5 data model coherently across all clusters, retiring the v4 project/service distinction."

**Scope:** This is **not an incremental update** to existing seed data. v5 reconstructs the seed from scratch to express the polymorphic ChargeableEntity model, the configurable hierarchy, and the demo flagship narrative end-to-end.

**What gets rebuilt:**

- **Hierarchy:** Use the configurable hierarchy from Cluster D. Demo-time configuration of the hierarchy uses the existing 4-LoB structure from v4 (TBS, RVS, Corporate IT, Digital & Data) as the demo's chosen tier-1 nodes. No hardcoded LoB list.
- **ChargeableEntity seed (per `[F-DG-03]` volume targets):**
  - 8–10 projects (including 2–3 in Run stage with full BTC profiles)
  - 5–8 offerings with S-code linkage and BTC profiles (mix of manual and automatic mode)
  - 15–20 internal services with realistic Stage 1 distribution graphs
  - All 90 charging locations and ~120 legal entities seeded as master data (most non-zero in any given profile, but the master data is complete)
  - Real-shape subset of the UM matrix
  - One designated **demo flagship entity** walked end-to-end across every dimension (a fictional offering with realistic cost magnitudes, a complete distribution graph upstream and downstream, an automatic-mode BTC profile with a UM-derived distribution, multi-year forecast, one historical year of actuals, and a documented What-If scenario)
- **Distribution edges:** ~30–50 distribution edges total across the internal services and offerings, including a couple of multi-step paths so the upstream-chain feature has data to drill into.
- **BTC profiles:** Per-entity per-year profiles. Mix of manual and automatic modes. Year rollover demonstrated via a couple of entities with both 2025 and 2026 profiles.
- **UM matrix:** Real File 1 values, subset to seeded S-codes. Quarterly versions for 2025 and 2026 to demonstrate versioned snapshots.
- **Tech Navigator data:** Scores for all entities (including Run-stage entities — Tech Navigator profiles apply to all projects regardless of status per `[A-TN-01]`).
- **Pipeline stages:** All entities assigned to appropriate stages. Mix of stages from DoI 0–5 to populate Backlog and Run Portfolio.
- **Project Milestones:** All projects have milestones (replacing any v4 ProjectPhase data).
- **Forecast versions:** At least 3 per entity — initial baseline, one cycle update, one CR update.
- **Progress tracker data:** Intra-milestone percentages, status narratives, confidence indicators for current and two prior cycles.
- **Deliverable checklist items:** At least 2 demo entities showing partial completion.
- **External Cost Categories:** Default set per `[E-08e]` (Consulting, Cloud/Infrastructure, Licenses, Hardware, Other).
- **External cost line items:** Vendor and category assignments.
- **Demo scenarios:** At least 2 in the simulator (one active, one published). Include a What-If scenario demonstrating lever 12 changes on the demo flagship entity's BTC profile.
- **Admin configuration values:** Ranking weights, t-shirt thresholds, planning horizon, granularity boundary, available hours per location.
- **Workflow templates:** Forecast cycle, intake, CR, Send Back.
- **Pending actions:** Different roles to populate Launchpad action strips.
- **Launchpad tile data:** Meaningful per role (a PL with mixed project health, a CC Owner with resource requests pending, etc.).
- **Permissions configuration:** Per-entity-type role permission grid populated with the `[F-AC-01]` defaults.

**Fictionalization scheme per `[F-DG-02]`:**

The seed retains real WBS structural patterns (`<prefix>-64-<role>[-<LOC>]`) but fictionalizes all KB-confidential identifiers and names: PPM IDs (5-digit numerics in plausible range), S-codes (Sxxx renumbered, internally consistent), ITF numbers (ITFnnnnn renumbered, internally consistent), charging code numbers (3-digit numerics renumbered), legal entity numbers (3-digit numerics renumbered), and KB legal entity names ("[FictionalDivision] Germany Munich" rather than the real KB name). Real geographic names (countries, cities) are retained — they are public information. Generic IT service category descriptions ("PDM/PLM Author", "SAP Maintenance & Licenses") are retained as they are not KB-confidential. Existing v4 fictional persona names (Priya Sharma, Anna Meier, Thomas Brenner, Klaus Weber) are reused as responsibles for Run-stage entities.

**Data integrity rules (carry forward from prior versions):**

- All historical months carry full baseline, forecast, and actuals data — not actuals only
- The three-point comparison (baseline/forecast/actuals) is fundamental and must be present for all periods
- Demo personas: Priya Sharma (PL), Anna Meier (Controller), Thomas Brenner (CC Owner), Dr. Klaus Weber (Executive)

**Acceptance criteria:**
- All v5 features have representative demo data
- Backlog ranking produces a meaningful ordered list with visible cutoff lines
- Progress tracker shows history across multiple cycles
- Launchpad tiles show differentiated content per role
- No null/empty states on primary demo views
- ChargeableEntity seed includes all three subtypes with correct WBS-shaped identifiers
- Distribution graph has at least one multi-step path (entity A → entity B → entity C → To Business)
- At least one entity demonstrates self-retained residual (distribution sums to <100%)
- Demo flagship entity walkable end-to-end across every dimension
- BTC profiles include both manual and automatic mode examples
- UM matrix has values for all seeded S-codes
- v4 project/service distinction is fully retired (no entities classified as "service" in the old v4 sense)
- All KB-confidential identifiers and names are fictionalized per `[F-DG-02]`

**Depends on:** All clusters complete and merged

---

## Notes

- This guide covers 27 sessions across 6 clusters plus seed data (Cluster F adds 7 sessions; A1, A2, A4 are merged and not counted as future work).
- Estimated total: the scope is substantial. With Cluster F now in v5, the dependency chain is longer than the original v5 plan. Cluster F's three backend sessions are sequential (F1 → F2 → F3); each unblocks meaningful downstream work, so progressing them quickly is high-leverage.
- If the codebase has diverged from assumptions in this guide (e.g., different entity naming, different API patterns), adapt the implementation to match the existing codebase conventions. The spec defines the *what*; the codebase defines the *how*.
- The spec file (`CRETA_v5_Workshop_Spec.md`) contains open questions tagged `[X-OQ-nn]`. If you encounter one during implementation, check the spec for the working assumption and implement accordingly. Note in `PROGRESS.md` that you used the working assumption.
- Two Cluster F open questions are flagged as **blocking for spec finalization** but not blocking for implementation: `[F-OQ-01]` (UM origin) and `[F-OQ-02]` (residual interpretation). Implementation proceeds on the working assumptions documented in the spec; KB confirmations are gathered in parallel.
- F2's polymorphic refactor of the merged A2 allocation table is the entry point for all of Cluster F. If F2's refactor approach is uncertain, plan it carefully against the actual A2 implementation in the codebase before writing migration code.
