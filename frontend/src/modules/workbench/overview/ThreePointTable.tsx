import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import type { ThreePointComparison } from '@/types/api';

interface Props {
  data: ThreePointComparison;
}

function varianceColor(pct: number): string {
  const abs = Math.abs(pct);
  if (abs > 10) return 'text-red-600';
  if (abs > 5) return 'text-amber-600';
  return 'text-green-600';
}

export function ThreePointTable({ data }: Props) {
  const planDriftPct = data.baseline !== 0
    ? ((data.forecast - data.baseline) / data.baseline) * 100
    : 0;
  const execVarPct = data.forecast !== 0
    ? (data.execution_variance / data.forecast) * 100
    : 0;
  const totalVarPct = data.baseline !== 0
    ? (data.total_variance / data.baseline) * 100
    : 0;

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead className="w-32">Metric</TableHead>
            <TableHead className="text-right">Baseline</TableHead>
            <TableHead className="text-right">Forecast</TableHead>
            <TableHead className="text-right">Actuals</TableHead>
            <TableHead className="text-right">Plan Drift</TableHead>
            <TableHead className="text-right">Exec. Variance</TableHead>
            <TableHead className="text-right">Total Variance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell className="font-medium text-slate-700">
              Total Cost
            </TableCell>
            <TableCell className="text-right">
              {formatCurrency(data.baseline)}
            </TableCell>
            <TableCell className="text-right">
              {formatCurrency(data.forecast)}
            </TableCell>
            <TableCell className="text-right">
              {formatCurrency(data.actuals)}
            </TableCell>
            <TableCell className="text-right">
              <div>
                <span className={cn('font-medium', varianceColor(planDriftPct))}>
                  {formatPercent(planDriftPct)}
                </span>
                <span className="block text-xs text-slate-400">
                  {formatCurrency(data.forecast - data.baseline)}
                </span>
              </div>
            </TableCell>
            <TableCell className="text-right">
              <div>
                <span className={cn('font-medium', varianceColor(execVarPct))}>
                  {formatPercent(execVarPct)}
                </span>
                <span className="block text-xs text-slate-400">
                  {formatCurrency(data.execution_variance)}
                </span>
              </div>
            </TableCell>
            <TableCell className="text-right">
              <div>
                <span className={cn('font-medium', varianceColor(totalVarPct))}>
                  {formatPercent(totalVarPct)}
                </span>
                <span className="block text-xs text-slate-400">
                  {formatCurrency(data.total_variance)}
                </span>
              </div>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
