import type { ReactNode } from 'react';
import { TopBar } from './TopBar';
import { SidePanel } from './SidePanel';
import { BottomDrawer } from './BottomDrawer';
import { useSidePanel } from '@/contexts/SidePanelContext';
import { useBottomDrawer } from '@/contexts/BottomDrawerContext';

export function AppLayout({ children }: { children: ReactNode }) {
  const { isOpen: sidePanelOpen, title: sidePanelTitle, content: sidePanelContent, closePanel } =
    useSidePanel();
  const {
    isOpen: drawerOpen,
    title: drawerTitle,
    content: drawerContent,
    closeDrawer,
  } = useBottomDrawer();

  return (
    <div className="min-h-screen bg-slate-50">
      <TopBar />
      <div className="flex">
        <main
          className={`flex-1 transition-all duration-300 ${sidePanelOpen ? 'mr-[380px]' : ''}`}
        >
          {children}
        </main>
        {sidePanelOpen && (
          <SidePanel title={sidePanelTitle} onClose={closePanel}>
            {sidePanelContent}
          </SidePanel>
        )}
      </div>
      <BottomDrawer title={drawerTitle} open={drawerOpen} onClose={closeDrawer}>
        {drawerContent}
      </BottomDrawer>
    </div>
  );
}
