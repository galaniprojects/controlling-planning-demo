/**
 * Location Cost Rollup — F5 stub. F5 ships the full SVG map and tree-table.
 * F4 leaves a navigable shell so the sidebar feels real.
 */
import { Card } from '@/components/ui/card';
import { Map as MapIcon } from 'lucide-react';

export function RollupView() {
  return (
    <Card className="p-8">
      <div className="flex flex-col items-center text-center max-w-lg mx-auto">
        <MapIcon className="h-10 w-10 text-muted-foreground mb-3" />
        <h2 className="text-base font-semibold text-foreground mb-1">
          Location Cost Rollup
        </h2>
        <p className="text-sm text-muted-foreground">
          The SVG world map and tree-table views land in v5 Session F5.
        </p>
      </div>
    </Card>
  );
}
