# VIPER Demo App — Claude Code Project Instructions

## Project Overview
- **Name:** VIPER — IT Financial Planning Platform (demo app)
- **Repo:** viper-prototype (private)
- **Purpose:** Demo application for Knorr-Bremse IT financial planning transformation, replacing legacy CaPa tool
- **Type:** Demo with realistic mock data — not connected to any real database

## Tech Stack
- **Backend:** FastAPI (Python 3.12+), SQLAlchemy ORM, SQLite (embedded)
- **Frontend:** React (Vite), shadcn/ui (Radix UI + Tailwind CSS), Recharts, Inter font
- **Currency:** EUR (€), **Language:** English

## Key Architectural Rules (Non-Negotiable)
- SQLAlchemy ORM for ALL database access — no raw SQL in application code (`backend/seed/seed.sql` is the exception).
- All reference data in database tables, never in code constants.
- Soft delete (`is_active` flag), not hard delete — on cost centres, people, LoBs, competence centres, charging master data.
- Rate tables with effective dates — historical cost calculations use the rate in effect at the time.
- `X-Current-User` header on every request → resolved to `CurrentUser` context via `DemoPersona`. Authorization via `require_role(...)` dependency.
- Server-side computation — frontend receives ready-to-render data, no roll-ups or calculations client-side.
- Consistent response shapes: `{ items: [...], total: N }` for lists, object for detail.
- **shadcn/ui components only** — no additional component libraries. The shipped set is in `frontend/src/components/ui/`. Heatmaps use **CSS grid**, not Recharts.
- What-If: every action returns full recalculated state; pre-built scenarios use pre-computed snapshots.
- European number formatting: dot for thousands, comma for decimals (€14.400,00).
- No emojis anywhere in the UI — text and Lucide icons only.
- **Demo date is April 2026** — all time-dependent logic (elapsed-month tinting, actuals cutoffs, forecast boundaries, pending-action triggers) uses this date.
- **Dark mode:** Always use semantic Tailwind colour classes — `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-accent`, `text-primary`. Never hardcoded colours like `bg-white`/`text-slate-700`/`border-slate-200`. For status/RAG colours, keep the light variant AND add a `dark:` variant (e.g. `bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400`). For chart/SVG inline styles, use CSS custom properties (`var(--chart-grid)`, `var(--foreground)`) — never hex values. Test every new component in both light and dark themes.

## Demo Roles
Four personas, each with different access and capabilities. Role is resolved from `X-Current-User` → `DemoPersona` → `CurrentUser`.

| Role | Persona | Key Capabilities |
|------|---------|-----------------|
| **Controller** | Anna Meier | Full access. Approves/rejects intakes and CRs, manages admin settings, creates scenarios |
| **CC Owner** | Thomas Brenner | Confirms/declines resource requests for their cost centre, proposes counter-offers |
| **Project Lead** | Priya Sharma | Creates projects, submits forecasts via wizard, requests resources. Sees only own projects |
| **Executive** | Dr. Klaus Weber | Read-only portfolio and reports, creates/compares what-if scenarios |

## API Conventions
- **Auth:** `X-Current-User` header → `get_current_user` dependency.
- **Authorization:** `require_role("controller", "executive")` — returns 403 if role not in allowed list. PL filtering via `pl_project_filter` dependency restricts Project Leads to their own projects.
- **Error responses:** `HTTPException` with 401 (unknown persona), 403 (insufficient role), 404 (not found), 409 (state conflict). Frontend `client.ts` catches non-2xx and throws `Error(detail)`.
- **DB sessions:** `get_db` dependency with try/finally cleanup — session-per-request pattern.

## Data Model Overview
**70 models across 14 files in `backend/models/`.** This is just the orientation index; the canonical reference with columns, FKs, constraints, relationships, and decision-tag history lives in **`docs/data-model.md`** — read that before making any schema change.

| Family | Models |
|---|---|
| Organization | `Location`, `CompetenceCenter`, `CostCenter`, `GroupingEntityType`, `GroupingEntity`, `GroupingHierarchy`, `GroupingHierarchyLevel`, `ProjectGroupingAssignment` |
| People | `RoleType`, `Person`, `RateTable` |
| Users | `DemoPersona`, `User` |
| Projects | `Project`, `MilestoneType`, `ProjectMilestone`, `MilestoneDeliverable`, `ProgressSnapshot`, `ProjectDependency` |
| Financials | `ExternalCostType`, `Baseline`, `Forecast`, `Actuals`, `ForecastVersion`, `ExternalCostDelivery`, `ExternalCostInvoice` |
| Change Mgmt | `ChangeRequest`, `CRChangeDetail`, `CRSubmissionSnapshot` |
| Capacity | `Allocation`, `ResourceRequest`, `ResourceRequestAssignment`, `CapacityActionLog` |
| Charging | `Country`, `Region`, `ChargingLocation`, `LegalEntity`, `UMVersion`, `UserMeasurement`, `ChargeableEntity`, `DistributionVersion`, `Distribution`, `BTCProfile`, `BTCProfileLine`, `RollupCache` |
| Scenarios | `Scenario`, `ScenarioAction`, `ScenarioState`, `ScenarioCapacityImpact`, `ScenarioPromotion`, `ScenarioApplyToForecastEvent`, `ScenarioForecastCellEdit`, `ScenarioLineEdit`, `ScenarioMixChange`, `ScenarioPlanEdit` |
| Submissions | `ProjectSubmissionSnapshot` |
| System | `PlanningParameter`, `KPIDefinition`, `Notification`, `AuditLog`, `SystemSuggestion`, `RolePermissionGrant` |
| Reporting | `ForecastSnapshot`, `SavedReport`, `SavedReportShare`, `SavedView` |
| Workflow Templates | `WorkflowTemplate`, `WorkflowStep`, `StepAction` |
| Scheduled Changes | `ScheduledChange` |

## Modules
The app ships with 10 modules — see Frontend Routes table below for paths.

| Module | One-line purpose |
|---|---|
| Launchpad | Role-aware home — module cards (3 columns), pending actions, persona greeting, forecast cycle status |
| Portfolio Overview | Change vs Run sub-modules, KPI dashboard, configurable hierarchy tree, project detail |
| Backlog | Ranked pre-execution pipeline (Proposed / Under Evaluation / Approved), Tech Navigator scoring, cube + list views, send-back/resubmit cycle |
| Project Workbench | Overview tile grid, mixed-granularity forecast grid, 5-phase cycle wizard, External Costs, Cost Allocation, version history |
| Capacity Management | Team utilization heatmaps, cell drill-down, org-wide pivots, resource request management |
| What-If Simulator | Anchor-against-version scenarios, Tier 1/2/3 levers across 17+ surfaces incl. Lever 12 BTC sandbox, Promote-with-routing, Apply-to-Forecast |
| Charging & Allocations | Stage 1 inter-service distribution edges (DAG), Stage 2 BTC profiles, Location Cost Rollup, Reporting bridge |
| Reporting | 5 standard reports + AI Report Builder (NL → query), saved views, export |
| Administration | Configurable hierarchy editor, charging master data, UM matrix viewer, workflow templates, scheduled changes, audit log, role-permission grants, planning parameters |
| Documentation Hub | Overview, Module Guides, API Reference, Data Model, FAQ, Changelog |

Current focus: enhancements, bug fixes, and demo preparation — see `PROGRESS.md`.

## Established Patterns
- **Shared components** live in `frontend/src/components/shared/` — check there before creating new ones. Notable: `ModuleHeader` (standard page header per `[E-07a]`), `LeftRailNav` (per `[E-07c]`), `ActionCard` / `SummaryCard` (per `[E-07d]`), `EmptyState` (per `[E-07f]`), `ConfidenceIndicator` (per `[E-07g]`), `LocationLabel` (qualified label for `WorkforceLocation`/`ChargingLocation`/`LegalEntity` per `[F-MD-01]` — use `kind` prop), `ExpandableTreeTable`, `DetailViewGrid`, `ModuleGuideButton` (IDs use underscores: `project_workbench`, `capacity_management`, `whatif_simulator`, `administration`).
- **Tab pattern:** controlled `value` + `useEffect` to reset on role change (NOT `defaultValue`).
- **Action pattern:** idle → mode → textarea → submit → result → `onActionComplete` callback.
- **CR workflow:** PL submits CR → CC Owner confirms/declines resource requests → Controller approves/rejects/sends back → forecast updated on approval.
- **Submission workflow:** PL creates draft → submits via 5-phase wizard → Controller reviews with inline edits → approve/reject/send back → baseline created on approval.

## Session Protocol
1. **Start:** Read `CLAUDE.md` and `PROGRESS.md` to understand current state. **If the task involves the data model** — adding/altering a column, tracing relationships, or working with a model you don't already know — also read the relevant section of `docs/data-model.md`.
2. **Reference:** Check `guides/` for active spec documents and session guides.
3. **Verify:** Run the app to confirm current state matches PROGRESS.md.
4. **Work:** Continue from where the last session left off. **Always create a new branch off `main`** before starting (`feature/<name>` | `fix/<name>` | `session/<name>`) — never work directly on `main`.
5. **Test:** Write unit tests for every new function; suggest manual testing of new features before creating a PR. Do NOT create a PR without asking first.
6. **Review:** Once implementation is verified, ask the user whether to launch an independent code reviewer — see Code Review below. Do NOT run it unprompted, and do NOT change code in response to its findings without explicit confirmation.
7. **Document:** Update `PROGRESS.md`, `README.md`, and in-app documentation (`backend/seed/fixtures/` manuals) — see Documentation Updates below.
8. **End:** Commit all changes with descriptive messages. `PROGRESS.md` is the final commit of each session.

## Documentation Updates (Non-Negotiable)
- **API endpoints added/changed/removed** → update `README.md` (API tables) and `PROGRESS.md`.
- **Software features change significantly** → update `README.md` (Features section) and `PROGRESS.md`.
- **Models or schema change** — any change visible in `git diff backend/models/` (adding/removing a model or column, renaming, type changes, FK/constraint/index changes, enum value changes, default or `server_default` changes) → update **all three**:
  1. `PROGRESS.md` — log the change and any wave/spec reference.
  2. The compact **Data Model Overview** index in this file (CLAUDE.md) — only if a model is added or removed (column-level changes don't touch CLAUDE.md).
  3. `docs/data-model.md` — the canonical reference. Update the relevant model section, the Constants & Enums Appendix if a value set changed, and the Cross-Cutting Patterns section if the change introduces a new pattern.

  The SQLAlchemy model files are authoritative; both docs are navigable wrappers around them. Drift in `docs/data-model.md` defeats its purpose — keep it in sync with the same commit that changes the model.
- **Module behaviour changes** → update the in-app documentation module content (`backend/seed/fixtures/` manuals).
- Documentation updates are part of the definition of done — do not consider a task complete until docs are updated.

## Testing Requirements
- **Unit tests:** Every new backend function must have corresponding tests in `backend/tests/` — run with `cd backend && python -m pytest tests/ -v`.
- **Manual testing:** Before creating a PR, suggest the user manually test the new feature in the browser.
- **QA test plan:** `qa/test-plan.md` — living E2E regression test plan. Update scenario counts when adding new test suites or scenarios.
- **Bug tracking:** `qa/bug-report.md` — created during testing sessions to track issues found.
- **Testing sessions are read-only:** do not fix code during testing, only document issues. A separate fix session addresses issues from the bug report.

## Code Review
- **Trigger:** When implementation for a task/wave is complete and verified — before opening a PR, and before the final `PROGRESS.md` commit.
- **Ask first, don't run unprompted:** Surface the option to the user (e.g. "Implementation is done — should I launch an independent code reviewer on the diff?"). Wait for explicit confirmation before invoking it.
- **Which agent:** Default to the `code-reviewer-fresh` sub-agent (read-only, fresh context — avoids self-review bias). Use `code-reviewer` only if the user asks for one that can also propose edits. The `/code-review ultra` skill is user-triggered only — never launch it yourself.
- **What to pass it:** Launch the reviewer with a CLEAN context — it must NOT inherit any conversation history, reasoning, or assumptions made during this session. Pass ONLY: the current diff vs. `main` (or the relevant base) and a one-paragraph factual brief of what the change is meant to do and what's intentionally out of scope. Do not feed it your own conclusions, justifications for design decisions, or "this is fine because…" framing — the point is an independent judgement, so anything that would bias it toward agreeing with the session's choices must be left out.
- **What to do with the report:** Relay findings to the user — grouped by severity (blocker / should-fix / nit) with file:line references. **Do not touch code based on the report without explicit confirmation.** Ask the user which findings to act on; treat their answer as the scope. If they say "fix all blockers," that does not authorize nits.
- **Memory:** This rule overrides any general guidance about auto-applying review fixes.

## Git Discipline
- Always create a new branch off `main` (`feature/<name>` | `fix/<name>` | `session/<name>`) — never work directly on `main`.
- Atomic commits — one logical change per commit. Reference decision tags where relevant (e.g. `Add progress tracker model [E-04c]`).
- Descriptive commit messages: `"Feature-name: description of what was done"`.
- Do not squash — preserve build history.
- Update `PROGRESS.md` as the final commit of each session.
- Do **NOT** create a PR at the end of implementation without first asking about it.

## Visual Verification (frontend sessions)
Playwright MCP and Chrome DevTools MCP are available. After implementing any UI change you MUST visually verify: start the dev server, navigate to the affected page at `localhost:5173`, take a screenshot at 1440px width to **`qa/screenshots/`** (gitignored — never the project root), describe what you see, and compare against the spec. "It should look correct" is not verification. Backend-only sessions verify via curl or the test client; visual verification not required.

## Agent Infrastructure
Two tiers of parallelization, with role definitions in `.claude/agents/` (13 roles: `fastapi-developer`, `react-specialist`, `typescript-pro`, `debugger`, `refactoring-specialist`, `code-reviewer`, `qa-expert`, `sql-pro`, `api-documenter`, `accessibility-tester`, `performance-engineer`, `documentation-engineer`, `ui-designer`).

- **Sub-agents** (lightweight, hub-and-spoke): spawn from the Agent tool for parallel searches, independent bug fixes, focused tasks. Use automatically for low-risk parallel work; suggest first for judgment calls.
- **Agent teams** (heavyweight, full coordination): multiple Claude Code instances with shared task list and peer-to-peer messaging. Best for multi-layer features (backend + frontend + tests) and competing-hypothesis debugging. Aim for 3–5 teammates with different file ownership. Teammates load CLAUDE.md automatically but do NOT inherit conversation history — include task-specific context in spawn prompts. Always clean up teams when done.

## Critical File Paths

### Project Documentation
- `CLAUDE.md` — project instructions (this file).
- `PROGRESS.md` — build progress tracker (update every session).
- `README.md` — feature overview, API docs, setup instructions.
- `SETUP.md` — detailed setup guide.
- `docs/data-model.md` — canonical reference for all 65 SQLAlchemy models (columns, FKs, constraints, indexes, relationships, lifecycle, decision-tag pointers). **Consult this file when:**
  - investigating schema before adding or altering a column
  - tracing cross-model relationships (who FKs to what, cascade behaviour)
  - debugging unique/check constraints or index choices
  - picking the right model family for a new feature
  - answering any "what does this model store" / "where does X live" question
  - looking up enum values or status vocabularies (`AUDIT_CATEGORIES`, BTC modes, scenario visibilities, scheduled-change states, external cost statuses, etc.)

  The compact family-grouped model index in CLAUDE.md (under **Data Model Overview**) is for orientation only — the authoritative detail is in `docs/data-model.md`. Reading the model index alone is not sufficient before making schema changes.

### Specs, Guides, QA
- `guides/` — active spec documents and session guides for current/upcoming work.
- `qa/` — `test-plan.md`, `bug-report.md`, `ai-report-builder-prompts.md`, `screenshots/`.

### Backend & Frontend
- Backend code: `backend/{models,routers,services,schemas,tests}/` — see directories. `backend/seed/seed.sql` and `backend/seed/fixtures/` for data.
- Frontend code: `frontend/src/{modules,components,contexts,hooks,lib,api,types}/` — see directories.
- Agent definitions: `.claude/agents/` — 13 sub-agent / teammate role definitions.

## Wave-Based Development
The active development cycle uses a wave-based approach — one wave per session, PR review gate between waves. The active spec lives in `guides/`; per-wave progress lives in `PROGRESS.md`.
- Workflow per wave: **orient → plan (with extended thinking) → implement → verify → update PROGRESS.md**. No code before the plan is complete.
- **No unsolicited refactoring.** If you spot a refactoring opportunity, note it in `PROGRESS.md` under "Refactoring opportunities". Do not refactor unless the session explicitly calls for it.
- **Agent team coordination:** Work splits across teammates wherever possible. The team merging second resolves conflicts.

## Commands
```bash
# First-time setup
cd backend && python3.12 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
cd frontend && npm install

# Daily start
cd backend && source .venv/bin/activate && python main.py  # http://localhost:8000, Swagger at /docs
cd frontend && npm run dev                                  # http://localhost:5173

# Unit tests
cd backend && python -m pytest tests/ -v

# Reset demo data (re-seeds database to clean state — use after testing destructive flows)
curl -X POST http://localhost:8000/api/admin/reset-demo
```

## Frontend Routes
| Route | Module |
|-------|--------|
| `/` | Launchpad |
| `/portfolio` | Portfolio Overview |
| `/portfolio/intake` | Intake Queue |
| `/portfolio/approvals` | CR approval queue |
| `/workbench` | Project Workbench |
| `/charging` | Charging & Allocations |
| `/capacity` | Capacity Management — workspace |
| `/capacity/requests` | Resource Requests inbox |
| `/capacity/history` | Capacity audit history (v5.2 W2+) |
| `/capacity/availability` | PL read-only availability view (v5.2 W2+) |
| `/simulator` | What-If Simulator |
| `/reporting` | Reporting |
| `/reporting/builder` | AI Report Builder |
| `/admin` | Administration |
| `/docs` | Documentation Hub |
