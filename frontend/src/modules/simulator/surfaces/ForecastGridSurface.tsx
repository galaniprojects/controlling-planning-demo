/**
 * Project-scope Session 2 — editable forecast grid surface (orchestrator).
 *
 * Rewritten from the read-only `MixedGranularityGrid` + ad-hoc % forms into a
 * writable CORE-edit surface (spec §6). Thin orchestrator: it owns the grid
 * DATA fetch (keyed on scenarioId + projectId + a reconcile tick, mirroring
 * `MixedGranularityGrid`'s fetch lifecycle) and the surface-local working-edits
 * hook, then composes:
 *   - MacroStrip        — the four Layer-1 macros (Delay/Pause/Accelerate/Remove)
 *   - LiveLocalPanel    — live line totals / budget / delta preview
 *   - EditableForecastGrid — the writable MonthCategoryGrid mount
 *   - RevertControls    — per-cell / per-line / revert-all
 *
 * The route + props in `ScenarioWorkspacePage` are unchanged (`{ projectId }`).
 * Cell edits persist through the working-edits hook → ScenarioContext overlay
 * methods, which mark the scenario stale and append change-feed entries. The
 * grid refetches by bumping `reconcileTick` once the hook reconciles a write
 * response, so the canonical server view always backs the next render.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Skeleton } from '@/components/shared/Skeleton';
import { useScenarioContext } from '../useScenarioContext';
import { scenariosApi, type ScenarioGridResponse } from '../api/scenariosApi';
import { SurfaceCard } from './SurfaceCard';
import { ExternalCostEditor } from './ExternalCostEditor';
import { EditableForecastGrid } from './forecast-grid/EditableForecastGrid';
import { LiveLocalPanel } from './forecast-grid/LiveLocalPanel';
import { MacroStrip } from './forecast-grid/MacroStrip';
import { PlanEditorModal } from './forecast-grid/PlanEditorModal';
import { RevertControls } from './forecast-grid/RevertControls';
import { RoleLineControls } from './forecast-grid/RoleLineControls';
import { Tier3MixControl } from './forecast-grid/Tier3MixControl';
import { useForecastWorkingEdits } from './forecast-grid/useForecastWorkingEdits';

interface Props {
  projectId: string;
}

const MACRO_TYPES = new Set([
  'delay_project',
  'pause_project',
  'accelerate_project',
  'remove_project',
]);

export function ForecastGridSurface({ projectId }: Props) {
  const { scenarioId, detail, error: ctxError } = useScenarioContext();

  const [grid, setGrid] = useState<ScenarioGridResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [reconcileTick, setReconcileTick] = useState(0);

  // The hook reconciles its working edits against each write's returned grid
  // and hands the canonical grid back here; we adopt it directly for cell
  // writes (no refetch needed). Macro actions reshape the grid server-side, so
  // those bump `reconcileTick` instead (see the macro watcher below).
  const adoptGrid = useCallback((next: ScenarioGridResponse) => {
    setGrid(next);
  }, []);

  // T1 structural edits (role lines / plan dates / mix) reshape the resolved
  // grid's row + column set, so they force a clean refetch rather than an
  // in-place adopt (mirrors the macro watcher below).
  const bumpReconcile = useCallback(() => setReconcileTick((t) => t + 1), []);

  // Macro count for this project — when a macro is added/removed the resolved
  // grid changes (cells shift / drop), so force a clean refetch.
  const macroCount = (detail?.actions ?? []).filter(
    (a) => a.project_id === projectId && MACRO_TYPES.has(a.action_type),
  ).length;
  const lastMacroCount = useRef(macroCount);
  useEffect(() => {
    if (lastMacroCount.current !== macroCount) {
      lastMacroCount.current = macroCount;
      setReconcileTick((t) => t + 1);
    }
  }, [macroCount]);

  const {
    workingEdits,
    commitMonthlyEdit,
    revertCell,
    revertLine,
    revertAll,
    resetLocal,
    busy,
    error: editError,
  } = useForecastWorkingEdits(projectId, grid, adoptGrid);

  // Fetch the scenario grid. Mirrors MixedGranularityGrid: cancellation guard,
  // loading + error states, keyed on scenarioId + projectId + reconcileTick.
  const resetLocalRef = useRef(resetLocal);
  resetLocalRef.current = resetLocal;
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFetchError(null);
    scenariosApi
      .getScenarioGrid(scenarioId, projectId)
      .then((res) => {
        if (cancelled) return;
        setGrid(res);
        // A fresh server pull is the new baseline — drop stale local edits.
        resetLocalRef.current();
      })
      .catch((err) => {
        if (cancelled) return;
        setFetchError(err instanceof Error ? err.message : 'Failed to load grid');
        setGrid(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scenarioId, projectId, reconcileTick]);

  const handleMonthlyEdit = useCallback(
    (lineKey: string, month: string, newValue: number) => {
      if (!grid) return;
      const row = grid.rows.find((r) => r.line_key === lineKey);
      if (!row) return;
      void commitMonthlyEdit(row, month, newValue);
    },
    [grid, commitMonthlyEdit],
  );

  const handleRevertCell = useCallback(
    (row: Parameters<typeof revertCell>[0], month: string) =>
      revertCell(row, month),
    [revertCell],
  );

  return (
    <SurfaceCard
      title="Forecast grid"
      subtitle={`Project ${projectId} — edit CORE cells (hours on internal lines, € on external; future months only). Edits are sandbox-only until promoted.`}
      error={editError ?? fetchError ?? ctxError}
      busy={busy}
    >
      <MacroStrip projectId={projectId} />

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : !grid ? (
        <p className="text-sm text-muted-foreground">
          Forecast grid unavailable for this project.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-end">
            <PlanEditorModal projectId={projectId} onMutated={bumpReconcile} />
          </div>
          <LiveLocalPanel
            projectId={projectId}
            grid={grid}
            workingEdits={workingEdits}
          />
          <EditableForecastGrid
            grid={grid}
            workingEdits={workingEdits}
            onMonthlyEdit={handleMonthlyEdit}
            busy={busy}
          />
          <RevertControls
            grid={grid}
            workingEdits={workingEdits}
            onRevertCell={handleRevertCell}
            onRevertLine={revertLine}
            onRevertAll={revertAll}
            busy={busy}
          />
          <RoleLineControls
            projectId={projectId}
            grid={grid}
            onMutated={bumpReconcile}
          />
          <Tier3MixControl
            projectId={projectId}
            openMonth={grid.open_month}
            onMutated={bumpReconcile}
          />
          <ExternalCostEditor projectId={projectId} onStructureChange={bumpReconcile} />
        </div>
      )}
    </SurfaceCard>
  );
}
