/**
 * EntityPickerDialog — candidate-driven picker for "+ Add distribution
 * target". Spec §5.5.
 *
 * Fetches `chargingApi.getDistributionCandidates(sourceEntityId,
 * versionId)` which already excludes:
 *  - the source itself
 *  - destinations already on an outgoing edge
 *  - destinations that would create a cycle (server-side via
 *    `detect_cycle_db`)
 *
 * Two depth flags steer the list rendering:
 *  - `would_violate_max_depth` — strictly over the cap. Row renders
 *    disabled with a tooltip explaining the save would 409. The user
 *    can see the candidate exists but cannot select it.
 *  - `near_max_depth_warning` — within 1 of the cap, still saveable.
 *    Row renders with an amber AlertTriangle icon and label.
 *
 * Picking a candidate dispatches ADD_ROW upstream, seeding the new
 * pending row with the destination triple + the resulting depth so the
 * table can show the depth badge before the post-save refetch.
 */
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/shared/Skeleton';
import { cn } from '@/lib/utils';
import { chargingApi } from '@/api/endpoints';
import { EntityTypeBadge } from '@/components/shared/EntityTypeBadge';
import type {
  ChargeableEntityType,
  DistributionCandidate,
} from '@/types/api';
import { subtypeStripClass } from './DistributionRow';

interface Props {
  open: boolean;
  onClose: () => void;
  sourceEntityId: string;
  /** Resolved version_id the editor is targeting. Picker is hidden when
   *  null (e.g. legacy sandbox path with no resolved version). */
  versionId: number | null;
  /** Entity ids already on an outgoing edge (or pending new rows).
   *  Used belt-and-braces — the candidates endpoint already excludes
   *  these, but a freshly-added pending row needs to disappear from
   *  the list before the dialog refetches. */
  existingDestinationIds: Set<string>;
  onPick: (candidate: DistributionCandidate) => void;
}

const TYPE_OPTIONS: { value: 'all' | ChargeableEntityType; label: string }[] = [
  { value: 'all', label: 'All types' },
  { value: 'Project', label: 'Projects' },
  { value: 'Offering', label: 'Offerings' },
  { value: 'InternalService', label: 'Internal Services' },
];

export function EntityPickerDialog({
  open,
  onClose,
  sourceEntityId,
  versionId,
  existingDestinationIds,
  onPick,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<DistributionCandidate[]>([]);
  const [maxDepth, setMaxDepth] = useState<number>(0);
  const [typeFilter, setTypeFilter] = useState<'all' | ChargeableEntityType>(
    'all',
  );
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setTypeFilter('all');
    setLoadError(null);
    if (versionId === null) {
      setCandidates([]);
      setMaxDepth(0);
      return;
    }
    setLoading(true);
    chargingApi
      .getDistributionCandidates(sourceEntityId, { version_id: versionId })
      .then((res) => {
        setCandidates(res.candidates);
        setMaxDepth(res.max_allocation_depth);
      })
      .catch((e: unknown) => {
        setLoadError(
          e instanceof Error ? e.message : 'Failed to load candidates',
        );
        setCandidates([]);
      })
      .finally(() => setLoading(false));
  }, [open, sourceEntityId, versionId]);

  const filtered = useMemo(() => {
    const lower = search.trim().toLowerCase();
    return candidates
      .filter((c) => !existingDestinationIds.has(c.entity_id))
      .filter((c) => typeFilter === 'all' || c.entity_type === typeFilter)
      .filter((c) => {
        if (!lower) return true;
        return `${c.entity_name} ${c.identifier}`.toLowerCase().includes(lower);
      });
  }, [candidates, search, typeFilter, existingDestinationIds]);

  const warnCount = useMemo(
    () => filtered.filter((c) => c.near_max_depth_warning && !c.would_violate_max_depth).length,
    [filtered],
  );
  const blockedCount = useMemo(
    () => filtered.filter((c) => c.would_violate_max_depth).length,
    [filtered],
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add distribution target</DialogTitle>
          <DialogDescription>
            Pick an entity to distribute a share of this service's cost to.
            New rows default to 0% — set the percentage in the table.
            Candidates that would create a cycle are excluded server-side; max
            allocation depth is {maxDepth || '—'}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Select
              value={typeFilter}
              onValueChange={(v) =>
                setTypeFilter(v as 'all' | ChargeableEntityType)
              }
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name or identifier…"
                className="h-9 pl-8"
              />
            </div>
          </div>

          {/* Counter strip */}
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span>{filtered.length} candidate{filtered.length === 1 ? '' : 's'}</span>
            {warnCount > 0 && (
              <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                {warnCount} near max depth
              </span>
            )}
            {blockedCount > 0 && (
              <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-400">
                <X className="h-3 w-3" />
                {blockedCount} would exceed depth
              </span>
            )}
          </div>

          <div className="rounded-md border border-border max-h-[360px] overflow-y-auto">
            {versionId === null ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Version not resolved — adding targets is unavailable in the
                simulator sandbox path.
              </p>
            ) : loading ? (
              <div className="p-6 space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : loadError ? (
              <p className="p-6 text-center text-sm text-red-700 dark:text-red-400">
                {loadError}
              </p>
            ) : filtered.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                No candidates match — try a broader filter or clear the search.
              </p>
            ) : (
              <ul>
                {filtered.slice(0, 300).map((c) => (
                  <CandidateRow
                    key={c.entity_id}
                    candidate={c}
                    maxDepth={maxDepth}
                    onPick={() => onPick(c)}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CandidateRow({
  candidate,
  maxDepth,
  onPick,
}: {
  candidate: DistributionCandidate;
  maxDepth: number;
  onPick: () => void;
}) {
  const blocked = candidate.would_violate_max_depth;
  const warn = candidate.near_max_depth_warning && !blocked;
  const depthLabel = `${candidate.resulting_chain_depth}/${maxDepth}`;

  return (
    <li className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={onPick}
        disabled={blocked}
        title={
          blocked
            ? `Resulting chain depth ${depthLabel} would exceed the configured max (${maxDepth}). Reduce another upstream chain first.`
            : warn
            ? `Resulting chain depth ${depthLabel} is within 1 of the cap. Saveable, but limits future routing.`
            : `Resulting chain depth ${depthLabel}.`
        }
        className={cn(
          'w-full text-left px-3 py-2 flex items-stretch gap-2',
          'transition-colors',
          blocked && 'opacity-50 cursor-not-allowed bg-muted/30',
          !blocked && 'hover:bg-accent',
        )}
      >
        <span
          className={cn(
            'w-1 rounded-sm self-stretch flex-shrink-0',
            subtypeStripClass(candidate.entity_type),
          )}
          aria-hidden
        />
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground truncate">
              {candidate.entity_name}
            </span>
            <EntityTypeBadge type={candidate.entity_type} />
          </span>
          <span className="block text-[11px] font-mono text-muted-foreground">
            {candidate.identifier}
          </span>
        </span>
        <span className="flex flex-col items-end gap-1 flex-shrink-0">
          <span
            className={cn(
              'inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md font-mono tabular-nums',
              blocked && 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
              warn && 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
              !blocked && !warn && 'bg-muted text-muted-foreground',
            )}
          >
            {warn && <AlertTriangle className="h-3 w-3" />}
            chain: {depthLabel}
          </span>
          {blocked && (
            <span className="text-[10px] text-red-700 dark:text-red-400">
              would exceed
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
