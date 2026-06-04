/**
 * v5 B2 — Single-scenario row used by both manager tables.
 */

import { MoreHorizontal, Lock, Globe, Eye, Archive, ArrowDownToLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TableCell, TableRow } from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ScenarioListItem } from '@/types/api';
import { formatCurrencyDelta, formatDecimal } from '@/lib/formatters';

/** European number with minimal decimals: 10 → "10", 10.5 → "10,5". */
function fmtCompactNumber(value: number): string {
  return formatDecimal(value, 1).replace(/,0$/, '');
}

/**
 * Format a scenario's stored `headline_impact` JSON into a compact, human
 * summary for the manager table (F1).
 *
 * The backend stores `headline_impact` as a JSON string whose SHAPE varies by
 * the kind of scenario:
 *   - financial-delta    `{ total_budget_delta, action_count, ... }`
 *                        (incl. a budget-neutral schedule-shift variant that
 *                         also carries `schedule_shift_months`)
 *   - BTC pct-shift      `{ total_btc_pct_shift, affected_locations, action_count }`
 *   - staffing / mix     `{ total_capacity_shift_fte, senior_to_mid_swap_pct, action_count }`
 *
 * The previous formatter only handled the financial shape and fell back to the
 * raw JSON string for the others, dumping `{"total_btc_pct_shift": 10, …}` into
 * the table cell. We now recognise every shape and degrade gracefully to the
 * verbatim string for non-JSON / unknown shapes, and to "—" for null.
 */
export function formatHeadlineImpact(raw: string | null): string {
  if (!raw) return '—';

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return raw; // Not JSON — show verbatim.
  }
  if (!parsed || typeof parsed !== 'object') return raw;

  const num = (key: string): number | null =>
    typeof parsed[key] === 'number' ? (parsed[key] as number) : null;

  const count = num('action_count') ?? 0;
  const actions = `${count} action${count !== 1 ? 's' : ''}`;

  // 1. Financial-delta shape (incl. the budget-neutral schedule-shift variant).
  const budgetDelta = num('total_budget_delta');
  if (budgetDelta !== null) {
    const months = num('schedule_shift_months');
    if (budgetDelta === 0 && months) {
      const sign = months > 0 ? '+' : '';
      return `Schedule ${sign}${months} mo (${actions})`;
    }
    return `${formatCurrencyDelta(budgetDelta)} (${actions})`;
  }

  // 2. BTC percentage-shift shape.
  const btcShift = num('total_btc_pct_shift');
  if (btcShift !== null) {
    const locs = num('affected_locations');
    const locPart =
      locs && locs > 0 ? ` · ${locs} location${locs !== 1 ? 's' : ''}` : '';
    return `BTC shift ${fmtCompactNumber(btcShift)}pp${locPart} (${actions})`;
  }

  // 3. Staffing / capacity-mix shape.
  const swapPct = num('senior_to_mid_swap_pct');
  const fteShift = num('total_capacity_shift_fte');
  if (swapPct !== null || fteShift !== null) {
    const parts: string[] = [];
    if (swapPct !== null) {
      parts.push(`${fmtCompactNumber(swapPct)}% senior→mid`);
    }
    if (fteShift !== null && fteShift !== 0) {
      parts.push(`${fmtCompactNumber(fteShift)} FTE`);
    }
    const label = parts.length > 0 ? parts.join(' · ') : 'Staffing mix';
    return `${label} (${actions})`;
  }

  return raw;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function VisibilityBadge({ scenario }: { scenario: ScenarioListItem }) {
  if (scenario.archived) {
    return (
      <Badge className="bg-muted text-muted-foreground hover:bg-muted">
        <Archive className="h-3 w-3 mr-1" aria-hidden="true" />
        Archived
      </Badge>
    );
  }
  if (scenario.status === 'private') {
    return (
      <Badge className="bg-muted text-muted-foreground hover:bg-muted">
        <Lock className="h-3 w-3 mr-1" aria-hidden="true" />
        Private
      </Badge>
    );
  }
  // Published — distinguish Tier 3 vs all-users
  if (scenario.visibility === 'tier3_only') {
    return (
      <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400">
        <Eye className="h-3 w-3 mr-1" aria-hidden="true" />
        Tier 3 only
      </Badge>
    );
  }
  return (
    <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400">
      <Globe className="h-3 w-3 mr-1" aria-hidden="true" />
      Published
    </Badge>
  );
}

interface Props {
  scenario: ScenarioListItem;
  isAuthor: boolean;
  showOwnerActions: boolean;
  /**
   * Simulator S4 — render a "Handoff from <author>" badge. Set when the
   * viewer is a Project Lead seeing a leadership→PL handoff slice (§9.1).
   */
  isHandoff?: boolean;
  onOpen: (id: number) => void;
  onClone: (id: number) => void;
  onPublish?: (id: number) => void;
  onUnpublish?: (id: number) => void;
  onArchive?: (id: number, archived: boolean) => void;
  onDelete?: (id: number) => void;
  onRebase?: (id: number) => void;
}

export function ScenarioRow({
  scenario,
  isAuthor,
  showOwnerActions,
  isHandoff = false,
  onOpen,
  onClone,
  onPublish,
  onUnpublish,
  onArchive,
  onDelete,
  onRebase,
}: Props) {
  return (
    <TableRow
      className={`cursor-pointer hover:bg-accent ${
        scenario.archived ? 'opacity-60' : ''
      }`}
      onClick={() => onOpen(scenario.id)}
    >
      <TableCell>
        <div>
          <p className="text-sm font-medium text-foreground">
            {scenario.name}
          </p>
          {scenario.description && (
            <p className="text-xs text-muted-foreground truncate max-w-[260px]">
              {scenario.description}
            </p>
          )}
          {scenario.tags && scenario.tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {scenario.tags.map((t) => (
                <span
                  key={t}
                  className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col items-start gap-1">
          <VisibilityBadge scenario={scenario} />
          {isHandoff && (
            <Badge className="bg-sky-100 text-sky-700 hover:bg-sky-100 dark:bg-sky-900/30 dark:text-sky-400">
              <ArrowDownToLine className="h-3 w-3 mr-1" aria-hidden="true" />
              Handoff from {scenario.author_name}
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {scenario.author_name}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {formatDate(scenario.modified_at)}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
        {formatHeadlineImpact(scenario.headline_impact)}
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => e.stopPropagation()}
              aria-label="Scenario actions"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onClick={(e) => e.stopPropagation()}
          >
            <DropdownMenuItem onClick={() => onOpen(scenario.id)}>
              Open
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onClone(scenario.id)}>
              Clone
            </DropdownMenuItem>
            {showOwnerActions && isAuthor && (
              <>
                <DropdownMenuSeparator />
                {scenario.status === 'private' && onPublish && (
                  <DropdownMenuItem onClick={() => onPublish(scenario.id)}>
                    Publish
                  </DropdownMenuItem>
                )}
                {scenario.status === 'published' && onUnpublish && (
                  <DropdownMenuItem onClick={() => onUnpublish(scenario.id)}>
                    Unpublish
                  </DropdownMenuItem>
                )}
                {onRebase && (
                  <DropdownMenuItem onClick={() => onRebase(scenario.id)}>
                    Rebase to newer cycle
                  </DropdownMenuItem>
                )}
                {onArchive && (
                  <DropdownMenuItem
                    onClick={() => onArchive(scenario.id, !scenario.archived)}
                  >
                    {scenario.archived ? 'Restore from archive' : 'Archive'}
                  </DropdownMenuItem>
                )}
                {onDelete && (
                  <DropdownMenuItem
                    className="text-red-600 dark:text-red-400"
                    onClick={() => onDelete(scenario.id)}
                  >
                    Delete
                  </DropdownMenuItem>
                )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
