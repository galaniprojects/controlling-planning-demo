# CRETA Demo — Build Progress

## v5.2 Implementation — wave status

Active spec: `guides/Capacity_Module_Redesign_Spec.md` (~115 KB authoritative spec). Execution sequencing: `guides/Capacity_Module_Redesign_Implementation_Guide.md` (14 sessions across 5 phases). Plan: 6 waves, one PR per wave, fresh planning session per wave, user-review gate between each. Agent teams used within each wave for max parallelism.

- [x] **Wave 1** — Capacity backend foundation (S1): schema relaxation + `CapacityActionLog` table + 4 new endpoints (`/dashboard/forecast`, `/dashboard/headcount-breakdown`, `/dashboard/hotspots`, `/history`) + 2 enhanced endpoints (role-availability with `competing_demand_count` + `location_summary`; assignments PUT with multi-person body shape) + audit log writes wired into 4 mutating handlers + seed enrichment per spec §1 acceptance criteria — branch `feat/v5_2-capacity-foundation` (PR #88 merged 2026-05-08)
- [x] **Wave 2** — Frontend workspace shell (S2): routes, ScopeBar, workspace skeleton, SidePanel width parameterization — branch `feat/v5_2-capacity-shell` (PR #90 merged 2026-05-08)
- [x] **Wave 3** — Core surfaces (S3+S4+S5a+S5b, 4-teammate team): timeline + KPIs/filters/demand strip + side panel + inbox/history page — branch `feat/v5_2-capacity-core-surfaces` (PR #91 merged 2026-05-08)
- [x] **Wave 4** — Complex features (S6a+S7+S8, 3-teammate team): assignment panel + dashboard layer + PL availability view — branch `feat/v5_2-capacity-complex-features` (PR #92 merged 2026-05-08)
- [x] **Wave 5** — Second-wave features (S6b+S9+S10, 3-teammate team): timeline overlay/gestures + project view + multi-person UI + audit wiring verification — branch `feat/v5_2-capacity-w5-secondwave` (PR #93 merged 2026-05-10, sha `3809fd9`)
- [x] **Wave 6** — Integration + polish (S11+S12, 3-teammate team): entry-point sweep + dashboard click wiring + Workbench §13.9 slide-over + a11y + empty states + W3/W4/W5 polish backlog — branch `feat/v5_2-capacity-w6-integration-polish` (PR pending user review)

**v5.2 cycle complete** — six waves, six PRs (#88 / #90 / #91 / #92 / #93 / pending). Capacity Module Redesign closed 2026-05-10.

### v5.2 Wave 6 — Track A (2026-05-10, branch `feat/v5_2-capacity-w6-integration-polish`)

`react-specialist` teammate `track-a` on the 3-track team (`v5_2-w6-integration-polish`). Owns S11 entry-points + dashboard wiring + deprecation polish (4 tasks #1–#4). Tracks B/C own WideSlideOver + a11y/empty states + S12 polish backlog. All teammates committed straight to the shared branch.

**Track A commits:**

- **#1 forecast→timeline expand-month consumer (`0862122`)** — Wired the `capacity:expand-month` event consumer in `CapacityTimeline.tsx` (the dashboard's `CapacityForecastCard` already dispatched it post-W4 with no consumer per spec §11.4 deferral note). Window-level `useEffect` listener invokes `setAxisState` via the existing `toggleQuarter` reducer (auto-expanding the parent year when needed) and then scrolls the column into view via `scrollIntoView({behavior:'smooth', block:'nearest', inline:'center'})`. Added a `data-month` attribute to row 2 month-label cells in `TimeAxisHeader.tsx` so the scroll target is queryable from outside the component. Verified end-to-end: Q3 2026 (collapsed by default — out of current quarter) expands to show Jul/Aug/Sep when `2026-09` is dispatched, and the cell scrolls into view.

- **#2 ProjectSummaryPanel cache-miss fallback (`ec672aa`)** — Spec §10.8 deep-link case: pre-W6, the workspace's `ProjectSummaryEntryPoint` closed the panel when the cache had no record of the requested projectId, breaking deep-link bookmarks and post-scope-change re-opens. `ProjectSummaryPanel` now accepts an optional `item` plus the required `projectId`. When `item` is undefined, the panel issues a `capacityApi.getProjects({scope:'all'})` fallback fetch (same `CapacityProjectItem` payload shape — no backend changes per the W6 plan), shows a Skeleton-based loading state while the fetch is in flight, and renders a clear `AlertTriangle` empty-state with a Close CTA when the project still isn't visible in the current scope. Render path factored into an inner `ProjectSummaryPanelContent` so loader / empty / found branches share zero hook state.

- **#3 §9.1 entry-point matrix verification (Playwright + matrix screenshots)** — End-to-end verification at 1440×900 light + dark across all four personas; 17 screenshots in `qa/screenshots/v5_2_w6_track_a/`. Results:
  * **PASS** — Path 1 (URL param entry, light + dark)
  * **PASS** — Path 6 (deprecation redirect, light + dark) **after fixing a redirect bug** — see below.
  * **PASS** — Path 2 (Inbox "Review & Assign")
  * **PASS** — Path 4 (Demand-strip cell click → CellDetail → "Review project")
  * **PASS** — Path 5 (Project-view unassigned slot click → assignment mode, W5 wiring)
  * **PASS (verified by code path; not click-testable in current seed)** — Path 3 (PersonDetail "Review project"). The bridge from PersonDetail → `onAssignmentRequest` → `openAssignment` is wired in `CapacitySidePanelContext.openPerson` + `PersonDetail.PendingRequestsCard`, but the seed data has no pending RR with `assigned_person_id` set, so no person panel renders the pending-requests section. Verified by source: `frontend/src/modules/capacity/sidepanel/PersonDetail.tsx:347-405` + `CapacitySidePanelContext.tsx:181-186`. Once the demo seed adds a person-assigned pending RR, this surface is testable end-to-end.
  * **PASS** — bonus §11.4 expand-month wiring (light + dark): before=3 month columns, after=6, target month found.
  * **PASS** — bonus §10.8 cache-miss fallback (warm cache exercised via project-view click).
  * **PASS** — Persona routing: Controller → /capacity, CC Owner → /capacity?scope=my_cc&cc=…, PL → /capacity/availability (redirect), Executive → /capacity.

  **Bug fixed inline:** the deprecation redirect at `frontend/src/App.tsx::ProjectAssignmentRedirect` was dropping the `?cc=` (and any `?cr=`) query string when rewriting `/capacity/project-assignment/{pid}` → `/capacity?assignment_project={pid}`. Without `cc`, the workspace's `AssignmentEntryPoint` short-circuits because the assignment session needs both `projectId` and `ccId` to spin up. Fix: `useLocation` now sources the original search string and the redirect preserves all params; additionally, when `cc=` is present and no explicit `scope=` is supplied, the redirect pins `scope=my_cc` so the workspace's `useScopeQueryParams` writer doesn't strip `cc` on the next render (which it does whenever the active scope is `all_ccs`). Pre-W6 bookmarks against the legacy URL pattern now resolve cleanly.

- **#4 dead `filter_chip` server-side param removal (`9aa1d06`)** — PROGRESS.md line 219 flagged this duplication: `compute_capacity_projects(filter_chip=...)` and `_apply_filter_chip` were never wired into the React layer post-W5. Filter-chip semantics live in `frontend/src/modules/capacity/timeline/projectFilters.ts` where they double-duty as the source for both `FilterChipBar` badge counts and the rendered project-list filter — a parallel server-side implementation is a perpetual drift hazard for zero benefit. Removed:
  * `backend/services/capacity_projects.py`: dropped `filter_chip` arg + `_apply_filter_chip` helper (~25 LOC).
  * `backend/routers/capacity.py`: dropped the `filter_chip` query param.
  * `backend/tests/test_router_capacity_projects.py`: removed 3 `TestProjectsFilterChip` cases (-3 from pytest baseline; 1688 → 1685).
  * `frontend/src/types/api.ts`: dropped `CapacityProjectsFilterChip` enum (never imported anywhere) and the `filter_chip` field from `CapacityProjectsParams`.
  * `frontend/src/api/endpoints.ts`: dropped the param-write branch.
  * `frontend/src/modules/capacity/timeline/projectFilters.ts`: docstring update.

**Verification:**
- `tsc --noEmit` clean across all Track A edits.
- `pytest` 1685 passed (= W5 baseline 1688 − 3 filter_chip tests removed).
- 17 screenshots in `qa/screenshots/v5_2_w6_track_a/` covering all 6 §9.1 paths + bonus W6 wirings + persona routing.

### v5.2 Wave 6 — Track B (2026-05-10, branch `feat/v5_2-capacity-w6-integration-polish`)

`react-specialist` teammate `track-b` on the 3-track team (`v5_2-w6-integration-polish`). Owns the §13.9 Workbench PL availability slide-over (S11 deliverable) plus 4 polish-backlog items spread across SidePanel / PersonPicker / DashboardLayer / useScopedTimelineData.

**Track B commits (4 commits — task ID order):**

- **#5 WideSlideOver shared primitive (`777772d`)** — NEW `frontend/src/contexts/WideSlideOverContext.tsx` (provider + hook + render-slot, mirrors `BottomDrawerContext`) + NEW `frontend/src/components/shared/WideSlideOver.tsx` (50vw drawer, clamped 600–900px, right slide-in via CSS transform, dimmed backdrop with click-outside close, × close button, Escape-to-close, lightweight focus trap with focus restoration to trigger on close). Wired `<WideSlideOverProvider>` in `App.tsx` next to `<BottomDrawerProvider>` + render slot in `AppLayout`. Orthogonal to the existing 380px `SidePanel` — separate primitives.

- **#6 PLAvailabilitySlideOver wrapper + slide-over mode (`2284e09`)** — NEW `frontend/src/modules/capacity/availability/PLAvailabilitySlideOver.tsx` thin wrapper exposing `onRequestRole(slot)` to the host. MODIFIED `PLAvailabilityView.tsx` — accepts `mode='page' | 'slideover'` (default `'page'`). In `slideover` mode: hides page-level `ModuleHeader`, skips URL sync of filter state (slide-over is ephemeral), renders the side panel inline beneath the grid (no panel-within-panel), and routes "Request this role" through `onRequestRole(slot)` where `slot` carries role / location / suggested_month (spec §13.7 — picks the month with highest `available_hours`). MODIFIED `AvailabilitySidePanel` + `QuickRequestAction` to accept optional `onRequest` override + `helperText`. `'page'` mode behaviour unchanged for the standalone `/capacity/availability` route.

- **#7 Workbench Forecast & Planning "Check availability" CTA (`a3c4ae8`)** — MODIFIED `frontend/src/modules/workbench/forecast/ForecastTab.tsx`:
  * New "Check availability" button in the F&P actions cluster, gated to PL + active project (next to "Rolling Forecast Review").
  * Opens the `WideSlideOver` with `<PLAvailabilitySlideOver />`, pre-selecting any previously-captured location/role (so Edit re-opens with prior context).
  * `onRequestRole(slot)` callback closes the slide-over and stores the captured slot in local state.
  * NEW `CapturedRequestBanner` renders above the grid showing role / location / suggested period (the month with highest available hours) with Edit / Clear (×) controls. Clears on project switch.
  * Visual verification (1440×900, light + dark, persona-pl) — 5 screenshots in `qa/screenshots/v5_2_w6_track_b/`: F&P tab with the new button next to RFR; 50vw slide-over open with scope/KPIs/grid + dimmed backdrop; inline AvailabilitySidePanel after role selection; banner populated with `Data Engineer / All locations / Jan 2027` after request and slide-over closed; standalone `/capacity/availability` page still uses `ModuleHeader` + the shared 280px `SidePanel` (unchanged).

- **#8 polish backlog (`cb5b9ee`)** — 4 small items:
  * **#8.1 — `SidePanelContext.openPanel` race**: clear `beforeCloseRef.current` at the top of `openPanel` so swapping content without closing first doesn't leave a stale unsaved-changes guard registered against the previous content. ~5 LOC.
  * **#8.2 — PersonPicker batch projection cache**: hoisted the per-`(cc, request, person, month)` projection lookup into a module-level `Map` so rapid picker re-opens reuse already-fetched values; coalesces concurrent in-flight requests via a separate inflight `Map` so two re-mounts don't double-fetch the same key; hydrates synchronously from the cache where available. ~50 LOC.
  * **#8.3 — DashboardLayer responsive max-height clip**: the flat `max-h-[320px]` clipped the bottom row of cards on viewports shorter than ~900px. Switched to `max-h-none` default + `[@media(min-height:900px)]:max-h-[320px]` on tall screens (preserves the existing compact layout). Bumped the outer slide-up wrapper to 720px so the responsive single-column stack isn't clipped by the *outer* animation. ~15 LOC.
  * **#8.4 — `useScopedTimelineData` deps audit**: read every `useEffect`/`useCallback` for stale-closure risks; documented findings in a comment block above the deps array. No bugs found; existing patterns (token sentinel for async staleness, `scope.kind/scope.id` destructuring, `activeFilters.join(',')` change signal) are correct. ~15 LOC of comments.

**Verification:**
- `tsc --noEmit` clean across all Track B edits.
- `pytest` baseline preserved (no backend changes from Track B).
- Visual verification at 1440×900 light + dark via Playwright — 5 + 2 screenshots in `qa/screenshots/v5_2_w6_track_b/`.

### v5.2 Wave 6 — Track C (2026-05-10, branch `feat/v5_2-capacity-w6-integration-polish`)

`react-specialist` teammate `track-c` on the 3-track team (`v5_2-w6-integration-polish`). Owns S12 polish + a11y + W3/W4/W5 polish-backlog sweep (8 tasks #9–#16). Tracks A/B own S11 integration + WideSlideOver + entry-point sweep. All teammates committed straight to the shared branch (worktree isolation didn't take effect — same pattern as W2/W3/W5 — but file ownership stayed clean).

**Track C commits (8 commits — task ID order shown for clarity):**

- **#9 a11y polish (`fc484db`)** — `frontend/src/components/layout/SidePanel.tsx`: window keydown listener registered while panel is mounted; Escape closes via the same `handleClose` path as the close button (respects `onBeforeClose` dirty-guard). Handler stashed in a ref so the listener binds once but always sees the latest props. Added `role="dialog"` + `aria-label={title}` so screen readers announce the panel on open. Verified `FilterChipBar` already exposes `aria-pressed` (W3 Track B / W5 Track B) — no change needed.

- **#13 eslint-disable audit (`d83b732`)** — Reduced `eslint-disable` directives in `frontend/src/modules/capacity/**` from 15 → 10. Removed 5 unused directives:
  * `PLAvailabilityView.tsx:356` — `selectedRoleIds` wasn't read in the effect at all (client-side filter), so eslint had nothing to flag.
  * `CapacityWorkspace.tsx:134, :262` — refs are exempt from the rule.
  * `AssignmentPanel.tsx:101` — `setShowUnsavedDialog` is a stable React setter (exempt).
  * `DemandStrip.tsx:213` — defensive `console.log` fallback converted to a silent no-op (CapacityWorkspace always wires `onCellClick` in production).

  The remaining 10 are all justified third-party / intentional-omission cases: 3× Recharts `no-explicit-any` (Tooltip `content` prop), 3× `useScopeQueryParams` / `useScopedTimelineData` self-write avoidance, plus 4 deps-stability cases in `PersonPicker` / `KPISummaryBar` / `CapacityWorkspace.tsx:166` / `PLAvailabilityView.tsx:321`.

- **#12 W3 polish backlog (`1e6057b`)** — Verifications + design-call doc:
  * Orphan-role label fallback present in `UnassignedSlotRow.tsx:69` (`'Unspecified role'` fallback). `AssignedPersonRow` renders the role badge conditionally — no broken UI when `role_name` is null. Verified.
  * `RoleType.is_active` filter — `RoleType` has no `is_active` column (`backend/models/people.py`); model only has `id` / `name` / `created_at` + relationships. Filtering happens on `Person.is_active` downstream. The original audit item is a no-op. Verified.
  * Demand-strip cell-click — wired in `CapacityWorkspace.tsx:364` via `onCellClick → openCell`. Verified.
  * **DECISION**: Keep static `personaPersonId` map (`frontend/src/modules/capacity/shared/personaPersonId.ts`). Rationale recorded in the file's docstring: adding `person_id` to `CurrentUser` / `RoleContext` requires backend schema + frontend type updates that are out of scope for a polish item; demo personas are pinned by seed.sql and don't change at runtime.

- **#14 W5 polish backlog (`6041586` + bits in `9aa1d06`)** — 8 items:
  * `ProjectGroup` wrapped in `React.memo` (skips re-renders when callback identity is stable).
  * `compute_capacity_projects` per-RR demand cache — pre-computes `demand_by_rr` once outside the per-project loop. Eliminates ~75% of `_request_monthly_demand` calls on a 100-project window. (Landed via Track A's `9aa1d06` commit due to shared working tree.)
  * **DECISION**: `UnassignedSummary` thresholds stay hardcoded for v5.2. Promoting to a `PlanningParameter` would also need an admin endpoint, settings card, and cache-invalidation plumbing — out of scope. TODO + decision doc anchored in the file; placeholder seed row to be added in v5.2 closeout PR.
  * **DECISION**: `aggregatePeriodGhost` keeps MAX over per-month ghosts (not avg). Averaging would visually understate over-allocation in a single hot month inside a quarter, contradicting §9.4 intent.
  * `PersonChip.utilBucket` — added `1e-6` epsilon constant so boundary values like `99.999998` don't drift into the wrong bucket.
  * `ProjectGroup` collapse-on-filter-change — encoded `activeFilters` into each `ProjectGroup`'s React key in `ProjectGroupView`, forcing remount that resets local `expanded` state when the chip set changes.
  * `AssignedPersonRow.standardHours` — verified the only caller (`ProjectGroup`) does not thread the prop. Documented why the default 160 must stay (project payload lacks per-person std hrs). Removal deferred until a future wave threads location-aware std hours through the project payload.
  * **DECISION**: Cross-CC visibility for CC Owners stays restricted (read + write own CC only). Documented in `backend/routers/capacity.py::_verify_cc_access` (landed via `9aa1d06`). Re-evaluate post-v5.2 if user research surfaces a real need.

- **#15 refactoring opportunities (`a1d92f2`)** — 3 items:
  * `useCapacityProjectsData` consolidation — `CapacityTimeline` now accepts a `projectData` prop and threads it into `ProjectGroupView`. Workspace passes its hoisted snapshot; `ProjectGroupView` keeps its internal fetch as a fallback for standalone callers. Eliminates the redundant project-view fetch in production.
  * NEW `frontend/src/modules/capacity/hooks/useDashboardForecastData.ts` — shared hook around `GET /api/capacity/dashboard/forecast` consumed by both `CapacityForecastCard` (chart) and `KPISummaryBar` (avg-utilization KPI). KPISummaryBar's allSettled batch trimmed from 4 → 3 endpoints; a dedicated effect merges forecast-derived snapshot fields whenever the hook returns a new payload. HTTP-level dedup deferred (would need a request cache) — saving is in code, not bandwidth.
  * `UtilizationBucketKey` single source of truth — SKIPPED per brief ("don't add new infra for a polish task"). No openapi-typescript / API codegen exists. Documented the duplication on both sides (`frontend/src/types/api.ts` + `backend/services/capacity_dashboard.py`) with cross-references and a post-v5.2 follow-up note.

- **#10 empty states sweep (`ec13f51`)** — Standardised to shared `EmptyState`:
  * `CapacityTimeline`: replaced inline "No people..." with EmptyState (Users icon).
  * `ProjectGroupView`: both empty branches now use EmptyState (FolderOpen for "no projects in scope", FilterX for "no projects match the filters").
  * `DemandStrip`: hide entirely when no period carries pending demand (spec §8.5 + S12 brief).
  * `RequestTable` (inbox): swapped Inbox icon for `CheckCircle2` and rewrote title to "All caught up" (spec §12.7 celebratory empty state).
  * Already-good surfaces (no change): `HotspotListCard` (W4 green check), `HistoryTable` (W3 EmptyState), `PLAvailabilityView` (W2/W3 EmptyState).

- **#11 §15 permission sweep + panel transition (`4c0c542`)** — Frontend permission gates:
  * `RequestsInbox`: redirect non-controller / non-cc_owner roles to `/capacity` (prevents stale 403 banner on direct URL access by Project Lead or Executive).
  * `CapacityHistory`: redirect Project Lead to `/capacity` (Controller / CC Owner / Executive remain authorised per §12.1).
  * `SidePanel`: added `transition-[width] duration-200 ease-out` so capacity panels swap smoothly between 280px (person/cell/project_summary) and 400px (assignment) — previously snapped between widths.

- **#16 perf check** — Demo data has only 12 total people (largest scope = "All CCs" via `GET /api/capacity/dashboard/headcount-breakdown?scope=all&dimension=role` → `total: 12`). Per the brief's guidance ("if no CC has 50+ people, document the largest scope tested"), there's no perf bottleneck risk to investigate at the demo data scale. Initial nav + networkidle ~3.3s on Munich scope (cold). No fixes needed.

**Verification:**
- `tsc --noEmit` clean across all Track C edits.
- `pytest` 1685 passed (= W5 baseline 1688 minus 3 from Track A's `filter_chip` removal — no regressions from Track C edits).
- 10 screenshots saved to `qa/screenshots/v5_2_w6_track_c/` (4 light + 1 dark workspace; inbox empty light + dark; project-view filter; PL availability; PL → /requests redirect to /availability; PL → /history redirect to /availability; Exec → /requests redirect to /capacity).

### v5.2 Wave 5 — Second-wave features (2026-05-09, branch `feat/v5_2-capacity-w5-secondwave`)

3-teammate `react-specialist` agent team (`v5_2-w5-capacity-secondwave`) running in parallel with worktree isolation off the shared branch. Lead pre-work landed first (backend endpoint + frontend seams + comment refresh); 3 teammates ran concurrently and committed straight to the shared branch (worktree isolation didn't take effect — same pattern as W2 — but file ownership stayed clean and there were no merge collisions); Lead verified end-to-end after silent completion.

**Lead pre-work (2 commits, `0b75d2d` / `9792196`):**
- `GET /api/capacity/projects` endpoint per spec §10 — `services/capacity_projects.py` aggregation (visible-project resolution per §10.12, fulfillment math per §10.3, sort per §10.9, filter chips per §10.10) + 8 new Pydantic models in `schemas/capacity.py` + route handler in `routers/capacity.py` (Controller / Executive / CC Owner; PL = 403). 18 pytest cases in `test_router_capacity_projects.py` covering authorization, response shape, fulfillment math (zero / full / partial / dual-layer utilization), reference-max scaling, sort order, scope filtering (location / cost_center / invalid → 400), and three filter chips (needs_staffing / under_utilized / pending_requests). pytest baseline post-pre-work: 1680 (was 1662 W4 + 18 new).
- API client + types: `capacityApi.getProjects(params)` in `frontend/src/api/endpoints.ts` + `CapacityProjectItem` / `CapacityProjectAssignedPerson` / `CapacityProjectSlot` / `CapacityProjectExternalCost` / `CapacityProjectsResponse` / `CapacityProjectsParams` in `frontend/src/types/api.ts` (consumed by Track B's `useCapacityProjectsData` hook).
- TimelineView switch seam in `CapacityTimeline.tsx` — branches on `groupBy === 'project'` and mounts a stub `ProjectGroupView` (Track B replaced the stub's placeholder with the §10 component tree). Removed `'project-view-pending'` empty-state branch from `useScopedTimelineData.ts` so project view flows through its own data feed.
- `CapacitySidePanelContext` comment refresh — the `registerProjectSummaryHandler` seam was already shipped in W3; updated stale "Wave 4 Session 9" comments to point Track B at "Wave 5 Session 9".
- Demand-strip stub comment update at `CapacityWorkspace.tsx:230` — pointed the next reader at W5 Track A / S6b §9.1 entry-point #2; prop wiring left intact for Track A to plug into.
- Seed-data spot check: `RR#102` (proj-autobrake / cc-muc-apd / role-dev / 100h/mo / 3 matching candidates in CC) is a clean multi-person split demo path — no seed changes needed.



**Track C — `react-specialist` (Session 10 — multi-person split + audit verification, 3 commits, `257c95f` / `b2affa3` / `413d1e9`):**

Implements the §9.5 multi-person partial assignment UX on the Wave 4 assignment panel and rounds out the §12.10 audit-log coverage so the project-level confirm endpoint distinguishes full from partial fulfilment.

- MODIFY `frontend/src/modules/capacity/assignment/AssignmentStateContext.tsx` — extends the W4 single-person model with three new actions: `addPersonToMonth(reqId, month, personId, hours, rebalanceAmount?)` (append-or-update with explicit overflow rebalance against the largest other share, with cascade to additional shares if the largest isn't enough), `removePersonFromMonth(reqId, month, personId)` (drops one person from a multi-person split; falls through to clear-month when it was the last one), and `setMonthAssignmentList(reqId, month, list)` (replace primitive). Existing `setMonthAssignment` / `clearMonthAssignment` semantics are unchanged for the W4 [Assign] entry point.
- MODIFY `frontend/src/modules/capacity/assignment/PersonPicker.tsx` — adds `showHoursInput` + `defaultHours` + `excludedPersonIds` props. When invoked from [+ Add], the picker renders an editable hours number input above the candidate list pre-filled with the remaining hours, hides already-assigned people from the list, and commits with the typed value; when invoked from [Assign], the picker remains the W4 full-hours commit shape.
- MODIFY `frontend/src/modules/capacity/assignment/MonthRow.tsx` — replaces the W4 disabled tooltip-stub [+ Add] button with a working popover anchored to the row. Computes `assignedTotal` / `remainingHours` / `isPartial` per spec §9.5 and an explicit `rebalanceAmount = max(0, assignedTotal + hours - requestedHours)` so the parent keeps the requested-hours invariant only when a typed value would over-commit. Renders an "Nh remaining" badge between the chips and the [+ Add] button while the row is partial.
- MODIFY `frontend/src/modules/capacity/assignment/PersonChip.tsx` — optional `hours` prop renders the per-person portion in multi-person months ("F. Keller 40h (72%)") per the spec example. Optional `showPartialIndicator` highlights partial single-person assignments with an amber chip border. Chip ✕ click stops propagation so the chip remove never bubbles into the [+ Add] popover toggle.
- MODIFY `frontend/src/modules/capacity/assignment/RoleSection.tsx` — threads `onAddPerson` through to MonthRow with a request-id-prefixed handler.
- MODIFY `frontend/src/modules/capacity/assignment/AssignmentPanel.tsx` — provides `handleAddPerson` (delegates to `addPersonToMonth`) and a smarter `handleRemove` that branches on list size: single-person months clear the row, multi-person months drop the named person only. Per-month evaluation against `hours_or_amount` so a month with sum < requested counts toward the new `partialMonths` total. `isFullyAssigned` now requires both full coverage AND zero partials so the action bar's "Confirm" branch stays accurate.
- MODIFY `frontend/src/modules/capacity/assignment/AssignmentProgress.tsx` — adds a `partial` prop and renders a "N full · N partial · N unassigned" detail line. Bar turns amber when every month has at least one person but some are partial — green only on full coverage at requested hours.
- MODIFY `backend/routers/capacity.py::confirm_project_resources` — walks each pending request's per-month sum(ResourceRequestAssignment.hours) vs. its requested `hours_or_amount_per_month` and tallies `full_months` / `partial_months`. action_type now branches three ways:
  * any pending request carries a CR → `cr_reconfirm` (W4 behaviour)
  * else `partial_months > 0` → `partial_confirm` per spec §12.10 row 1 (the "or partial_confirm" branch that was missing pre-W5)
  * else → `confirm`

  Resource requests with no assignment rows count every month as partial. Floating-point comparison uses 1e-6 epsilon so a 40 + 40 = 80 split round-trips clean. detail_payload now carries `partial_months` and `full_months` so the §12.13 history-detail expansion can render "{N} of {M} months partial" without recomputing. The summary string adds " — N of M months partial" suffix on partial. external_cost requests are intentionally excluded from the partial calculation — they don't have person assignments to compare against.
- MODIFY `backend/seed/fixtures/manuals/capacity_management.json` — adds two new sections: "Multi-Person Month Splits (v5.2)" describing the [+ Add] flow + rebalance behaviour + partial confirmation, and "Recently Completed & Audit Trail (v5.2)" describing the inbox section + history page + the six audit action types per spec §12.10.
- MODIFY `README.md` — extends the Capacity Management feature blurb with the W5 multi-person split UI + recently-completed inbox section + the six §12.10 audit action types including the new `partial_confirm` server-side branch.

**Backend tests (+7 → 1687 passed; W4 baseline 1680):**
- `test_capacity_audit_log.py`:
  * `TestProjectConfirmPartialBranch::test_partial_assignment_logs_partial_confirm` — 2-month request, 1 month assigned + 1 month empty → `partial_confirm`, payload has `partial_months=1, full_months=1`.
  * `TestProjectConfirmFullBranch::test_full_coverage_logs_confirm` — both months covered → `confirm`, `partial_months=0`.
  * `TestProjectConfirmMultiPersonFullSplit::test_two_people_summing_to_full_logs_confirm` — 40 + 40 = 80 single month → `confirm`, `full_months=1`.
  * `TestAllSixActionTypesEndToEnd::test_assign_draft_then_full_confirm_records_two_log_lines` — multi-person save draft + project confirm round-trip records `[assign_draft, confirm]`.
  * `TestDeclineRequestKeepsProjectStatus::test_decline_single_request_leaves_project_pending` — `decline_request` does NOT mutate project status (only project-level `decline` advances the project state).
- `test_router_capacity_assignments_multiperson.py`:
  * `TestMultiPersonAuditDetail::test_audit_payload_lists_each_person` — assign_draft `detail_payload.assignments` lists each per-person split with their hours.
  * `TestPartialMultiPersonSavePersists::test_partial_split_round_trip` — 40 + 30 < 80 round-trip keeps both rows for downstream partial_confirm detection.

**Existing audit verification (read-only):**
- All 6 action types from §12.10 confirmed wired in W1 fix `21054ac` + Track C work above: `confirm` / `partial_confirm` / `decline` / `decline_request` / `assign_draft` / `cr_reconfirm`. Single-request `confirm_request` (PUT /requests/{cc}/{rid}/confirm) is intentionally not logged per impl-guide. Recently-completed section (`frontend/src/modules/capacity/requests/RecentlyCompletedSection.tsx`) is wired against `getCapacityHistory` with a 7-day window and the five "completed" action types, plus a refresh nonce that bumps after a successful decline so the section auto-updates.

**Visual verification (Lead via Playwright at 1440×900):**
- 11 + 4 screenshots saved to `qa/screenshots/v5_2_w5_track_c/` covering: assignment panel light/dark with progress detail line ("44 full · 51 unassigned"); [+ Add] popover open with hours input ("20 of 40h requested") and candidates ranked by projected utilisation; partial-split state showing two-chip rows + "Nh remaining" indicator; CR re-confirmation panel with hours diffs and partial-confirm action bar warning; recently-completed inbox section with seeded `assign_draft` + live `decline_request` entry; capacity history page with both entries visible and action-type badges.
- Decline-request audit chain verified end-to-end via `PUT /api/capacity/requests/cc-muc-apd/102/decline` → 1 row in history with action_type=`decline_request`, summary "Declined Developer request (2026-06–2027-12): Capacity constrained — recommending defer to Q4", and the recently-completed inbox section auto-refreshing to show "Declined request today" / "Declined request" red badge.

**Out of scope (Track A / Track B):**
- Timeline ghost overlay during assignment mode + assignment gestures (Track A — Session 6b).
- Group-by-project view (Track B — Session 9).

**Track B — `react-specialist` (Session 9 — group-by-project view, 8 commits, `e6ada39` → `7c03320`):**

Implements the §10 component tree for the workspace timeline when `groupBy === 'project'`. Replaces the Lead pre-work placeholder in `frontend/src/modules/capacity/timeline/ProjectGroupView.tsx` with the full §10.13 tree, wires the project-summary side panel (§10.8), and adapts `FilterChipBar` for project-mode chip semantics (§10.10).

- **Case-collision unblock (`e6ada39`)** — Track A's S6b work added both `GhostOverlay.tsx` (component) and `ghostOverlay.ts` (helper). On macOS's case-insensitive APFS the lowercase file shadowed the React component → `import { GhostOverlay } from './GhostOverlay'` failed at vite scan and the timeline tree rendered as a blank page. Renamed `ghostOverlay.ts` → `assignmentGhostOverlay.ts` and updated 6 importers (FlatPersonRow / RoleGroup / PersonTimelineRow / GhostOverlay / useAssignmentOverlay / CapacityTimeline). Helper API unchanged. Without this fix all of Wave 5 visual verification is blocked on macOS.
- **`needs_staffing` chip + project predicates (`0915f69`)** — Extends `FilterChipKey` union with `'needs_staffing'`. NEW `frontend/src/modules/capacity/timeline/projectFilters.ts` — pure `projectMatchesChip` / `filterProjects` / `countProjectsMatching` mirroring backend `_apply_filter_chip` semantics in `services/capacity_projects.py`: over_allocated → any assigned person had any month >100%; under_utilized → fulfillment_pct < 50; pending_requests / unassigned_months → unfulfilled_slots non-empty (merged per §10.10); needs_staffing → fulfillment_pct < 100.
- **Bar primitives (`901f8a5`)** — NEW `FulfillmentBar.tsx` (§10.3, solid + dashed segments scaled to `referenceMaxHours`), `DualLayerBar.tsx` (§10.4, faded total-utilization background + solid project-color foreground + over-allocation outline), `GhostBar.tsx` (§10.5, dashed-border bar with partial-month split mirror). All use `useProjectColor()` for stable fills shared with role-view segments.
- **Row components (`32f87a7`)** — NEW `ProjectGroupRow.tsx` (§10.3, sticky-name with chevron + project name + hierarchy badge + PL + green/amber/red staffing-status pill), `AssignedPersonRow.tsx` (§10.4, indented name + role badge + DualLayerBar per column), `UnassignedSlotRow.tsx` (§10.5, italic role + status pill + GhostBar per column + `onSlotClick(projectId, requestId)` prop), `ExternalCostRow.tsx` (§10.6, Euro icon + thin neutral 8px bar over period + Check/Clock status icon).
- **ProjectGroup container + UnassignedSummary (`960a60b`)** — NEW `ProjectGroup.tsx` (§10.2, owns local `expanded` state, composes header + people + slots + costs in spec sort order), `UnassignedSummary.tsx` (§10.7, sticky-bottom row REPLACING DemandStrip in project mode; sums unfulfilled-slot remainders per visible column with thresholds 0/1–200/200+ → empty/amber/red).
- **ProjectSummaryPanel + useCapacityProjectsData hook (`eeb15fd`)** — NEW `frontend/src/modules/capacity/hooks/useCapacityProjectsData.ts` (single fetch hook for `GET /api/capacity/projects`, returns `{items, referenceMaxHours, total, isLoading, error, scope}`, `enabled`-gated). NEW `frontend/src/modules/capacity/sidepanel/ProjectSummaryPanel.tsx` (§10.8, 280px) — header with project color dot + name + meta, Fulfillment / Requests KPI cards, role-by-role assignment progress (one row per unfulfilled slot with `Nh / Mh` colored pill), Total allocated hours, "Review & assign" + "View in workbench" buttons. **Provider-boundary pattern**: panel takes `onReviewAssign / onClosePanel / navigate` as props closure-captured by the workspace from inside `CapacitySidePanelProvider` — the panel renders inside the SHARED `<SidePanel>` (mounted in AppLayout, ABOVE the workspace tree) so it can't call `useCapacitySidePanel()` itself. Mirrors the W4 AssignmentPanel pattern.
- **ProjectGroupView assembly + FilterChipBar adaptation + workspace integration (`7c03320`)** —
  * REWRITE `ProjectGroupView.tsx` — replaces placeholder with §10.13 tree. Optional `data` prop falls back to internal `useCapacityProjectsData()` for standalone callers. Filters items client-side via `filterProjects(items, activeFilters)`. Registers visible project ids with `ProjectColorMap`. Click handlers: project header → `openProjectSummary`; person row → `openPerson(ccId, personId)` (resolves ccId from assigned-people list when scope has none); unassigned slot → `enterAssignmentMode + openAssignment` per §10.5.
  * MODIFY `FilterChipBar.tsx` — accepts optional `projectItems` prop; in project mode swaps PEOPLE_CHIPS for PROJECT_CHIPS (drops "Unassigned months" merged into "Pending requests", adds "Needs staffing"); counts via `countProjectsMatching` (project-level predicates).
  * MODIFY `CapacityWorkspace.tsx` — hoists `useCapacityProjectsData(groupBy === 'project')` so both FilterChipBar counts AND the ProjectSummaryEntryPoint cache use one fetch. NEW `ProjectSummaryEntryPoint` component (mirrors W4 `AssignmentEntryPoint`) registers a handler with `registerProjectSummaryHandler` that resolves projectId against the cache and renders `<ProjectSummaryPanel>` with closure-captured `onReviewAssign / onClosePanel / navigate`. People-level "no rows match" hint skipped in project mode (ProjectGroupView owns its own copy).

**Verification:**
- `npx tsc --noEmit` clean across all Track B commits.
- `pytest tests/ -q` baseline 1680 passing maintained pre-Track-C (no Track-B backend changes — endpoint shipped in Lead pre-work `0b75d2d` with 18 tests).
- Visual verification at 1440×900 light + dark via Playwright; screenshots in `qa/screenshots/v5_2_w5_track_b/`:
  * `01_controller_project_view_my_cc` (light + dark): MUC / Application Development scope. Project rows for ERP Integration (`0/1` red staffing pill, TBS hierarchy badge, Priya... PL) and Autonomous (`2/8` amber staffing pill). Assigned person rows under each (Lucas / Ananya / SAP Functional Consultant / etc) with DualLayerBar segments and red over-allocation outlines on >100% months. Italic unassigned-slot rows (Senio.../unassigned, Devel.../unassigned) with dashed GhostBars. Filter chip bar shows project-mode chips: `All 7, Over-allocated 4, Under-utilized 1, Pending requests 2, Needs staffing 2`.
  * `02_controller_project_view_needs_staffing_chip` (light + dark): "Needs staffing" chip activates correctly; both projects remain visible (both have fulfillment < 100%).
  * `03_controller_project_summary_panel` (light + dark): clicking the ERP Integratio... header opens the side panel at 280px. Header `ERP Integration Phase 2` + project color dot + `TRUCK & BUS SYSTEMS (TBS)` + `PL: Priya Sharma · Active`. Fulfillment `0%` + Requests `0/1` KPI cards. Assignment progress row `Senior Developer 0h / 360h` with red pill. Total allocated (window) `2175h`. Review & assign + View in workbench buttons render correctly.
  * `04_controller_project_view_all_ccs` (light + dark): All-CCs scope shows the full Capacity Dashboard above the project timeline. Filter chip bar: `All 11, Over-allocated 6, Under-utilized 2, Pending requests 2, Needs staffing 2`.
  * `05_controller_unassigned_slot_to_assignment` (light + dark): clicking an italic unassigned-slot row routes to AssignmentPanel at 400px width with the full ERP Integration assignment session (CR-9 banner, Senior Developer role section, monthly assignment rows). Confirms §10.5 click-through.
  * `06_cc_owner_project_view`: CC-Owner (Thomas Brenner) project view — no dashboard (correct per §11.1).

**Out of scope (deferred to later waves):**
- ProjectSummaryPanel cache-miss fallback to `getProjectSummary` for deep-linked entries — W6.
- Project-view scroll-to-role on assignment-panel open (§10.5 "pre-scrolled to the relevant role section") — AssignmentPanel-side behaviour.

**Refactoring opportunities (deferred):**
- The workspace fetches projects twice when `groupBy === 'project'`: once via `WorkspaceBody.useCapacityProjectsData()` (drives FilterChipBar + ProjectSummary cache) and once via `ProjectGroupView`'s internal fallback fetch. Could thread the hoisted snapshot through `CapacityTimeline` (`projectData` prop) so ProjectGroupView always uses the workspace's cache.
- `CellDetail.tsx` / `PersonDetail.tsx` carry pre-existing uncommitted working-tree changes from a prior session that mirror the same provider-boundary pattern Track B implemented in `ProjectSummaryPanel`. Lead should review before W5 PR — they're consistent and address the same `useCapacitySidePanel must be used inside <CapacitySidePanelProvider>` runtime error that surfaces when the demand-mode side panel renders pending-request CTAs.

**Track A — `react-specialist` (Session 6b — timeline overlay + gestures + entry points, 5 commits, `4d786d6` / `f2a53b1` / `d92db76` / `a68d20d` / `eef8cf3`):**

Implements §9.4 ghost overlay during assignment mode + §9.6 assignment gestures + §9.1 cross-component entry points, decorating Wave 3 Track A's `PersonTimelineRow` / `RoleGroup` without disturbing the role-view rendering path.

- NEW `frontend/src/modules/capacity/timeline/assignmentGhostOverlay.ts` — pure-function model that derives, for the active `AssignmentState.session`, the per-person × per-month ghost set: matching candidates (1.5px dashed, 30% opacity, project color) vs. fallback candidates (1px dashed, 15% opacity); over-allocation override (red dashed) when ghost + existing > 100%; CR direction override (blue for `increase`, orange for `decrease`) per §9.8; auto-expand role-group set so collapsed groups containing matching candidates pop open when the panel opens.
- NEW `frontend/src/modules/capacity/timeline/useAssignmentOverlay.ts` — hook reading `AssignmentState` + the active `useScopedTimelineData` snapshot + cross-CC request fetch (`zero-404` fix in `eef8cf3` filters non-scope CCs out before the request loop so an Executive at All-CCs doesn't 404 on every CC-scoped request endpoint).
- NEW `frontend/src/modules/capacity/timeline/GhostOverlay.tsx` + `GhostBar.tsx` — visual layers that absolute-position over the regular `SegmentBar`. Click-ghost → `setMonthAssignment(reqId, month, personId, fullRemainingHours)` and the segment solidifies. Click-just-assigned-solid (within session) shows "✕ Remove" tooltip → `clearMonthAssignment`.
- MODIFY `frontend/src/modules/capacity/timeline/PersonTimelineRow.tsx` — composes `GhostOverlay` over the existing `SegmentBar` row. Click-name-cell → confirmation tooltip "Assign {name} to {N} months of {role}? Confirm/Cancel" → bulk-assigns the person to all unassigned matching-role months (never overwrites already-assigned).
- MODIFY `frontend/src/modules/capacity/timeline/RoleGroup.tsx` — auto-expand role groups containing matching candidates whenever assignment mode opens (driven by `assignmentGhostOverlay`'s exposed set).
- MODIFY `frontend/src/modules/capacity/sidepanel/PersonDetail.tsx` — pending-request card carries a closure-captured `onAssignmentRequest` prop; the side panel hands it down via `CapacitySidePanelContext.openPerson` (cross-provider bridge). Clicking "Review project" reaches `enterAssignmentMode` end-to-end.
- MODIFY `frontend/src/modules/capacity/sidepanel/CellDetail.tsx` — same closure-captured `onAssignmentRequest` bridge for the demand-mode pending-request CTAs (resolves the `useCapacitySidePanel must be used inside <CapacitySidePanelProvider>` runtime error Track B noted in its handover).
- MODIFY `frontend/src/modules/capacity/CapacityWorkspace.tsx` — replaces the demand-cell `void period` no-op with a real handler that fetches the period's pending-RR list and opens the side panel with a filtered `<DemandPeriodRequests />` content node; each row's "Review project" CTA → `openAssignment(projectId, { ccId, crId })`.
- Open-while-dirty integration: clicking any entry point while another assignment session is dirty surfaces the W4 unsaved-changes dialog from `AssignmentStateContext.requestExit` before swapping projects.

**Lead integration (no merge commits — teammates committed straight to the shared branch; Lead verification only):**

- `npx tsc --noEmit` clean across the integrated branch.
- `pytest tests/ -q` 1687 passed (1680 W4 baseline + 18 Lead-pre-work projects-endpoint tests + 7 Track-C audit/multi-person tests; the 18 from pre-work were already counted in the post-pre-work baseline so the W5 net new = 25). Background run completed in 124s.
- Visual verification at 1440×900 via Playwright across all four personas in light + dark; screenshots in `qa/screenshots/v5_2_w5/`:
  * `01_project_view_default_persona.png` / `02_project_view_viewport.png` — Controller @ All-CCs project view: full project list with fulfillment bars, dashboard cards visible above (multi-CC scope per §11.1), filter chips including "Needs staffing".
  * `03_project_summary_side_panel.png` — clicking "Autonomous Braking Prototype" project group opens 280px Project Summary panel with role-by-role progress (`Senior Solution Ar... 640h / 640h` ✓ green; multiple `0h / Nh` red), `Total allocated (window) 0h`, "Review & assign" + "View in workbench" CTAs.
  * `04_assignment_mode_panel.png` / `05_assignment_mode_full_page.png` — "Review & assign" → 400px AssignmentPanel with multi-person split rows (`F. Heinr... 80h` + `P. Sharma 80h` chips on each month).
  * `06_role_view_baseline.png` — role view at MUC / Application Development scope, no regression.
  * `07_role_view_assignment_ghosts.png` / `08_role_view_assignment_viewport.png` — role view + ?assignment_project=proj-autobrake URL param entry; live DOM check confirms 40 dashed-border ghost segments (sample: `border-color: rgb(133, 183, 235)` matching candidate; `rgb(220, 38, 38)` over-allocation; `border-width: 1px`, `opacity: 0.15` matches §9.4 fallback rule).
  * `09_dark_role_view_assignment.png` — dark mode role view + assignment panel; semantic Tailwind classes carry through cleanly.
  * `10_dark_project_view_cc_owner.png` — CC-Owner (Thomas Brenner) @ My-CC project view in dark mode; dashboard correctly hidden per §11.1, "Needs staffing" chip count visible.
  * `11_pl_redirect_availability.png` — PL navigates to `/capacity` and is redirected to `/capacity/availability` per §15.
  * `12_dark_project_view_executive.png` — Executive (Dr. Klaus Weber) @ All-CCs project view in dark mode; tabs are Workspace + History only (no Requests — correct per §12.1); KPI bar shows graceful "—" on `Pending requests` card after the W4 P1 fix (Promise.allSettled tolerates the expected 403 on `/api/capacity/inbox`).
- Cross-track integration NOT needed — Track B's `ProjectGroupView.handleSlotClick` already wires `UnassignedSlotRow` → `enterAssignmentMode + openAssignment` end-to-end (the Lead pre-work brief had the wire-up scheduled as a Lead post-merge step but Track B took it).

**Independent fresh-context reviewer pass (1 commit, `3bd765d`):**
A read-only `code-reviewer-fresh` agent walked all 20 commits since `69948fd` and produced a prioritised report (7 P1s + 12 P2s + 13 P3s + a long "Looks good" section). All 7 P1s + 2 easy P2s addressed in `3bd765d`:
- **P1 #1** — `confirm_project_resources` N+1 RRA fetch: bulk-fetch all `ResourceRequestAssignment` rows in one query before the per-request loop, group by `resource_request_id`. Was one round trip per pending request.
- **P1 #2** — `useAssignmentOverlay` race: replaced fetch-token ref with the `cancelled`-flag pattern from `useCapacityProjectsData`. Each await stage now checks the flag, so a stale fetch can't pollute state if the user changes scope or exits assignment mode mid-flight.
- **P1 #3** — Executive demand-cell graceful degradation: detect role client-side; Executive (no inbox access per §12.1) sees a calm "Demand details are read-only at your access level" empty state instead of the prior "Failed to load demand: 403" error banner.
- **P1 #4 (defensive)** — `_visible_project_ids` hierarchy scope union: hierarchy branch now unions membership-assigned projects with allocation-derived projects, consistent with the `cost_center` / `location` branches. Spec §10.12 strict reading is preserved as a subset.
- **P1 #5 (defensive)** — CR-reconfirm + partial precedence: when a CC Owner confirms a CR-bound project that's also partially fulfilled, the audit row now writes `partial_confirm` (was `cr_reconfirm`). Partial is the more actionable signal for the controller and surfaces in the §12.12 history "Partial" filter; CR context is preserved in `cr_id` column + `detail_payload.cr_id` + summary suffix ("Partially re-confirmed via CR — N of M months partial"). Added `test_cr_bound_partial_assignment_logs_partial_confirm`.
- **P1 #6** — `ProjectGroupRow` 0/0 staffing badge: projects with zero RRs now render a neutral em-dash (`—`) badge using `bg-muted text-muted-foreground` instead of green ✓ which read as "fully assigned".
- **P1 #7 (defensive)** — `compute_capacity_projects` PL role lookup ordering: load PLs into the `people` map BEFORE building `role_ids` so a future change rendering "PL role" in the response wouldn't silently miss the lookup. No active behaviour change.
- **P2 #13** — `PersonPicker` hours input clamp on `onChange` (HTML `max` is only enforced at form submission; paste/type of `999` would commit out-of-bounds hours).
- **P2 #14** — `UnassignedSlotRow` status badge: distinct red (unassigned) vs. amber (partial) classes per spec §10.5; pre-fix both branches used identical amber classes (dead ternary).

The remaining 10 P2s + 13 P3s are deferred to a polish session — see the "Polish-session backlog" entries in the project-status memory.

pytest 1688 passed (1687 W5 baseline + 1 new CR-bound-partial test). tsc clean. The independent reviewer's "Looks good" section explicitly called out: 18-case `/projects` test depth, full audit-vocabulary coverage including `decline_request` regression guard, cross-portal handler refs, idempotency guard rationale comments, dark-mode discipline (no slate-* leakage), and the legacy single-person assignment body-shape forward compat.

**Out of scope (deferred to W6 by design — don't re-flag):**
- Workbench → PL availability slide-over (§13.9) — Session 11.
- End-to-end entry-point sweep + deprecation redirect audit across other modules (Portfolio approval queue / Launchpad pending actions still link to `/capacity/project-assignment/{pid}`) — Session 11.
- Empty-state polish + keyboard navigation + horizontal-scroll sticky behaviour + responsive narrow viewports + perf at 50+ people × 36 months — Session 12.
- W4 P2 / P3 polish backlog (utilization-distribution scope filter, `useDashboardData` shared hook, `UtilizationBucketKey` source of truth, hotspot row ccId resolution, etc.) — polish session post-W6.

### v5.2 Wave 4 — Complex features (2026-05-08, branch `feat/v5_2-capacity-complex-features`)

3-teammate `react-specialist` agent team (`v5_2-w4-capacity-complex-features`) running in parallel with worktree isolation off the shared branch. Lead pre-work + 3 tracks + Lead integration + 2 P1 fixes found during visual verification.

**Lead pre-work (1 commit, `3148a28`):**
- MODIFY `frontend/src/api/endpoints.ts` — widens `saveRequestAssignments` client signature to accept both legacy `[{month, person_id}]` and v5.2 multi-person `[{month, assignments: [{person_id, hours}]}]` shapes per spec §9.5 / §9.9. The W1 backend handles both via `_normalise_assignment_body`. The legacy `AssignmentGrid.tsx` keeps using the single-person shape; the new `AssignmentPanel.tsx` uses the v5.2 shape.

**Track A — `react-specialist` (Session 6a, assignment panel UI, 3 commits, `90dea36` / `e9d2f7b` / `228f903`):**
- NEW `frontend/src/modules/capacity/assignment/*` (12 files): `AssignmentStateContext` (single source of truth — projectId, optional crId, per-request `Map<reqId, Map<month, MonthPersonAssignment[]>>`, dirty flag, entry source; actions `enterAssignmentMode`, `setMonthAssignment`, `clearMonthAssignment`, `markSaved`, `exit`, `getRequestPayload`, `getDirtyRequestIds`); `AssignmentPanel` (registered via `registerAssignmentHandler`, widens panel to 400px via existing W3 width seam, fetches project detail + team heatmap + CC requests in parallel, filters requests to CC scope to prevent 404s on cross-CC projects); `ProjectHeader` + `CRBanner`; `AssignmentProgress` (progress bar + "N of M months assigned" — info-blue when incomplete, success-green at 100%); `RoleSection` + `RoleSectionHeader` (role name, request meta `80h/mo | high priority | Jun–Dec 2026`, completion badge `7/7` green or `3/7` amber, chevron); `QuickFill` (popover person picker + Fill button — assigns to all unassigned months in section without overwriting); `MonthRow` (month label + hours with CR diff `80h → 120h (+40h)` blue increase / orange decrease, unassigned: `── unassigned ──` + [Assign], assigned: PersonChip + disabled [+ Add] stub); `PersonChip` (abbreviated name + projected utilization colored by bucket + ✕ remove); `PersonPicker` (inline dropdown with "Matching role" / "Other roles" groups, type-to-filter search, projected util via `getRequestAssignmentPreview`, red + warning icon when >100%); `ExternalCostSection` (Confirm/Decline rows for `request_type='external_cost'` requests — inline textarea for decline reason); `AssignmentActionBar` (sticky bottom: "Save draft" / "Confirm & send to controller" / "Confirm partial & send to controller" / "Decline" — with success/declined state transitions); `index.ts` barrel export of `AssignmentStateProvider`, `useAssignmentState`, `AssignmentPanel`, and all types for W5 S6b consumption.
- MODIFY `frontend/src/modules/capacity/CapacityWorkspace.tsx` — adds `AssignmentEntryPoint` component reading `?assignment_project=`, `?cc=`, optional `?cr=` URL params on mount + when params change; calls `enterAssignmentMode` and `openAssignment`; registers `<AssignmentPanel />` content via `registerAssignmentHandler`. Replaces the W3 placeholder banner.
- MODIFY `frontend/src/App.tsx` — adds `<AssignmentStateProvider>` at root level (alongside `<SidePanelProvider>`) so the AssignmentPanel rendered as shared SidePanel content can read session state across the provider boundary.
- MODIFY `frontend/src/contexts/SidePanelContext.tsx` — adds `registerBeforeClose` and `getBeforeCloseGuard` so panel content can intercept the × button click. Used by AssignmentPanel for unsaved-changes protection.
- MODIFY `frontend/src/components/layout/SidePanel.tsx` + `AppLayout.tsx` — wires the before-close guard factory through to the close button click handler.
- Single-person flow only; `[+ Add]` rendered-but-disabled per spec (W5 S10 activates the multi-person split UI). CR re-confirmation: month-row diffs render correctly. Ghost timeline borders deferred to W5 S6b.

**Track B — `react-specialist` (Session 7, dashboard layer, 2 commits, `1fd18a6` / `abd2eb0`):**
- NEW `frontend/src/modules/capacity/dashboard/*` (7 files): `DashboardLayer` (collapsible wrapper with 2×2 card grid; visibility = `(role === 'controller' || role === 'executive') && scope.kind !== 'cost_center'`; `localStorage` key `creta_capacity_dashboard_collapsed`; slide-up animation via `max-height` CSS transition); `DashboardToggle` (chevron + "Capacity Dashboard" label using Lucide `ChevronDown` / `ChevronRight`); `UtilizationDistributionCard` (Recharts vertical `BarChart`, 6 buckets >100% / 76–100% / 51–75% / 26–50% / 1–25% / 0% — see W4 P1 fix below for data source); `CapacityForecastCard` (Recharts `ComposedChart` with `Area` for Available + Allocated and `Line strokeDasharray="4 4"` for Demand; green surplus shading; month click dispatches `capacity:expand-month` CustomEvent for W5 timeline wiring); `HeadcountBreakdownCard` (single horizontal stacked `BarChart` with dimension switcher dropdown — location/hierarchy/role/CC; `localStorage` key `creta_capacity_headcount_dimension`; click segment → `setScope` for location/hierarchy/CC dimensions); `HotspotListCard` (plain HTML/CSS ranked list — `openPerson` for over-allocation/under-utilization rows, `openCell({dimensionId:'demand', pivot:'role'})` synthesized payload for unfulfilled-demand rows per user decision 2a; "View all / Show less" toggle; `CheckCircle` empty state); `index.ts` barrel.
- MODIFY `frontend/src/modules/capacity/CapacityWorkspace.tsx` — slot insertion: imports `DashboardLayer` and renders it between `<KPISummaryBar />` and `<FilterChipBar />`. Updates docstring.

**Track C — `react-specialist` (Session 8, PL availability view, 6 commits, `4edb0c2` / `05bcd83` / `0303ece` / `be0d577` / `9c0a997` / `c490e3c`):**
- NEW `frontend/src/modules/capacity/availability/*` (8 files): `types.ts` (internal `RoleData` + `SelectedRole` view-layer types); `AvailabilityScopeBar` (single-select location dropdown with `(headcount)` labels — zero-headcount locations hidden; multi-select role filter via `Popover` + `Command` with checkbox indicators; reset button); `AvailabilityKPIs` (3 `SummaryCard` instances — Roles shown / Total headcount / Avg availability); `AvailabilityGrid` (imports `TimeAxisHeader` from W3 timeline — same year/quarter/month collapse behaviour; owns its own `TimeAxisState`; default 12-month window with Q2 2026 expanded to months); `RoleAvailabilityRow` (two-layer bar: dark allocated / light available; color thresholds ≥50% green / 20–49% amber / <20% red / 0% fully dark + small red `Full` label; competing-demand badge via Lucide `Zap`); `AvailabilitySidePanel` (header + monthly breakdown table Capacity/Allocated/Available/Competing + location comparison section visible only when "All locations" + `QuickRequestAction` CTA navigating to `/workbench?request_role={id}&location={loc_id}`); `QuickRequestAction` (Request this role button); `index.ts` barrel.
- REWRITE `frontend/src/modules/capacity/PLAvailabilityView.tsx` — replaces W2 placeholder with full implementation. Self-contained — no `CapacityScopeContext` dependency. URL-synced `?location=` and `?role=` params via `useSearchParams`. Fetches `getRoleAvailability({location_id, role_type_id, start, end})`. Merges multi-location rows when "All locations" selected. Client-side role filter. Opens panel via shared `useSidePanel()` at 280px.
- MODIFY `frontend/src/types/api.ts` — extends `RoleAvailabilityRow` with `competing_demand_count` field, adds `LocationAvailabilitySummary` type, adds optional `location_summary?` field to `RoleAvailabilityResponse` per spec §13.10.
- Privacy verification: `grep -rn "person_name|project_name|cost_center_name|pl_name" frontend/src/modules/capacity/availability/ frontend/src/modules/capacity/PLAvailabilityView.tsx` returns zero matches.
- Slide-over wrapper for the Workbench entry point deferred to W6 S11.

**Lead integration (2 merge commits, `728ff78` / `3513c97`):**
- Merge Track B worktree branch — 2 trivial doc/import conflicts in `CapacityWorkspace.tsx` (Track A and Track B both edited the file in different sections). Resolved by keeping both improvements: Track A's URL-param entry docstring + Track A's `useAssignmentState` / `AssignmentPanel` imports + Track B's `DashboardLayer` import + Track B's slot insertion. Combined docstring.
- Merge Track C worktree branch — clean ort merge; no conflicts.
- `npx tsc --noEmit` clean across all 3 tracks + integration.
- Backend `pytest tests/ -v` — 1653 passed (W3 baseline maintained — no new tests at this stage).

**P1 fixes found during visual verification (2 commits, `f508a24` / `ef3e81d`):**
- **P1-1 — Utilization Distribution card empty at multi-CC scope** (`f508a24`): Track B sourced bucketing from `useScopedTimelineData()` per the spec's "client-side aggregation" assumption, but that hook returns `unsupportedReason='org-scope-not-yet-supported'` at any scope other than a single CC (W3 deferral). Result: the card showed "No data available for current scope" on every Controller/Executive landing — exactly the scope where the dashboard renders per §11.1.
  - NEW `GET /api/capacity/dashboard/utilization-distribution?scope=&start=&end=` endpoint. Server-side computes per-person mean utilization across the visible window and returns `{bucket, count}[]` for all 6 buckets (`zero | 1_25 | 26_50 | 51_75 | 76_100 | over_100`). Empty buckets are included so the chart axis is stable across scope changes.
  - NEW service function `compute_utilization_distribution` in `backend/services/capacity_dashboard.py` reusing `_scoped_person_ids` and `compute_utilization_pct`.
  - NEW schema `UtilizationDistributionBucket` + `UtilizationDistributionResponse` in `backend/schemas/capacity.py`.
  - NEW typed client `getDashboardUtilizationDistribution(scope, start?, end?)` in `frontend/src/api/endpoints.ts`.
  - NEW types `UtilizationBucketKey` + `UtilizationDistributionBucket` + `UtilizationDistributionResponse` in `frontend/src/types/api.ts`.
  - REWRITE `UtilizationDistributionCard.tsx` — fetches from the new endpoint via `scopeToApiParam(scope, ccId)`; loading/error states. Bucket colors switched from the oklch chart-X palette (which doesn't map to spec semantics in light mode) to stable Tailwind hex values (red `#ef4444` / amber `#f59e0b` / green `#22c55e` / blue `#3b82f6` / light-blue `#93c5fd` / gray `#9ca3af`) that read correctly in both themes per spec §11.3.
  - 9 new backend tests in `test_router_capacity_dashboard.py`: shape × 3 (200 status, response envelope, all-six-buckets-present-even-when-empty), semantics × 3 (total = sum-of-buckets, idle person → zero bucket, invalid window → 400), role gating × 3 (PL forbidden, Executive can read, CC Owner can read).
- **P1-2 — KPI bar blanks every card for Executive** (`ef3e81d`): KPISummaryBar called `Promise.all([...getInbox])`, but `getInbox` returns 403 for Executive per spec §12.1 (Executive doesn't action requests). One rejection killed the whole chain → all five cards showed `—`.
  - Switch to `Promise.allSettled` so partial failures degrade gracefully. Pending requests shows 0 for Executive (correct — they can't see the queue anyway). The error banner only fires when ALL of headcount/forecast/hotspots fail; one missing endpoint just leaves that card's input empty.

**Verification (Lead):**
- `npx tsc --noEmit` clean.
- Backend `pytest tests/ -q` — **1662 passed** (1653 W3 baseline + 9 new W4 utilization-distribution tests). 0 failures.
- Visual verification at 1440×900 light + dark via Chrome DevTools MCP, screenshots in `qa/screenshots/v5_2_w4/`:
  * Controller @ All-CCs (light + dark): dashboard layer renders four cards with real data — Utilization Distribution (21/15/7/5/1/0 across the six buckets, total 49 matching the API), Capacity Forecast (3 series with green gap shading), Headcount Breakdown (Munich 20 / Budapest 16 / Pune 13, total 49), Capacity Hotspots (15 issues: 4 unfulfilled-demand + 1 chronic under-utilization). Dashboard hides on My-CC scope with slide-up animation; timeline + KPI bar unchanged from W3 baseline.
  * CC Owner navigation `/capacity/requests` → click "Review & assign" on Autonomous Braking Prototype: routes to `/capacity?assignment_project=proj-autobrake&cc=cc-muc-apd&scope=my_cc`; AssignmentPanel renders at 400px with project header (TBS / PL Priya Sharma / period), progress bar `44 of 95 months assigned`, role section "Senior Solution Architect" with `10/10` completion, Quick Fill row, month rows Jun 2026 – Apr 2027 with assignment slots; CR re-confirmation pre-fills unchanged months.
  * PL `/capacity/availability` (light + dark): Resource Availability page renders 12 role rows × 12 month bars with two-layer fill (allocated dark / available light); KPIs `Roles shown: 12 / Total headcount: 49 / Avg availability: 84%`; click Senior Developer row → side panel opens at 280px with monthly breakdown table (Capacity/Allocated/Available/Competing); privacy preserved (no person/project/CC/PL names rendered).
  * Executive @ All-CCs: dashboard renders with all KPI cards populated (P1-2 fix); "Read-only view" indicator shown; My CC pill hidden; Requests nav link hidden per §12.1.
  * Hotspot click flow: clicking the "Developer — 3 open requests, 5700h unassigned" hotspot opens the side panel with the synthesized demand-cell payload (decision 2a). The panel shows the role context; richer demand-mode rendering is a W5 polish follow-up.
- Screenshots: 01 controller all-CCs light (pre-fix, shows P1-1 empty state for documentation), 02 controller my-CC dashboard hidden, 03 cc-owner inbox, 04 + 04b cc-owner assignment panel, 05 PL availability light, 06 PL availability side panel, 07 PL availability dark, 08 + 08b controller dashboard fixed light, 09 controller dashboard dark, 10 hotspot demand click → CellDetail, 11 executive dashboard read-only.

**Out of scope (deferred to later waves):**
- Multi-person split UI — Wave 5 S10 activates the `[+ Add]` button.
- Timeline ghost overlay during assignment mode + assignment gestures + non-URL entry-point wiring (person-detail "Review project", demand strip, project view) — Wave 5 S6b.
- Group-by-project view — Wave 5 S9.
- Workbench slide-over of PL availability — Wave 6 S11.
- CellDetail "demand" mode richer rendering (currently shows the role context + "No project allocations for this period" placeholder; could be enriched to show pending-request list per role/month) — Wave 5 polish or W6.

**Refactoring opportunities (deferred):**
- KPI bar's per-card data sourcing is duplicated across `KPISummaryBar.tsx` (uses `getDashboardForecast`) and `CapacityForecastCard.tsx` (also uses `getDashboardForecast`). A shared `useDashboardData()` hook would deduplicate the network call.
- `UtilizationBucketKey` vocabulary lives in both `frontend/src/types/api.ts` and `backend/services/capacity_dashboard.py` (`_DISTRIBUTION_BUCKETS`). Consider a single source of truth — e.g., generate from the OpenAPI schema or codify in a shared constants module.

### v5.2 Wave 3 — Core surfaces (2026-05-08, branch `feat/v5_2-capacity-core-surfaces`)

Branch cut by Lead from `main` post-W2 merge. 4-teammate `react-specialist` team (`v5_2-w3-capacity-core-surfaces`) running in parallel with clean file ownership; all teammates committed directly to the shared branch.

**Lead pre-work (5 commits, `f4c6b13` / `010cbe1` / `ecd043f` / `202b77b` / `0d13862`):**
- ADD shadcn primitives via CLI: `popover`, `command`, `scroll-area` (for filter dropdowns + searchable multi-selects + timeline scroll viewport). Pulls in `cmdk@^1.1.1`.
- MODIFY `frontend/src/api/endpoints.ts` — wires the W1 dashboard/history endpoints into `capacityApi` (`getDashboardForecast`, `getDashboardHeadcountBreakdown`, `getDashboardHotspots`, `getCapacityHistory`) and adds the new W3 `getInbox(filters)` client. NEW `frontend/src/lib/capacityScopeApi.ts::scopeToApiParam(scope, ccId)` translates the W2 frontend `CapacityScope` shape to the W1 backend scope vocabulary (`all` / `cost_center:<id>` / `location:<id>` / `hierarchy:<id>`).
- NEW `frontend/src/lib/projectColors.ts` — 7-color rotating project palette per spec §3.2 (hex). NEW `frontend/src/contexts/ProjectColorMapContext.tsx` — Provider with `registerVisibleProjects()` (append-only) + `useProjectColor(projectId)` hook.
- MODIFY `frontend/src/contexts/CapacityScopeContext.tsx` — adds `FilterChipKey` union (`all` / `over_allocated` / `under_utilized` / `pending_requests` / `unassigned_months`) per §6, `activeFilters` + `setActiveFilters` + `normalizeActiveFilters()` helper enforcing mutual exclusivity, and `pendingRequestsKpi` + `setPendingRequestsKpi` seam so the W3 KPI bar can publish the value to the `CapacityModuleNav` Requests badge without a duplicate fetch.
- NEW `backend/routers/capacity.py::GET /api/capacity/inbox` per spec §12.3 — project-per-CC triage queue with role badges, unassigned hours, age, priority, status (new/in_progress/re_confirm), CR distinction. Server-side aggregation per CLAUDE.md "frontend receives ready-to-render data". Authorization: Controller all CCs; CC Owner own CC server-scoped; Executive 403; PL 403. NEW `backend/schemas/capacity.py::CapacityInboxItem` + `CapacityInboxResponse` + `CapacityInboxRoleBadge`. NEW `backend/tests/test_router_capacity_inbox.py` — 21 tests (shape, role gating, multi-CC fan-out, CR distinction, status derivation, role-badge aggregation, unassigned-hours math, project priority from highest RR, age, default sort priority/age, status/role/CC/PL filters, empty state).

**Track A — `react-specialist` (Session 3, timeline + collapsible time axis, 7 commits):**
- NEW `frontend/src/modules/capacity/timeline/timeAxis.ts` — `TimeAxisState` type, `defaultTimeAxisState(window, demoDate)` per §4.5 (current FY → quarters; current quarter → months; past/future years collapsed), `buildVisibleColumns(state, months)` returning the flattened column list with each column's level (`year|quarter|month`) and width (48/48/42px per §4.6), `computePeriodSummary` for collapsed-period averages (§4.4).
- NEW `frontend/src/modules/capacity/timeline/TimeAxisHeader.tsx` — two-row header (year/quarter row + month row), chevron click handlers per §4.3.
- NEW `frontend/src/modules/capacity/timeline/SegmentBar.tsx` + `PersonTimelineRow.tsx` — name cell 160px sticky-left + bar cells with stacked colored project segments. Over-allocation 1.5px red border at >100% (§3.1). Summary bars at 0.85 opacity for collapsed periods (§4.4) including red border when any hidden month exceeds 100%. Tooltips on segments (`Project: Xh`) and gaps (`Available: Xh`).
- NEW `frontend/src/modules/capacity/timeline/RoleGroup.tsx` + `FlatPersonRow.tsx` — expandable role section with chevron + aggregate bar at 50% opacity (§3.3); flat variant for `groupBy === 'person'` sorted by peak utilization desc (§3.6).
- NEW `frontend/src/modules/capacity/hooks/useScopedTimelineData.ts` — fetches based on `(scope, groupBy)`: `cost_center:<id>` → `getTeamHeatmap(ccId)`; other scopes return `unsupportedReason='org-scope-not-yet-supported'` with an explanatory empty state (org-scope timeline lifts to W4 dashboard layer per §11). Per-person `getPersonDetail` calls merge project segments into the heatmap utilization cells.
- NEW `frontend/src/modules/capacity/timeline/CapacityTimeline.tsx` — composition root: scroll-area + `TimeAxisHeader` + sorted `RoleGroup`s (or `FlatPersonRow`s). Owns `TimeAxisState` locally (NOT in scope context per §4.2). Registers visible project ids with `ProjectColorMapProvider` so segment colors stay stable. + barrel `index.ts`.

**Track B — `react-specialist` (Session 4, KPI bar + filter chips + demand strip, 4 commits):**
- NEW `frontend/src/modules/capacity/filters/filterPeople.ts` — pure utility `filterPeople(rows, activeFilters) → rows` plus `rowMatchesFilter` predicate exported for chip-badge counts. Loose `TimelineRow` shape (`person_id`, `monthly_utilization`, `has_pending_request`, `has_unassigned_months`) so any data source can feed it. `UNDER_UTILIZED_THRESHOLD=40` per §6.1.
- NEW `frontend/src/modules/capacity/kpi/KPISummaryBar.tsx` — 5 SummaryCard tiles per §5.2 (Headcount / Avg utilization / Over-allocated / Pending requests / Supply gap). Data sourced from `getDashboardHeadcountBreakdown` (count) + `getDashboardForecast` (windowed avg + over-allocation count derived) + `getDashboardHotspots` (filtered to `over_allocation+target_type=person` and `unfulfilled_demand+target_type=role`) + `getInbox` (sum of role badges). Click handlers route to `setActiveFilters` per §5.4. Pending-requests value publishes to `setPendingRequestsKpi` so `CapacityModuleNav` reads the same number.
- NEW `frontend/src/modules/capacity/filters/FilterChipBar.tsx` — 5 pill buttons (All / Over-allocated / Under-utilized / Pending requests / Unassigned months) with count badges via `countMatching(rows, chip)`. Mutual exclusivity with All per §6.2; multi-specifics AND. Active state inverts colors per §6.3. Reads `activeFilters` from CapacityScopeContext.
- NEW `frontend/src/modules/capacity/demand/DemandStrip.tsx` — sticky-bottom row, one cell per visible time column showing `+N` of unfulfilled requests. Color thresholds: 0=empty, 1–2=warning amber, 3+=danger rose (with dark variants per CLAUDE.md). Collapsed period shows peak (not sum/avg) per §8.3. `peakForPeriod` helper. Data sourced from `getDashboardForecast.demand_hours` divided by `RR_HOURS_PER_MONTH` proxy. Hidden when `groupBy === 'project'` per §10.7.

**Track C — `react-specialist` (Session 5a, side panel + person/cell detail, 4 commits):**
- NEW `frontend/src/modules/capacity/sidepanel/widths.ts` — `CapacityPanelKind` enum + `CAPACITY_PANEL_WIDTH` (person=280, cell=280, project_summary=280, assignment=400 per §7.1 / §9.2 / §10.8).
- NEW `frontend/src/modules/capacity/sidepanel/CapacitySidePanelContext.tsx` — capacity-scoped wrapper around the shared `useSidePanel()`. Exposes `mode`, `openPerson(ccId, personId)`, `openCell({dimensionId, pivot, month, rowLabel})`, `openProjectSummary` (no-op stub for W4 S6a), `openAssignment` (no-op stub for W4 S6a) + `registerProjectSummaryHandler` / `registerAssignmentHandler` plug-in seams. Width-per-mode dispatch via `openPanel(title, content, { width })`. Lead integration commit replaces the dispatcher-node pattern with concrete `<PersonDetail />` / `<CellDetail />` content per call (the shared SidePanel renders content outside the provider tree).
- NEW `frontend/src/modules/capacity/sidepanel/PersonDetail.tsx` — header (name / role / location badge), Allocations section with project color dots from `useProjectColor` + names + hours/month (project name links to `/workbench?project={id}`), Monthly summary (utilization-by-quarter colored buckets), conditional Pending requests + Demand pipeline sections. "Review project" buttons emit a callback that downstream tracks (W4 S6a) wire to assignment-mode entry.
- NEW `frontend/src/modules/capacity/sidepanel/CellDetail.tsx` — header (row label + period), summary block (Allocated / Available / Delta with color), expandable project-allocations list with per-person breakdown.
- NEW `frontend/src/modules/capacity/sidepanel/CapacityPanelContent.tsx` (kept for downstream W4 use, currently unused by Lead integration) + barrel `index.ts`.

**Track D — `react-specialist` (Session 5b, inbox + history, 12 commits):**
- NEW `frontend/src/modules/capacity/shared/Pagination.tsx` — small custom prev / numbered / next pager (shadcn doesn't ship a Pagination primitive in this codebase). Used by the History page.
- NEW `frontend/src/modules/capacity/shared/personaPersonId.ts` — demo persona → `person_id` mapping. Used by the History "Me" default and the inbox's recently-completed "current user" filter.
- NEW `frontend/src/modules/capacity/requests/InboxFilterBar.tsx` — status pill group + Role / PL / Cost-center popovers (cmdk command list with checkbox indicators). CC dropdown hidden for CC Owners.
- NEW `frontend/src/modules/capacity/requests/RequestRow.tsx` — one (project, CC) row per spec §12.3 with CR pill + summary line, hierarchy node badge, role badges, age + status + priority pills (colour rules), and "Review & assign" + "Decline all" action group. Decline opens an inline `<DeclineInlineForm>` beneath the row; row gets a strikethrough + fade-out animation post-decline.
- NEW `frontend/src/modules/capacity/requests/DeclineInlineForm.tsx` — inline expansion textarea + Cancel / Confirm decline buttons.
- NEW `frontend/src/modules/capacity/requests/RequestTable.tsx` — sortable shadcn table with default `priority desc → age desc` (matches the server) and an EmptyState card when the filtered set is empty.
- NEW `frontend/src/modules/capacity/requests/RecentlyCompletedSection.tsx` — collapsed-by-default section at the bottom of the inbox listing the last 7 days of completed actions (`getCapacityHistory` filtered to confirm/partial/decline/cr_reconfirm; CC Owner is server-scoped, Controller is filtered to their own person_id). "View full history" link → /capacity/history. Refreshable via a parent nonce so post-decline actions update without a remount.
- REWRITE `frontend/src/modules/capacity/RequestsInbox.tsx` — page composition + URL state (`useSearchParams({ replace: true })` for filter + sort) + decline orchestration (3-second strikethrough + concurrent inbox refresh + recently-completed bump).
- NEW `frontend/src/modules/capacity/history/HistoryFilterBar.tsx` — User searchable dropdown (with role-aware "Me" entry), Action multi-select pill group, multi-select Cost-center popover (hidden for CC Owners), Project searchable dropdown, From/To date inputs. Reset filters button + active-state detection compare against the role-default fallback.
- NEW `frontend/src/modules/capacity/history/HistoryRow.tsx` — Date / User / Action badge / Project / CC / Summary columns + chevron toggle.
- NEW `frontend/src/modules/capacity/history/HistoryDetailExpand.tsx` — structured detail_payload breakdown: roles affected, people assigned, optional CR info, decline reason, "View project in workbench" link.
- NEW `frontend/src/modules/capacity/history/HistoryTable.tsx` — sortable shadcn table; sort is server-side via `getCapacityHistory` params. EmptyState card when filters yield nothing.
- REWRITE `frontend/src/modules/capacity/CapacityHistory.tsx` — page composition + URL state (filter + sort + page) + dropdown options (users from rolesApi mapped via PERSONA_TO_PERSON_ID, CCs from referenceApi, projects from workbenchApi) + Pagination footer. Default filter rules per spec §12.12: CC Owner → User=Me, Controller / Executive → User=All; date range default = last 30 days.

**Verification (Track D):**
- `tsc --noEmit` clean.
- Backend `/api/capacity/inbox` + `/api/capacity/history` consumed unchanged.
- Visual verification at 1920×1000 across Controller (all CCs visible), CC Owner (CC column hidden, server-scoped) and Executive (read-only history) personas; light + dark themes; Decline-all inline form expansion; History expanded-row payload rendering. Screenshots: `qa/screenshots/w3-trackd-{01..09}*.png`.

**Lead integration (2 commits, `e90ae51` / `60c23ef`):**
- REWRITE `frontend/src/modules/capacity/CapacityWorkspace.tsx` — replaces W2 placeholder slots with the real components in spec §1.3 layout order (ScopeBar → KPISummaryBar → FilterChipBar → CapacityTimeline → DemandStrip). Wraps the workspace tree in `<CapacitySidePanelProvider>`. Lifts `useScopedTimelineData()` to the workspace level so FilterChipBar gets live badge counts off the same dataset the timeline renders. Hint card when an active filter combination hides every row.
- MODIFY `frontend/src/modules/capacity/CapacityModuleNav.tsx` — Requests badge source change. When the `CapacityScopeProvider` is mounted (workspace + inbox + history routes), the badge reads the live `pendingRequestsKpi` value published by KPISummaryBar (Lead 0.4 seam). Falls back to the layout shell's `pendingRequestCount` prop when the provider isn't available (e.g., the PL availability route). New `useCapacityScopeOptional()` hook on the context for safe non-throwing access.
- MODIFY `frontend/src/App.tsx` — lifts `<ProjectColorMapProvider>` to the App level (above `<AppLayout>`). The shared `SidePanel` renders captured content nodes inside `AppLayout`, *outside* any per-route provider — so when the side panel hosted PersonDetail (which calls `useProjectColor`), the per-workspace provider was unreachable. The lift gives timeline rows AND side-panel allocation dots a single shared map.
- MODIFY `frontend/src/modules/capacity/timeline/CapacityTimeline.tsx` — drops its inner `ProjectColorMapProvider` (lifted to App.tsx) so the map is a single instance across the workspace + the side panel.
- MODIFY `frontend/src/modules/capacity/sidepanel/CapacitySidePanelContext.tsx` — replaces the dispatcher-node pattern with concrete content per call: `openPerson` passes `<PersonDetail ccId personId />` directly; `openCell` passes `<CellDetail ... />` directly. Track C's original dispatcher relied on `<CapacityPanelContent />` re-reading `mode` from the capacity context at render time — but that node is captured as a React element by the shared `SidePanelContext` and rendered later inside `AppLayout`, where the capacity context is unreachable. Concrete content sidesteps that.

**Verification (Lead):**
- `npx tsc --noEmit` clean across all 4 tracks + integration.
- Backend `pytest tests/ -v` — 1653 passing (1632 W1 baseline + 21 new W3 inbox tests). 0 failures.
- Curl-smoke `/api/capacity/inbox`: Controller sees 5 rows including proj-autobrake's 3-CC fan-out (cc-muc-apd / cc-bud-apd / cc-pun-apd); CC Owner (Thomas Brenner) sees 3 own-CC rows; Executive 403; PL 403.
- Visual verification at 1440×900 in light + dark mode (Chrome DevTools MCP):
  * Workspace at My CC / MUC App Dev (Controller): KPI bar shows 5 / 27.6% / 1 / 6 / 5 roles; filter chips show All=20 / Over-allocated=2 / Under-utilized=14 / Pending=0 / Unassigned=0; timeline renders 5 role groups (Developer, Junior Developer, QA / Test Engineer, Senior Solution Architect, Senior Developer) with 11 person rows; default time-axis collapse (Q2 2026 expanded to Apr/May/Jun, others collapsed to year/quarter); Lena Fischer's Q2 row shows the red over-allocation border with stacked ERP Integration Phase 2 segments at 165h/mo.
  * Person detail panel (click Lena Fischer): renders at 280px with project color dots matching the timeline segments, Allocations section "ERP Integration Phase 2: 123h/mo", Monthly summary 2026 Q2=103% Q3=50% Q4=0%.
  * Demand strip: monthly cells +2 / +2 / +5 / +4 / +4 / ... at My-CC scope (CC Owner-scoped, cc-muc-apd only); aggregate +2 / +2 / +8 / +7 / ... at All-CCs scope.
  * `/capacity/requests` Controller: 5 rows with proj-autobrake 3-CC fan-out, "CR" pill on ERP Integration Phase 2 + Sensor Data Pipeline rows, status badges (Re-confirm blue, In progress amber, New gray).
  * `/capacity/requests` CC Owner: 3 own-CC rows, no CC column rendered (matches §12.6).
  * `/capacity/history`: 3 entries, action-type pill multi-select active for all 5 categories, date range last-30-days default, sort timestamp desc, action badges colored (Draft saved gray, Re-confirmed blue, Confirmed green).
  * PL persona auto-redirects from `/capacity` → `/capacity/availability` (W2 placeholder, real implementation lands in W4 S8); CapacityModuleNav hidden for PL.
  * Dark mode rendered correctly across all surfaces (semantic Tailwind tokens, dark-variant classes for status badges).
  * Screenshots: `qa/screenshots/v5_2_w3/{01..08}*.png` (Controller workspace light + dark, person detail, inbox, history, CC Owner inbox, PL redirect).

**Out of scope (deferred to later waves):**
- Group-by-project view (§10) — Wave 5 S9.
- Dashboard layer charts (§11 — utilization distribution, capacity forecast, headcount breakdown, hotspot list) — Wave 4 S7.
- Assignment panel (§9) including timeline overlay + gestures (§9.4 / §9.6) — Wave 4 S6a + Wave 5 S6b.
- PL read-only availability view (§13) — Wave 4 S8.
- Multi-person assignment UI on the assignment panel (§9.5) — Wave 5 S10.
- Org-scope timeline rendering — currently shows an "org-scope timeline coming in W3 Track B / S7" empty state when `scope ≠ my_cc`. The KPI bar + dashboard cards (W4) carry the org-wide view; the spec doesn't require per-person timeline rows at All-CCs scope.
- FilterChipBar `pending_requests` + `unassigned_months` chip predicates currently default to `false` per row because the timeline data feed doesn't include per-person request linkage. The chip count badges therefore under-report; both predicates light up once the timeline merges resource-request data in W4 S6a.

**Refactoring opportunities (deferred):**
- `Track D` shipped a `personaPersonId.ts` helper that overlaps with `RoleContext.context.person_id`. Consolidate in a future polish pass.
- Lead integration `buildFilterRows` adapter could be replaced once `useScopedTimelineData` natively exposes the shape FilterChipBar wants (drops the duplication).

### v5.2 Wave 2 — Frontend workspace shell (2026-05-08)

Branch: `feat/v5_2-capacity-shell`. Closes Implementation Guide Session 2 — frontend shell only, no backend work. Two-teammate agent team (`v5_2-w2-capacity-shell`) with clean file ownership; both worktrees committed directly to the shared branch (worktree isolation didn't take effect, but file split prevented collisions).

**Track A — `react-specialist` (5 commits, `0e72a8a` / `8a19aa6` / `c5706cb` / `e470da1` / `f43a120`):**
- NEW `frontend/src/contexts/CapacityScopeContext.tsx` — provider + hook exposing `{ scope, groupBy, ccId, setScope, setGroupBy, setCcId }`. Role-aware defaults: CC Owner → `my_cc` pinned to `managed_cost_center_id`; Controller → `all_ccs`; Executive → `all_ccs`. Default groupBy `role`.
- NEW `frontend/src/modules/capacity/hooks/useScopeQueryParams.ts` — syncs scope/groupBy/cc state with `?scope=…&group=…&cc=…` via `useSearchParams`. Restored on mount; `replace`-navigates on change.
- NEW `frontend/src/modules/capacity/ScopeBar.tsx` — pill groups per spec §2.1: scope (`All CCs` / `My CC` / per-Location / per-top-level-hierarchy-node) + group-by (`Role` / `Project` / `Person`). Controller `My CC` selection renders a searchable shadcn `Select` dropdown next to the pill (replaces legacy `CapacityManagement.tsx:77–95`). CC Owner: My CC pinned, no dropdown. Executive: My CC pill hidden + "Read-only view" indicator (per §2.5). Master data via `referenceApi.getLocations()` + `capacityApi.getOrgHeatmap('lob')` (existing patterns).
- NEW `frontend/src/modules/capacity/CapacityWorkspace.tsx` — top-level workspace under `/capacity`: renders `<ScopeBar />` + 5 labelled placeholder slot Cards (KPI bar / Dashboard layer / Filter chips / Timeline / Side panel) each with a "Wave 3" deferral note.
- REFACTOR `frontend/src/modules/capacity/CapacityManagement.tsx` (191 → 47 LOC) — shrunk to a thin layout shell: `ModuleHeader` + `<CapacityModuleNav />` + `<Outlet />`. PL gate redirects to `/capacity/availability`. Removed legacy CC selector + Tabs + inner `<Routes>`.
- MODIFY `frontend/src/App.tsx` — registered new `/capacity/*` route tree with `CapacityManagement` layout wrapping the four child routes; `/capacity/project-assignment/:id` deprecation redirect → `/capacity?assignment_project={id}`.

**Track B — `react-specialist` (3 commits, `63d8306` / `581b78e` / `e3c75b2`):**
- MODIFY `frontend/src/contexts/SidePanelContext.tsx` — added `width: number` to context state and `opts?: { width?: number }` to `openPanel()`. Default 380px (extracted to `frontend/src/lib/sidePanelConstants.ts` to keep React Fast Refresh happy). Width resets to default on `closePanel`. NEW `frontend/src/lib/sidePanelConstants.ts` exports `DEFAULT_SIDE_PANEL_WIDTH=380`.
- MODIFY `frontend/src/components/layout/SidePanel.tsx` — removed hardcoded `w-[380px]` Tailwind class; reads `width` from context, applies via inline `style={{ width }}` with default fall-through. `frontend/src/components/layout/AppLayout.tsx` updated similarly so the main margin-right tracks the panel width (no more hardcoded `mr-[380px]`).
- NEW `frontend/src/modules/capacity/CapacityModuleNav.tsx` — secondary nav strip (`Workspace | Requests (N) | History`) per spec §12.1. Role visibility: Controller (3 links), CC Owner (3 links), Executive (Workspace + History only — Requests hidden), PL (nav not rendered). Badge count on Requests sourced from `pendingRequestCount` prop (parent layout passes `CapacityContext.pending_request_count` from W1 backend); badge hides when count is 0.
- NEW placeholder skeletons — `frontend/src/modules/capacity/RequestsInbox.tsx`, `CapacityHistory.tsx`, `PLAvailabilityView.tsx`. Each renders `ModuleHeader` + page title + a deferred-to-later-wave note (W3 / W3 / W4 respectively).

**Out of scope (intentional, per plan):**
- Existing My Team / Org / RequestManagement code stays in repo but unrouted — the legacy `modules/capacity/myteam/`, `org/`, `requests/` directories are now dead code, scheduled for deletion as W3 (S5b) lands the real Inbox and W3 (S3+S4) lands the real Workspace timeline + KPI bar.
- The `/capacity/requests` route is now a placeholder; the functional CC Owner triage queue from v5.1 is *temporarily* unavailable between this PR's merge and the W3 PR's merge. Decision locked with user (clean-cut over preserve-legacy).
- Slots in `CapacityWorkspace` are visual placeholders only — no data fetches off scope changes yet.

**Verification:**
- `tsc --noEmit` clean.
- `npm run lint` — 5 new `react-refresh/only-export-components` warnings on `CapacityScopeContext.tsx` (matches pre-existing pattern in `ThemeContext.tsx`, `RoleContext.tsx`, etc. — codebase baseline). Also `CapacityManagement.tsx:47` has a `react-hooks/set-state-in-effect` warning, preserved from the pre-W2 location at line 119 of the same file (not a new regression).
- pytest 1632 passed (W1 baseline preserved, frontend-only change as expected).
- Visual verification via Chrome DevTools MCP at 1440px in BOTH light and dark mode across all 4 personas: Controller (Anna Meier) sees 3-link nav + ScopeBar with My CC dropdown; CC Owner (Thomas Brenner) sees My CC pinned to `cc-muc-apd`; Executive (Klaus Weber) sees All CCs + Workspace/History nav (no Requests, no My CC pill, "Read-only" indicator); PL (Priya Sharma) auto-redirects to `/capacity/availability`. Deprecation redirect `/capacity/project-assignment/proj-pmpoc` → `/capacity?assignment_project=proj-pmpoc` verified. Existing SidePanel callers (Help FAQ on backlog) still render at 380px default — no regression. Screenshots in `qa/screenshots/v5_2_w2/` (8 shots).

**Refactoring opportunities (deferred):**
- `CapacityScopeContext.tsx` could split exports into a constants file like Track B did with `sidePanelConstants.ts` to clear the 5 fast-refresh warnings — same pattern is already accepted across the codebase, so deferred until a broader sweep.

**Next session (W3):** Read `guides/Capacity_Module_Redesign_Spec.md` §3–§8, §10, §11 + Implementation Guide §S3/S4/S5a/S5b. Branch `feat/v5_2-capacity-core-surfaces` from `main` after W2 PR merges. Plan only Wave 3 (per `feedback_wave_sessions.md` — don't pre-plan beyond current wave).

### v5.2 Wave 1 — Capacity foundation (2026-05-07)

Branch: `feat/v5_2-capacity-foundation`. Closes Implementation Guide Session 1 — backend foundation only, no frontend work.

**Lead pre-work (`447e27f`):**
- Stub files: `backend/services/capacity_dashboard.py`, `backend/services/capacity_audit.py`, `backend/seed/generate_seed_v5/s22_v5_2_capacity_seed.py`.
- Pre-verified zero `(resource_request_id, month, person_id)` duplicates in current seed (38 rows / 38 distinct triples) so Teammate A's constraint relaxation is a safe migration.

**Teammate A — `sql-pro` (`a81b5c5` / `14d7c53`):**
- Relaxed `uq_rra_request_month` → `uq_rra_request_month_person` `(resource_request_id, month, person_id)` per spec §9.5.
- Added `CapacityActionLog` SQLAlchemy model in `models/capacity.py` with 4 composite indexes (`ix_capacity_action_log_user`, `ix_capacity_action_log_project`, `ix_capacity_action_log_cc`, `ix_capacity_action_log_time`). Registered in `models/__init__.py`.

**Teammate B — `fastapi-developer` (5 commits, `0c38816` / `b40a89b` / `99da8aa` / `8b4b29e`):**
- NEW `services/capacity_dashboard.py` (~640 LOC) — `compute_dashboard_forecast`, `compute_headcount_breakdown`, `compute_hotspots`. Reuses `compute_utilization_pct`, `add_months`, `generate_month_range`, `get_standard_hours` from `services/calculations.py`. Scope vocabulary: `all | location:<id> | hierarchy:<id> | cost_center:<id>`.
- NEW `services/capacity_audit.py` — `log_capacity_action()` helper writing to `CapacityActionLog`. Mirrors the `routers/admin._log_audit()` pattern (no-commit, caller commits). `ACTION_TYPES` tuple exported for type-checking.
- NEW endpoints in `routers/capacity.py`: `GET /api/capacity/dashboard/{forecast,headcount-breakdown,hotspots}` (Controller / CC Owner / Executive; PL → 403). `GET /api/capacity/history` with server-side scope enforcement per spec §12.14 (Controller all; CCO own CC; Exec all read; PL → 403).
- Enhanced `GET /api/capacity/role-availability`: added `competing_demand_count` per (role, location, month) excluding the requesting PL's own projects; added top-level `location_summary` array when `location_id` omitted (per spec §13.10).
- Enhanced `PUT /api/capacity/requests/{cc}/{rid}/assignments`: accepts new body shape `[{month, assignments: [{person_id, hours}]}]` per spec §9.5; backward-compatible with the legacy single-person body.
- Wired `log_capacity_action()` into 4 existing mutating handlers per spec §12.10: project-confirmation/confirm (`confirm` or `partial_confirm`), project-confirmation/decline (`decline`), requests/assignments PUT (`assign_draft`), requests/partially-fulfill (`partial_confirm`).

**Teammate C — `fastapi-developer` (3 commits, `c227985` / `b621811`):**
- Enriched `s14_allocations.py`: `proj-autobrake` intake fans out to 3 cost centers (cc-muc-apd / cc-bud-apd / cc-pun-apd) via RR 110 / 111 / 112 — satisfies (i) ≥3 pending requests across ≥2 role types and ≥2 CCs, and (ii) ≥1 project with multi-CC fan-out per spec §12.6.
- Enriched `s15_change_requests.py`: emit two CR-triggered re-confirmation rows with `change_direction='increase'` (RR 120 → CR #9 sr-dev MUC 100→120h; RR 121 → CR #15 ext-cloud 0→5000 EUR) per spec §9.8 / §12.5.
- NEW `s22_v5_2_capacity_seed.py` (~530 LOC, `random.seed(522)`): 8 `CapacityActionLog` rows spanning 6 action_types (within last 30 days from 2026-04-15), and 1 multi-person assignment example (RR 102 split p-schmidt 60h / p-bauer 40h across 2026-06 → 2026-08). Verifies the relaxed constraint via concrete rows.
- Regenerated `seed.sql` end-to-end (s01–s20) → append s21 v5.1 W5 → append s22.

**Teammate D — `test-writer` (`7a5c228`):**
- 5 new test files (1777 LOC): `test_router_capacity_dashboard.py`, `test_router_capacity_history.py`, `test_capacity_audit_log.py`, `test_router_capacity_assignments_multiperson.py`, `test_router_capacity_role_availability_v52.py`. Coverage: shape, role gating (Controller/Exec/CCO 200, PL 403), scope filtering, empty state, hotspot severity ranking + all 3 categories, history pagination + scope enforcement, audit-log writes per action type, multi-person body + legacy body backward compat, `competing_demand_count` PL-own-project exclusion + `location_summary`.

**Lead simplify cleanup (`c14b49f`):**
- High: dropped unreachable `reassign` action_type (no call site emitted it; spec §12.10 vocabulary is the 6-value set); replaced lazy `_resolve_log_model()` scaffolding in `capacity_audit.py` with top-level import; same in `routers/capacity.py::get_capacity_history`.
- Medium: pre-fetch CC→location map in `compute_hotspots` (eliminates per-person query in chronic-under-util loop); collapsed two-pass best_run computation into single linear walk; renamed indexes `idx_*` → `ix_*` per existing convention; corrupt JSON in detail_payload now logged via `logger.warning` instead of silently nulled.
- Low: dropped unused imports (`Forecast`, `and_`, `or_`); removed redundant `cc_to_location_full` alias; moved `import json` to module top-level; stripped "Teammate A/B" narrative comments.

**Verification:**
- pytest 1630 passed (W6/v5.1 baseline 1554 + 76 new W1 tests). 0 failures.
- All 6 changed/new endpoints curl-smoke-verified end-to-end after `mv backend/creta_demo.db ...preW1-postintegration` reset:
  * `/dashboard/forecast?scope=all` → 200, 12-month time series with `available_hours`, `allocated_hours`, `demand_hours` per month
  * `/dashboard/headcount-breakdown?scope=all&dimension=location` → 200, 3 locations (BUD/MUC/PUN) with counts + avg utilization
  * `/dashboard/hotspots?scope=all&limit=5` → 200, 5 entries spanning 2 categories (`unfulfilled_demand`, `under_utilization` — including S. Braun chronic 0% for 7 months from the seed scenario)
  * `/history?page=1&page_size=5` as Controller → 200, all 8 seeded `CapacityActionLog` rows visible across 6 action_types
  * `/history` as PL → 403 with "Role 'project_lead' not permitted"
  * `/role-availability` as PL → 200 with `competing_demand_count` per row + top-level `location_summary` array of 3 locations
- Seed verification queries: 8 CapacityActionLog rows / 6 distinct action_types / 3 multi-person assignment rows (RR 102 across 3 months) / 5 external_cost requests / proj-autobrake fan-out across 3 CCs / 3 distinct CCs and 5 distinct role types in pending requests / S. Braun (`p-braun`) has zero allocation rows for 2026-04 → 2026-10 (7 consecutive zero-util months as designed).
- `simplify` skill: 3 reviewers ran in parallel (reuse, quality, efficiency); 8 fixes applied in a single cleanup commit; deferred items flagged below.
- `security-review` skill: 6 candidate findings surfaced, all filtered below confidence-8 threshold (pre-existing concerns out of PR scope per skill instructions, "lack of audit logs" hard exclusion, documented design intent for CC Owner dashboard access). 0 actionable findings.

**DB ritual:** Schema change requires `rm backend/creta_demo.db` (or `mv` to a backup) after pulling the branch — no Alembic in this codebase. PR description must call this out (per `project_schema_migration.md` memory).

**Out of scope (deferred to follow-up):**
- Extract `_quote` / `_load_seed_into_memory` / `_seed_path` to `seed/generate_seed_v5/_common.py` (s21 + s22 currently copy-paste; medium severity; defer until a third generator copies the pattern).
- Add `ActionType` / `HotspotCategory` Literals to `schemas/capacity.py` (currently plain `str`; existing pattern in `schemas/external_costs.py:23` uses Literal).
- Subclass `schemas.common.PaginatedResponse` for the 3 new list-with-metadata response shapes (`DashboardForecastResponse`, `HeadcountBreakdownResponse`, `HotspotResponse`, `CapacityHistoryResponse`).
- Consolidate persona-X-Current-User fixtures into `conftest.py` (5 test files repeat the same `HEADERS_CTRL/CCO/EXEC/PL` constants).
- Collapse N+1 in `compute_headcount_breakdown` per-segment queries (medium severity, acceptable at demo scale; ~5 queries at current scope-pill density).
- Make `detail_payload` `nullable=False` (every call site provides one — schema mismatch is currently latent).

## v5.1 Implementation — wave status

Active spec: `guides/CRETA_v5_1_Change_Specification.md` (16 items: 5 bug fixes, 2 seed enrichments, 9 features). Plan: 6 waves, one wave per session, PR review gate between every wave. Agent teams used within each wave. v5 spec + impl guide archived to `docs_archive/`.

- [x] **Wave 1** — Reorg + bug fixes (A-01..A-05) + seed expansion (B-01, B-02) — branch `fix/v5_1-batch-1-bugs-and-seed` (PR #80 merged 2026-05-05)
- [x] **Wave 2** — Grid foundation (C-02 collapsible years + C-08 three-point cells) — branch `feat/v5_1-grid-foundation` (PR #81 merged 2026-05-05)
- [x] **Wave 3** — Phase highlighting (C-03) + comparison chart (C-04) + past-months lookback follow-up — branch `feat/v5_1-phase-and-chart` (PR #82 merged 2026-05-06)
- [x] **Wave 4** — Role FK + row expansions (C-05 + C-06 + C-07 grid label / External Costs tab / Capacity External badge) — branch `feat/v5_1-roles-and-expand` (PR #83 merged 2026-05-06)
- [x] **Wave 5** — External Costs tab overhaul (C-09) — branch `feat/v5_1-external-costs-grid` (PR #84 merged 2026-05-06)
- [x] **Wave 6** — Launchpad revert (C-01) — branch `feat/v5_1-launchpad-modules` (PR pending)

Refactoring opportunities (deferred — no unsolicited refactoring):
- Legacy `frontend/src/modules/workbench/forecast/ForecastGrid.tsx` may still be mounted alongside `MixedGranularityGrid.tsx`. Audit during Wave 2.
- `BacklogProjectDetailPage.tsx` declares `const navigate = useNavigate();` but never calls it. Pre-existing dead code observed during Wave 1 A-02 work.
- `DashboardTab.tsx` carries a hand-maintained `RESERVED` set of Portfolio segment names for its legacy `/portfolio/<projectId>` redirect. Brittle: every new top-level Portfolio tab must be added or the same A-04 class of bug recurs. Worth retiring the redirect entirely when DashboardTab gets its next refresh.
- Charging sub-views (`DistributionListView`, `BTCProfileListView`, `RollupView`, `ReportingPanel`) still show Save/Delete/Add buttons regardless of role. Backend `require_role("controller")` rejects mutations with 403, but the buttons should be hidden for non-Controllers per `[A-05]`. Tracked as a Wave 1 follow-up; threading a `readOnly` prop derived from `useRole().context?.role` is a small targeted change for a follow-up wave.

## v5.1 Wave 6 — Launchpad revert to module cards (2026-05-06)

Branch: `feat/v5_1-launchpad-modules`. Closes the final v5.1 spec item C-01 — replace Launchpad Zone 3 (role-personalised KPI tile grid, 7–9 tiles per persona via `/api/launchpad/tiles` + four `_build_tiles_for_*` builders) with a fixed 3-column **module-card grid** that doubles as the primary navigation entry. Zones 1 (header) and 2 (pending actions strip) untouched. Per-user direction confirmed Option 1: delete the dormant tile surface entirely. Built via the 1+2 agent-team split.

**Lead pre-work (`7695067`):**
- `backend/schemas/global_launchpad.py` — extended `ModuleTile` with `subtitle_kpis: list[str] = []` (default empty so any unconverted module still serialises cleanly).
- `frontend/src/types/api.ts` — mirrored `subtitle_kpis: string[]` on the `ModuleTile` interface.
- `frontend/src/modules/launchpad/moduleCardIcons.ts` (NEW) — single source of truth for the Lucide icon per module id (`LayoutDashboard`, `ListChecks`, `Briefcase`, `Users`, `Sparkles`, `Network`, `BarChart3`, `Settings`, `BookOpen`).
- `frontend/src/modules/launchpad/ModuleCardGrid.tsx` (NEW, stub) — clean creation surface for Teammate B.

**Teammate A — backend subtitle KPIs + retire tile endpoint (4 atomic commits, `b3d937a`/`32c7f22`/`42c8582`/`dd4364a`):**
- `backend/services/module_card_kpis.py` (NEW) — `compute_module_subtitle_kpis(db, role, module_id, user)` returning the per-card subtitle strings per spec table at lines 175–234. Reuses `services/portfolio_service.compute_portfolio_kpis` for the (cross-role identical) Portfolio line and lifts the forecast-cycle-status helper out of the retired tile builders. Internal helpers `_format_currency` (full European EUR formatting) + `_format_currency_millions` (`€X,Xm` for the Portfolio compact line).
- `backend/routers/global_launchpad.py` — wired `subtitle_kpis` into `GET /api/modules`; `contextual_metric` mirrors the first subtitle string (or empty); deleted ~620 LOC of `_build_tiles_for_*`, `_format_currency`, and the `GET /api/launchpad/tiles` route.
- `backend/schemas/global_launchpad.py` — removed `TilePayload` + `TilesResponse`.
- `backend/tests/test_router_launchpad_tiles.py` — DELETED (23 tests retired).
- `backend/tests/test_module_subtitle_kpis.py` — NEW, 30 tests across all 4 roles + cross-role canary on Portfolio line + format regex per module.
- Spec ambiguity resolved: "BTC profiles needing review" → mapped to `BTCProfile.status='draft'`; "Data quality: [indicator]" → `OK | review` keyed on whether any `pending_review` scheduled changes exist.

**Teammate B — frontend ModuleCardGrid + retire tile components (2 commits, `ece49ab`/`3e8dda3`):**
- `frontend/src/modules/launchpad/ModuleCardGrid.tsx` — full implementation. Fixed `grid grid-cols-3 gap-4` wrapped in `max-w-screen-2xl mx-auto`. Fetches via `modulesApi.getAll()`, filters `tile.visible`, sorts by `sort_order`. Each card uses shared `ActionCard` (per `[E-07d]`) with `title` overridden to `text-foreground font-semibold` per spec; Lucide icon rendered top-left inside `children` (not `headerRight`) so the spec's "icon top-left" requirement holds; description (line-clamp-1) + subtitle KPI rows below. 3×3 skeleton loading state; shared `EmptyState` defensive fallback; click navigation via `MODULE_ROUTES`.
- `frontend/src/modules/launchpad/Launchpad.tsx` — swapped `RoleTileGrid` import + JSX for `ModuleCardGrid`. Zones 1 and 2 untouched.
- DELETED: `RoleTileGrid.tsx` and the entire `tiles/` subdirectory (`TileCard.tsx`, `PLTileGrid.tsx`, `ControllerTileGrid.tsx`, `CCOwnerTileGrid.tsx`, `ExecutiveTileGrid.tsx`).
- `frontend/src/api/endpoints.ts` — removed `launchpadApi.getTiles()`.
- `frontend/src/types/api.ts` — removed `TilePayload`, `TileTone`, `TilesResponse`.

**Lead integration (`8f9de47`):**
- `MODULE_VISIBILITY` and `MODULE_SORT` in `backend/routers/global_launchpad.py` aligned with the C-01 spec card-availability table — PL gained Capacity (read-only) and Simulator (read-only); CC Owner gained Simulator (scoped) and lost Backlog (spec line 181 doesn't include CCO). Controller (9) and Executive (6) unchanged. Final card counts: Controller 9 / PL 8 / CC Owner 7 / Executive 6.
- `EXPECTED_VISIBLE` in `test_module_subtitle_kpis.py` updated to match the corrected visibility map.

**Verification:**
- Backend pytest: **1554 passing** (W5 baseline 1547 − 23 retired tile tests + 30 new subtitle KPI tests = 1554).
- Frontend `tsc --noEmit`: 0 errors (W5 baseline maintained). Pre-existing `npm run build` type error in `IntakeDetail`/`DiffData` is unchanged on `main` and unrelated to Wave 6.
- Visual verification: 8 screenshots saved to `qa/screenshots/wave-6-c01/` (`<role>-<theme>.png` for the four personas × light + dark). Card counts confirmed (9 / 8 / 7 / 6); subtitle KPIs role-differentiated (Workbench: PL "Your 5 projects" vs Controller "4 projects overdue" vs CCO "5 projects in your CC"; Backlog: PL "Your 1 projects in pipeline" vs Controller/Executive "4 projects in pipeline"; Capacity: PL "Role availability · 9 open requests" vs Controller/CCO "My team: X% · Org: 15% · 9 open requests"). Click navigation verified for Portfolio card (lands on `/portfolio`).

**Out of scope (deferred):**
- The `npm run build` `IntakeDetail`/`DiffData` type narrowing error is pre-existing on `main` and predates Wave 6 — flagged for a future cleanup wave.
- `services/forecast_cycle.derive_cycle_label` is now used by both `routers/workbench.py` and `services/module_card_kpis.py`; no consolidation needed.

## v5.1 Wave 5 — External Costs tab overhaul (2026-05-06)

Branch: `feat/v5_1-external-costs-grid`. Closes spec item C-09 — the largest item in v5.1 (External Costs tab gets a NEW monthly grid as primary view, 2 KPI strip additions, 4 vendor-table column additions, expanded delivery + invoice content per the user's max-scope choice). Built via the 1+3 agent-team split.

**Lead pre-work (`01e106d`):**
- `models/financial.py` — added 5 nullable columns: `Forecast.po_amount`, `Forecast.accrual_amount`, `Forecast.contract_end_month`, `Actuals.invoiced_amount`, `Actuals.po_number`. All numerics carry `server_default="0"`.
- New `ExternalCostDelivery` and `ExternalCostInvoice` models for row-expansion content (delivery schedule + invoice history). Implicit key `(project_id, vendor, po_number)`. Registered in `models/__init__.py`.
- `seed/seed.sql` — mechanical `ext_status` vocabulary remap (sed-style): `accrued`→`accrual`, `committed`→`ordered`, `delivered`→`goods_received`, `requested`→`planned`. `invoiced` unchanged. Sixth value `open` introduced by Teammate C's top-up.
- `routers/workbench.py` — registered `GET /api/workbench/projects/{id}/external-costs/monthly-grid` returning a typed empty payload. Widened `vendor-summary` response with a top-level `kpis` block (zero-filled).
- `schemas/external_costs.py` — new Pydantic schemas: `ExternalCostStatus` literal, `MonthlyGridCell`/`Item`/`Response`, `DeliveryScheduleRow`, `InvoiceHistoryRow`, `ExternalCostsKpis`, `VendorSummaryResponse`. Extended `VendorSummaryItem` with 4 optional fields (`contract_reference`, `contract_end`, `open_po`, `remaining_not_invoiced`).
- `services/external_cost_aggregation.py` — service stubs `compute_project_monthly_grid` and `compute_project_external_kpis` returning typed empty/zero values. Existing `compute_project_vendor_summary` extended to populate the 4 new row fields with None/0 defaults.
- Frontend tab decomposition: `ExternalCostsTab.tsx` (620 LOC) split into 3 sibling files (`ExternalCostsKPIStrip.tsx`, `VendorBreakdownTable.tsx`, `CategoryBreakdownTable.tsx`); tab shrinks to a thin orchestrator owning shared filters (category, role) + role catalogue.
- Stub files for `ExternalCostsMonthlyGrid.tsx` and `ExternalCostCell.tsx` so Teammate B has clean creation surfaces.
- `types/api.ts` — new types pinned to the contract: `ExternalCostStatus`, `ExternalCostMonthlyCell`/`Item`/`Response`, `ExternalCostsKpis`. Extended `ProjectVendorSummaryRow` with the 4 new optional fields.
- `api/endpoints.ts` — new client function `externalCostsApi.getProjectExternalCostsMonthlyGrid(projectId, year?, roleTypeId?, category?)`.
- Dedupe `DEMO_DATE` — exported from `lib/yearColumns.ts`; `MixedGranularityGrid.tsx` imports instead of redeclaring.

**Teammate A — KPI strip + vendor table enhancement (`127caa2`, 1 commit, 137/19 LOC):**
- `ExternalCostsKPIStrip.tsx` — extended from 4 to 6 KPIs: Total Forecast / Actuals YTD / **Open POs (now currency, was count)** / **Remaining Not Invoiced** (NEW) / **Accruals** (NEW) / Variance vs Baseline. Layout `grid-cols-2 md:grid-cols-3 lg:grid-cols-6`.
- `VendorBreakdownTable.tsx` — added 4 new sortable columns: Contract reference / Contract end (formatted `MMM YYYY`) / Open PO / Remaining not invoiced. Extended `SortKey` union, refined default sort direction (text columns asc, numeric columns desc), bumped empty-state colspan 9→13. Added local `formatContractEnd` helper.

**Teammate B — Monthly grid frontend (`008b2d6`, 1 commit, 842/25 LOC):**
- `ExternalCostsMonthlyGrid.tsx` (NEW, 769 LOC) — vendor-by-month grid sitting between the KPI strip and vendor table. Owns its own data fetch via `getProjectExternalCostsMonthlyGrid`; refetches on roleFilter / year change. Sticky-left vendor name column, **multi-column sticky-right band** (Role / PO # / Contract end / Status / Open PO) — NEW pattern for the codebase, hard-coded width offsets summing to ~510px with cumulative `right` styles + bg-card backgrounds. Year columns expand/collapse via `useCollapsibleMixedYears` (current year expanded by default); collapsed years render as a single sum cell. Section dividers emit uppercase muted category headers. Row expansion shows delivery_schedule + invoice_history side-by-side `<dl>` blocks. EmptyState fallback when payload is empty.
- `ExternalCostCell.tsx` (NEW, 101 LOC) — 4-line stacked currency cell (Forecast / Actuals / Accrual / PO-Obligo) with temporal-context visibility rules (past = all 4 / current = all non-null / future = forecast + PO-obligo only). Skips null/zero. Empty cell renders muted `—`. Uses `formatCurrencyCompact` for cell density.
- Reuses `ExternalCostStatusBadge.tsx` from forecast/ as-is — already supported all 6 spec statuses.

**Teammate C — Backend aggregation + seed top-up + tests (4 atomic commits):**
- `e3d4cda` — `compute_project_monthly_grid` aggregation: groups Forecast/Actuals rows by `(vendor, sub_category, po_number, role_type_id)`; per-cell forecast/actuals/accrual/po_obligo from the new columns (omits zero); per-cell status from `Forecast.ext_status`; line-level status = latest non-null past-month status; `open_po`, `remaining_not_invoiced` clamped at 0; `delivery_schedule` + `invoice_history` loaded from new tables. KPI math (`compute_project_external_kpis`) replaces the placeholders. Vendor-summary extended to populate the 4 new row fields. Reuses `_load_role_names`, `_load_cost_type_names` helpers. New `_demo_date(db)` helper resolves the canonical demo "today" with PlanningParameter fallback.
- `c75788a` — per-PO clamping fix for KPI + vendor `open_po` (a fully-invoiced PO doesn't subsidise an under-invoiced PO in aggregate).
- `532cd1f` — seed top-up: populates `po_amount`/`accrual_amount`/`invoiced_amount`/`contract_end_month` on existing rows; adds rows with the new `open` status (1 line on Accenture PO-2026-9000 / Master Data Hub Rollout); inserts `external_cost_deliveries` (2–4 per PO) and `external_cost_invoices` (1–3 per PO). PO numbers in `PO-{YYYY}-{NNNN}` format; contract end dates distributed `2026-06`/`2027-03`/`2027-09`/`2028-06`. Generated by `backend/seed/generate_seed_v5/s21_v5_1_external_costs.py` (Python helper).
- `885d33a` — tests: 14 new in `test_external_cost_monthly_grid.py` (basic shape, cell zero-omission, role/category filters, status per cell + per line, open_po arithmetic, delivery + invoice presence) and `test_router_external_costs.py` (KPI block, contract reference / contract end / open_po / remaining_not_invoiced, status remap canary).

**Integration:**
- Merged C → A → B in sequence on `feat/v5_1-external-costs-grid`. No conflicts.
- Backend pytest: 1547 passed (Wave 4 baseline 1533 + 14 new from Teammate C).
- Frontend tsc: 0 new errors in touched files; pre-existing baseline errors (`OrgDetailItem` unused export in `endpoints.ts`) unchanged.
- Visual verification: 4 screenshots saved to `qa/screenshots/wave-5-c09/` (default view + light, row expansion, dark mode). All 6 KPIs populate (Forecast €417K / Accruals €81K / Open POs €8K / Remaining Not Invoiced €5K / etc. for `proj-mdh-rollout`). Monthly grid renders 5 lines across 4 categories with proper stacked cells, sticky-right metadata, status badges (including the new `open` status on Accenture PO-2026-9000), expansion drawer showing delivery + invoice content. Both light and dark themes render cleanly.

**DB ritual:** schema change requires `rm backend/creta_demo.db` after pulling the branch (no Alembic). Wave 5 is the second wave to add columns to existing tables; PR description should call this out.

**Out of scope (deferred):**
- Portfolio-scoped external cost endpoints (`portfolio/external-costs/*`) — already exist, not touched by C-09.
- Refactoring `ForecastCell.tsx` into a generic line-builder — Wave 5 budget is tight; copy patterns instead.
- Lifting `MixedGranularityGrid`'s sticky/colgroup machinery into a shared util — worth revisiting if a third grid surface appears later.

## v5.1 Wave 4 — Role FK + row expansions (2026-05-06)

Branch: `feat/v5_1-roles-and-expand`. Closes spec items C-05 (internal-resource F&P grid row expansion → per-employee sub-rows), C-06 (external-resource expansion → per-vendor/PO/role sub-rows), and C-07 (nullable `role_type_id` FK on external cost line items, F&P grid label `[Category] — [Role Name]`, External Costs tab Role column + filter, Capacity heatmap External row with FTE-equivalent). Built via the proven 1+3 agent-team split: lead pre-work commit + 3 teammates working in parallel isolated worktrees with disjoint file ownership.

**Lead pre-work (`5b7ee35`):**
- `models/financial.py` — added nullable `role_type_id` FK to all three of `Baseline`, `Forecast`, `Actuals` (symmetric with `vendor`/`ext_status`; per user answer: all three tables, not just Forecast).
- `services/forecast_versioning.py::build_mixed_grid` — added two kwargs in the established `include_baseline_actuals` style: `include_person_breakdown: bool = False` and `include_vendor_breakdown: bool = False`. Default False so `capture_version` snapshots stay byte-identical to Wave 3 (regression-tested). Stub `_collect_person_breakdown` + `_collect_vendor_breakdown` declared at the top of the file with empty-payload returns so teammates fill bodies without touching the call site.
- `services/calculations.py::resolve_hourly_rate(db, role_type_id, competence_center_id, month)` — centralised the latest-effective-on-or-before lookup that workbench routers had inline. Falls back to `DEFAULT_HOURLY_RATE` (€120) when no row matches.
- `schemas/workbench.py` — `GridSubRow` Pydantic model with internal-side and external-side discriminator fields; `GridRow` gains optional `sub_rows` and `role_name` (only set on external rows when uniquely derivable per C-07).
- `schemas/capacity.py` — `ExternalCapacityRow` + `RoleHeatmapRow.external` for the C-07 capacity 'External' badge.
- `routers/workbench.py` — F&P grid endpoint exposes `include_person_breakdown` + `include_vendor_breakdown` query params (default True).
- `seed/generate_seed_v5/s13_financials.py` — column tuples extended for all three financial tables; external rows pick up an optional role from `PROJECT_EXTERNALS[].role` (Teammate B owns the actual assignments).
- `seed/seed.sql` regenerated against the new column tuples.
- Frontend `types/api.ts` — `MixedGridSubRow` + `MixedGridRow.sub_rows` + `role_name`; `ExternalCapacityRow` + `RoleHeatmapRow.external`.
- Frontend `MixedGranularityGrid.tsx` — `expandedRows: Set<string>` state, `toggleRow` callback, ChevronRight in `renderRow` (only when `row.sub_rows` non-empty), `renderSubRow` helper, `Fragment`-wrapped row maps so sub-rows emit immediately under expanded parents. Refactored `getDisplayCell` into `getDisplayCellFromCells(cells, col)` so sub-rows reuse cell-rendering logic without touching `ForecastCell`.
- 6 new pre-work tests (3 in `test_calculations.py::TestResolveHourlyRate`, 3 in `test_forecast_versioning_service.py::TestBuildMixedGridSubRowsDefault`).

**Teammate A — C-05 (`23b2c86`):**
- Implemented `_collect_person_breakdown` body in `services/forecast_versioning.py`. Queries `Allocation` joined to `Person` and `CostCenter`, groups by `person_id`, computes EUR per cell via `resolve_hourly_rate`. Quarterly cells sum per-month EUR (rates can shift mid-quarter, so quarter-hours × single-rate would mis-price). Sub-row label = person name; sub_label = cost center name; sorted by descending row_total.
- Backend embeds person.name into `GridSubRow.label` so the lead-installed `renderSubRow` consumes it as-is — Teammate A touches **zero frontend files**.
- 8 new tests (6 service-level + 2 router-level) covering: column-sum invariant, effective-date rate lookup, quarterly summation correctness, flag-off byte-identity, lookback compatibility, sort order, end-to-end via `/forecast/grid` query param.

**Teammate B — C-06 + C-07 frontend + seed (`0efbe12`, `c6f93f5`, `552d0a9`, `591e811`):**
- Implemented `_collect_vendor_breakdown` body. Groups by `(vendor or 'Unspecified', po_number or None, role_type_id or None)`. EUR-only cells (no hours). Three-source consistency (baseline/forecast/actuals overlays when `include_baseline_actuals=True`). Parent `role_name` derivation: when all contributing line items share a single non-null `role_type_id`, populate; otherwise None (mixed-roles fallback per C-07 spec / user answer).
- `services/external_cost_aggregation.py` — denormalised `role_type_id` + `role_name` into each `ProjectVendorSummaryRow` via a new `_load_role_names` helper; added optional `role_type_id` filter param.
- `routers/workbench.py` — threaded `role_type_id` query param into `/external-costs/vendor-summary` and `/external-costs/category-rollup`.
- `seed/generate_seed_v5/config/financials.py` — added 5 role-tagged consulting line items: Accenture/MDH (role-sr-arch), Thoughtworks/MDH (role-data-eng), Deloitte/ERP2 (role-sr-arch), Thoughtworks/Sensor (role-data-eng), McKinsey/PredMaint (role-data-sci). The two roles on MDH exercise the C-07 mixed-roles fallback.
- `MixedGranularityGrid.tsx` — single ternary at the row label: when `row.role_name` is set, renders `${baseLabel} — ${row.role_name}`; otherwise `baseLabel`. (Lead's chevron + sub-row infra is reused untouched.)
- `ExternalCostsTab.tsx` — Role column between Cost-type and Forecast (sortable), Role filter chip mirroring the existing category filter pattern; driven by `/api/reference/roles`.
- 11 new tests covering: vendor breakdown (4 in `TestVendorBreakdown`), role denormalisation in aggregation (4 in new `test_external_cost_aggregation_role.py`), seed assignments (2 in new `test_seed_role_assignments.py`), router query-param threading (1 in `test_router_forecast_grid.py`).

**Teammate C — C-07 capacity External badge (`04fb88d`, `f315287`, `c36ff05`):**
- `routers/capacity.py::compute_external_role_rows()` — aggregates `Forecast.category='external' AND role_type_id IS NOT NULL` per role × month, scoped to projects the cost-center's people are allocated to. FTE-equivalent = `amount_eur / resolve_hourly_rate(role, None, month) / FTE_HOURS`. Roles without external spend in the window stay `external=None`.
- `_compute_org_role_external_summary()` — lightweight `{count, total_fte}` roll-up for the OrgHeatmap `pivot=role` branch.
- `schemas/capacity.py::OrgExternalSummary` + `OrgHeatmapRow.external_summary` (only populated on `pivot=role`).
- `TeamHeatmap.tsx` injects a synthetic External child row inside each role group when `role.external` is non-null. `OrgHeatmap.tsx` renders a `+ N.N External` Badge per role row when `external_summary.count > 0`. `HeatmapGrid.tsx` and `UtilizationCell.tsx` learned `cellFormat='fte'` (renders `1.5` instead of `1%`), `isExternal` flag, and per-cell `title` tooltips for the FTE-equivalent formula.
- 4 new tests in `test_router_capacity.py::TestC07ExternalBadge` — synthetic-fixture-driven (don't depend on Teammate B's seed): row presence when external role assignment exists, FTE arithmetic correctness (€19,200 / €120/h / 160h = 1.0), absence when no role assignment, multi-vendor aggregation per role.

### Integration

Lead merged Teammate A first (clean ort merge, no conflicts). Teammate C merged second (clean — disjoint files in capacity domain). Teammate B last; two trivial conflicts in test files where both A and B updated the lead's pre-work test (`test_flags_on_attach_sub_rows`) and added new test classes back-to-back (`TestPersonBreakdown` + `TestVendorBreakdown`). Resolved by combining the docstring + assertion of the shared test (now covers both collectors live) and concatenating the two test classes into adjacent sections. Router test had A's `_make_project_with_person_allocations` helper + 2 person-breakdown tests + B's vendor-breakdown test — all kept.

Post-merge polish: caught a small visual bug during integration verification — sub-row sticky-left cell used `bg-muted/30` (30% opacity), so past-month columns scrolled behind the label and bled through. Single-character fix to `bg-muted` (opaque) (`e5ec7d5`).

### Verification

- **Backend pytest:** 1510 (Wave 4 baseline post-pre-work) → **1533 passing** on the integrated branch (+23: 6 lead + 8 A + 11 B + 4 C, with one pre-work test rewritten by B since the stub assertion no longer holds once the body is implemented). Full suite re-run from a fresh-DB seed.
- **Frontend tsc:** `npx tsc --noEmit` clean.
- **DB ritual:** confirmed `rm backend/creta_demo.db && python main.py` auto-seeds correctly. Backups saved as `creta_demo.db.preW4-leadprework` and `creta_demo.db.preW4-postmerge` alongside existing `.preS1` / `.preWAVE3`.
- **Visual (Anna Meier / Controller):**
  - F&P grid on `proj-erp2`: `Senior Developer ▼` parent → expanded sub-rows for Lena Fischer (MUC / Application Development) and Rajesh Patel (PUN / Application Development) with hours + EUR per month. Consulting row label shows `Consulting — Senior Solution Architect` (single role: Deloitte). Light + dark themes both render cleanly.
  - F&P grid on `proj-mdh-rollout`: Consulting label stays `Consulting` (mixed-roles fallback active), expanded sub-rows show `Accenture · Senior Solution Architect · No PO` and `Thoughtworks · Data Engineer · No PO` with sums (12k + 6k = 18k) verifying the column-level invariant.
  - External Costs tab on `proj-erp2`: Role column visible between Cost-type and Forecast; Deloitte row shows "Senior Solution Architect", others show "—"; "All roles" filter dropdown active. Sortable.
  - Capacity heatmap (MUC / Application Development): Senior Solution Architect role group includes Thomas Brenner (internal, 25% / 50% / 25%) plus an **External** synthetic row with **External** badge showing FTE-equivalents `1.9 1.9 1.9 1.9 1.9 1.9 0.7 0.7 0.7 0.0 0.0 0.0` across the months. Outsourcing-ratio context exactly as the spec calls for.
  - Screenshots: `qa/screenshots/wave4-erp2-fp-internal-expanded-dark.png`, `wave4-mdh-fp-consulting-expanded-dark.png`, `wave4-mdh-fp-consulting-expanded-light.png`, `wave4-erp2-fp-consulting-role-label-dark.png`, `wave4-erp2-external-costs-tab-role-column-dark.png`, `wave4-erp2-external-costs-tab-vendor-table-dark.png`, `wave4-capacity-external-badge-dark.png`, `wave4-capacity-external-badge-light.png`, `wave4-prework-erp2-fp-grid{,-dark}.png`.
- **Live API spot-check:** `/forecast/grid?include_person_breakdown=true&include_vendor_breakdown=true` returns sub_rows on internal + external rows with discriminator fields populated; flag-off matches Wave 3 shape exactly.

### Open / deferred

- **Sub-row baseline/actuals overlays for internal rows.** C-05 sub-rows are forecast-only — three-point overlays on per-employee cells would require Allocation × Baseline / Allocation × Actuals joins that the seed doesn't currently express. Acceptable for Wave 4 scope (spec only required per-month hours + EUR on the sub-rows). Future enhancement: add baseline_/actuals_ overlays to the per-employee aggregator if demo feedback wants the three-point stack on sub-rows too.
- **OrgHeatmap external row (vs. chip).** OrgHeatmap shows a lightweight `+ N.N External` Badge per role group; full external row (like TeamHeatmap) deferred. The OrgHeatmap is a roll-up surface and the chip-only treatment is consistent with its visual density.
- **No external location attribution.** External Forecast rows have no Person → CostCenter → Location chain. The Capacity External row uses the project's primary location implicitly (or "—"). If demo feedback wants location splits for external resources, that's a follow-on aggregation change.
- **`_make_project_with_forecast` helper convention.** Teammate B's vendor-breakdown router test reuses the `_make_project_with_forecast` helper; Teammate A's person-breakdown test added `_make_project_with_person_allocations`. Both share the same test class; if a future test wants both surfaces, the two helpers compose.
- **PR description must call out DB ritual.** `rm backend/creta_demo.db` is required before testing this branch (no Alembic). Wave 4 is the first wave that adds a column to existing tables (Wave 1–3 only added rows / new tables). PR title + description should highlight this prominently.

## v5.1 Wave 3 — Phase highlighting + comparison chart (2026-05-05)

Branch: `feat/v5_1-phase-and-chart`. Closes spec items C-03 (milestone phase highlighting in the F&P grid) and C-04 (three-point comparison chart below the F&P grid), plus the Wave 2 deferred follow-up "past months are not in the live grid columns" — fixed by a backend pre-work commit so C-03 + C-04 render against the full timeline rather than just the future window. Built via 1+2 agent-team split: lead did a backend pre-work commit, then 2 teammates worked in parallel on disjoint files in isolated worktrees.

**Lead pre-work — backend lookback parameter (`189413e`):**
- Extends `services.forecast_versioning.build_mixed_grid` with `lookback_months: int | None = None`. When set and `> 0`, the inner monthly window starts at `add_months(demo_date, -lookback_months)` instead of `demo_date` — the forecast filter, `monthly_months` generation, and the `monthly`/`quarterly` granularity branches all use the new `lookback_start` lower bound. Past zone is always monthly: quarterly outer-zone semantics for the future are untouched, and `_first_quarter_start(boundary_month)` still drives the `quarterly_keys` list. `include_baseline_actuals=True` already had no lower bound on its baseline / actuals queries, so the C-08 overlay series light up automatically for the new past-month columns.
- Wires the parameter through `GET /api/projects/{id}/forecast/grid` as a bounded `lookback_months: int = Query(default=12, ge=0, le=36)` query param. Default 12 covers the prior calendar year of actuals; `0` reverts to the v5 column model. `capture_version()` does not pass the kwarg, so ForecastVersion snapshots stay forecast-only and byte-identical to v5.
- 13 new tests: 7 service-level (`TestBuildMixedGridLookback` — default-starts-at-demo, lookback=0 ≡ default, three past columns, three-series past cells, overrun visible, no-quarterly-past, capture_version snapshot still post-demo) + 6 router-level (default lookback renders past, lookback=0 starts at demo, lookback=3 yields three past months, past cells carry actuals overlay, lookback>36 → 422, negative lookback → 422). Backend pytest: 1491 → 1504, all passing.

**Teammate A — C-03 phase highlighting (`worktree-agent-a642d…`, 3 commits):**
- `9da14df` — Add `PhaseStrip` component + `phaseHelpers.ts` (~490 LOC). Phase mapping helpers project milestone date ranges onto column keys (monthly, quarterly, expanded-quarter monthlies); month-level overlap detection picks the dominant phase by month coverage when a column straddles two phases.
- `b41ca66` — Wire milestone fetch via `milestonesApi.getMilestones(projectId)` into `MixedGranularityGrid`. New `useMemo` builds a `Map<columnKey, { color, phaseId, phaseName }>` for tinting lookup; on milestone fetch failure the strip silently degrades.
- `10290c6` — Render the phase strip + per-column tinting + scroll seam. Strip is a third sticky `<TableHeader>` row at `top-20` (sitting below year `top-0` and month `top-10` rows). Per-column tinting applied via a `<colgroup>` with `<col style={{ backgroundColor }}>` — keeps `ForecastCell` untouched (Wave 2 ownership rule); existing cell-level backgrounds (boundary blue, hasChange amber, isQuarterly blue, sticky labels) naturally mask the tint. Slip indicator: gray triangle at the trailing edge for no-slip phases; for slipped phases the triangle is anchored at the proportional baseline position with a thin red line connecting it to the segment's right edge. Tooltip shows precise `baseline_end` / `forecast_end` / `slip_months`. Adds `scrollContainerRef?: RefObject<HTMLDivElement | null>` prop attached to the existing scroll wrapper for the C-04 lockstep seam.

**Teammate B — C-04 comparison chart (`worktree-agent-a67ee…`, 3 commits):**
- `f18643e` — Add `lookback_months` to `workbenchApi.getForecastGrid` so the chart can request the same past+future window the grid uses.
- `2099305` — Add `ForecastComparisonChart.tsx` (~1029 LOC). Monthly view: Recharts `<BarChart>` with three `<Bar>` series (baseline `#cbd5e1`, forecast `#3b82f6`, actuals `#059669`); custom dot via `Bar.shape` for past-month overrun (red marker where actuals > forecast); `<ReferenceArea>` for elapsed-month tint; `<ReferenceLine>` for TODAY (red dashed) and year separators. Cumulative view: `<LineChart>` with three lines + a red dashed `<ReferenceLine y={budgetCeiling}>` from total baseline. Phase strip rendered as a sibling `<div>` overlaid on the chart's data range using milestone-color segments (same palette family as C-03). Summary strip below chart: BASELINE / FORECAST / YTD ACTUALS / PLAN DRIFT / EXECUTION VARIANCE. Default scroll position centred on demo_date − 3 months. Bar `shape` prop and Recharts `tick` prop required `unknown` casts (consistent with existing workarounds in `ProgressVsBurnChart`).
- `06fc416` — Mount in `ForecastTab`. New `gridScrollRef = useRef<HTMLDivElement>(null)` shared between `MixedGranularityGrid` and `ForecastComparisonChart`. Bidirectional lockstep scroll listeners with `isMirroringRef` guard mirror `scrollLeft` between grid container and chart container; chart degrades gracefully when no `scrollContainerRef` is supplied.

### Integration

Lead merged Teammate A first (clean ort merge, no conflicts). Teammate B's branch contained a duplicate of the lead's pre-work commit (different SHA, byte-identical content) — git detected it as already-applied and merged the other three commits cleanly (no overlapping files between A and B). Post-merge cleanup: B had added a localised `// @ts-expect-error` directive in `ForecastTab.tsx` above the `scrollContainerRef={gridScrollRef}` prop while A's prop wasn't yet on the grid; lead removed the directive once the merged grid carried the prop.

### Verification

- **Backend pytest:** 1491 → 1504 (+13 lookback tests, all passing).
- **Frontend tsc (touched files):** 0 new errors. The two pre-existing baseline errors in `endpoints.ts` (unused `OrgDetailItem` export) and `ForecastTab.tsx` (`pending_cr` not on `ProjectMetadata`) are unchanged from `feat/v5_1-grid-foundation` HEAD.
- **Vite build:** succeeds (1.88 MB / 491 KB gzip), only pre-existing chunk-size warnings.
- **Visual (Anna Meier / Controller, ERP Integration Phase 2):**
  - F&P tab renders the phase strip below year + month headers; segments labelled "Build" / "Test" / "Rollout"; per-column tinting visible on Rollout months.
  - Past months Jan–Mar 2026 show the C-08 three-point stack (forecast primary, actuals partial, baseline tertiary) — the lookback follow-up is rendering as intended.
  - Apr 2026 (current) shows `(partial)` actuals indicator.
  - Comparison chart Monthly view shows three-bar grouped chart with red overrun dots on past months, TODAY line at Apr, phase strip aligned along the X axis, summary strip with BASELINE 2,2M€ / FORECAST 2,38M€ / YTD ACTUALS 1,02M€ / PLAN DRIFT +7,9% / EXECUTION VARIANCE 36,07k€.
  - Cumulative toggle renders three running-total lines + red dashed Budget Ceiling.
  - Lockstep seam verified: `gridScrollLeft = 600` propagates to chart scrollLeft (with proportional offset due to differing pixel-per-month between grid and chart).
  - Light + dark themes both render cleanly. Console: 0 errors during navigation.
  - Screenshots: `qa/screenshots/wave3-erp-fp-default.png` (dark, monthly), `wave3-erp-fp-cumulative.png` (dark, cumulative), `wave3-erp-fp-scrolled.png` (dark, lockstep), `wave3-erp-fp-light.png` (light, monthly), `wave3-erp-overview.png` (overview tab unaffected).

### Open / deferred

- **Phase tint opacity is louder than spec target.** C-03 spec calls for ~5–8% alpha on per-column tinting; the current implementation produces a more saturated tint (especially the Rollout phase pink in dark mode) — readable but visually heavy. Tweak in a polish pass: lower the `withAlpha()` cell-tint multiplier from ~7% to ~3–4%, or apply tint only to the strip row and skip the per-column tint on rows.
- **Chart-to-grid pixel alignment is approximate.** Chart uses fixed `PX_PER_MONTH = 90`; the grid's column widths are min-content driven (≥ 90px monthly cells per the grid's `min-w-[90px]` class) and don't necessarily match. Lockstep scroll mirrors `scrollLeft` 1:1, so the two surfaces drift slightly at large scroll offsets. Acceptable per the spec's "perfect alignment is not required as long as the chart roughly tracks the grid"; tighter alignment is a follow-up.
- **Phase strip slip-indicator pixel positioning is span-proportional**, not month-accurate, on quarter columns (true month-level introspection would have required wider helper changes). The hover tooltip carries precise dates, so the visual is directionally correct without deceptive precision.
- **Summary columns** (Baseline Total / Forecast Total / Actuals YTD / Variance) on the right edge of the grid still deferred from Wave 2 — not in scope for Wave 3 either. Suggested follow-up: add a dedicated `summary_columns` field to `MixedGridResponse` plus a sibling `<ForecastSummaryColumn>` component.

## v5.1 Wave 2 — F&P grid foundation (2026-05-05)

Branch: `feat/v5_1-grid-foundation`. Closes spec items C-02 (collapsible year columns) and C-08 (three-point baseline/forecast/actuals cell display) — the two infrastructure pieces every later F&P-grid wave builds on. Built via 1+2 agent-team split: lead did a pure-refactor pre-work commit extracting `ForecastCell` from `MixedGranularityGrid`, then 2 teammates worked in parallel on disjoint files.

**Lead pre-work (1 commit):**
- `394a84c` — Extract `ForecastCell.tsx` as a presentational component receiving pre-computed layout flags + display data. Pure structural refactor, no behaviour change. Sets up clean file ownership: C-02 edits the parent grid (column model), C-08 extends the cell component.

**Teammate A — C-02 collapsible year columns (`feat/v5_1-w2-c02`, 2 commits):**
- `29bd410` — New `useCollapsibleMixedYears` hook (parallel to the existing `useCollapsibleYears` so the 11 other v3-era callers keep working byte-identically). Operates on the mixed-granularity column-key list; defaults only the demo current year (2026) to expanded.
- `bc1ea18` — Wire the hook into `MixedGranularityGrid`. New `DisplayColumn` discriminator (`{ kind: 'data' | 'yearTotal' }`); `yearTotal` columns sum the year's underlying canonical cells inline and bypass `<ForecastCell>` so Teammate B's territory stays untouched. Year-label headers became chevron-prefixed buttons styled `text-blue-400`. January monthly + Q1 quarterly columns get the heavier left border + bold/darker label treatment via a new `isYearStartColumnKey` helper. Both header rows are now `position: sticky` (top-0 / top-10) inside an `overflow-auto` container with viewport-bound `max-h`.

**Teammate B — C-08 three-point cell rendering (`feat/v5_1-w2-c08`, 3 commits):**
- `0ed072b` — Backend payload extension. `MixedGridCell` schema gained 5 nullable fields (`baseline_hours`, `baseline_amount_eur`, `actuals_hours`, `actuals_amount_eur`, `actuals_partial`). New `include_baseline_actuals: bool = False` kwarg on `services.forecast_versioning.build_mixed_grid` — default off so version snapshots stay forecast-only and 1481 existing tests are unaffected. The forecast-grid router endpoint passes `True`; `capture_version` leaves it at the default. Lines that exist in baseline or actuals but not in forecast now create rows so the grid never drops planned-but-unforecasted lines.
- `c0d4ea5` — 10 new tests across `test_forecast_versioning_service.py` (7) and `test_router_forecast_grid.py` (3) covering quarterly aggregation of overlay series, partial-actuals on the demo current month, and absent-series fallback.
- `adacb90` — Frontend three-point stack. `ForecastCell` rewritten around a `temporalContext: 'past' | 'current' | 'future'` prop (default `future` preserves v4 callers). Past months: actuals (primary, bold) / forecast (secondary muted) / baseline (tertiary smaller). Current month: forecast (primary editable) / actuals italic with `(partial)` label / baseline. Future months: forecast (primary) / baseline (secondary). Internal-resource hours rows preserve the dual-unit hours-on-top / euro-below pattern within each line. Subtle warm tint (`bg-amber-50 dark:bg-amber-900/10`) marks past-month cells where actuals exceed forecast. Zero-everything cells short-circuit to a single em-dash. `MixedGranularityGrid` got a minimal wiring change: `getDisplayCell` threads the overlay fields through (with quarter-expansion division for synthesised sub-month cells), and a local `classifyTemporalContext` picks the layout — using the cell's `actuals_partial` flag as the authoritative "current" signal for quarterly cells that straddle the demo month.

### Integration

Lead merged Teammate A first (clean, ort strategy), then Teammate B with one trivial conflict on `MixedGranularityGrid.tsx` imports — both teammates touched the import block, resolved by union (`formatNumber` from A + `isElapsedMonth` + `CellTemporalContext` from B). Body-level changes auto-merged because Teammate B's modifications were structurally minimal and Teammate A's structural changes were in different code regions.

### Verification

- **Backend pytest:** 1481 → 1491 (+10 new C-08 tests, all passing).
- **Frontend tsc:** `npx tsc --noEmit` clean.
- **Vite build:** succeeds (1.86 MB / 485 KB gzip), only pre-existing chunk-size warnings.
- **Visual:** Teammate A captured 4 screenshots (default state, 2027 expanded as "non-current year toggled" stand-in, outer-zone year expanded into quarters, dark theme). Teammate B captured 7 (current-month partial, future-month two-point, hours-row stacking, full grid, dark theme). All under `qa/screenshots/wave2-c0[28]-*.png`.

### Open / deferred

- ~~**Past months are not in the live grid columns.**~~ Fixed by the Wave 3 backend pre-work commit (see Wave 3 section above): `build_mixed_grid` now accepts `lookback_months` and the F&P grid endpoint defaults it to 12, so the past-month three-point layout and the warm-tint overrun rendering have data to land on.
- **Summary columns (Baseline Total / Forecast Total / Actuals YTD / Variance) deferred.** The C-08 spec calls for these on the right edge of the grid, with the variance column applying green/red/blue delta colours. Implementing them cleanly would have required a new column kind in the column model (Teammate A territory) plus updates to `renderSubtotalRow` and the column header rows, which would have broken the disjoint-file-ownership rule. Suggested follow-up: add a dedicated `summary_columns` field to `MixedGridResponse` plus a sibling `<ForecastSummaryColumn>` component.
- **External-cost vendor/PO context not threaded into actuals overlays.** `Baseline` and `Actuals` rows for external categories carry `description` / `vendor` / `ext_status`; the C-08 overlays only carry numeric series. If the UI needs vendor context for the historical actuals series too, that's a small additional payload extension. Likely revisited as part of Wave 4 (C-06 vendor row expansion) or Wave 5 (C-09 external-costs grid overhaul).

## v5.1 Wave 1 — bug-fix + seed-expansion batch (2026-05-05)

Branch: `fix/v5_1-batch-1-bugs-and-seed`. Closes the v5.1 spec's Phase 1 (bug fixes A-01..A-05) and Phase 2 (seed enrichments B-01, B-02). Built via 4-teammate agent team in isolated worktrees:

- **Teammate A** (`fix/wave1-nav-bugs-a`, 3 commits) — three navigation regressions:
  - **A-01** Run Portfolio back: persist typeFilter to sessionStorage and capture window.scrollY at entity drill-in; hydrate filter on remount and restore scroll once the table renders. Filter + scroll preserved on round-trip; fresh visits start clean.
  - **A-02** Backlog "Back to Backlog" from non-default tabs: tab transitions in `BacklogProjectDetailPage.setTab` were defaulting to `setSearchParams` history-push, stacking entries. Fix: `setSearchParams(..., { replace: true })`.
  - **A-04** Portfolio External Spend back-to-Dashboard crash: `PortfolioOverview` held local `activeTab`/`subModule` state alongside `location.pathname`, so during a transition `DashboardTab` could mount under `/portfolio/external-spend` and its legacy `/portfolio/<projectId>` redirect (with a `RESERVED` set that doesn't include `external-spend`) would push `/portfolio/project/external-spend` and crash. Fix: derive both pieces of state directly from `location.pathname` on every render.

- **Teammate B** (`fix/wave1-a03-a05-frontend`, 2 commits) — chart legibility + Charging frontend audit:
  - **A-03** Variance Waterfall column overlap: `<XAxis>` got `angle={-45}`, `textAnchor="end"`, `height={70}`; chart bottom margin 16→64. Single change covers both the Workbench Overview tile and `VarianceWaterfallDialog`. Verified light + dark.
  - **A-05** (frontend half) Charging access policy: audit found there was never a frontend role gate on `/charging` — module mounts for all four personas already. The "only Executive can access" symptom was actually backend (Teammate C's territory). Added an explicit access-policy docblock + a `TODO [A-05]` for threading `readOnly` into the four Charging sub-views to hide mutation buttons for non-Controllers (deferred per the bullet above).

- **Teammate C** (`session/a05-charging-access-control`, 2 commits) — backend role gate audit:
  - **A-05** (backend half): The `/api/charging/*` endpoints were already correctly gated. The actual mis-gating lived on `/api/admin/*` charging master-data — country / region / charging-location / legal-entity / chargeable-entity / rollup-cache-status reads were `require_role("controller")` so all non-controllers got 403 on the very GETs the Charging UI calls during initial load. Reads opened to all four roles; mutations (POST/PUT/PATCH/DELETE) remain `controller` only.
  - New `backend/tests/test_charging_access_control.py` parametrises 22 reads × 4 personas + 28 mutations × 3 non-controller personas + 4 controller spot-checks (177 assertions). Two existing test cases that asserted "PL forbidden on read" updated to "PL allowed on read; PL forbidden on mutation."
  - Pytest: 1303 → 1481 (+178 net). Two follow-ups noted: PL/CC per-row scoping for non-controller reads needs new infrastructure (`pl_project_filter` only handles `Project` subtype today, not Offerings / InternalServices; no `cc_filter()` dependency exists yet for ChargeableEntity).

- **Teammate D** (`worktree-agent-a20da883bbf5a6320`, 1 commit, +1904 LOC seed.sql) — backlog density and multi-year horizons:
  - **B-01:** 18 new DoI 0–2 projects (target was 15–20). DoI 0–2 pipeline now totals 22 projects: 7 Proposed (DoI 0), 9 Under Evaluation (DoI 1), 6 Under Evaluation (DoI 2). Composite-score distribution clusters 12 projects in the 3.2–3.8 reorganisation zone; 4 projects below 3.1 are clearly below-cutoff. T-shirt spread XS=2 / S=5 / M=9 / L=5 / XL=1 maximises cube-view cell coverage. 10 T2-level projects ensure the cube view has T2 density. Each new project carries a `chargeable_entity` row, `grouping_assignment`, all 6 Tech Navigator subscores, `pipeline_stage` + `doi`, and 2–3 milestones.
  - **B-02:** 4 flagship projects extended to Jan 2024 → Dec 2029 with non-overlapping ranges:
    - `proj-erp2`: 2024-07 → 2029-12 (actuals through 2026-04)
    - `proj-mdh-rollout`: 2024-01 → 2029-12 (actuals through 2026-04)
    - `proj-connveh`: 2026-10 → 2029-12 (future-only project, no actuals)
    - `proj-railsafety`: 2024-01 → 2029-12 (actuals through 2026-04)
  - 724 outer-zone forecast rows marked `is_provisional=1` (months outside the Oct 2025 – Sep 2027 inner zone) so Wave 2's collapsible-year + provisional-marker work has data to render against.

### Doc reorg (lead, 1 commit at branch start)
- `guides/CRETA_v5_Workshop_Spec.md` and `guides/CRETA_v5_Implementation_Guide.md` moved to `docs_archive/` (note: `guides/` is gitignored, archived versions are tracked).
- v5.1 self-contained spec now at `guides/CRETA_v5_1_Change_Specification.md` (gitignored — local working spec, matches existing convention).
- `CLAUDE.md` "v5 Implementation Protocol" section updated to "v5.1 Implementation Protocol" pointing at the new spec.
- This wave checklist added to PROGRESS.md.

### Verification
- Backend: pytest 1481/1481 passing on the integrated branch (was 1303 baseline pre-Teammate-C).
- Frontend: `npx tsc --noEmit` clean (0 errors, baseline preserved).
- Seed: Teammate D verified `validate.py` 8/10 (2 expected: draft B-01 projects without baselines yet, pre-existing staff-rate issue).
- Visual: Teammate B captured A-03 (waterfall light + dark) and A-05 (Charging across all 4 personas). Teammate A could not capture A-01 / A-02 / A-04 screenshots because Playwright/Chrome MCP was not exposed in the spawn environment — these are deferred to live PR review.

## Number-formatting consolidation sweep (2026-05-05)

Branch: `fix/number-formatting-sweep`. Audit of frontend number-rendering surfaced a locale-correctness bug and ~30 hand-rolled European-formatting patterns reinventing what `lib/formatters.ts` already provided. Sweep brings everything onto the central utility.

Changes:
- **`lib/formatters.ts`** — extended `formatPercent(value, options?: { signed?: boolean; decimals?: number })` (default `signed: true`, `decimals: 1` — backwards-compatible with the existing 51 call-sites). Added `formatDecimal(value, decimals)` for unitless European-decimal numbers (scores, FTE). Removed `formatCurrencyDetailedDelta` (only 4 call-sites in `Phase4Review.tsx`, replaced with inline `+`-prefix + `formatCurrencyDetailed`).
- **`.toLocaleString()` cleanup** — 9 number-formatting sites across 7 files swept onto `formatNumber`. Notable bug fix: `ResourceSummaryTable.tsx` was calling `.toLocaleString()` with no locale, falling back to the browser default — broken on non-DE browsers. Date-formatting `.toLocaleString('en-GB', {...})` calls left alone (intentional ISO-style date display, separate concern).
- **`.toFixed().replace()` cleanup** — 17 hand-rolled percentage / score sites swept onto `formatPercent` (with `signed: false` for share/portion percentages) or `formatDecimal`. Local `fmtScore` / `fmtPct` helpers in 7 files now delegate to the central utility instead of duplicating the regex pattern. Local `fmtEur` helpers in `EntityWorkspace.tsx` and `RunPortfolioTab.tsx` (functionally identical to `formatCurrency` modulo a null-guard) now call through. `fmtBudget` helpers in backlog `RankedRow` / `DetailHeader` deliberately preserved — they use verbose dotted-thousands (`€50.000`) below 1M instead of the `K` abbreviation, a separate UX choice.

Verification: `npx tsc --noEmit` clean; visual spot-check across `/backlog` (scores), `/portfolio` (KPI strip), `/simulator` impact dashboard (percentages + delta arrows) at 1440px in dark mode — all numbers render correctly with European separators.

## Documentation Hub v5 sweep + Changelog tab (2026-05-05)

Branch: `feat/docs-v5-sweep-and-changelog`. The in-app `/docs` hub had drifted from the v5 implementation — Module Guides, FAQ, and the new Charging manual were already current, but Overview was missing 3 modules (Backlog, Charging & Allocations, Documentation Hub itself), the Data Model tab was almost entirely v4, the API Reference's `TAG_ORDER` listed v4-era tags that don't exist in the live OpenAPI spec (so v5 endpoint groups silently appended at the bottom), and there was no Changelog surface at all. This commit set closes those gaps and adds a Changelog tab.

Shipped:

- **New 6th tab — Changelog.** Backend: `backend/seed/fixtures/changelog/changelog.json` holds the v5 entry as 16 sections covering the 7 headline shifts, the Master Data Hub flagship narrative, the two new modules, per-module v5 deltas, the persona update, the seed reconstruction, and the May 2026 demo polish. Loader extends `app.state.fixtures` with a `'changelog'` key; new `GET /api/docs/changelog` mirrors the `/modules/all` and `/faq/all` shape. Frontend: `ChangelogTab.tsx` renders version-grouped sections (`renderMarkdownBold` on each line), wired into `DocumentationHub.tsx` as the 6th `<TabsTrigger>`. Types + `docsApi.getChangelog()` co-located with the existing manual / FAQ types.
- **OverviewTab modules list** extended to the full 10-module v5 set: Backlog, Charging & Allocations, Documentation Hub added; existing module descriptions refreshed to mention v5 surfaces (Change vs Run, mixed-granularity grid, BTC tab, configurable hierarchy, etc.).
- **Module Guides** got a new `backlog.json` manual (7 sections) covering the v5 Backlog module — Cube vs List views, Tech Navigator scoring rubric, pipeline + DoI lifecycle, within-cutoff ranking, send-back/resubmit, AI Council gate, role-based access.
- **API Reference TAG_ORDER** comprehensive refresh — the v4 names (`'Scenarios'`, `'Reports'`, `'Global & Launchpad'`) didn't match the live OpenAPI tags. Replaced with the actual 25 tag set ordered by module: top-level user-facing modules first, then sub-categories (Tech Navigator, Pipeline, Project Milestones, Progress Tracker, Forecast Versions, External Costs, Charging) and admin governance (Workflow Templates, Scheduled Changes, Intake, Audit). All endpoint groups now sort to a logical position rather than appending alphabetically at the bottom.
- **Data Model tab** rebuilt around v5 entities — 9 grouped sections (Cost-allocation root, Stage 1 distribution, Stage 2 BTC + rollup cache, Charging master data, Configurable hierarchy, Lifecycle + scoring + progress, Scenario execution audit, Admin & governance, Carried over from v4) with ~30 entity definitions. **Leading callout** (primary-tinted card) explains the v5 hierarchy redesign — `LineOfBusiness` and `Programme` master tables retired in favour of a configurable n-level node graph (`GroupingEntityType` / `GroupingEntity` / `GroupingHierarchy`); controllers can rename or add levels from Admin → Hierarchy without a code change. ER diagram redrawn with two parallel flows (configurable hierarchy on the left, polymorphic ChargeableEntity → Distribution → BTCProfile → BTCProfileLine → ChargingLocation → LegalEntity on the right, with `RollupCache` layered on top and `ForecastVersion` as the immutable history strand attached to Project). `SEED_SUMMARY` refreshed to v5 S1 counts.
- **FAQ** got 3 new v5 entries (`faq-v5-16` end-to-end Stage 1 + Stage 2 cost flow, `faq-v5-17` audit log category filter, `faq-v5-18` rollup map level-4 drill). The audit understated existing v5 coverage — the FAQ already had `faq-v5-04..15` from prior waves, so only the gaps to recent surfaces (Master Data Hub end-to-end story + the new audit + the just-shipped Item 10 panel) were filled.
- **TopBar Docs button** bundled in (formerly PR #75): `BookOpen` icon button between the Help button and the Role switcher, navigates to `/docs`. The E7 Launchpad redesign had previously dropped all module-tile navigation, leaving the Documentation Hub unreachable from the UI; with this PR the upgraded hub ships with a discoverable nav path on the same release.
- **Repo cleanup**: removed 14 tracked `w5-b2-t3-*.png` screenshots that had been accidentally committed at the repo root, plus 18 tracked `.playwright-mcp/` session artefacts; established `qa/screenshots/` as the canonical directory for visual-verification screenshots (gitignored, with a tracked `.gitkeep`); `.gitignore` extended to also exclude `.playwright-mcp/` and `.claude/worktrees/` so future MCP / agent-team sessions don't reproduce the clutter. Memory entry `feedback_screenshots_location.md` added so future sessions default to `qa/screenshots/<name>.png`.

Merged via PR #76.

Verification: `npx tsc --noEmit` clean; backend smoke test on the new endpoint returns the fixture; visual walk through all 6 tabs at 1440px in both themes (Anna Meier persona). Light-mode screenshots `docs-sweep-{01..07}-*.png` cover Overview / Module Guides → Backlog manual / API Reference / Data Model / FAQ / Changelog. Dark-mode screenshot `docs-sweep-08-changelog-dark.png` confirms the Changelog tab uses semantic tokens correctly.

## Demo polish — Item 10: Rollup map level-4 drill-down (2026-05-01)

Branch: `feature/rollup-map-location-drill`. Closes the last open item in `docs/followups/demo-polish-followups.md` — clicking a charging-location bubble on the rollup map (after drilling into a country) now opens a side panel with the per-location BTC-weighted breakdown.

- **New backend endpoint**: `GET /api/charging/locations/{cl_id}/breakdown?year=&version=` returns `{ charging_location, year, version, total_amount_eur, legal_entities[], chargeable_entities[], total }`. Stage-2 math mirrors `query_entity_allocation_breakdown`: per BTC line, `amount = effective_cost × to_business_pct/100 × line.percentage/100`. Cache-backed via `services.rollup_cache.get_stage1_effective`. Active BTC profiles only.
- **New schema**: `LocationBreakdownResponse` (+ `LegalEntitySummary`, `LocationBreakdownEntity`) appended to `backend/schemas/rollup.py`.
- **New service function**: `get_location_breakdown` in `backend/services/rollup_query.py`.
- **New frontend component**: `LocationBreakdownPanel.tsx` — header with total stat, two parallel info blocks. Block A is a chip list of legal entities at the location (informational only, with a one-line note that BTC Stage 2 splits to a charging location, not to a legal entity — `cl-de-muc` has 4 LEs). Block B is a table of chargeable entities with Amount + Share %. Loading skeleton + inline error path; no toast lib.
- **Map wiring**: `RollupMapView.tsx` location bubble `<g>` gains an `onClick` that calls `useSidePanel().openPanel(...)`. Map state (`drillCountry`) is local `useState` and survives the panel mount, so users can close and drill another location without losing context.
- **Prerequisite bug found and fixed**: `frontend/src/modules/charging/rollup/countryCoords.ts` keys were ISO-3 (`DEU`/`FRA`/...) but the seed surfaces `country.iso_code` as ISO-2 (`DE`/`FR`/...). Result: every `projectCountry()` call was returning null and the rollup map was rendering with no country bubbles at all. Rewriting the lookup keys to ISO-2 restores the bubbles. Committed separately so the fix is recoverable in isolation if needed.
- **Backend tests**: +5 new tests in `tests/test_rollup_query.py::TestGetLocationBreakdown` (happy path / legal-entity active-only filter / no-inflows / unknown-location / draft-profile-skip). Suite: **1303/1303 passing** (1298 baseline + 5).
- **Visual verification**: Anna Meier on `/charging?section=rollup` → drill EMEA → Germany → click `CL-DE-MUC` bubble. Side panel opens titled "Germany → TBS Operations Germany Munich" with total €1.7M, 4 legal-entity chips (LE-DE-001..004), and 6 chargeable entities (Business Insights Platform 28.1%, Master Data Hub 27.4%, Enterprise Collaboration Suite 24.4%, Field Diagnostics Service 9.6%, Supply Chain Visibility 8.1%, Enterprise Unified Workspace 2.5%). Verified in both light and dark themes at 1440px viewport. Close panel preserves the Germany-drill state.

Five commits in the branch (1 prerequisite fix + 4 Item-10 commits split atomically across service+schema / endpoint / tests / types+API / panel / map wiring).

## Demo polish follow-ups (post-S1) — Item 6 (2026-05-01)

Followups Item 6 — Bulk year-rollover UI button on BTC Profiles page (`feature/btc-year-rollover-ui`). Backend `POST /api/admin/btc-profiles/year-rollover` extended with optional mutually-exclusive `entity_types` / `entity_ids` scope filters (Pydantic `model_validator`-rejected if both set; both null preserves the original "roll all" behaviour). Frontend adds `YearRolloverDialog` (shadcn Dialog + Tabs mirroring `CreateBTCProfileDialog`) with All / By type / Specific entities scope choice, reachable via a new "Year rollover" button next to "+ New profile" on `BTCProfileListView`. Inline emerald result strip replaces the missing toast pattern. Backend tests: **1296 passed** (was 1283; +13 new across `TestYearRollover` in both `test_btc_service.py` and `test_router_btc_profile.py`). Frontend TypeScript baseline maintained (-3 errors net by resolving the new dialog's imports).

## Current Status

Phase: **v5 Session S1 complete on `v5/session-s1/foundation` (2026-04-30)** — full seed-data reconstruction per `[F-DG-01..03]`. Terminal v5 session. v4 project/service distinction retired; the seed now expresses the polymorphic `ChargeableEntity` model (Project / Offering / InternalService), the configurable hierarchy from Cluster D, the Stage 1 distribution graph, Stage 2 BTC profiles, the UM matrix, the demo flagship narrative (Master Data Hub, S042) end-to-end, and per-persona Launchpad differentiation. Built via 1 + 3 agent-team split: Phase 1 (foundation) on `v5/session-s1/foundation` produced the frozen 34-entity ChargeableEntity roster + master data foundation; Phase 2 ran 3 teammates in parallel on isolated worktrees (`v5/session-s1/team-charging` / `team-financials` / `team-scenarios`) — zero merge conflicts (file ownership disjoint). New `backend/seed/generate_seed_v5/` package replaces the v4 `generate_seed/` package which was deleted at cutover. Loader's `_seed_progress_tracker_data` Python helper retired (240 lines) — its work is subsumed by `s18_progress.py` emitting deterministic SQL. Frontend visual smoke walk on fresh-DB confirms Launchpad shows v5 pending actions, Portfolio Change shows 11 projects, Portfolio Run shows the exact 2P · 6O · 17S = 25-entity mix, Workbench flagship surfaces (proj-mdh-rollout) populate the full E3 tile grid with checklist 4/7 + narrative, Charging Distribution shows 39 edges incl. Master Data Hub → Data Stewardship at 5%, and Simulator lists scn-mdh-rebalance + scn-budget-pressure-15. Backend tests: **1283/1283 passing**. v5 validate.py: **9/10 rules pass** (one soft summation-integrity rule flags total_budget vs baseline_sum drift on 6 projects — known follow-up calibration; doesn't affect demo functionality).

**v5 backlog after S1:** All clusters complete. v5 implementation done.

## Demo polish — Item 8: MDH BTC Rebalance impact tile (2026-05-01)

Branch: `fix/mdh-btc-rebalance-seed-and-impact`. Closes Item 8 from `docs/followups/demo-polish-followups.md` — the seeded "MDH BTC Rebalance — DE/PL/CZ" scenario produced an empty Cost Allocation impact tile because (a) the scenario's seeded action used `action_type='btc_profile_change'` while the lever-12 engine only recognises `btc_profile_line_change`, and (b) once that was fixed a second pre-existing bug surfaced in the lever-12 rollup itself.

Three commits on the branch:

1. **Rewire seed scenario_action to lever12 schema** — convert `scenario_actions` row id=1 to `action_type='btc_profile_line_change'` with the COMPLETE post-rebalance line set (18 lines summing to 100, with `cl-cz-prg` added as a new line). Bump off-mdh 2026 BTC `cl-de-muc` 6.19→16.19 and `cl-fr-par` 15.62→5.62 so the -10pp shift on DE-Munich stays positive after rebalance. Headline impact (228k EUR rebalanced) preserved (`off-mdh` annual_cost=2.4M × to_business 95% = 2.28M; 10pp of 2.28M = 228k naively; the actual delta with upstream inflows is ~283k).

2. **Keep seed generator in sync** — `backend/seed/generate_seed_v5/config/scenarios.py` updated to the new action shape; `backend/seed/generate_seed_v5/s09_btc.py` gains a `DEMO_TUNING_OVERRIDES` map applied after UM-derived lines, with the off-mdh 2026 override matching the seed.sql edit. So `python -m generate_seed_v5.runner` reproduces the shipped state byte-identically.

3. **Union-aware effective cost in lever-12 rollup** — fix `services/scenario_lever12.compute_cost_allocation_impact()` so BTC-only scenarios stop losing upstream inflows on the scenario side. Added private helper `_compute_scenario_effective_cost` that mirrors `_check_cycle_across_versions` semantics: for each visited entity, build the incoming-edge union of `(scenario edges where source forked) + (anchor edges where source NOT forked)` and recurse. Two new tests in `TestUnionAwareEffectiveCost` lock in: (a) BTC-only scenario preserves upstream inflows and balances totals, (b) Stage 1 + BTC mixed scenario uses scenario edges for forked sources while keeping anchor edges visible for the rest.

Verification: GET `/api/scenarios/1/impact` (seeded MDH BTC Rebalance) now returns `touched_entity_count=1`, balanced totals (anchor_total = scenario_total = 2,832,816 EUR, delta 0) and three non-zero items: CL-DE-MUC -283,281, CL-PL-POZ +141,640, CL-CZ-PRG +141,640. Backend tests: **1285/1285 passing** (1283 + 2 new). Frontend: vite build clean (1.82 MB / 474 KB gzip); pre-existing TS strict-mode errors on main remain unchanged. Branch left for visual verification by lead before PR.

## Demo polish — Item 9: Scheduled Changes Create UI (2026-05-01)

Branch: `feature/scheduled-changes-create-ui`. Frontend-only — closes the documented W10.6 gap where the 5-state scheduled-change lifecycle was wired backend-side (`models/scheduled_changes.py`, `services/scheduled_change_activation.py`, `routers/scheduled_changes.py`) but the admin UI had list / approve / reject / cancel surfaces only and forced controllers to curl the create endpoint.

- New `frontend/src/modules/admin/scheduled/CreateScheduledChangeDialog.tsx`. Fields: entity type (Select — only `planning_parameter` enabled; other types `rate_table` / `cost_center` / `role_type` / `person` / `competence_center` shown disabled with a "Coming soon — not wired in v5" tooltip), parameter (Select pulling from `adminApi.getParameters()` — same source the Planning Parameters panel uses), new value (type-aware Input — switches to `type='number'` when the parameter's current value is numeric, otherwise plain text), activation date (date picker, `min={today}`), justification (Textarea, required, ≥ 20 chars and ≤ 255 — submitted as the schema's `description` field). Live char count + min indicator. Inline error surface for 4xx responses.
- `ScheduledChangesPanel` header gets a `+ New scheduled change` outline button next to `Apply due changes`. Submission closes the dialog and refetches the list (no toast — matches existing panel pattern).
- `pending_values` is serialised as `{"current_value": "<string>"}` to match the activation handler in `services/scheduled_change_activation.py::_apply_planning_parameter`. The followups doc suggested `{"value": ...}` but that key would silently fail at activation time — the activation path requires `current_value`. Documented in the dialog file's docstring.
- Frontend TypeScript: 81 errors maintained (≤ 81 baseline — no new errors introduced; pre-existing errors in `workbench/forecast/useForecastCycle.ts`, `workbench/overview/ProjectTimelineChart.tsx`, `workbench/submission/SubmissionDiffView.tsx` etc. unchanged). Vite production build: clean (1.83 MB / 475 KB gzipped).
- Backend tests: **1283/1283 passing** (no backend changes).
- Endpoint smoke-tested via curl: `POST /api/admin/scheduled-changes` accepts the payload and returns the row at `pending_review`; `cancel` reverses cleanly.
- Visual verification deferred to lead per session brief.

## v5 Session E8 merged on main (2026-04-30)

[PR #70](https://github.com/bill-pap/vision-demo-prototype/pull/70). E8 delivers a cross-module visual consistency pass over the 10 frontend modules merged in Waves 1–5: 6 new shared primitives (`ModuleHeader`, `LeftRailNav`, `LocationLabel`, `EmptyState`, `ConfidenceIndicator`, relocated `SummaryCard`); standardised module headers across 9 modules (Portfolio, Workbench, Capacity, Charging, Admin, Reporting, Docs, Backlog, Simulator) with Launchpad's centred E7 layout and Reporting's nested builder/ai-builder routes preserved as sanctioned exceptions; shared `LeftRailNav` backing `ChargingSidebar` (flat) and Admin's `EntitySelector` (grouped); promoted `LocationLabel` from `modules/admin/shared/` to `components/shared/` and extended its rollout into Workbench BTC tab, Charging BTC editor / Reporting panel / Rollup map, and Simulator Lever-12 surfaces; renamed simulator's local `StatusBadge` → `ScenarioStatusBadge` to free the name for the shared workflow badge; extracted the diamond confidence shape from `ProgressTrackerTile` into shared `ConfidenceIndicator`; replaced ad-hoc empty-state divs in Reporting library, Simulator manager, Workbench External Costs, and Charging Distribution with the shared `EmptyState`. Frontend TypeScript: **81 errors maintained** (≤ 82 baseline — no new). Vite production build: clean (1.82 MB / 474 KB gzipped). Backend tests: **1283/1283 passing** (frontend-only session).

## v5 Session S1 — Full seed data reconstruction (2026-04-30)

### Scope

Terminal v5 session per `[F-DG-01..03]`. Replaces the entire v4 demo seed data (one v4 / v5 generator package, 240-line v4 progress-tracker Python helper, 20533-line v4 `seed.sql`) with a v5-coherent reconstruction expressing the polymorphic `ChargeableEntity` model (Project / Offering / InternalService) end-to-end across all 10 modules. Built via Phase 1 + 3 parallel Phase 2 agent-teams.

### Phase 1 — Foundation (single teammate, 3 commits, ~30 min)

`backend/seed/generate_seed_v5/` package with:
- `_utils.py` — lifted `month_range` / `sql_str` so v4 + v5 packages can share primitives during cutover.
- `runner.py` — orchestration mirror of v4 `runner.py`; FK-respecting 20-stage `MODULES` list.
- `config/` subpackage replacing v4's monolithic `config.py`: `branding.py` (DEMO_DATE, fictionalisation tokens), `master.py` (locations, CCs, role types, rate tables), `legal.py` (90 charging locations + 120 legal entities + 28 countries + 3 regions per `[F-MD-01..02]`), `people.py` (52 people + 4 demo personas — Becker → Weber rename per `[F-DG-02]` — + 4 users + role permission grants per `[F-AC-01]`), `entities.py` (FROZEN 34-entity ChargeableEntity roster: 11 projects + 6 offerings + 17 internal services).
- Stages s01..s07: `s01_taxonomy`, `s02_grouping_entities` (two-pass for self-FK), `s03_legal_entities_locs`, `s04_roles_rates`, `s05_people`, `s06_chargeable_entities` (polymorphic emission), `s07_assignments`.

Exit gate: deterministic byte-identical re-runs; zero `PRAGMA foreign_key_check` violations; entity roster banner printed at end of runner.

### Phase 2 — Three teammates in parallel (~25–30 min wall-clock)

Each on its own worktree off Phase 1's HEAD; all read `config/entities.py` as a read-only constant. **Zero merge conflicts** (file ownership disjoint).

**T1 Charging stack** (`v5/session-s1/team-charging`, 3 commits):
- `config/distribution.py`, `config/um.py`, stages `s08_distribution`, `s09_btc`, `s10_um_matrix`.
- 39 Stage 1 distribution edges per `[F-S1-01..05]` (multi-step path `svc-infra-platform` → `svc-data-platform` → `off-bizinsights` → To-Business; self-retained residual on `svc-ident-auth` 10% and `svc-monitoring` 10%; flagship's 4-source upstream chain + 5%-downstream-to-`svc-data-stewardship`).
- 27 BTC profiles with 245 lines (15 manual + 12 automatic with S-code linkage); year-rollover demonstrated via 2025 + 2026 profiles for `off-mdh` and `off-eunify` with `copied_from_profile_id` self-FK.
- 312 UM matrix cells across 12 S-codes × 2 quarters (S042 dense 17 locations, S118 broad 25, S067 ~12, S312 ~30, S720 ~18, plus S999 sentinel).

**T2 Financials & Lifecycle** (`v5/session-s1/team-financials`, 3 commits):
- `config/financials.py`, `config/milestones.py`, stages `s11_tech_navigator`, `s12_pipeline`, `s13_financials`, `s14_allocations`, `s15_change_requests`, `s17_milestones`, `s18_progress`.
- Tech Navigator subscores for 9/11 projects (Run-stage projects left NULL — minor deviation from `[A-TN-01]`; doesn't affect demo since Run UI doesn't surface scoring).
- Pipeline + DoI assigned to all 11 projects; distribution: 2 DoI 0 / 1 DoI 1 / 1 DoI 2 / 5 DoI 3 (3 Active + 2 Approved) / 2 DoI 5 Operate.
- 2353 baselines + 1889 forecasts + 945 actuals across 25 chargeable-in-Run-Portfolio entities (monthly Apr 2026–Mar 2027 + quarterly outer zone Apr 2027–Mar 2029; `is_provisional=True` per `[C-FG-07]`).
- 1179 allocations all using polymorphic `chargeable_entity_id` FK (zero use legacy `project_id`).
- 7 change requests across 4 distinct workflow states including CR #27 send-back on `proj-predmaint` and CR #28 approved on flagship.
- 31 project_milestones + 21 deliverable checklist items (3 demo entities × 7 items × 4 complete shape) + 9 ProgressSnapshot rows (3 entities × 3 cycle closes).
- s17 ends with `UPDATE projects SET current_milestone_id = ...` block resolving the v5 `Project ↔ ProjectMilestone` circular FK.
- s18 absorbs the legacy `loader._seed_progress_tracker_data` as deterministic SQL; v4 hardcoded project IDs (proj-erp2 / proj-sap / proj-iam) replaced by v5 demo entities (proj-mdh-rollout / proj-erp2 / proj-iam-run).

**T3 Scenarios + Workflow + Validate** (`v5/session-s1/team-scenarios`, 3 commits):
- `config/scenarios.py`, stages `s16_workflow`, `s19_scenarios`, `s20_system`, plus re-authored `validate.py`.
- 3 scenarios per `[B-SL-01..05]` `[B-PR-03..05]` `[B-AC-02]` `[B-ES-01]` `[F-AC-01]`: `scn-mdh-rebalance` (controller-private Tier-1 lever-12 on flagship BTC), `scn-budget-pressure-15` (published cross-portfolio multi-action), `scn-cco-mdh-staffing` (CC-Owner-scoped per `[F-AC-01]` with `cc_owner_scope_cc_id=cc-muc-apd`).
- 5 ScenarioActions with `lever_category` + `tier` populated; 3 ScenarioStates + 3 ScenarioCapacityImpacts on the published scenario; 1 ScenarioPromotion audit row demonstrating `[B-PR-03..04]`.
- 4 workflow_templates per `[D-CAT-07]` (forecast_cycle 5 steps / intake 4 / change_request 4 / send_back 3 = 16 workflow_steps + 12 workflow_step_actions); 3 scheduled_changes spanning the 5-state lifecycle.
- 19 notifications differentiated per persona; 4 system_suggestions; 9 audit_log rows using `category` from `AUDIT_CATEGORIES`.
- `validate.py` re-authored: drops v4 hardcoded ID set; reads roster via SQL queries; ports 8 v4 rules + adds 2 new v5-specific rules (`check_distribution_sum_rule`, `check_btc_sum_rule`); stub-aware (skips checks against missing tables to stay green during partial-merge state).

### Cutover (single atomic commit + 1 deletion + docs)

- `backend/seed/loader.py`: `_seed_progress_tracker_data` deleted (240 lines); call sites in `seed_database()` and `reset_database()` updated. `_seed_forecast_versions` retained (already iterates `db.query(Project)` — no v4 hardcoding to remove).
- `backend/seed/seed.sql` regenerated by v5 runner: 8192 lines, deterministic (sha256 `b45ba38e...`).
- `backend/seed/generate_seed/` legacy package deleted (15 files, -2737 lines).
- `OVER_ALLOCATED_PERSONS` whitelist in `validate.py` extended to include `p-winter` (T2's intentional over-allocation target).

### Verification

- Determinism ✓: byte-identical `runner.py` re-runs.
- FK soundness ✓: `PRAGMA foreign_key_check` returns zero rows on fresh DB load.
- Backend tests: **1283/1283 passing** (no regressions).
- v5 validate.py: **9/10 rules pass**. Remaining failure (rule 1 Summation Integrity) is a soft variance between Phase-1 narrative-driven `total_budget` (set per t-shirt size in `config/entities.py`) and T2's data-driven baseline rollups (line-item × month × role). Documented as a follow-up calibration; doesn't affect demo functionality.
- Visual smoke walk (Chrome DevTools MCP, 1440×900, dark theme, Controller persona):
  - Launchpad shows 3 v5 pending actions + KPI tiles (€3.41M / 11 active / drift +6.1% / Pipeline 4 projects in DoI 0–2 / Budget vs Cutoff 11 above 0 below).
  - Portfolio Change view: €3.2M baseline / €3.4M forecast / 4 LoBs in tree (TBS Red / RVS Amber / Corporate IT Green / Digital & Data Green) / Run €550K (7%) / Change €7.2M (93%).
  - Portfolio Run view: 25 chargeable entities, mix label "2 P · 6 O · 17 S" matches plan exactly, Total Annual Cost €13.9M.
  - Workbench `proj-mdh-rollout`: full E3 tile grid populated — Three-Point Summary (€879K baseline / forecast / €379K actuals), Milestone status (Build 3 of 5, Test starts 2026-09), Resource Plan (4,560h / 6 roles), Cost mix (CapEx 97% / OpEx 3%), Progress tracker (Build milestone, intra-milestone 57%, Checklist 4/7, On track) with full status narrative.
  - Charging Distribution: 39 edges / 16 source entities; flagship's `Master Data Hub IT00S042 → Data Stewardship Service ITF20013 @ 5.00%` visible.
  - Simulator: scn-mdh-rebalance (Private, lever-12/btc/flagship tags) + scn-budget-pressure-15 (Published, budget/cross-portfolio/executive-readout tags, headline impact -€705K).

### Known follow-ups (for post-S1 housekeeping)

- Recalibrate Phase-1 narrative `total_budget` values vs T2's data-driven baseline rollups (currently 19–76% drift on 6 projects).
- Optionally backfill Tech Navigator scores on the 2 DoI 5 Run-stage projects (proj-cloud3-run, proj-iam-run) if `[A-TN-01]`'s "regardless of status" interpretation needs strict compliance.
- Cleanup leftover worktrees: `../creta-s1-{t1,t2,t3}` after the merged PR lands.



## v5 Session E8 — Cross-module visual consistency (2026-04-30)

### Scope

Penultimate v5 frontend session per `[E-07a..g]` and `[F-MD-01]`. Consolidates the visual vocabulary across 10 modules merged in Waves 1–5: shared module header, shared left-rail nav, formal three-card-type taxonomy, shared empty state, distinct-shape confidence indicator, location-master tooltip pattern, and badge/status-vocabulary cleanup.

### New shared primitives (all under `frontend/src/components/shared/`)

- `ModuleHeader.tsx` per `[E-07a]` — title + subtitle + right-aligned `actions` slot + optional `breadcrumb` and `tabs` slots. Renders `<h1 className="text-2xl font-semibold">` so all standardised modules share the same heading scale.
- `LeftRailNav.tsx` per `[E-07c]` — flat or grouped (`items` vs `groups` prop forms), with optional per-item icon + description + badge. Width prop defaults to 240. Active-state styling matches the Cluster D Admin baseline (`bg-primary/5` + `border-l-2 border-primary` + `text-primary font-medium`).
- `LocationLabel.tsx` per `[F-MD-01]` — promoted from `modules/admin/shared/LocationLabel.tsx` so callers outside the admin module can use it. Existing API preserved (`kind` + `text` + `iconOnly`). The legacy admin path is kept as a re-export shim during the transition.
- `EmptyState.tsx` per `[E-07f]` — `icon` + `title` + `description` + optional primary `action`, with `sm` (in-card) and `md` (whole-tab) size variants.
- `ConfidenceIndicator.tsx` per `[E-07g]` — extracted from the diamond SVG previously inline in `ProgressTrackerTile`. `level` prop accepts `'on_track' | 'at_risk' | 'blocked'`; emits a green/amber/red diamond.
- `SummaryCard.tsx` — relocated from `modules/capacity/shared/SummaryCard.tsx` so all three card types per `[E-07d]` (`SummaryCard`, shadcn `Card`, `ActionCard`) live under `components/shared/`.

### Module header roll-out (9 modules)

Replaced bespoke `<h1>` blocks with `<ModuleHeader title=… actions={…} />` in:

- `frontend/src/modules/portfolio/PortfolioOverview.tsx`
- `frontend/src/modules/workbench/ProjectWorkbench.tsx`
- `frontend/src/modules/capacity/CapacityManagement.tsx`
- `frontend/src/modules/charging/Charging.tsx`
- `frontend/src/modules/admin/Administration.tsx`
- `frontend/src/modules/reporting/Reporting.tsx` (conditional hide on `/builder` and `/ai-builder` retained)
- `frontend/src/modules/docs/DocumentationHub.tsx`
- `frontend/src/modules/backlog/BacklogPage.tsx`
- `frontend/src/modules/simulator/manager/ScenarioManagerPage.tsx`

Skipped `frontend/src/modules/launchpad/Launchpad.tsx` — the centred three-zone E7 layout is a sanctioned exception.

### Sidebar migration

- `frontend/src/modules/charging/ChargingSidebar.tsx` rewritten as a thin adaptor that calls `<LeftRailNav items={…} />` with the four section descriptors.
- `frontend/src/modules/admin/EntitySelector.tsx` rewritten as a thin adaptor calling `<LeftRailNav groups={ADMIN_GROUPS} />` with the five-section grouping preserved.
- `frontend/src/modules/workbench/ProjectListPanel.tsx` retains its bespoke per-item rendering (multi-line content with RAG dot + name + type/status badges plus a header strip with collapse + "+ New" buttons) but shares the active-state vocabulary with `LeftRailNav`. A doc-comment notes the intentional special case.

### Card / badge / confidence consolidation

- `SummaryCard` import paths updated in 8 callers (5 reports, Admin context strip, two capacity summary bars).
- `frontend/src/modules/simulator/workspace/header/StatusBadge.tsx` renamed to `ScenarioStatusBadge.tsx`; the lone caller in `ScenarioHeader.tsx` updated. Frees `StatusBadge` for the shared workflow-status badge in `components/shared/`.
- `frontend/src/modules/workbench/overview/tiles/ProgressTrackerTile.tsx` no longer ships the inline diamond SVG; uses `<ConfidenceIndicator level={…} />` instead.

### Empty-state roll-out

`<EmptyState …/>` adopted in four high-traffic surfaces:

- `frontend/src/modules/reporting/library/ReportLibrary.tsx` — "No saved views yet" (Bookmark icon).
- `frontend/src/modules/simulator/manager/MyScenariosTable.tsx` — "No scenarios yet" (FlaskConical icon).
- `frontend/src/modules/workbench/external-costs/ExternalCostsTab.tsx` — "No external cost data" (Receipt icon).
- `frontend/src/modules/charging/distribution/DistributionListView.tsx` — "No distribution edges" (FilterX icon, with copy guiding the user to clear filters).

Long-tail empty states (smaller in-card placeholders, individual table-row nulls) deliberately left for a follow-on cleanup.

### Location-master tooltip extension `[F-MD-01]`

LocationLabel applied to the following surfaces beyond the existing admin entities:

- `frontend/src/modules/charging/btc/EntityBTCProfileEditor.tsx` — "Charging Locations distribution" section heading, percentage-table column header, candidate picker label, current-values column header.
- `frontend/src/modules/charging/rollup/RollupMapView.tsx` — country drill-down hint ("Charging locations in <country>").
- `frontend/src/modules/charging/reports/ReportingPanel.tsx` — `charging_location` and `legal_entity` dimension entries in the catalogue list.
- `frontend/src/modules/workbench/btc/WorkbenchBTCTab.tsx` — Charging-location column header in the breakdown table.
- `frontend/src/modules/simulator/surfaces/CostAllocationSurface.tsx` — Charging-location column in the per-location impact table.
- `frontend/src/modules/simulator/workspace/impact/dimensions/CostAllocationDimension.tsx` — Location column in the dimension impact panel.

All admin panels (`ChargingLocationsPanel`, `LegalEntitiesPanel`, `LocationsPanel`, `UserMeasurementPanel`) and existing charging surfaces (`RollupTreeTableView`) updated to import the canonical shared component.

### Files added (6) / modified (≈ 24) / deleted (1)

- New: `frontend/src/components/shared/{ModuleHeader,LeftRailNav,LocationLabel,EmptyState,ConfidenceIndicator,SummaryCard}.tsx`
- Renamed: `simulator/workspace/header/StatusBadge.tsx` → `ScenarioStatusBadge.tsx`
- Deleted: `frontend/src/modules/capacity/shared/SummaryCard.tsx`
- Modified: 9 module entry pages (header roll-out), 2 sidebar adaptors, 8 SummaryCard import sites, 6 location-master callers, 4 empty-state callers, ProgressTrackerTile.

### Verification

- TypeScript: 81 errors maintained (≤ 82 baseline — no new errors from any E8 change).
- Vite production build: clean (`vite build` → 1.82 MB / 474 KB gzipped).
- Backend tests: 1283/1283 passing (frontend-only session, no backend touched).
- Visual verification (Chrome DevTools MCP, 1440×900, light + dark): walked Launchpad / Portfolio / Workbench / Charging Distribution + BTC editor / Admin Charging Locations / Reporting / Simulator. ModuleHeader visually identical across the 9 standardised modules; Launchpad still uses the centred E7 layout; LeftRailNav identical between Admin (grouped) and Charging (flat); LocationLabel tooltip icon visible on the BTC editor section + column header and on the admin Charging Locations panel; EmptyState renders correctly on the Reporting "Saved views" empty + the Charging distribution empty; no React key warnings or console errors observed during navigation.

### Known follow-ups

- Long-tail empty-state surfaces (chart-level "no data", in-card nulls) still ad-hoc — adoption can be incremental.
- `frontend/src/modules/workbench/ProjectListPanel.tsx` deliberately renders its own multi-line items rather than `LeftRailNav` — extending the shared component to support multi-line items is a future refactor.

## v5 Session E3 + E4 — T2 Workbench Overview tile grid + Progress vs. Burn / Variance Waterfall (2026-04-30)

### Scope
T2 of the four-team Wave 5 split. Owns the **E3** Workbench Overview 3×3
tile grid + 9 tile components + the **E4** Progress vs. Burn chart and
Variance Waterfall chart with their expanded dialogs. Coexists with the
F6 BTC allocation tile (rendered separately below the grid per the
spec's E-09 + E3 coexistence note).

### Frontend deliverables
- **9 tile components** under `frontend/src/modules/workbench/overview/tiles/`
  (Row 1: ProjectHeaderTile, ThreePointSummaryTile, MilestoneStatusTile;
  Row 2: ResourcePlanTile, CostMixTile, ProgressTrackerTile;
  Row 3: ExternalCostsTile, ForecastHealthTile, TechNavigatorTile)
  + barrel `tiles/index.ts`.
- **2 chart components** under `frontend/src/components/charts/`:
  `ProgressVsBurnChart.tsx` (cumulative progress + burn + baseline lines
  with milestone zone bands and solid/highlighted/dashed milestone
  markers per `[E-05b]`; burn-only fallback per `[E-05d]`),
  `VarianceWaterfallChart.tsx` (stacked-spacer waterfall bridging
  baseline → grouped CR categories → current forecast with bar-click
  navigation per `[E-05c]`).
- **2 dialog components** under
  `frontend/src/modules/workbench/overview/expanded/`:
  `ProgressVsBurnDialog.tsx`, `VarianceWaterfallDialog.tsx`. Wired to
  the Progress Tracker tile click and Three-Point Summary tile click
  respectively.
- **1 shared component** at `frontend/src/components/shared/ActionCard.tsx`
  codifying the Cluster E `[E-07d]` action-card pattern (surface card +
  hover + click affordance) with built-in loading / error / empty
  states.
- **Progress tracker types + API wrappers**:
  `frontend/src/types/progress.ts` mirrors backend's
  `schemas/workbench.py` progress models;
  `frontend/src/api/endpoints.ts` gains a `progressApi` block exposing
  `get / update / getHistory / getSnapshot / getMilestoneChecklist`.

### OverviewTab refactor
`frontend/src/modules/workbench/overview/OverviewTab.tsx` rewritten
end-to-end. The v4 vertical stack (MetadataBar +
ProjectTimelineChart + MonthlyTimelineTable + ThreePointTable +
ProjectTrajectoryChart + 2-col CapEx/Resource + BTCAllocationTile) is
replaced by:
- `responsive grid (1 / 2 / 3 cols)` of the 9 new tiles per `[E-04a]`,
- the F6 `BTCAllocationTile` rendered as a full-width band below the
  grid (E-09 + E3 coexistence),
- two embedded dialogs that open from the tile click handlers.

The legacy components (MetadataBar, MonthlyTimelineTable,
ProjectTimelineChart, ThreePointTable, CapexOpexDisplay,
ResourceSummaryTable, ProjectTrajectoryChart) are intentionally kept on
disk — they remain in use elsewhere (intake, change history) and the
Cluster C / E specs do not call for their removal in this session.

### ProjectWorkspace wiring
`frontend/src/modules/workbench/ProjectWorkspace.tsx` adds two new
callbacks (`onOpenForecastTab`, `onOpenChangeHistory`) so tiles can ask
the parent to switch tabs without coupling the Overview to react-router.
The Three-Point Summary → waterfall click route closes the dialog
before delegating to `onNavigateToChangeHistory(category)`.

### Confidence vocabulary [E-07g]
The Progress Tracker tile renders the next-milestone confidence as a
**diamond** (rotated square SVG) rather than a circle, distinct from
the RAG dot vocabulary per `[E-07g]`.

### Endpoint coverage
- `workbenchApi.getOverview()` → Project Header, Three-Point Summary,
  Cost Mix, Resource Plan, Forecast Health summary numbers.
- `progressApi.get()` → Progress Tracker tile + Progress vs. Burn dialog
  current state.
- `progressApi.getHistory()` → Progress vs. Burn dialog snapshot
  history sidebar + chart data points.
- `milestonesApi.list()` → Milestone Status tile + Progress vs. Burn
  zone bands.
- `techNavigatorApi.get()` → Tech Navigator tile + Project Header
  badges (project type, t-shirt size).
- `backlogApi.getBacklog()` → Tech Navigator tile peer scatter.
- `workbenchApi.listForecastVersions()` → Forecast Health tile
  current-version metadata.
- `workbenchApi.getForecast()` → Cost Mix tile internal/external
  derivation.
- `workbenchApi.getChangeRequests()` → Variance Waterfall dialog CR
  bridge.
- `GET /api/projects/{id}/external-costs/vendor-summary` and
  `category-rollup` (called via `api.get` directly to avoid racing T1's
  `externalCostsApi` wrapper) → External Costs tile.

### Files added (16) / modified (4)
- New: `frontend/src/components/shared/ActionCard.tsx`
- New: `frontend/src/components/charts/ProgressVsBurnChart.tsx`
- New: `frontend/src/components/charts/VarianceWaterfallChart.tsx`
- New: `frontend/src/types/progress.ts`
- New: `frontend/src/modules/workbench/overview/tiles/` (10 files —
  9 tiles + index.ts)
- New: `frontend/src/modules/workbench/overview/expanded/`
  (2 dialogs)
- Modified: `frontend/src/api/endpoints.ts` (+progressApi block)
- Modified: `frontend/src/modules/workbench/overview/OverviewTab.tsx`
  (rewrite to 3×3 grid + dialogs)
- Modified: `frontend/src/modules/workbench/ProjectWorkspace.tsx`
  (+onOpenForecastTab / +onOpenChangeHistory callbacks)

### Verification
- TypeScript: 82 baseline errors maintained, **zero new errors** from
  E3 + E4 (verified via `tsc -b tsconfig.app.json --noEmit`).
- Vite production build: clean (`vite build` succeeds; bundle
  ~1.77 MB / 462 KB gzipped).
- Visual verification: Playwright MCP not available in this agent
  session — flagged for the team-lead consolidated review.

### Known gaps / follow-ups
- **T1 owns `externalCostsApi`**: ExternalCostsTile calls the vendor /
  category endpoints via `api.get` directly. Once T1 lands the typed
  wrapper, this tile can migrate to `externalCostsApi.getProjectVendor
  Summary()` etc. in a one-line change.
- **No URL-driven Change History filter**: the `/workbench` URL does
  not yet decode `?tab=history&category=…`. The waterfall click
  delegates to `onNavigateToChangeHistory(category)` so a future
  session can implement deep-linking centrally without touching the
  dialog.
- **Demo data has no progress snapshots seeded**: every project's
  `/api/projects/{id}/progress` returns nulls today. The Progress
  Tracker tile falls through to its empty state (`No progress
  reported yet`); the Progress vs. Burn dialog renders the burn-only
  fallback path. E1 follow-up to seed sample progress data would
  unlock the full UI.

## v5 Wave 4 (preceding) — Current Status
Phase: **v5 Wave 4 complete locally on `v5/wave4-f6-e2-b2-merged` (2026-04-29)**, awaiting PR. Wave 4 bundles **F6 + E2 + B2**. B2 is the frontend What-If Simulator full rebuild — four-team parallel session: **T1** (shell + ScenarioContext + manager + drawer + apply-to-forecast + RoleContext.tier3_flag patch), **T2** (15 sandbox surfaces + cross-module `scenarioVersion` threading across F4/F5/C2/A6 + 3 sidebar bodies), **T3** (8-dimension impact dashboard + 3-level Compare view), **T4** (21 catalogue actions + Promote workflow + 2 Tier-3 surfaces + 2 Tier-3 sidebar sections). v4 simulator removed wholesale (zero cross-module imports). v4 AI Advisor preserved behind `VITE_ENABLE_AI_ADVISOR` flag. Backend test count: **1283** (unchanged from F6+E2 — B2 is frontend-only; T1's backend RoleContext.tier3_flag patch covered by existing tests). Frontend TS: 82 baseline errors maintained (zero new from any of the 4 slices). 30 endpoints under `/api/scenarios` (all from B1) wired through `scenariosApi` typed wrappers. Lever 12 sandbox storage pattern wired through ScenarioContext (Stage 1 distribution forks to `scenario-{id}` Distribution rows; Stage 2 BTC overlays as ScenarioAction rows). 6 merge commits on the consolidated branch + 2 integration glue commits (sidebar bodies + surfaceKey URL switch + Tier 3 surfaces + Promote button → /promote route). T2-flagged backend gap: `routers/workbench.py:1482` does not yet read the optional `version` query for sandbox forecast composition — frontend plumbing in place, B-cluster follow-up.

Phase preceding: F6 ships the Workbench BTC tile + tab + per-entity allocation breakdown endpoint (+20 tests). E2 ships external cost aggregation endpoints + role-personalised Launchpad tiles + PL capacity read-only endpoint (+73 tests).
Wave 3 merged on main (2026-04-29) and verified end-to-end. All five sessions landed: **B1** (scenario engine + Lever 12, +91 tests), **E1** (progress tracker + ExternalCostCategory, +92 tests), **A8** (frontend pipeline + Run Portfolio scaffolding), **C2** (frontend mixed-granularity grid + version history UI), and **F4 + F5** (frontend Charging & Allocations module — Distribution + BTC editors + Location Cost Rollup map + tree-table + Report Builder integration). Backend test count after Wave 3: **1190** (1007 baseline + 91 B1 + 92 E1). Frontend TypeScript: 0 errors. Visual verification done in light + dark themes across all four roles (~30 screenshots, prefix `w3-`).

## v5 Session E7 — Launchpad full redesign (T3, 2026-04-30)

### Scope
T3 of Wave 5's three-team split. Replaces the legacy two-column Launchpad
(module-entry tile grid + vertical pending-actions sidebar) with a full
three-zone vertical layout per `[E-06d]–[E-06j]`, `[E-06a]`, `[E-06b]`,
`[E-06c]`. All backend dependencies (`/api/launchpad/tiles`,
`/api/capacity/role-availability`) ship from Wave 4 E2 — this session is
frontend-only.

### Three zones
1. **LaunchpadHeader** — adds a status row under the role badge with the
   formatted current date (e.g. *Thursday, 30 April 2026*) and a Q{n}
   {year} Cycle badge derived client-side via the same fiscal-quarter
   mapping as `backend/services/forecast_cycle.derive_cycle_label`.
2. **PendingActionsPanel** — full rewrite as a horizontal scrollable
   strip per `[E-06b]`. Cards sorted urgent-first (red accent bar +
   triangle icon for urgent); the entire strip toggles via Show/Hide;
   when no actions exist the strip collapses into a single-line *All
   caught up* banner. All deep-link routing preserved verbatim from the
   v4 vertical sidebar.
3. **RoleTileGrid + 4 role-specific tile-set components** — dispatcher
   branches on `useRole().context?.role`. Backend returns the right
   tile count per role (PL 7, Controller 9, CC Owner 8, Executive 7);
   frontend layout is per-role.
   - `PLTileGrid` (3-col, 7 tiles) — Resource Availability tile pulls
     from `capacityApi.getRoleAvailability()` to surface the top 3 roles
     by available hours over the next 3 months. Anonymised per `[E-06a]`
     — no person names anywhere.
   - `ControllerTileGrid` (3×3, 9 tiles)
   - `CCOwnerTileGrid` (4-col, 8 tiles)
   - `ExecutiveTileGrid` (3-col, 7 tiles)

### Frontend wrappers (added)
- `launchpadApi.getTiles()` → `TilesResponse`
- `capacityApi.getRoleAvailability(params)` → `RoleAvailabilityResponse`
- New types in `frontend/src/types/api.ts`: `TilePayload`, `TilesResponse`,
  `TileTone`, `RoleAvailabilityRow`, `RoleAvailabilityResponse`

### Files added (6)
- `frontend/src/modules/launchpad/RoleTileGrid.tsx`
- `frontend/src/modules/launchpad/tiles/TileCard.tsx`
- `frontend/src/modules/launchpad/tiles/PLTileGrid.tsx`
- `frontend/src/modules/launchpad/tiles/ControllerTileGrid.tsx`
- `frontend/src/modules/launchpad/tiles/CCOwnerTileGrid.tsx`
- `frontend/src/modules/launchpad/tiles/ExecutiveTileGrid.tsx`

### Files modified (4)
- `frontend/src/modules/launchpad/Launchpad.tsx` — 3-zone restructure
- `frontend/src/modules/launchpad/LaunchpadHeader.tsx` — date + cycle
- `frontend/src/modules/launchpad/PendingActionsPanel.tsx` — rewrite
- `frontend/src/api/endpoints.ts` — two wrappers
- `frontend/src/types/api.ts` — five new types

### Files removed (1)
- `frontend/src/modules/launchpad/ModuleTilesGrid.tsx` — orphaned after
  RoleTileGrid takeover

### Verification
- TypeScript: **0 errors** project-wide (verified via `tsc --noEmit`)
- Visual verification: 8 full-page screenshots captured at 1440px width
  across the 4 roles × 2 themes (under
  `.playwright-mcp/screenshots/w5-launchpad-{role}-{theme}.png`).
- Tile click navigation verified for Pipeline → /backlog,
  Pending Reviews → /portfolio?tab=approvals, Resource Availability →
  /capacity?tab=availability, My Forecast → /workbench?tab=forecast.
- Pending action click verified to deep-link CR #19 → /portfolio/approvals?cr=19.
- Backend test count: **1283** (unchanged — frontend-only session).

### Cross-team contract
T3 owns `launchpadApi.getTiles` + `capacityApi.getRoleAvailability` per
the Wave-5 plan. T1 (`externalCostsApi`) and T2 (progress / milestones
wrappers) own their own wrapper additions; no overlapping edits.

## v5 Wave 5 Session — T1 Portfolio: F7 (rest) + E6 + E5 (2026-04-30)

### Scope
Wave 5 Team 1 (Portfolio). Owns
``frontend/src/modules/portfolio/`` plus E5's Workbench tab in
``frontend/src/modules/workbench/external-costs/``. Three sessions
serial on a single branch (``v5/wave5-t1-portfolio``):

- **F7 (rest)** [E-11] [A-PL-07] — Portfolio Run dashboards + Run drill-down
- **E6** [E-03a..g] — Portfolio project detail (slide-in → full-page)
- **E5** [E-08a..d] — External cost views (Workbench tab + Portfolio tab)

### F7 (rest) — what landed (commits ``da14277``, ``2ba1052``)
- `RunPortfolioTab` 4 KPI cards rebuilt to match the F7 spec: total
  annual cost, To-Business vs internal split, mix by entity type,
  outsourcing ratio.
- New `RunDimensionRollupPanel` renders compact region / division /
  country rollup panels under the KPI strip via
  `chargingApi.getRollup()`. Falls through gracefully when the backend
  rollup query falls back to entity_type for these dimensions
  (documented in `services/rollup_query.py::_dim_key_label`).
- Offering + InternalService rows are now clickable. Drill-down route
  `/workbench?entity={id}&type={offering|internal_service}` resolved by
  a new `EntityWorkspace` shell that hides the project list and
  presents the BTC tab only (label flips between *Cost Allocation* and
  *Distribution* per the F6 BTC-tab semantics).
- `WorkbenchBTCTab` accepts either `projectId` or `entityId` —
  same component now backs both project and non-project drill-downs.
- `ProjectWorkbench` detects the `entity` query param and switches
  rendering to the entity workspace; project-list fetch is short-
  circuited in entity mode.

### E6 — what landed (commit ``daf55b7``)
- New route `/portfolio/project/:projectId` in `App.tsx`, ahead of the
  catch-all `/portfolio/*` so the deeper match wins.
- `ProjectDetailPage` shell with hierarchy breadcrumb (Portfolio → LoB
  → Programme → Project) sourced from `ProjectMetadata.hierarchy_path`.
  Read-only banner + "Open in Workbench" CTA.
- Four section files under `modules/portfolio/detail/sections/`:
  `OverviewSection`, `FinancialDetailSection`, `ResourcesAndCostsSection`,
  `HistorySection`. All read-only for every role. Reuses
  `MixedGranularityGrid` (C2), `ProjectTrajectoryChart`,
  `VersionHistoryPanel` + `VersionComparisonDialog` (C2),
  `CRHistoryList` (workbench history), and the new
  `externalCostsApi` wrapper.
- Variance waterfall slot on Financial Detail is a documented
  placeholder — will swap in T2's E4 chart in a follow-up integration
  commit once T2 merges.
- Back-button restores scroll + filters via a sessionStorage handshake
  (`creta:portfolio:dashboard:scroll`) per [E-03b].
- v4 deep-link `/portfolio/<projectId>` redirects to the new route.
- `DashboardTab` loses its `useSidePanel` wiring; old
  `ProjectSummaryPanel.tsx` removed.

### E5 — what landed (commit ``ae9a084``)
- New `ExternalCostsTab.tsx` at `modules/workbench/external-costs/`
  wired as the 5th `TabsTrigger` in `ProjectWorkspace.tsx` between
  Cost Allocation and Change History. Sections: 4-KPI strip,
  clickable category breakdown (filters the vendor list), sortable
  expandable vendor table.
- New `ExternalSpendTab.tsx` at `modules/portfolio/external-spend/`
  wired as a tab in `PortfolioOverview.tsx` (Change sub-module).
  Visible to all roles. Sections: KPI strip, cross-project vendor
  summary with per-project breakdown via the matrix payload, category
  analysis, project × vendor matrix collapsed by default and capped
  at the top-12 vendors.
- `PortfolioOverview` path-detection extended for
  `/portfolio/external-spend`.

### API wrapper additions (T1-owned)
- `externalCostsApi` in `frontend/src/api/endpoints.ts` exposing the 5
  E2 endpoints (project vendor + category, portfolio vendor +
  category + matrix). New types in `frontend/src/types/api.ts`
  (`ProjectVendorSummaryRow`, `ProjectCategoryRollupRow`,
  `PortfolioVendorSummaryRow`, `PortfolioCategoryAnalysisRow`,
  `ProjectVendorMatrixResponse`, etc.).
- T2 owns `progress` / `milestones` wrappers; T3 owns
  `launchpadApi.getTiles` + `capacityApi.getRoleAvailability`. T1
  does not touch those.

### Files added (15)
- `frontend/src/modules/portfolio/run/RunDimensionRollupPanel.tsx`
- `frontend/src/modules/portfolio/detail/ProjectDetailPage.tsx`
- 4 files under `frontend/src/modules/portfolio/detail/sections/`
  (`OverviewSection`, `FinancialDetailSection`,
  `ResourcesAndCostsSection`, `HistorySection`)
- `frontend/src/modules/portfolio/external-spend/ExternalSpendTab.tsx`
- `frontend/src/modules/workbench/external-costs/ExternalCostsTab.tsx`
- `frontend/src/modules/workbench/EntityWorkspace.tsx`

### Files modified (8)
- `frontend/src/api/endpoints.ts` (new `externalCostsApi`)
- `frontend/src/types/api.ts` (new external-cost response types)
- `frontend/src/App.tsx` (E6 route)
- `frontend/src/modules/portfolio/PortfolioOverview.tsx` (E5 tab)
- `frontend/src/modules/portfolio/dashboard/DashboardTab.tsx`
  (slide-in → full-page navigation, snapshot handshake)
- `frontend/src/modules/portfolio/run/RunPortfolioTab.tsx` (F7 KPIs +
  rollup panels + drill-down routing)
- `frontend/src/modules/workbench/btc/WorkbenchBTCTab.tsx`
  (projectId or entityId entry-point)
- `frontend/src/modules/workbench/ProjectWorkbench.tsx` + new
  `EntityWorkspace.tsx` (entity-mode workspace)
- `frontend/src/modules/workbench/ProjectWorkspace.tsx`
  (E5 External Costs tab)

### Files removed (1)
- `frontend/src/modules/portfolio/dashboard/ProjectSummaryPanel.tsx`
  (replaced by full-page detail per [E-03a])

### Verification
- `tsc -b` baseline: 82 → 81 errors after Wave 5 (one fewer; no new
  errors introduced in any T1 file).
- Backend untouched. Existing E2 endpoints + F2 chargeable-entities
  endpoints exercised via `curl` to confirm wire shapes match.

### Known gaps / follow-ups
- Run Portfolio dimension rollup panels currently surface
  entity_type aggregates because `services/rollup_query.py` falls
  back to that grouping for region / division / country. Cluster F
  follow-up to wire BTC-profile-aware aggregation will replace the
  fallback labels seamlessly with no frontend change.
- T2's E4 variance waterfall integration into
  `FinancialDetailSection` is queued as a follow-up commit once T2
  merges into `main`.

## v5 Session B2 — T2 Sandbox Surfaces + Version Threading (2026-04-29)

### Scope
T2 of the four-team B2 split. Owns the 15 non-Tier-3 sandbox surfaces +
BacklogSandboxSurface, the 3 portfolio-scoped sidebar bodies, and the 5
cross-module patches that thread `scenarioVersion` into F4/F5/C2/A6
production components per `[B-OQ-02]` `[F-S1-04]`.

### Cross-module patches (5)
All additive + optional; default behaviour byte-identical to v4 / Wave 3.

- `frontend/src/modules/workbench/forecast/MixedGranularityGrid.tsx` —
  optional `scenarioVersion?: string` prop; forwarded to
  `workbenchApi.getForecastGrid({ ..., version })`. Diff helpers
  (`lookupDelta`, `renderDeltaIndicator`, `isMeaningfulDelta`) extracted
  to `frontend/src/modules/simulator/lib/cellDiffHelpers.tsx` so Compare
  L3 (T3) and the change-summary drawer (T1) share the same semantics.
- `frontend/src/modules/charging/btc/EntityBTCProfileEditor.tsx` —
  optional `scenarioVersion?: string` + `onSandboxSave` callback. In
  sandbox mode, manual save routes through the consumer-supplied
  callback (wired to `ScenarioContext.setBtcLines`); UM "Refresh from
  UM" + mode-switch are hidden because they are canonical-only writes.
  Added a "Sandbox edit" badge.
- `frontend/src/modules/charging/rollup/RollupView.tsx` — optional
  `scenarioVersion?: string`, `compact?: boolean`, `defaultYear?: number`
  props. When `scenarioVersion` is set, the version selector is locked
  and shown as a pill. `compact` hides the top control bar so the rollup
  embeds neatly inside the impact-tile preview.
- `frontend/src/modules/charging/distribution/EntityDistributionEditor.tsx`
  — optional `sandboxScenarioId?: number`. When set, all 4 mutation
  paths (add edge, update edge, delete edge, change to-business-pct)
  route to the scenario Lever 12 endpoints instead of canonical
  Charging API. Read path was already version-aware since F2.
- `frontend/src/modules/backlog/BacklogContext.tsx` — adds
  `SandboxBacklogProvider` alongside the live `BacklogProvider`. The
  sandbox provider keeps state in-memory (no `useSearchParams`) so the
  simulator workspace URL stays clean. Both providers populate the same
  context shape; the new optional `scenarioVersion` field on the context
  lets data hooks fork their fetch path.
- One-line additive change to `frontend/src/api/endpoints.ts`
  `workbenchApi.getForecastGrid` to accept the new `version` query
  (T1-owned file; coordinated via SendMessage. **Backend route at
  `routers/workbench.py:1482` currently ignores the param** — flagged
  here as a B-cluster follow-up gap, not in B2 scope).

### 16 surfaces (T2 owns 15 + BacklogSandboxSurface)
Under `frontend/src/modules/simulator/surfaces/`, exported via barrel
`surfaces/index.ts`. Each surface dispatches edits through
`useScenarioContext().applyAction({ scope, action_type, project_id?,
parameters, lever_category })` per `[B-ES-01]`.

- `ForecastGridSurface` — embeds `MixedGranularityGrid` in sandbox mode
  (read-only) + scale/remove/pause action dispatch
- `CostAllocationSurface` (Lever 12) — 3-tab shell: Stage 1
  distribution editor (sandbox routing), Stage 2 BTC editor (sandbox
  routing via `setBtcLines`), per-charging-location impact preview +
  embedded `RollupView` in `compact` sandbox mode (acceptance criteria
  8 + 9 + 10)
- `BacklogSandboxSurface` — wraps `RankedListView` with
  `SandboxBacklogProvider`
- `RateTableSurface`, `ResourceAssignmentSurface`, `MilestonesSurface`,
  `VendorContractsSurface`, `SourcingMixSurface`, `CapExOpExSurface`,
  `RunningCostsSurface`, `HierarchyReassignSurface`,
  `BudgetEnvelopeSurface`, `EscalationFactorsSurface`,
  `HypotheticalProjectSurface`, `PipelineStageSurface`,
  `TechNavigatorScoreSurface` — focused single-action sandbox forms
- Shared `SurfaceCard` shell — title + sandbox badge + error card +
  busy state

### 3 sidebar bodies
Under `frontend/src/modules/simulator/workspace/sidebar/`. Mounted by
T1's `WorkspaceSidebar` host via the `projectsSection`,
`backlogSection`, `portfolioSettingsSection` slot props.

- `ProjectsSection` — flattens portfolio tree to project leaves; CC
  Owner scope filter; navigates to surface URL preserving the user's
  current `surfaceKey`
- `BacklogSection` — shortcuts to `backlog` + `hypothetical-project`
- `PortfolioSettingsSection` — shortcuts to 5 portfolio-scoped surfaces

### Files added (22)
- `frontend/src/modules/simulator/lib/cellDiffHelpers.tsx`
- 16 files under `frontend/src/modules/simulator/surfaces/`
  (15 surfaces + `SurfaceCard.tsx` + `index.ts`)
- 3 files under `frontend/src/modules/simulator/workspace/sidebar/`
  (`ProjectsSection.tsx`, `BacklogSection.tsx`,
  `PortfolioSettingsSection.tsx`)

### Files modified (6)
- `frontend/src/api/endpoints.ts` — single-line `version` param on
  `workbenchApi.getForecastGrid`
- `frontend/src/modules/workbench/forecast/MixedGranularityGrid.tsx`
- `frontend/src/modules/charging/btc/EntityBTCProfileEditor.tsx`
- `frontend/src/modules/charging/rollup/RollupView.tsx`
- `frontend/src/modules/charging/distribution/EntityDistributionEditor.tsx`
- `frontend/src/modules/backlog/BacklogContext.tsx`

### Verification
- `tsc --noEmit` exit 0 across all 22 new + 6 modified files.
- 6 atomic commits with `[B-OQ-02]` decision tags.
- Cross-module regression: prop additions are optional + default
  behaviour identical, so F4/F5/C2/A6 production call sites are
  unaffected.

### Refactoring opportunities (deferred per session protocol)
- `MixedGranularityGrid` could move its column-grouping helpers
  (`groupColumnsByYear`, `formatColumnLabel`, etc.) to `lib/` for reuse
  by the comparison + drawer surfaces — out of scope for B2.
- `BacklogContext` and `SandboxBacklogProvider` share enough logic that
  a single internal `useBacklogState({ persistTo: 'url' | 'memory' })`
  hook would be cleaner — left for a future cleanup pass.

### Known gap (B-cluster follow-up)
- Backend `/api/projects/{id}/forecast/grid` does not yet read the
  `version` query, so the sandbox forecast view currently still
  reflects live-forecast cells. Frontend plumbing is in place; backend
  filter pass-through is the missing link. Tracked outside B2 scope
  per the plan's "Lever 12 sandbox storage pattern" rule.

## v5 Session B2 — T3 Impact Dashboard + Compare

Frontend slice for the What-If Simulator workspace (Zone 2 impact dashboard +
the dedicated Compare flow), per CRETA v5 spec lines 974–1067 and decisions
`[B-ID-01..03]` `[B-CV-01..05]` `[B-AC-02..03]`. Built in worktree
`v5/wave4-b2-t3` (off `v5/wave4-f6-e2-b2-merged`); awaits T1 → T2 → T3 → T4
sequential merge.

### Files added (T3-owned)

- `frontend/src/modules/simulator/lib/colorCoding.ts` — per-scenario palette
  (anchor + 3 scenarios; light + dark Tailwind tokens for header tint, cell
  tint, left border, dot, plus hex fallbacks for inline SVG)
- `frontend/src/modules/simulator/lib/impactTypes.ts` — narrow TS types for
  the B1 8-dimension impact response + Lever-12 cost-allocation overlay
- `frontend/src/modules/simulator/lib/dimensionHeadlines.ts` — shared
  headline-string derivation (arrows ▲▼ + +/- prefixes; no colour-only cues)
- `frontend/src/modules/simulator/useScenarioContext.ts` — read-only consumer
  hook stub (T1 owns canonical implementation; merge note in file header)
- `frontend/src/modules/simulator/workspace/impact/`:
  - `ImpactSummaryStrip.tsx` — 8-tile strip with stale dot per tile,
    Tier-3 People tile hidden (not greyed) for non-Tier-3 callers
  - `ImpactSummaryStripContainer.tsx` — wires strip to ScenarioContext
  - `ImpactTile.tsx` — accessible card with stale tooltip + active state
  - `ImpactDetailPanel.tsx` — single-open lazy-rendered detail panel
  - `ChangeSummaryFeed.tsx` — append-only real-time feed (dim 8) with
    category badges + per-action Tier-3 / Promoted markers
  - `dimensions/FinancialDimension.tsx` — anchor/scenario/delta KPIs +
    CapEx/OpEx + time-frame breakdown table
  - `dimensions/BacklogRankingDimension.tsx` — affected/removed counts +
    backlog sandbox CTA
  - `dimensions/CapacityDimension.tsx` — per-CC table with utilisation bars
    (over-100 amber tint), FTE delta column
  - `dimensions/PeopleDimension.tsx` — Tier-3 only; defense-in-depth
    `null` return when `!tier3Visible`
  - `dimensions/OutsourcingDimension.tsx` — internal/external split bar +
    twin total cards
  - `dimensions/InvestmentMixDimension.tsx` — per-hierarchy-node anchor /
    scenario / delta table
  - `dimensions/RunningCostDimension.tsx` — long-term cost-tail breakdown
  - `dimensions/CostAllocationDimension.tsx` — Lever-12 per-charging-location
    delta table + totals strip (acceptance criterion #10)
- `frontend/src/modules/simulator/compare/`:
  - `compareTypes.ts` — discriminated anchor / scenario column union
  - `ScenarioColumnHeader.tsx` — name + owner + anchor + status badge +
    diff count + stale icon, with per-scenario colour token application
  - `CompareToggle.tsx` — segmented "Show values / Show changes from anchor"
  - `CompareSelectionPage.tsx` — list with shared-anchor enforcement
    (mismatched rows disabled with tooltip; backend 409 is fallback)
  - `ComparePage.tsx` — shell + breadcrumb (Selection › Comparison › project
    › line) + state machine for L1 ↔ L2 ↔ L3 + anchor-mismatch error UI;
    fans-out per-scenario impact fetches and stitches with `/compare`
  - `PortfolioSummaryLevel.tsx` (L1) — 9-row × N-column summary
    (8 dimensions + cost-allocation), People row hidden for non-Tier-3
  - `ProjectComparisonLevel.tsx` (L2) — per-project rollup with toggle +
    click-to-drill chevrons
  - `LineLevelDetailLevel.tsx` (L3) — line-level scaffold with toggle;
    month-by-month detail deferred to workbench cross-link

### B1 endpoints consumed

- `GET  /api/scenarios/:id/impact?year=YYYY` → `ImpactDashboardResponse`
- `POST /api/scenarios/compare`               → project rollup
- `GET  /api/scenarios/:id/drill-down`        → wired through `scenariosApi.drillDown`
- `POST /api/scenarios/:id/recalculate`       → consumed via ScenarioContext (T1 owns wrapper)

T1 still needs to add the typed `getImpact` wrapper to `scenariosApi`; until
then `ComparePage.tsx` falls back to a direct `api.get` call so the page
works on a fresh checkout.

### Display + accessibility conventions honoured

- Per-scenario colour coding on column headers + cell tints + left borders
  (3-scenario palette: blue / pink / emerald, with light + dark variants)
- Directional indicators inline with arrows (▲▼) + +/- prefixes — never
  colour-only (CLAUDE.md accessibility rule)
- "Show values vs Show changes from anchor" toggle live at L2 + L3
- Stale dot on every impact tile (except Change Summary, which updates in
  real time and is never stale per spec line 1048)
- Stale icon on scenario column headers when an outdated anchor is detected
- Tier-3 redaction defense-in-depth: People tile removed entirely from the
  strip (not greyed), People row removed from L1 Compare, PeopleDimension
  renders `null` when `!tier3Visible`. Backend already redacts server-side.

### Tests + verification

- All T3 source files type-check clean against the project tsconfig
  (no errors in `modules/simulator/(lib|workspace/impact|compare)/`).
- Visual verification done at desktop viewport (1440 × 900) in light + dark
  themes via Playwright MCP using a temporary preview route mounting all
  components with stub data:
  - `w5-b2-t3-01-impact-strip-light.png` — 9-tile strip with stale dots
  - `w5-b2-t3-02-impact-financial-detail-light.png` — Financial detail
  - `w5-b2-t3-03-impact-capacity-detail-light.png` — Capacity (over-100 rows
    amber-tinted)
  - `w5-b2-t3-04-impact-cost-allocation-light.png` — Lever-12 per-location
    deltas
  - `w5-b2-t3-05-compare-l1-light.png` — Compare L1 portfolio summary
  - `w5-b2-t3-06-compare-l2-light.png` — L2 "Show values"
  - `w5-b2-t3-07-compare-l2-changes-light.png` — L2 "Show changes from anchor"
  - `w5-b2-t3-08-change-summary-feed-light.png` — append-only feed
  - `w5-b2-t3-09-impact-strip-tier3-redacted-light.png` — People tile gone
  - `w5-b2-t3-10-impact-strip-dark.png`
  - `w5-b2-t3-11-compare-l1-dark.png`
  - `w5-b2-t3-12-compare-l2-dark.png`
  - `w5-b2-t3-13-impact-financial-detail-dark.png`
  - `w5-b2-t3-14-compare-l3-dark.png` — line-level scaffold with toggle
- The temporary preview route + file (`__t3-preview.tsx`) was reverted
  before the final commit.

Wave 2 merged: F3 (+125 tests) + C1 (+94 tests) + A6 frontend brought backend baseline to 1007 tests.
Previous: A5 (intake workflow + backlog integration backend, +68 tests) + F2 (ChargeableEntity polymorphic root + Stage 1 Distribution backend, +116 tests) + D3 (admin frontend, 5-section nav + Cluster F panels + workflow editor + audit V2 + scheduled changes) + A7 (Tech Navigator scoring rubric UI). 788 backend tests at end of Wave 1.
Next: Wave 4 — **B2** (frontend simulator workspace) remaining.
**Post-merge requirement on first pull:** drop `creta_demo.db` and re-seed (`rm backend/creta_demo.db && python main.py && curl -X POST .../api/admin/reset-demo`) — F3's BTC + RollupCache tables, C1's `is_provisional` column on `forecasts`, B1's Scenario column additions, and E1's progress tracker columns + new tables all require schema regeneration. F6 + E2 add no schema changes (read-only endpoints + new frontend tile/tab); no further DB reset required for Wave 4.

## v5 Session B2 — T1 Shell + Context + Manager (2026-04-29)

T1 slice of the four-team B2 simulator rebuild. Owns the cross-cutting
infrastructure (T2/T3/T4 depend on this), the manager pages, the workspace
shell (header, sandbox border, sidebar host), the apply-to-forecast flow,
the change-summary drawer, and the route swap at `App.tsx`.

### Files added
- `frontend/src/modules/simulator/SimulatorRouter.tsx` — replaces
  `WhatIfSimulator.tsx`. Routes: `/simulator`, `/scenarios/:id` (workspace),
  `/scenarios/:id/surface/:surfaceKey/:entityId?` (T2 reads URL params),
  `/scenarios/:id/promote` (T4 placeholder), `/compare/...` (T3 placeholder).
- `frontend/src/modules/simulator/ScenarioContext.tsx` +
  `useScenarioContext.ts` — provider-based store with reducer. Single
  source of truth for scenario id + version, detail, impact, stale flag,
  optimistic change-summary feed. Mutations cover the full B1 surface
  (CRUD, lifecycle, action apply/remove/reorder, all 6 Lever 12 endpoints,
  recalc, promote preview/execute, apply-to-forecast).
- `frontend/src/modules/simulator/lib/scenarioVersion.ts` — single source of
  truth for the `'scenario-{id}'` sandbox version string per `[F-S1-04]`.
  Exports `FORECAST_VERSION`, `buildScenarioVersion`, `parseScenarioVersion`,
  `isScenarioVersion`, `resolveVersion`. T2 surfaces import from here.
- `frontend/src/modules/simulator/lib/cellDiffHelpers.tsx` — extracted
  `lookupDelta` + `renderDeltaIndicator` from
  `MixedGranularityGrid.tsx:226-244`. T2 will refactor MixedGranularityGrid
  to import from this module.
- `frontend/src/modules/simulator/lib/{changeSummary,routingLabels,colorCoding}.ts`
  — shared label / formatting helpers (T3 fills colorCoding further).
- `frontend/src/modules/simulator/permissions/` — `useTier3` (reads
  `RoleContext.tier3_flag`, falls back to `impact.tier3_visible`),
  `useCanPromote` (controller-only), `useCanApplyToForecast` (PL-only),
  `useCanCreateScenario` (controller / executive / CC Owner per `[E-06c]`),
  `ccOwnerScope` (`filterProjectsForCcOwner`, `filterLeversForCcOwner`).
- `frontend/src/modules/simulator/flags/advisorFlag.ts` — build-time gate
  `VITE_ENABLE_AI_ADVISOR`. v4 advisor moved to `advisor/` and mounted via
  lazy-loaded `AdvisorMount.tsx` (uses separate `useAdvisor()` hook so the
  flag-off path renders zero advisor DOM and does not import the v4 panel).
- `frontend/src/modules/simulator/api/scenariosApi.ts` — ~30 typed wrappers
  covering CRUD / lifecycle / actions / Lever 12 / impact / promote /
  apply-to-forecast / advisor. T1 sole owner per the Wave-3 conflict-pattern
  lesson (T2/T3/T4 request additions through SendMessage at checkpoints).
- `frontend/src/modules/simulator/manager/{ScenarioManagerPage,
  MyScenariosTable,PublishedScenariosTable,ScenarioRow,
  CreateScenarioModal,RebaseModal,TagFilterBar,ArchivedToggle}.tsx` —
  v5 manager with tags, archived toggle, rebase, publish/unpublish,
  visibility (private / Tier 3 / all-users) badges, CC-Owner-aware Create
  modal.
- `frontend/src/modules/simulator/workspace/ScenarioWorkspacePage.tsx`,
  `SandboxBorder.tsx`, `header/{ScenarioHeader,StatusBadge,RecalculateButton,
  StaleIndicator}.tsx`, `sidebar/WorkspaceSidebar.tsx` — 3-zone shell with
  amber sandbox border + banner, ScenarioHeader with stale indicator +
  Recalculate, lifecycle dropdown, Apply-to-forecast (PL), advisor button
  (gated). Sidebar host with collapsible Projects / Backlog / Portfolio
  Settings / Resources (Tier-3 hidden DOM) / Bulk Actions sections — T2/T4
  fill the bodies.
- `frontend/src/modules/simulator/drawer/{ChangeSummaryDrawer,DiffEntry,
  PromoteApplyButtons}.tsx` — slide-in change-summary feed with
  per-entry remove and Promote slot footer (T4 fills).
- `frontend/src/modules/simulator/apply-to-forecast/{ApplyButton,
  ApplyConfirmModal}.tsx` — PL-only confirm modal with two phases
  (confirm → result summary with carried/skipped counts and provenance note).
- `frontend/src/modules/simulator/{compare,promote}/Placeholder.tsx` —
  reserve the routes while T3 / T4 are in flight.

### Files removed (replaced wholesale)
- `frontend/src/modules/simulator/WhatIfSimulator.tsx`
- `frontend/src/modules/simulator/useScenarioState.ts`
- `frontend/src/modules/simulator/comparison/` (3 files)
- `frontend/src/modules/simulator/drilldown/` (1 file)
- `frontend/src/modules/simulator/manager/` v4 trio
- `frontend/src/modules/simulator/workspace/` v4 (7 files)

v4's `advisor/` is preserved verbatim per plan.

### Backend
Single backend patch per the B2 plan: `RoleContext` now exposes
`tier3_flag` resolved from `User.tier3_flag` looked up by `person_id`
(`backend/routers/global_launchpad.py` + `backend/schemas/global_launchpad.py`).
Falls back to False when no active User row exists. Frontend types mirror
the new field as optional for backward compat.

### App.tsx route swap
`/simulator/*` now mounts `<SimulatorRouter />` instead of v4's
`<WhatIfSimulator />`.

### Verification
- Backend: 1283 tests pass (unchanged baseline).
- Frontend `tsc -b --noEmit`: 82 errors total — same as the pre-existing
  baseline on main; **zero** new errors from the T1 file set.
- Visual verification (light + dark, screenshot prefix `w5-b2-t1-`):
  manager page (`01-manager-light`, `03-manager-dark`), workspace shell
  (`02-workspace-light`, `04-workspace-dark`), compare placeholder
  (`05-compare-placeholder-dark`). All semantic Tailwind classes; no
  hardcoded colors; sandbox border uses amber-300 / amber-700/60 with
  matching bg variants per the dark-mode rule in CLAUDE.md.

### Still owned by T2 / T3 / T4
- T2: 17 sandbox surfaces + scenarioVersion prop threading on
  MixedGranularityGrid / EntityBTCProfileEditor / RollupView /
  EntityDistributionEditor / Backlog. Sidebar bodies for Projects /
  Backlog / Portfolio Settings.
- T3: Impact dashboard (8 dimensions) + Compare (selection + 3 levels
  + color coding).
- T4: Catalogue (21 actions) + Promote workflow + Resources / Bulk Actions
  sidebar bodies + 2 Tier-3 surfaces (PeopleMaster, CapacityParameters).

## v5 Session B2 — T4 Catalogue + Promote

### Scope
Frontend-only slice of the v5 Cluster B What-If Simulator rebuild. T4 owns the **catalogue** of 23 bulk actions, the **Promote workflow** UI, the two **Tier-3 surfaces** (PeopleMaster, CapacityParameters), and the two **Tier-3 sidebar sections** (BulkActions, Resources). Backend reused as-is — the single dispatch endpoint `POST /api/scenarios/:id/actions` (`backend/routers/scenarios.py:536`) routes every catalogue action through `services/scenario_engine.py::_apply_action`, and the Promote workflow consumes `POST /:id/promote/preview`, `POST /:id/promote`, and `GET /:id/promotions`.

### What landed
- **`catalogue/` (full)** per `[B-ES-01]`:
  - `types.ts` — `ActionDefinition` / `FieldDefinition` / `LeverCategory` / `ActionTier`
  - `catalogueDef.ts` — all 23 actions across 4 categories (10 project-level, 7 portfolio rules, 2 target-setters, 4 restructuring Tier 3); `visibleActions(hasTier3)` removes restructuring entries entirely from the array (hidden DOM, not disabled)
  - `ActionForm.tsx` — single shared scaffold rendering any `ActionDefinition` into a project picker (when scope=project) + dynamic field stack (number / percent / currency / month / select / multi-select / textarea) with `dependsOn` visibility + lazy reference fetch (`referenceApi`, `adminApi.getActiveHierarchy()`)
  - `BulkActionsPanel.tsx` — tile grid grouped by category; selecting a tile reveals the form; restructuring section filtered for non-Tier-3
  - 23 thin per-action wrappers via `makeCatalogueWrapper` for deep-linking + per-action customisation hooks: `projectLevel/{RemoveProject,PauseProject,DelayProject,AccelerateProject,ScaleBudget,ChangeSourcingMix,SetTerminationDate,CloneProject,AdjustVendorContract,ChangeExternalRate}`, `portfolioRules/{CutByHierarchy,CutByType,CutByTransformation,AcrossTheBoardCut,FreezeNewStarts,ApplyEscalation,AdjustRateTable}`, `targetSetters/{OutsourcingTarget,InvestmentMixTarget}`, `restructuring/{RemoveRole,ReduceHeadcount,RelocateTeam,HireBlock}`
- **`workspace/sidebar/`** per `[B-AC-02]`:
  - `BulkActionsSection.tsx` — host that mounts `BulkActionsPanel`
  - `ResourcesSection.tsx` — Tier 3 only; returns `null` entirely when `!hasTier3` (hidden DOM); renders 2 surface shortcuts + 4 restructuring action shortcuts
- **`surfaces/` (Tier 3 only)** co-located with restructuring actions:
  - `PeopleMasterSurface.tsx` — returns `null` when `!hasTier3`; renders the 4 restructuring actions inline as collapsible details
  - `CapacityParametersSurface.tsx` — returns `null` when `!hasTier3`; inline form for overriding hours/FTE/month per location, submitting as `action_type='capacity_param_change'` lever_category=`'capacity_param'` tier=3 → routes to `capacity_param_update` at Promote
- **`promote/` (full)** per `[B-PR-01..06]`:
  - `routingLabels.ts` — labels + descriptions + Tailwind colour classes for the 12 routing types (`direct_forecast_update`, `change_request`, `doi_gate_check`, `tech_navigator_direct`, `tech_navigator_send_back`, `rate_table_update`, `people_action_item`, `budget_envelope_update`, `hypothetical_to_proposed`, `hierarchy_update`, `cost_allocation_update`, `capacity_param_update`, plus `no_route` for target-setters); plus `ROUTING_CATEGORY_LABEL` grouping for the diff selector
  - `PromotedBadge.tsx` — small marker for already-promoted actions
  - `PromoteEnter.tsx` — header / drawer entry button; hidden DOM for non-controllers (`useCanPromote()`); disabled with rebase tooltip when anchor stale or scenario archived
  - `DiffSelector.tsx` — category-grouped checkbox picker per `[B-PR-03]`: per-diff checkboxes + select-all PER CATEGORY + NO global select-all; already-promoted rows are visible but unselectable; routing badge + target_id + requires_review + permission_ok flag inline
  - `RoutingPreview.tsx` — compact table of the chosen subset for pre-confirm review
  - `PromoteConfirmModal.tsx` — confirm dialog with optional notes textarea (recorded on `ScenarioPromotion` audit row); calls `promoteExecute(action_ids, notes)`
  - `PromoteAuditDrawer.tsx` — right-side sheet listing past promotions via `GET /api/scenarios/:id/promotions`
  - `PromoteReviewPage.tsx` — full-page orchestrator: fetch preview → DiffSelector → routing preview → confirm modal → post-execute summary; rebase prompt rendered when preview returns 409 stale-anchor

### Files
**New:** `frontend/src/modules/simulator/catalogue/{types.ts, catalogueDef.ts, ActionForm.tsx, BulkActionsPanel.tsx, wrapper.tsx}` + 23 per-action wrappers in 4 sub-folders + 4 barrel `index.ts` files; `frontend/src/modules/simulator/workspace/sidebar/{BulkActionsSection.tsx, ResourcesSection.tsx}`; `frontend/src/modules/simulator/surfaces/{PeopleMasterSurface.tsx, CapacityParametersSurface.tsx}`; `frontend/src/modules/simulator/promote/{routingLabels.ts, PromotedBadge.tsx, PromoteEnter.tsx, DiffSelector.tsx, RoutingPreview.tsx, PromoteConfirmModal.tsx, PromoteAuditDrawer.tsx, PromoteReviewPage.tsx, index.ts}`. Plus a temporary visual-verification harness at `frontend/src/modules/simulator/__t4_preview/T4PreviewPage.tsx` + 2 routes in `App.tsx` (both flagged `TEMP — removed at lead merge`).

### API consumption
- `POST /api/scenarios/:id/actions` (single dispatch — all 21 catalogue actions)
- `POST /api/scenarios/:id/promote/preview` + `POST /api/scenarios/:id/promote` + `GET /api/scenarios/:id/promotions`
- `referenceApi.{getRoles,getCostCenters,getLocations,getCostTypes}` + `adminApi.getActiveHierarchy()` (lazy-loaded by `ActionForm` on first relevant field)

### Tier 3 security pattern
`useTier3()` from T1's permission hooks reads `RoleContext.tier3_flag` with defensive fallback to `impact.tier3_visible`. Every Tier-3 surface returns `null` when `!hasTier3` — no DOM rendered, never a disabled state. Restructuring actions are filtered out of `visibleActions(false)` so their tiles never appear in the catalogue. Backend redacts the `people` impact dimension and Tier-3 actions independently for defense in depth.

### Verification
- T4 files type-check clean (`tsc -b` reports zero errors in `modules/simulator/{catalogue,promote,surfaces,workspace/sidebar,__t4_preview}`).
- Pre-existing baseline TS errors unchanged: `workbench/forecast/useForecastCycle.ts`, `workbench/overview/ProjectTimelineChart.tsx`, `workbench/submission/SubmissionDiffView.tsx` (called out in Current Status as deferred).
- **Visual verification (`w5-b2-t4-*` screenshots) deferred to lead's merge smoke walk** (Task #5). Both Playwright and Chrome DevTools MCP browser instances were locked by other teammates throughout the T4 build; the temp `/__t4-preview` route is wired so the lead can navigate the catalogue grid (Tier-3 visible vs hidden), Promote review page, routing preview, and confirm modal in seconds against the stub ScenarioCtx.Provider.

### Refactoring opportunities (not yet picked up — leave for a future session)
- `backend/services/scenario_engine.py::recalculate_scenario` and `get_scenario_state` do not include `lever_category`, `tier`, or `promoted_at` in the serialised action list. The router-level redaction filter at `routers/scenarios.py:480-485` already references those fields, suggesting a serialisation gap. Adding them is a one-line additive change that would make the Promoted badge work on the integrated workspace without re-querying the promote audit.


## v5 Session F6: Workbench BTC Tile + Workbench BTC Tab (2026-04-29)

### Feature Overview
Per `[E-09]`: project leads, controllers, executives and CC owners now see a
project's Business-Transfer Charging story directly inside the Project
Workbench. Removes the friction of jumping into the Charging & Allocations
module to inspect or edit a single project's BTC profile.

- **Workbench Overview BTC tile** (Overview tab, after CapEx/OpEx + Resource
  Summary block):
  - Headline: To-Business € amount + percentage of effective cost
  - Top 3 charging locations rendered with horizontal % bars
  - "+N more — open BTC tab" CTA → switches to BTC tab
  - Empty states for missing chargeable entity, no business charging
    (`to_business_pct === 0`), and no profile yet
- **Workbench BTC tab** — new third tab in `ProjectWorkspace`:
  - Tab label flips between **Cost Allocation** (BTC) and **Distribution**
    (when entity has zero To-Business share)
  - Section 1: Refactored `EntityBTCProfileEditor` mounted with
    `(entityId, year)` instead of the legacy `profileId`
  - Section 2: Allocation breakdown table — sortable columns (location,
    region, country, division, %, amount), each row is clickable and
    drills into upstream-cost contributors via the existing
    `/rollup/charging-location/{cl_id}` endpoint
  - Section 3: Audit history reusing `adminD3Api.getEntityAuditTrail`
- **Distribution-only fallback**: when `to_business_pct === 0` the BTC
  tab renders the entity-keyed `EntityDistributionEditor` inline with an
  explanatory blue banner

### Spec references implemented
`[E-09]` (Workbench BTC tile + tab in full).

Out of scope per session plan: scenario-aware BTC overlays in the Workbench
(Lever 12 sandbox view — covered by simulator UI in B2), per-month BTC
allocation timeseries, BTC delta vs prior version (out-of-band feature
request, not in spec).

### Technical Details

**Backend (3 new endpoints + 1 service helper, 20 tests)**
- `GET /api/charging/entities/{entity_id}/allocation-breakdown` — per-entity
  BTC allocation for a year. Returns the entity's effective cost, the
  business amount total (effective × to_business_pct ÷ 100), and one row
  per charging location in the active BTC profile with enriched
  region/country/division/legal-entity metadata. Sortable by amount,
  percentage, location, code, region, division, or country.
- `GET /api/charging/entities/{entity_id}` — read-only chargeable entity
  fetch accessible to all four roles (admin variant remains controller-only).
- `GET /api/charging/entities/by-project/{project_id}` — look up the
  ChargeableEntity row linked to a given project. Used by the Workbench
  to resolve project → entity without requiring controller permissions.
- `GET /api/charging/charging-locations` — read-only list of active
  charging locations accessible to all four roles. The admin equivalent
  remains controller-only for mutation paths.
- `services/rollup_query.query_entity_allocation_breakdown` — extends the
  existing rollup pipeline using the cache-backed `get_stage1_effective`.
  Groups one BTC profile's lines into a breakdown response with sorting.

**Schemas extended:** `schemas/rollup.py` adds
`EntityAllocationBreakdownRow` and `EntityAllocationBreakdownResponse`.

**Frontend (2 new components, 1 refactor)**
- `frontend/src/modules/workbench/btc/WorkbenchBTCTab.tsx` (new)
- `frontend/src/modules/workbench/overview/BTCAllocationTile.tsx` (new)
- `frontend/src/modules/charging/btc/EntityBTCProfileEditor.tsx` —
  discriminated union props: now accepts either `profileId` (legacy
  caller in `BTCProfileListView`) or `entityId + year` (new Workbench
  caller). 404-on-fetch shows a "no profile yet" panel rather than an
  error state.
- `frontend/src/modules/workbench/ProjectWorkspace.tsx` — fetches the
  linked chargeable entity once on load and conditionally registers the
  BTC tab. Tab label flips on `to_business_pct`.
- `frontend/src/api/endpoints.ts` — adds
  `chargingApi.getEntityByProjectId`, `getEntityAllocationBreakdown`,
  `listChargingLocationsReadOnly`. Aliases the chargingApi
  `ChargeableEntityItem` import to use the strict `types/api` variant
  (`'Change' | 'Run'`) rather than the loose `runPortfolio` type. This
  drops 9 baseline TS errors in F4/F5 charging components.
- `frontend/src/types/api.ts` — adds `EntityAllocationBreakdownResponse`,
  `EntityAllocationBreakdownRow`, `AllocationBreakdownSortBy` types.

**Tests (20 new)**
- `backend/tests/test_charging_entity_allocation_breakdown.py`:
  - 6 happy-path tests (response shape, amount calculation,
    region/country/division enrichment)
  - 2 empty-state tests (no profile, zero to_business_pct)
  - 1 not-found test
  - 4 sorting tests (default amount desc, percentage asc, location asc,
    region desc)
  - 4 role-gating tests (PL, exec, cc-owner, unknown persona)
  - 4 entity read-only / by-project tests
  - 2 sums-to-100 flag tests
- All other existing charging tests remain green (134 charging-related
  tests pass, 1210 in the full suite).

### Files Modified / Added
- `backend/routers/charging.py` (3 new endpoints + new RO charging-locations)
- `backend/services/rollup_query.py` (new query helper + dataclasses)
- `backend/schemas/rollup.py` (2 new response schemas)
- `backend/tests/test_charging_entity_allocation_breakdown.py` (new, 20 tests)
- `frontend/src/api/endpoints.ts` (4 new client methods)
- `frontend/src/types/api.ts` (3 new types)
- `frontend/src/modules/charging/btc/EntityBTCProfileEditor.tsx` (props refactor)
- `frontend/src/modules/workbench/ProjectWorkspace.tsx` (entity resolution + BTC tab)
- `frontend/src/modules/workbench/overview/OverviewTab.tsx` (mount BTC tile)
- `frontend/src/modules/workbench/overview/BTCAllocationTile.tsx` (new)
- `frontend/src/modules/workbench/btc/WorkbenchBTCTab.tsx` (new)

### Verification
- Backend: `python -m pytest tests/ -q` — **1210 passed** (1190 baseline + 20 F6).
- Frontend build: `npx tsc --noEmit` clean against new F6 files; baseline
  pre-existing errors reduced from 91 → 82 due to type alias fix.
- Visual verification: Playwright at viewport 1440 in light + dark across
  Controller and Executive personas. 13 screenshots captured (prefix
  `w4-f6-`).

## v5 Session E2: Backend External Cost Aggregation + Launchpad Role Tiles (2026-04-29)

### Feature Overview
- **External cost aggregation** per `[E-08a]`–`[E-08d]`: five new endpoints surface vendor and category totals at project and portfolio scopes. Reuses `_get_scoped_project_ids` from `report_service` so role visibility behaves identically to the existing Vendor Spend report.
- **Launchpad role-personalised tiles** per `[E-06d]`–`[E-06j]`: `GET /api/launchpad/tiles` returns 7 PL tiles, 9 Controller tiles, 8 CC Owner tiles, 7 Executive tiles. Tile shape (`tile_id`, `title`, `primary_metric`, `secondary_metric`, `link_module`, `link_entity_id`, `link_tab`, `tone`) is identical across roles so the front-end renders all tiles with one component.
- **PL capacity read-only** per `[E-06a]`: `GET /api/capacity/role-availability?location_id=&role_type_id=&month_from=&month_to=` returns aggregated `(role, location, month)` rows with headcount, allocated hours, available hours, and utilisation %. **No person identifiers or names** appear in the response — verified by negative assertion in tests for both PL and Controller payloads.

### Backend deliverables
- **New endpoints** (7 total):
  - `GET /api/workbench/projects/{id}/external-costs/vendor-summary`
  - `GET /api/workbench/projects/{id}/external-costs/category-rollup`
  - `GET /api/portfolio/external-costs/vendor-summary`
  - `GET /api/portfolio/external-costs/category-analysis`
  - `GET /api/portfolio/external-costs/project-vendor-matrix`
  - `GET /api/launchpad/tiles`
  - `GET /api/capacity/role-availability`
- **New service** `services/external_cost_aggregation.py` — five top-level helpers (project + portfolio scopes); reuses `_get_scoped_project_ids`. Project-level helpers do not call into the role-scoping helper because endpoint-level access checks are done in the router.
- **New schemas** `schemas/external_costs.py` (`VendorSummaryItem`, `CategoryRollupItem`, `PortfolioVendorSummaryItem`, `PortfolioCategoryAnalysisItem`, `ProjectVendorMatrixCell`, `ProjectVendorMatrixResponse`).
- **Extended schemas**:
  - `schemas/global_launchpad.py`: `TilePayload`, `TilesResponse`.
  - `schemas/capacity.py`: `RoleAvailabilityRow`, `RoleAvailabilityResponse`.
- **Tile metric helpers** (`_build_tiles_for_pl/controller/cc_owner/executive`): all reuse existing aggregation primitives (`compute_portfolio_kpis`, `pl_project_filter`, `FTE_HOURS`) — no duplicated math.
- **Project visibility helper** `_verify_project_visible` in `routers/workbench.py` — encodes the same scope rules the report service applies, surfaces 403 vs 404 correctly.

### Tests (+73, 1190 → 1263)
- `tests/test_router_external_costs.py` — **31 tests**. Five test classes: project vendor summary (9 tests covering Acme/AWS aggregates, internal-line filtering, year filter, PL ownership, PL forbidden cross-project, 404, no-auth, unknown persona), project category rollup (5), portfolio vendor summary (7 covering AWS in 2 projects, top_project ranking, year filter, exec read), portfolio category analysis (4 covering pct sums to 100), project-vendor matrix (6 covering grand total 61500.0).
- `tests/test_router_launchpad_tiles.py` — **23 tests**. PL/Controller/CCO/Exec tile counts (4) + tile content (12: shape, IDs, my-projects count, forecast warning, progress avg, pending reviews, pipeline count, scenario activity, headcount, top-risks alert) + auth/edge cases (5: no-auth 422, unknown persona 401, empty DB still returns counts, PL with no projects).
- `tests/test_router_capacity_role_availability.py` — **19 tests**. Shape + role gating across all four roles (6) + **NO person names** assertion (3, scanning payload bodies for "Anna"/"Thomas"/"Priya"/"Becker"/etc.) + aggregation correctness (5 testing exact Munich-dev 50% util, Budapest-dev 25%, QA 0%, multi-month, PM 100% in May) + filters (5 covering location, role, combined, invalid range 400, default 3-month range).
- All 1263 tests pass; no regression in 1190 baseline.

### Verification
- `python -m pytest tests/ -v`: 1263 passed in 110s.
- Curl spot-checks on a worktree backend (port 8765) for all four roles:
  - Controller tiles: 9 returned (€5,686,770 portfolio forecast, 13 forecast overdue, 2 pending reviews).
  - PL tiles: 7 returned (5 projects, €4,300,360 budget, 60% avg progress).
  - CC Owner tiles: 8 returned (41.9% util, 10 pending requests, 10 headcount).
  - Executive tiles: 7 returned (€5,686,770 KPI, Run 9% / Change 91%, 1 red / 4 amber).
  - Portfolio vendor summary: 54 vendors, AWS top with €484,500 across 9 projects.
  - Role-availability for PL: 31 (role × location × month) cells; payload body confirmed clean of person names.

## v5 Session B1: What-If Simulator Backend (2026-04-29)

### Feature Overview
- **Scenario lifecycle extended** per `[B-SL-01..05]`: anchor to a specific `ForecastVersion`,
  manual rebase to a newer cycle, soft archive (read-only, hidden from active list, clonable),
  free-text tags with multi-select filter, Tier 3 content gating on publish (Option C — defaults
  to "tier3_only" visibility when scenario contains Tier 3 diffs).
- **17+ editable surfaces** per `[B-ES-01]` — ScenarioAction `lever_category` + `tier`
  classification provides the foundation; B1 ships full implementation for forecast_grid,
  cost_allocation (Lever 12), people, rate_table, etc. Other categories accept actions
  through the generic `POST /actions` endpoint.
- **Lever 12 (Cost allocation rules) widening per `[B-OQ-01]` working assumption**:
  - Stage 1 distribution edges fork lazily into `Distribution.version='scenario-{id}'`
    on first mutation; live `forecast` rows never touched.
  - Stage 2 BTC line + `to_business_pct` mutations stored as `ScenarioAction` overlays
    (live `BTCProfile` / `BTCProfileLine` rows untouched).
  - Cycle detection union-aware across anchor + scenario versions per `[F-S1-05]`.
  - Sum-rule per `[F-S1-02]` enforced via existing `distribution_service` helpers.
  - `compute_cost_allocation_impact()` returns per-charging-location deltas vs the anchor,
    re-running `dag_resolver.compute_effective_cost` on the sandbox state per `[F-RV-02]`.
- **8-dimension impact dashboard** per `[B-ID-01..03]`: financial / backlog_ranking /
  capacity / people (Tier 3 redacted) / outsourcing_ratio / investment_mix / running_cost /
  change_summary. Plus the Lever 12 widening: `cost_allocation` sub-section with
  per-charging-location deltas.
- **Promote workflow (controller-only)** per `[B-PR-01..06]`:
  - `assert_anchor_is_latest_cycle()` enforces `[B-PR-02]` rebase gate.
  - `decide_routing()` maps each diff to its native workflow (forecast_grid → direct
    update or change_request, pipeline_stage → DoI gate check, tech_navigator →
    direct or send_back, rate_table → admin path, people → action item, cost_allocation
    → direct mutation gated by RolePermissionGrant).
  - **Lever 12 promote materialises sandbox mutations on live entities** (Distribution,
    `to_business_pct`, BTC profile lines).
  - `[F-AC-01]` permission gating: controllers always allowed; other roles require
    explicit `RolePermissionGrant` row for `entity_type='btc_profile'` or `'distribution'`.
  - Selective per-action promotion via `action_ids`; `ScenarioAction.promoted_at` /
    `promoted_by_id` stamped; `ScenarioPromotion` audit row recorded.
- **PL Apply-to-forecast** per `[B-PR-05]`:
  - PL-only; controllers cannot use this path (they use Promote).
  - Filters to PL's own-project diffs in carry-forward categories
    (forecast_grid, milestone, people-on-own-project, sourcing_mix).
  - Stamps `Forecast.is_provisional=True` per `[B-OQ-02]` provenance pattern.
  - `ScenarioApplyToForecastEvent` audit row.
- **Role policy expansion**:
  - List/get/drill/compare/impact/cost-allocation-impact/promotions are accessible to
    all four roles with Tier 3 redaction + visibility check.
  - Create/metadata/publish/archive/rebase/actions: controller, executive, cost_center_owner.
    PL is intentionally excluded from creation per `[E-06c]`.
  - CC Owner creation auto-scopes to managed CC per `[E-06b]`; reject mismatch.
  - Lever 12 mutations: controller + executive (Tier 2).
  - Promote (preview + execute): controller-only per `[B-PR-06]`.
  - Apply-to-forecast: project_lead-only per `[B-PR-05]`.

### Spec references implemented
`[B-AC-01..03]` (three-role + three-tier access), `[B-ES-01]` (lever framework + Lever 12
widening), `[B-CA-01..04]` (catalogue actions — partial; existing v4 actions cover most),
`[B-SL-01..05]` (anchor/rebase/publish/archive lifecycle), `[B-PR-01..06]` (Promote workflow),
`[B-ID-01..03]` (impact dashboard + recalculation model), `[B-CV-01..05]` (compare —
shared-anchor enforcement added), `[B-OQ-01]` (Lever 12 promote with `[F-AC-01]` gate
working-assumption confirmed), `[B-OQ-02]` (Apply-to-forecast provenance visible to
controller — working-assumption confirmed), `[E-06b]` (CC Owner CC-scoped creation),
`[E-06c]` (PL read-only + Apply-to-forecast).

Out of scope per session plan: B2 frontend (simulator workspace UI, lever panels, comparison
view, scenario manager), AI Advisor production wiring (`[B-AI-01]`), inter-project dependency
data model (`[B-DEP-01]` — seeded to Cluster D), Monte Carlo / stochastic simulation,
NPV/IRR/payback engines (Tech Navigator covers payback already), automatic dependency
rescheduling, organisational structure changes in sandbox, planning parameter changes in
sandbox.

### Technical Details
- **Models extended (existing tables only — no rename):**
  `Scenario` adds `anchor_forecast_version_id` (FK), `rebased_from_version_id` (FK),
  `visibility` (`'private'|'tier3_only'|'all_users'`, server_default `'private'`),
  `tier3_content_flag` (Boolean, server_default `'0'`), `archived` (Boolean,
  server_default `'0'`), `archived_at`, `tags` (JSON Text), `last_recalculated_at`,
  `cc_owner_scope_cc_id` (FK to cost_centers).
  `ScenarioAction` adds `promoted_at`, `promoted_by_id`, `lever_category`, `tier` (server_default `'1'`).
- **New models:** `ScenarioPromotion` (per-promote audit), `ScenarioApplyToForecastEvent`
  (PL apply audit). All Integer counters carry `server_default='0'` so seed.sql INSERTs
  remain compatible.
- **New services (4):**
  `scenario_lever12.py` — sandbox distribution + BTC overlays + per-location impact.
  `scenario_impact.py` — 8-dimension dashboard + Tier 3 detection + stale flag.
  `scenario_promote.py` — anchor check + routing decisions + per-route appliers
  + `[F-AC-01]` permission gate.
  `scenario_apply_forecast.py` — PL eligibility filter + provisional-cell stamping.
- **Schemas extended:** 14 new request/response schemas appended to `schemas/scenarios.py`.
- **Router extended:** 13 → 28 endpoints registered in `routers/scenarios.py`.
- **Dependencies extended:** `dependencies.py::user_has_tier3()` looks up the persona's
  `User` row to read `tier3_flag` per `[D-AC-02]`.
- **READ-ONLY services preserved:** `services/rollup_cache.py`, `rollup_query.py`,
  `dag_resolver.py`, `btc_service.py`, `distribution_service.py` are not modified —
  B1 calls into them with scenario-scoped arguments (version='scenario-{id}').

### API Endpoints Added (15 new)
| Method | Path | Role | Purpose |
|--------|------|------|---------|
| PUT | `/api/scenarios/{id}/archive` | owner | Soft archive [B-SL-05] |
| PUT | `/api/scenarios/{id}/rebase` | owner | Re-anchor to newer cycle [B-SL-02] |
| POST | `/api/scenarios/{id}/lever12/distributions` | controller/exec | Stage 1 edge create [B-ES-01] |
| PUT | `/api/scenarios/{id}/lever12/distributions/{edge_id}` | controller/exec | Stage 1 edge update |
| DELETE | `/api/scenarios/{id}/lever12/distributions/{edge_id}` | controller/exec | Stage 1 edge delete |
| POST | `/api/scenarios/{id}/lever12/to-business` | controller/exec | to_business_pct overlay |
| POST | `/api/scenarios/{id}/lever12/btc-lines` | controller/exec | BTC line overlay |
| GET | `/api/scenarios/{id}/lever12/cost-allocation-impact` | all | Per-CL impact [F-RV-01..06] |
| GET | `/api/scenarios/{id}/impact` | all | 8-dimension dashboard [B-ID-01..03] |
| POST | `/api/scenarios/{id}/recalculate` | owner | Stamp last_recalculated_at |
| POST | `/api/scenarios/{id}/promote/preview` | controller | Preview routing decisions |
| POST | `/api/scenarios/{id}/promote` | controller | Execute selective promotion [B-PR-01..06] |
| GET | `/api/scenarios/{id}/promotions` | all | Promotion audit trail |
| POST | `/api/scenarios/{id}/apply-to-forecast` | project_lead | PL apply-to-forecast [B-PR-05] |

(13 v4 endpoints retained with extended request/response shapes.)

### Test counts
| File | Tests |
|------|-------|
| `test_scenario_lever12.py` | 26 |
| `test_scenario_impact.py` | 11 |
| `test_scenario_promote.py` | 17 |
| `test_scenario_apply_forecast.py` | 14 |
| `test_router_scenarios_b1.py` | 23 |
| **Total new** | **+91** |
| **Grand total** | **1098** |

### Lever 12 verification example (live, fresh seed)
```
Entity: ce-off-coll  (Offering, identifier IT00S556)
Anchor:  to_business_pct=90%, BTC split (DE-MUC, US-CHI, others)
         → €1,080,000 total to-business allocation across CLs

Scenario (B1 sandbox):
  POST /lever12/to-business  {"entity_id": "ce-off-coll", "year": 2026, "new_pct": 25}
  POST /lever12/btc-lines    {"entity_id": "ce-off-coll", "year": 2026,
                              "lines": [{"charging_location_id": "cl-cn-sha", "percentage": 100}]}

GET /lever12/cost-allocation-impact?year=2026 →
  totals: anchor=€1,080,000  scenario=€300,000  delta=-€780,000
  items:
    ce-off-coll @ CN-SHA-001  anchor=€0       scenario=€300,000   delta=+€300,000
    ce-off-coll @ DE-MUC-001  anchor=€583,740 scenario=€0         delta=-€583,740
    ce-off-coll @ US-CHI-001  anchor=€350,244 scenario=€0         delta=-€350,244

POST /promote (controller) →
  promoted=2  skipped=0  (both Lever 12 actions materialised on live data)
  Live ChargeableEntity.to_business_pct now 25.00% (was 90.00%).
  Live BTCProfileLine rows replaced with single CN-SHA-001 @ 100%.
```

### Schema changes requiring reseed
- `scenarios` table: 8 new columns (`anchor_forecast_version_id`,
  `rebased_from_version_id`, `visibility`, `tier3_content_flag`, `archived`,
  `archived_at`, `tags`, `last_recalculated_at`, `cc_owner_scope_cc_id`).
- `scenario_actions` table: 4 new columns (`promoted_at`, `promoted_by_id`,
  `lever_category`, `tier`).
- `scenario_promotions` table: new (B1 audit trail).
- `scenario_apply_to_forecast_events` table: new (B1 PL audit trail).

All non-nullable additions carry `server_default` so existing seed.sql `INSERT INTO`
statements remain compatible without modification.

## v5 Session E1: Backend Progress Tracker + ExternalCostCategory Verification (2026-04-29)

### Feature Overview
- **Progress tracker** per `[E-04c]`: milestone-anchored qualitative progress
  layer added on `Project`. Three core fields (intra-milestone progress %,
  status narrative, next-milestone confidence + reason) plus an optional
  per-milestone deliverable checklist (max 10 items). Live-editable; every
  forecast cycle automatically captures an immutable `ProgressSnapshot`
  alongside C1's `ForecastVersion`.
- **Auto-compute behaviour** per `[E-04c]`: when the current milestone has at
  least one deliverable, `effective_progress_pct` derives from the completion
  ratio (e.g., 4 of 6 = 66.67%). PL retains a manual override flag on
  `Project.progress_pct_manual_override`.
- **Confidence semantics** per `[E-04c]`: three-value enum
  (`on_track | at_risk | blocked`) normalised in the service. `at_risk` and
  `blocked` reject without a non-empty `confidence_reason`.
- **Cycle hook** per `[E-05a]`: `services.progress_tracker.capture_progress_for_cycle`
  fan-out called from `submit_forecast_cycle` after C1's
  `capture_versions_for_cycle`. Best-effort — exceptions don't block the
  cycle. Captured snapshot includes denormalised milestone descriptors plus
  the full deliverable checklist as JSON.
- **Portfolio aggregation** per `[E-04d]`: new `/api/portfolio/progress-aggregate`
  endpoint returns inline-indicator payload (project, milestone, %, confidence,
  RAG, has_progress_data flag) plus a confidence summary (on_track / at_risk /
  blocked / unreported counts). PL automatically scope-filtered.
- **ExternalCostCategory verification** per `[E-08e]` `[E-08f]`: D1 already shipped
  the entity (`ExternalCostType`) plus list/create/update endpoints; this
  session adds 17 dedicated tests covering the [E-08e] default demo set,
  CRUD lifecycle, audit-log shape, dup/404 constraints, and controller-only
  authorisation. No new endpoints or schema changes — the D1 surface meets
  the [E-08f] requirement as-is.

### Spec references implemented
`[E-04c]` (progress tracker fields + deliverables + snapshot lifecycle),
`[E-04d]` (portfolio inline indicator), `[E-05a]` (cycle hook),
`[E-05d]` (no-data semantics — burn line only when no progress reported;
honoured by ProgressResponse returning null effective pct when no data),
`[E-08e]` + `[E-08f]` (verification of D1's ExternalCostType admin CRUD).

Out of scope per session brief and aligned with E1 boundaries:
- All frontend (E3–E7 land later in Wave 3).
- Progress vs. Burn chart (E4 — frontend).
- Variance waterfall (E4 — frontend).
- Launchpad tile redesigns (E2/E3).

### Technical Details
- **Schema additions on `Project`** (all nullable, existing rows survive):
  `current_milestone_id` (FK with `use_alter=True` to break the create_all
  cycle), `progress_pct` (`Numeric(5,2)`), `progress_pct_manual_override`
  Boolean, `status_narrative` (Text), `next_milestone_confidence`
  (`String(20)`), `confidence_reason` (Text), `progress_updated_at`,
  `progress_updated_by_id` (FK people.id).
- **New table `milestone_deliverables`**: `id` PK, `milestone_id` FK
  (cascade-delete from milestone), `sequence` Integer, `text` Text,
  `is_complete` Boolean, `completed_at`, `completed_by_id` FK people.id.
- **New table `progress_snapshots`**: `id` PK, `project_id` FK,
  `cycle_label`, `cycle_id`, `snapshot_at`, `created_by_id`,
  denormalised `current_milestone_id` + `current_milestone_name` +
  `current_milestone_sequence`, plus all live progress fields and
  `checklist_payload_json` (Text — captures full per-milestone checklist
  state at snapshot time).
- **Relationship disambiguation on `Project`**: `pl` relationship now carries
  explicit `foreign_keys="Project.pl_person_id"` because Project has a
  second FK into `people.id` (`progress_updated_by_id`). `milestones`
  relationship carries `foreign_keys="ProjectMilestone.project_id"` and
  `ProjectMilestone.project` mirrors the `foreign_keys=[project_id]` constraint
  to break the new circular FK.
- **New service** `services/progress_tracker.py` (~430 LOC, 13 public
  functions): current-milestone derivation/resolution, checklist rollup,
  effective-pct computation, validated update (delta map for audit),
  snapshot capture + cycle fan-out, portfolio aggregation, response
  payload builder.
- **New schemas (11)** appended to `schemas/workbench.py`: `DeliverableItem`,
  `DeliverableListResponse`, `DeliverableCreateRequest`, `DeliverableUpdateRequest`,
  `CurrentMilestoneSummary`, `ChecklistRollup`, `ProgressResponse`,
  `ProgressUpdateRequest`, `ProgressSnapshotMeta`, `ProgressHistoryListResponse`,
  `ProgressSnapshotDetail`, `PortfolioProgressIndicator`,
  `PortfolioProgressAggregateResponse`. Constant `PROGRESS_CONFIDENCE_VALUES`.
- **New router endpoints (9)** appended to `routers/workbench.py`:
  - `GET /api/projects/{id}/progress`
  - `PATCH /api/projects/{id}/progress`
  - `GET /api/projects/{id}/progress/history`
  - `GET /api/projects/{id}/progress/history/{snapshot_id}`
  - `GET /api/projects/{id}/milestones/{mid}/checklist`
  - `POST /api/projects/{id}/milestones/{mid}/checklist`
  - `PATCH /api/projects/{id}/checklist/{item_id}`
  - `DELETE /api/projects/{id}/checklist/{item_id}`
  - `GET /api/portfolio/progress-aggregate` (new sub-router
    `progress_router = APIRouter(prefix='/api/portfolio')`).
- **Authorization**: read endpoints open to all authenticated roles;
  write endpoints (PATCH progress, POST/PATCH/DELETE checklist) require
  controller (any project) or PL (own project). `_can_edit_progress`
  helper mirrors the milestone editor's gate.
- **Audit log**: every write emits one entry per changed field with
  category `forecast_actions`. Entity types: `project_progress`,
  `milestone_deliverable`.
- **Seed helper** `_seed_progress_tracker_data()`: populates live progress
  state on three flagship projects (proj-erp2 / proj-sap / proj-iam) with
  realistic narratives, milestone-anchored checklists (15 deliverables
  total across 5–6 items each), and two historical snapshots per project
  (Q1 + Q2 2026 cycles → 6 snapshots). Registered in BOTH
  `seed_database()` AND `reset_database()` per the wave-2 lesson
  (commit 9b7aa6d).

### API Endpoints Added
| Method | Path | Role | Purpose |
|--------|------|------|---------|
| GET | `/api/projects/{id}/progress` | all | Read live progress + checklist rollup [E-04c] |
| PATCH | `/api/projects/{id}/progress` | controller / PL on own | Update narrative, confidence, reason, manual pct, current milestone [E-04c] |
| GET | `/api/projects/{id}/progress/history` | all | List snapshots newest-first |
| GET | `/api/projects/{id}/progress/history/{snapshot_id}` | all | Snapshot detail with checklist |
| GET | `/api/projects/{id}/milestones/{mid}/checklist` | all | List deliverable items |
| POST | `/api/projects/{id}/milestones/{mid}/checklist` | controller / PL on own | Add item (max 10) [E-04c] |
| PATCH | `/api/projects/{id}/checklist/{item_id}` | controller / PL on own | Update item |
| DELETE | `/api/projects/{id}/checklist/{item_id}` | controller / PL on own | Remove item |
| GET | `/api/portfolio/progress-aggregate` | all (PL scope-filtered) | Portfolio progress indicators [E-04d] |

### Test counts
| File | Tests |
|------|-------|
| `test_progress_tracker.py` | 43 |
| `test_router_progress.py` | 29 |
| `test_external_cost_category.py` | 17 |
| `test_cycle_submit_creates_progress_snapshots.py` | 3 |
| **Total new** | **+92** |
| **Grand total** | **1099** |

### Schema changes requiring reseed
- `projects` table: 8 new nullable columns (`current_milestone_id`
  with `use_alter=True`, `progress_pct`, `progress_pct_manual_override`,
  `status_narrative`, `next_milestone_confidence`, `confidence_reason`,
  `progress_updated_at`, `progress_updated_by_id`). All nullable so
  existing rows survive `create_all`, but the columns themselves are
  absent from any pre-E1 DB file until the file is dropped and the
  schema rebuilt.
- `milestone_deliverables` table: NEW. 9 columns; cascade-delete from
  `project_milestones`.
- `progress_snapshots` table: NEW. 14 columns including JSON checklist
  payload.

### Demo data
- 3 projects (proj-erp2, proj-sap, proj-iam) seeded with progress live
  state.
- 15 deliverable checklist items across the three current milestones.
- 6 historical snapshots (2 per project × 3 projects, Q1 + Q2 2026 cycles).
- Confidence narrative spans all three values: `at_risk` (proj-erp2),
  `on_track` (proj-sap), `blocked` (proj-iam) — gives every UI consumer
  realistic data to render.

### Branch
`v5/cluster-e/e1-progress-tracker` — 5 atomic commits.

### Refactoring opportunities
- The `pl` relationship now carries an explicit `foreign_keys` argument
  because Project gained a second FK into `people.id` (`progress_updated_by_id`).
  A future cleanup could fold this into a polymorphic "actor" column or a
  shared mixin once we collect a few more "who last touched this" fields.
- `MilestoneDeliverable.sequence` is contiguous-but-not-enforced — re-ordering
  endpoint deferred to the frontend session that needs it.

## v5 Session A8: Frontend pipeline stage UI + Run Portfolio sub-module (2026-04-29)

### Feature Overview
Surfaces the v5 pipeline stages and DoI levels across the application,
rewrites the intake flow to use the [A-DOI-04] lightweight create endpoint,
and restructures the Portfolio module into Change Portfolio + Run Portfolio
sibling sub-modules per `[E-11]`.

- **Shared components** in `components/shared/`: `PipelineStageBadge`,
  `DoIBadge`, `PipelineTransitionMenu`, `DoIGateChecklist`. All four are
  consumed by Backlog detail, Workbench overview, and the Portfolio Run
  sub-module. Colour mapping for all 9 stages and 6 DoI levels lives in
  `lib/pipelineStages.ts` (mirrors the backend's `services/pipeline.STAGES`).
- **`SubmitProjectDialog` rewrite** per `[A-BK-26]` / `[A-DOI-04]`. Uses
  `POST /api/intake/projects` instead of the v4 `POST /api/projects`. Adds
  project_type and capex/opex fields, removes the resource-plan navigation
  step, and routes the new project straight to `/backlog/{id}` so the PL can
  iteratively complete Tech Navigator scores and DoI-gate fields.
- **Portfolio module Change/Run sub-modules** per `[E-11]`. Pill switcher at
  the top of the module toggles between the existing Change Portfolio
  (Dashboard + CR Approvals) and the new Run Portfolio. The v4 "Intake
  Queue" tab is removed per `[A-PS-13]` / A8 acceptance criteria; the
  `/portfolio/intake` URL redirects to `/backlog`. Sub-module choice
  persists in localStorage.
- **Run Portfolio sub-module** per `[E-11]`. Single unified entity list
  with type filter (Project / Offering / InternalService), type-aware
  columns (identifier, name, annual cost, To-Business %, termination
  month), and a placeholder KPI strip (count, annual cost, To-Business
  share, mix). Project rows are clickable and drill into the workbench;
  Offering and InternalService rows wait for F6's Workbench BTC tab.
- **Pipeline-state surfacing** on Backlog DetailHeader and Workbench
  MetadataBar. Both render the shared StageBadge + DoIBadge pair, attach
  the controller `PipelineTransitionMenu` (Pause / Reactivate / Cancel /
  Re-open with override-reason dialog per `[A-PS-10]`/`[A-BK-30]`), and
  show the `DoIGateChecklist` (live missing-fields list) directly under
  the metadata.
- **Backlog filter alignment** — `BacklogFilterBar` stage options now match
  `[A-PS-02]` (Proposed, Under Evaluation, Approved, Active, Paused,
  Cancelled). Operate-stage rows are intentionally NOT in the backlog
  filter — they belong to the Run Portfolio.

### Spec references implemented
`[A-PS-01..13]` (stage state machine surfacing), `[A-DOI-01..11]` (DoI
indicator rendering, gate checklist), `[A-BK-26..30]` (intake create flow,
controller actions surfaced on detail), `[A-PS-13]` (Intake Queue removed
from Portfolio module), `[E-11]` (Change/Run sub-module restructure).

Out of scope per session brief and aligned with adjacent sessions:
- The Workbench BTC tab and per-entity Run Portfolio drill-down for
  Offering/InternalService — handed off to F6.
- The Run Portfolio Location Cost Rollup panels — handed off to F5.
- `/api/admin/chargeable-entities` access widening to executive role —
  pending follow-on (current session does not touch backend auth).
- Tech Navigator full inline scoring on the new project dialog — A7's
  rubric handles the post-creation flow; the dialog stays a [A-DOI-04]
  lightweight form.

### Files Created
- `frontend/src/lib/pipelineStages.ts` — stage + DoI constants and
  colour-class maps
- `frontend/src/components/shared/PipelineStageBadge.tsx`
- `frontend/src/components/shared/DoIBadge.tsx`
- `frontend/src/components/shared/PipelineTransitionMenu.tsx`
- `frontend/src/components/shared/DoIGateChecklist.tsx`
- `frontend/src/hooks/usePipelineState.ts`
- `frontend/src/types/pipeline.ts`
- `frontend/src/types/runPortfolio.ts`
- `frontend/src/modules/portfolio/run/RunPortfolioTab.tsx`

### Files Modified
- `frontend/src/components/shared/SubmitProjectDialog.tsx` — full rewrite
  to use `intakeProjectApi.create` + new project-type and capex/opex
  selectors
- `frontend/src/api/endpoints.ts` — adds `pipelineApi`,
  `intakeProjectApi`, `chargeableEntitiesApi`
- `frontend/src/modules/portfolio/PortfolioOverview.tsx` — Change/Run
  pill switcher, intake-tab redirect to `/backlog`
- `frontend/src/modules/backlog/BacklogProjectDetailPage.tsx` — passes
  `projectId` into the master-data tab
- `frontend/src/modules/backlog/components/detail/DetailHeader.tsx` — uses
  shared StageBadge + DoIBadge + transition menu
- `frontend/src/modules/backlog/components/detail/MasterDataTab.tsx` —
  surfaces the live DoI gate checklist at the top of the section
- `frontend/src/modules/backlog/components/BacklogFilterBar.tsx` — stage
  options aligned with `[A-PS-02]`
- `frontend/src/modules/workbench/overview/MetadataBar.tsx` — shared
  StageBadge + DoIBadge + transition menu + compact gate checklist
- `frontend/src/modules/workbench/overview/OverviewTab.tsx` — passes
  `projectId` to the metadata bar
- `frontend/src/lib/routes.ts` — drops the `/portfolio/intake` label and
  adds `/portfolio/run`
- `frontend/src/modules/launchpad/PendingActionsPanel.tsx` — intake-tab
  deep-links route to `/backlog/{id}`

### Verification
- TypeScript: 0 errors (unchanged from baseline)
- Visual verification: 13 Playwright screenshots in `a8-*.png` covering
  Portfolio Change view, Portfolio Run view (all entity types + project
  filter), Backlog detail header (stage badge, DoI badge, transition
  menu), Backlog Master Data tab (live gate checklist), Workbench
  Overview (stage + DoI + gate satisfied), and the new intake dialog
  (light + dark)
- Smoke test: `POST /api/intake/projects` creates a DoI 0 / Proposed
  project; the new row immediately surfaces on the workbench with the
  correct stage badge, DoI 0 badge, and "DoI 1 gate — 5 fields missing"
  checklist.

### Branch
`v5/cluster-a/a8-pipeline-run-portfolio` — 5 atomic commits.

### Refactoring opportunities
- The backlog cube tooltip and ranked-row inline stage text could swap to
  the shared `PipelineStageBadge` for full consistency. Out of scope for
  A8 (the row is space-constrained and the tooltip is non-badge text).
- The workbench `WorkbenchProjectListItem` API shape could surface
  `pipeline_stage` and `doi` so the project list panel renders stage +
  DoI badges without each item making a `GET /pipeline` round-trip. That
  is a backend shape change and was deferred to keep A8 frontend-only.



## v5 Session C2: Frontend — Mixed-Granularity Grid + Version Comparison UI (2026-04-29)

### Feature Overview
- **Mixed-granularity forecast grid** in the Workbench Forecast & Planning tab per
  `[C-FG-02]`: 12 monthly columns in the near zone, ~16 quarterly columns in the
  outer zone, with a clear blue boundary divider between them. Quarterly columns
  carry a subtle blue tint and a chevron handle so users can expand a quarter to
  reveal three synthesised monthly cells (equal-thirds distribution per
  `[C-FG-03]`).
- **Provisional cell markers** per `[C-FG-08]`: cells with `is_provisional == true`
  display a small amber dot with a tooltip explaining the value is system-generated
  (quarterly distribution, DoI 2 prepopulation, copy-from-project) and needs
  review. Single visual treatment regardless of source.
- **Version selector + delta overlay** per `[C-VC-03]`: a "Compare against" Select
  at the top of the grid lists all prior versions. Picking one fetches the diff
  via `GET /api/forecast/versions/{a}/diff/{b}` against the latest snapshot and
  overlays cell-level deltas (▲/▼ with amount) plus an amber "modified" ring on
  every changed cell.
- **Version history panel** per `[C-RH-01]`: collapsible card listing all
  versions newest-first with version number, type badge (`Cycle` / `CR` /
  `Manual`), cycle label or CR id, timestamp, accepting user, cell count, and
  total amount. Each row exposes a "Compare" toggle (sets the anchor for the
  inline overlay) and a "Detail" button (opens the comparison dialog).
- **Version comparison dialog** per `[C-RH-05]`: full-detail two-version diff
  with summary badges (modified / added / removed), grand-total delta, and a
  sortable table of every changed cell showing old → new amounts and delta.
- **Reuses C1 backend** unchanged: `GET /api/projects/{id}/forecast/grid`,
  `GET /api/projects/{id}/forecast/versions`, `GET /api/projects/{id}/forecast/versions/{vid}`,
  `POST /api/projects/{id}/forecast/versions`, `GET /api/forecast/versions/{a}/diff/{b}`.

### Files added (frontend, all in `frontend/src/modules/workbench/forecast/`)
- `MixedGranularityGrid.tsx` (~470 lines) — main grid component (read-mode).
  Two-row header (year span + month/quarter labels), zone-boundary 4px divider,
  quarter expand-into-months, provisional dot, delta overlay, internal/external
  groupings with subtotals + grand total.
- `VersionSelector.tsx` (~140 lines) — dropdown + status badges for the
  currently-active comparison anchor.
- `VersionHistoryPanel.tsx` (~190 lines) — collapsible list of all versions.
- `VersionComparisonDialog.tsx` (~220 lines) — full-detail diff dialog
  (`Dialog` from shadcn/ui).
- `useForecastVersions.ts` (~120 lines) — custom hook managing version list,
  compare-anchor state, and diff fetching with a cell-keyed `Map<string,
  CellDelta>` for fast O(1) overlay lookup.

### Files modified
- `frontend/src/types/api.ts` — 11 new exported types matching `schemas/workbench.py`:
  `MixedGridResponse`, `MixedGridColumn`, `MixedGridCell`, `MixedGridRow`,
  `ForecastVersionMeta`, `ForecastVersionListResponse`, `ForecastVersionDetail`,
  `ForecastVersionDiff`, `CellDelta`, plus `GridCellType` and
  `ForecastVersionType` enums.
- `frontend/src/api/endpoints.ts` — 5 new methods on `workbenchApi`:
  `getForecastGrid`, `listForecastVersions`, `getForecastVersion`,
  `createForecastVersion`, `getForecastVersionDiff`.
- `frontend/src/modules/workbench/forecast/ForecastTab.tsx` — replaced the v4
  `<ForecastGrid>` with the new mixed-granularity stack
  (`<VersionSelector> + <MixedGranularityGrid> + <VersionHistoryPanel>`)
  in read mode. The 5-phase wizard (`ForecastWizard` → `Phase3EditForecast`)
  is unchanged and still drives editing through the existing v4 monthly grid.

### Spec references implemented
`[C-FG-02]` mixed monthly+quarterly columns, `[C-FG-03]` quarterly→monthly
distribution (UI-only synthetic expansion), `[C-FG-07]` provisional flag
display, `[C-FG-08]` provisional marker, `[C-RH-01]` version list newest
first, `[C-RH-02]` version detail, `[C-RH-05]` cross-version diff,
`[C-VC-03]` Workbench F&P version selector + per-cell delta indicators,
`[C-FV-04]` version metadata display.

### Verification
- TypeScript strict typecheck passes (`npx tsc --noEmit`, exit 0).
- Visual verification via Puppeteer headless Chrome at 1440px–1700px width:
  light mode default + horizontal-scrolled (boundary divider visible) +
  comparison overlay (amber-ringed modified cells with green/red delta
  indicators) + version history panel showing v1 + v2 with Q1/Q2 2026 Cycle
  labels + comparison dialog showing all 117 modified cells with
  per-cell amounts. Same flow re-run in dark mode — semantic colour tokens
  hold up, quarterly tint and modified-cell highlight readable on dark
  background.
- Confirmed C1 verification facts from team-lead briefing:
  - 12 monthly + 16 quarterly columns rendered (`proj-erp2`,
    `proj-autobrake`).
  - 2 versions per project (`Q1 2026 Cycle`, `Q2 2026 Cycle`) listed in the
    panel newest-first.
  - Diffing them surfaces the ×1.05 uplift cells as `modified` (e.g.
    `proj-autobrake` total Δ −€45.84k across 117 cells).

### Known gaps / follow-ups
- **Phase3 wizard quarterly entry** — the cycle-wizard edit phase still uses
  the v4 monthly grid via `getForecast` + `saveEdits`. Quarterly entry with
  client-side equal-thirds distribution into three `ForecastChange` rows is a
  follow-on enhancement (separate session). The F&P read-mode grid is
  fully mixed-granularity.
- **Lint** — three new files trigger the repo-wide `react-hooks/set-state-in-effect`
  rule, matching the existing pattern in `Phase3EditForecast.tsx` and other
  legacy components. Not blocking (lint exits 0). Refactor to event-driven
  reducers can land alongside any future React 19 cleanup pass.

---
## v5 Sessions F4 + F5: Frontend — Charging & Allocations module (2026-04-29)

### Feature Overview
- **New top-level module** per `[E-10]`: "Charging & Allocations" placed after
  Portfolio in the navigation. Visible to all four roles. Sidebar pattern
  matches the Cluster D admin module per `[E-07c]`. Section state persists
  in `?section=…` query param (deep links + back/forward work).
- **Inter-service Distribution editor** per `[F-S1-01..05]` `[F-S1-03]`:
  - Cross-entity list view with filters (year, version, source type, search).
  - Single-entity edges-as-list editor with editable `to_business_pct`,
    derived self-retained %, sum-cap pre-check, and 409-cycle-chain rendering
    on save per `[F-S1-05]`.
  - Searchable destination picker (filterable by type) for new edges.
- **BTC Profiles editor** per `[F-S2-01..07]` `[F-MD-01]`:
  - Cross-entity list view with sums-to-100 indicator + filters (year, mode,
    status, entity type).
  - Single-entity manual mode: add-only line list with charging-location
    picker filterable by region/division per `[F-S2-02]`, sum-to-100 gate.
  - Single-entity automatic mode: read-only preview, "Refresh from UM" with
    diff dialog before commit per `[F-S2-04]`.
  - Mode change with values-visible warning per `[F-S2-05]`.
  - "New profile" dialog supports manual / automatic / copy-from per `[F-S2-07]`.
- **Location Cost Rollup** per `[F-RV-03..04]` `[F-RV-06]`:
  - **Map view:** static SVG world map (no tile service) with bubbles at
    country level; click → drills into the country's charging-locations.
    Bubble size = sqrt(cost / max), bubble color = dominant division. Hover
    popup with per-entity breakdown. Legend showing size scale + division
    palette.
  - **Tree-table view:** three pre-built rollup paths (Region→Country→Loc,
    Division→Loc, Country→Loc), pivot-direction-toggleable, cell drill-down
    to contributing entities + DAG upstream chains.
  - Year + version selectors at the top apply to both views.
- **Reporting integration** per `[F-RV-01]`:
  - AI Report Builder bridge with four pre-baked Cluster F prompts
    (cost-by-division, top-inflow-drivers, regional-YoY, blank builder)
    that navigate via `/reporting/builder?prompt=…`.
  - Catalogue cards listing every dimension (11) and measure (6) the data
    layer exposes.
  - Quick-jump tiles to existing standard reports that touch charging data.

### Spec references implemented
`[E-10]` (module navigation), `[F-DM-01..04]` (entity types in lists),
`[F-S1-01..05]` (distribution editor + cycle detection),
`[F-S2-01..07]` (BTC editor + refresh + mode change + copy),
`[F-RV-01..06]` (rollup map + table + drill-down + Report Builder bridge),
`[F-MD-01]` (LocationLabel disambiguation tooltips on charging-location
labels in the BTC editor and tree-table view).

Out of scope per F4/F5 plan: F6 (Workbench BTC tile/tab), F7 (Portfolio
Change/Run sub-module restructure), Lever 12 sandbox-bound mode of these
editors (B1).

### Technical Details
- New top-level module: `frontend/src/modules/charging/` — 13 files, ~3000 LOC.
  - `Charging.tsx` + `ChargingSidebar.tsx` — module shell with 4-section sidebar.
  - `distribution/DistributionListView.tsx` + `EntityDistributionEditor.tsx`.
  - `btc/BTCProfileListView.tsx` + `EntityBTCProfileEditor.tsx` +
    `CreateBTCProfileDialog.tsx`.
  - `rollup/RollupView.tsx` + `RollupMapView.tsx` + `RollupTreeTableView.tsx` +
    `useChargingRollupData.ts` + `countryCoords.ts` + `worldMapPaths.tsx`.
  - `reports/ReportingPanel.tsx`.
- New API client: `chargingApi` in `frontend/src/api/endpoints.ts` wrapping
  every Cluster F backend route (read + write). 19 new TypeScript types in
  `frontend/src/types/api.ts`.
- Backend changes — minimal:
  - `routers/global_launchpad.py`: registered `charging` module id with
    role visibility for all four personas, sort positions per spec
    placement, and a contextual metric ("N chargeable entities").
- Routes: `App.tsx` mounts `/charging/*` → `Charging` module. `routes.ts`
  registers the `/charging` route + four sub-section labels.
- Rollup data hook: `useChargingRollupData` does the cross-product
  `entity × cl` locally (`effective_cost × to_business_pct/100 × line_pct/100`)
  using one parallel call to entities + locations + active BTC profiles +
  per-entity rollup. This mirrors the backend's `get_stage2_location_total`
  formula and applies the BTC-only-on-To-Business-share rule per `[F-S2-08]`.
  Aggregations keyed by region / country / division / charging_location.
- SVG world map: 6-continent low-poly outline traced from a shared
  equirectangular projection (1000×500 viewport, lon ∈ [-180,180], lat ∈
  [-60,80]). 30-country centroid table for bubble placement. Map and
  bubbles share the same projection so they always align. Per `[F-RV-03]`
  the map is "one tile among several, not the hero" — detail level is
  intentionally coarse.

### Frontend Routes Added
| Route | Module | Notes |
|-------|--------|-------|
| `/charging?section=distribution` | Charging & Allocations | Inter-service Distribution editor |
| `/charging?section=btc` | Charging & Allocations | BTC Profiles editor |
| `/charging?section=rollup` | Charging & Allocations | Location Cost Rollup (map + table) |
| `/charging?section=reports` | Charging & Allocations | Report Builder bridge |

### Backend changes
- `routers/global_launchpad.py`: `charging` module added to MODULES, MODULE_VISIBILITY (all 4 roles), MODULE_SORT (after Portfolio for controller/exec, after Backlog for PL/CCO), and `_compute_module_metric` returns "N chargeable entities".

### Test counts
No new tests in this session — it's a frontend-only module assembly that
relies entirely on backend endpoints already covered by F2 + F3 tests.
Backend tests remain at **1007** passing.

### Frontend type-check delta
Baseline (post-Wave-2): 81 pre-existing TS errors (vendor / report-builder
recharts type drift). After F4 + F5: **81** — zero new errors.

### Files added (frontend only — no backend touched beyond launchpad metadata)
**Module:**
- `frontend/src/modules/charging/Charging.tsx`
- `frontend/src/modules/charging/ChargingSidebar.tsx`
- `frontend/src/modules/charging/distribution/DistributionListView.tsx`
- `frontend/src/modules/charging/distribution/EntityDistributionEditor.tsx`
- `frontend/src/modules/charging/btc/BTCProfileListView.tsx`
- `frontend/src/modules/charging/btc/EntityBTCProfileEditor.tsx`
- `frontend/src/modules/charging/btc/CreateBTCProfileDialog.tsx`
- `frontend/src/modules/charging/rollup/RollupView.tsx`
- `frontend/src/modules/charging/rollup/RollupMapView.tsx`
- `frontend/src/modules/charging/rollup/RollupTreeTableView.tsx`
- `frontend/src/modules/charging/rollup/useChargingRollupData.ts`
- `frontend/src/modules/charging/rollup/countryCoords.ts`
- `frontend/src/modules/charging/rollup/worldMapPaths.tsx`
- `frontend/src/modules/charging/reports/ReportingPanel.tsx`

**Modified:**
- `frontend/src/App.tsx` — `/charging/*` route.
- `frontend/src/lib/routes.ts` — `MODULE_ROUTES.charging` + 5 ROUTE_LABELS.
- `frontend/src/api/endpoints.ts` — `chargingApi` (~180 LOC).
- `frontend/src/types/api.ts` — 19 new interfaces (~190 LOC).
- `backend/routers/global_launchpad.py` — `charging` module registration.

### Visual verification
Playwright screenshots taken in both light + dark themes at 1440×900 viewport:
- Launchpad with the new tile.
- Distribution list view + single-entity editor (toBusinessPct + edges).
- BTC list view + single-entity editor (automatic mode showing sums-to-100,
  UM snapshot date, charging-location lines).
- Rollup map view (country bubbles + drill-down on Germany showing 13 lines).
- Rollup tree-table (Europe → Germany → Munich HQ €3.2M / Berlin €299K / …).
- Reporting panel with prompt buttons + dimension/measure catalogue.

### Branch + commits
- Branch: `v5/cluster-f/f4-f5-charging-frontend`
- 9 atomic commits split F4 (5) + F5 (4):
  - F4 1/5: register module in nav `[E-10]`
  - F4 2/5: charging API client + types
  - F4 3/5: module shell + sidebar + F5 stubs
  - F4 4/5: Inter-service Distribution editor
  - F4 5/5: BTC Profile editor
  - F5 1/4: rollup data hook
  - F5 2/4: SVG world map + bubble overlay
  - F5 3/4: tree-table + drill-down + tab switcher
  - F5 4/4: Reporting bridge

## v5 Session C1: Mixed-Granularity Forecast + Versioning (2026-04-29)

### Feature Overview
- **Mixed-granularity forecast grid** per `[C-FG-01..08]`: monthly columns within
  the boundary window (default 12 months), quarterly columns beyond it. Three
  `granularity` modes: `mixed` (default), `monthly`, `quarterly`. Boundary and
  horizon configurable via query params or `planning_parameters` DB rows.
- **`is_provisional` flag** per `[C-FG-07]`: `Boolean` column on `Forecast` with
  `server_default="0"` (keeps all existing seed.sql `INSERT INTO forecasts` rows
  valid). `True` for cells beyond the granularity boundary. Manual CR writes clear
  the flag back to `False` via a 1-line tweak in `_apply_cr_changes_to_forecast`.
- **Forecast versioning** per `[C-FV-01..07]`: new `ForecastVersion` table with
  sequential `version_number` per project (UniqueConstraint), payload stored as
  JSON (schema_version 1, ~70 KB/project). Three types: `cycle`, `cr_approval`,
  `manual`.
  - CR approval hook [C-FV-02]: 6 try-wrapped lines inserted in `approve_cr`
    after the final `db.commit()`. Snapshot failure cannot break CR flow.
  - Cycle hook [C-FV-05]: `capture_versions_for_cycle` fan-out called after
    `clear_cycle` in `submit_forecast_cycle`. Creates one version per active
    project with forecast rows.
  - Manual snapshot [C-FV-03]: controller-only `POST /api/projects/{id}/forecast/versions`.
- **Diff computation** per `[C-RH-05]`: pure-Python diff over decoded payloads.
  Status enum: unchanged / added / removed / modified. Cross-project diffs valid
  (version IDs are global PKs).
- **Seed helper**: `_seed_forecast_versions()` Python function in `seed/loader.py`
  creates 2 cycle versions per project: v1 = Q1 2026 Cycle (×1.05 uplift), v2 =
  Q2 2026 Cycle (current state). Called from `reset_database()`.

### Spec references implemented
`[C-FG-01..08]` (mixed-granularity grid, quarter bucketing, cent-remainder
distribution, provisional flag), `[C-FV-01..07]` (versioning lifecycle),
`[C-RH-01..05]` (list, detail, diff), `[C-VC-01..03]` (version_number, created_at,
created_by metadata).

Out of scope per plan: C2 frontend, `[C-VC-04..06]` (portfolio dashboard + report
builder dim + standard report 6), DoI 2 prepopulation (Cluster A), `is_provisional`
UI marker (C2), replacing `ForecastSnapshot` (kept for accuracy report).

### Technical Details
- **New model:** `models/financial.py::ForecastVersion` (18 columns,
  UniqueConstraint on `project_id × version_number`).
- **Column addition:** `Forecast.is_provisional` Boolean `server_default="0"`.
- **New service:** `services/forecast_versioning.py` — 14 public functions covering
  boundary math, quarter bucketing, grid build, serialization, capture, list/get, diff,
  and provisional marking.
- **Service additions:** `calculations.py::month_to_quarter_key`,
  `quarter_to_months`; `forecast_cycle.py::derive_cycle_label`.
- **New schemas:** 9 Pydantic models appended to `schemas/workbench.py`.
- **New endpoints (5):** `GET /api/projects/{id}/forecast/grid`,
  `GET /api/projects/{id}/forecast/versions`,
  `GET /api/projects/{id}/forecast/versions/{vid}`,
  `POST /api/projects/{id}/forecast/versions`,
  `GET /api/forecast/versions/{a}/diff/{b}`.
- **Separate router:** `forecast_router = APIRouter(prefix='/api/forecast')` defined
  in `workbench.py`, registered in `main.py` as `forecast_versions_router`.
- **Backwards compat:** `GET /api/projects/{id}/forecast` unchanged, v4 shape preserved.
- **Planning parameter:** `planning_horizon_months=60` added to `seed.sql`
  (`granularity_boundary_months=12` was already seeded by D1).

### API Endpoints Added
| Method | Path | Role | Purpose |
|--------|------|------|---------|
| GET | `/api/projects/{id}/forecast/grid` | all | Mixed-granularity grid [C-FG-02] |
| GET | `/api/projects/{id}/forecast/versions` | all | List versions newest first [C-RH-01] |
| GET | `/api/projects/{id}/forecast/versions/{vid}` | all | Version detail + payload [C-RH-02] |
| POST | `/api/projects/{id}/forecast/versions` | controller | Manual snapshot [C-FV-03] |
| GET | `/api/forecast/versions/{a}/diff/{b}` | all | Diff two versions [C-RH-05] |

### Test counts
| File | Tests |
|------|-------|
| `test_forecast_versioning_service.py` | 58 |
| `test_router_forecast_grid.py` | 12 |
| `test_router_forecast_versions.py` | 10 |
| `test_router_forecast_diff.py` | 5 |
| `test_cr_approval_creates_version.py` | 3 |
| `test_cycle_submit_creates_versions.py` | 3 |
| **Total new** | **+94** |
| **Grand total** | **882** |

### Schema changes requiring reseed
- `forecasts` table: `is_provisional` Boolean column (`server_default="0"` — existing
  rows survive schema creation but the old DB file must be deleted for the column to
  appear via SQLAlchemy `create_all`).
- `forecast_versions` table: new table (populated by Python seed helper on reset).
- `planning_parameters` table: 1 new row (`planning_horizon_months`).

### Expected DB growth (forecast_versions)
~70 KB/project × 30 projects × 5 cycles ≈ <40 MB. SQLite handles trivially per the
plan. No pruning is applied (`payload_json` is not compressed per `[C-FV-07]`).

### Refactoring opportunities
- `_apply_cr_changes_to_forecast` in `routers/portfolio.py` now has a `row.is_provisional = False` line inside a try/except that does partial field mutation. This is a v4-era pattern; C2 or a future cleanup could centralise forecast mutations via a service function.
- The `ForecastSnapshot` vs `ForecastVersion` dual-table setup is intentional (different consumers) but could be unified in a future data model simplification.

## v5 Session A6: Frontend Backlog Module (2026-04-29)

### Feature Overview
Full frontend Backlog module per `[A-BK-01..26]` `[A-TN-08..09]`:

- **Ranked List view** — paginated table with sort controls (rank / project name / composite score / budget), server-driven stage/type/size/T-level filters, within-cutoff toggle, `CutoffBand` rows inserted at `should_be_cutoff_rank` and `reality_cutoff_rank`, misalignment-zone tinting. Sort override suppresses bands and shows amber `ResetToRankingButton` banner.
- **Cube view** — Recharts `ScatterChart` 3-column grid (T0/T1/T2) with CSS custom property colors, bubble-size ∝ budget, click navigates to detail page, empty-state when no projects have T-level assigned.
- **`CutoffSummaryStrip`** — always shows portfolio-wide envelope metrics (Budget envelope, Contestable, Should-be cutoff, Reality cutoff, Horizon).
- **`BandJumpRail`** — sticky left rail with scroll-to-band anchor links (hidden when no bands present).
- **`BacklogProjectDetailPage`** (`/backlog/:projectId`) — 4-tab detail view (Scores & Ranking, Financial Overview, Master Data, Milestones). Tab state persisted via `?tab=` URL param.
  - **Scores & Ranking tab**: reuses A7's `TechNavigatorRubric` plus new `RankingPositionCard`.
  - **Financial Overview tab**: embeds workbench `OverviewTab` read-only.
  - **Master Data tab**: DoI-aware completeness checklist (cumulative requirements for DoI 0–N from `DoIRequirementsRegistry`), per-section breakdown, progress bar.
  - **Milestones tab**: read-only milestone strip (SVG timeline) + sortable milestone table.
- **`DetailHeader`** — back-navigation, project name + status badge, rank / DoI / cutoff / budget metadata strip.
- **Launchpad tile** — `backlog` module entry added to `global_launchpad.py` with metric "N projects above cutoff" (computed live from `Project.within_cutoff`), visible to all 4 roles.
- **`BacklogContext`** — URL-param-persisted view mode, filters, sort, and cutoff toggle. `useBacklog()` hook for consumers.
- **`BacklogFilterBar`** — stage / type / size / T-level dropdowns + within-cutoff toggle + Clear.

### Files Created
- `frontend/src/modules/backlog/BacklogContext.tsx` — context + provider + `useBacklog()` hook
- `frontend/src/modules/backlog/BacklogPage.tsx` — route shell, wraps provider
- `frontend/src/modules/backlog/BacklogProjectDetailPage.tsx` — `/backlog/:projectId` with 4-tab layout
- `frontend/src/modules/backlog/components/BacklogFilterBar.tsx` — filter bar
- `frontend/src/modules/backlog/components/CutoffSummaryStrip.tsx` — cutoff KPI strip
- `frontend/src/modules/backlog/components/ranked/RankedListView.tsx` — ranked list container
- `frontend/src/modules/backlog/components/ranked/RankedListTable.tsx` — table with band insertion + sort icons
- `frontend/src/modules/backlog/components/ranked/RankedRow.tsx` — row with type-ring left border
- `frontend/src/modules/backlog/components/ranked/CutoffBand.tsx` — full-width band row
- `frontend/src/modules/backlog/components/ranked/BandJumpRail.tsx` — sticky scroll-to-band rail
- `frontend/src/modules/backlog/components/ranked/ResetToRankingButton.tsx` — sort-override reset banner
- `frontend/src/modules/backlog/components/cube/CubeView.tsx` — cube grid wrapper
- `frontend/src/modules/backlog/components/cube/CubeScatterPanel.tsx` — Recharts ScatterChart per T-level
- `frontend/src/modules/backlog/components/detail/DetailHeader.tsx` — project detail header + back link
- `frontend/src/modules/backlog/components/detail/ScoresAndRankingTab.tsx` — scores tab with ranking card + rubric
- `frontend/src/modules/backlog/components/detail/RankingPositionCard.tsx` — rank / score / cutoff / DoI card
- `frontend/src/modules/backlog/components/detail/FinancialOverviewTab.tsx` — embeds workbench OverviewTab
- `frontend/src/modules/backlog/components/detail/MasterDataTab.tsx` — DoI completeness checklist
- `frontend/src/modules/backlog/components/detail/DoIRequirementsRegistry.ts` — static DoI→fields map
- `frontend/src/modules/backlog/components/detail/MilestonesTab.tsx` — milestone strip + table
- `frontend/src/modules/backlog/components/detail/MilestoneStrip.tsx` — SVG/CSS milestone timeline
- `frontend/src/types/milestones.ts` — TypeScript types for milestone API responses

### Files Modified
- `frontend/src/types/api.ts` — added `RankedProjectItem`, `CutoffLines`, `RankedBacklogResponse`, `IntakeQueueItem`, `CutoffLinesResponse`
- `frontend/src/api/endpoints.ts` — added `backlogApi`, `intakeApi`, `milestonesApi`
- `frontend/src/App.tsx` — added `/backlog` and `/backlog/:projectId` routes; removed stub route
- `frontend/src/lib/routes.ts` — added `backlog: '/backlog'` to `MODULE_ROUTES`; added `/backlog` label
- `backend/routers/global_launchpad.py` — added `backlog` module entry with `within_cutoff` metric

### Files Deleted
- `frontend/src/modules/backlog/BacklogDetailStub.tsx` — replaced by real detail page

### Key Design Decisions
- **Filter data flow**: server-side `pipeline_stage` / `project_type` / `tshirt_size` params narrow `items[]`; `within_cutoff` is client-side toggle; cutoff strip always shows portfolio-wide values.
- **Sort override semantics**: any column sort other than `rank` sets `hasSortOverride=true` which suppresses `CutoffBand` rows and misalignment tinting; `ResetToRankingButton` restores default order.
- **`Fragment key` pattern**: `<Fragment key={item.project_id}>` wraps conditional band rows + `RankedRow` to satisfy React's list-key requirement.
- **A8 collision avoidance**: `RankedRow` accepts an `actionCell?: React.ReactNode` prop slot (unused, reserved for A8 controller actions).
- **Recharts colors**: all chart/SVG colors use CSS custom properties (`var(--chart-1)`, `var(--chart-grid, hsl(var(--border)))`) — never hex values.

### Verification
- TypeScript: 0 errors
- Visual: 22 Playwright screenshots (11 light + 11 dark) covering launchpad tile, ranked list, filters, sort override, cube view, all 4 detail tabs, within-cutoff toggle, back navigation
- Dark mode: all components use semantic Tailwind classes; no hardcoded colors; status colors have `dark:` variants

### Branch
`feature/v5-a6-backlog-frontend` — 5 atomic commits. Merged locally into `main` 2026-04-29.

## v5 Session A5: Intake Workflow + Backlog Integration Backend (2026-04-28)

### Feature Overview
- **Greenfield intake** per `[A-BK-26..A-BK-29]` / `[A-PS-13]` / `[A-DOI-04..A-DOI-05]`. New project creation lands at DoI 0 (Proposed) with the lightweight metadata required by `[A-DOI-04]`; the project appears immediately in the ranked backlog at the bottom (composite score null per A3 ranking) and never enters a separate intake queue.
- **Three controller actions on Under Evaluation projects** per `[A-BK-27]`: Approve (→ Approved, DoI 3, baseline generation, status=active), Send Back (→ Proposed, DoI 1, snapshot capture, PL notified with deep link to diff view), Reject (→ Cancelled, DoI frozen, audit reason captured).
- **Send Back ↔ Resubmit cycle** per `[A-BK-29]`: PL on own project (or controller anywhere) can resubmit after Send Back. The resubmission moves the project back to `Under Evaluation` (DoI 2) and captures a `pl_resubmitted` snapshot for the diff view. Diff endpoint returns the structured before/after across the diffable Tech Navigator + master-data + milestone-count subset.
- **v4 intake surface fully removed**: nine `/api/portfolio/intake*` endpoints now return HTTP 410 Gone with structured replacement pointers — exactly per `[A-PS-13]`'s "v4 intake queue and CR Approvals flow will not be retrofitted onto the new pipeline model."
- **CR approval workflow unchanged** per spec line 418 ("CR Approvals tab remains unchanged for now (change requests are a separate workflow from intake)"). The existing `routers/portfolio.py::approve_cr` / `reject_cr` / `send_back_cr` endpoints stay put. Audit category tagging for those is flagged as a refactoring opportunity below.

### Spec references implemented
`[A-BK-26]`, `[A-BK-27]`, `[A-BK-28]`, `[A-BK-29]`, `[A-PS-13]`, `[A-DOI-04]`, `[A-DOI-05]` (gate fields are advisory at the create-time endpoint; structural enforcement remains in `services/pipeline.py::validate_doi_gate`). `[A-BK-14]` is honoured via the existing within_cutoff recompute hook on every state-changing endpoint.

Out of scope per session brief and aligned with A2 boundaries:
- `[A-DA-02]` structured description sub-fields — stays as a single `description` text column. Schema additions cross-cut intake forms and are deferred.
- `[A-DA-03]` new project columns (requesting BU, demand type, value stream, Wave ID) — deferred (same reason).
- `[A-PS-07]` auto-activation Approved → Active scheduler — outside session scope.
- `[A-BK-15]` separate `estimated_budget` column for pre-approval projects — Tech Navigator scores still drive the rank.
- Workflow Template enforcement (`[D-CAT-07]`/`[D-CAT-08]`) — D2 ships templates as configurable data; live execution lands in a follow-on session.

### Technical Details
- **Schemas:** `backend/schemas/intake.py` — six Pydantic models. `IntakeProjectCreate` (lightweight create body), `IntakeProjectResponse` (creation + transition response), `IntakeApproveAction` / `IntakeSendBackAction` / `IntakeRejectAction` / `IntakeResubmitAction` (action bodies), and `IntakeDiffField` / `IntakeDiffResponse` (diff payload).
- **Service:** `backend/services/intake_workflow.py` — 6 public functions plus a small set of helpers. `create_intake_project`, `approve_intake_project`, `send_back_intake_project`, `reject_intake_project`, `resubmit_intake_project`, `compute_intake_diff`. Side-effect helpers: `_capture_intake_snapshot` (re-uses `ProjectSubmissionSnapshot`), `_trigger_within_cutoff_recompute`, `_notify`. `DIFFABLE_FIELDS` constant defines the diffable subset (21 entries: master data + Tech Navigator + milestone count). Service does NOT commit — the router owns the transaction boundary.
- **Router:** `backend/routers/intake.py` mounted at `/api/intake`. 7 endpoints: `POST /projects`, `POST /projects/{id}/approve`, `POST /projects/{id}/send-back`, `POST /projects/{id}/reject`, `POST /projects/{id}/resubmit`, `GET /projects/{id}/diff`, `GET /queue`. Authorisation via `require_role("controller")` on the three controller actions; resubmit + diff use a custom check (PL on own project or controller); create allows project_lead/controller/executive (CC owner forbidden 403).
- **Snapshot reuse:** the existing `ProjectSubmissionSnapshot` table from v4 holds the new `controller_sent_back` and `pl_resubmitted` snapshot types. The `forecast_data_json` column carries the full project-state JSON (column name is a v4 vestige; we stuff the diffable subset there). Active flag respected — only the latest snapshot per type is surfaced by the diff endpoint.
- **Audit logging:** every state-changing call writes `category='pipeline_transitions'` (stage / DoI / comments / reason / resubmission notes) or `category='master_data'` (project create). Per the D2 contract, `_log_audit` is called with `category=` keyword-only.
- **within_cutoff recompute hooks (per `[A-BK-14]`):** triggered best-effort on create, approve, and reject (the three calls that change the contestable budget walk). Send Back / Resubmit do not change a project's budget so they skip the hook.
- **v4 deprecation:** `routers/portfolio.py` had ~750 lines of legacy intake code. All nine handlers were collapsed to one-liner stubs that raise `HTTPException(410, _V4_INTAKE_REMOVED_DETAIL)` with a structured `replacements` dict pointing to the new endpoints. `deprecated=True` on every decorator so OpenAPI surfaces the deprecation cleanly. The legacy bodies live in git history (commits `af4881a` and earlier).
- **No model changes.** All new state lives on existing columns: `Project.pipeline_stage`, `doi`, `frozen_doi`, `submission_feedback`, plus the existing `ProjectSubmissionSnapshot` rows.

## v5 Session F3: BTCProfile + Stage 2 + Rollup Data Layer + Cache (2026-04-29)

### Feature Overview
- **BTCProfile + BTCProfileLine models per `[F-S2-01]`** — two modes: `manual` (controller sets percentages directly) and `automatic` (derived from UM matrix snapshot). `UniqueConstraint(entity_id, year)` enforces one profile per entity-year. Profile lines reference `ChargingLocation` (FK) with `Check(percentage > 0 AND <= 100)`. Cascade delete from profile to lines.
- **`annual_cost` column on `ChargeableEntity` per `[F-DG-03]`** — `Numeric(14,2)`, nullable. F3 adds this to close the own-cost gap: Offerings and InternalServices now have a stored budget figure; the DAG resolver `get_own_cost` returns it as fallback for Project subtypes when `annual_budget` and `total_budget` are both null.
- **RollupCache model per `[F-RV-01..02]`** — persistent two-layer cache (stage1_effective / stage2_location) keyed by `(cache_layer, year, version, key_id)`. JSON payload stores the computed dict. `UniqueConstraint` prevents duplicate entries.
- **`btc_service.py` per `[F-S2-02..08]`** — full BTC lifecycle: `create_manual_profile`, `create_automatic_profile` (UM snapshot), `update_profile` (draft-only replace), `refresh_from_um` (dry-run + commit), `change_mode` (manual↔automatic with confirm gate), `copy_from_profile`, `year_rollover` (bulk copy of active profiles to next-year drafts), `assert_btc_required` (gate check), `build_wbs_matrix` (charging-location × entity matrix with WBS elements).
- **`rollup_cache.py` per `[F-RV-01..06]`** — read-through cache for Stage 1 and Stage 2 costs. Four invalidation helpers: `invalidate_for_distribution_write` (all stage1+stage2 for year/version), `invalidate_for_btc_write` (stage2 for entity+year), `invalidate_for_entity_cost_write` (both layers for entity), `invalidate_all` (full flush). Cache entries committed immediately on write (survives across requests).
- **`rollup_query.py` per `[F-RV-01..06]`** — `query_rollup` aggregates effective costs across 11 group-by dimensions (entity, entity_type, hierarchy_node, responsible, change_or_run, charging_location, legal_entity, region, division, country, stage). `drill_down_charging_location` returns the full upstream path chain for a given entity × charging-location pair with enriched labels.
- **15 new endpoints in `routers/charging.py`** — BTC CRUD (list, get, get-by-entity, create, update, delete), UM refresh (dry-run + commit), mode change, copy-from, WBS matrix, year-rollover, rollup query, drill-down, cache invalidate, cache status.
- **DoI 2→3 BTC gate per `[A-PL-06]`** — 8-line hook in `services/intake_workflow.py::approve_intake_project` (local imports; zero import-block diff). Blocks with HTTP 409 when `to_business_pct > 0` and no active BTCProfile exists for the demo year.
- **Seed data** — `annual_cost` backfilled for 11 seeded CEs; 5 manual + 5 automatic BTCProfile rows with lines summing to 100%; profile 10 is an empty 2027 draft for year-rollover demo.

### Spec references implemented
`[F-S2-01]`, `[F-S2-02]`, `[F-S2-03]`, `[F-S2-04]`, `[F-S2-05]`, `[F-S2-06]`, `[F-S2-07]`, `[F-S2-08]` — BTCProfile CRUD, UM snapshot, mode change, copy, rollover, sum-to-100 validation, WBS matrix.
`[F-RV-01]`, `[F-RV-02]`, `[F-RV-03]`, `[F-RV-04]`, `[F-RV-05]`, `[F-RV-06]` — rollup cache (two layers), query (11 dimensions), drill-down (upstream path with labels), cache invalidation (4 strategies), diagnostic status endpoint.
`[F-OQ-05]` — effective cost endpoint (already existed in F2; confirmed cache integration correct).
`[F-DG-03]` — `annual_cost` on ChargeableEntity, surfaced in DAG resolver `get_own_cost`.
`[A-PL-06]` — DoI 2→3 BTC gate wired into `approve_intake_project`.

### Technical Details
- **New models:** `BTCProfile`, `BTCProfileLine`, `RollupCache` in `models/charging.py`. `ChargeableEntity.annual_cost` column added.
- **New services:** `services/btc_service.py`, `services/rollup_cache.py`, `services/rollup_query.py`.
- **New schemas:** `schemas/btc_profile.py` (10 Pydantic models), `schemas/rollup.py` (5 Pydantic models).
- **Updated schemas:** `schemas/chargeable_entity.py` (annual_cost field), `schemas/distribution.py` (own_cost_source field).
- **Updated services:** `services/dag_resolver.py::get_own_cost` — annual_cost fallback.
- **Updated services:** `services/intake_workflow.py` — 8-line F3 hook (local imports).
- **Updated routers:** `routers/charging.py` — 15 new endpoints, cache invalidation wired to distribution/BTC/entity-cost writes.
- **Seed:** `seed/seed.sql` appended with F3 section (~80 lines): annual_cost UPDATEs, 10 BTCProfile INSERTs, BTCProfileLine INSERTs.
- **Bug fix:** `btc_service.update_profile` — added `db.expire(profile)` after deleting old lines so the relationship collection reloads correctly before `len(updated.lines)` checks.
- **Bug fix:** `rollup_cache._upsert_entry` — added `db.commit()` after `db.flush()` so cache writes persist across the request boundary (GET endpoints don't auto-commit).

### Tests
- `test_btc_service.py` — 48 tests (all BTC service functions)
- `test_rollup_cache.py` — 15 tests (cache miss/hit + 4 invalidation strategies)
- `test_rollup_query.py` — 12 tests (11 dims + drill-down)
- `test_router_btc_profile.py` — 18 tests (BTC router integration)
- `test_router_rollup.py` — 13 tests (rollup + cache endpoints)
- `test_dag_resolver.py` — +3 tests (annual_cost fallback for Offering, InternalService, Project subtypes)
- `test_router_intake.py` — +5 tests (DoI BTC gate: no CE, zero pct, active profile, draft profile, missing profile → 409)
- **Total F3 new tests: 114; total suite: 913 (was 788)**

### Deviations from brief
- `_current_quarter` defaults to Q1 2026 (not Q2) because seeded UM data is Q1; automatic profile creation finds UM rows correctly.
- Brief estimated ~88 tests; actual 114 (more thorough coverage of DoI gate variations and cache behavior).

## v5 Session F2: ChargeableEntity Polymorphic + Stage 1 Distribution Backend (2026-04-28)

### Feature Overview
- **Polymorphic ChargeableEntity root per `[F-DM-01..04]`** — single table with
  three subtypes (`Project`, `Offering`, `InternalService`). Project subtype
  carries a nullable `project_id` FK back to the existing v4 `Project` model so
  capacity allocations and pipeline state stay anchored on the v4 entity per the
  file-ownership boundary with A5. Offerings and InternalServices have no
  underlying row — the ChargeableEntity row IS the entity. `is_change_or_run`
  is a Python property derived from runtime state (Project DoI 0–4 = Change;
  DoI 5 / Offerings / InternalServices = Run) per `[F-DM-01]`.
- **Identifier-format enforcement at the schema layer per `[F-DM-01]`** —
  Project: `IT0<PPM>` (5–6 digits); Offering: `IT00<S-code>` (2–8 alphanumerics);
  InternalService: `ITF<NNNNN>` (5 digits). Centralised in
  `schemas/chargeable_entity.py::validate_identifier_for_type` so the seed,
  router, and future F3 code share the same rules.
- **Stage 1 Distribution edges per `[F-S1-01..05]`** — sparse storage (one row
  per actually-flowing edge). Versioned per `[F-S1-04]` using CRETA's standard
  baseline/forecast/actuals model with scenario forks identified by
  `scenario-<id>`. Sum-rule per `[F-S1-02]`: `to_business_pct + Σ(distribute %)
  ≤ 100`; residual is derived. Cycle detection per `[F-S1-05]` is hard-block on
  save with the cycle chain returned in the 409 body for UI rendering.
- **DAG resolution endpoint per `[F-S1-02]`** — `compute_effective_cost`
  recursively walks incoming edges and returns `own_cost + sum(inflows)` plus
  per-source contributions for the rollup drill-down. Defensive `_seen` guard
  protects against malformed cycles; recursion capped at depth 8.
- **WBS Element generator per `[F-DM-03]`** — algorithmic, never stored.
  Format: `<prefix>-64-99-<location_code>` where prefix is the entity's
  identifier (already in subtype shape) and `64`/`99` are the spec-mandated
  KB IT-area marker / separator constants per `[F-OQ-05]`.
- **Polymorphic refactor of A2's Allocation table** — adds a nullable
  `chargeable_entity_id` FK alongside the existing `project_id` so
  Person × Project × Month allocations can target any chargeable entity once
  F-cluster code paths land. v4-shape callers continue to use `project_id`;
  new code paths use `chargeable_entity_id` and fall back to project-lookup
  when NULL. Backfilled in seed.sql for all existing rows.

### Spec references implemented
`[F-DM-01]`, `[F-DM-02]`, `[F-DM-03]`, `[F-DM-04]`, `[F-S1-01]`, `[F-S1-02]`,
`[F-S1-03]`, `[F-S1-04]` (data layer; live forecast-version mutation is F3),
`[F-S1-05]`, `[A-PL-05]` (multi-type chargeable post-launch tracking),
`[A-PL-06]` (BTC requirement at DoI 2→3 — the schema is in place; gate
enforcement is F3 territory), `[A-PL-07]` (Run/Change classification surfaces
on the entity).

Out of scope per session brief / impl-guide partitioning:
- BTC profile, BTC profile lines, year rollover, automatic-mode UM snapshot,
  WBS export 90-row matrix — F3.
- Two-layer rollup cache (Stage 1 + Stage 2 totals) — F3.
- ChargeableEntity `annual_cost` column for non-Project subtypes — F3.
  Currently `own_cost` is sourced from `Project.annual_budget` (or
  `total_budget`) for Project subtypes; reported as 0 for Offerings and
  InternalServices.
- RolePermissionGrant enforcement on distribution edits — F4 frontend or a
  follow-on backend session. F2 enforces controller-only writes.

### Technical Details
- **Models (extended `models/charging.py`):**
  - `ChargeableEntity` — id (str PK), entity_type (Check constraint enum),
    identifier (UniqueConstraint), name, description, hierarchy_node_id (FK to
    grouping_entities), responsible_person_id (FK to people),
    to_business_pct (Numeric 5,2 default 0), project_id (FK to projects,
    nullable; UniqueConstraint so each project links 1:1 to at most one
    ChargeableEntity), termination_month, is_active, created/modified_at.
    Relationships kept passive (no `back_populates` on `Project` per F2's
    read-only constraint on `projects.py`).
  - `Distribution` — id (autoincr PK), year, version, source_entity_id (FK),
    destination_entity_id (FK), percentage (Numeric 5,2). Constraints:
    UniqueConstraint(year, version, source, destination); CheckConstraints
    rejecting self-loops and out-of-range percentages; indexes on
    (source, year, version) and (destination, year, version).
  - `Allocation` — added `chargeable_entity_id` (nullable FK to
    chargeable_entities) alongside the existing `project_id`. No breaking
    change to v4 capacity-router callers.
  - Module-level constants: `CHARGEABLE_ENTITY_TYPES`,
    `DISTRIBUTION_VERSION_BASELINE/FORECAST/ACTUALS`,
    `DISTRIBUTION_BUILTIN_VERSIONS`.
- **Schemas:**
  - `schemas/chargeable_entity.py` — `ChargeableEntityBase/Create/Update/Response/ListResponse`
    plus `validate_identifier_for_type` and `PROJECT_ID_PATTERN /
    OFFERING_ID_PATTERN / INTERNAL_SERVICE_ID_PATTERN`.
  - `schemas/distribution.py` — `DistributionBase/Create/Update/Response/ListResponse`,
    `EntityDistributionSummary` (single-entity profile per `[F-S1-03]`),
    `DistributionEffectiveCost` + `DistributionInflow`, `CycleError`,
    `WBSElementResponse`.
- **Services:**
  - `services/wbs_generator.py` — `build_wbs_element`,
    `build_wbs_components`, `WBSComponents` dataclass. Pure functions.
  - `services/dag_resolver.py` — `EdgeKey`, `detect_cycle` (pure),
    `detect_cycle_db` (DB-backed with `exclude_edge_id` for updates),
    `compute_effective_cost`, `get_own_cost`, `get_upstream_chain`.
    Defensive `_seen` cycle guard; depth cap=8.
  - `services/distribution_service.py` —
    `DistributionValidationError(message, cycle_chain=)`, `SumValidationResult`,
    `compute_sum_validation` (with optional candidate args for create/update
    simulation), `assert_sum_within_100`, `assert_no_cycle`,
    `create/update/delete_distribution_edge`, `update_to_business_pct`,
    `is_known_version`. SUM_TOLERANCE=0.01.
- **Router (extended `routers/charging.py`):** two router instances now exist
  — the existing `router` under `/api/admin` carries D1's master data plus the
  new `/chargeable-entities` admin CRUD (5 endpoints), and a new
  `charging_router` under `/api/charging` carries Distribution + DAG queries
  (10 endpoints). Both wired into `main.py` (`charging_consumer_router`).
  Local `_audit` extended with optional `category=` keyword (default
  `master_data`) so existing D1 callsites stay unchanged while new F2
  callsites declare `category='master_data'` explicitly per the D2 contract.
- **Tests (5 new files, 116 tests):**
  - `tests/test_wbs_generator.py` (10) — format, whitespace, empty inputs.
  - `tests/test_dag_resolver.py` (36) — pure cycle detection, DB-backed cycle
    detection, effective cost recursion, own-cost resolution, upstream chain.
  - `tests/test_distribution_service.py` (29) — sum validation paths,
    create/update/delete orchestration, to-business updates.
  - `tests/test_router_chargeable_entity.py` (26) — list/filter/get/create/
    update/deactivate, identifier-pattern enforcement, role checks,
    is_change_or_run runtime derivation.
  - `tests/test_router_distribution.py` (25) — distribution CRUD, summary,
    to-business update, effective-cost, upstream-chain, WBS preview, role
    checks, structured 409 cycle/sum errors.
- **Seed (appended to `backend/seed/seed.sql`):**
  - **Section 0f — ChargeableEntity rows.** 32 Project (one per existing
    project, PPM `IT012001..IT012032`) + 3 Offering (PDM/PLM Author
    `IT00S321`, SAP Maintenance `IT00S412`, Collaboration Suite `IT00S556`) + 5
    InternalService (Cloud Platform `ITF13001`, IAM Platform `ITF13002`,
    Observability `ITF13003`, Data Platform `ITF13004`, Service Desk
    `ITF13005`) = **40 rows total**.
  - **Section 0g — Distribution edges.** 12 edges for `year=2026,
    version='forecast'`. Includes a multi-step chain
    (Cloud Platform → Data Platform → PDM Offering) so the upstream-chain
    feature has data to drill into per `[F-RV-04]`. All sums per source
    ≤ 100% (5%/10%/10%/30% self-retained on the 4 distributing
    InternalServices).
  - **Section 0h — Allocation backfill.** Idempotent UPDATE that fills
    `allocations.chargeable_entity_id` from the corresponding ChargeableEntity
    row keyed by `project_id` for `entity_type='Project'`.

### A5 — API Endpoints Added
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/intake/projects` | PL/Controller/Exec | Create project at DoI 0 (Proposed) per [A-BK-26]/[A-DOI-04]. |
| POST | `/api/intake/projects/{id}/approve` | controller | Approve from Under Evaluation → Approved (DoI 3) per [A-BK-27]. |
| POST | `/api/intake/projects/{id}/send-back` | controller | Send back → Proposed (DoI 1) with comments + snapshot per [A-BK-27]/[A-BK-29]. |
| POST | `/api/intake/projects/{id}/reject` | controller | Reject → Cancelled with reason; freezes DoI per [A-BK-27]/[A-PS-03]. |
| POST | `/api/intake/projects/{id}/resubmit` | PL on own / controller | PL revises and resubmits → Under Evaluation (DoI 2); captures pl_resubmitted snapshot per [A-BK-29]. |
| GET | `/api/intake/projects/{id}/diff` | any role | Structured before/after diff (sent_back vs resubmit/current) per [A-BK-29]. |
| GET | `/api/intake/queue` | any role | List projects in Under Evaluation (controller review queue) per [A-BK-26]. |

### Endpoints Deprecated (HTTP 410 Gone)
All bodies replaced with a stub raising `_V4_INTAKE_REMOVED_DETAIL`. `deprecated=True` on every route so `/docs` flags them in OpenAPI.

| Method | Path | Replacement |
|--------|------|-------------|
| GET | `/api/portfolio/intake` | `GET /api/intake/queue` |
| GET | `/api/portfolio/intake/{id}` | Backlog detail view per [A-BK-19] |
| PUT | `/api/portfolio/intake/{id}/approve` | `POST /api/intake/projects/{id}/approve` |
| PUT | `/api/portfolio/intake/{id}/reject` | `POST /api/intake/projects/{id}/reject` |
| PUT | `/api/portfolio/intake/{id}/send-back` | `POST /api/intake/projects/{id}/send-back` |
| PUT | `/api/portfolio/intake/{id}/resubmit` | `POST /api/intake/projects/{id}/resubmit` |
| GET | `/api/portfolio/intake/{id}/diff` | `GET /api/intake/projects/{id}/diff` |
| PUT | `/api/portfolio/intake/{id}/accept-changes` | (removed — controller no longer free-edits per [A-BK-28]; PL revises + Resubmit) |
| GET | `/api/portfolio/intake/{id}/editable-grid` | (removed — forecast editing happens in workbench, not intake review) |

### Data Model Changes
None. A5 reuses the A2 fields (`pipeline_stage`, `doi`, `frozen_doi`, `submission_feedback`) and the existing `ProjectSubmissionSnapshot` table from v4. Two new snapshot type strings are introduced (`controller_sent_back` and `pl_resubmitted`) but they are values, not schema.

### Working assumptions (flagged for KB confirmation)
- **`description` is the proxy for the structured DoI 0 sections** until `[A-DA-02]` adds dedicated columns. Frontend can prompt with the four sub-headings (Problem Statement / Business Driver / Expected Outcome / Current State) and concatenate.
- **`start_month` is required at create time** per the existing model (`String(7)`, `nullable=False`). Spec `[A-DOI-04]` says no timeline at DoI 0; in this session we accept a placeholder month from the PL. Loosening the model to `nullable=True` is a 1-line schema change; flagged as a refactoring opportunity below.
- **Controller "approve at Pitch Board" sets `status='active'`** for v4 back-compat. The two-step baseline flow per `[A-OQ-07]` (approve on macro data → PL enters detail → controller locks baseline) is collapsed into a single approve here. When `[A-OQ-07]` resolves, split this into two endpoints (`approve` and `lock-baseline`).
- **Reject is one-shot.** Cancellation is "nearly one-way" per `[A-PS-10]`; un-cancel goes through the existing `POST /api/projects/{id}/pipeline/transition` with `override_reason` set.
- **Resubmit notifies any controller persona** found in `DemoPersona`. Once D1/D2's `User`/`RolePermissionGrant` infrastructure unifies with personas (follow-on session), this lookup will switch to the new model.
- **Diff scope is the master-data + Tech Navigator + milestone-count subset** (21 fields). Forecast-grid diff is a separate concern handled by the workbench's existing CR diff. KB can extend `DIFFABLE_FIELDS` in `services/intake_workflow.py` without touching the router.
- **CR approval workflow remains unchanged** per spec line 418. The existing `routers/portfolio.py::approve_cr` / `reject_cr` / `send_back_cr` and `routers/workbench.py` CR helpers stay put. The v5 spec schedules CR rework into Cluster B / E follow-ons.
- **`is_service` flag** is exposed on the create body so a PL can flag a service from day one. Defaults to `false`; the existing `Project.is_service` semantics (annual_budget vs total_budget) are unchanged.

### Refactoring Opportunities (noted, not acted on)
- **Loosen `Project.start_month` to `nullable=True`**, aligning with spec `[A-DOI-04]` ("no timeline at DoI 0"). 1-line model change + a seed.sql audit + a few NOT NULL guards in queries that read it. Out of A5 scope; flagged for the v5 column-additions session.
- **`Project.status` and `pipeline_stage` are now redundant for v5-aware code paths.** A5 keeps both in lock-step (status='draft' / 'changes_requested' / 'pending_approval' / 'active' / 'rejected' alongside the pipeline_stage). When the v4 launchpad and workbench finally drop their `status`-based filters (A8 / E1 follow-ons), this redundancy can collapse.
- **CR approval audit logging is missing.** `routers/portfolio.py::approve_cr` / `reject_cr` / `send_back_cr` and the workbench CR endpoints don't currently call `_log_audit()`. Per the D2 contract every state mutation should emit an audit row under `category='forecast_actions'`. Not in A5 scope; flag for the next CR-touching session.
- **`_log_audit` import from `routers/admin.py` repeats the A1/A2/A3/D1 pattern.** A5 imports it from `routers.admin` like A2/A3 do. The duplicate-import problem will multiply with each new router. Lift `_log_audit` to `services/audit.py` once a future cleanup session takes the `routers/admin.py` reorganisation.
- **`ProjectSubmissionSnapshot.forecast_data_json` is now polysemic** — v4 uses it for forecast-grid JSON; A5 stuffs project-state JSON into the same column for the v5 intake snapshots. Consider renaming to `state_json` (or splitting into a polymorphic snapshot table) when KB requests cleaner internals. Audit log captures the snapshot_type so the data is queryable today; only the column name is a smell.
- **`/api/intake/queue` and `/api/portfolio/backlog?pipeline_stage=Under Evaluation`** return overlapping data. The queue endpoint is a thin convenience wrapper for the controller's review surface. Frontend D3/A6 can pick whichever fits — drop the one that's unused once both UIs ship.

### Notes for follow-on sessions
- **A6 Backlog frontend** consumes `GET /api/portfolio/backlog` (already returns Under-Evaluation projects in the ranked list) and uses `/api/intake/queue` only when the controller picks the "Under Evaluation only" filter shortcut.
- **A8 Pipeline frontend** wires the four intake action endpoints into the project detail's action buttons (Approve / Send Back / Reject / Resubmit) and the diff view tab. Form state for `comments` / `reason` / `resubmission_notes` is required for Send Back and Reject (validated server-side as 422).
- **Cluster F (charging / BTC profile) consumers** can call `POST /api/intake/projects` to admit new projects from the BTC sheet uploader. The `pl_person_id` defaults to `None` for controller-driven creation, leaving an "unassigned" project that a PL can adopt.
- **D3 admin frontend** does NOT need to wire the v4 intake routes; the 410 deprecation surfaces a clear error and the new endpoints replace them in the backlog detail view.
- **Live workflow enforcement (`[D-CAT-08]`)** — when a follow-on session wires the `WorkflowTemplate` rows into runtime, the four-step Send Back template (controller comments → PL revises → snapshot → resubmission) is the natural first candidate. Today the steps are encoded in `services/intake_workflow.py`; mapping them to template steps is mechanical.

### Verification
- **Tests:** `python -m pytest backend/tests/ -v` → **672 passed** (604 baseline + 30 new service tests + 38 new router tests). 0 failures. Standalone A5 suite: 68 new tests across `tests/test_service_intake_workflow.py` (30) and `tests/test_router_intake.py` (38).
- **Live smoke** against the dev server (port 8765, freshly seeded DB) confirmed:
  - `GET /api/intake/queue` returns the 1 Under-Evaluation project (proj-autobrake) seeded.
  - `GET /api/portfolio/intake` returns HTTP 410 Gone with the structured `replacements` dict.
  - `PUT /api/portfolio/intake/x/approve` returns HTTP 410 Gone.
  - `POST /api/intake/projects` (controller, lightweight body) returns HTTP 201 with `pipeline_stage='Proposed'`, `doi=0`, `status='draft'`.
  - `POST /api/intake/projects` (PL, no `pl_person_id`) defaults to the caller's person ID.
  - `POST /api/intake/projects/proj-autobrake/send-back` (controller) returns 200 with `pipeline_stage='Proposed'`, `doi=1`, `status='changes_requested'` and writes a `controller_sent_back` snapshot.
  - `POST /api/intake/projects/proj-autobrake/send-back` (PL) returns 403 "Role 'project_lead' not permitted. Required: controller".
  - `GET /api/intake/projects/proj-autobrake/diff` returns the structured 21-field diff payload with `diff_type='current'` (PL has not yet pressed Resubmit).
  - `POST /api/intake/projects/proj-autobrake/resubmit` (PL on own project) returns 200 with `pipeline_stage='Under Evaluation'`, `doi=2`, `status='pending_approval'`.

### Curl examples (capture for A8 frontend integration)
```bash
H="X-Current-User: persona-controller"

# Create at DoI 0 (Proposed)
curl -s -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{"name":"New IT Initiative","description":"Pitch text","lob_id":"lob-rail","project_type":1,"capex_opex":"capex","start_month":"2026-09"}' \
  http://localhost:8000/api/intake/projects

# Review queue (Under Evaluation only)
curl -s -H "$H" http://localhost:8000/api/intake/queue

# Approve
curl -s -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{"comments":"Approved at Pitch Board"}' \
  http://localhost:8000/api/intake/projects/proj-autobrake/approve

# Send Back
curl -s -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{"comments":"Need stronger TN scoring justification"}' \
  http://localhost:8000/api/intake/projects/proj-autobrake/send-back

# Diff (after Send Back)
curl -s -H "$H" http://localhost:8000/api/intake/projects/proj-autobrake/diff
curl -s -H "$H" "http://localhost:8000/api/intake/projects/proj-autobrake/diff?type=current"

# Reject
curl -s -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{"reason":"Out of strategic scope"}' \
  http://localhost:8000/api/intake/projects/proj-autobrake/reject

# Resubmit (as PL)
curl -s -X POST -H "X-Current-User: persona-pl" -H "Content-Type: application/json" \
  -d '{"resubmission_notes":"Updated TN scores"}' \
  http://localhost:8000/api/intake/projects/proj-autobrake/resubmit
```

### Ready for merge
Branch `v5/cluster-a/a5-intake-backlog-backend` carries 7 atomic commits and 672 passing tests. Merged onto the wave-1 branch as the first wave-1 merger.

### F2 — API Endpoints Added
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET    | `/api/admin/chargeable-entities` | controller | List with optional filters (entity_type, hierarchy_node_id, is_active) |
| GET    | `/api/admin/chargeable-entities/{id}` | controller | Detail |
| POST   | `/api/admin/chargeable-entities` | controller | Create (Offering / InternalService / link existing Project) |
| PUT    | `/api/admin/chargeable-entities/{id}` | controller | Partial update |
| PUT    | `/api/admin/chargeable-entities/{id}/deactivate` | controller | Soft delete |
| GET    | `/api/charging/distributions` | any role | List edges (filter year, version, source, destination) |
| GET    | `/api/charging/distributions/{edge_id}` | any role | Edge detail |
| POST   | `/api/charging/distributions` | controller | Create with sum-rule + cycle validation |
| PUT    | `/api/charging/distributions/{edge_id}` | controller | Update percentage only |
| DELETE | `/api/charging/distributions/{edge_id}` | controller | Delete |
| GET    | `/api/charging/entities/{id}/distribution-summary` | any role | Single-entity profile per `[F-S1-03]` |
| PUT    | `/api/charging/entities/{id}/to-business-pct` | controller | Update with sum-rule validation |
| GET    | `/api/charging/entities/{id}/effective-cost` | any role | DAG-resolved own + inflows per `[F-S1-02]` |
| GET    | `/api/charging/entities/{id}/upstream-chain` | any role | Drill-down paths per `[F-RV-04]` |
| GET    | `/api/charging/entities/{id}/wbs/{loc_id}` | any role | Algorithmic WBS preview per `[F-DM-03]` |

### Data Model Changes
- New tables: `chargeable_entities`, `distributions`.
- New columns: `allocations.chargeable_entity_id` (nullable FK).
- **No Alembic.** Existing `creta_demo.db` will fail to read the new tables /
  column on the next startup. Resolution: delete (or move aside)
  `backend/creta_demo.db` and restart — the seed loader recreates schema and
  re-runs `seed.sql` to populate all the F2 rows.

### Working assumptions (flagged for KB confirmation)
- **`64-99-` are constants** per `[F-OQ-05]` working assumption. The WBS
  generator has them as named module constants (`COMPANY_CODE_MARKER`,
  `SEPARATOR`) so a future session can promote them to admin parameters if
  KB confirms they vary by region/division/year.
- **`own_cost = 0` for non-Project subtypes** because `ChargeableEntity` does
  not yet carry an `annual_cost` column. F3 will land it. Tests cover the
  Project subtype path (sources from `Project.annual_budget`); Offering and
  InternalService subtypes will need the column for F3's rollup data layer.
- **Versions are free-form strings** beyond the three builtins. The router
  accepts unknown version strings (e.g. typos) without rejection — it just
  marks them as non-builtin via `is_known_version()`. Audit log entries make
  the typo trail discoverable. Strict whitelist enforcement could land in F3
  or B1 once the simulator's scenario versions are operational.
- **Project subtype owns own_cost annualisation.** When `Project.annual_budget`
  is set we use it as-is; otherwise we fall back to `total_budget` without
  spreading across the project's duration. For F2's demo data this works
  because the seed populates `annual_budget` for service-y projects (which is
  where Run-stage own_cost matters). F3's annual_cost column on
  ChargeableEntity will replace this heuristic for all subtypes.
- **Allocation polymorphism is non-breaking.** F2 ships
  `chargeable_entity_id` as nullable + a backfill UPDATE; existing capacity
  router code paths continue to use `project_id` and are unaware of the new
  column. New code (F3+) prefers `chargeable_entity_id` with a fallback path.
- **Distribution edge identifier shape is autoincrement int.** Other v5 tables
  use string PKs (`grouping_entities`, `chargeable_entities`, etc.); for the
  high-churn distribution edges the autoincrement int matches the existing
  Allocation pattern in `models/capacity.py`. Cleaner for `DELETE
  /distributions/{id}` URLs and lighter for the simulator (Cluster B) when it
  forks scenario versions.

### Refactoring opportunities (noted, not acted on)
- **`_audit` helpers are still duplicated** across `routers/admin.py` and
  `routers/charging.py` (now extended for F2). After D2 landed `category=` as
  a required keyword on `routers.admin._log_audit`, the local `_audit` in
  `routers/charging.py` could be migrated to call `_log_audit` directly. F2
  preserves the local helper to keep the file self-contained but the
  consolidation flagged in D1's "Refactoring opportunities" still applies.
- **`Project.is_service` becomes redundant** once Cluster F's polymorphic
  model fully replaces the v4 project/service distinction per `[F-DG-01]`.
  The seed retires the distinction in S1; until then the field stays on
  Project for back-compat with v4 reporting and capacity logic.
- **`Allocation.project_id` will eventually be dropped** in favour of
  `chargeable_entity_id` once all callers migrate. F2 keeps both for
  back-compat. Touches `routers/capacity.py`,
  `services/allocation_service.py`, `services/calculations.py` — not in F2
  scope, deliberate.
- **`compute_effective_cost`'s recursion bottoms out the cache-miss tree
  every call.** Acceptable for v5 data volumes (≤50 distribution edges,
  ≤30 entities) but F3 will introduce the two-layer cache per `[F-RV-02]`
  to keep the rollup queries fast.
- **`get_upstream_chain` returns `[entity_id]` for sources with no inflows.**
  The frontend (F4/F5) may want to suppress single-element paths. Easier to
  filter at the consumer than reshape the API.

### Notes for follow-on sessions
- **F3 (BTCProfile + Stage 2 + rollup cache)** consumes:
  - `ChargeableEntity` directly (BTCProfile FK).
  - `Distribution` via the rollup cache (Stage 1 effective costs feed into
    Stage 2 location totals).
  - `services/dag_resolver.compute_effective_cost` as the canonical
    own+inflows resolver — cache around it rather than re-implement.
  - `services/wbs_generator.build_wbs_element` for SAP-export 90-row matrix.
  - The `annual_cost` column on `ChargeableEntity` is F3's to add. Once
    landed, `services/dag_resolver.get_own_cost` should prefer it over
    `Project.annual_budget` (the existing fallback stays for back-compat).
- **F4 (Distribution editor frontend)** consumes:
  - `GET /api/charging/distributions` for the cross-entity list view.
  - `GET /api/charging/entities/{id}/distribution-summary` for the
    edges-as-list editor surface.
  - `PUT /api/charging/entities/{id}/to-business-pct` for the to_business
    field.
  - `POST/PUT/DELETE /api/charging/distributions[/{id}]` for the row-level
    add/edit/remove. The 409 body's `cycle_chain` is what to render in the
    inline error banner.
- **F5 (Location Cost Rollup map + table)** consumes:
  - `GET /api/charging/entities/{id}/effective-cost` for per-entity rollups
    (until F3's cache lands).
  - `GET /api/charging/entities/{id}/upstream-chain` for the cell drill-down
    panel.
- **F7 (Run Portfolio sub-module)** consumes:
  - `GET /api/admin/chargeable-entities?entity_type=Project|Offering|InternalService`
    plus a future filter for `is_change_or_run=Run`.
- **B1 (Simulator backend)** consumes:
  - `Distribution.version` accepts `scenario-<id>` strings. Sandbox mutations
    fork by inserting new rows under the scenario version; promoting a
    scenario copies them back to `forecast`.
- **A5 (Intake workflow)** does not need any F2 hooks — F2's polymorphic
  refactor leaves Project model untouched so A5's intake/lifecycle work can
  proceed against the same Project model. New projects created at DoI 0 by
  A5 will need a corresponding ChargeableEntity row at some point; F2
  recommends a one-line creation hook in A5's "create project" handler that
  inserts a Project-subtype ChargeableEntity with synthesized PPM identifier.
  Not a blocker for A5 — can land in a follow-up.

### Verification
- `python -m pytest backend/tests/ -v` → **720 passed** (604 baseline + 116
  new F2 tests). 0 failures, 8.5k DeprecationWarnings (existing
  `datetime.utcnow()` calls; pre-existing in the codebase).
- Live `python main.py` smoke test against a fresh `creta_demo.db`:
  - `GET /health` → 200.
  - `GET /api/admin/chargeable-entities` → 200, 40 items
    (Project: 32, Offering: 3, InternalService: 5).
  - `GET /api/charging/distributions` → 200, 12 items.
  - `GET /api/charging/entities/ce-off-pdm/effective-cost?year=2026&version=forecast`
    → 200, 3 inflows, own_cost=0 (Offering), inflow_total=0 (upstream
    Internal Services have own_cost=0 in v5).
  - `GET /api/charging/entities/ce-svc-cloud-pf/distribution-summary?year=2026&version=forecast`
    → 200, 4 outgoing edges, to_business=0, self_retained=5%.
  - `GET /api/charging/entities/ce-off-pdm/upstream-chain?year=2026&version=forecast`
    → 200, 4 paths including the 3-hop multi-step chain.
  - `GET /api/charging/entities/ce-off-pdm/wbs/cl-de-muc` → 200,
    `IT00S321-64-99-DE-MUC-001`.
  - `POST /api/charging/distributions` with cycle (PDM → CloudPF) → 409 with
    `cycle_chain: ["ce-off-pdm", "ce-svc-cloud-pf", "ce-off-pdm"]`.
  - `POST /api/charging/distributions` with sum overflow (CloudPF → IAMPF
    50%, would push grand to 145%) → 409 with `[F-S1-02]` message.
  - `POST /api/charging/distributions` with valid 3% edge → 201.
  - `POST /api/charging/distributions` as PL → 403.

### Curl examples (capture for F4 frontend integration)
```
H="X-Current-User: persona-controller"

# List chargeable entities
curl -s -H "$H" http://localhost:8000/api/admin/chargeable-entities

# Filter offerings
curl -s -H "$H" "http://localhost:8000/api/admin/chargeable-entities?entity_type=Offering"

# Single-entity profile
curl -s -H "$H" "http://localhost:8000/api/charging/entities/ce-svc-cloud-pf/distribution-summary?year=2026&version=forecast"

# Effective cost
curl -s -H "$H" "http://localhost:8000/api/charging/entities/ce-off-pdm/effective-cost?year=2026&version=forecast"

# Upstream chain
curl -s -H "$H" "http://localhost:8000/api/charging/entities/ce-off-pdm/upstream-chain?year=2026&version=forecast"

# WBS preview
curl -s -H "$H" http://localhost:8000/api/charging/entities/ce-off-pdm/wbs/cl-de-muc

# Create distribution edge
curl -s -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{"year":2026,"version":"forecast","source_entity_id":"ce-svc-cloud-pf","destination_entity_id":"ce-svc-helpdesk","percentage":3.0}' \
  http://localhost:8000/api/charging/distributions

# Update edge
curl -s -X PUT -H "$H" -H "Content-Type: application/json" -d '{"percentage":4.5}' \
  http://localhost:8000/api/charging/distributions/12

# Cycle attempt (rejected)
curl -s -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{"year":2026,"version":"forecast","source_entity_id":"ce-off-pdm","destination_entity_id":"ce-svc-cloud-pf","percentage":10.0}' \
  http://localhost:8000/api/charging/distributions
```

### Ready for merge
Branch `v5/cluster-f/f2-chargeable-entity-distribution` carries 6 atomic
commits (model, schemas+services, router, seed, tests, plus this PROGRESS +
CLAUDE update commit) and 720 passing tests. Merged onto the wave-1 branch as
the second wave-1 merger after A5; resolved PROGRESS.md + main.py conflicts.

---

## v5 Session D3: Admin Frontend (2026-04-28)

### Feature Overview
- **5-section admin module rewrite** of `frontend/src/modules/admin/` per `[D-NAV-01..05]`. Sidebar groups all 24 admin sub-surfaces into Master Data / Reference Catalogues / Planning & Ranking / Portfolio Hierarchy / System sections with separators and section labels. Implementation extends the v4 admin module rather than replacing it (existing v4 panels — Cost Centers, People, LoBs, Locations, Hierarchy, Planning Parameters, Rate Tables — are reused unchanged).
- **Cluster F master-data panels** per `[F-MD-01..03]`, `[F-UM-01..04]`: ChargingLocations list (~90 KB charging codes with Code / Name / Division / Region / Country columns + edit dialog), LegalEntities list (~120 entities with charging-location rollup + country code/name + filter dropdown), Regions / Countries lookup editors, and the **User Measurement matrix viewer** — sparse `99×90` S-code × charging-code grid with Σ-row / Σ-column totals, period (year/quarter) + version selectors, "imported_at" badge on hover, CSV upload form, and **stubbed Automatic-refresh button** that displays the `not_connected` 200 response as an explanatory dialog instead of a network error.
- **Hover tooltip helpers** per `[F-MD-01]`: `shared/LocationLabel.tsx` renders the master-data-label info-icon tooltip ("Charging Location — Knorr-Bremse charging code (~90 codes) used for inter-service distribution and SAP cost flows. Carries division, region and country attributes.") inline next to the Charging Locations / Legal Entities / Regions panel headers.
- **Reference catalogue panels** per `[D-CAT-01..03]`: RoleTypes editor (12 seeded roles), ExternalCostTypes editor (10 categories), ProjectDependencies editor (predecessor / successor edges, soft warn-only per spec — empty in seed but panel ready).
- **System administration panels** per `[D-AC-01..03]`, `[D-AC-09..10]`, `[F-AC-01]`, `[D-CAT-07..10]`, `[D-NAV-06..07]`:
  - Users editor with Tier-3 + change-reviewer flag columns (User table empty in current seed — see Working assumptions below).
  - RolePermissionGrid: per-entity-type × role checkbox grid for BTC Profile + Inter-service Distribution + master-data overrides; saves audit `category=access_control`.
  - **Workflow Template Editor** — consumes D2's `/api/admin/workflow-templates` endpoints. Six-template tab strip (Forecast Cycle 5 steps, Intake / Pipeline Progression 5, Change Request 4, Send Back 3, Milestone Baseline Override 3, Scheduled Master Data Activation 3). Per-step expandable touchpoint editor: required / skippable, assigned role (Controller / CC Owner / PL / Executive / System), data gates (comma-separated), notifications (JSON object — trigger ➜ recipients), time-constraint days, escalation action. Step sequence intentionally non-reorderable (matches D2's contract).
  - **Scheduled Changes Panel** — full 5-state lifecycle UI (pending_review / approved / activated / rejected / cancelled). Per-row Approve / Reject / Cancel actions plus a single **"Apply due changes"** button that calls `POST /api/admin/apply-scheduled-changes` (manual-trigger activation engine).
  - **Audit Log V2** consumes D2's `/api/audit` endpoints — 8-category filter dropdown (`master_data`, `configuration`, `hierarchy`, `forecast_actions`, `pipeline_transitions`, `simulator`, `access_control`, `scheduled_change_lifecycle`), entity-type filter, date range, color-coded category badges, old-→-new diff column, **CSV + Excel export** buttons via `/api/audit/export?format=csv|xlsx`.
- **Demo Reset button** per `[D-AC-10]` — top-right header destructive-styled button with confirmation dialog calling `POST /api/admin/reset-demo`.

### Spec Tags Implemented
`[D-NAV-01]` `[D-NAV-02]` `[D-NAV-03]` `[D-NAV-04]` `[D-NAV-05]` `[D-NAV-06]` `[D-NAV-07]` `[D-AC-01]` `[D-AC-02]` `[D-AC-03]` `[D-AC-09]` `[D-AC-10]` `[D-CAT-01]` `[D-CAT-02]` `[D-CAT-03]` `[D-CAT-07]` `[D-CAT-08]` `[D-CAT-09]` `[D-CAT-10]` `[F-MD-01]` `[F-MD-02]` `[F-MD-03]` `[F-UM-01]` `[F-UM-02]` `[F-UM-03]` `[F-UM-04]` `[F-AC-01]`.

### Components Added
- `frontend/src/modules/admin/Administration.tsx` — extended to switch across 24 panels via `selectedSection`.
- `frontend/src/modules/admin/EntitySelector.tsx` — extended sidebar with 5 sections (1 · Master Data → 5 · System).
- `frontend/src/modules/admin/entities/ChargingLocationsPanel.tsx` (282 LoC), `LegalEntitiesPanel.tsx` (290 LoC), `RegionsPanel.tsx` (172 LoC), `CountriesPanel.tsx` (208 LoC), `UserMeasurementPanel.tsx` (334 LoC), `RoleTypesPanel.tsx` (141 LoC), `ExternalCostTypesPanel.tsx` (132 LoC), `ProjectDependenciesPanel.tsx` (298 LoC), `UsersPanel.tsx` (339 LoC).
- `frontend/src/modules/admin/audit/AuditLogV2Panel.tsx` (277 LoC).
- `frontend/src/modules/admin/scheduled/ScheduledChangesPanel.tsx` (333 LoC).
- `frontend/src/modules/admin/system/RolePermissionsGrid.tsx` (183 LoC).
- `frontend/src/modules/admin/workflow/WorkflowTemplateEditor.tsx` (~370 LoC).
- `frontend/src/modules/admin/shared/LocationLabel.tsx` — F-MD-01 hover tooltip helper (68 LoC).

### Endpoints Consumed
All ~50 endpoints land via D1 + D2 — see those sessions above for the canonical list. New `adminD3Api` namespace in `frontend/src/api/endpoints.ts` exposes them grouped by panel:
- Charging master data: `chargingLocations`, `legalEntities`, `regions`, `countries`
- User Measurement: `getUMMatrix`, `uploadUMCsv`, `triggerUMRefresh`
- Reference catalogues: `roleTypes`, `externalCostTypes`, `projectDependencies`
- System: `users`, `rolePermissions`, `workflowTemplates`, `scheduledChanges` (incl. `applyScheduledChanges`)
- Audit: `getAuditEntries`, `getAuditCategories`, `exportAuditCsv`, `exportAuditXlsx`

### Visual Verification (1440px, light + dark)
Both themes verified via Playwright MCP at 1440 × 900 viewport. Screenshots captured at repo root:

| # | File | Surface |
|---|---|---|
| 01 | `d3-01-admin-cost-centers-light.png` | Default Cost Centers panel + 5 KPI cards + 5-section nav + Reset Demo header |
| 02 | `d3-02-charging-locations-light.png` | ChargingLocations list (12 rows, Code/Name/Division/Region/Country/Status) |
| 03 | `d3-03-charging-locations-tooltip-light.png` | Hover tooltip on `Charging Locations` heading per `[F-MD-01]` |
| 04b | `d3-04b-legal-entities-light-fixed.png` | LegalEntities with rollup column "CN-SHA-001 — Shanghai Office" + Country "CHN — China" (after country_name fix) |
| 05 | `d3-05-user-measurement-light.png` | UM matrix viewer with stubbed not_connected banner + Σ-row / Σ-col |
| 06 | `d3-06-regions-light.png` | Regions lookup |
| 07 | `d3-07-countries-light.png` | Countries lookup |
| 08 | `d3-08-people-light.png` | People panel (existing v4 panel reused) |
| 09 | `d3-09-role-types-light.png` | Role Types catalogue |
| 10 | `d3-10-external-cost-types-light.png` | External Cost Types catalogue |
| 11 | `d3-11-project-deps-light.png` | Project Dependencies (empty state) |
| 12 | `d3-12-planning-params-light.png` | Planning Parameters settings cards |
| 13 | `d3-13-hierarchy-light.png` | Portfolio Hierarchy (existing v4 panel reused) |
| 14b | `d3-14b-users-light.png` | Users panel with Tier 3 + Change Reviewer columns (empty seed) |
| 15 | `d3-15-role-permissions-light.png` | RolePermissionGrid for BTC + Distribution edits |
| 17 | `d3-17-workflow-forecast-cycle-light.png` | Workflow editor showing all 5 Forecast Cycle steps with touchpoints |
| 19 | `d3-19-workflow-fixed-light.png` | Workflow editor (post-D2-contract-alignment fix) |
| 20 | `d3-20-scheduled-changes-light.png` | Scheduled Changes 5-state lifecycle + Apply due changes |
| 21 | `d3-21-audit-log-light.png` | Audit Log V2 with category badges + diff column |
| 22 | `d3-22-charging-edit-dialog-light.png` | Edit-modal dialog for Charging Location (modal-edit pattern, see [D-NAV-05] note) |
| 23 | `d3-23-charging-locations-dark.png` | Dark mode — Charging Locations |
| 24 | `d3-24-workflow-dark.png` | Dark mode — Workflow editor full step list |
| 25 | `d3-25-audit-log-dark.png` | Dark mode — Audit Log V2 |
| 26 | `d3-26-um-matrix-dark.png` | Dark mode — UM matrix with adapted yellow alert banner |

### Issues Found and Fixed During Verification
1. **`country_name` missing from `LegalEntityResponse`** (D1 backend gap surfaced via D3 Legal Entities panel). Frontend rendered "CHN — undefined" because the API returned `country_iso_code` only. ChargingLocation already exposed both fields; aligned LegalEntity to match. Fix: 2 lines in `backend/schemas/charging.py` + `backend/routers/charging.py` (commit `Add country_name to LegalEntityResponse [F-MD-01]`).
2. **WorkflowTemplateEditor silent fetch-failure** — frontend types mismatched D2's authoritative `WorkflowStep` schema. Editor expected `participant_role` / `ordering` / `step_key` / `notifications: string[]`; backend emits `assigned_role` / `step_order` / no key field / `notifications: Record<string,string[]>`. The mismatch silently threw inside `.then()` (calling `.join()` on a dict), fell through to `.catch(setDetail(null))`, and the rubric stuck on the "Select a template" empty state. Fix: realigned `WorkflowStepItem` + `WorkflowStepActionItem` types, `StepEditState` JSON-encodes notifications now, dropped phantom `is_active` checkbox (only WorkflowTemplate has it, not WorkflowStep), updated PUT payload field names. Commit `Align WorkflowTemplateEditor with D2 backend contract [D-CAT-07]`.

### Working Assumptions
- **Users seed is empty.** D1 created the `User` model but did not seed any rows (DemoPersona handles auth in v5). The Users panel renders correctly but shows the empty state. Seeding sample users (with controller / cc_owner / pl / executive role + Tier 3 + change-reviewer flags exercised) belongs in **S1 seed reconstruction**.
- **Country `name` was always populated** in the underlying `Country` table — only the LegalEntity serializer was missing the field. Fixed in this session.
- **Modal-dialog edit vs full-page detail** — `[D-NAV-05]` reads "breadcrumb drill-down". For master-data entities with 4–6 fields each (ChargingLocation, LegalEntity, Region, Country, RoleType, ExternalCostType), D3 chose modal-dialog edit instead of routing to a per-entity detail page. Trade-off: faster + lighter for small entity edits; gives up the "back to list with breadcrumb" pattern. UM matrix viewer + Workflow Template Editor still use single-surface designs but with intra-page selection (template tabs / period selectors). Flagged below for discussion.

### Refactoring Opportunities
- **TS strict-mode pre-existing failures.** `npm run build` shows 78 errors across `workbench/`, `reporting/`, `portfolio/`, `capacity/`, `components/charts/`, and `api/endpoints.ts`. Counts identical between this branch and `main` (af4881a) — D3 added zero new strict-mode errors. Existing failures predate the wave; a dedicated `fix/typescript-strict` session would clean them up before they pile higher.
- **Pre-existing `LoBsPanel` React-key warning** (one duplicate-key warning on tbody children, untouched by D3) — fold into the same TS-strict cleanup.
- **Detail-page-with-breadcrumb pattern** — if `[D-NAV-05]` is read strictly, route the heavier system entities (Workflow Templates, RolePermissionGrid, Audit Log V2, Scheduled Changes) onto their own admin sub-routes with a breadcrumb (`Admin / Workflow Templates / Forecast Cycle`). Master-data modal edits can stay as-is. Estimated 1–2 hours.
- **Settings-card empty default** — Fiscal Year Start dropdown loads with no selected value; small UX fix to default to the current `01` value.

### Verification (manual + automated)
- `npm run build` (post-D3) — 78 errors, all pre-existing on `main`. No new D3-introduced TS errors (verified by running build on `main` too).
- Backend smoke (verifying D1 fix + D2 alignment): `curl /api/admin/legal-entities` now returns `country_name: "China"`; `curl /api/admin/workflow-templates/forecast_cycle` returns 5 steps with `assigned_role` / `step_order` / dict `notifications`.
- Browser walk: 24 sub-surfaces, both themes, captured screenshots above. Console: 0 errors triggered by D3 panels (one pre-existing `LoBsPanel` key-prop warning unrelated).

### Ready for merge
- Branch: `v5/cluster-d/d3-admin-frontend`
- Commits ahead of `main` (`af4881a`): 7 atomic (5 from initial implementation + 1 country_name fix + 1 D2-contract alignment).
- Per the wave-1 merge order (A5 → F2 → D3 → A7) D3 is the third merger; expects no conflicts with A5 (different layer) or F2 (different layer) since D3 only touches `frontend/src/modules/admin/`, `frontend/src/api/endpoints.ts` (in a clearly-marked `// === Admin (D3) ===` section per spawn-prompt contract), and `frontend/src/types/api.ts`. A7 is the second frontend merger and rebases on D3.

---

## v5 Session A7: Frontend — Tech Navigator scoring rubric UI (2026-04-28)

### Feature Overview
Self-contained, reusable Tech Navigator scoring rubric component (`TechNavigatorRubric`) implementing the full Scores & Ranking experience for the Backlog project detail view. Ships with a minimal scaffold harness page (`BacklogDetailStub`) at `/backlog-detail-stub/:projectId` so the rubric can be visually verified inside a representative 4-tab project-detail layout. **A6 (Backlog frontend) will replace the stub with the real detail view** when it lands; A7 ships rubric + harness only — full backlog list / cube view comes in A6.

### Spec references implemented
- `[A-TN-01]` Tech Navigator profile applies to all projects (frontend reads/writes via the A1 backend API for any project).
- `[A-TN-02]` Counterintuitive Complexity convention preserved — explicit "higher = simpler / better" sublabel on the Complexity score tile.
- `[A-TN-03]` Complexity sub-criteria with weights: Standardization 40 %, Usage 40 %, Maintenance and support 20 %.
- `[A-TN-04]` Value Creation sub-criteria with weights: Financial benefit 50 %, Payback 40 %, Competitive advantage 10 %.
- `[A-TN-05]` Two reserved Value Creation slots not surfaced — explicit dashed-border note pointing to the (future) admin Tech Navigator weights editor.
- `[A-TN-06]` Active weights displayed read-only in the rubric footer with note pointing to the admin module — weights themselves are admin-configurable globally (not per LoB).
- `[A-TN-07]` Transformation level (T0/T1/T2) selector with descriptions ("just better", "paper to software", "new business").
- `[A-TN-08]` Project Type (1/2/3) selector with ring-colour preview and per-type description, including the "Type 3 exempt from cutoff" note.
- `[A-TN-09]` Budget t-shirt size displayed (read-only — derived server-side from `total_budget` against admin thresholds) with the active threshold band as the subline.

### Acceptance criteria — all met
- ✅ Scoring rubric renders with the correct sub-criteria and 1-5 scales.
- ✅ Score entry updates the composite score in real time (client-side recompute mirrors backend `services/tech_navigator.py` formulas; debounced (300 ms) PUT to the backend keeps the persisted value authoritative).
- ✅ Transformation level (T0/T1/T2) and Project Type (1/2/3) selectors work.
- ✅ Weights displayed correctly from admin config (read from the `weights` snapshot embedded in the GET response).

### Technical Details
- **New module:** `frontend/src/modules/backlog/` created from scratch — minimal scaffold sufficient to host the rubric. Backlog list / cube view, sidebar nav entry, and full detail view defer to A6.
- **Components added:**
  - `frontend/src/types/techNavigator.ts` — TypeScript mirror of `backend/schemas/tech_navigator.py` (TechNavigatorProfile / Update / Weights / TshirtThresholds / etc.).
  - `frontend/src/modules/backlog/data/rubricLabels.ts` — descriptive rubric label dictionary (6 sub-criteria × 5 levels), Transformation level options, Project Type options.
  - `frontend/src/modules/backlog/components/ScoreSummaryCard.tsx` — Computed scores card (Complexity / Value Creation / Composite + budget t-shirt + threshold strip + saving / saved indicator).
  - `frontend/src/modules/backlog/components/RubricSubCriterionRow.tsx` — Reusable single sub-criterion picker (1-5 buttons, hover-preview description, Clear affordance, weight badge).
  - `frontend/src/modules/backlog/components/TechNavigatorRubric.tsx` — Main rubric. Owns local state, optimistic updates, debounced autosave (300 ms), client-side composite recompute. Exposes `projectId` and `readOnly` props.
  - `frontend/src/modules/backlog/BacklogDetailStub.tsx` — 4-tab harness page (Scores & Ranking, Financial Overview, Master Data, Milestones). Only Scores & Ranking has full content; the other three render placeholder tiles.
- **Append-only edits** (clearly marked `// === Tech Navigator (A7) ===` so the D3 frontend rebase is mechanical):
  - `frontend/src/api/endpoints.ts` — appended `techNavigatorApi` block with `get(projectId)` and `update(projectId, body)`.
  - `frontend/src/lib/routes.ts` — appended `'/backlog-detail-stub'` label entry.
  - `frontend/src/App.tsx` — added `<Route path="/backlog-detail-stub/:projectId" element={<BacklogDetailStub />} />`.
- **No sidebar / nav additions** — per team-lead guidance the Backlog top-level nav entry lands in A6.

### API consumed (A1 backend)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/projects/{id}/tech-navigator` | Read full profile + active weights snapshot |
| PUT | `/api/projects/{id}/tech-navigator` | Partial update — returns recomputed profile |

No new backend endpoints; A7 is pure frontend.

### Real-time scoring strategy
1. On mount, fetch the full profile (raw sub-criteria + computed scores + active admin weights) once.
2. Every click on a sub-criterion / Type / Transformation level button optimistically updates local state.
3. Computed scores (Complexity, Value Creation, Composite) are derived locally on every render using the same weighted-average formulas as `backend/services/tech_navigator.py` — verified by hand-calc during visual verification (5 / 4 / 3 → Complexity 4,20; 5 / 4 / 4 → Value 4,50; 70/30 → Composite 4,41).
4. A pending update body accumulates in a ref; a 300 ms debounce timer schedules a single PUT carrying the merged patch.
5. On PUT response, the authoritative server profile replaces local state (handles weight updates and rounding edge cases).
6. UI shows "Saving…" while a PUT is in flight and a "Saved" flash for 1.5 s after success.

### Verification (visual, real Playwright)
Verified at 1440 × 900 viewport against the running backend at `localhost:8000` and the Vite worktree dev server at `localhost:5175`:
1. **Initial empty profile** — clean, all "—" placeholders, all sub-criterion rows in their default state. Light mode rendered correctly.
2. **Scored — light mode** — clicked Standardization=5, Usage=4, Maintenance=3 → Complexity tile displayed `4,20 / 5`. Clicked Financial=5, Payback=4, Competitive=4 → Value Creation displayed `4,50 / 5`. Composite (70 % value · 30 % complexity) displayed `4,41 / 5`. Project Type 1 + Transformation T1 selected. "Saved" indicator visible.
3. **Scored — dark mode** — toggled `dark` theme; all semantic Tailwind tokens render correctly (no hardcoded `bg-white`, `text-slate-700`, etc.); status / scale colours all carry `dark:` variants per CLAUDE.md.
4. **Partial-profile edge case** — cleared Payback; Complexity stayed at `4,20 / 5`; Value Creation and Composite collapsed to `—` (matches `[A-PRI-01]` "partial profiles do not contribute to the ranking").

Screenshots saved to `/tmp/a7-screens/0{1..4}-*.png` during the verification run.

### Working assumptions / Ambiguities (flagged for KB confirmation)
- **Intermediate rubric labels (levels 2 / 3 / 4) are placeholders.** The spec only ships endpoint definitions for level 1 and level 5 ("Intermediate values of each sub-criterion are defined in the KB Tech Navigator reference slides and should be mirrored in the CRETA rubric UI"). A7 hard-codes a sensible interpolation in `frontend/src/modules/backlog/data/rubricLabels.ts` so the UI is verifiable today; the long-term home of these labels is the admin Tech Navigator rubric matrix editor (`[D-CAT-04]`), which lands in a future Cluster D session. Once that admin surface ships, the dictionary should be replaced with a fetch.
- **Read-only mode in the stub harness** is driven only by current role (controller / project_lead → editable; executive / cc_owner → read-only). The backend's stricter PL-ownership check (`pl_person_id == user.person_id`) is enforced server-side; in the stub harness we do not pre-disable controls for non-owning PLs because the harness is for visual verification only. A6 will refine this by passing the host project's `pl_person_id` to the rubric.
- **Stub harness layout** mimics the planned 4-tab detail view but is intentionally minimal. The 3 non-Scores tabs render placeholder tiles. A6's real detail view will replace the stub.

### Refactoring opportunities (noted, not acted on)
- The local recompute helpers in `TechNavigatorRubric.tsx` duplicate the backend's weighted-average / composite logic verbatim. Once a6 is built, consider extracting these into a shared `lib/techNavigator.ts` so other call sites (e.g. cube view bubble sizing, scenario diffs) can reuse them.
- The hard-coded rubric label dictionary will move to a fetched admin-config endpoint when `[D-CAT-04]` lands. At that point, `data/rubricLabels.ts` becomes a fallback.

### File ownership respected
- **Owned (created):** `frontend/src/modules/backlog/**`, `frontend/src/types/techNavigator.ts`.
- **Append-only (clearly-marked A7 sections so D3 rebase is mechanical):** `frontend/src/api/endpoints.ts`, `frontend/src/lib/routes.ts`, `frontend/src/App.tsx`.
- **Untouched** (per team-lead instruction): `frontend/src/modules/admin/**`, all other module folders, sidebar / nav configuration.

### Verification (build)
- `npx tsc -b` — no errors in any A7 file (4 strict-TS errors in the initial revision were fixed: explicit `reduce<number>` generics on `weightedAverage` and `as unknown as Record<string, number>` for the dynamic weight lookup).
- 78 pre-existing TS errors elsewhere on `main` HEAD (`SubmissionDiffView.tsx`, `ProjectTimelineChart.tsx`) are unchanged by A7.

### Stop point
Branch `v5/cluster-a/a7-tech-navigator-ui` carries 8 atomic commits and is ready for review. **No PR has been created** (per team-lead instruction). Awaiting team-lead direction on merge order with D3 (D3 merges first; A7 rebases on D3).

### Next session readiness
- A6 (Backlog frontend) will integrate `TechNavigatorRubric` directly into its real detail-view "Scores & Ranking" tab and remove the `BacklogDetailStub` stub page + `/backlog-detail-stub/:projectId` route.
- A8 (Pipeline stage UI) can reuse `data/rubricLabels.ts` for any rubric strings it needs.

---

## v5 Session D1: Admin Entities + CRUD (incl. Cluster F master data) Backend (2026-04-28)

### Feature Overview
- **Cluster D extensions** to the existing admin module: full CRUD for `RoleType` and `ExternalCostType` (models existed but had no admin endpoints), CRUD for the new `ProjectDependency` data model per `[D-AC-05]`, CRUD for the new `User` entity (separate from `Person` per spec §1584) with Tier-3 and change-reviewer flags per `[D-AC-01..03]`, and CRUD for the new `RolePermissionGrant` per-role-per-entity-type permission grid per `[F-AC-01]` (covers BTC profile + inter-service distribution edits, plus generic master-data entities).
- **Cluster F master data** — complete suite of new entities and CRUD per `[F-MD-01..03]`, `[F-UM-01..04]`, `[F-DG-03]`:
  - `Country` (~30 ISO rows lookup), `Region` (5 regions), `ChargingLocation` (15 KB charging codes with `division` as free-text + Region + Country FKs), `LegalEntity` (15 entities with many-to-one rollup to ChargingLocation + own Country FK for divergence cases), `UserMeasurement` (sparse versioned matrix; one demo flagship version seeded for 2026 Q1 across 4 S-codes × 6 charging locations).
  - `POST /api/admin/user-measurement/import` accepts a CSV upload, validates schema, skips zero-value rows for sparse storage, and creates a NEW version each time per `[F-UM-03]` (no overwrite — versioning keyed by `(year, quarter, imported_at)` triple).
  - `GET /api/admin/user-measurement/refresh-status` returns 200 with `{"status": "not_connected", "message": "..."}` instead of 501 so the frontend can render an explanatory dialog rather than a generic network error.
- **Configurable parameters** added to Section 12 of seed.sql per `[D-PRC-02..04]`: granularity boundary (12 months), forecast cycle cadence (3 months), cycle due day (15), default standard available hours (160), per-location overrides for Munich (155), Budapest (160), and Pune (170). Per-location capacity hours stored as keyed `PlanningParameter` rows so the existing admin UI surfaces them without a Location-schema change.

### Spec references implemented
`[D-AC-01]`, `[D-AC-02]`, `[D-AC-03]`, `[D-AC-05]`, `[D-AC-09]` (audit-log categorisation handled by D2; this session preserves all existing audit calls), `[D-PRC-02]`, `[D-PRC-03]`, `[D-PRC-04]`, `[D-CAT-07]` (workflow templates land in D2 — D1 surfaces the User/permission scaffolding the templates need), `[F-MD-01]`, `[F-MD-02]`, `[F-MD-03]`, `[F-AC-01]`, `[F-UM-01]`, `[F-UM-02]`, `[F-UM-03]`, `[F-UM-04]`, `[F-DG-03]` (one demo flagship version seeded; full ~99 × 90 matrix waits for S1).

Out of scope for D1, deferred per the team-lead's plan:
- `[D-CAT-07]` Workflow Template Editor backend — D2.
- `[D-AC-09]` Audit-log category column + 8-category enum + export — D2.
- `[D-AC-08]` Inter-project dependency cycle detection — surfaces in the consuming portfolio map; not a hard save-time block in D1 per the team-lead's note.
- Scheduled-change activation engine — D2.

### Technical Details
- **Models (5 new + 2 modified):**
  - `backend/models/charging.py` (NEW) — `Country`, `Region`, `ChargingLocation`, `LegalEntity`, `UserMeasurement`. UM has a unique constraint on `(year, quarter, imported_at, s_code, charging_location_id)` to prevent duplicate cells within a single import batch.
  - `backend/models/users.py` — appended `User` class. Separate from `Person`; FK to `people.id` is nullable per spec §1584. Carries `tier3_flag` and `change_reviewer_flag`.
  - `backend/models/projects.py` — appended `ProjectDependency` class. Soft-constraint edge with predecessor/successor FKs, dependency_type catalogue string, optional lag_days, notes, created_by audit.
  - `backend/models/system.py` — appended `RolePermissionGrant` at end-of-file (no edits to existing classes; D2 owns AuditLog modifications).
  - `backend/models/__init__.py` — registers all new models so `Base.metadata.create_all()` discovers them.
- **Schemas:**
  - `backend/schemas/charging.py` (NEW) — `Country{Create,Update,Response}`, `Region{Create,Update,Response}`, `ChargingLocation{Create,Update,Response}`, `LegalEntity{Create,Update,Response}`.
  - `backend/schemas/user_measurement.py` (NEW) — `UserMeasurementCellResponse`, `UserMeasurementListResponse`, `UserMeasurementVersionResponse`, `UserMeasurementVersionsResponse`, `UserMeasurementImportResponse`, `UserMeasurementRefreshStatusResponse`.
  - `backend/schemas/admin.py` — appended `RoleType*`, `ExternalCostType*`, `ProjectDependency*`, `User*`, `RolePermissionGrant*` schemas.
- **Routers (2 new + 1 extended):**
  - `backend/routers/charging.py` (NEW) — 16 endpoints across Country / Region / ChargingLocation / LegalEntity. List endpoints return the standard `{items, total}` shape with rolled-up names (e.g. `country_iso_code`, `charging_location_code`).
  - `backend/routers/user_measurement.py` (NEW) — 4 endpoints: `/refresh-status`, `/versions`, `/` (read by year/quarter, optionally by `imported_at`), `/import` (multipart file upload).
  - `backend/routers/admin.py` — appended new sections BEFORE the audit-log block to preserve existing endpoint ordering: 3 RoleType endpoints, 3 ExternalCostType endpoints, 4 ProjectDependency endpoints, 5 User endpoints, 5 RolePermissionGrant endpoints (incl. `/bulk` upsert).
- **Service:** `backend/services/user_measurement_import.py` (NEW) — pure CSV-parsing service that validates the header, looks up `charging_location_code` against the master, skips zero-value rows, and returns an `ImportResult` dataclass that the router wraps as JSON.
- **Wiring:** `backend/main.py` imports + `include_router`s the 2 new routers in lex-sort order so the merge with D2 has zero overlap.
- **Requirements:** `backend/requirements.txt` adds `python-multipart>=0.0.20` for `UploadFile`.
- **Tests:** 4 new test files, 74 new tests total — full suite 480 passed (406 baseline + 74 new), exceeding the 455 target.
- **Seed:** New sections at the TOP of `backend/seed/seed.sql` (so FKs resolve): Section 0 Countries (30), 0a Regions (5), 0b ChargingLocations (15), 0c LegalEntities (15), 0d UserMeasurement flagship version (12 cells), 0e Default RolePermissionGrants (4 controller defaults). Section 12 (planning parameters) extended with 7 new keys.

### API Endpoints Added
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/role-types` | List role types |
| POST | `/api/admin/role-types` | Create role type |
| PUT | `/api/admin/role-types/{id}` | Update role type |
| GET | `/api/admin/external-cost-types` | List external cost types |
| POST | `/api/admin/external-cost-types` | Create external cost type |
| PUT | `/api/admin/external-cost-types/{id}` | Update external cost type |
| GET | `/api/admin/project-dependencies` | List dependencies (optional `?project_id=`) |
| POST | `/api/admin/project-dependencies` | Create dependency edge |
| PUT | `/api/admin/project-dependencies/{id}` | Update dependency type / lag / notes |
| DELETE | `/api/admin/project-dependencies/{id}` | Remove dependency |
| GET | `/api/admin/users` | List users |
| GET | `/api/admin/users/{id}` | Get user detail |
| POST | `/api/admin/users` | Create user |
| PUT | `/api/admin/users/{id}` | Update user (incl. tier3 + change_reviewer) |
| PUT | `/api/admin/users/{id}/deactivate` | Deactivate user |
| GET | `/api/admin/role-permissions` | List grants (optional `?role=`, `?entity_type=`) |
| POST | `/api/admin/role-permissions` | Create grant |
| PUT | `/api/admin/role-permissions/bulk` | Bulk upsert grants from grid UI |
| PUT | `/api/admin/role-permissions/{id}` | Update grant |
| DELETE | `/api/admin/role-permissions/{id}` | Remove grant |
| GET | `/api/admin/countries` | List countries |
| POST | `/api/admin/countries` | Create country |
| PUT | `/api/admin/countries/{id}` | Update country |
| PUT | `/api/admin/countries/{id}/deactivate` | Deactivate country |
| GET | `/api/admin/regions` | List regions |
| POST | `/api/admin/regions` | Create region |
| PUT | `/api/admin/regions/{id}` | Update region |
| PUT | `/api/admin/regions/{id}/deactivate` | Deactivate region |
| GET | `/api/admin/charging-locations` | List charging locations (with rollups) |
| POST | `/api/admin/charging-locations` | Create charging location |
| PUT | `/api/admin/charging-locations/{id}` | Update charging location |
| PUT | `/api/admin/charging-locations/{id}/deactivate` | Deactivate |
| GET | `/api/admin/legal-entities` | List (optional `?charging_location_id=`) |
| POST | `/api/admin/legal-entities` | Create legal entity |
| PUT | `/api/admin/legal-entities/{id}` | Update legal entity |
| PUT | `/api/admin/legal-entities/{id}/deactivate` | Deactivate |
| GET | `/api/admin/user-measurement/refresh-status` | Stub auto-refresh status (200 not_connected) |
| GET | `/api/admin/user-measurement/versions` | List import versions |
| GET | `/api/admin/user-measurement` | Read cells for a (year, quarter) version |
| POST | `/api/admin/user-measurement/import` | CSV upload — creates a new version |

### Data Model Changes
- New tables: `countries`, `regions`, `charging_locations`, `legal_entities`, `user_measurements` (with the unique constraint above), `users`, `project_dependencies`, `role_permission_grants`.
- No migrations system (no Alembic). Existing `backend/creta_demo.db` will fail at startup against the new schema. Resolution: delete `backend/creta_demo.db` and restart — the seed loader recreates the schema and runs `seed.sql` to populate the new tables.

### Working Assumptions (flagged for KB confirmation)
- **RoleType is admin-managed** — D1 ships create + update endpoints. Deactivation deferred because RoleType has no `is_active` column today; adding it would ripple to seed.sql + the rate-table joins. Refactoring opportunity flagged below.
- **ExternalCostType ships full create + update.** Same caveat as RoleType for deactivation.
- **`ChargingLocation.division` is free-text** per `[F-MD-02]`'s explicit "no Division lookup" clause. Refactorable to a Division entity later if KB requests one.
- **UM CSV schema:** 6 columns `year, quarter, s_code, charging_location_code, value, source` with a header row. The `source` column is optional in the row payload — when absent or empty, the import endpoint uses the import-level default `csv_upload`.
- **UM "automatic refresh" returns 200 with `{"status": "not_connected", ...}`** rather than 501, so the frontend renders an explanatory dialog rather than a generic network error.
- **Inter-project dependency** cycle detection deferred. D1 ships data model + CRUD; the portfolio dependency map (frontend) surfaces cycles as warnings per `[D-AC-08]`.
- **User entity** is admin-created. There is no auto-create on login — that workflow is deferred. `DemoPersona` continues to drive the demo's role-resolution flow until a future session unifies them.
- **Standard available hours** stored as keyed `PlanningParameter` rows (`standard_available_hours_default`, `standard_available_hours_loc-muc`, …). The spec note in `[D-PRC-02]` says capacity hours stay on master-data entities — this design hits both spec letters: the value is admin-editable AND lives in the existing parameter table without changing the Location schema. Refactor to a Location column if KB requests a per-location editor inside the Location detail view.

### Refactoring Opportunities (noted, not acted on)
- `RoleType` and `ExternalCostType` lack `is_active` columns. Adding them would enable proper deactivation semantics consistent with CLAUDE.md's "deactivation, not deletion" rule. Touches the people / financial models, the seed.sql sections (5 + 6), the rate-table joins, and a frontend filter or two.
- `ChargingLocation.division` could be promoted to a `Division` lookup entity if KB introduces a controlled list.
- The `_audit()` helper in `routers/charging.py` and `routers/user_measurement.py` is a copy of `routers/admin._log_audit`. Once D2 lands the `category` parameter on `_log_audit`, dedupe these into a shared helper module.
- The seed UM block uses Python's `datetime.utcnow().isoformat()`-style format with `.000000` microseconds in seed.sql. Cleaner: extend the seed generator to emit ISO-format timestamps consistently across all DateTime columns. The other tables use `'YYYY-MM-DD HH:MM:SS'` (no microseconds) and rely on the loader's text→datetime coercion at read time, which works for queries that don't equality-compare datetimes — UM is the first table that does.
- Sub-criterion weights remain in `PlanningParameter` rows (`tn_*`). At the v5 admin-UI ramp-up this might warrant a dedicated table; flag for D3 frontend session.

### Notes for follow-on sessions
- **D2 (workflow templates + audit)** must add the `category` field to `AuditLog` and update ALL `_log_audit` call sites (including the new ones in this session: `routers/charging.py::_audit`, `routers/user_measurement.py::_audit`, plus the dozen new sites in `routers/admin.py`). The team-lead's instruction was that D1 makes no changes that conflict with D2's category rollout.
- **D3 (admin frontend)** can wire the entire D1 surface into the Section 1 (master data) browser, Section 2 (reference catalogues — RoleType, ExternalCostType), Section 3 (planning parameters — granularity / cadence / hours), Section 4 (hierarchy / inter-project dependencies), and Section 5 (User + RolePermissionGrant grid).
- **F1/F2/F3 (Cluster F)** consume `ChargingLocation` (FK target for distribution endpoints), `LegalEntity` (rollup display), `UserMeasurement` (Stage 2 BTC automatic-mode snapshot source), and `RolePermissionGrant` (BTC profile + distribution edit gates).
- **S1 (seed data)** needs to expand:
  - Charging locations from 15 to ~90 (full KB charging code list).
  - Legal entities from 15 to ~120.
  - UserMeasurement from 12 cells to the full ~99 × 90 sparse matrix per `[F-DG-03]`.

### Verification
- `python -m pytest backend/tests/ -v` → 480 passed (406 baseline + 74 new). Exceeds the team-lead's 455 target.
- Live `python main.py` smoke test against a freshly re-seeded DB confirmed:
  - 30 / 5 / 15 / 15 / 12 / 4 / 13 rows for Countries / Regions / ChargingLocations / LegalEntities / UserMeasurements / RolePermissionGrants / PlanningParameters.
  - `GET /api/admin/countries` returns the seeded ISO list.
  - `GET /api/admin/charging-locations` returns 15 items with rolled-up region/country names.
  - `GET /api/admin/legal-entities` returns 15 items rolled up to charging locations.
  - `GET /api/admin/user-measurement?year=2026&quarter=1` returns 12 cells; `GET /versions` returns the single seeded version with `row_count: 12`.
  - `GET /api/admin/user-measurement/refresh-status` returns 200 with `{"status": "not_connected", ...}`.
  - `POST /api/admin/user-measurement/import` with a 3-row CSV returns `inserted: 3, parse_errors: []` and creates a new version (visible in `/versions`).
  - `POST /api/admin/role-permissions` creates a project_lead btc_profile grant and `GET /role-permissions` lists 5 rows (4 seeded + 1 new).
  - `POST /api/admin/users` creates a Tier-3 user and the response carries `tier3_flag: true`.

### Curl examples (capture for D3 frontend integration)
```
H="X-Current-User: persona-controller"

# Master data
curl -s -H "$H" http://localhost:8000/api/admin/countries
curl -s -H "$H" http://localhost:8000/api/admin/regions
curl -s -H "$H" http://localhost:8000/api/admin/charging-locations
curl -s -H "$H" http://localhost:8000/api/admin/legal-entities

# Filter legal entities by charging location
curl -s -H "$H" "http://localhost:8000/api/admin/legal-entities?charging_location_id=cl-de-muc"

# UM viewer
curl -s -H "$H" http://localhost:8000/api/admin/user-measurement/refresh-status
curl -s -H "$H" http://localhost:8000/api/admin/user-measurement/versions
curl -s -H "$H" "http://localhost:8000/api/admin/user-measurement?year=2026&quarter=1"

# UM import
curl -s -H "$H" -F "file=@um.csv" http://localhost:8000/api/admin/user-measurement/import

# Permissions
curl -s -H "$H" http://localhost:8000/api/admin/role-permissions
curl -s -X PUT -H "$H" -H "Content-Type: application/json" \
  -d '{"grants":[{"role":"project_lead","entity_type":"btc_profile","can_edit":true}]}' \
  http://localhost:8000/api/admin/role-permissions/bulk

# Users
curl -s -H "$H" http://localhost:8000/api/admin/users
curl -s -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{"username":"alice","display_name":"Alice","role":"project_lead","tier3_flag":true}' \
  http://localhost:8000/api/admin/users

# Inter-project dependencies
curl -s -H "$H" http://localhost:8000/api/admin/project-dependencies
curl -s -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{"predecessor_project_id":"proj-erp2","successor_project_id":"proj-sap","dependency_type":"finish_to_start"}' \
  http://localhost:8000/api/admin/project-dependencies
```

### Ready for merge
Branch `v5/cluster-d/admin-entities-backend` carries 5 atomic commits and is ready to push. Per the team-lead's merge order, D1 merges first; D2 follows; A3 last. D2's pending changes to `models/system.py::AuditLog` and `routers/admin.py::_log_audit` (the `category` parameter) are confined to a non-overlapping hunk — D1's `RolePermissionGrant` is appended at end-of-file in `system.py`, and D1's new admin endpoints land BEFORE the audit-log block while keeping the existing ordering.

---

## v5 Session D2: Workflow Templates + Audit Query/Export Backend (2026-04-28)

### Feature Overview
- **Audit log enhancement** — added 8-category enum `AUDIT_CATEGORIES` to `AuditLog` (master_data, configuration, hierarchy, forecast_actions, pipeline_transitions, simulator, access_control, scheduled_change_lifecycle). Updated `_log_audit()` to require `category=` keyword-only; tagged all 44 existing call sites with the appropriate category. Server-side default `'master_data'` covers raw-SQL inserts in `seed.sql`.
- **Workflow templates** — new data model (`WorkflowTemplate`, `WorkflowStep`, `StepAction`) for the six configurable workflows per `[D-CAT-07]`: forecast_cycle, intake, change_request, send_back, milestone_baseline_override, scheduled_master_data_activation. Steps are not reorderable through the API; touchpoints (required/skippable, role, data gates, notifications, time constraint, escalation) are editable.
- **Scheduled changes** — `ScheduledChange` model with the 5-state lifecycle (`pending_review` → `approved` → `activated` / `rejected` / `cancelled`). CRUD endpoints + manual-trigger activation engine (`POST /api/admin/apply-scheduled-changes`).
- **Audit query and export** — `services/audit_query.py` for filtered + paginated queries; `services/audit_export.py` for CSV (stdlib) and XLSX (best-effort openpyxl). New router `/api/audit` with `/log`, `/log/entity/{type}/{id}`, `/categories`, `/export`.
- **Templates ship as configurable data only** — wiring them into live CR / intake / submission flows is deferred to a follow-on session.

### Spec references implemented
- `[D-CAT-07]` Workflow Template Editor (data model + step-touchpoint API).
- Audit log enhancements per spec line ~1849: categorised entries (8 categories), entity-scoped trails, CSV/XLSX export.
- Scheduled-change lifecycle and activation per spec lines ~1592–1610 and ~2456.

Out of scope (working data only — wiring deferred):
- Hooking workflow templates into the live CR / intake / submission flows.
- Cron-based daily activation job (manual-trigger endpoint provided; production wiring is a deployment concern).
- Approval UI for scheduled changes (D3 frontend).

### Technical Details
- **Models added:**
  - `backend/models/workflow_templates.py` — `WorkflowTemplate`, `WorkflowStep` (with `data_gates_json`, `notifications_json` JSON columns + scalar touchpoints), `StepAction` (multi-action steps for review/gate types). Module-level constants `STEP_TYPES`, `SHIPPED_TEMPLATE_KEYS`, `ESCALATION_ACTIONS`.
  - `backend/models/scheduled_changes.py` — `ScheduledChange` with `entity_type`/`entity_id` target, `pending_values_json`, `activation_date`, `review_status`, audit columns (`reviewed_by`, `reviewed_at`, `review_comments`, `activated_at`, `activation_error`). Constant `SCHEDULED_CHANGE_STATES`.
  - Both registered in `models/__init__.py`.
- **Models modified:**
  - `backend/models/system.py` — `AuditLog` gains `category: Mapped[str]` (`String(40)`, NOT NULL, `default='master_data'`, `server_default='master_data'`). Added `AUDIT_CATEGORIES` constant.
- **Services added:**
  - `backend/services/audit_query.py` — `query_audit_log`, `query_entity_trail`, `list_categories`. Returns `AuditEntry` DTOs (easier to serialise than ORM rows).
  - `backend/services/audit_export.py` — `export_csv` (UTF-8 BOM, preamble + 12-column rows), `export_xlsx` (raises `RuntimeError` if openpyxl missing — router falls back to CSV with `X-Audit-Export-Fallback` header).
  - `backend/services/scheduled_change_activation.py` — `apply_due_changes` engine + `APPLY_HANDLERS` dispatcher. Ships with `planning_parameter` handler only; other entity types log an "activation no-op" so the lifecycle still completes.
- **Routers added:**
  - `backend/routers/workflow_templates.py` — `/api/admin/workflow-templates` (controller-only).
  - `backend/routers/scheduled_changes.py` — `/api/admin/scheduled-changes*` + `/api/admin/apply-scheduled-changes` (controller-only).
  - `backend/routers/audit.py` — `/api/audit/*` (controller-only). Existing `/api/admin/audit-log` in `routers/admin.py` stays put for back-compat.
  - All three wired into `main.py` in lexicographic order.
- **Routers modified (audit category tagging only):**
  - `backend/routers/admin.py` — `_log_audit` signature gains keyword-only `category: str`. 32 call sites updated:
    - `cost_center`, `competence_center`, `person`, `location`, `rate_table` → `master_data`
    - `planning_parameter` → `configuration`
    - `lob`, `project` (lob assign), `grouping_entity_type`, `grouping_entity`, `grouping_hierarchy`, `project_grouping` → `hierarchy`
  - `backend/routers/tech_navigator.py` — Tech Navigator score edits → `master_data` (closest fit; see Working assumptions).
  - `backend/routers/milestones.py` — milestone create / update / override / delete → `forecast_actions`.
  - `backend/routers/pipeline.py` — pipeline stage / DoI / frozen_doi / AI Council / within_cutoff → `pipeline_transitions`.
- **Tests added (53 new):**
  - `backend/tests/test_workflow_template_router.py` — 14 tests covering list / detail / step update (incl. JSON columns, validation, audit logging) / active toggle / role-based access.
  - `backend/tests/test_scheduled_change_activation.py` — 11 tests covering create / approve / reject / cancel / engine activation / unsupported-type skip / future-date guard / pending-review-skip.
  - `backend/tests/test_audit_query.py` — 21 tests covering query filters (category, entity, user, date range), pagination, ordering, router endpoints, error paths.
  - `backend/tests/test_audit_export.py` — 7 tests covering CSV BOM + headers + data rows, XLSX content, router CSV/XLSX endpoints, filter pass-through.
- **Seed:** appended at end of `backend/seed/seed.sql` (D1 owns top-of-file sections):
  - 6 workflow templates, 23 steps, 12 step actions matching spec line ~1673.
  - 5 sample scheduled changes spanning 4 lifecycle states (pending_review × 2, approved × 1, rejected × 1, activated × 1).
  - Updated existing audit_log INSERTs to include `category` column (forecast_actions for CRs/projects, simulator for scenarios, master_data for project create).

### API Endpoints Added
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/audit/log` | Global audit log with category / entity / user / date filters + pagination |
| GET | `/api/audit/log/entity/{entity_type}/{entity_id}` | Entity-scoped audit trail |
| GET | `/api/audit/categories` | Reference list of the 8 audit categories |
| GET | `/api/audit/export` | CSV / XLSX export with the same filters as `/log` |
| GET | `/api/admin/workflow-templates` | List configurable workflow templates with step counts |
| GET | `/api/admin/workflow-templates/{id_or_key}` | Full template detail with steps + actions |
| PUT | `/api/admin/workflow-templates/{id_or_key}/steps/{step_id}` | Update step touchpoints (required, role, gates, notifications, time, escalation) |
| PUT | `/api/admin/workflow-templates/{id_or_key}/active` | Toggle whole-template active flag |
| GET | `/api/admin/scheduled-changes` | List pending/approved/activated/rejected/cancelled changes |
| GET | `/api/admin/scheduled-changes/{id}` | Detail for a single scheduled change |
| POST | `/api/admin/scheduled-changes` | Create a scheduled change in `pending_review` |
| POST | `/api/admin/scheduled-changes/{id}/approve` | Second-admin approval |
| POST | `/api/admin/scheduled-changes/{id}/reject` | Reject with comments |
| POST | `/api/admin/scheduled-changes/{id}/cancel` | Withdraw before activation |
| POST | `/api/admin/apply-scheduled-changes` | Manually run the activation engine |

### Data Model Changes
- New tables: `workflow_templates`, `workflow_steps`, `workflow_step_actions`, `scheduled_changes`.
- `audit_log` gains `category VARCHAR(40) NOT NULL DEFAULT 'master_data'`.
- **No Alembic** — the existing `backend/creta_demo.db` will fail to read the new column and tables on the next startup. Move the file aside (`mv backend/creta_demo.db backend/creta_demo.db.bak`) before running `python main.py`; the startup hook re-creates the schema and re-runs `seed.sql`.

### Working assumptions
- **Audit category mapping for Tech Navigator scores** — Tech Navigator score edits live on the project entity but are conceptually project-level qualitative metadata, not v5 master data (which is reference catalogues). I tagged them `master_data` as the closest fit. If a follow-on session adds a `project_metadata` category we can reclassify.
- **Audit category for milestones** — I tagged milestone CRUD + baseline override under `forecast_actions` since milestone planning is part of the project's forecast view. The baseline-override row could alternatively live in `configuration` if KB prefers — the audit table is queryable by both category and entity_type so the distinction is cosmetic.
- **Default audit category for legacy rows** — `server_default='master_data'`. Any row inserted by raw SQL without an explicit category lands here. Acceptable for the v4 demo data; new code should always pass `category=` explicitly.
- **Workflow template wiring is deferred** — D2 ships templates as configurable data only. Live CR / intake / submission flows still hard-code their step sequences; reading config from `WorkflowTemplate` is a follow-on session (likely after D3 frontend lands).
- **Scheduled-change activation engine is manual-trigger only** — D2 exposes `POST /api/admin/apply-scheduled-changes`. Cron wiring is a deployment concern. The endpoint is idempotent and safe to call repeatedly; nothing happens for changes whose activation date has not arrived.
- **Activation dispatcher is partial** — only `planning_parameter` is wired through to its live entity. Other entity types (`cost_center`, `person`, etc.) accept create/approve/cancel just fine but the activation step records as a "no-op" with the change still flipped to `activated`. Wiring additional handlers is part of D3+ follow-on work; the dispatcher (`APPLY_HANDLERS`) in `services/scheduled_change_activation.py` is the single extension point.
- **CSV is the primary export** — XLSX is best-effort via openpyxl. `requirements.txt` does not pin openpyxl; if it is unavailable at runtime the router serves CSV with an `X-Audit-Export-Fallback` header documenting the substitution. The XLSX path is exercised in tests but the test asserts either a real XLSX or the fallback header.

### Refactoring opportunities (noted, not acted on)
- `_log_audit` lives in `routers/admin.py` and is imported by 4 other routers (`tech_navigator`, `milestones`, `pipeline`, plus my new `workflow_templates`, `scheduled_changes`, and `services/scheduled_change_activation`). It is not a router concern — it should move to a service module (e.g. `services/audit_log.py`) so the router doesn't act as a utility import hub. Out of scope for D2; flagged here for a future cleanup.
- The four routers that currently import `_log_audit` from admin.py create circular-import risk if admin.py ever needs to import from them. Untangling belongs with the move above.
- The audit log filter UI on the frontend (D3) will likely need a stable ordering for categories. The reference list in `services/audit_query.list_categories()` returns them in `AUDIT_CATEGORIES` definition order; a future session may want to make ordering admin-configurable.
- Existing routes for audit log are split: legacy `/api/admin/audit-log` in admin.py (kept for back-compat) and new `/api/audit/*` in audit.py. Once D3 ships, consider deprecating the legacy route. Out of scope here.

### Notes for follow-on sessions
- **D3 frontend** consumes:
  - `GET /api/admin/workflow-templates` for the editor sidebar.
  - `GET /api/admin/workflow-templates/{id_or_key}` for the vertical step-card stack visualisation.
  - `PUT .../steps/{step_id}` for the inline-edit pattern (touchpoints fold open).
  - `GET /api/admin/scheduled-changes` for the global Scheduled Changes panel.
  - The five action endpoints (create / approve / reject / cancel / apply) for the approval UI.
  - `GET /api/audit/log`, `/categories`, `/export` for the audit log viewer.
- **Activation cron** — production wiring runs `POST /api/admin/apply-scheduled-changes` daily (configurable time per spec line ~1610). The endpoint is idempotent and safe to call from any scheduler.
- **Workflow template enforcement** — when a follow-on session wires templates into live flows, it should read `WorkflowTemplate` by stable `key` (not numeric `id`), respect the `is_active` flag (skip inactive templates' steps), and short-circuit disabled steps (`required=False AND skippable=True`).
- **D1 conflict resolution** — D1 adds new `_log_audit()` callers and a `RolePermissionGrant` class at the end of `system.py`. After D1 merges into main, this branch must rebase, add `category=` to D1's new callers, and re-run the test suite. The `system.py` 3-way merge should be conflict-free (D1 writes at end-of-file; D2 writes at the AuditLog block).

### Verification
- `python -m pytest backend/tests/ -v` → **459 passed** (406 baseline + 53 new D2 tests). 0 failures.
- Live `python main.py` smoke (with the db moved aside to force re-seed) confirmed:
  - `GET /api/audit/categories` returns the 8 categories.
  - `GET /api/audit/log?category=forecast_actions&limit=3` returns 3 rows from seeded change-request audit history.
  - `GET /api/admin/workflow-templates` returns the 6 seeded templates with correct step counts.
  - `GET /api/admin/workflow-templates/forecast_cycle` returns the full step list with JSON-decoded `data_gates` and `notifications`.
  - `POST /api/admin/scheduled-changes` creates a new change in `pending_review`.
  - `POST /api/admin/apply-scheduled-changes` returns the engine summary.
  - `GET /api/audit/export?format=csv` produces a UTF-8 BOM CSV with metadata preamble.
  - `GET /api/audit/export?format=xlsx` produces a real `.xlsx` file (`Microsoft Excel 2007+` per `file(1)`).

### Curl examples

```bash
# List the 8 audit categories
curl -H "X-Current-User: persona-controller" http://localhost:8000/api/audit/categories

# Filter audit log by category (repeat param to OR)
curl -H "X-Current-User: persona-controller" \
  "http://localhost:8000/api/audit/log?category=forecast_actions&category=hierarchy&limit=20"

# Entity-scoped trail
curl -H "X-Current-User: persona-controller" \
  http://localhost:8000/api/audit/log/entity/change_request/28

# CSV export
curl -H "X-Current-User: persona-controller" \
  -OJ "http://localhost:8000/api/audit/export?format=csv&category=master_data"

# List workflow templates
curl -H "X-Current-User: persona-controller" http://localhost:8000/api/admin/workflow-templates

# Get a single template by key
curl -H "X-Current-User: persona-controller" \
  http://localhost:8000/api/admin/workflow-templates/forecast_cycle

# Update a step's touchpoints
curl -X PUT -H "X-Current-User: persona-controller" -H "Content-Type: application/json" \
  -d '{"required": false, "time_constraint_days": 14, "escalation_action": "reminder"}' \
  http://localhost:8000/api/admin/workflow-templates/forecast_cycle/steps/3

# Create a scheduled change
curl -X POST -H "X-Current-User: persona-controller" -H "Content-Type: application/json" \
  -d '{"entity_type":"planning_parameter","entity_id":"standard_hours_global","description":"Lower hours","pending_values":{"current_value":"156"},"activation_date":"2026-12-01"}' \
  http://localhost:8000/api/admin/scheduled-changes

# Approve and activate
curl -X POST -H "X-Current-User: persona-controller" \
  http://localhost:8000/api/admin/scheduled-changes/1/approve
curl -X POST -H "X-Current-User: persona-controller" \
  http://localhost:8000/api/admin/apply-scheduled-changes
```

---

## v5 Session A3: Ranking Engine + Cutoff Lines Backend (2026-04-28)

### Feature Overview
- New `services/ranking.py` plus `routers/ranking.py` mounted at `/api/portfolio` deliver the v5 backlog ranking and cutoff-line computation per `[A-PRI-01..04]` and `[A-BK-09..14]`. The ranked list orders backlog-eligible projects (`pipeline_stage IN BACKLOG_STAGES, project_type != 3, is_active=True`) by composite score with admin-configurable tie-breakers; Type 3 projects ride in a separate "Pre-funded" section.
- Two cutoff lines are computed in a single walk per `[A-BK-10]`/`[A-BK-11]`: **should-be** (cumulative budget of every ranked project) and **reality** (cumulative budget of currently-committed projects only — `Active` plus `Approved` rows whose `within_cutoff` was already True). The misalignment zone bounds (start/end ranks) are returned in the same payload.
- The contestable envelope = `ranking_total_available_budget − Σ(Type 3 in BACKLOG ∪ OPERATE) − Σ(OPERATE_STAGES)` per `[A-BK-09]` and `[A-TN-08]`.
- `recompute_within_cutoff_for_backlog()` writes the per-project `within_cutoff` flag for Approved-stage projects per `[A-PS-06]` and clears it for non-Approved backlog rows. The function is the single DB-mutating entry point in `services/ranking.py`; pure helpers do not touch state.
- Admin-configurable parameters (group `ranking`): `ranking_total_available_budget` (placeholder 50M EUR) and `ranking_tiebreakers` (default `composite_score:desc,doi:asc,total_budget:desc` per `[A-BK-06]`).
- Three new endpoints (`/api/portfolio/backlog`, `/backlog/cutoff`, `/backlog/rebalance`) plus 6 trigger hooks fan out the recompute on every event listed in `[A-BK-14]`.

### Spec references implemented
`[A-PRI-01]`–`[A-PRI-04]`, `[A-PS-05]`–`[A-PS-06]`, `[A-PS-08]` (manual override path preserved via the existing manual `within_cutoff` PUT), `[A-BK-06]`, `[A-BK-09]`–`[A-BK-14]`, `[A-TN-08]`.

Out of scope per session brief:
- `[A-PS-07]` auto-activation on launch date — A3 keeps the flag accurate; the scheduler-driven Approved → Active transition belongs to a future job/cron session.
- `[A-BK-15]` "estimated/requested budget" field for pre-approval projects — pre-approval rows currently use `total_budget` as the walk input. Tracked as a follow-up.
- `[A-BK-13]` long-term sustainability KPI/banner — not implemented in A3; primary 12-month walk only per `[A-BK-12]`.

### Technical Details
- **Service:** `backend/services/ranking.py`. `RankingConfig` dataclass + `load_config(db)` mirrors A1's `WeightsSnapshot` pattern. Pure helpers: `_parse_tiebreakers`, `_project_walk_budget`, `_project_sort_key`, `compute_pre_funded_total`, `compute_hyper_maintenance_total`, `compute_contestable_envelope`. Orchestrators: `compute_ranked_backlog`, `compute_cutoff_lines`, `recompute_within_cutoff_for_backlog`. Trigger key set `RANKING_RELEVANT_PREFIXES = ("ranking_", "tn_")` exposed via `parameter_key_triggers_recompute(key)`.
- **Schemas:** `backend/schemas/ranking.py` — six Pydantic models: `RankedProjectItem`, `CutoffLines`, `RankingConfigSnapshot`, `RankedBacklogResponse`, `CutoffLinesResponse`, `RebalanceResponse`.
- **Router:** `backend/routers/ranking.py` mounted at `/api/portfolio`. GET endpoints open to any authenticated role per the spec's "Full backlog, all projects" row; POST `/rebalance` requires controller via `require_role`. Filters (`pipeline_stage`, `project_type`, `tshirt_size`) apply post-walk to the items list only — cutoff line positions reflect the full portfolio reality regardless of filter.
- **Trigger hooks (best-effort, try/except wrapped):**
  1. `routers/portfolio.py::approve_project` — project entering Approved.
  2. `routers/portfolio.py::approve_cr` — CR controller approval applies forecast deltas.
  3. `routers/workbench.py::accept_cr_changes` — PL acceptance auto-applies changes when there's no resource impact.
  4. `routers/workbench.py::submit_forecast_cycle` — rolling-forecast cadence.
  5. `routers/admin.py::recompute_scores` — chains after the existing `recompute_all_scores`.
  6. `routers/admin.py::update_parameters` — extended to fire when any changed key matches `parameter_key_triggers_recompute` (ranking_* or tn_*).
  7. `routers/pipeline.py::transition_pipeline` — stage move in/out of backlog.
  Each hook swallows exceptions and rolls back so a recompute failure cannot surface as a 500 on the parent endpoint.
- **Seed:** appended two rows to `backend/seed/seed.sql` section 12 under `param_group='ranking'`.
- **Audit logging:** the manual `POST /rebalance` writes one summary row (`entity_type='within_cutoff', action='rebalance', entity_id='portfolio'`). System-driven recomputes (the 6 trigger hooks) do not emit audit rows because there is no `CurrentUser` in scope; per-project flag flips are intentionally deterministic given inputs and so don't need individual audit trails. Re-evaluate if KB requires a "system" pseudo-user pattern.
- **Tests:** 71 new tests across `tests/test_ranking_service.py` (50) and `tests/test_router_ranking.py` (21). Full suite: 477 passed (406 baseline + 71 new).

### API Endpoints Added
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET    | `/api/portfolio/backlog`           | any role | Full ranked list + pre-funded section + cutoff lines + config snapshot |
| GET    | `/api/portfolio/backlog/cutoff`    | any role | Slim cutoff summary for KPI strips |
| POST   | `/api/portfolio/backlog/rebalance` | controller | Force a within_cutoff recompute; emits one summary audit row |

GET `/backlog` accepts optional `pipeline_stage` (multi), `project_type`, and `tshirt_size` (multi) query params for visibility-only filtering.

### Data Model Changes
None. A3 is a pure read/compute layer; the `within_cutoff` column on `Project` was added in A2. Two new `planning_parameters` rows are seed-only.

### Working assumptions
- `ranking_total_available_budget` default of **€50M** is a placeholder pending KB confirmation per `[A-BK-09]`.
- 12-month horizon hard-coded per `[A-BK-12]`. Not exposed as an admin parameter in v5.
- Hyper-maintenance committed spend = `Σ(total_budget) WHERE pipeline_stage IN OPERATE_STAGES` (Hyper-maintenance + Operate + Retired). Whole-project totals rather than 12-month-slice forecast aggregation. Refines when monthly forecast aggregation lands.
- Pre-approval projects (DoI 0–2) use `total_budget` as the walk input. Will switch to a dedicated estimated-budget field when `[A-BK-15]` lands in a follow-up session.
- Default tie-breaker order: `composite_score:desc, doi:asc, total_budget:desc`. DoI ASC follows spec text in `[A-BK-06]` ("earlier-stage projects surface first because they need decisions sooner"). The session brief mentioned `doi DESC`; the spec was treated as authoritative — flip via `ranking_tiebreakers` PlanningParameter if KB confirms otherwise.
- The reality-line walk uses the *previously persisted* `within_cutoff` value to identify committed Approved rows. When called pre-recompute it gives "current state"; when called post-recompute it gives "post-rebalance state". Document the timing in any UI copy.
- Audit rows for system-driven recomputes are intentionally suppressed; only the manual `POST /rebalance` emits a high-level audit summary.
- Type 3 projects whose `within_cutoff` was previously set get cleared on recompute — Type 3 doesn't compete in the ranked list, so it has no cumulative rank.

### Verification
- `python -m pytest backend/tests/ -v` → **477 passed** (406 baseline + 50 new service + 21 new router).
- Live `python main.py` smoke test against a freshly seeded DB:
  - `GET /api/portfolio/backlog -H "X-Current-User: persona-controller"` → 200, returned 28 ranked items + cutoff payload + config snapshot.
  - `GET /api/portfolio/backlog/cutoff -H "X-Current-User: persona-exec"` → 200, contestable envelope = €47,615,240 (€50M − €2,384,760 of OPERATE_STAGES), `should_be_cutoff_rank=null` (envelope not exhausted by demo data).
  - `POST /api/portfolio/backlog/rebalance -H "X-Current-User: persona-controller"` → 200, `recomputed=28, changed=0` (idempotent against the seeded state).
  - `POST /api/portfolio/backlog/rebalance -H "X-Current-User: persona-pl"` → **403** "Role 'project_lead' not permitted. Required: controller".

### Refactoring opportunities (noted, not acted on)
- **`_log_audit` is duplicated** across `routers/admin.py`, `routers/milestones.py`, `routers/pipeline.py`, and now imported into `routers/ranking.py`. After D2 lands the new `category=` parameter, this duplication will multiply. Worth lifting to `services/audit.py` in a follow-up.
- **CR budget-mutation paths are scattered.** `_apply_cr_changes_to_forecast` lives in `routers/portfolio.py` while `_apply_cr_to_forecast` lives in `routers/workbench.py` — near-identical bodies. Worth consolidating into `services/cr_apply.py`.
- **Seed data lacks Tech Navigator scores.** All 28 backlog projects currently have `composite_score=null` so the ranking falls back to the secondary tie-breaker (DoI ASC). The ranked list order will only become meaningful once S1 populates realistic TN profiles.

### Notes for follow-on sessions
- **A5 intake workflow** consumes `compute_ranked_backlog` to render the controller's review queue inside the backlog view (filter to `Under Evaluation`). When new projects are created at DoI 0, the existing `transition_pipeline` hook fires on the implicit `Proposed` move and recomputes within_cutoff automatically — no extra wiring needed.
- **A6 frontend backlog module** consumes the `RankedBacklogResponse` shape directly; `cumulative_budget_should_be` and `cumulative_budget_reality` per item enable the UI to render the cutoff bands without re-running the walk.
- **A7 Tech Navigator UI** PUT to `/api/projects/{id}/tech-navigator` already runs `recompute_all_scores` indirectly via PlanningParameter changes; A3 does NOT yet hook the per-project Tech Navigator PUT into the within_cutoff recompute. If that becomes desired, add the hook to `routers/tech_navigator.py::update_tech_navigator` after `db.commit()`. Flagged as "follow-up if KB wants the cutoff to update on every per-project score edit".
- **`[A-PS-07]` auto-activation on launch date** is a scheduler concern; recompute will pick up the new state automatically once a job flips Approved → Active.
- **D2 `_log_audit` rebase** — A3's calls use the current main signature without `category=`. After D2 merges, my single audit call site in `routers/ranking.py::rebalance_backlog` and any new ones in the trigger hooks (currently none — all hooks run audit-free) will need a one-line update to add `category="pipeline_transitions"` (the rebalance is a pipeline-level event).

### Out-of-scope notes
- `[A-PS-07]` auto-activation logic deferred to a scheduler/cron session.
- `[A-BK-13]` long-term sustainability KPI/banner deferred — primary 12-month walk only.
- `[A-BK-15]` estimated/requested budget field for pre-approval projects deferred.
- Per-project Tech Navigator PUT does NOT trigger within_cutoff recompute. Admin parameter PUT and `recompute-scores` POST cover the bulk recompute paths; per-project edits flow through next time another trigger fires.
- Filters on GET `/backlog` are server-side; pagination is not implemented (the v5 backlog is expected to fit in a single page given KB's portfolio size).

### Ready for review
Branch `v5/cluster-a/ranking-engine-backend` carries 9 atomic commits and 477 passing tests. Awaiting team-lead's PR / merge-order coordination — D1 → D2 → A3 per the brief.

---

## v5 Session A2: Pipeline Stages, DoI, Project Lifecycle Backend (2026-04-27)

### Feature Overview
- Each project carries a v5 lifecycle alongside the existing v4 `status` field: working pipeline stage (one of 9 names per `[A-PS-02]`), DoI level 0–5 per `[A-DOI-01]`, frozen DoI for off-path stages (`Paused`, `Cancelled`), AI Council screening flag + OneDrive document URL, and a settable `within_cutoff` boolean.
- New `/api/projects/{id}/pipeline*` router with four endpoints: GET full state (any role), POST stage transition with optional `override_reason` (controller anywhere; PL on own project for forward DoI 0→1 / 1→2), PUT AI Council flag + URL (controller-only), PUT manual within_cutoff (controller-only; A3 replaces with computed value).
- Stage-transition graph permits backwards moves per `[A-PS-11]`; Cancelled→anything requires `override_reason` per `[A-PS-10]`. Off-path entry freezes the live DoI into `frozen_doi`; leaving an off-path stage restores it.
- DoI gate validation runs only on forward DoI moves, returns 409 with the missing-fields list, and is bypassable via controller `override_reason` (audited as `action='override'`).

### Spec references implemented
`[A-PS-01]`–`[A-PS-04]`, `[A-PS-06]`, `[A-PS-10]`, `[A-PS-11]`, `[A-DOI-01]`–`[A-DOI-10]`, `[A-DA-01]`. Out of scope per plan: `[A-PS-12]` Operate Portfolio view (frontend), `[A-PS-13]` v4 intake retirement (A5), `[A-PS-07]`/`[A-PS-08]` auto-activation rules (A3), `[A-DA-02]` structured description sections, `[A-DA-03]` new project fields (requesting BU, demand type, value stream, Wave ID — deferred to a follow-up session because the schema additions cross-cut intake forms).

### Technical Details
- **Model:** 6 new columns on `Project` in `backend/models/projects.py`: `pipeline_stage` (`String(30)`), `doi`/`frozen_doi` (`Integer`), `ai_council_approved` (`Boolean NOT NULL DEFAULT 0`), `ai_council_doc_url` (`Text`), `within_cutoff` (`Boolean`). All others nullable so existing rows survive re-seed.
- **Service:** `backend/services/pipeline.py` — `STAGES` ordered tuple, `BACKLOG_STAGES`/`OPERATE_STAGES`/`OFF_PATH_STAGES` frozensets, `VALID_TRANSITIONS` graph, `is_transition_allowed`, `doi_for_stage`, `WORKING_DOI_GATES` dict + `FieldRequirement` dataclass, `validate_doi_gate`, `compute_pipeline_state`. Pure functions; no DB writes.
- **Schemas:** `backend/schemas/pipeline.py` — `GateStatus`, `PipelineStateResponse`, `StageTransitionRequest`, `AICouncilUpdate`, `WithinCutoffSet`.
- **Router:** new `backend/routers/pipeline.py` mounted at `/api/projects`. Authorisation via `_can_modify_pipeline` helper mirroring A1's `_can_edit_tn`. Audit log entries under `entity_type='pipeline'` (stage/DoI/frozen_doi changes + override action), `'ai_council'`, and `'within_cutoff'`.
- **Seed:** column list in `backend/seed/seed.sql` projects INSERT block extended; all 32 existing rows now carry stage / DoI / AI Council values per the status→stage mapping below. Hand-edited via a one-shot Python regex script (the `seed/generate_seed/` generator is not used for v5 columns yet — same convention as A1).
- **Tests:** 56 new tests across `tests/test_pipeline_service.py` (28) and `tests/test_router_pipeline.py` (28). Standalone A2 suite: 376 passed (320 baseline + 56 new). After merging with A4: 406 passed.

### API Endpoints Added
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/projects/{id}/pipeline` | Full pipeline state + available transitions + gate status |
| POST | `/api/projects/{id}/pipeline/transition` | Move stage / DoI; `override_reason` bypasses gate fields |
| PUT | `/api/projects/{id}/pipeline/ai-council` | Set AI Council flag + OneDrive doc URL |
| PUT | `/api/projects/{id}/pipeline/within-cutoff` | Manual within_cutoff setter (A3 replaces with computed) |

### Data Model Changes
6 new columns on `projects` table. As with A1, **no Alembic** — the existing `backend/creta_demo.db` will fail with `no such column: projects.pipeline_stage` on the next startup. Delete the file before running `python main.py`; the startup hook re-creates the schema and re-runs `seed.sql`.

### Working assumptions
- **DoI gate field choices** — gate definitions are working assumptions per `[A-OQ-04]`/`[A-BK-30]`. We require only fields that already exist on `Project`. Notable choices:
  - DoI 0 minimum: project name, description (treated as the structured description until `[A-DA-02]` lands), `pl_person_id`, `project_type`. New fields `requesting_business_unit`, `demand_type`, `value_stream`, `wave_id` per `[A-DA-03]` are deferred.
  - DoI 1: composite_score not null, tshirt_size not null, transformation_level not null, ai_council_approved truthy, ai_council_doc_url not null.
  - DoI 2: all six TN sub-criteria not null + total_budget + capex_opex.
  - DoI 3: `len(project.phases) >= 1` (A4 will rename `phases` → `milestones`; service code reads whichever attribute exists) + `start_month`.
  - DoI 4: at least one baseline row (heuristic for "named resource assignments").
  - DoI 5: `end_month` not null (heuristic for "termination date set or explicit").
- **Status → stage seed mapping** — the table below is the working assumption used by `seed.sql`. KB can refine; the model holds whatever the seed says.
  | v4 status | pipeline_stage | doi | frozen_doi | ai_council_approved | ai_council_doc_url | within_cutoff |
  |---|---|---|---|---|---|---|
  | active | Active | 3 | NULL | true | https://onedrive/active-default | true |
  | pending_approval | Under Evaluation | 2 | NULL | true | https://onedrive/eval-default | NULL |
  | pending_cc_confirmation | Under Evaluation | 2 | NULL | true | https://onedrive/eval-default | NULL |
  | changes_requested | Proposed | 1 | NULL | false | NULL | NULL |
  | draft | Proposed | 0 | NULL | false | NULL | NULL |
  | planned | Approved | 3 | NULL | true | https://onedrive/planned-default | true |
  | completed | Operate | 5 | NULL | true | https://onedrive/legacy-doc | NULL |
  | rejected | Cancelled | NULL | 2 | false | NULL | NULL |
- **Backwards DoI move** — the gate is enforced only on forward moves (`target_doi > current_doi`). Backwards moves per `[A-PS-11]` need only structural transition validity; this matches the spec's framing of gates as forward maturity bars.

### Verification
- `python -m pytest backend/tests/ -v` → 376 passed (320 baseline + 56 new).
- Standalone executable test of `seed.sql` against a fresh schema: all 32 project rows insert cleanly with the new columns populated; status/stage mapping matches the table above.
- Live `python main.py` smoke test against the dev server (with the existing `backend/creta_demo.db` deleted to force re-seed) confirmed the GET endpoint returns expected JSON.

### Refactoring opportunities (noted, not acted on)
- `Project.status` is now redundant for v5-aware code paths but still drives the v4 intake / CR flow. Removal lands in A5 (intake workflow rewrite).
- Frontend hardcodes 19+ `status` string comparisons across modules — cleanup belongs to A8 (frontend pipeline UI), not here.
- `seed/generate_seed/s04_programs_projects.py` does not yet emit the v5 pipeline columns (matches A1's pattern — seed.sql is the source of truth for new columns until the next generator regen). When the generator is updated, also fold in A1's `tech_navigator` columns.

### Out-of-scope notes
- `[A-DA-03]` new project fields (`requesting_business_unit`, `demand_type`, `value_stream`, `wave_id`) deferred to a follow-up session — the schema additions cross-cut intake forms and warrant their own session.
- `[A-DA-02]` structured description sections — schema unchanged; current `description` text column is treated as the proxy.
- `[A-PS-07]`/`[A-PS-08]` auto-activation logic deferred to A3.
- `within_cutoff` recomputation deferred to A3 (replaces the manual PUT).

### Notes for follow-on sessions
- **A3 ranking engine** consumes `pipeline_stage` (filter `BACKLOG_STAGES`), `doi` (tie-breaker per `[A-BK-06]`), and writes `within_cutoff` per `[A-PS-06]`. The manual setter endpoint stays in place for now; A3 keeps the column writable from the engine and from controller override.
- **A4 milestones (parallel)** will rename `phases` → `milestones`. Pipeline service's DoI 3 gate reads `getattr(project, "milestones", None) or getattr(project, "phases", [])` so the rename is mechanical.
- **A5 intake workflow** retires the v4 `status` enum and the existing intake queue endpoints. Pipeline state replaces them; the controller actions Approve / Send Back / Reject map to `pipeline_stage` transitions Approved / Proposed (with `submission_feedback`) / Cancelled.
- **A7 frontend** wires the four endpoints into the project Master Data tab and the new Pipeline section of the Backlog detail view.

### Ready to PR
A2 + A4 merged into branch `v5/cluster-a/pipeline-and-milestones-backend`. After combined verification: 406 tests pass (320 baseline + 56 A2 + 30 A4).

---

## v5 Session A4: Project Milestones Backend (2026-04-27)

### Feature Overview
- Renames `ProjectPhase` model + `project_phases` table → `ProjectMilestone` / `project_milestones`. Renames `phase_number` column → `sequence_number` per `[A-MS-01]`.
- Adds `MilestoneType` global catalogue (10 default types) per `[A-BK-34]`. Read-only via `GET /api/admin/milestone-types`.
- Adds optional `milestone_type_id` FK and `baseline_locked_at` timestamp on `ProjectMilestone`. Per-milestone `color` is now nullable; resolved server-side as own override else `MilestoneType.default_color`.
- Per-project milestone CRUD endpoints (list / create / update / delete).
- Baseline-date edits enforce `[A-MS-03]`: controller-only AND require `override_reason` (else 403). Override path emits one `audit_log` entry per changed field with the reason embedded in `new_value`. PL is restricted to forecast-only edits.
- Frontend rename only (terminology, no behaviour change): `TimelinePhase` → `TimelineMilestone`, `PhaseStrip` → `MilestoneStrip`, `phase_number` → `sequence_number`, `data.phases` → `data.milestones`.

### Spec references implemented
`[A-MS-01]` — `[A-MS-04]`, `[A-BK-31]`, `[A-BK-34]` — `[A-BK-36]`, `[E-01]`. The forecast-vs-baseline-end slip computation already exists in the timeline endpoint (`_month_diff`); it is reused for the new list endpoint.

### Technical Details
- **Models:** `backend/models/projects.py`
  - `ProjectPhase` renamed to `ProjectMilestone`. New columns: `sequence_number`, `milestone_type_id` (FK to `milestone_types`, nullable), `baseline_locked_at` (DateTime, nullable). `color` column is now nullable.
  - New `MilestoneType` class: `id`, `name`, `default_color`, `suggested_ordering`, `is_active`, `created_at`. Pattern mirrors `RoleType` and `ExternalCostType`.
- **Schemas:** new `backend/schemas/milestones.py` with `MilestoneTypeResponse`, `MilestoneTypeListResponse`, `MilestoneResponse`, `MilestoneListResponse`, `MilestoneCreate`, `MilestoneUpdate`. Update body carries optional `override_reason` per `[A-MS-03]`.
- **Router:** new `backend/routers/milestones.py` with two router prefixes: `project_router` at `/api/projects` and `admin_router` at `/api/admin`. Both mounted in `main.py`. Mirrors the Tech Navigator authorization gate (`_can_edit_milestones`).
- **Workbench wiring:** `routers/workbench.py` timeline endpoint switched from `ProjectPhase` to `ProjectMilestone`. Response key `phases` renamed to `milestones`; row field `phase_number` renamed to `sequence_number`. Resolved colour computed server-side.
- **Seed:**
  - New `s08b_milestone_types.py` generates the 10 default rows (Planning, Requirements & Analysis, Development, Testing/QA, UAT, Pilot, Rollout, Data Migration, Training/Change Management, Hyper-maintenance).
  - `s09_phases.py` renamed to `s09_milestones.py`. INSERT targets `project_milestones` with the new column list. Legacy phase names mapped to default types via case-insensitive substring match.
  - `config.PROJECT_PHASES` renamed to `PROJECT_MILESTONES`. `validate.check_phase_data` renamed to `check_milestone_data`.
  - `runner.py` wires `s08b` before `s09`.
- **Frontend:** `TimelinePhase` → `TimelineMilestone`, `phase_number` → `sequence_number` (in `frontend/src/types/api.ts`). `PhaseStrip.tsx` renamed to `MilestoneStrip.tsx` with internal renames. `ProjectTimelineChart.tsx` updated import + JSX usage. No styling or behaviour change.
- **Tests:** new `backend/tests/test_router_milestones.py` with 30 tests across 5 classes (List, Create, Update, Delete, ListMilestoneTypes). Standalone A4 suite: 350 passed (320 baseline + 30 new). After merging with A2: 406 passed.

### API Endpoints Added
| Method | Path | Purpose |
|--------|------|---------|
| GET    | `/api/projects/{id}/milestones`              | List milestones (any authenticated). Empty list valid `[A-MS-04]`. |
| POST   | `/api/projects/{id}/milestones`              | Create milestone (controller, or PL on own project). |
| PUT    | `/api/projects/{pid}/milestones/{mid}`       | Partial update. Baseline edits gated per `[A-MS-03]`. |
| DELETE | `/api/projects/{pid}/milestones/{mid}`       | Delete (controller, or PL on own project). |
| GET    | `/api/admin/milestone-types`                 | Read-only catalogue per `[A-BK-34]`. |

### Data Model Changes
- Renames table `project_phases` → `project_milestones`.
- Adds new table `milestone_types` with 10 seeded rows.
- New column `project_milestones.milestone_type_id` (FK, nullable).
- New column `project_milestones.baseline_locked_at` (DateTime, nullable).
- Renamed column `phase_number` → `sequence_number`.
- `color` column on `project_milestones` is now nullable.

**No migration tooling exists in this project (no Alembic).** Existing `creta_demo.db` files will fail at startup against the new schema. **Resolution:** delete `backend/creta_demo.db` and restart the server; the seed loader recreates schema + data automatically.

### Working assumptions
- Column name `phase_number` → `sequence_number` (spec is silent; chosen as the cleaner name under the new `ProjectMilestone` entity).
- A4 ships only the **read-only** Type Library API (`GET /api/admin/milestone-types`). Admin CRUD UI for milestone types is deferred to D1/D3 frontend sessions.
- `DELETE` is allowed regardless of `baseline_locked_at` for now. The lock guards baseline-date *edits* via `[A-MS-03]`, not row removal. Will be revisited when the milestones admin UI ships.
- Override-reason audit format: `f"{new_value} (override: {override_reason})"` written to `new_value`. Avoids any `AuditLog` schema change.

### Refactoring opportunities (noted, not acted on)
- **Pre-existing bug surfaced during pre-merge visual verification:** the milestone strip applies `phase.color` directly via inline `style={{ backgroundColor }}`. The seed uses Tailwind palette names ("amber", "emerald") for several phases, but those are not valid CSS color keywords, so the browser renders those bands transparent. Bug exists identically on `main` (seed values are unchanged by A4 — verified via `git show main:backend/seed/seed.sql`). Fix path: either (a) translate Tailwind names to hex/rgb in the seed/migration, (b) add a frontend lookup that maps Tailwind names → CSS values, or (c) tighten the API to return only valid CSS colors. Not in A4 scope; flag for a follow-up cleanup or fold into the new `MilestoneType` catalogue alongside D1/D3.

### Notes for follow-on sessions
- A7 frontend can wire CRUD UI for milestones using the new `/api/admin/milestone-types` catalogue for the picker dropdown.
- The override-reason audit format is intentionally simple. If KB requests a structured representation later, AuditLog will need a new column (or an ancillary `audit_log_meta` table).

---

## v5 Session A1: Tech Navigator Backend (2026-04-27)

### Feature Overview
- Per-project Tech Navigator profile: 8 sub-criteria (3 Complexity + 3 Value Creation + 2 reserved data-only slots), Transformation level (T0/T1/T2), Project Type (1/2/3), and computed scores (complexity, value creation, composite ranking) plus t-shirt size derived from `total_budget`.
- Single GET + single PUT endpoints. PUT accepts a partial body and recomputes all derived fields in one transaction; each changed field emits an `audit_log` entry.
- Authorization: GET open to all roles; PUT for controllers (any project) or PLs on their own projects only.
- Admin-configurable global weights and t-shirt thresholds stored as 12 `PlanningParameter` rows under `param_group='tech_navigator'`. Editing any `tn_*` key via `PUT /api/admin/parameters` automatically triggers a portfolio-wide recompute. Dedicated `POST /api/admin/recompute-scores` for explicit invocation.

### Spec references implemented
`[A-TN-01]` — `[A-TN-09]`, `[A-PRI-01]` — `[A-PRI-04]`. Default weights from `[A-OQ-06]` (70/30 Value/Complexity); t-shirt thresholds from `[A-OQ-09]` (XS ≤100k, S ≤250k, M ≤500k, L ≤1M, XL >1M). Both remain working assumptions pending KB confirmation.

### Technical Details
- **Model:** 14 new nullable columns on `Project` in `backend/models/projects.py` (8 sub-criteria as `Integer`, 2 categorical, 3 computed `Numeric(4,2)`, 1 derived `String(2)`).
- **Service:** `backend/services/tech_navigator.py` with `WeightsSnapshot` dataclass + 7 pure helpers + `recompute_all_scores`. Spec defaults baked in so a fresh DB behaves correctly even before seeding.
- **Schemas:** `backend/schemas/tech_navigator.py` — partial update body with `Field(ge=1, le=5)` sub-criteria and `Literal` enums for `project_type`/`transformation_level`.
- **Router:** new `backend/routers/tech_navigator.py` mounted at `/api/projects` prefix.
- **Admin wiring:** `update_parameters` and `reset_parameters` invoke `recompute_all_scores` when any `tn_*` key changes; new `POST /api/admin/recompute-scores` endpoint.
- **Seed:** 12 rows added to `backend/seed/seed.sql` section 12 in `param_group='tech_navigator'`.
- **Tests:** 60 new tests across `test_tech_navigator_service.py` (31) and `test_router_tech_navigator.py` (29). Full suite: 320 passed.

### API Endpoints Added
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/projects/{id}/tech-navigator` | Read full profile + computed scores + active weights snapshot |
| PUT | `/api/projects/{id}/tech-navigator` | Partial update; recomputes complexity / value / composite / tshirt |
| POST | `/api/admin/recompute-scores` | Recompute Tech Navigator scores across the entire portfolio |

### Data Model Changes
14 new nullable columns on `projects` table. **No migration tooling exists in this project (no Alembic).** The next time the dev server starts against the existing `backend/creta_demo.db`, queries on `projects` will fail with `no such column: projects.project_type`. **Resolution:** delete `backend/creta_demo.db` (or move it aside) before running `python main.py`; the startup hook will re-create the schema and re-run `seed.sql` automatically.

### Verification
- `python -m pytest backend/tests/ -v` → 320 passed (60 new + 260 existing).
- Live curl smoke test against the dev server was deferred because `creta_demo.db` is locked in the working tree (schema-incompatible without a manual delete). The integration tests cover the same router → service → DB → audit chain end-to-end.

### Ambiguities (working assumptions in place)
- `[A-OQ-06]` default ranking weights (70/30) — seeded as defaults; KB to confirm.
- `[A-OQ-09]` t-shirt thresholds — seeded as defaults; KB to confirm.
- Spec restriction "controller should not free-edit other people's TN scores; use Send Back instead" is **not** enforced in the API (controller writes are permitted everywhere with audit log). Will be enforced at UI level in A7 and via Send Back workflow in A5.

### Refactoring opportunities (noted, not acted on)
None identified during this session.

### Notes for follow-on sessions
- A3 ranking engine will `ORDER BY composite_score DESC` and consume `services.tech_navigator.load_weights()`.
- A7 frontend will call the GET/PUT pair; the response embeds the active `WeightsSnapshot` so the scoring UI does not need a second admin call.
- D3 admin UI will render the 12 `tech_navigator`-group `PlanningParameter` rows with no extra backend work.
- S1 (seed data) needs to populate realistic Tech Navigator scores for all demo projects so the ranking engine produces a meaningful ordered list.

---

## Bug Fix: Project & CR Visibility (2026-04-02)

### Bug 1: Newly Created Projects Invisible After Approval
**Root cause:** Project Lead's workbench and launchpad filtered by `DemoPersona.owned_project_ids_json` — a static seed-time list never updated when new projects are created. The creation endpoint correctly sets `Project.pl_person_id`, but no query used that field.

**Fix:** Added `pl_project_filter(user)` helper in `dependencies.py` that matches by `pl_person_id == user.person_id` OR `id IN user.project_ids`. Applied across 7 locations in 5 files:
- `backend/dependencies.py` — new helper
- `backend/routers/workbench.py` — project list filter
- `backend/routers/global_launchpad.py` — 5 locations (subtitle, forecast due/overdue, changes requested, CC pending, intake queue)
- `backend/services/report_service.py` — report project scoping
- `backend/services/ai_report_service.py` — AI report scoping (added `db` param for dynamic query)

### Bug 2: Change Requests Not Visible in CC Owner's Capacity Module
**Root cause:** Notification deep-linked to `/capacity/requests?cr={id}`, but: (1) `RequestManagement` ignored the `?cr=` param, (2) `ProjectConfirmationBanner` only queried `Project.status == "pending_cc_confirmation"` — never the `ChangeRequest` table, (3) `GET /project-assignment/{id}` didn't support CR-scoped resource request filtering.

**Fix:** Extended capacity module end-to-end:
- `backend/routers/capacity.py` — `GET /project-confirmation/pending` now returns both projects and CRs with `type` field; `GET /project-assignment/{id}` accepts `?cr=` param to filter resource requests by CR and returns CR metadata
- `frontend/src/api/endpoints.ts` — updated types and API calls
- `frontend/src/types/api.ts` — added `change_request` field to `ProjectAssignmentDetail`
- `frontend/src/modules/capacity/requests/ProjectConfirmationBanner.tsx` — handles project + CR items, shows CR badge/summary, navigates with CR context
- `frontend/src/modules/capacity/requests/RequestManagement.tsx` — reads `?cr=` param, passes to banner
- `frontend/src/modules/capacity/requests/ProjectAssignmentPage.tsx` — reads `?cr=` param, passes to API, shows CR context banner

### API Changes
| Method | Path | Change |
|--------|------|--------|
| GET | `/api/capacity/project-confirmation/pending` | Now returns CRs alongside projects; added `type`, `cr_id`, `cr_summary` fields |
| GET | `/api/capacity/project-assignment/{id}` | Added optional `?cr=` query param; added `change_request` in response |

---

## Report Builder Session 4: Save, Share, Export & Polish (2026-03-30)

### Feature Overview
- **Save/Load reports:** Save report compositions with name and description, silent overwrite on subsequent saves, "Save As" for copies
- **Load dropdown:** Toolbar button lists saved reports with modified dates, delete option with confirmation
- **URL-based loading:** `?reportId=` parameter loads and auto-runs a saved report
- **Share & publish:** Share dialog with user selection, permission levels (View only / Can edit), "Publish to Report Library" toggle
- **Report Library integration:** Custom reports show in "My Saved Views" with "Custom" badge, shared/published reports in "Shared Reports" section
- **CSV export:** Server-side CSV generation with metadata preamble, subtotals, grand totals, cross-tab flattening
- **Export metadata:** Comment rows with report name, date, user, and active filters
- **Guide panel content:** 3 new manual sections (Saving, Sharing, Export) + 5 new FAQ entries

### Technical Details
- **New models:** `SavedReport` (with `is_active` soft delete, `is_published` flag, JSON `definition` blob), `SavedReportShare` (report_id, shared_with, permission)
- **New backend services:** `report_builder_saved.py` (CRUD + share), `report_builder_export.py` (CSV generation with cross-tab flattening)
- **8 new API endpoints:** CRUD for saved reports, share, list shared, export (saved + unsaved)
- **New frontend components:** `SaveReportDialog`, `LoadReportDropdown`, `ShareReportDialog`
- **Modified frontend:** `useReportBuilder.ts` (save/load/export state), `ReportBuilder.tsx` (toolbar buttons, URL params), `ReportLibrary.tsx` (custom + shared sections)
- **18 unit tests** for saved reports CRUD and sharing service
- **Guide updates:** 3 manual sections, 5 FAQ entries

### API Endpoints Added
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/report-builder/saved` | List user's saved reports |
| POST | `/api/report-builder/saved` | Create new saved report |
| GET | `/api/report-builder/saved/{id}` | Get saved report with definition |
| PUT | `/api/report-builder/saved/{id}` | Update saved report |
| DELETE | `/api/report-builder/saved/{id}` | Soft-delete saved report |
| POST | `/api/report-builder/saved/{id}/share` | Share/publish report |
| GET | `/api/report-builder/shared` | List shared/published reports |
| POST | `/api/report-builder/export` | Export unsaved report to CSV |
| GET | `/api/report-builder/export/{id}` | Export saved report to CSV |

---

## Report Builder Session 3: Calculated Measures & Chart Views (2026-03-30)

### Feature Overview
- **Calculated measures:** User-defined two-operand formulas (A op B with +, −, ×, ÷), computed client-side on fetched result rows
- **Formula dialog:** Name field, measure A/B dropdowns, operator selector, format picker (€/%/#/h), live preview from first data row
- **Circular reference protection:** Validates against self-reference and >1 nesting depth
- **fx badge:** Calculated measures show "fx" badge in Values zone chips with edit/delete dropdown
- **Catalog integration:** Calculated measures appear under dynamic "Calculated" category in the data catalog
- **View toggle:** Table | Bar | Line | Pie buttons in toolbar with enable/disable logic
- **Bar chart:** Grouped bars per first row dimension, series by column dim values or multiple measures (Recharts)
- **Line chart:** Time-series lines, enabled only when column dimension is a time dim (D16/D17/D18)
- **Pie chart:** Donut with segment labels + percentages, center total, note for multi-dim/measure
- **Chart behaviour:** Respect filters, stale-data opacity, auto-fallback when view becomes unavailable

### Technical Details
- **7 new files:** `calculatedMeasures.ts`, `chartTransform.ts`, `CalculatedMeasureDialog.tsx`, `ReportBarChart.tsx`, `ReportLineChart.tsx`, `ReportPieChart.tsx`, plus type extensions
- **4 modified files:** `useReportBuilder.ts` (calc state + computation), `DropZones.tsx` (fx badge), `CatalogPanel.tsx` (Calculated category), `ReportBuilder.tsx` (view toggle + dialog wiring)
- **No backend changes** — calculated measures are client-side only, charts reuse existing query results
- **Operand data fetching:** Hook transparently includes operand measure IDs in API request even if not in Values zone
- **Chart color palette:** Reuses CSS custom properties `--chart-1` through `--chart-5` for dark/light mode compatibility

---

## Report Builder Session 2: Cross-Tabulation & Conditional Formatting (2026-03-30)

### Feature Overview
- **OLAP-style cross-tabulation:** Flat API rows pivoted into nested row/column headers with subtotals and grand totals
- **Nested column headers:** Multi-level `<thead>` rows with `colSpan` — column dims (e.g., Fiscal Year) as outer headers, measure names as inner headers
- **Row grouping:** Outermost row dim creates collapsible groups with ▼/▶ toggle (ChevronDown/ChevronRight)
- **Subtotals & grand totals:** Per-group subtotals computed by summing cells; grand total row at bottom
- **Sticky positioning:** Row dim columns sticky-left, all header rows sticky-top, with z-index layering
- **Column sorting:** Click column headers to sort within groups (asc → desc → none cycle)
- **Conditional formatting:** Rule-based cell coloring with last-match-wins evaluation
- **3 RAG presets:** Budget Variance (green/amber/red on M05), Utilisation (red/amber/green on M14), Spend Threshold (green/red on M03)
- **Formatting drawer:** Right-side Sheet with preset buttons, per-measure rule sections, inline rule editors (operator, value, color swatches)
- **Format legend:** Horizontal bar below table showing active rules as colored chips

### Files Created
- `frontend/src/modules/reporting/builder/crossTabTransform.ts` — pivot algorithm (flat rows → CrossTabData)
- `frontend/src/modules/reporting/builder/CrossTabTable.tsx` — cross-tab renderer with collapse/expand, sorting, sticky headers
- `frontend/src/modules/reporting/builder/conditionalFormat.ts` — color palette, operator options, 3 preset definitions
- `frontend/src/modules/reporting/builder/ConditionalFormatSheet.tsx` — formatting drawer UI (Sheet)
- `frontend/src/modules/reporting/builder/FormatLegend.tsx` — active rules legend bar

### Files Modified
- `frontend/src/types/reportBuilder.ts` — added CrossTabData, ColHeaderNode, ColLeaf, RowEntry, RowGroup, ConditionalFormatRule, FormatOperator, FormatPresetId types
- `frontend/src/modules/reporting/builder/useReportBuilder.ts` — added formatRules state and handlers (add/remove/update/applyPreset/clearAll)
- `frontend/src/modules/reporting/builder/ReportBuilder.tsx` — activated Formatting button, conditional CrossTabTable/ResultsTable rendering, FormatLegend
- `frontend/src/modules/reporting/builder/ResultsTable.tsx` — added subtotals per group, grand total row, conditional format cell coloring

### Verification
- [x] Cross-tab renders with nested column headers (Fiscal Year → measure names)
- [x] Row groups collapse/expand with chevron toggles
- [x] Subtotals per group, grand total at bottom
- [x] Sticky headers (top and left) during scroll
- [x] Column sorting within groups
- [x] Conditional formatting drawer opens with presets and rule editors
- [x] Presets disabled when required measure not in Values zone
- [x] Cell background colors applied correctly (126 cells colored in test)
- [x] Format legend renders active rules
- [x] European number formatting throughout
- [x] Dark mode renders correctly
- [x] Flat table mode (no column dims) still works with subtotals

## Report Builder Session 1: Data Catalog, Query Engine & UI Scaffold (2026-03-28)

### Feature Overview
- **Data catalog:** 18 dimensions across 5 categories + 16 measures across 4 categories, served from backend
- **Query engine:** Backend builds dynamic SQL from dimension/measure/filter selections, returns flat rows with column metadata
- **Click-to-add UX:** Click dimensions/measures in catalog to add to zones (Rows, Columns, Filters, Values)
- **Drop zones:** 4 zones with pills showing placement, reorder arrows, move-to-zone buttons, and remove
- **Filter zone:** Multi-select dropdowns with dynamic option loading per filter dimension
- **Flat results table:** Sortable columns, row count, stale indicator, empty states

### Backend
- **New router:** `routers/report_builder.py` — 3 endpoints (catalog, filter options, execute query)
- **New service:** `services/report_builder_service.py` — catalog builder, dynamic SQL query engine
- **New schemas:** `schemas/report_builder.py` — CatalogResponse, QueryRequest, ReportExecuteResponse

### Frontend
- **New components:** `ReportBuilder.tsx`, `CatalogPanel.tsx`, `DropZones.tsx`, `ResultsTable.tsx`, `useReportBuilder.ts`
- **New types:** `frontend/src/types/reportBuilder.ts`
- **Route integration:** 7th tile "Report Builder" in Report Library

## Dark Mode (2026-03-27)

### Feature Overview
- **Theme toggle:** Sun/Moon button in TopBar cycles between light and dark mode
- **ThemeContext:** React context with `light`/`dark`/`system` support, localStorage persistence (`creta-theme` key)
- **Flash prevention:** Inline script in `index.html` applies `.dark` class before React renders
- **141 files converted:** All hardcoded Tailwind colors (`bg-white`, `text-slate-*`, `border-slate-*`) replaced with semantic CSS variable classes (`bg-card`, `text-foreground`, `border-border`, etc.)
- **Status colors preserved:** Amber/green/red status badges keep light variants with `dark:` variants added
- **Chart dark mode:** New `--chart-grid` and `--chart-axis` CSS variables, Recharts tooltips use `var()` for dark-aware backgrounds

### Files Changed
- **New:** `frontend/src/contexts/ThemeContext.tsx`
- **Modified:** `frontend/index.html`, `frontend/src/App.tsx`, `frontend/src/index.css`
- **Layout:** 7 files (AppLayout, TopBar, SidePanel, BottomDrawer, Breadcrumb, RoleSwitcher, HelpButton)
- **Shared:** 9 files (ExpandableTreeTable, StatusBadge, DetailViewGrid, DetailViewKPIStrip, FilterBar, Skeleton, ModuleGuideButton, SortableHeader, SubmitProjectDialog)
- **Charts:** 4 files (BudgetByLobChart, ProjectTrajectoryChart, ForecastTrajectoryChart, RAGDonutChart)
- **Domain modules:** ~120 files across Launchpad, Portfolio, Workbench, Capacity, Simulator, Reporting, Admin, Docs

### CLAUDE.md Updated
- Dark Mode added as non-negotiable architectural rule
- ThemeContext added to established components list

## AI Report Builder (2026-03-27)

### Feature Overview
- **6th tile in Report Library:** "AI Report Builder" with indigo AI accent styling and badge
- **Guided chat interface:** Two-panel layout — chat on left, generated report preview on right
- **Natural language report generation:** Describe any report in plain English, Claude queries the DB and generates tables, charts, and KPIs
- **Iterative refinement:** Follow-up messages update the report
- **Role-scoped data access:** AI respects the same role-based data scoping as standard reports

### Backend
- **New service:** `services/ai_report_service.py` — Anthropic SDK integration, conversation state management, SQL tool use with safety guardrails (read-only connection, DDL blocking, row limits)
- **New router:** `routers/ai_reports.py` — 4 endpoints (status, start conversation, send message, delete conversation)
- **New schemas:** `schemas/ai_reports.py` — ReportSpec, KPIItem, TableSpec, ChartSpec, ConversationReply
- **API key management:** Stored as a planning parameter (`secret` type) in the admin panel, with env var fallback

### Frontend
- **New components:** `AIReportBuilder.tsx`, `ChatPanel.tsx`, `ReportPreview.tsx`, `useAIReportChat.ts`
- **ReportLibrary updated:** 6th tile with Sparkles icon and indigo accent
- **ReportCard enhanced:** Supports `accent` prop for AI-styled cards
- **Admin panel updated:** New "Integrations" group with secret/password input for API key (show/hide toggle)

### Documentation
- **New module manual:** `ai_report_builder.json` — 6 sections covering overview, setup, usage, refinement, visualizations, tips
- **Reporting manual updated:** Added AI Report Builder section
- **FAQ updated:** New entry for AI Report Builder usage
- **README.md updated:** Feature description and API endpoint table

### Testing
- **38 unit tests** in `tests/test_ai_report_service.py` — SQL safety, role scoping, ReportSpec validation, conversation management, API key resolution (all passing)
- **Smoke test prompts** in `qa/ai-report-builder-prompts.md` — 8 manual test prompts with expected behavior, role-scoped tests, error scenarios

### Verification
- [x] TypeScript compiles clean (npx tsc --noEmit)
- [x] All 38 unit tests pass
- [ ] Manual testing pending (requires API key)

## Workbench Enhancements (2026-03-27)

### Cost Classification % Split
- **All project types now show percentage:** Pure CapEx/OpEx projects display "CapEx 100%" or "OpEx 100%" with the total amount, matching the mixed-type display style

### Dynamic Resource Plan Title
- **Title adapts to project lifecycle:** Active projects show "Resource Plan {current year}" with hours filtered to current year only; planned projects show "Resource Plan {start year}" with lifetime hours; completed projects show "Resources Consumed" with lifetime totals
- **Backend filtering:** Resource plan summary query filters by demo year for active projects

### Expandable Employee Assignments in Forecast Grid
- **Clickable role names:** Internal resource roles with employee allocations show an expand/collapse chevron. Clicking reveals sub-rows with assigned employee names and per-month hours
- **Expand/Collapse All button:** "Expand All Resources" / "Collapse All Resources" toggle above the grid
- **Backend enhancement:** Forecast endpoint now returns `assignments` array per internal row, grouping allocations by person's role type with monthly hours breakdown

### Documentation Updates
- **Module manual updated:** project_workbench.json — Overview Tab and Forecast & Planning Tab sections updated with new features
- **PROGRESS.md updated:** This section

### Verification
- [x] Cost Classification shows percentage for pure CapEx and OpEx projects
- [x] Resource Plan title shows "Resource Plan 2026" for active projects
- [x] Forecast grid: role names are clickable with expand chevrons
- [x] Expanding a role shows employee names with per-month hours
- [x] Expand All / Collapse All button works correctly
- [x] TypeScript: no compilation errors

## Forecast/Allocation Data Integrity Fix (2026-03-27)

### Backend Forecast Aggregation Fix (`backend/routers/workbench.py`)
- **Bug fixed:** Multi-location roles (e.g., cloud@MUC 60h + cloud@PUN 40h) were creating duplicate month cells. Frontend `findCell()` only returned the first, silently dropping the second location's data
- **Baseline/actuals maps fixed:** `bl_map`/`ac_map` now accumulate instead of overwriting when multiple rows exist per (sub_category, month)
- **Forecast cells merged:** When building rows_map, duplicate (role, month) cells are summed into a single cell

### Seed Data Rebuild (`backend/seed/generate_seed/s06_allocations.py`)
- **ASSIGNMENTS removed:** Deleted the independently-maintained 210-line ASSIGNMENTS config that diverged from PROJECT_STAFFING
- **Single-source generation:** All allocations now derived directly from PROJECT_STAFFING + FORECAST_ADJUSTMENTS, ensuring hours always match forecast
- **ASSIGNMENT_OVERRIDES:** Small config (~15 lines) preserves narrative exceptions: p-fischer over-allocation on proj-erp2 (110h in Mar-May 2026), p-szabo over-allocation on proj-fleet
- **Result:** 3,492 allocation rows, all matching forecast totals

### Runtime Auto-Allocation Service (`backend/services/allocation_service.py`)
- **Unchanged:** Runtime service correctly reads from forecast table and fills gaps for dynamically approved projects
- **Integration points:** approve_project(), CR approval, and PL accept-changes all call ensure_project_allocations()

### Verification
- [x] proj-cloud3: Cloud/Platform Engineer shows 100h/month (was incorrectly showing 60h)
- [x] proj-cloud3: Michael Wagner 100h matches forecast, Lakshmi Menon 30h matches sysadmin forecast
- [x] proj-erp2: Sr Developer shows 140h forecast (100 MUC adjusted + 40 PUN), BL: 120h (80+40 base)
- [x] proj-erp2: Lena Fischer shows 110h in March 2026 (over-allocation narrative preserved)
- [x] proj-autobrake: No allocations (pending_approval) — will be created at runtime approval
- [x] Baselines and actuals properly aggregated across locations
- [x] Seed data regenerated: 19,890 lines in seed.sql

## Sidebar Status Badges (2026-03-27)

### Project List Panel (`frontend/src/modules/workbench/ProjectListPanel.tsx`)
- **Status badges for all statuses:** Active, Completed, Planned, Draft, Pending, CC Review, Changes Req., Rejected
- **Color-coded:** Amber for workflow statuses (Draft, Pending, CC Review, Changes Req.), neutral slate for lifecycle statuses (Active, Completed, Planned, Rejected)
- **Documentation updated:** README.md, project_workbench.json manual, PROGRESS.md

## Hierarchy Migration (2026-03-27)

### Schema Migration
- **Removed `LineOfBusiness` and `Program` models:** Replaced with `GroupingEntity`, `GroupingEntityType`, `GroupingHierarchy`, and `ProjectGroupingAssignment` models
- **Seed data updated:** LoB/Program inserts replaced with entity type, hierarchy, entity, and assignment inserts. Seed generator updated to match.
- **All backend routers migrated:** Portfolio, workbench, capacity, reports, admin, reference, scenarios, and launchpad routers updated to use GroupingEntity lookups instead of LoB/Program joins
- **Portfolio service rewritten:** `_get_project_lob_name()`, `_get_scoped_project_ids()`, tree building, and all entity resolution functions now use GroupingEntity hierarchy

### Multi-Level Report Filters
- **`useActiveHierarchy` hook enhanced:** Returns `levels` (all hierarchy levels) and `entityTree` (full nested entity tree) in addition to existing `topLevelLabel` and `entityOptions`
- **Helper functions added:** `buildHierarchyFilterConfigs()` generates cascading FilterConfig[] for all hierarchy levels; `getMostSpecificEntityFilter()` finds the lowest-level selected entity; `clearLowerHierarchyFilters()` clears child filters when a parent changes
- **All 4 report components updated:** Programme Rollup, Forecast Accuracy, Vendor Spend, YoY — all show cascading multi-level filters (e.g., "Line of Business" + "Program") with child options scoped to selected parent

### Dynamic Labels & Hierarchy Path
- **Workbench MetadataBar:** Shows full hierarchy breadcrumb path (e.g., "Truck & Bus Systems (TBS) > Digital Braking Platform") instead of hardcoded "LoB:" prefix
- **Backend `get_project_hierarchy_path()`:** Walks up entity ancestry to build root-to-leaf path, added to workbench overview metadata
- **PortfolioTree:** Dynamic type badges via `getTypeLabel()` converting entity type IDs to display names
- **IntakeTable:** Dynamic column header from `useActiveHierarchy().topLevelLabel`
- **IntakeDetailWorkspace:** Dynamic "Requesting {topLevelLabel}" label
- **Report columns:** ForecastAccuracy and YoY use dynamic column labels
- **Report export:** CSV headers dynamically use active hierarchy's top-level entity type name

### Documentation Updates
- **Module manuals updated:** portfolio_overview.json, capacity_management.json, project_workbench.json — replaced hardcoded "LoB" references with dynamic hierarchy terminology
- **README.md updated:** Feature descriptions, API table descriptions updated to reflect GroupingEntity system
- **PROGRESS.md updated:** This section

### Verification
- [x] Seed data validates, backend starts cleanly after reset
- [x] TypeScript: no compilation errors
- [x] Portfolio tree: dynamic type badges (Line Of Business, Program, Project, Service)
- [x] Reports: cascading multi-level filters with program-level scoping
- [x] Workbench: full hierarchy path with breadcrumb separator
- [x] Intake table: dynamic column header
- [x] Intake detail: dynamic "Requesting" label
- [x] Backend: program-level filtering returns correct project subset
- [x] Backend: export headers use dynamic entity type name

## Demo Polish — April 2026 (2026-03-26)

### Changes
- **Demo date shifted to April 2026:** Updated `backend/config.py`, all seed generators (config, s04, s05, s06, s08, s10, validate, runner), frontend constants (yearColumns, Phase3, RateTablePanel, AddActionForm), in-app docs, and CLAUDE.md. March is now a completed month with full actuals; April gets partial actuals. Seed data regenerated and validated (10/10 checks pass).
- **Phase 1 Retrospective dynamic month:** Backend returns `retro_month` in forecast cycle start response. Phase 1 title shows "Phase 1: Retrospective — March Actuals" and columns show "March Forecast" / "March Actual" dynamically based on DEMO_DATE.
- **Number formatting standardization:** Compact format updated to lowercase `k` with no space before EUR (e.g., `6,35k€`). Phase 4 Review grid month columns now display formatted "Apr 26" instead of raw "2026-04".
- **CC Financial Summary chart:** Replaced "Monthly Spend Trend" line chart with "Spend per Cost Type" horizontal bar chart showing Internal vs External cost breakdown (blue/amber).

### Verification
- [x] Seed data: 10/10 validation checks pass
- [x] TypeScript: no compilation errors
- [ ] Visual: Launchpad shows April 2026 context
- [ ] Visual: Phase 1 shows "March Actuals" with dynamic column headers
- [ ] Visual: Phase 4 shows formatted month headers and EUR values
- [ ] Visual: CC Financial Summary chart view shows bar chart

## CR Workflow Improvements (2026-03-26)

### Changes
- **Delta-based resource requests:** `ResourceRequest` model has `original_hours_per_month` (Numeric) and `change_direction` ("increase"/"decrease") columns. `_create_resource_requests_from_cr()` in `portfolio.py` computes delta from old/new values. Capacity API exposes `original_hours`, `change_direction`, `currently_allocated` fields. `RequestDetail.tsx` shows direction badge, delta hours, original, total, and currently allocated person.
- **Decrease handling:** `_create_allocations_from_assignments()` in `capacity.py` subtracts hours for decrease direction instead of adding.
- **Forecast locking:** `get_project_overview()` in `workbench.py` queries for pending CRs and returns `pending_cr` in metadata. `ForecastTab.tsx` disables "Rolling Forecast Review" button with CR status badge while a CR is pending.
- **Phase 3 "Keep as is":** `Phase3EditForecast.tsx` has an outline "Keep as is" button when no changes are made, allowing PLs to proceed through the wizard without modifications.
- **EUR formatting:** Phase 1 (`Phase1Retrospective.tsx`) and Phase 4 (`Phase4Review.tsx`) now use `formatCurrencyDetailed` for full EUR format (e.g. 2.720 €) instead of abbreviated format.
- **Seed data:** Updated 3 seed resource_requests with `original_hours_per_month` and `change_direction` columns.
- **In-app documentation:** Updated Project Workbench manual (forecast wizard, CR workflow sections), Capacity Management manual (response actions), and FAQ entries (faq-01, faq-02, faq-09 updated; faq-13 added for decrease requests).

### Verification
- [x] Delta display: CC Owner sees "+20h" with original 40h, total 60h, and currently allocated person
- [x] Direction badge: green "Increase" or red "Decrease" with arrow icons
- [x] Forecast locking: disabled button with "CR-X under review" badge when CR pending
- [x] Phase 1: EUR values in full format (2.720 €)
- [x] Keep as is: outline button appears when no changes, proceeds to Phase 4

## CC Owner Assignment Grid Redesign (2026-03-25)

### Problem
The previous card-per-request layout was visually inconsistent with the rest of the app (ResourcePlanPage, Forecast & Planning, DetailViewGrid). External cost requests were shown but CC Owner can't assign employees to them.

### Changes
- **`AssignmentGrid.tsx`** (NEW) — Unified tabular grid matching ResourcePlanPage pattern
  - Rows = resource request roles, columns = months with `useCollapsibleYears`
  - Click any cell to open a person dropdown (matching role + others, with utilization %)
  - "Assign All" column: one click assigns a person to every month for that role
  - Year summary column: shows person name (uniform), "Mixed" (varied), or "--" (empty)
  - Status badge per row (X/Y months assigned, green/amber)
  - Sticky left column with role name, hours, priority
- **`ProjectAssignmentPage.tsx`** — Major rewrite
  - Fetches monthly hours + assignments for ALL resource requests in parallel on load
  - Integrates AssignmentGrid instead of individual cards
  - External cost requests hidden entirely from CC Owner view
  - Kept: project header, Team Availability, Confirm/Decline actions
- **`MonthlyAssignmentGrid.tsx`** — No longer imported (kept in codebase)

### Verification
- [x] Tabular grid renders with roles as rows, months as columns (collapsible years)
- [x] No external cost requests visible
- [x] Click cell → dropdown opens with employee list, utilization % shown
- [x] Select employee → cell updates green, auto-saves, badge updates
- [x] "Assign All" column → one click fills all months for a role
- [x] Collapsed year → shows person name or "Mixed" in summary
- [x] Confirm button enabled when all roles fully assigned
- [x] No console or server errors

## Bug Fix: CC Owner Assignment After Resubmission (2026-03-25)

### Problem
After the controller sent a project back with change requests and the PL accepted changes, the CC Owner could not assign resources on the resubmitted project. Root causes:
1. `autoflush=False` in SQLAlchemy session meant new Forecast rows weren't visible to subsequent queries after `accept_changes` or `resubmit_project` rebuilt them
2. `_create_resource_requests_from_forecast` only deleted `status="pending"` requests, leaving stale `confirmed` requests from previous rounds
3. Bulk `.delete()` bypassed ORM cascade, orphaning `ResourceRequestAssignment` rows
4. Frontend `MonthlyAssignmentGrid` was guarded by `request.status === 'pending'`, hiding grids for non-pending requests
5. `all_resource_requests_assigned` check included stale confirmed requests

### Fixes Applied
- **`backend/routers/global_launchpad.py`**: New `_cleanup_previous_resource_data` helper — deletes ALL ResourceRequest objects via ORM (triggering cascade for assignments) and clears Allocation records. Added `db.flush()` after cleanup. Imported `Allocation` model.
- **`backend/routers/portfolio.py`**: Added `db.flush()` after forecast rebuilds in `accept_changes` and `resubmit_project` so new Forecast rows are visible to snapshot/request-creation queries
- **`backend/routers/capacity.py`**: Defensive status filter on `all_resource_requests_assigned` — only checks `status="pending"` resource requests
- **`frontend/src/modules/capacity/requests/ProjectAssignmentPage.tsx`**: Removed `request.status === 'pending'` guard so `MonthlyAssignmentGrid` always renders

### Verification
- [x] Round 1: Controller sends back → PL accepts → CC sees 5 fresh pending requests with assignment grids → assigns employees → confirms → 95 allocations created
- [x] Round 2: Controller sends back again → PL accepts → CC sees 5 fresh pending requests (0 stale), 0 orphaned assignments, 0 duplicate allocations
- [x] UI verified: ProjectAssignmentPage renders all resource request cards with dropdowns, team availability, confirm/decline buttons

## CC Owner Resource Assignment (2026-03-25)

### Data Model
- [x] `ResourceRequestAssignment` model — per-month person assignment for resource requests
  - Fields: `resource_request_id`, `month`, `person_id`, `hours`, `created_at`, `modified_at`
  - Unique constraint on `(resource_request_id, month)` — one person per month per request
  - Cascade delete via `ResourceRequest.assignments` relationship

### Backend API
- [x] `GET /api/capacity/requests/{cc_id}/{request_id}/monthly-hours` — aggregated per-month forecast hours
- [x] `GET /api/capacity/requests/{cc_id}/{request_id}/assignments` — current per-month assignments with person names
- [x] `PUT /api/capacity/requests/{cc_id}/{request_id}/assignments` — save per-month person assignments (validates months, people, creates assignments with forecast hours)
- [x] `GET /api/capacity/project-assignment/{project_id}` — project details with all resource requests and assignment status
- [x] Modified `confirm_project_resources` and `confirm_request` — now create `Allocation` records from `ResourceRequestAssignment` data
- [x] Enriched `get_intake_detail` — resource_plan includes per-role assignment data (person names, months, hours)
- [x] Fixed `_create_resource_requests_from_forecast` — changed CC ID from `cc-rail-systems` to `cc-muc-apd` (matching CC owner persona)

### Frontend
- [x] `MonthlyAssignmentGrid.tsx` — two modes: Unified (one person for all months) and Split (per-month dropdowns)
  - Person dropdown groups: "Matching Role" first, then "Other Roles" with role labels
  - Utilization hints per person per month from heatmap data
  - Auto-saves on change, shows "X/Y months assigned" badge
- [x] `ProjectAssignmentPage.tsx` — dedicated full-page view for CC Owner assignment
  - Project header, resource request cards with MonthlyAssignmentGrid each
  - Collapsible team availability reference panel
  - "Confirm All & Send to Controller" (enabled only when all assigned) and "Decline" buttons
- [x] `ProjectConfirmationBanner.tsx` — "Review & Assign Resources" navigates to assignment page
- [x] Route: `/capacity/project-assignment/:projectId` registered in CapacityManagement
- [x] `IntakeDetailWorkspace.tsx` — "Resource Assignments (CC Owner)" section shows assigned employees per role with month ranges
- [x] API client: `getRequestMonthlyHours`, `getRequestAssignments`, `saveRequestAssignments`, `getProjectAssignmentDetail`
- [x] Types: `MonthlyHoursItem`, `RequestAssignment`, `ProjectAssignmentRequestItem`, `ProjectAssignmentDetail`

### Verification
- [x] API E2E test: project creation → submission → split assignment (2 people) → confirmation → 10 Allocation records created
- [x] UI E2E test: CC Owner assigns Felix Keller (Sr. Dev, 6 months) + Jan Schmidt (Dev, 4 months) → confirms → Controller sees assignments in intake detail
- [x] Split mode: per-month dropdowns with utilization hints, matching role grouping
- [x] Unified mode: single dropdown assigns all months at once
- [x] Allocation records created with correct hours (120h/160h) and `is_confirmed=True`
- [x] TypeScript compilation passes with no errors

## Submission Workflow Implementation (2026-03-25)

### Sessions 1-3: Backend + Frontend Multi-Step Submission
- [x] `ProjectSubmissionSnapshot` model for storing original and controller-proposed forecast snapshots
- [x] `submission_feedback` field on Project model for controller feedback
- [x] `deep_link_tab` field on Notification model for tab-level deep linking
- [x] `POST /api/projects` — create draft project with optional resource plan and external costs
- [x] `PUT /api/projects/{id}/submit` — submit draft for CC confirmation
- [x] `GET /api/projects/{id}/resource-plan` — get forecast data for resource plan grid
- [x] `PUT /api/portfolio/intake/{id}/send-back` — controller requests changes with editable grid and feedback
- [x] `GET /api/portfolio/intake/{id}/diff` — original vs proposed comparison grid with delta coloring
- [x] `PUT /api/portfolio/intake/{id}/accept-changes` — PL accepts controller's proposed changes
- [x] `GET /api/portfolio/intake/{id}/editable-grid` — forecast in editable format for controller
- [x] `ResourcePlanPage.tsx` — full resource plan editor with add/remove roles, monthly hour inputs, EUR auto-calculation
- [x] `SubmissionDiffView.tsx` — PL diff view in Project Workbench with controller feedback and action buttons
- [x] `EditableIntakeGrid.tsx` — click-to-edit grid for controller's change request flow
- [x] `IntakeDiffSection.tsx` — reusable diff grid component for Portfolio Overview PL review
- [x] `SubmitProjectDialog` refactored to Step 1 only (metadata → navigate to resource plan)
- [x] Pending actions updated for all roles (PL, CC Owner, Controller) with deep-link support

### Session 4: PL Diff View and Deep-Linking
- [x] Project Workbench amber banner for `changes_requested` status with controller feedback
- [x] "Review Proposed Changes" button navigates to diff view with comparison grid
- [x] "Edit and Resubmit" button navigates to resource plan editor pre-populated with current data
- [x] IntakeDetailWorkspace (Portfolio Overview) shows feedback card, diff grid with KPI strip, accept/edit buttons
- [x] IntakeDetailPanel "Request Changes" button opens full detail view instead of textarea

### Bug Fixes (Post-Session 4)
- [x] **Diff view showing everything as deleted:** Root cause — `send_back_project` saved only the controller's delta (5-10 changed cells) as the `controller_proposed` snapshot. The diff endpoint compared the full original (~190 rows) against this partial snapshot, making all unchanged cells appear as `proposed = 0`. Fix: merge delta with full Forecast table before saving snapshot.
- [x] **Forecast & Planning tab crash:** Route conflict — launchpad router (`/api/projects/{id}/forecast`) shadowed the workbench router's identical path. Launchpad returned `{months, rows}` with `value/value_eur` fields; workbench expected `{items}` with `forecast_hours/forecast_amount`. Fix: renamed launchpad endpoint to `/api/projects/{id}/resource-plan`.
- [x] **Missing original snapshot for seed projects:** Auto-create original snapshot from current forecast data in `send_back_project` if one doesn't exist.

### Verification
- [x] Full end-to-end flow: Anna (Controller) → Request Changes → edit cells → confirm → Priya (PL) → Review Proposed Changes → only changed cells highlighted (green for reduction)
- [x] Both paths verified: Project Workbench diff view and Portfolio Overview IntakeDetailWorkspace diff view
- [x] KPI strip shows correct Original Plan / Proposed Changes / Impact values
- [x] Forecast & Planning tab loads correctly after route conflict fix

## QA Session D — Fix Session (2026-03-24)

### Bug Fixes
- [x] UI-004 (P2): Executive read-only in Simulator — added `readOnly` prop chain through `ScenarioManager` (hide Create button), `ScenarioWorkspace` → `ActionPanel` (hide AddActionForm, make metadata read-only) → `ActionItem` (hide remove button)
- [x] UI-006 (P3): Controller overdue forecast deep link — changed `deep_link_module` from `"portfolio"` to `"workbench"` with first overdue project ID and `deep_link_tab="forecast"` in `global_launchpad.py`
- [x] UI-007 (P2): PL resubmit button — added `handleResubmit` function and "Resubmit for Approval" button to `IntakeDetailPanel.tsx` for non-Controller users when status is `changes_requested`
- [x] UI-008 (P3): React key warning — changed bare `<>` fragment to `<Fragment key={item.id}>` in `CompetenceCentersPanel.tsx`
- [x] SPEC-002 (P3): Updated test plan persona IDs (`persona-pl`, `persona-exec`)
- [x] SPEC-003 (P3): Documented correct localStorage key (`creta-persona`)

### Verification
- [x] Executive on Simulator: "Create New Scenario" hidden, AddActionForm hidden, remove buttons hidden, metadata read-only
- [x] Controller Launchpad: "Projects with overdue forecasts" navigates to `/workbench?project=proj-erp2&tab=forecast`
- [x] PL resubmit: Send-back → "Resubmit for Approval" button visible → click → status returns to "Pending Approval"
- [x] CC expand: Zero React key warnings in console
- [x] Full module audit: Zero console errors, zero failed network requests across all 7 modules

### Final Cumulative Results
- **133 scenarios tested across 10 suites**
- **All issues resolved: 8 partial → 0 partial (after fixes from Sessions B and D)**
- **UI-005 (AI Advisor pre-loaded suggestions) remains as by-design — not a bug**

## QA E2E Session D — Administration + Cross-Module (2026-03-24)

### Test Results
- **Suite 9 — Administration (ADM-01 to ADM-18):** 18/18 pass
- **Suite 10 — Cross-Module Integration (XM-01 to XM-12):** 10/12 pass, 2 partial
  - XM-01 partial: Overdue forecast pending action links to /portfolio instead of /workbench
  - XM-11 partial: PL has no "Resubmit" button after Controller send-back
- **Total: 30 scenarios, 28 pass, 0 fail, 2 partial**
- **Cumulative (Sessions A+B+C+D): 133 scenarios, 124 pass, 0 fail, 8 partial (4 fixed in Session B)**

### Bugs Found
- **UI-006 (P3):** Overdue forecast pending action links to /portfolio instead of /workbench with project selected
- **UI-007 (P2):** PL cannot resubmit after Controller send-back — no "Resubmit for Approval" button in Intake Queue side panel
- **UI-008 (P3):** React key warning in CompetenceCentersPanel when expanding CC employee list
- **SPEC-003 (P3):** Test plan references `selected-persona` localStorage key; actual key is `creta-persona`

### Observations
- Administration module is fully functional: all 9 entity panels load correctly, CRUD operations work, deactivation pattern works (entities go Inactive, not deleted), reset demo restores all data
- Summary cards: Cost Centers 10, Active People 52 (KNOWN-15), LoB 4, Locations 3, CCs 4
- Portfolio Hierarchy: all 4 tabs functional (Hierarchies, Entity Types, Entities, Hierarchy Assignment), LoB Structure active with correct levels
- Cross-module navigation works: Portfolio→Workbench (via side panel), Capacity→Workbench (via drill-down project links), Launchpad→Portfolio CR Approvals (via pending actions)
- Hierarchy label propagation confirmed: "Line of Business" label dynamically shown in Portfolio filters, Reporting filters
- EUR formatting consistent across all modules (dot thousands, comma decimals)
- Context-sensitive year expansion verified: active→2026, completed→final year (2023), future→start year (2026)
- Zero failed network requests across all 7 modules
- Console errors: only React key warnings from CompetenceCentersPanel (cosmetic)

### Next Steps
- Fix session: Address UI-007 (P2, PL resubmit button) and UI-004 (P2, Executive read-only in Simulator)
- Optionally fix: UI-006 (P3, overdue forecast deep link), UI-008 (P3, React key warnings)

## QA E2E Session A — Global Shell + Portfolio Overview (2026-03-24)

### Test Results
- **Suite 1 — Global Shell & Launchpad (GLB-01 to GLB-07):** 7/7 pass
- **Suite 2 — Portfolio Overview Dashboard (PO-01 to PO-13):** 13/13 pass
- **Suite 3 — Portfolio Intake & CR Approvals (INT-01 to INT-13):** 12/13 pass, 1 fixed
- **Total: 33 scenarios, 32 pass, 0 fail, 1 partial (fixed)**

### Bug Fixes
- [x] UI-001: CR Approvals table Impact column showed "—" for all CRs — replaced naive delta string parsing in `portfolio.py` `get_pending_approvals()` with `_compute_cr_impact_eur()` imported from `workbench.py`. Now shows +€2K (red) / -€10K (green).

### Test Plan Updates
- [x] GLB-03: Updated Controller tile count from 6 to 7 (Documentation module added)

### Issues / Notes
- All workflows verified end-to-end: role switching, filtering, tree expand/collapse, side panels, approve/reject/send-back/resubmit
- Zero console errors, zero failed network requests throughout all 33 scenarios
- Tab switching via programmatic click doesn't work (Radix controlled tabs) — confirmed non-issue for real users, URL navigation works
- Bug report: `qa/bug-report.md`

### Next Steps
- QA Session B: Suites 4-6 (Workbench + Forecast + Capacity) — DONE
- QA Session C: Suites 7-8 (Simulator + Reporting)
- QA Session D: Suites 9-10 (Administration + Cross-Module)

## QA E2E Session B — Workbench + Forecast + Capacity (2026-03-24)

### Test Results
- **Suite 4 — Project Workbench (WB-01 to WB-17):** 16/17 pass, 1 partial
  - WB-12 partial: Completed projects don't auto-expand final year in Forecast Grid
- **Suite 5 — Forecast Wizard (FW-01 to FW-10):** 7/10 pass, 1 fail, 2 blocked
  - FW-05 FAIL: Phase 3 (Edit Forecast) crashes with blank screen — React error in `<Phase3EditForecast>`
  - FW-06, FW-07 BLOCKED: Cannot reach Phase 4/5 due to Phase 3 crash
- **Suite 6 — Capacity Management (CAP-01 to CAP-14):** 14/14 pass
- **Total: 41 scenarios, 37 pass, 1 fail, 3 partial/blocked**
- **Cumulative (Sessions A+B): 74 scenarios, 69 pass, 1 fail, 4 partial/blocked**

### Bugs Found
- **UI-002 (P3):** Completed projects don't auto-expand final year in Forecast Grid collapsible years. Active (2026) and future (start year) work correctly. Only completed projects affected. File: `useCollapsibleYears.ts` or `ForecastGrid.tsx`
- **UI-003 (P1):** Forecast Wizard Phase 3 crashes on load — blank white screen. React error in `<Phase3EditForecast>` component. No error boundary catches it. No API errors — purely frontend rendering issue. Blocks all remaining wizard phases (4 and 5). File: `Phase3EditForecast.tsx`
- **SPEC-002 (P3):** Test plan persona IDs (`persona-project-lead`, `persona-executive`) don't match actual IDs (`persona-pl`, `persona-exec`)

### Observations
- Workbench module is solid: master-detail layout, role scoping, collapsible years, ForecastGrid with sticky columns, CapEx/OpEx tags, Change History with expandable CR detail cards all working well
- Capacity Management is fully functional: heatmap color coding, cell drill-down to project-level detail, cross-module links to Workbench, 3 pivot views on Org Overview, resource request workflow
- Forecast Wizard Phases 1-2 work correctly (variance review with employee names, AI suggestions with Apply/Dismiss)
- EUR formatting consistent throughout (European convention: dot thousands, comma decimals)

## QA Session B — Fix Session (2026-03-24)

### Bug Fixes
- [x] UI-003 (P1): Forecast Wizard Phase 3 crash — renamed `totalDeltaEurEur` to `totalDeltaEur` in `Phase3EditForecast.tsx` (variable name typo). Phase 3 now loads with editable grid.
- [x] UI-002 (P3): Completed projects auto-expand — updated `useCollapsibleYears.ts` useEffect to re-apply expansion when `EXPAND_YEAR` changes after initial seeding (race condition with async overview API).

### Verification
- [x] Phase 3 loads successfully for ERP Integration Phase 2 (Priya Sharma), stepper shows phases 1-2 complete
- [x] Completed project (Data Center Consolidation): 2023 auto-expanded
- [x] Active project (ERP Integration Phase 2): 2026 auto-expanded
- [x] Future project (Connected Vehicle Platform): 2026 auto-expanded
- [x] Zero console errors across all verification steps

### Next Steps
- QA Session C: Suites 7-8 (Simulator + Reporting) — DONE
- QA Session D: Suites 9-10 (Administration + Cross-Module)

## QA E2E Session C — Simulator + Reporting (2026-03-24)

### Test Results
- **Suite 7 — What-If Simulator (SIM-01 to SIM-16):** 14/16 pass, 2 partial
  - SIM-14 partial: AI Advisor panel opens but shows no pre-loaded suggestions (only text input + Analyze button)
  - SIM-16 partial: Executive can access Simulator but read-only not enforced (Create, Add Action, Remove buttons all visible/enabled)
- **Suite 8 — Reporting (RPT-01 to RPT-13):** 13/13 pass
- **Total: 29 scenarios, 27 pass, 0 fail, 2 partial**
- **Cumulative (Sessions A+B+C): 103 scenarios, 96 pass, 0 fail, 6 partial (4 fixed in Session B)**

### Bugs Found
- **UI-004 (P2):** Simulator Executive read-only not enforced — "Create New Scenario" button enabled, ADD ACTION form visible, remove buttons visible for Executive persona. All modification controls should be hidden/disabled for read-only access.
- **UI-005 (P3):** AI Advisor panel has no pre-loaded suggestions — opens with text input and "Analyze Portfolio" button only. No pre-built optimization paths with Apply buttons. May be by design.

### Observations
- What-If Simulator core functionality is solid: scenario CRUD, 7 project-level + 6 portfolio-level action types, full recalculation pipeline, KPI comparison strip, time frame breakdown, portfolio impact tree with drill-down drawer, scenario comparison view, publish/unpublish workflow
- All 3 pre-built scenarios have correct headline impacts (-€502K, +€490K, -€2,8M)
- Reporting module is fully functional: all 5 reports load with data, saved views CRUD works, custom project groupings with search/save/load, vendor drill-down to line items, YoY monthly toggle with month filters, column configurator, dynamic hierarchy labels
- EUR formatting consistent across all modules (European convention)
- Zero console errors, zero failed network requests throughout all 29 scenarios

### Next Steps
- QA Session C Fix: Address UI-004 (Executive read-only) — priority P2
- QA Session D: Suites 9-10 (Administration + Cross-Module)

## v4 Session 6 — UX Polish (2026-03-24, continued)

### Completed Items (UX polish pass)
- [x] CR Detail Modal sizing — moved `overflow-y-auto` from DialogContent to body div with `flex flex-col` + `flex-1 min-h-0` so header stays pinned and body scrolls properly
- [x] CR impact on collapsed rows — added `impact_eur` field to backend `CRHistoryItem` schema and `_compute_cr_impact_eur()` helper in `workbench.py` that computes lightweight EUR delta per CR (resource hours × rate, external costs directly). Collapsed CR rows now show impact in order: Impact → Type badge → Status badge. Formatted with `formatCurrencyCompact` (e.g. `+2K €`), colored green for savings, red for increases.
- [x] Forecast wizard project switch guard — added `useEffect` in `ForecastTab.tsx` that resets mode to `'read'` when `projectId` changes, preventing stale wizard state when switching projects mid-review

### Verification Results (UX polish)
- [x] CR list: 9 CRs for proj-erp2, 7 show impact values (e.g. +2K €, +1,5K €, +750 €), 2 without numeric changes show no impact
- [x] CR detail modal: content fits without clipping, body area scrolls independently of header
- [x] Forecast wizard resets to read mode when switching projects during active review
- [x] Zero console errors (only pre-existing Radix accessibility warnings)

## v4 Session 6 — Seed Data Fixes + End-to-End Verification (2026-03-24)

### Completed Items
- [x] WB-11 (seed data): Rewrote `_build_cr_grid_data()` in `backend/routers/portfolio.py` — function previously filtered for `field_changed in ("hours_per_month", "amount_per_month")` which never matched actual seed data field names. New logic filters by `line_item_type is not None AND month is not None AND numeric old/new values`, groups by `line_item_type`, looks up display names from `RoleType`/`ExternalCostType` tables, and builds one `DetailViewLineItem` per affected line item. Multi-line-item CRs (e.g., CR 12 with role-dev + role-qa) now render correctly.
- [x] WB-11 (seed data consistency): Updated 12 forecast rows in `seed.sql` to match approved CR old/new values. Fixed CR 10 old_value from 60 to 80 to match actual baseline. All 14 audited CRs now have traceable before/after values matching baseline (old) and forecast (new).
- [x] RPT-06: Verified — 117 snapshot rows across 13 projects, report renders with KPIs (avg accuracy, within 5%, above 15%, bias direction).
- [x] BUG-3: Fixed LoB raw ID display in Project Workbench — `workbench.py` now resolves `project.lob.name` instead of returning `project.lob_id`.
- [x] End-to-end verification walkthrough — all modules verified via preview tooling.

### Verification Results
- [x] CR detail grid: Change History for proj-erp2 CR 1 shows Senior Developer line item with current=80h/€8K, proposed=100h/€10K, delta=+20h/+€2K
- [x] CR Approvals grid: SAP S/4HANA CR 12 shows Developer (-80h) and QA/Test Engineer (-40h) line items with Total Impact -€10K (green)
- [x] LoB display: Project Workbench shows "Truck & Bus Systems (TBS)" instead of "lob-tbs"
- [x] Forecast Accuracy: 13 projects rendered with variance percentages and rating badges (red/amber)
- [x] Portfolio Overview: FY 2026 KPIs (square tiles), LIFETIME summary, CY/PY column clusters, Forecast by Line of Business chart
- [x] Capacity Management: My Team heatmap with color variation (green/amber/yellow), utilization percentages
- [x] What-If Simulator: scenario list with headline impact values
- [x] Reporting: all 5 reports accessible from library
- [x] Administration: all entity panels (Cost Centers, Competence Centers, LoB, Locations, People, Rate Tables, Portfolio Hierarchy, Planning Parameters, Audit Log)
- [x] Zero console errors, zero backend errors, zero failed network requests

### Issues / Notes
- The `/administration` route returns a blank page; the correct route is `/admin`. This is a pre-existing routing inconsistency (not introduced in this session).
- Forecast Accuracy KPIs show 0.0% avg accuracy and 0 within-5% projects when filtered to FY 2026 with 6-month horizon — this is expected because the snapshot data (2025-06 to 2026-02) predates the DEMO_DATE minus 6 months threshold. The report works correctly when the horizon or fiscal year filter is adjusted.

## v4 Session 5 — Administration + Dynamic Hierarchy (2026-03-23)

### Completed Items
- [x] ADM-02: Cost center edit — code field shown as read-only disabled input in edit mode. Added `disabled` and `editOnly` support to EntityFormDialog FieldDef interface.
- [x] ADM-05: People competence center assignment — added `competence_center_id` FK to Person model, seed data populated from cost_center→CC mapping, People panel shows CC column and edit form has CC dropdown, reference API returns CC fields.
- [x] ADM-03: Competence center employee assignment — expandable detail view showing assigned employees with name/role/cost center. "Add Employee" dialog with searchable dropdown (shows reassignment warning). "Remove" button per employee. 3 new backend endpoints.
- [x] ADM-04: LoB project assignment — expandable detail view showing assigned projects with status badges and budgets. "Assign Project" dialog with reassignment warning. 2 new backend endpoints.
- [x] ADM-01: Configurable portfolio hierarchy — 5 new SQLAlchemy models (GroupingEntityType, GroupingEntity, GroupingHierarchy, GroupingHierarchyLevel, ProjectGroupingAssignment). Seed data migrates existing LoB structure as default active hierarchy. 12 new backend endpoints for full CRUD. New PortfolioHierarchyPanel with 4 tabs (Hierarchies, Entity Types, Entities, Project Assignments). Cross-module propagation via `useActiveHierarchy` hook — filter labels, chart titles, and entity options across Portfolio Overview, all 4 reports, and What-If Simulator dynamically reflect the active hierarchy label.
- [x] ADM-06: Standard available hours — already implemented in v3 Session 3 via PlanningParameters panel. No additional work needed.

### Verification Results
- [x] Cost center edit: code field disabled (read-only), name and location editable
- [x] People edit: competence center dropdown available, table shows CC column
- [x] Competence center expand: assigned employees listed, add/remove functional
- [x] LoB expand: assigned projects listed with status/budget, assign dialog with reassignment warning
- [x] Portfolio Hierarchy panel: Hierarchies tab shows "LoB Structure" as active with "Line of Business → Project" levels. Entity Types, Entities, Project Assignments tabs all functional.
- [x] Cross-module propagation: filter labels dynamically show "Line of Business" from active hierarchy across Portfolio Overview, Programme Rollup, YoY, Vendor Spend, Forecast Accuracy. Chart title shows "Forecast by Line of Business" dynamically.
- [x] Standard hours: configurable via Planning Parameters (pre-existing)

### Bug Fixes (post-initial completion)
- [x] Hierarchy Assignment fix — renamed "Project Assignments" tab to "Hierarchy Assignment". Non-leaf entities now assign child entities (not projects directly). E.g., in a Department→LoB→Project hierarchy, selecting a Department shows LoB assignment, not project assignment. Only leaf-level entities assign projects.
- [x] Portfolio filter fix — filtering by different LoB/entity in Portfolio Overview after hierarchy changes now works correctly. Fixed recursive entity-to-project resolution via `project_grouping_assignments`.
- [x] Entity creation UX — "Create Entity" dialog pre-selects the entity type from the current filter dropdown. Added "Add Another" button for batch creation of multiple entities of the same type in one dialog session.

### Issues / Notes
- ADM-01: The portfolio tree in Portfolio Overview still uses `project.lob_id` for grouping (not the dynamic hierarchy entities). Full backend propagation (modifying `build_portfolio_tree` to query via `project_grouping_assignments`) is deferred to a follow-up — the hierarchy panel and cross-module label propagation are complete.
- ADM-01: The "Cut by LoB" simulator action now uses active hierarchy entities for its dropdown options (via `getActiveHierarchy`), but the backend `reduce_lob` action still filters by the `lob_id` field in project state. Full backend propagation for scenario engine actions would require additional work.
- ADM-04: Projects can be reassigned between LoBs but cannot be "unassigned" (projects must always belong to a LoB). The LoB panel shows project list but has no remove button — only the Portfolio Hierarchy panel supports unassignment from grouping entities.

## v4 Session 4 — New Requirements: Simulator + Reporting (2026-03-23)

### Completed Items
- [x] SIM-03: Portfolio Impact Time Frame Breakdown — impact dashboard now shows per-year segments (CY, 2027, 2028…, Overall) with current FC, scenario FC, and delta per segment. CY uses abbreviation, future years use 4-digit labels. Added `_get_yearly_forecasts()`, `_build_time_frame_breakdown()` helpers in scenario_engine.py, `TimeFrameCard` component in KPIComparisonStrip.tsx.
- [x] SIM-04: Year Selector for Scenario Actions — multi-select year checkboxes (2025–2030) in AddActionForm. When target years selected, percentage-based actions (adjust_budget, cut_consulting, across_the_board_cut, reduce_lob, cut_by_type, cap_cost_category) scope their effect to forecast in those years only. Added `_get_year_scoped_forecast()` helper.
- [x] RPT-03: Custom Project Groupings in Programme Rollup — "Custom Group" toggle shows project multi-select panel with search, checkbox list, saved groups management (create/load/delete). Backend accepts `project_ids` query param to override normal scoping. Custom groups stored via SavedView model with `report_id='custom-group'`.
- [x] RPT-05: Expense Cost Type Filter and Column in Vendor Spend — added "Expense Cost Type" column (showing dominant cost type per vendor: ext-cloud, ext-consulting, etc.) and filter dropdown populated from reference data. Backend filters by `Forecast.sub_category`.
- [x] RPT-07: LoB and Project Columns in YoY Comparison — rewrote `compute_year_over_year()` to query per-project actuals with Project/LoB joins. Annual mode returns one row per project with lob_name, project_name, fy_current, fy_previous, delta, delta_pct.
- [x] RPT-08: Month Column Optional with Toggle — month hidden by default (annual view). "Show Monthly Detail" button toggles to per-project-per-month rows with month filter checkboxes (Jan–Dec). Cumulative columns only shown in monthly mode.

### Verification Results
- [x] Simulator impact view: CY, 2027, 2028, Overall segments with FC/Scenario/delta per segment. Only "CY" uses abbreviation.
- [x] Scenario action panel: year selector (2025–2030) appears for all action types with "(all years if none selected)" hint
- [x] Programme Rollup: Custom Group mode with project search, checkbox list, saved groups section, save/load/delete
- [x] Vendor Spend: "Expense Cost Type" column visible (ext-cloud, ext-consulting, etc.), filter dropdown in filter bar
- [x] YoY Comparison: LoB and Project columns present in table. Month hidden by default.
- [x] YoY monthly toggle: "Show Monthly Detail" button enables month column + month filter checkboxes
- [x] Zero console errors, zero failed network requests

### Issues / Notes
- SIM-03: Time frame breakdown distributes adjusted budget proportionally across years based on original forecast ratios (since actions operate on total budget, not per-year). This means year-level deltas are approximate when actions don't use target_years.
- RPT-03: Custom groups are stored using the SavedView model with `report_id='custom-group'` for simplicity. A dedicated model would be cleaner for production.
- RPT-07/08: YoY annual mode shows one row per project (not per-month). Monthly mode expands to per-project-per-month. The chart always shows aggregate (all projects combined).

## v4 Session 3 — New Requirements (2026-03-23)

### Completed Items
- [x] CM-06: Configurable standard hours — added planning parameters (global 160h, Munich 160h, Budapest 168h, Pune 176h), location-aware utilization calculation, "Xh / Yh — Z%" display format, updated color thresholds (amber <70%, green 70-90%, amber 90-100%, red >100%)
- [x] WB-09: Variance explanation bug fix — fixed duplicate key issue for same-role line items (category:sub_category:idx), added employee names from Allocation→Person lookup (e.g., "Senior Developer — Lena Fischer")
- [x] WB-04: Monthly timeline table — new MonthlyTimelineTable component below chart with Baseline/Forecast/Actuals rows, collapsible year columns (useCollapsibleYears hook), frozen row labels, GLB-01 context-sensitive default expansion
- [x] PO-01: Dashboard KPIs CY scoping — existing 6 KPI tiles scoped to FY 2026, "FY 2026" label added, compact "LIFETIME" summary row below (lifetime baseline/forecast/actuals + active project count), both sections react to filters
- [x] PO-04: Portfolio table CY/PY clusters — added baseline_cy/forecast_cy/actuals_cy/baseline_py/forecast_py/actuals_py to tree nodes, columns reorganized into CY 2026 cluster → Timeline → Prior Years cluster with cluster headers
- [x] CM-02: Collapsible year columns in Organization Overview — backend returns full allocation date range, frontend uses useCollapsibleYears hook with year headers and expand/collapse, year summary cells show average utilization
- [x] CM-03: Cell drill-down drawer — summary section with Allocated/Available/Delta hours and green/red color coding
- [x] CM-04: Cell drill-down drawer — person-level detail with expandable project rows revealing employee names and per-person hours, project names link to Workbench
- [x] PO-07: Send Back workflow redesign — status lifecycle (pending_approval → changes_requested → pending_approval), project stays in Intake Queue with amber "Changes Requested" badge, PL notification created, PL can resubmit via "Resubmit for Approval" button

### Verification Results
- [x] Monthly table below timeline chart: Baseline/Forecast/Actuals rows, collapsible years, 2025 collapsed with summary, 2026 expanded with monthly values
- [x] Phase 1 retrospective: two Senior Developer items have independent explanation fields, employee names shown (Lena Fischer, Rajesh Patel)
- [x] Portfolio KPIs: "FY 2026" label, CY-scoped values (Baseline €5.4M vs Lifetime €21.3M), Lifetime summary row visible
- [x] Portfolio table: CY 2026 and Prior Years clusters separated by Timeline column
- [x] Send Back flow: controller sends back → "Changes Requested" amber badge → project stays in queue → PL can resubmit
- [x] Organization Overview: collapsible year columns (2022-2025 collapsed, 2026 expanded by default)
- [x] Cell drawer: Allocated 1010h / Available 1600h / Delta +590h (green), project list with hours, expandable employee names
- [x] My Team utilization: "Xh / Yh — Z%" format with location-specific standard hours (160h Munich, 168h Budapest)

### Issues / Notes
- PO-07: Controller feedback is stored as description suffix (simple approach for demo). A dedicated feedback_json field would be cleaner for production.
- CM-02: Collapsed year summary cells in org view show compact percentage only (not full hours format) to save space — this is by design.
- CM-06: The <70% bucket changed from blue to amber per v4 spec. Some cells that were blue (under-utilized) are now amber.

## v4 Session 2 — UX Refinements (2026-03-23)

### Completed Items
- [x] GLB-01: Context-sensitive year expansion — running projects expand current year, future→starting year, completed→final year. Added `getDefaultExpandedYear()` utility and `defaultExpandedYear` param to `useCollapsibleYears` hook.
- [x] WB-03: Timeline summary strip labeled "FY 2026" with separator line
- [x] WB-05: ForecastGrid line item column auto-sizes (`whitespace-nowrap`, removed `min-w-[180px]`)
- [x] WB-08: Renamed "Start Monthly Review" → "Rolling Forecast Review"
- [x] CM-01: HeatmapGrid first column auto-sizes (`max-content` grid template, removed `truncate`)
- [x] CM-05: Capacity Management defaults to My Team tab for all roles (was "org" for non-CC-owners)
- [x] PO-02: "Budget by LoB" → "Forecast by Line of Business" — grouped bar chart with Forecast + Baseline bars, CY-scoped from Forecast/Baseline tables, reacts to all dashboard filters
- [x] PO-03: Project summary pane auto-closes on "Open in Workbench" click via `useSidePanel().closePanel()`
- [x] PO-05: KPI tiles reshaped to 6 square cards in single horizontal row (`grid-cols-6 gap-3 aspect-square`)
- [x] PO-09: Renamed "Approvals" tab → "CR Approvals"
- [x] RPT-04: Cost center name added as first column in CC Financial Summary (backend resolves primary CC via allocation count)

### Verification Results
- [x] Portfolio dashboard: 6 square KPI tiles in one row, "CR Approvals" tab, "Forecast by Line of Business" chart with forecast+baseline legend
- [x] FC&Planning grid: line item labels not truncated, 2026 expanded for active project
- [x] Timeline summary strip shows "FY 2026" label
- [x] Capacity Management opens to My Team tab for controller
- [x] CC Financial Summary: "Cost Center" is first column header, rows show CC names
- [x] Zero console errors, zero failed network requests across all verified pages

### Issues / Notes
- "Autonomous Braking Prototype" shows "—" for cost center in CC Financial because it has no allocations (pending approval). This is expected.
- GLB-01 future/completed project expansion not fully testable in current seed data (all active projects → default to 2026). The utility function is correct; will be exercised if future-dated projects are added.
- PO-02 backend now filters all charts (trajectory, RAG, forecast-by-lob) using the same filtered project IDs based on all dashboard filters, not just LoB.

## v4 Session 1 — Critical Bug Fixes (2026-03-21)

### Completed Items
- [x] GEN-01: Anonymized "Attila Biber" → "Thomas Becker" (p-becker) across all seed data
- [x] WB-01: TODAY label now visible — increased chart margin-top to 24px, chart height to 280px
- [x] WB-02: Timeline chart contained within component — overflow-hidden, removed minWidth:'100%'
- [x] WB-06: Internal resources show hours + euros (format: "120h / €14.400") in FC&Planning grid
- [x] WB-07: Line item column stays fixed during horizontal scroll (added z-10 to sticky cells)
- [x] WB-10: Phase 3 crash fixed — DEMO_DATE corrected to '2026-03', null guard on row.months, safe month arithmetic
- [x] WB-11: Change history now shows tabular DetailViewGrid (fetched on expand) instead of flat table
- [x] WB-12: Removed CapEx/OpEx toggle from project submission form
- [x] WB-13: Submit for approval now works — create_project generates Forecast rows from resource plan (or defaults)
- [x] PO-06: Intake detail shows euros alongside hours for internal resources (uses fmtWithEur)
- [x] PO-08: Approval generates correct baseline from actual forecast data (not hardcoded)
- [x] PO-10: CR Approvals detail panel uses DetailViewGrid when grid_data available (with fallback)
- [x] SIM-01: All 12 scenario action types verified working (7 project + 5 portfolio) — already implemented
- [x] SIM-02: Rate escalation action verified working with scope/percentage/effective-date — already implemented
- [x] RPT-01: Year selector expanded to FY 2021–2029 with "All Years (Lifetime)" option in all 5 reports
- [x] RPT-02: Clearing year filter now shows lifetime totals (fixed all 4 report service functions)
- [x] RPT-06: Forecast accuracy report populated with 117 snapshot rows across 13 projects (2025-06 to 2026-02)

### Verification Results
- [x] Database search for "Attila Biber" / "p-biber" returns zero results
- [x] Timeline chart: TODAY badge visible, chart scrolls independently, app viewport unchanged
- [x] FC&Planning grid: internal resource cells show "Xh / €Y" format. Line item column stays fixed on scroll
- [x] Forecast data loads for Phase 3 (11 line items, months arrays non-null)
- [x] No CapEx/OpEx toggle on project submission form
- [x] Submit for approval works: project created with forecasts, submitted (pending_approval), approved (active) with correct baseline
- [x] What-If Simulator: all 12 action types execute successfully via API
- [x] Programme Rollup: lifetime totals (€21.6M) vs FY2026 (€5.7M) — year filter working correctly
- [x] Forecast Accuracy report: 13 rows populated with historical snapshot data

### Issues / Notes
- SIM-01 and SIM-02 were already fully implemented in v3 — no code changes needed, just verified
- GEN-01: Had to use "Thomas Becker" (p-becker) instead of "Thomas Richter" (p-richter) due to existing person with that ID
- WB-11 display side fixed; seed data consistency for CRs deferred to Session 6 per implementation guide

## CR Workflow Overhaul (2026-03-25)

Full change request workflow now functional (previously cosmetic text-only actions).

### New Flow: PL → Controller → PL (if adjusted) → CC Owner (last)

**Backend:**
- [x] `CRSubmissionSnapshot` model for storing original + controller-proposed forecast data
- [x] `controller_feedback` field on ChangeRequest model
- [x] `GET /api/portfolio/approvals/{cr_id}/editable-grid` — controller editable grid
- [x] `PUT /api/portfolio/approvals/{cr_id}/send-back` — now accepts `changes[]` array + creates snapshots
- [x] `GET /api/projects/{pid}/change-requests/{cr_id}/diff` — PL diff view endpoint
- [x] `PUT /api/projects/{pid}/change-requests/{cr_id}/accept-changes` — PL accepts controller changes
- [x] `PUT /api/projects/{pid}/change-requests/{cr_id}/resubmit` — PL resubmits to controller
- [x] Controller approve now routes CRs with resource changes to `pending_cc_confirmation` + creates ResourceRequests
- [x] CC Owner confirm/decline in capacity.py now final stage (approve + apply forecast)
- [x] Resource requests seeded with `change_request_id` FK for CRs #9, #15

**Frontend:**
- [x] `EditableCRGrid.tsx` — controller editable grid (adapted from EditableIntakeGrid)
- [x] `CRDiffSection.tsx` — PL diff view with color-coded comparison grid
- [x] `CRDetailWorkspace.tsx` — edit-grid action mode for controller
- [x] `CRDetailPanel.tsx` — "Request Changes" routes to workspace
- [x] `CRHistoryList.tsx` — sent-back CRs show amber highlighting + inline diff
- [x] `ChangeHistoryTab.tsx` — refresh mechanism for CR actions
- [x] API client updated with new endpoints

**Seed Data:**
- [x] CR #27 (sent_back_by_controller) has snapshots for immediate diff demo
- [x] CRs #9, #15 (pending_cc_confirmation) have linked resource requests

## Build History (archived — detail removed to keep file manageable)

All phases below are complete. See git history for full details.

- **Phase A:** Database schema + seed data (27 models, 19K-line seed.sql)
- **Phase B:** Backend API (90+ endpoints across 8 router groups)
- **Phase C:** Frontend shell (Vite + React + shadcn/ui, 4-persona role switcher, routing)
- **Phase D:** Module UIs — D1 Portfolio Overview, D2 Project Workbench, D3 Capacity Management, D4 What-If Simulator, D5 Administration
- **Phase E:** Documentation + polish
- **v3 Overhaul:** Sessions 1, 5A–5C, 6 — global patterns, launchpad redesign, seed data regeneration (19K lines), end-to-end verification

