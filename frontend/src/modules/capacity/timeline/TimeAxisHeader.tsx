/**
 * TimeAxisHeader — v5.2 W3 Track A (spec §4.2 + §4.3).
 *
 * Two-row sticky header that sits above the timeline rows:
 *
 *   Row 1 (year/quarter/year-summary labels with chevrons):
 *     ▶ 2025  │ Q1 │ ▼ Q2 2026 │ Q3 │ Q4 │ ▶ 2027 │ ▶ 2028 │
 *   Row 2 (month labels under expanded quarters):
 *           │    │ Apr │ May │ Jun │    │    │       │
 *
 * Click rules (§4.3):
 *   - Click a year-summary cell  → toggle the year (collapsed ⇄ all-quarter view).
 *   - Click a quarter label      → toggle that quarter (collapsed ⇄ months).
 *
 * Width rules: month 42px, quarter 48px, year 48px (§4.6).
 *
 * Header coordinates with `PersonTimelineRow` / `RoleGroup` / `FlatPersonRow`
 * via the same `TimeColumn[]` array — the parent computes it once via
 * `buildVisibleColumns(state, months)` and threads it through.
 */
import { Fragment } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  type Quarter,
  type TimeColumn,
  NAME_COLUMN_WIDTH,
  quarterLabel,
  shortMonthLabel,
} from './timeAxis';

interface TimeAxisHeaderProps {
  columns: readonly TimeColumn[];
  onToggleYear: (year: number) => void;
  onToggleQuarter: (year: number, quarter: Quarter) => void;
}

/**
 * Single chevron-prefixed clickable header cell. The `expanded` prop
 * picks the chevron orientation (▶ collapsed / ▼ expanded).
 */
function HeaderCell({
  label,
  expanded,
  width,
  onClick,
  emphasis = 'normal',
  ariaLabel,
}: {
  label: string;
  expanded: boolean;
  width: number;
  onClick: () => void;
  emphasis?: 'normal' | 'strong';
  ariaLabel?: string;
}) {
  const Icon = expanded ? ChevronDown : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel ?? label}
      aria-expanded={expanded}
      className={cn(
        'flex h-full items-center justify-center gap-0.5 border-b border-border',
        'text-[11px] font-medium text-muted-foreground',
        'transition-colors hover:bg-accent hover:text-accent-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        emphasis === 'strong' && 'bg-muted/50 font-semibold',
      )}
      style={{ width }}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

/**
 * Spacer cell rendered in the second header row when the column above
 * is a quarter or year cell — i.e. nothing to label at month level.
 */
function HeaderSpacer({ width }: { width: number }) {
  return (
    <div
      className="border-b border-border bg-card"
      style={{ width }}
      aria-hidden="true"
    />
  );
}

export function TimeAxisHeader({
  columns,
  onToggleYear,
  onToggleQuarter,
}: TimeAxisHeaderProps) {
  // ---------------------------------------------------------------------
  // Row 1: chunk consecutive `month` columns belonging to the same
  // (year, quarter) into one expanded-quarter banner so the chevron
  // controls the entire span at once.
  // ---------------------------------------------------------------------
  type Row1Cell =
    | { kind: 'year'; year: number; width: number }
    | { kind: 'quarter-collapsed'; year: number; quarter: Quarter; width: number }
    | {
        kind: 'quarter-expanded';
        year: number;
        quarter: Quarter;
        width: number;
        // Track the month columns for row-2 alignment.
        monthColumns: TimeColumn[];
      };

  const row1: Row1Cell[] = [];
  let i = 0;
  while (i < columns.length) {
    const c = columns[i];
    if (c.type === 'year') {
      row1.push({ kind: 'year', year: c.year, width: c.width });
      i++;
    } else if (c.type === 'quarter') {
      row1.push({
        kind: 'quarter-collapsed',
        year: c.year,
        quarter: c.quarter,
        width: c.width,
      });
      i++;
    } else {
      // Coalesce consecutive month columns with the same (year, quarter).
      const startYear = c.year;
      const startQuarter = c.quarter;
      let totalWidth = 0;
      const monthColumns: TimeColumn[] = [];
      while (
        i < columns.length &&
        columns[i].type === 'month' &&
        columns[i].year === startYear &&
        // narrow to month variant
        (columns[i] as Extract<TimeColumn, { type: 'month' }>).quarter === startQuarter
      ) {
        const mc = columns[i];
        totalWidth += mc.width;
        monthColumns.push(mc);
        i++;
      }
      row1.push({
        kind: 'quarter-expanded',
        year: startYear,
        quarter: startQuarter,
        width: totalWidth,
        monthColumns,
      });
    }
  }

  return (
    <div className="sticky top-0 z-10 bg-card">
      {/* Row 1 — year / quarter / expanded-quarter banners */}
      <div className="flex h-7">
        {/* Sticky-left name spacer matches NAME_COLUMN_WIDTH below */}
        <div
          className="sticky left-0 z-20 border-b border-r border-border bg-card"
          style={{ width: NAME_COLUMN_WIDTH }}
          aria-hidden="true"
        />
        {row1.map((cell) => {
          if (cell.kind === 'year') {
            return (
              <HeaderCell
                key={`yr-${cell.year}`}
                label={String(cell.year)}
                expanded={false}
                width={cell.width}
                emphasis="strong"
                onClick={() => onToggleYear(cell.year)}
                ariaLabel={`Expand year ${cell.year}`}
              />
            );
          }
          if (cell.kind === 'quarter-collapsed') {
            return (
              <HeaderCell
                key={`qc-${cell.year}-${cell.quarter}`}
                label={quarterLabel(cell.quarter)}
                expanded={false}
                width={cell.width}
                onClick={() => onToggleQuarter(cell.year, cell.quarter)}
                ariaLabel={`Expand ${quarterLabel(cell.quarter)} ${cell.year}`}
              />
            );
          }
          // expanded-quarter banner — spans the months below
          return (
            <HeaderCell
              key={`qe-${cell.year}-${cell.quarter}`}
              label={`${quarterLabel(cell.quarter)} ${cell.year}`}
              expanded
              width={cell.width}
              emphasis="strong"
              onClick={() => onToggleQuarter(cell.year, cell.quarter)}
              ariaLabel={`Collapse ${quarterLabel(cell.quarter)} ${cell.year}`}
            />
          );
        })}
      </div>

      {/* Row 2 — month labels under expanded quarters */}
      <div className="flex h-6">
        <div
          className="sticky left-0 z-20 border-b border-r border-border bg-card"
          style={{ width: NAME_COLUMN_WIDTH }}
          aria-hidden="true"
        />
        {row1.map((cell) => {
          if (cell.kind === 'year' || cell.kind === 'quarter-collapsed') {
            return (
              <HeaderSpacer
                key={`row2-${cell.kind}-${
                  cell.kind === 'year' ? cell.year : `${cell.year}-${cell.quarter}`
                }`}
                width={cell.width}
              />
            );
          }
          return (
            <Fragment key={`row2-qe-${cell.year}-${cell.quarter}`}>
              {cell.monthColumns.map((mc) => (
                <div
                  key={`mlabel-${mc.key}`}
                  // v5.2 W6 Track A — `data-month` lets the
                  // `capacity:expand-month` consumer locate the column
                  // for scrollIntoView (§11.4 forecast-to-timeline link).
                  data-month={mc.month}
                  className="flex h-full items-center justify-center border-b border-border text-[10px] text-muted-foreground"
                  style={{ width: mc.width }}
                >
                  {shortMonthLabel(mc.month!)}
                </div>
              ))}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
