/**
 * VersionSelector — top-of-grid dropdown for picking a comparison version
 * per [C-VC-03]. When a prior version is selected, the parent renders
 * cell-level delta indicators in the grid.
 */
import { useMemo } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { History, X } from 'lucide-react';
import { formatCurrencyCompact } from '@/lib/formatters';
import type { ForecastVersionDiff, ForecastVersionMeta } from '@/types/api';

interface Props {
  versions: ForecastVersionMeta[];
  compareVersionId: number | null;
  onChange: (id: number | null) => void;
  diff: ForecastVersionDiff | null;
  diffLoading: boolean;
  /** id of latest captured snapshot — never offered as a compare-from */
  latestVersionId: number | null;
}

const NONE_VALUE = '__none__';

function formatTimestamp(iso: string): string {
  // ISO strings from Python datetime.utcnow().isoformat() may lack a Z.
  const d = new Date(iso.endsWith('Z') ? iso : `${iso}Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function VersionSelector({
  versions,
  compareVersionId,
  onChange,
  diff,
  diffLoading,
  latestVersionId,
}: Props) {
  // Only show versions older than the latest as candidates for comparison.
  // The user is comparing some prior cycle/CR against the latest snapshot.
  const candidates = useMemo(
    () => versions.filter((v) => v.id !== latestVersionId),
    [versions, latestVersionId],
  );

  const selected = candidates.find((v) => v.id === compareVersionId) ?? null;
  const latest = versions.find((v) => v.id === latestVersionId) ?? null;

  const handleChange = (val: string) => {
    if (val === NONE_VALUE) {
      onChange(null);
    } else {
      onChange(parseInt(val, 10));
    }
  };

  if (versions.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          Compare against
        </span>
        <Select
          value={compareVersionId !== null ? String(compareVersionId) : NONE_VALUE}
          onValueChange={handleChange}
        >
          <SelectTrigger className="w-[260px] h-8 text-sm">
            <SelectValue placeholder="No comparison" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_VALUE}>No comparison</SelectItem>
            {candidates.map((v) => (
              <SelectItem key={v.id} value={String(v.id)}>
                <span className="flex items-center gap-2">
                  <span className="font-tabular font-medium">v{v.version_number}</span>
                  {v.cycle_label && (
                    <span className="text-muted-foreground">— {v.cycle_label}</span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {formatTimestamp(v.created_at)}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selected && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => onChange(null)}
            aria-label="Clear comparison"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {selected && latest && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">vs.</span>
          <Badge variant="outline" className="font-tabular">
            v{latest.version_number}
            {latest.cycle_label ? ` — ${latest.cycle_label}` : ''}
          </Badge>
          {diffLoading ? (
            <span className="text-muted-foreground italic">computing diff…</span>
          ) : diff ? (
            <>
              <Badge
                variant="outline"
                className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700/50"
              >
                {diff.summary.modified_count} modified
              </Badge>
              {diff.summary.added_count > 0 && (
                <Badge
                  variant="outline"
                  className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700/50"
                >
                  +{diff.summary.added_count} added
                </Badge>
              )}
              {diff.summary.removed_count > 0 && (
                <Badge
                  variant="outline"
                  className="bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700/50"
                >
                  −{diff.summary.removed_count} removed
                </Badge>
              )}
              <span className="text-muted-foreground">
                Total Δ:{' '}
                <span
                  className={
                    diff.grand_totals.delta > 0
                      ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                      : diff.grand_totals.delta < 0
                        ? 'text-red-700 dark:text-red-400 font-medium'
                        : 'text-muted-foreground'
                  }
                >
                  {diff.grand_totals.delta > 0 ? '+' : ''}
                  {formatCurrencyCompact(diff.grand_totals.delta)}
                </span>
              </span>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
