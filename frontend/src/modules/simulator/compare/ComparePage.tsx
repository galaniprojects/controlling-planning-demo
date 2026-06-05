/**
 * Compare view shell — handles fetch, breadcrumb navigation, and switches
 * between L1 (portfolio summary) / L2 (project comparison) / L3 (line
 * detail) based on URL params.
 *
 * Route shapes per plan section "Routes":
 *   /simulator/compare/:idA/:idB[/:idC]                 → L1
 *   /simulator/compare/:ids/project/:projectId          → L2
 *   /simulator/compare/:ids/project/:projectId/line/:lineKey → L3
 *
 * Backend endpoints consumed:
 *   POST /api/scenarios/compare        — for project rollup (anchor + N)
 *   GET  /api/scenarios/:id/impact     — for L1 8-dimension headlines
 *
 * Anchor mismatch (HTTP 409) renders an inline rebase prompt.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/shared/Skeleton';
import { scenariosApi } from '../api/scenariosApi';
import { useTier3 } from '../permissions';
import type { ComparisonResponse } from '@/types/api';
import { PortfolioSummaryLevel } from './PortfolioSummaryLevel';
import { ProjectComparisonLevel } from './ProjectComparisonLevel';
import { LineLevelDetailLevel } from './LineLevelDetailLevel';
import type { CompareColumn, CompareViewState } from './compareTypes';
import type { ScenarioColumnInfo } from './ScenarioColumnHeader';
import { narrowImpact, type ImpactDashboardResponse } from '../lib/impactTypes';

interface ComparePageProps {
  /**
   * Tier 3 visibility override. When omitted, derived from `useTier3()`.
   * Tests / non-router mounts pass an explicit value; the router doesn't
   * need to.
   */
  tier3Visible?: boolean;
  /** Override route param parsing (used by tests / non-router mounts). */
  scenarioIdsOverride?: number[];
  projectIdOverride?: string | null;
  lineKeyOverride?: string | null;
}

type Level = 'l1' | 'l2' | 'l3';

interface ComparePageState {
  loading: boolean;
  error: string | null;
  isAnchorMismatch: boolean;
  data: CompareViewState | null;
}

function parseScenarioIds(idA?: string, idB?: string, idC?: string): number[] {
  return [idA, idB, idC]
    .filter((s): s is string => Boolean(s))
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n > 0);
}

async function fetchImpactWithFallback(
  scenarioId: number,
): Promise<ImpactDashboardResponse | null> {
  try {
    const raw = await scenariosApi.impact(scenarioId);
    return narrowImpact(raw);
  } catch (e) {
    // 409 — anchor mismatch / similar — treat as missing impact for the
    // affected column. The compare endpoint itself surfaces the user-facing
    // anchor-mismatch error.
    console.warn(`[compare] impact fetch failed for ${scenarioId}`, e);
    return null;
  }
}

function buildColumns(
  comparison: ComparisonResponse,
  perScenarioImpact: Map<number, ImpactDashboardResponse | null>,
  scenarioMetadataLookup: Map<
    number,
    { owner?: string | null; status?: string | null; stale?: boolean }
  >,
): CompareColumn[] {
  return comparison.columns.map((col, i) => {
    if (i === 0 || !col.scenario_id) {
      // Anchor column.
      const anchorBudgets: CompareColumn extends { kind: 'anchor' }
        ? CompareColumn['projectBudgets']
        : never = {} as never;
      const out: Record<
        string,
        { name: string; budget: number; rag: string | null }
      > = {};
      for (const [pid, d] of Object.entries(col.data)) {
        out[pid] = { name: d.name, budget: d.budget, rag: d.rag };
      }
      void anchorBudgets;
      const info: ScenarioColumnInfo = {
        columnIndex: 0,
        label: col.label || 'Current State',
      };
      return { kind: 'anchor', info, projectBudgets: out };
    }
    const sid = col.scenario_id;
    const impact = perScenarioImpact.get(sid) ?? null;
    const meta = scenarioMetadataLookup.get(sid) ?? {};
    const out: Record<
      string,
      { name: string; budget: number; delta?: number; rag: string | null }
    > = {};
    for (const [pid, d] of Object.entries(col.data)) {
      out[pid] = {
        name: d.name,
        budget: d.budget,
        delta: d.delta,
        rag: d.rag,
      };
    }
    const dims = impact?.dimensions ?? {};
    const diffCount =
      dims.change_summary?.total_actions ??
      Object.values(dims.change_summary?.by_category ?? {}).reduce(
        (a, b) => a + b,
        0,
      );
    const info: ScenarioColumnInfo = {
      columnIndex: i,
      label: col.label,
      owner: meta.owner ?? null,
      anchorLabel: (() => {
        const n = Object.keys(impact?.anchor_version_ids ?? {}).length;
        return n > 0 ? `${n} project${n === 1 ? '' : 's'} anchored` : null;
      })(),
      status: meta.status ?? null,
      diffCount: typeof diffCount === 'number' ? diffCount : null,
      stale: meta.stale ?? impact?.stale ?? false,
    };
    return {
      kind: 'scenario',
      info,
      scenarioId: sid,
      impact:
        impact ??
        ({
          scenario_id: sid,
          tier3_content: false,
          tier3_visible: true,
          stale: false,
          anchor_version_ids: {},
          dimensions: {},
        } as ImpactDashboardResponse),
      projectBudgets: out,
    };
  });
}

export function ComparePage({
  tier3Visible: tier3VisibleProp,
  scenarioIdsOverride,
  projectIdOverride,
  lineKeyOverride,
}: ComparePageProps = {}) {
  const params = useParams();
  const navigate = useNavigate();
  const tier3FromHook = useTier3();
  const tier3Visible = tier3VisibleProp ?? tier3FromHook;

  const scenarioIds = useMemo(
    () =>
      scenarioIdsOverride ??
      parseScenarioIds(params.idA, params.idB, params.idC),
    [scenarioIdsOverride, params.idA, params.idB, params.idC],
  );
  const projectId = projectIdOverride ?? params.projectId ?? null;
  const lineKey = lineKeyOverride ?? params.lineKey ?? null;
  const level: Level = lineKey ? 'l3' : projectId ? 'l2' : 'l1';

  const [state, setState] = useState<ComparePageState>({
    loading: true,
    error: null,
    isAnchorMismatch: false,
    data: null,
  });

  const load = useCallback(async () => {
    setState({ loading: true, error: null, isAnchorMismatch: false, data: null });
    if (!scenarioIds.length) {
      setState({
        loading: false,
        error: 'No scenarios selected',
        isAnchorMismatch: false,
        data: null,
      });
      return;
    }
    try {
      // 1. Compare endpoint — fails with 409 on anchor mismatch.
      const comparison = await scenariosApi.compare(scenarioIds);

      // 2. Fan-out impact fetches — independent so failures don't block.
      const impactResults = await Promise.all(
        scenarioIds.map(async (sid) => [sid, await fetchImpactWithFallback(sid)] as const),
      );
      const perScenarioImpact = new Map<number, ImpactDashboardResponse | null>(
        impactResults,
      );

      // 3. Pull lightweight scenario metadata from the list endpoint so we
      // can show owner / status / stale on each column header.
      let metadataLookup = new Map<
        number,
        { owner?: string | null; status?: string | null; stale?: boolean }
      >();
      try {
        const list = await scenariosApi.list();
        const all = [...list.my_scenarios, ...list.published_scenarios];
        metadataLookup = new Map(
          all.map((s) => [
            s.id,
            { owner: s.author_name, status: s.status, stale: undefined },
          ]),
        );
      } catch {
        // Non-fatal — column headers fall back to scenario-name only.
      }

      const columns = buildColumns(
        comparison,
        perScenarioImpact,
        metadataLookup,
      );

      setState({
        loading: false,
        error: null,
        isAnchorMismatch: false,
        data: {
          columns,
          scenarioIds,
          anyStale: columns.some(
            (c) => c.kind === 'scenario' && c.info.stale,
          ),
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Compare failed';
      const looksLikeAnchorErr =
        /shared anchor|same forecast cycle|409/i.test(msg);
      setState({
        loading: false,
        error: msg,
        isAnchorMismatch: looksLikeAnchorErr,
        data: null,
      });
    }
  }, [scenarioIds]);

  useEffect(() => {
    void load();
  }, [load]);

  const idsPath = scenarioIds.join('/');
  const handleDrillToProject = (pid: string) => {
    navigate(`/simulator/compare/${idsPath}/project/${pid}`);
  };
  const handleDrillToLine = (pid: string, lk?: string) => {
    const tail = lk ?? 'project-total';
    navigate(`/simulator/compare/${idsPath}/project/${pid}/line/${tail}`);
  };

  if (state.loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="space-y-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/simulator/compare')}
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to selection
        </Button>
        <div className="px-4 py-4 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900/50">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div className="space-y-2">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                {state.isAnchorMismatch
                  ? 'Scenarios have different anchors'
                  : 'Could not load comparison'}
              </p>
              <p className="text-xs text-amber-800 dark:text-amber-300">
                {state.isAnchorMismatch
                  ? 'Comparison requires a shared anchor. Open each scenario and rebase to the same forecast cycle, then return here.'
                  : state.error}
              </p>
              <div className="flex items-center gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={() => void load()}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Retry
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!state.data) {
    return (
      <div className="px-4 py-6 text-sm text-muted-foreground">
        No comparison data.
      </div>
    );
  }

  const { columns } = state.data;
  const projectName = projectId
    ? columns
        .map((c) => c.projectBudgets[projectId]?.name)
        .find((n): n is string => Boolean(n)) ?? projectId
    : null;

  return (
    <div className="space-y-4">
      <CompareBreadcrumb
        level={level}
        projectName={projectName}
        lineKey={lineKey}
        onNavigate={(target) => {
          if (target === 'selection') {
            navigate('/simulator/compare');
          } else if (target === 'l1') {
            navigate(`/simulator/compare/${idsPath}`);
          } else if (target === 'l2' && projectId) {
            navigate(`/simulator/compare/${idsPath}/project/${projectId}`);
          }
        }}
      />

      {state.data.anyStale && (
        <div className="px-3 py-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900/50 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <p className="text-xs text-amber-900 dark:text-amber-200">
            One or more scenarios have an outdated anchor. Comparison still
            renders, but rebase before promoting.
          </p>
        </div>
      )}

      {level === 'l1' && (
        <PortfolioSummaryLevel
          columns={columns}
          tier3Visible={tier3Visible}
          onDrillDown={() => undefined}
        />
      )}
      {level === 'l2' && projectId && (
        <ProjectComparisonLevel
          columns={columns}
          selectedProjectId={projectId}
          onDrillToLine={(pid, lk) => handleDrillToLine(pid, lk)}
        />
      )}
      {level === 'l2' && !projectId && (
        <ProjectComparisonLevel
          columns={columns}
          onDrillToLine={(pid, lk) => handleDrillToLine(pid, lk)}
        />
      )}
      {level === 'l3' && projectId && (
        <LineLevelDetailLevel
          columns={columns}
          projectId={projectId}
          lineKey={lineKey ?? undefined}
        />
      )}

      {level === 'l1' && (
        <div className="border-t border-border pt-3">
          <p className="text-xs text-muted-foreground mb-2">
            Drill into a project to see L2 / L3:
          </p>
          <div className="flex flex-wrap gap-2">
            {topProjectsByDelta(columns).map((p) => (
              <Button
                key={p.id}
                size="sm"
                variant="outline"
                onClick={() => handleDrillToProject(p.id)}
              >
                {p.name}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function topProjectsByDelta(
  columns: CompareColumn[],
): { id: string; name: string }[] {
  const anchor = columns.find((c) => c.kind === 'anchor');
  if (!anchor) return [];
  const ranked: { id: string; name: string; absDelta: number }[] = [];
  const ids = new Set<string>();
  for (const col of columns) {
    if (col.kind !== 'scenario') continue;
    for (const [pid, data] of Object.entries(col.projectBudgets)) {
      if (ids.has(pid)) continue;
      ids.add(pid);
      const a = anchor.projectBudgets[pid]?.budget ?? 0;
      const s = data.budget;
      ranked.push({ id: pid, name: data.name, absDelta: Math.abs(s - a) });
    }
  }
  ranked.sort((a, b) => b.absDelta - a.absDelta);
  return ranked.slice(0, 6).map(({ id, name }) => ({ id, name }));
}

interface CompareBreadcrumbProps {
  level: Level;
  projectName: string | null;
  lineKey: string | null;
  onNavigate: (target: 'selection' | 'l1' | 'l2') => void;
}

function CompareBreadcrumb({
  level,
  projectName,
  lineKey,
  onNavigate,
}: CompareBreadcrumbProps) {
  return (
    <div className="flex items-center flex-wrap gap-1 text-sm text-muted-foreground">
      <button
        type="button"
        className="hover:text-foreground transition-colors"
        onClick={() => onNavigate('selection')}
      >
        Selection
      </button>
      <span>›</span>
      <button
        type="button"
        className={[
          'transition-colors',
          level === 'l1'
            ? 'text-foreground font-medium pointer-events-none'
            : 'hover:text-foreground',
        ].join(' ')}
        onClick={() => onNavigate('l1')}
      >
        Comparison
      </button>
      {(level === 'l2' || level === 'l3') && projectName && (
        <>
          <span>›</span>
          <button
            type="button"
            className={[
              'transition-colors truncate max-w-[260px]',
              level === 'l2'
                ? 'text-foreground font-medium pointer-events-none'
                : 'hover:text-foreground',
            ].join(' ')}
            onClick={() => onNavigate('l2')}
          >
            {projectName}
          </button>
        </>
      )}
      {level === 'l3' && lineKey && (
        <>
          <span>›</span>
          <span className="text-foreground font-medium truncate max-w-[260px]">
            {lineKey}
          </span>
        </>
      )}
    </div>
  );
}
