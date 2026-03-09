# CRETA Demo App — Specification vs. Build Deviations

This document lists every deviation between the original specification (`CPC_Demo_App_Specification.md`) and what was actually implemented. Use this to update the spec for future iterations.

---

## Legend

- **Addition** — Feature exists in the build but was not in the spec
- **Change** — Feature was in the spec but was implemented differently
- **Omission** — Feature was in the spec but was not built
- **Rename** — Entity, field, or concept was renamed

---

## 1. Project & Build Structure

| # | Type | Area | Spec | Build | Notes |
|---|------|------|------|-------|-------|
| 1.1 | Rename | Project setup | Repository named `cpc-demo` | Named `vision-demo-prototype` | User preference |
| 1.2 | Change | Build process | Phase D is one monolithic session | Phase D split into 5 sub-sessions (D1–D5), one per module | Better context management per module |

---

## 2. API Endpoints

| # | Type | Area | Spec | Build | Notes |
|---|------|------|------|-------|-------|
| 2.1 | Change | Overall API | 89 total endpoints | ~90 endpoints | Extra endpoints emerged from implementation needs |
| 2.2 | Addition | Reference API | 6 reference endpoints | 7 endpoints — added `GET /api/reference/people` | Needed for the Administration People panel (returns utilisation %) |
| 2.3 | Addition | Admin API | 21 admin endpoints | 22 — added `POST /api/admin/reset-demo` | Essential for demo data reset; not in original spec |
| 2.4 | Change | Workbench API | Forecast cycle endpoints use `{cycle_id}` in path: `.../forecast-cycle/{cycle_id}/acknowledge` | `{cycle_id}` removed — path is `.../forecast-cycle/acknowledge` | Only one active cycle per project at a time, so cycle_id was unnecessary. State stored in-memory dict keyed by project_id |
| 2.5 | Change | Workbench API | Forecast cycle state stored in DB | Stored in-memory (Python dict) | Sufficient for demo; cycles are lost on server restart but reset on demo-reset anyway |

---

## 3. Data Model

| # | Type | Area | Spec | Build | Notes |
|---|------|------|------|-------|-------|
| 3.1 | Change | Projects model | Basic fields (name, LoB, status, RAG, type, timeline, PL, budget) | Additional fields: `projected_end_month`, `is_service` (bool), `annual_budget` (for services), `total_budget`, `is_active` | `is_service` flag differentiates projects from services in the same table; `annual_budget` supports OpEx/service entries |
| 3.2 | Addition | System models | Suggestions described in workflow but no explicit model | `SystemSuggestion` model added: id, project_id, suggestion_type, observation, recommendation, impact_description, pre_filled_changes_json | Clean model to support forecast wizard Phase 2 suggestions |
| 3.3 | Change | Notifications model | Single `deep_link` field (string) | Split into `deep_link_module` (string) + `deep_link_entity_id` (string) | Allows frontend to construct proper navigation routes (e.g. `?project=` query params for Workbench) |
| 3.4 | Addition | Notifications model | Fields: id, message, severity, deep_link | Added `is_read` boolean | Supports visual distinction between read/unread notifications |

---

## 4. Role & Module Visibility

| # | Type | Area | Spec | Build | Notes |
|---|------|------|------|-------|-------|
| 4.1 | Change | Executive access | Executive has access to Portfolio Overview, Capacity Management, What-If Simulator | Executive has access to Portfolio Overview and What-If Simulator only (missing Capacity Management) | Capacity module tile not visible on Executive's Launchpad |
| 4.2 | Change | CC Owner access | CC Owner primary module: Capacity Management only | CC Owner has access to Portfolio Overview, Project Workbench, and Capacity Management | Broader access than spec's primary-user table suggests |
| 4.3 | Change | Project Lead access | PL primary module: Project Workbench only | PL has access to Portfolio Overview and Project Workbench | Portfolio access needed for PL to see Intake Queue (as spec Section 7.2 implies) |

---

## 5. What-If Simulator — Scenario Actions

| # | Type | Area | Spec | Build | Notes |
|---|------|------|------|-------|-------|
| 5.1 | Omission | Project actions | Pause Project — zero out budget from specified month onward | Not implemented | — |
| 5.2 | Omission | Project actions | Change Resource Allocation — add/remove/modify role allocations for future periods | Not implemented | — |
| 5.3 | Addition | Project actions | Not in spec | `cut_consulting` — reduce consulting costs by specified % | Added to support pre-seeded scenario actions |
| 5.4 | Omission | Portfolio rules | Cut by Type — reduce all projects or all services by X% | Not implemented | — |
| 5.5 | Omission | Portfolio rules | Freeze New Starts — remove all projects starting after specified month | Not implemented | — |
| 5.6 | Omission | Portfolio rules | Cap Cost Category — set maximum spend for cost type, distribute reduction proportionally | Not implemented | — |
| 5.7 | Change | Delay/Accelerate | Should shift timeline and recalculate budget impacts | Engine implementation is a no-op for timeline — budget stays the same | Timeline modelling was not implemented; engine uses simplified budget-only calculations |

**Summary:** Spec defines 11 action types (6 project + 5 portfolio). Build implements 7 (5 project + 2 portfolio). Missing: Pause, Change Resources, Cut by Type, Freeze New Starts, Cap Cost Category. Added: cut_consulting.

---

## 6. What-If Simulator — Other Differences

| # | Type | Area | Spec | Build | Notes |
|---|------|------|------|-------|-------|
| 6.1 | Omission | Drill-down | Full cascading drill-down: Portfolio KPIs → LoB → Program/Project → Cost Center → Role → Person | Project-level only via BottomDrawer (budget + RAG comparison) | Simplified to avoid deep cascading UI complexity |
| 6.2 | Omission | Comparison view | Columns can be reordered (except Current State) | Fixed column order (Current State + selected scenarios in selection order) | No reorder UI implemented |
| 6.3 | Change | Impact dashboard | Full metrics: total budget delta, YTD + remaining spend, CapEx/OpEx split, Run/Change ratio, portfolio variance, RAG distribution, capacity utilisation by CC, FTE impact | Shows: total budget original/adjusted/delta, RAG distribution, narrative. Missing: YTD + remaining, CapEx/OpEx split, Run/Change ratio, capacity utilisation, FTE impact | Simplified to budget totals and RAG distribution |

---

## 7. AI Advisor

| # | Type | Area | Spec | Build | Notes |
|---|------|------|------|-------|-------|
| 7.1 | Change | Goal 3 | "Reduce CapEx ratio below 40%" | "Prioritise Rail Systems investments" | Different goal topic |
| 7.2 | Change | Goal 4 | Fallback/catch-all for unrecognised input | "Eliminate Red RAG projects" | Changed from generic fallback to a concrete goal |
| 7.3 | Change | Fallback behaviour | Unrecognised goal returns helpful message directing user to try budget/capacity/CapEx goals | Keyword matching in backend — unrecognised goals fall through to best-match | — |

---

## 8. Portfolio Overview

| # | Type | Area | Spec | Build | Notes |
|---|------|------|------|-------|-------|
| 8.1 | Omission | Intake Queue | Intake table includes `estimated_timeline` column | IntakeItem schema omits `estimated_timeline` | Start/end months are visible in the detail view but not in the list table |

---

## 9. Administration

| # | Type | Area | Spec | Build | Notes |
|---|------|------|------|-------|-------|
| 9.1 | Change | Entity selector | 6 entity types in left nav | 8 items in 2 groups: ENTITIES (6 types) + SYSTEM (Planning Parameters, Audit Log) | Planning Parameters and Audit Log grouped under "SYSTEM" section — cleaner UI organisation |
| 9.2 | Addition | Admin UI | Not mentioned in spec | Red "Reset Demo" button in Administration header with confirmation dialog | Essential for demo; reloads all seed data |
| 9.3 | Change | Rate tables | Simple `PUT /api/admin/rates` endpoint | Inline editing with batch save, changed rows highlighted amber, Save/Discard buttons | More polished editing UX with visual change feedback |
| 9.4 | Omission | Competence Centers | Support "Add, rename, merge" operations | Only Add and Update (rename) implemented — no merge | Merge is complex; deprioritised for demo |

---

## 10. FAQ & Documentation

| # | Type | Area | Spec | Build | Notes |
|---|------|------|------|-------|-------|
| 10.1 | Change | FAQ count | 12 FAQs | 12 FAQs (same count, different content) | — |
| 10.2 | Change | FAQ topics replaced | "How do I submit a new project?", "What do the RAG colors mean?", "How does the two-stage approval work?", "How do I read the 3-point comparison?" | Replaced with: "How do I use the AI Advisor?", "How do I view the org-wide capacity overview?", "How do I switch between personas?", "How do I manage planning parameters?" | FAQ content rewritten to better match actual demo walkthrough needs |
| 10.3 | Change | Module manuals | Spec says "5" but then lists 6 | 6 manuals built (matching the 6 listed items) | Spec has a typo — says 5 but lists 6; build matches the list |

---

## 11. Seed Data

| # | Type | Area | Spec | Build | Notes |
|---|------|------|------|-------|-------|
| 11.1 | Change | People count | "~30 people total" | 32 people | Close to spec's approximation |
| 11.2 | Change | Resource Request #2 | Predictive Maintenance PoC, Developer: 120 hrs/month | 80 hrs/month | Deliberately reduced to create a more realistic narrative (partially negotiated down) |
| 11.3 | Change | Priya Sharma CC | Implied assignment to PUN Application Development | `cost_center_id = NULL` (portfolio-level) | As Project Lead persona, not tied to a specific CC — makes more sense for the role |
| 11.4 | Change | Project PLs | Projects 3–14 have PL listed as "Other" (generic placeholder) | Each assigned a specific named person (p-molnar, p-kovacs, p-toth, etc.) | Maintains referential integrity with real person records |
| 11.5 | Change | AI Advisor goal 1 | "Find 2M in savings" | "Find approximately 2M in savings" | Minor wording change |

---

## 12. Frontend Architecture

| # | Type | Area | Spec | Build | Notes |
|---|------|------|------|-------|-------|
| 12.1 | Change | Side panel | Could use shadcn Sheet component | Custom component — `fixed right-0 w-[380px]`, main content gets `mr-[380px]` when open | shadcn Sheet defaults to overlay; spec requires content-shrink behaviour (Section 9.8) |
| 12.2 | Addition | Shared components | General concepts mentioned (expandable table, filter bar, skeleton loaders) | Dedicated reusable components created: `ExpandableTreeTable`, `FilterBar`, `Skeleton`, `ModuleGuideButton`, `StatusBadge`, `SummaryCard`, `HeatmapGrid`, `UtilizationCell` | Extracted as proper shared components used across multiple modules |

---

## Summary

| Category | Count |
|----------|-------|
| Additions (not in spec) | 8 |
| Changes (implemented differently) | ~30 |
| Omissions (not built) | 9 |
| Renames | 1 |
| **Total deviations** | **~48** |

### Most Significant Deviations

1. **What-If Simulator simplification** — 5 of 11 scenario action types omitted; cascading drill-down simplified to project-level only; impact metrics reduced to budget + RAG
2. **AI Advisor goals** — 2 of 4 goal topics changed from the spec
3. **FAQ content** — Several entries rewritten to match actual demo walkthrough
4. **Executive module visibility** — Missing Capacity Management access
5. **Notification model** — Improved by splitting deep_link into module + entity_id (positive change)
6. **Forecast cycle path** — cycle_id removed from URL (simpler, since only one active cycle per project)
7. **Reusable component library** — 8 shared components extracted (exceeds spec's general guidance)
