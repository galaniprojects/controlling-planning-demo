# CPC Demo App — Claude Code Project Instructions

## Project Overview
- **Name:** CPC (Controlling & Planning Centre) Demo App
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
1. **Phase A:** Foundation — Database schema + seed data
2. **Phase B:** Backend API (89 endpoints across 8 groups)
3. **Phase C:** Frontend Shell (routing, layout, role switcher)
4. **Phase D:** Module UIs (Portfolio, Workbench, Capacity, Simulator, Admin)
5. **Phase E:** Documentation content + polish

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

# Frontend (when built)
cd frontend && npm install && npm run dev  # Runs on http://localhost:5173

# Reset demo data
curl -X POST http://localhost:8000/api/admin/reset-demo
```

## Git Discipline
- Commit after every meaningful milestone
- Descriptive messages: `"Phase X: description of what was done"`
- Do not squash — preserve build history
