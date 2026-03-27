# AI Report Builder — Smoke Test Prompts

Run these prompts manually before a demo to verify the AI Report Builder is working correctly.
Test each prompt with at least 2 roles: **Controller** (full access) and **Project Lead** (scoped access).

## Prerequisites
1. Backend running with `ANTHROPIC_API_KEY` set (env var or Admin > Parameters > Integrations)
2. Database seeded with demo data
3. Frontend running

## Test Prompts

| # | Prompt | Expected Behavior |
|---|--------|-------------------|
| 1 | "Show me total forecast vs actuals by project" | Table with project names, forecast total, actuals total, variance. Bar chart comparing forecast vs actuals. KPIs for total forecast, total actuals, overall variance. |
| 2 | "Which vendors have the highest spend?" | Vendor ranking table with total amount, project count. Bar chart of top vendors by spend. KPIs for total vendor spend and vendor count. |
| 3 | "Compare internal vs external costs by cost center" | Cost center breakdown table with internal and external cost columns. Pie or stacked bar chart. KPIs for total internal vs external. |
| 4 | "Projects over budget in FY 2026" | Filtered table showing only projects where forecast > baseline, with variance column. Bar chart of variances. KPIs for count of over-budget projects and total overrun. |
| 5 | "Show me monthly spending trends for the last 6 months" | Monthly time series table (month, amount). Line chart showing spend over time. KPIs for average monthly spend. |
| 6 | "Resource allocation by person across projects" | Person-project allocation table with hours. Stacked bar or grouped bar chart. KPIs for total allocated hours, person count. |
| 7 | Follow-up: "Add a column for project status" | Updated table with an additional status column. Same chart, updated if relevant. |
| 8 | Follow-up: "Show this as a pie chart instead" | Same data, visualization changed from bar to pie chart. Table remains unchanged. |

## Verification Checklist

For each prompt, verify:
- [ ] Chat panel shows user message and assistant response
- [ ] If Claude asks clarifying questions, they are relevant
- [ ] Report appears in preview panel with at least one of: KPIs, table, chart
- [ ] Currency values are displayed with European formatting (€ symbol, dot thousands separator)
- [ ] Table columns are sortable (click headers)
- [ ] Charts render correctly (no blank areas, labels visible)
- [ ] Loading indicator shows during processing

## Role-Scoped Tests

| Role | Expected Scoping |
|------|-----------------|
| Controller | Sees all projects and data |
| Executive | Sees all projects and data |
| Project Lead | Sees only their assigned projects (currently: ERP 2.0, Cloud Migration 3.0) |
| CC Owner | Sees only projects with allocations from their cost center |

When testing as Project Lead, verify that prompt #1 returns fewer rows than when testing as Controller.

## Error Scenarios

| Scenario | How to Test | Expected |
|----------|-------------|----------|
| No API key | Remove key from Admin > Parameters, clear env var, restart backend | "Setup Required" card with link to Administration |
| Invalid API key | Set key to "invalid-key" in Admin > Parameters | Error message about invalid key in chat |
| Empty query result | Ask about something that doesn't exist: "Show me projects in the Healthcare division" | Claude explains no data was found and suggests alternatives |
