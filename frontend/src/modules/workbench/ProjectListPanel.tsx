import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/shared/Skeleton';
import { ragBgColor } from '@/lib/rag';
import { cn } from '@/lib/utils';
import type { WorkbenchProjectListItem } from '@/types/api';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

interface Props {
  projects: WorkbenchProjectListItem[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending_approval: 'Pending',
};

export function ProjectListPanel({
  projects,
  loading,
  selectedId,
  onSelect,
  collapsed,
  onToggleCollapse,
}: Props) {
  return (
    <div
      className={cn(
        'shrink-0 border border-slate-200 rounded-lg bg-white transition-all duration-200 overflow-hidden',
        collapsed ? 'w-10' : 'w-[280px]',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
        {!collapsed && (
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            Projects
          </span>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={onToggleCollapse}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4 text-slate-500" />
          ) : (
            <PanelLeftClose className="h-4 w-4 text-slate-500" />
          )}
        </Button>
      </div>

      {/* List */}
      {!collapsed && (
        <div className="overflow-y-auto max-h-[calc(100vh-260px)]">
          {loading ? (
            <div className="p-3 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded" />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <p className="p-3 text-sm text-slate-400">No projects found.</p>
          ) : (
            projects.map((p) => (
              <button
                key={p.id}
                onClick={() => onSelect(p.id)}
                className={cn(
                  'w-full text-left px-3 py-2.5 border-l-2 transition-colors',
                  selectedId === p.id
                    ? 'bg-blue-50 border-blue-600'
                    : 'border-transparent hover:bg-slate-50',
                )}
              >
                <div className="flex items-center gap-1.5">
                  {/* RAG dot */}
                  {p.rag && (
                    <span
                      className={cn(
                        'h-2 w-2 rounded-full shrink-0',
                        p.rag === 'green' && 'bg-green-500',
                        p.rag === 'amber' && 'bg-amber-500',
                        p.rag === 'red' && 'bg-red-500',
                      )}
                    />
                  )}
                  <span className="text-sm font-medium text-slate-700 truncate">
                    {p.name}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 h-4 capitalize"
                  >
                    {p.type}
                  </Badge>
                  {STATUS_LABELS[p.status] && (
                    <Badge className="text-[10px] px-1.5 py-0 h-4 bg-amber-100 text-amber-700 hover:bg-amber-100">
                      {STATUS_LABELS[p.status]}
                    </Badge>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
