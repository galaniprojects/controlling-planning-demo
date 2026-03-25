import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/shared/Skeleton';
import { useCollapsibleYears } from '@/hooks/useCollapsibleYears';
import { portfolioApi } from '@/api/endpoints';
import { formatCurrencyDetailed, formatNumber } from '@/lib/formatters';
import { ArrowLeft, Check, Edit2 } from 'lucide-react';

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

interface DiffData {
  project_name: string;
  submission_feedback: string | null;
  grid_data: {
    months: string[];
    line_items: DiffLineItem[];
  };
}

interface Props {
  projectId: string;
  onBack: () => void;
}

function monthLabel(month: string): string {
  const [, m] = month.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return names[parseInt(m, 10) - 1] || m;
}

export function SubmissionDiffView({ projectId, onBack }: Props) {
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
        <Skeleton className="h-[300px] w-full" />
      </div>
    );
  }

  if (!data || !data.grid_data) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <p className="text-sm text-slate-400">No comparison data available for this project.</p>
      </div>
    );
  }

  const lineItems = data.grid_data.line_items;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Review Proposed Changes</h2>
          <p className="text-sm text-slate-500">{data.project_name}</p>
        </div>
      </div>

      {/* Feedback card */}
      {data.submission_feedback && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-amber-800">Controller Feedback</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-amber-700">{data.submission_feedback}</p>
          </CardContent>
        </Card>
      )}

      {/* Result message */}
      {result && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          {result}
        </div>
      )}

      {/* Comparison grid */}
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="sticky left-0 z-10 bg-slate-50 px-3 py-1.5 text-left text-xs font-medium text-slate-500 w-[180px] min-w-[180px]">
                  Line Item
                </th>
                {yearGroups.map((yg) => (
                  <th
                    key={yg.year}
                    colSpan={yg.isExpanded ? yg.months.length : 1}
                    className="px-2 py-1.5 text-center text-xs font-medium text-slate-500 cursor-pointer hover:bg-slate-100"
                    onClick={() => toggleYear(yg.year)}
                  >
                    {yg.year} {yg.isExpanded ? '\u25B4' : '\u25BE'}
                  </th>
                ))}
              </tr>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="sticky left-0 z-10 bg-slate-50 px-3 py-1 text-left text-xs text-slate-400" />
                {visibleColumns.map((col) =>
                  col.type === 'month' ? (
                    <th key={col.key} className="px-2 py-1 text-center text-xs text-slate-400 min-w-[80px]">
                      {monthLabel(col.key)}
                    </th>
                  ) : (
                    <th key={`ys-${col.year}`} className="px-2 py-1 text-center text-xs text-slate-400 min-w-[80px]">
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
      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-green-100 border border-green-300" />
          Reduction
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-red-100 border border-red-300" />
          Increase
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-blue-100 border border-blue-300" />
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
    <tr className="border-b border-slate-100">
      <td className="sticky left-0 z-10 bg-white px-3 py-2 text-sm text-slate-700 whitespace-nowrap">
        {item.name}
      </td>
      {visibleColumns.map((col) => {
        if (col.type === 'yearSummary') {
          // Sum for collapsed year
          const yearCells = item.months.filter((m) => col.months.includes(m.month));
          const currentSum = yearCells.reduce((s, c) => s + (isInternal ? c.current : c.current_eur), 0);
          const proposedSum = yearCells.reduce((s, c) => s + (isInternal ? c.proposed : c.proposed_eur), 0);
          const hasChange = yearCells.some((c) => c.is_changed);
          return (
            <td key={`ys-${col.year}`} className="px-2 py-2 text-center">
              {hasChange ? (
                <div className="text-xs">
                  <div className="text-slate-400 line-through">{formatNumber(currentSum)}</div>
                  <div className="font-medium text-slate-700">{formatNumber(proposedSum)}</div>
                </div>
              ) : (
                <span className="text-xs text-slate-500">
                  {currentSum > 0 ? formatNumber(currentSum) : '\u2014'}
                </span>
              )}
            </td>
          );
        }

        const cell = item.months.find((m) => m.month === col.key);
        if (!cell) {
          return <td key={col.key} className="px-2 py-2 text-center text-xs text-slate-300">{'\u2014'}</td>;
        }

        const currentVal = isInternal ? cell.current : cell.current_eur;
        const proposedVal = isInternal ? cell.proposed : cell.proposed_eur;

        if (!cell.is_changed) {
          return (
            <td key={col.key} className="px-2 py-2 text-center text-xs text-slate-500">
              {currentVal > 0 ? formatNumber(currentVal) : '\u2014'}
            </td>
          );
        }

        // Determine change color
        const diff = proposedVal - currentVal;
        let bgClass = 'bg-blue-50'; // default: other change
        if (diff < 0) bgClass = 'bg-green-50'; // reduction
        else if (diff > 0) bgClass = 'bg-red-50'; // increase

        return (
          <td key={col.key} className={`px-2 py-1 text-center ${bgClass}`}>
            <div className="text-[10px] text-slate-400 line-through">
              {currentVal > 0 ? formatNumber(currentVal) : '\u2014'}
            </div>
            <div className="text-xs font-medium text-slate-700">
              {proposedVal > 0 ? formatNumber(proposedVal) : '0'}
            </div>
          </td>
        );
      })}
    </tr>
  );
}
