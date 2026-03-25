import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { RoleProvider } from '@/contexts/RoleContext';
import { SidePanelProvider } from '@/contexts/SidePanelContext';
import { BottomDrawerProvider } from '@/contexts/BottomDrawerContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Launchpad } from '@/modules/launchpad/Launchpad';
import { PortfolioOverview } from '@/modules/portfolio/PortfolioOverview';
import { ProjectWorkbench } from '@/modules/workbench/ProjectWorkbench';
import { CapacityManagement } from '@/modules/capacity/CapacityManagement';
import { WhatIfSimulator } from '@/modules/simulator/WhatIfSimulator';
import { Reporting } from '@/modules/reporting/Reporting';
import { Administration } from '@/modules/admin/Administration';
import { DocumentationHub } from '@/modules/docs/DocumentationHub';
import { ResourcePlanPage } from '@/modules/workbench/submission/ResourcePlanPage';

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
                <Route path="/workbench/new-project/:projectId" element={<ResourcePlanPage />} />
                <Route path="/workbench/*" element={<ProjectWorkbench />} />
                <Route path="/capacity/*" element={<CapacityManagement />} />
                <Route path="/simulator/*" element={<WhatIfSimulator />} />
                <Route path="/reporting/*" element={<Reporting />} />
                <Route path="/admin/*" element={<Administration />} />
                <Route path="/docs/*" element={<DocumentationHub />} />
              </Routes>
            </AppLayout>
          </BottomDrawerProvider>
        </SidePanelProvider>
      </RoleProvider>
    </BrowserRouter>
  );
}
