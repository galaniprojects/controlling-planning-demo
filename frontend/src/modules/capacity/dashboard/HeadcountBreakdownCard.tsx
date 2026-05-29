/**
 * HeadcountBreakdownCard — v5.2 W4 Track B (§11.5).
 *
 * Single horizontal stacked bar showing headcount broken down by the
 * selected dimension. Dimension switcher dropdown persists selection to
 * localStorage key `creta_capacity_headcount_dimension`.
 *
 * Dimensions:
 *   - location (default)
 *   - hierarchy node
 *   - role
 *   - cost center
 *
 * Click segment → changes workspace scope (location/hierarchy/CC) or
 * activates a role filter for the role dimension.
 *
 * Data source: getDashboardHeadcountBreakdown({scope, dimension}).
 *
 * Spec: guides/Capacity_Module_Redesign_Spec.md §11.5
 */
import { useEffect, useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from 'recharts';
import type { TooltipContentProps } from 'recharts';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';
import { useCapacityScope } from '@/contexts/CapacityScopeContext';
import type { CapacityScope } from '@/contexts/CapacityScopeContext';
import { capacityApi } from '@/api/endpoints';
import { scopeToApiParam } from '@/lib/capacityScopeApi';
import type { HeadcountBreakdownSegment } from '@/types/api';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LS_KEY = 'viper_capacity_headcount_dimension';

type Dimension = 'location' | 'hierarchy' | 'role' | 'cost_center';

const DIMENSION_LABELS: Record<Dimension, string> = {
  location: 'By location',
  hierarchy: 'By hierarchy node',
  role: 'By role',
  cost_center: 'By cost center',
};

/**
 * Categorical palette for segments — distinct from the project color palette
 * per CLAUDE.md and spec §11.5.
 */
const SEGMENT_COLORS = [
  'hsl(201, 96%, 32%)',
  'hsl(152, 60%, 38%)',
  'hsl(33, 95%, 47%)',
  'hsl(270, 50%, 55%)',
  'hsl(340, 80%, 50%)',
  'hsl(185, 70%, 40%)',
  'hsl(60, 70%, 40%)',
  'hsl(10, 80%, 52%)',
];

function segmentColor(idx: number): string {
  return SEGMENT_COLORS[idx % SEGMENT_COLORS.length];
}

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------

interface SegmentWithIdx extends HeadcountBreakdownSegment {
  colorIdx: number;
}

function CustomTooltip({ active, payload }: TooltipContentProps<number, string>) {
  if (!active || !payload?.length) return null;
  const seg = (payload[0] as { payload?: SegmentWithIdx })?.payload;
  if (!seg) return null;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-1.5 text-xs shadow-md">
      <p className="font-medium text-foreground">{seg.label}</p>
      <p className="text-muted-foreground">
        {seg.count} people,{' '}
        {(seg.avg_utilization_pct ?? 0).toFixed(0)}% avg utilization
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HeadcountBreakdownCard() {
  const { scope, ccId, setScope } = useCapacityScope();
  const apiScope = useMemo(() => scopeToApiParam(scope, ccId), [scope, ccId]);

  const [dimension, setDimension] = useState<Dimension>(() => {
    const stored = localStorage.getItem(LS_KEY) as Dimension | null;
    return stored && stored in DIMENSION_LABELS ? stored : 'location';
  });

  const [segments, setSegments] = useState<HeadcountBreakdownSegment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    capacityApi
      .getDashboardHeadcountBreakdown(apiScope, dimension)
      .then((res) => {
        if (cancelled) return;
        const items = res.items ?? [];
        setSegments(items);
        // API total = number of segments (dimension count), not headcount.
        // Compute actual headcount by summing segment counts.
        const headcount = items.reduce((acc, s) => acc + s.count, 0);
        setTotal(headcount);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load headcount');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiScope, dimension]);

  const handleDimensionChange = (d: Dimension) => {
    setDimension(d);
    localStorage.setItem(LS_KEY, d);
  };

  const handleSegmentClick = (entry: HeadcountBreakdownSegment) => {
    if (!entry.segment_id) return;
    let next: CapacityScope | null = null;
    if (dimension === 'location') {
      next = { kind: 'location', id: entry.segment_id };
    } else if (dimension === 'hierarchy') {
      next = { kind: 'hierarchy', id: entry.segment_id };
    } else if (dimension === 'cost_center') {
      next = { kind: 'my_cc', id: entry.segment_id };
    }
    // For 'role', no scope change — best effort role-group highlight
    // is a follow-up (W5 polish).
    if (next) setScope(next);
  };

  // Transform segments into a single-row stacked bar.
  // Each segment becomes its own dataKey.
  const hasData = segments.length > 0;

  // Build a flat object for Recharts stacked bar with one row.
  const barData = useMemo(() => {
    if (!hasData) return [];
    const row: Record<string, number | string> = { id: 'headcount' };
    for (const seg of segments) {
      row[seg.label] = seg.count;
    }
    return [row];
  }, [segments, hasData]);

  const segmentsWithColor: SegmentWithIdx[] = useMemo(
    () => segments.map((seg, i) => ({ ...seg, colorIdx: i })),
    [segments],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header with dimension switcher */}
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Headcount Breakdown
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 py-0 text-[11px] text-muted-foreground hover:text-foreground"
            >
              {DIMENSION_LABELS[dimension]}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="text-xs">
            {(Object.keys(DIMENSION_LABELS) as Dimension[]).map((d) => (
              <DropdownMenuItem
                key={d}
                onClick={() => handleDimensionChange(d)}
                className={dimension === d ? 'font-medium' : ''}
              >
                {DIMENSION_LABELS[d]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {loading && (
        <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
          Loading...
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-1 items-center justify-center text-xs text-destructive">
          {error}
        </div>
      )}

      {!loading && !error && !hasData && (
        <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
          No data for current scope
        </div>
      )}

      {!loading && !error && hasData && (
        <div className="flex flex-1 flex-col justify-center">
          {/* Total label */}
          <div className="mb-1 text-xs text-muted-foreground">
            Total: <span className="font-medium text-foreground">{total}</span>
          </div>

          <ResponsiveContainer width="100%" height={48}>
            <BarChart
              data={barData}
              layout="vertical"
              margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
            >
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="id" hide />
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Tooltip content={CustomTooltip as any} cursor={{ fill: 'transparent' }} />
              {segmentsWithColor.map((seg, segIdx) => (
                <Bar
                  key={seg.label}
                  dataKey={seg.label}
                  stackId="a"
                  fill={segmentColor(seg.colorIdx)}
                  cursor="pointer"
                  radius={
                    segIdx === 0
                      ? [3, 0, 0, 3]
                      : segIdx === segments.length - 1
                        ? [0, 3, 3, 0]
                        : [0, 0, 0, 0]
                  }
                  onClick={() => handleSegmentClick(seg)}
                >
                  <LabelList
                    dataKey={seg.label}
                    position="center"
                    style={{
                      fontSize: 10,
                      fill: 'rgba(255,255,255,0.9)',
                      fontWeight: 500,
                    }}
                    formatter={(v: unknown) => {
                      const count = typeof v === 'number' ? v : 0;
                      // Only show label if segment wide enough (>5% of total).
                      return total > 0 && count / total > 0.05
                        ? `${seg.label} ${count}`
                        : '';
                    }}
                  />
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>

          {/* Compact legend below bar for narrow segments */}
          {segments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {segmentsWithColor.map((seg) => (
                <button
                  key={seg.label}
                  type="button"
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                  onClick={() => handleSegmentClick(seg)}
                >
                  <span
                    className="inline-block h-2 w-2 rounded-sm shrink-0"
                    style={{ background: segmentColor(seg.colorIdx) }}
                  />
                  {seg.label} ({seg.count})
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default HeadcountBreakdownCard;
