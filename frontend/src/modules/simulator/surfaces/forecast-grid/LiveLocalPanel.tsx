/**
 * Project-scope Session 2 — live-local preview panel.
 *
 * Shows the project's own line € totals, project budget, and delta-vs-anchor
 * moving LIVE on every edit (non-authoritative preview, computed by
 * `liveLocal.ts` from the same grid + working-edits as the grid renderer). The
 * RAG badge shows the LAST server-reconciled value from `detail.project_states`
 * with a subtle "updates on Recalculate" affordance — it intentionally does NOT
 * move on local edits.
 *
 * Panel header is explicit about provenance: "Preview — reconciled by server".
 */
import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LocationLabel } from '@/components/shared/LocationLabel';
import { ragBgColor } from '@/lib/rag';
import { formatCurrencyDetailed } from '@/lib/formatters';
import { useScenarioContext } from '../../useScenarioContext';
import type { ScenarioGridResponse } from '../../api/scenariosApi';
import type { WorkingEdits } from './forecastGridAdapter';
import {
  computeDeltaVsAnchor,
  computeLineTotals,
  computeProjectBudget,
} from './liveLocal';

interface Props {
  projectId: string;
  grid: ScenarioGridResponse;
  workingEdits: WorkingEdits;
}

export function LiveLocalPanel({ projectId, grid, workingEdits }: Props) {
  const { detail } = useScenarioContext();

  const lineTotals = useMemo(
    () => computeLineTotals(grid, workingEdits),
    [grid, workingEdits],
  );
  const budget = useMemo(() => computeProjectBudget(lineTotals), [lineTotals]);
  const delta = useMemo(() => computeDeltaVsAnchor(budget), [budget]);

  const projectState = (detail?.project_states ?? []).find(
    (p) => p.project_id === projectId,
  );
  const rag =
    projectState?.adjusted_rag ?? projectState?.original_rag ?? null;

  const internalLines = lineTotals.filter((l) => l.category === 'internal');
  const externalLines = lineTotals.filter((l) => l.category === 'external');

  const deltaClass =
    delta > 0
      ? 'text-red-600 dark:text-red-400'
      : delta < 0
        ? 'text-green-600 dark:text-green-400'
        : 'text-muted-foreground';

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">
          Preview — reconciled by server
        </h3>
        <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
          <Info className="h-3 w-3" />
          Live local estimate
        </span>
      </div>

      {/* Headline figures */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Project budget
          </p>
          <p className="text-lg font-semibold font-tabular text-foreground">
            {formatCurrencyDetailed(budget.eur)}
          </p>
          <p className="text-[11px] text-muted-foreground font-tabular">
            anchor {formatCurrencyDetailed(budget.anchorEur)}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Delta vs anchor
          </p>
          <p className={cn('text-lg font-semibold font-tabular', deltaClass)}>
            {delta > 0 ? '+' : ''}
            {formatCurrencyDetailed(delta)}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            RAG
          </p>
          <div className="flex items-center gap-2">
            {rag ? (
              <Badge
                className={cn(
                  'capitalize',
                  ragBgColor(rag),
                  rag.toLowerCase() === 'green' &&
                    'dark:bg-green-900/30 dark:text-green-400',
                  rag.toLowerCase() === 'amber' &&
                    'dark:bg-amber-900/30 dark:text-amber-400',
                  rag.toLowerCase() === 'red' &&
                    'dark:bg-red-900/30 dark:text-red-400',
                )}
              >
                {rag}
              </Badge>
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            updates on Recalculate
          </p>
        </div>
      </div>

      {/* Line totals */}
      <div className="space-y-3">
        {internalLines.length > 0 && (
          <LineGroup title="Internal Resources" lines={internalLines} />
        )}
        {externalLines.length > 0 && (
          <LineGroup title="External Costs" lines={externalLines} />
        )}
      </div>
    </Card>
  );
}

function LineGroup({
  title,
  lines,
}: {
  title: string;
  lines: {
    lineKey: string;
    name: string;
    locationName?: string | null;
    eur: number;
    anchorEur: number;
  }[];
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
        {title}
      </p>
      <div className="space-y-0.5">
        {lines.map((l) => {
          const lineDelta = Math.round((l.eur - l.anchorEur) * 100) / 100;
          return (
            <div
              key={l.lineKey}
              className="flex items-center justify-between text-sm"
            >
              <span className="flex items-center gap-1.5 text-foreground truncate pr-2">
                {l.name}
                {l.locationName && (
                  <LocationLabel
                    kind="workforce"
                    text={l.locationName}
                    className="text-[11px] font-normal text-muted-foreground"
                  />
                )}
              </span>
              <span className="font-tabular text-foreground inline-flex items-center gap-2">
                {formatCurrencyDetailed(l.eur)}
                {lineDelta !== 0 && (
                  <span
                    className={cn(
                      'text-[11px]',
                      lineDelta > 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-green-600 dark:text-green-400',
                    )}
                  >
                    {lineDelta > 0 ? '+' : ''}
                    {formatCurrencyDetailed(lineDelta)}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
