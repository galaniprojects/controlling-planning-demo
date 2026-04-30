# 05 — Resource Requests

A **Resource Request** is the per-role × per-month allocation ask attached to a CR (or to a project intake). When a CR with internal-resource changes is approved by the controller, or when a new project's intake is submitted by the PL, the system fans out resource requests to the relevant CC Owner(s) for fulfilment.

Resource requests are the operational layer between the CR's "I want N hours of role X next quarter" and the live `Allocation` rows that say "person Y will do those hours in those months". The CC Owner is the actor who picks the people.

Four primary actions on a resource request, surfaced in the Capacity → Resource Requests view:

| Action | Effect |
|---|---|
| **Confirm** | Accept as-is. Assign a named person for each month. Materialise `Allocation` rows. |
| **Partially Fulfill** | Accept reduced hours / amount / shorter period. Goes back to PL for sign-off. |
| **Counter-Propose** | Suggest an alternative (different person, different role, different period). Goes back to PL for negotiation. |
| **Decline** | Reject with required reason. Routes back to PL; on CR-linked requests, the parent CR is sent back. |

Delta-based resource requests per `[E-04b]`: when a CR reduces hours, the request shows the delta (`-20h`), original allocation (`60h`), resulting total (`40h`), and the currently-allocated person — confirming reduces the existing person's hours rather than adding a new one.

---

## W05.1: Confirm a resource request

**Purpose**: CC Owner accepts a request as-is and materialises the `Allocation` rows by assigning specific people.
**When to use**: The straightforward happy path — CC has the people available, agrees with the request, and just needs to pick assignees.
**Personas involved**: CC Owner (Thomas).
**Pre-conditions**: ≥ 1 resource request awaiting confirmation. Default seed: 9 pending across CR-linked + intake-linked items, surfaced via "Open Requests · 9 pending" tile on Thomas's Launchpad.
**Estimated walk-time**: 4 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | CC Owner | Switch to Thomas. From Launchpad, click **Open Requests** tile (or **Resource confirmation needed** pending action) | Navigates to `/capacity/requests` | Page heading "Capacity Management / Resource Requests"; cards listed for the 3 pending parent items |
| 2 | CC Owner | Click **Review & Assign Resources** on a card with resource requests (e.g., **Autonomous Braking Prototype · 9 resource requests**) | Navigates to `/capacity/project-assignment/proj-autobrake` | Page heading "Autonomous Braking Prototype"; resource-assignment grid renders |
| 3 | CC Owner | Inspect the grid: rows are requested roles (Senior Solution Architect, Senior Developer, Data Engineer, Developer, etc.), columns are months grouped by year (collapsible), each cell shows the requested hours (e.g., "40h" / "80h" / "200h" depending on role × month) | Grid loaded with all rows + months | "All" column between role name and month columns lets you assign one person to every month at once |
| 4 | CC Owner | Click the **All** cell for a row (e.g., Senior Solution Architect 40h × every month) | Person dropdown opens, grouped by relevance: **Matching Role** (people whose role matches "Senior Solution Architect") first, then **Other Roles** | Each person shows their utilization % aggregated across the row's months |
| 5 | CC Owner | Pick a person (e.g., **T. Brenner** — 25% utilized) | All months for that row fill instantly with the person's initials and the requested hours; All cell turns blue with the person's name | Cells display "T. Brenner / 40h" |
| 6 | CC Owner | (Optional) Override individual months by clicking a specific cell → choosing a different person | The overridden cell updates while the rest stay with the All-assigned person | Cell shows the new assignee |
| 7 | CC Owner | Repeat for all rows until the **Status** column shows "12/12" (or similar) for every role | Grid fully assigned | All-assigned indicator green per row |
| 8 | CC Owner | Click **Confirm All & Send to Controller** | Backend creates `Allocation` rows for each assigned person × month × hours; resource requests flip to `confirmed`; CR (if any) flips to `pending_controller_approval` (or `approved` for intake-attached requests with no CR) | Toast "Confirmed and sent to controller"; project disappears from Thomas's pending list |

### Alternative paths

- **Decline at the parent level** (project intake only): instead of step 4, click **Decline** on the project card — modal asks for required reason; routes back to PL with a "CC declined" notification. The project's status reverts to draft.
- **Partial assignment**: leave one or more roles incomplete (e.g., 6 of 12 months covered) → **Confirm All & Send to Controller** stays disabled. To proceed with a partial, use [W05.2](#w052-partially-fulfill-a-resource-request) instead.
- **Person dropdown filter**: typing in the dropdown narrows by name. Out-of-CC people (other CCs) appear under "Other Roles" but are still selectable — confirming an out-of-CC assignment routes a courtesy notification to that CC's owner.

### Post-conditions

- N `Allocation` rows created (`is_confirmed=true`).
- Resource requests flip to `confirmed`; parent CR (if any) advances per the CR lifecycle.
- For project intakes: the project's `Allocation` rows are created and the intake routes to the controller for final approval.
- `audit_log` row in `forecast_actions` (CR-linked) or `pipeline_transitions` (intake-linked).

### Cross-references

- **Decision tags**: `[E-04b]`, `[F-AC-01]`
- **Backend endpoint**: `routers/capacity.py::confirm_request()` (per-row) and `save_request_assignments()` (grid-bulk) → `services/allocation_service.py`
- **In-app manual**: `capacity_management.json § Resource Assignment Grid`, `§ Confirming Resources`, `§ Person Dropdown`
- **FAQ overlap**: faq.json `faq-02` ("How do I respond to a resource request?")
- **Cross-walks**: [W04.2](./04-change-requests.md#w042-cc-owner-cr-confirmation), [W08.3](./08-capacity.md#w083-project-resource-confirmation-all-or-nothing)

### Known issues / caveats

- The Person dropdown's utilization color-coding (green < 70%, amber 70-90%, red > 90%) is computed for the specific month being assigned, not aggregated. The "All" dropdown shows the row-aggregated utilization.
- Once **Confirm All & Send to Controller** is clicked, you cannot un-confirm from this screen. To revert, the controller must reject the parent CR / intake (which cascades back to draft).

---

## W05.2: Partially fulfill a resource request

**Purpose**: CC Owner accepts the request but with reduced hours / amount / period. Sends back to PL for sign-off on the partial.
**When to use**: People available but not for the full ask (e.g., capacity is tight, role is over-allocated, month range overlaps another commitment).
**Personas involved**: CC Owner (Thomas) initiates; PL (Priya) signs off.
**Pre-conditions**: Resource request in `pending` state.
**Estimated walk-time**: 3 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | CC Owner | Open the resource request detail (from the project assignment grid or the per-request side drawer) | Detail view with the Confirm / Partial / Counter / Decline action toolbar | Toolbar visible |
| 2 | CC Owner | Click **Partially Fulfill** | Inline form replaces the single-confirm action with adjustable inputs: reduced hours per month, optional shorter period, free-text explanation | Form fields editable |
| 3 | CC Owner | Reduce hours (e.g., 80h → 60h per month for the requested period); add explanation ("Senior Developer pool over-allocated in Q3 — proposing 60h/mo to stay within capacity") | Form validates | Submit button enables |
| 4 | CC Owner | Click **Submit Partial** | Resource request flips to `partially_fulfilled_pending_pl_approval`; PL gets "Partial fulfilment proposed" notification | Toast "Partial proposed"; request disappears from CC inbox |
| 5 | PL | Switch to Priya. From Launchpad, click the new pending action ("Partial fulfilment proposed for <project>") | Navigates to the project's resource summary view | Banner shows the partial proposal with reduced numbers + CC's explanation |
| 6 | PL | (Option A) Click **Accept Partial** → request flips to `confirmed`; allocations created at the partial level; parent CR advances. (Option B) Click **Reject Partial** → request returns to CC inbox; CC may try again or escalate | State updates per choice | Toast confirms outcome |

### Post-conditions

- On accept: `Allocation` rows at reduced hours; CR advances; project's forecast may need a corresponding adjustment in the next cycle.
- On reject: request stays in pending; CC must take a different action.

### Cross-references

- **Backend endpoint**: `routers/capacity.py::partially_fulfill_request()` (PL accept-partial routes through CR-resubmit / cycle channels per `[E-04b]`)
- **In-app manual**: `capacity_management.json § Response Actions`
- **FAQ overlap**: faq.json `faq-02`

### Known issues / caveats

- A partial fulfilment that the PL accepts may leave the project's forecast > available hours — the next cycle's wizard will surface this as a variance flag (see W03.1 step 3).

---

## W05.3: Counter-propose on a resource request

**Purpose**: CC Owner suggests an alternative resource plan (different person, different role, different timing) instead of fulfilling the request as written. Routes to PL for negotiation.
**When to use**: The exact ask isn't fulfillable but the underlying need can be met differently (e.g., "no Sr Dev availability but I can give you 2 mid-level Devs at the same hours").
**Personas involved**: CC Owner (Thomas) initiates; PL (Priya) accepts / rejects.
**Pre-conditions**: Resource request in `pending` state.
**Estimated walk-time**: 4 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | CC Owner | From the request detail toolbar, click **Counter-Propose** | Inline form: alternative role, alternative person, alternative monthly hours, free-text rationale | Form fields editable |
| 2 | CC Owner | Fill: alternative role "Developer" (instead of "Senior Developer"); split the hours across 2 named Developers; same period; rationale "Sr Dev pool fully booked, proposing 2 mid-level Devs Felix Keller + Sophie Bauer at 50% each" | Form validates | Submit button enables |
| 3 | CC Owner | Click **Submit Counter** | Resource request flips to `counter_proposed_pending_pl`; PL notified | Toast "Counter-proposed"; request leaves CC inbox |
| 4 | PL | Switch to Priya. From Launchpad, click the **Counter-proposal** action | Navigates to the project's resource summary | Banner shows side-by-side: original ask vs CC's counter |
| 5 | PL | Read the counter rationale; choose: **Accept Counter** (locks the alternative plan) or **Reject Counter** (sends back to CC for another attempt) | State updates per choice | Toast confirms outcome |

### Post-conditions

- On accept: `Allocation` rows materialised against the counter-proposal's people / role / hours; original request closed with `closed_via_counter`.
- On reject: request returns to CC with PL's optional rationale; CC may try counter-2 or pivot to confirm / decline.

### Cross-references

- **Backend endpoint**: `routers/capacity.py::counter_propose_request()` (PL accept routes through CR-resubmit / cycle channels per `[E-04b]`)
- **In-app manual**: `capacity_management.json § Response Actions`
- **FAQ overlap**: faq.json `faq-02`

### Known issues / caveats

- Counter-proposals are constrained to the same parent project / CR scope — you can't counter-propose a request that originated from project A by offering people for project B. The CR's project is the unit of negotiation.
- The counter UI lets the CC propose **multiple people** to share the requested hours; the system allocates the split per the proposed percentages.

---

## W05.4: Decline a resource request

**Purpose**: CC Owner rejects the request with a reason. The PL is notified; on CR-linked requests, the parent CR is sent back to the PL.
**When to use**: The ask cannot be fulfilled at all (no people available, role doesn't exist in this CC, dates infeasible). Decline is the most-disruptive action — most CC Owners try Partial / Counter first.
**Personas involved**: CC Owner (Thomas) initiates; PL (Priya) sees the decline.
**Pre-conditions**: Resource request in `pending` state.
**Estimated walk-time**: 2 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | CC Owner | From the request detail toolbar, click **Decline** | Modal asks for required free-text reason | Modal heading "Decline resource request" |
| 2 | CC Owner | Type the reason ("No Sr Dev capacity in MUC for Q3-Q4; recommend re-prioritising or sourcing externally") | Form validates | Submit button enables |
| 3 | CC Owner | Click **Confirm decline** | Resource request flips to `declined`; PL gets "Resource request declined" notification on Launchpad | Toast "Declined with reason"; request leaves CC inbox |
| 4 | PL | Switch to Priya. Click the decline notification | Navigates to the project's resource summary with the decline rationale visible | Banner shows the CC's reason text |
| 5 | PL | (For CR-linked requests) Decide: re-edit the forecast to reduce the ask, or escalate to controller. The parent CR is auto-routed back to `pending_controller_approval` with a "CC declined — controller decision required" indicator | CR back in controller queue | Status badge updated |

### Post-conditions

- Resource request `status='declined'`.
- For CR-linked: parent CR may auto-flip to `pending_controller_approval` with the decline note attached.
- For intake-linked: project may revert to draft with a "CC declined" flag.
- Notifications fire to PL (and Controller, if CR-linked).

### Cross-references

- **Backend endpoint**: `routers/capacity.py::decline_request()`
- **In-app manual**: `capacity_management.json § Response Actions`
- **FAQ overlap**: faq.json `faq-02`

### Known issues / caveats

- Decline is the **only** action that surfaces a reason field as required. Partial / Counter explanations are recommended but not enforced.
- A declined request is not deleted — it stays in the audit trail with `status='declined'`. The PL can re-trigger a fresh request by editing the forecast and re-submitting through the wizard (W03.1).

---

## Cross-workflow notes

- **CR-linked vs intake-linked**: Resource requests linked to CRs (W04.2's flow) vs to project intakes (W08.3's flow) follow the same per-row mechanics but route differently on confirm / decline. CR-linked requests advance the CR's lifecycle; intake-linked requests advance the project's pipeline stage.
- **The CC step is the gating point**: Until all resource requests on a CR / intake are confirmed (or partially fulfilled / countered with PL acceptance), the parent doesn't advance. Decline / re-propose loops are unbounded.
- **Allocation overlap detection**: When the CC assigns a person to a new request, the dropdown shows their current utilization for the affected months. Selecting an already-overcommitted person is allowed (the system doesn't hard-block) but surfaces the red utilization indicator.
- **Person dropdown grouping** (per `capacity_management.json § Person Dropdown`): "Matching Role" employees first, "Other Roles" second. Out-of-role assignments are visible but de-prioritised in the dropdown order.

## Related FAQ entries

- `faq-02` — "How do I respond to a resource request?"
- `faq-10` — "What happens when a CR involves reducing hours for a role?"
