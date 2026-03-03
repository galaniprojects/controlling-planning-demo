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
      <div className="fixed bottom-0 left-0 right-0 z-50 h-[40vh] rounded-t-lg border-t border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-3">
          <span className="text-sm font-semibold text-slate-700">{title}</span>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
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
