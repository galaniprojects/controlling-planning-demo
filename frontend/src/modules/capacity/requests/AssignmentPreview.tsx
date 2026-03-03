import { cn } from '@/lib/utils';
import type { AssignmentPreview as PreviewType } from '@/types/api';

const COLOR_MAP: Record<string, string> = {
  blue: 'text-blue-600',
  green: 'text-green-600',
  amber: 'text-amber-600',
  red: 'text-red-600',
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
    <div className="space-y-3 rounded-md border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-slate-700">
          Assignment Preview — {data.person_name}
        </h4>
        {data.exceeds_100_pct && (
          <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
            Over-allocation
          </span>
        )}
      </div>

      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="px-2 py-1.5 text-left text-slate-500 font-medium">Month</th>
            <th className="px-2 py-1.5 text-right text-slate-500 font-medium">Current</th>
            <th className="px-2 py-1.5 text-right text-slate-500 font-medium">+ Added</th>
            <th className="px-2 py-1.5 text-right text-slate-500 font-medium">Total</th>
            <th className="px-2 py-1.5 text-right text-slate-500 font-medium">Utilization</th>
          </tr>
        </thead>
        <tbody>
          {data.monthly_projections.map((p) => {
            const color = utilColor(p.utilization_pct);
            return (
              <tr key={p.month} className="border-b border-slate-50">
                <td className="px-2 py-1.5 text-slate-600">{p.month}</td>
                <td className="px-2 py-1.5 text-right text-slate-600">{p.current_hours}h</td>
                <td className="px-2 py-1.5 text-right text-blue-600">+{p.added_hours}h</td>
                <td className="px-2 py-1.5 text-right text-slate-700 font-medium">{p.total_hours}h</td>
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
        data.exceeds_100_pct ? 'text-red-600' : 'text-green-600',
      )}>
        {data.recommendation}
      </p>
    </div>
  );
}
