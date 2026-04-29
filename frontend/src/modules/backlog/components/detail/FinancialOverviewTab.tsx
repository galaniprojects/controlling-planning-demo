/**
 * FinancialOverviewTab — embeds workbench OverviewTab read-only. [A-BK-20]
 */

import { OverviewTab } from '@/modules/workbench/overview/OverviewTab';

interface Props {
  projectId: string;
}

export function FinancialOverviewTab({ projectId }: Props) {
  return (
    <div>
      <OverviewTab projectId={projectId} />
    </div>
  );
}
