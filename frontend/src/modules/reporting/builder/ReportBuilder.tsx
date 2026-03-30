import { Loader2, Play, BarChart3, PaintBucket, FunctionSquare, Download, Save, LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/shared/Skeleton';
import { CatalogPanel } from './CatalogPanel';
import { DropZones } from './DropZones';
import { ResultsTable } from './ResultsTable';
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
    addDimensionToZone,
    addMeasureToValues,
    removeFromZone,
    moveDimensionToZone,
    reorderInZone,
    updateFilterSelection,
    findItemZone,
    runReport,
  } = useReportBuilder();

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
        <div className="flex-shrink-0 p-4 border-b border-border">
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
            <PlaceholderButton icon={<BarChart3 className="h-3.5 w-3.5" />} label="Chart Views" />
            <PlaceholderButton icon={<PaintBucket className="h-3.5 w-3.5" />} label="Conditional Formatting" />
            <PlaceholderButton icon={<FunctionSquare className="h-3.5 w-3.5" />} label="Calculated Measures" />

            <div className="flex-1" />

            <PlaceholderButton icon={<Download className="h-3.5 w-3.5" />} label="Export" />
            <PlaceholderButton icon={<Save className="h-3.5 w-3.5" />} label="Save Report" />

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
        <div className="flex-1 overflow-auto p-4">
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
            <ResultsTable results={results} isStale={isStale} />
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
    </div>
  );
}

function PlaceholderButton({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="sm" disabled className="gap-1.5 text-xs opacity-50">
            {icon}
            <span className="hidden sm:inline">{label}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Coming in a future session</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
