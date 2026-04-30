/**
 * LocationLabel — qualified label + tooltip for the three location masters
 * per `[F-MD-01]`.
 *
 * v5 introduces three distinct location-master entities that frequently
 * appear in the UI under similar-looking names:
 *
 *   - **WorkforceLocation**  — office / site (v4 `Location`, renamed)
 *   - **ChargingLocation**   — SAP charging code (~90 KB codes)
 *   - **LegalEntity**        — registered company (~120, rolls up to ChargingLocation)
 *
 * The spec mandates that wherever any of the three appears as a label or
 * column header, the UI must (1) surface a qualified short tag so the
 * three are distinguishable at a glance, and (2) provide a hover tooltip
 * with a one-sentence definition.
 *
 * Usage:
 *   <LocationLabel master="charging" value="DE-MUC-001" />
 *   <LocationLabel master="legal" value="Knorr-Bremse AG" />
 *   <LocationLabel master="workforce" value="Munich" as="th" />
 *   <LocationLabel master="charging" /> // column-header form, no value
 */
import * as React from 'react';
import { Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type LocationMaster = 'workforce' | 'charging' | 'legal';

interface LocationMasterCopy {
  fullName: string;
  shortTag: string;
  definition: string;
}

export const LOCATION_MASTER_COPY: Record<LocationMaster, LocationMasterCopy> = {
  workforce: {
    fullName: 'Workforce Location',
    shortTag: 'Workforce Loc.',
    definition:
      'Office or site where people work. Used for resource planning, team assignments, and capacity views.',
  },
  charging: {
    fullName: 'Charging Location',
    shortTag: 'Charging Loc.',
    definition:
      'SAP charging code used for billing and intercompany cost allocation. Carries division, region, and country attributes.',
  },
  legal: {
    fullName: 'Legal Entity',
    shortTag: 'Legal Entity',
    definition:
      'Registered company. Each legal entity rolls up to exactly one charging location and is used for legal and compliance tracking.',
  },
};

export interface LocationLabelProps {
  /** Which of the three masters this label refers to. */
  master: LocationMaster;
  /** The actual location value (name or display text). When omitted, the component renders only the master name + tooltip — useful for column headers. */
  value?: React.ReactNode;
  /** Optional code rendered next to the value (e.g. SAP charging code). */
  code?: string;
  /** Render as a column header (`<th>`) or a form label rather than a span. */
  as?: 'span' | 'th' | 'label';
  /** ARIA-labelled-by association when used as a label. */
  htmlFor?: string;
  /** Hide the short tag chip (only show value + tooltip icon). Defaults to true when `value` is provided, false when `value` is absent. */
  hideTag?: boolean;
  /** Extra className passed to the outer element. */
  className?: string;
}

export function LocationLabel({
  master,
  value,
  code,
  as = 'span',
  htmlFor,
  hideTag,
  className,
}: LocationLabelProps) {
  const copy = LOCATION_MASTER_COPY[master];
  const showTag = hideTag === undefined ? value === undefined : !hideTag;

  const inner = (
    <span className="inline-flex items-center gap-1.5 align-middle">
      {value !== undefined && (
        <span className="truncate">{value}</span>
      )}
      {code && (
        <span className="text-xs font-mono text-muted-foreground">{code}</span>
      )}
      {value === undefined && (
        <span className="truncate">{copy.fullName}</span>
      )}
      {showTag && value !== undefined && (
        <span className="inline-flex items-center rounded px-1 py-0 text-[10px] font-medium uppercase tracking-wide bg-muted text-muted-foreground">
          {copy.shortTag}
        </span>
      )}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              tabIndex={0}
              aria-label={`${copy.fullName} — info`}
              className="inline-flex items-center text-muted-foreground/70 hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
            >
              <Info className="h-3 w-3" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <p className="font-semibold mb-0.5">{copy.fullName}</p>
            <p className="text-xs leading-snug">{copy.definition}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </span>
  );

  if (as === 'th') {
    return <th className={cn('text-left font-medium', className)}>{inner}</th>;
  }
  if (as === 'label') {
    return (
      <label htmlFor={htmlFor} className={cn('inline-flex', className)}>
        {inner}
      </label>
    );
  }
  return <span className={className}>{inner}</span>;
}
