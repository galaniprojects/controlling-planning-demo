/**
 * AllocationPreviewPanel — compact vertical flow diagram side panel.
 * Spec §5.7.
 *
 * Layout (top → bottom):
 *   1. Header                "Allocation Preview · Live · updates on edit"
 *   2. Upstream section      "UPSTREAM INFLOWS"
 *   3. Focal entity card     (enlarged, accent border, self-retained badge)
 *   4. Downstream list       (each: name + identifier + pct + €)
 *   5. To Business pill      (if to_business_pct > 0)
 *   6. Footer                "Open full allocation flow →"
 *
 * Reactivity: the panel renders entirely from props (`projection` +
 * `pendingRows` + cascade). No internal state, no fetch. The editor
 * passes a fresh projection on every keystroke so the € amounts and
 * connector widths update in real time.
 *
 * Edges currently being edited (`isEdited(row)`) render their connector
 * + amount in the accent colour to highlight the in-flight change.
 */
import { ChevronRight, Lock, ArrowRight, ExternalLink, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { formatCurrencyDetailed, formatPercent } from '@/lib/formatters';
import { EntityTypeBadge } from '@/components/shared/EntityTypeBadge';
import type { CascadeChainResponse } from '@/types/api';
import type { AllocationProjection } from '../helpers/projectAllocation';
import type { PendingRow } from './state';
import { subtypeStripClass } from './DistributionRow';
import { PreviewFlowLine } from './PreviewFlowLine';

interface Props {
  cascade: CascadeChainResponse;
  projection: AllocationProjection;
  /** Visible (non-deleted) pending rows in the same order they render
   *  in the main table. Used to look up display data for the
   *  downstream items. */
  visibleRows: PendingRow[];
  isRowEdited: (row: PendingRow) => boolean;
  toBusinessIsEdited: boolean;
  /** Truthy when the user is currently focused on a row's input. We
   *  emphasise that row's connector line more strongly. */
  activeRowFocusKey: string | null;
  onClose: () => void;
}

export function AllocationPreviewPanel({
  cascade,
  projection,
  visibleRows,
  isRowEdited,
  toBusinessIsEdited,
  activeRowFocusKey,
  onClose,
}: Props) {
  const navigate = useNavigate();
  const focal = cascade.focal;
  const maxDepth = cascade.max_allocation_depth;
  const inflowsByDestId = new Map(
    cascade.edges
      .filter((e) => e.destination_entity_id === focal.entity_id)
      .map((e) => [e.source_entity_id, e]),
  );

  return (
    <aside className="w-full lg:w-[360px] flex-shrink-0 lg:sticky lg:top-4 self-start space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Allocation Preview
          </h3>
          <p className="text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live · updates on edit
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground p-1 -m-1"
          aria-label="Close preview"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* UPSTREAM */}
      <section className="rounded-md border border-border bg-card overflow-hidden">
        <header className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/40 border-b border-border">
          Upstream inflows
        </header>
        <div className="p-3">
          {cascade.upstream.length === 0 ? (
            <p className="text-[11px] text-muted-foreground italic text-center py-2">
              No upstream entities — this is a root.
            </p>
          ) : (
            <ul className="space-y-2">
              {cascade.upstream.map((u) => {
                const edge = inflowsByDestId.get(u.entity_id);
                return (
                  <li
                    key={u.entity_id}
                    className="flex items-stretch gap-2 rounded-sm border border-border/60 bg-background px-2 py-1.5"
                  >
                    <span
                      className={cn(
                        'w-1 rounded-sm self-stretch flex-shrink-0',
                        subtypeStripClass(u.entity_type),
                      )}
                      aria-hidden
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-[12px] font-medium text-foreground truncate block">
                        {u.entity_name}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {u.identifier}
                      </span>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {edge && (
                        <span className="text-[10px] font-mono text-muted-foreground block">
                          {formatPercent(edge.percentage, { signed: false, decimals: 1 })}
                        </span>
                      )}
                      <span className="text-[11px] font-mono text-foreground tabular-nums block">
                        {formatCurrencyDetailed(edge?.amount ?? 0)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* Focal entity card */}
      <div className="relative rounded-lg border-2 border-orange-500 bg-card p-3 shadow-sm">
        <div className="absolute -top-2 right-3 bg-orange-500 text-white text-[9px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded">
          focal
        </div>
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <EntityTypeBadge type={focal.entity_type} />
          <span className="text-[10px] font-mono text-muted-foreground">
            {focal.identifier}
          </span>
        </div>
        <p className="text-sm font-semibold text-foreground leading-tight">
          {focal.entity_name}
        </p>
        <div className="flex items-baseline justify-between mt-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Rolled-up
          </span>
          <span className="text-base font-semibold font-mono text-foreground tabular-nums">
            {formatCurrencyDetailed(focal.effective_cost)}
          </span>
        </div>
        {/* Self-retained badge */}
        <div
          className={cn(
            'mt-2 inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-md font-mono',
            projection.isOverAllocated
              ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
              : projection.isComplete
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
              : 'bg-muted text-muted-foreground',
          )}
        >
          {projection.isComplete && <Lock className="h-3 w-3" />}
          Self-retained: {formatPercent(projection.selfRetainedPct, { signed: false, decimals: 2 })}{' '}
          ({formatCurrencyDetailed(projection.selfRetainedAmount)})
        </div>
      </div>

      {/* DOWNSTREAM */}
      <section className="rounded-md border border-border bg-card overflow-hidden">
        <header className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/40 border-b border-border">
          Downstream
        </header>
        <div className="p-3">
          {visibleRows.length === 0 ? (
            <p className="text-[11px] text-muted-foreground italic text-center py-2">
              No downstream allocations yet.
            </p>
          ) : (
            <ul className="space-y-0">
              {visibleRows.map((row, idx) => {
                const projected = projection.downstream[idx];
                const edited = isRowEdited(row);
                const focused = activeRowFocusKey === row.key;
                const nearWarn = row.nearMaxDepthWarning;
                return (
                  <li key={row.key}>
                    {idx > 0 && <div className="h-1" />}
                    <PreviewFlowLine
                      widthPx={projected?.lineWidthPx ?? 1}
                      emphasised={edited || focused}
                    />
                    <div
                      className={cn(
                        'flex items-stretch gap-2 rounded-sm border px-2 py-1.5',
                        edited
                          ? 'border-primary/70 bg-primary/5'
                          : 'border-border/60 bg-background',
                        focused && 'ring-2 ring-primary/30',
                      )}
                    >
                      <span
                        className={cn(
                          'w-1 rounded-sm self-stretch flex-shrink-0',
                          subtypeStripClass(row.destinationType),
                        )}
                        aria-hidden
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-[12px] font-medium text-foreground truncate block">
                          {row.destinationName}
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {row.destinationIdentifier}
                        </span>
                        {nearWarn && row.chainDepth != null && (
                          <span className="inline-flex items-center gap-1 mt-0.5 text-[10px] text-amber-700 dark:text-amber-400">
                            <AlertTriangle className="h-2.5 w-2.5" />
                            depth {row.chainDepth}/{maxDepth}
                          </span>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span
                          className={cn(
                            'text-[10px] font-mono block',
                            edited
                              ? 'text-primary font-semibold'
                              : 'text-muted-foreground',
                          )}
                        >
                          {formatPercent(row.percentage, {
                            signed: false,
                            decimals: 1,
                          })}
                        </span>
                        <span
                          className={cn(
                            'text-[11px] font-mono tabular-nums block',
                            edited
                              ? 'text-primary font-semibold'
                              : 'text-foreground',
                          )}
                        >
                          {formatCurrencyDetailed(projected?.amount ?? 0)}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* To Business pill */}
      {(projection.toBusinessAmount > 0 || toBusinessIsEdited) && (
        <div
          className={cn(
            'rounded-full border px-3 py-2 flex items-center gap-2',
            toBusinessIsEdited
              ? 'border-primary/70 bg-primary/5'
              : 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20',
          )}
        >
          <ArrowRight className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-[11px] font-medium text-foreground block">
              To Business
            </span>
            <span className="text-[10px] text-muted-foreground">
              {cascade.business_terminals.length} location{cascade.business_terminals.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="text-right flex-shrink-0">
            <span
              className={cn(
                'text-[10px] font-mono block',
                toBusinessIsEdited
                  ? 'text-primary font-semibold'
                  : 'text-muted-foreground',
              )}
            >
              {formatPercent(projection.toBusinessPct, { signed: false, decimals: 1 })}
            </span>
            <span
              className={cn(
                'text-[11px] font-mono tabular-nums block',
                toBusinessIsEdited ? 'text-primary font-semibold' : 'text-foreground',
              )}
            >
              {formatCurrencyDetailed(projection.toBusinessAmount)}
            </span>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="pt-1">
        <button
          type="button"
          onClick={() => navigate(`/workbench/allocation-flow?entity=${focal.entity_id}`)}
          className="w-full inline-flex items-center justify-center gap-1.5 text-[11px] text-primary hover:underline py-1"
        >
          Open full allocation flow
          <ExternalLink className="h-3 w-3" />
        </button>
      </div>
    </aside>
  );
}
