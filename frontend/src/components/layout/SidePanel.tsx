import { useEffect, useRef, type ReactNode } from 'react';
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
  /**
   * Optional factory that returns the currently-registered before-close
   * guard (or `undefined` if none is registered).  Called at close time
   * so the guard is always current even if it was registered after the
   * panel opened.
   *
   * The guard itself returns `false` to cancel close, `undefined` to allow.
   *
   * v5.2 W4 Track A — used by AssignmentPanel to intercept close when dirty.
   */
  onBeforeClose?: () => ((() => boolean | undefined) | undefined);
}

export function SidePanel({
  title,
  children,
  onClose,
  width = DEFAULT_SIDE_PANEL_WIDTH,
  onBeforeClose,
}: SidePanelProps) {
  const handleClose = () => {
    if (onBeforeClose) {
      const guard = onBeforeClose(); // get the latest guard at click time
      if (guard) {
        const proceed = guard();
        if (proceed === false) return; // cancelled
      }
    }
    onClose();
  };

  // v5.2 W6 Track C — a11y polish: Escape key closes the panel, respecting
  // the same `onBeforeClose` guard used by the close button. Listener is
  // registered while the panel is mounted (panel is rendered conditionally
  // by `SidePanelHost`, so mount == open).
  //
  // We stash `handleClose` in a ref so the keydown listener is bound exactly
  // once but always invokes the latest close handler (which closes over the
  // current `onBeforeClose` / `onClose` props).
  const handleCloseRef = useRef(handleClose);
  handleCloseRef.current = handleClose;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // v5.2 W6 review fix (P2.9) — don't swallow Escape inside text
      // inputs. Some browsers map Escape to "clear input"; if the user
      // is typing in a textarea/search and hits Esc, closing the panel
      // would also wipe the unsaved input. The dirty-guard handles
      // AssignmentPanel, but ad-hoc inputs in other panels need this.
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"]')) {
        return;
      }
      // Stop other keydown handlers on the page from also reacting.
      event.stopPropagation();
      handleCloseRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <aside
      // v5.2 W6 Track C — width transition for assignment-mode entry/exit.
      // Capacity panels swap between 280px (person/cell/project_summary)
      // and 400px (assignment) per `CAPACITY_PANEL_WIDTH`. The
      // 200ms transition keeps the panel from snapping when the user
      // toggles assignment mode (spec §9.2 / §10.8 polish).
      className="fixed right-0 top-14 bottom-0 border-l border-border bg-card shadow-lg z-40 overflow-y-auto transition-[width] duration-200 ease-out"
      style={{ width: `${width}px` }}
      role="dialog"
      aria-label={title}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <Button variant="ghost" size="sm" onClick={handleClose} className="h-7 w-7 p-0">
          &times;
        </Button>
      </div>
      <div className="p-4">{children}</div>
    </aside>
  );
}
