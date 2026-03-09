import { useState, useMemo } from 'react';

export interface MonthColumn {
  type: 'month';
  key: string;
  month: string; // YYYY-MM
  year: number;
}

export interface YearColumn {
  type: 'year';
  key: string;
  year: number;
  months: string[]; // YYYY-MM list for summing
}

export type Column = MonthColumn | YearColumn;

interface Options {
  allMonths: string[]; // sorted YYYY-MM list
  currentMonth?: string; // default: '2026-02'
  defaultExpandedYears?: number[]; // default: [current year]
}

export function useCollapsibleYears({
  allMonths,
  currentMonth = '2026-02',
  defaultExpandedYears,
}: Options) {
  const currentYear = parseInt(currentMonth.slice(0, 4), 10);

  const [expandedYears, setExpandedYears] = useState<Set<number>>(
    () => new Set(defaultExpandedYears ?? [currentYear]),
  );

  const toggleYear = (year: number) => {
    setExpandedYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) {
        next.delete(year);
      } else {
        next.add(year);
      }
      return next;
    });
  };

  const columns = useMemo<Column[]>(() => {
    // Group months by year
    const yearMonths: Record<number, string[]> = {};
    for (const m of allMonths) {
      const yr = parseInt(m.slice(0, 4), 10);
      if (!yearMonths[yr]) yearMonths[yr] = [];
      yearMonths[yr].push(m);
    }

    const years = Object.keys(yearMonths)
      .map(Number)
      .sort();
    const result: Column[] = [];

    for (const yr of years) {
      if (expandedYears.has(yr)) {
        // Expanded — individual month columns
        for (const m of yearMonths[yr]) {
          result.push({ type: 'month', key: m, month: m, year: yr });
        }
      } else {
        // Collapsed — single summary column
        result.push({
          type: 'year',
          key: `year-${yr}`,
          year: yr,
          months: yearMonths[yr],
        });
      }
    }

    return result;
  }, [allMonths, expandedYears]);

  return { columns, expandedYears, toggleYear };
}
