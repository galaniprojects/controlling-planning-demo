/**
 * ScoresAndRankingTab — reuses A7's TechNavigatorRubric + ranking-context card.
 * [A-TN-08][A-TN-09][A-BK-20]
 */

import type { RankedProjectItem } from '@/types/api';
import { TechNavigatorRubric } from '../../components/TechNavigatorRubric';
import { cn } from '@/lib/utils';

interface Props {
  projectId: string;
  rankingItem: RankedProjectItem | null;
  readOnly: boolean;
}

function fmtScore(n: number | null): string {
  if (n === null) return '—';
  return n.toFixed(2).replace('.', ',');
}

export function ScoresAndRankingTab({
  projectId,
  rankingItem,
  readOnly,
}: Props) {
  return (
    <div className="space-y-4">
      {/* Ranking context card */}
      {rankingItem ? (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">
            Ranking Position
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <RankingKPI
              label="Rank"
              value={rankingItem.rank !== null ? `#${rankingItem.rank}` : '—'}
            />
            <RankingKPI
              label="Composite score"
              value={fmtScore(rankingItem.composite_score)}
              emphasis={rankingItem.composite_score !== null}
            />
            <RankingKPI
              label="Cutoff status"
              value={
                rankingItem.within_cutoff === true
                  ? 'Within cutoff'
                  : rankingItem.within_cutoff === false
                  ? 'Below cutoff'
                  : '—'
              }
              colorClass={
                rankingItem.within_cutoff === true
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : rankingItem.within_cutoff === false
                  ? 'text-red-600 dark:text-red-400'
                  : undefined
              }
            />
            <RankingKPI
              label="DoI"
              value={rankingItem.doi !== null ? String(rankingItem.doi) : '—'}
            />
          </div>
        </div>
      ) : null}

      {/* Tech Navigator rubric (A7 component — reused unchanged) */}
      <TechNavigatorRubric projectId={projectId} readOnly={readOnly} />
    </div>
  );
}

function RankingKPI({
  label,
  value,
  emphasis = false,
  colorClass,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  colorClass?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          'text-sm font-semibold',
          colorClass ?? (emphasis ? 'text-foreground' : 'text-foreground'),
        )}
      >
        {value}
      </span>
    </div>
  );
}
