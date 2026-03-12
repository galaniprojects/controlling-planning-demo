# CRETA Demo App — Claude Code Project Instructions

## Project Overview
- **Name:** CRETA (Controlling, Reporting, Estimation, Tracking & Allocations) Demo App
- **Repo:** vision-demo-prototype (private)
- **Purpose:** Demo application for Knorr-Bremse IT financial planning transformation, replacing legacy CaPa tool
- **Type:** Demo with realistic mock data — not connected to any real database

## Tech Stack
- **Backend:** FastAPI (Python 3.12+), SQLAlchemy ORM, SQLite (embedded)
- **Frontend:** React (Vite), shadcn/ui (Radix UI + Tailwind CSS), Recharts, Inter font
- **Currency:** EUR (€), **Language:** English, **Demo Date:** February 2026

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

## Build Phases
1. **Phase A:** Foundation — Database schema + seed data ✅
2. **Phase B:** Backend API (90 endpoints across 8 groups) ✅
3. **Phase C:** Frontend Shell (routing, layout, role switcher) ✅
4. **Phase D:** Module UIs — split into 5 sessions:
   - **D1:** Portfolio Overview (7.2, 10.3) — tree, filters, charts, approvals ✅
   - **D2:** Project Workbench (7.3, 10.4) — master-detail, forecast wizard ← NEXT
   - **D3:** Capacity Management (7.4, 10.5) — heatmap, request management
   - **D4:** What-If Simulator (7.5, 10.6) — scenarios, AI Advisor
   - **D5:** Administration (7.6, 10.9) — CRUD tables, parameters
5. **Phase E:** Documentation content + polish

## D1 Established Components (reuse in D2–D5)
- `components/shared/ExpandableTreeTable` — generic recursive tree table → D2, D4
- `components/shared/FilterBar` — horizontal Select dropdowns with Clear → all modules
- `components/shared/Skeleton` — pulsing loading placeholder → all modules
- `components/shared/ModuleGuideButton` — fetches `/api/docs/modules/{id}` → all modules (IDs use underscores: `project_workbench`, `capacity_management`, `whatif_simulator`, `administration`)
- `components/charts/*` — Recharts wrappers (bar, line, donut) → D2, D4
- **Tab pattern:** Use controlled `value` + `useEffect` to reset on role change (NOT `defaultValue`)
- **Action pattern:** idle → mode → textarea → submit → result → `onActionComplete` callback
- shadcn components installed: button, card, badge, dropdown-menu, separator, tooltip, tabs, select, table, textarea

## Cross-Module Navigation Rule
- Wire inbound links during the module's own session
- Outbound links to unbuilt modules → navigate to route but show placeholder gracefully
- Retroactively connect outbound links when target module is built
- Final verification of all cross-module links in Phase E

## Session Protocol
1. **Start:** Always read `PROGRESS.md` first to understand current state
2. **Reference:** Read relevant sections of `CPC_Demo_App_Specification.md` for current phase
3. **Verify:** Run the app to confirm current state matches PROGRESS.md
4. **Work:** Continue from where the last session left off
5. **End:** Update `PROGRESS.md` with completed work, next steps, any deviations or issues

## Critical File Paths
- `CPC_Demo_App_Specification.md` — Single source of truth (read-only, do not modify)
- `Claude_Code_Handoff.md` — Build guide with phase details and architecture rules
- `PROGRESS.md` — Build progress tracker (update every session)
- `SETUP.md` — Setup guide for running the project (update when components change)
- `backend/seed/seed.sql` — All relational seed data
- `backend/seed/fixtures/` — JSON fixtures (manuals, FAQ, AI Advisor goals)
- `backend/models/` — SQLAlchemy ORM models
- `backend/routers/` — FastAPI route handlers

## Commands
```bash
# Backend
cd backend && python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python main.py  # Runs on http://localhost:8000, Swagger at /docs

# Frontend
cd frontend && npm install && npm run dev  # Runs on http://localhost:5173

# Reset demo data
curl -X POST http://localhost:8000/api/admin/reset-demo
```

## Git Discipline
- Commit after every meaningful milestone
- Descriptive messages: `"Phase X: description of what was done"`
- Do not squash — preserve build history

## v3 Implementation

### Specification Documents
- `CRETA_v3_Change_Specification.md` — authoritative spec for all v3 changes (supersedes v1 and v2 specs where conflicts exist)
- `CRETA_v3_Section9_Seed_Data.md` — authoritative spec for the complete seed data overhaul
- `Session_1_Guide.md` through `Session_6_Guide.md` — per-session implementation roadmaps

### Session Workflow
1. At the start of each session, read the session guide for the current session
2. Reference the two spec documents for design detail when the guide points to a spec section (e.g., "see §3.1")
3. At the end of each session, update `PROGRESS.md` with:
   - What was completed (list each item from the session guide)
   - Verification results (which checklist items pass/fail)
   - Issues found (anything that needs attention)
   - What the next session should start with
4. Commit `PROGRESS.md` and all changes

### Key Constraints
- Demo date: March 2026. All time-dependent logic (elapsed month tinting, actuals cutoffs, forecast boundaries, pending action triggers) uses this date.
- European number formatting: dot for thousands, comma for decimals (€14.400,00)
- No emojis anywhere in the UI — text and Lucide icons only
- Tech stack: FastAPI + SQLAlchemy (backend), React + Vite + shadcn/ui + Recharts (frontend), SQLite for demo
- The v1 and v2 specification documents are not part of the v3 workflow. Work from the codebase plus the v3 documents only.

### Git Discipline
- Create a new branch for each session with a descriptive name
- Commit after every meaningful milestone within a session
- Descriptive commit messages: `"v3 Session 1: collapsible year columns component"`, `"v3 Session 1: Launchpad redesign"`
- Update `PROGRESS.md` as the final commit of each session
