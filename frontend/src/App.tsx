import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
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
// === v5.2 W2 — Capacity redesign shell + sub-routes ===
import { CapacityManagement } from '@/modules/capacity/CapacityManagement';
import { CapacityWorkspace } from '@/modules/capacity/CapacityWorkspace';
// Track B owns these placeholders; imports are declared per the
// interface contract and resolve at merge time.
import RequestsInbox from '@/modules/capacity/RequestsInbox';
import CapacityHistory from '@/modules/capacity/CapacityHistory';
import PLAvailabilityView from '@/modules/capacity/PLAvailabilityView';
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

/**
 * v5.2 W2 — deprecation redirect for the legacy Project Assignment
 * page. The new workspace consumes the project id via
 * `?assignment_project=<id>` and W4 S6a opens the AssignmentPanel
 * automatically. Per spec §9.10.
 */
function ProjectAssignmentRedirect() {
  const { projectId } = useParams<{ projectId: string }>();
  const target = projectId
    ? `/capacity?assignment_project=${encodeURIComponent(projectId)}`
    : '/capacity';
  return <Navigate to={target} replace />;
}

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
                {/* === v5.2 W2 — Capacity nested layout === */}
                <Route path="/capacity" element={<CapacityManagement />}>
                  <Route index element={<CapacityWorkspace />} />
                  <Route path="requests" element={<RequestsInbox />} />
                  <Route path="history" element={<CapacityHistory />} />
                  <Route path="availability" element={<PLAvailabilityView />} />
                </Route>
                {/* Deprecation redirect — legacy direct link to the
                    Project Assignment page. The new workspace handles
                    assignment via a side-panel deep link (W4 S6a). */}
                <Route
                  path="/capacity/project-assignment/:projectId"
                  element={<ProjectAssignmentRedirect />}
                />
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
