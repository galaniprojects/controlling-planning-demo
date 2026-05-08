/**
 * CapacityWorkspace — v5.2 W2 Track A.
 *
 * Top-level component for `/capacity`. In W2 it renders the ScopeBar
 * (functional) plus five clearly-labeled empty placeholder slots that
 * subsequent waves will fill in:
 *
 *   - KPI bar              → W3 S4
 *   - Dashboard layer      → W3 S4 (Executive/Controller charts only)
 *   - Filter chips         → W3 S4
 *   - Timeline             → W3 S3
 *   - Side panel           → W3 S5a + W4 S6a
 *
 * The workspace is rendered inside the `CapacityScopeProvider` mounted
 * by the `CapacityManagement` shell, so the ScopeBar already has its
 * context wired up.
 *
 * Spec: guides/Capacity_Module_Redesign_Spec.md §2 + §1.3.
 */
import { Navigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useRole } from '@/contexts/RoleContext';
import { ScopeBar } from './ScopeBar';
import { useScopeQueryParams } from './hooks/useScopeQueryParams';

/**
 * Visual placeholder card for a not-yet-built workspace slot.
 * Uses semantic Tailwind tokens so it adapts to dark mode automatically.
 */
function SlotPlaceholder({
  label,
  description,
  height = 'h-32',
}: {
  label: string;
  description: string;
  height?: string;
}) {
  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className={`flex ${height} items-center justify-center rounded-md border border-dashed border-border bg-muted/30 text-xs text-muted-foreground`}
        >
          {description}
        </div>
      </CardContent>
    </Card>
  );
}

export function CapacityWorkspace() {
  const { context } = useRole();
  const role = context?.role;
  const [searchParams] = useSearchParams();

  // Sync ScopeBar state with the URL query string. Called unconditionally
  // before the PL gate to keep hook ordering stable across renders.
  useScopeQueryParams();

  // Project Lead has no access to the workspace. Redirect during render
  // (not in an effect) so PL never sees a one-frame flash of the
  // workspace shell before the navigation fires.
  if (role === 'project_lead') {
    return <Navigate to="/capacity/availability" replace />;
  }

  // (W4 S6a) Deep-linked assignment opening will read this param and
  // hand it to AssignmentPanel. For W2 we just acknowledge it via a banner
  // so the redirect from `/capacity/project-assignment/:id` is observable.
  const assignmentProjectId = searchParams.get('assignment_project');

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-4">
          <ScopeBar />
        </CardContent>
      </Card>

      {assignmentProjectId && (
        <Card className="border-dashed bg-muted/40">
          <CardContent className="py-3 text-xs text-muted-foreground">
            Assignment-panel deep link queued for project{' '}
            <span className="font-medium text-foreground">
              {assignmentProjectId}
            </span>{' '}
            — wiring lands in Wave 4 (S6a).
          </CardContent>
        </Card>
      )}

      <SlotPlaceholder
        label="KPI bar"
        description="5-card summary (capacity / allocated / available / over-allocated / pending). Wave 3."
        height="h-20"
      />

      <SlotPlaceholder
        label="Dashboard layer"
        description="Executive/Controller charts (utilization distribution, forecast, headcount, hotspots). Wave 3."
        height="h-40"
      />

      <SlotPlaceholder
        label="Filter chips"
        description="Smart filter chips with live counts (over-allocated, idle, pending CRs, etc.). Wave 3."
        height="h-12"
      />

      <SlotPlaceholder
        label="Timeline"
        description="Person-centric stacked-bar timeline with collapsible time axis + demand strip. Wave 3."
        height="h-72"
      />

      <SlotPlaceholder
        label="Side panel"
        description="Slide-in person / cell / assignment detail. Width-aware (280 / 380 / 400). Waves 3–4."
        height="h-12"
      />
    </div>
  );
}

export default CapacityWorkspace;
