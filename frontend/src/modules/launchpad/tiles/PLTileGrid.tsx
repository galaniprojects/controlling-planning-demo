import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { capacityApi } from '@/api/endpoints';
import { formatNumber } from '@/lib/formatters';
import type { TilePayload, RoleAvailabilityResponse } from '@/types/api';
import { TileCard } from './TileCard';

interface Props {
  tiles: TilePayload[];
}

/**
 * PL Resource Availability tile footer per [E-06a].
 *
 * Displays a tiny aggregated capacity preview (top 3 roles by available
 * hours over the next 3 months). Person identifiers and names are NEVER
 * rendered — Project Leads only see role × location aggregates.
 */
function ResourceAvailabilityFooter() {
  const [data, setData] = useState<RoleAvailabilityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    setLoading(true);
    capacityApi
      .getRoleAvailability()
      .then((res) => setData(res))
      .catch(() => setErrored(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Users className="h-3 w-3" />
        <span>Loading availability…</span>
      </div>
    );
  }

  if (errored || !data || data.items.length === 0) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Users className="h-3 w-3" />
        <span>No availability data</span>
      </div>
    );
  }

  // Aggregate available hours per role across the returned month range
  const byRole = new Map<string, { name: string; available: number }>();
  for (const row of data.items) {
    const acc = byRole.get(row.role_type_id);
    if (acc) acc.available += row.available_hours;
    else byRole.set(row.role_type_id, { name: row.role_type_name, available: row.available_hours });
  }
  const top = Array.from(byRole.values())
    .sort((a, b) => b.available - a.available)
    .slice(0, 3);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        <Users className="h-3 w-3" />
        <span>Top capacity (next 3 months)</span>
      </div>
      {top.map((row) => (
        <div key={row.name} className="flex items-center justify-between text-xs">
          <span className="text-foreground truncate">{row.name}</span>
          <span className="text-muted-foreground tabular-nums">
            {formatNumber(row.available)}h
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * 7 PL tiles per [E-06g]: My Projects, Budget, Progress, Forecast,
 * Recent Changes, Scenario Explorer, Resource Availability.
 *
 * Layout: 3-column grid (last row has the wider Resource Availability tile).
 */
export function PLTileGrid({ tiles }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {tiles.map((tile) => {
        if (tile.tile_id === 'pl-resource-availability') {
          return (
            <TileCard
              key={tile.tile_id}
              tile={tile}
              footerSlot={<ResourceAvailabilityFooter />}
            />
          );
        }
        return <TileCard key={tile.tile_id} tile={tile} />;
      })}
    </div>
  );
}
