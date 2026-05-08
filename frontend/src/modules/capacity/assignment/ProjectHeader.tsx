/**
 * ProjectHeader — v5.2 W4 Track A (Session 6a).
 *
 * Renders at the top of AssignmentPanel:
 *   - Project name (16px, weight 500)
 *   - Meta line: hierarchy node badge, PL name, period, status badge
 *   - CRBanner (conditional) when the session has a crId
 *
 * Spec: guides/Capacity_Module_Redesign_Spec.md §9.2 "Project header"
 */
import { Badge } from '@/components/ui/badge';
import type { ProjectAssignmentDetail } from '@/types/api';

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function statusClass(status: string): string {
  switch (status) {
    case 'approved':
    case 'active':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    case 'pending_approval':
    case 'pending':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    case 'draft':
      return 'bg-muted text-muted-foreground';
    case 'declined':
    case 'rejected':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

function humanStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Period formatter — "2026-04 – 2027-03"
// ---------------------------------------------------------------------------

function fmtPeriod(start: string, end: string | null): string {
  if (!end) return start;
  return `${start} – ${end}`;
}

// ---------------------------------------------------------------------------
// CRBanner — blue information banner shown when session has a crId
// ---------------------------------------------------------------------------

interface CRBannerProps {
  crId: number;
  summary: string;
}

export function CRBanner({ crId, summary }: CRBannerProps) {
  return (
    <div className="rounded-md border border-blue-300 bg-blue-50 px-3 py-2 dark:border-blue-700 dark:bg-blue-950/30">
      <p className="text-xs font-medium text-blue-700 dark:text-blue-400">
        Change Request CR-{crId}: {summary}
      </p>
      <div className="mt-1 flex items-center gap-3 text-xs text-blue-600 dark:text-blue-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-blue-500" />
          Hours increased
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-orange-500" />
          Hours decreased
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface ProjectHeaderProps {
  data: ProjectAssignmentDetail;
}

export function ProjectHeader({ data }: ProjectHeaderProps) {
  const { project } = data;

  return (
    <div className="space-y-2">
      {/* Project name */}
      <h2 className="text-base font-medium leading-snug text-foreground">
        {project.name}
      </h2>

      {/* Meta line */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        {project.lob_name && (
          <Badge
            variant="secondary"
            className="rounded px-1.5 py-0 text-[10px] font-normal"
          >
            {project.lob_name}
          </Badge>
        )}
        {project.pl_name && (
          <span>
            PL: <span className="text-foreground">{project.pl_name}</span>
          </span>
        )}
        <span>{fmtPeriod(project.start_month, project.end_month)}</span>
        <Badge
          variant="outline"
          className={`rounded px-1.5 py-0 text-[10px] font-normal ${statusClass(project.status)}`}
        >
          {humanStatus(project.status)}
        </Badge>
      </div>

      {/* CR banner */}
      {data.change_request && (
        <CRBanner
          crId={data.change_request.id}
          summary={data.change_request.summary}
        />
      )}
    </div>
  );
}
