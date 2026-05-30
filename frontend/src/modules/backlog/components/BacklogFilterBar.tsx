/**
 * BacklogFilterBar — filter controls for the Backlog module. [A-BK-21..23]
 *
 * Combines the shared FilterBar pattern with backlog-specific controls.
 * Server-side filters: pipeline_stage, project_type, tshirt_size.
 * Client-side filters: transformation_level, within_cutoff.
 */

import { X } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  type BacklogFilters,
  DEFAULT_BACKLOG_START_YEAR,
} from '../BacklogContext';

interface Props {
  filters: BacklogFilters;
  onFilterChange: <K extends keyof BacklogFilters>(
    key: K,
    value: BacklogFilters[K],
  ) => void;
  onClear: () => void;
}

// Pipeline stage options aligned with [A-PS-02]. Backlog endpoint only
// surfaces BACKLOG_STAGES (Proposed → Active + Paused); operate-stage rows
// (Hyper-maintenance / Operate / Retired) belong to the Run Portfolio.
const PIPELINE_STAGES = [
  { value: '', label: 'All Stages' },
  { value: 'Proposed', label: 'Proposed' },
  { value: 'Under Evaluation', label: 'Under Evaluation' },
  { value: 'Approved', label: 'Approved' },
  { value: 'Active', label: 'Active' },
  { value: 'Paused', label: 'Paused' },
  { value: 'Cancelled', label: 'Cancelled' },
];

const PROJECT_TYPES = [
  { value: '', label: 'All project types' },
  { value: '1', label: 'P1 — Business case' },
  { value: '2', label: 'P2 — Strategic' },
  { value: '3', label: 'P3 — Compliance' },
];

const TSHIRT_SIZES = [
  { value: '', label: 'All Sizes' },
  { value: 'XS', label: 'XS' },
  { value: 'S', label: 'S' },
  { value: 'M', label: 'M' },
  { value: 'L', label: 'L' },
  { value: 'XL', label: 'XL' },
];

const T_LEVELS = [
  { value: '', label: 'All T-Levels' },
  { value: 'T0', label: 'T0 — Just better' },
  { value: 'T1', label: 'T1 — Paper to software' },
  { value: 'T2', label: 'T2 — New business' },
];

// Start-year scope (VIPER §4.1). The ranked item rows don't carry a
// start_month client-side, so we offer a fixed range centred on the demo
// fiscal year (DEMO_DATE April 2026): the prior planning year through the
// short-term horizon, plus an explicit "All years" escape hatch. Default
// is FY2026 (see DEFAULT_BACKLOG_START_YEAR in BacklogContext).
const START_YEARS = [
  { value: 'all', label: 'All years' },
  { value: '2025', label: 'FY 2025' },
  { value: '2026', label: 'FY 2026' },
  { value: '2027', label: 'FY 2027' },
  { value: '2028', label: 'FY 2028' },
];

function hasActive(filters: BacklogFilters): boolean {
  return (
    !!filters.pipeline_stage ||
    !!filters.project_type ||
    !!filters.tshirt_size ||
    // Year diverges from the default FY when it's empty/all or a non-default year.
    filters.start_year !== DEFAULT_BACKLOG_START_YEAR ||
    !!filters.transformation_level ||
    filters.within_cutoff
  );
}

export function BacklogFilterBar({ filters, onFilterChange, onClear }: Props) {
  const active = hasActive(filters);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Server-side filters */}
      <FilterSelect
        value={filters.pipeline_stage}
        options={PIPELINE_STAGES}
        placeholder="Stage"
        onChange={(v) => onFilterChange('pipeline_stage', v)}
      />
      <FilterSelect
        value={filters.project_type}
        options={PROJECT_TYPES}
        placeholder="Type"
        onChange={(v) => onFilterChange('project_type', v)}
      />
      <FilterSelect
        value={filters.tshirt_size}
        options={TSHIRT_SIZES}
        placeholder="Size"
        onChange={(v) => onFilterChange('tshirt_size', v)}
      />

      {/* Start-year scope — 'all' is a real value, so it does not use the
          'all'<->'' collapsing of the shared FilterSelect. */}
      <Select
        value={filters.start_year || 'all'}
        onValueChange={(v) => onFilterChange('start_year', v)}
      >
        <SelectTrigger className="h-9 w-auto min-w-[120px] text-sm">
          <SelectValue placeholder="Start year" />
        </SelectTrigger>
        <SelectContent>
          {START_YEARS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Client-side filters */}
      <FilterSelect
        value={filters.transformation_level}
        options={T_LEVELS}
        placeholder="T-Level"
        onChange={(v) => onFilterChange('transformation_level', v)}
      />

      <button
        type="button"
        onClick={() => onFilterChange('within_cutoff', !filters.within_cutoff)}
        className={cn(
          'inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          filters.within_cutoff
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        )}
        aria-pressed={filters.within_cutoff}
      >
        Within cutoff
      </button>

      {active && (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <X className="size-3" aria-hidden />
          Clear
        </button>
      )}
    </div>
  );
}

function FilterSelect({
  value,
  options,
  placeholder,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value || 'all'} onValueChange={(v) => onChange(v === 'all' ? '' : v)}>
      <SelectTrigger className="h-9 w-auto min-w-[120px] text-sm">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value || 'all'} value={o.value || 'all'}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
