import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import type { RetrospectiveItem } from '@/types/api';
import { AlertTriangle } from 'lucide-react';

interface Props {
  retrospective: RetrospectiveItem[];
  skippable: boolean;
  explanations: Record<string, string>;
  nameMap: Record<string, string>;
  onSetExplanation: (key: string, text: string) => void;
  onAcknowledge: () => void;
  onSkip: () => void;
  loading: boolean;
}

export function Phase1Retrospective({
  retrospective,
  skippable,
  explanations,
  nameMap,
  onSetExplanation,
  onAcknowledge,
  onSkip,
  loading,
}: Props) {
  const flaggedItems = retrospective.filter((r) => r.significant);
  const allExplained = flaggedItems.every((r) => {
    const key = `${r.category}:${r.sub_category}`;
    return explanations[key]?.trim();
  });

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-slate-800">
          Phase 1: Retrospective
        </h3>
        <p className="text-sm text-slate-500 mt-1">
          Review last month's forecast vs actuals. Explain any significant
          variances (&gt;10%).
        </p>
      </div>

      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Line Item</TableHead>
              <TableHead className="text-right">Forecast</TableHead>
              <TableHead className="text-right">Actual</TableHead>
              <TableHead className="text-right">Variance</TableHead>
              <TableHead className="text-right">Var %</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {retrospective.map((item) => {
              const key = `${item.category}:${item.sub_category}`;
              return (
                <TableRow
                  key={key}
                  className={cn(
                    item.significant && 'bg-amber-50',
                  )}
                >
                  <TableCell className="font-medium text-sm">
                    {nameMap[item.sub_category] || item.sub_category}
                    <span className="ml-1.5 text-xs text-slate-400 capitalize">
                      ({item.category === 'internal' ? 'Internal' : 'External'})
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {formatCurrency(item.forecast)}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {formatCurrency(item.actual)}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {formatCurrency(item.variance)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right text-sm font-medium',
                      Math.abs(item.variance_pct) > 10
                        ? 'text-red-600'
                        : Math.abs(item.variance_pct) > 5
                          ? 'text-amber-600'
                          : 'text-green-600',
                    )}
                  >
                    {formatPercent(item.variance_pct)}
                  </TableCell>
                  <TableCell>
                    {item.significant && (
                      <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                        <AlertTriangle className="h-3 w-3 mr-0.5" />
                        Flag
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Explanation inputs for flagged items */}
      {flaggedItems.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-600">
            Please explain the flagged variances:
          </p>
          {flaggedItems.map((item) => {
            const key = `${item.category}:${item.sub_category}`;
            return (
              <div key={key} className="space-y-1">
                <label className="text-xs font-medium text-slate-500">
                  {nameMap[item.sub_category] || item.sub_category} ({formatPercent(item.variance_pct)}
                  {' '}variance)
                </label>
                <Textarea
                  rows={2}
                  placeholder="Explain the variance..."
                  value={explanations[key] || ''}
                  onChange={(e) => onSetExplanation(key, e.target.value)}
                />
              </div>
            );
          })}
        </div>
      )}

      <div className="flex gap-2">
        <Button
          onClick={onAcknowledge}
          disabled={loading || (!allExplained && flaggedItems.length > 0)}
        >
          {loading ? 'Processing...' : 'Acknowledge & Continue'}
        </Button>
        {skippable && (
          <Button variant="outline" onClick={onSkip} disabled={loading}>
            Skip
          </Button>
        )}
      </div>
    </div>
  );
}
