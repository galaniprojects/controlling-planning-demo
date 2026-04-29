/**
 * useForecastVersions — manages forecast version state for the F&P tab.
 *
 * Loads the version list for a project, lets the user pick one version as
 * the "compare-from" anchor, and optionally fetches the diff between that
 * version and the current (latest) forecast for cell-level delta overlay
 * per [C-VC-03].
 *
 * Cluster C / Session C2 — frontend.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { workbenchApi } from '@/api/endpoints';
import type {
  CellDelta,
  ForecastVersionDiff,
  ForecastVersionMeta,
} from '@/types/api';

interface UseForecastVersionsResult {
  versions: ForecastVersionMeta[];
  loading: boolean;
  error: string | null;
  /** The user-selected baseline version for comparison with the live grid. */
  compareVersionId: number | null;
  setCompareVersionId: (id: number | null) => void;
  /** Diff between selected version and the latest version for delta overlay. */
  diff: ForecastVersionDiff | null;
  diffLoading: boolean;
  /** Map: `${category}|${sub_category}|${cell_key}` → CellDelta for fast lookup. */
  deltaIndex: Map<string, CellDelta>;
  reload: () => void;
  /** Convenience: most recent (highest version_number) entry. */
  latestVersion: ForecastVersionMeta | null;
}

export function useForecastVersions(projectId: string): UseForecastVersionsResult {
  const [versions, setVersions] = useState<ForecastVersionMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [compareVersionId, setCompareVersionId] = useState<number | null>(null);
  const [diff, setDiff] = useState<ForecastVersionDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [reloadCounter, setReloadCounter] = useState(0);

  // Reset comparison state on project switch
  useEffect(() => {
    setCompareVersionId(null);
    setDiff(null);
  }, [projectId]);

  // Load versions
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    workbenchApi
      .listForecastVersions(projectId, { limit: 100 })
      .then((res) => {
        if (cancelled) return;
        setVersions(res.items);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load versions');
        setVersions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, reloadCounter]);

  // The latest captured snapshot — versions are returned newest-first.
  const latestVersion = versions.length > 0 ? versions[0] : null;

  // Diff: selected (older) version_a → latest version_b. The current live
  // forecast diverges from latest only if there have been edits since the
  // last snapshot. For demo purposes, comparing against the latest captured
  // version surfaces the deltas the user expects to see in the overlay
  // per the merged C1 facts (Q1 → Q2 ×1.05 uplift cells).
  useEffect(() => {
    if (compareVersionId === null || latestVersion === null) {
      setDiff(null);
      return;
    }
    if (compareVersionId === latestVersion.id) {
      setDiff(null);
      return;
    }
    let cancelled = false;
    setDiffLoading(true);
    workbenchApi
      .getForecastVersionDiff(compareVersionId, latestVersion.id)
      .then((res) => {
        if (cancelled) return;
        setDiff(res);
      })
      .catch(() => {
        if (cancelled) return;
        setDiff(null);
      })
      .finally(() => {
        if (!cancelled) setDiffLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [compareVersionId, latestVersion]);

  const deltaIndex = useMemo(() => {
    const map = new Map<string, CellDelta>();
    if (!diff) return map;
    for (const d of diff.line_deltas) {
      map.set(`${d.category}|${d.sub_category}|${d.cell_key}`, d);
    }
    return map;
  }, [diff]);

  const reload = useCallback(() => {
    setReloadCounter((n) => n + 1);
  }, []);

  return {
    versions,
    loading,
    error,
    compareVersionId,
    setCompareVersionId,
    diff,
    diffLoading,
    deltaIndex,
    reload,
    latestVersion,
  };
}
