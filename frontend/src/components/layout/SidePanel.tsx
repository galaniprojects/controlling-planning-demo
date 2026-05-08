import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { DEFAULT_SIDE_PANEL_WIDTH } from '@/lib/sidePanelConstants';

interface SidePanelProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
  /**
   * Optional width override in px. Defaults to
   * {@link DEFAULT_SIDE_PANEL_WIDTH} (380) — preserved for all
   * pre-v5.2 surfaces that do not pass a custom width via
   * `openPanel(..., { width })`.
   */
  width?: number;
}

export function SidePanel({
  title,
  children,
  onClose,
  width = DEFAULT_SIDE_PANEL_WIDTH,
}: SidePanelProps) {
  return (
    <aside
      className="fixed right-0 top-14 bottom-0 border-l border-border bg-card shadow-lg z-40 overflow-y-auto"
      style={{ width: `${width}px` }}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0">
          &times;
        </Button>
      </div>
      <div className="p-4">{children}</div>
    </aside>
  );
}
