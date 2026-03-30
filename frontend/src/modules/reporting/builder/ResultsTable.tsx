import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrencyDetailed, formatNumber, formatPercent } from '@/lib/formatters';
import type { ReportExecuteResponse, ColumnMeta } from '@/types/reportBuilder';

interface ResultsTableProps {
  results: ReportExecuteResponse;
  isStale: boolean;
}

function formatCell(value: string | number | null | undefined, col: ColumnMeta): string {
  if (value === null || value === undefined || value === '') return '—';
  if (col.type === 'dimension') return String(value);

  const num = typeof value === 'number' ? value : parseFloat(String(value));
  if (isNaN(num)) return String(value);

  switch (col.format) {
    case 'currency':
      return formatCurrencyDetailed(num);
    case 'percent':
      return formatPercent(num);
    case 'hours':
      return `${formatNumber(num)} h`;
    case 'number':
      return formatNumber(num);
    default:
      return formatNumber(num);
  }
}

export function ResultsTable({ results, isStale }: ResultsTableProps) {
  if (results.rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <p className="text-sm">No data found for the selected combination.</p>
        <p className="text-xs mt-1">Try adjusting your filters or adding different dimensions.</p>
      </div>
    );
  }

  const dimCols = results.columns.filter((c) => c.type === 'dimension');
  const measureCols = results.columns.filter((c) => c.type === 'measure');

  return (
    <div className={`relative ${isStale ? 'opacity-50' : ''}`}>
      {isStale && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <span className="bg-background/90 border border-border rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground">
            Results are stale — click Run Report to refresh
          </span>
        </div>
      )}
      <div className="overflow-auto max-h-[calc(100vh-400px)] border border-border rounded-md">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              {dimCols.map((col) => (
                <TableHead
                  key={col.id}
                  className="text-xs font-semibold whitespace-nowrap sticky top-0 bg-muted/50 z-10"
                >
                  {col.name}
                </TableHead>
              ))}
              {measureCols.map((col) => (
                <TableHead
                  key={col.id}
                  className="text-xs font-semibold whitespace-nowrap text-right sticky top-0 bg-muted/50 z-10"
                >
                  {col.name}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.rows.map((row, idx) => (
              <TableRow key={idx} className="hover:bg-accent/30">
                {dimCols.map((col) => (
                  <TableCell key={col.id} className="text-xs whitespace-nowrap py-1.5">
                    {formatCell(row[col.id], col)}
                  </TableCell>
                ))}
                {measureCols.map((col) => (
                  <TableCell
                    key={col.id}
                    className="text-xs whitespace-nowrap text-right font-mono py-1.5"
                  >
                    {formatCell(row[col.id], col)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="mt-2 text-xs text-muted-foreground">
        {results.total_rows} row{results.total_rows !== 1 ? 's' : ''}
        {results.warnings.length > 0 && (
          <span className="ml-3 text-amber-600 dark:text-amber-400">
            {results.warnings.join(' | ')}
          </span>
        )}
      </div>
    </div>
  );
}
