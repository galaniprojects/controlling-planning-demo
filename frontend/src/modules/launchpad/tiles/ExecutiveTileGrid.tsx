import type { TilePayload } from '@/types/api';
import { TileCard } from './TileCard';

interface Props {
  tiles: TilePayload[];
}

/**
 * 7 Executive tiles per [E-06e]: Portfolio KPIs, Investment Mix, Pipeline
 * Health, Top Risks, Scenario Activity, Budget Trajectory, Backlog.
 *
 * Layout: 3-column grid; last tile spans the remaining row.
 */
export function ExecutiveTileGrid({ tiles }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {tiles.map((tile) => (
        <TileCard key={tile.tile_id} tile={tile} />
      ))}
    </div>
  );
}
