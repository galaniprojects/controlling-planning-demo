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
}

export function PersonPicker({
  ccId,
  requestId,
  month,
  requestedHours,
  candidates,
  onSelect,
  onClose,
}: PersonPickerProps) {
  const [search, setSearch] = useState('');
  const [projections, setProjections] = useState<Map<string, number>>(new Map());
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
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

  const filtered = search.trim()
    ? candidates.filter((c) =>
        c.personName.toLowerCase().includes(search.toLowerCase()),
      )
    : candidates;

  const matching = filtered.filter((c) => c.matchesRole);
  const others = filtered.filter((c) => !c.matchesRole);

  const handleSelect = (c: PersonCandidate) => {
    onSelect(c.personId, c.personName, requestedHours);
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

      <div className="max-h-64 overflow-y-auto p-1">
        {/* Matching role group */}
        {matching.length > 0 && (
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

        {/* Other roles group */}
        {others.length > 0 && (
          <>
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Other roles
            </p>
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
