# 07 — Charging & Allocations

Cluster F's two-stage cost-flow model: **Stage 1** routes own-cost between chargeable entities (project / offering / internal service) along a DAG of percentage-weighted edges per `[F-S1-01..05]`; **Stage 2** allocates an entity's effective cost across charging locations through Business-Transfer Charging (BTC) profiles per `[F-S2-01..08]`. The Charging module's four sidebar sections live under `/charging?section=distribution|btc|rollup|reports` per `[F-RV-01]`.

**The flagship**: Master Data Hub (`off-mdh`, S-code S042, identifier IT00S042). 4 upstream feeders into `off-mdh` (Identity & Auth 30%, Infra Platform 18%, Data Platform 20%, IAM Run 12%); 1 downstream consumer (Data Stewardship 5%); to-business 95%. Use `off-mdh` as the canonical entity throughout this doc.

**Demo seed sizing (v5):** 39 distribution edges across 34 chargeable entities; 27 BTC profiles (15 manual + 12 automatic); UM matrix has 312 cells across 12 S-codes × 2 quarters (2025-Q1, 2026-Q1); ~90 charging locations + ~120 legal entities.

---

## W07.1: View Stage 1 distribution graph

**Purpose**: Browse all inter-service distribution edges for a year/version to understand how cost flows between chargeable entities.
**When to use**: Anchoring a Cluster F walk; auditing the topology before editing; demoing the Stage 1 model.
**Personas involved**: All roles (read-only for non-controllers).
**Pre-conditions**: Charging module accessible (default landing for `/charging`).
**Estimated walk-time**: 3 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Any | Navigate to `/charging` (top-bar nav or sidebar) | ModuleHeader "Charging & Allocations / Inter-service distribution, BTC profiles, and location cost rollup for the IT portfolio." Sidebar with 4 items (Inter-service Distribution / BTC Profiles / Location Cost Rollup / Reporting) | Default section is `distribution`; URL gains `?section=distribution` on first sidebar click |
| 2 | Any | Inspect the KPI strip at the top: 3 cards | Cards labelled "Edges" / "Source entities" / "Year × version" | Counts are non-zero. Demo seed: ~39 edges / ~14 source entities / "2026 / forecast" |
| 3 | Any | Use the filter bar: Year (2025/2026/2027), Version (forecast/baseline/actuals), Source type (All/Projects/Offerings/Internal Services), Search box | Filters apply immediately; KPI strip updates | Search "Master Data Hub" narrows to 5 rows (4 inflows to mdh + 1 outflow from mdh); changing the type filter to "Internal Services" reduces edges to those whose source is an internal service |
| 4 | Any | Scroll the edges table | Each row: Source entity name + identifier (mono) → arrow → Destination entity name + identifier → Percentage (right-aligned, 2 dp) → pencil icon | Bus rule check: clicking the pencil takes a controller into the editor; non-controllers see the row but the editor refuses save |

### Post-conditions

No state change — read-only view. The default `(year=2026, version='forecast')` selection is the canonical view; other (year, version) tuples expose the standard VIPER baseline/forecast/actuals lifecycle per `[F-S1-04]`.

### Cross-references

- **Decision tags**: `[F-S1-01]`, `[F-S1-04]`, `[F-RV-01]`, `[E-10]`
- **Backend endpoint**: `routers/charging.py::list_distributions` (GET `/api/charging/distributions`)
- **In-app manual**: `charging.json § Inter-service Distribution`
- **FAQ overlap**: faq-v5-04 ("How do I edit a Stage 1 distribution edge?")

---

## W07.2: Edit a distribution edge with sum-rule validation

**Purpose**: Adjust a percentage on an existing edge or change `to_business_pct`, watching the sum-rule indicator stay green.
**When to use**: Master-data correction (a service was over-distributing), or modelling a Stage 1 mix shift before lever-12 promotion.
**Personas involved**: Controller (or a role explicitly granted `RolePermissionGrant` for `entity_type='distribution'` per `[F-AC-01]`).
**Pre-conditions**: ≥ 1 outgoing edge exists on the chosen source entity. Demo: `off-mdh` has outflow to `svc-data-stewardship` at 5%.
**Estimated walk-time**: 4 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Controller | From the distribution list (W07.1), search "Master Data Hub" → click the **pencil** on any row whose source is `off-mdh` | Opens the EntityDistributionEditor scoped to `off-mdh` | Header "Master Data Hub" + Offering badge + Run badge. Subheader "IT00S042 · 2026 / forecast" |
| 2 | Controller | Inspect "Distribution shape" card: 3 columns — **To-Business %** (input, current 95.00), **Distributed (Σ edges)** (5.00%), **Self-retained (derived)** (0.00%) | All three numbers visible, mono font | Sum: 95 + 5 + 0 = 100. Self-retained calculation per `[F-DM-02]` |
| 3 | Controller | In **Outgoing edges** card, click the **save** icon next to `svc-data-stewardship` row to enter inline edit | Percentage cell becomes a numeric input | Auto-focused input |
| 4 | Controller | Change 5.00 → 8.00, click **Save** (Save icon button) | Row updates; full editor refetches; banner stays absent (no sum-rule violation) | Distributed (Σ edges) jumps to 8.00%, Self-retained remains 0%? **No** — to-business stays 95, edges 8 → 103% would violate. So change to-business first |
| 5 | Controller | Change To-Business from 95 → 92, click Save next to it | Save button enables when input differs; saving updates summary | Distributed = 5%, Self-retained = 3% (= 100 − 92 − 5). Sum-rule banner stays absent |
| 6 | Controller | Click **Add destination** to add a new edge | Modal "Add distribution edge" with Source: Master Data Hub (IT00S042), Available headroom: e.g. 3.00% | Headroom = 100 − to_business − Σ existing edges |
| 7 | Controller | Pick a candidate destination (e.g. `svc-cmdb-platform` if available), enter 3.00, click **Add edge** | Modal closes; new row appears at bottom of edges table | KPI strip: Distributed jumps from 5.00 to 8.00; Self-retained drops to 0% |

### Alternative paths

- **Sum-rule violation on save**: If Σ edges + to-business > 100, the inline editor raises an error message ("Only X% available before the sum cap of 100% is exceeded.") and the save is rejected client-side.
- **Sandbox path** (lever 12): if the same editor is mounted from a scenario workspace, the same form routes through `ScenarioContext` and stores edits as `ScenarioAction` overlays on `Distribution.version='scenario-{id}'` per `[B-OQ-02]` — see [W06.5](./06-simulator.md#w065-lever-12-btc-rebalance--sandbox--impact-preview--promote).

### Post-conditions

- `Distribution` row's `percentage` (or `ChargeableEntity.to_business_pct`) updated.
- `RollupCache` entries for `(stage1_effective, stage2_location)` invalidated for year+version per `services/rollup_cache.py`.
- `audit_log` row in `master_data` category for `distribution` or `chargeable_entity` field change.

### Cross-references

- **Decision tags**: `[F-S1-02]`, `[F-S1-03]`, `[F-DM-02]`, `[F-AC-01]`, `[B-OQ-02]`
- **Backend endpoints**:
  - `routers/charging.py::update_distribution` (PUT `/api/charging/distributions/{edge_id}`)
  - `routers/charging.py::create_distribution` (POST `/api/charging/distributions`)
  - `routers/charging.py::update_entity_to_business_pct` (PUT `/api/charging/entities/{entity_id}/to-business-pct`)
- **In-app manual**: `charging.json § Inter-service Distribution`
- **FAQ overlap**: faq-v5-04

### Known issues / caveats

- The sum-rule banner ("Distribution exceeds 100%") only appears once the persisted state is over 100. Client-side `wouldExceed100` warning is informational; the actual block is server-side.
- Self-retained % is **derived**, never stored — see `[F-DM-02]` and `services/dag_resolver.py`.

---

## W07.3: Cycle detection on edge save (Stage 1)

**Purpose**: Verify that Stage 1's DAG enforcement rejects an edge that would close a cycle, returning the cycle chain so the UI can render the loop.
**When to use**: Defensive demo — proves the topology can't be corrupted into an infinite cost flow. Trigger by attempting a known closing edge.
**Personas involved**: Controller.
**Pre-conditions**: A 2-or-more-hop path A→B→C exists. In the seed, `proj-cloud3-run → svc-data-platform → off-mdh` is a chain (or use any 3-hop path; `off-mdh → svc-data-stewardship` already flows out, so adding `svc-data-stewardship → off-mdh` would close a cycle).
**Estimated walk-time**: 3 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Controller | From `/charging?section=distribution`, search "Data Stewardship", click the pencil on `svc-data-stewardship` | EntityDistributionEditor opens for the stewardship service | Header shows entity name |
| 2 | Controller | Click **Add destination** | Modal opens, headroom shown | Modal heading "Add distribution edge" |
| 3 | Controller | Pick destination "Master Data Hub" (`off-mdh`), enter 5.00 percentage, click **Add edge** | Modal does not close; red error card appears with the cycle chain | Error card text mentions "cycle"; `Cycle chain:` line shows `IT00S042 → ... → IT00S042` (the full closing path) |
| 4 | Controller | Click **Cancel** | Modal closes; no edge created | Edges list unchanged |

### Alternative paths

- **Self-loop**: Trying to add an edge from an entity to itself is rejected with a CheckConstraint at the DB layer; the API returns 422 before the cycle check runs.
- **Union-aware sandbox**: in scenario sandbox mode, cycle detection considers both anchor `version='forecast'` rows AND `version='scenario-{id}'` rows, so a sandbox edit cannot create a cycle through canonical edges either.

### Post-conditions

No DB change — the offending insert is rejected by `services/distribution_service.py` cycle guard.

### Cross-references

- **Decision tags**: `[F-S1-05]`
- **Backend endpoint**: `routers/charging.py::create_distribution` returns HTTP 409 with `{detail: "...", cycle_chain: [...]}`. Implemented in `services/dag_resolver.py`.
- **In-app manual**: `charging.json § Inter-service Distribution`

### Known issues / caveats

- The chain rendering looks up entity identifiers from the in-memory entity map; an entity present in the chain but inactive will fall back to its raw ID rather than the friendly identifier.

---

## W07.4: Create a manual BTC profile

**Purpose**: Author a BTC profile from scratch by picking charging locations one-by-one and assigning percentages that sum to 100.
**When to use**: An offering/internal-service has a stable BTC mix that doesn't follow the UM matrix (e.g., a deal-specific carve-out), or no UM data exists yet.
**Personas involved**: Controller.
**Pre-conditions**: Target chargeable entity has no profile for the chosen year (UniqueConstraint on `(entity_id, year)`).
**Estimated walk-time**: 5 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Controller | Navigate to `/charging?section=btc` | Section "BTC Profiles" loads. KPI strip "Profiles / Active / Drafts" + filter bar (Year / Mode / Status / Entity type / Search) + table | Default year 2026 |
| 2 | Controller | Click **+ New profile** (top-right of filter bar) | Dialog "New BTC profile" opens with 3 tabs: **Manual** / **Automatic (UM)** / **Copy from…** | Default tab is Manual |
| 3 | Controller | In Year picker, leave 2026. In **Search entity** type a name; in Target entity dropdown pick an entity that doesn't yet have a 2026 profile | The "(N eligible)" counter updates as you type | Counter excludes entities with an existing 2026 profile |
| 4 | Controller | With Manual tab active, click **Create profile** | Dialog closes; the EntityBTCProfileEditor opens with status `draft`, mode `manual`, 0 lines | Header shows entity name; "Manual mode — add lines, sum must equal 100% before save." |
| 5 | Controller | Click **+ Add line** | Modal "Add Charging line" with Region / Division filters + Search + Charging location picker + Percentage | Headroom shown: 100.00% before any lines |
| 6 | Controller | Pick e.g. region "EMEA", division "Corporate IT", choose "Munich HQ" (`DE-MUC-001`), enter 60.00, click **Add line** | Modal closes; row appears in lines table with code/region/country/division | Lines counter = 1, Σ percentages = 60.00% (amber) |
| 7 | Controller | Repeat: add 2 more lines until Σ = 100. Sum indicator should turn emerald ("100.00%") | Column totals card updates as you type into the percentage input cells | Σ percentages turns emerald exactly at 100 (tolerance ±0.01 per `BTC_SUM_TOLERANCE`) |
| 8 | Controller | Click **Save profile** | Save succeeds; status badge stays `draft` until activation | Toast / state: profile persisted; navigate back to BTC list and confirm row appears |

### Alternative paths

- **Save under-100**: Save is disabled until `Math.abs(sum − 100) < 0.01`. Attempting a non-conforming save raises "Manual profiles must sum to 100% per [F-S2-02]."
- **Duplicate entity**: If a profile already exists for `(entity_id, year)`, the entity is filtered out of the eligible list. Creating against an existing tuple returns 409 from the API.

### Post-conditions

- New `BTCProfile` row with `mode='manual'`, `status='draft'`, `entity_id`, `year` filled.
- N `BTCProfileLine` rows linked back, each with `percentage > 0` and `≤ 100`.
- `audit_log` row in `master_data` category.

### Cross-references

- **Decision tags**: `[F-S2-01]`, `[F-S2-02]`
- **Backend endpoints**:
  - `routers/charging.py::create_btc_profile` (POST `/api/charging/btc-profiles`)
  - `routers/charging.py::update_btc_profile` (PUT `/api/charging/btc-profiles/{profile_id}`)
- **In-app manual**: `charging.json § BTC Profiles`
- **FAQ overlap**: faq-v5-05 (manual vs automatic)

---

## W07.5: Create an automatic BTC profile from UM matrix

**Purpose**: Snapshot the User Measurement matrix for a given S-code into a profile's lines so the BTC mix tracks the measured usage data.
**When to use**: For offerings whose Stage 2 distribution should follow the UM measurement (the standard production case).
**Personas involved**: Controller.
**Pre-conditions**: UM matrix has rows for the chosen S-code (12 demo S-codes seeded). Target entity has no profile for the year.
**Estimated walk-time**: 5 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Controller | From `/charging?section=btc`, click **+ New profile** | New BTC profile dialog opens | 3 tabs visible |
| 2 | Controller | Switch to **Automatic (UM)** tab | Tab content shows "S-code (UM lookup key)" input + descriptive note "Per [F-S2-03]: the current UM matrix is snapshotted into the profile's lines." | S-code field empty |
| 3 | Controller | Pick Year (2026), pick a Target entity (e.g. an offering missing a 2026 profile), enter S-code "S042" in the input | Form validates inline | All fields present |
| 4 | Controller | Click **Create profile** | Dialog closes; editor opens; mode badge "automatic" (blue), `s_code S042` in subheader, lines populated from the UM snapshot | Σ percentages emerald at 100.00% (UM service normalises to 100 on load); lines table shows charging-location rows in descending percentage order |
| 5 | Controller | Notice the editor is **read-only** in automatic mode — no per-line input cells, no Add line button. Two header buttons: **Refresh from UM** + **Switch to manual** | Refresh button visible on the right | Description "Automatic mode — values snapshotted from UM. To override, switch to manual." |

### Alternative paths

- **Unknown S-code**: If no UM rows exist for the S-code, the API returns 422 with a friendly message; the dialog stays open.
- **Switch to manual after creation**: see [W07.7 Mode Change](#known-issues--caveats) — automatic → manual inherits the snapshot verbatim, allowing override.

### Post-conditions

- `BTCProfile` row with `mode='automatic'`, `s_code='S042'`, `um_snapshot_at=now()`.
- N `BTCProfileLine` rows mirroring the UM matrix for that S-code (normalised to 100).

### Cross-references

- **Decision tags**: `[F-S2-01]`, `[F-S2-03]`, `[F-UM-01]`
- **Backend endpoint**: `routers/charging.py::create_btc_profile` (POST `/api/charging/btc-profiles` with `mode='automatic'` triggers `services/btc_service.create_automatic_profile` UM snapshot)
- **In-app manual**: `charging.json § BTC Profiles`
- **FAQ overlap**: faq-v5-05

---

## W07.6: Year-rollover BTC profile copy

**Purpose**: Carry an existing year's profile forward to the next year as a starting point — preserves mode and lines, lineage tracked via `copied_from_profile_id`.
**When to use**: Annual planning kickoff: "make 2027 mirror 2026 then we'll diff."
**Personas involved**: Controller.
**Pre-conditions**: Source profile exists for the entity in the source year. Target year has no profile yet for that entity.
**Estimated walk-time**: 4 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Controller | From `/charging?section=btc`, click **+ New profile** | Dialog opens | 3 tabs visible |
| 2 | Controller | Switch to **Copy from…** tab | Tab shows "Search source profiles" input + dropdown of existing profiles | Each row labelled "Entity name · Year" with subtitle "mode · N lines" |
| 3 | Controller | Pick Year = 2027 (target), pick the **Target entity** (must not yet have a 2027 profile) | Eligible entity list reflects the year choice | Counter excludes entities with 2027 profiles |
| 4 | Controller | In source profile dropdown, search the same entity, pick its 2026 profile | Source profile selected; description "Per [F-S2-07]: source rows are copied verbatim. Mode is preserved." | Selected row shows mode + line count |
| 5 | Controller | Click **Create profile** | Dialog closes; editor opens for the new 2027 profile in `draft` status with all source lines populated | `copied_from_profile_id` lineage stored; editor shows same line count and percentages as source |

### Alternative paths

- **Bulk year rollover**: For a portfolio-wide year-end roll, the controller can click **Year rollover** in the BTC Profile list view header. The dialog offers three scope tabs: All profiles, By entity type (Project / Offering / Internal Service multi-select), or Specific entities (searchable multi-select). Live count strip shows how many profiles will be rolled before confirm. Backed by `POST /api/charging/btc-profiles/year-rollover` with optional mutually-exclusive `entity_types` / `entity_ids` filters.
- **Mode preservation**: Manual sources copy as manual; automatic sources copy as automatic with the same `s_code` and a fresh UM snapshot timestamp.

### Post-conditions

- New `BTCProfile` row with `mode` matching source, `status='draft'`, `copied_from_profile_id=<source.id>`.
- N `BTCProfileLine` rows mirroring the source profile.

### Cross-references

- **Decision tags**: `[F-S2-07]`
- **Backend endpoints**:
  - Single copy: `routers/charging.py::create_btc_profile` with `copy_from_profile_id` parameter (`services/btc_service.copy_from_profile`)
  - Bulk: `routers/charging.py::year_rollover_btc_profiles` (POST `/api/admin/btc-profiles/year-rollover`)
- **In-app manual**: `charging.json § BTC Profiles`
- **FAQ overlap**: faq-v5-07 ("How do I do a year-rollover on BTC profiles?")

### Known issues / caveats

- The 2027 row created by the rollover has `status='draft'` until a controller activates it. In v5 the activation step is just a save with `status='active'` set in the editor; there is no explicit "publish" UI yet.

---

## W07.7: Refresh BTC from UM (dry-run + commit)

**Purpose**: An automatic profile's UM snapshot ages over time. This workflow re-snapshots from the current UM matrix, shows a diff, then commits it.
**When to use**: After a UM matrix CSV import (W10.6 admin variant), or quarterly to keep automatic profiles fresh.
**Personas involved**: Controller.
**Pre-conditions**: An automatic BTC profile exists. The UM matrix may or may not have changed for the S-code since the last snapshot.
**Estimated walk-time**: 4 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Controller | From `/charging?section=btc`, filter Mode=Automatic | List narrows to ~12 automatic profiles | KPI strip updates |
| 2 | Controller | Click pencil on any row whose subheader names a known S-code (e.g. "Master Data Hub" with S042) | EntityBTCProfileEditor opens, mode `automatic` | "UM snapshot" KPI shows the snapshot date |
| 3 | Controller | Click **Refresh from UM** (top-right of editor header) | Diff dialog appears: title "Refresh from UM — diff preview", subtitle "S-code S042 · year 2026 Q1" + "sums to 100%" | Three sections: Added (emerald) / Removed (red) / Changed (amber) — each with a count |
| 4 | Controller | Inspect the diff. If the matrix is unchanged, the dialog states "No differences — current snapshot already matches the UM matrix" | Diff list rendered, max-height scrolled | Each entry shows: `+ <code>`, `− <code>`, or `Δ <code>: <old>% → <new>%` |
| 5 | Controller | Click **Apply changes** | Dialog closes; editor refetches; the lines table reflects the diff (added rows appear, removed gone, changed values updated) | UM snapshot date updates to "today" |

### Alternative paths

- **Cancel**: If the diff has unwanted changes, click Cancel — no state change. Diff is purely a preview.
- **No changes**: If diff is empty, the Apply button still works (no-op); the snapshot timestamp updates regardless.

### Post-conditions

- `BTCProfile.um_snapshot_at` updated to current timestamp.
- `BTCProfileLine` rows rewritten to mirror the current UM matrix snapshot (per `[F-UM-02]`).
- `RollupCache` entries for `(stage2_location, year, version, this entity)` invalidated.

### Cross-references

- **Decision tags**: `[F-S2-03]`, `[F-S2-04]`, `[F-UM-02]`
- **Backend endpoint**: `routers/charging.py::refresh_btc_from_um` with `dry_run=true|false` (POST `/api/charging/btc-profiles/{profile_id}/refresh`)
- **In-app manual**: `charging.json § BTC Profiles`
- **FAQ overlap**: faq-v5-06 ("What happens when I 'Refresh from UM' on a BTC profile?")

### Known issues / caveats

- Mode-switch dialog (`Switch to automatic` / `Switch to manual`) is the second mechanism for rebasing a profile per `[F-S2-05]`: manual → automatic asks for an S-code and warns "Switching to automatic discards the manual values below and snapshots from the UM matrix"; automatic → manual inherits the snapshot verbatim and unlocks per-line editing.
- Sandbox-mode editors (lever 12) hide the **Refresh from UM** and **Switch to manual** buttons by design — these are canonical-only operations per `[B-ES-01]`.

---

## W07.8: Location Cost Rollup map drill-down

**Purpose**: Walk the cost from a region down to a country and on to a charging location, using the bubble map as the visual anchor.
**When to use**: Demo opener for the Charging module — communicates the magnitude of the Stage 2 charge by region in one screen.
**Personas involved**: All roles (read-only).
**Pre-conditions**: Stage 1 distributions resolved + BTC profiles populated + RollupCache primed (computed lazily on first query).
**Estimated walk-time**: 4 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Any | Navigate to `/charging?section=rollup` | Top control bar (Year / Version / Tab switcher "Map view" ↔ "Tree table") + map view by default | Heading not strictly named — top bar shows year selector and "Per [F-RV-06]: annual default, quarterly drill-down where supported." |
| 2 | Any | Confirm year is 2026 / version is forecast | Map renders as static SVG world with country-level bubbles | Bubble size scales to total Stage 2 € for that country (square-root); colour = dominant division (Corporate IT blue / Truck & Bus amber / Rail Vehicle emerald) |
| 3 | Any | Hover over a major bubble (Germany if visible) | Popup shows total € + breakdown of charging locations within the country | Format: `<country> · <total>€` with rows per charging location |
| 4 | Any | Click the country bubble | Map redraws bubbles at charging-location centroid offsets within the country | Header reads as a "drilled-into" state with a Back button (ArrowLeft) |
| 5 | Any | Click the **Back** button to return to country view | Map returns to country bubbles | Drill state clears |
| 6 | Any | Switch tab to **Tree table** | Tree-table view renders: Region → Country → Charging location → Entity | Each level expandable; leaf rows show entity-level Stage 2 amount |
| 7 | Any | Click a charging-location row to drill into the entity rollup chain | Drill state changes; tree-table view shows the upstream chain ("which entities contribute to this location's amount") | Reads from `routers/charging.py::get_rollup_drill_down` (`/api/charging/rollup/drill-down/charging-location/{cl_id}`) |
| 8 | Any | Back on **Map view**, click a charging-location bubble after drilling into a country | Side panel opens titled `<Country> → <Location>` showing total cost flowing through this location, the legal entities operating there (chip list), and the chargeable entities flowing in (Amount + Share % per row) | Reads from `routers/charging.py::get_location_breakdown_endpoint` (`/api/charging/locations/{cl_id}/breakdown`). Map state preserved underneath — close the panel to drill another location without losing context. |

### Alternative paths

- **Empty version**: If `version='actuals'` is selected for a future-only dataset, the map renders empty bubbles ("0 €"). Switch back to forecast to see populated state.
- **Sandbox preview**: When mounted from a scenario impact-tile preview (see [W06.5](./06-simulator.md#w065-lever-12-btc-rebalance--sandbox--impact-preview--promote)), the version locks to `scenario-{id}` and a blue chip appears in the version slot.

### Post-conditions

No state change — read-only. First query primes `RollupCache` per `services/rollup_cache.py`; subsequent loads are sub-200ms.

### Cross-references

- **Decision tags**: `[F-RV-03]`, `[F-RV-04]`, `[F-RV-06]`
- **Backend endpoints**:
  - `routers/charging.py::get_rollup` (GET `/api/charging/rollup`)
  - `routers/charging.py::get_rollup_drill_down` (GET `/api/charging/rollup/drill-down/charging-location/{cl_id}`)
  - `routers/charging.py::get_location_breakdown_endpoint` (GET `/api/charging/locations/{cl_id}/breakdown`)
  - Service: `services/rollup_query.query_rollup`, `drill_down_charging_location`, `get_location_breakdown`
- **In-app manual**: `charging.json § Location Cost Rollup`

### Known issues / caveats

- Country bubbles are positioned via a fixed centroid lookup (`countryCoords.ts`); a country present in the data but missing from the lookup falls through to the "(Other)" cluster — not a bug but worth flagging during a hand-off.
- Legal entities are returned alongside the level-4 breakdown for context, but BTC Stage 2 splits costs to a charging location (not to a legal entity), so per-LE attribution is intentionally not shown.

---

## Cross-workflow notes

- **DAG resolution caching**: Stage 1 effective cost is cached in `RollupCache` keyed by `(year, version, entity_id)`. Distribution writes invalidate per `services/rollup_cache.invalidate_for_distribution_write`; BTC writes invalidate the matching Stage 2 entries; `annual_cost` writes on the entity invalidate both layers. Manual flush via `POST /api/admin/rollup-cache/invalidate` (controller-only).
- **Scenario forks**: any Stage 1 edge mutation done in a scenario is stored as `Distribution.version='scenario-<id>'`; canonical `version='forecast'` rows are never touched until Promote. See [W06.5](./06-simulator.md#w065-lever-12-btc-rebalance--sandbox--impact-preview--promote).
- **Reporting bridge**: the fourth sidebar section `?section=reports` is a discoverability bridge to the AI Report Builder with pre-filled Cluster F prompts (e.g. "Show me total annual effective cost by charging location for 2026, broken down by division"). See [W09.6](./09-reporting.md#w096-ai-report-builder-natural-language-query).

## Related FAQ entries

After Phase 2 fixture refresh, expect these FAQ entries to cross-link back here:
- faq-v5-04 "How do I edit a Stage 1 distribution edge?"
- faq-v5-05 "How is a BTC profile's automatic mode different from manual?"
- faq-v5-06 "What happens when I 'Refresh from UM' on a BTC profile?"
- faq-v5-07 "How do I do a year-rollover on BTC profiles?"
