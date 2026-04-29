/**
 * BacklogViewToggle — segmented control: Ranked List | Cube. [A-BK-15][A-BK-19]
 */

import { LayoutList, Grid3X3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ViewMode } from '../BacklogContext';

interface Props {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}

const OPTIONS: { value: ViewMode; label: string; icon: React.ReactNode }[] = [
  { value: 'ranked', label: 'Ranked List', icon: <LayoutList className="size-4" aria-hidden /> },
  { value: 'cube', label: 'Cube', icon: <Grid3X3 className="size-4" aria-hidden /> },
];

export function BacklogViewToggle({ value, onChange }: Props) {
  return (
    <div
      className="inline-flex rounded-md border border-border bg-muted p-0.5"
      role="tablist"
      aria-label="View mode"
    >
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            value === opt.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {opt.icon}
          {opt.label}
        </button>
      ))}
    </div>
  );
}
