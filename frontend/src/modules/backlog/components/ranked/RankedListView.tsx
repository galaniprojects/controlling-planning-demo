/**
 * RankedListView — orchestrates pre-funded + ranked table + bands + jump rail.
 * [A-BK-15..17][A-BK-18][A-BK-25]
 */

import type { RankedBacklogResponse } from '@/types/api';
import type { BacklogFilters, SortDir, SortField } from '../../BacklogContext';
import { useFilteredRankedItems } from '../../hooks/useFilteredRankedItems';
import { PreFundedSection } from './PreFundedSection';
import { RankedListTable } from './RankedListTable';
import { ResetToRankingButton } from './ResetToRankingButton';

interface Props {
  data: RankedBacklogResponse;
  filters: BacklogFilters;
  sortField: SortField | null;
  sortDir: SortDir;
  hasSortOverride: boolean;
  onSort: (field: SortField) => void;
  onClearSort: () => void;
}

export function RankedListView({
  data,
  filters,
  sortField,
  sortDir,
  hasSortOverride,
  onSort,
  onClearSort,
}: Props) {
  const filteredItems = useFilteredRankedItems(
    data.items,
    filters,
    sortField,
    sortDir,
  );

  return (
    <div className="space-y-4">
      <PreFundedSection items={data.pre_funded} />

      {hasSortOverride ? (
        <ResetToRankingButton onClick={onClearSort} />
      ) : null}

      <RankedListTable
        items={filteredItems}
        cutoff={data.cutoff}
        hasSortOverride={hasSortOverride}
        sortField={sortField}
        sortDir={sortDir}
        onSort={onSort}
      />

      <p className="text-xs text-muted-foreground">
        {filteredItems.length} of {data.total} projects shown
        {data.pre_funded_total > 0
          ? ` · ${data.pre_funded_total} pre-funded (P3) above`
          : ''}
      </p>
    </div>
  );
}
