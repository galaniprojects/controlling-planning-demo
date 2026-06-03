/**
 * AvailabilityGrid — v5.2 W4 Track C (spec §13.5, §13.6)
 *
 * The main timeline grid showing one row per role type. Reuses TimeAxisHeader
 * from the workspace timeline (W3). Manages its own local TimeAxisState
 * (independent of CapacityScopeContext per spec §13).
 *
 * Default time axis: next 12 months from demo date, Q2 2026 expanded to
 * months, all other quarters collapsed.
 */
import { useState, useMemo } from 'react';
import { TimeAxisHeader } from '@/modules/capacity/timeline/TimeAxisHeader';
import {
  defaultTimeAxisState,
  buildVisibleColumns,
  generateMonthRange,
  toggleYear,
  toggleQuarter,
  addMonths,
} from '@/modules/capacity/timeline/timeAxis';
import type { TimeAxisState, Quarter } from '@/modules/capacity/timeline/timeAxis';
import { RoleAvailabilityRow } from './RoleAvailabilityRow';
import { useConfig } from '@/contexts/ConfigContext';
import type { RoleData, SelectedRole } from './types';
import type { LocationAvailabilitySummary } from '@/types/api';

const WINDOW_MONTHS = 12;

/** Generate the fixed 12-month window starting from the current period. */
function getWindowMonths(currentPeriod: string): string[] {
  const end = addMonths(currentPeriod, WINDOW_MONTHS - 1);
  return generateMonthRange(currentPeriod, end);
}

interface AvailabilityGridProps {
  roles: RoleData[];
  locationSummary?: LocationAvailabilitySummary[] | null;
  onRoleClick: (selected: SelectedRole) => void;
}

export function AvailabilityGrid({
  roles,
  locationSummary,
  onRoleClick,
}: AvailabilityGridProps) {
  const { currentPeriod } = useConfig();
  const visibleMonths = useMemo(() => getWindowMonths(currentPeriod), [currentPeriod]);

  const [axisState, setAxisState] = useState<TimeAxisState>(() =>
    defaultTimeAxisState(visibleMonths, currentPeriod),
  );

  const columns = useMemo(
    () => buildVisibleColumns(axisState, visibleMonths),
    [axisState, visibleMonths],
  );

  function handleToggleYear(year: number) {
    setAxisState((prev) => toggleYear(prev, year));
  }

  function handleToggleQuarter(year: number, quarter: Quarter) {
    setAxisState((prev) => toggleQuarter(prev, year, quarter));
  }

  if (roles.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm border border-border rounded-lg bg-card">
        No roles found for the selected filters.
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg bg-card overflow-x-auto">
      <div className="min-w-max">
        <TimeAxisHeader
          columns={columns}
          onToggleYear={handleToggleYear}
          onToggleQuarter={handleToggleQuarter}
        />
        <div role="table" aria-label="Role availability grid">
          {roles.map((roleData) => (
            <RoleAvailabilityRow
              key={roleData.role_type_id}
              roleData={roleData}
              columns={columns}
              locationSummary={locationSummary}
              onRowClick={onRoleClick}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
