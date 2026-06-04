/**
 * WideSlideOver — v5.2 W6 Track B (S11 §13.9)
 *
 * Shared right-side slide-over primitive sized for browsing-style content
 * (≈50vw, clamped to 600–900px). Opens with a CSS slide-in transition,
 * dims the rest of the screen with a backdrop, traps focus while open,
 * and restores focus to the previously-active element on close.
 *
 * Dismissal:
 *   - Escape key
 *   - × close button
 *   - Backdrop click
 *
 * Spec §13.9 — "The panel slides in from the right, covering 50% of the
 * viewport width. The Workbench remains visible on the left (dimmed
 * slightly)."
 *
 * This primitive is intentionally orthogonal to the existing 380px
 * `SidePanel` — they cover different use cases and can both be open
 * (although in practice the slide-over is opened from the workbench
 * where no app-side panel is showing).
 */
import { useEffect, useRef, type ReactNode } from 'react';

interface WideSlideOverProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

const WIDTH_CSS = 'min(900px, max(600px, 50vw))';

export function WideSlideOver({
  open,
  title,
  onClose,
  children,
}: WideSlideOverProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  // Restore focus to whichever element was focused before we opened.
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // Escape-to-close + focus management + body scroll lock.
  useEffect(() => {
    if (!open) return;

    restoreFocusRef.current =
      (document.activeElement as HTMLElement | null) ?? null;

    // v5.2 W6 review fix (P1.4) — lock body scroll while the slide-over
    // is open. Without this, mouse-wheel over the visible workbench (left
    // half) scrolls the page underneath even though clicks are
    // intercepted by the backdrop, which is disorienting because the
    // backdrop visually masks the scroll.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // v5.2 W6 review-pass-2 (P3.B) — stack interaction note.
        // This listener is on `document`, the SidePanel listener is on
        // `window`; document fires first and `stopPropagation()` here
        // blocks `window` from also firing. So if both panels are open
        // when the user presses Escape, only the slide-over closes.
        // That is the intended layering (the slide-over is the
        // "front-most" UI; closing it returns focus to the workbench
        // and any background panels remain in place).
        e.stopPropagation();
        onClose();
        return;
      }
      // Lightweight focus trap — keep Tab inside the panel while open.
      if (e.key === 'Tab' && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    // Move focus into the panel after the slide-in completes.
    // Defer one frame so the element is mounted + visible.
    const focusTimer = window.setTimeout(() => {
      if (!panelRef.current) return;
      const firstFocusable = panelRef.current.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (firstFocusable) firstFocusable.focus();
      else panelRef.current.focus();
    }, 50);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      // Restore focus to the trigger element on close.
      const toFocus = restoreFocusRef.current;
      restoreFocusRef.current = null;
      if (toFocus && typeof toFocus.focus === 'function') {
        // Use rAF so React commit settles before we move focus.
        requestAnimationFrame(() => toFocus.focus());
      }
    };
  }, [open, onClose]);

  // a11y: keep the panel mounted (so the open/close slide transition still
  // runs) but strip its dialog semantics while closed. Leaving `role="dialog"`
  // on a permanently-mounted, off-screen panel left an empty, nameless dialog
  // in the accessibility tree even when dismissed; `inert` + `aria-hidden`
  // pull the closed panel out of the a11y tree and block focus on its
  // off-screen controls, without unmounting (which would kill the exit slide).
  return (
    <>
      {/* Backdrop (dim the workbench behind) */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={
          'fixed inset-0 z-40 bg-black/30 transition-opacity duration-200 ' +
          (open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none')
        }
      />
      {/* Panel */}
      <aside
        ref={panelRef}
        role={open ? 'dialog' : undefined}
        aria-modal={open ? true : undefined}
        aria-label={open ? title : undefined}
        aria-hidden={open ? undefined : true}
        inert={!open}
        tabIndex={-1}
        className={
          'fixed right-0 top-14 bottom-0 z-50 border-l border-border bg-background shadow-2xl ' +
          'flex flex-col overflow-hidden transform transition-transform duration-200 ease-out ' +
          (open ? 'translate-x-0' : 'translate-x-full pointer-events-none')
        }
        style={{ width: WIDTH_CSS }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-card px-5 py-3 shrink-0">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="text-muted-foreground hover:text-foreground rounded p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto bg-background">
          {children}
        </div>
      </aside>
    </>
  );
}
