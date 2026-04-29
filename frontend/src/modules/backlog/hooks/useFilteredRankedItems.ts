/**
 * useFilteredRankedItems — pure client-side filtering + sort-override.
 * Input: raw items[] from server. Output: display rows.
 * [A-BK-21..25]
 *
 * Filter/sort/cutoff data flow (per spec):
 * - Server filters narrow items[]; cutoff block is unaffected.
 * - Client filters (T-level, within_cutoff, score range) narrow display rows.
 * - Cutoff bands stay anchored to original ranking positions.
 * - Sort override suppresses bands and misalignment tinting.
 */

import { useMemo } from 'react';
import type { RankedProjectItem } from '@/types/api';
import type { BacklogFilters, SortDir, SortField } from '../BacklogContext';

export function useFilteredRankedItems(
  items: RankedProjectItem[],
  filters: BacklogFilters,
  sortField: SortField | null,
  sortDir: SortDir,
) {
  return useMemo(() => {
    let filtered = items;

    // Client-side filters
    if (filters.transformation_level) {
      filtered = filtered.filter(
        (i) => i.transformation_level === filters.transformation_level,
      );
    }
    if (filters.within_cutoff) {
      filtered = filtered.filter((i) => i.within_cutoff === true);
    }

    // Sort override
    if (sortField && sortField !== 'rank') {
      filtered = [...filtered].sort((a, b) => {
        let av: string | number | null = null;
        let bv: string | number | null = null;
        switch (sortField) {
          case 'composite_score':
            av = a.composite_score;
            bv = b.composite_score;
            break;
          case 'total_budget':
            av = a.total_budget;
            bv = b.total_budget;
            break;
          case 'project_name':
            av = a.project_name;
            bv = b.project_name;
            break;
          case 'doi':
            av = a.doi;
            bv = b.doi;
            break;
        }
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        const cmp =
          typeof av === 'string' && typeof bv === 'string'
            ? av.localeCompare(bv)
            : (av as number) - (bv as number);
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }

    return filtered;
  }, [items, filters.transformation_level, filters.within_cutoff, sortField, sortDir]);
}
