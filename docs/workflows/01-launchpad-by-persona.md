# 01 — Launchpad by Persona

The Launchpad is the home screen for every persona — `/` route, no submenu. It uses a three-zone layout established in the E7 redesign:

1. **Brand band** (top): the rotating CPC acrostic, persona greeting ("Good evening, Anna"), role pill, and date / cycle indicator ("Thursday, 30 April 2026 · Q2 2026 Cycle").
2. **Pending Actions panel** (middle): a per-persona inbox of items requiring action. Urgent items get a red left edge.
3. **Module tile grid** (bottom): role-aware cards linking to the canonical entry point of each module.

Tile counts and pending-action contents differ per persona. The four walks below pin the demo state for the seeded `creta_demo.db` so a presenter can reproduce them in the live app.

The four personas, their tile counts, and their pending-action counts as of the seeded baseline:

| Persona | Display | Tile count | Pending actions |
|---|---|---:|---:|
| Anna Meier | IT Controller | 9 | 3 (1 urgent) |
| Priya Sharma | Senior Project Lead | 7 | 9 (1 urgent) |
| Thomas Brenner | Cost Centre Owner | 8 | 3 (3 urgent) |
| Dr. Klaus Weber | Executive | 7 | 1 |

---

## W01.1: Controller (Anna) Launchpad walk

**Purpose**: Demo opener — set the stage with the controller's portfolio-wide overview.
**When to use**: First step of every demo dress rehearsal; the canonical anchor persona for the catalogue.
**Personas involved**: Controller (Anna Meier).
**Pre-conditions**: Default demo state. Persona = Anna.
**Estimated walk-time**: 3 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Controller | Navigate to `/` | Launchpad loads with the brand band + pending actions + tile grid | Greeting reads "Good evening, Anna"; role pill shows "Controller"; date band reads "Thursday, 30 April 2026 · Q2 2026 Cycle" |
| 2 | Controller | Inspect the **Pending Actions** panel | Three actions listed; the first has a red urgent bar | Header reads "3 · 1 urgent" |
| 3 | Controller | Read the urgent item | Card title "Change request awaiting approval" with subtext "CR #19 for Identity & Access Management Run — Licensing cost increase + additional security consultant for…" | Clicking it deep-links to `/portfolio/approvals` with CR #19 selected (see W04.3) |
| 4 | Controller | Read the second action ("New scenario published — Budget Pressure: 15% Reduction") | Click it → navigates to `/simulator` with the published scenario row highlighted | URL changes to `/simulator` |
| 5 | Controller | Inspect the tile grid (3 × 3, 9 tiles) | Tiles in order: **Portfolio KPIs**, **Pipeline**, **Budget vs Cutoff**, **Reporting**, **Forecast Cycle**, **Pending Reviews**, **Capacity Overview**, **Scenario Activity**, **Admin** | Each tile shows a metric + subline (e.g., Portfolio KPIs: "€3.410.650,00 · 11 active · drift +6.1%") |
| 6 | Controller | Click **Pipeline** | Navigates to `/backlog` (4 projects pre-funded / proposed) | Page heading "Backlog"; pipeline counter shows "4 projects proposed or under evaluation" |
| 7 | Controller | Return to `/`; click **Forecast Cycle** | Navigates to `/portfolio?view=forecast-cycle` (or equivalent) showing the 4 projects with overdue 2026-04 forecasts | Tile sub-line reads "4 overdue · cycle 2026-04" |
| 8 | Controller | Return to `/`; click **Admin** | Navigates to `/admin` master data hub | Page heading "Administration"; left rail loads with 5 sections (MASTER DATA / REFERENCE CATALOGUES / PLANNING & RANKING / PORTFOLIO HIERARCHY / SYSTEM) |

### Post-conditions

- No state changes — the Launchpad is read-only; tile clicks are pure navigation.

### Cross-references

- **Decision tags**: `[E-07a]`, `[E-07d]` (action-card / summary-card patterns)
- **Backend endpoint**: `routers/global_launchpad.py::get_launchpad()` (returns role-scoped tiles + pending actions)
- **In-app manual**: `launchpad.json § Module Tiles`, `§ Notifications & Alerts`
- **FAQ overlap**: faq.json `faq-11` (persona switching) — not a perfect match but the closest related entry

### Known issues / caveats

- The `Forecast Cycle` tile's "4 overdue" count includes projects whose PL hasn't started a 2026-04 cycle — not the 4 CRs awaiting decisions. Don't conflate the two; the Pending Reviews tile next to it shows the CR queue.

---

## W01.2: Project Lead (Priya) Launchpad walk

**Purpose**: Demonstrate the PL's "what needs my attention?" inbox — the most action-heavy persona on the Launchpad.
**When to use**: After the controller opener, switch to Priya to show role-specific pending actions and the seven personalised KPI tiles.
**Personas involved**: Project Lead (Priya Sharma).
**Pre-conditions**: Persona switched to Priya (W00.1).
**Estimated walk-time**: 3 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | PL | Switch to Priya via the persona dropdown (W00.1) | Launchpad re-renders for the PL view | Greeting reads "Good evening, Priya"; role pill "Project Lead" |
| 2 | PL | Inspect the **Pending Actions** panel | Nine actions listed; the first has a red urgent bar | Header reads "9 · 1 urgent" |
| 3 | PL | Read the urgent item | "Monthly forecast overdue — ERP Integration Phase 2 — 2026-03 forecast was not submitted" | Click it → navigates to `/workbench?project=proj-erp2` Forecast & Planning tab |
| 4 | PL | Scan the remaining 8 actions in order | Mix of CR feedback notifications and forecast deadlines: CR #28 approved (Master Data Hub Rollout) · CR #27 returned with feedback (Predictive Maintenance PoC) · "Autonomous Braking Prototype" awaiting resource confirmation · CR #2 approved (ERP Integration Phase 2) · CR #1 approved (ERP Integration Phase 2) · 3× "Monthly forecast due" for MDH Rollout / Sensor Data Pipeline / Predictive Maintenance PoC | Each card has icon + 2-line text + chevron; clicking deep-links to the relevant project workspace |
| 5 | PL | Inspect the tile grid (7 tiles) | Tiles in order: **My Projects**, **My Budget**, **My Progress**, **My Forecast**, **Recent Changes**, **Scenario Explorer**, **Resource Availability** | The 5 PL projects total to "5 projects · 4 active"; My Budget shows "€4.050.000,00 / €727.786,11 YTD actuals" |
| 6 | PL | Click **My Projects** | Navigates to `/workbench`; left rail lists the 5 projects (Autonomous Braking Prototype, ERP Integration Phase 2, Master Data Hub Rollout, Predictive Maintenance PoC, Sensor Data Pipeline) | Each row shows status badge: 1 × CC Review (autobrake), 4 × Active |
| 7 | PL | Return to `/`; click **Resource Availability** | Tile expands inline (or opens a side panel) showing top-3 role × location capacity pools | Pool list: Developer 3.840h · Senior Developer 2.940h · QA / Test Engineer 2.130h |
| 8 | PL | Return to `/`; click the **CR #27 returned with feedback** action card | Navigates to `/workbench?project=proj-predmaint` Change History tab with CR #27 expanded showing the diff view (controller's edits) | Banner reads "Action Required" with amber border (see W04.4) |

### Post-conditions

- No state changes — all interactions are read-only from the Launchpad's perspective; downstream actions (W04.4 resubmit, W03.1 cycle) carry their own state changes.

### Cross-references

- **Decision tags**: `[E-07d]` (action-card pattern)
- **Backend endpoint**: `routers/global_launchpad.py::get_launchpad()`
- **In-app manual**: `launchpad.json § Pending Actions`
- **Cross-walk**: [W04.4](./04-change-requests.md#w044-cr-send-back--pl-resubmit--diff-view) for the send-back follow-up; [W03.1](./03-forecast-cycle.md#w031-monthly-forecast-cycle-5-phase-wizard) for the forecast deadline follow-up

### Known issues / caveats

- Pending action count drifts as CRs / cycles complete in the live demo. The seeded count is exactly 9. Reset the demo (W00.3) before the dress rehearsal to restore it.
- The `Recent Changes` tile counts CR notifications regardless of action requirement — it's an audit-style summary, not an inbox.

---

## W01.3: CC Owner (Thomas) Launchpad walk

**Purpose**: Show the CC Owner's queue-driven workflow — every pending action is something the CC needs to confirm or decline.
**When to use**: Mid-demo persona switch to demonstrate the CR confirmation handoff.
**Personas involved**: CC Owner (Thomas Brenner).
**Pre-conditions**: Persona switched to Thomas. Default seed.
**Estimated walk-time**: 3 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | CC Owner | Switch to Thomas via persona dropdown | Launchpad re-renders for CC Owner view | Greeting reads "Good evening, Thomas"; role pill reads "Cost Centre Owner" (British spelling) |
| 2 | CC Owner | Inspect the **Pending Actions** panel | Three actions; **all three** have red urgent bars | Header reads "3 · 3 urgent" |
| 3 | CC Owner | Read the actions in order (urgent-first sort): | (1) "Change request pending confirmation — CR #15 for Sensor Data Pipeline — Add AWS infrastructure scaling costs for production rollout"; (2) "Change request pending confirmation — CR #9 for ERP Integration Phase 2 — Increase Sr Developer MUC hours Apr-Jun 2026 + extend Deloitte consulting through Q3"; (3) "Resource confirmation needed — Autonomous Braking Prototype" | The two CR cards include a red urgent bar; the project intake card has the same urgent treatment |
| 4 | CC Owner | Click the **Autonomous Braking Prototype** action | Navigates to `/capacity/project-assignment/proj-autobrake` (the all-resources gate) | Page shows the 9 resource requests with role × month grid; **Confirm All & Send to Controller** + **Decline** buttons in the footer (see [W08.3](./08-capacity.md#w083-project-resource-confirmation-all-or-nothing)) |
| 5 | CC Owner | Navigate back to `/`; inspect the tile grid (8 tiles) | Tiles in order: **Team Utilization**, **Open Requests**, **Headcount**, **CC Budget**, **Portfolio**, **My CC's Projects**, **Published Scenarios**, **CC Simulator** | Team Utilization shows "22.5% · 0 over-allocated"; Open Requests shows "9 pending · awaiting your confirmation" |
| 6 | CC Owner | Click **Open Requests** | Navigates to `/capacity/requests` (the resource-confirmation list) | Page shows 3 cards: 1 project intake (Autonomous Braking Prototype) + 2 CRs (Sensor Data Pipeline, ERP Integration Phase 2) |
| 7 | CC Owner | Return to `/`; click **CC Simulator** | Navigates to `/simulator` filtered to CC-Owner-scoped scenarios per `[F-AC-01]` | Scenario list shows only own scenarios + others scoped to MUC / Application Development |

### Post-conditions

- No state changes — the Launchpad surfaces the inbox; confirming / declining is downstream (W04.2, W05.x, W08.3).

### Cross-references

- **Decision tags**: `[E-07d]`, `[F-AC-01]` (CC-scoped simulator)
- **Backend endpoint**: `routers/global_launchpad.py::get_launchpad()`; `routers/capacity.py::list_pending_requests()`
- **In-app manual**: `launchpad.json § Pending Actions`; `capacity_management.json § Project Confirmation Banner`
- **Cross-walks**: [W04.2](./04-change-requests.md#w042-cc-owner-cr-confirmation), [W05.x](./05-resource-requests.md), [W08.3](./08-capacity.md#w083-project-resource-confirmation-all-or-nothing)

### Known issues / caveats

- The `Open Requests` tile counts the **number of resource requests across all pending items** (9), not the number of pending parent items (3). Don't conflate the two.
- "Cost Centre" uses the British spelling on the role pill but US "Cost Center" everywhere else (admin module headings, table column labels). Cosmetic-only — no functional impact.

---

## W01.4: Executive (Klaus Weber) Launchpad walk

**Purpose**: Demonstrate the read-only executive view focused on portfolio rollups and scenario digests.
**When to use**: Closing demo step ("here's what the C-level sees"); regression test for read-only role gating.
**Personas involved**: Executive (Dr. Klaus Weber).
**Pre-conditions**: Persona switched to Klaus.
**Estimated walk-time**: 2 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Executive | Switch to Dr. Klaus Weber via persona dropdown | Launchpad re-renders for Executive view | Greeting reads "Good evening, Dr." (the title-prefix path); role pill reads "Executive" |
| 2 | Executive | Inspect the **Pending Actions** panel | One action, no urgent flag | Header reads "1" |
| 3 | Executive | Read the single action | "New scenario published — Budget Pressure: 15% Reduction" | Click it → navigates to `/simulator` with that scenario opened in read-only mode |
| 4 | Executive | Return to `/`; inspect the tile grid (7 tiles) | Tiles in order: **Portfolio KPIs**, **Investment Mix**, **Pipeline Health**, **Top Risks**, **Scenario Activity**, **Budget Trajectory**, **Backlog** | Investment Mix shows "Run 7% · Change 93% · DoI 0–4 / 5 split"; Top Risks shows "1 red · 2 amber · active projects flagged" |
| 5 | Executive | Click **Investment Mix** | Navigates to a portfolio rollup view filtered to the Run vs Change split | Rollup cards differentiate offerings + DoI 5 services from DoI 0-4 projects |
| 6 | Executive | Return to `/`; click **Top Risks** | Navigates to a portfolio view filtered to projects flagged red or amber (e.g., on the RAG donut) | RAG donut shows red + amber slices; project list filtered |
| 7 | Executive | Click **Backlog** | Navigates to `/backlog` cube view | Page heading "Backlog"; "11 ranked · cube view available" sub-line referenced from the tile |

### Alternative paths

- **Trying to mutate state**: As Executive, attempting to click an admin CRUD button (e.g., on a portfolio entity card) results in a 403 from the backend (`require_role("controller")` blocks it). The frontend hides write controls for Executive but a determined click via the API surfaces "Insufficient role" error toasts.

### Post-conditions

- No state changes — Executive is fully read-only.

### Cross-references

- **Decision tags**: `[E-07d]`
- **Backend endpoint**: `routers/global_launchpad.py::get_launchpad()`
- **In-app manual**: `launchpad.json § Module Tiles`
- **Cross-walk**: [W06.4](./06-simulator.md#w064-compare-2-5-scenarios-side-by-side) for the executive scenario comparison view

### Known issues / caveats

- Klaus Weber replaces v4's "Thomas Becker" — every fixture / FAQ / manual referencing Becker has been updated. If you spot "Becker" in a screenshot or doc, that's a v4 leftover; flag it for refresh.
- The greeting variation "Good evening, Dr." is intentional (the persona's `salutation_format` includes the academic title); other personas use first-name only.

---

## Cross-workflow notes

- **Pending action urgency**: An action is marked urgent when its decision deadline has passed (e.g., a CR pending > 7 days, a forecast overdue > 1 cycle). Urgency is computed server-side per `[E-07d]`.
- **Tile click behaviour**: All tile clicks are pure navigation; tiles never trigger state mutations directly. The downstream module is responsible for any state change.
- **Persona switch preserves notification context**: Switching from Anna to Priya immediately replaces the pending-actions panel; no stale notifications carry over.
- **Three pending-action surfaces** stay in sync across the app:
  1. Top-bar bell icon (count only)
  2. Launchpad Pending Actions panel (full list)
  3. Module-specific banners (e.g., Workbench's "Action Required" amber banner for sent-back CRs)
  All three are backed by `routers/global_launchpad.py` so they never disagree on the count.

## Related FAQ entries

- `faq-11` — "How do I switch between personas in the demo?"
- `faq-20` — "How do I enable dark mode?" (lives in the same TopBar surface)
