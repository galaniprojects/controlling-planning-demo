/**
 * DoIGateChecklist — visualises the missing-field list for the next DoI gate
 * [A-PS-04] [A-DOI-04..A-DOI-10] [A-BK-30].
 *
 * Renders a compact card showing:
 * - Current DoI / next DoI
 * - List of missing fields (green tick when no missing fields)
 * - Override-available hint for controllers
 *
 * Hidden when the project is at DoI 5 (top of scale) or off-path.
 */

import { CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PipelineGateStatus } from '@/types/pipeline';

interface Props {
  gate: PipelineGateStatus | null;
  className?: string;
  compact?: boolean;
}

export function DoIGateChecklist({ gate, className, compact }: Props) {
  if (!gate) return null;
  if (gate.next_doi === null) {
    // Already at DoI 5 or off-path — render a celebratory all-clear strip.
    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400',
          className,
        )}
      >
        <CheckCircle2 className="size-4" aria-hidden />
        <span>Project is at the highest DoI on its current path.</span>
      </div>
    );
  }

  const ok = gate.can_advance;

  if (ok) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400',
          className,
        )}
      >
        <CheckCircle2 className="size-4" aria-hidden />
        <span>
          DoI {gate.next_doi} gate is satisfied — controller can advance.
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-sm',
        className,
      )}
    >
      <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
        <AlertCircle className="size-4" aria-hidden />
        <span className="font-medium">
          DoI {gate.next_doi} gate — {gate.missing_fields.length} field
          {gate.missing_fields.length === 1 ? '' : 's'} missing
        </span>
      </div>
      {!compact ? (
        <ul className="mt-2 ml-1 space-y-1 text-amber-700 dark:text-amber-400">
          {gate.missing_fields.map((field) => (
            <li key={field} className="flex items-start gap-2">
              <span
                className="mt-1.5 size-1.5 rounded-full bg-amber-500 dark:bg-amber-400 shrink-0"
                aria-hidden
              />
              <span>{field}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {gate.override_available ? (
        <p className="mt-2 text-xs text-amber-700/80 dark:text-amber-400/80">
          Controller may advance with an override and audit reason
          (per [A-BK-30]).
        </p>
      ) : null}
    </div>
  );
}
