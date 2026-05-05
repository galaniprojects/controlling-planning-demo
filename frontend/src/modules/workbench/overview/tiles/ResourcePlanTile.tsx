/**
 * Workbench Overview tile (2,1) — Resource Plan per `[E-04b]`.
 *
 * Compact view of the resource plan summary returned by
 * GET /api/projects/{id}/overview. Displays total hours plus the top
 * three roles by hour share. Click target is the Forecast & Planning tab
 * (resource view) — wired by parent.
 */
import { ActionCard } from '@/components/shared/ActionCard';
import { formatNumber } from '@/lib/formatters';
import type { ResourcePlanSummaryItem } from '@/types/api';

interface Props {
  title: string;
  items: ResourcePlanSummaryItem[];
  onClick?: () => void;
}

const TOP_N = 3;

export function ResourcePlanTile({ title, items, onClick }: Props) {
  const total = items.reduce((acc, r) => acc + r.total_hours, 0);
  const sorted = items.slice().sort((a, b) => b.total_hours - a.total_hours);
  const top = sorted.slice(0, TOP_N);
  const remainder = Math.max(0, sorted.length - TOP_N);
  const remainderHours = sorted
    .slice(TOP_N)
    .reduce((acc, r) => acc + r.total_hours, 0);

  return (
    <ActionCard
      title={title}
      onClick={onClick}
      isEmpty={items.length === 0}
      emptyState="No resource allocations."
    >
      {items.length > 0 && (
        <div className="mt-3 space-y-3">
          {/* Headline */}
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Total hours
            </p>
            <p className="text-2xl font-semibold text-foreground tabular-nums">
              {formatNumber(total)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {sorted.length} role{sorted.length === 1 ? '' : 's'}
            </p>
          </div>

          {/* Top roles */}
          <div className="space-y-1.5">
            {top.map((r) => {
              const pct = total > 0 ? (r.total_hours / total) * 100 : 0;
              return (
                <div key={r.role_id} className="space-y-0.5">
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span
                      className="truncate text-foreground"
                      title={r.role_name}
                    >
                      {r.role_name}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {formatNumber(r.total_hours)}h
                    </span>
                  </div>
                  <div className="h-1 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {remainder > 0 && (
            <p className="text-[11px] text-muted-foreground tabular-nums">
              +{remainder} more · {formatNumber(remainderHours)}h
            </p>
          )}
        </div>
      )}
    </ActionCard>
  );
}
