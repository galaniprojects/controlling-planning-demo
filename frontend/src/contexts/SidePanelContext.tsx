import {
  createContext,
  useContext,
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
}

const SidePanelCtx = createContext<SidePanelState | null>(null);

export function SidePanelProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [content, setContent] = useState<ReactNode | null>(null);
  const [title, setTitle] = useState('');
  const [width, setWidth] = useState<number>(DEFAULT_SIDE_PANEL_WIDTH);

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
  }, []);

  return (
    <SidePanelCtx.Provider
      value={{ isOpen, content, title, width, openPanel, closePanel }}
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
