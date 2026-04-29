/**
 * FieldCompletenessRow — one row in the Master Data completeness checklist.
 * [A-BK-20]
 */

import { CheckCircle2, Circle, AlertCircle } from 'lucide-react';
import type { DoIFieldRequirement } from './DoIRequirementsRegistry';

interface Props {
  requirement: DoIFieldRequirement;
  status: 'present' | 'missing' | 'required-from-doi';
  currentValue?: string | number | null;
}

export function FieldCompletenessRow({
  requirement,
  status,
  currentValue,
}: Props) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border last:border-0">
      <div className="mt-0.5 shrink-0">
        {status === 'present' ? (
          <CheckCircle2
            className="size-4 text-emerald-600 dark:text-emerald-400"
            aria-label="Present"
          />
        ) : status === 'missing' ? (
          <AlertCircle
            className="size-4 text-red-500 dark:text-red-400"
            aria-label="Missing — required"
          />
        ) : (
          <Circle
            className="size-4 text-muted-foreground"
            aria-label="Not yet required"
          />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span
            className={
              status === 'present'
                ? 'text-sm text-foreground'
                : status === 'missing'
                ? 'text-sm font-medium text-red-600 dark:text-red-400'
                : 'text-sm text-muted-foreground'
            }
          >
            {requirement.label}
          </span>
          {currentValue !== undefined && currentValue !== null ? (
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-muted-foreground">
              {String(currentValue)}
            </span>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {requirement.rationale}
        </p>
      </div>
    </div>
  );
}
