# Session 5 — Distribution Editor screenshot checklist

These screenshots round out the Wave B PR. The s5-distribution-editor
teammate could not capture them in-agent (no Chrome DevTools MCP in
that worktree's tool list); the team lead captures them during
integration verification before opening the PR.

All screenshots are 1440px wide, served from the worktree dev server
running on the integration branch. Save under `qa/screenshots/` (which
is gitignored) — drop names into the PR description with embedded
image links.

| # | File | Theme | Route / state | What to capture |
|---|------|-------|---------------|-----------------|
| 1 | `sw-s5-editor-high-fanout-light.png` | light | `/charging` → version selector → pick draft → click any high-fanout source (e.g. `svc-infra-platform`, `svc-monitoring`) → Edit edges | High-fanout draft editor with 4–6 outgoing rows visible. Sum bar in normal state, side panel CLOSED. |
| 2 | `sw-s5-editor-high-fanout-dark.png` | dark | Same as #1 | Same as #1 but in dark theme — verify badges, sum-bar segments, depth pills all legible. |
| 3 | `sw-s5-picker-near-max-warning-light.png` | light | Same editor → click `+ Add distribution target` | Picker dialog open. Show at least one row with the amber `chain: X/6` badge (near_max_depth_warning) AND at least one row that's disabled with the red `would exceed` badge — hover the disabled row to capture the tooltip. |
| 4 | `sw-s5-editor-over-allocated-red-light.png` | light | High-fanout editor → push two rows so the total exceeds 100% | Sum bar in over-allocated state (red overlay), label reads `Total allocation: 117% / 100%`, Self-retained row red, Save button disabled (capture hover tooltip "Reduce total allocation to ≤100% before saving."). |
| 5 | `sw-s5-side-panel-live-preview-light.png` | light | Open the editor → click `Show allocation preview` → edit one percentage | Side panel visible on the right (~360px). Downstream item being edited shows accent-coloured connector + percentage + €. Edited row in the main table has the violet edit halo. Verify the side panel's € amounts match the table's amounts. |
| 6 | `sw-s5-side-panel-dark.png` | dark | Same as #5 | Dark-theme verification of the side panel — connector lines visible, accent highlight reads as primary, self-retained badge legible. |
| 7 | `sw-s5-active-version-readonly-light.png` | light | `/charging` → pick the active (in-force) version → click any entity → Edit edges (or land via per-entity view) | Read-only banner visible. No editable inputs, no `+ Add` button, no Save/Discard. |
| 8 | `sw-s5-cycle-error-banner-light.png` | light | Force a cycle: pick an entity, open picker, add a downstream → Save → trigger a cycle via dependency shift OR temporarily relax the picker's exclusion filter to let through a cycle-forming candidate | Red banner reads `Save rejected — cycle detected` + monospace arrow path. |
| 9 | `sw-s5-depth-error-banner-light.png` | light | Force a depth violation: in a near-max-depth chain, pick an entity that would push the chain past `max_allocation_depth` | Red banner reads `Save rejected — max allocation depth exceeded` + path + `(depth N)`. NOTE: with the candidates endpoint blocking these client-side, you may need to seed the request via DevTools `fetch()` or temporarily disable the picker filter. If unreachable, document it as "blocked client-side — banner verified via unit tests of `parseAllocationError`." |
| 10 | `sw-s5-entity-switch-resets-panel-light.png` | light | Open editor on entity A → open side panel → edit a row → go Back → open editor on entity B | Entity B's editor renders with side panel CLOSED (the reset). Pending dirty state from A is gone. |

## Suite gates before screenshots

```
cd /Users/vasilis/Desktop/vision-demo-prototype/.claude/worktrees/wave-b-s5/frontend && npx tsc --noEmit
cd /Users/vasilis/Desktop/vision-demo-prototype/.claude/worktrees/wave-b-s5/backend && python -m pytest tests/ -q
```

Both gates were green at commit `<5th commit sha>`:
- frontend tsc: clean
- backend pytest: 2003 passed
- vitest: tests live in `helpers/*.test.ts` and
  `errors/*.test.ts` with vitest-compatible syntax; runner not yet
  installed (devDep + `npm test` script land at Wave B integration).
