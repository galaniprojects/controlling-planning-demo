/**
 * PersonDetail — v5.2 W3 Track C (spec §7.2).
 *
 * Renders inside the shared `SidePanel` when the user clicks a person
 * row in the Capacity workspace timeline (any grouping mode). Width is
 * fixed at 280px by `CapacitySidePanelContext`'s width-per-mode policy.
 *
 * Sections rendered (top to bottom, per spec §7.2):
 *
 *   1. Header — name + role + (optional) location badge.
 *   2. Allocations — one row per project the person is allocated to in
 *      the visible window: project color dot (`useProjectColor`) +
 *      project name + total hours over the window. Project name links
 *      to `/workbench?project={id}`.
 *   3. Monthly summary — utilization by quarter, colored by the
 *      standard buckets (blue/green/amber/red).
 *   4. Pending requests (conditional) — dashed amber card listing the
 *      person's pending RR rows. The "Review project" button calls
 *      `openAssignment(project_id)` from `CapacitySidePanelContext`
 *      (no-op stub in W3; lights up in W4 §6a).
 *
 * Demand-pipeline section (§7.2 last paragraph) requires a CC-scoped
 * unassigned-RR fetch keyed on the person's role; since the existing
 * `getPersonDetail` payload lacks `role_type_id` and we have no
 * dedicated endpoint yet, that section is intentionally deferred. It
 * is conditional in the spec so omitting it is spec-compliant when no
 * data is available.
 *
 * Cross-fade: the outer `<div>` is keyed on `${ccId}:${personId}` and
 * carries `animate-in fade-in-0 duration-200`, so React remounts the
 * subtree whenever the panel switches to a different person — yielding
 * the 200ms cross-fade described in §7.4 without touching the shared
 * `SidePanel` shell.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { capacityApi } from '@/api/endpoints';
import { Skeleton } from '@/components/shared/Skeleton';
import { useProjectColor } from '@/contexts/ProjectColorMapContext';
import { cn } from '@/lib/utils';
import type { PersonDetail as PersonDetailDto } from '@/types/api';
import { useCapacitySidePanel } from './CapacitySidePanelContext';

// ---------------------------------------------------------------------------
// Utilization bucket → colour class
// ---------------------------------------------------------------------------

type UtilBucket = 'blue' | 'green' | 'amber' | 'red';

function utilBucket(pct: number): UtilBucket {
  if (pct > 100) return 'red';
  if (pct >= 90) return 'amber';
  if (pct >= 70) return 'green';
  return 'blue';
}

const BUCKET_TEXT: Record<UtilBucket, string> = {
  blue: 'text-blue-600 dark:text-blue-400',
  green: 'text-green-600 dark:text-green-400',
  amber: 'text-amber-600 dark:text-amber-400',
  red: 'text-red-600 dark:text-red-400',
};

const BUCKET_BG: Record<UtilBucket, string> = {
  blue: 'bg-blue-100 dark:bg-blue-900/30',
  green: 'bg-green-100 dark:bg-green-900/30',
  amber: 'bg-amber-100 dark:bg-amber-900/30',
  red: 'bg-red-100 dark:bg-red-900/30',
};

// ---------------------------------------------------------------------------
// Per-project / per-quarter aggregation
// ---------------------------------------------------------------------------

interface ProjectRollup {
  project_id: string;
  project_name: string;
  total_hours: number;
  /** Months in which this person had >0 hours on this project (for hours/mo). */
  active_months: number;
}

function rollUpProjects(
  allocations: PersonDetailDto['allocations_by_month'],
): ProjectRollup[] {
  const byId = new Map<string, ProjectRollup>();
  for (const month of allocations) {
    for (const p of month.projects) {
      const existing = byId.get(p.project_id);
      if (existing) {
        existing.total_hours += p.hours;
        if (p.hours > 0) existing.active_months += 1;
      } else {
        byId.set(p.project_id, {
          project_id: p.project_id,
          project_name: p.project_name,
          total_hours: p.hours,
          active_months: p.hours > 0 ? 1 : 0,
        });
      }
    }
  }
  return Array.from(byId.values()).sort((a, b) => b.total_hours - a.total_hours);
}

interface QuarterRollup {
  label: string;
  utilization_pct: number;
}

/**
 * Group monthly allocations into calendar quarters and average their
 * utilization. Quarters with no monthly entries fall through silently.
 */
function rollUpQuarters(
  allocations: PersonDetailDto['allocations_by_month'],
): QuarterRollup[] {
  const byKey = new Map<string, { sum: number; count: number }>();
  for (const m of allocations) {
    const [yearStr, monthStr] = m.month.split('-');
    const year = Number(yearStr);
    const monthNum = Number(monthStr);
    if (!Number.isFinite(year) || !Number.isFinite(monthNum)) continue;
    const quarter = Math.floor((monthNum - 1) / 3) + 1; // 1..4
    const key = `${year}-Q${quarter}`;
    const slot = byKey.get(key) ?? { sum: 0, count: 0 };
    slot.sum += m.utilization_pct;
    slot.count += 1;
    byKey.set(key, slot);
  }
  return Array.from(byKey.entries()).map(([key, slot]) => ({
    label: key.replace('-', ' '),
    utilization_pct: slot.count > 0 ? slot.sum / slot.count : 0,
  }));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface PersonDetailProps {
  ccId: string;
  personId: string;
}

export function PersonDetail({ ccId, personId }: PersonDetailProps) {
  const [data, setData] = useState<PersonDetailDto | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    capacityApi
      .getPersonDetail(ccId, personId)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ccId, personId]);

  // The wrapper div is intentionally keyed on the (ccId, personId) tuple
  // so React remounts on any change, kicking off the fade-in animation.
  // `animate-in fade-in-0 duration-200` matches the cross-fade described
  // in spec §7.4 without disturbing the shared SidePanel shell.
  return (
    <div
      key={`${ccId}:${personId}`}
      className="animate-in fade-in-0 duration-200"
    >
      {loading ? (
        <PersonDetailSkeleton />
      ) : !data ? (
        <p className="text-sm text-muted-foreground">
          Failed to load person details.
        </p>
      ) : (
        <PersonDetailBody data={data} />
      )}
    </div>
  );
}

function PersonDetailSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-3 w-24" />
      <div className="space-y-2 pt-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
}

function PersonDetailBody({ data }: { data: PersonDetailDto }) {
  const projects = rollUpProjects(data.allocations_by_month);
  const quarters = rollUpQuarters(data.allocations_by_month);
  const hasPending = data.pending_requests.length > 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="space-y-0.5">
        <h3 className="text-base font-medium text-foreground leading-tight">
          {data.name}
        </h3>
        <p className="text-[13px] text-muted-foreground leading-tight">
          {data.role}
        </p>
      </div>

      {/* Allocations */}
      {projects.length > 0 && (
        <Section title="Allocations">
          <ul className="space-y-1.5">
            {projects.map((p) => (
              <AllocationRow key={p.project_id} project={p} />
            ))}
          </ul>
        </Section>
      )}

      {/* Monthly summary (by quarter) */}
      {quarters.length > 0 && (
        <Section title="Monthly summary">
          <table className="w-full text-xs">
            <tbody>
              {quarters.map((q) => {
                const bucket = utilBucket(q.utilization_pct);
                return (
                  <tr
                    key={q.label}
                    className="border-b border-border/40 last:border-0"
                  >
                    <td className="py-1.5 pr-2 text-muted-foreground">
                      {q.label}
                    </td>
                    <td
                      className={cn(
                        'py-1.5 pl-2 text-right font-medium',
                        BUCKET_TEXT[bucket],
                      )}
                    >
                      {q.utilization_pct.toFixed(0)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>
      )}

      {/* Pending requests (conditional) */}
      {hasPending && (
        <PendingRequestsCard requests={data.pending_requests} />
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h4 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      {children}
    </section>
  );
}

function AllocationRow({ project }: { project: ProjectRollup }) {
  const navigate = useNavigate();
  const color = useProjectColor(project.project_id);

  const hoursPerMonth =
    project.active_months > 0
      ? Math.round(project.total_hours / project.active_months)
      : 0;

  return (
    <li className="flex items-center gap-2 text-sm">
      <span
        aria-hidden="true"
        className="inline-block h-2 w-2 shrink-0 rounded-[1px]"
        style={{ backgroundColor: color }}
      />
      <button
        type="button"
        onClick={() => navigate(`/workbench?project=${project.project_id}`)}
        className="flex-1 truncate text-left text-foreground hover:text-primary hover:underline"
        title={project.project_name}
      >
        {project.project_name}
      </button>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
        {hoursPerMonth}h/mo
      </span>
    </li>
  );
}

function PendingRequestsCard({
  requests,
}: {
  requests: PersonDetailDto['pending_requests'];
}) {
  const { openAssignment } = useCapacitySidePanel();
  const isPlural = requests.length > 1;

  return (
    <section
      className={cn(
        'rounded-md border border-dashed p-3 space-y-2',
        BUCKET_BG.amber,
        'border-amber-400 dark:border-amber-600',
      )}
    >
      <h4 className="text-xs font-medium text-amber-700 dark:text-amber-300">
        {isPlural ? `Pending requests (${requests.length})` : 'Pending request'}
      </h4>
      <ul className="space-y-2">
        {requests.map((r) => (
          <li
            key={r.id}
            className="flex flex-col gap-1.5 rounded-sm border border-amber-300/40 dark:border-amber-700/40 bg-card/60 p-2"
          >
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-foreground" title={r.project_id}>
                Project {r.project_id}
              </span>
              <span className="shrink-0 text-muted-foreground tabular-nums">
                {Math.round(r.hours)}h/mo
              </span>
            </div>
            <button
              type="button"
              onClick={() => openAssignment(r.project_id)}
              className="self-start rounded-sm border border-amber-400/60 dark:border-amber-600/60 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-200/60 dark:hover:bg-amber-900/40 transition-colors"
            >
              Review project
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
