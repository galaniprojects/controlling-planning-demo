/**
 * v5 B2 [B-SL-02] — Rebase confirmation modal.
 *
 * F10 (per-project anchors): a scenario touches N projects, each anchored to
 * its own forecast cycle version. The rebase modal fetches the candidate cycle
 * versions per touched project and lets the user re-anchor each project via a
 * labeled Select, then submits a project_id -> version_id map. Stale projects
 * (anchor no longer the latest cycle) are highlighted.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';
import { scenariosApi } from '../api/scenariosApi';
import type { RebaseProjectOption } from '@/types/api';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scenarioId: number | null;
  scenarioName: string;
  /** Submit the chosen anchors: project_id -> forecast version id. */
  onConfirm: (anchors: Record<string, number>) => Promise<void>;
}

function formatTimestamp(iso: string): string {
  // Python datetime strings may lack a trailing Z; treat as UTC when so.
  const d = new Date(iso.endsWith('Z') || iso.includes('T') ? iso : iso.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function defaultSelection(p: RebaseProjectOption): string | null {
  // Default to the project's latest candidate; fall back to the current anchor.
  if (p.candidates.length > 0) return String(p.candidates[0].id);
  if (p.current_anchor) return String(p.current_anchor.id);
  return null;
}

export function RebaseModal({
  open,
  onOpenChange,
  scenarioId,
  scenarioName,
  onConfirm,
}: Props) {
  const [projects, setProjects] = useState<RebaseProjectOption[]>([]);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || scenarioId == null) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    scenariosApi
      .getRebaseOptions(scenarioId)
      .then((res) => {
        if (cancelled) return;
        setProjects(res.projects);
        const initial: Record<string, string> = {};
        for (const p of res.projects) {
          const sel = defaultSelection(p);
          if (sel != null) initial[p.project_id] = sel;
        }
        setSelections(initial);
      })
      .catch((e) => {
        if (cancelled) return;
        setProjects([]);
        setSelections({});
        setError(e instanceof Error ? e.message : 'Failed to load rebase options');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, scenarioId]);

  const handleSelect = useCallback((projectId: string, value: string) => {
    setSelections((prev) => ({ ...prev, [projectId]: value }));
  }, []);

  const rebaseableProjects = projects.filter((p) => p.candidates.length > 0);
  const staleCount = rebaseableProjects.filter((p) => p.is_stale).length;

  const handleConfirm = async () => {
    const anchors: Record<string, number> = {};
    for (const p of rebaseableProjects) {
      const sel = selections[p.project_id];
      if (sel != null) {
        const id = Number.parseInt(sel, 10);
        if (Number.isFinite(id) && id > 0) anchors[p.project_id] = id;
      }
    }
    if (Object.keys(anchors).length === 0) {
      setError('No projects available to rebase');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onConfirm(anchors);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rebase failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Rebase Scenario</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-foreground">
            Re-anchor <span className="font-medium">{scenarioName}</span> to
            newer forecast cycles. Each project is anchored independently; all
            diffs are carried forward unchanged and you'll resolve any conflicts
            in the workspace afterwards.
          </p>

          {staleCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {staleCount} of {rebaseableProjects.length} project
              {rebaseableProjects.length === 1 ? '' : 's'} anchored to a stale
              cycle.
            </p>
          )}

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading projects…</p>
          ) : rebaseableProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No projects with newer cycles available to rebase.
            </p>
          ) : (
            <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
              {rebaseableProjects.map((p) => (
                <div
                  key={p.project_id}
                  className="rounded-md border border-border bg-card p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground truncate">
                      {p.project_name}
                    </span>
                    {p.is_stale ? (
                      <Badge
                        variant="outline"
                        className="bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700/50 flex-shrink-0"
                      >
                        Stale
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700/50 flex-shrink-0"
                      >
                        Current
                      </Badge>
                    )}
                  </div>
                  <Select
                    value={selections[p.project_id] ?? undefined}
                    onValueChange={(v) => handleSelect(p.project_id, v)}
                  >
                    <SelectTrigger className="w-full h-8 text-sm">
                      <SelectValue placeholder="Select a cycle version" />
                    </SelectTrigger>
                    <SelectContent>
                      {p.candidates.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          <span className="flex items-center gap-2">
                            <span className="font-tabular font-medium">
                              v{c.version_number}
                            </span>
                            {c.cycle_label && (
                              <span className="text-muted-foreground">
                                — {c.cycle_label}
                              </span>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {formatTimestamp(c.created_at)}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {p.current_anchor && (
                    <p className="text-xs text-muted-foreground">
                      Current anchor:{' '}
                      <span className="font-tabular">
                        v{p.current_anchor.version_number}
                        {p.current_anchor.cycle_label
                          ? ` — ${p.current_anchor.cycle_label}`
                          : ''}
                      </span>
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <p>
              This action records a rebase event. The anchor change is
              permanent until the next rebase.
            </p>
          </div>
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={submitting || loading || rebaseableProjects.length === 0}
          >
            {submitting ? 'Rebasing...' : 'Rebase'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
