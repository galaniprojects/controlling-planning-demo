/**
 * Scenario column header for the Compare view.
 *
 * Spec line 995: "Each column displays scenario name, owner, anchor version,
 * status badge, and total diff count. Stale indicators appear on any
 * scenario with an outdated anchor."
 *
 * Per-scenario colour coding from `lib/colorCoding.ts` is applied as a
 * tinted header bar with a coloured dot. Directional cues elsewhere use
 * arrows + +/- prefixes (not colour) per CLAUDE.md accessibility rule.
 */

import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { colorForScenarioColumn } from '../lib/colorCoding';

export interface ScenarioColumnInfo {
  /** Stable column index. 0 = anchor / current state. */
  columnIndex: number;
  /** Display label (scenario name, or "Current State" for anchor). */
  label: string;
  /** Author / owner display. Optional for anchor column. */
  owner?: string | null;
  /** Anchor forecast-version label, e.g. "Cycle Q2-2026". */
  anchorLabel?: string | null;
  /** Status badge text — "Private" / "Published" / "Archived" / null. */
  status?: string | null;
  /** Total diff count. Optional — anchor column shows null. */
  diffCount?: number | null;
  /** Stale flag — outdated anchor relative to latest cycle. */
  stale?: boolean;
}

interface ScenarioColumnHeaderProps {
  info: ScenarioColumnInfo;
  /** Make the header sticky for wide horizontally-scrollable tables. */
  sticky?: boolean;
}

export function ScenarioColumnHeader({
  info,
  sticky = false,
}: ScenarioColumnHeaderProps) {
  const tokens = colorForScenarioColumn(info.columnIndex);

  return (
    <div
      data-testid={`scenario-col-header-${info.columnIndex}`}
      className={[
        'px-3 py-2 flex flex-col gap-1',
        tokens.header,
        sticky ? 'sticky top-0 z-10' : '',
      ].join(' ')}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          aria-hidden
          className={[
            'h-2 w-2 rounded-full shrink-0',
            tokens.dot,
          ].join(' ')}
        />
        <span
          className={[
            'text-sm font-semibold truncate',
            tokens.headerText,
          ].join(' ')}
        >
          {info.label}
        </span>
        {info.stale && (
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  data-testid={`scenario-col-${info.columnIndex}-stale`}
                  className="inline-flex items-center text-amber-600 dark:text-amber-400"
                  aria-label="Stale — anchor outdated"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Stale — anchor is older than the latest forecast cycle. Rebase
                before promoting.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        {info.owner && <span className="truncate">{info.owner}</span>}
        {info.anchorLabel && (
          <span className="truncate">· {info.anchorLabel}</span>
        )}
        {info.status && (
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0 capitalize"
          >
            {info.status}
          </Badge>
        )}
        {info.diffCount !== undefined && info.diffCount !== null && (
          <Badge
            variant="secondary"
            className="text-[10px] px-1.5 py-0 tabular-nums"
          >
            {info.diffCount} diff{info.diffCount === 1 ? '' : 's'}
          </Badge>
        )}
      </div>
    </div>
  );
}
