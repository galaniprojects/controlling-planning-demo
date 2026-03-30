import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

interface SidePanelProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
}

export function SidePanel({ title, children, onClose }: SidePanelProps) {
  return (
    <aside className="fixed right-0 top-14 bottom-0 w-[380px] border-l border-border bg-card shadow-lg z-40 overflow-y-auto">
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
