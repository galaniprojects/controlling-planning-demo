import {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { DEFAULT_SIDE_PANEL_WIDTH } from '@/lib/sidePanelConstants';

interface OpenPanelOptions {
  /**
   * Optional pixel width override for the side panel. Defaults to
   * {@link DEFAULT_SIDE_PANEL_WIDTH} (380px) when omitted.
   *
   * v5.2 Capacity uses 280 (PersonDetail / CellDetail) and 400
   * (AssignmentPanel) per spec §7.1 and §9.2.
   */
  width?: number;
}

interface SidePanelState {
  isOpen: boolean;
  content: ReactNode | null;
  title: string;
  /** Current panel width in px (defaults to 380 when no override is set). */
  width: number;
  openPanel: (
    title: string,
    content: ReactNode,
    opts?: OpenPanelOptions,
  ) => void;
  closePanel: () => void;
  /**
   * Register a before-close guard.  The guard is called when the × button
   * is clicked; return `false` to cancel the close.  Returns an unregister
   * function.
   *
   * v5.2 W4 Track A — used by AssignmentPanel to intercept close when dirty.
   */
  registerBeforeClose: (guard: () => boolean | undefined) => () => void;
  /**
   * Returns the currently registered before-close guard (or undefined).
   * Called by AppLayout to pass to the SidePanel component's × button.
   */
  getBeforeCloseGuard: () => (() => boolean | undefined) | undefined;
}

const SidePanelCtx = createContext<SidePanelState | null>(null);

export function SidePanelProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [content, setContent] = useState<ReactNode | null>(null);
  const [title, setTitle] = useState('');
  const [width, setWidth] = useState<number>(DEFAULT_SIDE_PANEL_WIDTH);
  const beforeCloseRef = useRef<(() => boolean | undefined) | undefined>(undefined);

  const openPanel = useCallback(
    (t: string, node: ReactNode, opts?: OpenPanelOptions) => {
      setTitle(t);
      setContent(node);
      setWidth(opts?.width ?? DEFAULT_SIDE_PANEL_WIDTH);
      setIsOpen(true);
    },
    [],
  );

  const closePanel = useCallback(() => {
    setIsOpen(false);
    setContent(null);
    setTitle('');
    setWidth(DEFAULT_SIDE_PANEL_WIDTH);
    beforeCloseRef.current = undefined;
  }, []);

  const registerBeforeClose = useCallback(
    (guard: () => boolean | undefined) => {
      beforeCloseRef.current = guard;
      return () => {
        if (beforeCloseRef.current === guard) {
          beforeCloseRef.current = undefined;
        }
      };
    },
    [],
  );

  const getBeforeCloseGuard = useCallback(
    () => beforeCloseRef.current,
    [],
  );

  return (
    <SidePanelCtx.Provider
      value={{
        isOpen,
        content,
        title,
        width,
        openPanel,
        closePanel,
        registerBeforeClose,
        getBeforeCloseGuard,
      }}
    >
      {children}
    </SidePanelCtx.Provider>
  );
}

export function useSidePanel() {
  const ctx = useContext(SidePanelCtx);
  if (!ctx) throw new Error('useSidePanel must be used inside SidePanelProvider');
  return ctx;
}
