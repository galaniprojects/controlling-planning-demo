/**
 * TechNavigatorTab — Define page's Tech Navigator tab.
 *
 * Replaces the legacy autosave-on-blur `TechNavigatorRubric` with the v5.2
 * Define-page Save model:
 *
 *   - Loads the canonical TN profile once via `techNavigatorApi.get(...)`.
 *   - Buffers all edits in `useDirtyBuffer` so the user can scrub freely
 *     before committing.
 *   - Computes Complexity / Value Creation / Composite scores locally from
 *     the buffered profile using the same `scoringMath` module that the
 *     admin Tech Navigator page consumes, so the live preview matches what
 *     gets persisted on Save.
 *   - Footer Save button issues a single `PUT /api/projects/{id}/tech-navigator`
 *     with the buffered diff. On success the buffer rebases to the canonical
 *     server response (which carries fresh authoritative computed scores).
 *
 * Field anchors are wired to `DoIRequirementsRegistry` so the Define page's
 * DoI overlay can scroll/focus the right control on a deep-link click.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/shared/Skeleton';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { techNavigatorApi } from '@/api/endpoints';
import {
  COMPLEXITY_SUB_CRITERIA,
  PROJECT_TYPES,
  VALUE_CREATION_SUB_CRITERIA,
  type SubCriterionRubric,
} from '@/modules/backlog/data/rubricLabels';
import { RubricSubCriterionRow } from '@/modules/backlog/components/RubricSubCriterionRow';
import { ScoreSummaryCard } from '@/modules/backlog/components/ScoreSummaryCard';
import {
  computeComplexity,
  computeValueCreation,
  computeComposite,
} from '@/modules/admin/scoring/lib/scoringMath';
import type {
  ProjectType,
  SubCriterionScore,
  TechNavigatorProfile,
  TechNavigatorUpdate,
} from '@/types/techNavigator';
import { deepEquals, useDirtyBuffer } from './useDirtyBuffer';

interface Props {
  projectId: string;
  /** Read-only mode (e.g. executive / CC-owner persona). */
  readOnly?: boolean;
  /**
   * Called when the buffer's dirty state changes — lets the Define shell
   * render the tab-label dirty pip. Optional.
   */
  onDirtyChange?: (isDirty: boolean) => void;
}

// Only these fields participate in the PUT payload.
//
// Boundary note (team-lead Task #3 follow-up): `transformation_level` lives
// on the Approval & Milestones tab — it ships through the backend
// `PUT /api/projects/{id}/approval-milestones` endpoint, not this tab's
// `PUT /api/projects/{id}/tech-navigator`. Sweep-builder relies on that
// boundary. The TN tab therefore does not edit transformation_level even
// though the underlying `TechNavigatorUpdate` schema would accept it.
type TNEditableKey =
  | 'project_type'
  | 'tn_standardization'
  | 'tn_usage'
  | 'tn_maintenance'
  | 'tn_financial_benefit'
  | 'tn_payback'
  | 'tn_competitive_advantage';

const EDITABLE_KEYS: TNEditableKey[] = [
  'project_type',
  'tn_standardization',
  'tn_usage',
  'tn_maintenance',
  'tn_financial_benefit',
  'tn_payback',
  'tn_competitive_advantage',
];

/** Compute the patch from canonical baseline → buffered profile. */
function diffPatch(
  baseline: TechNavigatorProfile,
  buffered: TechNavigatorProfile,
): TechNavigatorUpdate {
  const patch: TechNavigatorUpdate = {};
  for (const k of EDITABLE_KEYS) {
    const a = baseline[k] as unknown;
    const b = buffered[k] as unknown;
    if (!Object.is(a, b)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (patch as any)[k] = b;
    }
  }
  return patch;
}

export function TechNavigatorTab({
  projectId,
  readOnly = false,
  onDirtyChange,
}: Props) {
  const [initialProfile, setInitialProfile] =
    useState<TechNavigatorProfile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Initial fetch. State resets are deferred into the async callbacks so
  // we don't trigger the codebase's `react-hooks/set-state-in-effect` rule.
  useEffect(() => {
    let alive = true;
    techNavigatorApi
      .get(projectId)
      .then((data) => {
        if (!alive) return;
        setInitialProfile(data);
        setLoadError(null);
      })
      .catch((e: Error) => {
        if (!alive) return;
        setLoadError(e.message ?? 'Failed to load Tech Navigator profile');
      });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const onSave = useCallback(
    async (current: TechNavigatorProfile) => {
      if (!initialProfile) return current;
      const patch = diffPatch(initialProfile, current);
      if (Object.keys(patch).length === 0) return current;
      const updated = await techNavigatorApi.update(projectId, patch);
      setInitialProfile(updated);
      return updated;
    },
    [projectId, initialProfile],
  );

  const buffer = useDirtyBuffer<TechNavigatorProfile | null>({
    initial: initialProfile,
    onSave: async (current) => {
      if (!current) return undefined;
      return onSave(current);
    },
    // The TechNavigator profile carries a nested `weights` object. A
    // server-side refetch can produce a new `weights` reference with
    // identical values, which the default shallow compare would flag
    // as dirty. Pass deepEquals so the buffer's isDirty signal stays
    // accurate across refetches.
    equals: deepEquals,
  });

  // Notify shell of dirty changes.
  useEffect(() => {
    if (onDirtyChange) onDirtyChange(buffer.isDirty);
  }, [buffer.isDirty, onDirtyChange]);

  // Local preview scores — matches backend formula.
  const computed = useMemo(() => {
    const p = buffer.value;
    if (!p) return { complexity: null, value: null, composite: null };
    const complexity = computeComplexity(p, p.weights);
    const value = computeValueCreation(p, p.weights);
    const composite = computeComposite(complexity, value, p.weights);
    return { complexity, value, composite };
  }, [buffer.value]);

  const updateField = useCallback(
    <K extends TNEditableKey>(key: K, val: TechNavigatorProfile[K]) => {
      buffer.setValue((prev) => {
        if (!prev) return prev;
        return { ...prev, [key]: val };
      });
    },
    [buffer],
  );

  if (loadError) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {loadError}
      </div>
    );
  }

  if (!buffer.value) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const profile = buffer.value;
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
        saving={buffer.saving}
      />

      <ProjectTypeSelector
        projectType={profile.project_type}
        readOnly={readOnly}
        onProjectTypeChange={(v) => updateField('project_type', v)}
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
          (w.complexity as unknown as Record<string, number>)[rubric.weightKey] ??
          0
        }
        onChange={(field, v) =>
          updateField(field as TNEditableKey, v as SubCriterionScore)
        }
        readOnly={readOnly}
        anchorPrefix="define-anchor-tn-"
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
          (w.value_creation as unknown as Record<string, number>)[
            rubric.weightKey
          ] ?? 0
        }
        onChange={(field, v) =>
          updateField(field as TNEditableKey, v as SubCriterionScore)
        }
        readOnly={readOnly}
        anchorPrefix="define-anchor-tn-"
        reservedSlotsHint
      />

      <FooterSaveBar
        isDirty={buffer.isDirty}
        saving={buffer.saving}
        error={buffer.error}
        onSave={() => {
          buffer.save().catch(() => {
            // error is surfaced via buffer.error
          });
        }}
        onDiscard={buffer.reset}
        readOnly={readOnly}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-views
// ---------------------------------------------------------------------------

interface ProjectTypeSelectorProps {
  projectType: ProjectType | null;
  readOnly: boolean;
  onProjectTypeChange: (v: ProjectType) => void;
}

/**
 * Project type (P1/P2/P3) selector for the TN tab. Transformation level
 * deliberately lives on the Approval & Milestones tab — see the boundary
 * note next to `EDITABLE_KEYS` above.
 */
function ProjectTypeSelector({
  projectType,
  readOnly,
  onProjectTypeChange,
}: ProjectTypeSelectorProps) {
  return (
    <div
      id="define-anchor-project-type"
      data-define-anchor="define-anchor-project-type"
      className="rounded-md border border-border bg-card p-3"
    >
      <div className="mb-2">
        <h3 className="text-sm font-semibold text-foreground">Project type</h3>
        <p className="text-xs text-muted-foreground">
          Determines how prioritization treats the project. P3 is exempt
          from the cutoff line. Transformation level (T0/T1/T2) is set on
          the Approval &amp; Milestones tab.
        </p>
      </div>
      <div
        className="grid grid-cols-1 gap-2 sm:grid-cols-3"
        role="radiogroup"
      >
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
  /** Prefix for the field anchor id (e.g. `define-anchor-tn-`). */
  anchorPrefix: string;
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
  anchorPrefix,
}: RubricBlockProps) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="space-y-3">
        {rubrics.map((r) => {
          // Field names look like `tn_standardization`; the DoI registry
          // anchors are `define-anchor-tn-standardization`. Strip the
          // `tn_` prefix and hyphenate underscores for the anchor id.
          const anchorSuffix = r.field.replace(/^tn_/, '').replace(/_/g, '-');
          const anchorId = `${anchorPrefix}${anchorSuffix}`;
          return (
            <div
              key={r.field}
              id={anchorId}
              data-define-anchor={anchorId}
            >
              <RubricSubCriterionRow
                rubric={r}
                value={valueGetter(r.field)}
                weightPct={weightFor(r)}
                readOnly={readOnly}
                onChange={(v) => onChange(r.field, v)}
              />
            </div>
          );
        })}
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

interface FooterSaveBarProps {
  isDirty: boolean;
  saving: boolean;
  error: string | null;
  onSave: () => void;
  onDiscard: () => void;
  readOnly: boolean;
}

function FooterSaveBar({
  isDirty,
  saving,
  error,
  onSave,
  onDiscard,
  readOnly,
}: FooterSaveBarProps) {
  if (readOnly) return null;
  return (
    <div className="sticky bottom-0 z-10 -mx-1 mt-6 flex items-center justify-between gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="text-xs text-muted-foreground">
        {error ? (
          <span className="text-destructive">{error}</span>
        ) : isDirty ? (
          <span>You have unsaved changes on this tab.</span>
        ) : (
          <span>All changes saved.</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!isDirty || saving}
          onClick={onDiscard}
        >
          Discard
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!isDirty || saving}
          onClick={onSave}
        >
          {saving ? (
            <>
              <Loader2 className="mr-1 size-3 animate-spin" aria-hidden />
              Saving…
            </>
          ) : (
            'Save'
          )}
        </Button>
      </div>
    </div>
  );
}
