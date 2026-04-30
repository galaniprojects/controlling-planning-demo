import { useEffect, useState } from 'react';
import { useRole } from '@/contexts/RoleContext';
import { launchpadApi } from '@/api/endpoints';
import type { TilePayload } from '@/types/api';
import { PLTileGrid } from './tiles/PLTileGrid';
import { ControllerTileGrid } from './tiles/ControllerTileGrid';
import { CCOwnerTileGrid } from './tiles/CCOwnerTileGrid';
import { ExecutiveTileGrid } from './tiles/ExecutiveTileGrid';

/**
 * Role dispatcher for the v5 Launchpad tile grid per [E-06d]–[E-06j].
 *
 * Fetches `GET /api/launchpad/tiles` (role-gated server-side) and renders
 * one of four role-specific tile-set components based on the active
 * `useRole().context?.role`. The backend returns the correct tile count
 * (PL 7, Controller 9, CC Owner 8, Executive 7) so this component is
 * primarily a layout dispatcher.
 */
export function RoleTileGrid() {
  const { currentRoleId, context } = useRole();
  const [tiles, setTiles] = useState<TilePayload[]>([]);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    setLoading(true);
    setErrored(false);
    launchpadApi
      .getTiles()
      .then((res) => setTiles(res.items))
      .catch(() => {
        setErrored(true);
        setTiles([]);
      })
      .finally(() => setLoading(false));
  }, [currentRoleId]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-[120px] rounded-lg bg-muted/40 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (errored) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Could not load your launchpad tiles. Try refreshing the page.
        </p>
      </div>
    );
  }

  if (tiles.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">No tiles available for your role.</p>
      </div>
    );
  }

  switch (context?.role) {
    case 'project_lead':
      return <PLTileGrid tiles={tiles} />;
    case 'controller':
      return <ControllerTileGrid tiles={tiles} />;
    case 'cost_center_owner':
      return <CCOwnerTileGrid tiles={tiles} />;
    case 'executive':
      return <ExecutiveTileGrid tiles={tiles} />;
    default:
      // Unknown role: render with a generic 3-column layout.
      return <ControllerTileGrid tiles={tiles} />;
  }
}
