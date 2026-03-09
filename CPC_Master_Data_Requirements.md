# CRETA Demo App — Master Data Requirements

This document lists all master data entities required for the CRETA (Controlling, Reporting, Estimation, Tracking & Allocations) system to function. Master data = structural/reference data that must exist before the system can operate. Transactional data (change requests, forecasts, scenarios, audit logs, etc.) is excluded.

---

## Master Data Entities

| # | Entity | Key Fields | Demo Records | Required By Module(s) | Purpose |
|---|--------|-----------|:---:|----------------------|---------|
| 1 | **Lines of Business** | id, name, description, is_active | 3 | Portfolio Overview, What-If Simulator, Administration | Top-level grouping in the portfolio tree (LoB → Program → Project). Budget and RAG roll up to LoB level. |
| 2 | **Locations** | id, city, country, is_active | 3 | Capacity Management, Administration | Geographic dimension for cost centers. Used in org-wide heatmap pivot views. |
| 3 | **Competence Centers** | id, name, is_active | 3 | Capacity Management, Rate Tables, Administration | Skill-domain grouping (e.g. Application Development, Infrastructure & Cloud, Business Solutions). Determines which rate table row applies to a person. |
| 4 | **Cost Centers** | id, name, location_id (FK), competence_center_id (FK), is_active | 6 | Capacity Management, Portfolio Overview, Administration | The operational unit — intersection of a location and a competence center. CC Owners manage the people and resource requests for their cost center. |
| 5 | **Role Types** | id, name | 8 | Capacity Management, Rate Tables, Resource Requests, Administration | Job function categories (e.g. Senior Developer, Business Analyst, Project Manager). Determines hourly rate and allocation type. |
| 6 | **People** | id, name, role_type_id (FK), cost_center_id (FK), is_active | 29 | Capacity Management, Project Workbench, Approvals, all workflows | Individual resources. Each person is assigned to one cost center and one role type. Allocated to projects on a monthly-hours basis. Referenced as Project Lead, CC Owner, or Controller in workflows. |
| 7 | **Rate Tables** | role_type_id (FK), competence_center_id (FK), hourly_rate, effective_date, previous_rate, previous_effective_date | 12 | Project Workbench, Capacity Management, Administration | Hourly cost (EUR) per role per competence center. Converts allocated hours into budget figures for baselines, forecasts, and actuals. Supports rate history with previous rate/date tracking. |
| 8 | **Programs** | id, name, lob_id (FK), description | 2 | Portfolio Overview, Project Workbench | Optional grouping layer between LoB and Project. Projects roll up into programs for budget aggregation in the portfolio tree. |
| 9 | **Projects** | id, name, lob_id (FK), program_id (FK, nullable), status, rag_status, capex_opex, start_month, end_month, pl_person_id (FK), is_service, annual_budget, total_budget | 23 | All modules | The central entity. Referenced by every module: portfolio tree, workbench detail view, capacity demand source, scenario modelling target. Includes both CapEx projects (fixed timeline/budget) and OpEx services (ongoing, annual budget). |
| 10 | **External Cost Types** | id, name | 9 | Project Workbench, Capacity Management | Categorises non-labour spend: Consulting, Cloud Services, Travel, Subscriptions, Training, Leased Staff, Maintenance SW, Maintenance HW, Other. Used in forecast grids and variance analysis. |
| 11 | **Planning Parameters** | key, name, current_value, default_value, data_type, param_group | 6 | All modules (indirectly) | System-wide configuration: fiscal year start month, planning horizon (months), RAG amber/red thresholds (%), utilisation target (%), max scenarios per user. Drives RAG calculations and planning cycle logic. |
| 12 | **KPI Definitions** | name, description, formula, display_format, target_value, is_built_in | 7 | Launchpad, Portfolio Overview | Defines which metrics appear on dashboards: Total IT Budget, YTD Spend, Forecast at Completion, Portfolio Variance, CapEx/OpEx Split, Run/Change Ratio, Overall Utilisation. |
| 13 | **User Role Mapping** | person_id (FK), role (controller / cc_owner / project_lead / executive), default_module, managed_cost_center_id (FK, nullable), owned_project_ids | 4 | Role Switcher, all modules (authorisation) | Maps a person to a CRETA role archetype with their default landing module, managed scope (CC for owners, project list for PLs), and module access rights. In production this replaces the demo persona switcher with real IAM integration. |

---

## Totals

- **13 entity types**
- **~105 master data records** in the demo seed
- **Hierarchy:** Location → Cost Center ← Competence Center; LoB → Program → Project; Role Type → Rate Table ← Competence Center; Person → Cost Center + Role Type

---

## Notes

- All demo data is seeded via SQL (`backend/seed/seed.sql`, 6244 lines) and reset via `POST /api/admin/reset-demo`.
- Entities use soft-delete (`is_active` flag) rather than hard deletion to preserve referential integrity.
- Rate Tables track history (previous_rate + previous_effective_date) for retroactive cost calculations.
- Projects have two modes: **CapEx** (fixed start/end, total_budget) and **OpEx/Service** (ongoing, annual_budget, is_service=true).
- The User Role Mapping in the demo is implemented as "Demo Personas" with a dropdown switcher. In production this would come from an IAM/SSO system but the same data points (role, default module, managed scope) are needed.
