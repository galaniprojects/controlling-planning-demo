import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OverviewTab } from './overview/OverviewTab';
import { ChangeHistoryTab } from './history/ChangeHistoryTab';
import { ForecastTab } from './forecast/ForecastTab';

interface Props {
  projectId: string;
  role: string;
}

export function ProjectWorkspace({ projectId, role }: Props) {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="forecast">Forecast & Planning</TabsTrigger>
        <TabsTrigger value="history">Change History</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="mt-4">
        <OverviewTab projectId={projectId} />
      </TabsContent>

      <TabsContent value="forecast" className="mt-4">
        <ForecastTab projectId={projectId} role={role} />
      </TabsContent>

      <TabsContent value="history" className="mt-4">
        <ChangeHistoryTab projectId={projectId} />
      </TabsContent>
    </Tabs>
  );
}
