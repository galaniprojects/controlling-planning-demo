# What-If Simulator — Manual E2E Browser Pass (Bug Report)

**Session:** Functional-gap hunt, browser-driven (Playwright MCP @ 1440px), post-S6 (location-aware rates merged).
**Date:** 2026-06-04
**Personas:** Controller (Anna Meier), Project Lead (Priya Sharma).
**Scope:** Full simulator workflow incl. Tier-3, promote-with-routing, and apply-to-forecast (executed, then reset-demo).
**Note:** Read-only testing — issues documented, not fixed.

---

## Summary

Browser-driven pass as Controller (Anna) + Project Lead (Priya). Both centerpiece flows — **promote-with-routing** and **apply-to-forecast** — were executed end-to-end against live data, then the demo was reset.

**Headline issues (3):**
- **F8 [blocker]** — Promoting a forecast diff on an other-PL project marks it "promoted" but creates **no Change Request**; the change silently vanishes (no forecast write, no CR). DB-confirmed: 0 CRs created.
- **F7 [blocker for Tier-3]** — The entire Tier-3 **Resources** sidebar section (People master, Capacity params, Remove role, Reduce headcount, Relocate, Hire) is **no-op navigation** — the surfaces exist (reachable by URL) but no button reaches them. Portfolio Settings buttons (same pattern) work, isolating the defect to Resources.
- **F4 [should-fix/borderline blocker]** — The **Recalculate button sticks permanently on "Recalculating…"** after any recalc on the grid surface; recovers only on full page reload. Impact data still updates, but the control + freshness indicator break.

**Severity counts:** blockers 2 (F7, F8) + 1 borderline (F4) · should-fix 4 (F4, F6, F10, F11) · nits 3 (F2, F5, F9) + F1 should-fix · plus ~7 minor observations.

**What WORKED well (no issues):** scenario create/clone/publish/unpublish; the S6 location-split (Data Engineer Munich €100 vs Budapest €70 render as separate lines, rates correct); cell edits + commit; Delay macro + 8-dimension impact strip (European formatting); role-line-with-location add; external-cost line add; cost-allocation Stage 1 edit → saves to live edge 34 on promote; cost-allocation Impact preview; promote preview/routing/audit-trail; the **stale-anchor 409 guard + rebase prompt**; apply-to-forecast writing 154 provisional cells; compare L1→L2 + same-anchor enforcement; PL role gating (no promote, no Tier-3, project scope locks, published-only apply).

**Coverage gaps (NOT exhaustively tested this pass):** Tier-3 mix swaps & restructuring action forms (blocked by F7 — surfaces unreachable via UI; mix-swap grid control not separately exercised); the full Bulk Actions catalogue (portfolio rules / target setters); budget-envelope / escalation-factors / hierarchy-reassign / hypothetical-project / backlog-sandbox surfaces (only rate-table + cost-allocation exercised in depth; others render-checked or not visited); per-dimension Impact detail-panel drill-downs; Stage 2 BTC editing (blocked by F6 404); Executive & CC-Owner personas (out of agreed scope). The 10-scenario cap was not stress-tested.

---

## Findings

Severity legend: **[blocker]** breaks a workflow · **[should-fix]** wrong/confusing behaviour · **[nit]** cosmetic/polish.

### F1 — [should-fix] Manager "Headline Impact" column dumps raw JSON for non-financial scenarios
- **Where:** `/simulator` → Scenario Manager → My Scenarios table, "Headline Impact" column.
- **Observed:** "MDH BTC Rebalance — DE/PL/CZ" row shows the literal string `{"total_btc_pct_shift": 10, "affected_locations": 3, "action_...` (truncated raw dict). As CC Owner Thomas, "MDH Staffing Mix — MUC/APD" likewise showed `{"total_capacity_shift_fte": 0.0, "senior_to_mid_swap_pct": 40, "action_count": 1}`.
- **Expected:** A formatted summary like the "Budget Pressure: 15% Reduction" row, which correctly renders `-€59K (3 actions)`.
- **Likely cause:** The headline-impact formatter only handles the financial-delta shape and falls back to `JSON.stringify` for other shapes (BTC pct shift, staffing swap).
- **Screenshot:** `qa/screenshots/sim-e2e/p1-manager-controller.png`

### F2 — [nit] Live-local "Internal Resources" summary doesn't disambiguate same-role/multi-location lines
- **Where:** Forecast-grid surface → "Preview — reconciled by server" → Internal Resources breakdown.
- **Observed:** For Master Data Hub Rollout the breakdown lists two entries both labelled just **"Data Engineer"** (totals 89.100 € Munich vs 62.370 € Budapest) with no location qualifier — you can't tell which row is which.
- **Expected:** Qualify with location like the grid rows do ("Data Engineer — Munich" / "— Budapest"). Post-S6 (split-by-location) this summary should carry the location too.
- **Note:** Rates themselves are CORRECT (Munich €100 vs Budapest €70 confirmed; Developer Pune €38; the S6 split renders properly). This is purely a label-ambiguity nit in the summary panel.

### F3 — [should-fix] Change Summary badge counts lifecycle (publish/unpublish) events as if they were promotable diffs
- **Where:** Scenario workspace → "Change summary" FAB badge + drawer.
- **Observed:** On a freshly-created scenario, publishing then unpublishing it produced two feed entries ("Published scenario", "Unpublished scenario", tagged **Lifecycle**) and the badge read **2** before any content diff existed. After one cell edit the badge read **3**, but only **1** entry is a promotable diff.
- **Expected:** The badge should reflect promotable diffs (the "Action"/overlay entries), not lifecycle events — otherwise the count overstates what Promote will act on. Either exclude Lifecycle entries from the count, or show a separate count.
- **Mitigation present:** Entries are visibly tagged "Lifecycle" vs "Action", so the drawer itself isn't misleading — only the badge count is.
- **Screenshot:** `qa/screenshots/sim-e2e/p2-cell-edited.png`

### F4 — [should-fix / borderline blocker] "Recalculate" button gets permanently stuck on "Recalculating…" after any recalc; only a full page reload recovers it
- **Where:** Scenario workspace header → Recalculate button + "Recalculated …" indicator. Reproduced on scenario id 5 (E2E Kitchen Sink) on the forecast-grid surface.
- **Repro (clean, minimal):** Open a scenario → click **Recalculate** once. Network shows a single `POST /api/scenarios/5/recalculate → 200` and `GET /impact → 200`; the impact strip correctly populates (Financial +€9K etc.). **But the button stays disabled showing "Recalculating…" indefinitely** and the indicator never updates to "just now". No further network request is in flight and there is **no** recalc loop (verified: exactly one recalc call).
- **Persistence:** The stuck state survives SPA navigation to other projects/surfaces within the scenario (it's scenario-context-level, not surface-local). It clears **only on a full browser reload**, after which the button returns to enabled "Recalculate".
- **Also triggered by:** the implicit auto-recalc fired after a cell edit + macro apply — i.e. the first recalc of a session sticks the button.
- **Impact:** The manual Recalculate control becomes unusable for the rest of the session, and the user gets no "done" feedback (stale-vs-fresh is unreadable). Core impact computation still works, so it's not a hard blocker — but the primary recalc affordance is broken.
- **Likely cause (hypothesis, unverified — read-only session):** the `loading`/`recalculating` flag in the scenario context is set true on recalc start but never reset to false in the promise's resolve/finally path (or a second state update overwrites the reset). Worth checking `RecalculateButton` / `ScenarioContext.recalculate()`.
- **Screenshots:** `qa/screenshots/sim-e2e/_hdr.md`, `_hdr3.md` (snapshots showing `button "Recalculating…" [disabled]`).

### F5 — [nit] "Recalculated …" relative timestamp is off by the UTC↔local offset
- **Where:** Scenario workspace header "Recalculated N ago" indicator.
- **Observed:** Immediately after a recalc that happened seconds/minutes ago, the indicator read **"Recalculated 2h ago"** (local TZ here is CEST = UTC+2).
- **Likely cause:** server stores `last_recalculated_at` in UTC; the frontend relative-time formatter compares against local `now` without applying the offset (or parses the timestamp as local).
- **Note:** Partly masked by F4 (the indicator rarely updates live anyway), but visible right after reload.

### F6 — [should-fix] Cost-allocation sandbox "Stage 2 BTC" tab errors with "Failed to load BTC profile" for Internal Services (404)
- **Where:** `/simulator/.../surface/cost-allocation` → pick an entity → **Stage 2 BTC** tab.
- **Observed:** For "Application Monitoring Service" (`svc-monitoring`, an InternalService) the tab shows a hard error card **"Failed to load BTC profile."** Console shows `GET /api/charging/entities/svc-monitoring/btc-profile?year=2026 → 404` (fired twice).
- **Context:** Internal Services derive their BTC automatically from the UM matrix (no manual BTC profile row), per the charging-module design. The 404 is therefore *expected* for an Internal Service — but the sandbox tab surfaces it as a failure instead of the graceful "Automatic / UM-derived — no manual profile" read-only state the live charging module shows.
- **Severity rationale:** Every entity in the sandbox entity picker is labelled "InternalService · Run", so Stage 2 BTC sandbox editing appears broken for *all* selectable entities — a tester/demo-er can't reach a working Stage 2 BTC view here. (If Offerings are meant to be selectable too, they're not visible in the picker — worth confirming.)
- **Screenshot:** `qa/screenshots/sim-e2e/p2-costalloc-stage2.png`
- **Working parts (for contrast):** Stage 1 distribution edits save cleanly (`PUT /cost-allocation/distributions/{id} → 200`, no 409), self-retained auto-recomputes as the remainder, and the Impact preview tab renders the per-location delta table correctly. The cost-allocation impact tile updated (−€29K) after the Stage 1 edit.

### F7 — [blocker for Tier-3] The entire Tier-3 "Resources" sidebar section is no-op navigation — surfaces unreachable via the UI
- **Where:** Scenario workspace → left sidebar → **Resources** section (TIER 3 badge). Buttons: People master data, Capacity parameters, Remove role from portfolio, Reduce headcount by location, Relocate team, Hire block.
- **Observed:** Clicking ANY of these six buttons highlights the button (selected/focus style) but **does not navigate** — the URL stays unchanged (e.g. `/simulator/scenarios/5`) and the main panel keeps showing the empty placeholder "Pick a project, the backlog, or a portfolio setting from the sidebar to load a sandbox surface." Reproduced from multiple starting states (bare workspace, and other surfaces).
- **The surfaces DO exist** — navigating directly by URL works: `/surface/people-master` renders the People master data Tier-3 surface (Add hypothetical hires / Remove role / Reduce headcount / Relocate team), and `/surface/capacity-parameters` renders the Capacity parameters surface (location + available-hours override). So the defect is in the **Resources sidebar section's navigation handlers**, not the surfaces.
- **Isolation proof:** The structurally-identical **Portfolio Settings** buttons in the same sidebar navigate correctly — clicking "Rate tables" goes to `/surface/rate-table`. Projects buttons also navigate fine. Only the Resources (Tier-3) section is broken.
- **Impact:** A normal user (incl. Controller/CC-Owner with Tier-3) **cannot reach any Tier-3 people/capacity/restructuring surface through the UI** — the whole Tier-3 entry point is dead. This is the most severe functional gap found.
- **Note on the earlier false lead:** the surface KEY is hyphenated (`people-master`); an underscore URL (`people_master`) correctly falls through to the placeholder. The bug is the no-op buttons, not a key-casing mismatch in the routes.
- **Screenshots:** `qa/screenshots/sim-e2e/p2-tier3-noop.png`, `p2-removerole-full.png` (selected button + empty panel), `p2-people-hyphen.png` (working surface via direct URL).

### F8 — [blocker] Promoting a forecast diff on an other-PL project marks it "promoted" but creates NO Change Request — the change silently vanishes
- **Where:** Promote-with-routing (Controller). Scenario 5, action #6 = the `delay_project` macro on `proj-mdh-rollout` (owned by another PL, not the Controller).
- **Flow:** Routing preview correctly classified #6 as **Change request / Review required**. Executed the promotion → "Promotion complete — Applied 2 diffs". The promotion audit (`scenario_promotions` id 2) records #6 as `routing_type: change_request, status: "promoted", message: "Macro on proj-mdh-rollout routed to a change request (other-PL project — not auto-written)."`
- **Bug:** No ChangeRequest row was created. DB check: `SELECT count(*) FROM change_requests WHERE created_at LIKE '2026-06-04%'` → **0**. The only `proj-mdh-rollout` CR (#28) is seeded from 2026-05-07. The CR Approvals queue (`/portfolio/approvals`) shows only the pre-existing seeded CR #19.
- **Net effect:** The diff is **consumed** (marked `promoted`, so it won't be offered for promotion again) but produces **no artifact** — it is *neither* written to the live forecast (correctly deferred, since it needs review) *nor* materialised as a CR for the owning PL/CC to act on. The promoted forecast change is lost, and the audit trail misleadingly says it was "routed to a change request."
- **Contrast (positive path works):** The cost-allocation diff #7 promoted correctly — `distributions.id=34` (svc-monitoring → off-bizinsights) is now `percentage=45` on `version_id=1` (production), `modified_at=2026-06-04 10:34:42`. So same-promotion, the direct cost-allocation write hit live data; only the forecast→change_request branch produced nothing.
- **Severity:** Blocker for the promote→CR workflow. Either the CR creation isn't implemented behind the `change_request` routing branch, or it errored silently. Worth checking `services/scenario_promote.py` change_request branch.
- **Screenshots:** `qa/screenshots/sim-e2e/p5-promote-history.png` (audit says "routed to a change request"), `p5-cr-queue.png` (queue has no new CR).

### F9 — [nit] "Promotion complete" line shows a raw ISO timestamp with microseconds (UTC)
- **Where:** Promote page, post-execute "Promotion complete" card.
- **Observed:** "Applied 2 diffs at `2026-06-04T10:34:42.055673`." — raw ISO8601 with microseconds, in UTC (local was ~12:34 CEST).
- **Expected:** Formatted/localized like the Promotion-history drawer, which correctly renders "04/06/2026, 10:34:42" (still UTC — see F5 — but at least formatted).

### (obs) Promoted diffs remain listed as unchecked/selectable in the promote selector (not marked "already promoted")
- After executing, diffs #6/#7 still appear in "Step 1 — Select diffs to promote" as normal unchecked rows rather than being marked promoted/greyed. Re-selecting + re-promoting them is skipped server-side (partial-promote logic), but the selector doesn't communicate the already-promoted state. Minor UX.

### (obs) Direct URL to `/simulator/scenarios/:id/promote` redirects back to the scenario
- Deep-linking to the promote page redirects to `/scenarios/:id`; the page is only reachable via More actions → "Promote scenario…". Likely an intentional guard (needs scenario context), but breaks deep-linking/refresh on the promote page.

### F10 — [should-fix] Rebase modal requires a raw numeric "version id" with no picker — undiscoverable
- **RESOLVED — Session 3 (2026-06-05).** `RebaseModal` is now a per-project batch picker: one row per touched project with a labeled cycle `Select` (`v2 — Q2 2026 Cycle`, candidates listed), a Current/Stale badge, and the current anchor caption — fed by the new `GET /api/scenarios/{id}/rebase-options`. Verified light + dark, single- and multi-project (`qa/screenshots/sim-e2e-s3/`).
- **Where:** Scenario manager / workspace → Rebase Scenario modal ("New anchor version id").
- **Observed:** The field is a bare number spinbutton (placeholder "e.g., 12"). The user must *know* the integer id of the target forecast-cycle version. There is no dropdown of available cycles with labels (e.g. "Q2 2026 Cycle"), and the modal shows "Current anchor: none" with no list to choose from. Even with DB access it was non-obvious which id to use (versions are per-project; the current cycle `seed-current-cycle` spans ids 2–22).
- **Expected (per design intent):** a select of available forecast-cycle versions with human labels + change-set preview, not a raw id.
- **Severity:** Blocks self-service rebase for a normal user; combined with F-below (stale seeded anchors) it makes apply-to-forecast unreachable without back-end knowledge.

### F11 — [should-fix] Seeded PL scenario "Predictive Maintenance — Defer 3 Months" has a NULL anchor (`anchor_forecast_version_id` = none)
- **RESOLVED — Session 3 (2026-06-05).** The scalar anchor was replaced by per-project `ScenarioProjectAnchor` rows, and `loader._seed_scenario_anchors()` now pins each seeded scenario's touched projects to their latest cycle at seed time (6 anchors across 4 scenarios on reseed). Scenario 4 (`proj-predmaint`) ships anchored to `v2 (Q2 2026 Cycle)` and applies with **no 409** (verified in-browser as PL). Issue B (the per-project schema + non-deterministic global-latest tie-break) closed in the same change.
- **Where:** Scenario 4 (seeded). The Rebase modal shows "Current anchor: none"; `scenarios.anchor_forecast_version_id` is NULL in the DB.
- **Impact:** apply-to-forecast immediately 409s ("Anchor is out of date") because the anchor is null, forcing a manual rebase before the scenario can ever be applied. A seeded demo scenario should ship anchored to the cycle it was authored against. Likely the living-seed date-shift (or the seed itself) doesn't populate the scenario anchor. (For contrast, the scenario I created fresh, id 5, correctly anchored to version 2.)

### (obs) Apply-to-forecast requires the scenario to be PUBLISHED even for its owner
- The "Apply to forecast" button is disabled for a PL's own *private* scenario with tooltip "Only published scenarios can be applied." Publishing first enables it. This may be intentional (apply = "carry a blessed/published scenario into forecast"), but it contradicts the notion that a PL can apply their own work directly — worth confirming the intended rule. Not logged as a bug pending that confirmation.

### (obs) Positive — the apply-to-forecast happy path works end-to-end
- After rebasing scenario 4 to a current-cycle version (id 2) and re-applying: `POST /apply-to-forecast → 200`, result modal "Carried forward: 1 / Skipped: 0" (proj-predmaint "carried — PL can carry forward forecast_grid diff"), and the DB shows **154 `is_provisional=1` forecast cells** written for proj-predmaint. The stale-anchor 409 guard, the "Anchor is out of date" prompt, and the rebase→re-apply resumption all behaved correctly. (Contrast with F8: apply writes its artifact; promote's change_request branch does not.)

### (obs) Minor polish during apply/rebase
- The Rebase modal opens *stacked on top of* the still-open "Anchor is out of date" modal (two dialogs visible at once) rather than replacing it.
- The apply result "Provenance" text leaks an internal spec tag to the UI: "…Visible to controller per **[B-OQ-02]**." Several seeded scenario descriptions also carry raw tags like `[F-AC-01]`. Cosmetic.

### (obs) Empty `dialog` ("Close panel") persistently in the accessibility tree
- A `dialog` element with a single "× Close panel" button is present in every snapshot even when no panel is open (shared SidePanel container). Not visually intrusive. Low-priority a11y note — an always-present empty dialog can confuse screen readers.

---

# FIX-SESSION KICKOFF

> Hand this whole document to a fresh session. Read the **Product decisions** below as the authoritative behaviour spec — they were settled in a planning conversation and **override the current spec/implementation where they conflict** (notably apply-to-forecast). Then work the **Fix plan** in priority order.

## How to use this doc (read first)
- **Re-verify every bug reproduces before changing code.** The findings were gathered in a single read-only browser pass; one false positive was already caught mid-session. Confirm the repro, then fix.
- **Root-cause notes are hypotheses, not diagnoses.** File/line pointers are leads from a read-only trace — confirm in the code.
- **This changes spec'd, tested behaviour.** Apply-to-forecast's `is_provisional` write is what `[B-PR-05]`/`[B-OQ-02]` currently prescribe and what tests assert. Switching it to CR-creation means updating the spec (`guides/Simulator_Project_Scope_Redesign_Spec.md`), `docs/data-model.md`, the in-app manual, and the affected tests (`test_scenario_apply_forecast.py`, `test_apply_forecast_widened.py`, `test_scenario_promote.py`) as part of the work — not just the code.
- **Branch off `main`**, per CLAUDE.md. Log to `PROGRESS.md` as the final commit.

## Product decisions (authoritative — locked in planning)

1. **Forecast invariant (already true — preserve it).** Every approved change appends a new immutable `ForecastVersion` — `cr_approval` on CR approval (`routers/portfolio.py:765`), `cycle` on cycle completion. The forecast is **never** mutated as a versioned artifact. The PL's single entry point is the **"Rolling Forecast Review"** wizard (`routers/workbench.py:810 submit_forecast_cycle`), which creates **one CR per cost centre** (`ChangeRequest` + `CRChangeDetail` + `_create_resource_requests_from_cr`) → CC/Controller approval → new version.

2. **Apply-to-forecast (PL) must create CRs, not provisional cells.** Replace the `is_provisional` direct write (`scenario_apply_forecast.py:306 _materialize_project` → `materialize_provisional_cells`) with: **one prepopulated `draft` ChangeRequest per own-project that has diffs**, built from the scenario's resolved diffs vs that project's current forecast (reuse the CR-creation path that `submit_forecast_cycle` already uses — `CRChangeDetail` rows + cost-centre grouping + resource requests). It lands in **`draft`** so the PL can make additional edits in the Workbench before submitting it into the normal CR workflow.
   - **DO NOT remove the `is_provisional` column.** It has a separate, legitimate use (`models/financial.py:93`, C1 `[C-FG-07]`: months beyond the granularity boundary). Only stop the *apply* path from writing scenario-carried provisional cells.

3. **Promote (Controller) must create one CR per project with forecast diffs (F8).** The current `change_request` routing branch marks the diff `promoted` but creates nothing (DB-confirmed). Make it create a prepopulated CR per affected project (same CR-creation path as #2). **Recommendation (confirm at fix time):** the promoted CR lands as a **`draft` owned by that project's PL** (keeps the PL in the loop, mirrors apply) rather than going straight into the pipeline. Cost-allocation routing already works (writes live edge on promote) — leave it.

4. **Issue A — apply gate.** Apply is allowed when the user is the **owner** (any status, incl. private) **OR** the scenario is **published and has diffs on a project they own**. Fix the FE gate (`ApplyButton.tsx:29` currently `disabled={!isPublished}`) and reconcile the BE check (`scenario_apply_forecast.py:175-179`, which already allows owner-or-published) so the two agree.

5. **Issue B — per-project anchor (schema change).** Replace the single scalar `Scenario.anchor_forecast_version_id` with a **per-project anchor** (proposed: a `scenario_project_anchors(scenario_id, project_id, forecast_version_id)` association). For each project a scenario touches, pin/compare against **that project's latest `ForecastVersion`**.
   - Seeded scenarios must ship **anchored correctly** (fixes F11 — they currently ship NULL; the "set on first open" step in `seed/.../s19_scenarios.py:66` doesn't exist). Populate at seed time.
   - New scenario at creation: anchor each touched project to **its** latest version (replaces the single-`_latest_cycle_version_id` logic at `routers/scenarios.py:300`).
   - Existing open scenarios keep their anchors until rebased (don't silently re-baseline).
   - Stale-guard (`scenario_apply_forecast.py:115`, `scenario_promote.py assert_anchor_is_latest_cycle`) becomes a **per-project** check.
   - Rebase UX (F10): replace the raw numeric "version id" input (`RebaseModal`) with a **labeled cycle/version picker**.

## Fix plan (priority order)

**P0 — blockers**
- **F7** — Tier-3 "Resources" sidebar section is no-op navigation (all 6 buttons). Surfaces exist at `…/surface/people-master` & `…/surface/capacity-parameters`; Portfolio Settings buttons (same pattern) work. Suspect the Resources section's click/nav handlers (`ResourcesSection.tsx` per the FE map). Likely a quick FE fix.
- **F8** — Promote creates no CR for other-PL forecast diffs (silent drop). Implement per-project CR creation per decision #3. (`services/scenario_promote.py` change_request branch.)

**P1 — should-fix / behaviour changes**
- **Apply → draft CR** (decision #2). Largest change; pair with F8 since they share the CR-creation reuse.
- **Issue B** (decisions #5) — per-project anchor schema + seed anchors + rebase picker. (F10, F11.) Schema change → `docs/data-model.md` + CLAUDE.md index + PROGRESS per the non-negotiable doc rule.
- **F4** — Recalculate button sticks on "Recalculating…" after any recalc on the grid surface (recovers only on full reload); freshness indicator never updates. Suspect `RecalculateButton.tsx` / `ScenarioContext.recalculate()` not resetting the loading flag in resolve/finally.
- **Issue A** gate fix (decision #4).
- **F6** — Cost-allocation Stage 2 BTC tab shows "Failed to load BTC profile" (404) for Internal Services; render a graceful "Automatic / UM-derived" state instead.
- **F1** — Manager "Headline Impact" column dumps raw JSON for non-financial scenarios; format like the financial case.

**P2 — nits / polish**
- **F2** same-role/multi-location lines not disambiguated in the live-local summary · **F5** "Recalculated 2h ago" UTC-offset in relative time · **F9** raw-ISO promote-complete timestamp · change-summary badge counts lifecycle events · promoted diffs not marked in the selector · stacked rebase/anchor dialogs · `[B-OQ-02]`/`[F-AC-01]` spec tags leaking into UI text · always-present empty a11y dialog · direct-URL `/promote` redirect.

## Key files (leads — verify)
- Apply: `backend/services/scenario_apply_forecast.py` · Promote: `backend/services/scenario_promote.py`
- CR creation to reuse: `backend/routers/workbench.py:810` (`submit_forecast_cycle`), `backend/routers/portfolio.py` (`_create_resource_requests_from_cr`, `_capture_fv:765`, approve `:736`) · CR model: `backend/models/change_requests.py`
- Anchor: `backend/routers/scenarios.py` (create `:300`, rebase `:522`), `backend/models/scenarios.py`, seed `backend/seed/generate_seed_v5/s19_scenarios.py:66` + `backend/seed/loader.py:157`
- FE: `ApplyButton.tsx` (gate), Resources sidebar section (F7), `RebaseModal` (F10 picker), `RecalculateButton.tsx`/`ScenarioContext.tsx` (F4), cost-allocation Stage 2 surface (F6), scenario-manager table (F1)
- Context docs: `guides/Simulator_Project_Scope_Redesign_Spec.md`, `docs/data-model.md`, `CLAUDE.md`, `PROGRESS.md`

## Decisions still open for the fix session to confirm with the user
- Promote-on-other-PL CR: `draft` owned by the PL (recommended) vs straight into `pending_cc_confirmation`.
- Whether apply should pre-group the draft CR by cost centre exactly like the wizard, or as a single CR per project.
