import { useState, useEffect } from 'react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/shared/Skeleton';
import { adminApi } from '@/api/endpoints';
import type { AuditLogEntry } from '@/types/api';

const ENTITY_TYPE_OPTIONS = [
  { value: 'all', label: 'All Types' },
  { value: 'cost_center', label: 'Cost Center' },
  { value: 'competence_center', label: 'Competence Center' },
  { value: 'lob', label: 'Line of Business' },
  { value: 'location', label: 'Location' },
  { value: 'person', label: 'Person' },
  { value: 'rate_table', label: 'Rate Table' },
  { value: 'planning_parameter', label: 'Planning Parameter' },
];

function formatEntityType(type: string): string {
  return type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function actionBadgeClass(action: string): string {
  switch (action) {
    case 'create':
      return 'bg-green-100 text-green-700 hover:bg-green-100';
    case 'update':
      return 'bg-primary/10 text-primary hover:bg-primary/10';
    case 'deactivate':
      return 'bg-muted text-muted-foreground hover:bg-muted';
    default:
      return 'bg-muted text-muted-foreground hover:bg-muted';
  }
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return ts;
  }
}

export function AuditLogPanel() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [entityTypeFilter, setEntityTypeFilter] = useState('all');

  const fetchLog = (entityType?: string) => {
    setLoading(true);
    const filter = entityType && entityType !== 'all' ? entityType : undefined;
    adminApi
      .getAuditLog(filter, 50)
      .then((res) => setEntries(res.items))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchLog(); }, []);

  const handleFilterChange = (value: string) => {
    setEntityTypeFilter(value);
    fetchLog(value);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Audit Log</h2>
        <Select value={entityTypeFilter} onValueChange={handleFilterChange}>
          <SelectTrigger className="w-[200px] h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ENTITY_TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
          No audit log entries found. Changes made in the Administration module will appear here.
        </div>
      ) : (
        <div className="rounded-md border border-border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[160px]">Timestamp</TableHead>
                <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[120px]">User</TableHead>
                <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[120px]">Entity Type</TableHead>
                <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground">Entity</TableHead>
                <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[90px]">Action</TableHead>
                <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[100px]">Field</TableHead>
                <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground">Old Value</TableHead>
                <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground">New Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id} className="hover:bg-accent">
                  <TableCell className="px-3 py-2 text-xs text-muted-foreground">
                    {formatTimestamp(entry.timestamp)}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-sm text-muted-foreground">
                    {entry.user_name}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-xs text-muted-foreground">
                    {formatEntityType(entry.entity_type)}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-sm text-foreground">
                    {entry.entity_name || entry.entity_id}
                  </TableCell>
                  <TableCell className="px-3 py-2">
                    <Badge className={actionBadgeClass(entry.action)}>
                      {entry.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-3 py-2 text-xs text-muted-foreground">
                    {entry.field_changed || '—'}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-xs text-muted-foreground max-w-[120px] truncate">
                    {entry.old_value || '—'}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-xs text-muted-foreground max-w-[120px] truncate">
                    {entry.new_value || '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
