import { useMemo, useState, useEffect } from 'react';
import {
  Loader2,
  Play,
  BarChart3,
  PaintBucket,
  FunctionSquare,
  Download,
  Save,
  LayoutGrid,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  Table2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/shared/Skeleton';
import { CatalogPanel } from './CatalogPanel';
import { DropZones } from './DropZones';
import { CrossTabTable } from './CrossTabTable';
import { ResultsTable } from './ResultsTable';
import { ConditionalFormatSheet } from './ConditionalFormatSheet';
import { FormatLegend } from './FormatLegend';
import { CalculatedMeasureDialog } from './CalculatedMeasureDialog';
import { ReportBarChart } from './ReportBarChart';
import { ReportLineChart } from './ReportLineChart';
import { ReportPieChart } from './ReportPieChart';
import { useReportBuilder } from './useReportBuilder';
import { isCalculatedMeasure } from './calculatedMeasures';
import {
  buildBarChartData,
  buildLineChartData,
  buildPieChartData,
  canShowLineChart,
  canShowPieChart,
} from './chartTransform';
import type { ChartViewType, MeasureItem } from '@/types/reportBuilder';

export function ReportBuilder() {
  const {
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
  } = useReportBuilder();

  const [isFormatOpen, setIsFormatOpen] = useState(false);
  const [viewType, setViewType] = useState<ChartViewType>('table');
  const [calcDialogOpen, setCalcDialogOpen] = useState(false);
  const [editingCalcMeasure, setEditingCalcMeasure] = useState<MeasureItem | null>(null);

  // Chart availability
  const lineAvailable = canShowLineChart(zones);
  const pieAvailable = canShowPieChart(zones);

  // Auto-fallback if current view becomes unavailable
  useEffect(() => {
    if (viewType === 'line' && !lineAvailable) setViewType('table');
    if (viewType === 'pie' && !pieAvailable) setViewType('table');
  }, [viewType, lineAvailable, pieAvailable]);

  // Build chart data via useMemo (only recompute when results change)
  const barData = useMemo(
    () => (results ? buildBarChartData(results, zones) : null),
    [results, zones],
  );
  const lineData = useMemo(
    () => (results ? buildLineChartData(results, zones) : null),
    [results, zones],
  );
  const pieData = useMemo(
    () => (results ? buildPieChartData(results, zones) : null),
    [results, zones],
  );

  // All measures available as operands in the calculated measure dialog
  const availableMeasuresForCalc = useMemo(() => {
    const catalogMeasures = catalog?.measures ?? [];
    return [...catalogMeasures, ...calculatedMeasures];
  }, [catalog, calculatedMeasures]);

  // First result row for preview
  const previewRow = results?.rows?.[0] ?? null;

  function handleCalcSave(measure: MeasureItem) {
    if (editingCalcMeasure) {
      updateCalculatedMeasure(editingCalcMeasure.id, measure);
    } else {
      addCalculatedMeasure(measure);
    }
    setEditingCalcMeasure(null);
  }

  function handleCalcDelete(measureId: string) {
    removeCalculatedMeasure(measureId);
    setEditingCalcMeasure(null);
  }

  function handleEditCalcMeasure(measureId: string) {
    const m = calculatedMeasures.find((cm) => cm.id === measureId);
    if (m) {
      setEditingCalcMeasure(m);
      setCalcDialogOpen(true);
    }
  }

  function handleDeleteCalcMeasure(measureId: string) {
    removeCalculatedMeasure(measureId);
  }

  if (!catalog) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[500px] w-full" />
      </div>
    );
  }

  const hasAnything =
    zones.rows.length > 0 ||
    zones.columns.length > 0 ||
    zones.filters.length > 0 ||
    zones.values.length > 0;

  // Use cross-tab when there are column dimensions, otherwise flat table
  const useCrossTab = zones.columns.length > 0;

  return (
    <div className="flex h-[calc(100vh-120px)]">
      {/* Left panel — Data Catalog */}
      <CatalogPanel
        catalog={catalog}
        calculatedMeasures={calculatedMeasures}
        findItemZone={findItemZone}
        onAddDimension={addDimensionToZone}
        onAddMeasure={addMeasureToValues}
        onRemoveItem={removeFromZone}
      />

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Drop zones */}
        <div className="flex-shrink-0 p-4 border-b border-border max-h-[40%] overflow-y-auto">
          <DropZones
            zones={zones}
            filterSelections={filterSelections}
            filterOptions={filterOptions}
            onRemove={removeFromZone}
            onMoveDimension={moveDimensionToZone}
            onReorder={reorderInZone}
            onFilterChange={updateFilterSelection}
            onEditCalcMeasure={handleEditCalcMeasure}
            onDeleteCalcMeasure={handleDeleteCalcMeasure}
          />
        </div>

        {/* Toolbar */}
        <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/20">
          <TooltipProvider delayDuration={300}>
            {/* View toggle */}
            <div className="flex items-center rounded-md border border-border">
              <ViewToggleButton
                icon={<Table2 className="h-3.5 w-3.5" />}
                label="Table"
                active={viewType === 'table'}
                onClick={() => setViewType('table')}
              />
              <ViewToggleButton
                icon={<BarChart3 className="h-3.5 w-3.5" />}
                label="Bar"
                active={viewType === 'bar'}
                onClick={() => setViewType('bar')}
                disabled={!barData && !!results}
                disabledTooltip="Bar charts require at least one row dimension"
              />
              <ViewToggleButton
                icon={<LineChartIcon className="h-3.5 w-3.5" />}
                label="Line"
                active={viewType === 'line'}
                onClick={() => setViewType('line')}
                disabled={!lineAvailable}
                disabledTooltip="Line charts require a time dimension on columns"
              />
              <ViewToggleButton
                icon={<PieChartIcon className="h-3.5 w-3.5" />}
                label="Pie"
                active={viewType === 'pie'}
                onClick={() => setViewType('pie')}
                disabled={!pieAvailable}
                disabledTooltip="Pie charts require at least one row dimension"
              />
            </div>

            {/* Active: Conditional Formatting */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={formatRules.length > 0 ? 'secondary' : 'ghost'}
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => setIsFormatOpen(true)}
                >
                  <PaintBucket className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Formatting</span>
                  {formatRules.length > 0 && (
                    <span className="ml-1 rounded-full bg-primary text-primary-foreground px-1.5 py-0 text-[10px] leading-4">
                      {formatRules.length}
                    </span>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Conditional Formatting</TooltipContent>
            </Tooltip>

            {/* Calculated Measures */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={calculatedMeasures.length > 0 ? 'secondary' : 'ghost'}
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => {
                    setEditingCalcMeasure(null);
                    setCalcDialogOpen(true);
                  }}
                >
                  <FunctionSquare className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Calculated</span>
                  {calculatedMeasures.length > 0 && (
                    <span className="ml-1 rounded-full bg-primary text-primary-foreground px-1.5 py-0 text-[10px] leading-4">
                      {calculatedMeasures.length}
                    </span>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Create calculated measure</TooltipContent>
            </Tooltip>

            <div className="flex-1" />

            <PlaceholderButton icon={<Download className="h-3.5 w-3.5" />} label="Export" tooltip="Coming in Session 4" />
            <PlaceholderButton icon={<Save className="h-3.5 w-3.5" />} label="Save Report" tooltip="Coming in Session 4" />

            {/* Run Report button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    onClick={runReport}
                    disabled={!canRun || isLoading}
                    size="sm"
                    className={`gap-1.5 ${isStale && canRun && !isLoading ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : ''}`}
                  >
                    {isLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                    Run Report
                  </Button>
                </span>
              </TooltipTrigger>
              {!canRun && (
                <TooltipContent>Add at least one measure to the Values zone</TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Results area */}
        <div className="flex-1 min-h-0 overflow-auto p-4">
          {isLoading && !results && (
            <div className="space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-3/4" />
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {!isLoading && !error && results && (
            <>
              {viewType === 'table' && (
                <>
                  {useCrossTab ? (
                    <CrossTabTable
                      results={results}
                      rowDims={zones.rows}
                      colDims={zones.columns}
                      measures={zones.values}
                      isStale={isStale}
                      formatRules={formatRules}
                    />
                  ) : (
                    <ResultsTable
                      results={results}
                      isStale={isStale}
                      formatRules={formatRules}
                      rowDims={zones.rows}
                      measures={zones.values}
                    />
                  )}
                  <FormatLegend rules={formatRules} measures={zones.values} />
                </>
              )}

              {viewType === 'bar' && barData && (
                <div className={isStale ? 'opacity-50' : ''}>
                  <ReportBarChart data={barData} />
                </div>
              )}

              {viewType === 'line' && lineData && (
                <div className={isStale ? 'opacity-50' : ''}>
                  <ReportLineChart data={lineData} />
                </div>
              )}

              {viewType === 'pie' && pieData && (
                <div className={isStale ? 'opacity-50' : ''}>
                  <ReportPieChart data={pieData} />
                </div>
              )}

              {/* Fallback: chart view selected but no data for it */}
              {viewType !== 'table' &&
                ((viewType === 'bar' && !barData) ||
                  (viewType === 'line' && !lineData) ||
                  (viewType === 'pie' && !pieData)) && (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <p className="text-sm">Not enough data for this chart type.</p>
                    <p className="text-xs mt-1">Try adding dimensions to the Rows or Columns zones.</p>
                  </div>
                )}
            </>
          )}

          {!isLoading && !error && !results && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <LayoutGrid className="h-12 w-12 mb-4 opacity-30" />
              {hasAnything ? (
                <>
                  <p className="text-sm font-medium">Ready to run</p>
                  <p className="text-xs mt-1">
                    {canRun
                      ? 'Click "Run Report" to generate your report'
                      : 'Add at least one measure to the Values zone, then click "Run Report"'}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">Build your report</p>
                  <p className="text-xs mt-1">
                    Click dimensions and measures from the catalog on the left to start building your report
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Conditional Formatting Sheet */}
      <ConditionalFormatSheet
        open={isFormatOpen}
        onOpenChange={setIsFormatOpen}
        measures={zones.values}
        rules={formatRules}
        onAddRule={addFormatRule}
        onRemoveRule={removeFormatRule}
        onUpdateRule={updateFormatRule}
        onApplyPreset={applyPreset}
        onClearAll={clearFormatRules}
      />

      {/* Calculated Measure Dialog */}
      <CalculatedMeasureDialog
        open={calcDialogOpen}
        onOpenChange={setCalcDialogOpen}
        availableMeasures={availableMeasuresForCalc}
        allCalcMeasures={calculatedMeasures}
        editingMeasure={editingCalcMeasure}
        previewRow={previewRow}
        onSave={handleCalcSave}
        onDelete={handleCalcDelete}
      />
    </div>
  );
}

function ViewToggleButton({
  icon,
  label,
  active,
  onClick,
  disabled,
  disabledTooltip,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  disabledTooltip?: string;
}) {
  const btn = (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`flex items-center gap-1 px-2.5 py-1.5 text-xs transition-colors ${
        active
          ? 'bg-primary text-primary-foreground'
          : disabled
            ? 'text-muted-foreground/40 cursor-not-allowed'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      }`}
    >
      {icon}
      <span className="hidden lg:inline">{label}</span>
    </button>
  );

  if (disabled && disabledTooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span>{btn}</span>
        </TooltipTrigger>
        <TooltipContent>{disabledTooltip}</TooltipContent>
      </Tooltip>
    );
  }

  return btn;
}

function PlaceholderButton({ icon, label, tooltip }: { icon: React.ReactNode; label: string; tooltip?: string }) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="sm" disabled className="gap-1.5 text-xs opacity-50">
            {icon}
            <span className="hidden sm:inline">{label}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>{tooltip ?? 'Coming in a future session'}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
