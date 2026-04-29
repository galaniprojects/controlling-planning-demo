/**
 * BacklogContext — filter/sort/view-mode/scroll state, persisted to URL params.
 * [A-BK-21..24]
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { useSearchParams } from 'react-router-dom';

export type ViewMode = 'ranked' | 'cube';
export type SortField =
  | 'rank'
  | 'composite_score'
  | 'total_budget'
  | 'project_name'
  | 'doi';
export type SortDir = 'asc' | 'desc';

export interface BacklogFilters {
  /** Server-side filters */
  pipeline_stage: string;
  project_type: string;
  tshirt_size: string;
  /** Client-side filters */
  transformation_level: string;
  lob_id: string;
  within_cutoff: boolean;
}

interface BacklogCtx {
  viewMode: ViewMode;
  filters: BacklogFilters;
  sortField: SortField | null;
  sortDir: SortDir;
  setViewMode: (v: ViewMode) => void;
  setFilter: <K extends keyof BacklogFilters>(key: K, value: BacklogFilters[K]) => void;
  clearFilters: () => void;
  setSort: (field: SortField) => void;
  clearSort: () => void;
  /** True when sort field diverges from the natural rank order */
  hasSortOverride: boolean;
}

const BacklogContext = createContext<BacklogCtx | null>(null);

const DEFAULT_FILTERS: BacklogFilters = {
  pipeline_stage: '',
  project_type: '',
  tshirt_size: '',
  transformation_level: '',
  lob_id: '',
  within_cutoff: false,
};

export function BacklogProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useSearchParams();

  const viewMode: ViewMode =
    (params.get('view') as ViewMode | null) ?? 'ranked';

  const filters: BacklogFilters = useMemo(
    () => ({
      pipeline_stage: params.get('stage') ?? '',
      project_type: params.get('type') ?? '',
      tshirt_size: params.get('size') ?? '',
      transformation_level: params.get('tlevel') ?? '',
      lob_id: params.get('lob') ?? '',
      within_cutoff: params.get('cutoff') === '1',
    }),
    [params],
  );

  const sortField: SortField | null =
    (params.get('sortField') as SortField | null) ?? null;
  const sortDir: SortDir =
    (params.get('sortDir') as SortDir | null) ?? 'asc';

  const hasSortOverride = sortField !== null && sortField !== 'rank';

  const setViewMode = useCallback(
    (v: ViewMode) => {
      setParams((p) => {
        const next = new URLSearchParams(p);
        if (v === 'ranked') next.delete('view');
        else next.set('view', v);
        return next;
      });
    },
    [setParams],
  );

  const setFilter = useCallback(
    <K extends keyof BacklogFilters>(key: K, value: BacklogFilters[K]) => {
      setParams((p) => {
        const next = new URLSearchParams(p);
        const paramKey = keyToParam(key);
        if (
          value === '' ||
          value === false ||
          value === DEFAULT_FILTERS[key]
        ) {
          next.delete(paramKey);
        } else {
          next.set(paramKey, value === true ? '1' : String(value));
        }
        return next;
      });
    },
    [setParams],
  );

  const clearFilters = useCallback(() => {
    setParams((p) => {
      const next = new URLSearchParams(p);
      ['stage', 'type', 'size', 'tlevel', 'lob', 'cutoff'].forEach((k) =>
        next.delete(k),
      );
      return next;
    });
  }, [setParams]);

  const setSort = useCallback(
    (field: SortField) => {
      setParams((p) => {
        const next = new URLSearchParams(p);
        const currentField = p.get('sortField');
        const currentDir = (p.get('sortDir') as SortDir | null) ?? 'asc';
        if (currentField === field) {
          next.set('sortDir', currentDir === 'asc' ? 'desc' : 'asc');
        } else {
          next.set('sortField', field);
          next.set('sortDir', field === 'composite_score' ? 'desc' : 'asc');
        }
        return next;
      });
    },
    [setParams],
  );

  const clearSort = useCallback(() => {
    setParams((p) => {
      const next = new URLSearchParams(p);
      next.delete('sortField');
      next.delete('sortDir');
      return next;
    });
  }, [setParams]);

  const value: BacklogCtx = {
    viewMode,
    filters,
    sortField,
    sortDir,
    setViewMode,
    setFilter,
    clearFilters,
    setSort,
    clearSort,
    hasSortOverride,
  };

  return (
    <BacklogContext.Provider value={value}>{children}</BacklogContext.Provider>
  );
}

export function useBacklog(): BacklogCtx {
  const ctx = useContext(BacklogContext);
  if (!ctx) throw new Error('useBacklog must be used within BacklogProvider');
  return ctx;
}

function keyToParam(key: keyof BacklogFilters): string {
  const map: Record<keyof BacklogFilters, string> = {
    pipeline_stage: 'stage',
    project_type: 'type',
    tshirt_size: 'size',
    transformation_level: 'tlevel',
    lob_id: 'lob',
    within_cutoff: 'cutoff',
  };
  return map[key];
}
