import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
    const parsed = JSON.parse(raw);
    const delta = parsed.total_budget_delta;
    const count = parsed.action_count;
    if (typeof delta === 'number') {
      return `${formatCurrencyDelta(delta)} (${count} action${count !== 1 ? 's' : ''})`;
    }
  } catch {
    // Not JSON — return as-is
  }
  return raw;
}

interface Props {
  title: string;
  scenarios: ScenarioListItem[];
  onOpen: (id: number) => void;
  onClone: (id: number) => void;
  onPublish: (id: number) => void;
  onUnpublish: (id: number) => void;
  onDelete: (id: number) => void;
  currentUserName: string;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function ScenarioTable({
  title,
  scenarios,
  onOpen,
  onClone,
  onPublish,
  onUnpublish,
  onDelete,
  currentUserName,
}: Props) {
  if (scenarios.length === 0) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        <p className="text-xs text-slate-400 italic py-4 text-center">
          No scenarios yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Name</TableHead>
            <TableHead className="text-xs">Status</TableHead>
            <TableHead className="text-xs">Author</TableHead>
            <TableHead className="text-xs">Modified</TableHead>
            <TableHead className="text-xs">Headline Impact</TableHead>
            <TableHead className="text-xs w-[50px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {scenarios.map((s) => {
            const isAuthor = s.author_name === currentUserName;
            return (
              <TableRow
                key={s.id}
                className="cursor-pointer hover:bg-slate-50"
                onClick={() => onOpen(s.id)}
              >
                <TableCell>
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {s.name}
                    </p>
                    {s.description && (
                      <p className="text-xs text-slate-500 truncate max-w-[260px]">
                        {s.description}
                      </p>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    className={
                      s.status === 'published'
                        ? 'bg-green-100 text-green-700 hover:bg-green-100'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-100'
                    }
                  >
                    {s.status === 'published' ? 'Published' : 'Private'}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-slate-600">
                  {s.author_name}
                </TableCell>
                <TableCell className="text-xs text-slate-500">
                  {formatDate(s.modified_at)}
                </TableCell>
                <TableCell className="text-xs text-slate-600 max-w-[200px] truncate">
                  {formatHeadlineImpact(s.headline_impact)}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onOpen(s.id)}>
                        Open
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onClone(s.id)}>
                        Clone
                      </DropdownMenuItem>
                      {isAuthor && (
                        <>
                          <DropdownMenuSeparator />
                          {s.status === 'private' ? (
                            <DropdownMenuItem
                              onClick={() => onPublish(s.id)}
                            >
                              Publish
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => onUnpublish(s.id)}
                            >
                              Unpublish
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={() => onDelete(s.id)}
                          >
                            Delete
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
