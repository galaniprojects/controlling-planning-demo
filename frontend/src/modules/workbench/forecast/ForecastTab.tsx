import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ForecastGrid } from './ForecastGrid';
import { ForecastWizard } from './ForecastWizard';
import { workbenchApi } from '@/api/endpoints';
import { getDefaultExpandedYear } from '@/lib/yearColumns';
import { Clock } from 'lucide-react';

interface PendingCR {
  cr_id: number;
  status: string;
  submitted_at: string | null;
}

interface Props {
  projectId: string;
  role: string;
}

const STATUS_LABELS: Record<string, string> = {
  pending_cc_confirmation: 'Awaiting CC Owner',
  pending_controller_approval: 'Awaiting Controller',
  changes_requested: 'Changes Requested',
};

export function ForecastTab({ projectId, role }: Props) {
  const [mode, setMode] = useState<'read' | 'cycle'>('read');
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [defaultExpandedYear, setDefaultExpandedYear] = useState<number | undefined>();
  const [projectStatus, setProjectStatus] = useState<string | null>(null);
  const [pendingCR, setPendingCR] = useState<PendingCR | null>(null);

  // Reset wizard mode when switching projects
  useEffect(() => {
    setMode('read');
  }, [projectId]);

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

  // Fetch project overview for context-sensitive year expansion
  useEffect(() => {
    workbenchApi.getOverview(projectId).then((res) => {
      const year = getDefaultExpandedYear(
        res.metadata?.status,
        res.metadata?.timeline?.start,
        res.metadata?.timeline?.end,
      );
      setDefaultExpandedYear(year);
      setProjectStatus(res.metadata?.status ?? null);
      setPendingCR(res.metadata?.pending_cr ?? null);
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
    <div className="space-y-4 min-w-0">
      {role === 'project_lead' && projectStatus === 'active' && (
        <div className="flex items-center justify-end gap-3">
          {pendingCR && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Clock className="h-4 w-4" />
              <span>CR-{pendingCR.cr_id} under review</span>
              <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                {STATUS_LABELS[pendingCR.status] || pendingCR.status}
              </Badge>
            </div>
          )}
          <Button onClick={() => setMode('cycle')} disabled={!!pendingCR}>
            Rolling Forecast Review
          </Button>
        </div>
      )}
      <ForecastGrid projectId={projectId} defaultExpandedYear={defaultExpandedYear} />
    </div>
  );
}
