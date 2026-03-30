import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { capacityApi } from '@/api/endpoints';
import { Skeleton } from '@/components/shared/Skeleton';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OrgDetailItem, OrgDetailResponse } from '@/types/api';

interface OrgDetailDrawerProps {
  dimensionId: string;
  pivot: string;
  month?: string;
}

export function OrgDetailDrawer({ dimensionId, pivot, month }: OrgDetailDrawerProps) {
  const navigate = useNavigate();
  const [data, setData] = useState<OrgDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    setExpandedProjects(new Set());
    capacityApi
      .getOrgHeatmapDetail(dimensionId, pivot, month)
      .then((res) => setData(res))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [dimensionId, pivot, month]);

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return <p className="text-sm text-muted-foreground">No project allocations for this period.</p>;
  }

  const deltaPositive = data.delta >= 0;

  function toggleProject(projectId: string) {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {/* CM-03: Summary section */}
      <div className="flex items-center gap-4 px-3 py-2.5 bg-muted/50 rounded-lg border border-border">
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground uppercase">Allocated</p>
          <p className="text-sm font-semibold text-foreground">{Math.round(data.allocated_hours)}h</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground uppercase">Available</p>
          <p className="text-sm font-semibold text-foreground">{Math.round(data.available_hours)}h</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground uppercase">Delta</p>
          <p className={cn(
            'text-sm font-semibold',
            deltaPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
          )}>
            {deltaPositive ? '+' : ''}{Math.round(data.delta)}h
          </p>
        </div>
      </div>

      {/* CM-04: Project list with expandable employee details */}
      <div className="space-y-1">
        <h4 className="text-xs font-medium text-muted-foreground uppercase">Project Allocations</h4>
        {data.items.map((item) => (
          <ProjectRow
            key={item.project_id}
            item={item}
            isExpanded={expandedProjects.has(item.project_id)}
            onToggle={() => toggleProject(item.project_id)}
            onNavigate={() => navigate(`/workbench?project=${item.project_id}`)}
          />
        ))}
      </div>
    </div>
  );
}

interface ProjectRowProps {
  item: OrgDetailItem;
  isExpanded: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}

function ProjectRow({ item, isExpanded, onToggle, onNavigate }: ProjectRowProps) {
  const hasEmployees = item.employees && item.employees.length > 0;

  return (
    <div className="border-b border-border/50">
      <div className="flex items-center gap-2 py-2 px-1">
        {hasEmployees ? (
          <button
            type="button"
            onClick={onToggle}
            className="p-0.5 rounded hover:bg-accent shrink-0"
          >
            <ChevronRight className={cn(
              'h-3.5 w-3.5 text-muted-foreground transition-transform',
              isExpanded && 'rotate-90',
            )} />
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <button
          type="button"
          onClick={onNavigate}
          className="text-sm text-primary hover:underline truncate flex-1 text-left"
        >
          {item.project_name}
        </button>
        <span className="text-sm text-muted-foreground shrink-0">{item.hours_allocated.toFixed(0)}h</span>
      </div>

      {/* Expanded employee list */}
      {isExpanded && hasEmployees && (
        <div className="pl-9 pb-2 space-y-0.5">
          {item.employees!.map((emp) => (
            <div key={emp.person_id} className="flex items-center justify-between text-xs text-muted-foreground py-0.5">
              <span>{emp.person_name}</span>
              <span>{emp.hours.toFixed(0)}h</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
