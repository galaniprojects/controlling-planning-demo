import { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ForecastWizard } from './ForecastWizard';
import { MixedGranularityGrid } from './MixedGranularityGrid';
import { ForecastComparisonChart } from './ForecastComparisonChart';
import { VersionSelector } from './VersionSelector';
import { VersionHistoryPanel } from './VersionHistoryPanel';
import { VersionComparisonDialog } from './VersionComparisonDialog';
import { ManualSnapshotDialog } from './ManualSnapshotDialog';
import { useForecastVersions } from './useForecastVersions';
import { workbenchApi } from '@/api/endpoints';
import { Clock, Camera, CalendarRange, X } from 'lucide-react';
// v5.2 W6 S11 (§13.9) — PL "Check availability" slide-over from F&P.
import { useWideSlideOver } from '@/contexts/WideSlideOverContext';
import PLAvailabilitySlideOver from '@/modules/capacity/availability/PLAvailabilitySlideOver';
import type { RequestedRoleSlot } from '@/modules/capacity/PLAvailabilityView';

interface PendingCR {
  cr_id: number;
  status: string;
  submitted_at: string | null;
}

interface Props {
  projectId: string;
  role: string;
}

const STATUS_LABELS: Record<string, string> = {
  pending_cc_confirmation: 'Awaiting CC Owner',
  pending_controller_approval: 'Awaiting Controller',
  changes_requested: 'Changes Requested',
};

export function ForecastTab({ projectId, role }: Props) {
  const [mode, setMode] = useState<'read' | 'cycle'>('read');
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [projectStatus, setProjectStatus] = useState<string | null>(null);
  const [pendingCR, setPendingCR] = useState<PendingCR | null>(null);
  const [diffDialogVersionId, setDiffDialogVersionId] = useState<number | null>(null);
  const [snapshotDialogOpen, setSnapshotDialogOpen] = useState(false);
  // v5.2 W6 S11 — captured slot from the PL availability slide-over.
  // Renders as a banner above the grid until cleared. Spec §13.9: the
  // request form on the Workbench is populated with the selected role,
  // location and suggested period when the PL clicks "Request this role".
  const [capturedRequest, setCapturedRequest] = useState<RequestedRoleSlot | null>(
    null,
  );
  const { openSlideOver, closeSlideOver } = useWideSlideOver();

  // v5.1 [C-04]: shared scroll container ref so the F&P grid and the
  // comparison chart below can scroll in lockstep on the same time axis.
  // Teammate A wires this onto MixedGranularityGrid's `<div ... overflow-auto>`
  // wrapper; ForecastComparisonChart attaches scroll listeners and mirrors
  // scrollLeft bidirectionally.
  const gridScrollRef = useRef<HTMLDivElement | null>(null);

  const {
    versions,
    loading: versionsLoading,
    error: versionsError,
    compareVersionId,
    setCompareVersionId,
    diff,
    diffLoading,
    deltaIndex,
    latestVersion,
    reload: reloadVersions,
  } = useForecastVersions(projectId);

  // Reset wizard mode when switching projects
  useEffect(() => {
    setMode('read');
    setDiffDialogVersionId(null);
    setCapturedRequest(null);
  }, [projectId]);

  // v5.2 W6 S11 — open the wide slide-over with the PL availability view.
  // The slide-over's "Request this role" CTA fires onRequestRole(slot),
  // which closes the panel and stores the captured slot for the F&P form
  // banner to render.
  function handleCheckAvailability() {
    openSlideOver(
      'Resource Availability',
      <PLAvailabilitySlideOver
        // No role/location pre-selection — projects don't carry a single
        // canonical role/location. The PL chooses inside the panel.
        initialLocationId={capturedRequest?.location_id ?? null}
        initialRoleIds={
          capturedRequest?.role_type_id ? [capturedRequest.role_type_id] : []
        }
        onRequestRole={(slot) => {
          // §13.9: panel closes and form on Workbench is populated.
          closeSlideOver();
          setCapturedRequest(slot);
        }}
      />,
    );
  }

  // Build sub_category → display name lookup from v4 forecast grid
  // (the C1 mixed-granularity endpoint returns IDs only).
  useEffect(() => {
    workbenchApi
      .getForecast(projectId)
      .then((res) => {
        const map: Record<string, string> = {};
        for (const row of res.items) {
          map[row.sub_category] = row.sub_category_name;
        }
        setNameMap(map);
      })
      .catch(() => {});
  }, [projectId]);

  // Fetch project overview for header context
  useEffect(() => {
    workbenchApi
      .getOverview(projectId)
      .then((res) => {
        setProjectStatus(res.metadata?.status ?? null);
        setPendingCR(res.metadata?.pending_cr ?? null);
      })
      .catch(() => {});
  }, [projectId]);

  const comparisonActive = useMemo(
    () => compareVersionId !== null && diff !== null,
    [compareVersionId, diff],
  );

  if (mode === 'cycle') {
    return (
      <ForecastWizard
        projectId={projectId}
        nameMap={nameMap}
        onComplete={() => setMode('read')}
        onCancel={() => setMode('read')}
      />
    );
  }

  return (
    <div className="space-y-4 min-w-0">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <VersionSelector
          versions={versions}
          compareVersionId={compareVersionId}
          onChange={setCompareVersionId}
          diff={diff}
          diffLoading={diffLoading}
          latestVersionId={latestVersion?.id ?? null}
        />
        <div className="flex items-center gap-3 flex-wrap">
          {role === 'controller' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSnapshotDialogOpen(true)}
              className="gap-1.5"
            >
              <Camera className="h-3.5 w-3.5" />
              Take snapshot
            </Button>
          )}
          {role === 'project_lead' && projectStatus === 'active' && (
            <>
              {pendingCR && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>CR-{pendingCR.cr_id} under review</span>
                  <Badge
                    variant="outline"
                    className="text-[10px] bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-700"
                  >
                    {STATUS_LABELS[pendingCR.status] || pendingCR.status}
                  </Badge>
                </div>
              )}
              {/* v5.2 W6 S11 (§13.9) — opens PL availability slide-over.
                  Lets the PL browse role-level capacity without leaving
                  the Workbench, then "Request this role" populates the
                  banner below with the captured slot. */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleCheckAvailability}
                className="gap-1.5"
              >
                <CalendarRange className="h-3.5 w-3.5" />
                Check availability
              </Button>
              <Button onClick={() => setMode('cycle')} disabled={!!pendingCR}>
                Rolling Forecast Review
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Captured request banner — populated when the PL clicks
          "Request this role" inside the availability slide-over. */}
      {capturedRequest && (
        <CapturedRequestBanner
          slot={capturedRequest}
          onClear={() => setCapturedRequest(null)}
          onEdit={handleCheckAvailability}
        />
      )}

      <MixedGranularityGrid
        projectId={projectId}
        nameMap={nameMap}
        deltaIndex={deltaIndex}
        comparisonActive={comparisonActive}
        // v5.1 W3 [C-04] — lockstep scroll seam, paired with C-03's
        // scrollContainerRef prop on MixedGranularityGrid.
        scrollContainerRef={gridScrollRef}
      />

      <ForecastComparisonChart
        projectId={projectId}
        scrollContainerRef={gridScrollRef}
      />

      <VersionHistoryPanel
        versions={versions}
        loading={versionsLoading}
        error={versionsError}
        compareVersionId={compareVersionId}
        onSelectCompare={setCompareVersionId}
        latestVersionId={latestVersion?.id ?? null}
        onOpenDiff={(id) => setDiffDialogVersionId(id)}
      />

      <VersionComparisonDialog
        open={diffDialogVersionId !== null}
        onOpenChange={(open) => !open && setDiffDialogVersionId(null)}
        versionAId={diffDialogVersionId}
        versionBId={latestVersion?.id ?? null}
        versions={versions}
        nameMap={nameMap}
      />

      <ManualSnapshotDialog
        open={snapshotDialogOpen}
        onOpenChange={setSnapshotDialogOpen}
        projectId={projectId}
        onSnapshotCreated={reloadVersions}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// CapturedRequestBanner — v5.2 W6 S11 (§13.9)
//
// Renders the captured role/location/period after the PL clicks "Request
// this role" inside the availability slide-over. This is the visible
// "form populated with the selected role/location/period" the spec
// requires. The user can clear or re-open the panel to adjust.
// ---------------------------------------------------------------------------

const MONTH_LABEL = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatMonthLabel(month: string | undefined): string | null {
  if (!month) return null;
  const m = parseInt(month.slice(5, 7), 10) - 1;
  const y = month.slice(0, 4);
  return `${MONTH_LABEL[m] ?? month} ${y}`;
}

function CapturedRequestBanner({
  slot,
  onClear,
  onEdit,
}: {
  slot: RequestedRoleSlot;
  onClear: () => void;
  onEdit: () => void;
}) {
  const periodLabel = formatMonthLabel(slot.suggested_month);
  return (
    <section
      role="status"
      aria-live="polite"
      className="flex items-start justify-between gap-3 rounded-lg border border-border bg-accent/50 p-4"
    >
      <div className="space-y-2 min-w-0">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <CalendarRange className="h-3.5 w-3.5" />
          <span>Resource request — pre-filled from availability</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">Role</div>
            <div className="font-medium text-foreground truncate">
              {slot.role_type_name}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">Location</div>
            <div className="font-medium text-foreground truncate">
              {slot.location_name ?? 'All locations'}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">Suggested period</div>
            <div className="font-medium text-foreground truncate">
              {periodLabel ?? '—'}
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Adjust the suggested period as needed when you submit the resource
          request via the next forecast cycle.
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Button variant="outline" size="sm" onClick={onEdit}>
          Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          aria-label="Clear pre-filled request"
          className="h-8 w-8 p-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </section>
  );
}
