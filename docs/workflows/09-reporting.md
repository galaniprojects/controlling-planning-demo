# 09 — Reporting

The Reporting module is the cross-cutting analytical surface: 5 standard reports + Report Builder + AI Report Builder, with role-scoped data access (controllers and executives see all; CC owners see their CC; PLs see their projects). Routes:

| Route | Surface |
|---|---|
| `/reporting` | Report Library (cards) |
| `/reporting/builder` | Drag-drop OLAP-style Report Builder |
| `/reporting/{report-id}` | Standard report viewer (e.g. `programme-rollup`, `vendor-spend`, `forecast-accuracy`, `cc-financial-summary`, `year-over-year`) |
| `/reporting/builder?reportId={id}` | Loads a saved custom Report Builder report |
| Click `AI Report Builder` card → `/reporting/builder` (the AI builder ID `ai-builder` routes there in v5) |

---

## W09.1: Run a standard report with filters

**Purpose**: Open one of the 5 pre-built analytical views, apply filters, and read the resulting KPIs / chart / table.
**When to use**: Demoing the standard analytical surface; giving a controller / exec a fast read.
**Personas involved**: All roles (data scoped to role).
**Pre-conditions**: Reporting module accessible (all roles).
**Estimated walk-time**: 3 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Any | Navigate to `/reporting` | ModuleHeader "Reporting"; ReportLibrary loads | Section heading "Standard Reports" with 6 cards (5 standard + AI Report Builder accent card) |
| 2 | Any | Click the **Programme / Multi-Project Rollup** card | Navigates to `/reporting/programme-rollup` | Report viewer loads with filter bar at top, KPI summary row, and main content area below |
| 3 | Any | Use the filter bar — e.g. select a fiscal year, an LoB, a RAG band | Filters apply on change; KPI strip + content area refresh | Filter chip count visible; data shrinks accordingly |
| 4 | Any | Toggle the view between **Chart** and **Table** | Same data, alternative rendering | Chart shows stacked bars / lines per the report's chart config; table is sortable per column |
| 5 | Any | Click **Customize** to show/hide columns, change grouping dimension, adjust sort order, change visualisation type | Customisation panel opens (or dialog depending on report) | Changes apply immediately to current view; not persisted unless saved as a view |
| 6 | Any | Click **Save View** | Dialog asks for view name | After save, the view appears under "My Saved Views" in the Report Library |

### Alternative paths

- **Different report**: Step 2 alternatives — Cost Center Financial Summary (per-CC analysis), Forecast Accuracy (retrospective forecast quality), Year-over-Year Comparison (spending trajectory). All follow the same filter-bar / KPI / chart-or-table shell.
- **PL data scoping**: A PL viewing Programme Rollup sees only their assigned projects. Switching to Controller persona shows the full portfolio.

### Post-conditions

A `SavedView` row may be created if Step 6 was taken. Otherwise no DB writes.

### Cross-references

- **Decision tags**: `[E-08]`
- **Backend endpoints**:
  - `routers/reports.py::get_report_data` (GET `/api/reports/{report_id}/data`)
  - `routers/reports.py::list_saved_views`, `create_saved_view`, `update_saved_view`, `delete_saved_view`
- **In-app manual**: `reporting.json § Standard Reports`
- **FAQ overlap**: faq-15 for Report Builder (different surface), faq-22 for export

---

## W09.2: Vendor Spend report with drill-down

**Purpose**: The vendor-spend report is the seed for drill-through analysis: from a vendor row, drill into the projects that consume that vendor's services.
**When to use**: External-spend audit; understanding a single vendor's footprint across projects.
**Personas involved**: Controller / Executive primarily; CC Owner sees vendors touching their CC; PL sees vendors touching their projects.
**Pre-conditions**: External-cost vendors seeded with consumption rows.
**Estimated walk-time**: 4 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Any | From `/reporting` click **Vendor Spend Analysis** card | Navigates to `/reporting/vendor-spend` | Report viewer loads with filter bar (Year / Cost Type / Vendor) + Top Vendors chart heading "Top Vendors by Spend" |
| 2 | Any | Pick year 2026, cost type "All", click **Apply** (filters auto-apply) | Chart refreshes; table renders with rows = vendors, columns = year totals + procurement-status indicators | KPI strip: Total spend, Vendor count, Top vendor share |
| 3 | Any | Click a vendor row in the table | Drill-down opens (either inline expansion or detail drawer per the seed config) showing the projects consuming that vendor | Each project row shows the share of the vendor's total spend |
| 4 | Any | Click a project row in the drill-down | Navigates to `/workbench?project=<id>` Forecast tab so the user can inspect the line items | URL changes; Workbench loads |

### Post-conditions

No DB write — read-only. Navigation event tracked via the standard analytics path.

### Cross-references

- **Backend endpoint**: `routers/reports.py::get_report_data` for `vendor-spend`; drill-down via `routers/reports.py::get_vendor_drilldown` (GET `/api/reports/vendor-spend/{vendor_id}/projects`)
- **In-app manual**: `reporting.json § Standard Reports`

---

## W09.3: Build a custom report (drag-drop)

**Purpose**: Compose an OLAP-style cross-tabulation by selecting dimensions and measures from the data catalog, with optional calculated measures and conditional formatting.
**When to use**: Ad-hoc analysis question that doesn't map to a standard report.
**Personas involved**: All roles (data scoped to role).
**Pre-conditions**: Reporting module accessible.
**Estimated walk-time**: 6 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Any | Navigate to `/reporting` and click **Report Builder** tile (under "Build Your Own") | Navigates to `/reporting/builder` | Three-pane layout: Data Catalog (left) + Drop Zones (Rows / Columns / Filters / Values) + Results area |
| 2 | Any | In the Data Catalog, click a dimension (e.g. **Project**) → it appears in **Rows** | Rows zone gains a chip with the dimension label and an X to remove | Catalog item gets a "in use" indicator |
| 3 | Any | Click another dimension (e.g. **Fiscal Month**) → drag or click into **Columns** | Columns zone gains a chip | Cross-tab grid is now possible |
| 4 | Any | Click a measure (e.g. **Forecast €**) → drops into **Values** | Values zone gains the measure with a sum aggregation by default | Run Report button enables once at least one measure is in Values |
| 5 | Any | Drop a dimension into **Filters** (e.g. **RAG status**), pick filter values from the dropdown (e.g. "Red", "Amber") | Filters zone shows the dimension with selected values listed | Filter shrinks the result set |
| 6 | Any | Click **Run Report** | Results render: cross-tab table with row labels on the left, column headers (months) across the top, measure values in cells, with subtotals + grand totals | Toast / status: "X rows × Y columns" |
| 7 | Any | Click the **fx Calculated** button in the toolbar | Calculated Measures dialog opens | Dialog has Name, Operand A, Operator (+, −, ×, /), Operand B, Display format selector, live preview |
| 8 | Any | Build "Variance % = (Forecast − Baseline) / Baseline" — name "Variance %", Operand A "Variance €" (if pre-existing) or compose two-step, choose `÷`, Operand B "Baseline €", format "Percent" → Save | Calc measure appears in Values with **fx** badge | Cell values show as `12.4%` etc; division by zero displays a dash |
| 9 | Any | Click the **Conditional Formatting** icon in the toolbar | Sheet slides in from the side | Define rules per measure: e.g. RAG-style traffic-light on Variance %, or a single-colour gradient on Forecast € |
| 10 | Any | Apply RAG preset on Variance % → green ≤5%, amber 5-10%, red >10%; close sheet | Cells colour-shaded inline | Formatting applies to the just-calculated measure |
| 11 | Any | Toggle the view: Table → Bar / Line / Pie via the view toggle | Charts render per the dimension/measure config | Bar groups by first row dim; Line requires a time dim on columns; Pie shows first row dim segments |

### Post-conditions

No DB write yet — composition is in-memory until **Save Report** (W09.4). If the user navigates away, the composition is lost.

### Cross-references

- **Decision tags**: `[E-08c]` (Report Builder)
- **Backend endpoints**:
  - `routers/report_builder.py::execute_query` (POST `/api/report-builder/query`)
  - `routers/report_builder.py::list_catalog` (GET `/api/report-builder/catalog`)
- **In-app manual**: `reporting.json § Report Builder (Build Your Own)`, `§ Calculated Measures`, `§ Chart Views`
- **FAQ overlap**: faq-15, faq-16, faq-17

---

## W09.4: Save a report view + share

**Purpose**: Persist a Report Builder composition with name + description + tags, optionally share it with specific users (View / Edit) or publish to the Report Library.
**When to use**: A report that should survive page reloads or be reusable across sessions.
**Personas involved**: All roles.
**Pre-conditions**: Composition is built and has run successfully.
**Estimated walk-time**: 3 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Any | From the Report Builder with a working report, click **Save Report** in the toolbar | First save: dialog asks for **Name** and **Description** | Save button stays disabled until Name is non-empty |
| 2 | Any | Fill name "Forecast vs Baseline by Project" + description; click **Save** | Dialog closes; toolbar now shows the saved name; subsequent saves overwrite silently | Saved report appears under **My Saved Views** in `/reporting` ReportLibrary with a **Custom** badge |
| 3 | Any | Click **Save As** (dropdown next to Save) to create a copy with a new name | New row in My Saved Views | Original report unchanged |
| 4 | Any | Click the **Share** button in the toolbar (only available on saved reports) | Share dialog opens | Dialog lets you pick recipients + permission level **View only** or **Can edit**, plus a **Publish to Report Library** toggle |
| 5 | Any | Pick 1-2 users, choose **Can edit**, optionally toggle Publish, click **Share** | Share confirmation; recipient sees the report under "Shared with Me" / "Shared Reports" in their Library | Permission badge visible in the Library card |

### Post-conditions

- New `SavedReport` row (or update on existing).
- `SavedReportShare` rows for each recipient with `permission` (view / edit) and optional `published_at` timestamp.
- The Library refetch picks up the new row on next mount.

### Cross-references

- **Backend endpoints**:
  - `routers/report_builder.py::save_report` / `update_report`
  - `routers/report_builder.py::share_report` / `unshare_report`
  - `routers/report_builder.py::list_saved` / `list_shared`
- **In-app manual**: `reporting.json § Saving & Loading Reports`, `§ Sharing & Publishing Reports`
- **FAQ overlap**: faq-18

---

## W09.5: Export to CSV / Excel

**Purpose**: Download the current report (standard or custom) as a CSV file for offline analysis.
**When to use**: Sharing with stakeholders outside the demo, or pasting into a deck.
**Personas involved**: All roles.
**Pre-conditions**: A report is rendered.
**Estimated walk-time**: 1 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Any | From any standard report viewer or the Report Builder, click **Export** | Browser downloads a CSV file | Filename pattern: `<App>_<ReportName>_<YYYY-MM-DD>.csv` |
| 2 | Any | Open the file | First rows are metadata comments (report name, export date, user, active filters), then column headers, then data rows with subtotals + grand totals | UTF-8 BOM included for Excel compatibility |

### Post-conditions

No DB write. File downloaded to the user's machine.

### Cross-references

- **Backend endpoints**:
  - `routers/reports.py::export_report` (GET `/api/reports/{report_id}/export?format=csv`)
  - `routers/report_builder.py::export_report` (POST `/api/report-builder/export`)
- **In-app manual**: `reporting.json § Exporting Data`, `§ Report Builder Export`
- **FAQ overlap**: faq-22

### Known issues / caveats

- Cross-tabulated reports flatten to columns named `<DimensionValue> - <MeasureName>` (e.g. "Q1 2026 - Forecast"). Excel may auto-detect numeric columns but locale-dependent decimal/thousands separators (German `.` for thousands, `,` for decimals per CPC's European convention) sometimes confuse Excel — a follow-on fix is to ship a German-locale variant.

---

## W09.6: AI Report Builder natural-language query

**Purpose**: Chat with Claude to build a custom report from a natural-language description; the AI queries the database, generates tables / charts / KPI cards, and lets you iteratively refine.
**When to use**: When you don't know the exact dimensions and measures, or want a conversational walk into the data.
**Personas involved**: All roles.
**Pre-conditions**: An Anthropic API key configured at **Administration → Planning Parameters → Integrations** (without it, the setup card is shown instead of the chat).
**Estimated walk-time**: 6 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Any | From `/reporting` click the **AI Report Builder** tile (with sparkles icon, accent border) | Navigates to the AI Builder | If API key not set: shows a setup card "The AI Report Builder requires an Anthropic API key to function. Go to Administration and set your API key in Planning Parameters under the Integrations section." |
| 2 | Any | (If setup needed) navigate to `/admin?section=parameters` → Integrations group → enter Anthropic API key → save | Key saved as a masked secret parameter | Eye icon to toggle visibility |
| 3 | Any | Return to `/reporting/ai-builder` (or click the tile) | Two-pane layout: ChatPanel left + ReportPreview right | ChatPanel placeholder "Describe the report you want…" |
| 4 | Any | Type a query — e.g. **"Run Portfolio cost by region for 2026"** — and submit | The AI may ask 1-2 clarifying questions; once enough context, it queries the DB and generates a report | Preview shows KPI cards + bar/line/pie chart + sortable data table |
| 5 | Any | Send a follow-up — e.g. "filter to top 5 regions" or "add a column for division" | Updated report appears in preview | Each iteration is a new turn; chat history shows the trace |
| 6 | Any | Try a v5-flavoured query — e.g. **"Top 5 charging locations by BTC volume in 2026"** or **"Compare Change Portfolio vs Run Portfolio cost by hierarchy node"** | Report generated using Cluster F dimensions / measures | Catalogue includes BTC / Distribution measures; see [W07 Reporting bridge](./07-charging.md#cross-workflow-notes) for the catalog |

### Alternative paths

- **Cluster F prompt jump**: From `/charging?section=reports`, click any of the 3 quick-prompt buttons (Cost by division / Top inflow drivers / Regional YoY) to land here with a pre-filled prompt.
- **No API key**: Step 1's setup card is the only state available until the key is set. The chat is fully disabled.
- **Out-of-scope query**: Prompts the AI can't answer (e.g. "make me coffee") return a friendly clarification asking what data they should look at.

### Post-conditions

No DB write to canonical state. The AI builder may persist the conversation transcript via `routers/ai_reports.py::create_session` for re-open.

### Cross-references

- **Decision tags**: `[E-08d]` (AI Report Builder), `[F-RV-01]` (Cluster F bridge)
- **Backend endpoints**:
  - `routers/ai_reports.py::send_message` (POST `/api/reports/ai-builder/messages`)
  - `routers/ai_reports.py::create_session`, `get_session`
- **In-app manual**: `ai_report_builder.json § Creating a Report`
- **FAQ overlap**: faq-14

### Known issues / caveats

- Prompts that map to extremely large result sets (>10k rows) are truncated; the AI surfaces a "result trimmed" caveat.
- The AI builder uses Claude Sonnet by default; controllers can swap the model in `Integrations` Planning Parameters.
- v5 measures **BTC Allocation** and **Distribution Volume** are accessible via the AI builder's catalog but the standard Report Builder doesn't yet have a Cluster F data source — see the open note in `[F-RV-04]`.

---

## Cross-workflow notes

- **Saved views vs custom reports**: `SavedView` (filter+customisation snapshot of a standard report) and `SavedReport` (full Report Builder composition) are two different stores under "My Saved Views". The **Custom** badge differentiates Report Builder reports.
- **Cluster F bridge**: The Charging module's `?section=reports` panel is a discoverability shortcut into `/reporting/builder?prompt=…` — see [W07.1](./07-charging.md#w071-view-stage-1-distribution-graph) and the [Cluster F note in 07-charging](./07-charging.md#cross-workflow-notes).
- **Role data scoping**: every report endpoint applies role-based filtering server-side. PL sees their projects, CC Owner sees their CC, controller / executive see all. The data scoping is invisible to the UI — the same query returns different rows per role.

## Related FAQ entries

- faq-14 "How do I use the AI Report Builder?"
- faq-15 "How do I build a custom report?"
- faq-16 "What is the difference between rows and columns in Report Builder?"
- faq-17 "How do I create a calculated measure?"
- faq-18 "How do I share a report with my team?"
- faq-19 "Why does my Report Builder report show no data?"
- faq-22 "How do I export a Report Builder report to CSV?"
