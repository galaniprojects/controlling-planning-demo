# CRETA Report Builder — Feature Specification

This document specifies the Report Builder feature for CRETA. It is self-contained — all information needed for implementation is included here. No cross-reference to prior specification versions is required.

**Context:** CRETA's Reporting module currently contains six pre-configured standard reports (Programme Rollup, CC Financial Summary, Vendor Spend, Forecast Accuracy, Year-over-Year, Variance Narrative) plus a section for user-saved views. The Report Builder is a new, separate feature that gives users the ability to compose entirely custom reports from scratch by selecting data entities and arranging them into a cross-tabulation layout.

**Inspiration:** The design follows the OLAP-style report builder pattern used by tools like MicroStrategy — a semantic layer exposes business-friendly dimensions and measures, users drag them into rows/columns/filters/values zones, and the system generates the query dynamically. Users never see SQL; they work with named business objects.

**Important instruction for Claude Code:** Before writing any code, read this entire document and produce a plan using extended thinking. Plan first, then implement.

---

## 1. Module Placement & Navigation

### 1.1 Launchpad Tile

The Report Builder appears as a **7th tile** in the Reporting module's Report Library landing view. It is visually separated from the six standard report tiles — positioned below them with a subtle horizontal divider or increased vertical spacing to signal that it is a different kind of tool.

**Tile content:**
- **Title:** "Report Builder"
- **Icon:** A grid/table icon with a "+" or pencil overlay (distinct from the standard report icons)
- **Description:** "Build custom reports by selecting dimensions and measures"
- **Visual treatment:** Same card size as the standard report tiles, but with a slightly different accent (e.g., a coloured left border or subtle background tint) to distinguish it as a tool rather than a pre-built report

### 1.2 Breadcrumb

When the Report Builder is open: `CRETA > Reporting > Report Builder`

When viewing a saved custom report: `CRETA > Reporting > Report Builder > [Report Name]`

### 1.3 Saved Reports in Report Library

User-saved custom reports appear in the existing "My Saved Views" section of the Report Library, alongside saved views of standard reports. Custom reports should be visually distinguishable — show a small "Custom" badge or the Report Builder icon next to the report name so users can tell them apart from saved standard report views.

---

## 2. Data Catalog

The data catalog is the semantic layer that exposes CRETA's data model as business-friendly objects. It is divided into **Dimensions** (categorical/grouping fields) and **Measures** (numeric/aggregatable fields).

### 2.1 Dimensions

Each dimension has: a display name, a category (for grouping in the UI), a data type, and — where applicable — a hierarchical relationship to other dimensions.

| # | Display Name | Category | Data Type | Hierarchy | Notes |
|---|---|---|---|---|---|
| D01 | **Project / Service** | Planning Object | Text | Rolls up to LoB | The core planning entity |
| D02 | **Project Type** | Planning Object | Text (enum) | — | Project vs Service; sub-types within Service (IT Offering, IT Lifecycle, IT Basic Services) |
| D03 | **Project Status** | Planning Object | Text (enum) | — | Active, On Hold, Completed, Pending Approval, etc. |
| D04 | **RAG Status** | Planning Object | Text (enum) | — | Green / Amber / Red |
| D05 | **Line of Business (LoB)** | Organisation | Text | Top of drill-down hierarchy | Primary portfolio segmentation |
| D06 | **Cost Center** | Organisation | Text | Groups under Competence Center | Organisational unit providing resources |
| D07 | **Competence Center** | Organisation | Text | Groups Cost Centers | Functional grouping of cost centers |
| D08 | **Location** | Organisation | Text | — | MUC, BUD, PUN, etc. |
| D09 | **Role** | Resource | Text | — | Senior Developer, Consultant, etc. |
| D10 | **Person** | Resource | Text | Belongs to Cost Center | Individual employee |
| D11 | **Vendor** | External Cost | Text | — | Supplier name |
| D12 | **External Cost Category** | External Cost | Text | — | Consulting, Licences, Hardware, etc. |
| D13 | **External Cost Status** | External Cost | Text (enum) | — | Planned, Ordered/Obligo, Invoiced, Accrual, etc. |
| D14 | **CapEx / OpEx** | Financial | Text (enum) | — | Per line item classification |
| D15 | **Change / Run** | Financial | Text (derived) | — | Projects = Change; Services = Run |
| D16 | **Fiscal Year** | Time | Year | Contains Quarters / Months | e.g., 2025, 2026 |
| D17 | **Quarter** | Time | Quarter | Contains Months | e.g., Q1 2026 |
| D18 | **Month** | Time | Month | Leaf of time hierarchy | e.g., Jan 2026 |

**Hierarchy note:** Time dimensions (D16–D18) form a strict hierarchy: Year > Quarter > Month. When a user places "Fiscal Year" on rows and "Month" on columns, the system should not double-aggregate — it should show months nested within the selected year scope. The query engine must handle this correctly.

### 2.2 Measures

Each measure has: a display name, a category, a default aggregation rule, a data type, and a format specification.

| # | Display Name | Category | Aggregation | Format | Notes |
|---|---|---|---|---|---|
| M01 | **Baseline Budget (€)** | Financial | SUM | €#.### | Original approved plan |
| M02 | **Current Forecast (€)** | Financial | SUM | €#.### | Living plan, latest expectations |
| M03 | **Actuals (€)** | Financial | SUM | €#.### | Recorded costs from SAP |
| M04 | **Variance: Forecast vs Baseline (€)** | Financial | SUM | €#.### (signed) | M02 − M01; positive = overrun |
| M05 | **Variance: Forecast vs Baseline (%)** | Financial | Weighted | #,##% | (M02 − M01) / M01 × 100 |
| M06 | **Variance: Actuals vs Forecast (€)** | Financial | SUM | €#.### (signed) | M03 − M02 (elapsed periods only) |
| M07 | **Remaining Forecast (€)** | Financial | SUM | €#.### | M02 − M03 (future periods) |
| M08 | **Internal Cost (€)** | Cost Breakdown | SUM | €#.### | Hours × hourly rate |
| M09 | **External Cost (€)** | Cost Breakdown | SUM | €#.### | Vendor / procurement costs |
| M10 | **Obligo / Committed (€)** | Cost Breakdown | SUM | €#.### | Open PO amounts |
| M11 | **Planned Hours** | Capacity | SUM | #.### h | Forecast resource hours |
| M12 | **Actual Hours** | Capacity | SUM | #.### h | CATS hours booked |
| M13 | **Available Hours** | Capacity | SUM | #.### h | Total capacity from HR/config |
| M14 | **Utilisation (%)** | Capacity | Weighted | #,##% | Allocated ÷ Available × 100 |
| M15 | **Project Count** | Portfolio | COUNT | # | Number of distinct projects |
| M16 | **Headcount** | Portfolio | COUNT DISTINCT | # | Number of distinct persons |

**Format note:** All euro amounts follow CRETA's European formatting standard: dot as thousands separator, comma as decimal separator, € symbol prefix. Display two decimal places in detail views; no decimals in summary/KPI contexts.

### 2.3 Dimension–Measure Compatibility

Not every measure makes sense with every dimension. The query engine should enforce compatibility:

- **Capacity measures** (M11–M14, M16) are only meaningful when at least one of: Cost Center, Competence Center, Location, Role, or Person is present as a dimension.
- **External cost measures** (M09, M10) can be broken down by Vendor and External Cost Category. They are not meaningful when broken down by Role or Person (external costs are not person-based).
- **Obligo** (M10) requires External Cost Status to be meaningful in a detailed breakdown.
- **Utilisation** (M14) requires a capacity-related dimension; it cannot be calculated at the Project level alone.

The UI should not prevent users from making these combinations, but should show a warning tooltip when an incompatible combination is detected (e.g., "Utilisation % is not meaningful without a resource or cost center dimension").

---

## 3. Report Composer UI

### 3.1 Layout

The Report Composer is a full-page view with three main areas:

**Left Panel — Data Catalog (≈250px wide, fixed):**
- Search bar at top (filters the catalog as user types)
- Two collapsible sections: "Dimensions" and "Measures"
- Within each section, items are grouped by their category (Organisation, Time, Financial, etc.) with collapsible sub-headers
- Each item shows: an icon indicating type (dimension = cube icon, measure = Σ icon), the display name, and a drag handle
- Items are draggable from this panel into the drop zones

**Top Area — Drop Zones (full width, above the results):**

Four clearly labelled drop zones arranged as follows:

```
┌─────────────────────────────────────────────────────┐
│  Filters: [ Fiscal Year: 2026 ▼ ] [ LoB: All ▼ ]   │
├──────────────┬──────────────────────────────────────┤
│  Rows:       │  Columns:                            │
│  [LoB      ] │  [Month                            ] │
│  [Project  ] │                                      │
├──────────────┼──────────────────────────────────────┤
│              │  Values:                              │
│              │  [Budget €] [Actuals €] [Variance €]  │
└──────────────┴──────────────────────────────────────┘
```

- **Filters zone:** Horizontal bar at the top. Dropped dimensions appear as filter chips with dropdown selectors for their values. Multiple filters supported.
- **Rows zone:** Vertical area on the left. Dropped dimensions define the row grouping. Multiple dimensions create nested grouping (first = outermost). Drag to reorder.
- **Columns zone:** Horizontal area. Dropped dimensions define column headers. Typically time dimensions go here. Multiple dimensions create nested column headers.
- **Values zone:** Where measures are dropped. Each measure becomes a column (or column group if a column dimension is present) in the result table.

Each drop zone:
- Shows a placeholder message when empty (e.g., "Drop dimensions here to group rows")
- Shows dropped items as removable chips (click × to remove)
- Supports drag-to-reorder within the zone
- Highlights on drag-over to indicate it's a valid target

**Main Area — Results (below drop zones, fills remaining space):**
- Empty state: illustration or message ("Add dimensions and measures to build your report, then click Run Report")
- After execution: the cross-tabulation result table (see §3.3)
- Toggle bar above the results area: `Table | Bar | Line | Pie` view selector (see §5)

### 3.2 Run Report Button

A prominent "Run Report" button sits between the drop zones and the results area, right-aligned.

- **Disabled state:** When no measures are in the Values zone (you can't run a report with only dimensions)
- **Enabled state:** When at least one measure is in Values
- **Behaviour:** Clicking "Run Report" sends the current composition (dimensions, measures, filters) to the backend query engine and displays the result
- **Loading state:** Show a skeleton table / spinner while the query executes
- **Re-run prompt:** After a successful run, if the user modifies any drop zone, the "Run Report" button becomes visually highlighted (e.g., pulsing border or colour change) to signal that the results are stale and need re-running. The stale results remain visible but are dimmed.

### 3.3 Cross-Tabulation Result Table

The result table supports full cross-tabulation — dimensions on both rows and columns, with measures populating the intersecting cells.

**Example:** Rows = [LoB, Project], Columns = [Month], Values = [Budget €, Actuals €]

```
                        │  Jan 2026         │  Feb 2026         │  Mar 2026
                        │ Budget  │ Actuals  │ Budget  │ Actuals │ Budget  │ Actuals
────────────────────────┼─────────┼──────────┼─────────┼─────────┼─────────┼────────
▼ Digital Solutions     │ 245.000 │ 238.400  │ 252.000 │ 249.100 │ 260.000 │  —
  Predictive Maint. PoC│  85.000 │  82.300  │  88.000 │  86.500 │  90.000 │  —
  Customer Portal v2   │ 160.000 │ 156.100  │ 164.000 │ 162.600 │ 170.000 │  —
▼ Enterprise Core      │ 180.000 │ 175.200  │ 185.000 │ 183.900 │ 190.000 │  —
  SAP S/4 Migration    │ 180.000 │ 175.200  │ 185.000 │ 183.900 │ 190.000 │  —
```

**Table features:**
- **Nested row headers:** When multiple dimensions are on rows, the first dimension acts as a collapsible group header (▼/▶). Clicking collapses/expands the group.
- **Nested column headers:** When multiple dimensions are on columns, column headers are nested (e.g., Month as outer header, Measure names as inner headers).
- **Subtotals:** Each row group shows a subtotal row. The bottom of the table shows a grand total row.
- **Sorting:** Click any column header to sort ascending/descending. Sort indicator (▲/▼) shown.
- **Sticky headers:** Row dimension labels and column headers remain visible when scrolling.
- **Empty cells:** Show "—" for cells where no data exists (e.g., future months with no actuals).
- **European number formatting:** Per CRETA standard (dot thousands, comma decimals, € prefix for money).

### 3.4 Toolbar

A toolbar sits above the results area, containing:

| Element | Position | Description |
|---|---|---|
| View toggle | Left | `Table` / `Bar` / `Line` / `Pie` buttons (see §5) |
| Conditional Formatting | Centre-left | Button opens the conditional formatting panel (see §4) |
| Calculated Measure | Centre | "fx" button opens the calculated measure dialog (see §6) |
| Export | Right | "Export to Excel" button (see §7) |
| Save | Right | "Save Report" button (see §8) |
| Run Report | Right (prominent) | Primary action button (see §3.2) |

---

## 4. Conditional Formatting

Users can apply RAG-style conditional formatting to any measure column in the result table.

### 4.1 Applying Conditional Formatting

1. User clicks the "Conditional Formatting" button in the toolbar
2. A right-side drawer opens showing a list of all measures currently in the Values zone
3. For each measure, user can add one or more threshold rules

### 4.2 Threshold Rule Definition

Each rule has:
- **Measure:** Which measure column the rule applies to (pre-selected if only one measure exists)
- **Condition:** A comparison operator and threshold value. Supported operators: `<`, `≤`, `>`, `≥`, `=`, `between`
- **Colour:** Cell background colour. Pre-set palette: Green (#E6F4EA), Amber/Yellow (#FFF3E0), Red (#FDECEA), Blue (#E3F2FD). Users can also pick a custom colour.
- **Priority:** If multiple rules overlap, the last-defined rule wins (rules are evaluated top to bottom)

### 4.3 Display

- Formatted cells show the specified background colour with the number still clearly visible
- A small legend appears below the table when conditional formatting is active, showing the applied rules
- Conditional formatting persists across re-runs as long as the measure remains in the Values zone
- Conditional formatting is saved as part of the report definition when the report is saved (see §8)

### 4.4 Pre-set Templates

To accelerate common use cases, offer three one-click pre-sets accessible from the conditional formatting panel:

| Pre-set | Applied to | Rules |
|---|---|---|
| **Budget Variance RAG** | Variance % (M05) | Green: < 5%, Amber: 5–10%, Red: > 10% |
| **Utilisation RAG** | Utilisation % (M14) | Red: < 60%, Amber: 60–85%, Green: > 85% |
| **Spend Threshold** | Actuals € (M03) | Amber: > 100.000 €, Red: > 500.000 € |

These pre-sets auto-populate the rules. Users can modify them after applying.

---

## 5. Chart Views

The view toggle in the toolbar lets users switch between Table view and three chart types. The chart renders from the same data as the table.

### 5.1 Bar Chart

- **X-axis:** First row dimension (e.g., LoB or Project)
- **Y-axis:** First measure in Values
- **Series:** If a column dimension exists (e.g., Month), each column value becomes a grouped bar series
- **Multiple measures:** If multiple measures are in Values but no column dimension, each measure becomes a separate bar series
- **Colour:** Use CRETA's chart colour palette (consistent with Recharts usage elsewhere)

### 5.2 Line Chart

- **X-axis:** First column dimension (typically a time dimension — Month, Quarter)
- **Y-axis:** First measure in Values
- **Series:** Each value of the first row dimension becomes a separate line (e.g., one line per LoB)
- **If no time dimension on columns:** The line chart is disabled (greyed out in the toggle) with a tooltip: "Line charts require a time dimension on columns"

### 5.3 Pie Chart

- **Segments:** Values of the first row dimension
- **Size:** First measure in Values
- **Limitation:** Pie charts only use the first row dimension and first measure. If multiple dimensions or measures exist, a note appears: "Pie chart shows [Dimension] by [Measure] only"
- **Labels:** Show segment name and percentage

### 5.4 Chart Behaviour

- Charts respect active filters
- Charts do not re-render until "Run Report" is clicked (same stale-data rule as the table)
- When switching from chart back to table, the table state is preserved
- Conditional formatting does not apply to charts (it's a table-only feature)
- Charts use Recharts (consistent with the rest of CRETA)

---

## 6. Calculated Measures

Users can define simple calculated measures that derive from existing measures using basic arithmetic.

### 6.1 Creating a Calculated Measure

1. User clicks the "fx" button in the toolbar
2. A modal dialog opens with:
   - **Name field:** User enters a display name (e.g., "Budget Remaining %")
   - **Formula builder:** A row of dropdowns and operators:
     - `[Measure A dropdown] [Operator] [Measure B dropdown]`
     - Supported operators: `+`, `−`, `×`, `÷`
     - Measure dropdowns list all available measures (both from the catalog and previously created calculated measures)
   - **Format selector:** Euro (€), Percentage (%), Number (#), Hours (h)
   - **Preview:** Shows one sample calculated value based on the first data row (if a report has been run)
3. User clicks "Add" — the calculated measure appears in the Values zone and in the data catalog under a "Calculated" category

### 6.2 Constraints

- Only two-operand formulas for this iteration (A op B). No parentheses, no chaining. Document that a full formula editor with functions (SUM, IF, AVG, etc.) is a planned future enhancement.
- Division by zero displays "—" in the result cell
- Calculated measures can reference other calculated measures (one level of nesting only — no circular references)
- Calculated measures are scoped to the current report session. They are saved as part of the report definition (see §8) but do not appear in the global data catalog for other reports.

### 6.3 Editing & Deleting

- Clicking a calculated measure chip in the Values zone shows an "Edit" and "Delete" option
- Editing re-opens the formula dialog pre-filled with the current definition
- Deleting removes the measure from Values and from the results (requires re-run)

---

## 7. Export

### 7.1 Format

Excel only (.xlsx), consistent with CRETA's existing export pattern.

### 7.2 Export Content

The exported file contains:
- **Sheet 1 ("Report Data"):** The cross-tabulation table as displayed, including:
  - All row and column headers (nested headers as merged cells)
  - All data values with European number formatting
  - Subtotal and grand total rows
  - Conditional formatting applied as cell background colours in Excel
- **Sheet 2 ("Report Info"):** Metadata:
  - Report name (if saved) or "Unsaved Report"
  - Export date and time
  - Exported by (current user persona)
  - Dimensions on Rows, Columns, Filters (with active filter values)
  - Measures in Values (including calculated measure formulas)

### 7.3 File Naming

`CRETA_ReportBuilder_[ReportName]_[YYYY-MM-DD].xlsx`

If the report is unsaved, use `CRETA_ReportBuilder_Custom_[YYYY-MM-DD].xlsx`

---

## 8. Save, Share & Load

### 8.1 Saving a Report

- "Save Report" button in the toolbar
- First save: prompts for a name and optional description
- Subsequent saves: overwrites silently. "Save As" option available for creating a copy with a new name.

**What is saved:**
- Report name and description
- Dimensions in Rows (with order)
- Dimensions in Columns (with order)
- Dimensions in Filters (with selected filter values)
- Measures in Values (with order)
- Calculated measure definitions (name, formula, format)
- Conditional formatting rules
- Current view mode (Table / Bar / Line / Pie)
- Created by, created at, last modified at

### 8.2 Sharing / Publishing

Users can share a saved report with other users:

1. After saving, a "Share" button appears next to the report name
2. Clicking "Share" opens a dialog with:
   - **Share with:** Multi-select dropdown of available users/roles
   - **Permission level:** "View only" (recipient can open and export but not modify) or "Can edit" (recipient gets a copy they can modify independently)
   - **Publish to Report Library:** Toggle that makes the report visible in the "Shared Reports" section of the Report Library for all users with the appropriate role access
3. Shared reports appear in the recipient's "Shared with Me" sub-section in the Report Library
4. Published reports appear in a new "Shared Reports" section in the Report Library (between "Standard Reports" and "My Saved Views")

### 8.3 Loading a Saved Report

- From the Report Library: click on a saved custom report tile → opens the Report Builder with all saved configuration pre-loaded and auto-runs the report
- From within the Report Builder: a "Load" button (folder icon) in the toolbar opens a dropdown listing the user's saved custom reports

### 8.4 Deleting a Saved Report

- Available from the Report Library (context menu on the tile) or from the "Load" dropdown in the Report Builder
- Confirmation dialog: "Delete '[Report Name]'? This cannot be undone."
- If the report was shared, deleting it removes it for all recipients

---

## 9. API Endpoints (Lightweight)

The following endpoints are needed. Follow existing CRETA API conventions for request/response structure, query parameters, and error handling.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/report-builder/catalog` | Returns the full data catalog (dimensions and measures with metadata) |
| `POST` | `/api/report-builder/execute` | Accepts a report composition (dimensions, measures, filters) and returns the result set |
| `GET` | `/api/report-builder/saved` | List current user's saved custom reports |
| `POST` | `/api/report-builder/saved` | Save a new custom report definition |
| `PUT` | `/api/report-builder/saved/{report_id}` | Update an existing saved report |
| `DELETE` | `/api/report-builder/saved/{report_id}` | Delete a saved report |
| `POST` | `/api/report-builder/saved/{report_id}/share` | Share a report with other users/roles |
| `GET` | `/api/report-builder/shared` | List reports shared with the current user |
| `GET` | `/api/report-builder/export/{report_id}` | Export a saved report to Excel |
| `POST` | `/api/report-builder/export` | Export the current (unsaved) report composition to Excel |

**Note:** The `/execute` endpoint is the query engine. It receives a JSON body describing the report composition and dynamically constructs the SQL query. The response should be a structured JSON object that the frontend can render as a cross-tabulation table. The exact request/response schema should follow CRETA's existing patterns — refer to how other reporting endpoints structure their filter parameters and response data.

---

## 10. Interaction Details

### 10.1 Drag & Drop Behaviour

- Items can be dragged from the Data Catalog into any drop zone
- Items can be dragged between drop zones (e.g., move a dimension from Rows to Columns)
- Items can be dragged within a drop zone to reorder
- Dropping a dimension into the Values zone is not allowed (visual rejection feedback — zone flashes red briefly)
- Dropping a measure into the Rows, Columns, or Filters zone is not allowed (same feedback)
- An item cannot appear in multiple zones simultaneously — dragging it to a new zone removes it from the previous one

### 10.2 Filter Behaviour

When a dimension is dropped into the Filters zone:
1. It appears as a chip with a dropdown selector
2. The dropdown is populated with all distinct values for that dimension (fetched via a lightweight API call or derived from reference data endpoints)
3. Default selection: "All" (no filtering)
4. User can select one or multiple values
5. Multi-select: checkboxes with "Select All" / "Clear All" options
6. Active filter selections are applied when "Run Report" is clicked

### 10.3 Empty & Error States

| State | Display |
|---|---|
| No items in any zone | Centred illustration with text: "Drag dimensions and measures from the catalog to start building your report" |
| Measures in Values but no dimensions | Valid — runs as a single-row summary showing totals |
| Dimensions in Rows/Columns but no measures | Run button disabled. Tooltip: "Add at least one measure to the Values zone" |
| Query returns no data | Table area shows: "No data found for the selected combination. Try adjusting your filters." |
| Query error | Table area shows: "Something went wrong. Please try a different combination or contact support." with error code for debugging |

### 10.4 Role-Based Data Scoping

Consistent with CRETA's existing role-based access model:
- **Project Lead:** Data is filtered to their assigned projects only
- **Cost Center Owner:** Data is filtered to their cost center(s)
- **Controller / Executive:** Full data access across all entities

This scoping is applied server-side by the query engine. The Data Catalog itself is the same for all roles — the scoping affects only the result data, not the available dimensions/measures.

---

## 11. Guide Panel Content

The Report Builder should include guide panel content consistent with other CRETA modules:

**Module Manual entry:**
- Title: "Report Builder"
- Content: Brief explanation of the OLAP-style report building concept. How to use the data catalog, drop zones, and run a report. How to save and share reports.

**FAQ entries (at minimum):**
- "How do I build a custom report?"
- "What is the difference between rows and columns?"
- "How do I create a calculated measure?"
- "How do I share a report with my team?"
- "Why does my report show no data?"

---

## 12. Future Enhancements (Out of Scope — Document Only)

The following are explicitly **not** part of this specification but are noted as planned future enhancements:

1. **Full formula editor:** Support for functions (SUM, AVG, IF, ROUND, etc.), parentheses, and multi-operand formulas in calculated measures
2. **Standard reports as templates:** The six existing standard reports become pre-configured templates within the Report Builder, loadable and modifiable
3. **Scheduled reports:** Automatic report execution on a schedule (daily, weekly, monthly) with email delivery
4. **PDF export:** Export to formatted PDF in addition to Excel
5. **AI-assisted report building:** Natural language prompt ("Show me budget vs actuals by LoB for 2026") that auto-populates the drop zones — connects to the planned Tier 3 AI capabilities
6. **Drill-through:** Clicking a cell in the result table navigates to the underlying detail (e.g., clicking a project's actuals amount opens the Project Workbench for that project)
