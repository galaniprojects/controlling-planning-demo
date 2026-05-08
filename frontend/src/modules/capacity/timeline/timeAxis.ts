/**
 * Time-axis helpers for the v5.2 Capacity timeline (Track A — spec §4).
 *
 * The timeline supports a three-level hierarchy where each year may be
 * collapsed (1 year-cell) or expanded into quarters; each quarter inside
 * an expanded year may be collapsed (1 quarter-cell) or expanded into
 * its 3 month-cells.
 *
 *   Year (collapsed) → Quarter (collapsed) → Month (expanded)
 *
 * This module is pure — no React, no DOM. It owns:
 *   • State shape `TimeAxisState` mapping year → expanded flag + per-quarter state
 *   • `defaultTimeAxisState` per spec §4.5 (current FY expanded to quarters,
 *     current quarter expanded to months, past/future years collapsed)
 *   • `buildVisibleColumns(state, allMonths)` flattening the hierarchy
 *     into a list of `TimeColumn` cells the header + rows iterate over.
 *   • `computePeriodCells(...)` averaging utilization + project-segment
 *     hours across the months grouped under a collapsed quarter or year.
 *
 * Tests: covered indirectly via `tsc --noEmit` (no frontend test harness).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Quarter = 1 | 2 | 3 | 4;

export interface QuarterState {
  expanded: boolean;
}

export interface YearState {
  /**
   * Year-level expand flag. When `false`, the entire year renders as a
   * single year-summary column; quarter state is ignored. When `true`,
   * the year emits up to 4 quarter columns, each of which may itself be
   * expanded into 3 monthly columns.
   */
  expanded: boolean;
  /**
   * Per-quarter expand state. Only consulted when `expanded === true`.
   * Quarters with no months in the visible window are still allowed in
   * the map (they are filtered out at render time).
   */
  quarters: Record<Quarter, QuarterState>;
}

export type TimeAxisState = Record<number, YearState>;

/**
 * A single cell column in the time axis. Three flavors:
 *   - `month`: a single YYYY-MM column.
 *   - `quarter`: a collapsed quarter (year is expanded but quarter isn't).
 *   - `year`: a fully-collapsed year.
 *
 * Each variant carries the list of underlying months it represents so
 * row renderers can look up cells / aggregate utilization without
 * re-deriving the grouping.
 */
export type TimeColumn =
  | {
      type: 'month';
      key: string;
      year: number;
      quarter: Quarter;
      month: string;
      months: [string];
      width: number;
    }
  | {
      type: 'quarter';
      key: string;
      year: number;
      quarter: Quarter;
      months: string[];
      width: number;
    }
  | {
      type: 'year';
      key: string;
      year: number;
      months: string[];
      width: number;
    };

// ---------------------------------------------------------------------------
// Column widths (spec §4.6)
// ---------------------------------------------------------------------------

export const MONTH_COLUMN_WIDTH = 42;
export const QUARTER_COLUMN_WIDTH = 48;
export const YEAR_COLUMN_WIDTH = 48;
export const NAME_COLUMN_WIDTH = 160;

// ---------------------------------------------------------------------------
// Calendar helpers
// ---------------------------------------------------------------------------

/** Parse "YYYY-MM" → year + 0-based month index. Throws on malformed input. */
export function parseMonth(month: string): { year: number; m0: number } {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error(`Invalid month string: ${month}`);
  }
  return {
    year: parseInt(month.slice(0, 4), 10),
    m0: parseInt(month.slice(5, 7), 10) - 1,
  };
}

/** Quarter (1..4) for a "YYYY-MM" string. */
export function getQuarterOfMonth(month: string): Quarter {
  const { m0 } = parseMonth(month);
  return (Math.floor(m0 / 3) + 1) as Quarter;
}

/** Format a month index 0..11 as "YYYY-MM". */
function fmtMonth(year: number, m0: number): string {
  return `${year}-${String(m0 + 1).padStart(2, '0')}`;
}

/** All 3 months of a given quarter, e.g. (2026, 2) → ["2026-04","2026-05","2026-06"]. */
export function getMonthsForQuarter(year: number, quarter: Quarter): string[] {
  const start = (quarter - 1) * 3;
  return [fmtMonth(year, start), fmtMonth(year, start + 1), fmtMonth(year, start + 2)];
}

/**
 * Generate the inclusive month range from `start` to `end` (both YYYY-MM).
 * Used to derive the visible window.
 */
export function generateMonthRange(start: string, end: string): string[] {
  const a = parseMonth(start);
  const b = parseMonth(end);
  const months: string[] = [];
  let { year, m0 } = a;
  while (year < b.year || (year === b.year && m0 <= b.m0)) {
    months.push(fmtMonth(year, m0));
    m0 += 1;
    if (m0 > 11) {
      m0 = 0;
      year += 1;
    }
  }
  return months;
}

/** Add `n` months (positive or negative) to a YYYY-MM and return YYYY-MM. */
export function addMonths(month: string, n: number): string {
  const { year, m0 } = parseMonth(month);
  const total = year * 12 + m0 + n;
  const ny = Math.floor(total / 12);
  const nm = ((total % 12) + 12) % 12;
  return fmtMonth(ny, nm);
}

// ---------------------------------------------------------------------------
// Default state (spec §4.5)
// ---------------------------------------------------------------------------

const ALL_QUARTERS: Quarter[] = [1, 2, 3, 4];

function emptyYearState(expanded: boolean): YearState {
  const quarters = {} as Record<Quarter, QuarterState>;
  for (const q of ALL_QUARTERS) quarters[q] = { expanded: false };
  return { expanded, quarters };
}

/**
 * Default collapse state per spec §4.5:
 *   - Current fiscal year: expanded with current quarter further expanded
 *     to months. Past/future quarters in the same year stay collapsed.
 *   - All other years (past and future): collapsed to a single year cell.
 *
 * `demoMonth` is a "YYYY-MM" string, typically `'2026-04'` (the demo
 * date). `visibleMonths` provides the universe of years/quarters we
 * actually have data for; years with no data are not seeded into the
 * state map.
 */
export function defaultTimeAxisState(
  visibleMonths: readonly string[],
  demoMonth: string,
): TimeAxisState {
  const { year: currentYear } = parseMonth(demoMonth);
  const currentQuarter = getQuarterOfMonth(demoMonth);
  const years = new Set<number>();
  for (const m of visibleMonths) years.add(parseMonth(m).year);

  const state: TimeAxisState = {};
  for (const y of years) {
    if (y === currentYear) {
      const ys = emptyYearState(true);
      ys.quarters[currentQuarter].expanded = true;
      state[y] = ys;
    } else {
      state[y] = emptyYearState(false);
    }
  }
  return state;
}

// ---------------------------------------------------------------------------
// Visible-column composition
// ---------------------------------------------------------------------------

/**
 * Flatten the (state × visibleMonths) into a left-to-right ordered list
 * of `TimeColumn` cells the header + rows iterate over.
 *
 * Years are processed in ascending order. Within an expanded year,
 * quarters Q1..Q4 are processed; quarters with at least one visible
 * month emit either a single quarter cell or 3 month cells (one per
 * visible month — quarters partially-overlapping the visible window
 * are still rendered with whichever months exist).
 */
export function buildVisibleColumns(
  state: TimeAxisState,
  visibleMonths: readonly string[],
): TimeColumn[] {
  // Group visible months by (year, quarter)
  const byYearQuarter = new Map<number, Map<Quarter, string[]>>();
  for (const m of visibleMonths) {
    const { year } = parseMonth(m);
    const q = getQuarterOfMonth(m);
    if (!byYearQuarter.has(year)) byYearQuarter.set(year, new Map());
    const qs = byYearQuarter.get(year)!;
    if (!qs.has(q)) qs.set(q, []);
    qs.get(q)!.push(m);
  }

  const cols: TimeColumn[] = [];
  const sortedYears = Array.from(byYearQuarter.keys()).sort((a, b) => a - b);

  for (const year of sortedYears) {
    const yState = state[year] ?? emptyYearState(year === 2026);
    const qMap = byYearQuarter.get(year)!;
    const allMonthsInYear = ALL_QUARTERS.flatMap((q) => qMap.get(q) ?? []);

    if (!yState.expanded || allMonthsInYear.length === 0) {
      cols.push({
        type: 'year',
        key: `y-${year}`,
        year,
        months: allMonthsInYear,
        width: YEAR_COLUMN_WIDTH,
      });
      continue;
    }

    for (const q of ALL_QUARTERS) {
      const qMonths = qMap.get(q) ?? [];
      if (qMonths.length === 0) continue;
      const qExpanded = yState.quarters[q]?.expanded === true;

      if (qExpanded) {
        for (const m of qMonths) {
          cols.push({
            type: 'month',
            key: `m-${m}`,
            year,
            quarter: q,
            month: m,
            months: [m],
            width: MONTH_COLUMN_WIDTH,
          });
        }
      } else {
        cols.push({
          type: 'quarter',
          key: `q-${year}-${q}`,
          year,
          quarter: q,
          months: qMonths,
          width: QUARTER_COLUMN_WIDTH,
        });
      }
    }
  }

  return cols;
}

// ---------------------------------------------------------------------------
// State mutation helpers (immutable)
// ---------------------------------------------------------------------------

export function toggleYear(state: TimeAxisState, year: number): TimeAxisState {
  const prev = state[year] ?? emptyYearState(false);
  return {
    ...state,
    [year]: { ...prev, expanded: !prev.expanded },
  };
}

export function toggleQuarter(
  state: TimeAxisState,
  year: number,
  quarter: Quarter,
): TimeAxisState {
  const prev = state[year] ?? emptyYearState(true);
  // Toggling a quarter implicitly expands its parent year — clicking a
  // collapsed-quarter chevron from a freshly-expanded year is the
  // conventional path; covering the year=collapsed case avoids dead
  // states.
  const next: YearState = {
    expanded: true,
    quarters: { ...prev.quarters },
  };
  next.quarters[quarter] = { expanded: !prev.quarters[quarter]?.expanded };
  return { ...state, [year]: next };
}

// ---------------------------------------------------------------------------
// Period-summary aggregation (spec §4.4)
// ---------------------------------------------------------------------------

export interface MonthCell {
  month: string;
  /** Utilization percentage (0–N). 100 means fully booked. */
  utilization: number;
  /** Hours allocated this month (sum across all projects). */
  allocatedHours: number;
  /** Standard hours (full available capacity) for this person/month. */
  standardHours: number;
  /**
   * Per-project breakdown for the month. May be empty when the data
   * source can't furnish it (e.g. org-level scope) — in which case the
   * timeline renders a single-color utilization bar with no segments.
   */
  projects: { projectId: string; hours: number }[];
}

export interface PeriodSummary {
  /** Mean utilization across the months in the period. */
  utilization: number;
  /** Sum of project hours per project across the period. */
  projectHours: { projectId: string; hours: number }[];
  /** Sum of standard hours across the months (denominator for segments). */
  totalStandardHours: number;
  /** Sum of allocated hours across the months. */
  totalAllocatedHours: number;
  /**
   * True when *any* month in the period had utilization > 100%. Drives
   * the red over-allocation border on collapsed-period cells per §4.4.
   */
  hadOverAllocation: boolean;
}

/**
 * Aggregate a list of month cells into a summary suitable for rendering
 * a collapsed-quarter or collapsed-year bar. See spec §4.4 for the
 * computation rules:
 *
 *   - Utilization = arithmetic mean of monthly utilization values.
 *   - Project segments use the sum of project-hours over the period
 *     against the sum of standard-hours over the same period; this
 *     keeps segment widths proportional to the same denominator the
 *     mean utilization implicitly uses.
 *   - Over-allocation flag flips when *any* month in the period
 *     exceeded 100%, even if the mean stays ≤ 100%.
 */
export function computePeriodSummary(cells: readonly MonthCell[]): PeriodSummary {
  if (cells.length === 0) {
    return {
      utilization: 0,
      projectHours: [],
      totalStandardHours: 0,
      totalAllocatedHours: 0,
      hadOverAllocation: false,
    };
  }
  let utilSum = 0;
  let stdSum = 0;
  let allocSum = 0;
  let over = false;
  const projectMap = new Map<string, number>();
  for (const c of cells) {
    utilSum += c.utilization;
    stdSum += c.standardHours;
    allocSum += c.allocatedHours;
    if (c.utilization > 100) over = true;
    for (const p of c.projects) {
      projectMap.set(p.projectId, (projectMap.get(p.projectId) ?? 0) + p.hours);
    }
  }
  return {
    utilization: utilSum / cells.length,
    totalStandardHours: stdSum,
    totalAllocatedHours: allocSum,
    hadOverAllocation: over,
    projectHours: Array.from(projectMap.entries()).map(([projectId, hours]) => ({
      projectId,
      hours,
    })),
  };
}

// ---------------------------------------------------------------------------
// Header label helpers
// ---------------------------------------------------------------------------

const QUARTER_LABEL: Record<Quarter, string> = { 1: 'Q1', 2: 'Q2', 3: 'Q3', 4: 'Q4' };
const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export function quarterLabel(quarter: Quarter): string {
  return QUARTER_LABEL[quarter];
}

export function shortMonthLabel(month: string): string {
  return MONTH_SHORT[parseMonth(month).m0] ?? month;
}
