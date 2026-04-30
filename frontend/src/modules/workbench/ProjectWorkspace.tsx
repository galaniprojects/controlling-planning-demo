import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { OverviewTab } from './overview/OverviewTab';
import { ChangeHistoryTab } from './history/ChangeHistoryTab';
import { ForecastTab } from './forecast/ForecastTab';
import { WorkbenchBTCTab } from './btc/WorkbenchBTCTab';
// === v5 Wave 5 E5 — External costs Workbench tab [E-08a..b] ===
import { ExternalCostsTab } from './external-costs/ExternalCostsTab';
import { chargingApi, portfolioApi } from '@/api/endpoints';
import { Edit2, Eye } from 'lucide-react';
import type { ChargeableEntityItem } from '@/types/api';

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
  // F6 [E-09]: resolve the project's ChargeableEntity once on load. The
  // entity drives whether to surface the BTC tab and which fallback to
  // show. Missing-entity (404) is a normal state for many demo projects.
  const [entity, setEntity] = useState<ChargeableEntityItem | null>(null);

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

  // F6: load the linked chargeable entity (best-effort).
  useEffect(() => {
    let cancelled = false;
    chargingApi
      .getEntityByProjectId(projectId)
      .then((ent) => {
        if (!cancelled) setEntity(ent);
      })
      .catch(() => {
        if (!cancelled) setEntity(null);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return (
    <div className="space-y-4">
      {/* Changes Requested Banner */}
      {status === 'changes_requested' && (
        <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 p-4 space-y-3">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-400">Changes Requested by Controller</p>
          {feedback && (
            <p className="text-sm text-amber-700 dark:text-amber-400">{feedback}</p>
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
          {entity && (
            <TabsTrigger value="btc">
              {(entity.to_business_pct ?? 0) > 0
                ? 'Cost Allocation'
                : 'Distribution'}
            </TabsTrigger>
          )}
          {/* E5: external costs tab sits between BTC and history */}
          <TabsTrigger value="external-costs">External Costs</TabsTrigger>
          <TabsTrigger value="history">Change History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab
            projectId={projectId}
            onOpenBTCTab={
              entity ? () => setActiveTab('btc') : undefined
            }
            onOpenForecastTab={() => setActiveTab('forecast')}
            onOpenChangeHistory={() => setActiveTab('history')}
          />
        </TabsContent>

        <TabsContent value="forecast" className="mt-4 min-w-0">
          <ForecastTab projectId={projectId} role={role} />
        </TabsContent>

        {entity && (
          <TabsContent value="btc" className="mt-4 min-w-0">
            <WorkbenchBTCTab projectId={projectId} />
          </TabsContent>
        )}

        <TabsContent value="external-costs" className="mt-4 min-w-0">
          <ExternalCostsTab projectId={projectId} />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <ChangeHistoryTab projectId={projectId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
