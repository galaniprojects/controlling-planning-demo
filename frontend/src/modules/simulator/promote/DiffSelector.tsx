/**
 * v5 B2 [B-PR-03] — DiffSelector.
 *
 * Category-grouped checkbox selector for choosing which scenario
 * actions to promote. Per `[B-PR-03]`:
 *  - Per-diff checkboxes
 *  - Select-all PER CATEGORY available
 *  - NO global select-all — forces a category-level conscious decision
 *
 * Each row shows the action's lever_category, target id (project /
 * entity), and the routing decision returned by the backend preview.
 * Locked rows (already promoted; identified by `promoted_at`) are
 * shown but unselectable.
 */

import { useMemo } from 'react';
import type { ChangeEvent } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  CATEGORY_ORDER,
  ROUTING_CATEGORY_LABEL,
  ROUTING_LABELS,
  routingCategory,
  type RoutingType,
} from './routingLabels';
import type { RoutingDecisionItem } from '../api/scenariosApi';
import { PromotedBadge } from './PromotedBadge';

interface ActionLookupRow {
  id: number;
  action_type: string;
  scope: string;
  project_id: string | null;
  promoted_at?: string | null;
}

interface Props {
  decisions: RoutingDecisionItem[];
  /** Map of action id → minimal action metadata (already-promoted check). */
  actionLookup?: Map<number, ActionLookupRow>;
  selected: Set<number>;
  onChange: (next: Set<number>) => void;
}

export function DiffSelector({
  decisions,
  actionLookup,
  selected,
  onChange,
}: Props) {
  const grouped = useMemo(() => {
    const out = new Map<string, RoutingDecisionItem[]>();
    for (const d of decisions) {
      const cat = routingCategory(d.routing_type as RoutingType);
      if (!out.has(cat)) out.set(cat, []);
      out.get(cat)!.push(d);
    }
    return out;
  }, [decisions]);

  const togglePromote = (actionId: number) => {
    const next = new Set(selected);
    if (next.has(actionId)) next.delete(actionId);
    else next.add(actionId);
    onChange(next);
  };

  const toggleCategory = (
    e: ChangeEvent<HTMLInputElement> | boolean,
    actionIds: number[],
    nowChecked: boolean,
  ) => {
    void e; // not used — Checkbox onCheckedChange supplies a boolean.
    const next = new Set(selected);
    if (nowChecked) {
      for (const id of actionIds) next.add(id);
    } else {
      for (const id of actionIds) next.delete(id);
    }
    onChange(next);
  };

  if (decisions.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
        No diffs to promote. Apply scenario actions first.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {CATEGORY_ORDER.map((cat) => {
        const items = grouped.get(cat);
        if (!items || items.length === 0) return null;

        const eligibleIds = items
          .filter((d) => {
            const meta = actionLookup?.get(d.action_id);
            return !meta?.promoted_at;
          })
          .map((d) => d.action_id);

        const allSelected =
          eligibleIds.length > 0 &&
          eligibleIds.every((id) => selected.has(id));
        const partialSelected =
          eligibleIds.some((id) => selected.has(id)) && !allSelected;

        return (
          <section
            key={cat}
            className="space-y-2 rounded-md border border-border bg-card p-3"
          >
            <header className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-foreground">
                {ROUTING_CATEGORY_LABEL[cat]}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ({items.length})
                </span>
              </h4>
              {eligibleIds.length > 0 && (
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Checkbox
                    checked={allSelected ? true : partialSelected ? 'indeterminate' : false}
                    onCheckedChange={(checked) =>
                      toggleCategory(true, eligibleIds, checked === true)
                    }
                  />
                  Select all in category
                </label>
              )}
            </header>

            <ul className="divide-y divide-border">
              {items.map((d) => {
                const meta = actionLookup?.get(d.action_id);
                const alreadyPromoted = Boolean(meta?.promoted_at);
                const checked = selected.has(d.action_id);
                const routingLabel = ROUTING_LABELS[d.routing_type as RoutingType] ?? ROUTING_LABELS.no_route;

                return (
                  <li
                    key={d.action_id}
                    className="flex items-start gap-3 py-2"
                  >
                    <Checkbox
                      checked={checked}
                      disabled={alreadyPromoted}
                      onCheckedChange={() => togglePromote(d.action_id)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-foreground">
                          #{d.action_id}
                        </span>
                        <span className="text-sm font-medium text-foreground">
                          {d.action_type.replace(/_/g, ' ')}
                        </span>
                        <Badge variant="outline" className={`text-[10px] ${routingLabel.badgeClass}`}>
                          {routingLabel.title}
                        </Badge>
                        {d.requires_review && (
                          <Badge
                            variant="outline"
                            className="border-amber-300 text-[10px] text-amber-700 dark:border-amber-700 dark:text-amber-400"
                          >
                            Review required
                          </Badge>
                        )}
                        {alreadyPromoted && <PromotedBadge promotedAt={meta?.promoted_at} />}
                        {d.permission_ok === false && (
                          <Badge
                            variant="outline"
                            className="border-rose-300 text-[10px] text-rose-700 dark:border-rose-700 dark:text-rose-400"
                          >
                            Permission denied
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {d.message}
                        {d.target_id && (
                          <>
                            {' '}
                            <span className="font-mono">{d.target_id}</span>
                          </>
                        )}
                        {d.permission_message && d.permission_ok === false && (
                          <>
                            {' '}
                            <span className="text-rose-700 dark:text-rose-400">
                              ({d.permission_message})
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
