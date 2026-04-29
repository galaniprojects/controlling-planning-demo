import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ForecastWizard } from './ForecastWizard';
import { MixedGranularityGrid } from './MixedGranularityGrid';
import { VersionSelector } from './VersionSelector';
import { VersionHistoryPanel } from './VersionHistoryPanel';
import { VersionComparisonDialog } from './VersionComparisonDialog';
import { useForecastVersions } from './useForecastVersions';
import { workbenchApi } from '@/api/endpoints';
import { Clock } from 'lucide-react';

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
  } = useForecastVersions(projectId);

  // Reset wizard mode when switching projects
  useEffect(() => {
    setMode('read');
    setDiffDialogVersionId(null);
  }, [projectId]);

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
        {role === 'project_lead' && projectStatus === 'active' && (
          <div className="flex items-center gap-3">
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
            <Button onClick={() => setMode('cycle')} disabled={!!pendingCR}>
              Rolling Forecast Review
            </Button>
          </div>
        )}
      </div>

      <MixedGranularityGrid
        projectId={projectId}
        nameMap={nameMap}
        deltaIndex={deltaIndex}
        comparisonActive={comparisonActive}
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
    </div>
  );
}
