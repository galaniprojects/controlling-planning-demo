/**
 * TechNavigatorScoring — dedicated admin page for tuning the backlog
 * scoring formula and cutoff envelope.
 *
 * Visual layout (top to bottom):
 *   • Header: title + Save + Reset all
 *   • Formula card (read-only)
 *   • 2×2 grid: Composite mixer · Complexity axis · Value Creation axis · T-shirt thresholds
 *   • Cutoff envelope card (full width)
 *   • Live Tech Navigator quadrant scatter (full width)
 *
 * State model:
 *   • `saved` = the last successfully fetched / saved values from the server.
 *   • `working` = the user's current in-flight edits, derived from `saved`.
 *   • `dirty` = working ≠ saved on any field.
 *
 * Slider drags don't hit the API. The scatter recomputes every project's
 * scores client-side via `lib/scoringMath.ts`, so movement is immediate.
 * On Save, a single bulk PUT applies all dirty rows.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Compass, Scale, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/shared/Skeleton';
import { adminApi } from '@/api/endpoints';
import type { TechNavigatorScoringData } from '@/types/api';

import { AxisWeightsCard } from './components/AxisWeightsCard';
import { WeightControl } from './components/WeightControl';
import { TshirtThresholdsCard } from './components/TshirtThresholdsCard';
import { CutoffEnvelopeCard } from './components/CutoffEnvelopeCard';
import { QuadrantScatter } from './components/QuadrantScatter';

/**
 * Mini-formula rendered inside an axis card. Renders
 *   letter = (v · w_w + …) / (w_w + …)
 * in the standard fraction style — same idiom whether the formula has
 * two terms (the composite mixer) or three (each axis card).
 */
function AxisFormula({
  letter,
  terms,
}: {
  letter: string;
  /** Each term contributes one `v · w_w` to the numerator and one `w_w` to
   * the denominator. `v` is the variable name (e.g. 's'); `w` is the weight
   * subscript (typically the same as `v`, but distinct for the composite
   * mixer where `V` pairs with `w_V` and `X` pairs with `w_C`). */
  terms: Array<{ v: string; w: string }>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-xs text-foreground">
      <span className="text-muted-foreground">{letter}</span>
      <span aria-hidden>=</span>
      <span className="inline-flex flex-col items-center">
        <span className="px-2 pb-0.5 whitespace-nowrap">
          {terms.map((t, i) => (
            <span key={i}>
              {i > 0 ? ' + ' : ''}
              {t.v} · w<sub>{t.w}</sub>
            </span>
          ))}
        </span>
        <span className="px-2 pt-0.5 border-t border-foreground/60 whitespace-nowrap">
          {terms.map((t, i) => (
            <span key={i}>
              {i > 0 ? ' + ' : ''}w<sub>{t.w}</sub>
            </span>
          ))}
        </span>
      </span>
    </div>
  );
}

type Weights = TechNavigatorScoringData['weights'];

interface WorkingState {
  weights: Weights;
  /** The editable Total Available Budget (raw). The contestable envelope
   * used in the cutoff walk is derived from this by subtracting
   * type3_pre_funded_total + hyper_maintenance_committed_total from the
   * server-side breakdown, which doesn't move on slider drag. */
  total_available_budget: number;
}

const KEY_MAP_TN: Record<string, (w: Weights) => number> = {
  tn_complexity_weight_standardization: (w) => w.complexity.standardization,
  tn_complexity_weight_usage: (w) => w.complexity.usage,
  tn_complexity_weight_maintenance: (w) => w.complexity.maintenance,
  tn_value_weight_financial: (w) => w.value_creation.financial,
  tn_value_weight_payback: (w) => w.value_creation.payback,
  tn_value_weight_competitive: (w) => w.value_creation.competitive,
  tn_w_value: (w) => w.ranking.value,
  tn_w_complexity: (w) => w.ranking.complexity,
  tn_tshirt_xs_max: (w) => w.tshirt.xs_max,
  tn_tshirt_s_max: (w) => w.tshirt.s_max,
  tn_tshirt_m_max: (w) => w.tshirt.m_max,
  tn_tshirt_l_max: (w) => w.tshirt.l_max,
};

const RANKING_KEY = 'ranking_total_available_budget';

function isDirty(working: WorkingState, saved: WorkingState): boolean {
  if (working.total_available_budget !== saved.total_available_budget) return true;
  for (const key of Object.keys(KEY_MAP_TN)) {
    const getter = KEY_MAP_TN[key];
    if (getter(working.weights) !== getter(saved.weights)) return true;
  }
  return false;
}

function diffChanges(
  working: WorkingState,
  saved: WorkingState,
): { key: string; new_value: string }[] {
  const out: { key: string; new_value: string }[] = [];
  for (const [key, getter] of Object.entries(KEY_MAP_TN)) {
    const w = getter(working.weights);
    const s = getter(saved.weights);
    if (w !== s) out.push({ key, new_value: String(w) });
  }
  if (working.total_available_budget !== saved.total_available_budget) {
    out.push({ key: RANKING_KEY, new_value: String(working.total_available_budget) });
  }
  return out;
}

export function TechNavigatorScoring() {
  const [data, setData] = useState<TechNavigatorScoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<WorkingState | null>(null);
  const [working, setWorking] = useState<WorkingState | null>(null);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const fetchData = () =>
    new Promise<void>((resolve) => {
      setLoading(true);
      setError(null);
      adminApi
        .getTechNavigatorScoringData()
        .then((d) => {
          setData(d);
          const initial: WorkingState = {
            weights: d.weights,
            total_available_budget: d.envelope.total_available_budget,
          };
          setSaved(initial);
          setWorking(initial);
        })
        .catch((e) => setError(e instanceof Error ? e.message : String(e)))
        .finally(() => {
          setLoading(false);
          resolve();
        });
    });

  useEffect(() => {
    fetchData();
  }, []);

  const dirty = working && saved ? isDirty(working, saved) : false;

  const sumComplexity = useMemo(
    () =>
      working
        ? working.weights.complexity.standardization +
          working.weights.complexity.usage +
          working.weights.complexity.maintenance
        : 0,
    [working],
  );
  const sumValue = useMemo(
    () =>
      working
        ? working.weights.value_creation.financial +
          working.weights.value_creation.payback +
          working.weights.value_creation.competitive
        : 0,
    [working],
  );
  const sumComposite = useMemo(
    () =>
      working
        ? working.weights.ranking.value + working.weights.ranking.complexity
        : 0,
    [working],
  );

  // Ref-based in-flight guards. The `disabled` state on the button is the
  // intent, but React's setState is async and StrictMode can re-invoke
  // handlers — these refs are a true single source of "request in flight"
  // that won't drift from any state-update timing.
  const saveInFlight = useRef(false);
  const resetInFlight = useRef(false);

  const handleSave = async () => {
    if (saveInFlight.current) return;
    if (!working || !saved) return;
    const changes = diffChanges(working, saved);
    if (changes.length === 0) return;
    saveInFlight.current = true;
    setSaving(true);
    setFlash(null);
    try {
      await adminApi.updateParameters(changes);
      // Save succeeded — re-fetch so we pick up any server-side recompute
      // (composite scores on all projects) and the saved weights mirror
      // the fresh DB state. Await the fetch before showing success so the
      // flash text is true at the moment it appears.
      await fetchData();
      setFlash(`Saved ${changes.length} parameter(s).`);
      setTimeout(() => setFlash(null), 2000);
    } catch (e) {
      setFlash(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (resetInFlight.current) return;
    resetInFlight.current = true;
    setResetting(true);
    setFlash(null);
    try {
      const keys = [...Object.keys(KEY_MAP_TN), RANKING_KEY];
      await adminApi.resetParameters(keys);
      await fetchData();
      setFlash('Parameters reset to defaults.');
      setTimeout(() => setFlash(null), 2000);
    } catch (e) {
      setFlash(`Reset failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      resetInFlight.current = false;
      setResetting(false);
      setResetOpen(false);
    }
  };

  if (loading || !working || !saved || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded border border-red-200 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-300">
        Failed to load scoring data: {error}
      </div>
    );
  }

  // Convenience helpers for wiring sliders to the working state.
  const update = (mut: (next: WorkingState) => void) => {
    setWorking((prev) => {
      if (!prev) return prev;
      const next: WorkingState = {
        weights: {
          complexity: { ...prev.weights.complexity },
          value_creation: { ...prev.weights.value_creation },
          ranking: { ...prev.weights.ranking },
          tshirt: { ...prev.weights.tshirt },
        },
        total_available_budget: prev.total_available_budget,
      };
      mut(next);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">
          Tech Navigator Scoring
        </h2>
        <div className="flex items-center gap-2">
          {flash ? (
            <span className="text-xs text-muted-foreground">{flash}</span>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setResetOpen(true)}
            disabled={resetting || saving}
          >
            Reset all
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!dirty || saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AxisWeightsCard
          title="Composite ranking"
          icon={Scale}
          sum={sumComposite}
          hintNonStandardSum={sumComposite !== 100}
          formula={
            <AxisFormula
              letter="composite"
              terms={[
                { v: 'V', w: 'V' },
                { v: 'X', w: 'C' },
              ]}
            />
          }
        >
          <WeightControl
            label="Value Creation"
            varName="V"
            weightVarName="V"
            value={working.weights.ranking.value}
            onChange={(n) => update((s) => { s.weights.ranking.value = n; })}
            isDirty={saved.weights.ranking.value !== working.weights.ranking.value}
          />
          <WeightControl
            label="Complexity"
            varName="X"
            weightVarName="C"
            value={working.weights.ranking.complexity}
            onChange={(n) => update((s) => { s.weights.ranking.complexity = n; })}
            isDirty={
              saved.weights.ranking.complexity !==
              working.weights.ranking.complexity
            }
          />
        </AxisWeightsCard>

        <AxisWeightsCard
          title="Complexity axis"
          icon={Compass}
          sum={sumComplexity}
          hintNonStandardSum={sumComplexity !== 100}
          formula={
            <AxisFormula
              letter="X"
              terms={[
                { v: 's', w: 's' },
                { v: 'u', w: 'u' },
                { v: 'm', w: 'm' },
              ]}
            />
          }
        >
          <WeightControl
            label="Standardization"
            varName="s"
            weightVarName="s"
            value={working.weights.complexity.standardization}
            onChange={(n) => update((s) => { s.weights.complexity.standardization = n; })}
            isDirty={
              saved.weights.complexity.standardization !==
              working.weights.complexity.standardization
            }
          />
          <WeightControl
            label="Usage"
            varName="u"
            weightVarName="u"
            value={working.weights.complexity.usage}
            onChange={(n) => update((s) => { s.weights.complexity.usage = n; })}
            isDirty={saved.weights.complexity.usage !== working.weights.complexity.usage}
          />
          <WeightControl
            label="Maintenance"
            varName="m"
            weightVarName="m"
            value={working.weights.complexity.maintenance}
            onChange={(n) => update((s) => { s.weights.complexity.maintenance = n; })}
            isDirty={
              saved.weights.complexity.maintenance !==
              working.weights.complexity.maintenance
            }
          />
        </AxisWeightsCard>

        <AxisWeightsCard
          title="Value Creation axis"
          icon={Sparkles}
          sum={sumValue}
          hintNonStandardSum={sumValue !== 100}
          formula={
            <AxisFormula
              letter="V"
              terms={[
                { v: 'f', w: 'f' },
                { v: 'p', w: 'p' },
                { v: 'c', w: 'c' },
              ]}
            />
          }
        >
          <WeightControl
            label="Financial benefit"
            varName="f"
            weightVarName="f"
            value={working.weights.value_creation.financial}
            onChange={(n) => update((s) => { s.weights.value_creation.financial = n; })}
            isDirty={
              saved.weights.value_creation.financial !==
              working.weights.value_creation.financial
            }
          />
          <WeightControl
            label="Payback"
            varName="p"
            weightVarName="p"
            value={working.weights.value_creation.payback}
            onChange={(n) => update((s) => { s.weights.value_creation.payback = n; })}
            isDirty={
              saved.weights.value_creation.payback !==
              working.weights.value_creation.payback
            }
          />
          <WeightControl
            label="Competitive adv."
            varName="c"
            weightVarName="c"
            value={working.weights.value_creation.competitive}
            onChange={(n) => update((s) => { s.weights.value_creation.competitive = n; })}
            isDirty={
              saved.weights.value_creation.competitive !==
              working.weights.value_creation.competitive
            }
          />
        </AxisWeightsCard>

        <TshirtThresholdsCard
          value={working.weights.tshirt}
          onChange={(t) => update((s) => { s.weights.tshirt = t; })}
          saved={saved.weights.tshirt}
        />
      </div>

      <CutoffEnvelopeCard
        value={working.total_available_budget}
        onChange={(n) => update((s) => { s.total_available_budget = n; })}
        saved={saved.total_available_budget}
        type3PreFundedTotal={data.envelope.type3_pre_funded_total}
        hyperMaintenanceCommittedTotal={data.envelope.hyper_maintenance_committed_total}
      />

      <QuadrantScatter
        projects={data.projects}
        weights={working.weights}
        contestableEnvelope={Math.max(
          0,
          working.total_available_budget
            - data.envelope.type3_pre_funded_total
            - data.envelope.hyper_maintenance_committed_total,
        )}
        tiebreakers={data.tiebreakers}
      />

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset to defaults</DialogTitle>
            <DialogDescription>
              This resets all 12 Tech Navigator weights and the Total Available
              Budget to their default values, and recomputes every project's
              composite score. Audit-logged. Continue?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setResetOpen(false)}
              disabled={resetting}
            >
              Cancel
            </Button>
            <Button onClick={handleReset} disabled={resetting}>
              {resetting ? 'Resetting...' : 'Reset all'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
