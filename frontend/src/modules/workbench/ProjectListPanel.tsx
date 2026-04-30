/**
 * ProjectListPanel — Workbench left-rail project picker.
 *
 * Shares the active-state visual vocabulary with the shared
 * `LeftRailNav` per `[E-07c]` (`bg-primary/5` + `border-l-2 border-primary`)
 * but renders its own item shape because each entry surfaces multi-line
 * content (RAG dot + name on row 1, type / status badges on row 2) plus
 * a header strip with collapse + "New project" affordances. LeftRailNav's
 * single-line item layout would not accommodate either without
 * regression, so the rendering is bespoke while the active-state pattern
 * stays aligned.
 */
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/shared/Skeleton';
import { SubmitProjectDialog } from '@/components/shared/SubmitProjectDialog';
import { cn } from '@/lib/utils';
import type { WorkbenchProjectListItem } from '@/types/api';
import { PanelLeftClose, PanelLeftOpen, Plus } from 'lucide-react';

interface Props {
  projects: WorkbenchProjectListItem[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  isProjectLead?: boolean;
  onProjectCreated?: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  completed: 'Completed',
  planned: 'Planned',
  draft: 'Draft',
  pending_cc_confirmation: 'CC Review',
  pending_approval: 'Pending',
  changes_requested: 'Changes Req.',
  rejected: 'Rejected',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-muted text-muted-foreground hover:bg-muted',
  completed: 'bg-muted text-muted-foreground hover:bg-muted',
  planned: 'bg-muted text-muted-foreground hover:bg-muted',
  draft: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40',
  pending_cc_confirmation: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40',
  pending_approval: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40',
  changes_requested: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40',
  rejected: 'bg-muted text-muted-foreground hover:bg-muted',
};

export function ProjectListPanel({
  projects,
  loading,
  selectedId,
  onSelect,
  collapsed,
  onToggleCollapse,
  isProjectLead,
  onProjectCreated,
}: Props) {
  const [submitOpen, setSubmitOpen] = useState(false);

  return (
    <div
      className={cn(
        'shrink-0 border border-border rounded-lg bg-card transition-all duration-200 overflow-hidden',
        collapsed ? 'w-10' : 'w-[280px]',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        {!collapsed && (
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Projects
          </span>
        )}
        <div className="flex items-center gap-1">
          {!collapsed && isProjectLead && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-primary hover:text-primary hover:bg-primary/5"
              onClick={() => setSubmitOpen(true)}
            >
              <Plus className="h-3.5 w-3.5 mr-0.5" />
              New
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={onToggleCollapse}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4 text-muted-foreground" />
            ) : (
              <PanelLeftClose className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        </div>
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
            <p className="p-3 text-sm text-muted-foreground">No projects found.</p>
          ) : (
            projects.map((p) => (
              <button
                key={p.id}
                onClick={() => onSelect(p.id)}
                className={cn(
                  'w-full text-left px-3 py-2.5 border-l-2 transition-colors',
                  selectedId === p.id
                    ? 'bg-primary/5 border-primary'
                    : 'border-transparent hover:bg-accent',
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
                  <span className="text-sm font-medium text-foreground truncate">
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
                    <Badge className={cn("text-[10px] px-1.5 py-0 h-4", STATUS_COLORS[p.status])}>
                      {STATUS_LABELS[p.status]}
                    </Badge>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      )}

      <SubmitProjectDialog
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        onSuccess={onProjectCreated}
      />
    </div>
  );
}
