import type { ReactNode } from 'react';
import { TopBar } from './TopBar';
import { SidePanel } from './SidePanel';
import { BottomDrawer } from './BottomDrawer';
import { WideSlideOver } from '@/components/shared/WideSlideOver';
import { useSidePanel } from '@/contexts/SidePanelContext';
import { useBottomDrawer } from '@/contexts/BottomDrawerContext';
import { useWideSlideOver } from '@/contexts/WideSlideOverContext';

export function AppLayout({ children }: { children: ReactNode }) {
  const {
    isOpen: sidePanelOpen,
    title: sidePanelTitle,
    content: sidePanelContent,
    width: sidePanelWidth,
    closePanel,
    getBeforeCloseGuard,
  } = useSidePanel();
  const {
    isOpen: drawerOpen,
    title: drawerTitle,
    content: drawerContent,
    closeDrawer,
  } = useBottomDrawer();
  const {
    isOpen: slideOverOpen,
    title: slideOverTitle,
    content: slideOverContent,
    closeSlideOver,
  } = useWideSlideOver();

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <div className="flex">
        <main
          className="flex-1 min-w-0 overflow-hidden transition-[margin] duration-300"
          style={{ marginRight: sidePanelOpen ? `${sidePanelWidth}px` : 0 }}
        >
          {children}
        </main>
        {sidePanelOpen && (
          <SidePanel
            title={sidePanelTitle}
            onClose={closePanel}
            width={sidePanelWidth}
            onBeforeClose={getBeforeCloseGuard}
          >
            {sidePanelContent}
          </SidePanel>
        )}
      </div>
      <BottomDrawer title={drawerTitle} open={drawerOpen} onClose={closeDrawer}>
        {drawerContent}
      </BottomDrawer>
      <WideSlideOver
        title={slideOverTitle}
        open={slideOverOpen}
        onClose={closeSlideOver}
      >
        {slideOverContent}
      </WideSlideOver>
    </div>
  );
}
