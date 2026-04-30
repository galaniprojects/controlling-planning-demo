import type { TilePayload } from '@/types/api';
import { TileCard } from './TileCard';

interface Props {
  tiles: TilePayload[];
}

/**
 * 9 Controller tiles per [E-06d]: Portfolio KPIs, Pipeline, Budget vs
 * Cutoff, Reporting, Forecast Cycle, Pending Reviews, Capacity, Scenario
 * Activity, Admin.
 *
 * Layout: 3×3 grid as called out in the spec.
 */
export function ControllerTileGrid({ tiles }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {tiles.map((tile) => (
        <TileCard key={tile.tile_id} tile={tile} />
      ))}
    </div>
  );
}
