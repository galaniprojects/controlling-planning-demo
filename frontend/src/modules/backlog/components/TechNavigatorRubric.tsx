/**
 * TechNavigatorRubric — legacy Tech Navigator scoring rubric.
 *
 * v5.2 Define-page redesign: this component is now a thin presentational
 * shell. Its autosave-on-blur logic was deleted as part of the
 * autosave-removal redesign (Define page is the canonical TN editor —
 * `frontend/src/modules/define/TechNavigatorTab.tsx`). The legacy
 * Backlog detail page that mounted this component is itself being
 * redirected to `/define/{id}`, so in normal usage this file is no
 * longer reached.
 *
 * Kept for the brief transition window (and for any test that still
 * imports it directly) — but it intentionally:
 *
 *   • does NOT debounce a PUT on edit (autosave removed);
 *   • does NOT mount its own writable buffer (caller is expected to be
 *     read-only or to wire `onPatch` for explicit saves);
 *   • surfaces optimistic edits locally only.
 *
 * For new surfaces use `TechNavigatorTab` directly. For PR review
 * convenience this file keeps the same exported component name and
 * `Props` so call-sites compile without modification during the
 * Define-page redesign rollout.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Skeleton } from '@/components/shared/Skeleton';
import { techNavigatorApi } from '@/api/endpoints';
import {
  COMPLEXITY_SUB_CRITERIA,
  PROJECT_TYPES,
  TRANSFORMATION_LEVELS,
  VALUE_CREATION_SUB_CRITERIA,
  type SubCriterionRubric,
} from '../data/rubricLabels';
import type {
  ProjectType,
  SubCriterionScore,
  TechNavigatorProfile,
  TechNavigatorUpdate,
  TechNavigatorWeights,
  TransformationLevel,
} from '@/types/techNavigator';
import { ScoreSummaryCard } from './ScoreSummaryCard';
import { RubricSubCriterionRow } from './RubricSubCriterionRow';
import { cn } from '@/lib/utils';
import {
  computeComplexity as recomputeComplexity,
  computeValueCreation as recomputeValueCreation,
  computeComposite as recomputeComposite,
} from '@/modules/admin/scoring/lib/scoringMath';

interface Props {
  projectId: string;
  /**
   * If true, all controls are disabled. Driven by host page (e.g. when current
   * role is executive or CC owner). Defaults to false.
   */
  readOnly?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TechNavigatorRubric({ projectId, readOnly = false }: Props) {
  const [profile, setProfile] = useState<TechNavigatorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initial load. No subsequent save round-trips — autosave was removed in the
  // v5.2 Define-page redesign; TechNavigatorTab in `modules/define/` owns
  // explicit Save semantics now. State resets deferred to the async
  // callbacks to satisfy `react-hooks/set-state-in-effect`.
  useEffect(() => {
    let alive = true;
    techNavigatorApi
      .get(projectId)
      .then((data) => {
        if (!alive) return;
        setProfile(data);
        setError(null);
      })
      .catch((e: Error) => {
        if (!alive) return;
        setError(e.message ?? 'Failed to load Tech Navigator profile');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [projectId]);

  // Local computed scores. The legacy rubric used to round-trip a PUT after
  // each edit; with the autosave removal these stay in local state only.
  // Anyone surfacing real persistence should use TechNavigatorTab instead.
  const computed = useMemo(() => {
    if (!profile) {
      return { complexity: null, value: null, composite: null };
    }
    const complexity = recomputeComplexity(profile, profile.weights);
    const value = recomputeValueCreation(profile, profile.weights);
    const composite = recomputeComposite(complexity, value, profile.weights);
    return { complexity, value, composite };
  }, [profile]);

  // Local-only optimistic update. No PUT. Legacy callers will eventually be
  // routed through the Define page; until then edits made here vanish on
  // reload, which is the intentional "demo gone bad" state during the
  // transition.
  const updateField = useCallback(
    <K extends keyof TechNavigatorUpdate>(
      key: K,
      value: TechNavigatorUpdate[K],
    ) => {
      setProfile((prev) => (prev ? { ...prev, [key]: value } : prev));
    },
    [],
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {error ?? 'No Tech Navigator profile available for this project.'}
      </div>
    );
  }

  const w = profile.weights;

  return (
    <div className="space-y-4">
      <ScoreSummaryCard
        complexityScore={computed.complexity}
        valueCreationScore={computed.value}
        compositeScore={computed.composite}
        tshirtSize={profile.tshirt_size}
        totalBudget={profile.total_budget}
        weights={w}
      />

      <ProfileSelectorRow
        projectType={profile.project_type}
        transformationLevel={profile.transformation_level}
        readOnly={readOnly}
        onProjectTypeChange={(v) => updateField('project_type', v)}
        onTransformationLevelChange={(v) =>
          updateField('transformation_level', v)
        }
      />

      <RubricBlock
        title="Complexity"
        subtitle="Higher score = simpler / better. Three weighted sub-criteria."
        rubrics={COMPLEXITY_SUB_CRITERIA}
        valueGetter={(field) =>
          (profile[field as keyof TechNavigatorProfile] as SubCriterionScore) ??
          null
        }
        weightFor={(rubric) =>
          (w.complexity as unknown as Record<string, number>)[rubric.weightKey] ?? 0
        }
        onChange={(field, v) =>
          updateField(field as keyof TechNavigatorUpdate, v)
        }
        readOnly={readOnly}
      />

      <RubricBlock
        title="Value Creation"
        subtitle="Three weighted sub-criteria. Two reserved slots are inactive in v5."
        rubrics={VALUE_CREATION_SUB_CRITERIA}
        valueGetter={(field) =>
          (profile[field as keyof TechNavigatorProfile] as SubCriterionScore) ??
          null
        }
        weightFor={(rubric) =>
          (w.value_creation as unknown as Record<string, number>)[rubric.weightKey] ?? 0
        }
        onChange={(field, v) =>
          updateField(field as keyof TechNavigatorUpdate, v)
        }
        readOnly={readOnly}
        reservedSlotsHint
      />

      <WeightsFooter weights={w} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-views
// ---------------------------------------------------------------------------

interface ProfileSelectorRowProps {
  projectType: ProjectType | null;
  transformationLevel: TransformationLevel | null;
  readOnly: boolean;
  onProjectTypeChange: (v: ProjectType) => void;
  onTransformationLevelChange: (v: TransformationLevel) => void;
}

function ProfileSelectorRow({
  projectType,
  transformationLevel,
  readOnly,
  onProjectTypeChange,
  onTransformationLevelChange,
}: ProfileSelectorRowProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="rounded-md border border-border bg-card p-3">
        <div className="mb-2">
          <h3 className="text-sm font-semibold text-foreground">
            Project type
          </h3>
          <p className="text-xs text-muted-foreground">
            Determines how prioritization treats the project. P3 is exempt
            from the cutoff line.
          </p>
        </div>
        <div className="flex flex-col gap-2" role="radiogroup">
          {PROJECT_TYPES.map((opt) => {
            const selected = projectType === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={readOnly}
                onClick={() => onProjectTypeChange(opt.value)}
                className={cn(
                  'flex items-start gap-2 rounded-md border px-3 py-2 text-left transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  selected
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-background hover:bg-accent hover:text-accent-foreground',
                  readOnly && 'cursor-not-allowed opacity-60',
                )}
              >
                <span
                  className={cn(
                    'mt-1 inline-block size-3 shrink-0 rounded-full border-2 ring-2 ring-offset-2 ring-offset-background',
                    opt.ringClass,
                    selected ? 'bg-primary' : 'bg-background',
                  )}
                  aria-hidden
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-foreground">
                    {opt.label}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {opt.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-md border border-border bg-card p-3">
        <div className="mb-2">
          <h3 className="text-sm font-semibold text-foreground">
            Transformation level
          </h3>
          <p className="text-xs text-muted-foreground">
            Categorical decorator. Filterable in the backlog cube but does not
            factor into the ranking score.
          </p>
        </div>
        <div className="flex flex-col gap-2" role="radiogroup">
          {TRANSFORMATION_LEVELS.map((opt) => {
            const selected = transformationLevel === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={readOnly}
                onClick={() => onTransformationLevelChange(opt.value)}
                className={cn(
                  'rounded-md border px-3 py-2 text-left transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  selected
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-background hover:bg-accent hover:text-accent-foreground',
                  readOnly && 'cursor-not-allowed opacity-60',
                )}
              >
                <div className="text-sm font-medium text-foreground">
                  {opt.label}
                </div>
                <div className="text-xs text-muted-foreground">
                  {opt.description}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface RubricBlockProps {
  title: string;
  subtitle: string;
  rubrics: SubCriterionRubric[];
  valueGetter: (field: string) => SubCriterionScore;
  weightFor: (rubric: SubCriterionRubric) => number;
  onChange: (field: string, value: SubCriterionScore) => void;
  readOnly: boolean;
  reservedSlotsHint?: boolean;
}

function RubricBlock({
  title,
  subtitle,
  rubrics,
  valueGetter,
  weightFor,
  onChange,
  readOnly,
  reservedSlotsHint = false,
}: RubricBlockProps) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="space-y-3">
        {rubrics.map((r) => (
          <RubricSubCriterionRow
            key={r.field}
            rubric={r}
            value={valueGetter(r.field)}
            weightPct={weightFor(r)}
            readOnly={readOnly}
            onChange={(v) => onChange(r.field, v)}
          />
        ))}
        {reservedSlotsHint ? (
          <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            Two reserved Value Creation slots are present in the data model at
            0 % weight and intentionally not surfaced in v5 ([A-TN-05]).
            Activation will follow the admin Tech Navigator weights editor.
          </div>
        ) : null}
      </div>
    </section>
  );
}

interface WeightsFooterProps {
  weights: TechNavigatorWeights;
}

function WeightsFooter({ weights }: WeightsFooterProps) {
  const fmtPct = (n: number) => `${n.toFixed(0)} %`;
  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-3 text-xs">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium text-foreground">Active weights</span>
        <span className="text-muted-foreground">
          Read-only — edit in Admin → Tech Navigator Weights
        </span>
      </div>
      <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-3">
        <div>
          <div className="font-medium text-foreground">Complexity sub-criteria</div>
          <div className="text-muted-foreground">
            Standardization {fmtPct(weights.complexity.standardization)} ·
            Usage {fmtPct(weights.complexity.usage)} · Maintenance{' '}
            {fmtPct(weights.complexity.maintenance)}
          </div>
        </div>
        <div>
          <div className="font-medium text-foreground">Value Creation sub-criteria</div>
          <div className="text-muted-foreground">
            Financial {fmtPct(weights.value_creation.financial)} · Payback{' '}
            {fmtPct(weights.value_creation.payback)} · Competitive{' '}
            {fmtPct(weights.value_creation.competitive)}
          </div>
        </div>
        <div>
          <div className="font-medium text-foreground">Composite ranking</div>
          <div className="text-muted-foreground">
            Value {fmtPct(weights.ranking.value)} · Complexity{' '}
            {fmtPct(weights.ranking.complexity)}
          </div>
        </div>
      </div>
    </div>
  );
}
