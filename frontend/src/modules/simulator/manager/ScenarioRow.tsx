/**
 * v5 B2 — Single-scenario row used by both manager tables.
 */

import { MoreHorizontal, Lock, Globe, Eye, Archive } from 'lucide-react';
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
import { formatCurrencyDelta } from '@/lib/formatters';

function formatHeadlineImpact(raw: string | null): string {
  if (!raw) return '—';
  try {
    const parsed = JSON.parse(raw) as {
      total_budget_delta?: number;
      action_count?: number;
    };
    if (typeof parsed.total_budget_delta === 'number') {
      const count = parsed.action_count ?? 0;
      return `${formatCurrencyDelta(parsed.total_budget_delta)} (${count} action${count !== 1 ? 's' : ''})`;
    }
  } catch {
    // Not JSON — return as-is
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
        <VisibilityBadge scenario={scenario} />
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
