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
      return 'bg-blue-100 text-blue-700 hover:bg-blue-100';
    case 'deactivate':
      return 'bg-slate-100 text-slate-600 hover:bg-slate-100';
    default:
      return 'bg-slate-100 text-slate-500 hover:bg-slate-100';
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
        <h2 className="text-base font-semibold text-slate-800">Audit Log</h2>
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
        <div className="rounded-md border border-slate-200 p-8 text-center text-sm text-slate-400">
          No audit log entries found. Changes made in the Administration module will appear here.
        </div>
      ) : (
        <div className="rounded-md border border-slate-200 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-3 py-2 text-xs font-medium text-slate-500 w-[160px]">Timestamp</TableHead>
                <TableHead className="px-3 py-2 text-xs font-medium text-slate-500 w-[120px]">User</TableHead>
                <TableHead className="px-3 py-2 text-xs font-medium text-slate-500 w-[120px]">Entity Type</TableHead>
                <TableHead className="px-3 py-2 text-xs font-medium text-slate-500">Entity</TableHead>
                <TableHead className="px-3 py-2 text-xs font-medium text-slate-500 w-[90px]">Action</TableHead>
                <TableHead className="px-3 py-2 text-xs font-medium text-slate-500 w-[100px]">Field</TableHead>
                <TableHead className="px-3 py-2 text-xs font-medium text-slate-500">Old Value</TableHead>
                <TableHead className="px-3 py-2 text-xs font-medium text-slate-500">New Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id} className="hover:bg-slate-50">
                  <TableCell className="px-3 py-2 text-xs text-slate-500">
                    {formatTimestamp(entry.timestamp)}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-sm text-slate-600">
                    {entry.user_name}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-xs text-slate-600">
                    {formatEntityType(entry.entity_type)}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-sm text-slate-800">
                    {entry.entity_name || entry.entity_id}
                  </TableCell>
                  <TableCell className="px-3 py-2">
                    <Badge className={actionBadgeClass(entry.action)}>
                      {entry.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-3 py-2 text-xs text-slate-500">
                    {entry.field_changed || '—'}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-xs text-slate-500 max-w-[120px] truncate">
                    {entry.old_value || '—'}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-xs text-slate-500 max-w-[120px] truncate">
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
