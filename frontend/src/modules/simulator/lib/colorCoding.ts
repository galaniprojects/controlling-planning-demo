/**
 * Per-scenario colour coding for the Compare view.
 *
 * Spec [B-CV-04]: each scenario column is identified by a distinct colour
 * (Scenario A blue, Scenario B pink, Scenario C green). The colour applies
 * to:
 *   - the column header tint
 *   - a thin left border on data cells
 *   - the badge dot in the column header
 *
 * Per CLAUDE.md: directional indicators in cells use arrows + +/- prefixes,
 * NEVER colour. So this palette is purely for *identifying which scenario a
 * column belongs to*, not for signalling direction.
 *
 * Each entry exposes Tailwind utility classes wired to dark-mode variants so
 * the same palette object is reused in both themes. Hex fallbacks are kept
 * for inline-style consumers (e.g. SVG dots, custom borders).
 *
 * The "anchor" / "current state" column has its own neutral palette since
 * it is always pinned as column 0 and isn't a scenario.
 *
 * The bottom of this file also exports T1's `deltaColor` /
 * POSITIVE/NEGATIVE/NEUTRAL_DELTA_CLASS helpers (originally a stub in
 * Checkpoint A). Keep these for v4 advisor compatibility, but new code in
 * the impact dashboard / Compare view uses arrows + signs (see
 * `lib/dimensionHeadlines.ts`) per the accessibility rule above.
 */

export interface ScenarioColorTokens {
  /** Short label used in tooltips / aria. */
  name: string;
  /** Tailwind classes for the column header bar (background + border). */
  header: string;
  /** Tailwind class for the column header label text. */
  headerText: string;
  /** Tailwind classes for the data column tint (background only). */
  cellTint: string;
  /** Tailwind class for the column-edge left border on data cells. */
  borderLeft: string;
  /** Tailwind class for the legend / badge dot. */
  dot: string;
  /** CSS hex for inline styles (e.g. SVG strokes). Light-mode value. */
  hex: string;
}

const ANCHOR: ScenarioColorTokens = {
  name: 'Anchor',
  header: 'bg-muted/60 border-b border-border',
  headerText: 'text-foreground',
  cellTint: 'bg-transparent',
  borderLeft: 'border-l border-border',
  dot: 'bg-muted-foreground/60',
  hex: '#6B7280', // slate-500
};

/**
 * Per-scenario palette. Index 0 → first selected scenario, etc.
 * Light + dark variants embedded in each token so callers don't branch.
 */
const SCENARIO_PALETTE: ScenarioColorTokens[] = [
  {
    name: 'Scenario A (blue)',
    header:
      'bg-blue-50 border-b-2 border-blue-400 dark:bg-blue-950/30 dark:border-blue-500',
    headerText: 'text-blue-900 dark:text-blue-200',
    cellTint: 'bg-blue-50/40 dark:bg-blue-950/15',
    borderLeft: 'border-l-2 border-blue-300 dark:border-blue-700',
    dot: 'bg-blue-500 dark:bg-blue-400',
    hex: '#3B82F6',
  },
  {
    name: 'Scenario B (pink)',
    header:
      'bg-pink-50 border-b-2 border-pink-400 dark:bg-pink-950/30 dark:border-pink-500',
    headerText: 'text-pink-900 dark:text-pink-200',
    cellTint: 'bg-pink-50/40 dark:bg-pink-950/15',
    borderLeft: 'border-l-2 border-pink-300 dark:border-pink-700',
    dot: 'bg-pink-500 dark:bg-pink-400',
    hex: '#EC4899',
  },
  {
    name: 'Scenario C (green)',
    header:
      'bg-emerald-50 border-b-2 border-emerald-400 dark:bg-emerald-950/30 dark:border-emerald-500',
    headerText: 'text-emerald-900 dark:text-emerald-200',
    cellTint: 'bg-emerald-50/40 dark:bg-emerald-950/15',
    borderLeft: 'border-l-2 border-emerald-300 dark:border-emerald-700',
    dot: 'bg-emerald-500 dark:bg-emerald-400',
    hex: '#10B981',
  },
];

/**
 * Get the palette token for a scenario column. Index 0 is reserved for
 * the anchor / current-state column. Indexes 1..3 are scenario A/B/C.
 *
 * Falls back to the last palette entry if more than 3 scenario columns
 * are passed (defensive — the backend caps comparison at 3 scenarios).
 */
export function colorForScenarioColumn(
  index: number,
): ScenarioColorTokens {
  if (index <= 0) return ANCHOR;
  const palette = SCENARIO_PALETTE[index - 1];
  return palette ?? SCENARIO_PALETTE[SCENARIO_PALETTE.length - 1];
}

/**
 * Get the palette token for a *scenario id* given the ordered list of
 * scenario ids on screen. Used by ScenarioColumnHeader so each scenario
 * keeps the same colour as users navigate L1 → L2 → L3.
 */
export function colorForScenarioId(
  scenarioId: number,
  orderedScenarioIds: number[],
): ScenarioColorTokens {
  const idx = orderedScenarioIds.indexOf(scenarioId);
  if (idx < 0) return SCENARIO_PALETTE[0];
  return colorForScenarioColumn(idx + 1);
}

export const ANCHOR_COLOR_TOKENS = ANCHOR;
export const SCENARIO_COLOR_PALETTE = SCENARIO_PALETTE;

// ---------------------------------------------------------------------------
// Delta-direction colour helpers (T1 Checkpoint A stub — preserved here)
// ---------------------------------------------------------------------------
//
// Per CLAUDE.md, the impact dashboard + Compare view convey direction via
// arrows + +/- prefixes, NOT colour. These helpers are kept for v4-era
// callers (e.g. the AI advisor panel preserved verbatim from v4) and may
// be useful as a *complementary* cue alongside arrows in non-accessibility-
// critical surfaces.

export const POSITIVE_DELTA_CLASS =
  'text-emerald-700 dark:text-emerald-400';
export const NEGATIVE_DELTA_CLASS =
  'text-red-700 dark:text-red-400';
export const NEUTRAL_DELTA_CLASS = 'text-muted-foreground';

export function deltaColor(delta: number | null | undefined): string {
  if (delta == null || Math.abs(delta) < 0.005) return NEUTRAL_DELTA_CLASS;
  return delta > 0 ? POSITIVE_DELTA_CLASS : NEGATIVE_DELTA_CLASS;
}
