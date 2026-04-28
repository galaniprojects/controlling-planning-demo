/**
 * TechNavigatorRubric — Tech Navigator scoring rubric for a single project
 * [A-TN-01] [A-TN-02] [A-TN-03] [A-TN-04] [A-TN-06] [A-TN-07] [A-TN-08] [A-TN-09].
 *
 * This component is the entire "Scores & Ranking" tab content for the Backlog
 * project detail view. A6 will integrate it later; A7 ships it as a
 * self-contained reusable component.
 *
 * Layout (top to bottom):
 *   1. ScoreSummaryCard — computed Complexity / Value Creation / Composite + t-shirt size
 *   2. Project profile row — Project Type (1/2/3) + Transformation level (T0/T1/T2)
 *   3. Complexity sub-criteria block (3 rows: Standardization, Usage, Maintenance)
 *   4. Value Creation sub-criteria block (3 rows: Financial benefit, Payback, Competitive advantage)
 *   5. Active weights footer (read-only sub-criterion weights with note pointing to Admin)
 *
 * Real-time strategy:
 *   - Local state holds the optimistic profile after each user action.
 *   - Computed scores are derived locally on the fly using the same weighted-
 *     average formula as the backend (services/tech_navigator.py) so they
 *     update instantly.
 *   - Every change triggers a debounced (300 ms) PUT. The server's authoritative
 *     response replaces local computed scores once it returns, ensuring the
 *     displayed numbers stay in sync with backend rounding semantics.
 *
 * Read-only mode is toggled via the `readOnly` prop. Driven from the host page
 * by role (controllers + assigned PL can edit; executive + CC owners read-only).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
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

interface Props {
  projectId: string;
  /**
   * If true, all controls are disabled. Driven by host page (e.g. when current
   * role is executive or CC owner). Defaults to false.
   */
  readOnly?: boolean;
}

const DEBOUNCE_MS = 300;
const SAVED_INDICATOR_MS = 1500;

// ---------------------------------------------------------------------------
// Local recompute helpers — mirror backend services/tech_navigator.py.
// Kept inline so the component stays self-contained.
// ---------------------------------------------------------------------------

function weightedAverage(
  values: Array<number | null>,
  weights: number[],
): number | null {
  if (values.some((v) => v === null || v === undefined)) return null;
  const totalWeight = weights.reduce<number>((s, w) => s + w, 0);
  if (totalWeight <= 0) return null;
  const weighted = values.reduce<number>(
    (s, v, i) => s + (v as number) * weights[i],
    0,
  );
  return Math.round((weighted / totalWeight) * 100) / 100;
}

function recomputeComplexity(
  profile: TechNavigatorProfile,
  weights: TechNavigatorWeights,
): number | null {
  return weightedAverage(
    [
      profile.tn_standardization,
      profile.tn_usage,
      profile.tn_maintenance,
    ],
    [
      weights.complexity.standardization,
      weights.complexity.usage,
      weights.complexity.maintenance,
    ],
  );
}

function recomputeValueCreation(
  profile: TechNavigatorProfile,
  weights: TechNavigatorWeights,
): number | null {
  return weightedAverage(
    [
      profile.tn_financial_benefit,
      profile.tn_payback,
      profile.tn_competitive_advantage,
    ],
    [
      weights.value_creation.financial,
      weights.value_creation.payback,
      weights.value_creation.competitive,
    ],
  );
}

function recomputeComposite(
  complexity: number | null,
  value: number | null,
  weights: TechNavigatorWeights,
): number | null {
  if (complexity === null || value === null) return null;
  const total = weights.ranking.value + weights.ranking.complexity;
  if (total <= 0) return null;
  return (
    Math.round(
      ((value * weights.ranking.value +
        complexity * weights.ranking.complexity) /
        total) *
        100,
    ) / 100
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TechNavigatorRubric({ projectId, readOnly = false }: Props) {
  const [profile, setProfile] = useState<TechNavigatorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // Hold the latest pending update body and a debounce timer.
  const pendingRef = useRef<TechNavigatorUpdate>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initial load.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    techNavigatorApi
      .get(projectId)
      .then((data) => {
        if (!alive) return;
        setProfile(data);
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
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [projectId]);

  // Locally derived computed scores. The backend is authoritative once a PUT
  // completes; until then, this provides instant visual feedback.
  const computed = useMemo(() => {
    if (!profile) {
      return { complexity: null, value: null, composite: null };
    }
    const complexity = recomputeComplexity(profile, profile.weights);
    const value = recomputeValueCreation(profile, profile.weights);
    const composite = recomputeComposite(complexity, value, profile.weights);
    return { complexity, value, composite };
  }, [profile]);

  // Schedule a debounced save with the merged pending body.
  const flushSave = useCallback(() => {
    const body = pendingRef.current;
    pendingRef.current = {};
    if (Object.keys(body).length === 0) return;
    setSaving(true);
    techNavigatorApi
      .update(projectId, body)
      .then((data) => {
        setProfile(data);
        setSavedFlash(true);
        window.setTimeout(() => setSavedFlash(false), SAVED_INDICATOR_MS);
      })
      .catch((e: Error) => {
        setError(e.message ?? 'Failed to save Tech Navigator update');
      })
      .finally(() => setSaving(false));
  }, [projectId]);

  const queueUpdate = useCallback(
    (patch: TechNavigatorUpdate) => {
      pendingRef.current = { ...pendingRef.current, ...patch };
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flushSave, DEBOUNCE_MS);
    },
    [flushSave],
  );

  // Optimistic local update — also schedules a debounced PUT.
  const updateField = useCallback(
    <K extends keyof TechNavigatorUpdate>(
      key: K,
      value: TechNavigatorUpdate[K],
    ) => {
      setProfile((prev) => (prev ? { ...prev, [key]: value } : prev));
      queueUpdate({ [key]: value } as TechNavigatorUpdate);
    },
    [queueUpdate],
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
        saving={saving}
        saved={savedFlash}
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

      <WeightsFooter weights={w} saving={saving} />
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
            Project Type
          </h3>
          <p className="text-xs text-muted-foreground">
            Determines how prioritization treats the project. Type 3 is exempt
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
  saving: boolean;
}

function WeightsFooter({ weights, saving }: WeightsFooterProps) {
  const fmtPct = (n: number) => `${n.toFixed(0)} %`;
  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-3 text-xs">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium text-foreground">Active weights</span>
        <span className="flex items-center gap-1 text-muted-foreground">
          {saving ? (
            <>
              <Loader2 className="size-3 animate-spin" aria-hidden />
              Saving…
            </>
          ) : (
            'Read-only — edit in Admin → Tech Navigator Weights'
          )}
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
