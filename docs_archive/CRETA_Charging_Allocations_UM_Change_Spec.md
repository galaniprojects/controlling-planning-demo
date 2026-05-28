# CRETA — Charging & Allocations / User Measurement Change Specification

*Created: May 18, 2026*
*Status: Specification for handoff to Claude Code against the implemented CRETA v5 codebase*
*Scope: Re-orientation of the Charging & Allocations module around User Measurement as CRETA's authored system of record*

---

## How to read this document

This is a standalone change specification, delivered by itself against the fully implemented CRETA v5 codebase. It describes the target state of the Charging & Allocations module and the User Measurement (UM) matrix.

The module is organised around one fact: the UM matrix is authored inside CRETA by a controller and exported *to* SAP — SAP is a downstream target, not a source. This direction governs the data model, the value type, the internal-service charging mechanic, the module's placement, and the dashboards.

This document specifies *what the module must become*. The sequencing of removal versus rebuild, and the list of components to preserve untouched, are deliberately **not** in this document — they belong to a separate implementation guide produced alongside this spec. Claude Code is expected to locate the affected code itself; this spec does not reference file paths or component names.

Decision tags follow `[F-<topic>-<nn>]`. Open questions use `[F-OQ-<nn>]`.

---

## Module overview

KB's IT cost charging cycle has two stages:

- **Stage 1 — inter-service distribution.** Each chargeable entity distributes up to 100% of its rolled-up cost to other entities or releases it "To Business". These percentages are decided by the entity's accountable owner through coordination and are entered by hand. Stage 1 does **not** consume User Measurement.
- **Stage 2 — Business-to-Charge (BTC).** The To-Business share is split across the ~90 KB charging locations and uploaded to SAP. For internal services this split is driven by User Measurement; for projects and offerings it is an authored BTC profile.

The Stage-2 input for internal services is the **User Measurement matrix**: a per-service, per-charging-location table of measurement figures (user counts, sales volumes, and similar) that one controller maintains by hand, consolidating values collected from every service owner. Today that matrix is a single formula-heavy Excel workbook that is slow even to open and export. CRETA's purpose is to become the system of record for that consolidated matrix, derive each internal service's SAP distribution from it, and produce the SAP-shaped export quickly.

---

## Design principles (locked)

- **CRETA is the system of record for the consolidated UM matrix.** The matrix is authored by a controller (the consolidator) who gathers user-measurement values from each service owner and enters them into CRETA. SAP is a downstream export target, never a source. There is no UM import from SAP.

- **UM is the origin of truth for Stage 2 internal-service distribution and SAP export — not for Stage 1.** Stage 1 (inter-service distribution) is human-authored coordination. It does not consume UM, has no computed UM linkage, and has no UM-derived mode.

- **UM values are integers.** The consolidator pre-multiplies certain metrics (e.g. ×100, ×1000) to remove decimals and protect precision before entry. CRETA stores raw measurement values as integers. The meaning and derivation of each integer is carried separately by the allocation key, not inferred from the number.

- **An internal service's SAP distribution is column-normalised UM, by definition.** For an internal service, the percentage uploaded to SAP for each charging location is that location's raw UM value divided by the service's column total. This is the same computation as automatic-mode BTC — for internal services the two are one mechanism, not parallel mechanisms that agree. An internal service's Stage-2 spread is therefore a derived view of UM, not independently authored data.

- **Cluster F is the charging engine; consumers own their UI surfaces.** Stage 1 distribution editing, Stage 2 BTC editing, UM authoring, SAP export, and the rollup data layer live in the Charging & Allocations module. The Run Portfolio view, the per-entity Workbench tile and tab, and the simulator's lever 12 consume the same data layer through their own UI.

- **Polymorphic entity model, entity-type-agnostic machinery.** Projects, offerings, and internal services are subtypes of one `ChargeableEntity` root. Stage-1 distribution, cycle detection, the sum-rule, and the rollup query carry no entity-type branches. Only the WBS prefix differs per type. This is deliberate: it keeps a future removal of one subtype (`[F-OQ-11]`) a clean lift rather than an extraction.

- **Storage shape matches mechanic.** Stage 1 is sparse — edges-as-list. Stage 2 is sparse internally but full-matrix at SAP export time, mirroring SAP's posting-account requirements.

- **WBS Elements are algorithmic, never stored.** Given an entity and a charging location, the WBS Element is `<prefix>-64-99-<location_code>`, synthesized at export time. `64-` is the working-assumption IT company-code marker (`[F-OQ-05]`).

- **Hierarchy is consumed, not parallel.** Cluster F entities attach to the existing configurable hierarchy nodes via the same mechanism existing projects use. No separate LoB or Division concept is introduced here.

- **Residual is self-retained, not implicitly To-Business.** When an entity distributes less than 100% of its rolled-up cost, the residual stays as self-retained cost on the entity's own books. Working assumption from the controller workshop (`[F-OQ-02]`).

---

## 1. Module placement and data direction

The Charging & Allocations module houses everything about the charging cycle: UM authoring, Stage 1 distribution, Stage 2 BTC, SAP export, and the location rollup. The User Measurement matrix lives here, alongside Distribution and BTC — not in the Administration module.

Boundary between Administration and the module:

- **Administration** owns structural reference masters (Country, Region, Charging Location, Legal Entity) and `ChargeableEntity` lifecycle (section 8).
- **The Charging & Allocations module** owns UM and all allocation behaviour.

The UM API surface moves out of the admin namespace and into the charging namespace. CSV import is **retained** as a bulk-entry path into the authoring model (section 2) — relocated and reframed, not removed. The Administration master-data panels for Country, Region, Charging Location, and Legal Entity remain in Administration; only UM moves.

Permission model: the UM matrix is **read-visible to all roles**; authoring, activation, and SAP export are **controller-only**. This matches every other write surface in the module. Per-user tailoring of write access is anticipated later but is explicitly out of scope now (`[F-OQ-12]`).

`[F-DIR-01]` CRETA is the UM system of record; SAP is export-only; no UM import path from SAP exists. Closes `[F-OQ-01]`.
`[F-DIR-02]` UM and all allocation behaviour live in the Charging & Allocations module; UM is removed from Administration; the UM API surface moves into the charging namespace.
`[F-DIR-03]` UM read = all roles; UM author/activate/export = controller-only.

---

## 2. User Measurement — the authored core

UM is defined first because everything downstream derives from it.

### Data model

Sparse cells keyed by `(year, quarter, s_code, charging_location)` → integer `value`. Only non-zero cells are stored; absent cells are implied zero. The value column is **integer-typed**.

Rationale for integer typing: the consolidator applies a pre-multiplication to certain metrics so the figure entered carries no decimals (precision protection). The number alone does not state its unit or its derivation — the allocation key does (section 3).

A UM **version** is the set of cells sharing `(year, quarter, activation timestamp)`. Versions are immutable once active.

### State machine

UM authoring mirrors the existing BTC-profile state machine for mental-model consistency across the module:

- **Draft** — editable. Created empty, by CSV bulk-entry, or by copy from a prior version.
- **Active** — frozen, immutable. Activation snapshots the draft into a permanent version.

Activation is the freeze point. SAP export and internal-service Stage-2 derivation read the active version. Re-entry never overwrites an active version — it creates a new draft that, on activation, becomes a new version. Historical versions remain intact for export reproducibility.

### Authoring surfaces

Both feed the same draft model:

1. **In-grid editing** — the matrix is editable cell-by-cell, row-by-row, and column-by-column while in draft. Integer-only; non-integer entry is rejected at the field with a clear message.
2. **CSV bulk-entry** — upload a consolidated sheet into a draft. Header: `year,quarter,s_code,charging_location_code,value[,source]`. Non-integer `value` rows are rejected with a row-level error. Zero-value rows are skipped. A single `(year, quarter)` per import. An import populating a draft does not activate it — the controller reviews, then activates.

### Provenance

`source` records origin: `manual` (in-grid), `csv_upload` (bulk-entry), `copy` (copied from a prior version), `seed` (greenfield seed data). The `sap_api` value is removed — it never described a real path.

### Audit

Every cell mutation writes an audit record: who, when, before, after. UM drives money downstream; per-cell traceability is mandatory.

### Display

The matrix renders as a sticky pivot: rows = S-code, columns = charging-location code, per-row and per-column totals, German number formatting. Year / quarter / version selectors at the top. Read-visible to all roles per `[F-DIR-03]`.

`[F-UM-01]` UM cells are integer-valued; non-integer entry rejected at field and at import.
`[F-UM-02]` UM draft/active state machine mirrors the BTC-profile state machine; activation freezes an immutable version; no overwrite of active versions.
`[F-UM-03]` Authoring surfaces: in-grid edit and CSV bulk-entry, both populating a draft; CSV import does not auto-activate.
`[F-UM-04]` `source` ∈ {manual, csv_upload, copy, seed}; `sap_api` removed.
`[F-UM-05]` Per-cell audit trail (who/when/before/after) on every UM mutation.

---

## 3. Allocation key

The allocation key is the human-readable legend explaining what a service's raw UM integer means and how it was derived — e.g. "Number of users", "Number of users ×100 (decimal protection)", "Sales volume, EUR thousands". It exists because the consolidator's derivations differ per service and are not formulaic in a way CRETA can model. It is interpretive metadata for controllers, not a structured driver.

- **Attachment:** per internal service. It is a field on the `ChargeableEntity` InternalService subtype — one service, one allocation key. It is not per-cell and not per-UM-version.
- **Type:** free text with presets. The editor offers an autocomplete of values already used across the catalogue; the controller may pick one or type a new one. Picked and typed values behave identically once saved. This deliberately forgoes reliable filter/group-by on the field — an accepted trade for a clarification field.
- **Editing surface:** the `ChargeableEntity` admin panel (section 8).
- **Display surface:** the dashboard triple-display (section 7) and anywhere a service's UM figures surface.

`[F-AK-01]` Allocation key is a free-text-with-presets field on the InternalService `ChargeableEntity` subtype; per service, not per cell or version.

---

## 4. Stage 1 — inter-service distribution

This stage is **extended** in this round. The cost mechanic (edges, sum-rule, acyclicity, the edges-as-list editor) is correct as implemented and is preserved; the versioning model is reworked from cadence-bound to effective-dated, the rationale is elevated to first-class, and a per-entity surface and a version-diff report are added.

### Mechanic (preserved)

Each chargeable entity has a rolled-up total cost (own internal/external cost plus inflows from upstream entities) and distributes up to 100% of it. Targets are either other chargeable entities (cross-charge edges) or "To Business" (a percentage releasing from IT entirely). Undistributed cost is self-retained.

- **Storage:** one row per edge, `source_entity → destination_entity`, scoped to a distribution version. Percentage 0–100. Sparse.
- **Constraints:** unique edge per `(version, src, dst)`; no self-loop; percentage range; `to_business_pct + Σ outgoing ≤ 100`; the cross-charge graph must remain acyclic.
- **Editor:** edges-as-list. A distribution-shape card (editable To-Business %, derived read-only Self-retained, outgoing-edges table with inline % edit/delete, add-destination dialog validating against headroom). No graphical DAG; the only path visualization is the textual upstream-chain panel in the rollup view.
- **Validation:** sum-rule in the service layer; cycle detection returning the offending chain, rendered as a blocked path in the dialog.

This machinery carries **no entity-type branches** and contains no Project-specific logic. That property is load-bearing for `[F-OQ-11]` and must be preserved in any extension.

### Stage 1 is human-authored coordination, not UM-driven

Stage 1 distribution percentages are decided by the entity's accountable owner (service / line-of-business / platform owner) through coordination over who internally funds or benefits from the cost. They are entered by hand with a rationale. UM is **not** an input to Stage 1, there is no computed UM linkage, and no UM-derived mode for Stage 1 may be introduced. (UM drives Stage 2 for internal services only — section 5.)

`[F-S1-01]` Stage 1 distribution is human-authored coordination decided by the accountable owner; UM is not an input; no UM-derived Stage 1 mode.

### Effective-dated versioning

A Stage 1 distribution version is resolved by effective date, with no cadence assumption.

- A Stage 1 distribution **version** carries an `active_from` date.
- The version in force for any evaluated date is the one with the **latest `active_from` ≤ that date**. Resolution is by effective date only — **never** by upload recency or creation order.
- Two versions for the same scope **must not** share an identical `active_from`. This is forbidden at write time, not tie-broken.
- The model is **cadence-agnostic**: nothing assumes yearly. A new version may take effect at any interval — more or less often than annually — and the effective-date rule resolves it correctly regardless.
- Scenario forking continues to operate as implemented (scenario-scoped versions for the simulator); scenario versions are not part of the effective-dated production resolution.

`[F-S1-02]` Stage 1 versions are effective-dated (`active_from`); the in-force version for an evaluated date is the latest `active_from ≤ date`; resolution never by upload recency; identical `active_from` for the same scope is forbidden; no cadence assumption.

### Prepare-ahead (first-class)

The accountable owner can create and fully populate a **future-dated** version that remains dormant until its `active_from`. Until that date the current version stays authoritative and is unaffected. This is the primary mechanism by which a re-agreed distribution ("the process agreed for next year") is staged in advance without disturbing live allocations.

This reuses the **Cluster D universal activation-date scheduling pattern**. The mandatory second-admin review that Cluster D applies to scheduled master-data changes is **noted as future for Stage 1** (`[F-OQ-13]`) — it is not built in this round. Prepare-ahead without the review gate is the in-scope behaviour now.

`[F-S1-03]` Prepare-ahead is first-class: a future-dated version is dormant until `active_from`; the current version stays authoritative until then; reuses Cluster D activation-date scheduling; second-reviewer gate deferred (`[F-OQ-13]`).

### Version creation origins

Creating a new Stage 1 version offers three origins, mirroring the BTC-profile and UM state-machine shape for cross-module consistency:

- **Blank** — empty draft.
- **Copy from active** — pre-filled with the currently-in-force version's edges. The expected common path: the owner adjusts the few edges that changed, sets `active_from`, submits.
- **Copy from a prior version** — pre-filled from any selected historical version.

A new version is a **draft** until scheduled; scheduling sets its `active_from`. Copy-from-active is what makes per-version granularity workable when only a few edges move.

`[F-S1-04]` Version creation origins: blank / copy-from-active / copy-from-prior; draft-then-schedule; mirrors the BTC and UM state-machine shape.

### Rationale is first-class

Each version carries a first-class rationale, and per-edge rationale is supported — not an optional trailing comment. This records *why* a distribution was agreed ("infrastructure split re-agreed for 2026 because…") and is the context a prepared-ahead version carries for audit and for the future reviewer.

`[F-S1-05]` Rationale is first-class on the version (and per edge); not an optional afterthought.

### Per-entity Stage 1 surface

In addition to the portfolio-level filterable edge list, Stage 1 distribution is surfaced as a **first-class per-entity view**: for a single service or offering — its outbound edges, To-Business %, derived self-retained residual, effective cost, per-edge rationale, and its effective-dated version history. This is the natural unit for the accountable owner's mental model ("what does *my* entity distribute"), and is a better controller view as well. No new data model — a surfacing and navigation addition over the existing per-entity editor shape.

`[F-S1-06]` Per-entity Stage 1 distribution view is first-class (outbound edges, To-Business, self-retained, effective cost, per-edge rationale, version history), not only the portfolio-level filterable list.

### Version diff report

A diff report compares **two versions selected by identity**. The default comparison is a version **versus the version it supersedes by effective date** — not versus the most recently uploaded, consistent with the effective-date resolution rule. The diff shows, per edge, additions / removals / percentage changes with old → new values and the associated rationale. Per-edge detail belongs in the diff; per-edge *activation* remains rejected (activation is per version — see granularity note).

`[F-S1-07]` Version diff report: compares two versions by identity; defaults to version vs. the one it supersedes by effective date; per-edge added/removed/changed with old→new and rationale.

### Granularity (locked)

`active_from` is **per version, not per edge**. A whole distribution set takes effect on its date. Per-edge independent activation was considered and rejected — harder to audit, and more flexibility than the coordination process needs. Per-edge *visibility* in the diff report is retained; only per-edge *activation* is rejected.

`[F-S1-08]` Activation granularity is per version, not per edge; per-edge visibility retained in the diff only.

---

## 5. Stage 2 — Business-to-Charge

For each entity's To-Business share, the share is split across the ~90 KB charging locations. The mechanic differs by subtype.

### Projects and Offerings — authored BTC profile

Correct as implemented; **not** being reworked. One BTC profile per `(entity, year)`. Modes: manual (hand-entered line percentages), automatic (computed from UM for a chosen S-code), copy-from (year-rollover or cross-entity lineage). Lines `(profile, charging_location) → percentage`, sparse, summing to exactly 100 (±0.01), service-enforced. Draft → active state machine; active immutable. Year-rollover bulk-copies active → draft for controller review. DoI 2→3 gate: if `to_business_pct > 0`, an active profile must exist for the current or next year.

### Internal services — derived from UM, not authored

An internal service's Stage-2 spread **is** column-normalised UM, by definition. For service column `s` with active-version UM values, each charging location's percentage is `UM[s, loc] / Σ_loc UM[s, *]`.

- **Draft/live is always a pure UM derivation.** It is never hand-edited. Manual mode does **not** exist for InternalService profiles. (Manual and automatic modes remain for Projects and Offerings.)
- **The active snapshot is the reproducibility record.** Activating an internal-service BTC profile freezes the derived percentages with `s_code` and `um_snapshot_at` provenance, so a past SAP export remains reproducible after UM is re-consolidated. The frozen snapshot — not a hand-edited override — is what makes "what did we send SAP in 2025 Q2?" answerable.
- **No dual source of truth.** Because the live value is always a UM derivation rather than a separately stored authored figure, the class of bug where UM changes and a stored profile silently disagrees cannot arise for internal services. The explicit refresh action exists only to *advance* the frozen snapshot to a newer UM version deliberately (dry-run diff → apply), not to reconcile two independent stores.

This is the same computation as the SAP export percentage (section 6) — one mechanism, surfaced in two places.

`[F-S2-01]` InternalService Stage-2 spread is a derived view of column-normalised active-version UM; manual mode removed for InternalService only; Projects/Offerings BTC unchanged.
`[F-S2-02]` InternalService BTC active snapshot is frozen with provenance for SAP-export reproducibility; refresh advances the snapshot deliberately, never reconciles dual stores.

---

## 6. SAP export

The export payload is the column-normalised percentage per service per charging location — the same computation as internal-service Stage-2 (`UM[s, loc] / Σ UM[s, *]`) — emitted as SAP-shaped WBS Elements (`<prefix>-64-99-<location_code>`, algorithmic, never stored). The module's core stated value is producing this quickly: the source workbook is formula-heavy and slow even to open and export; CRETA holds the consolidated matrix and emits the payload without that recalculation overhead.

Export reads the **active** UM version (and, for Projects/Offerings, active BTC profiles). The exported figures for a given period are reproducible because activation froze them.

`[F-EXP-01]` SAP export = column-normalised % per service per charging location, SAP-shaped WBS payload synthesized at export time, read from active versions.

---

## 7. Dashboard surfacing — triple display

Wherever a dashboard currently renders a single per-location-per-service number (the derived %), it renders **three** values:

1. **Raw UM value** — the integer.
2. **Allocation key** — the legend for what that integer means (section 3).
3. **Derived %** — the column-normalised percentage. Remains the primary/headline figure.

Raw value and allocation key are interpretive context that make the % legible.

`[F-DSH-01]` Per-location-per-service dashboard cells show raw UM value + allocation key + derived %, with % primary.

---

## 8. ChargeableEntity administration

A full `ChargeableEntity` admin panel is provided.

- **Scope:** full lifecycle CRUD for `ChargeableEntity` across all subtypes, plus service-level metadata (owner, allocation key).
- **Placement:** Administration module. Entity *lifecycle* is administration; entity *charging shape* stays edited in the Charging module per the section 1 boundary.
- **Configurable entity-type set.** The panel treats entity types as a configurable set, not three hard-wired branches with per-type field groups and tabs. This is a deliberate design choice with zero cost now that keeps a future removal of a subtype (`[F-OQ-11]`) a one-session change rather than an unpicking exercise.

`[F-ADM-01]` Full `ChargeableEntity` admin panel in Administration; edits lifecycle + owner + allocation key; entity types handled as a configurable set, not hard-wired branches.

---

## Out of scope (this round)

- Per-user / non-controller write tailoring for UM (`[F-OQ-12]`).
- Removal of the Project subtype (`[F-OQ-11]`) — not done now; soft-exclusion is the reversible first move if KB confirms projects never distribute.
- Native Reporting integration for Cluster F data (the reporting bridge remains a navigational deep-link).
- Server-side relocation of the rollup cross-product and the rollup-query dimension fallbacks — tracked finishing work on sound foundations, not part of this round's correctness rework.
- Service-owner scoped write access to Stage 1, and the second-reviewer gate on scheduled Stage 1 versions (`[F-OQ-13]`).

---

## Open questions

- `[F-OQ-02]` — Confirm residual-as-self-retained: when an entity distributes <100%, the residual stays self-retained rather than implicitly going To-Business. Working assumption from the controller workshop; spec built on it. **Standing, unaffected by this round.**
- `[F-OQ-05]` — Is `-64-` a constant company-code marker, or does it vary by region/division/year? If it varies, the WBS generator needs an extra input. Working assumption: constant.
- `[F-OQ-11]` — *(new)* Do projects ever perform inter-service distribution? If KB confirms they never do, the resolution path is soft-exclusion first (a service-layer rule barring Project edges and `to_business_pct > 0`, no model change, reversible), with clean subtype removal available later because the Stage-1/Stage-2/rollup machinery carries no Project branches. Non-blocking; tracked.
- `[F-OQ-12]` — *(new)* What per-user / per-role write tailoring is needed for UM once controller-only is relaxed? Out of scope this round; informs a later access-control pass.
- `[F-OQ-13]` — *(new)* Service-owner scoped write access to their own entity's Stage 1 distribution, including a submit-for-evaluation workflow, and the mandatory second-reviewer gate on scheduled (prepare-ahead) Stage 1 versions. Out of scope this round. Prerequisites: (a) a maintained owner→user identity mapping on `ChargeableEntity` — the owner field is display-only free text today and role-based access must not key off a free-text name; (b) co-delivery with the second-reviewer gate, since owner-submit plus controller-evaluate is one review workflow in two halves; (c) a scoped-write role design extending the current four-role model (what the owner may edit/submit vs. what stays controller-exclusive: activation, effective-dating, and edges where the owner's entity is the destination). The effective-dated, prepare-ahead version model locked this round is the substrate this will sit on.

---

## Resolved this round

- `[F-OQ-01]` — *Where does UM originate; who maintains it; what is the production refresh cadence?* **Resolved.** UM is authored in CRETA by a controller (the consolidator) who gathers values from each service owner. SAP is a downstream export target, not a source. There is no production import cadence because there is no import. See `[F-DIR-01]`.
- `[F-OQ-09]` — *For decimal-value UM entries, are values raw or already weighted?* **Resolved.** Values are pre-multiplied integers; the allocation key states the derivation per service. See `[F-UM-01]`, `[F-AK-01]`.
