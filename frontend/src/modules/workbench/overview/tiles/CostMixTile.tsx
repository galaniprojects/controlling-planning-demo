/**
 * Workbench Overview tile (2,2) — Cost Mix per `[E-04b]`.
 *
 * CapEx/OpEx donut with percentages, plus internal vs. external cost ratio
 * badges derived from the project overview. Click target is the cost
 * breakdown view (currently Forecast & Planning grid grouped by category).
 */
import { useEffect, useState } from 'react';
import { ActionCard } from '@/components/shared/ActionCard';
import { Badge } from '@/components/ui/badge';
import { workbenchApi } from '@/api/endpoints';
import { formatCurrency } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import type { ForecastGridRow } from '@/types/api';

interface Props {
  projectId: string;
  capexOpex: {
    type: string;
    capex_amount?: number;
    opex_amount?: number;
    capex_pct?: number;
    opex_pct?: number;
  };
  onClick?: () => void;
}

interface InternalExternalSplit {
  internal: number;
  external: number;
  total: number;
}

function donutDashArray(pct: number, circ: number): string {
  const filled = (pct / 100) * circ;
  return `${filled.toFixed(2)} ${(circ - filled).toFixed(2)}`;
}

export function CostMixTile({ projectId, capexOpex, onClick }: Props) {
  const [split, setSplit] = useState<InternalExternalSplit | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    workbenchApi
      .getForecast(projectId)
      .then((res) => {
        if (cancelled) return;
        const rows: ForecastGridRow[] = res.items;
        let internal = 0;
        let external = 0;
        for (const row of rows) {
          for (const c of row.months) {
            const amt = c.forecast_amount ?? 0;
            if (row.category === 'internal') internal += amt;
            else if (row.category === 'external') external += amt;
          }
        }
        setSplit({ internal, external, total: internal + external });
      })
      .catch(() => {
        if (!cancelled) setSplit(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Donut geometry — single ring split between CapEx and OpEx
  const radius = 22;
  const circ = 2 * Math.PI * radius;
  const capexPct = capexOpex.capex_pct ?? 0;
  const opexPct = capexOpex.opex_pct ?? 0;

  return (
    <ActionCard title="Cost mix" onClick={onClick} loading={loading}>
      {!loading && (
        <div className="mt-3 flex flex-col gap-3">
          {/* Donut + legend */}
          <div className="flex items-center gap-4">
            <svg
              width="64"
              height="64"
              viewBox="0 0 64 64"
              className="flex-shrink-0"
              role="img"
              aria-label={`CapEx ${capexPct.toFixed(0)} percent, OpEx ${opexPct.toFixed(0)} percent`}
            >
              {/* Background ring */}
              <circle
                cx="32"
                cy="32"
                r={radius}
                fill="none"
                stroke="var(--muted)"
                strokeWidth="8"
              />
              {/* CapEx slice */}
              {capexPct > 0 && (
                <circle
                  cx="32"
                  cy="32"
                  r={radius}
                  fill="none"
                  stroke="rgb(59 130 246)"
                  strokeWidth="8"
                  strokeDasharray={donutDashArray(capexPct, circ)}
                  strokeDashoffset="0"
                  transform="rotate(-90 32 32)"
                />
              )}
              {/* OpEx slice */}
              {opexPct > 0 && (
                <circle
                  cx="32"
                  cy="32"
                  r={radius}
                  fill="none"
                  stroke="rgb(245 158 11)"
                  strokeWidth="8"
                  strokeDasharray={donutDashArray(opexPct, circ)}
                  strokeDashoffset={(-(capexPct / 100) * circ).toFixed(2)}
                  transform="rotate(-90 32 32)"
                />
              )}
            </svg>
            <div className="space-y-1 min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-muted-foreground">CapEx</span>
                </span>
                <span className="tabular-nums text-foreground font-medium">
                  {capexPct.toFixed(0)}%
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground tabular-nums truncate">
                {formatCurrency(capexOpex.capex_amount ?? 0)}
              </p>
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-muted-foreground">OpEx</span>
                </span>
                <span className="tabular-nums text-foreground font-medium">
                  {opexPct.toFixed(0)}%
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground tabular-nums truncate">
                {formatCurrency(capexOpex.opex_amount ?? 0)}
              </p>
            </div>
          </div>

          {/* Internal vs external badges */}
          {split && split.total > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border">
              <Badge
                variant="outline"
                className={cn('text-[10px] gap-1')}
                title={`Internal cost ${formatCurrency(split.internal)}`}
              >
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Internal {((split.internal / split.total) * 100).toFixed(0)}%
              </Badge>
              <Badge
                variant="outline"
                className={cn('text-[10px] gap-1')}
                title={`External cost ${formatCurrency(split.external)}`}
              >
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-violet-500" />
                External {((split.external / split.total) * 100).toFixed(0)}%
              </Badge>
            </div>
          )}
        </div>
      )}
    </ActionCard>
  );
}
