/**
 * MasterDataTab — DoI-aware completeness checklist. [A-BK-20][A-BK-30][A-PS-04]
 *
 * A8 update: surfaces the live DoI gate checklist (server-computed missing
 * fields for advancing to the next DoI) above the section-by-section
 * completeness summary.
 */

import type { RankedProjectItem } from '@/types/api';
import type { TechNavigatorProfile } from '@/types/techNavigator';
import {
  getCumulativeRequirements,
  type DoIFieldRequirement,
} from './DoIRequirementsRegistry';
import { FieldCompletenessRow } from './FieldCompletenessRow';
import { DoIGateChecklist } from '@/components/shared/DoIGateChecklist';
import { Skeleton } from '@/components/shared/Skeleton';
import { usePipelineState } from '@/hooks/usePipelineState';

interface Props {
  rankingItem: RankedProjectItem | null;
  tnProfile: TechNavigatorProfile | null;
  loading: boolean;
  projectId: string;
}

type FieldStatus = 'present' | 'missing' | 'required-from-doi';

/**
 * Resolve the current value of a requirement field from available data.
 * Returns [value, status].
 */
function resolveField(
  field: string,
  rankingItem: RankedProjectItem | null,
  tnProfile: TechNavigatorProfile | null,
): [string | number | null, FieldStatus] {
  // Project-level fields from ranking item
  if (field === 'name') {
    return [rankingItem?.project_name ?? null, rankingItem?.project_name ? 'present' : 'missing'];
  }
  if (field === 'pipeline_stage') {
    return [rankingItem?.pipeline_stage ?? null, rankingItem?.pipeline_stage ? 'present' : 'missing'];
  }
  if (field === 'project_type') {
    return [
      rankingItem?.project_type ?? null,
      rankingItem?.project_type !== null && rankingItem?.project_type !== undefined
        ? 'present'
        : 'missing',
    ];
  }
  if (field === 'transformation_level') {
    return [
      rankingItem?.transformation_level ?? null,
      rankingItem?.transformation_level ? 'present' : 'missing',
    ];
  }
  if (field === 'total_budget') {
    return [
      rankingItem?.total_budget ?? null,
      rankingItem?.total_budget !== null && rankingItem?.total_budget !== undefined
        ? 'present'
        : 'missing',
    ];
  }
  if (field === 'composite_score') {
    return [
      rankingItem?.composite_score ?? null,
      rankingItem?.composite_score !== null && rankingItem?.composite_score !== undefined
        ? 'present'
        : 'missing',
    ];
  }

  // Tech Navigator sub-criteria from TN profile
  if (tnProfile) {
    const val = (tnProfile as Record<string, unknown>)[field];
    if (val !== null && val !== undefined) {
      return [val as number, 'present'];
    }
    return [null, 'missing'];
  }

  return [null, 'missing'];
}

export function MasterDataTab({ rankingItem, tnProfile, loading, projectId }: Props) {
  const { data: pipelineState } = usePipelineState(projectId);
  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  const doi = rankingItem?.doi ?? 0;
  const requirements = getCumulativeRequirements(doi);

  const present = requirements.filter(
    (r) => resolveField(r.field, rankingItem, tnProfile)[1] === 'present',
  ).length;
  const total = requirements.length;

  const bySection = requirements.reduce<
    Record<DoIFieldRequirement['section'], DoIFieldRequirement[]>
  >(
    (acc, r) => {
      if (!acc[r.section]) acc[r.section] = [];
      acc[r.section].push(r);
      return acc;
    },
    { tech_navigator: [], financial: [], project: [] },
  );

  const sectionLabels: Record<DoIFieldRequirement['section'], string> = {
    project: 'Project',
    financial: 'Financial',
    tech_navigator: 'Tech Navigator',
  };

  return (
    <div className="space-y-4">
      {/* Live DoI gate checklist [A-PS-04] */}
      <DoIGateChecklist gate={pipelineState?.gate_status ?? null} />

      {/* Summary */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold text-foreground">
            DoI {doi} completeness
          </span>
          <span
            className={
              present === total
                ? 'text-sm font-medium text-emerald-600 dark:text-emerald-400'
                : 'text-sm font-medium text-amber-600 dark:text-amber-400'
            }
          >
            {present} / {total}
          </span>
        </div>
        <div className="mt-2 h-2 w-full rounded-full bg-muted">
          <div
            className={`h-2 rounded-full transition-all ${
              present === total
                ? 'bg-emerald-500 dark:bg-emerald-400'
                : 'bg-amber-500 dark:bg-amber-400'
            }`}
            style={{ width: `${total > 0 ? (present / total) * 100 : 0}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Cumulative requirements for DoI 0 – {doi}. Working definition per
          [A-BK-30] — subject to update in [A-OQ-04].
        </p>
      </div>

      {/* Per section */}
      {(
        ['project', 'financial', 'tech_navigator'] as DoIFieldRequirement['section'][]
      ).map((section) => {
        const reqs = bySection[section];
        if (!reqs || reqs.length === 0) return null;
        return (
          <div key={section} className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              {sectionLabels[section]}
            </h3>
            <div>
              {reqs.map((req) => {
                const [value, status] = resolveField(
                  req.field,
                  rankingItem,
                  tnProfile,
                );
                return (
                  <FieldCompletenessRow
                    key={req.field}
                    requirement={req}
                    status={status}
                    currentValue={value}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
