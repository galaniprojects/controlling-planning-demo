/**
 * Project-color palette for the v5.2 Capacity Module timeline.
 *
 * Per spec §3.2: the same project gets the same color across all rows and
 * surfaces (timeline segments, side-panel allocation dots, demand-strip
 * legend, dashboard charts). Reds and grays are deliberately reserved for
 * semantic meaning (over-allocation border, idle/empty cells), so the
 * rotating palette uses cool + warm hues only.
 *
 * The 7 colors are baked-in hex values (not the chart-1..5 oklch tokens
 * in index.css — those are a different 5-hue rotation tuned for charts).
 */
export const PROJECT_COLOR_PALETTE: readonly string[] = [
  '#85B7EB', // 1. Blue
  '#97C459', // 2. Green
  '#5DCAA5', // 3. Teal
  '#AFA9EC', // 4. Purple
  '#F0997B', // 5. Coral
  '#ED93B1', // 6. Pink
  '#EF9F27', // 7. Amber
];

/**
 * Pick a stable color for a project given its zero-based index in the
 * visible-projects ordering. Cycles through the palette beyond 7 distinct
 * projects (per spec §3.2 — color clashes are acceptable in the rare
 * 8+ visible-projects case for a single CC).
 */
export function assignProjectColor(indexInVisibleSet: number): string {
  const len = PROJECT_COLOR_PALETTE.length;
  const safeIndex = ((indexInVisibleSet % len) + len) % len;
  return PROJECT_COLOR_PALETTE[safeIndex];
}
