import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { RoleProvider } from '@/contexts/RoleContext';
import { SidePanelProvider } from '@/contexts/SidePanelContext';
import { BottomDrawerProvider } from '@/contexts/BottomDrawerContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Launchpad } from '@/modules/launchpad/Launchpad';
import { PortfolioOverview } from '@/modules/portfolio/PortfolioOverview';
// === v5 Wave 5 E6 — full-page Portfolio project detail [E-03a..g] ===
import { ProjectDetailPage } from '@/modules/portfolio/detail/ProjectDetailPage';
import { ProjectWorkbench } from '@/modules/workbench/ProjectWorkbench';
import { CapacityManagement } from '@/modules/capacity/CapacityManagement';
// === v5 Cluster B Session B2 — full simulator rebuild [B-AC-01..03] ===
import { SimulatorRouter } from '@/modules/simulator/SimulatorRouter';
import { Reporting } from '@/modules/reporting/Reporting';
import { Administration } from '@/modules/admin/Administration';
import { DocumentationHub } from '@/modules/docs/DocumentationHub';
import { ResourcePlanPage } from '@/modules/workbench/submission/ResourcePlanPage';
// === Backlog (A6) — replaces A7's BacklogDetailStub ===
import { BacklogPage } from '@/modules/backlog/BacklogPage';
import { BacklogProjectDetailPage } from '@/modules/backlog/BacklogProjectDetailPage';
// === Charging & Allocations (F4 / F5) [E-10] ===
import { Charging } from '@/modules/charging/Charging';

export default function App() {
  return (
    <ThemeProvider>
    <BrowserRouter>
      <RoleProvider>
        <SidePanelProvider>
          <BottomDrawerProvider>
            <AppLayout>
              <Routes>
                <Route path="/" element={<Launchpad />} />
                {/* === v5 Wave 5 E6 — Portfolio project full-page detail [E-03a..g] === */}
                <Route path="/portfolio/project/:projectId" element={<ProjectDetailPage />} />
                <Route path="/portfolio/*" element={<PortfolioOverview />} />
                <Route path="/workbench/new-project/:projectId" element={<ResourcePlanPage />} />
                <Route path="/workbench/*" element={<ProjectWorkbench />} />
                <Route path="/capacity/*" element={<CapacityManagement />} />
                <Route path="/simulator/*" element={<SimulatorRouter />} />
                <Route path="/reporting/*" element={<Reporting />} />
                <Route path="/admin/*" element={<Administration />} />
                <Route path="/docs/*" element={<DocumentationHub />} />
                {/* === Backlog (A6) === */}
                <Route path="/backlog" element={<BacklogPage />} />
                <Route path="/backlog/:projectId" element={<BacklogProjectDetailPage />} />
                {/* === Charging & Allocations (F4 / F5) [E-10] === */}
                <Route path="/charging/*" element={<Charging />} />
              </Routes>
            </AppLayout>
          </BottomDrawerProvider>
        </SidePanelProvider>
      </RoleProvider>
    </BrowserRouter>
    </ThemeProvider>
  );
}
