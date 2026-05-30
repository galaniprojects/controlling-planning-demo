/**
 * BacklogContext — filter/sort/view-mode/scroll state, persisted to URL params.
 * [A-BK-21..24]
 *
 * v5 B2 [B-OQ-02]: an optional `scenarioVersion` is exposed on the context
 * so embedded backlog views (`BacklogSandboxSurface` in the simulator
 * workspace) can render a scenario fork instead of the live ranking.
 * `BacklogProvider` continues to default to the URL-driven live view —
 * the sandbox path uses `SandboxBacklogProvider` which forces in-memory
 * state instead of `useSearchParams` so workspace URLs don't get polluted
 * with backlog filter/sort params.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
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
  /**
   * Fiscal year the ranked pool + cutoff walk is scoped to (VIPER §4.1/§4.2).
   * Server-side: re-scopes the envelope. Defaults to the demo FY "2026"
   * (DEMO_DATE April 2026) so the page opens on the current planning year.
   */
  start_year: string;
  /** Client-side filters */
  transformation_level: string;
  lob_id: string;
  within_cutoff: boolean;
}

/**
 * Demo fiscal year — the current planning year per DEMO_DATE (April 2026).
 * Used as the default `start_year` so the backlog opens scoped to FY2026.
 */
export const DEFAULT_BACKLOG_START_YEAR = '2026';

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
  /**
   * v5 B2 [B-OQ-02] sandbox version sentinel (e.g. `'scenario-12'`). Set
   * by `SandboxBacklogProvider`; `undefined` for the live `BacklogProvider`.
   * Consumed by data hooks to forward the version to backlog API calls.
   */
  scenarioVersion?: string;
}

const BacklogContext = createContext<BacklogCtx | null>(null);

const DEFAULT_FILTERS: BacklogFilters = {
  pipeline_stage: '',
  project_type: '',
  tshirt_size: '',
  start_year: DEFAULT_BACKLOG_START_YEAR,
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
      start_year: params.get('year') ?? DEFAULT_BACKLOG_START_YEAR,
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
      ['stage', 'type', 'size', 'year', 'tlevel', 'lob', 'cutoff'].forEach((k) =>
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
    start_year: 'year',
    transformation_level: 'tlevel',
    lob_id: 'lob',
    within_cutoff: 'cutoff',
  };
  return map[key];
}

// ---------------------------------------------------------------------------
// v5 B2 [B-OQ-02] — Sandbox provider for the simulator BacklogSandboxSurface.
// ---------------------------------------------------------------------------
//
// The live BacklogProvider persists state via `useSearchParams`, which is
// great for `/backlog` but pollutes the simulator workspace URL when the
// backlog view is mounted inside `BacklogSandboxSurface`. The sandbox
// provider keeps the same context shape but stores filter/sort/view-mode
// state in plain `useState` and accepts a `scenarioVersion` so data hooks
// can fork their fetch path to the scenario sandbox.
//
// Consumers may continue to call `useBacklog()` regardless of which
// provider wraps them — the context shape is unified.

interface SandboxProviderProps {
  scenarioVersion: string;
  children: ReactNode;
}

export function SandboxBacklogProvider({
  scenarioVersion,
  children,
}: SandboxProviderProps) {
  const [viewMode, setViewModeState] = useState<ViewMode>('ranked');
  const [filters, setFiltersState] = useState<BacklogFilters>(DEFAULT_FILTERS);
  const [sortField, setSortFieldState] = useState<SortField | null>(null);
  const [sortDir, setSortDirState] = useState<SortDir>('asc');

  const hasSortOverride = sortField !== null && sortField !== 'rank';

  const setViewMode = useCallback((v: ViewMode) => setViewModeState(v), []);

  const setFilter = useCallback(
    <K extends keyof BacklogFilters>(key: K, value: BacklogFilters[K]) => {
      setFiltersState((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const clearFilters = useCallback(() => setFiltersState(DEFAULT_FILTERS), []);

  const setSort = useCallback((field: SortField) => {
    setSortFieldState((curField) => {
      if (curField === field) {
        setSortDirState((curDir) => (curDir === 'asc' ? 'desc' : 'asc'));
        return curField;
      }
      setSortDirState(field === 'composite_score' ? 'desc' : 'asc');
      return field;
    });
  }, []);

  const clearSort = useCallback(() => {
    setSortFieldState(null);
    setSortDirState('asc');
  }, []);

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
    scenarioVersion,
  };

  return (
    <BacklogContext.Provider value={value}>{children}</BacklogContext.Provider>
  );
}
