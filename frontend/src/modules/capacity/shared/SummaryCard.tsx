import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SummaryCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  className?: string;
}

export function SummaryCard({ label, value, icon, className }: SummaryCardProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3',
        className,
      )}
    >
      {icon && <div className="text-slate-400">{icon}</div>}
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-lg font-semibold text-slate-800">{value}</p>
      </div>
    </div>
  );
}
