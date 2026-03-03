import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { capacityApi } from '@/api/endpoints';
import { Skeleton } from '@/components/shared/Skeleton';
import { cn } from '@/lib/utils';
import type { PersonDetail } from '@/types/api';

const COLOR_MAP: Record<string, string> = {
  blue: 'text-blue-600',
  green: 'text-green-600',
  amber: 'text-amber-600',
  red: 'text-red-600',
};

function utilColor(pct: number): string {
  if (pct > 100) return 'red';
  if (pct >= 90) return 'amber';
  if (pct >= 70) return 'green';
  return 'blue';
}

interface PersonDetailDrawerProps {
  ccId: string;
  personId: string;
}

export function PersonDetailDrawer({ ccId, personId }: PersonDetailDrawerProps) {
  const navigate = useNavigate();
  const [data, setData] = useState<PersonDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    capacityApi
      .getPersonDetail(ccId, personId)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [ccId, personId]);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-slate-400">Failed to load person details.</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-slate-800">{data.name}</h3>
        <p className="text-sm text-slate-500">{data.role}</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Month</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Projects</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Hours</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Utilization</th>
            </tr>
          </thead>
          <tbody>
            {data.allocations_by_month.map((m) => {
              const color = utilColor(m.utilization_pct);
              return (
                <tr key={m.month} className="border-b border-slate-50">
                  <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{m.month}</td>
                  <td className="px-3 py-2">
                    {m.projects.length > 0 ? (
                      <div className="space-y-0.5">
                        {m.projects.map((p) => (
                          <div key={p.project_id} className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => navigate(`/workbench?project=${p.project_id}`)}
                              className="text-blue-700 hover:underline truncate text-left"
                            >
                              {p.project_name}
                            </button>
                            <span className="text-slate-400 whitespace-nowrap">{p.hours}h</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-600">{m.total_hours}</td>
                  <td className={cn('px-3 py-2 text-right font-medium', COLOR_MAP[color])}>
                    {m.utilization_pct.toFixed(0)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {data.pending_requests.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-slate-500 mb-2">Pending Requests</h4>
          <div className="space-y-1">
            {data.pending_requests.map((r) => (
              <div key={r.id} className="text-sm text-slate-600">
                Request #{r.id} — {r.hours}h/mo for project {r.project_id}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
