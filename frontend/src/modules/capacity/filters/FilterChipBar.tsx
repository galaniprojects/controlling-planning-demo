/**
 * FilterChipBar -- v5.2 W3 Track B (sec.6).
 *
 * Pill-shaped toggle chips positioned between the KPI bar and the
 * timeline. Each chip displays a count badge of how many people would
 * match the chip if it were the only active filter (sec.6.1). Counts are
 * derived from the same `TimelineRow[]` Track A passes to the timeline
 * so the rendered list and the badge counts always agree.
 *
 * Behaviour rules (sec.6.2):
 *   - Selecting any specific chip deactivates "All".
 *   - Selecting "All" deactivates every other chip.
 *   - Multiple specific chips combine with AND (the filter logic lives
 *     in `filterPeople`).
 *
 * Mutual-exclusivity normalisation lives in the context's
 * `setActiveFilters` (`normalizeActiveFilters` helper) so this
 * component only computes the *next* set and hands it off.
 *
 * Spec: guides/Capacity_Module_Redesign_Spec.md sec.6.
 */
import { useMemo } from 'react';
import { useCapacityScope } from '@/contexts/CapacityScopeContext';
import type { FilterChipKey } from '@/contexts/CapacityScopeContext';
import { cn } from '@/lib/utils';
import { countMatching, type TimelineRow } from './filterPeople';

// --- Chip descriptors ---------------------------------------------------

interface ChipDef {
  key: FilterChipKey;
  label: string;
}

const CHIPS: ChipDef[] = [
  { key: 'all', label: 'All' },
  { key: 'over_allocated', label: 'Over-allocated' },
  { key: 'under_utilized', label: 'Under-utilized' },
  { key: 'pending_requests', label: 'Pending requests' },
  { key: 'unassigned_months', label: 'Unassigned months' },
];

// --- Component ----------------------------------------------------------

export interface FilterChipBarProps {
  /**
   * The same row array Track A's TimelineView renders. Empty arrays are
   * valid (chip badges show `0` and clicking still toggles the filter).
   */
  rows: readonly TimelineRow[];
  className?: string;
}

export function FilterChipBar({ rows, className }: FilterChipBarProps) {
  const { activeFilters, setActiveFilters } = useCapacityScope();

  // Pre-compute every chip's count once per render so we don't iterate
  // the row array N times for N chips.
  const counts = useMemo(() => {
    const map: Record<FilterChipKey, number> = {
      all: 0,
      over_allocated: 0,
      under_utilized: 0,
      pending_requests: 0,
      unassigned_months: 0,
    };
    for (const chip of CHIPS) {
      map[chip.key] = countMatching(rows, chip.key);
    }
    return map;
  }, [rows]);

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
      {CHIPS.map((chip) => {
        const active = isActive(chip.key);
        const count = counts[chip.key];
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
