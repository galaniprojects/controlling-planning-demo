/**
 * Capacity side-panel widths — v5.2 W3 Track C.
 *
 * Extracted from `CapacitySidePanelContext.tsx` so React Fast Refresh
 * isn't disrupted by mixing component / hook exports with constant
 * exports (per `react-refresh/only-export-components`). Mirrors the
 * pattern used by `lib/sidePanelConstants.ts` for the shared panel.
 *
 * Spec references:
 *   - guides/Capacity_Module_Redesign_Spec.md §7.1 (person / cell — 280)
 *   - guides/Capacity_Module_Redesign_Spec.md §10.8 (project summary — 280)
 *   - guides/Capacity_Module_Redesign_Spec.md §9.2 (assignment — 400)
 */

export type CapacityPanelKind =
  | 'person'
  | 'cell'
  | 'project_summary'
  | 'assignment';

/**
 * Width-per-mode policy (px). The shared `SidePanel` reads this via
 * the `width` option on `openPanel(...)`.
 *
 * 280  — compact detail (person, cell, project summary).
 * 400  — assignment mode (room for the per-month grid, spec §9.2).
 */
export const CAPACITY_PANEL_WIDTH: Record<CapacityPanelKind, number> = {
  person: 280,
  cell: 280,
  project_summary: 280,
  assignment: 400,
};
