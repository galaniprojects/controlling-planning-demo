# Define-page redesign — shell-builder coordination notes

shell-builder owns the Define-page shell, Identity tab, DoI overlay,
routing, and the shared `useDirtyBuffer` hook. This file captures the
contracts other teammates depend on. Task #2 done.

## `useDirtyBuffer` — READY

Import:
```ts
import { useDirtyBuffer } from '@/modules/define/useDirtyBuffer';
```

Signature:
```ts
useDirtyBuffer<T>({
  initial,                                  // canonical baseline
  onSave,                                   // (value) => Promise<T | void>
  equals?,                                  // optional comparator
}) => {
  value, setValue, patch,                   // working value + writers
  isDirty,                                  // structural baseline-vs-buffer compare
  save,                                     // flush + promote baseline
  reset,                                    // discard buffered edits
  reload(next),                             // replace baseline (post-fetch)
  saving, error,
}
```

Per-tab scope only — do NOT share a single buffer across Define tabs
(Risk #4 in the plan: cross-tab dirty bleed).

**IMPORTANT** — if you build the buffer's `initial` from a mapper that
returns a fresh object on every render (`projectToBuffer(p)`), wrap
the mapper in `useMemo`. The hook's internal sync uses the supplied
equality function (default shallow) but a defensive memoise is the
cheapest insurance against accidental render loops.

Object payload usage (Identity tab style):
```tsx
const baseline = useMemo(() => projectToBuffer(initial), [initial]);
const identity = useDirtyBuffer<IdentityBuffer>({
  initial: baseline,
  onSave: (v) => defineApi.updateIdentity(projectId, toUpdate(v)),
});
<Input value={identity.value.name}
       onChange={(e) => identity.patch({ name: e.target.value })} />
<Button disabled={!identity.isDirty || identity.saving}
        onClick={identity.save}>Save</Button>
```

Primitive usage (single-field sweep target):
```tsx
const note = useDirtyBuffer<string>({
  initial: serverNote,
  onSave: (v) => notesApi.save(v),
});
```

`onSave` may return the server-side canonical value, which becomes the
new baseline. If it returns `void`, the dirty value itself is promoted.
On failure the hook surfaces the error via `error` and throws so the
caller can also surface a toast.

After a sibling-tab Save that may have touched shared fields, call
`reload(latest)` with the re-fetched canonical value — this resets
baseline + buffer and clears the dirty pip.

## `DoIRequirementsRegistry` — EXTENDED

Each `DoIFieldRequirement` now carries:
- `target_tab: 'identity' | 'tech_navigator' | 'financials' | 'approval_milestones'`
- `field_anchor: string` — DOM id the Define overlay scrolls + focuses.

Tabs MUST render `id={field_anchor}` (or `data-define-anchor={field_anchor}`)
on the focusable input or its labelled container so the overlay
deep-link works.

Anchors in use (see registry for full list):
- Identity: `define-anchor-name`, `define-anchor-pipeline-stage`
- TN tab: `define-anchor-project-type`, `define-anchor-transformation-level`,
  `define-anchor-tn-standardization`, `define-anchor-tn-usage`,
  `define-anchor-tn-maintenance`, `define-anchor-tn-financial-benefit`,
  `define-anchor-tn-payback`, `define-anchor-tn-competitive-advantage`,
  `define-anchor-composite-score`
- Financials: `define-anchor-total-budget`
- Approval & Milestones: `define-anchor-ai-council-approved`

A helper `findRequirementByKeyOrLabel(needle)` resolves the backend's
free-text missing-field strings back to a requirement entry.

## Tab change + anchor handoff

Shell wiring is URL-driven: `?tab=<tab_id>&anchor=<anchor_id>`. The
overlay's `onNavigateToTab(tab, anchor)` callback is wired to update
both, and the child tab consumes `focusAnchor` (passed by
DefineProjectPage from `searchParams.get('anchor')`) to scroll + focus
on mount. The anchor URL param self-clears after ~800 ms so re-renders
don't keep refocusing.

If a tab wants to honour the anchor:
```tsx
useEffect(() => {
  if (!focusAnchor) return;
  const el = document.querySelector<HTMLElement>(
    `[id="${focusAnchor}"], [data-define-anchor="${focusAnchor}"]`,
  );
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => el.focus?.(), 200);
}, [focusAnchor]);
```

## Routes — LIVE

- `/define/new` — creation shell (no DB row).
- `/define/:projectId` — canonical project home at every DoI level.
- `/backlog/:projectId` — redirects to `/define/:projectId` (preserves
  query + hash).
- Workbench left-rail `+ New` button now navigates to `/define/new`.
- Workbench at `/workbench/{id}` reachable from the Define page header
  via the "Open in Workbench" button (enabled at DoI ≥ 3 only) — no
  auto-redirect at DoI 3.

## API (canonical, from `@/types/define`)

shell-builder consumes:
- `POST /api/projects/define` → `ProjectDefineResponse`
- `GET  /api/projects/{id}/define` → `ProjectDefineResponse`
- `PUT  /api/projects/{id}/identity` → `ProjectDefineResponse`
- `GET  /api/projects/{id}/pipeline` (existing) → `PipelineState`

Tabs-builder additionally provides:
- `PUT /api/projects/{id}/baseline-grid` → `ProjectFinancialsSaveResponse`

All endpoints live on `defineApi` in `frontend/src/modules/define/api.ts`.

## Open follow-ups (out of Task #2 scope)

- tabs-builder's `TechNavigatorTab.tsx` throws
  `TRANSFORMATION_LEVELS is not defined` at runtime. Visible via the
  blank "Tech Navigator" tab after deep-link from the overlay.
- tabs-builder's `FinancialsTab.tsx` triggers a
  `react-hooks/set-state-in-effect` lint error on line 190.
- tabs-builder's `TechNavigatorTab.tsx` triggers a
  `react-hooks/set-state-in-effect` lint error on line 112.

## Visual verification artefacts

In `qa/screenshots/`:
- `2026-05-11-define-new-empty.png` (light) — clean /define/new shell
- `2026-05-11-define-new-dark.png` — dark-mode equivalent
- `2026-05-11-define-existing-doi0.png` — populated DoI 0 project,
  amber overlay with 5 missing fields, deep-link callouts
- `2026-05-11-define-tn-placeholder.png` — TN tab (tabs-builder content)
- `2026-05-11-define-financials-placeholder.png` — Financials tab
- `2026-05-11-define-approval-placeholder.png` — Approval & Milestones
- `2026-05-11-define-golden-path-final.png` — end of golden-path:
  /define/new → Create project → redirected to /define/{id} with overlay
- `2026-05-11-workbench-newbtn.png` — Workbench with redesigned + New
