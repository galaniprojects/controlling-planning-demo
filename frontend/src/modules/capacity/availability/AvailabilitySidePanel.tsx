/**
 * AvailabilitySidePanel — v5.2 W4 Track C (spec §13.7)
 *
 * Right-side panel (280px) that opens when the PL clicks a role row.
 * Renders:
 *   - Header: role name, location context, total headcount
 *   - Monthly breakdown table: Capacity / Allocated / Available / Competing
 *   - Location comparison (only when "All locations" selected)
 *   - QuickRequestAction ("Request this role" button)
 *
 * Data privacy: no person names, project names, or CC names are rendered here.
 */
import { Users, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { QuickRequestAction } from './QuickRequestAction';
import type { SelectedRole } from './types';
import type { LocationAvailabilitySummary } from '@/types/api';

/** Availability threshold color classes (spec §13.5). */
function availabilityColor(availPct: number): string {
  if (availPct <= 0) return 'text-red-600 dark:text-red-400';
  if (availPct < 20) return 'text-red-600 dark:text-red-400';
  if (availPct < 50) return 'text-amber-600 dark:text-amber-400';
  return 'text-green-600 dark:text-green-400';
}

function formatHours(h: number): string {
  return `${Math.round(h)}h`;
}

function formatPct(p: number): string {
  return `${Math.round(p)}%`;
}

function shortMonthLabel(month: string): string {
  const SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const m = parseInt(month.slice(5, 7), 10) - 1;
  const y = month.slice(0, 4);
  return `${SHORT[m] ?? month} ${y}`;
}

interface AvailabilitySidePanelProps {
  role: SelectedRole;
  /** The currently-selected location ID (null = "All locations"). */
  selectedLocationId: string | null;
  /** Location display name for the selected location. */
  selectedLocationName: string | null;
  /** Callback when PL clicks a location row — sets location picker. */
  onSelectLocation: (locationId: string) => void;
  /**
   * Slide-over override for the "Request this role" CTA (§13.9). When
   * supplied, the button calls this instead of navigating to /workbench.
   */
  onRequestRole?: () => void;
  /** Optional helper text override under the CTA. */
  requestHelperText?: string;
}

export function AvailabilitySidePanel({
  role,
  selectedLocationId,
  selectedLocationName,
  onSelectLocation,
  onRequestRole,
  requestHelperText,
}: AvailabilitySidePanelProps) {
  const locationContext = selectedLocationId
    ? (selectedLocationName ?? selectedLocationId)
    : 'All locations';

  const isAllLocations = !selectedLocationId;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-base font-semibold text-foreground leading-tight">
          {role.role_type_name}
        </h2>
        <div className="flex items-center gap-1.5 mt-1">
          <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-[13px] text-muted-foreground">{locationContext}</span>
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-[13px] text-muted-foreground">
            {role.headcount} {role.headcount === 1 ? 'person' : 'people'}
          </span>
        </div>
      </div>

      {/* Monthly breakdown */}
      <section>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Monthly breakdown
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left font-medium text-muted-foreground pb-1.5 pr-2">Month</th>
                <th className="text-right font-medium text-muted-foreground pb-1.5 pr-2">Cap.</th>
                <th className="text-right font-medium text-muted-foreground pb-1.5 pr-2">Alloc.</th>
                <th className="text-right font-medium text-muted-foreground pb-1.5 pr-2">Avail.</th>
                <th className="text-right font-medium text-muted-foreground pb-1.5">Compet.</th>
              </tr>
            </thead>
            <tbody>
              {role.months.map((row) => {
                const availPct =
                  row.standard_hours > 0
                    ? (row.available_hours / row.standard_hours) * 100
                    : 0;
                const colorClass = availabilityColor(availPct);
                return (
                  <tr
                    key={row.month}
                    className="border-b border-border/50 hover:bg-accent/30 transition-colors"
                  >
                    <td className="py-1.5 pr-2 text-foreground whitespace-nowrap">
                      {shortMonthLabel(row.month)}
                    </td>
                    <td className="py-1.5 pr-2 text-right text-muted-foreground">
                      {formatHours(row.standard_hours)}
                    </td>
                    <td className="py-1.5 pr-2 text-right text-muted-foreground">
                      {formatHours(row.allocated_hours)}
                    </td>
                    <td className={cn('py-1.5 pr-2 text-right font-medium', colorClass)}>
                      {availPct <= 0
                        ? 'Full'
                        : `${formatHours(row.available_hours)} (${formatPct(availPct)})`}
                    </td>
                    <td className="py-1.5 text-right text-muted-foreground">
                      {row.competing_demand_count > 0
                        ? `${row.competing_demand_count} req.`
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Location comparison — only when "All locations" selected */}
      {isAllLocations && role.locationSummary && role.locationSummary.length > 0 && (
        <LocationComparison
          locationSummary={role.locationSummary}
          onSelectLocation={onSelectLocation}
        />
      )}

      {/* Quick request CTA */}
      <QuickRequestAction
        roleTypeId={role.role_type_id}
        locationId={selectedLocationId}
        onRequest={onRequestRole}
        helperText={requestHelperText}
      />
    </div>
  );
}

/** Location comparison sub-section (§13.7). */
function LocationComparison({
  locationSummary,
  onSelectLocation,
}: {
  locationSummary: LocationAvailabilitySummary[];
  onSelectLocation: (locationId: string) => void;
}) {
  return (
    <section>
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        Location comparison
      </h3>
      <p className="text-xs text-muted-foreground mb-3">
        Click a location to filter the grid.
      </p>
      <div className="space-y-1">
        {locationSummary.map((loc) => {
          const pct = Math.round(loc.avg_availability_pct);
          let barColor = 'bg-green-500 dark:bg-green-600';
          if (pct < 20) barColor = 'bg-red-500 dark:bg-red-600';
          else if (pct < 50) barColor = 'bg-amber-500 dark:bg-amber-600';

          return (
            <button
              key={loc.location_id}
              type="button"
              onClick={() => onSelectLocation(loc.location_id)}
              className={cn(
                'w-full flex items-center justify-between rounded px-2 py-1.5',
                'hover:bg-accent transition-colors text-left group',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs font-medium text-foreground group-hover:text-foreground truncate">
                  {loc.location_name}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                <span className="text-xs text-muted-foreground">
                  {loc.total_headcount}
                </span>
                {/* Mini availability bar */}
                <div className="w-14 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn('h-full rounded-full', barColor)}
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-muted-foreground w-8 text-right">
                  {pct}%
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
