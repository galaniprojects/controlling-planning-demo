/**
 * Dimension 8 — Change summary feed.
 *
 * Spec line 1066 + line 1048: "Audit-style list of every diff in the
 * scenario, categorized by type. Each entry shows what changed, before/after
 * values, and timestamp. Updates in real time as edits are made (no
 * recalculation needed). Serves as the entry point for Promote and
 * Apply-to-forecast actions."
 *
 * The feed is append-only from the user's perspective. Backend keeps a
 * canonical ordering on `action_order`; we render newest-first by
 * reversing in place.
 *
 * The Promote and Apply-to-forecast buttons are owned by T1 (drawer slot)
 * and T4 (promote tree). This feed only renders the entries, not the
 * commit affordances.
 */

import { ClipboardList } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { ChangeSummaryDimensionData } from '../../lib/impactTypes';

interface ChangeSummaryFeedProps {
  data: ChangeSummaryDimensionData | undefined;
  /** Compact mode for use in the bottom drawer (smaller padding). */
  compact?: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  forecast_grid: 'Forecast',
  cost_allocation: 'Cost allocation',
  people: 'People',
  rate_table: 'Rate table',
  pipeline_stage: 'Pipeline',
  tech_navigator: 'Tech Navigator',
  milestone: 'Milestone',
  portfolio_rule: 'Portfolio rule',
  capacity_param: 'Capacity',
  restructuring: 'Restructuring',
  other: 'Other',
};

function categoryLabel(cat: string | null | undefined): string {
  if (!cat) return CATEGORY_LABELS.other;
  return CATEGORY_LABELS[cat] ?? cat;
}

function formatActionType(t: string): string {
  return t.replace(/_/g, ' ');
}

function summariseParameters(
  params: Record<string, unknown> | undefined,
): string | null {
  if (!params) return null;
  const keys = Object.keys(params);
  if (!keys.length) return null;
  const parts: string[] = [];
  for (const k of keys.slice(0, 3)) {
    const v = params[k];
    if (v === null || v === undefined) continue;
    const display =
      typeof v === 'object' ? JSON.stringify(v) : String(v);
    parts.push(`${k.replace(/_/g, ' ')}=${display}`);
  }
  return parts.join(' · ') || null;
}

export function ChangeSummaryFeed({
  data,
  compact = false,
}: ChangeSummaryFeedProps) {
  if (!data || data.total_actions === 0) {
    return (
      <Card className="px-4 py-6 bg-card flex items-center gap-3">
        <ClipboardList className="h-5 w-5 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No changes yet. Apply an action from the catalogue or edit a
          surface to populate this feed.
        </p>
      </Card>
    );
  }

  const categoryEntries = Object.entries(data.by_category).sort(
    (a, b) => b[1] - a[1],
  );

  const reversedActions = [...data.actions].reverse();

  return (
    <div className={compact ? 'space-y-2' : 'space-y-4'}>
      {/* Category counts */}
      {!compact && (
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary" className="font-medium">
            {data.total_actions} total
          </Badge>
          {categoryEntries.map(([cat, count]) => (
            <Badge key={cat} variant="outline">
              {categoryLabel(cat)}: {count}
            </Badge>
          ))}
        </div>
      )}

      {/* Append-only feed */}
      <ol
        className={[
          'border border-border rounded-md divide-y divide-border bg-card',
          compact ? 'text-xs' : 'text-sm',
        ].join(' ')}
        data-testid="change-summary-feed"
      >
        {reversedActions.map((entry, i) => {
          const idx = reversedActions.length - i;
          const cat = entry.lever_category ?? null;
          const isTier3 = entry.tier === 3;
          const params = summariseParameters(entry.parameters);
          return (
            <li
              key={entry.id ?? `${entry.action_order}-${i}`}
              className={[
                'px-3 py-2 flex items-start gap-3',
                compact ? '' : 'py-2.5',
              ].join(' ')}
            >
              <span className="text-[11px] font-medium tabular-nums text-muted-foreground w-6 shrink-0">
                #{idx}
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center flex-wrap gap-1.5">
                  <span className="font-medium text-foreground">
                    {formatActionType(entry.action_type)}
                  </span>
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0"
                  >
                    {categoryLabel(cat)}
                  </Badge>
                  {isTier3 && (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300"
                    >
                      Tier 3
                    </Badge>
                  )}
                  {entry.promoted_at && (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300"
                    >
                      Promoted
                    </Badge>
                  )}
                </div>
                {(entry.project_name || entry.project_id) && (
                  <div className="text-xs text-muted-foreground truncate">
                    {entry.project_name ?? entry.project_id}
                  </div>
                )}
                {params && (
                  <div className="text-xs text-muted-foreground truncate">
                    {params}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
