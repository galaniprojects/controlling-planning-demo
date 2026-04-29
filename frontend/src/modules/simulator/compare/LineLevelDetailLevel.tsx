/**
 * Compare view — Level 3: line-level detail.
 *
 * Spec line 983: "Focus on a specific forecast line (e.g., 'Senior
 * Developer, internal hours') and see month-by-month values for that line
 * across all scenarios. Finest grain of comparison."
 *
 * For B2 demo scope we don't have a per-line monthly comparison endpoint
 * yet — backend `compare_scenarios` returns project-rollup, not line-level.
 * We render the *single project total* for now with a clear "month-by-month
 * detail will fetch via T2's MixedGranularityGrid in the next iteration"
 * placeholder. Same column/colour pattern as L2 so the pattern stays
 * consistent.
 *
 * The toggle (Show values / Show changes from anchor) applies here too.
 */

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { ScenarioColumnHeader } from './ScenarioColumnHeader';
import { CompareToggle, type CompareDisplayMode } from './CompareToggle';
import { colorForScenarioColumn } from '../lib/colorCoding';
import { formatCurrency } from '@/lib/formatters';
import { formatDeltaWithArrow } from '../lib/dimensionHeadlines';
import type { CompareColumn } from './compareTypes';

interface LineLevelDetailLevelProps {
  columns: CompareColumn[];
  /** Project id selected at L2. */
  projectId: string;
  /** Specific line key (e.g., "senior-dev-internal"); optional for demo. */
  lineKey?: string;
  initialMode?: CompareDisplayMode;
}

export function LineLevelDetailLevel({
  columns,
  projectId,
  lineKey,
  initialMode = 'values',
}: LineLevelDetailLevelProps) {
  const [mode, setMode] = useState<CompareDisplayMode>(initialMode);

  // Anchor reference budget — used for delta mode.
  const anchorCol = columns.find((c) => c.kind === 'anchor');
  const anchorBudget = anchorCol?.projectBudgets[projectId]?.budget ?? 0;
  const projectName =
    columns
      .map((c) => c.projectBudgets[projectId]?.name)
      .find((n): n is string => Boolean(n)) ?? projectId;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-foreground">
          {projectName}
          {lineKey && (
            <span className="text-muted-foreground font-normal">
              {' '}
              · {lineKey}
            </span>
          )}
        </p>
        <CompareToggle mode={mode} onChange={setMode} />
      </div>

      <Card className="overflow-hidden">
        <div
          className="grid"
          style={{
            gridTemplateColumns: `minmax(180px, 1fr) repeat(${columns.length}, minmax(140px, 1fr))`,
          }}
        >
          <div className="px-3 py-2 bg-muted/40 border-b border-border text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Line
          </div>
          {columns.map((col) => (
            <ScenarioColumnHeader
              key={col.info.columnIndex}
              info={col.info}
            />
          ))}

          <div className="px-3 py-3 text-sm font-medium text-foreground border-b border-border">
            {lineKey ? `Line ${lineKey}` : 'Project total'}
          </div>
          {columns.map((col) => {
            const tokens = colorForScenarioColumn(col.info.columnIndex);
            const data = col.projectBudgets[projectId];
            const budget = data?.budget ?? 0;
            const delta = budget - anchorBudget;
            const showDelta = mode === 'changes' && col.kind !== 'anchor';
            return (
              <div
                key={col.info.columnIndex}
                className={[
                  'px-3 py-3 text-sm text-right tabular-nums text-foreground border-b border-border',
                  tokens.cellTint,
                  tokens.borderLeft,
                ].join(' ')}
                data-testid={`compare-l3-cell-${col.info.columnIndex}`}
              >
                {!data ? (
                  <span className="text-muted-foreground/50">—</span>
                ) : showDelta ? (
                  delta === 0 ? (
                    '±€0'
                  ) : (
                    formatDeltaWithArrow(delta)
                  )
                ) : (
                  formatCurrency(budget)
                )}
              </div>
            );
          })}
        </div>
        <div className="px-3 py-2 bg-muted/30 border-t border-border text-xs text-muted-foreground">
          Month-by-month forecast lines load lazily from the workbench grid.
          For B2 demo this view shows the project rollup; click "Open in
          workbench" on the scenario column to inspect line-level monthly
          data.
        </div>
      </Card>
    </div>
  );
}
