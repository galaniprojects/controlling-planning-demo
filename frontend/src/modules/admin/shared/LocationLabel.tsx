import { HelpCircle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/**
 * Hover tooltips for the three distinct location masters per `[F-MD-01]`.
 * The UI never uses the bare word "Location"; always qualified.
 */

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
