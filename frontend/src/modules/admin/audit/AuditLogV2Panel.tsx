import { useEffect, useState } from 'react';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/shared/Skeleton';
import { adminD3Api } from '@/api/endpoints';
import type { AuditCategoryRef, AuditEntryV2 } from '@/types/api';

const CATEGORY_BADGE_COLOR: Record<string, string> = {
  master_data: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  configuration: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  hierarchy: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  forecast_actions: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  pipeline_transitions: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  simulator: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  access_control: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  scheduled_change_lifecycle: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  export: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
};

function fmtTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return ts;
  }
}

const PAGE_SIZE = 50;

export function AuditLogV2Panel() {
  const [categories, setCategories] = useState<AuditCategoryRef[]>([]);
  const [entries, setEntries] = useState<AuditEntryV2[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    adminD3Api.getAuditCategories().then((res) => setCategories(res.items)).catch(() => setCategories([]));
  }, []);

  const fetchData = () => {
    setLoading(true);
    const params: Parameters<typeof adminD3Api.queryAuditLog>[0] = { limit: PAGE_SIZE, offset };
    if (categoryFilter !== 'all') params.category = [categoryFilter];
    if (entityTypeFilter.trim()) params.entity_type = entityTypeFilter.trim();
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    adminD3Api
      .queryAuditLog(params)
      .then((res) => {
        setEntries(res.items);
        setTotal(res.total);
      })
      .catch(() => { setEntries([]); setTotal(0); })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [categoryFilter, entityTypeFilter, dateFrom, dateTo, offset]);

  const buildExportUrl = (format: 'csv' | 'xlsx') => {
    const params: Parameters<typeof adminD3Api.auditExportUrl>[0] = { format };
    if (categoryFilter !== 'all') params.category = [categoryFilter];
    if (entityTypeFilter.trim()) params.entity_type = entityTypeFilter.trim();
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    return adminD3Api.auditExportUrl(params);
  };

  const downloadExport = (format: 'csv' | 'xlsx') => {
    const url = buildExportUrl(format);
    // Trigger as a navigation so the X-Current-User cookie path isn't needed —
    // the export endpoint accepts either a header or cookie via vite proxy.
    // Use anchor with download attribute.
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.download = `audit-log.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const clearFilters = () => {
    setCategoryFilter('all');
    setEntityTypeFilter('');
    setDateFrom('');
    setDateTo('');
    setOffset(0);
  };

  const hasFilters = categoryFilter !== 'all' || entityTypeFilter || dateFrom || dateTo;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-base font-semibold text-foreground">Audit Log</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Categorised audit entries across all admin actions. Indefinite retention; export at any time.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => downloadExport('csv')}>
            <FileText className="h-4 w-4 mr-1.5" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadExport('xlsx')}>
            <FileSpreadsheet className="h-4 w-4 mr-1.5" />
            Export Excel
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-card px-3 py-2">
        <div className="space-y-1">
          <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Category</label>
          <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setOffset(0); }}>
            <SelectTrigger className="w-[220px] h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Entity type</label>
          <Input
            value={entityTypeFilter}
            onChange={(e) => { setEntityTypeFilter(e.target.value); setOffset(0); }}
            placeholder="e.g. cost_center"
            className="w-[180px] h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] uppercase tracking-wide text-muted-foreground">From</label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setOffset(0); }}
            className="w-[160px] h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] uppercase tracking-wide text-muted-foreground">To</label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setOffset(0); }}
            className="w-[160px] h-8 text-sm"
          />
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground">
          {total} entries · showing {offset + 1}–{Math.min(offset + entries.length, total)}
        </span>
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : entries.length === 0 ? (
        <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
          No audit entries match the current filters.
        </div>
      ) : (
        <>
          <div className="rounded-md border border-border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[150px]">Timestamp</TableHead>
                  <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[140px]">Category</TableHead>
                  <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[120px]">User</TableHead>
                  <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[140px]">Entity Type</TableHead>
                  <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground">Entity</TableHead>
                  <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[90px]">Action</TableHead>
                  <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground">Old → New</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.id} className="hover:bg-accent">
                    <TableCell className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                      {fmtTimestamp(e.timestamp)}
                    </TableCell>
                    <TableCell className="px-3 py-2">
                      <Badge className={CATEGORY_BADGE_COLOR[e.category] ?? 'bg-muted text-muted-foreground'}>
                        {e.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-3 py-2 text-sm text-muted-foreground">
                      {e.user_name || e.user_id || '—'}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-xs text-muted-foreground">
                      {e.entity_type}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-sm text-foreground">
                      {e.entity_name || <span className="font-mono text-xs">{e.entity_id}</span>}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-xs text-muted-foreground">{e.action}</TableCell>
                    <TableCell className="px-3 py-2 text-xs text-muted-foreground max-w-[300px]">
                      {e.field_changed ? (
                        <span>
                          <span className="font-mono">{e.field_changed}:</span>{' '}
                          <span className="line-through opacity-70">{e.old_value || '∅'}</span>
                          {' → '}
                          <span className="text-foreground">{e.new_value || '∅'}</span>
                        </span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {Math.floor(offset / PAGE_SIZE) + 1} of {Math.ceil(total / PAGE_SIZE)}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}

      <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
        <Download className="h-3 w-3" />
        Exports respect the active filters.
      </p>
    </div>
  );
}
