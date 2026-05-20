/**
 * Version selector dropdown for the Stage 1 distribution list per
 * FD-3 [F-S1-02..04]. Renders the production-version timeline as a
 * shadcn `Select`, surfaces the in-force resolver pick prominently, and
 * exposes the rationale + origin in the trigger subtitle so the user
 * always knows what they're editing against.
 *
 * Scenario-scoped versions are NOT shown — those live behind the
 * simulator's lever 12 sandbox and are filtered out server-side by
 * `listDistributionVersions({ include_scenario: false })` (default).
 *
 * Drafts are surfaced separately so the "Active" group reads cleanly.
 */
import { useMemo } from 'react';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel,
  SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { DistributionVersionResponse } from '@/types/api';
import { VersionStatusBadge } from './VersionStatusBadge';
import {
  formatVersionDate,
  originLabel,
  versionPrimaryLabel,
} from './versionLabels';

export interface VersionSelectorProps {
  versions: DistributionVersionResponse[];
  selectedVersionId: number | null;
  /** Server-resolved in-force version id (latest active `active_from ≤ today`). */
  inForceVersionId: number | null;
  onChange: (versionId: number) => void;
  className?: string;
  disabled?: boolean;
}

export function VersionSelector({
  versions,
  selectedVersionId,
  inForceVersionId,
  onChange,
  className,
  disabled,
}: VersionSelectorProps) {
  const { active, drafts, selected } = useMemo(() => {
    const a: DistributionVersionResponse[] = [];
    const d: DistributionVersionResponse[] = [];
    let sel: DistributionVersionResponse | null = null;
    for (const v of versions) {
      if (v.scenario_id !== null) continue; // defensive: scenario versions hidden
      if (v.id === selectedVersionId) sel = v;
      if (v.status === 'active') a.push(v);
      else d.push(v);
    }
    // Active: latest active_from first (most recent on top)
    a.sort((x, y) => (y.active_from ?? '').localeCompare(x.active_from ?? ''));
    // Drafts: future-dated first (scheduled), then bare drafts; tie-break by id desc
    d.sort((x, y) => {
      if (x.active_from && y.active_from) return x.active_from.localeCompare(y.active_from);
      if (x.active_from) return -1;
      if (y.active_from) return 1;
      return y.id - x.id;
    });
    return { active: a, drafts: d, selected: sel };
  }, [versions, selectedVersionId]);

  const triggerSubtitle = selected
    ? `${originLabel(selected.origin)} · ${selected.active_from ? `from ${formatVersionDate(selected.active_from)}` : 'unscheduled'}`
    : 'Pick a version';

  return (
    <Select
      value={selectedVersionId === null ? '' : String(selectedVersionId)}
      onValueChange={(v) => onChange(Number(v))}
      disabled={disabled}
    >
      <SelectTrigger className={className ?? 'w-[320px] h-auto py-1.5'}>
        <SelectValue placeholder="Pick a version">
          {selected && (
            <div className="flex flex-col text-left">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">
                  {versionPrimaryLabel(selected)}
                </span>
                <VersionStatusBadge
                  status={selected.status}
                  isInForce={selected.id === inForceVersionId}
                  size="sm"
                />
              </div>
              <span className="text-[11px] text-muted-foreground mt-0.5">
                {triggerSubtitle}
              </span>
            </div>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-[420px]">
        {active.length > 0 && (
          <SelectGroup>
            <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Active production
            </SelectLabel>
            {active.map((v) => (
              <SelectItem key={v.id} value={String(v.id)}>
                <div className="flex flex-col py-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      v{v.id} · from {formatVersionDate(v.active_from)}
                    </span>
                    <VersionStatusBadge
                      status="active"
                      isInForce={v.id === inForceVersionId}
                      size="sm"
                    />
                  </div>
                  <span className="text-[11px] text-muted-foreground mt-0.5">
                    {originLabel(v.origin)} · {v.edge_count ?? 0} edge
                    {(v.edge_count ?? 0) !== 1 ? 's' : ''}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectGroup>
        )}
        {drafts.length > 0 && (
          <SelectGroup>
            <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Drafts
            </SelectLabel>
            {drafts.map((v) => (
              <SelectItem key={v.id} value={String(v.id)}>
                <div className="flex flex-col py-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      v{v.id} ·{' '}
                      {v.active_from
                        ? `scheduled ${formatVersionDate(v.active_from)}`
                        : 'unscheduled'}
                    </span>
                    <VersionStatusBadge status="draft" size="sm" />
                  </div>
                  <span className="text-[11px] text-muted-foreground mt-0.5">
                    {originLabel(v.origin)} · {v.edge_count ?? 0} edge
                    {(v.edge_count ?? 0) !== 1 ? 's' : ''}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectGroup>
        )}
        {active.length === 0 && drafts.length === 0 && (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">
            No versions yet. Create one to start editing.
          </div>
        )}
      </SelectContent>
    </Select>
  );
}
