import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';

interface SidePanelState {
  isOpen: boolean;
  content: ReactNode | null;
  title: string;
  openPanel: (title: string, content: ReactNode) => void;
  closePanel: () => void;
}

const SidePanelCtx = createContext<SidePanelState | null>(null);

export function SidePanelProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [content, setContent] = useState<ReactNode | null>(null);
  const [title, setTitle] = useState('');

  const openPanel = useCallback((t: string, node: ReactNode) => {
    setTitle(t);
    setContent(node);
    setIsOpen(true);
  }, []);

  const closePanel = useCallback(() => {
    setIsOpen(false);
    setContent(null);
    setTitle('');
  }, []);

  return (
    <SidePanelCtx.Provider value={{ isOpen, content, title, openPanel, closePanel }}>
      {children}
    </SidePanelCtx.Provider>
  );
}

export function useSidePanel() {
  const ctx = useContext(SidePanelCtx);
  if (!ctx) throw new Error('useSidePanel must be used inside SidePanelProvider');
  return ctx;
}
