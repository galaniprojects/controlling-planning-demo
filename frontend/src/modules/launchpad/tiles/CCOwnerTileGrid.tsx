import type { TilePayload } from '@/types/api';
import { TileCard } from './TileCard';

interface Props {
  tiles: TilePayload[];
}

/**
 * 8 CC Owner tiles per [E-06f]: Team Utilization, Open Requests,
 * Headcount, CC Budget, Portfolio, My CC's Projects, Published Scenarios,
 * CC Simulator.
 *
 * Layout: 4-column grid (2 rows of 4).
 */
export function CCOwnerTileGrid({ tiles }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {tiles.map((tile) => (
        <TileCard key={tile.tile_id} tile={tile} />
      ))}
    </div>
  );
}
