/**
 * v5 B2 [B-PR-03] — RoutingPreview.
 *
 * Compact summary table that shows how the *currently selected* diffs
 * will be processed. Renders one row per selected action with:
 *  action_id, routing_type (badge), target_id, requires_review,
 *  permission_ok, message.
 *
 * Distinct from `DiffSelector` (which is the picker): this preview
 * shows only the chosen subset at a glance for the confirm step.
 */

import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ROUTING_LABELS, type RoutingType } from './routingLabels';
import type { RoutingDecisionItem } from '../api/scenariosApi';

interface Props {
  decisions: RoutingDecisionItem[];
  selectedIds: Set<number>;
}

export function RoutingPreview({ decisions, selectedIds }: Props) {
  const visible = decisions.filter((d) => selectedIds.has(d.action_id));

  if (visible.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
        No diffs selected for promotion.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">Action</TableHead>
            <TableHead>Routing</TableHead>
            <TableHead>Target</TableHead>
            <TableHead>Permission</TableHead>
            <TableHead>Message</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((d) => {
            const label = ROUTING_LABELS[d.routing_type as RoutingType] ?? ROUTING_LABELS.no_route;
            return (
              <TableRow key={d.action_id}>
                <TableCell className="font-mono text-xs">#{d.action_id}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-[10px] ${label.badgeClass}`}>
                    {label.title}
                  </Badge>
                  {d.requires_review && (
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-400">
                      Review
                    </span>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {d.target_id ?? '—'}
                </TableCell>
                <TableCell>
                  {d.permission_ok === false ? (
                    <Badge
                      variant="outline"
                      className="border-rose-300 text-[10px] text-rose-700 dark:border-rose-700 dark:text-rose-400"
                    >
                      Denied
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="border-emerald-300 text-[10px] text-emerald-700 dark:border-emerald-700 dark:text-emerald-300"
                    >
                      OK
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {d.message}
                  {d.permission_message && d.permission_ok === false && (
                    <span className="ml-1 text-rose-700 dark:text-rose-400">
                      ({d.permission_message})
                    </span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
