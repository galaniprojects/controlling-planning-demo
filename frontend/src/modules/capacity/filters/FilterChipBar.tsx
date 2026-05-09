/**
 * FilterChipBar -- v5.2 W3 Track B (sec.6) + v5.2 W5 Track B (sec.10.10).
 *
 * Pill-shaped toggle chips positioned between the KPI bar and the
 * timeline. Each chip displays a count badge of how many rows would
 * match the chip if it were the only active filter (sec.6.1). Counts
 * are derived from whichever data set Track A passes — `rows` for
 * role/person view, `projectItems` for project view — so the rendered
 * list and badge counts always agree.
 *
 * Behaviour rules (sec.6.2):
 *   - Selecting any specific chip deactivates "All".
 *   - Selecting "All" deactivates every other chip.
 *   - Multiple specific chips combine with AND (the filter logic lives
 *     in `filterPeople` for role/person view, `projectFilters` for
 *     project view).
 *
 * Project view (sec.10.10):
 *   - The chip set is the same except:
 *     * "Unassigned months" is HIDDEN (merged with "Pending requests"
 *       per spec — every project with pending RRs has unassigned months).
 *     * A new "Needs staffing" chip appears, counting projects with
 *       fulfillment < 100%.
 *   - Counts use project-level predicates from `projectFilters.ts`.
 *
 * Mutual-exclusivity normalisation lives in the context's
 * `setActiveFilters` (`normalizeActiveFilters` helper) so this
 * component only computes the *next* set and hands it off.
 *
 * Spec: guides/Capacity_Module_Redesign_Spec.md sec.6, sec.10.10.
 */
import { useMemo } from 'react';
import { useCapacityScope } from '@/contexts/CapacityScopeContext';
import type { FilterChipKey } from '@/contexts/CapacityScopeContext';
import { cn } from '@/lib/utils';
import { countMatching, type TimelineRow } from './filterPeople';
import { countProjectsMatching } from '../timeline/projectFilters';
import type { CapacityProjectItem } from '@/types/api';

// --- Chip descriptors ---------------------------------------------------

interface ChipDef {
  key: FilterChipKey;
  label: string;
}

const PEOPLE_CHIPS: ChipDef[] = [
  { key: 'all', label: 'All' },
  { key: 'over_allocated', label: 'Over-allocated' },
  { key: 'under_utilized', label: 'Under-utilized' },
  { key: 'pending_requests', label: 'Pending requests' },
  { key: 'unassigned_months', label: 'Unassigned months' },
];

// Project view (§10.10): swap "Unassigned months" for "Needs staffing".
const PROJECT_CHIPS: ChipDef[] = [
  { key: 'all', label: 'All' },
  { key: 'over_allocated', label: 'Over-allocated' },
  { key: 'under_utilized', label: 'Under-utilized' },
  { key: 'pending_requests', label: 'Pending requests' },
  { key: 'needs_staffing', label: 'Needs staffing' },
];

// --- Component ----------------------------------------------------------

export interface FilterChipBarProps {
  /**
   * The same row array Track A's TimelineView renders. Empty arrays are
   * valid (chip badges show `0` and clicking still toggles the filter).
   * Ignored when `projectItems` is provided (project view).
   */
  rows: readonly TimelineRow[];
  /**
   * v5.2 W5 §10.10 — when group-by-project is active, the parent passes
   * the unfiltered project list here so chip counts use project-level
   * predicates and the bar swaps "Unassigned months" for
   * "Needs staffing".
   */
  projectItems?: readonly CapacityProjectItem[];
  className?: string;
}

export function FilterChipBar({ rows, projectItems, className }: FilterChipBarProps) {
  const { activeFilters, setActiveFilters } = useCapacityScope();
  const isProjectMode = projectItems !== undefined;
  const chips = isProjectMode ? PROJECT_CHIPS : PEOPLE_CHIPS;

  // Pre-compute every chip's count once per render so we don't iterate
  // the row array N times for N chips.
  const counts = useMemo(() => {
    const map: Partial<Record<FilterChipKey, number>> = {};
    for (const chip of chips) {
      if (isProjectMode) {
        map[chip.key] = countProjectsMatching(projectItems!, chip.key);
      } else {
        map[chip.key] = countMatching(rows, chip.key);
      }
    }
    return map;
  }, [chips, isProjectMode, projectItems, rows]);

  const isActive = (key: FilterChipKey) => activeFilters.includes(key);

  const handleClick = (key: FilterChipKey) => {
    if (key === 'all') {
      // Selecting "All" deactivates every specific chip.
      setActiveFilters(['all']);
      return;
    }
    // Toggle the specific chip. The context normaliser strips "all"
    // automatically when a specific chip becomes active.
    if (isActive(key)) {
      const next = activeFilters.filter((f) => f !== key);
      // If the user just turned off the last specific chip, the
      // normaliser will fall back to ['all'] for us.
      setActiveFilters(next);
    } else {
      // Add the new chip to the existing set (drop "all" first so we
      // don't fight the normaliser's mutual-exclusivity rule).
      const next = activeFilters.filter((f) => f !== 'all');
      next.push(key);
      setActiveFilters(next);
    }
  };

  return (
    <div
      className={cn('flex flex-wrap items-center gap-2', className)}
      role="group"
      aria-label="Capacity row filters"
    >
      {chips.map((chip) => {
        const active = isActive(chip.key);
        const count = counts[chip.key] ?? 0;
        return (
          <button
            key={chip.key}
            type="button"
            onClick={() => handleClick(chip.key)}
            aria-pressed={active}
            className={cn(
              // sec.6.3 visual states.
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
              active
                ? // Active: inverted -- primary background, primary-foreground text, no border.
                  'border border-transparent bg-primary text-primary-foreground hover:bg-primary/90'
                : // Inactive: transparent background, secondary text, tertiary border.
                  'border border-border bg-transparent text-muted-foreground hover:bg-accent/40 hover:text-foreground',
            )}
          >
            <span>{chip.label}</span>
            <span
              className={cn(
                'tabular-nums',
                active ? 'opacity-80' : 'opacity-70',
              )}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default FilterChipBar;
