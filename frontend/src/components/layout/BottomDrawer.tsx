import type { ReactNode } from 'react';

interface BottomDrawerProps {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function BottomDrawer({ title, open, onClose, children }: BottomDrawerProps) {
  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 h-[40vh] rounded-t-lg border-t border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-3">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            &times;
          </button>
        </div>
        <div
          className="overflow-y-auto p-6"
          style={{ maxHeight: 'calc(40vh - 48px)' }}
        >
          {children}
        </div>
      </div>
    </>
  );
}
