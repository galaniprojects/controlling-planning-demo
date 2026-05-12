/**
 * WideSlideOverContext — v5.2 W6 Track B (S11 §13.9)
 *
 * Render-slot context for the wide (≈50vw) right-side slide-over panel
 * used by the Workbench → "Check availability" flow.
 *
 * Mirrors the API shape of {@link BottomDrawerContext}. The render slot
 * lives in `AppLayout`; consumers call `openSlideOver(title, content)` to
 * open it and `closeSlideOver()` to dismiss programmatically (× / Escape /
 * backdrop click also dismiss).
 *
 * Orthogonal to {@link SidePanelContext} — the existing 280/380/400 px
 * `SidePanel` keeps doing what it does; the wide slide-over is its own
 * primitive sized for browsing-style content (grids, KPI strips).
 */
import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';

interface WideSlideOverState {
  isOpen: boolean;
  content: ReactNode | null;
  title: string;
  openSlideOver: (title: string, content: ReactNode) => void;
  closeSlideOver: () => void;
}

const WideSlideOverCtx = createContext<WideSlideOverState | null>(null);

export function WideSlideOverProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [content, setContent] = useState<ReactNode | null>(null);
  const [title, setTitle] = useState('');

  const openSlideOver = useCallback((t: string, node: ReactNode) => {
    setTitle(t);
    setContent(node);
    setIsOpen(true);
  }, []);

  const closeSlideOver = useCallback(() => {
    setIsOpen(false);
    setContent(null);
    setTitle('');
  }, []);

  return (
    <WideSlideOverCtx.Provider
      value={{ isOpen, content, title, openSlideOver, closeSlideOver }}
    >
      {children}
    </WideSlideOverCtx.Provider>
  );
}

export function useWideSlideOver() {
  const ctx = useContext(WideSlideOverCtx);
  if (!ctx)
    throw new Error('useWideSlideOver must be used inside WideSlideOverProvider');
  return ctx;
}
