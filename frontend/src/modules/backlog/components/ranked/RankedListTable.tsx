/**
 * RankedListTable — the main ranked list table with band insertion, misalignment
 * tinting, and sort controls. [A-BK-15..17][A-BK-25]
 */

import { Fragment } from 'react';
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import type { RankedProjectItem, CutoffLines } from '@/types/api';
import type { SortDir, SortField } from '../../BacklogContext';
import { RankedRow } from './RankedRow';
import { CutoffBand } from './CutoffBand';
import { BandJumpRail } from './BandJumpRail';

export const RANKED_TABLE_HEADERS: {
  key: string;
  label: string;
  sortField?: SortField;
  align?: string;
}[] = [
  { key: 'rank', label: '#', sortField: 'rank' },
  { key: 'name', label: 'Project', sortField: 'project_name' },
  { key: 'type', label: 'Type', align: 'text-center' },
  { key: 'tlevel', label: 'T-Level', align: 'text-center' },
  { key: 'size', label: 'Size', align: 'text-center' },
  { key: 'score', label: 'Composite', sortField: 'composite_score', align: 'text-right' },
  { key: 'budget', label: 'Budget', sortField: 'total_budget', align: 'text-right' },
  { key: 'cutoff', label: 'Cutoff', align: 'text-center' },
  { key: 'actions', label: '', align: 'text-right' },
];

interface Props {
  items: RankedProjectItem[];
  cutoff: CutoffLines;
  hasSortOverride: boolean;
  sortField: SortField | null;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
}

export function RankedListTable({
  items,
  cutoff,
  hasSortOverride,
  sortField,
  sortDir,
  onSort,
}: Props) {
  const shouldBeBandId = 'cutoff-band-should-be';
  const realityBandId = 'cutoff-band-reality';

  const bandIds: { id: string; label: string }[] = [];
  if (!hasSortOverride && cutoff.should_be_cutoff_rank !== null) {
    bandIds.push({ id: shouldBeBandId, label: 'Should-be cutoff' });
  }
  if (!hasSortOverride && cutoff.reality_cutoff_rank !== null) {
    bandIds.push({ id: realityBandId, label: 'Reality cutoff' });
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {RANKED_TABLE_HEADERS.map((h) => (
                <th
                  key={h.key}
                  className={`px-3 py-2.5 text-xs font-medium text-muted-foreground ${h.align ?? 'text-left'} ${h.sortField ? 'cursor-pointer select-none hover:text-foreground' : ''}`}
                  onClick={h.sortField ? () => onSort(h.sortField!) : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {h.label}
                    {h.sortField ? (
                      <SortIcon
                        active={sortField === h.sortField}
                        dir={sortDir}
                      />
                    ) : null}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const rank = item.rank ?? idx + 1;

              // Insert should-be band just BEFORE the first item at or past the cutoff rank
              const insertShouldBeBand =
                !hasSortOverride &&
                cutoff.should_be_cutoff_rank !== null &&
                rank === cutoff.should_be_cutoff_rank;

              // Insert reality band
              const insertRealityBand =
                !hasSortOverride &&
                cutoff.reality_cutoff_rank !== null &&
                rank === cutoff.reality_cutoff_rank &&
                cutoff.reality_cutoff_rank !== cutoff.should_be_cutoff_rank;

              // Misalignment zone
              const isMisaligned =
                !hasSortOverride &&
                cutoff.misalignment_zone_start !== null &&
                cutoff.misalignment_zone_end !== null &&
                rank >= cutoff.misalignment_zone_start &&
                rank <= cutoff.misalignment_zone_end;

              return (
                <Fragment key={item.project_id}>
                  {insertShouldBeBand ? (
                    <CutoffBand
                      id={shouldBeBandId}
                      label="Should-be cutoff"
                      explanation="Where a strict top-down funding plan by composite score would fill the budget envelope. Projects above this line are the score-ideal allocation."
                      variant="should-be"
                    />
                  ) : null}
                  {insertRealityBand ? (
                    <CutoffBand
                      id={realityBandId}
                      label="Reality cutoff"
                      explanation="Where the cumulative budget of currently-committed projects (Active or Approved within cutoff) reaches the envelope along the score ranking."
                      variant="reality"
                    />
                  ) : null}
                  <RankedRow
                    item={item}
                    isMisaligned={isMisaligned}
                  />
                </Fragment>
              );
            })}
          </tbody>
        </table>

        {items.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            No projects match the current filters.
          </div>
        ) : null}
      </div>

      <BandJumpRail bands={bandIds} />
    </>
  );
}

function SortIcon({
  active,
  dir,
}: {
  active: boolean;
  dir: SortDir;
}) {
  if (!active) {
    return <ChevronsUpDown className="size-3 opacity-40" aria-hidden />;
  }
  return dir === 'asc' ? (
    <ChevronUp className="size-3" aria-hidden />
  ) : (
    <ChevronDown className="size-3" aria-hidden />
  );
}
