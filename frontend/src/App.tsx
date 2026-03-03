import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { RoleProvider } from '@/contexts/RoleContext';
import { SidePanelProvider } from '@/contexts/SidePanelContext';
import { BottomDrawerProvider } from '@/contexts/BottomDrawerContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Launchpad } from '@/modules/launchpad/Launchpad';
import { PortfolioOverview } from '@/modules/portfolio/PortfolioOverview';
import { PlaceholderModule } from '@/components/layout/PlaceholderModule';

export default function App() {
  return (
    <BrowserRouter>
      <RoleProvider>
        <SidePanelProvider>
          <BottomDrawerProvider>
            <AppLayout>
              <Routes>
                <Route path="/" element={<Launchpad />} />
                <Route path="/portfolio/*" element={<PortfolioOverview />} />
                <Route path="/workbench/*" element={<PlaceholderModule name="Project Workbench" />} />
                <Route path="/capacity/*" element={<PlaceholderModule name="Capacity Management" />} />
                <Route path="/simulator/*" element={<PlaceholderModule name="What-If Simulator" />} />
                <Route path="/admin/*" element={<PlaceholderModule name="Administration" />} />
              </Routes>
            </AppLayout>
          </BottomDrawerProvider>
        </SidePanelProvider>
      </RoleProvider>
    </BrowserRouter>
  );
}
