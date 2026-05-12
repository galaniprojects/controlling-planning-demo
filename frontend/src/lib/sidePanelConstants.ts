/**
 * Side panel layout constants.
 *
 * Extracted into a standalone module so React Fast Refresh isn't
 * disrupted by mixing component / hook exports with constant exports
 * (per `react-refresh/only-export-components`).
 */

/**
 * Default side-panel width (px). Used when `openPanel` is called
 * without an explicit `width` option. Locked to 380 to preserve the
 * pre-v5.2 visual contract for all non-capacity surfaces.
 *
 * Capacity (v5.2) overrides:
 *   - 280 — PersonDetail / CellDetail (spec §7.1)
 *   - 400 — AssignmentPanel (spec §9.2)
 */
export const DEFAULT_SIDE_PANEL_WIDTH = 380;
