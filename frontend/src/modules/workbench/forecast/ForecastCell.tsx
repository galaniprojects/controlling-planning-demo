/**
 * ForecastCell — single data cell in MixedGranularityGrid.
 *
 * Pure presentational component extracted from MixedGranularityGrid as Wave 2
 * pre-work for v5.1 C-02 / C-08. Displays hours (internal) or currency
 * (external) with optional provisional-dot, comparison-delta indicator, and
 * zone-boundary / year-start / quarterly-zone styling. The parent computes
 * all layout flags and lookups (delta index, display values, boundary
 * detection) and passes them in as props — this component does no derivation
 * beyond mapping temporal context to the three-point stack layout.
 *
 * v5.1 C-08 — three-point cell stack. Each cell can carry baseline + actuals
 * overlays alongside the live forecast value. The component picks the layout
 * based on `temporalContext`:
 *
 *   past    — actuals (primary) / forecast (secondary) / baseline (tertiary)
 *   current — forecast (primary editable) / partial actuals (secondary) / baseline
 *   future  — forecast (primary editable) / baseline (secondary)
 *
 * Quarterly cells follow the future-style layout when no actuals are present
 * and the past-style layout when every constituent month is closed; the
 * `temporalContext` prop is computed by the parent from the cell key vs
 * demo date so this component never needs to date-math.
 */
import { TableCell } from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatCurrencyCompact, formatNumber } from '@/lib/formatters';
import { renderDeltaIndicator as renderDeltaIndicatorHelper } from '@/modules/simulator/lib/cellDiffHelpers';
import type { CellDelta } from '@/types/api';

export interface ForecastCellDisplay {
  hours: number;
  amount: number;
  provisional: boolean;
  // v5.1 C-08 overlays — `null`/`undefined` means the series is absent for
  // this cell and the corresponding line in the stack is omitted.
  baselineHours?: number | null;
  baselineAmount?: number | null;
  actualsHours?: number | null;
  actualsAmount?: number | null;
  actualsPartial?: boolean | null;
}

export type CellTemporalContext = 'past' | 'current' | 'future';

interface ForecastCellProps {
  category: string; // 'internal' | 'external'
  display: ForecastCellDisplay;
  delta?: CellDelta;
  hasChange: boolean;
  yearStart: boolean;
  boundary: boolean;
  isQuarterly: boolean;
  isExpandedSub: boolean;
  /**
   * Temporal context relative to the demo date — drives the three-point
   * layout (which series is primary, partial flag, warm tint). Default
   * 'future' preserves the v4 / C2 single-point fallback when callers have
   * not yet wired temporal context through.
   */
  temporalContext?: CellTemporalContext;
}

function ProvisionalDot() {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            aria-label="Provisional value"
            className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500 dark:bg-amber-400 mr-1 align-middle"
          />
        </TooltipTrigger>
        <TooltipContent side="top">
          <span className="text-xs">
            Provisional value (auto-distributed or pre-populated). Edit to confirm.
          </span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface SeriesValue {
  hours: number | null | undefined;
  amount: number | null | undefined;
}

function isPresent(v: SeriesValue): boolean {
  return (
    (v.amount !== null && v.amount !== undefined) ||
    (v.hours !== null && v.hours !== undefined)
  );
}

function formatSeries(category: string, v: SeriesValue): string {
  if (category === 'internal') {
    const h = v.hours ?? 0;
    return `${formatNumber(h)}h`;
  }
  const a = v.amount ?? 0;
  return formatCurrencyCompact(a);
}

function formatSeriesEur(v: SeriesValue): string {
  return formatCurrencyCompact(v.amount ?? 0);
}

export function ForecastCell({
  category,
  display,
  delta,
  hasChange,
  yearStart,
  boundary,
  isQuarterly,
  isExpandedSub,
  temporalContext = 'future',
}: ForecastCellProps) {
  const forecastSeries: SeriesValue = {
    hours: display.hours,
    amount: display.amount,
  };
  const baselineSeries: SeriesValue = {
    hours: display.baselineHours ?? null,
    amount: display.baselineAmount ?? null,
  };
  const actualsSeries: SeriesValue = {
    hours: display.actualsHours ?? null,
    amount: display.actualsAmount ?? null,
  };

  const hasForecast = isPresent(forecastSeries);
  const hasBaseline = isPresent(baselineSeries);
  const hasActuals = isPresent(actualsSeries);

  // Warm tint: actuals exceed forecast in past months (closed periods).
  // Skipped on the current month because partial actuals aren't directly
  // comparable to the full-month forecast.
  const overrun =
    temporalContext === 'past' &&
    hasActuals &&
    hasForecast &&
    (actualsSeries.amount ?? 0) > (forecastSeries.amount ?? 0);

  const className = [
    'text-right text-xs align-top',
    yearStart ? 'border-l-2 border-border' : '',
    boundary ? 'border-l-4 border-l-blue-400 dark:border-l-blue-500' : '',
    isQuarterly ? 'bg-blue-50/30 dark:bg-blue-900/10' : '',
    isExpandedSub ? 'bg-blue-50/10 dark:bg-blue-900/5' : '',
    hasChange
      ? 'bg-amber-50 dark:bg-amber-900/20 ring-1 ring-amber-300/40 dark:ring-amber-600/30'
      : '',
    overrun ? 'bg-amber-50/50 dark:bg-amber-900/10' : '',
  ]
    .filter(Boolean)
    .join(' ');

  // Single-em-dash short-circuit: every series is zero/absent.
  const allZero =
    forecastSeries.amount === 0 &&
    forecastSeries.hours === 0 &&
    !hasBaseline &&
    !hasActuals;
  if (allZero) {
    return (
      <TableCell className={className}>
        <span className="text-muted-foreground/40">&mdash;</span>
      </TableCell>
    );
  }

  // Decide the layout ordering. Each entry is rendered as a stacked line.
  type Line = {
    key: string;
    series: SeriesValue;
    role: 'primary' | 'secondary' | 'tertiary';
    label?: string;
  };

  const lines: Line[] = [];
  if (temporalContext === 'past') {
    if (hasActuals) {
      lines.push({ key: 'actuals', series: actualsSeries, role: 'primary' });
    } else if (hasForecast) {
      // No actuals available even though month is closed — fall back to
      // forecast as primary (rare: e.g., projects that started post-cutoff).
      lines.push({ key: 'forecast', series: forecastSeries, role: 'primary' });
    }
    if (hasForecast && hasActuals) {
      lines.push({ key: 'forecast', series: forecastSeries, role: 'secondary' });
    }
    if (hasBaseline) {
      lines.push({ key: 'baseline', series: baselineSeries, role: 'tertiary' });
    }
  } else if (temporalContext === 'current') {
    // Forecast always primary (editable). Then partial actuals, then baseline.
    if (hasForecast) {
      lines.push({ key: 'forecast', series: forecastSeries, role: 'primary' });
    }
    if (hasActuals) {
      lines.push({
        key: 'actuals',
        series: actualsSeries,
        role: 'secondary',
        label: display.actualsPartial ? '(partial)' : undefined,
      });
    }
    if (hasBaseline) {
      lines.push({ key: 'baseline', series: baselineSeries, role: 'tertiary' });
    }
  } else {
    // Future: forecast (primary), baseline (secondary). Actuals not expected.
    if (hasForecast) {
      lines.push({ key: 'forecast', series: forecastSeries, role: 'primary' });
    }
    if (hasBaseline) {
      lines.push({ key: 'baseline', series: baselineSeries, role: 'secondary' });
    }
  }

  // No lines emitted (e.g., baseline-only past with no forecast/actuals
  // in the past branch). Render the baseline as primary so the user still
  // sees the planned value.
  if (lines.length === 0) {
    if (hasBaseline) {
      lines.push({ key: 'baseline', series: baselineSeries, role: 'primary' });
    } else {
      return (
        <TableCell className={className}>
          <span className="text-muted-foreground/40">&mdash;</span>
        </TableCell>
      );
    }
  }

  function renderLine(line: Line) {
    const roleClass =
      line.role === 'primary'
        ? 'font-tabular font-medium text-foreground'
        : line.role === 'secondary'
          ? 'font-tabular text-[11px] text-muted-foreground'
          : 'font-tabular text-[10px] text-muted-foreground/80';
    const isItalic = line.key === 'actuals' && display.actualsPartial;
    return (
      <span
        key={`v-${line.key}`}
        className={`${roleClass} ${isItalic ? 'italic' : ''} inline-flex items-center justify-end gap-1`}
      >
        {line.role === 'primary' && display.provisional && line.key === 'forecast' && (
          <ProvisionalDot />
        )}
        <span>{formatSeries(category, line.series)}</span>
        {line.label && (
          <span className="text-[9px] text-muted-foreground/70">{line.label}</span>
        )}
      </span>
    );
  }

  // Internal-resource rows include a euro line directly under each hours
  // line; this preserves the v4 / C2 dual-unit pattern within the stack.
  function renderEurUnderHours(line: Line) {
    if (category !== 'internal') return null;
    const eurClass =
      line.role === 'primary'
        ? 'text-[10px] text-muted-foreground font-tabular'
        : line.role === 'secondary'
          ? 'text-[9px] text-muted-foreground/80 font-tabular'
          : 'text-[9px] text-muted-foreground/60 font-tabular';
    return (
      <span key={`e-${line.key}`} className={eurClass}>
        {formatSeriesEur(line.series)}
      </span>
    );
  }

  return (
    <TableCell className={className}>
      <div className="flex flex-col items-end leading-tight">
        {lines.map((line) => (
          <div key={line.key} className="flex flex-col items-end">
            {renderLine(line)}
            {renderEurUnderHours(line)}
          </div>
        ))}
        {hasChange && renderDeltaIndicatorHelper(delta?.delta ?? null)}
      </div>
    </TableCell>
  );
}
