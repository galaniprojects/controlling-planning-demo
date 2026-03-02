# CPC Demo — Build Progress

## Current Status
Phase: A (complete)
Last completed: Phase A — Database schema + seed data
Next up: Phase B — Backend API (89 endpoints)

## Completed
- [x] Repository initialized with spec documents, .gitignore, CLAUDE.md, SETUP.md
- [x] Phase A: Database schema + seed data
  - 27 SQLAlchemy ORM models across 9 files
  - 6244-line seed.sql with full demo dataset
  - JSON fixtures: 6 module manuals, 12 FAQ entries, 4 AI Advisor goals
  - Seed loader with auto-seed on startup
  - POST /api/admin/reset-demo endpoint
- [ ] Phase B: Backend API
- [ ] Phase C: Frontend shell
- [ ] Phase D: Module UIs
- [ ] Phase E: Documentation content + polish

## Phase A Details

### Database Tables (27)
| File | Tables |
|------|--------|
| organization.py | LineOfBusiness, Location, CompetenceCenter, CostCenter |
| people.py | RoleType, Person, RateTable |
| projects.py | Program, Project |
| financial.py | ExternalCostType, Baseline, Forecast, Actuals |
| capacity.py | Allocation, ResourceRequest |
| change_requests.py | ChangeRequest, CRChangeDetail |
| scenarios.py | Scenario, ScenarioAction, ScenarioState, ScenarioCapacityImpact |
| system.py | PlanningParameter, KPIDefinition, Notification, AuditLog, SystemSuggestion |
| users.py | DemoPersona |

### Seed Data Counts
- 3 LoBs, 3 locations, 3 competence centers, 6 cost centers
- 8 role types, 12 rate table entries, 9 external cost types
- 32 people across 6 cost centers + 2 portfolio-level
- 2 programs, 15 projects + 8 services = 23 entities
- 4 demo personas, 6 planning parameters, 7 KPI definitions
- 25 change requests, 63 CR change details, 5 resource requests
- 3 scenarios, 10 actions, 21 states, 22 capacity impacts
- 10 notifications, 4 system suggestions, 5 audit log entries
- 1510 baseline rows, 1510 forecast rows, 928 actuals rows, 1364 allocations

### Key Demo Data Patterns
- Lena Fischer: 105% over-allocated in Mar-May 2026 (proj-erp2 + proj-sap)
- Markus Wolf: ~48% under-utilized after proj-brake ends (Apr 2026+)
- ERP Phase 2: Red RAG (budget overrun), 10 CRs showing full lifecycle
- Sensor Data Pipeline: Amber RAG (consulting cost overrun)
- CR statuses: 16 approved, 3 pending CC, 3 pending controller, 1 rejected, 2 sent back

## Deviations from Spec
- Repository named `vision-demo-prototype` instead of `cpc-demo` (user preference)

## Known Issues
- None
