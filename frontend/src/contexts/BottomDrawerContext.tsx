import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';

interface BottomDrawerState {
  isOpen: boolean;
  content: ReactNode | null;
  title: string;
  openDrawer: (title: string, content: ReactNode) => void;
  closeDrawer: () => void;
}

const BottomDrawerCtx = createContext<BottomDrawerState | null>(null);

export function BottomDrawerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [content, setContent] = useState<ReactNode | null>(null);
  const [title, setTitle] = useState('');

  const openDrawer = useCallback((t: string, node: ReactNode) => {
    setTitle(t);
    setContent(node);
    setIsOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setIsOpen(false);
    setContent(null);
    setTitle('');
  }, []);

  return (
    <BottomDrawerCtx.Provider value={{ isOpen, content, title, openDrawer, closeDrawer }}>
      {children}
    </BottomDrawerCtx.Provider>
  );
}

export function useBottomDrawer() {
  const ctx = useContext(BottomDrawerCtx);
  if (!ctx) throw new Error('useBottomDrawer must be used inside BottomDrawerProvider');
  return ctx;
}
