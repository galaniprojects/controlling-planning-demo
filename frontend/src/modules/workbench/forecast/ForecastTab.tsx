import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ForecastGrid } from './ForecastGrid';
import { ForecastWizard } from './ForecastWizard';
import { workbenchApi } from '@/api/endpoints';

interface Props {
  projectId: string;
  role: string;
}

export function ForecastTab({ projectId, role }: Props) {
  const [mode, setMode] = useState<'read' | 'cycle'>('read');
  const [nameMap, setNameMap] = useState<Record<string, string>>({});

  // Build sub_category → display name lookup from forecast grid
  useEffect(() => {
    workbenchApi.getForecast(projectId).then((res) => {
      const map: Record<string, string> = {};
      for (const row of res.items) {
        map[row.sub_category] = row.sub_category_name;
      }
      setNameMap(map);
    }).catch(() => {});
  }, [projectId]);

  if (mode === 'cycle') {
    return (
      <ForecastWizard
        projectId={projectId}
        nameMap={nameMap}
        onComplete={() => setMode('read')}
        onCancel={() => setMode('read')}
      />
    );
  }

  return (
    <div className="space-y-4">
      {role === 'project_lead' && (
        <div className="flex justify-end">
          <Button onClick={() => setMode('cycle')}>
            Start Monthly Review
          </Button>
        </div>
      )}
      <ForecastGrid projectId={projectId} />
    </div>
  );
}
