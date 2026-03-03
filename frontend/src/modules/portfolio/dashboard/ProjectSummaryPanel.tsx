import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/shared/Skeleton';
import { ragBgColor } from '@/lib/rag';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { portfolioApi } from '@/api/endpoints';
import type { ProjectSummary } from '@/types/api';
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { ArrowRight } from 'lucide-react';

interface Props {
  projectId: string;
}

export function ProjectSummaryPanel({ projectId }: Props) {
  const navigate = useNavigate();
  const [data, setData] = useState<ProjectSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    portfolioApi
      .getProjectSummary(projectId)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-slate-400">Project not found.</p>;
  }

  const bs = data.budget_snapshot;

  // Timeline progress calculation
  let timelinePct = 0;
  if (data.timeline?.start && data.timeline?.end) {
    const start = new Date(data.timeline.start + '-01');
    const end = new Date(data.timeline.end + '-01');
    const now = new Date('2026-02-15'); // Demo date
    const total = end.getTime() - start.getTime();
    if (total > 0) {
      timelinePct = Math.max(0, Math.min(100, ((now.getTime() - start.getTime()) / total) * 100));
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <h3 className="text-base font-semibold text-slate-800">{data.name}</h3>
        {data.rag && (
          <Badge className={cn('text-xs capitalize', ragBgColor(data.rag))}>
            {data.rag}
          </Badge>
        )}
      </div>

      {/* Budget Snapshot */}
      <div>
        <p className="text-xs font-medium text-slate-500 mb-2">Budget Snapshot</p>
        <div className="grid grid-cols-2 gap-2">
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-slate-500">Baseline</p>
              <p className="text-sm font-semibold text-slate-800">{formatCurrency(bs.baseline)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-slate-500">Forecast</p>
              <p className="text-sm font-semibold text-slate-800">{formatCurrency(bs.forecast)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-slate-500">Actuals YTD</p>
              <p className="text-sm font-semibold text-slate-800">{formatCurrency(bs.actuals_ytd)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-slate-500">Plan Drift</p>
              <p
                className={cn(
                  'text-sm font-semibold',
                  bs.plan_drift_pct > 10
                    ? 'text-red-600'
                    : bs.plan_drift_pct > 5
                      ? 'text-amber-600'
                      : 'text-green-600',
                )}
              >
                {formatPercent(bs.plan_drift_pct)}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Timeline */}
      {data.timeline?.start && (
        <div>
          <p className="text-xs font-medium text-slate-500 mb-2">Timeline</p>
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-slate-400">
              <span>{data.timeline.start}</span>
              <span>{data.timeline.end || '?'}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-600 transition-all"
                style={{ width: `${timelinePct}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Last CR Summary */}
      {data.last_cr_summary && (
        <div>
          <p className="text-xs font-medium text-slate-500 mb-1">Last Change Request</p>
          <p className="text-sm text-slate-600">{data.last_cr_summary}</p>
        </div>
      )}

      {/* Forecast Sparkline */}
      {data.forecast_sparkline.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-500 mb-1">Forecast Trend</p>
          <ResponsiveContainer width="100%" height={80}>
            <AreaChart data={data.forecast_sparkline}>
              <Tooltip
                formatter={(value: number) => [formatCurrency(value), 'Forecast']}
                contentStyle={{ fontSize: 12, borderRadius: 6 }}
              />
              <Area
                type="monotone"
                dataKey="amount"
                stroke="#1d4ed8"
                fill="#dbeafe"
                strokeWidth={1.5}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Open in Workbench */}
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => navigate('/workbench')}
      >
        Open in Workbench
        <ArrowRight className="h-4 w-4 ml-1.5" />
      </Button>
    </div>
  );
}
