# VIPER Workflow Catalogue

Step-by-step walkthroughs of every workflow in the VIPER demo. Each workflow is documented in a way that serves two audiences:

- **Hand-off audience** (new operator, demo presenter, evaluator): read top-down to understand what the workflow does, when to use it, and how to perform it.
- **Regression test audience**: each step states *Action → Expected UI Result → Verification Cue* so it can be executed as a manual test case against any deployment.

The doc set sits between the in-app FAQs (single-question quick reference) and module manuals (descriptive overview). For one-line answers go to FAQ; for module overviews go to `/docs` in the running app; **for end-to-end how-to come here**.

## How to read this catalogue

Each workflow has an ID like `W02.5` — domain `02` (project lifecycle), workflow 5 (Pitch Board approval). Refer to a workflow this way when raising issues or in PR descriptions.

The catalogue is organised by **domain** rather than persona because most workflows touch ≥ 2 personas. The "Personas involved" line at the top of each workflow tells you who acts.

## Demo prep checklist

Before running any workflow, ensure:

- Backend is running on `http://localhost:8000` with v5 seed loaded (`POST /api/admin/reset-demo` for a clean slate)
- Frontend is running on `http://localhost:5173`
- DB shows expected v5 demo state: 11 projects + 6 offerings + 17 internal services = 34 chargeable entities; 4 personas (`p-sharma`, `p-meier`, `p-brenner`, `p-weber`); 39 distribution edges; 27 BTC profiles
- Demo flagship: **Master Data Hub** (offering `off-mdh`, S-code S042, identifier `IT00S042`)

If any of these are off, see `docs/workflows/00-system.md#W00.3` (Reset demo data).

## Workflow Index

| ID | Workflow | Primary persona(s) | Walk-time | Difficulty | Doc |
|---|---|---|---|---|---|
| W00.1 | Persona switching | All | 1 min | Orientation | [00-system](./00-system.md) |
| W00.2 | Dark mode toggle | All | 1 min | Orientation | [00-system](./00-system.md) |
| W00.3 | Reset demo data | Controller | 2 min | Orientation | [00-system](./00-system.md) |
| W01.1 | Controller Launchpad walk | Controller | 3 min | Orientation | [01-launchpad-by-persona](./01-launchpad-by-persona.md) |
| W01.2 | Project Lead Launchpad walk | PL | 3 min | Orientation | [01-launchpad-by-persona](./01-launchpad-by-persona.md) |
| W01.3 | CC Owner Launchpad walk | CC Owner | 3 min | Orientation | [01-launchpad-by-persona](./01-launchpad-by-persona.md) |
| W01.4 | Executive Launchpad walk | Executive | 2 min | Orientation | [01-launchpad-by-persona](./01-launchpad-by-persona.md) |
| W02.1 | Submit a new project (DoI 0) | PL | 4 min | Standard | [02-project-lifecycle](./02-project-lifecycle.md) |
| W02.2 | AI Council screening (DoI 0→1) | Controller | 3 min | Standard | [02-project-lifecycle](./02-project-lifecycle.md) |
| W02.3 | Score a project on Tech Navigator | PL | 5 min | Standard | [02-project-lifecycle](./02-project-lifecycle.md) |
| W02.4 | Advance to under-evaluation late (DoI 1→2) | Controller | 2 min | Standard | [02-project-lifecycle](./02-project-lifecycle.md) |
| W02.5 | Pitch Board approval (DoI 2→3) with baseline | Controller | 6 min | Deep | [02-project-lifecycle](./02-project-lifecycle.md) |
| W02.6 | Project send-back from intake | Controller + PL | 5 min | Deep | [02-project-lifecycle](./02-project-lifecycle.md) |
| W02.7 | Activate project (DoI 3→Active) | Controller | 2 min | Standard | [02-project-lifecycle](./02-project-lifecycle.md) |
| W02.8 | Transition to Run (DoI 4→5) | Controller | 3 min | Standard | [02-project-lifecycle](./02-project-lifecycle.md) |
| W03.1 | Submit a monthly forecast cycle (5-phase wizard) | PL | 8 min | Deep | [03-forecast-cycle](./03-forecast-cycle.md) |
| W03.2 | Controller forecast review with edit-in-place | Controller | 6 min | Deep | [03-forecast-cycle](./03-forecast-cycle.md) |
| W03.3 | Cycle close + ForecastVersion snapshot | Controller | 3 min | Standard | [03-forecast-cycle](./03-forecast-cycle.md) |
| W03.4 | View forecast version history + diff | Controller | 4 min | Standard | [03-forecast-cycle](./03-forecast-cycle.md) |
| W04.1 | Draft a CR via forecast cycle submission | PL | 4 min | Standard | [04-change-requests](./04-change-requests.md) |
| W04.2 | CC Owner CR confirmation | CC Owner | 4 min | Standard | [04-change-requests](./04-change-requests.md) |
| W04.3 | Controller CR approval | Controller | 3 min | Standard | [04-change-requests](./04-change-requests.md) |
| W04.4 | CR send-back + PL resubmit + diff view | Controller + PL | 6 min | Deep | [04-change-requests](./04-change-requests.md) |
| W04.5 | Browse Change History tab | All | 2 min | Orientation | [04-change-requests](./04-change-requests.md) |
| W05.1 | Confirm a resource request | CC Owner | 4 min | Standard | [05-resource-requests](./05-resource-requests.md) |
| W05.2 | Partially fulfill a resource request | CC Owner | 3 min | Standard | [05-resource-requests](./05-resource-requests.md) |
| W05.3 | Counter-propose on a resource request | CC Owner | 4 min | Standard | [05-resource-requests](./05-resource-requests.md) |
| W05.4 | Decline a resource request | CC Owner | 2 min | Orientation | [05-resource-requests](./05-resource-requests.md) |
| W06.1 | Create a blank scenario | Controller / Exec / CC Owner | 3 min | Standard | [06-simulator](./06-simulator.md) |
| W06.2 | Clone an existing scenario | All | 2 min | Orientation | [06-simulator](./06-simulator.md) |
| W06.3 | Apply scenario actions (4 lever types walked) | Controller | 8 min | Deep | [06-simulator](./06-simulator.md) |
| W06.4 | Compare 2-5 scenarios side-by-side | All | 4 min | Standard | [06-simulator](./06-simulator.md) |
| W06.5 | Lever 12 BTC rebalance: sandbox → impact → promote | Controller | 9 min | Deep | [06-simulator](./06-simulator.md) |
| W06.6 | Apply scenario to forecast (PL) | PL | 4 min | Standard | [06-simulator](./06-simulator.md) |
| W06.7 | AI Advisor goal-driven planning | All | 5 min | Standard | [06-simulator](./06-simulator.md) |
| W06.8 | Archive / publish / unpublish + Tier 3 gating | Owner | 4 min | Deep | [06-simulator](./06-simulator.md) |
| W07.1 | View Stage 1 distribution graph | All | 3 min | Orientation | [07-charging](./07-charging.md) |
| W07.2 | Edit a distribution edge with sum-rule validation | Controller | 4 min | Standard | [07-charging](./07-charging.md) |
| W07.3 | Cycle detection on edge save | Controller | 3 min | Deep | [07-charging](./07-charging.md) |
| W07.4 | Create a manual BTC profile | Controller | 5 min | Standard | [07-charging](./07-charging.md) |
| W07.5 | Create an automatic BTC profile from UM matrix | Controller | 5 min | Deep | [07-charging](./07-charging.md) |
| W07.6 | Year-rollover BTC profile copy | Controller | 4 min | Standard | [07-charging](./07-charging.md) |
| W07.7 | Refresh BTC from UM (dry-run + commit) | Controller | 4 min | Deep | [07-charging](./07-charging.md) |
| W07.8 | Location Cost Rollup map drill-down | All | 4 min | Standard | [07-charging](./07-charging.md) |
| W08.1 | Team heatmap + person drill-down | CC Owner | 4 min | Standard | [08-capacity](./08-capacity.md) |
| W08.2 | Org-wide capacity pivot | Controller | 4 min | Standard | [08-capacity](./08-capacity.md) |
| W08.3 | Project resource confirmation (all-or-nothing) | CC Owner | 3 min | Standard | [08-capacity](./08-capacity.md) |
| W09.1 | Run a standard report with filters | All | 3 min | Standard | [09-reporting](./09-reporting.md) |
| W09.2 | Vendor Spend report with drill-down | All | 4 min | Standard | [09-reporting](./09-reporting.md) |
| W09.3 | Build a custom report (drag-drop) | All | 6 min | Deep | [09-reporting](./09-reporting.md) |
| W09.4 | Save a report view + share | All | 3 min | Standard | [09-reporting](./09-reporting.md) |
| W09.5 | Export to CSV / Excel | All | 1 min | Orientation | [09-reporting](./09-reporting.md) |
| W09.6 | AI Report Builder natural-language query | All | 6 min | Deep | [09-reporting](./09-reporting.md) |
| W10.1 | Add a person | Controller | 3 min | Standard | [10-administration](./10-administration.md) |
| W10.2 | Update a rate table effective date | Controller | 3 min | Standard | [10-administration](./10-administration.md) |
| W10.3 | Edit a planning parameter | Controller | 2 min | Standard | [10-administration](./10-administration.md) |
| W10.4 | Configure portfolio hierarchy | Controller | 6 min | Deep | [10-administration](./10-administration.md) |
| W10.5 | Edit a workflow template touchpoint | Controller | 4 min | Standard | [10-administration](./10-administration.md) |
| W10.6 | Schedule a master data change + activate | Controller | 5 min | Deep | [10-administration](./10-administration.md) |
| W11.1 | Edit Tech Navigator subscores | PL | 4 min | Standard | [11-tech-navigator-and-backlog](./11-tech-navigator-and-backlog.md) |
| W11.2 | Adjust ranking weights / t-shirt thresholds | Controller | 3 min | Standard | [11-tech-navigator-and-backlog](./11-tech-navigator-and-backlog.md) |
| W11.3 | Read the cutoff line + reorder backlog | Controller | 4 min | Deep | [11-tech-navigator-and-backlog](./11-tech-navigator-and-backlog.md) |

**Total: 62 workflows across 11 domain docs.**

## Format key

Every workflow inside a domain doc follows this shape:

```
## W<NN.M>: <Name>

**Purpose**: One sentence on what this workflow accomplishes.
**When to use**: When in the demo or operational timeline.
**Personas involved**: Primary actor + any handoff personas.
**Pre-conditions**: DB or app state required (e.g., "≥ 1 project at DoI 2").
**Estimated walk-time**: e.g., 4 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | … | … | … | … |

### Alternative paths
- Optional alternative flows (send-back, decline, etc.)

### Post-conditions
- Resulting DB / app state.

### Cross-references
- **Decision tags**: from the v5 spec
- **Backend endpoint**: `routers/<file>.py::<function>`
- **FAQ overlap**: matching FAQ entry id (if any)
- **In-app manual**: `<manual>.json § <section>` (if any)

### Known issues / caveats
- Any documented limitations.
```

A workflow may omit *Alternative paths* and *Known issues* if not applicable, but never omits *Steps*, *Post-conditions*, or *Cross-references*.

### Reading the Steps table

- **Action**: literally what to click / type / drag. Names match the UI labels exactly.
- **Expected UI Result**: what should visibly happen — modal opens, route changes, badge appears, toast shows. Strings in quotes are the literal UI strings.
- **Verification Cue**: a hard assertion — "Toast: 'Project created'", "Badge `Approved` visible on row", "Network tab shows POST `/api/intake/projects` returns 201". Used by QA to confirm the step succeeded.

When a step expects an exact count tied to seed data (e.g., "9 pending actions"), the doc instead uses a range ("≥ 5 pending actions including ...") so it survives seed adjustments. Where exact identity matters (e.g., "the flagship `proj-mdh-rollout`"), the doc names it.

## Demo dress-rehearsal script

For a 30-minute live demo, walk these workflows in order:

1. **W00.1** — Switch to Controller (anchor the demo on Anna)
2. **W01.1** — Controller Launchpad walk (set the stage)
3. **W01.2** — Switch to PL (Priya); show 9 pending actions
4. **W02.1** — Submit a new project (intake DoI 0)
5. **W11.1** — Score Tech Navigator on the new project
6. **W04.1** — Draft a CR via forecast cycle submission
7. **W01.3** — Switch to CC Owner; show CRs in the queue
8. **W04.2** — Confirm the CR
9. **W01.1** (return) — Controller approves the CR (W04.3)
10. **W06.5** — Open the lever-12 BTC rebalance scenario; recalculate; show impact
11. **W01.4** — Switch to Executive; show portfolio rollup + scenario digest
12. **W07.8** — Show the Charging Rollup map drill-down
13. **W09.6** — End on AI Report Builder ("Show me top 5 charging locations by BTC volume")

Total: ~30 minutes. Each step references back to a workflow doc for full detail.

## Maintenance

**When code changes, find affected workflow docs by**:
- The decision tag listed in Cross-references
- The backend endpoint listed in Cross-references
- A grep for the exact UI string in the Action / Expected columns

**Common drift sources**:
- Seed counts changing (e.g., notification count for Priya) → use ranges, not exact
- UI string renames → grep across `docs/workflows/*.md`
- Endpoint moves → grep across `docs/workflows/*.md`

The catalogue is **deliberately denormalised**: workflow steps repeat between docs (e.g., "Switch to Controller" appears in many). This keeps each doc readable on its own without forcing a reader to chase cross-references for basics.
