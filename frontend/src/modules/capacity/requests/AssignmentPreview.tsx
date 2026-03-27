import { cn } from '@/lib/utils';
import type { AssignmentPreview as PreviewType } from '@/types/api';

const COLOR_MAP: Record<string, string> = {
  blue: 'text-blue-600 dark:text-blue-400',
  green: 'text-green-600 dark:text-green-400',
  amber: 'text-amber-600 dark:text-amber-400',
  red: 'text-red-600 dark:text-red-400',
};

function utilColor(pct: number): string {
  if (pct > 100) return 'red';
  if (pct >= 90) return 'amber';
  if (pct >= 70) return 'green';
  return 'blue';
}

interface AssignmentPreviewProps {
  data: PreviewType;
}

export function AssignmentPreviewView({ data }: AssignmentPreviewProps) {
  return (
    <div className="space-y-3 rounded-md border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-foreground">
          Assignment Preview — {data.person_name}
        </h4>
        {data.exceeds_100_pct && (
          <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
            Over-allocation
          </span>
        )}
      </div>

      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            <th className="px-2 py-1.5 text-left text-muted-foreground font-medium">Month</th>
            <th className="px-2 py-1.5 text-right text-muted-foreground font-medium">Current</th>
            <th className="px-2 py-1.5 text-right text-muted-foreground font-medium">+ Added</th>
            <th className="px-2 py-1.5 text-right text-muted-foreground font-medium">Total</th>
            <th className="px-2 py-1.5 text-right text-muted-foreground font-medium">Utilization</th>
          </tr>
        </thead>
        <tbody>
          {data.monthly_projections.map((p) => {
            const color = utilColor(p.utilization_pct);
            return (
              <tr key={p.month} className="border-b border-border/50">
                <td className="px-2 py-1.5 text-muted-foreground">{p.month}</td>
                <td className="px-2 py-1.5 text-right text-muted-foreground">{p.current_hours}h</td>
                <td className="px-2 py-1.5 text-right text-primary">+{p.added_hours}h</td>
                <td className="px-2 py-1.5 text-right text-foreground font-medium">{p.total_hours}h</td>
                <td className={cn('px-2 py-1.5 text-right font-medium', COLOR_MAP[color])}>
                  {p.utilization_pct.toFixed(0)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className={cn(
        'text-xs',
        data.exceeds_100_pct ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400',
      )}>
        {data.recommendation}
      </p>
    </div>
  );
}
