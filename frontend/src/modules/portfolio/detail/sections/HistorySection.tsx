/**
 * History section of the Portfolio Project Detail page per [E-03f].
 * Read-only.
 *
 * Two stacked panels:
 *   1. Forecast version history — reuses C2's `useForecastVersions` hook
 *      and `VersionHistoryPanel` component. Compare-from selection is
 *      preserved (it drives the diff dialog, also imported below) but
 *      grid mutations are not exposed because this page never edits.
 *   2. Change request history — reuses `CRHistoryList` from the Workbench
 *      history tab. The list is fully expandable (read-only review of
 *      grid diffs) but the controller approval buttons inside individual
 *      CR detail modals are gated by role on the backend, so this view
 *      naturally surfaces them only for controllers.
 */
import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/shared/Skeleton';
import { VersionHistoryPanel } from '@/modules/workbench/forecast/VersionHistoryPanel';
import { VersionComparisonDialog } from '@/modules/workbench/forecast/VersionComparisonDialog';
import { useForecastVersions } from '@/modules/workbench/forecast/useForecastVersions';
import { CRHistoryList } from '@/modules/workbench/history/CRHistoryList';
import { workbenchApi } from '@/api/endpoints';
import type { CRHistoryItem } from '@/types/api';

interface Props {
  projectId: string;
}

export function HistorySection({ projectId }: Props) {
  const [crs, setCrs] = useState<CRHistoryItem[]>([]);
  const [crsLoading, setCrsLoading] = useState(true);
  const [diffDialogVersionId, setDiffDialogVersionId] = useState<number | null>(
    null,
  );
  const [nameMap, setNameMap] = useState<Record<string, string>>({});

  const {
    versions,
    loading: versionsLoading,
    error: versionsError,
    compareVersionId,
    setCompareVersionId,
    latestVersion,
  } = useForecastVersions(projectId);

  // CR list
  useEffect(() => {
    let cancelled = false;
    setCrsLoading(true);
    workbenchApi
      .getChangeRequests(projectId)
      .then((res) => {
        if (!cancelled) setCrs(res.items);
      })
      .catch(() => {
        if (!cancelled) setCrs([]);
      })
      .finally(() => {
        if (!cancelled) setCrsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Sub-category name map (used by the diff dialog row labels — same
  // pattern as `ForecastTab` in the Workbench).
  useEffect(() => {
    let cancelled = false;
    workbenchApi
      .getForecast(projectId)
      .then((res) => {
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const row of res.items) {
          map[row.sub_category] = row.sub_category_name;
        }
        setNameMap(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h3 className="text-sm font-medium text-foreground">
          Forecast version history
        </h3>
        <VersionHistoryPanel
          versions={versions}
          loading={versionsLoading}
          error={versionsError}
          compareVersionId={compareVersionId}
          onSelectCompare={setCompareVersionId}
          latestVersionId={latestVersion?.id ?? null}
          onOpenDiff={(id) => setDiffDialogVersionId(id)}
        />
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium text-foreground">
          Change requests
        </h3>
        {crsLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : (
          <CRHistoryList items={crs} projectId={projectId} />
        )}
      </section>

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
