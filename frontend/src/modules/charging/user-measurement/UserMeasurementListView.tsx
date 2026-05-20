/**
 * User Measurement module entry point per FD-2 / spec §1+§2.
 *
 * Mirrors `distribution/DistributionListView.tsx`. Drives a single UM
 * version through three inner surfaces:
 *
 * - **Version selector + KPI strip** — year/quarter filter, active-version
 *   chip, controller CTAs (Create draft, Import CSV, Activate, Delete).
 * - **Matrix viewer** — read-only sticky pivot of `(s_code, charging_location)`
 *   integer cells with row/column totals. The FD-2 in-grid editor for drafts
 *   replaces the viewer in commit 4 (`UserMeasurementMatrixEditor`).
 *
 * Role gating per [F-DIR-03]: read = all roles; write = controller-only. The
 * backend `require_role` is authoritative; this view hides the affordances.
 *
 * Demo date is April 2026 per CLAUDE.md; the default year defaults to 2026.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, Calendar, ChevronDown, Plus, Sparkles, Trash2, Upload,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/shared/Skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { useRole } from '@/contexts/RoleContext';
import { userMeasurementApi } from '@/api/userMeasurement';
import type {
  UMVersionDetailResponse,
  UMVersionSummary,
} from '@/types/userMeasurement';
import { UserMeasurementMatrixEditor } from './UserMeasurementMatrixEditor';
import { UserMeasurementMatrixViewer } from './UserMeasurementMatrixViewer';
import { ActivateDraftDialog } from './versions/ActivateDraftDialog';
import { CreateDraftDialog } from './versions/CreateDraftDialog';
import { ImportCsvDialog } from './versions/ImportCsvDialog';

const QUARTERS = [1, 2, 3, 4] as const;
const YEAR_OPTIONS = [2024, 2025, 2026, 2027, 2028];

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function UserMeasurementListView() {
  const { context } = useRole();
  const isController = context?.role === 'controller';

  const [year, setYear] = useState<number>(2026);
  const [quarter, setQuarter] = useState<number>(1);

  const [versions, setVersions] = useState<UMVersionSummary[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(true);
  const [versionsError, setVersionsError] = useState<string | null>(null);

  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);
  const [detail, setDetail] = useState<UMVersionDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [activateOpen, setActivateOpen] = useState(false);

  /* ─────────────────────────── fetchers ─────────────────────────── */

  const fetchVersions = useCallback(async () => {
    setVersionsLoading(true);
    setVersionsError(null);
    try {
      const res = await userMeasurementApi.listVersions({ year, quarter });
      setVersions(res.items);
    } catch (e: unknown) {
      setVersionsError(e instanceof Error ? e.message : 'Failed to load versions');
      setVersions([]);
    } finally {
      setVersionsLoading(false);
    }
  }, [year, quarter]);

  const fetchDetail = useCallback(async (versionId: number) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await userMeasurementApi.getVersion(versionId);
      setDetail(res);
    } catch (e: unknown) {
      setDetailError(e instanceof Error ? e.message : 'Failed to load version');
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  // Auto-pick the most-recently-activated active version; otherwise the
  // most-recent draft so the user lands on something editable.
  useEffect(() => {
    if (versions.length === 0) {
      setSelectedVersionId(null);
      setDetail(null);
      return;
    }
    if (selectedVersionId !== null
      && versions.some((v) => v.id === selectedVersionId)) {
      return;
    }
    const active = versions
      .filter((v) => v.status === 'active')
      .sort((a, b) => (b.activated_at ?? '').localeCompare(a.activated_at ?? ''));
    if (active.length > 0) {
      setSelectedVersionId(active[0].id);
      return;
    }
    const drafts = versions
      .filter((v) => v.status === 'draft')
      .sort((a, b) => b.id - a.id);
    if (drafts.length > 0) setSelectedVersionId(drafts[0].id);
  }, [versions, selectedVersionId]);

  useEffect(() => {
    if (selectedVersionId !== null) fetchDetail(selectedVersionId);
    else setDetail(null);
  }, [selectedVersionId, fetchDetail]);

  /* ─────────────────────────── derived ──────────────────────────── */

  const activeVersionForPeriod = useMemo(
    () =>
      versions
        .filter((v) => v.status === 'active')
        .sort((a, b) => (b.activated_at ?? '').localeCompare(a.activated_at ?? ''))[0]
      ?? null,
    [versions],
  );

  const siblingActive = useMemo(
    () =>
      detail
        ? versions.filter(
            (v) =>
              v.status === 'active'
              && v.year === detail.version.year
              && v.quarter === detail.version.quarter
              && v.id !== detail.version.id,
          )
        : [],
    [versions, detail],
  );

  const isCurrentDraft = detail?.version.status === 'draft';
  const isCurrentActive = detail?.version.status === 'active';

  /* ─────────────────────────── handlers ─────────────────────────── */

  const refreshAll = useCallback(async () => {
    await fetchVersions();
    if (selectedVersionId !== null) await fetchDetail(selectedVersionId);
  }, [fetchVersions, fetchDetail, selectedVersionId]);

  const handleCreated = useCallback(
    async (created: UMVersionDetailResponse) => {
      setCreateOpen(false);
      // Switch the period to the newly-created draft's period (it may have
      // shifted via copy_prior).
      if (created.version.year !== year || created.version.quarter !== quarter) {
        setYear(created.version.year);
        setQuarter(created.version.quarter);
      }
      await fetchVersions();
      setSelectedVersionId(created.version.id);
      setDetail(created);
    },
    [fetchVersions, year, quarter],
  );

  const handleImported = useCallback(
    async (result: { version: UMVersionSummary }) => {
      setImportOpen(false);
      if (result.version.year !== year || result.version.quarter !== quarter) {
        setYear(result.version.year);
        setQuarter(result.version.quarter);
      }
      await fetchVersions();
      setSelectedVersionId(result.version.id);
    },
    [fetchVersions, year, quarter],
  );

  const handleActivated = useCallback(
    async (activated: UMVersionDetailResponse) => {
      setActivateOpen(false);
      setDetail(activated);
      await fetchVersions();
    },
    [fetchVersions],
  );

  const handleDelete = useCallback(async () => {
    if (!detail || detail.version.status !== 'draft') return;
    if (!window.confirm(
      `Delete draft v${detail.version.id}? This removes all ${detail.version.cell_count} cells.`,
    )) return;
    try {
      await userMeasurementApi.deleteVersion(detail.version.id);
      setSelectedVersionId(null);
      setDetail(null);
      await fetchVersions();
    } catch (e: unknown) {
      setDetailError(e instanceof Error ? e.message : 'Delete failed');
    }
  }, [detail, fetchVersions]);

  /* ─────────────────────────── render ───────────────────────────── */

  return (
    <div className="space-y-4">
      {/* Header card */}
      <Card className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className="text-sm font-semibold text-foreground">
                User Measurement matrix
              </h3>
              {activeVersionForPeriod && (
                <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary dark:bg-primary/20 px-2 py-0.5 text-[11px] font-medium">
                  <Sparkles className="h-3 w-3" />
                  Active: v{activeVersionForPeriod.id}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              CRETA is the system of record for the consolidated UM matrix per{' '}
              <span className="font-mono">[F-DIR-01]</span>. Author by in-grid
              edit or CSV bulk-entry, then activate to freeze the version per{' '}
              <span className="font-mono">[F-UM-02]</span>.
            </p>
          </div>
          {isController && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
                <Upload className="h-3.5 w-3.5 mr-1" />
                Import CSV
              </Button>
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Create draft
              </Button>
            </div>
          )}
        </div>

        {/* Period selector */}
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" /> Period
          </div>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-[100px] h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEAR_OPTIONS.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(quarter)} onValueChange={(v) => setQuarter(Number(v))}>
            <SelectTrigger className="w-[100px] h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {QUARTERS.map((q) => (
                <SelectItem key={q} value={String(q)}>Q{q}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {versionsLoading ? (
            <Skeleton className="h-8 w-[280px] ml-3" />
          ) : versions.length > 0 ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground ml-3">
              Version
              <Select
                value={selectedVersionId === null ? '' : String(selectedVersionId)}
                onValueChange={(v) => setSelectedVersionId(Number(v))}
              >
                <SelectTrigger className="w-[320px] h-8 text-sm">
                  <SelectValue placeholder="Pick a version…" />
                </SelectTrigger>
                <SelectContent>
                  {versions.map((v) => (
                    <SelectItem key={v.id} value={String(v.id)}>
                      v{v.id} · {v.status === 'active' ? 'Active' : 'Draft'}
                      {v.activated_at && ` · ${fmtDateTime(v.activated_at)}`}
                      {' · '}{v.cell_count} cells
                      {' · '}{v.source}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="flex-1" />
          {isController && detail && isCurrentDraft && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setActivateOpen(true)}
              >
                Activate…
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleDelete}
                title="Delete draft"
              >
                <Trash2 className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
              </Button>
            </>
          )}
        </div>

        {/* Status badge strip under header */}
        {detail && (
          <div className="border-t border-border pt-3 flex flex-wrap items-center gap-2">
            <Badge
              variant={isCurrentActive ? 'default' : 'secondary'}
              className="text-[10px]"
            >
              {isCurrentActive ? 'Active' : 'Draft'}
            </Badge>
            <span className="text-xs text-muted-foreground">
              v{detail.version.id} · {detail.version.year}-Q{detail.version.quarter}
              {' · '}source: {detail.version.source}
              {detail.version.activated_at && (
                <>{' · activated '}{fmtDateTime(detail.version.activated_at)}</>
              )}
              {detail.version.copied_from_version_id !== null && (
                <> · copied from v{detail.version.copied_from_version_id}</>
              )}
            </span>
          </div>
        )}
      </Card>

      {/* Errors */}
      {versionsError && (
        <Card className="border-red-500 bg-red-50 dark:bg-red-900/20 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-800 dark:text-red-300">{versionsError}</p>
        </Card>
      )}

      {/* Matrix */}
      {versionsLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : versions.length === 0 ? (
        <EmptyState
          icon={ChevronDown}
          title={`No UM versions for ${year}-Q${quarter}`}
          description={
            isController
              ? 'Start by creating a blank draft or importing a CSV.'
              : 'No User Measurement data has been authored yet for this period.'
          }
          action={
            isController
              ? { label: 'Create draft', onClick: () => setCreateOpen(true) }
              : undefined
          }
        />
      ) : detailLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : detailError ? (
        <Card className="border-red-500 bg-red-50 dark:bg-red-900/20 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-800 dark:text-red-300">{detailError}</p>
        </Card>
      ) : detail ? (
        isController && isCurrentDraft ? (
          <UserMeasurementMatrixEditor
            version={detail.version}
            cells={detail.cells}
            onMutated={() => fetchDetail(detail.version.id)}
          />
        ) : (
          <UserMeasurementMatrixViewer
            version={detail.version}
            cells={detail.cells}
          />
        )
      ) : (
        <EmptyState
          icon={ChevronDown}
          title="Pick a version"
          description="Select a version above to inspect its cells."
        />
      )}

      {/* Dialogs */}
      <CreateDraftDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        versions={versions}
        defaultYear={year}
        defaultQuarter={quarter}
        onCreated={handleCreated}
      />
      <ImportCsvDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={handleImported}
      />
      <ActivateDraftDialog
        open={activateOpen}
        onClose={() => setActivateOpen(false)}
        draft={detail?.version ?? null}
        siblingActive={siblingActive}
        onActivated={handleActivated}
      />
    </div>
  );
}

