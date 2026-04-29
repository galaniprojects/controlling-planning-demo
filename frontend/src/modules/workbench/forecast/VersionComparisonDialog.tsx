/**
 * VersionComparisonDialog — full-detail two-version diff per [C-RH-05].
 * Lists every changed cell with old → new amounts and delta. Useful when
 * the user wants to drill into the specific changes between any two
 * snapshots without scanning the whole grid.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/shared/Skeleton';
import { formatCurrencyCompact } from '@/lib/formatters';
import { workbenchApi } from '@/api/endpoints';
import type {
  CellDelta,
  ForecastVersionDiff,
  ForecastVersionMeta,
} from '@/types/api';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  versionAId: number | null;
  versionBId: number | null;
  versions: ForecastVersionMeta[];
  /** sub_category id → display label (from v4 grid) */
  nameMap: Record<string, string>;
}

const STATUS_BADGE: Record<string, string> = {
  added: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700/50',
  removed: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700/50',
  modified: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700/50',
  unchanged: 'bg-muted text-muted-foreground',
};

export function VersionComparisonDialog({
  open,
  onOpenChange,
  versionAId,
  versionBId,
  versions,
  nameMap,
}: Props) {
  const [diff, setDiff] = useState<ForecastVersionDiff | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const versionA = versions.find((v) => v.id === versionAId) ?? null;
  const versionB = versions.find((v) => v.id === versionBId) ?? null;

  useEffect(() => {
    if (!open || versionAId === null || versionBId === null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDiff(null);
    workbenchApi
      .getForecastVersionDiff(versionAId, versionBId)
      .then((res) => {
        if (!cancelled) setDiff(res);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Diff failed');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, versionAId, versionBId]);

  const sortedDeltas = useMemo<CellDelta[]>(() => {
    if (!diff) return [];
    return [...diff.line_deltas].sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      if (a.sub_category !== b.sub_category) {
        return (nameMap[a.sub_category] ?? a.sub_category).localeCompare(
          nameMap[b.sub_category] ?? b.sub_category,
        );
      }
      return a.cell_key.localeCompare(b.cell_key);
    });
  }, [diff, nameMap]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            Version comparison
            {versionA && versionB && (
              <span className="font-normal text-muted-foreground text-sm ml-2">
                v{versionA.version_number} → v{versionB.version_number}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            {versionA && versionB && (
              <>
                {versionA.cycle_label ?? `Version ${versionA.version_number}`} compared
                to {versionB.cycle_label ?? `Version ${versionB.version_number}`}
                {' · '}
                <span className="font-tabular">
                  Δ{' '}
                  {diff && (diff.grand_totals.delta > 0 ? '+' : '')}
                  {diff ? formatCurrencyCompact(diff.grand_totals.delta) : '—'}
                </span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="space-y-2 py-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}
        {error && (
          <p className="text-sm text-red-700 dark:text-red-400 py-4">{error}</p>
        )}
        {diff && !loading && (
          <div className="flex-1 overflow-y-auto -mx-6 px-6">
            <div className="flex items-center gap-2 pb-3 flex-wrap">
              <Badge variant="outline" className={STATUS_BADGE.modified}>
                {diff.summary.modified_count} modified
              </Badge>
              {diff.summary.added_count > 0 && (
                <Badge variant="outline" className={STATUS_BADGE.added}>
                  +{diff.summary.added_count} added
                </Badge>
              )}
              {diff.summary.removed_count > 0 && (
                <Badge variant="outline" className={STATUS_BADGE.removed}>
                  −{diff.summary.removed_count} removed
                </Badge>
              )}
              <span className="text-xs text-muted-foreground ml-auto">
                {diff.summary.total_changes} changed cells
              </span>
            </div>
            {sortedDeltas.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No differences between these versions.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Line item</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">v{versionA?.version_number}</TableHead>
                    <TableHead className="text-right">v{versionB?.version_number}</TableHead>
                    <TableHead className="text-right">Delta</TableHead>
                    <TableHead className="w-[80px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedDeltas.map((d, idx) => (
                    <TableRow key={`${d.category}-${d.sub_category}-${d.cell_key}-${idx}`}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm">
                            {nameMap[d.sub_category] ?? d.sub_category}
                          </span>
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                            {d.category}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="font-tabular text-sm">{d.cell_key}</TableCell>
                      <TableCell className="text-right font-tabular text-sm">
                        {d.version_a_amount !== null
                          ? formatCurrencyCompact(d.version_a_amount)
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right font-tabular text-sm">
                        {d.version_b_amount !== null
                          ? formatCurrencyCompact(d.version_b_amount)
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right font-tabular text-sm">
                        <span
                          className={
                            d.delta && d.delta > 0
                              ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                              : d.delta && d.delta < 0
                                ? 'text-red-700 dark:text-red-400 font-medium'
                                : 'text-muted-foreground'
                          }
                        >
                          {d.delta !== null
                            ? `${d.delta > 0 ? '+' : ''}${formatCurrencyCompact(d.delta)}`
                            : '—'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${STATUS_BADGE[d.status] ?? ''}`}
                        >
                          {d.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
