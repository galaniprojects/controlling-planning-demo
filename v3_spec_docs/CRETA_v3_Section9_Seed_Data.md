## 9. Seed Data Overhaul

This section replaces the placeholder from the initial v3 spec. It is the complete data design for the CRETA demo application seed data, covering organizational structure, project/service roster, financial data, change requests, workflow states, and What-If scenarios. Claude Code uses this section as the authoritative source for generating `seed.sql`.

**Design principles:**
- Every project's Overview totals must be arithmetically derivable from the FC&Planning monthly data. No summary values exist independently of their detail rows.
- All financial values use clean round numbers for readability (thousands, not arbitrary decimals).
- The seed data provides the initial demo state. Runtime changes (CRs, approvals, scenario actions) are handled by the application.
- External cost line items roll up to categories in every display context. The expandable category pattern is a global design principle.

---

### 9.1 Demo Date & Timeline Frame

**Demo date:** March 2026. All "current month" logic, forecast boundaries, actuals cutoffs, and pending action triggers are calibrated to this date.

**Data span:** January 2021 – December 2029 (108 months, 9 fiscal years).

| Period | Data State |
|---|---|
| 2021 – 2024 | Fully historical — baseline, forecast, and actuals for all active projects. The three-point comparison (baseline vs forecast vs actuals) is preserved for every elapsed month, enabling historical variance analysis and forecast accuracy reporting. |
| 2025 (Jan – Dec) | Historical — baseline, forecast, and actuals. Some projects ended here, some continue. |
| 2026 (Jan – Feb) | Historical — baseline, forecast, and actuals recorded for these months. |
| 2026 (Mar) | Current month — baseline and forecast exist, actuals accumulating. |
| 2026 (Apr – Dec) | Forward-looking — baseline and forecast only, no actuals yet. |
| 2027 – 2029 | Forward-looking — baseline and forecast only. Long-running and future projects. |

Not every project spans the full range. The 2021–2029 window is the canvas; individual projects occupy realistic subsets. For every month a project was active, all three data layers (baseline, forecast, actuals) must exist — this is fundamental to CRETA's value proposition of tracking plan evolution over time.

---

### 9.2 Organizational Structure

#### 9.2.1 Lines of Business (4)

| LoB ID | Name | Character |
|---|---|---|
| lob-tbs | Truck & Bus Systems (TBS) | Largest LoB by budget. Maps to KB's CVS division. Mix of large programmes and operational services. |
| lob-rvs | Rail Vehicle Systems (RVS) | Second division. Fewer but bigger projects, steady services. |
| lob-cit | Corporate IT | Shared/cross-divisional IT. Infrastructure, platforms, security. |
| lob-dnd | Digital & Data | Emerging LoB. Analytics, AI, IoT initiatives across both divisions. Growing investment. |

#### 9.2.2 Locations (3)

| Location Code | City | Country | Hours/FTE (annual) | Character |
|---|---|---|---|---|
| MUC | Munich | Germany | 1.720 | HQ, largest teams, broadest competence coverage |
| BUD | Budapest | Hungary | 1.800 | Significant development centre |
| PUN | Pune | India | 1.850 | Growing team, cost-advantaged, 24/7 operations |

#### 9.2.3 Competence Centres (4)

| CC Code | Name | Character |
|---|---|---|
| APD | Application Development | Largest — developers, architects, QA |
| INF | Infrastructure & Cloud | Network, cloud, platform engineers |
| BSO | Business Solutions | SAP specialists, business analysts |
| DDA | Digital & Data Analytics | Data engineers, data scientists, ML — newer team |

#### 9.2.4 Cost Centres (10)

Each cost centre is a location + competence centre combination. Not every competence centre exists at every location.

| # | Cost Centre ID | Competence Centre | Location | Approx Headcount |
|---|---|---|---|---|
| 1 | MUC/APD | Application Development | Munich | ~8 |
| 2 | MUC/INF | Infrastructure & Cloud | Munich | ~5 |
| 3 | MUC/BSO | Business Solutions | Munich | ~5 |
| 4 | MUC/DDA | Digital & Data Analytics | Munich | ~4 |
| 5 | BUD/APD | Application Development | Budapest | ~8 |
| 6 | BUD/INF | Infrastructure & Cloud | Budapest | ~4 |
| 7 | BUD/DDA | Digital & Data Analytics | Budapest | ~3 |
| 8 | PUN/APD | Application Development | Pune | ~6 |
| 9 | PUN/INF | Infrastructure & Cloud | Pune | ~4 |
| 10 | PUN/BSO | Business Solutions | Pune | ~3 |

No BSO in Budapest and no DDA in Pune — intentional gaps reflecting realistic capability distribution.

---

### 9.3 Role Catalogue & Hourly Rates

12 roles with per-role, per-location hourly rates. Rates reflect actual SAP HR data granularity (not the blended competence centre rates used in CaPa today).

| Role | Job Family | CC | MUC (€/hr) | BUD (€/hr) | PUN (€/hr) |
|---|---|---|---|---|---|
| Senior Solution Architect | Architecture | APD | 115 | 78 | 52 |
| Senior Developer | Development | APD | 100 | 68 | 46 |
| Developer | Development | APD | 82 | 56 | 38 |
| Junior Developer | Development | APD | 65 | 44 | 30 |
| QA / Test Engineer | Quality | APD | 75 | 52 | 35 |
| Cloud / Platform Engineer | Platform | INF | 105 | 72 | 48 |
| Systems Administrator | Operations | INF | 80 | 55 | 38 |
| Network Engineer | Network | INF | 85 | 58 | 40 |
| SAP Functional Consultant | SAP | BSO | 110 | — | 50 |
| Business Analyst | Analysis | BSO | 90 | — | 42 |
| Data Engineer | Data | DDA | 100 | 70 | — |
| Data Scientist | Data | DDA | 108 | 75 | — |

Dashes indicate roles not available at that location (matches cost centre gaps in §9.2.4).

Munich-to-Budapest ratio: ~0.68. Munich-to-Pune ratio: ~0.45.

---

### 9.4 People (50)

50 fictional people distributed across the 10 cost centres. Names should match location culture (German names for MUC, Hungarian for BUD, Indian for PUN). Claude Code generates the full list following this distribution:

| Role | MUC | BUD | PUN | Total |
|---|---|---|---|---|
| Senior Solution Architect | 1 | 1 | 1 | 3 |
| Senior Developer | 3 | 3 | 2 | 8 |
| Developer | 3 | 4 | 3 | 10 |
| Junior Developer | 1 | 1 | 2 | 4 |
| QA / Test Engineer | 2 | 2 | 1 | 5 |
| Cloud / Platform Engineer | 2 | 1 | 1 | 4 |
| Systems Administrator | 1 | 1 | 1 | 3 |
| Network Engineer | 1 | 1 | 1 | 3 |
| SAP Functional Consultant | 2 | — | 1 | 3 |
| Business Analyst | 1 | — | 1 | 2 |
| Data Engineer | 2 | 1 | — | 3 |
| Data Scientist | 1 | 1 | — | 2 |
| **Total** | **20** | **16** | **14** | **50** |

**Capacity constraints for demo:**
- At least one person must be over-allocated (>100% utilisation) to demonstrate capacity heatmap warnings. Target: a Senior Developer in BUD/APD allocated to 3+ projects simultaneously.
- Scarce roles (Senior Solution Architect, Data Scientist, SAP Functional Consultant) should show as near-capacity across the portfolio, making them natural bottlenecks.
- At least one person with a pending resource request (not yet confirmed by CC Owner) for the Predictive Maintenance PoC.

**Demo personas (named, role-switchable):**

| Persona | Role in CRETA | Cost Centre | Projects Owned |
|---|---|---|---|
| Priya Sharma | Project Lead | — (PL doesn't belong to a CC) | ERP Integration Phase 2, Sensor Data Pipeline, Predictive Maintenance PoC, Fleet Portal v2, Autonomous Braking Prototype (intake) |
| Anna Meier | Controller | — | All projects (portfolio-wide) |
| Thomas Brenner | Cost Centre Owner | MUC/APD | Approves resource requests for MUC/APD |
| Attila Biber | Executive | — | Portfolio-level visibility |

---

### 9.5 Programmes

4 programmes, one per LoB. Remaining projects sit directly under their LoB with no programme grouping.

| Programme | LoB | Projects |
|---|---|---|
| Digital Braking Platform | TBS | ERP Integration Phase 2, Brake Control Unit Refresh |
| Rail Modernization | RVS | Signaling System Upgrade, Rail Diagnostics Platform |
| Infrastructure Optimization | Corporate IT | Cloud Migration Wave 3, Workplace Modernization |
| Fleet Intelligence | Digital & Data | Fleet Portal v2, Telematics Dashboard, Sensor Data Pipeline |

---

### 9.6 Project & Service Roster (32 items)

#### 9.6.1 Narrative Type Distribution

| Narrative | Count | % | Description |
|---|---|---|---|
| Well-managed | 12 | 37.5% | On track, low variance, clean CR history |
| Troubled / Overrun | 3 | 9.4% | Budget or schedule problems, multiple CRs |
| Scope change | 1 | 3.1% | Requirements expanded mid-flight |
| Nearing completion | 1 | 3.1% | Mostly actuals, winding down |
| Steady (services) | 11 | 34.4% | Ongoing operations, minimal variance |
| Completed | 4 | 12.5% | Historical, all actuals |

#### 9.6.2 TBS — Truck & Bus Systems (9 items)

| # | Name | Type | Status | RAG | Narrative | CapEx/OpEx | Timeline | Budget (total) | Programme |
|---|---|---|---|---|---|---|---|---|---|
| 1 | ERP Integration Phase 2 | Project | Active | Red | Troubled | CapEx | 2024-07 → 2026-09 | €1.200K | Digital Braking Platform |
| 2 | SAP S/4HANA Migration | Project | Active | Green | Well-managed | CapEx | 2022-01 → 2026-06 | €4.500K | — |
| 3 | Brake Control Unit Refresh | Project | Active | Green | Well-managed | CapEx | 2025-03 → 2026-03 | €250K | Digital Braking Platform |
| 4 | Autonomous Braking Prototype | Project | Pending Approval | — | Intake | CapEx | 2026-06 → 2027-12 | €900K | — |
| 5 | Legacy System Decommission | Project | Completed | Green | Completed | OpEx | 2022-06 → 2024-03 | €180K | — |
| 6 | Connected Vehicle Platform | Project | Future | Green | Future | CapEx | 2026-10 → 2028-12 | €1.800K | — |
| 7 | SAP Basis Operations | Service | Active | Green | Well-managed | OpEx | ongoing | €400K/yr | — |
| 8 | End User Computing Support | Service | Active | Green | Steady | OpEx | ongoing | €200K/yr | — |
| 9 | TBS Application Maintenance | Service | Active | Green | Steady | OpEx | ongoing | €280K/yr | — |

**ERP Integration Phase 2** is the primary demo project. It drives the forecast wizard walkthrough, has the richest CR history (8–10 CRs), and shows a creeping overrun narrative: started on track, consulting costs exceeded plan from month 6 onwards, additional roles were requested, timeline extended. The February 2026 forecast is overdue (drives action type #2). Priya Sharma is the PL.

**SAP S/4HANA Migration** is the largest project in the portfolio. Started in 2022, nearing completion in mid-2026. Multi-year history demonstrates the collapsible year columns feature. Shows what a well-managed large project looks like — minor CRs, all approved quickly.

**Autonomous Braking Prototype** sits in the Intake queue. Has full resource plan and external cost breakdown for the Intake detail view. Submitted by Priya Sharma, awaiting Controller review.

**Connected Vehicle Platform** is a future project (not yet started). Appears in the portfolio with forecast-only data. Good candidate for What-If scenario actions (defer, cancel).

#### 9.6.3 RVS — Rail Vehicle Systems (8 items)

| # | Name | Type | Status | RAG | Narrative | CapEx/OpEx | Timeline | Budget (total) | Programme |
|---|---|---|---|---|---|---|---|---|---|
| 10 | Signaling System Upgrade | Project | Active | Green | Nearing completion | CapEx | 2023-01 → 2026-06 | €1.500K | Rail Modernization |
| 11 | Rail Diagnostics Platform | Project | Active | Green | Well-managed | CapEx | 2024-06 → 2027-06 | €700K | Rail Modernization |
| 12 | Predictive Maintenance PoC | Project | Active | Amber | Scope change | CapEx | 2025-06 → 2027-03 | €500K | — |
| 13 | Workshop Management Tool | Project | Completed | Green | Completed | CapEx | 2023-01 → 2025-06 | €220K | — |
| 14 | Rail Safety Compliance System | Project | Future | Green | Future | CapEx | 2026-09 → 2028-06 | €650K | — |
| 15 | Rail IT Service Desk | Service | Active | Green | Steady | OpEx | ongoing | €250K/yr | — |
| 16 | Rail Application Maintenance | Service | Active | Green | Well-managed | OpEx | ongoing | €300K/yr | — |
| 17 | Signaling Systems Support | Service | Active | Green | Steady | OpEx | ongoing | €180K/yr | — |

**Signaling System Upgrade** is nearing completion — mostly actuals, very little forecast remaining. Good for the trajectory chart demo (shows near-complete spend curve).

**Predictive Maintenance PoC** started as a pure proof-of-concept, scope expanded mid-project to include a production pilot phase. Resource delays: a requested Senior Developer has not yet been assigned (drives the pending resource request in Capacity Management). Has a CR that was returned with feedback by the Controller asking for more justification on the timeline extension (drives action type #6).

#### 9.6.4 Corporate IT (8 items)

| # | Name | Type | Status | RAG | Narrative | CapEx/OpEx | Timeline | Budget (total) | Programme |
|---|---|---|---|---|---|---|---|---|---|
| 18 | Cloud Migration Wave 3 | Project | Active | Green | Well-managed | OpEx | 2025-01 → 2026-06 | €400K | Infrastructure Optimization |
| 19 | Identity & Access Management Overhaul | Project | Active | Amber | Troubled | CapEx | 2025-01 → 2026-09 | €350K | — |
| 20 | Workplace Modernization | Project | Active | Green | Well-managed | OpEx | 2025-06 → 2026-06 | €300K | — |
| 21 | Data Center Consolidation | Project | Completed | Green | Completed | OpEx | 2021-06 → 2023-12 | €800K | — |
| 22 | Global WAN Refresh | Project | Completed | Green | Completed | CapEx | 2022-01 → 2024-06 | €600K | — |
| 23 | Network & Security Operations | Service | Active | Green | Well-managed | OpEx | ongoing | €350K/yr | — |
| 24 | Enterprise Middleware | Service | Active | Green | Steady | OpEx | ongoing | €280K/yr | — |
| 25 | Database Administration | Service | Active | Green | Steady | OpEx | ongoing | €180K/yr | — |

**Identity & Access Management Overhaul** is the second troubled project. Vendor changed licensing model mid-project (cost surprise), and an additional security consultant was needed. Amber RAG due to budget creep, not schedule.

**Cloud Migration Wave 3** and **Workplace Modernization** are OpEx because they involve migrating/rolling out existing capabilities, not building capitalizable assets.

**Data Center Consolidation** is the oldest completed project in the portfolio (2021–2023). Provides deep historical data for the 2021–2029 timeline.

#### 9.6.5 Digital & Data (7 items)

| # | Name | Type | Status | RAG | Narrative | CapEx/OpEx | Timeline | Budget (total) | Programme |
|---|---|---|---|---|---|---|---|---|---|
| 26 | Sensor Data Pipeline | Project | Active | Amber | Troubled | CapEx | 2025-03 → 2026-12 | €600K | Fleet Intelligence |
| 27 | Fleet Portal v2 | Project | Active | Green | Well-managed | CapEx | 2025-01 → 2026-06 | €450K | Fleet Intelligence |
| 28 | Telematics Dashboard | Project | Active | Amber | Troubled | CapEx | 2025-06 → 2026-09 | €300K | Fleet Intelligence |
| 29 | Data Warehouse Consolidation | Project | Future | Green | Future | CapEx | 2026-07 → 2027-09 | €550K | — |
| 30 | AI/ML Experimentation Lab | Project | Active | Green | Well-managed | OpEx | 2025-09 → 2026-06 | €200K | — |
| 31 | Data Platform Operations | Service | Active | Green | Steady | OpEx | ongoing | €220K/yr | — |
| 32 | IoT Infrastructure Support | Service | Active | Green | Steady | OpEx | ongoing | €150K/yr | — |

**Sensor Data Pipeline** has consulting and cloud service overruns — external costs exceeding plan, similar pattern to ERP Integration but less severe (Amber, not Red).

**Telematics Dashboard** is behind schedule by approximately 1 month. Amber RAG driven by timeline variance rather than budget.

**AI/ML Experimentation Lab** is OpEx because it's exploratory with no capitalizable deliverable yet. Small, well-managed.

**Data Warehouse Consolidation** is a future project and a good What-If candidate (defer or cancel in scenario planning).

---

### 9.7 External Cost Model

#### 9.7.1 Structure

External costs are modeled at the **line item** level, not the category level. Each line item has:

| Field | Description |
|---|---|
| id | Unique identifier |
| project_id | Parent project or service |
| category | GL-level grouping (one of the 10 categories below) |
| description | What is being procured (e.g., "SAP Implementation Support") |
| vendor | Company providing it (e.g., "Deloitte") |
| capex_opex | Per-line-item classification (CapEx or OpEx) |
| procurement_status | Current lifecycle stage (per §9.7.3) |
| monthly_baseline | 12 values per year — original approved plan |
| monthly_forecast | 12 values per year — current living plan |
| monthly_actuals | 12 values per year — recorded costs (elapsed months only) |

The **category** is a label on the line item that drives expandable rollup display. It is not a separate entity. In every context where external costs appear (FC&Planning grid, detail view, intake detail, reports), line items are grouped under their category with expandable/collapsible parent rows showing the category total.

#### 9.7.2 Categories (10)

| Category | Typical Use |
|---|---|
| Consulting | Advisory, implementation partners |
| Leased Staff | Body-leasing, staff augmentation |
| Cloud Services | AWS, Azure, GCP consumption |
| Software Licenses | Perpetual or annual licenses |
| Software Maintenance | Ongoing vendor support contracts |
| Hardware Maintenance | Physical infrastructure upkeep |
| Training | Certifications, workshops, onboarding |
| Travel | Cross-location coordination |
| Infrastructure (On-Prem) | Servers, networking equipment |
| Other Third Party Services | Catch-all for niche vendors |

#### 9.7.3 Procurement Lifecycle Statuses

Each external cost line item carries a status reflecting where it is in the procurement lifecycle:

| Status | Meaning |
|---|---|
| Requested | Need identified, no PO yet |
| Committed | PO issued, contractually obligated |
| Delivered | Goods/services received |
| Invoiced | Invoice received from vendor |
| Accrued | Cost recorded in financials |

Status should be realistic relative to the timeline:
- Elapsed months (before March 2026): Invoiced or Accrued
- Current and near-term months (March–May 2026): mix of Committed and Delivered
- Future months (June 2026 onwards): Requested or Committed depending on whether a PO exists

#### 9.7.4 Line Item Examples by Project

Each project has 3–8 external cost line items across 2–4 categories. Troubled projects have more line items (complexity is part of why they're troubled). Small well-managed projects may have only 2–3.

**ERP Integration Phase 2 (troubled, 7 line items):**

| Description | Category | Vendor | CapEx/OpEx | Notes |
|---|---|---|---|---|
| SAP Implementation Support | Consulting | Deloitte | CapEx | Largest line item. Baseline: €15K/mo, actuals: €22–25K/mo — the core overrun |
| Process Advisory | Consulting | MHP Consulting | CapEx | Smaller engagement, on track |
| Application Developers (3 FTE) | Leased Staff | TCS | CapEx | Body-leasing, steady |
| Azure DevOps Licenses | Software Licenses | Microsoft | OpEx | Small, recurring |
| SAP S/4HANA Certification Programme | Training | SAP Education | OpEx | One-time, completed |
| Munich ↔ Budapest Team Visits | Travel | — | OpEx | Monthly, small |
| Penetration Testing | Other Third Party Services | External vendor | OpEx | Annual, one-time cost |

**Cloud Migration Wave 3 (well-managed, 4 line items):**

| Description | Category | Vendor | CapEx/OpEx | Notes |
|---|---|---|---|---|
| AWS EC2 Reserved Instances | Cloud Services | AWS | OpEx | Ramping up as workloads migrate |
| AWS S3 Storage | Cloud Services | AWS | OpEx | Growing with data migration |
| Cloud Architecture Advisory | Consulting | Accenture | OpEx | Short engagement, nearly done |
| AWS Solutions Architect Training | Training | AWS Training | OpEx | One-time, Q1 2026 |

**IAM Overhaul (troubled, 5 line items):**

| Description | Category | Vendor | CapEx/OpEx | Notes |
|---|---|---|---|---|
| ServiceNow ITSM Licenses | Software Licenses | ServiceNow | CapEx | The cost surprise — vendor changed pricing model, 40% increase |
| Security Assessment | Consulting | PwC | CapEx | Completed phase |
| Security Consultant (1 FTE) | Leased Staff | Hays | CapEx | Added mid-project to handle licensing migration complexity |
| Cisco Network Equipment Support | Hardware Maintenance | Cisco | OpEx | Ongoing |
| Cybersecurity Awareness Training | Training | Internal | OpEx | Staff training component |

Claude Code generates the full line item set for all 32 entities following these patterns. Budget distribution principle: external costs typically run 25–40% of total project cost for consulting-heavy projects, 10–20% for internally-staffed projects, and primarily maintenance/licenses for services.

---

### 9.8 Change Request Landscape

#### 9.8.1 CR Composition Types

| Type | Description | Example Project |
|---|---|---|
| Single role hours change | One role's monthly hours adjusted | ERP Integration |
| Single external cost change | One line item's amounts adjusted or extended | ERP Integration |
| Multi-line: role + external | Role change and external cost change in one CR | IAM Overhaul |
| Multi-line: multiple roles | Several roles reshuffled across months | SAP S/4HANA |
| Timeline extension | End date pushed, with corresponding resource/cost extensions | Predictive Maintenance PoC |
| New line item added | External cost line item not in original baseline | Sensor Data Pipeline |
| Pure reduction | Scope cut — role removed and/or costs reduced | Telematics Dashboard |

#### 9.8.2 Historical CRs

**ERP Integration Phase 2 (8–10 CRs, all approved):**
Progression telling the overrun story: started clean, then consulting overruns appeared (CR #1–2), then additional roles requested (CR #3–4), then a timeline consideration (CR #5), then more cost adjustments (CR #6–8). Each CR has full detail: old/new values, deltas, justification text, CC Owner confirmation, Controller approval, timestamps spanning from late 2024 through February 2026.

**SAP S/4HANA Migration (3 CRs, all approved):**
Minor adjustments — small role rebalancing, one external cost vendor change. All approved within 2–3 days. Demonstrates the process working smoothly.

**Sensor Data Pipeline (2 CRs, both approved):**
First CR was a planned consulting increase (approved). Second added cloud scaling costs (approved). Both straightforward.

**Well-managed projects (1–2 CRs each, all approved):**
Brake Control Unit Refresh, Fleet Portal v2, Rail Diagnostics Platform, Cloud Migration Wave 3, Workplace Modernization — each has 1–2 minor CRs showing the system handles small changes efficiently.

**Signaling System Upgrade (2 CRs, approved):**
Late-stage adjustments as the project winds down. Reduction CRs — roles releasing early.

**IAM Overhaul (3 CRs, 2 approved, 1 rejected):**
First CR: standard consulting extension (approved). Second: licensing cost increase after vendor pricing change (approved, but with Controller comments noting concern). Third: request for additional budget for extended timeline (rejected by Controller with feedback requesting scope reduction instead). This rejected CR adds variety to the Change History view.

**Telematics Dashboard (1 CR, approved):**
Pure reduction — descoped a feature to recover from the schedule slip.

**Total historical CRs:** approximately 25–30 across the portfolio, concentrated on the troubled projects.

#### 9.8.3 Active CRs at Demo Start

These CRs exist in non-terminal states when the demo begins, driving pending actions on the Launchpad.

| CR | Project | State | Composition | Purpose |
|---|---|---|---|---|
| CR-A | ERP Integration Phase 2 | Pending CC Confirmation (Stage 1) | Multi-line: increase Senior Developer hours Apr–Jun 2026 + extend Deloitte consulting through Q3 2026 | Drives action type #3 for CC Owner |
| CR-B | Sensor Data Pipeline | Pending CC Confirmation (Stage 1) | New line item: AWS infrastructure scaling costs for production rollout | Drives action type #3 for CC Owner |
| CR-C | SAP S/4HANA Migration | Pending Controller Approval (Stage 2) | Pure reduction: cutting 2 roles for final 3 months as project winds down | Drives action type #4 for Controller. "Good" CR showing proactive cost management. |
| CR-D | IAM Overhaul | Pending Controller Approval (Stage 2) | Multi-line: licensing cost increase + additional security consultant | Drives action type #4 for Controller. Interesting review case. |
| CR-E | Predictive Maintenance PoC | Returned with Feedback | Timeline extension: end date pushed 3 months with resource/cost extensions | Drives action type #6 for PL. Controller asked for more justification. |

Additionally, one recently approved CR (within the last 3–5 days) on a Priya Sharma project should exist so the "CR approved" notification (action type #7) is visible on the PL's Launchpad.

---

### 9.9 Workflow States at Demo Start

#### 9.9.1 Pending Action Coverage

Every one of the nine action types must be triggerable from the initial seed data state.

| # | Action Type | Seed Data Trigger |
|---|---|---|
| 1 | Forecast Due | Sensor Data Pipeline and Predictive Maintenance PoC: March 2026 forecast not yet submitted |
| 2 | Forecast Overdue | ERP Integration Phase 2: February 2026 forecast was never submitted |
| 3 | CR Pending Confirmation | CR-A (ERP Integration) and CR-B (Sensor Data Pipeline) at Stage 1 |
| 4 | CR Pending Approval | CR-C (S/4HANA) and CR-D (IAM Overhaul) at Stage 2 |
| 5 | New Project Pending Review | Autonomous Braking Prototype in intake queue |
| 6 | CR Feedback Received | CR-E (Predictive Maintenance) returned by Controller |
| 7 | CR Decision | Recent approval on one of Priya's projects (last 3–5 days) |
| 8 | Project Submission Decision | Fleet Portal v2 was approved through intake in February 2026 — Priya Sharma is the PL, notification still visible because she hasn't viewed it yet |
| 9 | Scenario Published | "Budget Pressure: 15% Reduction" scenario published last week |

#### 9.9.2 Forecast Cycle States (Priya Sharma's Projects)

| Project | March 2026 Forecast Status | Notes |
|---|---|---|
| ERP Integration Phase 2 | Overdue (Feb not submitted) | Troubled project, PL overwhelmed. Drives action type #2. |
| Sensor Data Pipeline | Due (March not yet submitted) | Normal current-month state. Drives action type #1. |
| Predictive Maintenance PoC | Due (March not yet submitted) | Normal, but has returned CR complicating things. Drives action type #1. |

#### 9.9.3 Resource Requests

One pending resource request in Capacity Management: Predictive Maintenance PoC requested a Senior Developer from BUD/APD. Not yet confirmed by CC Owner. Drives the resource request response demo (walkthrough anchor #8).

#### 9.9.4 Intake Queue

Autonomous Braking Prototype: submitted by Priya Sharma, status "Pending Approval." Has full resource plan (roles, hours per month, mapped to cost centres) and external cost breakdown (line items with vendors) for the Intake detail view.

---

### 9.10 Phase Data

Phase assignments vary by project to demonstrate graceful degradation in the timeline visualization (§3.1).

#### 9.10.1 Full Phases (4–5 phases)

| Project | Phases |
|---|---|
| ERP Integration Phase 2 | Discovery → Design → Build → Test → Rollout |
| SAP S/4HANA Migration | Assessment → Design → Migration → Validation → Go-Live |
| Signaling System Upgrade | Requirements → Engineering → Integration → Commissioning |
| Connected Vehicle Platform (future) | Concept → Architecture → Development → Integration → Launch |

Each phase has a baseline date range (original plan) and a forecast date range (current plan). Differences between baseline and forecast show slip in the phase strip visualization.

#### 9.10.2 Partial Phases (2–3 phases)

| Project | Phases |
|---|---|
| Rail Diagnostics Platform | Planning → Implementation → Go-Live |
| Fleet Portal v2 | Development → Testing → Deployment |
| IAM Overhaul | Assessment → Implementation → Rollout |

#### 9.10.3 No Phases

All other projects and all services. The timeline visualization shows only the project start/end bar with no internal phase structure.

---

### 9.11 CapEx/OpEx Classification

CapEx/OpEx is assigned per line item (both role allocations and external cost line items), as specified in §10 of this document. The project-level classification listed in §9.6 is the dominant classification — most line items on a CapEx project are CapEx, but individual OpEx line items can exist (e.g., training, travel, recurring licenses on a CapEx project).

**Projects with mixed CapEx/OpEx line items:**
- ERP Integration Phase 2: Development roles are CapEx, training and travel line items are OpEx
- SAP S/4HANA Migration: Migration work is CapEx, training and maintenance line items are OpEx
- IAM Overhaul: Core implementation is CapEx, hardware maintenance and training are OpEx

**Fully OpEx entities:** All 11 services, plus Cloud Migration Wave 3, Workplace Modernization, Data Center Consolidation, Legacy System Decommission, AI/ML Experimentation Lab.

**All other projects:** Fully CapEx (all line items tagged CapEx).

---

### 9.12 What-If Scenarios (3)

Three pre-built scenarios in the What-If Simulator at demo start.

#### 9.12.1 Scenario 1 — "Budget Pressure: 15% Reduction"

| Field | Value |
|---|---|
| Status | Published |
| Created by | Anna Meier (Controller) |
| Published | ~1 week before demo date |

**Actions:**
1. Defer Connected Vehicle Platform start by 6 months (2026-10 → 2027-04)
2. Reduce Sensor Data Pipeline external consulting by 30% for remaining months
3. Cancel AI/ML Experimentation Lab entirely
4. Reduce Cloud Migration Wave 3 scope — cut 2 roles for Q3/Q4 2026

**Impact:** Total savings of ~€1.200K against current forecast. Cascading effects on capacity (freed-up people), CapEx/OpEx shift, and timeline changes.

This is the primary demo scenario: open, drill into, show impact detail. Also triggers action type #9 (Scenario Published).

#### 9.12.2 Scenario 2 — "Accelerate Digital & Data"

| Field | Value |
|---|---|
| Status | Private (working draft) |
| Created by | Anna Meier (Controller) |

**Actions:**
1. Pull Data Warehouse Consolidation forward by 3 months (start 2026-04 instead of 2026-07)
2. Add 3 additional Data Engineers across BUD and MUC for Sensor Data Pipeline
3. Increase AI/ML Experimentation Lab budget by €100K and extend through 2026-12
4. Add new external cost line item: Snowflake Enterprise license for Data Platform Operations

**Impact:** Total cost increase of ~€650K. Capacity pressure on DDA competence centre — Budapest Data Engineers exceed 100% utilisation.

Good for the "create and explore" demo flow.

#### 9.12.3 Scenario 3 — "Conservative: Freeze New Starts"

| Field | Value |
|---|---|
| Status | Published |
| Created by | Attila Biber (Executive) |
| Published | ~2 weeks before demo date |

**Actions:**
1. Freeze all three Future projects (Connected Vehicle Platform, Rail Safety Compliance System, Data Warehouse Consolidation) — remove from forecast entirely
2. Reduce Autonomous Braking Prototype estimation by 20% if approved
3. Rate escalation: model a 5% hourly rate increase for 2027 across all locations

**Impact:** Savings of ~€2.800K over the planning horizon. Rate escalation offsets ~€400K of those savings, highlighting the tension between short-term savings and long-term cost pressure.

Paired with Scenario 1 for the side-by-side comparison demo (walkthrough anchor #12): targeted cuts vs blanket freeze.

---

### 9.13 Data Consistency Rules

These rules must hold true across the entire seed data set. Claude Code should validate them after generating `seed.sql`.

1. **Summation integrity:** Every project's total budget (baseline, forecast, actuals) must equal the sum of its monthly values across all role allocations and external cost line items.
2. **Temporal consistency:** No actuals in future months (April 2026 onwards). No forecast-only values in elapsed months where actuals exist.
3. **Allocation consistency:** A person's total allocated hours across all projects in a given month must not exceed their available capacity (except for the intentionally over-allocated person in §9.4).
4. **CR consistency:** Historical approved CRs must have corresponding changes reflected in the current forecast values. The audit trail must be traceable.
5. **Status consistency:** Active CRs at Stage 2 must have a CC Owner confirmation record. Returned CRs must have Controller feedback text.
6. **Timeline consistency:** No resource allocations or external costs outside a project's active timeline.
7. **Rate consistency:** Cost calculations must use the correct per-role, per-location hourly rate from the rate table.
8. **CapEx/OpEx consistency:** Project-level CapEx/OpEx classification must match the dominant classification of its line items. Mixed projects must have the correct per-line-item tags.

---

### 9.14 Implementation Notes

**Generation approach:** Single SQL seed file (`seed.sql`) as established in the v1 spec (§6.16). Claude Code generates all INSERT statements, handling the consistency arithmetic. JSON fixtures remain for static content (module manuals, FAQ walkthroughs).

**Seed data session sequence:** The seed data overhaul should be implemented after all structural/UI changes from Sessions 1–4 (§14) are complete, since the data model changes (CapEx/OpEx per line item, external cost line item structure) must be in place first.

**Session 5 — Seed Data:**
- Generate the complete seed.sql following this specification
- Validate all consistency rules from §9.13
- Verify all demo walkthrough anchors from §15 of the change specification work with the new data
- Verify all 9 pending action types fire correctly

**Session 6 — Seed Data Verification & Polish:**
- End-to-end demo walkthrough with all 4 roles
- Fix any data inconsistencies surfaced during walkthrough
- Tune financial values for visual impact in charts and KPIs
