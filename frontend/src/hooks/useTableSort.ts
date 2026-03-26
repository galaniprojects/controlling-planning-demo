import { useState, useMemo } from 'react';

interface UseTableSortOptions {
  defaultColumn?: string;
  defaultDirection?: 'asc' | 'desc';
}

export function useTableSort<T extends Record<string, unknown>>(
  rows: T[],
  options: UseTableSortOptions = {},
) {
  const [sortColumn, setSortColumn] = useState(options.defaultColumn ?? '');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(options.defaultDirection ?? 'desc');

  const onSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  const sortedRows = useMemo(() => {
    if (!sortColumn) return rows;
    const sorted = [...rows];
    sorted.sort((a, b) => {
      const av = a[sortColumn];
      const bv = b[sortColumn];
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDirection === 'asc' ? av - bv : bv - av;
      }
      return sortDirection === 'asc'
        ? String(av ?? '').localeCompare(String(bv ?? ''))
        : String(bv ?? '').localeCompare(String(av ?? ''));
    });
    return sorted;
  }, [rows, sortColumn, sortDirection]);

  return { sortColumn, sortDirection, onSort, sortedRows };
}
