# CRETA Report Builder — Implementation Guide

This document provides a session-by-session implementation plan for the Report Builder feature. Each session is designed to be executed in a single Claude Code context window.

**Prerequisites:** Read `CRETA_Report_Builder_Specification.md` in full before starting any session. That document is the authoritative feature specification. This guide tells you *what to build in which order* — the spec tells you *how it should work*.

**General instructions for all sessions:**
- Plan first, then implement. Use extended thinking to produce a plan before writing any code.
- Follow existing CRETA codebase conventions for file structure, component patterns, API endpoint patterns, and styling.
- European number formatting throughout (dot thousands separator, comma decimal separator, € prefix for money).
- Use shadcn/ui components where applicable. Use Recharts for charts (consistent with the rest of CRETA).
- Run the application after each major step and verify it works before proceeding.

---

## Session 1 — Data Catalog, Query Engine & UI Scaffold

**Goal:** Build the backend foundation and a working frontend skeleton. By the end of this session, a user can open the Report Builder, see the data catalog, drag dimensions and measures into drop zones, click "Run Report," and see a flat table of results.

### Scope (from spec)

| Spec Section | What to Build |
|---|---|
| §1.1–1.3 | Report Builder tile in Report Library (7th tile, visually separated) |
| §2.1–2.2 | Backend data catalog — dimensions and measures registry with metadata |
| §2.3 | Dimension–measure compatibility warnings (soft warnings, not blocks) |
| §3.1 | Three-panel layout: left catalog panel, top drop zones, main results area |
| §3.2 | Run Report button with disabled/enabled/loading/stale states |
| §9 | `/api/report-builder/catalog` and `/api/report-builder/execute` endpoints |
| §10.1 | Drag & drop behaviour (catalog → zones, between zones, reorder within zones, type enforcement) |
| §10.2 | Filter zone behaviour (dropdown selectors, multi-select, populated from reference data) |
| §10.3 | Empty and error states |
| §10.4 | Role-based data scoping on the query engine |

### What NOT to build yet

- Cross-tabulation with nested headers (Session 2) — render a flat grouped table for now
- Subtotals and grand totals (Session 2)
- Conditional formatting (Session 2)
- Calculated measures (Session 3)
- Chart views (Session 3)
- Save/Share/Load/Export (Session 4)
- Guide panel content (Session 4)

### Implementation sequence

1. **Backend — Data Catalog endpoint**
   - Create the dimension and measure registry as a structured data source (can be a Python module or JSON config — does not need its own database table since it's metadata about the schema, not user data)
   - Implement `GET /api/report-builder/catalog` returning the full catalog with metadata (display name, category, data type, aggregation rule, format, hierarchy info, compatibility notes)
   - Group dimensions by category (Planning Object, Organisation, Resource, External Cost, Financial, Time) and measures by category (Financial, Cost Breakdown, Capacity, Portfolio)

2. **Backend — Query Engine endpoint**
   - Implement `POST /api/report-builder/execute`
   - Request body: `{ rows: [dim_ids], columns: [dim_ids], filters: {dim_id: [values]}, values: [measure_ids] }`
   - The engine must dynamically construct a SQL query based on the composition:
     - Map dimension IDs to actual database columns/joins
     - Map measure IDs to SQL aggregation expressions (SUM, COUNT, COUNT DISTINCT, or calculated expressions)
     - Apply filter conditions as WHERE clauses
     - GROUP BY all row and column dimensions
     - Apply role-based data scoping (filter by user's projects/cost centers based on role)
   - Return a structured JSON response with: column headers, row data, and metadata (dimensions used, measures used, row count)
   - For this session, the response format can be a flat array of row objects — cross-tab pivoting will be handled in Session 2

3. **Frontend — Report Builder page & routing**
   - Add the Report Builder tile to the Report Library landing view as a 7th tile, visually separated below the existing 6 standard report tiles (subtle divider or extra spacing)
   - Add routing: clicking the tile navigates to `/reporting/builder`
   - Breadcrumb: `CRETA > Reporting > Report Builder`

4. **Frontend — Data Catalog panel**
   - Left panel (~250px, fixed width) with search bar and two collapsible sections (Dimensions, Measures)
   - Within each section, items grouped by category with collapsible sub-headers
   - Each item shows: type icon (cube for dimensions, Σ for measures), display name, drag handle
   - Fetch catalog from the backend on mount
   - Items are draggable (use HTML5 drag and drop or a lightweight library consistent with the existing codebase)

5. **Frontend — Drop zones**
   - Four zones: Filters (horizontal, top), Rows (vertical, left), Columns (horizontal, middle), Values (horizontal, middle-right)
   - Implement drag-and-drop targets with visual feedback (highlight on drag-over, rejection flash for invalid drops)
   - Type enforcement: dimensions only in Rows/Columns/Filters; measures only in Values
   - Items appear as removable chips with × button
   - Drag-to-reorder within zones
   - An item can only be in one zone at a time — moving it removes it from the previous zone
   - Compatibility warnings: show a tooltip when an incompatible dimension–measure combination is detected (per §2.3)

6. **Frontend — Run Report & flat table**
   - "Run Report" button: disabled when Values zone is empty, enabled otherwise
   - On click: POST to `/execute` with current composition, show loading state
   - Render results as a flat grouped table (not yet cross-tabulated — just rows with all dimensions as left-side columns and all measures as right-side columns)
   - Stale state: when drop zones change after a run, dim the results and highlight the Run button
   - Empty/error states per §10.3

### Verify

- [ ] Report Builder tile appears in Report Library, visually separated below the 6 standard tiles
- [ ] Clicking the tile navigates to the Report Builder page with correct breadcrumb
- [ ] Data catalog loads and displays all dimensions and measures, grouped by category
- [ ] Search bar filters catalog items
- [ ] Dimensions can be dragged to Rows, Columns, and Filters zones (but not Values)
- [ ] Measures can be dragged to Values zone (but not Rows, Columns, or Filters)
- [ ] Items can be reordered within zones and moved between zones
- [ ] Filter dropdowns populate with correct values
- [ ] "Run Report" executes the query and displays a flat table
- [ ] Changing drop zones after a run shows the stale-data visual cue
- [ ] Role-based scoping works (PL sees only their projects, Controller sees all)
- [ ] Empty and error states display correctly

---

## Session 2 — Cross-Tabulation & Conditional Formatting

**Goal:** Upgrade the flat table to a full cross-tabulation renderer with nested headers, collapsible groups, subtotals, and sorting. Then add conditional formatting with RAG thresholds.

**Important:** Read `CRETA_Report_Builder_Specification.md` §3.3, §4, and §10 before starting. Run the application and verify Session 1's output is working correctly before proceeding.

### Scope (from spec)

| Spec Section | What to Build |
|---|---|
| §3.3 | Full cross-tabulation result table |
| §3.4 | Toolbar (partial — view toggle placeholder, conditional formatting button, Run Report moved to toolbar) |
| §4.1–4.4 | Conditional formatting drawer, threshold rules, RAG pre-sets |

### Implementation sequence

1. **Backend — Pivot-ready response format**
   - Modify the `/execute` endpoint response to support cross-tabulation. The backend should return data in a structure that makes frontend pivoting straightforward. Two options:
     - **Option A:** Return flat rows and let the frontend pivot (simpler backend, more frontend logic)
     - **Option B:** Return a pre-pivoted nested structure (more backend logic, simpler frontend rendering)
   - Recommended: Option A — return flat rows with clear dimension and measure value fields. The frontend handles the pivot/nesting logic. This keeps the backend simple and gives the frontend full control over rendering.

2. **Frontend — Cross-tabulation renderer**
   - Build a dedicated cross-tab table component that:
     - Takes flat row data and the composition definition (which dims are rows, which are columns)
     - Pivots the data: row dimensions become nested left-side headers, column dimensions become nested top headers, measures fill the intersecting cells
     - Supports nested row headers with collapse/expand (▼/▶) for the outermost row dimension
     - Supports nested column headers (e.g., months as outer, measure names as inner)
     - Renders subtotal rows for each row group
     - Renders a grand total row at the bottom
     - Sticky row labels (frozen left columns) and sticky column headers during scroll
     - European number formatting
     - Empty cells show "—"
   - This is the most complex component in the Report Builder — plan the data transformation logic carefully before coding

3. **Frontend — Table sorting**
   - Clickable column headers to sort ascending/descending
   - Sort indicator (▲/▼) on the active sort column
   - Sorting operates on the pivoted data, respecting group hierarchy (sort within groups, not globally)

4. **Frontend — Toolbar restructure**
   - Move "Run Report" button into a toolbar above the results area
   - Add placeholder buttons for: View toggle (greyed out — Session 3), Calculated Measure (greyed out — Session 3), Export (greyed out — Session 4), Save (greyed out — Session 4)
   - Add active "Conditional Formatting" button

5. **Frontend — Conditional formatting**
   - "Conditional Formatting" button opens a right-side drawer
   - Drawer shows all measures currently in the Values zone
   - For each measure, user can add threshold rules: condition (operator + value) → colour
   - Supported operators: `<`, `≤`, `>`, `≥`, `=`, `between`
   - Colour picker with pre-set palette (Green, Amber, Red, Blue) plus custom option
   - Rules evaluate top-to-bottom, last match wins
   - Applied formatting shows as cell background colour in the result table
   - Small legend below the table when formatting is active

6. **Frontend — Conditional formatting pre-sets**
   - Three one-click pre-set buttons at the top of the drawer: "Budget Variance RAG", "Utilisation RAG", "Spend Threshold"
   - Each pre-set auto-populates rules per §4.4
   - Pre-sets are only available when the relevant measure is in the Values zone (otherwise greyed out with tooltip)

### Verify

- [ ] Cross-tabulation renders correctly with dimensions on both rows and columns
- [ ] Nested row headers collapse/expand
- [ ] Nested column headers display correctly (e.g., Month > Measure Name)
- [ ] Subtotals show for each row group; grand total at bottom
- [ ] Sticky headers work during horizontal and vertical scroll
- [ ] Sorting works on column headers
- [ ] Conditional formatting drawer opens and shows current measures
- [ ] Custom threshold rules can be added, edited, and removed
- [ ] Cell background colours render correctly based on rules
- [ ] RAG pre-sets work and auto-populate rules
- [ ] Legend appears when formatting is active
- [ ] Formatting persists across re-runs (as long as the measure remains)
- [ ] Toolbar displays correctly with active and placeholder buttons

---

## Session 3 — Calculated Measures & Chart Views

**Goal:** Add the ability to create simple calculated measures from arithmetic on existing measures, and implement three chart views (Bar, Line, Pie) with a view toggle.

**Important:** Read `CRETA_Report_Builder_Specification.md` §5 and §6 before starting. Run the application and verify Session 2's output is working correctly before proceeding.

### Scope (from spec)

| Spec Section | What to Build |
|---|---|
| §6.1–6.3 | Calculated measures: formula dialog, two-operand arithmetic, edit/delete |
| §5.1–5.4 | Chart views: Bar, Line, Pie with view toggle |
| §3.4 | Toolbar — activate view toggle and "fx" button |

### Implementation sequence

1. **Frontend — Calculated measure dialog**
   - "fx" button in toolbar opens a modal dialog
   - Dialog contains: name field, formula builder (Measure A dropdown → Operator → Measure B dropdown), format selector (€, %, #, h), preview value
   - Operators: `+`, `−`, `×`, `÷`
   - Measure dropdowns list all catalog measures plus any previously created calculated measures
   - "Add" button creates the calculated measure and adds it to: the Values zone, and a "Calculated" category in the data catalog panel
   - Division by zero shows "—"
   - One level of nesting allowed (a calculated measure can reference another calculated measure, but no deeper — enforce and show error if circular)

2. **Backend — Calculated measure support in query engine**
   - The `/execute` endpoint must accept calculated measure definitions in the request body alongside standard measure IDs
   - Calculated measures are computed in the SQL query as expressions (e.g., `(SUM(forecast) - SUM(baseline))` for "Forecast − Baseline")
   - Alternatively, compute them in Python after the SQL query returns — either approach is fine as long as it handles all aggregation contexts correctly

3. **Frontend — Calculated measure management**
   - Calculated measures appear as chips in the Values zone with an "fx" badge
   - Clicking the chip shows "Edit" and "Delete" options
   - Edit re-opens the dialog pre-filled
   - Delete removes from Values zone and catalog; shows stale-data indicator if report was previously run

4. **Frontend — View toggle**
   - Activate the view toggle buttons in the toolbar: `Table | Bar | Line | Pie`
   - Default: Table (always available)
   - Switching views re-renders the same data in the selected format
   - Chart views use Recharts

5. **Frontend — Bar chart**
   - X-axis: first row dimension
   - Y-axis: first measure in Values
   - Series grouping: if a column dimension exists, each column value is a grouped bar series; if no column dimension but multiple measures, each measure is a series
   - Use CRETA's existing chart colour palette
   - Tooltips showing exact values on hover

6. **Frontend — Line chart**
   - X-axis: first column dimension (must be a time dimension)
   - Y-axis: first measure
   - Series: each value of the first row dimension becomes a line
   - Disabled (greyed out with tooltip) when no time dimension is on columns
   - Data points with hover tooltips

7. **Frontend — Pie chart**
   - Segments: values of first row dimension
   - Size: first measure
   - Labels: segment name + percentage
   - Note text when multiple dimensions/measures exist: "Pie chart shows [Dimension] by [Measure] only"

8. **Chart behaviour**
   - Charts respect filters
   - Charts don't re-render until "Run Report" is clicked (same stale rule)
   - Switching from chart back to table preserves table state
   - Conditional formatting does not apply to charts

### Verify

- [ ] "fx" button opens the calculated measure dialog
- [ ] Calculated measures can be created with all four operators
- [ ] Calculated measures appear in Values zone and catalog with "fx" badge
- [ ] Calculated measure values are correct in the result table
- [ ] Division by zero shows "—"
- [ ] Calculated measures can be edited and deleted
- [ ] One level of nesting works; circular reference is blocked
- [ ] View toggle switches between Table, Bar, Line, Pie
- [ ] Bar chart renders correctly with proper axis mapping and series
- [ ] Line chart renders with time dimension on X-axis; disabled when no time dimension on columns
- [ ] Pie chart renders with segments and percentage labels
- [ ] Charts use Recharts and CRETA's colour palette
- [ ] Switching back to table preserves table state
- [ ] Conditional formatting does not appear on charts

---

## Session 4 — Save, Share, Export & Polish

**Goal:** Add persistence (save/load/share/publish/delete), Excel export, Report Library integration, guide panel content, and final polish.

**Important:** Read `CRETA_Report_Builder_Specification.md` §7, §8, §10, and §11 before starting. Run the application and verify Session 3's output is working correctly before proceeding.

### Scope (from spec)

| Spec Section | What to Build |
|---|---|
| §8.1 | Save report (name, description, full state persistence) |
| §8.2 | Share / Publish (share with users, publish to Report Library) |
| §8.3 | Load saved reports (from Report Library and from within Builder) |
| §8.4 | Delete saved reports |
| §7.1–7.3 | Excel export |
| §1.3 | Saved custom reports in Report Library with "Custom" badge |
| §9 | Remaining API endpoints (saved, shared, export) |
| §11 | Guide panel content (manual entry + FAQ entries) |

### Implementation sequence

1. **Backend — Saved reports persistence**
   - Create a database table for saved custom reports:
     - `id`, `name`, `description`, `created_by`, `created_at`, `last_modified_at`
     - `definition` (JSON): stores the full report composition (rows, columns, filters, values, calculated measures, conditional formatting rules, view mode)
     - `is_published` (boolean): whether visible in the shared Report Library section
   - Create a table for report sharing:
     - `report_id`, `shared_with` (user/role), `permission` (view_only / can_edit), `shared_at`
   - Implement CRUD endpoints: `GET/POST/PUT/DELETE /api/report-builder/saved`
   - Implement share endpoint: `POST /api/report-builder/saved/{id}/share`
   - Implement shared reports listing: `GET /api/report-builder/shared`

2. **Frontend — Save workflow**
   - Activate "Save Report" button in toolbar
   - First save: modal with name field and optional description field → POST to `/saved`
   - Subsequent saves: silent overwrite → PUT to `/saved/{id}`
   - "Save As" option in a dropdown next to Save button for creating copies
   - After saving, breadcrumb updates to: `CRETA > Reporting > Report Builder > [Report Name]`

3. **Frontend — Share workflow**
   - After saving, "Share" button appears next to report name
   - Share dialog: multi-select users/roles, permission level (View only / Can edit), "Publish to Report Library" toggle
   - Shared reports send notification to recipients (use existing CRETA notification pattern)

4. **Frontend — Load workflow**
   - "Load" button (folder icon) in toolbar opens dropdown listing user's saved custom reports
   - Selecting a report loads the full composition into the drop zones and auto-runs
   - From Report Library: saved custom reports appear in "My Saved Views" section with a "Custom" badge
   - Published reports appear in a new "Shared Reports" section in the Report Library
   - Shared-with-me reports appear in a "Shared with Me" sub-section
   - Clicking any of these opens the Report Builder with the saved configuration

5. **Frontend — Delete workflow**
   - Available from Report Library (context menu) and from "Load" dropdown
   - Confirmation dialog
   - If shared, deleting removes for all recipients

6. **Backend — Excel export**
   - Implement `POST /api/report-builder/export` (for unsaved reports) and `GET /api/report-builder/export/{id}` (for saved reports)
   - Generate .xlsx with two sheets:
     - Sheet 1 ("Report Data"): cross-tabulation table with merged cells for nested headers, European formatting, subtotals/grand totals, conditional formatting as cell background colours
     - Sheet 2 ("Report Info"): metadata (report name, export date, user, dimensions, measures, filters, calculated measure formulas)
   - File naming: `CRETA_ReportBuilder_[Name]_[YYYY-MM-DD].xlsx` or `CRETA_ReportBuilder_Custom_[YYYY-MM-DD].xlsx` if unsaved

7. **Frontend — Export button**
   - Activate "Export to Excel" button in toolbar
   - On click: trigger export endpoint, download the file
   - Loading state while generating

8. **Guide panel content**
   - Add Report Builder entry to the module manual
   - Add FAQ entries per §11

9. **Polish & edge cases**
   - Verify all empty/error states display correctly
   - Verify stale-data indicator works in all scenarios
   - Verify breadcrumb updates correctly across all navigation paths
   - Test with different role personas (PL, CCO, Controller, Executive)
   - Ensure seed data produces meaningful results across at least 3 dimensions simultaneously

### Verify

- [ ] Save workflow: first save prompts for name, subsequent saves overwrite silently
- [ ] Save As creates a copy with a new name
- [ ] Saved reports appear in Report Library "My Saved Views" with "Custom" badge
- [ ] Loading a saved report restores all drop zones, filters, calculated measures, conditional formatting, and view mode
- [ ] Auto-run executes on load
- [ ] Share dialog allows selecting users/roles and permission levels
- [ ] Published reports appear in "Shared Reports" section of Report Library
- [ ] "View only" recipients can open and export but not modify
- [ ] "Can edit" recipients get an independent copy
- [ ] Delete confirms and removes for all recipients
- [ ] Excel export produces correct .xlsx with two sheets
- [ ] Cross-tab table exports with merged cells and conditional formatting colours
- [ ] File naming follows convention
- [ ] Guide panel content displays correctly
- [ ] All four role personas see appropriate data scoping
- [ ] Breadcrumb is correct in all navigation states
