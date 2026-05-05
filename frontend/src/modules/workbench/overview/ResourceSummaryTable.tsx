import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatNumber } from '@/lib/formatters';
import type { ResourcePlanSummaryItem } from '@/types/api';

interface Props {
  title: string;
  items: ResourcePlanSummaryItem[];
}

export function ResourceSummaryTable({ title, items }: Props) {
  if (items.length === 0) {
    return (
      <div className="border border-border rounded-lg p-4">
        <h3 className="text-sm font-medium text-muted-foreground mb-2">
          {title}
        </h3>
        <p className="text-sm text-muted-foreground">No resource allocations.</p>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg p-4">
      <h3 className="text-sm font-medium text-muted-foreground mb-2">
        {title}
      </h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Role</TableHead>
            <TableHead className="text-right">Total Hours</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.role_id}>
              <TableCell className="text-sm">{item.role_name}</TableCell>
              <TableCell className="text-sm text-right">
                {formatNumber(item.total_hours)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
