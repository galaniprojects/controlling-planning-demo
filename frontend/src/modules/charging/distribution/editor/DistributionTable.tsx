/**
 * Distribution table shell — column headers + row slots + empty-state.
 * Composes DistributionRow + ToBusinessRow + SelfRetainedRow.
 */
import type { ReactNode } from 'react';

interface Props {
  /** DistributionRow elements. */
  rows: ReactNode;
  /** Single ToBusinessRow element. */
  toBusinessRow: ReactNode;
  /** Single SelfRetainedRow element. */
  selfRetainedRow: ReactNode;
  /** Rendered below the table when zero distribution rows are visible. */
  emptyState?: ReactNode;
  /** Whether any visible distribution rows are present (drives empty-state). */
  hasDistributionRows: boolean;
}

export function DistributionTable({
  rows,
  toBusinessRow,
  selfRetainedRow,
  emptyState,
  hasDistributionRows,
}: Props) {
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <table className="w-full">
        <thead className="bg-muted/40">
          <tr className="border-b border-border">
            <th className="text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium py-2 px-3">
              Destination
            </th>
            <th className="text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium py-2 px-3 w-[140px]">
              Percentage
            </th>
            <th className="text-right text-[11px] uppercase tracking-wider text-muted-foreground font-medium py-2 px-3 w-[160px]">
              Amount
            </th>
            <th className="text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium py-2 px-3 w-[110px]">
              Depth
            </th>
            <th className="text-right text-[11px] uppercase tracking-wider text-muted-foreground font-medium py-2 px-3 w-[80px]" />
          </tr>
        </thead>
        <tbody>
          {hasDistributionRows ? rows : null}
          {!hasDistributionRows && emptyState && (
            <tr>
              <td colSpan={5} className="py-6 px-3 text-center text-sm text-muted-foreground">
                {emptyState}
              </td>
            </tr>
          )}
          {toBusinessRow}
          {selfRetainedRow}
        </tbody>
      </table>
    </div>
  );
}
