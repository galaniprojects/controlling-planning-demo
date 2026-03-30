import { useCallback, useEffect, useRef, useState } from 'react';
import { reportBuilderApi } from '@/api/endpoints';
import type {
  CatalogResponse,
  DimensionItem,
  MeasureItem,
  ReportExecuteResponse,
  ZoneName,
} from '@/types/reportBuilder';

export interface ZoneState {
  rows: DimensionItem[];
  columns: DimensionItem[];
  filters: DimensionItem[];
  values: MeasureItem[];
}

export interface FilterSelections {
  [dimensionId: string]: string[];
}

export function useReportBuilder() {
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [zones, setZones] = useState<ZoneState>({
    rows: [],
    columns: [],
    filters: [],
    values: [],
  });
  const [filterSelections, setFilterSelections] = useState<FilterSelections>({});
  const [filterOptions, setFilterOptions] = useState<Record<string, string[]>>({});
  const [results, setResults] = useState<ReportExecuteResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasRun = useRef(false);

  // Load catalog on mount
  useEffect(() => {
    reportBuilderApi.getCatalog().then(setCatalog).catch(() => {});
  }, []);

  // Mark results stale when zones or filter selections change after a run
  useEffect(() => {
    if (hasRun.current) {
      setIsStale(true);
    }
  }, [zones, filterSelections]);

  // Fetch filter values when a dimension is added to the Filters zone
  const loadFilterValues = useCallback(async (dimensionId: string) => {
    try {
      const res = await reportBuilderApi.getFilterValues(dimensionId);
      setFilterOptions((prev) => ({ ...prev, [dimensionId]: res.values }));
    } catch {
      // silent fail
    }
  }, []);

  // Find which zone an item is in
  const findItemZone = useCallback(
    (itemId: string): ZoneName | null => {
      if (zones.rows.some((d) => d.id === itemId)) return 'rows';
      if (zones.columns.some((d) => d.id === itemId)) return 'columns';
      if (zones.filters.some((d) => d.id === itemId)) return 'filters';
      if (zones.values.some((m) => m.id === itemId)) return 'values';
      return null;
    },
    [zones],
  );

  // Add a dimension to a zone
  const addDimensionToZone = useCallback(
    (dim: DimensionItem, zone: 'rows' | 'columns' | 'filters') => {
      // Remove from any existing zone first
      setZones((prev) => {
        const cleaned = {
          rows: prev.rows.filter((d) => d.id !== dim.id),
          columns: prev.columns.filter((d) => d.id !== dim.id),
          filters: prev.filters.filter((d) => d.id !== dim.id),
          values: prev.values,
        };
        return { ...cleaned, [zone]: [...cleaned[zone], dim] };
      });
      if (zone === 'filters') {
        loadFilterValues(dim.id);
      }
    },
    [loadFilterValues],
  );

  // Add a measure to Values
  const addMeasureToValues = useCallback((measure: MeasureItem) => {
    setZones((prev) => {
      if (prev.values.some((m) => m.id === measure.id)) return prev;
      return { ...prev, values: [...prev.values, measure] };
    });
  }, []);

  // Remove an item from its zone
  const removeFromZone = useCallback((itemId: string) => {
    setZones((prev) => ({
      rows: prev.rows.filter((d) => d.id !== itemId),
      columns: prev.columns.filter((d) => d.id !== itemId),
      filters: prev.filters.filter((d) => d.id !== itemId),
      values: prev.values.filter((m) => m.id !== itemId),
    }));
    setFilterSelections((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    setFilterOptions((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  }, []);

  // Move a dimension between zones
  const moveDimensionToZone = useCallback(
    (dimId: string, targetZone: 'rows' | 'columns' | 'filters') => {
      const dim =
        zones.rows.find((d) => d.id === dimId) ||
        zones.columns.find((d) => d.id === dimId) ||
        zones.filters.find((d) => d.id === dimId);
      if (dim) {
        addDimensionToZone(dim, targetZone);
      }
    },
    [zones, addDimensionToZone],
  );

  // Reorder within a zone
  const reorderInZone = useCallback(
    (zone: ZoneName, itemId: string, direction: 'up' | 'down') => {
      setZones((prev) => {
        const arr = [...(prev[zone] as (DimensionItem | MeasureItem)[])];
        const idx = arr.findIndex((item) => item.id === itemId);
        if (idx < 0) return prev;
        const newIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (newIdx < 0 || newIdx >= arr.length) return prev;
        [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
        return { ...prev, [zone]: arr };
      });
    },
    [],
  );

  // Update filter selections
  const updateFilterSelection = useCallback(
    (dimensionId: string, selectedValues: string[]) => {
      setFilterSelections((prev) => ({ ...prev, [dimensionId]: selectedValues }));
    },
    [],
  );

  // Run report
  const runReport = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await reportBuilderApi.execute({
        rows: zones.rows.map((d) => d.id),
        columns: zones.columns.map((d) => d.id),
        filters: Object.fromEntries(
          Object.entries(filterSelections).filter(([, v]) => v.length > 0),
        ),
        values: zones.values.map((m) => m.id),
      });
      setResults(res);
      setIsStale(false);
      hasRun.current = true;
    } catch (e: unknown) {
      setError('Something went wrong. Please try a different combination or contact support.');
    } finally {
      setIsLoading(false);
    }
  }, [zones, filterSelections]);

  const canRun = zones.values.length > 0;

  return {
    catalog,
    zones,
    filterSelections,
    filterOptions,
    results,
    isLoading,
    isStale,
    error,
    canRun,
    addDimensionToZone,
    addMeasureToValues,
    removeFromZone,
    moveDimensionToZone,
    reorderInZone,
    updateFilterSelection,
    findItemZone,
    runReport,
  };
}
