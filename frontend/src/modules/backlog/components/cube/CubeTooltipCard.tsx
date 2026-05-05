/**
 * CubeTooltipCard — custom Recharts tooltip for the cube scatter plots.
 * [A-BK-19]
 */

import type { TooltipProps } from 'recharts';
import { formatDecimal } from '@/lib/formatters';
import type { RankedProjectItem } from '@/types/api';

interface Props extends TooltipProps<number, string> {
  items: RankedProjectItem[];
}

function fmtScore(n: number | null): string {
  if (n === null) return '—';
  return formatDecimal(n, 2);
}

export function CubeTooltipCard({ active, payload, items }: Props) {
  if (!active || !payload || payload.length === 0) return null;

  const point = payload[0].payload as { project_id: string };
  const item = items.find((i) => i.project_id === point.project_id);
  if (!item) return null;

  return (
    <div className="z-50 rounded-md border border-border bg-card px-3 py-2 shadow-lg text-xs space-y-1 min-w-[180px]">
      <div className="font-medium text-foreground text-sm leading-tight">
        {item.project_name}
      </div>
      <div className="text-muted-foreground">
        {item.pipeline_stage ?? 'Unknown stage'}
        {item.doi !== null ? ` · DoI ${item.doi}` : ''}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 pt-1 border-t border-border">
        <span className="text-muted-foreground">Complexity</span>
        <span className="text-right font-mono text-foreground">
          {fmtScore(item.complexity_score)}
        </span>
        <span className="text-muted-foreground">Value Creation</span>
        <span className="text-right font-mono text-foreground">
          {fmtScore(item.value_creation_score)}
        </span>
        <span className="text-muted-foreground">Composite</span>
        <span className="text-right font-mono text-foreground font-semibold">
          {fmtScore(item.composite_score)}
        </span>
      </div>
      {item.tshirt_size ? (
        <div className="text-muted-foreground pt-0.5">
          Size: {item.tshirt_size}
        </div>
      ) : null}
    </div>
  );
}
