/**
 * Variance waterfall expanded dialog per `[E-05c]`.
 *
 * Wraps the VarianceWaterfallChart with project trajectory data (baseline
 * total + current forecast) and a category-grouped change-request bridge.
 *
 * Triggered by the Three-Point Summary tile (`[E-04b]` row 1,2) on the
 * Workbench Overview tab. Bar clicks navigate to the change-history tab
 * with the CR group/category pre-selected.
 */
import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  VarianceWaterfallChart,
  type WaterfallStep,
} from '@/components/charts/VarianceWaterfallChart';
import { workbenchApi } from '@/api/endpoints';
import {
  formatCurrency,
  formatCurrencyDelta,
} from '@/lib/formatters';
import type { CRHistoryItem, ProjectOverview } from '@/types/api';

interface Props {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CategoryGroup {
  category: string;
  label: string;
  total_eur: number;
  cr_ids: number[];
  cr_count: number;
}

const CATEGORY_LABEL: Record<string, string> = {
  scope: 'Scope CRs',
  rate: 'Rate changes',
  cost: 'Rate / cost changes',
  resource: 'Resource changes',
  schedule: 'Schedule changes',
  external: 'External cost changes',
  other: 'Other',
};

function groupCRs(crs: CRHistoryItem[]): CategoryGroup[] {
  const map = new Map<string, CategoryGroup>();
  for (const cr of crs) {
    if (cr.status !== 'approved') continue;
    if (cr.impact_eur == null || cr.impact_eur === 0) continue;
    const key = (cr.change_category || 'other').toLowerCase();
    const label = CATEGORY_LABEL[key] ?? key;
    const existing = map.get(key);
    if (existing) {
      existing.total_eur += cr.impact_eur;
      existing.cr_ids.push(cr.id);
      existing.cr_count += 1;
    } else {
      map.set(key, {
        category: key,
        label,
        total_eur: cr.impact_eur,
        cr_ids: [cr.id],
        cr_count: 1,
      });
    }
  }
  // Order: largest absolute impact first
  return Array.from(map.values()).sort(
    (a, b) => Math.abs(b.total_eur) - Math.abs(a.total_eur),
  );
}

export function VarianceWaterfallDialog({
  projectId,
  open,
  onOpenChange,
}: Props) {
  const navigate = useNavigate();
  const [overview, setOverview] = useState<ProjectOverview | null>(null);
  const [crs, setCrs] = useState<CRHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      workbenchApi.getOverview(projectId),
      workbenchApi.getChangeRequests(projectId).catch(() => null),
    ])
      .then(([ov, crList]) => {
        if (cancelled) return;
        setOverview(ov);
        setCrs(crList?.items ?? []);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Load failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectId]);

  const baseline = overview?.three_point_comparison?.baseline ?? 0;
  const forecast = overview?.three_point_comparison?.forecast ?? 0;
  const groupedCRs = useMemo(() => groupCRs(crs), [crs]);

  // Sum of grouped CR impacts vs. total forecast/baseline delta. The
  // residual goes into a synthetic "Other adjustments" bucket so the
  // bridge always reconciles end-to-end.
  const groupedSum = groupedCRs.reduce((acc, g) => acc + g.total_eur, 0);
  const totalDelta = forecast - baseline;
  const residual = totalDelta - groupedSum;

  const steps: WaterfallStep[] = [
    {
      id: 'baseline',
      label: 'Baseline',
      type: 'start',
      amount_eur: baseline,
      description: `Original approved baseline · ${formatCurrency(baseline)}`,
    },
    ...groupedCRs.map<WaterfallStep>((g) => ({
      id: `category:${g.category}`,
      label: g.label,
      type: 'change',
      amount_eur: g.total_eur,
      description: `${g.cr_count} approved CR${g.cr_count === 1 ? '' : 's'} · ${formatCurrencyDelta(g.total_eur)}`,
    })),
  ];
  if (Math.abs(residual) > 0.5) {
    steps.push({
      id: 'residual',
      label: 'Other adjustments',
      type: 'change',
      amount_eur: residual,
      description: `Reconciles to current forecast · ${formatCurrencyDelta(residual)}`,
    });
  }
  steps.push({
    id: 'forecast',
    label: 'Current forecast',
    type: 'end',
    amount_eur: forecast,
    description: `Active forecast total · ${formatCurrency(forecast)}`,
  });

  const handleBarClick = (stepId: string) => {
    if (stepId === 'baseline' || stepId === 'forecast') return;
    if (stepId === 'residual') return;
    // category:<key> — navigate to change history with category filter
    if (stepId.startsWith('category:')) {
      const category = stepId.slice('category:'.length);
      onOpenChange(false);
      navigate(
        `/workbench?project=${encodeURIComponent(projectId)}&tab=history&category=${encodeURIComponent(category)}`,
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Variance waterfall</DialogTitle>
          <DialogDescription>
            Bridge from the original baseline to the current forecast,
            grouped by change category. Click a category bar to drill into
            the underlying change requests.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading waterfall data…
          </div>
        )}

        {!loading && error && (
          <p className="text-sm text-red-600 dark:text-red-400 py-8">
            Failed to load waterfall data: {error}
          </p>
        )}

        {!loading && !error && overview && (
          <div className="space-y-4">
            {/* Headline strip */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-md border border-border bg-card p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Baseline
                </p>
                <p className="text-sm font-semibold text-foreground tabular-nums">
                  {formatCurrency(baseline)}
                </p>
              </div>
              <div className="rounded-md border border-border bg-card p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Total movement
                </p>
                <p
                  className={
                    'text-sm font-semibold tabular-nums ' +
                    (totalDelta > 0
                      ? 'text-red-600 dark:text-red-400'
                      : totalDelta < 0
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-foreground')
                  }
                >
                  {formatCurrencyDelta(totalDelta)}
                </p>
              </div>
              <div className="rounded-md border border-border bg-card p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Current forecast
                </p>
                <p className="text-sm font-semibold text-foreground tabular-nums">
                  {formatCurrency(forecast)}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-3">
              <VarianceWaterfallChart
                steps={steps}
                onBarClick={handleBarClick}
                height={340}
              />
            </div>

            {groupedCRs.length === 0 && (
              <p className="text-xs text-muted-foreground italic">
                No approved change requests with measurable financial
                impact. The bridge shows only the baseline → forecast
                anchors.
              </p>
            )}

            {groupedCRs.length > 0 && (
              <div className="rounded-md border border-border bg-card overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="text-left p-2 font-medium">Category</th>
                      <th className="text-right p-2 font-medium">CRs</th>
                      <th className="text-right p-2 font-medium">Impact</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedCRs.map((g) => (
                      <tr
                        key={g.category}
                        className="border-t border-border hover:bg-accent/30 cursor-pointer"
                        onClick={() => handleBarClick(`category:${g.category}`)}
                      >
                        <td className="p-2 text-foreground">{g.label}</td>
                        <td className="p-2 text-right tabular-nums">
                          {g.cr_count}
                        </td>
                        <td className="p-2 text-right tabular-nums">
                          {formatCurrencyDelta(g.total_eur)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
