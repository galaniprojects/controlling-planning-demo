/**
 * RoleAvailabilityRow — v5.2 W4 Track C (spec §13.5, §13.6)
 *
 * Renders one row of the availability grid for a single role type.
 *
 * Layout:
 *   [Name cell — 160px sticky-left] [bar cell per TimeColumn]
 *
 * Bar cell:
 *   Two-layer horizontal bar: dark (allocated) + light (available).
 *   Color coding by availability ratio (≥50% green, 20–49% amber, <20% red, 0% Full).
 *   Competing demand badge via Lucide Zap icon when competing_demand_count > 0.
 *
 * Collapsed period behavior (§13.6):
 *   Average allocated/available across months in the period.
 *   Peak competing demand count.
 *   Color from average availability percentage.
 *
 * Data privacy: renders only role-level aggregate data — no person names,
 * project names, or CC names.
 */
import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAME_COLUMN_WIDTH } from '@/modules/capacity/timeline/timeAxis';
import type { TimeColumn } from '@/modules/capacity/timeline/timeAxis';
import type { RoleData, SelectedRole } from './types';
import type { RoleAvailabilityRow as RoleAvailabilityRowData } from '@/types/api';
import type { LocationAvailabilitySummary } from '@/types/api';

// ---------------------------------------------------------------------------
// Availability color helpers (spec §13.5)
// ---------------------------------------------------------------------------

interface AvailColors {
  /** CSS class for the available (light) portion of the bar. */
  availBg: string;
  /** CSS class for the available text label inside the bar. */
  labelClass: string;
}

function getAvailColors(availPct: number): AvailColors {
  if (availPct <= 0) {
    return {
      availBg: '',
      labelClass: 'text-red-600 dark:text-red-400',
    };
  }
  if (availPct < 20) {
    return {
      availBg: 'bg-red-200 dark:bg-red-900/40',
      labelClass: 'text-red-700 dark:text-red-300',
    };
  }
  if (availPct < 50) {
    return {
      availBg: 'bg-amber-200 dark:bg-amber-900/40',
      labelClass: 'text-amber-700 dark:text-amber-300',
    };
  }
  return {
    availBg: 'bg-green-200 dark:bg-green-900/40',
    labelClass: 'text-green-700 dark:text-green-300',
  };
}

// ---------------------------------------------------------------------------
// Per-column computation helpers
// ---------------------------------------------------------------------------

interface ColStats {
  capacityHours: number;
  allocatedHours: number;
  availableHours: number;
  availPct: number;
  peakCompeting: number;
}

function computeColStats(
  col: TimeColumn,
  monthData: Record<string, RoleAvailabilityRowData>,
): ColStats {
  const rows = col.months.map((m) => monthData[m]).filter(Boolean);
  if (rows.length === 0) {
    return { capacityHours: 0, allocatedHours: 0, availableHours: 0, availPct: 0, peakCompeting: 0 };
  }

  if (col.type === 'month') {
    const r = rows[0];
    const availPct =
      r.standard_hours > 0 ? (r.available_hours / r.standard_hours) * 100 : 0;
    return {
      capacityHours: r.standard_hours,
      allocatedHours: r.allocated_hours,
      availableHours: r.available_hours,
      availPct,
      peakCompeting: r.competing_demand_count,
    };
  }

  // Collapsed quarter or year — average per §13.6
  const n = rows.length;
  const totalCap = rows.reduce((s, r) => s + r.standard_hours, 0);
  const totalAlloc = rows.reduce((s, r) => s + r.allocated_hours, 0);
  const totalAvail = rows.reduce((s, r) => s + r.available_hours, 0);
  const avgAvailPct = totalCap > 0 ? (totalAvail / totalCap) * 100 : 0;
  const peakCompeting = Math.max(...rows.map((r) => r.competing_demand_count));

  return {
    capacityHours: totalCap / n,
    allocatedHours: totalAlloc / n,
    availableHours: totalAvail / n,
    availPct: avgAvailPct,
    peakCompeting,
  };
}

// ---------------------------------------------------------------------------
// Bar cell component
// ---------------------------------------------------------------------------

function AvailBarCell({
  stats,
  colWidth,
}: {
  stats: ColStats;
  colWidth: number;
}) {
  const { capacityHours, allocatedHours, availableHours, availPct, peakCompeting } = stats;
  const { availBg, labelClass } = getAvailColors(availPct);
  const isFull = availPct <= 0;

  // Proportions for the two-layer bar
  const allocFrac =
    capacityHours > 0
      ? Math.min(1, allocatedHours / capacityHours)
      : 1;
  const availFrac = 1 - allocFrac;

  const innerWidth = colWidth - 6; // 3px padding each side

  return (
    <div
      className="relative flex items-center justify-center border-r border-border/50 last:border-r-0"
      style={{ width: colWidth, minWidth: colWidth }}
    >
      <div
        className="relative flex items-center overflow-hidden rounded-sm"
        style={{ width: innerWidth - 4, height: 18 }}
      >
        {/* Allocated portion (dark) */}
        <div
          className="h-full bg-slate-400 dark:bg-slate-500 shrink-0"
          style={{ width: `${allocFrac * 100}%` }}
        />
        {/* Available portion (light, color-coded) */}
        {!isFull && availFrac > 0 && (
          <div
            className={cn('h-full shrink-0', availBg)}
            style={{ width: `${availFrac * 100}%` }}
          />
        )}
        {/* Numeric label inside bar — available hours */}
        {!isFull && availableHours > 0 && innerWidth > 36 && (
          <span
            className={cn(
              'absolute right-1 text-[9px] font-medium leading-none pointer-events-none',
              labelClass,
            )}
          >
            {Math.round(availableHours)}h
          </span>
        )}
        {/* "Full" label when 0% available */}
        {isFull && (
          <span className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold text-red-600 dark:text-red-400 pointer-events-none">
            Full
          </span>
        )}
      </div>
      {/* Competing demand badge */}
      {peakCompeting > 0 && (
        <div
          className={cn(
            'absolute top-0.5 right-0.5 flex items-center gap-0.5',
            'text-[8px] font-semibold text-amber-700 dark:text-amber-400',
          )}
          title={`${peakCompeting} competing request${peakCompeting !== 1 ? 's' : ''}`}
        >
          <Zap className="h-2.5 w-2.5" />
          <span>{peakCompeting}</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface RoleAvailabilityRowProps {
  roleData: RoleData;
  columns: readonly TimeColumn[];
  locationSummary?: LocationAvailabilitySummary[] | null;
  onRowClick: (selected: SelectedRole) => void;
}

export function RoleAvailabilityRow({
  roleData,
  columns,
  locationSummary,
  onRowClick,
}: RoleAvailabilityRowProps) {
  function handleClick() {
    // Build ordered months array from the monthData map
    const orderedMonths = Object.keys(roleData.monthData)
      .sort()
      .map((m) => roleData.monthData[m]);

    onRowClick({
      role_type_id: roleData.role_type_id,
      role_type_name: roleData.role_type_name,
      headcount: roleData.headcount,
      months: orderedMonths,
      locationSummary,
    });
  }

  return (
    <div
      className={cn(
        'flex items-center border-b border-border/50 h-10',
        'hover:bg-accent/40 transition-colors cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-inset focus-visible:ring-2 focus-visible:ring-ring/40',
      )}
      role="row"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      aria-label={`${roleData.role_type_name}, ${roleData.headcount} people — click for details`}
    >
      {/* Name cell (sticky-left) */}
      <div
        className="sticky left-0 z-10 bg-card border-r border-border flex flex-col justify-center px-3 shrink-0 h-full"
        style={{ width: NAME_COLUMN_WIDTH }}
      >
        <span className="text-[12px] font-medium text-foreground leading-tight truncate">
          {roleData.role_type_name}
        </span>
        <span className="text-[11px] text-muted-foreground leading-tight">
          {roleData.headcount} {roleData.headcount === 1 ? 'person' : 'people'}
        </span>
      </div>

      {/* Bar cells */}
      {columns.map((col) => {
        const stats = computeColStats(col, roleData.monthData);
        return (
          <AvailBarCell key={col.key} stats={stats} colWidth={col.width} />
        );
      })}
    </div>
  );
}
