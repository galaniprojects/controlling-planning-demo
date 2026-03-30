import { useState } from 'react';
import { Loader2, Play, BarChart3, PaintBucket, FunctionSquare, Download, Save, LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/shared/Skeleton';
import { CatalogPanel } from './CatalogPanel';
import { DropZones } from './DropZones';
import { CrossTabTable } from './CrossTabTable';
import { ResultsTable } from './ResultsTable';
import { ConditionalFormatSheet } from './ConditionalFormatSheet';
import { FormatLegend } from './FormatLegend';
import { useReportBuilder } from './useReportBuilder';

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
  } = useReportBuilder();

  const [isFormatOpen, setIsFormatOpen] = useState(false);

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
          />
        </div>

        {/* Toolbar */}
        <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/20">
          <TooltipProvider delayDuration={300}>
            {/* Placeholder buttons */}
            <PlaceholderButton icon={<BarChart3 className="h-3.5 w-3.5" />} label="Chart Views" tooltip="Coming in Session 3" />

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

            <PlaceholderButton icon={<FunctionSquare className="h-3.5 w-3.5" />} label="Calculated Measures" tooltip="Coming in Session 3" />

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
    </div>
  );
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
