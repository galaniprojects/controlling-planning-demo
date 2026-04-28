import { useEffect, useState } from 'react';
import {
  Calendar, CheckCircle2, XCircle, AlertCircle, Clock, Play, RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/shared/Skeleton';
import { adminD3Api } from '@/api/endpoints';
import type { ScheduledChangeItem, ApplyScheduledChangesSummary } from '@/types/api';

const STATUS_CONFIG: Record<string, { label: string; class: string; icon: React.ElementType }> = {
  pending_review: {
    label: 'Pending review',
    class: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    icon: Clock,
  },
  approved: {
    label: 'Approved',
    class: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    icon: CheckCircle2,
  },
  activated: {
    label: 'Activated',
    class: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    icon: CheckCircle2,
  },
  rejected: {
    label: 'Rejected',
    class: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    icon: XCircle,
  },
  cancelled: {
    label: 'Cancelled',
    class: 'bg-muted text-muted-foreground',
    icon: XCircle,
  },
};

function fmtDate(s: string | null): string {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return s;
  }
}

export function ScheduledChangesPanel() {
  const [items, setItems] = useState<ScheduledChangeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [reviewing, setReviewing] = useState<{ change: ScheduledChangeItem; mode: 'approve' | 'reject' } | null>(null);
  const [comments, setComments] = useState('');
  const [acting, setActing] = useState(false);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [applyResult, setApplyResult] = useState<ApplyScheduledChangesSummary | null>(null);
  const [applying, setApplying] = useState(false);

  const fetchData = () => {
    setLoading(true);
    adminD3Api
      .getScheduledChanges(statusFilter === 'all' ? undefined : statusFilter)
      .then((res) => setItems(res.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { fetchData(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [statusFilter]);

  const openReview = (change: ScheduledChangeItem, mode: 'approve' | 'reject') => {
    setReviewing({ change, mode });
    setComments('');
  };

  const handleReviewSubmit = async () => {
    if (!reviewing) return;
    if (reviewing.mode === 'reject' && !comments.trim()) {
      return;
    }
    setActing(true);
    try {
      if (reviewing.mode === 'approve') {
        await adminD3Api.approveScheduledChange(reviewing.change.id, comments.trim() || undefined);
      } else {
        await adminD3Api.rejectScheduledChange(reviewing.change.id, comments.trim());
      }
      setReviewing(null);
      fetchData();
    } catch {
      // ignore
    } finally {
      setActing(false);
    }
  };

  const handleCancel = async (change: ScheduledChangeItem) => {
    try {
      await adminD3Api.cancelScheduledChange(change.id);
      fetchData();
    } catch { /* ignore */ }
  };

  const handleApplyDue = async () => {
    setApplying(true);
    setApplyResult(null);
    try {
      const res = await adminD3Api.applyScheduledChanges();
      setApplyResult(res);
      fetchData();
    } catch {
      setApplyResult(null);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-base font-semibold text-foreground">Scheduled Changes</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Future-dated master-data and parameter changes pending review or activation.
            Second-admin review required before activation.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px] h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => { setApplyDialogOpen(true); handleApplyDue(); }}>
            <Play className="h-4 w-4 mr-1.5" />
            Apply due changes
          </Button>
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : items.length === 0 ? (
        <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
          No scheduled changes match the current filter.
        </div>
      ) : (
        <div className="rounded-md border border-border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[140px]">Status</TableHead>
                <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[150px]">Activation date</TableHead>
                <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[160px]">Entity type</TableHead>
                <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground">Description</TableHead>
                <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[120px]">Created by</TableHead>
                <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[180px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it) => {
                const cfg = STATUS_CONFIG[it.review_status] ?? STATUS_CONFIG.pending_review;
                const Icon = cfg.icon;
                return (
                  <TableRow key={it.id} className="hover:bg-accent">
                    <TableCell className="px-3 py-2">
                      <Badge className={`${cfg.class} flex items-center gap-1 w-fit`}>
                        <Icon className="h-3 w-3" />
                        {cfg.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-3 py-2 text-sm text-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                        {fmtDate(it.activation_date)}
                      </div>
                    </TableCell>
                    <TableCell className="px-3 py-2 text-xs text-muted-foreground">
                      {it.entity_type}
                      <span className="block font-mono text-[10px]">{it.entity_id}</span>
                    </TableCell>
                    <TableCell className="px-3 py-2 text-sm text-foreground">
                      <div>{it.description || <span className="text-muted-foreground italic">No description</span>}</div>
                      {Object.keys(it.pending_values || {}).length > 0 && (
                        <div className="text-[11px] text-muted-foreground mt-1 font-mono truncate max-w-[400px]">
                          {Object.entries(it.pending_values).map(([k, v]) => `${k}=${String(v)}`).join('; ')}
                        </div>
                      )}
                      {it.activation_error && (
                        <div className="text-[11px] text-red-600 mt-1 inline-flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {it.activation_error}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-xs text-muted-foreground">{it.created_by ?? '—'}</TableCell>
                    <TableCell className="px-3 py-2">
                      <div className="flex gap-1.5 flex-wrap">
                        {it.review_status === 'pending_review' && (
                          <>
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openReview(it, 'approve')}>
                              Approve
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs text-red-600" onClick={() => openReview(it, 'reject')}>
                              Reject
                            </Button>
                          </>
                        )}
                        {(it.review_status === 'pending_review' || it.review_status === 'approved') && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleCancel(it)}>
                            Cancel
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Approve / Reject dialog */}
      <Dialog open={!!reviewing} onOpenChange={() => setReviewing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewing?.mode === 'approve' ? 'Approve scheduled change' : 'Reject scheduled change'}
            </DialogTitle>
            <DialogDescription>
              {reviewing?.mode === 'approve'
                ? 'Once approved, the change will be eligible for activation on its scheduled date. Activation runs via the daily job (or "Apply due changes").'
                : 'Provide a reason for rejection. The submitter will be notified.'}
            </DialogDescription>
          </DialogHeader>
          {reviewing && (
            <div className="text-xs text-muted-foreground">
              <p>
                <strong>Entity:</strong> {reviewing.change.entity_type} / {reviewing.change.entity_id}
              </p>
              <p><strong>Activation date:</strong> {fmtDate(reviewing.change.activation_date)}</p>
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-sm text-foreground">
              Comments {reviewing?.mode === 'reject' && <span className="text-red-600">*</span>}
            </label>
            <Textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewing(null)} disabled={acting}>Cancel</Button>
            <Button
              onClick={handleReviewSubmit}
              disabled={acting || (reviewing?.mode === 'reject' && !comments.trim())}
              variant={reviewing?.mode === 'reject' ? 'destructive' : 'default'}
            >
              {acting ? 'Working…' : (reviewing?.mode === 'approve' ? 'Approve' : 'Reject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Apply due dialog */}
      <Dialog open={applyDialogOpen} onOpenChange={(o) => { if (!o) { setApplyDialogOpen(false); setApplyResult(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply due scheduled changes</DialogTitle>
            <DialogDescription>
              Manually run the activation engine. Approved changes whose activation date has passed
              are activated; their entity values are updated where the engine has a wired handler.
            </DialogDescription>
          </DialogHeader>
          {applying && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Running activation engine…
            </div>
          )}
          {applyResult && (
            <div className="space-y-2 text-sm text-foreground">
              <div className="grid grid-cols-3 gap-2 rounded-md border border-border bg-card p-3">
                <div>
                  <p className="text-xs text-muted-foreground">Applied</p>
                  <p className="text-lg font-semibold text-green-600">{applyResult.applied}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Skipped</p>
                  <p className="text-lg font-semibold text-muted-foreground">{applyResult.skipped}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Errors</p>
                  <p className={'text-lg font-semibold ' + (applyResult.errors > 0 ? 'text-red-600' : 'text-muted-foreground')}>
                    {applyResult.errors}
                  </p>
                </div>
              </div>
              {applyResult.details && applyResult.details.length > 0 && (
                <div className="text-xs text-muted-foreground space-y-0.5 max-h-48 overflow-auto">
                  {applyResult.details.map((d, i) => (
                    <div key={i} className="font-mono">
                      #{d.id} {d.entity_type}: {d.status}{d.message ? ` — ${d.message}` : ''}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => { setApplyDialogOpen(false); setApplyResult(null); }}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
        <Calendar className="h-3 w-3" />
        Demo date is 2026-04-28. The activation engine processes approved changes whose date has passed.
      </p>
    </div>
  );
}
