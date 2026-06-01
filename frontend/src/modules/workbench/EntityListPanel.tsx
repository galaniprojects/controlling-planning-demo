/**
 * EntityListPanel — Workbench left-rail entity picker.
 *
 * Replaces the project-only `ProjectListPanel` per Service Workbench
 * Session 3 §3.3. The list now contains all three ChargeableEntity
 * subtypes (Project / Offering / InternalService) so the same module is
 * the canonical home for every chargeable entity.
 *
 * A segmented type filter at the top (All / Project / Offering / Internal
 * Service) narrows the list. Filter state is local to the panel — per the
 * spec it persists within the session (React state) and resets when the
 * user leaves and re-enters the module.
 *
 * The active-state vocabulary (`bg-primary/5` + `border-l-2 border-primary`)
 * stays aligned with the shared `LeftRailNav`. The row layout is bespoke
 * because each entry is multi-line (name + identifier / subtype badge /
 * optional status badge for Projects) and the panel grows a typed filter
 * header that single-line LeftRailNav rows would not accommodate.
 *
 * Project rows preserve the visual vocabulary that `ProjectListPanel`
 * shipped (RAG dot, workflow status badge, type badge); Offering /
 * InternalService rows show identifier and a subtype-coloured badge.
 * Project Lead filtering happens server-side at the `workbenchApi`
 * level for project rows and the panel just renders what it is given.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/shared/Skeleton';
import { EntityTypeBadge } from '@/components/shared/EntityTypeBadge';
import { PipelineStageBadge } from '@/components/shared/PipelineStageBadge';
import { cn } from '@/lib/utils';
import { PanelLeftClose, PanelLeftOpen, Plus } from 'lucide-react';
import type {
  ChargeableEntityItem,
  ChargeableEntityType,
  WorkbenchProjectListItem,
} from '@/types/api';

/** Row union — Project rows carry workflow status + RAG; service rows don't. */
export type WorkbenchEntityRow =
  | {
      kind: 'project';
      entity_id: string;
      project_id: string;
      identifier: string;
      name: string;
      type: ChargeableEntityType; // 'Project'
      rag?: string | null;
      pipeline_stage?: string | null;
      review_state?: string | null;
    }
  | {
      kind: 'service';
      entity_id: string;
      identifier: string;
      name: string;
      type: ChargeableEntityType; // 'Offering' | 'InternalService'
    };

// Review sub-state badge (shown alongside the pipeline stage when a project is
// mid intake/submission review). Lifecycle stage now renders via PipelineStageBadge.
const REVIEW_LABELS: Record<string, string> = {
  pending_cc_confirmation: 'CC Review',
  pending_approval: 'Pending',
  changes_requested: 'Changes Req.',
};

const REVIEW_COLORS: Record<string, string> = {
  pending_cc_confirmation:
    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40',
  pending_approval:
    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40',
  changes_requested:
    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40',
};

type Filter = 'all' | ChargeableEntityType;

const FILTER_BUTTONS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'Project', label: 'Project' },
  { id: 'Offering', label: 'Offering' },
  { id: 'InternalService', label: 'Internal Service' },
];

interface Props {
  rows: WorkbenchEntityRow[];
  loading: boolean;
  /** Currently-selected ChargeableEntity id. */
  selectedEntityId: string | null;
  /** Called with the full row when the user clicks. */
  onSelect: (row: WorkbenchEntityRow) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  isProjectLead?: boolean;
}

export function EntityListPanel({
  rows,
  loading,
  selectedEntityId,
  onSelect,
  collapsed,
  onToggleCollapse,
  isProjectLead,
}: Props) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');

  const filteredRows = useMemo(() => {
    if (filter === 'all') return rows;
    return rows.filter((r) => r.type === filter);
  }, [rows, filter]);

  const countsByFilter = useMemo(() => {
    const c: Record<Filter, number> = {
      all: rows.length,
      Project: 0,
      Offering: 0,
      InternalService: 0,
    };
    for (const r of rows) c[r.type as Filter] += 1;
    return c;
  }, [rows]);

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
            Entities
          </span>
        )}
        <div className="flex items-center gap-1">
          {!collapsed && isProjectLead && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-primary hover:text-primary hover:bg-primary/5"
              onClick={() => navigate('/define/new')}
              title="Create a new project on the Define page"
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
            aria-label={collapsed ? 'Expand entity list' : 'Collapse entity list'}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4 text-muted-foreground" />
            ) : (
              <PanelLeftClose className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        </div>
      </div>

      {/* Type filter — segmented control */}
      {!collapsed && (
        <div className="px-3 py-2 border-b border-border">
          <div
            role="tablist"
            aria-label="Filter entities by type"
            className="grid grid-cols-4 gap-0.5 bg-muted/60 rounded-md p-0.5"
          >
            {FILTER_BUTTONS.map((b) => {
              const active = filter === b.id;
              const count = countsByFilter[b.id];
              return (
                <button
                  key={b.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(b.id)}
                  title={`${b.label} (${count})`}
                  className={cn(
                    'h-7 text-[10px] font-medium rounded transition-colors px-1 truncate',
                    active
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {b.label === 'Internal Service' ? 'Int.Svc' : b.label}
                  <span
                    className={cn(
                      'ml-1 text-[9px]',
                      active ? 'text-muted-foreground' : 'text-muted-foreground/70',
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* List */}
      {!collapsed && (
        <div className="overflow-y-auto max-h-[calc(100vh-260px)]">
          {loading ? (
            <div className="p-3 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded" />
              ))}
            </div>
          ) : filteredRows.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">
              {rows.length === 0
                ? 'No entities found.'
                : `No ${filter === 'all' ? '' : filter + ' '}entities match.`}
            </p>
          ) : (
            filteredRows.map((row) => {
              const active = selectedEntityId === row.entity_id;
              return (
                <button
                  key={row.entity_id}
                  onClick={() => onSelect(row)}
                  className={cn(
                    'w-full text-left px-3 py-2.5 border-l-2 transition-colors',
                    active
                      ? 'bg-primary/5 border-primary'
                      : 'border-transparent hover:bg-accent',
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    {row.kind === 'project' && row.rag && (
                      <span
                        className={cn(
                          'h-2 w-2 rounded-full shrink-0',
                          row.rag === 'green' && 'bg-green-500',
                          row.rag === 'amber' && 'bg-amber-500',
                          row.rag === 'red' && 'bg-red-500',
                        )}
                        aria-label={`RAG ${row.rag}`}
                      />
                    )}
                    <span className="text-sm font-medium text-foreground truncate">
                      {row.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <EntityTypeBadge type={row.type} />
                    {row.kind === 'project' && row.pipeline_stage && (
                      <PipelineStageBadge stage={row.pipeline_stage} />
                    )}
                    {row.kind === 'project' && row.review_state && (
                      <Badge
                        className={cn(
                          'text-[10px] px-1.5 py-0 h-4',
                          REVIEW_COLORS[row.review_state] ?? '',
                        )}
                      >
                        {REVIEW_LABELS[row.review_state] ?? row.review_state}
                      </Badge>
                    )}
                    {row.identifier && (
                      <span className="text-[10px] text-muted-foreground font-mono truncate">
                        {row.identifier}
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Build the merged Workbench entity list from a project list (already
 * role-filtered by `workbenchApi.getProjects()`) and the full active
 * ChargeableEntity catalogue. Used by `ProjectWorkbench`.
 *
 * Service rows (Offerings + InternalServices) are not role-scoped here —
 * Charging is already a read-only surface for PLs and the Workbench
 * mirrors that. The workspace dispatcher gates writes by role at the
 * destination surface.
 */
export function buildEntityRows(
  projects: WorkbenchProjectListItem[],
  entities: ChargeableEntityItem[],
): WorkbenchEntityRow[] {
  // Project rows — driven by the workbench projects list (carries RAG +
  // status + role-aware visibility). Each maps back to its
  // ChargeableEntity row by `project_id` for the entity_id field.
  const entityByProjectId = new Map<string, ChargeableEntityItem>();
  for (const e of entities) {
    if (e.entity_type === 'Project' && e.project_id) {
      entityByProjectId.set(e.project_id, e);
    }
  }

  const droppedProjectIds: string[] = [];
  const projectRows: WorkbenchEntityRow[] = projects
    .map((p): WorkbenchEntityRow | null => {
      const ent = entityByProjectId.get(p.id);
      if (!ent) {
        droppedProjectIds.push(p.id);
        return null;
      }
      return {
        kind: 'project' as const,
        entity_id: ent.id,
        project_id: p.id,
        identifier: ent.identifier,
        name: p.name,
        type: 'Project' as ChargeableEntityType,
        rag: p.rag ?? null,
        pipeline_stage: p.pipeline_stage ?? null,
        review_state: p.review_state ?? null,
      };
    })
    .filter((r): r is WorkbenchEntityRow => r !== null);

  // Surface a dev-only warn when a role-visible project has no active
  // ChargeableEntity row — typically signals an in-flight seed or an
  // entity that was deactivated. Silent dropping was the prior
  // behaviour; the warn helps debug a "my project disappeared" report.
  if (import.meta.env.DEV && droppedProjectIds.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `[Workbench] ${droppedProjectIds.length} project(s) hidden from sidebar — no active ChargeableEntity for project_id(s):`,
      droppedProjectIds,
    );
  }

  // Service rows — Offerings and Internal Services. PLs see them read-only
  // alongside their own projects (the workspace gates writes by role).
  const serviceRows: WorkbenchEntityRow[] = entities
    .filter(
      (e) => e.is_active && (e.entity_type === 'Offering' || e.entity_type === 'InternalService'),
    )
    .map<WorkbenchEntityRow>((e) => ({
      kind: 'service',
      entity_id: e.id,
      identifier: e.identifier,
      name: e.name,
      type: e.entity_type,
    }));

  return [...projectRows, ...serviceRows].sort((a, b) => a.name.localeCompare(b.name));
}
