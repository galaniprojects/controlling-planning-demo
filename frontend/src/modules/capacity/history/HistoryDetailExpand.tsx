/**
 * HistoryDetailExpand — expanded detail block under a history row
 * (v5.2 W3, Track D, spec §12.13).
 *
 * Renders the structured `detail_payload` from a `CapacityActionLog`
 * entry: roles affected, people assigned, optional CR info, decline
 * reason, plus a navigation link to the project workbench.
 *
 * The payload shape is documented in spec §12.10:
 * ```
 * {
 *   "requests_affected": [{ request_id, role, months, hours }],
 *   "assignments":       [{ person_id, person_name, months, hours_per_month }],
 *   "cr_id": null | number,
 *   "cr_summary": null | string,
 *   "decline_reason": null | string,
 *   ...
 * }
 * ```
 *
 * The component is defensive: any field may be missing on legacy log
 * entries, so each section renders only when its data is present.
 */
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatNumber } from '@/lib/formatters';
import type { CapacityHistoryEntry } from '@/types/api';

interface RequestAffected {
  request_id?: number;
  role?: string;
  months?: number;
  hours?: number;
}

interface AssignmentInfo {
  person_id?: string;
  person_name?: string;
  months?: number | number[];
  hours_per_month?: number;
  total_hours?: number;
}

interface HistoryDetailExpandProps {
  entry: CapacityHistoryEntry;
}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function formatMonthsField(m: unknown): string {
  if (typeof m === 'number') {
    if (m <= 0) return '';
    return `${m} month${m === 1 ? '' : 's'}`;
  }
  if (Array.isArray(m)) {
    if (m.length === 0) return '';
    return `${m.length} month${m.length === 1 ? '' : 's'}`;
  }
  return '';
}

export function HistoryDetailExpand({ entry }: HistoryDetailExpandProps) {
  const navigate = useNavigate();
  const payload = (entry.detail_payload ?? {}) as Record<string, unknown>;

  const requestsAffected = asArray<RequestAffected>(
    payload.requests_affected,
  );
  const assignments = asArray<AssignmentInfo>(payload.assignments);
  const crId = (payload.cr_id ?? entry.cr_id) as number | null | undefined;
  const crSummary = (payload.cr_summary ?? null) as string | null;
  const declineReason = (payload.decline_reason ?? null) as string | null;
  const changeDirection = (payload.change_direction ?? null) as
    | string
    | null;

  return (
    <div className="bg-muted/30 border-y border-border px-6 py-4 space-y-4">
      {/* Roles affected */}
      {requestsAffected.length > 0 && (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
            Roles affected
          </h4>
          <ul className="space-y-1">
            {requestsAffected.map((r, i) => (
              <li key={i} className="text-sm text-foreground">
                <span className="font-medium">{r.role ?? 'Role'}</span>
                {typeof r.months === 'number' && (
                  <>
                    {' '}
                    — {formatMonthsField(r.months)}
                  </>
                )}
                {typeof r.hours === 'number' && (
                  <>
                    , {formatNumber(r.hours)}h
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* People assigned */}
      {assignments.length > 0 && (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
            People assigned
          </h4>
          <ul className="space-y-1">
            {assignments.map((a, i) => (
              <li key={i} className="text-sm text-foreground">
                <span className="font-medium">
                  {a.person_name ?? a.person_id ?? 'Unassigned'}
                </span>
                {typeof a.hours_per_month === 'number' && (
                  <>
                    {' '}
                    — {formatNumber(a.hours_per_month)}h/month
                  </>
                )}
                {a.months !== undefined &&
                  formatMonthsField(a.months) !== '' && (
                    <>
                      {' '}
                      × {formatMonthsField(a.months)}
                    </>
                  )}
                {typeof a.total_hours === 'number' && (
                  <>
                    {' '}
                    ({formatNumber(a.total_hours)}h total)
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* CR info */}
      {crId != null && (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
            Change request
          </h4>
          <p className="text-sm text-foreground">
            <span className="font-medium">CR #{crId}</span>
            {crSummary && <> — {crSummary}</>}
            {changeDirection && (
              <span className="ml-2 text-xs text-muted-foreground">
                ({changeDirection})
              </span>
            )}
          </p>
        </section>
      )}

      {/* Decline reason */}
      {declineReason && (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
            Decline reason
          </h4>
          <p className="text-sm text-foreground italic">
            “{declineReason}”
          </p>
        </section>
      )}

      {/* Empty payload fallback */}
      {requestsAffected.length === 0 &&
        assignments.length === 0 &&
        crId == null &&
        !declineReason && (
          <p className="text-xs text-muted-foreground italic">
            No additional detail recorded for this action.
          </p>
        )}

      <div className="pt-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => navigate(`/workbench?project=${entry.project_id}`)}
        >
          View project in workbench
          <ArrowUpRight className="h-3 w-3 ml-1" />
        </Button>
      </div>
    </div>
  );
}
