/**
 * LocationLabel — qualified label + tooltip for the three location masters
 * per `[F-MD-01]`.
 *
 * v5 introduces three distinct location-master entities that frequently
 * appear in the UI under similar-looking names. The spec mandates that
 * wherever any of the three appears as a label or column header, the UI
 * must (1) surface a qualified short tag so the three are
 * distinguishable, and (2) provide a hover tooltip with a one-sentence
 * definition.
 *
 *   - **WorkforceLocation**  — office / site (v4 `Location`, renamed)
 *   - **ChargingLocation**   — SAP charging code (~90 KB codes)
 *   - **LegalEntity**        — registered company (~120, rolls up to ChargingLocation)
 *
 * Originally introduced by D3 (D-cluster) in `modules/admin/shared/`;
 * promoted to the shared component bucket in v5 Session E8 so callers
 * outside the admin module (Workbench, Charging, Portfolio, Reporting)
 * can use it without crossing module boundaries.
 *
 * Usage:
 *   <LocationLabel kind="charging" />                    // canonical column header
 *   <LocationLabel kind="legal" text="Knorr-Bremse AG" /> // value-form
 *   <LocationLabel kind="workforce" iconOnly />           // info-only chip
 */
import { HelpCircle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export type LocationKind = 'workforce' | 'charging' | 'legal';

const TOOLTIP_BY_KIND: Record<LocationKind, { label: string; tip: string }> = {
  workforce: {
    label: 'Workforce Locations',
    tip:
      'Workforce Location — physical office where people work (Munich, Budapest, Pune). ' +
      'Cost centres, people, and capacity are anchored here.',
  },
  charging: {
    label: 'Charging Locations',
    tip:
      'Charging Location — Knorr-Bremse charging code (~90 codes) used for inter-service ' +
      'distribution and SAP cost flows. Carries division, region and country attributes.',
  },
  legal: {
    label: 'Legal Entities',
    tip:
      'Legal Entity — registered KB company (~120 entities). Many-to-one rollup to a ' +
      'Charging Location; carries its own country for divergence cases.',
  },
};

interface LocationLabelProps {
  kind: LocationKind;
  /** Override the displayed text; default uses the canonical plural label */
  text?: string;
  /** Hide the help icon (useful inside table headers) */
  iconOnly?: boolean;
  className?: string;
}

export function LocationLabel({ kind, text, iconOnly, className }: LocationLabelProps) {
  const { label, tip } = TOOLTIP_BY_KIND[kind];
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={
              'inline-flex items-center gap-1 cursor-help underline decoration-dotted decoration-muted-foreground/50 underline-offset-2 ' +
              (className ?? '')
            }
          >
            {!iconOnly && (text ?? label)}
            <HelpCircle className="h-3 w-3 text-muted-foreground" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-xs leading-relaxed">{tip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
