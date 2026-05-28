# CRETA — Charging & Allocations / User Measurement Implementation Guide

*Created: May 19, 2026*
*Companion to: `CRETA_Charging_Allocations_UM_Change_Spec.md` (frozen)*
*Status: Development clustering and sequencing for handoff to Claude Code*

---

## 1. Purpose & how to use

This guide accompanies the change specification. The spec describes *what the module must become*; this guide defines *the development clusters, their ordering, and the interfaces between them* so the work can be parallelised.

This guide deliberately stops at cluster boundaries and exposed interfaces. It does **not** prescribe implementation steps, schemas, or code. Within a cluster, Claude Code determines the implementation, plans before building, and uses its own judgement on structure.

The binding constraints are the decision tags in the spec (`[F-DIR-*]`, `[F-UM-*]`, `[F-AK-*]`, `[F-S1-*]`, `[F-S2-*]`, `[F-EXP-*]`, `[F-DSH-*]`, `[F-ADM-*]`). This guide groups and sequences those tags; it does not restate or reinterpret them. Where this guide and the spec appear to differ, the spec governs.

No file paths or component names appear in this guide. Claude Code locates the affected code itself.

---

## 2. Teardown / preserve register

The implemented module was built around an assumption the spec corrects: UM as reference data imported from SAP, and InternalService Stage-2 as stored authored profiles. New work must replace the superseded shape, not sit beside it. Building new alongside vestigial old reproduces the dual-source defect the spec exists to remove.

This register is stated at behaviour-and-model level. It identifies *what* is superseded by behaviour; Claude Code finds the code and confirms before removing.

### Remove (superseded by the spec)

- **The SAP-as-source framing for UM.** Any import path, provenance value, or model semantics that treats UM as ingested from SAP. The `sap_api` provenance value is retired (`[F-UM-04]`). UM is authored in CRETA; SAP is export-only (`[F-DIR-01]`).
- **UM under Administration.** The Administration-side UM panel and its admin-namespaced API. UM moves into the Charging & Allocations module with its API in the charging namespace (`[F-DIR-02]`). The CSV-import capability is **not** removed — it is relocated and reframed as a bulk-entry path into the authoring model (`[F-UM-03]`).
- **Decimal UM values.** The decimal value representation. UM values become integer-typed with entry/import validation (`[F-UM-01]`).
- **InternalService stored authored BTC profiles.** For InternalService entities specifically: stored authored profile lines, the manual mode, and the refresh-reconciles-drift behaviour between stored lines and current UM. InternalService Stage-2 becomes a derived view of column-normalised active-version UM (`[F-S2-01]`). The refresh action is re-purposed to *advance the frozen snapshot deliberately*, not to reconcile two stores (`[F-S2-02]`).
- **Year-bound Stage 1 versioning.** The yearly version scoping for Stage 1 distribution. Replaced by effective-dated versioning (`[F-S1-02]`).

### Preserve untouched (sound; do not rebuild)

- **The Stage 1 cost mechanic.** Edges-as-list, the sum-rule (`to_business_pct + Σ outgoing ≤ 100`), acyclicity/cycle detection, the distribution-shape editor. Only the *versioning model*, the *rationale status*, and the *surfaces* change — not the mechanic (`[F-S1-01]`, and the "mechanic preserved" subsection of spec §4).
- **Projects/Offerings BTC.** Manual, automatic, and copy-from modes for Project and Offering entities are unchanged. The InternalService collapse applies to InternalService only (`[F-S2-01]`).
- **The rollup engine.** The two-stage rollup, cache layers, map/tree/drill/upstream surfaces. Out of scope this round; not reworked.
- **Master data.** Country, Region, Charging Location, Legal Entity CRUD remains in Administration (`[F-DIR-02]` boundary). Only UM leaves Administration.
- **The polymorphic `ChargeableEntity` root and entity-type-agnostic machinery.** No entity-type branches are introduced into distribution, cycle detection, the sum-rule, or the rollup query. This property is load-bearing for `[F-OQ-11]`.

---

## 3. Development clusters

Six clusters. The spec's nine sections are a reading order; these clusters are a build order. The spec section a cluster realises is noted, but the cluster boundary is the dependency seam, not the section number.

### FD-1 — Data foundation

**Scope.** The integer-valued UM data model, the draft/active state machine, provenance, per-cell audit, and the `ChargeableEntity` allocation-key field. Model and service layer only — no authoring UI.

**Realises.** Spec §2 (model, state machine, provenance, audit), §3 (allocation-key field on the InternalService subtype).

**Tags.** `[F-UM-01]`, `[F-UM-02]`, `[F-UM-04]`, `[F-UM-05]`, `[F-AK-01]`. Partial `[F-DIR-01]` (the model-level assertion that UM is authored, not imported).

**Dependencies.** None. This is the single serialising prerequisite.

**Exposes downstream.** The UM model shape (sparse integer cells keyed by year/quarter/s_code/charging_location; version = year/quarter/activation timestamp; active versions immutable); the allocation-key field on the InternalService subtype; the per-cell audit contract. Downstream clusters code against this without reading FD-1's internals.

### FD-2 — UM authoring & module relocation

**Scope.** In-grid cell/row/column editor, CSV bulk-entry into a draft, the matrix viewer (sticky pivot), the move of UM out of Administration into the Charging & Allocations module, the API namespace move, the read-all / author-activate-export-controller-only permission split.

**Realises.** Spec §1 (placement, boundary, permissions), §2 (authoring surfaces, display).

**Tags.** `[F-DIR-02]`, `[F-DIR-03]`, `[F-UM-03]`, remainder of `[F-DIR-01]`.

**Dependencies.** FD-1 (hard — consumes the UM model and state machine).

**Exposes downstream.** Nothing other clusters depend on. Terminal consumer of FD-1.

### FD-3 — Stage 1 effective-dated rework

**Scope.** The entire reworked spec §4: effective-dated versioning, prepare-ahead future-dated versions, version creation origins (blank / copy-active / copy-prior), first-class rationale (version and per-edge), the per-entity Stage 1 surface, the version diff report, per-version activation granularity. The Stage 1 cost mechanic is preserved (see register §2).

**Realises.** Spec §4 in full.

**Tags.** `[F-S1-01]` through `[F-S1-08]`.

**Dependencies.** FD-1 weak/soft — needs the `ChargeableEntity` model to exist, not UM specifically. Can start as soon as the entity model is stable, ahead of UM specifics landing. This is the long pole and the most independent cluster; starting it early is the largest schedule lever.

**Exposes downstream.** The effective-dated Stage 1 resolution contract (in-force version = latest `active_from ≤ evaluated date`; scenario-scoped versions excluded from production resolution). The existing simulator consumes this — see dependency map §4.

### FD-4 — Stage 2 InternalService collapse + SAP export

**Scope.** InternalService Stage-2 as a derived view of column-normalised active-version UM; removal of InternalService manual mode; the frozen-snapshot reproducibility model with provenance; the refresh action re-purposed to advance the snapshot deliberately; the SAP export path (column-normalised % per service per charging location, SAP-shaped WBS payload from active versions).

**Realises.** Spec §5 (InternalService half), §6.

**Tags.** `[F-S2-01]`, `[F-S2-02]`, `[F-EXP-01]`.

**Dependencies.** FD-1 (hard — needs the integer UM model and active-version semantics).

**Exposes downstream.** The InternalService derived % (the column-normalised value), consumed by FD-5. Must preserve the DoI 2→3 gate semantics — see dependency map §4.

### FD-5 — Dashboard triple-display

**Scope.** Wherever a dashboard renders a single per-location-per-service number, render three: raw UM integer, allocation key, derived %. % stays primary.

**Realises.** Spec §7.

**Tags.** `[F-DSH-01]`.

**Dependencies.** FD-1 (the allocation-key field) and FD-4 (the derived %). Layout can be developed against FD-1 early; the % integrates last.

**Exposes downstream.** Nothing. Terminal.

### FD-6 — ChargeableEntity admin panel

**Scope.** The full `ChargeableEntity` admin panel: lifecycle CRUD across all subtypes, plus service-level metadata (owner, allocation key). Entity types handled as a configurable set, not hard-wired branches. Placement: Administration.

**Realises.** Spec §8.

**Tags.** `[F-ADM-01]`.

**Dependencies.** FD-1 (hard — edits the allocation-key/owner fields FD-1 defines). Independent of FD-2/3/4/5.

**Exposes downstream.** Nothing other clusters depend on this round.

---

## 4. Cross-cluster dependency map

Internal edges (between FD clusters):

- **FD-1 → FD-2:** FD-2 consumes FD-1's UM model and state machine. Hard ordering — FD-2 cannot complete before FD-1's model is stable.
- **FD-1 → FD-3:** Soft. FD-3 needs the `ChargeableEntity` model present, not UM. FD-3 may begin once the entity model is stable, ahead of FD-1 completion.
- **FD-1 → FD-4:** Hard. FD-4 needs the integer UM model and active-version semantics.
- **FD-1 → FD-6:** Hard. FD-6 edits FD-1's allocation-key/owner fields.
- **FD-4 → FD-5:** Hard. FD-5's derived-% column needs FD-4's InternalService derived value. FD-5 layout may proceed earlier against FD-1's allocation-key field; % integrates last.

Outward edges (to existing implemented code — preservation constraints):

- **FD-3 → existing simulator (v5 Cluster B / lever 12):** Lever 12 forks Stage 1 distribution into scenario-scoped versions in the simulator sandbox. The effective-dated versioning rework must not break this. Scenario-scoped versions sit **outside** effective-dated production resolution (spec `[F-S1-02]`); they are not resolved by `active_from`. This is a hard preservation constraint: after the FD-3 rework, lever 12's scenario forking and sandbox behaviour must still function. Claude Code validates lever 12 against the new versioning model as part of FD-3, and does not alter the simulator's mutation-in-sandbox / live-data-untouched separation.
- **FD-4 → existing DoI 2→3 gate:** The gate asserts that an entity with a To-Business share has a valid current/next-year BTC profile. The InternalService Stage-2 collapse changes how an InternalService's profile is produced (derived, not authored) but must preserve the gate's semantics: an InternalService carrying a To-Business share must still satisfy the gate via its derived/active profile. Claude Code validates the gate still holds for InternalService entities after the collapse.

---

## 5. Sequencing summary

```
FD-1 (foundation) ──┬──> FD-2 (UM authoring + relocation)
                    ├──> FD-3 (Stage 1 rework)        [soft dep; start early]
                    ├──> FD-4 (Stage 2 collapse + SAP) ──> FD-5 (dashboards)
                    └──> FD-6 (entity admin panel)
```

- **Runs alone, first:** FD-1. The shared data contract. Keep it tight — it is the only serial prefix.
- **Parallel after FD-1:** FD-2, FD-3, FD-4, FD-6 — four independent streams.
- **Long pole:** FD-3 (largest surface, most independent). Its dependency on FD-1 is soft — begin it the moment the `ChargeableEntity` model is stable, before UM specifics land. This is the primary schedule lever.
- **Joins late:** FD-5, after FD-4 produces the derived %. FD-5 layout can progress against FD-1 earlier.
- **Critical path:** FD-1 → FD-3, with FD-1 → FD-4 → FD-5 as the competing long-pole chain. Whichever is longer in practice governs; five of six clusters overlap.

---

## 6. Working protocol

- **Plan before implementing.** Each cluster session begins with a plan. Jumping to code without a plan is a known failure mode and is not the expected working mode here.
- **PROGRESS.md.** Each cluster maintains PROGRESS.md for multi-session continuity. A cluster spanning multiple sessions records state, decisions taken within the cluster's latitude, and open items there.
- **Spec is frozen.** The change spec does not change during implementation. If implementation surfaces a genuine spec contradiction or gap, it is raised as an open question against the spec's open-questions log — not resolved silently in code.
- **Cluster latitude.** Within a cluster, implementation structure is Claude Code's to determine. The spec's decision tags are the constraints; everything not fixed by a tag is open. This guide does not narrow that latitude further.
