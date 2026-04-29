/**
 * Dimension 2 — Backlog ranking shifts.
 *
 * Per spec line 1054: "How the ranked backlog shifts under the scenario.
 * Which projects move above or below the cutoff lines, how the misalignment
 * zone changes, what happens to the contestable envelope. A live preview of
 * the backlog module's ranked list and cutoff bands under scenario
 * conditions."
 *
 * The backend currently surfaces just the affected/removed counts (B1's
 * lightweight version per `compute_backlog_ranking_dimension`). The full
 * ranked-list preview is computed via a separate drill-down endpoint —
 * out of scope for the impact dashboard tile detail. We render the
 * counts + a CTA to open the sandbox backlog surface in T2's tree.
 */

import { ListOrdered, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { BacklogRankingDimensionData } from '../../../lib/impactTypes';

interface BacklogRankingDimensionProps {
  data: BacklogRankingDimensionData | undefined;
}

export function BacklogRankingDimension({
  data,
}: BacklogRankingDimensionProps) {
  if (!data) {
    return (
      <p className="text-sm text-muted-foreground">
        No backlog data for this scenario.
      </p>
    );
  }

  if (data.projects_affected === 0) {
    return (
      <Card className="px-4 py-6 bg-card flex items-center gap-3">
        <ListOrdered className="h-5 w-5 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No project ranking shifts. The scenario doesn't affect backlog
          position.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card className="px-4 py-3 bg-card">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Projects affected
          </p>
          <p className="text-2xl font-semibold text-foreground mt-1 tabular-nums">
            {data.projects_affected}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Budget delta shifts ranking position
          </p>
        </Card>
        <Card className="px-4 py-3 bg-card">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Projects removed
          </p>
          <p className="text-2xl font-semibold text-foreground mt-1 tabular-nums">
            {data.projects_removed_count}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pushed below the cutoff line
          </p>
        </Card>
      </div>

      <Card className="px-4 py-3 bg-accent/30 border-accent/50 flex items-center gap-3">
        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
        <p className="text-sm text-muted-foreground">
          Open the <span className="font-medium text-foreground">Backlog</span>{' '}
          sandbox surface to see the ranked list and cutoff bands under this
          scenario.
        </p>
      </Card>
    </div>
  );
}
