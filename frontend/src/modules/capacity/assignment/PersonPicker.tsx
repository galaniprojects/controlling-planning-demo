/**
 * PersonPicker — v5.2 W4 Track A (Session 6a).
 *
 * Inline dropdown anchored to the [Assign] button on an unassigned month row.
 *
 * Layout:
 *   - Type-to-filter search input
 *   - "Matching role" group — people whose role_type_id matches the request
 *   - "Other roles" group — all other people in scope CC
 *
 * Each candidate row: name, current utilisation %, projected utilisation %
 * (colored by bucket; red + warning icon when > 100%).
 *
 * Calls `getRequestAssignmentPreview` for projected utilisation.
 *
 * Spec: guides/Capacity_Module_Redesign_Spec.md §9.3
 */
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { capacityApi } from '@/api/endpoints';
import type { AssignmentProjection } from '@/types/api';
// Note: capacityApi.getAssignmentPreview is used (mapped as getRequestAssignmentPreview
// in the spec for clarity).

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PersonCandidate {
  personId: string;
  personName: string;
  currentUtilPct: number;
  matchesRole: boolean;
  roleName?: string;
}

interface PersonRowProps {
  candidate: PersonCandidate;
  projectedPct: number | null;
  onSelect: (candidate: PersonCandidate) => void;
}

// ---------------------------------------------------------------------------
// Bucket helpers
// ---------------------------------------------------------------------------

type UtilBucket = 'blue' | 'green' | 'amber' | 'red';

function utilBucket(pct: number): UtilBucket {
  if (pct > 100) return 'red';
  if (pct >= 90) return 'amber';
  if (pct >= 70) return 'green';
  return 'blue';
}

const BUCKET_CLASSES: Record<UtilBucket, string> = {
  blue: 'text-blue-600 dark:text-blue-400',
  green: 'text-green-600 dark:text-green-400',
  amber: 'text-amber-600 dark:text-amber-400',
  red: 'text-red-600 dark:text-red-400',
};

// ---------------------------------------------------------------------------
// Individual person row
// ---------------------------------------------------------------------------

function CandidateRow({ candidate, projectedPct, onSelect }: PersonRowProps) {
  const bucket = projectedPct !== null ? utilBucket(projectedPct) : 'blue';
  const overLimit = projectedPct !== null && projectedPct > 100;

  return (
    <button
      type="button"
      onClick={() => onSelect(candidate)}
      className="flex w-full items-center justify-between px-2 py-1.5 text-left text-xs hover:bg-accent rounded-sm"
    >
      <span className="flex flex-col gap-0">
        <span className="font-medium text-foreground">{candidate.personName}</span>
        {candidate.roleName && !candidate.matchesRole && (
          <span className="text-[10px] text-muted-foreground">{candidate.roleName}</span>
        )}
      </span>

      <span className="flex items-center gap-1.5 shrink-0 ml-2">
        {/* Current util */}
        <span className="text-muted-foreground">{Math.round(candidate.currentUtilPct)}%</span>

        {/* Arrow */}
        <span className="text-muted-foreground">→</span>

        {/* Projected */}
        {projectedPct !== null ? (
          <span className={cn('font-medium', BUCKET_CLASSES[bucket])}>
            {Math.round(projectedPct)}%
            {overLimit && (
              <AlertTriangle className="inline ml-0.5 h-3 w-3 text-red-500" />
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">…</span>
        )}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface PersonPickerProps {
  ccId: string;
  requestId: number;
  month: string;
  requestedHours: number;
  candidates: PersonCandidate[];
  onSelect: (personId: string, personName: string, hours: number) => void;
  onClose: () => void;
  /**
   * When true, render an hours input above the candidate list pre-filled
   * with ``defaultHours`` (or the remaining hours derived from
   * ``requestedHours - alreadyAssignedHours``). Selecting a candidate
   * commits with the current value of the input, not the full request.
   *
   * This is the [+ Add] flow per spec §9.5. The default shape ([Assign])
   * always assigns the full requested hours.
   */
  showHoursInput?: boolean;
  /** Pre-fill value for the hours input (only used when showHoursInput=true). */
  defaultHours?: number;
  /** IDs of people already on this month — hidden from the picker. */
  excludedPersonIds?: string[];
}

export function PersonPicker({
  ccId,
  requestId,
  month,
  requestedHours,
  candidates,
  onSelect,
  onClose,
  showHoursInput = false,
  defaultHours,
  excludedPersonIds,
}: PersonPickerProps) {
  const [search, setSearch] = useState('');
  const [projections, setProjections] = useState<Map<string, number>>(new Map());
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const initialHours =
    typeof defaultHours === 'number' && defaultHours > 0
      ? defaultHours
      : requestedHours;
  const [hoursValue, setHoursValue] = useState<number>(initialHours);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  // Load projections for all candidates
  useEffect(() => {
    candidates.forEach((c) => {
      if (projections.has(c.personId) || loadingIds.has(c.personId)) return;
      setLoadingIds((prev) => new Set(prev).add(c.personId));
      capacityApi
        .getAssignmentPreview(ccId, requestId, c.personId)
        .then((preview) => {
          // Find the month-specific projection
          const monthProj: AssignmentProjection | undefined =
            preview.monthly_projections.find((p) => p.month === month);
          const pct = monthProj?.utilization_pct ?? c.currentUtilPct;
          setProjections((prev) => new Map(prev).set(c.personId, pct));
        })
        .catch(() => {
          // Fall back to current util on error
          setProjections((prev) =>
            new Map(prev).set(c.personId, c.currentUtilPct),
          );
        })
        .finally(() => {
          setLoadingIds((prev) => {
            const next = new Set(prev);
            next.delete(c.personId);
            return next;
          });
        });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, ccId, requestId, month]);

  // Hide already-assigned people in the [+ Add] flow so the picker only
  // surfaces additional candidates to split with (per spec §9.5).
  const excludedSet = new Set(excludedPersonIds ?? []);
  const visibleCandidates =
    excludedSet.size > 0
      ? candidates.filter((c) => !excludedSet.has(c.personId))
      : candidates;

  const filtered = search.trim()
    ? visibleCandidates.filter((c) =>
        c.personName.toLowerCase().includes(search.toLowerCase()),
      )
    : visibleCandidates;

  // §9.3 spec calls for "Matching role" / "Other roles" groups, but
  // CapacityRequestItem doesn't currently expose `role_type_id` on the
  // wire (only the human-readable `role_or_cost_type` name), so the
  // candidate split would always be empty. Render a single ungrouped
  // list until backend exposes role_type_id; tracked as a follow-up.
  const matching = filtered.filter((c) => c.matchesRole);
  const others = filtered.filter((c) => !c.matchesRole);
  const grouped = matching.length > 0;

  const hoursInvalid =
    showHoursInput && (!Number.isFinite(hoursValue) || hoursValue <= 0);

  const handleSelect = (c: PersonCandidate) => {
    if (hoursInvalid) return;
    // [Assign] flow → full requested hours; [+ Add] flow → user-typed hours.
    const hoursToCommit = showHoursInput ? hoursValue : requestedHours;
    onSelect(c.personId, c.personName, hoursToCommit);
    onClose();
  };

  return (
    <div
      ref={containerRef}
      className="absolute z-50 mt-1 w-72 rounded-md border border-border bg-card shadow-lg"
    >
      {/* Search */}
      <div className="flex items-center gap-1.5 border-b border-border px-2 py-1.5">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          autoFocus
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
        />
      </div>

      {/* Hours input (only in the [+ Add] flow per §9.5).
          Pre-filled with remaining hours so the most common split — accept
          the suggested portion — is one click away. The user can edit
          before picking a person. */}
      {showHoursInput && (
        <div className="flex items-center gap-2 border-b border-border px-2 py-1.5 text-xs">
          <span className="text-muted-foreground">Hours:</span>
          <input
            type="number"
            min={1}
            max={requestedHours}
            value={hoursValue}
            onChange={(e) => {
              // P2 #13 fix: clamp on change. HTML `max` is only enforced
              // at form submission, so a user pasting `999` would commit
              // 999h to the assignment. Clamp to [0, requestedHours].
              const v = parseFloat(e.target.value);
              if (!Number.isFinite(v)) {
                setHoursValue(0);
                return;
              }
              const clamped = Math.min(Math.max(0, v), requestedHours);
              setHoursValue(clamped);
            }}
            className={cn(
              'w-16 rounded border border-input bg-transparent px-1.5 py-0.5 text-xs tabular-nums outline-none focus:border-primary',
              hoursInvalid && 'border-red-400',
            )}
            aria-label="Hours to assign"
          />
          <span className="text-muted-foreground">
            of {requestedHours}h requested
          </span>
        </div>
      )}

      <div className="max-h-64 overflow-y-auto p-1">
        {/* Matching role group — only rendered when role-matching data
            is actually present (currently never until role_type_id lands
            on CapacityRequestItem). */}
        {grouped && matching.length > 0 && (
          <>
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Matching role
            </p>
            {matching.map((c) => (
              <CandidateRow
                key={c.personId}
                candidate={c}
                projectedPct={projections.get(c.personId) ?? null}
                onSelect={handleSelect}
              />
            ))}
          </>
        )}

        {/* Other-roles header is suppressed when no role-matching data
            exists — render the ungrouped candidate list directly. */}
        {others.length > 0 && (
          <>
            {grouped && (
              <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Other roles
              </p>
            )}
            {others.map((c) => (
              <CandidateRow
                key={c.personId}
                candidate={c}
                projectedPct={projections.get(c.personId) ?? null}
                onSelect={handleSelect}
              />
            ))}
          </>
        )}

        {filtered.length === 0 && (
          <p className="px-2 py-2 text-xs text-muted-foreground">
            No candidates found.
          </p>
        )}
      </div>
    </div>
  );
}
