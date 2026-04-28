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
All phases are complete. The application is fully built with 8 modules:
1. **Launchpad** — personalized hub, pending actions with deep-linking, KPI summaries
2. **Portfolio Overview** — KPI dashboard, hierarchical project tree, intake queue, CR approvals
3. **Project Workbench** — master-detail workspace, 5-phase rolling forecast wizard, submission workflow, change requests
4. **Capacity Management** — team utilization heatmaps, org-wide pivot views, resource request management
5. **What-If Simulator** — 12 action types, real-time KPI impact, scenario comparison, AI Advisor
6. **Reporting** — 5 standard reports + AI Report Builder (natural language with Claude), saved views, export
7. **Administration** — entity CRUD, rate tables, hierarchy configuration, audit logging, planning parameters
8. **Documentation Hub** — module guides, FAQ, API reference, data model overview

Current focus: enhancements, bug fixes, and demo preparation — see `PROGRESS.md` for specifics.

## Established Components & Patterns

### Shared Components (`components/shared/`)
- `ExpandableTreeTable` — generic recursive tree table with multi-column support
- `FilterBar` — horizontal Select dropdowns with active filter display and Clear
- `Skeleton` — pulsing loading placeholder
- `ModuleGuideButton` — fetches `/api/docs/modules/{id}` (IDs use underscores: `project_workbench`, `capacity_management`, `whatif_simulator`, `administration`)
- `DetailViewGrid` — month × line-item grid with collapsible years, "comparison" and "intake" cell patterns
- `DetailViewKPIStrip` — 3-column KPI display strip with optional custom coloring
- `SortableHeader` — clickable table header with sort direction indicators
- `StatusBadge` — color-coded status badge (pending, approved, rejected, sent_back)
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
- `Project` — core entity (draft → pending_approval → active → completed), CAPEX/OPEX, assigned PL. v5 Tech Navigator profile: `project_type` (1/2/3), `transformation_level` (T0/T1/T2), 3 Complexity sub-criteria + 3 Value Creation sub-criteria + 2 reserved slots (all `Integer` 1–5), denormalized `complexity_score` / `value_creation_score` / `composite_score` (`Numeric(4,2)`), and `tshirt_size` (XS/S/M/L/XL derived from `total_budget`). All Tech Navigator fields are nullable. Sub-criterion weights, ranking weights, and t-shirt thresholds live in `PlanningParameter` rows under `param_group='tech_navigator'`. v5 Session A2 lifecycle: `pipeline_stage` (working names per `[A-PS-02]`), `doi` (0–5 per `[A-DOI-01]`), `frozen_doi` for off-path stages, `ai_council_approved` flag with `ai_council_doc_url`, and `within_cutoff` (settable in A2, recomputed in A3). Stage and DoI live alongside the v4 `status` field; v4 intake retires in A5.
- `ProjectMilestone` — project milestones with baseline + forecast date ranges per [A-MS-01]. `sequence_number` ordering, optional FK `milestone_type_id` to the `MilestoneType` catalogue, optional per-milestone `color` override, `baseline_locked_at` set on first save (baseline dates immutable thereafter except via controller override with audit log per [A-MS-03]).
- `MilestoneType` — global catalogue for the milestone picker per [A-BK-34]. Fields: `id`, `name`, `default_color`, `suggested_ordering`, `is_active`. Read-only via `GET /api/admin/milestone-types`.
- `Baseline` — immutable approved plan (project × month × line item)
- `Forecast` — living plan updated via approved CRs (hours/costs per month)
- `Actuals` — read-only historical spend
- `ExternalCostType` — cost categories (hardware, consulting, licenses)

### Change Management
- `ChangeRequest` — two-stage approval (CC Owner confirmation → Controller approval)
- `CRChangeDetail` — line-item deltas (field, old_value, new_value)
- `CRSubmissionSnapshot` — original forecast + proposed edits for diff

### Capacity & Allocations
- `Allocation` — person × project × month (hours, is_confirmed)
- `ResourceRequest` — resource/external cost requests directed to CC Owners
- `ResourceRequestAssignment` — per-month person assignments

### Scenarios
- `Scenario` — what-if container (private/published)
- `ScenarioAction` — ordered actions (delay, remove, reduce, accelerate, etc.)
- `ScenarioState` / `ScenarioCapacityImpact` — pre-calculated snapshots

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
- `backend/models/` — `capacity.py`, `change_requests.py`, `financial.py`, `organization.py`, `people.py`, `projects.py`, `reporting.py`, `scenarios.py`, `scheduled_changes.py`, `submissions.py`, `system.py`, `users.py`, `workflow_templates.py`
- `backend/routers/` — `admin.py`, `ai_reports.py`, `audit.py`, `capacity.py`, `documentation.py`, `global_launchpad.py`, `milestones.py`, `pipeline.py`, `portfolio.py`, `reference.py`, `report_builder.py`, `reports.py`, `scenarios.py`, `scheduled_changes.py`, `tech_navigator.py`, `workbench.py`, `workflow_templates.py`
- `backend/services/` — `advisor.py`, `ai_report_service.py`, `allocation_service.py`, `audit_export.py`, `audit_query.py`, `calculations.py`, `forecast_cycle.py`, `pipeline.py`, `portfolio_service.py`, `report_builder_catalog.py`, `report_builder_engine.py`, `report_builder_export.py`, `report_builder_saved.py`, `report_service.py`, `scenario_engine.py`, `scheduled_change_activation.py`, `tech_navigator.py`
- `backend/tests/` — unit tests (459 tests across 24 test files)

### Frontend
- `frontend/src/modules/` — 8 module UIs (launchpad, portfolio, workbench, capacity, simulator, reporting, admin, docs)
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
