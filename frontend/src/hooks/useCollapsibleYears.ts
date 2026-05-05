import { useState, useMemo, useEffect } from 'react';
import {
  groupMonthsByYear,
  groupMixedKeysByYear,
  isJanuary,
  isYearStartColumnKey,
} from '@/lib/yearColumns';

export type VisibleColumn =
  | { type: 'month'; key: string; year: number; isJanuary: boolean }
  | { type: 'yearSummary'; year: number; months: string[] };

export interface YearGroup {
  year: number;
  months: string[];
  isExpanded: boolean;
}

export interface UseCollapsibleYearsResult {
  yearGroups: YearGroup[];
  toggleYear: (year: number) => void;
  visibleColumns: VisibleColumn[];
}

/**
 * Hook for collapsible year columns. Groups months by year, tracks
 * expanded/collapsed state per year (current year expanded by default),
 * and produces a flat list of visible columns for rendering.
 *
 * The hook does NOT compute sums — callers handle that since sum logic
 * differs by data type (hours vs EUR).
 */
export function useCollapsibleYears(months: string[], defaultExpandedYear?: number): UseCollapsibleYearsResult {
  const EXPAND_YEAR = defaultExpandedYear ?? 2026;
  const grouped = useMemo(() => groupMonthsByYear(months), [months]);

  const [expandedState, setExpandedState] = useState<Record<number, boolean>>({});

  // Seed newly-appeared years into expanded state (context-sensitive year expanded by default)
  // Also re-apply when EXPAND_YEAR changes (e.g. async project metadata arrives late)
  useEffect(() => {
    setExpandedState((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const year of grouped.keys()) {
        if (!(year in next)) {
          next[year] = year === EXPAND_YEAR;
          changed = true;
        }
      }
      // If EXPAND_YEAR changed and the target year exists but isn't expanded, fix it
      if (EXPAND_YEAR in next && !next[EXPAND_YEAR]) {
        for (const y of Object.keys(next)) {
          if (next[Number(y)] && Number(y) !== EXPAND_YEAR) {
            next[Number(y)] = false;
            changed = true;
          }
        }
        next[EXPAND_YEAR] = true;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [grouped, EXPAND_YEAR]);

  const yearGroups: YearGroup[] = useMemo(() => {
    return Array.from(grouped.entries()).map(([year, yearMonths]) => ({
      year,
      months: yearMonths,
      isExpanded: expandedState[year] ?? false,
    }));
  }, [grouped, expandedState]);

  const visibleColumns: VisibleColumn[] = useMemo(() => {
    const cols: VisibleColumn[] = [];
    for (const group of yearGroups) {
      if (group.isExpanded) {
        for (const m of group.months) {
          cols.push({
            type: 'month',
            key: m,
            year: group.year,
            isJanuary: isJanuary(m),
          });
        }
      } else {
        cols.push({
          type: 'yearSummary',
          year: group.year,
          months: group.months,
        });
      }
    }
    return cols;
  }, [yearGroups]);

  function toggleYear(year: number) {
    setExpandedState((prev) => ({ ...prev, [year]: !prev[year] }));
  }

  return { yearGroups, toggleYear, visibleColumns };
}

// ---------------------------------------------------------------------------
// Mixed-granularity variant — used by the F&P MixedGranularityGrid to support
// collapsible years on top of the v5 monthly-inner / quarterly-outer layout.
// Same default behaviour: only the demo-current year (2026) is expanded by
// default; every other year is collapsed into a single yearly-summary column
// rendered by the grid (caller aggregates the underlying cells).
// ---------------------------------------------------------------------------

export type MixedVisibleColumn =
  | { type: 'column'; key: string; year: number; isYearStart: boolean }
  | { type: 'yearSummary'; year: number; keys: string[] };

export interface MixedYearGroup {
  year: number;
  keys: string[];
  isExpanded: boolean;
}

export interface UseCollapsibleMixedYearsResult {
  yearGroups: MixedYearGroup[];
  toggleYear: (year: number) => void;
  visibleColumns: MixedVisibleColumn[];
}

/**
 * Hook for collapsible year columns over a mixed-granularity column list
 * (column keys are a mix of "YYYY-MM" and "YYYY-QN"). Tracks per-year
 * expand/collapse state with the demo-current year (2026 by default)
 * expanded on first render. Caller is responsible for summing aggregate
 * values for any `yearSummary` columns it renders, since hours/EUR
 * roll-ups differ by data type.
 *
 * Order of columns within an expanded year is preserved from the input,
 * so the existing monthly-then-quarterly ordering from the backend
 * (`MixedGridResponse.columns`) flows through unchanged.
 */
export function useCollapsibleMixedYears(
  columnKeys: string[],
  defaultExpandedYear?: number,
): UseCollapsibleMixedYearsResult {
  const EXPAND_YEAR = defaultExpandedYear ?? 2026;
  const grouped = useMemo(() => groupMixedKeysByYear(columnKeys), [columnKeys]);

  const [expandedState, setExpandedState] = useState<Record<number, boolean>>({});

  useEffect(() => {
    setExpandedState((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const year of grouped.keys()) {
        if (!(year in next)) {
          next[year] = year === EXPAND_YEAR;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [grouped, EXPAND_YEAR]);

  const yearGroups: MixedYearGroup[] = useMemo(() => {
    return Array.from(grouped.entries()).map(([year, keys]) => ({
      year,
      keys,
      isExpanded: expandedState[year] ?? false,
    }));
  }, [grouped, expandedState]);

  const visibleColumns: MixedVisibleColumn[] = useMemo(() => {
    const cols: MixedVisibleColumn[] = [];
    for (const group of yearGroups) {
      if (group.isExpanded) {
        for (const k of group.keys) {
          cols.push({
            type: 'column',
            key: k,
            year: group.year,
            isYearStart: isYearStartColumnKey(k),
          });
        }
      } else {
        cols.push({
          type: 'yearSummary',
          year: group.year,
          keys: group.keys,
        });
      }
    }
    return cols;
  }, [yearGroups]);

  function toggleYear(year: number) {
    setExpandedState((prev) => ({ ...prev, [year]: !prev[year] }));
  }

  return { yearGroups, toggleYear, visibleColumns };
}
