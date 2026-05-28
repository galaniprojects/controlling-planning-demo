import { BrowserRouter, Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { RoleProvider } from '@/contexts/RoleContext';
import { SidePanelProvider } from '@/contexts/SidePanelContext';
import { BottomDrawerProvider } from '@/contexts/BottomDrawerContext';
// v5.2 W6 S11 — wide (50vw) slide-over for the Workbench → Check
// availability flow. Render slot lives in AppLayout. Orthogonal to the
// 380px SidePanel.
import { WideSlideOverProvider } from '@/contexts/WideSlideOverContext';
// v5.2 W3 — the project-color map needs to wrap both the workspace
// (timeline rows) AND the side-panel content (PersonDetail allocation
// dots). The shared SidePanel renders its content inside AppLayout,
// outside any per-route provider, so the map provider must live here.
import { ProjectColorMapProvider } from '@/contexts/ProjectColorMapContext';
// v5.2 W4 Track A — AssignmentStateProvider must live alongside SidePanelProvider
// so that AssignmentPanel (rendered as SidePanel content) can read session state.
import { AssignmentStateProvider } from '@/modules/capacity/assignment/AssignmentStateContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Launchpad } from '@/modules/launchpad/Launchpad';
import { PortfolioOverview } from '@/modules/portfolio/PortfolioOverview';
// === v5 Wave 5 E6 — full-page Portfolio project detail [E-03a..g] ===
import { ProjectDetailPage } from '@/modules/portfolio/detail/ProjectDetailPage';
import { ProjectWorkbench } from '@/modules/workbench/ProjectWorkbench';
// Service Workbench Session 4 — interactive SVG DAG visualization for
// the cascade allocation chain at /workbench/allocation-flow.
import { AllocationFlowView } from '@/modules/workbench/allocation-flow/AllocationFlowView';
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
// === Define-page redesign — canonical project home for every DoI ===
import { DefineProjectPage } from '@/modules/define/DefineProjectPage';
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
  const { search } = useLocation();
  // v5.2 W6 Track A — preserve any pre-existing query string (notably
  // `cc=` and optional `cr=`) when rewriting the URL. Without these, the
  // workspace's `AssignmentEntryPoint` short-circuits because the
  // assignment session needs both `projectId` and `ccId` to spin up.
  // Pre-W6 this redirect dropped the search string, leaving deep-link
  // bookmarks against the legacy URL useless once they hit the new shell.
  //
  // We also pin `scope=my_cc` when `cc=` is present and no explicit
  // `scope=` is supplied. The workspace's `useScopeQueryParams` writer
  // drops `cc` from the URL whenever the active scope is `all_ccs`
  // (the all-CCs scope has no concept of a "current CC"); without this
  // hint the cc the redirect just preserved would be wiped on the very
  // next render of the workspace, leading right back to the broken
  // pre-W6 behaviour.
  if (!projectId) {
    return <Navigate to="/capacity" replace />;
  }
  const params = new URLSearchParams(search);
  if (params.has('cc') && !params.has('scope')) {
    params.set('scope', 'my_cc');
  }
  // v5.2 W6 review-pass-2 (P3.C) — prefer an existing query param over
  // the path param if both are present. The path param is the canonical
  // source for the legacy URL pattern, but a future caller with both
  // set is expressing intent to override (e.g. a redirect chain).
  if (!params.has('assignment_project')) {
    params.set('assignment_project', projectId);
  }
  return <Navigate to={`/capacity?${params.toString()}`} replace />;
}

export default function App() {
  return (
    <ThemeProvider>
    <BrowserRouter>
      <RoleProvider>
        <SidePanelProvider>
          <AssignmentStateProvider>
          <BottomDrawerProvider>
            <WideSlideOverProvider>
            <ProjectColorMapProvider>
            <AppLayout>
              <Routes>
                <Route path="/" element={<Launchpad />} />
                {/* === v5 Wave 5 E6 — Portfolio project full-page detail [E-03a..g] === */}
                <Route path="/portfolio/project/:projectId" element={<ProjectDetailPage />} />
                <Route path="/portfolio/*" element={<PortfolioOverview />} />
                <Route path="/workbench/new-project/:projectId" element={<ResourcePlanPage />} />
                {/* Service Workbench S4 — interactive SVG DAG allocation
                    flow. Declared before the workbench catch-all so this
                    specific path wins. */}
                <Route path="/workbench/allocation-flow" element={<AllocationFlowView />} />
                <Route path="/workbench/*" element={<ProjectWorkbench />} />
                {/* === v5.2 W2 — Capacity nested layout === */}
                {/* Deprecation redirect — legacy direct link to the
                    Project Assignment page. The new workspace handles
                    assignment via a side-panel deep link (W4 S6a).
                    Declared before the nested layout so the intent is
                    explicit even if the parent later gains a catch-all. */}
                <Route
                  path="/capacity/project-assignment/:projectId"
                  element={<ProjectAssignmentRedirect />}
                />
                <Route path="/capacity" element={<CapacityManagement />}>
                  <Route index element={<CapacityWorkspace />} />
                  <Route path="requests" element={<RequestsInbox />} />
                  <Route path="history" element={<CapacityHistory />} />
                  <Route path="availability" element={<PLAvailabilityView />} />
                </Route>
                <Route path="/simulator/*" element={<SimulatorRouter />} />
                <Route path="/reporting/*" element={<Reporting />} />
                <Route path="/admin/*" element={<Administration />} />
                <Route path="/docs/*" element={<DocumentationHub />} />
                {/* === Backlog (A6) === */}
                <Route path="/backlog" element={<BacklogPage />} />
                {/* /backlog/:projectId redirects into the canonical Define
                    page at every DoI; the legacy detail component is now
                    a thin redirect shell. */}
                <Route path="/backlog/:projectId" element={<BacklogProjectDetailPage />} />
                {/* === Define page — canonical project home === */}
                <Route path="/define/new" element={<DefineProjectPage />} />
                <Route path="/define/:projectId" element={<DefineProjectPage />} />
                {/* === Charging & Allocations (F4 / F5) [E-10] === */}
                <Route path="/charging/*" element={<Charging />} />
              </Routes>
            </AppLayout>
            </ProjectColorMapProvider>
            </WideSlideOverProvider>
          </BottomDrawerProvider>
          </AssignmentStateProvider>
        </SidePanelProvider>
      </RoleProvider>
    </BrowserRouter>
    </ThemeProvider>
  );
}
