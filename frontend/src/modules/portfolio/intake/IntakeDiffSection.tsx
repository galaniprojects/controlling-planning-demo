import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/shared/Skeleton';
import { useCollapsibleYears } from '@/hooks/useCollapsibleYears';
import { portfolioApi } from '@/api/endpoints';
import { formatNumber } from '@/lib/formatters';
import { Check, Edit2 } from 'lucide-react';

interface DiffCell {
  month: string;
  proposed: number;
  proposed_eur: number;
  current: number;
  current_eur: number;
  is_changed: boolean;
}

interface DiffLineItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  months: DiffCell[];
}

interface DiffKPI {
  label: string;
  value: number;
  format: string;
  color?: string;
}

interface DiffData {
  project_name: string;
  submission_feedback: string | null;
  grid_data: {
    months: string[];
    line_items: DiffLineItem[];
    kpis: DiffKPI[];
  };
}

interface Props {
  projectId: string;
  onActionComplete: () => void;
}

function monthLabel(month: string): string {
  const [, m] = month.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return names[parseInt(m, 10) - 1] || m;
}

function formatCurrencyValue(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1000) {
    return `${value < 0 ? '-' : ''}€${formatNumber(abs)}`;
  }
  return `${value < 0 ? '-' : ''}€${abs.toFixed(0)}`;
}

export function IntakeDiffSection({ projectId, onActionComplete }: Props) {
  const navigate = useNavigate();
  const [data, setData] = useState<DiffData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const allMonths = data?.grid_data?.months ?? [];
  const { yearGroups, toggleYear, visibleColumns } = useCollapsibleYears(allMonths);

  useEffect(() => {
    setLoading(true);
    portfolioApi
      .getIntakeDiff(projectId)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [projectId]);

  const handleAccept = async () => {
    setSubmitting(true);
    try {
      await portfolioApi.acceptChanges(projectId);
      setResult('Changes accepted. Project resubmitted for CC confirmation.');
      onActionComplete();
    } catch {
      setResult('Failed to accept changes. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditResubmit = () => {
    navigate(`/workbench/new-project/${projectId}`);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[200px] w-full" />
      </div>
    );
  }

  if (!data || !data.grid_data) {
    return (
      <p className="text-sm text-muted-foreground">No comparison data available.</p>
    );
  }

  const lineItems = data.grid_data.line_items;
  const kpis = data.grid_data.kpis;

  return (
    <div className="space-y-4">
      {/* Result message */}
      {result && (
        <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm text-primary">
          {result}
        </div>
      )}

      {/* KPI Strip */}
      {kpis && kpis.length > 0 && (
        <div className="flex gap-4">
          {kpis.map((kpi) => (
            <div key={kpi.label} className="rounded-md border border-border bg-card px-4 py-3 min-w-[140px]">
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
              <p
                className="text-lg font-semibold"
                style={{ color: kpi.color || 'var(--foreground)' }}
              >
                {kpi.format === 'currency_delta' && kpi.value > 0 && '+'}
                {formatCurrencyValue(kpi.value)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Comparison grid */}
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="sticky left-0 z-10 bg-muted/50 px-3 py-1.5 text-left text-xs font-medium text-muted-foreground w-[180px] min-w-[180px]">
                  Line Item
                </th>
                {yearGroups.map((yg) => (
                  <th
                    key={yg.year}
                    colSpan={yg.isExpanded ? yg.months.length : 1}
                    className="px-2 py-1.5 text-center text-xs font-medium text-muted-foreground cursor-pointer hover:bg-accent"
                    onClick={() => toggleYear(yg.year)}
                  >
                    {yg.year} {yg.isExpanded ? '\u25B4' : '\u25BE'}
                  </th>
                ))}
              </tr>
              <tr className="bg-muted/50 border-b border-border">
                <th className="sticky left-0 z-10 bg-muted/50 px-3 py-1 text-left text-xs text-muted-foreground" />
                {visibleColumns.map((col) =>
                  col.type === 'month' ? (
                    <th key={col.key} className="px-2 py-1 text-center text-xs text-muted-foreground min-w-[80px]">
                      {monthLabel(col.key)}
                    </th>
                  ) : (
                    <th key={`ys-${col.year}`} className="px-2 py-1 text-center text-xs text-muted-foreground min-w-[80px]">
                      Sum
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item) => (
                <DiffRow
                  key={item.id}
                  item={item}
                  visibleColumns={visibleColumns}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-green-100 border border-green-300 dark:bg-green-900/30 dark:border-green-700" />
          Reduction
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-red-100 border border-red-300 dark:bg-red-900/30 dark:border-red-700" />
          Increase
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-primary/10 border border-primary/30" />
          New / Other change
        </span>
      </div>

      {/* Actions */}
      {!result && (
        <div className="flex gap-3 pt-2">
          <Button onClick={handleAccept} disabled={submitting}>
            <Check className="h-4 w-4 mr-1" />
            {submitting ? 'Accepting...' : 'Accept Changes'}
          </Button>
          <Button variant="outline" onClick={handleEditResubmit}>
            <Edit2 className="h-4 w-4 mr-1" />
            Edit and Resubmit
          </Button>
        </div>
      )}
    </div>
  );
}

// --- DiffRow sub-component ---

interface DiffRowProps {
  item: DiffLineItem;
  visibleColumns: ReturnType<typeof useCollapsibleYears>['visibleColumns'];
}

function DiffRow({ item, visibleColumns }: DiffRowProps) {
  const isInternal = item.category === 'internal';

  return (
    <tr className="border-b border-border">
      <td className="sticky left-0 z-10 bg-card px-3 py-2 text-sm text-foreground whitespace-nowrap">
        {item.name}
      </td>
      {visibleColumns.map((col) => {
        if (col.type === 'yearSummary') {
          const yearCells = item.months.filter((m) => col.months.includes(m.month));
          const currentSum = yearCells.reduce((s, c) => s + (isInternal ? c.current : c.current_eur), 0);
          const proposedSum = yearCells.reduce((s, c) => s + (isInternal ? c.proposed : c.proposed_eur), 0);
          const hasChange = yearCells.some((c) => c.is_changed);
          return (
            <td key={`ys-${col.year}`} className="px-2 py-2 text-center">
              {hasChange ? (
                <div className="text-xs">
                  <div className="text-muted-foreground line-through">{formatNumber(currentSum)}</div>
                  <div className="font-medium text-foreground">{formatNumber(proposedSum)}</div>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {currentSum > 0 ? formatNumber(currentSum) : '\u2014'}
                </span>
              )}
            </td>
          );
        }

        const cell = item.months.find((m) => m.month === col.key);
        if (!cell) {
          return <td key={col.key} className="px-2 py-2 text-center text-xs text-muted-foreground/40">{'\u2014'}</td>;
        }

        const currentVal = isInternal ? cell.current : cell.current_eur;
        const proposedVal = isInternal ? cell.proposed : cell.proposed_eur;

        if (!cell.is_changed) {
          return (
            <td key={col.key} className="px-2 py-2 text-center text-xs text-muted-foreground">
              {currentVal > 0 ? formatNumber(currentVal) : '\u2014'}
            </td>
          );
        }

        const diff = proposedVal - currentVal;
        let bgClass = 'bg-primary/5';
        if (diff < 0) bgClass = 'bg-green-50 dark:bg-green-900/20';
        else if (diff > 0) bgClass = 'bg-red-50 dark:bg-red-900/20';

        return (
          <td key={col.key} className={`px-2 py-1 text-center ${bgClass}`}>
            <div className="text-[10px] text-muted-foreground line-through">
              {currentVal > 0 ? formatNumber(currentVal) : '\u2014'}
            </div>
            <div className="text-xs font-medium text-foreground">
              {proposedVal > 0 ? formatNumber(proposedVal) : '0'}
            </div>
          </td>
        );
      })}
    </tr>
  );
}
