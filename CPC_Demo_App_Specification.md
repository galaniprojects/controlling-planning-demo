# CPC Demo App — Specification & Planning Document

**Document Purpose:** This is a living specification for the CPC (Controlling & Planning Centre) demo application. It captures all decisions made during planning sessions and will ultimately serve as the prompt for Claude Code to build the application. When starting a new chat session, upload this document as context and say "let's continue from where we left off."

**Last Updated:** 2025-02-27, Session 7  
**Status:** CONSOLIDATED — All six modules specced and included in first iteration (Administration Tiers 1–2 promoted from deferred). All 25 decisions resolved. Design system, documentation, API design (89 endpoints), and mock data inventory finalized. Mock data generation approach recorded (SQL seed + JSON fixtures). Consistency review completed. Ready for Claude Code handoff.

---

## 1. Project Context

### 1.1 Background

Knorr-Bremse currently uses a proprietary tool called CaPa (Capacity Planning) built on a MariaDB database. CaPa has severe usability problems: no baseline tracking (forecasts overwrite plans), manual version snapshots, no drill-down reporting, and users rely on parallel Excel workflows. The CPC project aims to replace CaPa with a modern planning and reporting system.

### 1.2 Purpose of This Demo

This is a **fully working demo application with realistic mock data** — not connected to the real CaPa database. Its purpose is to show stakeholders (controllers, IT directors, executives) what the end-state system can do. It serves as a vision artifact for securing buy-in and funding.

### 1.3 What This Is NOT

- Not a click-dummy or wireframe — it's a real running app
- Not connected to any real database — all data is generated mock data
- Not a production prototype — no real auth, no real integrations

---

## 2. Technical Stack

| Layer | Technology |
|-------|-----------|
| Backend API | FastAPI (Python) |
| Frontend | React (Vite) |
| Database | SQLite (embedded, for mock data) |
| Language | English UI |
| Currency | EUR (€) |

---

## 3. Application Architecture

### 3.1 Module Structure

The application uses a **launchpad + modules** architecture. There is no persistent sidebar navigation. Each module is a self-contained application that can cross-link to any other module. Users navigate via a central Launchpad.

**Modules:**

| # | Module | Primary Users | Purpose |
|---|--------|--------------|---------|
| 0 | **Launchpad** | All | Home screen. Alerts, module tiles, quick KPIs, "Submit New Project" action |
| 1 | **Portfolio Overview** | Controllers, Executives | Portfolio health, project/service status, intake queue, CR approval queue |
| 2 | **Project Workbench** | Project/Offering Leads | Project planning, forecast updates, monthly cycle, CR creation, 3-point comparison |
| 3 | **Capacity Management** | Cost Center Owners, Controllers, Executives | Resource utilization, allocation, heatmap, resource request handling |
| 4 | **What-If Simulator** | Controllers, Executives | Sandbox for hypothetical scenario modeling |
| 5 | **Administration** | Controllers | Master data management (Tiers 1–2: org structure CRUD, planning parameters). Tier 3 (custom KPI definitions) deferred to future iteration. |

### 3.2 Navigation Model ✅ DECIDED

**Approach: Full-screen modules with minimal top bar.**

- **Top bar (always visible, all modules):** Left side shows app logo + clickable breadcrumb (e.g., "CPC > Portfolio Overview > Truck Systems"). Right side shows global help icon ("?") and role switcher dropdown. No module tabs.
- **Global help icon:** Opens the FAQ / "How do I..." panel (see Section 8.3). Available from any screen.
- **Module guide button:** Each module displays a "Guide" button in its top area, opening the module-specific manual (see Section 8.2).
- **Launchpad → Module:** Clicking a module tile opens that module full-screen (below the top bar).
- **Return to Launchpad:** Click "CPC" in the breadcrumb.
- **Module → Module:** Cross-links (e.g., clicking a project in Portfolio Overview opens it in Project Workbench). Breadcrumb updates accordingly.
- **Within modules:** Drill-down adds to breadcrumb (e.g., "CPC > Capacity Management > MUC App Dev > Senior Developer").

### 3.3 Role Switcher

A dropdown in the top bar allows switching between roles. This simulates login — no real authentication.

**Roles:**

| Role | Default Landing | Access Level | Write Permissions |
|------|----------------|--------------|-------------------|
| **Controller** | Portfolio Overview | Full portfolio visibility | CR approval (stage 2), baseline approval, new project approval, Administration module access (org structure CRUD, planning parameters). |
| **Cost Center Owner** | Capacity Management — "My Team" tab | Own CC + projects drawing from it | Resource allocation for own CC, CR confirmation (stage 1) |
| **Project/Offering Lead** | Project Workbench (filtered to their projects) | Own projects + allocated resources | Forecast updates, CR creation, new project submission |
| **Executive** | Portfolio Overview | Full portfolio (aggregated, no person-level detail) | None (read-only) |

---

## 4. Data Concepts

### 4.1 Core Data Model (No Versions, No Year Selector)

The system does NOT have a global year or version selector. Time is intrinsic to the data — every object spans its own date range. The CaPa concept of "versions" is replaced entirely by:

| Concept | Definition | Characteristics |
|---------|-----------|-----------------|
| **Baseline** | The approved plan for a planning object | Immutable once created. Permanent reference. Created when a new project is approved or at the start of each fiscal year. |
| **Current Forecast** | The living plan reflecting latest approved expectations | Updated only through approved Change Requests. Represents the current best estimate. |
| **Actuals** | Recorded costs and hours from SAP/CATS | Read-only. Accumulates over time. Used for variance calculations. |
| **Change Requests** | Records of every forecast modification | Every change, regardless of size, creates a CR. Permanent audit trail. CRs require two-stage approval (CC Owner → Controller) before the forecast updates. |

### 4.2 Variance Model

| Variance Type | Calculation | What It Reveals |
|--------------|-------------|-----------------|
| Plan Drift | Current Forecast − Baseline | How much the plan shifted from original approval |
| Execution Variance | Actuals − Current Forecast (elapsed periods) | How well execution matches latest forecast |
| Total Variance | Actuals − Baseline (elapsed periods) | Total deviation from original approved plan |

### 4.3 RAG Status (System-Generated)

Calculated from variance thresholds applied independently to budget and timeline. Combined RAG takes the worst status of the two.

**Budget RAG:** Based on Plan Drift — (Current Forecast − Baseline) / Baseline × 100.

| Status | Condition | Visual |
|--------|-----------|--------|
| Green | Budget variance < 5% | Green indicator |
| Amber | Budget variance 5–10% | Amber indicator |
| Red | Budget variance > 10% | Red indicator |

**Timeline RAG:** Based on schedule slippage relative to planned duration — (Projected End − Baseline End) / Planned Duration × 100, where Planned Duration is the number of months from baseline start to baseline end.

| Status | Condition | Visual |
|--------|-----------|--------|
| Green | Timeline variance < 5% | Green indicator |
| Amber | Timeline variance 5–10% | Amber indicator |
| Red | Timeline variance > 10% | Red indicator |

This scales proportionally with project length: a 1-month slip on a 12-month project (8.3%) is Amber, while a 1-month slip on a 24-month program (4.2%) remains Green. A 1-month slip on a 3-month PoC (33%) is Red — appropriate, since short projects are far more sensitive to delays.

**Combined RAG** = worst of Budget RAG and Timeline RAG. A project that is Green on budget but Amber on timeline shows Amber overall.

For **completed projects**, timeline variance is frozen at the final state (actual end vs baseline end). For **planned/future projects** with no actuals yet, only budget RAG applies (no timeline slippage to measure).

### 4.4 Multi-Year Data

Planning data uses absolute month references (YYYY-MM), not CaPa's relative q1–q12 columns. Objects span their natural timeline — a project running from 2024-03 to 2026-09 shows all its data continuously.

### 4.5 Change Tracking by Hierarchy Level

| Level | What's Visible |
|-------|---------------|
| **LoB / Portfolio** | Monthly rolling forecast trajectory (aggregate number shifting over time). No individual CRs — too chaotic at this level. |
| **Program / Initiative** | Aggregate forecast trend + count of CRs in child projects |
| **Project / Service** | Full CR history: every change with timestamp, who, what, why, category. Number of times budget has changed. Ability to browse through forecast months and dig into individual changes. |

---

## 5. Workflows

### 5.1 Workflow 1: New Project Initiation

**Entry point:** "Submit New Project" button on the Launchpad (not inside Project Workbench).

**Step 1 — Draft Creation (Project Lead)**
PL fills out a structured form:
- Project name, description, sponsoring LoB
- Expected timeline (start month / end month)
- Initial resource plan: roles needed, hours per month, duration
- System auto-calculates estimated cost from blended hourly rates
- Estimated external costs by type (consulting, cloud, travel, etc.)
- Project state: **Draft** (visible only to creator and controllers)

**Step 2 — Submission**
PL submits the estimation. State changes to **Pending Approval**. Appears in the Intake Queue (tab within Portfolio Overview).

**Step 3 — Review & Approval**
Controller (and optionally Executive sponsor — configurable per LoB) reviews:
- Full estimation: resources, costs, timeline
- Portfolio impact: additional budget, capacity implications
- Can: Approve / Reject / Send back with comments
- If approved: estimation becomes the **Baseline**. State → **Approved**. Project appears in Portfolio.

**Step 4 — Resource Requests Triggered**
On approval, role requirements become resource requests to relevant Cost Center Owners (feeds Workflow 2).

### 5.2 Workflow 2: Change Request Pipeline (Two-Stage Approval)

> **⚠️ PROVISIONAL:** The exact scope of controller approval (all CRs vs. only major/LoB-level changes) is TBD pending the controller workshop in the coming two weeks. For demo purposes, we implement the full two-stage flow for all CRs. This may be relaxed based on workshop outcomes.

Change Requests flow through a two-stage approval pipeline that separates operational feasibility from business alignment:

**Stage 1 — CC Owner Confirmation (Operational Feasibility)**

When a PL submits changes during the monthly forecast cycle (Workflow 3), any changes that affect a cost center's resources or budget create requests directed to the relevant CC Owner. The CC Owner evaluates: *can we do this?*

For **resource requests** (internal capacity):
- CC Owner sees the request in their Request Management sub-view (within Capacity Management)
- System shows team availability: all people in the requested role with per-month utilization
- CC Owner assigns a specific named person to fulfill the request
- The PL can see the assigned person's name once confirmed

For **external cost requests** (consulting, licenses, cloud, etc.):
- CC Owner sees the request alongside remaining budget for that cost category
- CC Owner confirms the spend is feasible within what they manage

**CC Owner response options:**
- **Confirm** — accept as-is (with named person assigned for resource requests)
- **Partially fulfill** — adjust hours, amount, or period
- **Counter-propose** — offer an alternative (e.g., two mid-level developers instead of one senior)
- **Decline** — flag inability, with required reason

**Stage 2 — Controller Approval (Business Alignment)**

Only CRs that have passed CC Owner confirmation reach the Controller's approval queue. The Controller evaluates: *should we do this?*

- Controller sees: what changed, why, impact on budget/timeline, whether system-suggested, and that the CC Owner has confirmed feasibility (including who was assigned)
- Can: Approve / Reject / Send back with comments
- Until approved, forecast remains unchanged in all views
- Once approved, new forecast becomes current; CR permanently logged

**CR Lifecycle States:**

| State | Meaning |
|-------|---------|
| **Draft** | PL is composing changes (not yet submitted) |
| **Pending CC Confirmation** | Submitted by PL, awaiting CC Owner's operational confirmation |
| **Sent Back by CC** | CC Owner returned with comments, PL needs to revise |
| **Pending Controller Approval** | CC Owner confirmed, awaiting Controller's business approval |
| **Sent Back by Controller** | Controller returned with comments (goes back to PL, may need new CC confirmation if changed) |
| **Approved** | Both stages passed, forecast updated |
| **Rejected** | Declined at either stage, with reason logged |

### 5.3 Workflow 3: Monthly Rolling Forecast Cycle

This is the core planning workflow. Happens once per month. All requests (resource and external cost) are created within this cycle — no ad-hoc requests outside it.

**Phase 1 — Retrospective: "What happened last month?"**
System shows previous month's forecast vs actuals (from SAP/CATS mock data). PL acknowledges and explains significant variances. This provides the narrative controllers need for reporting.

**Phase 2 — Forward Look with System Suggestions**
Before the PL starts editing, the system presents AI-generated insights and suggestions:

*Types of suggestions:*
- **Trend-based:** "Hours have exceeded forecast by 12% avg over 3 months. Suggest adjusting remaining months."
- **Actuals-based correction:** "Consulting costs overran by 50% for 2 consecutive months. Suggest increasing forecast."
- **Burn rate projection:** "At current rate, budget exhausted by September (2 months early)."
- **Resource utilization:** "Developer hours 20% below allocation — team may be over-staffed."
- **Seasonal patterns:** Flagging months that don't reflect known patterns (e.g., December holiday dip).

*Presentation:*
- **Insights panel** at top of editing view — each suggestion is a card with observation, recommendation, impact, and Apply/Dismiss buttons
- **Pre-filled values** — suggestions are also reflected as pre-filled changes in the forecast grid that PL can accept or modify
- When a suggestion is applied, the resulting CR notes it was system-suggested (important for controller trust)

**Phase 3 — Editing**
PL clicks "Edit Forecast." Grid becomes editable:
- Rows = resource roles + external cost types
- Columns = months (remaining in project)
- Both internal hours and external costs in the same view
- System tracks all changes in background
- Nothing committed yet

**Phase 4 — Review & Submit**
PL clicks "Review Changes." Summary appears:
- All modifications grouped: Resource changes, External cost changes, Timeline changes
- Per group: old value, new value, delta
- Per group: PL provides justification text and selects change category
- System shows impact: total project cost change, variance from baseline shift, projected end state
- System indicates which changes were system-suggested vs manual
- PL reviews everything, then submits
- **Submission routes CRs to the relevant CC Owner(s) for Stage 1 confirmation** (not directly to Controller)

**Phase 5 — Two-Stage Approval**
- CRs first appear in CC Owner's Request Management view for operational confirmation (Stage 1)
- After CC confirmation, CRs advance to Controller's approval queue in Portfolio Overview (Stage 2)
- Both stages should complete within the same monthly cycle
- Until fully approved (both stages), forecast remains unchanged in all views
- Once approved, new forecast becomes current; CR permanently logged

### 5.4 Change Request Properties

Every CR records:
- Timestamp of submission
- Submitted by (user)
- Project/service affected
- Change category (scope, timeline, resource, external cost, other)
- Per-group: field changed, old value, new value, delta
- Justification text (per group)
- Whether system-suggested or manual
- **CC Owner confirmation status + confirming CC Owner + confirmation timestamp**
- **Assigned person name (for resource requests)**
- **Controller approval status + approving Controller + approval timestamp**
- CC Owner comments (if any)
- Controller comments (if any)

---

## 6. Mock Data Specification

> **Guiding principle:** The mock data must be sufficient to demonstrate every screen, every workflow, and every endpoint in the application without requiring any manual setup by the presenter. It must also be structured so that adding projects, people, or scenarios later requires minimal effort — ideally adding rows to a data file, not modifying code.

### 6.1 Demo Date & Time Range

**The demo assumes the current date is February 2026.** All "current month" logic, forecast boundaries, actuals cutoffs, and notification text are calibrated to this date.

| Period | Data State | Purpose |
|--------|-----------|---------|
| **2023** | Fully historical — actuals only | Completed projects, archived data, trajectory history |
| **2024** | Historical — actuals for all months | Projects that ran through 2024, some still active into 2025 |
| **2025** | Historical — full year of actuals | Establishes recent history; actuals diverge from forecasts to create interesting variances |
| **2026 Jan** | Historical — actuals recorded | Most recent completed month; drives Phase 1 retrospective in forecast wizard |
| **2026 Feb–Dec** | Current + forward — forecast only | Feb is "current month"; Mar–Dec is forward-looking forecast |
| **2027** | Forward looking — forecast only | Planned/future projects, long-range resource planning |

### 6.2 Organizational Structure

**Lines of Business (3):**

| LoB ID | Name | Description |
|--------|------|-------------|
| lob-ts | Truck Systems | Largest LoB by budget; mix of large programs and operational services |
| lob-rs | Rail Systems | Medium-sized; fewer but bigger projects, steady services |
| lob-cv | Commercial Vehicle | Smallest; newer initiatives, growing investment |

**Locations (3):**

| Location | City | Country | Character |
|----------|------|---------|-----------|
| MUC | Munich | Germany | HQ, largest teams, most cost centers |
| BUD | Budapest | Hungary | Significant development center |
| PUN | Pune | India | Growing team, cost-advantaged |

**Cost Centers (6):** Two per location, each belonging to one competence center.

| CC ID | Name | Location | Competence Center | Headcount | Notes |
|-------|------|----------|------------------|-----------|-------|
| cc-muc-appdev | MUC Application Development | MUC | Application Development | ~8 | Largest team; high demand, some over-allocation |
| cc-muc-infra | MUC Infrastructure & Cloud | MUC | Infrastructure & Cloud | ~5 | Steady utilization, operational focus |
| cc-bud-appdev | BUD Application Development | BUD | Application Development | ~6 | Active project work, mixed utilization |
| cc-bud-bizsol | BUD Business Solutions | BUD | Business Solutions | ~4 | Smaller team, niche skills |
| cc-pun-appdev | PUN Application Development | PUN | Application Development | ~4 | Growing, some under-utilization |
| cc-pun-infra | PUN Infrastructure & Cloud | PUN | Infrastructure & Cloud | ~3 | Smallest team |

**Competence Centers (3):** Functional groupings that determine blended hourly rates.

| Competence Center | Cost Centers | Character |
|------------------|-------------|-----------|
| Application Development | cc-muc-appdev, cc-bud-appdev, cc-pun-appdev | Highest demand, most project variety |
| Infrastructure & Cloud | cc-muc-infra, cc-pun-infra | Operational focus, steady utilization |
| Business Solutions | cc-bud-bizsol | Specialized, fewer but targeted allocations |

### 6.3 Demo Personas (Role Switcher)

Four named personas the presenter switches between. Each must be a real person in the people data (Section 6.5) with the correct cost center and project assignments to make their view meaningful.

| Role | Persona Name | Title | Home CC | What Their View Shows |
|------|-------------|-------|---------|----------------------|
| **Controller** | Anna Meier | IT Financial Controller | — (portfolio-wide) | Full portfolio visibility; pending CRs in approval queue; intake queue items; all modules accessible |
| **Cost Center Owner** | Thomas Brenner | Head of MUC Application Development | cc-muc-appdev | "My Team" tab shows his ~8 people; pending resource requests from projects drawing on his team; Organization Overview for cross-CC comparison |
| **Project/Offering Lead** | Priya Sharma | Project Lead | — (project-scoped) | Her 3–4 assigned projects in Workbench; can start forecast cycle; sees CR history and statuses for her projects |
| **Executive** | Dr. Klaus Weber | VP IT Strategy | — (portfolio-wide) | Read-only portfolio view; aggregated dashboards; What-If Simulator access; no person-level detail |

### 6.4 Programs, Projects & Services

#### 6.4.1 Hierarchy

Projects and services are organized under LoBs, with some grouped into programs/initiatives. The portfolio tree renders as: **LoB → Program (optional) → Project/Service**.

#### 6.4.2 Programs/Initiatives

| Program | LoB | Projects Under It |
|---------|-----|-------------------|
| Digital Braking Platform | Truck Systems | ERP Integration Phase 2, Sensor Data Pipeline |
| Fleet Management Suite | Commercial Vehicle | Fleet Portal v2, Telematics Dashboard |

Projects not listed under a program appear directly under their LoB (flat, no intermediate grouping).

#### 6.4.3 Projects (~15)

Each project needs: name, LoB, program (if any), status, RAG, CapEx/OpEx classification, timeline, assigned PL, budget scale, and a narrative purpose explaining why it exists in the demo data.

| # | Project Name | LoB | Program | Status | RAG | CapEx/OpEx | Timeline | PL | Budget Scale | Demo Purpose |
|---|-------------|-----|---------|--------|-----|------------|----------|----|--------------|----|
| 1 | ERP Integration Phase 2 | Truck Systems | Digital Braking Platform | Active | 🔴 Red | CapEx | 2025-01 → 2026-09 | Priya Sharma | Large (~€1.2M) | **Primary demo project.** Over budget, many CRs, complex history. Mid-cycle — forecast review due. Drives forecast wizard walkthrough. |
| 2 | Sensor Data Pipeline | Truck Systems | Digital Braking Platform | Active | 🟡 Amber | CapEx | 2025-06 → 2026-12 | Priya Sharma | Medium (~€600K) | Second project for PL persona. Amber because of recent consulting overrun. Has system suggestions ready. |
| 3 | SAP S/4HANA Migration | Truck Systems | — | Active | 🟢 Green | CapEx | 2024-01 → 2026-06 | Other PL | Large (~€2M) | Largest project in portfolio. On track. Shows what a healthy large project looks like. |
| 4 | Brake Control Unit Refresh | Truck Systems | — | Active | 🟢 Green | CapEx | 2025-03 → 2026-03 | Other PL | Small (~€250K) | Simple, on-track project. Minimal CR history. |
| 5 | Predictive Maintenance PoC | Rail Systems | — | Active | 🟡 Amber | CapEx | 2025-09 → 2026-12 | Priya Sharma | Medium (~€500K) | Third project for PL persona. Amber due to resource delays — requested senior developer not yet assigned. |
| 6 | Signaling System Upgrade | Rail Systems | — | Active | 🟢 Green | CapEx | 2024-06 → 2026-03 | Other PL | Large (~€1.5M) | Nearing completion, mostly actuals. Good for trajectory chart. |
| 7 | Rail Diagnostics Platform | Rail Systems | — | Active | 🟢 Green | CapEx | 2025-06 → 2027-06 | Other PL | Medium (~€700K) | Long-running, steady. |
| 8 | Fleet Portal v2 | Commercial Vehicle | Fleet Management Suite | Active | 🟢 Green | CapEx | 2025-01 → 2026-06 | Other PL | Medium (~€450K) | Part of CV program. |
| 9 | Telematics Dashboard | Commercial Vehicle | Fleet Management Suite | Active | 🟡 Amber | CapEx | 2025-09 → 2026-09 | Other PL | Small (~€300K) | Amber — behind schedule by 1 month. |
| 10 | Cloud Migration Wave 3 | Truck Systems | — | Active | 🟢 Green | OpEx | 2025-06 → 2026-06 | Other PL | Medium (~€400K) | OpEx project — shows CapEx/OpEx split in portfolio. |
| 11 | Data Warehouse Consolidation | Rail Systems | — | Planned | 🟢 Green | CapEx | 2026-04 → 2027-06 | Other PL | Medium (~€550K) | Future project — no actuals yet. Useful for What-If "freeze new starts" demo. |
| 12 | AI/ML Experimentation Lab | Commercial Vehicle | — | Planned | 🟢 Green | CapEx | 2026-06 → 2027-03 | Other PL | Small (~€200K) | Future, small — good candidate for What-If removal. |
| 13 | Legacy System Decommission | Truck Systems | — | Completed | 🟢 Green | OpEx | 2023-01 → 2024-06 | Other PL | Small (~€180K) | Historical project — shows completed state in portfolio. |
| 14 | Workshop Management Tool | Rail Systems | — | Completed | 🟢 Green | CapEx | 2023-06 → 2025-03 | Other PL | Small (~€220K) | Recently completed — full actuals through completion. |
| 15 | **Autonomous Braking Prototype** | Truck Systems | — | **Pending Approval** | — | CapEx | 2026-06 → 2027-12 | Priya Sharma | Large (~€900K) | **Intake queue item.** Submitted by PL persona, awaiting controller review. Drives intake approval demo. |

**Distribution check:** Truck Systems has the most projects (7), Rail Systems has 5, Commercial Vehicle has 3. Mix of large/medium/small. Three RAG reds/ambers to make dashboards interesting. Two completed, two planned/future, one pending approval. Priya Sharma owns 4 (3 active + 1 pending).

#### 6.4.4 Operational Services (~8)

Ongoing services with no end date. Lower variance, steady forecasts. Classified as OpEx.

| # | Service Name | LoB | Budget (annual) | Notes |
|---|-------------|-----|-----------------|-------|
| 1 | SAP Basis Operations | Truck Systems | ~€400K/yr | Largest service |
| 2 | Network & Security Operations | Truck Systems | ~€350K/yr | Infrastructure-heavy |
| 3 | End User Computing Support | Truck Systems | ~€200K/yr | |
| 4 | Rail IT Service Desk | Rail Systems | ~€250K/yr | |
| 5 | Rail Application Maintenance | Rail Systems | ~€300K/yr | |
| 6 | CV IT Operations | Commercial Vehicle | ~€150K/yr | Smallest |
| 7 | Enterprise Middleware | Truck Systems | ~€280K/yr | Cross-cutting |
| 8 | Database Administration | Rail Systems | ~€180K/yr | |

### 6.5 People & Allocations

#### 6.5.1 People (~30)

Fictional names matching location culture. Each person has a role, a home cost center, and allocation data.

**Roles used across cost centers:**

| Role | Typical Hourly Rate | Where Found |
|------|-------------------|-------------|
| Senior Developer | €95/hr | MUC, BUD, PUN AppDev |
| Developer | €75/hr | MUC, BUD, PUN AppDev |
| Business Analyst | €85/hr | BUD BizSol, MUC AppDev |
| Project Manager | €90/hr | MUC AppDev, BUD BizSol |
| Solution Architect | €105/hr | MUC AppDev, MUC Infra |
| System Administrator | €70/hr | MUC Infra, PUN Infra |
| Cloud Engineer | €85/hr | MUC Infra, PUN Infra |
| Test Engineer | €70/hr | BUD AppDev, PUN AppDev |

**People generation rules:**
- Each cost center has the headcount listed in Section 6.2
- Names follow location convention: German names for MUC, Hungarian names for BUD, Indian names for PUN
- The 4 demo personas (Section 6.3) must be included in the people list
- At least 2–3 people should be over-allocated (>100% utilization in some months) to show red cells in the heatmap
- At least 2–3 people should be under-utilized (<70%) to show blue cells
- Most people should be in the 70–100% range

**Example people (cc-muc-appdev — Thomas Brenner's team):**

| Name | Role | Utilization Pattern | Notes |
|------|------|--------------------|-------|
| Thomas Brenner | Project Manager | 85% | Demo persona (CC Owner). Also manages team. |
| Lena Fischer | Senior Developer | 105% in Mar–May | Over-allocated — assigned to ERP Integration and SAP Migration simultaneously. **Key demo data point** for heatmap red cells and assignment preview. |
| Markus Wolf | Developer | 60% | Under-utilized — recently freed from completed project. Blue cells in heatmap. Good candidate for assignment preview. |
| Sophie Bauer | Solution Architect | 90% | Near capacity. |
| ... | ... | ... | Generate 4 more following this pattern |

Similar tables would be generated for the remaining 5 cost centers. The data generation script produces the full list; the spec defines the patterns and constraints.

#### 6.5.2 Allocation Matrix

The core data structure for capacity management. For every (person, project, month) combination where an allocation exists, there is an hours value.

**Structure:** `person_id × project_id × month → hours_allocated`

**Constraints:**
- A person's total hours across all projects in a given month should match their utilization percentage (assuming ~160 hours/month = 100%)
- Allocations must be consistent with project timelines — no hours allocated outside a project's active period
- Allocations must be consistent with CR history — if a CR added a person to a project, the allocation should start from when the CR was approved
- Some allocations should have pending requests (not yet confirmed by CC Owner) to populate the request management view

### 6.6 Financial Data

#### 6.6.1 Blended Hourly Rates

| Competence Center | Blended Rate (€/hr) | Notes |
|------------------|--------------------|----|
| Application Development | €85 | Weighted average across MUC/BUD/PUN |
| Infrastructure & Cloud | €78 | Lower due to PUN mix |
| Business Solutions | €88 | BUD-only, specialized |

Individual rates by role are in Section 6.5.1. The blended rate is used for portfolio-level cost estimation and the new project submission auto-calculation.

#### 6.6.2 External Cost Types

| Cost Type | Typical Monthly Range | Which Projects Use It |
|-----------|----------------------|----------------------|
| Consulting | €5K–€50K | ERP Integration, SAP Migration, Signaling Upgrade |
| Cloud Services | €3K–€20K | Cloud Migration, Sensor Data Pipeline, Fleet Portal |
| Travel | €1K–€5K | Projects with cross-location teams |
| Subscriptions | €500–€3K | Most projects (tools, licenses) |
| Training | €1K–€8K | New technology projects |
| Leased Staff | €5K–€25K | ERP Integration, SAP Migration |
| Maintenance SW | €2K–€10K | Services primarily |
| Maintenance HW | €1K–€8K | Infrastructure services |
| Other | varies | Catch-all |

#### 6.6.3 Baseline / Forecast / Actuals Divergence Patterns

Not all projects diverge the same way. The mock data must include a mix of patterns to make dashboards, charts, and variance analysis meaningful.

| Pattern | Projects That Show It | Effect |
|---------|----------------------|--------|
| **On track** — actuals ≈ forecast ≈ baseline | SAP S/4HANA Migration, Brake Control Unit, Fleet Portal, most services | Green RAG, low variance. The "normal" state. |
| **Creeping overrun** — actuals consistently 5–15% above forecast | ERP Integration Phase 2 | Amber→Red RAG. Drives system suggestion: "hours have exceeded forecast by X% over 3 months." |
| **Cost spike** — one external cost type suddenly jumps | Sensor Data Pipeline (consulting) | Amber RAG. Drives system suggestion: "consulting costs overran by 50% for 2 months." |
| **Under-spend** — actuals below forecast | Predictive Maintenance PoC | Amber RAG (resource delays mean slower start). Developer hours below allocation. |
| **Seasonal dip** — December and holiday months lower | Cloud Migration Wave 3 | Drives seasonal pattern suggestion. |
| **Completed on budget** — actuals match baseline at project end | Legacy System Decommission, Workshop Management Tool | Clean historical data. Shows what a healthy completed project looks like in trajectory charts. |
| **Completed over budget** — final actuals exceeded baseline | (add one completed project if needed) | Shows total variance in historical context. |

### 6.7 Change Request History

Pre-generated CRs attached to specific projects. Must cover every lifecycle state and both manual and system-suggested origins.

#### 6.7.1 CR Distribution by Project

| Project | # CRs | Character | Purpose |
|---------|-------|-----------|---------|
| ERP Integration Phase 2 | 8–10 | Unstable — frequent changes, some system-suggested, some rejected | **Primary CR demo project.** Shows a messy but realistic CR history. |
| Sensor Data Pipeline | 3–4 | Moderate — one consulting cost increase, one resource change | Shows a project with some changes. |
| SAP S/4HANA Migration | 2 | Stable — minor adjustments, all approved | Shows a well-managed project. |
| Predictive Maintenance PoC | 2–3 | Resource-focused — requests for additional developer hours | Drives pending request demo. |
| Most other active projects | 0–2 | Minimal | Background data. |
| Services | 0–1 each | Very stable | Reinforces that services rarely change. |

#### 6.7.2 CRs at Each Lifecycle Stage

The demo state must include CRs at every stage so each view has content to show.

| Lifecycle State | Count | Which Projects | Notes |
|----------------|-------|---------------|-------|
| **Pending CC Confirmation** | 2–3 | ERP Integration, Predictive Maintenance | Populates CC Owner's request management queue |
| **Pending Controller Approval** | 2–3 | ERP Integration, Sensor Data Pipeline | Populates controller's Approvals tab |
| **Approved** | 10+ | Spread across projects | Bulk of historical CRs |
| **Rejected** | 1–2 | ERP Integration | Shows rejected state in change history |
| **Sent Back by CC** | 1 | Predictive Maintenance | Shows the "returned for revision" state |
| **Sent Back by Controller** | 1 | ERP Integration | Shows controller send-back |

#### 6.7.3 CR Content Examples

Each CR needs realistic content — not just a status marker. A few fully fleshed-out examples for the data generation script to follow:

**Example CR 1 — System-suggested, Approved:**
- Project: ERP Integration Phase 2
- Category: Resource
- Summary: "Increase Senior Developer hours Mar–Jun 2026"
- Old: 120 hrs/month → New: 140 hrs/month
- System-suggested: Yes (trend-based — hours exceeded forecast by 12% avg over 3 months)
- CC Owner: Thomas Brenner confirmed, assigned Lena Fischer
- Controller: Anna Meier approved
- Justification: "Accepted system recommendation. Integration testing phase requires sustained higher effort."

**Example CR 2 — Manual, Pending Controller Approval:**
- Project: Sensor Data Pipeline
- Category: External Cost
- Summary: "Increase consulting budget Apr–Aug 2026"
- Old: €15K/month → New: €22K/month
- System-suggested: No
- CC Owner: Thomas Brenner confirmed (external cost — no person assignment)
- Controller: Pending
- Justification: "Vendor negotiations resulted in higher rates for specialized IoT consulting."

**Example CR 3 — Manual, Rejected:**
- Project: ERP Integration Phase 2
- Category: Timeline
- Summary: "Extend project end date from Sep 2026 to Dec 2026"
- System-suggested: No
- CC Owner: Confirmed
- Controller: Anna Meier rejected
- Rejection reason: "Budget ceiling for FY2026 cannot accommodate 3 additional months. Please explore scope reduction or acceleration."

### 6.8 Resource & External Cost Requests

These are the Stage 1 items that populate the CC Owner's Request Management sub-view. They are linked to CRs in "Pending CC Confirmation" state.

| Request | Type | Project | Role/Category | Hours or €/month | Period | Priority | Status |
|---------|------|---------|--------------|------------------|--------|----------|--------|
| 1 | Resource | ERP Integration Phase 2 | Senior Developer | 80 hrs/month | Mar–Jun 2026 | High | Pending confirmation |
| 2 | Resource | Predictive Maintenance PoC | Developer | 120 hrs/month | Mar–Aug 2026 | Medium | Pending confirmation |
| 3 | External Cost | ERP Integration Phase 2 | Consulting | €18K/month | Apr–Jul 2026 | High | Pending confirmation |
| 4 | Resource | Sensor Data Pipeline | Test Engineer | 60 hrs/month | Apr–Jun 2026 | Low | Pending confirmation |

All four are directed at Thomas Brenner's cost center (cc-muc-appdev) so the demo persona has a meaningful queue. At least one request from another cost center should also exist (pending for a different CC Owner) so the organization-wide view shows pending activity beyond MUC AppDev.

### 6.9 Intake Queue State

Projects in the intake pipeline so the controller's Intake Queue tab has content.

| Project | Status | Submitted By | Notes |
|---------|--------|-------------|-------|
| Autonomous Braking Prototype | Pending Approval | Priya Sharma | Full estimation present — resource plan, external costs, timeline. Ready for controller review. **Primary intake demo item.** |
| (Optional: 1 additional) | Draft | Other PL | Visible to submitter and controller, not yet in the queue. Shows Draft state exists. |

### 6.10 System Suggestions

Pre-computed suggestions that appear during the forecast wizard (Phase 2) for specific projects. These must be tied to the actual financial data patterns in Section 6.6.3.

| Project | Suggestion Type | Observation | Recommendation | Pre-filled Change |
|---------|----------------|-------------|---------------|-------------------|
| ERP Integration Phase 2 | Trend-based | "Senior Developer hours have exceeded forecast by 12% on average over the last 3 months (Nov 2025 – Jan 2026)." | "Adjust remaining months (Feb–Sep 2026) upward by 12% to align forecast with actual burn rate." | Senior Developer line: +12% on each remaining month |
| ERP Integration Phase 2 | Burn rate projection | "At current spending rate, the project budget will be exhausted by July 2026 — 2 months before planned end." | "Consider requesting a budget increase of ~€120K to cover the remaining timeline, or reduce scope." | (No pre-fill — informational only) |
| Sensor Data Pipeline | Actuals-based correction | "Consulting costs exceeded forecast by 47% in both Dec 2025 and Jan 2026." | "Increase consulting forecast for Feb–Dec 2026 from €15K to €22K/month." | Consulting line: €15K → €22K for remaining months |
| Predictive Maintenance PoC | Resource utilization | "Developer hours are 35% below allocation for the last 2 months — team may be waiting on blocked dependencies." | "Reduce Developer allocation for Mar–May 2026 from 160 to 100 hrs/month until dependencies clear." | Developer line: 160 → 100 for Mar–May |

Projects with no suggestions (on track): SAP S/4HANA Migration, Brake Control Unit Refresh, Fleet Portal v2, all services. The wizard auto-skips Phase 2 for these.

### 6.11 Pre-Built What-If Scenarios

The Scenario Manager should not be empty when the demo starts. Pre-built scenarios demonstrate different types of strategic analysis and ensure the comparison view has content.

| # | Scenario Name | Author | Status | Actions Applied | Headline Impact | Demo Purpose |
|---|--------------|--------|--------|----------------|----------------|-------------|
| 1 | "FY2026 Budget Pressure — Conservative" | Anna Meier (Controller) | Published | Delay Data Warehouse Consolidation to 2027; Remove AI/ML Experimentation Lab; Reduce Truck Systems consulting by 15% | –€1.4M, 2 projects deferred/removed, 3 FTEs freed | Shows a realistic budget-cutting scenario with moderate trade-offs |
| 2 | "Accelerate Rail Digitalization" | Anna Meier (Controller) | Private | Accelerate Predictive Maintenance PoC by 3 months; Add €200K to Rail Diagnostics Platform; Reduce Commercial Vehicle by 10% | +€350K net, Rail investment up 18%, CV reduced | Shows rebalancing between LoBs — strategic prioritization |
| 3 | "Worst Case — 20% Across-the-Board Cut" | Dr. Klaus Weber (Executive) | Published | Across-the-board cut: 20% on all discretionary projects | –€3.2M, all projects impacted, 8 FTEs freed, 5 projects move to Amber/Red | Stress test scenario — shows cascading damage. Good for comparison view. |

Each scenario needs full recalculated state: adjusted budgets per project, updated RAG statuses, capacity impact per cost center, FTE deltas. These are pre-computed and stored — no runtime calculation needed for the demo.

### 6.12 AI Advisor Pre-Computed Goals

> **This resolves Decision #21.**

The AI Advisor matches user-entered goal text against pre-computed patterns and returns pre-built solution paths. For the demo, we need 3–4 goal patterns with 2–3 paths each. The matching can be simple keyword/intent matching — it doesn't need NLP sophistication.

#### Goal 1: "Find €2M in savings" (or similar: "cut budget by €2M", "reduce spend by 2 million")

| Path | Name | Approach | Trade-offs | Headline Numbers | Constituent Actions |
|------|------|----------|-----------|-----------------|-------------------|
| A | Conservative: Delay & Defer | Delay planned projects and reduce discretionary external costs | Lower risk — no active projects cancelled; savings come from timing, not cuts | –€2.1M, 0 active projects affected, 2 planned projects deferred | Delay Data Warehouse Consolidation to 2027-Q3; Remove AI/ML Experimentation Lab; Reduce consulting across portfolio by 10% |
| B | Moderate: Targeted Cuts | Pause lowest-priority active project + reduce one LoB | One active project paused — team needs redeployment | –€2.0M, 1 project paused, 4 FTEs freed | Pause Telematics Dashboard from Apr 2026; Cut Commercial Vehicle projects by 15%; Reduce Truck Systems consulting by 10% |
| C | Aggressive: Consolidate | Remove 2 projects and apply across-the-board cut | Significant disruption — multiple teams affected, morale risk | –€2.4M, 2 projects removed, 6 FTEs freed, 2 additional Amber RAGs | Remove Telematics Dashboard; Remove Cloud Migration Wave 3; Across-the-board cut of 5% |

**Post-apply narrative (Path A example):** "This path achieves €2.1M in savings primarily through timing shifts rather than active project cancellations. The Data Warehouse Consolidation delay creates a 9-month runway before that investment begins, and the AI/ML Lab removal eliminates a €200K commitment that hadn't started yet. The 10% consulting reduction spreads impact thinly across the portfolio. Key risk: if Data Warehouse Consolidation was sequencing-dependent on other projects, the delay could create downstream blockers in 2027. Consider validating dependencies before committing. Follow-up question: are there external cost contracts with cancellation penalties that would reduce the actual savings?"

#### Goal 2: "Get all teams below 95% utilization" (or: "resolve over-allocation", "fix capacity issues")

| Path | Name | Approach | Trade-offs | Headline Numbers | Constituent Actions |
|------|------|----------|-----------|-----------------|-------------------|
| A | Redistribute | Move allocations from overloaded MUC AppDev to BUD and PUN teams | Requires cross-location collaboration; potential timezone/quality concerns | 3 people move below 95%, €0 budget impact, 0 projects affected | Change resource allocation on ERP Integration: shift 40 hrs/month Senior Developer from MUC to BUD; Change resource allocation on SAP Migration: shift 30 hrs/month Developer from MUC to PUN |
| B | Defer & Relieve | Delay the project creating most pressure on overloaded teams | Relieves capacity but delays deliverables | 3 people move below 95%, –€180K from delay, 1 project delayed 2 months | Delay Sensor Data Pipeline by 2 months; Reduce ERP Integration Senior Developer hours by 20 hrs/month Mar–May |

#### Goal 3: "Reduce CapEx ratio to below 40%" (or: "shift CapEx to OpEx", "lower capital expenditure")

| Path | Name | Approach | Trade-offs | Headline Numbers | Constituent Actions |
|------|------|----------|-----------|-----------------|-------------------|
| A | Defer CapEx-Heavy | Delay the largest CapEx projects to shift spend into future fiscal years | Near-term ratio improves but total investment unchanged | CapEx drops to 38%, –€1.1M CapEx in FY2026, 2 projects delayed | Delay Data Warehouse Consolidation to 2027; Delay Predictive Maintenance PoC by 4 months |
| B | Cut CapEx Projects | Remove or reduce highest-CapEx investments | Permanent reduction — projects lost, not just delayed | CapEx drops to 35%, –€1.6M CapEx, 1 project removed | Remove AI/ML Experimentation Lab; Cut Brake Control Unit Refresh budget by 30%; Reduce ERP Integration by 10% |

#### Goal 4: Fallback (unrecognized input)

If the user types a goal that doesn't match any pattern, the Advisor returns a friendly message: "I wasn't able to map that goal to specific portfolio actions. Try goals related to budget reduction, capacity management, or CapEx/OpEx rebalancing — for example: 'Find €2M in savings without touching Rail Systems.'" No solution paths returned.

### 6.13 Documentation Content

Static content served through the documentation API endpoints. Must be authored as part of the data, not generated at runtime.

#### 6.13.1 Module Manuals (5)

Each manual follows the same structure defined in Section 8.2:

| Module | Key Sections to Cover |
|--------|----------------------|
| Launchpad | Alert types by role, module tiles, KPI strip, Submit New Project button, role switcher |
| Portfolio Overview | Three tabs (Dashboard/Intake/Approvals), portfolio tree navigation, summary panel, chart interpretation, filter usage, approval actions |
| Project Workbench | Project list, three workspace tabs, 3-point comparison reading, forecast wizard (all 5 phases), CR lifecycle, system suggestions |
| Capacity Management | Two tabs, heatmap reading, color meanings, drill-down, bottom drawer, Request Management sub-view, four response actions, assignment preview |
| What-If Simulator | Three phases, scenario lifecycle, project vs portfolio actions, impact dashboard, cascading drill-down, comparison view, AI Advisor usage |
| Administration | Entity type selector, CRUD operations per entity, deactivation vs deletion, cascade effects, rate table management with effective dates, planning parameter sections, save/reset behavior |

**Format:** Each manual is a structured markdown document with sections. The API returns it as an array of `{ title, body }` objects.

**Content depth:** Concise reference — not a user training document. Each section should be 3–8 sentences covering what the feature does, how to use it, and what the visual indicators mean. Total per module: roughly 500–1000 words.

#### 6.13.2 FAQ Walkthroughs (~12)

Each FAQ entry follows the structure defined in Section 8.3. Task-oriented, cross-cutting, step-by-step.

| # | Question | Applicable Roles | Modules Involved | Steps (summary) |
|---|----------|-----------------|-----------------|-----------------|
| 1 | "How do I submit my monthly forecast?" | PL | Project Workbench | Open project → Start Monthly Review → walk through 5 phases → submit |
| 2 | "How do I respond to a resource request?" | CC Owner | Capacity Management | Go to My Team → Resource Requests → select request → review availability → choose action |
| 3 | "How do I approve a change request?" | CC Owner, Controller | Capacity Management, Portfolio Overview | Stage 1: CC Owner in request management → Stage 2: Controller in Approvals tab |
| 4 | "How do I submit a new project?" | PL | Launchpad | Click Submit New Project → fill form → submit → await approval |
| 5 | "How do I create a What-If scenario?" | Controller, Executive | What-If Simulator | Open Simulator → Create New → name it → add actions → review impacts |
| 6 | "How do I compare scenarios?" | Controller, Executive | What-If Simulator | Open Simulator → Compare Scenarios → select up to 3 → view side-by-side |
| 7 | "What do the RAG colors mean?" | All | All | Green/Amber/Red thresholds for budget and timeline, how combined RAG works, where they appear |
| 8 | "How does the two-stage approval work?" | All | Project Workbench, Capacity Management, Portfolio Overview | PL submits → CC Owner confirms (Stage 1) → Controller approves (Stage 2) |
| 9 | "How do I read the 3-point comparison?" | PL, Controller | Project Workbench | Baseline vs forecast vs actuals, three variance types, what each reveals |
| 10 | "How do I check my team's utilization?" | CC Owner | Capacity Management | My Team tab → read heatmap → click person for detail → review allocations |
| 11 | "How do I add a new cost center?" | Controller | Administration | Open Administration → select Cost Centers → Add New → fill in name, location, competence center → Save |
| 12 | "How do I update hourly rates?" | Controller | Administration | Open Administration → select Rate Tables → choose competence center → edit rates → set effective date → Save |

**Format:** Each walkthrough is an array of `{ step_number, instruction, target_module }` objects. Instructions are markdown-formatted, 1–2 sentences each. Typically 4–8 steps per walkthrough.

### 6.14 Notification State

Notifications are derived from the demo data state. The generation script must produce notifications consistent with the CR, request, and project states defined above.

| Role | Notifications | Source Data |
|------|--------------|------------|
| **Controller (Anna Meier)** | "3 change requests pending your approval" | CRs in "Pending Controller Approval" state |
| | "1 new project awaiting review: Autonomous Braking Prototype" | Intake queue item |
| | "Portfolio variance at 6.2% — 2 projects in Red status" | Aggregate portfolio health |
| **CC Owner (Thomas Brenner)** | "4 resource/cost requests pending your confirmation" | Requests from Section 6.8 |
| | "Team utilization alert: Lena Fischer at 105% in March" | Allocation data |
| **PL (Priya Sharma)** | "Monthly forecast review is due for ERP Integration Phase 2" | Mid-cycle project state |
| | "Your CR for Sensor Data Pipeline was approved" | Recent approved CR |
| | "Your project submission 'Autonomous Braking Prototype' is under review" | Intake item status |
| **Executive (Dr. Klaus Weber)** | "Portfolio health: 12 of 15 projects on track. 2 Amber, 1 Red." | Aggregate RAG |
| | "Published scenario 'Worst Case — 20% Cut' shows –€3.2M impact" | Published scenario |

### 6.15 Demo Walkthrough Anchors

Explicit list of presenter demonstrations that the mock data must support. Every item below must "just work" when the presenter walks through it — no data gaps.

| # | Demo Scenario | Required Data State | Key Screen |
|---|--------------|--------------------|----|
| 1 | **Switch between all 4 roles** and see different landing views | All 4 personas with correct module access and landing defaults | Launchpad |
| 2 | **Browse the portfolio tree**, expand LoBs, click a project, see summary panel | Full hierarchy with aggregated values at every level | Portfolio Overview — Dashboard |
| 3 | **Review and approve a new project submission** | Autonomous Braking Prototype in Pending Approval state with full estimation | Portfolio Overview — Intake |
| 4 | **Review and approve a pending change request** | 2–3 CRs in "Pending Controller Approval" with full detail | Portfolio Overview — Approvals |
| 5 | **Walk through the monthly forecast wizard** (all 5 phases) | ERP Integration Phase 2 mid-cycle with actuals diverging from forecast; system suggestions ready | Project Workbench — Forecast & Planning |
| 6 | **Browse CR history** for a project with many changes | ERP Integration Phase 2 with 8–10 CRs at various states | Project Workbench — Change History |
| 7 | **View team heatmap**, identify over-allocated person, drill into their project breakdown | Thomas Brenner's team with Lena Fischer at >100% | Capacity Management — My Team |
| 8 | **Respond to a resource request** with assignment preview | Pending request + available people with varying utilization | Capacity Management — Request Management |
| 9 | **View organization-wide heatmap** with all three pivot dimensions | Full allocation data across all 6 cost centers | Capacity Management — Organization Overview |
| 10 | **Open an existing What-If scenario**, review its impacts and drill down | Pre-built scenario #1 with full cascading impact data | What-If Simulator — Workspace |
| 11 | **Create a new scenario**, apply 2–3 actions, see recalculation** | Current portfolio state as starting point | What-If Simulator — Workspace |
| 12 | **Compare scenarios side by side** | Pre-built scenarios #1 and #3 (conservative vs worst case) | What-If Simulator — Comparison |
| 13 | **Use the AI Advisor** — type a goal, review paths, apply one | Pre-computed goal "Find €2M in savings" with 3 paths | What-If Simulator — AI Advisor |
| 14 | **Open module guide** and browse help content | Module manual for current module | Any module — Guide button |
| 15 | **Open FAQ** and walk through a task | FAQ entry #1 "How do I submit my monthly forecast?" | Top bar — Help icon |
| 16 | **Add a new cost center** in Administration | Admin module accessible as Controller; entity tables populated with seed data | Administration — Tier 1 |
| 17 | **Update hourly rates** with a new effective date | Rate table with current rates, effective date logic | Administration — Tier 1 |

### 6.16 Mock Data Generation Approach ✅ DECIDED

> **This resolves Decision #19.**

**Approach:** SQL seed file for relational data + JSON fixtures for static content.

**SQL seed file:**
- A single SQL file (`seed.sql`) containing all `INSERT` statements for the relational database: organizational structure, people, projects, services, allocations, financial data (baseline/forecast/actuals), change requests, resource requests, scenarios, scenario actions, notifications, and KPI definitions.
- Generated once by Claude Code during the build phase. Claude Code uses the data inventory in Sections 6.1–6.15 as its source of truth and handles all the consistency arithmetic (allocations summing to utilization percentages, financial patterns matching project narratives, CR states matching request states, etc.).
- The seed file is transparent and surgically editable — if a specific data point needs adjustment post-generation, a developer can find and modify the relevant INSERT statement directly.
- Loaded into SQLite on application startup (or via a reset endpoint for demo recovery).

**JSON fixtures:**
- Separate JSON files for static content that doesn't belong in the relational schema: module manuals, FAQ walkthroughs, AI Advisor pre-computed goal responses (goal patterns, solution paths, post-apply narratives).
- Served through the documentation and AI Advisor API endpoints as-is.
- Easier to author and review as JSON than as SQL INSERT statements, since this content is prose-heavy.

**Runtime behavior:**
- Demo data changes happen through the application itself — CRs, scenario actions, What-If modeling, intake approval. The seed data provides the initial state; the application operates on it normally at runtime.
- No regeneration mechanism needed. If the demo data gets into an undesirable state, reloading the seed file resets everything.

---

## 7. Module Screen Specifications

### 7.1 Launchpad ✅ DECIDED

**Layout: Three sections + action button**

**Top — Role-aware alerts & notifications**
- Controller: "X change requests pending approval," "Y new projects awaiting review"
- CC Owner: "X incoming resource requests pending confirmation"
- PL: "Monthly forecast review is due for [project]," "Your CR for [project] was approved/rejected"
- Executive: Portfolio health summary sentence

**Middle — Module tiles**
- Five cards, one per module (six once Tier 3 is added)
- Each shows: module name, one-line description, contextual metric
  - Portfolio Overview: "47 active projects, 3 red"
  - Project Workbench: "Your 4 projects, 1 forecast overdue"
  - Capacity Management: "2 teams over-allocated"
  - What-If Simulator: "2 saved scenarios" *(visible to Controller/Executive only)*
  - Administration: "6 cost centers, 30 people" *(visible to Controller only)*
- Ordered by role relevance (PL sees Workbench first, Controller sees Portfolio first)
- Click → opens module

**"Submit New Project" button** — prominent action button (visible to PL role). Opens the new project initiation form (Workflow 1). This is the only entry point for new project creation.

**Bottom — Quick metrics strip**
- 4-5 top-level KPIs (not role-specific):
  - Total IT Budget (€Xm)
  - YTD Spend (€Ym)
  - Portfolio Variance (±Z%)
  - Overall Utilization (X%)
  - Run/Change Ratio (X/Y%)

### 7.2 Portfolio Overview ✅ DECIDED

**Three tabs across the top of the module.**

#### Tab 1 — Portfolio Dashboard (default)

**KPI summary row (top):**
- Total budget, YTD spend, forecast-at-completion, overall variance %, CapEx/OpEx split, Run/Change ratio

**Filter bar:**
- LoB, status, RAG, cost center, type (project/service/all)

**Main content: Portfolio table (expandable tree)**
- Full three-level hierarchy: LoB → Program/Initiative → Project/Service
- LoB rows expand to show programs, programs expand to show projects
- Table columns: name, LoB, type (project/service), status, RAG, baseline budget, current forecast, actuals YTD, variance %, timeline
- Sortable and filterable
- Aggregate values roll up at each level

**Project click behavior: Right-side summary panel**
- Clicking a project row opens a slide-in panel on the right (portfolio table remains visible on the left)
- Panel shows: RAG status, budget snapshot (baseline/forecast/actuals), timeline bar, last CR summary, forecast trend sparkline
- "Open in Workbench →" button for full detail (cross-links to Project Workbench)
- This enables controller "triage" workflow — scanning many projects quickly without leaving the portfolio view

**Charts (right side or collapsible panel):**
- Budget by LoB (stacked bar chart)
- Forecast trajectory over time (line chart — shows how total forecast shifted month-over-month)
- RAG distribution (donut chart)

#### Tab 2 — Intake Queue

**Table of pending new project submissions (from Workflow 1):**
- Columns: project name, submitted by, LoB, estimated budget, estimated timeline, submission date, status (pending/in review)
- Clicking a row opens a detail panel with full estimation
- Controller actions: Approve / Reject / Send back with comments

#### Tab 3 — Approvals

**Table of pending Change Requests that have passed CC Owner confirmation (Stage 2 of the CR pipeline).**
- Only CRs with status "Pending Controller Approval" appear here — the CC Owner has already confirmed operational feasibility
- Columns: project name, CR summary, submitted by, CC Owner who confirmed, impact (€ delta), submission date
- Clicking a row opens full CR detail including: what changed, why, impact, whether system-suggested, CC Owner's confirmation details (assigned person for resource requests), CC Owner comments
- Controller actions: Approve / Reject / Send back with comments

### 7.3 Project Workbench ✅ DECIDED

**Master-detail layout.**

#### Left panel — Project list
- Collapsible panel showing projects filtered by role (PL sees their projects, Controller sees all)
- Each project entry shows: project name, RAG indicator, type badge (project/service), next action due (e.g., "Forecast review due")
- **PL submissions:** Projects in Draft or Pending Approval status also appear in the PL's project list, marked with a status badge ("Draft" / "Pending Approval"). This gives PLs visibility into their own submissions without requiring a separate view. These entries are read-only — the PL can see the status but cannot edit a submitted project until it's sent back.
- Clicking a project loads it into the workspace on the right
- Can also arrive here via cross-link from Portfolio Overview (project pre-selected)

#### Right panel — Project workspace (three tabs)

**Tab 1 — Overview**
- Project metadata: name, LoB, status, RAG, timeline bar (start/end), PL name, sponsor
- 3-point comparison summary table: Baseline vs Current Forecast vs Actuals, broken out by internal hours, external costs, and total, with variance columns (plan drift, execution variance, total variance)
- Monthly trajectory line chart: three lines (baseline, forecast, actuals) over the project's lifetime
- CapEx/OpEx breakdown (inline or side panel)
- Resource plan summary: confirmed vs pending allocations per role

**Tab 2 — Forecast & Planning**
- **Read mode (default):** Current forecast grid showing roles × months (hours) and cost types × months (EUR). Non-editable. Shows confirmed resource allocations alongside.
- **Cycle mode:** Triggered by "Start Monthly Review" button. Launches a skippable 5-phase wizard:
  - Phase 1 — Retrospective (can skip)
  - Phase 2 — System Suggestions (auto-skipped if no suggestions)
  - Phase 3 — Edit Forecast
  - Phase 4 — Review & Submit
  - Phase 5 — Confirmation / awaiting approval
- Resource plan detail also accessible from this tab

**Tab 3 — Change History**
- Chronological log of all CRs for this project
- Each CR is expandable: what changed, who submitted, justification, whether system-suggested, **full lifecycle status (CC confirmation status + Controller approval status)**, assigned person (for resource requests), CC Owner comments, Controller comments
- Filterable by: category (scope, timeline, resource, external cost, other) and status (all lifecycle states: pending CC, pending controller, approved, rejected, sent back)

### 7.4 Capacity Management ✅ DECIDED

**Two-tab structure with role-dependent default landing.** CC Owner lands on "My Team," Controller/Executive lands on "Organization Overview." Both tabs accessible to all roles.

#### Tab 1 — My Team (CC Owner default)

**Persistent "Resource Requests" button:**
- Always visible (top area of the tab), regardless of whether requests are pending
- When pending requests exist: button receives a subtle visual emphasis (accent color shift) to draw attention without cluttering the interface — no badge counter
- Clicking navigates to the Request Management sub-view (see Section 7.4.1)

**Summary bar (top):**
- Team headcount, average utilization %, number of over-allocated people, number of pending requests

**Main content: Role → Person expandable grid**
- Rows = roles within the CC Owner's cost center (e.g., Senior Developer, Business Analyst, Project Manager)
- Expanding a role shows individual people assigned to that role
- Columns = months
- Cells show utilization % or allocated hours, color-coded:
  - Green: 70–90% utilization
  - Amber: 90–100% utilization
  - Red: >100% utilization (over-allocated)
  - Blue: <70% utilization (under-utilized)

**Bottom drawer (on person click):**
- Clicking a person row opens a bottom drawer showing:
  - Which projects they are allocated to
  - Hours per project per month
  - Available (unallocated) capacity per month
  - Pending requests that could affect their allocation

#### 7.4.1 Request Management Sub-View

**Entry:** CC Owner clicks the persistent "Resource Requests" button on "My Team" tab. Breadcrumb updates to "CPC > Capacity Management > Resource Requests."

**Layout: Master-detail.**

**Left panel — Request queue:**
- List of all pending requests directed at this CC Owner's cost center
- Each request shows: requesting project name, PL name, request type icon/badge (resource or external cost), role or cost category, requested period, submission date
- Sortable/filterable by: type (resource/external cost), project, date
- Requests grouped by the monthly cycle they belong to (e.g., "February 2026 Cycle")

**Right panel — Request detail + availability context:**

When the CC Owner clicks a request, the right side shows two stacked sections:

**Top section — Request details:**
- Full request info: project name, PL name, justification text, role or cost type, hours or EUR per month, duration, priority
- The PL's rationale for the request

**Bottom section — Availability context (adapts to request type):**

For a **resource request** (e.g., "need Senior Developer, 80h/month, Mar–Aug"):
- Table of all people in that role within this CC
- Per-month utilization for the requested period, color-coded
- Visual indication of who has capacity to take this on
- CC Owner can select a person to assign directly from this view
- On selection, system previews what the assignment would do to that person's utilization (e.g., "Maria would go from 60% to 95% in those months")

For an **external cost request** (e.g., "need €30k consulting for testing"):
- Remaining budget for that cost category in this CC
- What's already committed vs. what's available
- Trend of spending in that category

**Action bar (bottom of right panel):**
- **Confirm** — accept as-is (with named person assigned for resource requests)
- **Partially fulfill** — opens inline editing to adjust hours, amount, or period
- **Counter-propose** — free text + adjusted figures (e.g., offer two mid-level instead of one senior)
- **Decline** — requires reason

Each action advances the CR to "Pending Controller Approval" (or sends it back to the PL for revision).

#### Tab 2 — Organization Overview (Controller/Executive default)

**Summary bar (top):**
- Org-wide headcount, average utilization across all CCs, number of CCs with over-allocation, number of CRs pending controller approval

**Pivot control:**
- Dropdown or toggle at the top: "View by: LoB / Role / Cost Center"
- Determines how heatmap rows are organized — the underlying data is the same

**Main content: Heatmap grid**
- Rows = the selected pivot dimension (LoBs, or roles across the org, or cost centers)
- Columns = months
- Cells color-coded by aggregate utilization:
  - Green: 70–90%
  - Amber: 90–100%
  - Red: >100%
  - Blue: <70%
- Expandable one level deeper:
  - LoB view → expand to see CCs within that LoB
  - Role view → expand to see CCs that have that role
  - CC view → expand to see roles within that CC
- **No person-level drill-down** — executives should not see individual names in this view. Controllers who need person-level detail can navigate to the "My Team" tab and select the relevant CC.

**Bottom drawer (on cell/row click):**
- Click a cell or row to see: which projects are consuming capacity in that dimension/period
- Hours allocated per project (aggregate)
- Whether there are pending CRs that would affect capacity in this area

### 7.5 What-If Simulator ✅ DECIDED

**Access:** Controllers and Executives only. Both roles can create, edit, and compare scenarios. PLs and CC Owners do not have access to this module.

#### 7.5.1 Purpose

Controllers and executives face portfolio-level decisions with cascading consequences — budget cuts, strategic rebalancing, risk mitigation, timing changes. Today these are evaluated mentally, in ad-hoc Excel models, or not at all before the decision is made. The What-If Simulator provides a sandbox where hypothetical changes are applied to the portfolio and the full ripple effects become visible across budget, capacity, and portfolio health — before any real commitment is made.

**Core scenario types the module supports:**

- **Budget pressure:** "Cut €2M from IT — where, with least damage?"
- **Strategic rebalancing:** "Shift investment from Truck Systems to Rail Systems"
- **Risk exploration:** "What if Project X overruns by 30%?" or "What if we lose the Budapest team?"
- **Timing decisions:** "Delay three projects to next year" or "Accelerate the ERP migration"

#### 7.5.2 Scenario Lifecycle

1. **Create** — from the current portfolio state (default) or by cloning an existing scenario
2. **Name & describe** — every scenario requires a name and optional description stating the purpose
3. **Edit** — apply hypothetical changes in a sandbox (project-level actions and/or portfolio-level rules)
4. **Save** — all scenarios save automatically; user can also save manually
5. **Publish (optional)** — promote a private scenario to the shared Published list for others to view
6. **Compare** — select multiple scenarios for side-by-side comparison against the current state

#### 7.5.3 Scenario Visibility

| Scope | Description |
|-------|-------------|
| **Private (default)** | Only visible to the creator. For experimentation and personal analysis. |
| **Published** | Visible to all controllers and executives. For scenarios intended for discussion, meetings, or decision-making. Publishing is a deliberate action — scenarios do not appear in the shared list automatically. |

**Cap:** Maximum 10 scenarios per user (across private and published combined).

#### 7.5.4 Available Scenario Actions

**Project-level actions** (applied to individual projects/services):

| Action | Effect |
|--------|--------|
| **Remove project** | Zero out all future spend and resource allocation. Project disappears from portfolio KPIs. |
| **Pause project** | Zero out future spend from a specified month onward. Project remains on books with reduced forecast. |
| **Delay project** | Shift entire remaining timeline forward by N months. Budget and resources shift accordingly. |
| **Accelerate project** | Compress remaining timeline by N months. Remaining budget concentrates into fewer months. |
| **Adjust budget** | Increase or decrease future budget by a fixed EUR amount or percentage. |
| **Change resource allocation** | Add, remove, or modify role allocations (hours per month) for future periods. |

**Portfolio-level rules** (blanket actions across multiple projects):

| Rule | Effect |
|------|--------|
| **Cut by LoB** | Reduce all projects in a specified LoB by X%. |
| **Cut by type** | Reduce all projects (or all services) by X%. |
| **Freeze new starts** | Remove all projects with a start date after a specified month. |
| **Cap cost category** | Set a maximum spend for a cost type (e.g., consulting) across the portfolio; system distributes the reduction proportionally. |
| **Across-the-board cut** | Reduce all discretionary projects by X%. Services excluded. |

Multiple actions can be combined within a single scenario (e.g., remove two specific projects AND apply a 10% cut to Truck Systems).

#### 7.5.5 Impact Metrics Tracked

When changes are applied, the following KPIs recalculate in real time:

| Metric | Description |
|--------|-------------|
| **Total portfolio budget** | Forecast-at-completion delta vs. current state |
| **YTD + remaining spend** | How the spend curve changes |
| **CapEx / OpEx split** | Ratio shift from changes |
| **Run / Change ratio** | Whether the balance shifts toward run or change |
| **Portfolio variance** | Aggregate baseline vs. new scenario forecast |
| **RAG distribution** | Count of green/amber/red projects in new state |
| **Capacity utilization by CC** | Per cost center utilization impact |
| **FTE impact** | Number of people with changed allocations, freed capacity, or new gaps |

#### 7.5.6 Phase 1 — Scenario Manager (Landing View)

**Two sections:**

**My Scenarios (top):**
- Table of the user's private and published scenarios
- Columns: scenario name, description (truncated), status badge (Private / Published), created date, last modified, headline impact summary (e.g., "–€2.1M, 3 projects removed, 4 FTEs freed")
- Row actions: Open, Clone, Publish/Unpublish, Delete
- "Create New Scenario" button (prominent)

**Published Scenarios (bottom):**
- Table of all scenarios published by any controller or executive
- Same columns as above, plus: author name
- Row actions: Open (read-only if not the author), Clone (creates a private copy for the current user)

**"Compare Scenarios" button** — opens the comparison view (Phase 3). Active when at least one scenario exists.

#### 7.5.7 Phase 2 — Scenario Workspace

**Entered by clicking Open on any scenario or by creating a new one.**

**Split layout: Action Panel (left) + Impact Dashboard (right).**

**Left — Action Panel:**

**Top section: Scenario metadata**
- Name (editable), description (editable), status badge (Private/Published)

**Middle section: Applied actions list**
- Chronological list of all actions applied in this scenario
- Each action shows: type icon, description (e.g., "Remove Project: ERP Phase 2"), impact delta for that single action
- Each action has an Undo button (removes the action and recalculates)
- Actions can be reordered (order doesn't affect calculation, but helps organize thinking)

**Bottom section: Add action controls**
- Two sub-sections with clear headers: "Project Actions" and "Portfolio Rules"
- **Project Actions:** Dropdown to select a project → dropdown to select action type → parameters (amount, months, etc.) → "Apply" button
- **Portfolio Rules:** Dropdown to select rule type → parameters (LoB, percentage, date, etc.) → "Apply" button
- Each "Apply" immediately recalculates the impact dashboard

**Right — Impact Dashboard:**

**Top: Impact Summary card**
- Rule-based templated narrative summarizing the scenario's net effect
- Example: "This scenario reduces total portfolio spend by €2.1M (–8.4%) and frees 4.2 FTEs across Munich App Dev and Budapest Infrastructure. Run/Change ratio shifts to 55/45. Warning: 2 additional projects move to Amber status."
- Updates after every action

**Middle: KPI comparison strip**
- Side-by-side current state vs. scenario state for headline metrics
- Total budget, CapEx/OpEx, Run/Change, overall RAG distribution, average utilization
- Delta indicators (arrows + green/red coloring for improvement/degradation)

**Bottom: Cascading drill-down table**
- Portfolio table showing all projects/services with scenario-adjusted values
- Columns: name, LoB, current budget, scenario budget, delta, current RAG, scenario RAG, status change
- Rows changed by the scenario are visually highlighted
- **Full drill-down depth** following the same hierarchy as the rest of the app:
  - Portfolio KPIs → LoB breakdown → Program/Project level → Cost Center impact → Role level → Individual person
  - Example: drilling into a "Cut Truck Systems by 15%" rule shows which projects were affected, then which cost centers lost allocation, then which roles, then which specific people have hours freed and how many
- Interaction pattern consistent with Capacity Management: expandable rows, click to drill deeper, bottom drawer for finest-level detail

#### 7.5.8 Phase 3 — Comparison View

**Entered from the Scenario Manager via "Compare Scenarios" button.**

**Scenario selection step:**
- User selects up to 3 scenarios from a combined list (private + published)
- "Compare" button activates when at least 1 scenario is selected

**Comparison layout:**
- **Current State is always pinned as the first (leftmost) column** — it cannot be removed. Every comparison is fundamentally "today vs. what-if."
- Selected scenarios appear as additional columns (up to 3), for a maximum of 4 columns total
- Each column shows the same KPI set: total budget, CapEx/OpEx split, Run/Change ratio, RAG distribution, utilization summary, FTE impact, key projects affected
- **Delta indicators on every metric** — each scenario column shows the delta relative to the Current State column
- Columns can be reordered (except Current State, which stays first)

**Bottom section: Detailed comparison table**
- Project-level rows showing each project's budget across all columns
- Color-coded cells for projects that differ significantly between scenarios
- Sortable by largest delta to quickly identify where scenarios diverge

#### 7.5.9 AI Advisor Panel

> **Implementation note:** Built with pre-computed responses first (backed by mock data goals that produce predetermined results). Architected with a clean abstraction layer so a real Claude API connection can be substituted without UI or structural changes. The pre-computed layer serves as the fallback when API is unavailable.

**Location:** Collapsible right-side panel within the Scenario Workspace (Phase 2). Sits alongside the Impact Dashboard, not replacing it.

**Visual identity:** Distinctly styled from the rest of the application — different background treatment (subtle gradient or accent background), its own typography weight, a small "AI-assisted" label. The panel should feel like a separate intelligence layer, clearly identifiable as an enhancement beyond the core algorithmic functionality.

**Interaction model:**

**Input: Natural language goal field**
- Text input at the top of the panel (not a form with dropdowns)
- Placeholder text suggests example goals: "e.g., Find €2M in savings without touching Rail Systems"
- User types a strategic goal in plain language

**Processing state:**
- After submitting a goal, a brief "analyzing" animation plays — not a generic spinner but something that conveys deliberation (e.g., a pulsing indicator with "Analyzing portfolio impacts..." text that cycles through stages)

**Output: 2–3 Solution Path cards**
- Each card represents a distinct strategic approach, not just tone variations
- Card contents:
  - **Path name** — descriptive label (e.g., "Conservative: Delay & Defer" or "Aggressive: Consolidate Programs")
  - **One-sentence approach description** — what this path does at a high level
  - **Key trade-offs** — explicitly stated: what you gain, what you lose
  - **Headline numbers** — budget saved/added, projects affected, capacity impact, RAG changes
- Each card has an **"Apply to Scenario"** button

**Apply behavior:**
- Clicking "Apply to Scenario" populates all constituent actions into the Action Panel at once
- Impact Dashboard recalculates immediately
- The AI Advisor panel updates with a **narrative summary** of the applied path — a 3–5 sentence analysis of what just happened, key risks to watch, and suggested follow-up questions
- Applied actions appear in the Action Panel as a grouped set, labeled with the AI path name, individually undoable

**Example goal-response pairs (to be fleshed out with mock data):**

| Goal | Path A | Path B | Path C |
|------|--------|--------|--------|
| "Find €2M in savings" | Conservative: Delay 3 low-priority projects to next year | Moderate: Cut discretionary consulting + pause 1 project | Aggressive: Remove 2 projects + 10% across-the-board cut |
| "Get all teams below 95% utilization" | Redistribute: Move allocations from overloaded CCs to available ones | Defer: Delay projects consuming most capacity in hot CCs | Hybrid: Partial redistribution + selective project delays |
| "Reduce CapEx ratio to below 40%" | Reclassify: Shift eligible project components to OpEx | Defer: Delay CapEx-heavy projects | Cut: Remove highest-CapEx projects |

### 7.6 Administration Module ✅ DECIDED (Tiers 1–2)

**Access:** Controller role only. Module tile visible on the Launchpad only for Controllers.

**Purpose:** Controllers currently depend on the development team to change reference data — adding a cost center, updating hourly rates, adjusting planning thresholds. The Administration module gives them self-service control over the data that shapes the entire planning system.

#### 7.6.1 Tier 1 — Organizational Structure Management ✅ BUILT

CRUD operations on the reference entities that the rest of the application builds on.

| Entity | Operations | Cascading Effects |
|--------|-----------|------------------|
| **Cost Centers** | Add, rename, deactivate, reassign to competence center, change location | Affects capacity heatmap structure, request routing, allocation grouping |
| **Competence Centers** | Add, rename, merge | Affects blended rate calculations, cost center grouping |
| **Lines of Business** | Add, rename, restructure | Affects portfolio tree hierarchy, budget-by-LoB charts, What-If rules |
| **Locations** | Add, rename | Affects cost center grouping, people assignment |
| **People** | Add to cost center, change role, move between cost centers, deactivate (left the organization) | Affects capacity heatmap, allocation availability, assignment options |
| **Rate Tables** | Update hourly rates per role, per competence center; set effective date | Affects all future cost calculations, project budget estimates, blended rates |

**Key design consideration:** Deactivation rather than deletion. When a cost center closes or a person leaves, historical data (allocations, CRs, actuals) must remain intact. The entity is marked inactive and excluded from future planning views but preserved in historical views.

**Screen layout:** Single-page layout with a left-side entity type selector (Cost Centers, Competence Centers, LoBs, Locations, People, Rate Tables) and a main content area showing the selected entity list as a table. Each table supports inline editing for simple field changes and a detail panel (right-side slide-in) for complex operations like reassigning a cost center's competence center or moving a person between cost centers. "Add New" button at the top of each table opens a creation form in the same detail panel.

**Entity tables include:**
- Status column showing Active/Inactive badge
- Last modified timestamp
- Quick-action buttons: Edit, Deactivate (with confirmation dialog explaining cascade effects)
- For People: current cost center, role, utilization % (read-only — computed from allocations)
- For Rate Tables: effective date, previous rate (for audit trail)

#### 7.6.2 Tier 2 — Planning Parameters ✅ BUILT

System-wide settings that control how the application behaves. Presented as a settings form — no table/list pattern needed.

| Parameter | What It Controls | Current Default |
|-----------|-----------------|----------------|
| **Fiscal year start month** | When annual baselines reset, how YTD is calculated | January |
| **Planning horizon** | How far forward the forecast grid extends | 24 months |
| **RAG thresholds** | What variance % triggers Green/Amber/Red | <5% / 5–10% / >10% |
| **Utilization thresholds** | What % triggers Blue/Green/Amber/Red in heatmaps | <70% / 70–90% / 90–100% / >100% |
| **Budget envelopes** | Annual budget ceiling per LoB or cost center | Not currently enforced — future capability |
| **Scenario cap** | Maximum scenarios per user in What-If Simulator | 10 |

**Screen layout:** Grouped settings form with clear section headers (Fiscal, Planning, Thresholds, Limits). Each parameter shows its current value, a description of what it controls, and an edit control appropriate to the data type (dropdown for month, number input for thresholds, etc.). Changes require explicit "Save" confirmation. A "Reset to Defaults" option is available per section.

#### 7.6.3 Tier 3 — KPI Management ⏳ FUTURE

> **Not built in the first iteration.** The data model stores KPI definitions in a table from day one so this feature is additive when built.

**Stakeholder-requested feature.** Controllers want the ability to define and track custom KPIs beyond the built-in set.

**Built-in KPIs (always present):** Total budget, YTD spend, forecast-at-completion, portfolio variance %, CapEx/OpEx split, Run/Change ratio, overall utilization %. These are hardcoded in the first iteration.

**Custom KPI framework (future):**
- Controller defines a KPI with: name, formula (referencing available data fields), display format (currency, percentage, ratio), target value, RAG thresholds
- Custom KPIs appear alongside built-in ones in the Launchpad metrics strip and Portfolio Overview dashboard
- Examples of KPIs controllers might define:
  - "External cost ratio" — external costs as % of total spend
  - "Cross-location collaboration index" — % of projects with resources from 2+ locations
  - "Forecast accuracy" — average absolute deviation between forecast and actuals over trailing 6 months
  - "Budget consumption rate" — YTD spend as % of annual budget, compared to elapsed % of year

**Implementation note:** The custom KPI engine requires a formula parser and a defined set of available data fields. This is a significant feature — likely its own design phase. The data model stores KPI definitions in a table (not hardcoded) so the transition from built-in-only to built-in-plus-custom is additive.

#### 7.6.4 Architecture Implications

The data model must:

- **Store all reference data in proper database tables** — not as constants in code or configuration files
- **Use foreign keys consistently** — so that cascade rules (deactivation, reassignment) work correctly
- **Separate rate tables from allocation data** — rates should be looked up, not embedded in every allocation row
- **Store built-in KPI definitions in a table** — so custom KPIs can be added to the same table later (Tier 3)
- **Include an `is_active` flag** on entities that may be deactivated (cost centers, people, LoBs) — Admin Tier 1 uses this for deactivation rather than deletion
- **Track effective dates on rate changes** — so historical cost calculations use the rate that was in effect at the time, not the current rate

---

## 8. Documentation Requirements

### 8.1 API Documentation (Auto-Generated)

FastAPI's built-in documentation tools provide interactive API reference with zero additional effort:

- **Swagger UI** at `/docs` — browsable, testable endpoint documentation with request/response schemas
- **ReDoc** at `/redoc` — clean, readable API reference in a single-page format

**Requirement for Claude Code:** All endpoints must use proper type hints, Pydantic models for request/response bodies, and descriptive docstrings. FastAPI generates the documentation from these definitions automatically. Every endpoint must include a summary, description, and example request/response values.

### 8.2 In-App Module Manuals (Contextual, Per-Module)

Each module has its own reference manual accessible via a "Guide" button in the module's top area.

**Content per module manual:**
- Overview of the module's purpose and who it's for
- Description of every feature and interaction available on the screen (tabs, buttons, drawers, panels, filters, drill-downs)
- Role-based access notes inline — what each role can see and do within this module, and what is hidden or disabled for other roles
- Explanation of visual indicators (RAG colors, utilization colors, status badges, chart meanings)
- Key concepts relevant to the module (e.g., the CR lifecycle for Project Workbench, the pivot dimensions for Organization Overview)

**Presentation:** Slides in as a right-side panel (consistent with existing side panel pattern). Does not navigate away from the current view. User can read the manual while looking at the actual screen.

**Modules covered:** Launchpad, Portfolio Overview, Project Workbench, Capacity Management, What-If Simulator, Administration (6 manuals total).

### 8.3 FAQ / "How Do I..." Walkthroughs (Task-Oriented, Cross-Cutting)

A global help section accessible from a "?" icon in the top bar, available from any screen.

**Content:** Step-by-step guides organized by task, not by module. Each entry answers a specific user question and walks through the actions required — which may span multiple modules.

**Example entries:**

| Task | Roles | Modules Involved |
|------|-------|-----------------|
| "How do I submit my monthly forecast?" | PL | Project Workbench |
| "How do I respond to a resource request?" | CC Owner | Capacity Management |
| "How do I approve a change request?" | CC Owner, Controller | Capacity Management, Portfolio Overview |
| "How do I submit a new project?" | PL | Launchpad |
| "How do I create a What-If scenario?" | Controller, Executive | What-If Simulator |
| "How do I compare scenarios?" | Controller, Executive | What-If Simulator |
| "What do the RAG colors mean?" | All | All |
| "How does the two-stage approval work?" | All | Project Workbench, Capacity Management, Portfolio Overview |
| "How do I read the 3-point comparison?" | PL, Controller | Project Workbench |
| "How do I check my team's utilization?" | CC Owner | Capacity Management |

**Presentation:** Slides in as a right-side panel from the top bar help icon. Searchable or filterable by role. Each walkthrough is a concise step-by-step guide (not long-form documentation).

---

## 9. Design System ✅ DECIDED

### 9.1 Component Library: shadcn/ui

Built on Radix UI primitives, styled with Tailwind CSS. Provides unstyled, composable components that can be adjusted without fighting an opinionated design system. Clean, professional appearance appropriate for enterprise stakeholders.

Key components used: Button, Card, Table, Tabs, Dialog, Dropdown Menu, Select, Badge, Tooltip, Sheet (for bottom drawers and side panels), Collapsible, Input, Textarea, Separator.

### 9.2 Chart Library: Recharts

React-declarative charting for bar charts, line charts, and donut charts. Lightweight, well-suited for the chart types needed across Portfolio Overview and Project Workbench.

**Exception — Capacity Management heatmaps:** These are built as CSS grid layouts with colored cells, not as Recharts components. The heatmap requires expandable rows, drill-down interaction, and bottom drawers — behaviors that belong in React's component model, not a charting library.

### 9.3 Color Palette

**Design principle:** Restrained and corporate. Color comes from the data (RAG indicators, heatmap cells, chart fills), not from the interface chrome. Enterprise stakeholders trust interfaces that look like tools, not marketing sites.

**Primary/Accent:** Deep blue `#1e40af` (Tailwind `blue-800`). Used for buttons, active states, selected tabs, links, primary actions.

**Neutral scale:** Tailwind `slate` series (`slate-50` through `slate-900`). Provides text hierarchy, borders, backgrounds, and disabled states.

**Surface treatment:** White cards (`#ffffff`) on a light gray page background (`slate-50` / `#f8fafc`). Creates visual depth without heavy drop shadows.

**AI Advisor panel:** Subtle indigo/violet tint background (e.g., `indigo-50` / `#eef2ff` with `indigo-100` border). Visually distinct from core UI without clashing. Paired with a small "AI-assisted" label in `indigo-600`.

### 9.4 RAG & Utilization Colors

**RAG status indicators (used across all modules):**

| Status | Color | Hex | Tailwind |
|--------|-------|-----|----------|
| Green (on track) | Green | `#22c55e` | `green-500` |
| Amber (watch) | Amber | `#f59e0b` | `amber-500` |
| Red (action needed) | Red | `#ef4444` | `red-500` |

**Heatmap utilization colors (Capacity Management):**

| Utilization | Color | Hex | Tailwind | Meaning |
|------------|-------|-----|----------|---------|
| < 70% | Blue | `#3b82f6` | `blue-500` | Under-utilized |
| 70–90% | Green | `#22c55e` | `green-500` | Healthy |
| 90–100% | Amber | `#f59e0b` | `amber-500` | Near capacity |
| > 100% | Red | `#ef4444` | `red-500` | Over-allocated |

Cell backgrounds use these colors at reduced opacity (e.g., `bg-green-100` or `bg-red-100`) with the full-strength color as a left border or text accent, to keep the grid readable.

### 9.5 Typography: Inter

Default font for all UI text. Excellent readability at small sizes — critical for dense data tables where controllers will be reading numbers in 13–14px cells.

| Usage | Weight | Size |
|-------|--------|------|
| Page/module title | Semibold (600) | 20–24px |
| Section headers | Semibold (600) | 16–18px |
| Table headers | Medium (500) | 13–14px |
| Body / table cells | Regular (400) | 13–14px |
| KPI values | Semibold (600) | 18–24px (contextual) |
| Labels, captions | Regular (400) | 12px, `slate-500` |
| AI Advisor narrative | Regular (400) | 14px |

### 9.6 Grid & Spacing System

Tailwind's default 4px base unit.

| Element | Spacing |
|---------|---------|
| Page margins | `px-6` or `px-8` (24–32px) |
| Card internal padding | `p-4` or `p-6` (16–24px) |
| Gap between cards/sections | `gap-4` or `gap-6` (16–24px) |
| Table cell padding | `px-3 py-2` (12px horizontal, 8px vertical) |
| Module content width | Full viewport, no max-width constraint |
| Bottom drawer height | ~40% of viewport, resizable |
| Side panel width | ~360–400px fixed |

### 9.7 Chart Styling Conventions

**Bar charts (e.g., Budget by LoB):**
- Each LoB gets a distinct but muted hue: accent blue (`blue-600`), teal (`teal-600`), slate (`slate-500`). For stacked bars, use the same hue at different opacities.
- Rounded corners on bars (`radius: 4px`).
- Axis labels in `slate-500`, 12px.

**Line charts (e.g., 3-point comparison, forecast trajectory):**

| Line | Style | Color |
|------|-------|-------|
| Baseline | Dashed | `slate-400` |
| Current Forecast | Solid, 2px | `blue-700` (accent) |
| Actuals | Solid, 2px | `slate-800` |

This makes "what was planned vs. what we expect vs. what happened" instantly distinguishable.

**Donut charts (e.g., RAG distribution):**
- Use RAG colors directly (green, amber, red segments).
- Center label shows total count or dominant status.

**Heatmaps (Capacity Management):**
- Built as CSS grid, not a chart component.
- Cells use utilization colors from Section 9.4 at reduced opacity.
- Expandable rows are standard React components with smooth expand/collapse animation.
- Bottom drawer triggered by cell/row click, slides up with overlay.

### 9.8 Interaction Patterns

**Bottom drawers:** Slide up from bottom, ~40% viewport height, semi-transparent overlay on content above. Close via X button or clicking overlay.

**Side panels (Portfolio summary, AI Advisor):** Slide in from right, fixed width 360–400px. Content area shrinks to accommodate — no overlay.

**Expandable rows:** Chevron icon rotates on expand. Indented child rows with a subtle left border to show hierarchy depth.

**Hover states:** Rows highlight on hover (`slate-50` background). Clickable elements show pointer cursor.

**Loading/transition states:** Skeleton loaders for initial data fetch. Instant recalculation for What-If actions (mock data is local, no latency to simulate).

---

## 10. API Design ✅ DECIDED

### 10.1 General Principles

**RESTful structure:** Resource-oriented URLs (e.g., `/api/projects`, `/api/capacity/my-team/{cost_center_id}/heatmap`).

**Authentication via header:** All endpoints read the current user context from an `X-Current-User` header. The frontend sets this header globally when the role switcher changes. The backend resolves the user's role, identity, cost center (if CC Owner), and project list (if PL) from this header. No per-endpoint role query parameters.

A FastAPI dependency (`get_current_user`) extracts the header and provides a `CurrentUser` context object to every endpoint handler. This object contains: user ID, name, role, associated cost center ID (for CC Owners), associated project IDs (for PLs).

**Authorization:** Mutation endpoints enforce ownership and permission checks server-side. Examples: only the scenario author can delete their scenario (403 otherwise), only the CC Owner of the relevant cost center can confirm resource requests, only Controllers can approve CRs. All authorization failures return 403 with a descriptive error message.

**Consistent response shapes:**
- List endpoints return `{ items: [...], total: N }`
- Detail endpoints return the object directly
- Mutation endpoints return the updated object
- Action endpoints that trigger recalculation return the full recalculated state

**Pydantic models everywhere:** All request and response bodies are defined as Pydantic models with type hints, descriptions, and example values. This feeds directly into auto-generated Swagger UI and ReDoc documentation (see Section 8.1).

**Base URL:** All endpoints prefixed with `/api/`.

### 10.2 Group 1 — Global / Launchpad (6 endpoints)

#### Role Management

**`GET /api/roles`**
Returns the list of available roles for the role switcher dropdown.
- Response: array of roles, each with: `id`, `name`, `user_name` (demo persona), `user_title`, `default_module`

**`GET /api/roles/{role_id}/context`**
Returns the full context for the selected role. Called when the user switches roles — reshapes the entire app.
- Response: `role`, `user_name`, `user_title`, `accessible_modules` (array of module IDs), `owned_project_ids` (for PL), `managed_cost_center_id` (for CC Owner)

#### Notifications

**`GET /api/notifications`**
Returns the role-aware alert list for the Launchpad top section. Dynamically generated from current data state (pending CRs, incoming requests, overdue forecasts, portfolio health).
- Response: array of notifications, each with: `id`, `message`, `severity` (info/warning/action), `deep_link` (optional — module ID + entity ID for click-through navigation)
- Content varies by role:
  - Controller: "X change requests pending approval," "Y new projects awaiting review"
  - CC Owner: "X incoming resource requests pending confirmation"
  - PL: "Monthly forecast review is due for [project]," "Your CR for [project] was approved/rejected"
  - Executive: Portfolio health summary sentence

#### Launchpad Data

**`GET /api/kpis/portfolio-summary`**
Returns the quick metrics strip at the bottom of the Launchpad.
- Response: `total_budget`, `ytd_spend`, `portfolio_variance_pct`, `overall_utilization_pct`, `run_change_ratio`
- Role-independent — every role sees the same numbers

**`GET /api/modules`**
Returns the module tile list with contextual metrics, ordered by role relevance.
- Response: array of modules, each with: `id`, `name`, `description`, `contextual_metric` (e.g., "47 active projects, 3 red"), `visible` (boolean — false for What-If when role is PL or CC Owner; false for Administration when role is not Controller), `sort_order` (integer — computed server-side based on current role; PL sees Workbench first, Controller sees Portfolio first)

#### New Project Submission

**`POST /api/projects`**
Creates a new project draft from the Launchpad "Submit New Project" form.
- Request body: `name`, `description`, `lob_id`, `start_month`, `end_month`, `resource_plan` (array of: role, hours_per_month, duration_months), `external_costs` (array of: cost_type, amount_per_month, duration_months)
- System auto-calculates estimated cost from blended hourly rates
- Response: created project in Draft state with generated `id`

**`PUT /api/projects/{project_id}/submit`**
Transitions a draft project to "Pending Approval." No request body — pure state transition. Appears in the controller's Intake Queue.
- Response: updated project with `status: "pending_approval"`

### 10.3 Group 2 — Portfolio Overview (14 endpoints)

#### Dashboard Tab

**`GET /api/portfolio/kpis`**
Returns the KPI summary row at the top of the dashboard.
- Response: `total_budget`, `ytd_spend`, `forecast_at_completion`, `overall_variance_pct`, `capex_opex_split` (amounts and percentages), `run_change_ratio`

**`GET /api/portfolio/projects?lob={lob}&status={status}&rag={rag}&cost_center={cc}&type={type}`**
Returns the full portfolio tree for the expandable table. Pre-structured as hierarchy: LoB → Program/Initiative → Project/Service.
- All query parameters are optional filters — omitting returns everything the current user's role can see
- Response: hierarchical array; each node includes: `id`, `name`, `type`, `status`, `rag`, `baseline_budget`, `current_forecast`, `actuals_ytd`, `variance_pct`, `timeline` (start/end), `children` array
- Aggregate values (budget, forecast, actuals, variance) pre-calculated at each hierarchy level — frontend does not roll up numbers

**`GET /api/portfolio/projects/{project_id}/summary`**
Returns the right-side summary panel data when a project row is clicked. Lightweight — enough for triage, not full project detail.
- Response: `rag`, `budget_snapshot` (baseline/forecast/actuals with deltas), `timeline_bar` (start, end, current position), `last_cr_summary` (what changed, when, status), `forecast_sparkline` (monthly forecast values over time)

**`GET /api/portfolio/charts?lob={lob}`**
Returns data for the three dashboard charts. Accepts same filters as the project list so charts and table stay in sync.
- Response:
  - `budget_by_lob`: stacked bar series (LoB name, baseline, forecast, actuals)
  - `forecast_trajectory`: monthly aggregate line series (month, total forecast value)
  - `rag_distribution`: counts of green/amber/red

#### Intake Queue Tab

**`GET /api/portfolio/intake`**
Returns pending new project submissions. Role-aware: Controller sees all submissions; PL sees only their own (Draft + Pending Approval); other roles see nothing.
- Response: array of items, each with: `project_id`, `name`, `submitted_by`, `lob`, `estimated_budget`, `estimated_timeline`, `submission_date`, `status` (draft/pending/in_review)

**`GET /api/portfolio/intake/{project_id}`**
Returns full estimation detail for the intake detail panel.
- Response: full resource plan, external cost breakdown by type, timeline, PL justification, portfolio impact assessment (budget addition, affected cost centers)

**`PUT /api/portfolio/intake/{project_id}/approve`**
Controller approves the project. Triggers: project state → Approved, estimation → Baseline, resource requirements → requests to CC Owners.
- Request body: `comments` (optional)
- Response: updated project

**`PUT /api/portfolio/intake/{project_id}/reject`**
Controller rejects the submission.
- Request body: `reason` (required)
- Response: updated project with `status: "rejected"`

**`PUT /api/portfolio/intake/{project_id}/send-back`**
Controller sends back for revision. Project state reverts to Draft with comments attached.
- Request body: `comments` (required)
- Response: updated project

#### Approvals Tab

**`GET /api/portfolio/approvals`**
Returns Change Requests at Stage 2 (Pending Controller Approval). Only CRs confirmed by CC Owner appear here.
- Response: array of CRs, each with: `cr_id`, `project_name`, `summary`, `submitted_by`, `confirmed_by_cc_owner`, `impact_eur_delta`, `submission_date`, `system_suggested` (boolean)

**`GET /api/portfolio/approvals/{cr_id}`**
Returns full CR detail for the approval panel.
- Response: all CR fields from Section 5.4 — changes per group (old/new/delta), justification, system-suggested flag, CC Owner confirmation details (assigned person, comments, timestamp), impact on project budget/timeline

**`PUT /api/portfolio/approvals/{cr_id}/approve`**
Controller approves the CR. Forecast updates to reflect approved changes. CR state → Approved.
- Request body: `comments` (optional)
- Response: updated CR

**`PUT /api/portfolio/approvals/{cr_id}/reject`**
Controller rejects. Forecast unchanged. CR state → Rejected.
- Request body: `reason` (required)
- Response: updated CR

**`PUT /api/portfolio/approvals/{cr_id}/send-back`**
Controller sends back with comments. CR state → "Sent Back by Controller." Returns to PL; may require new CC confirmation if PL revises.
- Request body: `comments` (required)
- Response: updated CR

### 10.4 Group 3 — Project Workbench (11 endpoints)

#### Project List (Left Panel)

**`GET /api/projects`**
Returns the project list for the left panel. Role-filtered via header: PL gets their projects, Controller gets all.
- Response: array of projects, each with: `id`, `name`, `rag`, `type` (project/service), `status` (active/completed/planned/draft/pending_approval), `next_action_due` (description string or null)
- For PLs: includes their projects in Draft and Pending Approval status (from intake submissions), marked with status badges. These entries are read-only in the Workbench — the PL can view the submission but cannot edit it until sent back.
- Sorted by urgency — projects with pending actions first, then active projects, then submissions

#### Workspace Tab 1 — Overview

**`GET /api/projects/{project_id}/overview`**
Returns everything the Overview tab needs in a single call.
- Response:
  - `metadata`: name, lob, status, rag, timeline (start/end), pl_name, sponsor
  - `three_point_comparison`: baseline vs current forecast vs actuals, broken out by internal hours, external costs, and total; all three variance calculations pre-computed (plan_drift, execution_variance, total_variance)
  - `trajectory_chart`: three series (baseline, forecast, actuals) as arrays of `{ month, value }` spanning the project's lifetime
  - `capex_opex`: amounts and percentages for each
  - `resource_plan_summary`: list of roles with confirmed_count, pending_count, confirmed_hours, pending_hours

#### Workspace Tab 2 — Forecast & Planning (Read Mode)

**`GET /api/projects/{project_id}/forecast`**
Returns the current forecast grid.
- Response: rows (resource roles + external cost types) × columns (months). Each cell contains: `current_forecast`, `baseline`, `actuals` (for elapsed months). Also includes confirmed resource allocations: which named person is assigned to which role for which months.

#### Workspace Tab 2 — Forecast Cycle (5-Phase Wizard)

Session-based flow: start a cycle, work through phases, submit at the end. Backend enforces one active cycle per project at a time.

**`POST /api/projects/{project_id}/forecast-cycle/start`**
Initiates a forecast cycle.
- Response: `cycle_id`, Phase 1 data: previous month's forecast vs actuals per line item, auto-calculated variances, flags for significant deviations needing PL explanation, `skippable` flag (true if all variances below threshold)

**`PUT /api/projects/{project_id}/forecast-cycle/{cycle_id}/acknowledge`**
PL submits Phase 1 retrospective acknowledgments.
- Request body: map of line item IDs → explanation text (for flagged variances)
- Response: confirmation

**`GET /api/projects/{project_id}/forecast-cycle/{cycle_id}/suggestions`**
Returns Phase 2 system-generated suggestions.
- Response: array of suggestions, each with: `id`, `type` (trend, actuals_correction, burn_rate, utilization, seasonal), `observation`, `recommendation`, `impact_description`, `pre_filled_changes` (array of cell changes). Empty array if no suggestions — frontend auto-skips to Phase 3.

**`PUT /api/projects/{project_id}/forecast-cycle/{cycle_id}/edit`**
Saves Phase 3 edits. Idempotent — replaces current working state on each call. Can be called multiple times as PL edits.
- Request body: `changes` (array of: line_item_id, month, old_value, new_value), `applied_suggestion_ids` (array of suggestion IDs that were accepted)
- Response: current diff summary (total delta, affected line items count)

**`GET /api/projects/{project_id}/forecast-cycle/{cycle_id}/review`**
Returns Phase 4 review data. Backend groups all changes into logical CR groups.
- Response: array of CR groups (resource_changes, external_cost_changes, timeline_changes). Per group: items with old/new/delta, system_suggested flag, impact on total project cost, variance from baseline shift, projected end state

**`PUT /api/projects/{project_id}/forecast-cycle/{cycle_id}/submit`**
PL submits the cycle. Creates CR records, routes to CC Owners.
- Request body: per-group `justification` text and `change_category` selection
- Response: array of created CRs with `id`, `state` ("pending_cc_confirmation"), `routed_to_cc_owner` name

#### Workspace Tab 3 — Change History

**`GET /api/projects/{project_id}/change-requests?category={category}&status={status}`**
Returns chronological log of all CRs for this project. Newest-first.
- Optional filters: `category` (scope, timeline, resource, external_cost, other), `status` (any lifecycle state)
- Response: array of CRs with all Section 5.4 fields: timestamp, submitter, changes per group (old/new/delta), justification, system_suggested, full lifecycle status, CC Owner confirmation details (assigned person, comments, timestamp), Controller approval details (comments, timestamp)

**`GET /api/projects/{project_id}/change-requests/{cr_id}`**
Returns full detail for a single CR. Same structure as list item — useful for deep-linking from notifications or cross-module navigation.

### 10.5 Group 4 — Capacity Management (14 endpoints)

#### Module Landing

**`GET /api/capacity/context`**
Returns landing context for the module: default tab (My Team for CC Owner, Organization Overview for Controller/Executive), managed cost center ID (if CC Owner), pending request count.

#### Tab 1 — My Team

**`GET /api/capacity/my-team/{cost_center_id}/summary`**
Returns the summary bar data.
- Response: `headcount`, `avg_utilization_pct`, `over_allocated_count`, `pending_request_count`

**`GET /api/capacity/my-team/{cost_center_id}/heatmap?from={month}&to={month}`**
Returns the role → person expandable grid.
- `from`/`to` default to current month + 11 months forward (one year view)
- Response: array of role rows, each with: `role_id`, `role_name`, `aggregate_utilization` (per month array with value + color bucket), `people` array (each with: `person_id`, `name`, per-month utilization + color bucket)

**`GET /api/capacity/my-team/{cost_center_id}/people/{person_id}/detail`**
Returns bottom drawer data when a person is clicked.
- Response: `project_allocations` (array of: project_id, project_name, hours_per_month), `available_capacity` (per month), `pending_requests` (array of requests that would affect this person's allocation if confirmed)

#### Request Management Sub-View

**`GET /api/capacity/requests/{cost_center_id}?type={type}&project={project_id}&cycle={cycle_month}`**
Returns the request queue for this CC Owner's cost center. Grouped by monthly cycle.
- Optional filters: `type` (resource/external_cost), `project`, `cycle` month
- Response: grouped array — each group has `cycle_month` and `requests` array. Each request: `id`, `project_name`, `pl_name`, `request_type`, `role_or_cost_category`, `hours_or_eur_per_month`, `period` (start/end month), `submission_date`, `priority`

**`GET /api/capacity/requests/{cost_center_id}/{request_id}`**
Returns full request detail plus availability context. Response adapts based on request type.
- For resource requests:
  - `request_detail`: project_name, pl_name, justification, role, hours_per_month, duration, priority
  - `availability`: array of people in that role within this CC, each with per-month utilization for the requested period, color bucket, `has_capacity` flag
- For external cost requests:
  - `request_detail`: project_name, pl_name, justification, cost_category, eur_per_month, duration, priority
  - `availability`: remaining_budget for that cost category, committed_amount, available_amount, spending_trend series

**`GET /api/capacity/requests/{cost_center_id}/{request_id}/assignment-preview?person_id={person_id}`**
Preview what assigning a person would do to their utilization. Read-only — does not commit.
- Response: `person_name`, per-month: `current_utilization`, `projected_utilization`, `exceeds_100_pct` flag. Overall `recommendation` (go/caution/overload)

**`PUT /api/capacity/requests/{cost_center_id}/{request_id}/confirm`**
CC Owner confirms the request. CR advances to "Pending Controller Approval."
- Request body: `assigned_person_id` (required for resource requests, omitted for external cost requests)
- Response: updated request with new state

**`PUT /api/capacity/requests/{cost_center_id}/{request_id}/partially-fulfill`**
CC Owner partially fulfills with adjusted parameters.
- Request body: `adjusted_hours` or `adjusted_amount`, `adjusted_period` (start/end month), `assigned_person_id` (for resource requests)
- Response: updated request

**`PUT /api/capacity/requests/{cost_center_id}/{request_id}/counter-propose`**
CC Owner counter-proposes an alternative.
- Request body: `explanation` (free text), `alternative_resource_plan` (modified role/hours/people proposal)
- Response: updated request

**`PUT /api/capacity/requests/{cost_center_id}/{request_id}/decline`**
CC Owner declines. CR state → "Sent Back by CC."
- Request body: `reason` (required)
- Response: updated request

#### Tab 2 — Organization Overview

**`GET /api/capacity/org/summary`**
Returns the organization-wide summary bar.
- Response: `total_headcount`, `avg_utilization_pct`, `over_allocated_cc_count`, `pending_controller_approval_count`

**`GET /api/capacity/org/heatmap?pivot={lob|role|cost_center}&from={month}&to={month}`**
Returns the heatmap grid for the selected pivot dimension.
- `pivot=lob`: rows are LoBs, expandable to CCs within each LoB
- `pivot=role`: rows are roles across org, expandable to CCs with that role
- `pivot=cost_center`: rows are CCs, expandable to roles within each CC
- Each cell: aggregate utilization percentage + color bucket
- No person-level data in any pivot
- Response: array of rows, each with: `id`, `name`, `utilization` (per month array), `children` array (next level)

**`GET /api/capacity/org/heatmap/{dimension_id}/detail?pivot={pivot}&month={month}`**
Returns bottom drawer data for a cell/row click in Organization Overview. Shows project consumption.
- `dimension_id` is contextual: LoB ID, role ID, or CC ID depending on active pivot
- Response: array of projects consuming capacity in that dimension/period, each with: `project_name`, `project_id`, `hours_allocated`, `has_pending_crs` flag

### 10.6 Group 5 — What-If Simulator (13 endpoints)

All endpoints restricted to Controller and Executive roles. Authorization enforced via `X-Current-User` header.

#### Scenario Manager (Phase 1)

**`GET /api/scenarios`**
Returns both sections of the Scenario Manager landing view.
- Response: `my_scenarios` (current user's private + published), `published_scenarios` (all other users' published scenarios). Each scenario: `id`, `name`, `description`, `status` (private/published), `author_name`, `created_at`, `modified_at`, `headline_impact` (pre-computed summary string, e.g., "–€2.1M, 3 projects removed, 4 FTEs freed")

**`POST /api/scenarios`**
Creates a new scenario.
- Request body: `name`, `description`, `clone_from` (optional scenario ID)
- If cloning: copies all actions from source. If not: starts from current portfolio state with no actions.
- Returns 409 if 10-scenario-per-user cap is reached
- Response: created scenario with `id`

**`DELETE /api/scenarios/{scenario_id}`**
Deletes a scenario. Only the author can delete (403 otherwise).
- Response: confirmation

**`PUT /api/scenarios/{scenario_id}/publish`**
Publishes a private scenario to the shared list.
- Response: updated scenario with `status: "published"`

**`PUT /api/scenarios/{scenario_id}/unpublish`**
Reverts a published scenario to private.
- Response: updated scenario with `status: "private"`

#### Scenario Workspace (Phase 2)

**`GET /api/scenarios/{scenario_id}`**
Returns the full scenario workspace data. Main payload for the editing view.
- Response:
  - `metadata`: name, description, status, author, created_at, modified_at
  - `actions`: chronological list, each with: `id`, `type`, `description`, `parameters`, `impact_delta`, `group_label` (for AI-applied action sets)
  - `impact_dashboard`: all KPI values for scenario state, each with current-state value and delta — total_budget, capex_opex_split, run_change_ratio, rag_distribution, utilization_by_cc, fte_impact
  - `impact_narrative`: rule-based templated summary text
  - `portfolio_tree`: full hierarchy with scenario-adjusted values, deltas, RAG changes, highlighting for affected rows (top two levels; deeper levels loaded via drill-down endpoint)

**`PUT /api/scenarios/{scenario_id}/metadata`**
Updates scenario name and/or description. Does not trigger recalculation.
- Request body: `name` (optional), `description` (optional)
- Response: updated metadata

#### Applying and Removing Actions

**`POST /api/scenarios/{scenario_id}/actions`**
Applies a new action to the scenario. Returns the full recalculated state (same structure as `GET /api/scenarios/{scenario_id}`).
- Request body for project-level actions: `scope: "project"`, `project_id`, `action_type` (remove, pause, delay, accelerate, adjust_budget, change_resources), type-specific `parameters`:
  - remove: no additional params
  - pause: `from_month`
  - delay: `months`
  - accelerate: `months`
  - adjust_budget: `amount` or `percentage`, `direction` (increase/decrease)
  - change_resources: array of `{ role, hours_delta, from_month, to_month }`
- Request body for portfolio-level rules: `scope: "portfolio"`, `rule_type` (cut_by_lob, cut_by_type, freeze_new_starts, cap_cost_category, across_the_board_cut), type-specific `parameters`:
  - cut_by_lob: `lob_id`, `percentage`
  - cut_by_type: `project_type` (project/service), `percentage`
  - freeze_new_starts: `after_month`
  - cap_cost_category: `cost_type`, `cap_amount`
  - across_the_board_cut: `percentage`
- Response: full recalculated scenario state

**`DELETE /api/scenarios/{scenario_id}/actions/{action_id}`**
Removes (undoes) a single action. Returns the full recalculated state.
- Works for both manually applied and AI-applied actions (AI actions are individually undoable even though they were applied as a group)
- Response: full recalculated scenario state

**`PUT /api/scenarios/{scenario_id}/actions/reorder`**
Reorders the action list. Order does not affect calculation — organizational only.
- Request body: `action_ids` (ordered array)
- Response: confirmation (no recalculation)

#### Cascading Drill-Down

**`GET /api/scenarios/{scenario_id}/drill-down?level={level}&parent_id={id}`**
Returns the next level of drill-down detail within the scenario's impact table. Loaded on demand.
- `level`: lob, program, project, cost_center, role, person
- `parent_id`: the entity being expanded
- Response: child rows with scenario-adjusted values, deltas, and highlight flags for rows affected by scenario actions

#### Comparison View (Phase 3)

**`POST /api/scenarios/compare`**
Returns side-by-side comparison data. POST because the request body is an array of IDs and the response is a computed view, not a stored resource.
- Request body: `scenario_ids` (array of 1–3 IDs)
- Response: `columns` array — first column is always Current State (pinned), followed by requested scenarios. Each column: `label`, `total_budget`, `capex_opex_split`, `run_change_ratio`, `rag_distribution`, `utilization_summary`, `fte_impact`, `key_projects_affected`. Each scenario column includes `delta` values relative to Current State. Also includes `project_comparison_table`: each project as a row with budget values across all columns, color-coded delta severity.

#### AI Advisor Panel

**`POST /api/scenarios/{scenario_id}/advisor/query`**
Submits a natural language goal to the AI Advisor. Returns solution paths.
- Initial implementation: matches goal text against pre-computed goal patterns and returns pre-built responses. Endpoint signature and response structure identical to what a real Claude API integration would return — swap is backend-only.
- Request body: `goal` (string, e.g., "Find €2M in savings without touching Rail Systems")
- Response: `paths` array (2–3 items), each with: `path_id`, `name` (e.g., "Conservative: Delay & Defer"), `approach_description`, `trade_offs`, `headline_numbers` (budget_delta, projects_affected, capacity_impact, rag_changes), `constituent_actions` (array of action definitions that would be applied)

**`POST /api/scenarios/{scenario_id}/advisor/apply`**
Applies one of the AI Advisor's solution paths to the scenario.
- Request body: `path_id` (from query response)
- Backend applies all constituent actions as a grouped set (labeled with AI path name in the action list)
- Response: full recalculated scenario state + `narrative_summary` (3–5 sentence analysis of what happened, key risks, suggested follow-up questions)

### 10.7 Group 6 — Documentation (4 endpoints)

Static content served through the API for discoverability in Swagger docs and maintainability.

**`GET /api/docs/modules`**
Returns the list of available module manuals with metadata.
- Response: array of modules, each with: `module_id`, `module_name`, `description`

**`GET /api/docs/modules/{module_id}`**
Returns the full manual content for a specific module. Content is structured as sections with markdown-formatted body text.
- Response: `module_name`, `sections` array, each with: `title`, `body` (markdown). Sections cover: module purpose, feature descriptions, interaction explanations, visual indicator meanings, role-based access notes.

**`GET /api/docs/faq`**
Returns the full list of FAQ entries.
- Response: array of entries, each with: `id`, `question` (the "How do I..." title), `summary` (short answer), `applicable_roles` (array), `modules_involved` (array)

**`GET /api/docs/faq/{faq_id}`**
Returns a single FAQ entry with the full walkthrough content.
- Response: `question`, `applicable_roles`, `modules_involved`, `steps` array (each with: `step_number`, `instruction` (markdown), `target_module` (optional — for deep-linking))

### 10.8 Group 7 — Reference Data (6 endpoints)

Lookup endpoints serving dropdowns, filter options, and the read side of Administration. Used across multiple modules — project submission forms, What-If action selectors, filter bars, and Administration entity views all consume these.

**`GET /api/reference/lobs`**
Returns all Lines of Business.
- Response: array of LoBs, each with: `id`, `name`, `description`, `is_active`, `project_count`, `total_budget`

**`GET /api/reference/competence-centers`**
Returns all competence centers with their cost center groupings.
- Response: array of competence centers, each with: `id`, `name`, `blended_rate`, `cost_centers` (array of CC IDs and names), `is_active`

**`GET /api/reference/cost-centers`**
Returns all cost centers with competence center and location context.
- Response: array of cost centers, each with: `id`, `name`, `location_id`, `location_name`, `competence_center_id`, `competence_center_name`, `headcount`, `is_active`

**`GET /api/reference/locations`**
Returns all locations.
- Response: array of locations, each with: `id`, `city`, `country`, `cost_center_count`, `is_active`

**`GET /api/reference/roles`**
Returns all resource role types with current rates.
- Response: array of roles, each with: `id`, `name`, `rates` (array of: `competence_center_id`, `hourly_rate`, `effective_date`)

**`GET /api/reference/cost-types`**
Returns all external cost type categories.
- Response: array of cost types, each with: `id`, `name`, `typical_range` (min/max EUR)

### 10.9 Group 8 — Administration (21 endpoints)

All endpoints restricted to Controller role. Authorization enforced via `X-Current-User` header.

#### Tier 1 — Organizational Structure CRUD

**Cost Centers:**

**`POST /api/admin/cost-centers`**
Creates a new cost center.
- Request body: `name`, `location_id`, `competence_center_id`
- Response: created cost center with generated `id`, `is_active: true`

**`PUT /api/admin/cost-centers/{cost_center_id}`**
Updates a cost center's properties.
- Request body: `name` (optional), `location_id` (optional), `competence_center_id` (optional)
- Response: updated cost center

**`PUT /api/admin/cost-centers/{cost_center_id}/deactivate`**
Deactivates a cost center. Historical data preserved; excluded from future planning views.
- Response: updated cost center with `is_active: false`

**Competence Centers:**

**`POST /api/admin/competence-centers`**
Creates a new competence center.
- Request body: `name`
- Response: created competence center with generated `id`

**`PUT /api/admin/competence-centers/{competence_center_id}`**
Updates a competence center.
- Request body: `name` (optional)
- Response: updated competence center

**Lines of Business:**

**`POST /api/admin/lobs`**
Creates a new Line of Business.
- Request body: `name`, `description`
- Response: created LoB with generated `id`, `is_active: true`

**`PUT /api/admin/lobs/{lob_id}`**
Updates a Line of Business.
- Request body: `name` (optional), `description` (optional)
- Response: updated LoB

**Locations:**

**`POST /api/admin/locations`**
Creates a new location.
- Request body: `city`, `country`
- Response: created location with generated `id`

**`PUT /api/admin/locations/{location_id}`**
Updates a location.
- Request body: `city` (optional), `country` (optional)
- Response: updated location

**People:**

**`POST /api/admin/people`**
Adds a new person to a cost center.
- Request body: `name`, `role_id`, `cost_center_id`
- Response: created person with generated `id`, `is_active: true`

**`PUT /api/admin/people/{person_id}`**
Updates a person's properties. Supports role change and cost center transfer.
- Request body: `name` (optional), `role_id` (optional), `cost_center_id` (optional)
- Response: updated person

**`PUT /api/admin/people/{person_id}/deactivate`**
Deactivates a person (left the organization). Historical allocations and CRs preserved.
- Response: updated person with `is_active: false`

**Rate Tables:**

**`GET /api/admin/rates`**
Returns current rate table — hourly rates per role per competence center, with effective dates and previous rates for audit trail.
- Response: array of rate entries, each with: `role_id`, `role_name`, `competence_center_id`, `competence_center_name`, `current_rate`, `effective_date`, `previous_rate`, `previous_effective_date`

**`PUT /api/admin/rates`**
Updates hourly rates. Accepts an array of rate changes, each with a new effective date. Previous rates are preserved for historical cost calculations.
- Request body: `changes` (array of: `role_id`, `competence_center_id`, `new_rate`, `effective_date`)
- Response: updated rate entries

#### Tier 2 — Planning Parameters

**`GET /api/admin/parameters`**
Returns all current planning parameter values with descriptions and defaults.
- Response: array of parameters, each with: `key`, `name`, `description`, `current_value`, `default_value`, `data_type` (month, integer, percentage, etc.), `group` (fiscal, planning, thresholds, limits)

**`PUT /api/admin/parameters`**
Updates one or more planning parameters.
- Request body: `changes` (array of: `key`, `new_value`)
- Validation: values must match expected data types and ranges (e.g., RAG thresholds must be percentages, fiscal year start must be a valid month)
- Response: updated parameters

**`POST /api/admin/parameters/reset`**
Resets specified parameters to their default values.
- Request body: `keys` (array of parameter keys to reset; omit to reset all)
- Response: updated parameters with default values restored

#### Admin Module Context

**`GET /api/admin/context`**
Returns landing context for the Administration module: entity counts, last modification timestamps, parameter change summary.
- Response: `cost_center_count`, `people_count`, `lob_count`, `location_count`, `last_rate_update`, `last_parameter_change`

**`GET /api/admin/audit-log?entity_type={type}&limit={n}`**
Returns recent administration changes for accountability. Tracks who changed what and when.
- Response: array of audit entries, each with: `timestamp`, `user_name`, `entity_type`, `entity_name`, `action` (create/update/deactivate), `field_changed`, `old_value`, `new_value`

### 10.10 API Summary

| Group | Endpoints | Key Pattern |
|-------|-----------|-------------|
| Global / Launchpad | 6 | Role context from header, notification deep-links |
| Portfolio Overview | 14 | Pre-hierarchied tree, three approval action variants |
| Project Workbench | 11 | Session-based forecast cycle, server-side diff grouping |
| Capacity Management | 14 | Adaptive response by request type, assignment preview |
| What-If Simulator | 13 | Action → full recalculated state, lazy drill-down |
| Documentation | 4 | Static markdown content via API |
| Reference Data | 6 | Read-only lookups, shared across modules and Admin |
| Administration | 21 | Controller-only CRUD, deactivation over deletion, audit trail |
| **Total** | **89** | |

---

## 11. Open Decisions

| # | Decision | Options | Status |
|---|----------|---------|--------|
| 1 | Module navigation | (a) Full screen + home button, (b) Persistent top bar with tabs, (c) Breadcrumb + cross-links | ✅ **DECIDED** — Option A + minimal breadcrumb top bar |
| 2 | Portfolio Overview layout | Tabs vs sections vs combined queue | ✅ **DECIDED** — Three tabs (Dashboard / Intake / Approvals) |
| 3 | Portfolio drill-down depth | Full tree vs two-level vs flat | ✅ **DECIDED** — Full tree (LoB → Program → Project) |
| 4 | Portfolio project click behavior | Direct cross-link vs summary panel vs modal | ✅ **DECIDED** — Right-side summary panel with "Open in Workbench" button |
| 5 | Project Workbench project selector | Master-detail vs dropdown vs cross-link only | ✅ **DECIDED** — Master-detail (project list left, workspace right) |
| 6 | Monthly forecast cycle UX | Guided wizard vs single page vs skippable wizard | ✅ **DECIDED** — Skippable wizard (5 phases) |
| 7 | New project creation entry point | Workbench tab vs Launchpad button vs modal | ✅ **DECIDED** — Launchpad only ("Submit New Project" button) |
| 8 | Capacity Management layout | Two-panel vs bottom drawer vs modal | ✅ **DECIDED** — Full-width content with bottom drawer for detail |
| 9 | Resource request surfacing | Separate tab vs integrated vs badge | ✅ **DECIDED** — Persistent button on "My Team" tab with subtle color emphasis when requests pending; navigates to full Request Management sub-view |
| 10 | Heatmap scope by role | Own CC only vs all CCs vs role-dependent | ✅ **DECIDED** — Two tabs ("My Team" / "Organization Overview") with role-dependent default landing |
| 11 | Capacity Management tab structure | Single view vs multi-tab | ✅ **DECIDED** — Two tabs: "My Team" (CC Owner) + "Organization Overview" (Controller/Executive) |
| 12 | Organization Overview heatmap hierarchy | CC-first vs LoB-first vs role-first | ✅ **DECIDED** — Pivot control: user selects "View by: LoB / Role / Cost Center" |
| 13 | CR approval pipeline | Single-stage (Controller only) vs two-stage | ✅ **DECIDED** — Two-stage: CC Owner confirms feasibility → Controller approves business alignment. Exact controller scope TBD pending controller workshop. |
| 14 | Request types | Resource only vs resource + external costs | ✅ **DECIDED** — Both. Resource requests and external cost requests flow through the same pipeline. |
| 15 | Request timing | Ad-hoc + monthly cycle vs monthly cycle only | ✅ **DECIDED** — Monthly cycle only. All requests originate from the forecast wizard. |
| 16 | Person visibility to PL | Named person vs anonymous role confirmation | ✅ **DECIDED** — PL sees the assigned person's name after CC Owner confirms. |
| 17 | Design system / component library | shadcn/ui, MUI, Ant Design, etc. | ✅ **DECIDED** — shadcn/ui (Radix + Tailwind), Inter font, slate neutral palette, deep blue accent |
| 18 | Chart library | recharts, chart.js, d3, Plotly | ✅ **DECIDED** — Recharts for bar/line/donut charts; CSS grid for capacity heatmaps |
| 19 | Mock data generation approach | Python script, SQL seed file, JSON fixtures | ✅ **DECIDED** — SQL seed file for relational data (generated once by Claude Code) + JSON fixtures for static content (manuals, FAQs, AI Advisor responses). Recorded in Section 6.16. |
| 20 | What-If Simulator screen spec | Full specification needed | ✅ **DECIDED** — Three-phase flow (Manager/Workspace/Comparison), private+published scenarios, AI Advisor panel |
| 21 | AI Advisor: pre-computed goals | Which goals to pre-compute for demo | ✅ **DECIDED** — 3 goal patterns (budget savings, utilization relief, CapEx ratio) with 2–3 solution paths each, plus fallback for unrecognized input. Defined in Section 6.12. |
| 22 | What-If Simulator access in role switcher | How module tile/access changes for PL/CC roles | ✅ **DECIDED** — Module tile hidden or disabled for PL and CC Owner roles |
| 23 | Documentation approach | In-app vs external, structure | ✅ **DECIDED** — Three layers: auto-generated API docs (Swagger/ReDoc), per-module contextual manuals (right-side panel), global FAQ walkthroughs (right-side panel from top bar) |
| 24 | API design approach | RESTful endpoints, GraphQL, RPC-style | ✅ **DECIDED** — 89 RESTful endpoints across 8 groups (original 62 across 6 groups, plus Reference Data and Administration added in Session 7). `X-Current-User` header auth resolved by FastAPI dependency, Pydantic models for all request/response bodies, server-side computation (frontend receives ready-to-render data), session-based forecast cycles, full recalculated state returned on every What-If action |
| 25 | Administration module | Build now vs defer vs exclude | ✅ **DECIDED** — Module 5 (Controller-only). Tiers 1–2 (org structure CRUD, planning parameters) built in first iteration. Tier 3 (custom KPI definitions) deferred to future. Data model supports all three tiers from day one. Updated in Session 7 — promoted from deferred to built. |

---

## 12. Session Log

### Session 1 — 2025-02-23
**Covered:**
- Overall application architecture (launchpad + 4 modules)
- Role definitions and role switcher behavior
- Core data model (baseline/forecast/actuals/CR — no versions, no year selector)
- All 3 workflows defined in detail (New Project, Resource Request, Monthly Forecast Cycle)
- Monthly forecast cycle with 5 phases including system suggestions
- Change tracking depth by hierarchy level
- Mock data scale and structure
- Launchpad layout

### Session 2 — 2025-02-25
**Covered:**
- Navigation model decided: full-screen modules with minimal breadcrumb top bar (logo + breadcrumb left, role switcher right)
- Portfolio Overview fully specced: three tabs (Dashboard/Intake/Approvals), full expandable tree (LoB → Program → Project), right-side summary panel on project click, charts (budget by LoB, forecast trajectory, RAG donut)
- Project Workbench fully specced: master-detail layout (project list left, workspace right), three workspace tabs (Overview/Forecast & Planning/Change History), skippable 5-phase forecast wizard
- New project creation moved to Launchpad as "Submit New Project" button
- Capacity Management partially specced: heatmap concept, drill-down levels, summary bar, resource request workflow defined — layout and interaction pattern decisions pending
- Mock data note: must include at least one mid-cycle project for live demo of forecast wizard

### Session 3 — 2025-02-26
**Covered:**
- Capacity Management fully specced with two-tab design:
  - "My Team" tab: CC Owner's operational view with role → person drill-down, bottom drawer for project breakdown, persistent request button with subtle color emphasis (no badge counter)
  - "Organization Overview" tab: Controller/Executive strategic view with pivot control (View by: LoB / Role / Cost Center), heatmap grid, bottom drawer for project consumption detail, no person-level visibility
  - Request Management sub-view: master-detail layout, resource requests show actual people with utilization for person assignment, external cost requests show budget availability, four response actions (confirm / partially fulfill / counter-propose / decline)
- Broadened request concept: requests cover both internal resources and external costs (consulting, licenses, cloud, etc.), not just people
- Two-stage CR approval pipeline established: CC Owner confirms operational feasibility (Stage 1) → Controller approves business alignment (Stage 2). Replaces previous single-stage controller-only approval.
- CR lifecycle updated with new states: Draft → Pending CC Confirmation → Pending Controller Approval → Approved (with sent-back and rejected branches at each stage)
- All requests tied to the monthly forecast cycle — no ad-hoc requests outside it
- PL visibility: assigned person's name visible to PL after CC Owner confirms
- Controller approval scope flagged as provisional — exact threshold for controller involvement TBD pending controller workshop in coming weeks

**Still needed (Session 5+):**
- API endpoint design
- Mock data generation approach (including pre-computed AI Advisor goals)
- Final review and consolidation for Claude Code handoff

### Session 4 — 2025-02-26
**Covered:**
- What-If Simulator fully specced:
  - Access restricted to Controllers and Executives only (PLs and CC Owners excluded)
  - Purpose defined: budget pressure scenarios, strategic rebalancing, risk exploration, timing decisions
  - Scenario lifecycle: create → name → edit → save → optionally publish → compare
  - Visibility model: private by default, deliberate publish action to make visible to others. Cap of 10 scenarios per user.
  - Three-phase flow: Scenario Manager (landing) → Scenario Workspace (editing) → Comparison View (side-by-side)
  - Available actions split into project-level (remove, pause, delay, accelerate, adjust budget, change resources) and portfolio-level rules (cut by LoB, cut by type, freeze new starts, cap cost category, across-the-board cut)
  - Full cascading drill-down on impacts: portfolio → LoB → program/project → cost center → role → individual person
  - Impact Summary card using rule-based templated narratives (deterministic, not AI)
  - Comparison View: current state always pinned as first column, up to 3 scenarios alongside
- AI Advisor panel designed as a showpiece feature:
  - Collapsible right-side panel in Scenario Workspace, visually distinct from core UI
  - Natural language goal input (not form-based)
  - Returns 2–3 solution path cards with distinct strategic approaches, trade-offs, and headline numbers
  - One-click "Apply to Scenario" populates all constituent actions at once
  - Post-apply narrative summary with risk analysis and follow-up suggestions
  - Implementation approach: pre-computed responses first, architected for Claude API substitution without UI changes
- Scope reduction explicitly excluded from scenario actions (scope not tracked in current system)
- AI role clarified across three layers: algorithmic recalculation (core), rule-based templated narratives (impact summaries), AI-assisted goal-seeking (Advisor panel — optional enhancement)

**Still needed (Session 5 continued):**
- API endpoint design
- Mock data generation approach (including pre-computed AI Advisor goals)
- Final review and consolidation for Claude Code handoff

### Session 5 — 2025-02-26
**Covered:**
- Documentation requirements added (Section 8):
  - API documentation via FastAPI auto-generated Swagger UI + ReDoc
  - Per-module contextual manuals: right-side panel with full feature reference, role-based access notes, visual indicator explanations
  - Global FAQ / "How do I..." walkthroughs: task-oriented step-by-step guides accessible from top bar help icon, cross-cutting across modules
- Design system fully specified (Section 9):
  - Component library: shadcn/ui (Radix UI + Tailwind CSS)
  - Chart library: Recharts for bar/line/donut; CSS grid for capacity heatmaps (to support expandable rows and drill-down)
  - Color palette: deep blue accent (`#1e40af`), slate neutral scale, white-on-light-gray surface treatment, indigo tint for AI Advisor panel
  - RAG colors: standard green/amber/red; blue added for under-utilization in heatmaps
  - Typography: Inter, with weight/size conventions for headings, tables, KPIs, labels
  - Spacing: Tailwind 4px base unit with specific guidance for cards, tables, page margins, drawers, panels
  - Chart styling: distinct line styles for 3-point comparison (dashed baseline, solid forecast, solid actuals), muted LoB hues for bars, RAG colors for donuts
  - Interaction patterns: bottom drawer behavior, side panel behavior, expandable row conventions, hover/loading states
- API design fully specified (Section 10):
  - 62 RESTful endpoints across 6 groups (Global/Launchpad, Portfolio Overview, Project Workbench, Capacity Management, What-If Simulator, Documentation)
  - Auth pattern: `X-Current-User` header on all requests, resolved by FastAPI dependency to `CurrentUser` context object — no per-endpoint role query parameters
  - Response philosophy: backend does all computation (tree building, roll-ups, variance calculations, CR grouping); frontend receives ready-to-render data
  - Forecast cycle: session-based with `cycle_id`, one active cycle per project, five phases with server-side state management
  - What-If recalculation: every action POST returns full recalculated scenario state — frontend never computes impacts locally
  - Scenario comparison: POST endpoint (not GET) because it's a computed view from an array of IDs
  - AI Advisor: two endpoints only (query + apply); query returns pre-computed paths, apply batches all constituent actions; endpoint signatures designed to be swappable to real Claude API without frontend changes
  - Documentation endpoints: static markdown content served via API for Swagger discoverability

**Still needed (Session 6):**
- Mock data generation approach (Decision #19)
- ~~AI Advisor pre-computed goals (Decision #21)~~ — resolved in Session 6
- Final review and consolidation for Claude Code handoff

### Session 6 — 2025-02-27
**Covered:**
- Expanded mock data specification (Section 6) from high-level outline to comprehensive data inventory:
  - Demo date set to February 2026; full time range defined (2023 historical through 2027 forward)
  - 4 named demo personas for role switcher with cost center and project assignments
  - 15 concrete named projects with hierarchy (2 programs), LoB assignments, status, RAG, budget scale, and explicit demo purpose for each
  - 8 named operational services
  - People and allocation framework: ~30 people, role/rate table, allocation matrix definition, utilization patterns (over/under/healthy)
  - Financial data patterns: 7 divergence patterns (on track, creeping overrun, cost spike, under-spend, seasonal dip, completed on/over budget) mapped to specific projects
  - Change request history: CR distribution by project, CRs at every lifecycle stage, 3 fully fleshed-out example CRs
  - Resource and external cost requests: 4 Stage 1 items for CC Owner demo queue
  - Intake queue: Autonomous Braking Prototype as primary intake demo item
  - System suggestions: 4 pre-built suggestions tied to specific projects and financial patterns
  - 3 pre-built What-If scenarios with actions and headline impacts
  - AI Advisor pre-computed goals: 3 goal patterns with 2–3 solution paths each, constituent actions, and post-apply narrative example (resolves Decision #21)
  - Documentation content: 5 module manual structures and 10 FAQ walkthrough entries defined
  - Notification state per role derived from demo data
  - 15 demo walkthrough anchors — explicit presenter demonstrations with required data state for each
- Mock data generation approach discussed (Decision #19):
  - Evaluated three options: SQL seed file, JSON fixtures, Python generation script
  - Agreed on SQL seed file (generated once by Claude Code) + JSON fixtures for static content (manuals, FAQs, AI Advisor responses)
  - Rationale: demo data changes happen through the application itself (CRs, scenarios), not by regenerating seed data; SQL is transparent and surgically editable; Claude Code handles the initial consistency arithmetic
  - Decision not yet formally written into spec — to be finalized and recorded in next session
- Administration module concept captured (Section 7.6, Decision #25):
  - Triggered by controller stakeholder feedback requesting ability to add cost centers and define custom KPIs
  - Scoped as Module 5 (Controller-only), three tiers: org structure CRUD, planning parameters, custom KPI management
  - Explicitly deferred to post-first-iteration — not built in initial demo
  - Architecture implications defined: data model must use proper tables, foreign keys, `is_active` flags, and DB-stored KPI definitions from day one to support future admin features without schema redesign

**Still needed (next session):**
- ~~Decision #19 formally written into spec (approach is agreed, needs to be recorded)~~ — done in Session 7
- ~~Expand Section 6 and Section 10 if final review surfaces data or API gaps~~ — done in Session 7
- ~~Final review and consolidation for Claude Code handoff~~ — done in Session 7

### Session 7 — 2025-02-27
**Covered:**
- Decision #19 formally recorded in spec (Section 6.16): SQL seed file + JSON fixtures approach documented with generation, loading, and runtime behavior details.
- Consistency review completed — all cross-references between sections checked, gaps identified and resolved:
  - Section 4.3 (RAG Status) expanded: timeline variance formula added — schedule slippage relative to planned duration, with independent thresholds for budget and timeline RAG, combined RAG takes worst. Planned/future projects use budget RAG only.
  - Section 7.2 (Portfolio Dashboard) filter bar: removed "division" — term had no corresponding data model entity. Filters now: LoB, status, RAG, cost center, type.
  - Section 10.2 `GET /api/modules`: clarified that `sort_order` is role-dependent, computed server-side. Administration module visibility restricted to Controller role.
  - PL submission visibility: PLs can now see their Draft and Pending Approval projects in the Project Workbench left panel with status badges (Section 7.3). `GET /api/projects` updated to include submission status. `GET /api/portfolio/intake` made role-aware (PL sees own submissions).
- Administration module (Module 5) promoted from deferred to first iteration:
  - Tiers 1–2 fully specced for build: Tier 1 (org structure CRUD with screen layout, entity tables, deactivation logic, detail panels) and Tier 2 (planning parameters with settings form, save/reset behavior)
  - Tier 3 (custom KPI management) remains deferred — data model supports it, feature not built
  - Section 7.6 rewritten with ✅ BUILT markers on Tiers 1–2, screen layout descriptions, and architecture implications updated
  - Section 3.1 module table and Section 3.3 role switcher updated — Controller has Admin access now
  - Section 7.1 Launchpad updated — Admin tile visible to Controller without "Coming Soon" badge
  - Section 8.2 module manuals updated — 6 manuals (added Administration)
  - Section 6.13.1 Admin manual structure added
  - Section 6.13.2 FAQ count increased to 12 — two Admin entries added (#11 "How do I add a new cost center?", #12 "How do I update hourly rates?")
  - Section 6.15 demo walkthrough anchors increased to 17 — two Admin demos added (#16 add cost center, #17 update hourly rates)
  - Decision #25 updated to reflect promotion from deferred
- New API endpoint groups added (Section 10.8 and 10.9):
  - Reference Data (6 endpoints): LoB, competence center, cost center, location, role, and cost type lookups. Serve dropdown data across all modules and the read side of Admin Tier 1.
  - Administration (21 endpoints): Full CRUD for cost centers (3), competence centers (2), LoBs (2), locations (2), people (3), rate tables (2), planning parameters (3), admin context (1), audit log (1). All Controller-only with deactivation-over-deletion pattern and effective date tracking on rates.
  - Total API endpoints increased from 62 to 89 (Section 10.10)
- All 25 decisions now resolved. Spec consolidated and ready for Claude Code handoff.

**Spec is now CONSOLIDATED. Next step: Claude Code handoff preamble.**
