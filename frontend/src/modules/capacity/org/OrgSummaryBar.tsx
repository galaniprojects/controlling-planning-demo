import { Users, TrendingUp, AlertTriangle, ClipboardCheck } from 'lucide-react';
import type { OrgSummary } from '@/types/api';
import { SummaryCard } from '@/components/shared/SummaryCard';

interface OrgSummaryBarProps {
  data: OrgSummary;
}

export function OrgSummaryBar({ data }: OrgSummaryBarProps) {
  return (
    <div className="grid grid-cols-4 gap-4">
      <SummaryCard
        label="Total Headcount"
        value={data.total_headcount}
        icon={<Users className="h-5 w-5" />}
      />
      <SummaryCard
        label="Avg Utilization"
        value={`${data.avg_utilization_pct.toFixed(1)}%`}
        icon={<TrendingUp className="h-5 w-5" />}
      />
      <SummaryCard
        label="Over-Allocated CCs"
        value={data.over_allocated_cc_count}
        icon={<AlertTriangle className="h-5 w-5" />}
      />
      <SummaryCard
        label="Pending Approvals"
        value={data.pending_controller_approval_count}
        icon={<ClipboardCheck className="h-5 w-5" />}
      />
    </div>
  );
}
