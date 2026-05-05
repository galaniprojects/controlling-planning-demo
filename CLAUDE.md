# CRETA Demo App — Claude Code Project Instructions

## Project Overview
- **Name:** CRETA (Controlling, Reporting, Estimation, Tracking & Allocations) Demo App
- **Repo:** vision-demo-prototype (private)
- **Purpose:** Demo application for Knorr-Bremse IT financial planning transformation, replacing legacy CaPa tool
- **Type:** Demo with realistic mock data — not connected to any real database

## Tech Stack
- **Backend:** FastAPI (Python 3.12+), SQLAlchemy ORM, SQLite (embedded)
- **Frontend:** React (Vite), shadcn/ui (Radix UI + Tailwind CSS), Recharts, Inter font
- **Currency:** EUR (€), **Language:** English, **Demo Date:** April 2026

## Key Architectural Rules (Non-Negotiable)
- SQLAlchemy ORM for ALL database access — no raw SQL in application code (seed.sql is the exception)
- All reference data in database tables, never in code constants
- Deactivation (`is_active` flag), not deletion — on cost centers, people, LoBs, competence centers
- Rate tables with effective dates — historical cost calculations use the rate in effect at the time
- `X-Current-User` header on every request → resolved to CurrentUser context
- Server-side computation — frontend receives ready-to-render data, no roll-ups or calculations client-side
- Consistent response shapes: `{ items: [...], total: N }` for lists, object for detail
- shadcn/ui components only — no additional component libraries
- Heatmaps use CSS grid (not Recharts)
- What-If: every action returns full recalculated state; pre-built scenarios use pre-computed snapshots
- European number formatting: dot for thousands, comma for decimals (€14.400,00)
- No emojis anywhere in the UI — text and Lucide icons only
- Demo date April 2026 — all time-dependent logic (elapsed month tinting, actuals cutoffs, forecast boundaries, pending action triggers) uses this date
- **Dark Mode:** Always use semantic Tailwind color classes — never hardcoded colors like `bg-white`, `text-slate-700`, or `border-slate-200`. Use `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-accent`, `text-primary`, etc. For status/semantic colors (RAG: red/amber/green), keep the light variant AND add a `dark:` variant (e.g. `bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400`). For chart/SVG inline styles, use CSS custom properties (`var(--chart-grid)`, `var(--foreground)`) — never hex values. Test every new component in both light and dark themes.

## Build Status
All phases are complete. The application is fully built with 10 modules:
1. **Launchpad** — role-personalised KPI tiles + pending actions strip, persona-aware greeting and forecast cycle status (E7 redesign)
2. **Portfolio Overview** — Change vs Run sub-modules with pill switcher, KPI dashboard, configurable hierarchy tree, full-page project detail, External Spend tab on Change
3. **Backlog** — ranked intake list (DoI 0–2 demand pipeline), Tech Navigator scoring, cube view + list view, send-back/resubmit cycle, cutoff line (v5)
4. **Project Workbench** — Overview tile grid (T2 layout), mixed-granularity forecast grid, 5-phase forecast cycle wizard, External Costs tab, Cost Allocation tab, version history + diff
5. **Capacity Management** — team utilization heatmaps, cell drill-down, org-wide pivot views, resource request management, role × location × month availability
6. **What-If Simulator** — anchor-against-version scenarios, Tier 1/2/3 levers across 17+ surfaces incl. Lever 12 BTC sandbox, Promote-with-routing, Apply-to-Forecast for PLs
7. **Charging & Allocations** — two-stage cost flow: Stage 1 inter-service distribution edges (DAG, cycle-detected), Stage 2 BTC profiles (manual/automatic), Location Cost Rollup map + tree, Reporting bridge (v5)
8. **Reporting** — 5 standard reports + AI Report Builder (natural language with Claude), saved views, export
9. **Administration** — configurable hierarchy editor, charging master data, UM matrix viewer, workflow templates, scheduled changes, audit log (8 categories), role-permission grants, planning parameters
10. **Documentation Hub** — Overview, Module Guides, API Reference, Data Model, FAQ, and Changelog (6 tabs)

Current focus: enhancements, bug fixes, and demo preparation — see `PROGRESS.md` for specifics.

## Established Components & Patterns

### Shared Components (`components/shared/`)
- `ModuleHeader` — standard page header (title + optional subtitle + right-aligned actions slot + optional breadcrumb / tabs slots) per `[E-07a]`. Used by Portfolio / Workbench / Capacity / Charging / Admin / Reporting / Docs / Backlog / Simulator. Launchpad keeps its centred E7 layout as a sanctioned exception.
- `LeftRailNav` — shared left-rail navigation (flat or grouped) per `[E-07c]`. Backs `ChargingSidebar` and `EntitySelector`; Workbench `ProjectListPanel` shares the active-state vocabulary but renders its own multi-line items.
- `ActionCard` — interactive surface card per `[E-07d]` (action card type). Used by Workbench Overview tile grid and Launchpad pending action items.
- `SummaryCard` — horizontal KPI card per `[E-07d]` (summary card type). Promoted to `components/shared/` in E8; used by Admin context strip and the `capacity` summary bars.
- `EmptyState` — shared empty-state pattern per `[E-07f]` (icon + title + description + optional action button), with `sm` and `md` size variants.
- `ConfidenceIndicator` — diamond-shaped confidence dot per `[E-07g]` (distinct from RAG circles). Used wherever next-milestone confidence is shown.
- `LocationLabel` — qualified label + tooltip for `WorkforceLocation` / `ChargingLocation` / `LegalEntity` per `[F-MD-01]`. Use the `kind` prop and optional `text` override; `iconOnly` for column headers and inline disambiguation.
- `ExpandableTreeTable` — generic recursive tree table with multi-column support
- `FilterBar` — horizontal Select dropdowns with active filter display and Clear
- `Skeleton` — pulsing loading placeholder
- `ModuleGuideButton` — fetches `/api/docs/modules/{id}` (IDs use underscores: `project_workbench`, `capacity_management`, `whatif_simulator`, `administration`)
- `DetailViewGrid` — month × line-item grid with collapsible years, "comparison" and "intake" cell patterns
- `DetailViewKPIStrip` — 3-column KPI display strip with optional custom coloring
- `SortableHeader` — clickable table header with sort direction indicators
- `StatusBadge` — color-coded workflow-status badge (pending, approved, rejected, sent_back). Distinct from the simulator's `ScenarioStatusBadge` (private/published/archived/tier3).
- `DoIBadge`, `PipelineStageBadge` — DoI (numeric, neutral) and pipeline-stage (configurable colours) badges per `[E-07g]`.
- `SubmitProjectDialog` — dialog for submitting new projects with metadata fields

### Chart Components (`components/charts/`)
- `BudgetByLobChart`, `RAGDonutChart`, `ProjectTrajectoryChart`, `ForecastTrajectoryChart`

### Layout Components (`components/layout/`)
- `AppLayout`, `BottomDrawer`, `Breadcrumb`, `HelpButton`, `RoleSwitcher`, `SidePanel`, `TopBar`

### shadcn/ui Components
badge, button, card, checkbox, dialog, dropdown-menu, input, select, separator, sheet, table, tabs, textarea, tooltip

### Contexts (`contexts/`)
- `ThemeContext` — light/dark/system toggle with localStorage persistence
- `RoleContext` — role switching and current role tracking
- `SidePanelContext` — side panel state management (open/close, title, content)
- `BottomDrawerContext` — bottom drawer state management

### Hooks (`hooks/`)
- `useActiveHierarchy` — portfolio hierarchy state management
- `useCollapsibleYears` — year column collapsibility for grids
- `useTableSort` — table sorting logic

### Utilities (`lib/`)
- `formatters.ts` — currency and number formatting
- `rag.ts` — RAG status utilities
- `routes.ts` — application route definitions
- `yearColumns.ts` — year/month column logic
- `detailViewTypes.ts` — TypeScript types for detail grid views
- `renderMarkdownBold.tsx` — markdown rendering helper
- `utils.ts` — general utilities

### Key Patterns
- **Tab pattern:** Use controlled `value` + `useEffect` to reset on role change (NOT `defaultValue`)
- **Action pattern:** idle → mode → textarea → submit → result → `onActionComplete` callback
- **Heatmap pattern:** CSS grid (not Recharts)
- **CR workflow:** PL submits CR → CC Owner confirms/declines resource requests → Controller approves/rejects/sends back → forecast updated on approval
- **Submission workflow:** PL creates draft → submits via 5-phase wizard → Controller reviews with inline edits → approve/reject/send back → baseline created on approval
- **Demo reset:** `POST /api/admin/reset-demo` re-seeds the entire database — use after testing destructive flows to restore clean state

## Demo Roles
Four personas, each with different access and capabilities:
| Role | Persona | Key Capabilities |
|------|---------|-----------------|
| **Controller** | Anna Meier | Full access. Approves/rejects intakes and CRs, manages admin settings, creates scenarios |
| **CC Owner** | Thomas Brenner | Confirms/declines resource requests for their cost center, proposes counter-offers |
| **Project Lead** | Priya Sharma | Creates projects, submits forecasts via wizard, requests resources. Sees only own projects |
| **Executive** | Thomas Becker | Read-only portfolio and reports, creates/compares what-if scenarios |

Role is resolved from `X-Current-User` header → `DemoPersona` table → `CurrentUser` context. Access enforced via `require_role()` dependency.

## API Conventions
- **Auth:** `X-Current-User` header with persona ID on every request → `get_current_user` dependency
- **Authorization:** `require_role("controller", "executive")` dependency — returns 403 if role not in allowed list
- **PL filtering:** `pl_project_filter` dependency restricts Project Leads to their own projects
- **Error responses:** `HTTPException` with status codes: 401 (unknown persona), 403 (insufficient role), 404 (not found), 409 (state conflict)
- **Frontend errors:** `client.ts` catches non-2xx, throws `Error(detail)` — components handle via try/catch
- **DB sessions:** `get_db` dependency with try/finally cleanup — session-per-request pattern

## Data Model Overview
Keep this section updated whenever models or schema change.

### Organization & People
- `Location` — offices (Munich, Budapest, Pune)
- `CompetenceCenter` — cost pools (APD, INF, BSO, DDA)
- `CostCenter` — org units → location + competence center
- `Person` — team members → cost center + role type
- `RoleType` — job roles with `RateTable` hourly rates (effective dates for historical accuracy)
- `GroupingEntityType` / `GroupingEntity` / `GroupingHierarchy` — flexible multi-level portfolio hierarchy

### Projects & Financials
- `Project` — core entity (draft → pending_approval → active → completed), CAPEX/OPEX, assigned PL. v5 Tech Navigator profile: `project_type` (1/2/3), `transformation_level` (T0/T1/T2), 3 Complexity sub-criteria + 3 Value Creation sub-criteria + 2 reserved slots (all `Integer` 1–5), denormalized `complexity_score` / `value_creation_score` / `composite_score` (`Numeric(4,2)`), and `tshirt_size` (XS/S/M/L/XL derived from `total_budget`). All Tech Navigator fields are nullable. Sub-criterion weights, ranking weights, and t-shirt thresholds live in `PlanningParameter` rows under `param_group='tech_navigator'`. v5 Session A2 lifecycle: `pipeline_stage` (working names per `[A-PS-02]`), `doi` (0–5 per `[A-DOI-01]`), `frozen_doi` for off-path stages, `ai_council_approved` flag with `ai_council_doc_url`, and `within_cutoff` (settable in A2, recomputed in A3). Stage and DoI live alongside the v4 `status` field; v4 intake retires in A5. v5 Session E1 progress tracker per `[E-04c]`: `current_milestone_id` (FK with `use_alter=True` to break the create_all cycle), `progress_pct` (`Numeric(5,2)`), `progress_pct_manual_override` Boolean, `status_narrative` (Text, mandatory at cycle submission), `next_milestone_confidence` (`on_track | at_risk | blocked`), `confidence_reason` (required when at_risk/blocked), `progress_updated_at`, `progress_updated_by_id` (FK people.id). All progress fields nullable so existing rows survive schema migration. Live-editable via PATCH `/api/projects/{id}/progress`.
- `ProjectMilestone` — project milestones with baseline + forecast date ranges per [A-MS-01]. `sequence_number` ordering, optional FK `milestone_type_id` to the `MilestoneType` catalogue, optional per-milestone `color` override, `baseline_locked_at` set on first save (baseline dates immutable thereafter except via controller override with audit log per [A-MS-03]).
- `MilestoneType` — global catalogue for the milestone picker per [A-BK-34]. Fields: `id`, `name`, `default_color`, `suggested_ordering`, `is_active`. Read-only via `GET /api/admin/milestone-types`.
- `MilestoneDeliverable` — per-milestone deliverable checklist item per `[E-04c]`. FK `milestone_id` (cascade-delete from milestone), `sequence` ordering (1..N, contiguous), free-text `text`, `is_complete` Boolean, `completed_at` / `completed_by_id` auto-stamped on completion. Hard cap of 10 items per milestone enforced in `services/progress_tracker.MAX_CHECKLIST_ITEMS`. When at least one deliverable exists on the current milestone, `Project.progress_pct` auto-computes from the completion ratio (overridable via `progress_pct_manual_override`).
- `ProgressSnapshot` — versioned snapshot of project progress at forecast cycle completion per `[E-04c]`. Captures denormalised milestone descriptors (`current_milestone_name`, `current_milestone_sequence`) plus the full deliverable checklist as `checklist_payload_json`. Created automatically alongside `ForecastVersion` by `services.progress_tracker.capture_progress_for_cycle` (best-effort fan-out called from `submit_forecast_cycle`). Failure does not block cycle submission.
- `Baseline` — immutable approved plan (project × month × line item)
- `Forecast` — living plan updated via approved CRs (hours/costs per month). v5 Session C1 adds `is_provisional` Boolean (`server_default="0"`) — `True` for cells beyond the granularity boundary (outer zone per `[C-FG-07]`). Manual CR writes clear this flag.
- `ForecastVersion` — immutable point-in-time snapshot of a project forecast per `[C-FV-01..07]`. Sequential `version_number` per project (UniqueConstraint). `version_type`: `cycle` (from forecast cycle submission), `cr_approval` (from CR approval hook), `manual` (controller-created). `payload_json` stores the full mixed-granularity grid as JSON (schema_version 1, ~70 KB/version). `granularity_boundary_months` and `planning_horizon_months` captured at snapshot time. Created automatically: on CR approval (6-line try-wrapped hook in `approve_cr`) and on cycle completion (fan-out to all active projects). NOT replacing `ForecastSnapshot` (which is kept for the accuracy report).
- `Actuals` — read-only historical spend
- `ExternalCostType` — cost categories (hardware, consulting, licenses). Admin-managed per `[E-08e]` `[E-08f]`; default demo set is Consulting / Cloud-Infrastructure / Licenses / Hardware / Other (production seeded from SAP/Ariba). Standard CRUD under `/api/admin/external-cost-types` follows the Cluster D admin browser pattern.

### Change Management
- `ChangeRequest` — two-stage approval (CC Owner confirmation → Controller approval)
- `CRChangeDetail` — line-item deltas (field, old_value, new_value)
- `CRSubmissionSnapshot` — original forecast + proposed edits for diff

### Capacity & Allocations
- `Allocation` — person × project × month (hours, is_confirmed). v5 Session F2
  added a nullable `chargeable_entity_id` FK alongside `project_id` for the
  polymorphic refactor per `[F-DM-01]`. Existing v4 callers continue to use
  `project_id`; F-cluster code paths use `chargeable_entity_id` and fall back
  to a project-lookup when NULL.
- `ResourceRequest` — resource/external cost requests directed to CC Owners
- `ResourceRequestAssignment` — per-month person assignments

### Charging & Allocations (Cluster F Session F2)
- `ChargeableEntity` — polymorphic cost-allocation root per `[F-DM-01..04]`.
  Three subtypes: `Project` (FK back to existing v4 `Project` via `project_id`,
  identifier `IT0<PPM>`), `Offering` (identifier `IT00<S-code>`),
  `InternalService` (identifier `ITF<NNNNN>`). Identifier-format enforcement
  in `schemas/chargeable_entity.py::validate_identifier_for_type`. Carries
  `to_business_pct` (Stage 2 input per `[F-DM-02]`), `hierarchy_node_id`
  (FK into Cluster D's configurable hierarchy per `[F-DM-04]`),
  `responsible_person_id`, optional `termination_month`. `is_change_or_run`
  is a Python property (Project DoI 0–4 = Change; DoI 5 / Offerings /
  InternalServices = Run). WBS Element is **algorithmic, never stored** per
  `[F-DM-03]` — generated by `services/wbs_generator.build_wbs_element` as
  `<identifier>-64-99-<charging_location_code>`.
- `Distribution` — Stage 1 inter-service edge per `[F-S1-01..05]`. Sparse
  storage (one row per actually-flowing edge) keyed by
  `(year, version, source, destination)`. `version` participates in CRETA's
  standard baseline/forecast/actuals lifecycle per `[F-S1-04]` with scenario
  forks identified by `scenario-<id>`. CheckConstraints reject self-loops and
  out-of-range percentages. Sum-rule per `[F-S1-02]`:
  `to_business_pct + Σ(distribute %) ≤ 100`; residual is derived as
  self-retained. Cycle detection per `[F-S1-05]` is hard-block on save with
  the cycle chain returned in the 409 body for UI rendering.
- DAG resolution lives in `services/dag_resolver.py`:
  `compute_effective_cost(db, year, version, entity_id)` returns
  `own_cost + Σ(inflows)` recursively walking incoming edges (defensive
  `_seen` cycle guard, depth cap=8). `get_upstream_chain` returns all
  upstream paths terminating at a target entity for the rollup drill-down
  per `[F-RV-04]`.
- **Allocation polymorphism note:** F2 added `chargeable_entity_id` to the
  `Allocation` model as a nullable FK so capacity allocations can target any
  chargeable entity. Backfilled in seed.sql for all existing v4 rows. v4
  callers continue to use `project_id` unchanged.

### BTC Profiles + Rollup Cache (Cluster F Session F3)
- `BTCProfile` — business-transfer charging profile per entity per year. Two modes: `manual` (controller sets percentages) and `automatic` (UM matrix snapshot). `status` is `draft` or `active`; `UniqueConstraint(entity_id, year)`. Carries optional `s_code` for automatic UM lookup and `copied_from_profile_id` self-FK for year-rollover lineage. `ChargeableEntity.annual_cost` (`Numeric(14,2)`, nullable) added in F3 for Offering/InternalService own-cost.
- `BTCProfileLine` — per-charging-location percentage row (FK to `BTCProfile` + `ChargingLocation`). `Check(percentage > 0 AND <= 100)`. Sum-to-100 enforced at service layer (`BTC_SUM_TOLERANCE = 0.01`). Cascade delete from profile.
- `RollupCache` — persistent two-layer cost cache keyed by `(cache_layer, year, version, key_id)` with JSON payload. Layers: `stage1_effective` (entity effective cost = own + Σ inflows) and `stage2_location` (entity × charging-location BTC-weighted amount). `UniqueConstraint(cache_layer, year, version, key_id)`. Cache commits immediately on write (survives the request boundary). Invalidated by: distribution writes (all stage1+stage2 for year/version), BTC writes (stage2 for entity+year), annual_cost writes (both layers for entity), manual flush endpoint.
- BTC service lives in `services/btc_service.py`: full lifecycle including `create_manual_profile`, `create_automatic_profile` (UM snapshot normalisation), `update_profile`, `refresh_from_um` (dry-run + commit), `change_mode`, `copy_from_profile`, `year_rollover`, `assert_btc_required` (DoI 2→3 gate), `build_wbs_matrix`.
- Rollup service lives in `services/rollup_cache.py` (cache read/write/invalidate) and `services/rollup_query.py` (`query_rollup` with 11 group-by dimensions, `drill_down_charging_location` with enriched path labels).
- New schemas: `schemas/btc_profile.py`, `schemas/rollup.py`.

### Scenarios
- `Scenario` — what-if container. v4 fields: `name`, `description`, `author_id`, `status` (`'private'`/`'published'`), `headline_impact`, timestamps. v5 Session B1 additions per `[B-SL-01..05]` `[E-06b]`: `anchor_forecast_version_id` (FK to ForecastVersion — diffs computed against this anchor), `rebased_from_version_id` (FK retained for audit), `visibility` (`'private'`/`'tier3_only'`/`'all_users'` per `[B-SL-03]` Tier 3 gating), `tier3_content_flag` (auto-set when scenario contains Tier 3 diffs), `archived` + `archived_at` (soft archive per `[B-SL-05]`), `tags` (JSON list), `last_recalculated_at` (drives stale indicator), `cc_owner_scope_cc_id` (FK to cost_centers when CC Owner authored). All v5 columns carry `server_default` so seed.sql INSERTs without the new columns remain compatible.
- `ScenarioAction` — ordered actions (delay, remove, reduce, accelerate, etc.). v5 Session B1 additions: `promoted_at` + `promoted_by_id` (per `[B-PR-04]` partial-promote tracking), `lever_category` (per `[B-ES-01]` 17+ surfaces — `forecast_grid` / `cost_allocation` / `people` / `rate_table` / `pipeline_stage` / `tech_navigator` / `milestone` / etc.), `tier` (1/2/3 per `[B-AC-02]`, server_default `'1'`).
- `ScenarioState` / `ScenarioCapacityImpact` — pre-calculated snapshots
- `ScenarioPromotion` — per-promote audit row per `[B-PR-03..04]`. Captures `promoted_at`, `promoted_by_id`, `routing_summary_json` (list of `{action_id, routing_type, status, message, target_id}`), `promoted_count`, `skipped_count`, `notes`. One row per Promote click that processed ≥1 action.
- `ScenarioApplyToForecastEvent` — PL Apply-to-forecast audit per `[B-PR-05]`. Captures `applied_by_id`, `applied_at`, `cycle_id`, `cycle_label`, `diffs_carried_forward`, `diffs_skipped`, `summary_json`. Provenance on the resulting forecast cells uses Cluster C's `Forecast.is_provisional=True` per `[B-OQ-02]`.

**Lever 12 sandbox storage pattern (B1):** Stage 1 distribution edges fork into `Distribution.version='scenario-{id}'` rows on first mutation per `[F-S1-04]`; live `version='forecast'` rows are never touched. Stage 2 BTC line and `to_business_pct` mutations live as `ScenarioAction` overlays (live `BTCProfile` / `BTCProfileLine` rows untouched) and are applied at impact-calc time by `services/scenario_lever12.py::compute_cost_allocation_impact()`. Promote materialises the overlays onto canonical rows. Cleanup on scenario delete: `cleanup_lever12_state()` removes scenario-version Distribution rows. Cycle detection is union-aware (anchor + scenario versions). Promote permission per `[F-AC-01]`: controllers always allowed; other roles require an explicit `RolePermissionGrant` row for the relevant `entity_type` (`btc_profile` or `distribution`).

### Submissions & System
- `ProjectSubmissionSnapshot` — PL's original plan + controller edits for diff
- `ForecastSnapshot` — point-in-time capture for forecast accuracy reports
- `SavedReport` / `SavedReportShare` / `SavedView` — Report Builder persistence
- `PlanningParameter` — system config (fiscal month, thresholds)
- `Notification` — in-app alerts, `AuditLog` — entity audit trail. Per Cluster D Session D2, `AuditLog.category` is one of 8 categories (`AUDIT_CATEGORIES` in `models/system.py`): `master_data`, `configuration`, `hierarchy`, `forecast_actions`, `pipeline_transitions`, `simulator`, `access_control`, `scheduled_change_lifecycle`. `_log_audit()` requires `category=` keyword-only at every call site.

### Workflow Templates & Scheduled Changes (Cluster D Session D2)
- `WorkflowTemplate` / `WorkflowStep` / `StepAction` — configurable backing store for the six workflows in `[D-CAT-07]` (forecast cycle, intake, change request, send back, milestone baseline override, scheduled master data activation). Steps are not reorderable through the API; touchpoints (required, role, gates, notifications, time, escalation) are editable. Templates ship as configurable data only; live workflow enforcement is a follow-on session.
- `ScheduledChange` — pending master-data change with 5-state lifecycle (`pending_review` → `approved` → `activated` / `rejected` / `cancelled`). Activation engine in `services/scheduled_change_activation.py` is manual-trigger via `POST /api/admin/apply-scheduled-changes`; only `planning_parameter` activation is wired through to the live entity in v5 (other entity types record activation as a no-op).

## Session Protocol
1. **Start:** Read `CLAUDE.md` and `PROGRESS.md` to understand current state
2. **Reference:** Check `guides/` directory for relevant spec documents and session guides for the current work
3. **Verify:** Run the app to confirm current state matches PROGRESS.md
4. **Work:** Continue from where the last session left off
5. **Test:** Write unit tests for every new function; suggest manual testing of new features before creating a PR
6. **Document:** Update `PROGRESS.md`, `README.md`, and in-app documentation module (`backend/seed/fixtures/` manuals) if features changed
7. **End:** Commit all changes with descriptive messages

## v5 Implementation Protocol
CRETA v5 is implemented using a session-based approach. Two documents govern the work:

- **Spec:** `guides/CRETA_v5_Workshop_Spec.md` — the source of truth for what to build and why
- **Implementation guide:** `guides/CRETA_v5_Implementation_Guide.md` — the operational guide for how and when. Contains session definitions, dependency graph, and protocol rules

Before starting any v5 session, read the implementation guide's session protocol section in full. The protocol is: **orient → plan (with extended thinking) → implement → verify → update PROGRESS.md**. No code before the plan is complete.

### Pull requests
- Do NOT create a PR at the end of implementation without first asking about it

### Commit discipline
- Atomic commits — one logical change per commit
- Reference the decision tag in commit messages, e.g. `Add progress tracker model [E-04c]`

(Branch naming follows the existing `## Git Discipline` section — no v5-specific override.)

### No unsolicited refactoring
- If you spot a refactoring opportunity, note it in `PROGRESS.md` under "Refactoring opportunities"
- Do not refactor unless the session explicitly calls for it

### Agent team coordination
- Work should be split across agent teams wherever possible — see the dependency graph in the implementation guide for parallelizable sessions
- The team merging second resolves conflicts. Conflict resolution must be reviewed before continuing

### Visual verification (frontend sessions)
Playwright MCP and Chrome DevTools MCP are available. Use them.

After implementing any UI changes, you MUST visually verify your work:
1. Start the dev server if not already running
2. Use the Playwright MCP tools to navigate to the affected page(s) at localhost
3. Take a screenshot at desktop viewport (1440px width)
4. Describe what you see in the screenshot before declaring the work complete
5. Compare what you see against the spec requirements for the session
6. If something looks wrong, fix it and screenshot again

**Screenshots go in `qa/screenshots/`, never the project root.** The directory is gitignored (only `.gitkeep` is tracked); both Playwright MCP and Chrome DevTools MCP screenshot tools should pass `filePath: qa/screenshots/<descriptive-name>.png`. The `.playwright-mcp/` directory at the repo root is also gitignored — leave any artefacts the MCP server writes there alone.

Do NOT declare a frontend session complete without having taken and reviewed at least one screenshot. "It should look correct" is not verification — you must actually look at the page.

For backend-only sessions, verification means confirming endpoints return expected responses via curl or the test client. Visual verification is not required.

## Documentation Updates (Non-Negotiable)
- **Any time API endpoints are added, changed, or removed**, update `README.md` (API tables) and `PROGRESS.md`
- **Any time software features change significantly**, update `README.md` (Features section) and `PROGRESS.md`
- **Any time new models or schema changes are made**, update `PROGRESS.md` and the **Data Model Overview** section in this file
- **Any time module behavior changes**, update the in-app documentation module content (`backend/seed/fixtures/` manuals)
- **Any time backend files are added or removed** (models, routers, services), update the **Backend** file listings in Critical File Paths
- Documentation updates are part of the definition of done — do not consider a task complete until docs are updated

## Testing Requirements
- **Unit tests:** Every new backend function must have corresponding tests in `backend/tests/` — run with `python -m pytest tests/ -v`
- **Manual testing:** Before creating a PR, suggest the user manually test the new feature in the browser
- **QA test plan:** `qa/test-plan.md` — living E2E regression test plan (198 scenarios across 15 suites). Update scenario counts when adding new test suites or scenarios.
- **Bug tracking:** `qa/bug-report.md` — created during testing sessions to track issues found
- **Testing sessions are read-only:** do not fix code during testing, only document issues in `qa/bug-report.md`
- After testing, a separate fix session addresses issues from the bug report

## Git Discipline
- **Always create a new branch off `main`** before starting any new task, feature, or bug fix — never work directly on `main`
- Branch naming convention: `feature/<name>`, `fix/<name>`, or `session/<name>` (e.g., `feature/report-builder-session2`, `fix/cr-visibility-bugs`)
- Commit after every meaningful milestone
- Descriptive commit messages: `"Feature-name: description of what was done"`
- Do not squash — preserve build history
- Update `PROGRESS.md` as the final commit of each session

## Agent Infrastructure
This project uses two tiers of agent parallelization. All agent role definitions live in `.claude/agents/`.

### Sub-agents (lightweight, hub-and-spoke)
- Spawned within a session, report results back to the lead only
- No inter-agent communication
- Best for: parallel searches, independent bug fixes, background test runs, focused single-file tasks
- **Use automatically** for low-risk parallel work (searches, tests, independent fixes)
- **Suggest first** for judgment calls (feature splits, pre-PR reviews, large refactors)

### Agent Teams (heavyweight, full coordination)
- Multiple Claude Code instances with shared task list and peer-to-peer messaging
- Teammates can discuss, challenge findings, and coordinate directly
- Best for: multi-layer features (backend + frontend + tests), competing-hypothesis debugging, parallel code reviews
- Display: split panes in iTerm2 (Shift+Down to cycle in-process mode)
- Aim for 3-5 teammates, 5-6 tasks per teammate, different file ownership per teammate

### When to use which
| Sub-agents | Agent Teams |
|---|---|
| Workers don't need to talk to each other | Workers need to discuss/coordinate |
| Quick, focused tasks (<5 min) | Complex multi-step work |
| Same-file or small scope | Cross-layer (backend + frontend + tests) |
| Lower token cost | Thoroughness matters more than cost |

### Installed Agent Roles (`.claude/agents/`)
**Opus model** (complex reasoning): `fastapi-developer`, `react-specialist`, `typescript-pro`, `debugger`, `refactoring-specialist`, `code-reviewer`
**Sonnet model** (structured tasks): `qa-expert`, `sql-pro`, `api-documenter`, `accessibility-tester`, `performance-engineer`, `documentation-engineer`, `ui-designer`

### Agent Team Usage
- Reference agent roles by name when spawning teammates: "Spawn a teammate using the **fastapi-developer** agent type"
- Teammates load CLAUDE.md automatically — they follow all project rules
- Teammates do NOT inherit conversation history — include task-specific context in spawn prompts
- Each teammate should own different files to avoid conflicts
- Always clean up teams via the lead when done

## Critical File Paths

### Project Documentation
- `CLAUDE.md` — project instructions (this file)
- `PROGRESS.md` — build progress tracker (update every session)
- `README.md` — feature overview, API docs, setup instructions
- `SETUP.md` — detailed setup guide

### Agent Definitions
- `.claude/agents/` — 13 sub-agent/teammate role definitions (fastapi-developer, react-specialist, etc.)

### Specs & Guides
- `guides/` — active spec documents and session guides for current/upcoming work

### Archive
- `docs_archive/` — completed/superseded spec and session guide files

### Planning Documents
- `docs/submission-workflow-plan.md` — submission workflow design
- `docs/hierarchy-migration-plan.md` — hierarchy migration plan

### QA
- `qa/test-plan.md` — E2E regression test plan
- `qa/bug-report.md` — bug tracking during test sessions
- `qa/ai-report-builder-prompts.md` — AI Report Builder test prompts

### Backend
- `backend/seed/seed.sql` — all relational seed data
- `backend/seed/fixtures/` — JSON fixtures (manuals, FAQ, AI Advisor goals)
- `backend/models/` — `capacity.py`, `change_requests.py`, `charging.py`, `financial.py`, `organization.py`, `people.py`, `projects.py`, `reporting.py`, `scenarios.py`, `scheduled_changes.py`, `submissions.py`, `system.py`, `users.py`, `workflow_templates.py`
- `backend/routers/` — `admin.py`, `ai_reports.py`, `audit.py`, `capacity.py`, `charging.py`, `documentation.py`, `global_launchpad.py`, `intake.py`, `milestones.py`, `pipeline.py`, `portfolio.py`, `ranking.py`, `reference.py`, `report_builder.py`, `reports.py`, `scenarios.py`, `scheduled_changes.py`, `tech_navigator.py`, `user_measurement.py`, `workbench.py`, `workflow_templates.py`
- `backend/services/` — `advisor.py`, `ai_report_service.py`, `allocation_service.py`, `audit_export.py`, `audit_query.py`, `btc_service.py`, `calculations.py`, `dag_resolver.py`, `distribution_service.py`, `forecast_cycle.py`, `forecast_versioning.py`, `intake_workflow.py`, `pipeline.py`, `portfolio_service.py`, `progress_tracker.py`, `report_builder_catalog.py`, `report_builder_engine.py`, `report_builder_export.py`, `report_builder_saved.py`, `report_service.py`, `rollup_cache.py`, `rollup_query.py`, `scenario_apply_forecast.py`, `scenario_engine.py`, `scenario_impact.py`, `scenario_lever12.py`, `scenario_promote.py`, `scheduled_change_activation.py`, `tech_navigator.py`, `user_measurement_import.py`, `wbs_generator.py`
- `backend/schemas/` — `admin.py`, `ai_reports.py`, `btc_profile.py`, `capacity.py`, `chargeable_entity.py`, `charging.py`, `common.py`, `distribution.py`, `documentation.py`, `global_launchpad.py`, `intake.py`, `milestones.py`, `pipeline.py`, `portfolio.py`, `ranking.py`, `reference.py`, `report_builder.py`, `reports.py`, `rollup.py`, `scenarios.py`, `tech_navigator.py`, `user_measurement.py`, `workbench.py`
- `backend/tests/` — unit tests (Wave 3 B1 in flight: 1098 tests; see PROGRESS.md for breakdown)

### Frontend
- `frontend/src/modules/` — 10 module UIs (launchpad, portfolio, workbench, charging, capacity, simulator, reporting, admin, docs, backlog)
- `frontend/src/components/` — shared, layout, chart, and UI components
- `frontend/src/contexts/` — React contexts (Theme, Role, SidePanel, BottomDrawer)
- `frontend/src/hooks/` — custom hooks
- `frontend/src/lib/` — utilities and helpers
- `frontend/src/api/` — `client.ts` (HTTP abstraction + X-Current-User injection), `endpoints.ts` (all API calls), `api.ts`, `reportBuilder.ts`
- `frontend/src/types/` — TypeScript type definitions

## Commands
```bash
# First-time setup
cd backend && python3.12 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
cd frontend && npm install

# Daily start
cd backend && source .venv/bin/activate && python main.py  # http://localhost:8000, Swagger at /docs
cd frontend && npm run dev  # http://localhost:5173

# Unit tests
cd backend && python -m pytest tests/ -v

# Reset demo data (re-seeds database to clean state)
curl -X POST http://localhost:8000/api/admin/reset-demo
```

## Frontend Routes
| Route | Module | Notes |
|-------|--------|-------|
| `/` | Launchpad | Home / pending actions hub |
| `/portfolio` | Portfolio Overview | KPI dashboard, project tree |
| `/portfolio/intake` | Intake Queue | Project intake approvals |
| `/portfolio/approvals` | Approvals | CR approval queue |
| `/workbench` | Project Workbench | Master-detail workspace |
| `/charging` | Charging & Allocations | Distribution + BTC + rollup map/table + reporting bridge (v5 F4/F5) |
| `/capacity` | Capacity Management | Heatmaps, utilization |
| `/capacity/requests` | Resource Requests | Resource request management |
| `/simulator` | What-If Simulator | Scenario builder |
| `/reporting` | Reporting | Standard reports |
| `/reporting/builder` | Report Builder | AI-powered custom reports |
| `/admin` | Administration | System config, CRUD |
| `/docs` | Documentation | Guides, FAQ, API reference |

## Cross-Module Navigation
- All modules are built — links should navigate directly to the target module/view
- Verify navigation paths when adding new cross-module links
