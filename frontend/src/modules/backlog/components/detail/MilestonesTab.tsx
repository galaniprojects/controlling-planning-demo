/**
 * MilestonesTab — read-only milestone strip + sortable table. [A-BK-20][A-MS-01]
 */

import { useState, useEffect } from 'react';
import { milestonesApi } from '@/api/endpoints';
import type { MilestoneResponse } from '@/types/milestones';
import { Skeleton } from '@/components/shared/Skeleton';

interface Props {
  projectId: string;
}

function slipLabel(months: number): string {
  if (months === 0) return 'On track';
  if (months > 0) return `+${months}M`;
  return `${months}M`;
}

function slipClass(months: number): string {
  if (months === 0) return 'text-emerald-600 dark:text-emerald-400';
  if (months > 0) return 'text-red-600 dark:text-red-400';
  return 'text-emerald-600 dark:text-emerald-400';
}

export function MilestonesTab({ projectId }: Props) {
  const [items, setItems] = useState<MilestoneResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    milestonesApi
      .list(projectId)
      .then((d) => {
        if (!alive) return;
        setItems(d.items);
      })
      .catch((e: Error) => {
        if (!alive) return;
        setError(e.message ?? 'Failed to load milestones');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [projectId]);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
        No milestones defined for this project.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Milestone strip */}
      <MilestoneStrip items={items} />

      {/* Sortable table */}
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground w-10">
                #
              </th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">
                Name
              </th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">
                Baseline
              </th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">
                Forecast
              </th>
              <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">
                Slip
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((m) => (
              <tr key={m.id} className="border-b border-border hover:bg-accent/40">
                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {m.sequence_number}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    {m.color ? (
                      <span
                        className="inline-block size-2 shrink-0 rounded-full"
                        style={{ background: m.color }}
                        aria-hidden
                      />
                    ) : null}
                    <span className="text-sm text-foreground">{m.name}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground font-mono">
                  {m.baseline_start} → {m.baseline_end}
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground font-mono">
                  {m.forecast_start} → {m.forecast_end}
                </td>
                <td
                  className={`px-3 py-2.5 text-right text-xs font-medium tabular-nums ${slipClass(m.slip_months)}`}
                >
                  {slipLabel(m.slip_months)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MilestoneStrip({ items }: { items: MilestoneResponse[] }) {
  // Simple horizontal strip showing milestone names with colored dots
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 min-w-max">
        {items.map((m, idx) => (
          <div key={m.id} className="flex items-center gap-2">
            {idx > 0 ? (
              <div className="h-0.5 w-8 bg-border" aria-hidden />
            ) : null}
            <div className="flex flex-col items-center gap-1">
              <span
                className="inline-block size-3 rounded-full border-2 border-background shadow"
                style={{
                  background: m.color ?? 'var(--chart-1)',
                  boxShadow: `0 0 0 2px ${m.color ?? 'var(--chart-1)'}`,
                }}
                aria-hidden
              />
              <span className="text-xs text-foreground whitespace-nowrap max-w-[80px] text-center leading-tight">
                {m.name}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {m.forecast_end}
              </span>
              {m.slip_months > 0 ? (
                <span className="text-[10px] font-medium text-red-600 dark:text-red-400">
                  +{m.slip_months}M
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
