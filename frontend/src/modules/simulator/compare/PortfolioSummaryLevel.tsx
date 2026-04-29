/**
 * Compare view — Level 1: portfolio summary.
 *
 * Spec line 979: "Eight impact dimension rows with expandable breakdowns.
 * Each row shows the headline metric per scenario column with delta
 * indicators. Entry point for the comparison."
 *
 * One row per dimension, one column per scenario + the anchor column.
 * Headlines are derived via `headlineForDimension` (same as the impact
 * strip — single source of truth).
 *
 * Per spec line 989: per-scenario colour coding on column headers + tints.
 * Per CLAUDE.md: directional indicators inline with arrows + +/- prefixes
 * (NOT colour). The anchor column has no headline since the dimensions are
 * defined relative to the anchor — we render a "—" placeholder.
 */

import { ScenarioColumnHeader } from './ScenarioColumnHeader';
import {
  DIMENSION_DISPLAY_ORDER,
  DIMENSION_META,
  type DimensionKey,
} from '../lib/impactTypes';
import { headlineForDimension } from '../lib/dimensionHeadlines';
import { colorForScenarioColumn } from '../lib/colorCoding';
import type { CompareColumn } from './compareTypes';

interface PortfolioSummaryLevelProps {
  columns: CompareColumn[];
  /** Tier 3 visibility — drives whether the People row renders. */
  tier3Visible: boolean;
  /** Click handler — drills into L2 (project comparison) for a specific project. */
  onDrillDown?: () => void;
}

export function PortfolioSummaryLevel({
  columns,
  tier3Visible,
  onDrillDown,
}: PortfolioSummaryLevelProps) {
  const dimensionRows = DIMENSION_DISPLAY_ORDER.filter((key) => {
    if (key === 'people' && !tier3Visible) return false;
    return true;
  });

  return (
    <div
      data-testid="compare-l1-portfolio"
      className="border border-border rounded-md overflow-hidden bg-card"
    >
      <div
        className="grid"
        style={{
          gridTemplateColumns: `minmax(180px, 1fr) repeat(${columns.length}, minmax(180px, 1fr))`,
        }}
      >
        {/* Header row: dimension label cell + scenario column headers */}
        <div className="px-3 py-2 bg-muted/40 border-b border-border text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Dimension
        </div>
        {columns.map((col) => (
          <ScenarioColumnHeader
            key={col.info.columnIndex}
            info={col.info}
          />
        ))}

        {/* Data rows */}
        {dimensionRows.map((key, rowIdx) => {
          const meta = DIMENSION_META[key];
          const isLast = rowIdx === dimensionRows.length - 1;
          return (
            <RowFragment
              key={key}
              dimKey={key}
              label={meta.label}
              columns={columns}
              isLast={isLast}
            />
          );
        })}
      </div>
      {onDrillDown && (
        <div className="px-3 py-2 bg-muted/30 border-t border-border text-xs text-muted-foreground">
          Pick a project from the right-side rollup or click a scenario
          column header to drill into project-level comparison (Level 2).
        </div>
      )}
    </div>
  );
}

interface RowFragmentProps {
  dimKey: DimensionKey;
  label: string;
  columns: CompareColumn[];
  isLast: boolean;
}

function RowFragment({ dimKey, label, columns, isLast }: RowFragmentProps) {
  return (
    <>
      <div
        className={[
          'px-3 py-3 text-sm font-medium text-foreground bg-card flex items-center',
          isLast ? '' : 'border-b border-border',
        ].join(' ')}
      >
        {label}
      </div>
      {columns.map((col) => {
        const tokens = colorForScenarioColumn(col.info.columnIndex);
        const headline =
          col.kind === 'scenario'
            ? headlineForDimension(dimKey, col.impact.dimensions)
            : '—';
        return (
          <div
            key={col.info.columnIndex}
            className={[
              'px-3 py-3 text-sm text-foreground tabular-nums',
              tokens.cellTint,
              tokens.borderLeft,
              isLast ? '' : 'border-b border-border',
            ].join(' ')}
            data-testid={`compare-l1-cell-${col.info.columnIndex}-${dimKey}`}
          >
            {headline}
          </div>
        );
      })}
    </>
  );
}
