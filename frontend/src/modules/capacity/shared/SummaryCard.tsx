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
        'flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3',
        className,
      )}
    >
      {icon && <div className="text-muted-foreground">{icon}</div>}
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold text-foreground">{value}</p>
      </div>
    </div>
  );
}
