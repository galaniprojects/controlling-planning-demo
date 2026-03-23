import { useState, useMemo, useEffect } from 'react';
import { groupMonthsByYear, isJanuary } from '@/lib/yearColumns';

const CURRENT_YEAR = 2026;

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
export function useCollapsibleYears(months: string[]): UseCollapsibleYearsResult {
  const grouped = useMemo(() => groupMonthsByYear(months), [months]);

  const [expandedState, setExpandedState] = useState<Record<number, boolean>>({});

  // Seed newly-appeared years into expanded state (current year expanded by default)
  useEffect(() => {
    setExpandedState((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const year of grouped.keys()) {
        if (!(year in next)) {
          next[year] = year === CURRENT_YEAR;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [grouped]);

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
