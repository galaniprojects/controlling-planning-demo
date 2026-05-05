/**
 * phaseHelpers — pure utilities for v5.1 C-03 milestone phase highlighting on
 * the F&P grid. Maps each `DisplayColumn` produced by `MixedGranularityGrid`
 * onto a milestone phase so the column can be tinted and the strip row can
 * render contiguous coloured segments above the data rows.
 *
 * Design:
 *   - Months are `YYYY-MM` strings (lex-sortable, same shape as backend).
 *   - A column's month range is derived from its key shape:
 *       monthly                       'YYYY-MM'                 → [m, m]
 *       quarterly                     'YYYY-QN'                 → [Q.first, Q.last]
 *       expanded sub-month            'YYYY-QN::expanded::YYYY-MM' → [m, m]
 *     yearTotal columns are never tinted (the helper returns `null`).
 *   - A column belongs to a milestone phase when the column's range overlaps
 *     the milestone's `forecast_start..forecast_end` range. When two phases
 *     overlap a single column (rare, only at quarter boundaries) the dominant
 *     phase wins by month-coverage count.
 *   - Fallback palette: when `MilestoneResponse.color` is null we deterministi-
 *     cally pick a colour from a 6-entry muted palette indexed by
 *     `sequence_number % 6`.
 */
import type { MilestoneResponse } from '@/types/milestones';

/**
 * Muted phase palette designed to read in both light + dark themes. Picked so
 * that ~7% alpha cell tints stay legible against `bg-card` and ~70% alpha
 * strip-row segments remain distinguishable. Used only when
 * `MilestoneResponse.color` is null (which would normally fall back to
 * `MilestoneType.default_color` server-side).
 */
export const FALLBACK_PHASE_PALETTE: readonly string[] = [
  '#64748b', // slate-500     — neutral
  '#0d9488', // teal-600      — soft green
  '#d97706', // amber-600     — warm amber
  '#dc2626', // red-600       — coral / rollout
  '#7c3aed', // violet-600    — closeout
  '#0284c7', // sky-600       — slate blue / planning
] as const;

/**
 * Backend (`MilestoneType.default_color` and per-milestone overrides) stores
 * Tailwind palette token names — `'amber'`, `'emerald'`, `'slate'`, etc. —
 * not hex strings. Inline `style.backgroundColor` only honours CSS-recognised
 * names (`'blue'`, `'teal'`, `'violet'` are valid; `'amber'`, `'emerald'`,
 * `'slate'`, `'sky'`, `'rose'` are not), and `withAlpha` only digests hex
 * inputs. Without this map, "amber" renders as nothing (invalid CSS) while
 * "violet" renders at 100% opacity (valid CSS, alpha bypassed). Both bugs
 * produce the same symptom: the strip tag and the cell tint disagree on
 * colour. We normalise to Tailwind 600-shade hex so both paths see the same
 * `#RRGGBB` and `withAlpha` can apply alpha consistently.
 */
const TAILWIND_TOKEN_TO_HEX: Readonly<Record<string, string>> = {
  slate: '#475569',
  gray: '#4b5563',
  zinc: '#52525b',
  neutral: '#525252',
  stone: '#57534e',
  red: '#dc2626',
  orange: '#ea580c',
  amber: '#d97706',
  yellow: '#ca8a04',
  lime: '#65a30d',
  green: '#16a34a',
  emerald: '#059669',
  teal: '#0d9488',
  cyan: '#0891b2',
  sky: '#0284c7',
  blue: '#2563eb',
  indigo: '#4f46e5',
  violet: '#7c3aed',
  purple: '#9333ea',
  fuchsia: '#c026d3',
  pink: '#db2777',
  rose: '#e11d48',
};

/**
 * Normalise a milestone colour token into a hex string. Pass-through for
 * existing hex inputs and unknown values (so explicit hex overrides + CSS
 * variables still survive intact).
 */
export function normalizePhaseColor(color: string): string {
  if (!color) return color;
  if (color.startsWith('#')) return color;
  const lower = color.toLowerCase();
  return TAILWIND_TOKEN_TO_HEX[lower] ?? color;
}

/** Resolve a milestone's display colour with deterministic fallback. */
export function resolvePhaseColor(milestone: MilestoneResponse): string {
  if (milestone.color && milestone.color.length > 0) {
    return normalizePhaseColor(milestone.color);
  }
  const idx = Math.max(0, milestone.sequence_number - 1) % FALLBACK_PHASE_PALETTE.length;
  return FALLBACK_PHASE_PALETTE[idx];
}

/**
 * Derive the inclusive `[firstMonth, lastMonth]` range for a display-column
 * key. Returns `null` for keys that are not month-bound (yearTotal columns
 * never reach this helper because they are filtered out by the caller; we
 * still defend against malformed keys).
 */
export function getColumnMonthRange(key: string): [string, string] | null {
  if (key.includes('::expanded::')) {
    const parts = key.split('::');
    const m = parts[2];
    if (m && m.length === 7) return [m, m];
    return null;
  }
  if (key.length === 7 && key[5] === 'Q') {
    const year = parseInt(key.slice(0, 4), 10);
    const qNum = parseInt(key.slice(6), 10);
    if (Number.isNaN(year) || Number.isNaN(qNum)) return null;
    const startMonth = (qNum - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    const first = `${year}-${String(startMonth).padStart(2, '0')}`;
    const last = `${year}-${String(endMonth).padStart(2, '0')}`;
    return [first, last];
  }
  if (key.length === 7 && key[4] === '-') {
    return [key, key];
  }
  return null;
}

/**
 * Count how many months in `[a, b]` (inclusive) fall inside `[lo, hi]`
 * (inclusive). All values are `YYYY-MM` strings.
 */
function monthsOverlap(a: string, b: string, lo: string, hi: string): number {
  // Walk the shorter side. Ranges in the F&P grid are tiny (1–3 months for
  // any single column) so a linear walk is cheap and avoids pulling in date
  // arithmetic for what is otherwise pure string compare.
  const aY = parseInt(a.slice(0, 4), 10);
  const aM = parseInt(a.slice(5, 7), 10);
  const bY = parseInt(b.slice(0, 4), 10);
  const bM = parseInt(b.slice(5, 7), 10);
  let count = 0;
  let y = aY;
  let m = aM;
  while (y < bY || (y === bY && m <= bM)) {
    const cur = `${y}-${String(m).padStart(2, '0')}`;
    if (cur >= lo && cur <= hi) count += 1;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return count;
}

export interface PhaseInfo {
  /** Stable lookup id (milestone numeric id). */
  phaseId: number;
  /** Resolved colour (CSS string). */
  color: string;
  /** Phase / milestone display name. */
  phaseName: string;
  /** Sequence number from the source milestone. Used for deterministic ordering. */
  sequenceNumber: number;
  /** Forecast end month — used to detect slip vs baseline. */
  forecastEnd: string;
  /** Baseline end month — anchor for the gray-triangle marker. */
  baselineEnd: string;
  /** Slip months (forecast_end vs baseline_end). 0 means no slip. */
  slipMonths: number;
}

/**
 * Build a `Map<columnKey, PhaseInfo>` covering every monthly / quarterly /
 * expanded-sub display column. Columns that fall outside every milestone's
 * forecast range are absent from the map (caller treats absence as "no tint").
 *
 * `columnKeys` should be the ordered list of `DisplayColumn` keys (data
 * entries only — the caller filters out yearTotal entries).
 */
export function mapColumnsToPhases(
  columnKeys: readonly string[],
  milestones: readonly MilestoneResponse[],
): Map<string, PhaseInfo> {
  const out = new Map<string, PhaseInfo>();
  if (milestones.length === 0) return out;
  // Sort milestones by sequence_number so that, when two phases tie on month
  // coverage, the earlier-sequence phase wins (stable, predictable ordering).
  const sorted = [...milestones].sort((a, b) => a.sequence_number - b.sequence_number);
  for (const key of columnKeys) {
    const range = getColumnMonthRange(key);
    if (!range) continue;
    const [colLo, colHi] = range;
    let bestPhase: MilestoneResponse | null = null;
    let bestCoverage = 0;
    for (const m of sorted) {
      const coverage = monthsOverlap(colLo, colHi, m.forecast_start, m.forecast_end);
      if (coverage > bestCoverage) {
        bestCoverage = coverage;
        bestPhase = m;
      }
    }
    if (bestPhase && bestCoverage > 0) {
      out.set(key, {
        phaseId: bestPhase.id,
        color: resolvePhaseColor(bestPhase),
        phaseName: bestPhase.name,
        sequenceNumber: bestPhase.sequence_number,
        forecastEnd: bestPhase.forecast_end,
        baselineEnd: bestPhase.baseline_end,
        slipMonths: bestPhase.slip_months,
      });
    }
  }
  return out;
}

/**
 * A run of contiguous columns belonging to the same phase. Used by
 * `<PhaseStrip>` to render one segment per run.
 */
export interface PhaseSegment {
  phase: PhaseInfo;
  /** Starting column index in the displayColumns array (data + yearTotal). */
  startIndex: number;
  /** Number of columns the segment spans (>= 1). */
  span: number;
  /** First column key in the run — for React key stability. */
  startKey: string;
}

/**
 * Walk the full displayColumns key list (in order) and bucket consecutive
 * keys with the same phase into segments. yearTotal columns interrupt
 * segments (they always sit between years). `keys` carries `null` for
 * columns that should never be tinted (e.g., yearTotal).
 */
export function buildPhaseSegments(
  keys: readonly (string | null)[],
  phaseMap: Map<string, PhaseInfo>,
): PhaseSegment[] {
  const segments: PhaseSegment[] = [];
  let current: PhaseSegment | null = null;
  for (let i = 0; i < keys.length; i += 1) {
    const k = keys[i];
    const phase = k != null ? phaseMap.get(k) : undefined;
    if (!phase || k == null) {
      // Break the current segment on yearTotal / unmapped columns.
      current = null;
      continue;
    }
    if (current && current.phase.phaseId === phase.phaseId) {
      current.span += 1;
    } else {
      current = {
        phase,
        startIndex: i,
        span: 1,
        startKey: k,
      };
      segments.push(current);
    }
  }
  return segments;
}

/**
 * Convert a hex / CSS colour string into a rgba() with the supplied alpha.
 * Falls back to the original value (so CSS variables / oklch() values pass
 * through unchanged) if the input is not a #RRGGBB hex.
 */
export function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('#') && (color.length === 7 || color.length === 4)) {
    let r: number;
    let g: number;
    let b: number;
    if (color.length === 7) {
      r = parseInt(color.slice(1, 3), 16);
      g = parseInt(color.slice(3, 5), 16);
      b = parseInt(color.slice(5, 7), 16);
    } else {
      r = parseInt(color.slice(1, 2).repeat(2), 16);
      g = parseInt(color.slice(2, 3).repeat(2), 16);
      b = parseInt(color.slice(3, 4).repeat(2), 16);
    }
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return color;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}
