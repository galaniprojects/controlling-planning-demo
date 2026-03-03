import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Inbox } from 'lucide-react';
import { capacityApi } from '@/api/endpoints';
import { Skeleton } from '@/components/shared/Skeleton';
import { useBottomDrawer } from '@/contexts/BottomDrawerContext';
import type { TeamSummary } from '@/types/api';
import { cn } from '@/lib/utils';
import { TeamSummaryBar } from './TeamSummaryBar';
import { TeamHeatmap } from './TeamHeatmap';
import { PersonDetailDrawer } from './PersonDetailDrawer';

interface MyTeamTabProps {
  ccId: string;
  showRequestsButton?: boolean;
}

export function MyTeamTab({ ccId, showRequestsButton = true }: MyTeamTabProps) {
  const navigate = useNavigate();
  const { openDrawer } = useBottomDrawer();
  const [summary, setSummary] = useState<TeamSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    capacityApi
      .getTeamSummary(ccId)
      .then(setSummary)
      .catch(() => setSummary(null))
      .finally(() => setLoading(false));
  }, [ccId]);

  const handlePersonClick = (personId: string, personName: string) => {
    openDrawer(
      personName,
      <PersonDetailDrawer ccId={ccId} personId={personId} />,
    );
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!summary) {
    return <p className="text-sm text-slate-400">Failed to load team data.</p>;
  }

  return (
    <div className="space-y-5">
      {showRequestsButton && (
        <button
          type="button"
          onClick={() => navigate('/capacity/requests')}
          className={cn(
            'inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors',
            summary.pending_request_count > 0
              ? 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
          )}
        >
          <Inbox className="h-4 w-4" />
          Resource Requests
        </button>
      )}

      <TeamSummaryBar data={summary} />

      <div>
        <h3 className="mb-2 text-sm font-medium text-slate-600">Team Utilization Heatmap</h3>
        <TeamHeatmap ccId={ccId} onPersonClick={handlePersonClick} />
      </div>
    </div>
  );
}
