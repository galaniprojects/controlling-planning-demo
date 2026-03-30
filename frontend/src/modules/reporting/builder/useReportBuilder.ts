import { useCallback, useEffect, useRef, useState } from 'react';
import { reportBuilderApi } from '@/api/endpoints';
import type {
  CatalogResponse,
  ChartViewType,
  ColumnMeta,
  ConditionalFormatRule,
  DimensionItem,
  FormatPresetId,
  MeasureItem,
  ReportDefinition,
  ReportExecuteResponse,
  ZoneName,
} from '@/types/reportBuilder';
import { generateRuleId, getPresetRules } from './conditionalFormat';
import {
  computeCalculatedValues,
  getRequiredBaseMeasures,
  isCalculatedMeasure,
} from './calculatedMeasures';

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
  const [formatRules, setFormatRules] = useState<ConditionalFormatRule[]>([]);
  const [calculatedMeasures, setCalculatedMeasures] = useState<MeasureItem[]>([]);
  const hasRun = useRef(false);

  // Save / Load state
  const [savedReportId, setSavedReportId] = useState<number | null>(null);
  const [savedReportName, setSavedReportName] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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

  // Conditional formatting handlers
  const addFormatRule = useCallback(
    (rule: Omit<ConditionalFormatRule, 'id'>) => {
      setFormatRules((prev) => [...prev, { ...rule, id: generateRuleId() }]);
    },
    [],
  );

  const removeFormatRule = useCallback((ruleId: string) => {
    setFormatRules((prev) => prev.filter((r) => r.id !== ruleId));
  }, []);

  const updateFormatRule = useCallback(
    (ruleId: string, updates: Partial<ConditionalFormatRule>) => {
      setFormatRules((prev) =>
        prev.map((r) => (r.id === ruleId ? { ...r, ...updates } : r)),
      );
    },
    [],
  );

  const applyPreset = useCallback((presetId: FormatPresetId) => {
    const rules = getPresetRules(presetId);
    setFormatRules((prev) => {
      // Remove existing rules for the preset's measure, then add preset rules
      const measureId = rules[0]?.measureId;
      if (!measureId) return prev;
      const filtered = prev.filter((r) => r.measureId !== measureId);
      return [...filtered, ...rules];
    });
  }, []);

  const clearFormatRules = useCallback(() => {
    setFormatRules([]);
  }, []);

  // Calculated measure handlers
  const addCalculatedMeasure = useCallback((measure: MeasureItem) => {
    setCalculatedMeasures((prev) => [...prev, measure]);
    // Also add to values zone
    setZones((prev) => {
      if (prev.values.some((m) => m.id === measure.id)) return prev;
      return { ...prev, values: [...prev.values, measure] };
    });
  }, []);

  const updateCalculatedMeasure = useCallback((id: string, measure: MeasureItem) => {
    setCalculatedMeasures((prev) => prev.map((m) => (m.id === id ? measure : m)));
    setZones((prev) => ({
      ...prev,
      values: prev.values.map((m) => (m.id === id ? measure : m)),
    }));
  }, []);

  const removeCalculatedMeasure = useCallback((id: string) => {
    // Also remove any calc measures that depend on this one
    setCalculatedMeasures((prev) => {
      const dependents = prev.filter(
        (m) => m.calculated && (m.calculated.operandA === id || m.calculated.operandB === id),
      );
      const removeIds = new Set([id, ...dependents.map((d) => d.id)]);
      return prev.filter((m) => !removeIds.has(m.id));
    });
    setZones((prev) => {
      const calcToRemove = calculatedMeasures.filter(
        (m) => m.calculated && (m.calculated.operandA === id || m.calculated.operandB === id),
      );
      const removeIds = new Set([id, ...calcToRemove.map((d) => d.id)]);
      return {
        ...prev,
        values: prev.values.filter((m) => !removeIds.has(m.id)),
      };
    });
  }, [calculatedMeasures]);

  // Run report
  const runReport = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Collect catalog (non-calculated) measure IDs to send to the backend.
      // Include operands of calculated measures even if not explicitly in Values.
      const calcInValues = zones.values.filter(isCalculatedMeasure);
      const catalogValueIds = zones.values.filter((m) => !isCalculatedMeasure(m)).map((m) => m.id);
      const requiredBaseIds = getRequiredBaseMeasures(calcInValues);
      const allValueIds = [...new Set([...catalogValueIds, ...requiredBaseIds])];

      const res = await reportBuilderApi.execute({
        rows: zones.rows.map((d) => d.id),
        columns: zones.columns.map((d) => d.id),
        filters: Object.fromEntries(
          Object.entries(filterSelections).filter(([, v]) => v.length > 0),
        ),
        values: allValueIds,
      });

      // Compute calculated measure values client-side
      if (calcInValues.length > 0) {
        computeCalculatedValues(res.rows, calcInValues);
        // Add column metadata for calculated measures
        for (const cm of calcInValues) {
          res.columns.push({
            id: cm.id,
            name: cm.display_name,
            type: 'measure',
            format: cm.format,
          } as ColumnMeta);
        }
        // Remove implicit operand columns that were fetched but not in the user's values zone
        const userValueIds = new Set(zones.values.map((m) => m.id));
        res.columns = res.columns.filter(
          (col) => col.type === 'dimension' || userValueIds.has(col.id),
        );
      }

      setResults(res);
      setIsStale(false);
      hasRun.current = true;
    } catch (e: unknown) {
      setError('Something went wrong. Please try a different combination or contact support.');
    } finally {
      setIsLoading(false);
    }
  }, [zones, filterSelections]);

  // Build the full report definition for saving
  const getDefinition = useCallback(
    (viewMode: ChartViewType): ReportDefinition => ({
      rows: zones.rows.map((d) => d.id),
      columns: zones.columns.map((d) => d.id),
      filters: filterSelections,
      values: zones.values.map((m) => m.id),
      calculatedMeasures,
      formatRules,
      viewMode,
    }),
    [zones, filterSelections, calculatedMeasures, formatRules],
  );

  // Save report (first save)
  const saveReport = useCallback(
    async (name: string, description: string | undefined, viewMode: ChartViewType) => {
      setIsSaving(true);
      try {
        const definition = getDefinition(viewMode);
        const res = await reportBuilderApi.createSaved({ name, description, definition });
        setSavedReportId(res.id);
        setSavedReportName(res.name);
        return res;
      } finally {
        setIsSaving(false);
      }
    },
    [getDefinition],
  );

  // Update existing saved report
  const updateReport = useCallback(
    async (viewMode: ChartViewType) => {
      if (!savedReportId) return;
      setIsSaving(true);
      try {
        const definition = getDefinition(viewMode);
        await reportBuilderApi.updateSaved(savedReportId, { definition });
      } finally {
        setIsSaving(false);
      }
    },
    [savedReportId, getDefinition],
  );

  // Save As (create copy)
  const saveAsReport = useCallback(
    async (name: string, description: string | undefined, viewMode: ChartViewType) => {
      setIsSaving(true);
      try {
        const definition = getDefinition(viewMode);
        const res = await reportBuilderApi.createSaved({ name, description, definition });
        setSavedReportId(res.id);
        setSavedReportName(res.name);
        return res;
      } finally {
        setIsSaving(false);
      }
    },
    [getDefinition],
  );

  // Load a saved report definition into the builder
  const loadReport = useCallback(
    (def: ReportDefinition, id: number, name: string, catalogData: CatalogResponse) => {
      // Restore zones from IDs using catalog data
      const dimMap = new Map(catalogData.dimensions.map((d) => [d.id, d]));
      const measureMap = new Map(catalogData.measures.map((m) => [m.id, m]));

      const rows = def.rows.map((id) => dimMap.get(id)).filter(Boolean) as DimensionItem[];
      const columns = def.columns.map((id) => dimMap.get(id)).filter(Boolean) as DimensionItem[];
      const filters = Object.keys(def.filters)
        .map((id) => dimMap.get(id))
        .filter(Boolean) as DimensionItem[];
      const values: MeasureItem[] = def.values
        .map((id) => {
          // Check if it's a calculated measure from the definition
          const calc = def.calculatedMeasures.find((cm) => cm.id === id);
          if (calc) return calc;
          return measureMap.get(id);
        })
        .filter(Boolean) as MeasureItem[];

      setZones({ rows, columns, filters, values });
      setFilterSelections(def.filters);
      setCalculatedMeasures(def.calculatedMeasures || []);
      setFormatRules(def.formatRules || []);
      setSavedReportId(id);
      setSavedReportName(name);

      // Load filter options for all filter dimensions
      for (const dim of filters) {
        loadFilterValues(dim.id);
      }

      // Reset run state so auto-run triggers fresh
      hasRun.current = false;
      setResults(null);
      setIsStale(false);
      setError(null);
    },
    [loadFilterValues],
  );

  // Clear / reset to new report
  const clearReport = useCallback(() => {
    setZones({ rows: [], columns: [], filters: [], values: [] });
    setFilterSelections({});
    setFilterOptions({});
    setResults(null);
    setIsLoading(false);
    setIsStale(false);
    setError(null);
    setFormatRules([]);
    setCalculatedMeasures([]);
    setSavedReportId(null);
    setSavedReportName(null);
    hasRun.current = false;
  }, []);

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
    formatRules,
    calculatedMeasures,
    addDimensionToZone,
    addMeasureToValues,
    removeFromZone,
    moveDimensionToZone,
    reorderInZone,
    updateFilterSelection,
    findItemZone,
    runReport,
    addFormatRule,
    removeFormatRule,
    updateFormatRule,
    applyPreset,
    clearFormatRules,
    addCalculatedMeasure,
    updateCalculatedMeasure,
    removeCalculatedMeasure,
    // Save / Load
    savedReportId,
    savedReportName,
    isSaving,
    saveReport,
    updateReport,
    saveAsReport,
    loadReport,
    clearReport,
    getDefinition,
  };
}
