import { Users, TrendingUp, AlertTriangle, Inbox } from 'lucide-react';
import type { TeamSummary } from '@/types/api';
import { SummaryCard } from '../shared/SummaryCard';

interface TeamSummaryBarProps {
  data: TeamSummary;
}

export function TeamSummaryBar({ data }: TeamSummaryBarProps) {
  return (
    <div className="grid grid-cols-4 gap-4">
      <SummaryCard
        label="Team Headcount"
        value={data.headcount}
        icon={<Users className="h-5 w-5" />}
      />
      <SummaryCard
        label="Avg Utilization"
        value={`${data.avg_utilization_pct.toFixed(1)}%`}
        icon={<TrendingUp className="h-5 w-5" />}
      />
      <SummaryCard
        label="Over-Allocated"
        value={data.over_allocated_count}
        icon={<AlertTriangle className="h-5 w-5" />}
      />
      <SummaryCard
        label="Pending Requests"
        value={data.pending_request_count}
        icon={<Inbox className="h-5 w-5" />}
      />
    </div>
  );
}
