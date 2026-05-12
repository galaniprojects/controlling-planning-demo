# Define-page redesign — tabs-builder coordination notes

Drop file for teammates (shell-builder, sweep-builder, backend-dev,
team-lead). tabs-builder owns the Tech Navigator + Financials tabs and
the Workbench Phase 3 → shared-grid refactor.

## Status — Task #3 complete

Four atomic commits on `feature/define-page-redesign`:

1. `75b2fe3` — Add `MonthCategoryGrid` shared primitive
   (`frontend/src/components/shared/MonthCategoryGrid.tsx`).
2. `866e76f` — Refactor Workbench Phase 3 forecast grid onto
   `MonthCategoryGrid` (identical user-visible behaviour;
   forecast-cycle persistence + quarterly distribution still owned
   by `Phase3EditForecast.tsx`).
3. `6cf9122` — Gut autosave from legacy `TechNavigatorRubric.tsx`
   (debounced PUT removed; component still renders, edits are
   local-only and vanish on reload).
4. `41516df` — Add `TechNavigatorTab.tsx` + `FinancialsTab.tsx`.

## Shared primitive — `MonthCategoryGrid`

Import:
```ts
import {
  MonthCategoryGrid,
  type MonthCategoryGridRow,
  type MonthCategoryGridColumn,
  type MonthCategoryGridCellState,
} from '@/components/shared/MonthCategoryGrid';
```

Contract: pure presentational. Consumer owns data + persistence.

```ts
<MonthCategoryGrid
  rows={rows}              // MonthCategoryGridRow[]: {category, sub_category, sub_category_name, capex_opex?, hourly_rate?}
  columns={columns}        // MonthCategoryGridColumn[]: {key:'YYYY-MM'|'YYYY-QN', cell_type:'monthly'|'quarterly'}
  getCellState={(row, col) => ({ displayValue, isChanged?, isSuggested?, isProvisional?, canEdit, isEmpty? })}
  onCellChange={(row, col, newValue) => /* persist however you like */}
  groups={[{key:'internal', label:'Internal Resources (Hours)'}, ...]}
  quarterExpansion={{ expanded: Set<string>, onToggle: (key) => void }}
  readOnly={false}
/>
```

Conventions:
- `category === 'internal'` cells display in hours with EUR derived
  sub-line; everything else displays in EUR.
- Quarterly cell edits emit `onCellChange` with the quarterly key —
  the consumer is responsible for fanning out into monthly writes
  (Workbench Phase 3 does this via `distributeQuarterly`).
- Year boundary, monthly→quarterly blue divider, provisional-dot
  marker are all rendered by the primitive.

## Tabs wired into `DefineProjectPage`

I wired `TechNavigatorTab` and `FinancialsTab` into the
`techNavigator` / `financials` slots of `DefineShell`, replacing the
`TabPlaceholder` stubs. The diff is small (~50 lines) and lives in
shell-builder's `DefineProjectPage.tsx` working-copy edit (which is
still untracked at the time of writing — it'll be picked up in
shell-builder's commit pass).

Shell-builder: when you commit `DefineProjectPage.tsx`, please keep
the `TechNavigatorTab` + `FinancialsTab` wiring (see the
`techNavigator={...}` and `financials={...}` slot bodies). Both tabs
take `projectId`, `readOnly`, and `onDirtyChange`; `FinancialsTab`
additionally takes `project: ProjectDefineResponse` and an optional
`onProjectUpdated` so sibling tabs refresh after a Financials Save.

## `defineApi.updateFinancials` and `defineApi.get`

I extended `frontend/src/modules/define/api.ts` (your file) with two
methods:

```ts
defineApi.get(projectId)
  → GET /api/projects/{id}/define → ProjectDefineResponse
defineApi.updateFinancials(projectId, body)
  → PUT /api/projects/{id}/baseline-grid → ProjectFinancialsSaveResponse
```

You then normalised the whole file to use canonical types from
`@/types/define`; that change is compatible — my Financials method is
still there using the canonical `ProjectFinancialsUpdate` /
`ProjectFinancialsSaveResponse` shapes.

## Verification

- `npx tsc --noEmit` clean.
- `npx eslint` clean on every file I touched.
- Backend regression: `pytest tests/test_router_projects_define.py
  tests/test_router_tech_navigator.py` → 65 passed.
- Backend forecast regression: `pytest -k forecast` → 176 passed.
- Vite dev server HMR clean on every commit; the page renders without
  errors at `/define/{id}?tab=tech_navigator` and
  `/define/{id}?tab=financials`.
- Backend round-trips verified via curl:
  - `GET /api/projects/{id}/define` → `ProjectDefineResponse`.
  - `GET /api/projects/{id}/tech-navigator` → profile + weights.
  - `GET /api/projects/{id}/forecast` → ForecastGridRow list (used by
    FinancialsTab pivot).
  - `PUT /api/projects/{id}/baseline-grid` → ProjectFinancialsSaveResponse.

## Visual verification — gap

CLAUDE.md asks for 1440 px screenshots in `qa/screenshots/`. I do not
have Playwright / Chrome DevTools MCP available in this session, and
no system Chrome binary is installed. The Vite dev server compiles
cleanly and the routes return 200, but I could not capture screenshots
programmatically. Shell-builder or team-lead may want to run the
visual verification pass when the foundation files (`useDirtyBuffer`,
`types/define.ts`, `api.ts`) land — at that point the page renders
end-to-end and the screenshots are straightforward.

## Open items / handoffs

- **Backend GET for baseline rows:** backend-dev only exposed the
  baseline grid as part of the PUT response. For initial load I pivot
  the existing `workbenchApi.getForecast` payload (which already
  carries `baseline_hours` / `baseline_amount` per cell) into the
  `BaselineGridRow` shape. A dedicated `GET
  /api/projects/{id}/baseline-grid` would be cleaner — non-blocking
  follow-up if backend-dev has time.

- **Tests for the new tabs:** No frontend tests for
  `TechNavigatorTab` / `FinancialsTab` yet. The existing backend
  router tests cover the endpoint side; frontend snapshot/RTL tests
  for the two tabs would be a natural follow-up but were not in scope
  for this session.

- **Workbench Phase 3 working-changes lock-in:** the Workbench's
  surrounding "save the cycle" semantics are unchanged. Sweep-builder
  may still convert other autosaving Workbench surfaces (External
  Costs, Cost Allocation, etc.) — Phase 3 itself never autosaved;
  edits buffer until "Review Changes".
