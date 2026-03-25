import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { OverviewTab } from './overview/OverviewTab';
import { ChangeHistoryTab } from './history/ChangeHistoryTab';
import { ForecastTab } from './forecast/ForecastTab';
import { portfolioApi } from '@/api/endpoints';
import { Edit2, Eye } from 'lucide-react';

interface Props {
  projectId: string;
  role: string;
  status?: string;
}

export function ProjectWorkspace({ projectId, role, status }: Props) {
  const [activeTab, setActiveTab] = useState('overview');
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();
  const [feedback, setFeedback] = useState<string | null>(null);

  // Fetch submission feedback when status is changes_requested
  useEffect(() => {
    if (status === 'changes_requested') {
      portfolioApi
        .getIntakeDetail(projectId)
        .then((res) => setFeedback(res.submission_feedback ?? null))
        .catch(() => setFeedback(null));
    } else {
      setFeedback(null);
    }
  }, [projectId, status]);

  return (
    <div className="space-y-4">
      {/* Changes Requested Banner */}
      {status === 'changes_requested' && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-3">
          <p className="text-sm font-semibold text-amber-800">Changes Requested by Controller</p>
          {feedback && (
            <p className="text-sm text-amber-700">{feedback}</p>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => setSearchParams({ project: projectId, tab: 'diff' })}
            >
              <Eye className="h-3.5 w-3.5 mr-1" />
              Review Proposed Changes
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate(`/workbench/new-project/${projectId}`)}
            >
              <Edit2 className="h-3.5 w-3.5 mr-1" />
              Edit and Resubmit
            </Button>
          </div>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="forecast">Forecast & Planning</TabsTrigger>
          <TabsTrigger value="history">Change History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab projectId={projectId} />
        </TabsContent>

        <TabsContent value="forecast" className="mt-4 min-w-0">
          <ForecastTab projectId={projectId} role={role} />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <ChangeHistoryTab projectId={projectId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
