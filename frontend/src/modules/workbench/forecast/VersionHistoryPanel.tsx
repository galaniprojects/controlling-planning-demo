/**
 * VersionHistoryPanel — collapsible panel listing all forecast versions
 * for a project per [C-RH-01]. Each entry shows version number, type
 * (cycle / cr_approval / manual), timestamp, accepting user, and grand
 * total. Selecting a row sets the compare-from anchor for the grid
 * delta overlay.
 */
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/shared/Skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { GitCompare, ChevronDown, ChevronRight } from 'lucide-react';
import { formatCurrencyCompact, formatNumber } from '@/lib/formatters';
import type { ForecastVersionMeta } from '@/types/api';
import { useState } from 'react';

interface Props {
  versions: ForecastVersionMeta[];
  loading: boolean;
  error: string | null;
  compareVersionId: number | null;
  onSelectCompare: (id: number | null) => void;
  latestVersionId: number | null;
  onOpenDiff?: (versionId: number) => void;
}

const TYPE_LABEL: Record<string, string> = {
  cycle: 'Cycle',
  cr_approval: 'CR',
  manual: 'Manual',
};

const TYPE_COLOR: Record<string, string> = {
  cycle:
    'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700/50',
  cr_approval:
    'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-400 dark:border-violet-700/50',
  manual:
    'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800/50 dark:text-slate-300 dark:border-slate-700',
};

function formatTimestamp(iso: string): string {
  const d = new Date(iso.endsWith('Z') ? iso : `${iso}Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function VersionHistoryPanel({
  versions,
  loading,
  error,
  compareVersionId,
  onSelectCompare,
  latestVersionId,
  onOpenDiff,
}: Props) {
  const [expanded, setExpanded] = useState(true);

  return (
    <Card className="p-0 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-accent/40 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="font-medium text-sm text-foreground">Version history</span>
          {!loading && (
            <Badge variant="outline" className="font-tabular">
              {versions.length}
            </Badge>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          [C-RH-01] · per project, newest first
        </span>
      </button>
      {expanded && (
        <div className="border-t border-border">
          {loading && (
            <div className="p-4 space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          )}
          {error && (
            <p className="p-4 text-sm text-red-700 dark:text-red-400">{error}</p>
          )}
          {!loading && !error && versions.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">
              No versions captured yet for this project.
            </p>
          )}
          {!loading && !error && versions.length > 0 && (
            <div className="divide-y divide-border max-h-[280px] overflow-y-auto">
              {versions.map((v) => {
                const isLatest = v.id === latestVersionId;
                const isSelected = v.id === compareVersionId;
                return (
                  <div
                    key={v.id}
                    className={`px-4 py-3 flex items-center gap-3 transition-colors ${
                      isSelected ? 'bg-amber-50 dark:bg-amber-900/20' : 'hover:bg-accent/40'
                    }`}
                  >
                    <div className="flex flex-col min-w-[60px]">
                      <span className="font-tabular text-sm font-semibold text-foreground">
                        v{v.version_number}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] mt-1 ${TYPE_COLOR[v.version_type] ?? ''}`}
                      >
                        {TYPE_LABEL[v.version_type] ?? v.version_type}
                      </Badge>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground truncate">
                          {v.cycle_label ?? `Version ${v.version_number}`}
                        </span>
                        {isLatest && (
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700/50"
                          >
                            Latest
                          </Badge>
                        )}
                        {v.change_request_id && (
                          <Badge variant="outline" className="text-[10px] font-tabular">
                            CR-{v.change_request_id}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                        <span>{formatTimestamp(v.created_at)}</span>
                        {v.created_by_name && <span>· {v.created_by_name}</span>}
                        {v.cell_count !== null && v.cell_count !== undefined && (
                          <span className="font-tabular">
                            · {formatNumber(v.cell_count)} cells
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-tabular text-sm font-medium">
                        {v.total_amount_eur !== null && v.total_amount_eur !== undefined
                          ? formatCurrencyCompact(v.total_amount_eur)
                          : '—'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {!isLatest && (
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant={isSelected ? 'default' : 'ghost'}
                                size="sm"
                                className="h-7 px-2 gap-1 text-xs"
                                onClick={() =>
                                  onSelectCompare(isSelected ? null : v.id)
                                }
                              >
                                <GitCompare className="h-3.5 w-3.5" />
                                {isSelected ? 'Comparing' : 'Compare'}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {isSelected
                                ? 'Currently selected as comparison anchor'
                                : `Compare v${v.version_number} with latest`}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {onOpenDiff && !isLatest && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => onOpenDiff(v.id)}
                        >
                          Detail
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
