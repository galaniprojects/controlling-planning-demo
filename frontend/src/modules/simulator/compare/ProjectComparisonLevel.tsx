/**
 * Compare view — Level 2: per-project comparison across scenarios.
 *
 * Spec line 981: "Select a project to see its data across all scenarios in
 * parallel columns. Shows forecast grid month-by-month with cell-level
 * delta highlighting, milestone timelines, master data differences, Tech
 * Navigator score differences, and resource plan with internal/external
 * split per scenario."
 *
 * For B2 demo scope we render the *budget rollup* layer: one column per
 * scenario (+ anchor), one row per project, with the toggle controlling
 * whether cells show absolute values or delta-from-anchor. Forecast-grid
 * month-by-month + milestone timelines are deferred to L3 / cross-link
 * into the workbench surfaces (still discoverable through the row click).
 *
 * Click a row to drill into L3 for that specific project + line key.
 */

import { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { ScenarioColumnHeader } from './ScenarioColumnHeader';
import { CompareToggle, type CompareDisplayMode } from './CompareToggle';
import { colorForScenarioColumn } from '../lib/colorCoding';
import { formatCurrency } from '@/lib/formatters';
import { formatDeltaWithArrow } from '../lib/dimensionHeadlines';
import type { CompareColumn } from './compareTypes';

interface ProjectComparisonLevelProps {
  columns: CompareColumn[];
  /** When provided, render the title bar with a back affordance. */
  onBack?: () => void;
  /** When provided, clicking a row drills to L3 for that project. */
  onDrillToLine?: (projectId: string, lineKey?: string) => void;
  /** Initial display mode (defaults to "values"). */
  initialMode?: CompareDisplayMode;
  /** Optional pre-selected project to highlight on entry. */
  selectedProjectId?: string;
}

export function ProjectComparisonLevel({
  columns,
  onDrillToLine,
  initialMode = 'values',
  selectedProjectId,
}: ProjectComparisonLevelProps) {
  const [mode, setMode] = useState<CompareDisplayMode>(initialMode);

  // Union of project ids across all columns; anchor first.
  const projectRows = useMemo(() => {
    const idMap = new Map<string, string>();
    for (const col of columns) {
      for (const [pid, d] of Object.entries(col.projectBudgets)) {
        if (!idMap.has(pid)) idMap.set(pid, d.name);
      }
    }
    return Array.from(idMap.entries()).sort((a, b) =>
      a[1].localeCompare(b[1]),
    );
  }, [columns]);

  // Anchor column budget per project — used to compute "changes from anchor".
  const anchorBudgets = useMemo(() => {
    const anchor = columns.find((c) => c.kind === 'anchor');
    if (!anchor) return new Map<string, number>();
    const m = new Map<string, number>();
    for (const [pid, d] of Object.entries(anchor.projectBudgets)) {
      m.set(pid, d.budget);
    }
    return m;
  }, [columns]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Click a row to drill into a specific forecast line (Level 3).
        </p>
        <CompareToggle mode={mode} onChange={setMode} />
      </div>

      <Card className="overflow-hidden">
        <div
          className="grid"
          style={{
            gridTemplateColumns: `minmax(220px, 2fr) repeat(${columns.length}, minmax(140px, 1fr)) 24px`,
          }}
        >
          {/* Header row */}
          <div className="px-3 py-2 bg-muted/40 border-b border-border text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Project
          </div>
          {columns.map((col) => (
            <ScenarioColumnHeader
              key={col.info.columnIndex}
              info={col.info}
            />
          ))}
          <div className="bg-muted/40 border-b border-border" />

          {/* Project rows */}
          {projectRows.map(([pid, name], i) => {
            const isLast = i === projectRows.length - 1;
            const isSelected = pid === selectedProjectId;
            const anchorBudget = anchorBudgets.get(pid) ?? 0;
            return (
              <RowFragment
                key={pid}
                projectId={pid}
                projectName={name}
                columns={columns}
                anchorBudget={anchorBudget}
                mode={mode}
                isLast={isLast}
                isSelected={isSelected}
                onDrill={onDrillToLine}
              />
            );
          })}
        </div>
      </Card>
    </div>
  );
}

interface RowFragmentProps {
  projectId: string;
  projectName: string;
  columns: CompareColumn[];
  anchorBudget: number;
  mode: CompareDisplayMode;
  isLast: boolean;
  isSelected: boolean;
  onDrill?: (projectId: string, lineKey?: string) => void;
}

function RowFragment({
  projectId,
  projectName,
  columns,
  anchorBudget,
  mode,
  isLast,
  isSelected,
  onDrill,
}: RowFragmentProps) {
  const drillable = !!onDrill;
  const rowBg = isSelected ? 'bg-accent/40' : '';

  const handleDrill = () => {
    if (drillable) onDrill?.(projectId);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleDrill}
        disabled={!drillable}
        className={[
          'text-left px-3 py-2.5 text-sm font-medium text-foreground',
          rowBg,
          drillable ? 'hover:bg-accent cursor-pointer' : 'cursor-default',
          isLast ? '' : 'border-b border-border',
        ].join(' ')}
      >
        {projectName}
      </button>
      {columns.map((col) => {
        const tokens = colorForScenarioColumn(col.info.columnIndex);
        const data = col.projectBudgets[projectId];
        const budget = data?.budget ?? 0;
        const delta = budget - anchorBudget;
        const showDelta = mode === 'changes' && col.kind !== 'anchor';

        let cellContent: React.ReactNode;
        if (!data) {
          cellContent = <span className="text-muted-foreground/50">—</span>;
        } else if (showDelta) {
          cellContent =
            delta === 0 ? '±€0' : formatDeltaWithArrow(delta);
        } else {
          cellContent = formatCurrency(budget);
        }

        return (
          <div
            key={col.info.columnIndex}
            className={[
              'px-3 py-2.5 text-sm text-right tabular-nums text-foreground',
              tokens.cellTint,
              tokens.borderLeft,
              rowBg,
              isLast ? '' : 'border-b border-border',
            ].join(' ')}
            data-testid={`compare-l2-cell-${projectId}-${col.info.columnIndex}`}
          >
            {cellContent}
          </div>
        );
      })}
      <button
        type="button"
        onClick={handleDrill}
        disabled={!drillable}
        aria-label={drillable ? `Drill into ${projectName}` : undefined}
        className={[
          'flex items-center justify-center text-muted-foreground/60',
          rowBg,
          drillable ? 'hover:text-foreground cursor-pointer' : 'cursor-default',
          isLast ? '' : 'border-b border-border',
        ].join(' ')}
      >
        {drillable && <ChevronRight className="h-4 w-4" />}
      </button>
    </>
  );
}
