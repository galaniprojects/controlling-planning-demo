/**
 * Category breakdown table for the Workbench External Costs tab.
 *
 * v5.1 C-09 lead pre-work — extracted from `ExternalCostsTab.tsx`. No
 * behavioural change. Section 4 of the C-09 spec is "no changes" so this
 * component should not require Teammate edits in Wave 5; the extraction
 * exists purely to give the tab a clean orchestrator shape.
 */
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import type { ProjectCategoryRollupRow } from '@/types/api';

interface Props {
  categories: ProjectCategoryRollupRow[];
  categoryFilter: string | null;
  onSetCategoryFilter: (name: string | null) => void;
}

export function CategoryBreakdownTable({
  categories,
  categoryFilter,
  onSetCategoryFilter,
}: Props) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">By cost category</h3>
        {categoryFilter && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7"
            onClick={() => onSetCategoryFilter(null)}
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Clear category filter
          </Button>
        )}
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead className="text-right w-32">Forecast</TableHead>
              <TableHead className="text-right w-32">Actuals</TableHead>
              <TableHead className="text-right w-32">Variance</TableHead>
              <TableHead className="text-right w-24">Vendors</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((c) => {
              const isActive = categoryFilter === c.cost_type_name;
              return (
                <TableRow
                  key={c.cost_type_id}
                  className={cn(
                    'cursor-pointer',
                    isActive ? 'bg-accent' : 'hover:bg-accent/40',
                  )}
                  onClick={() =>
                    onSetCategoryFilter(isActive ? null : c.cost_type_name)
                  }
                >
                  <TableCell className="font-medium text-foreground">
                    {c.cost_type_name}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(c.forecast_total)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatCurrency(c.actuals_total)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right tabular-nums',
                      c.variance > 0
                        ? 'text-amber-700 dark:text-amber-400'
                        : c.variance < 0
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-muted-foreground',
                    )}
                  >
                    {formatCurrency(c.variance)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.vendor_count}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
      <p className="text-[11px] text-muted-foreground">
        Click a category row to filter the vendor list below.
      </p>
    </section>
  );
}
