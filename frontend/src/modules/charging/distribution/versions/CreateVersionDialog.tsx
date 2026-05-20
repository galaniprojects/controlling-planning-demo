/**
 * Version-creation modal per FD-3 [F-S1-04]. Three origins:
 *
 * - **Blank** — empty draft, no edges. Use for a clean-room rework or
 *   when starting Stage 1 for a new entity portfolio.
 * - **Copy from active** — pre-fill from the version the resolver
 *   currently picks (latest active production version with
 *   `active_from ≤ today`). Expected common path per spec: the owner
 *   adjusts the few edges that changed.
 * - **Copy from prior** — pre-fill from any selected historical version.
 *
 * The draft's rationale is optional here (the user may type it during
 * editing), but activation later will require a non-empty value.
 *
 * On submit, returns the newly-created version (header + edges) so the
 * caller can navigate straight into the editor against the new draft.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { AlertCircle, Copy, FileText, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import { chargingApi } from '@/api/endpoints';
import type {
  DistributionVersionCreateOrigin,
  DistributionVersionDetailResponse,
  DistributionVersionResponse,
} from '@/types/api';
import { formatVersionDate, originLabel } from './versionLabels';

export interface CreateVersionDialogProps {
  open: boolean;
  onClose: () => void;
  /** Production versions (excludes scenario-scoped). Used for copy-prior picker. */
  versions: DistributionVersionResponse[];
  /** In-force production version id (resolver pick). Highlighted in copy-prior. */
  inForceVersionId: number | null;
  /** Called with the new draft on success. */
  onCreated: (detail: DistributionVersionDetailResponse) => void;
}

interface OriginChoice {
  value: DistributionVersionCreateOrigin;
  label: string;
  description: string;
  icon: typeof FileText;
}

const ORIGIN_CHOICES: OriginChoice[] = [
  {
    value: 'copy_active',
    label: 'Copy from active',
    description:
      'Pre-fill from the version currently in force. Most common — adjust a few edges and schedule.',
    icon: Copy,
  },
  {
    value: 'copy_prior',
    label: 'Copy from prior version',
    description:
      'Pre-fill from any past version. Use when reverting to an earlier shape.',
    icon: History,
  },
  {
    value: 'blank',
    label: 'Blank draft',
    description: 'Empty draft, no edges. For clean-room reworks.',
    icon: FileText,
  },
];

export function CreateVersionDialog({
  open,
  onClose,
  versions,
  inForceVersionId,
  onCreated,
}: CreateVersionDialogProps) {
  const [origin, setOrigin] = useState<DistributionVersionCreateOrigin>('copy_active');
  const [copiedFromId, setCopiedFromId] = useState<number | null>(null);
  const [rationale, setRationale] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setOrigin('copy_active');
      setCopiedFromId(null);
      setRationale('');
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  // Auto-clear `copied_from_version_id` when origin changes away from copy_prior
  useEffect(() => {
    if (origin !== 'copy_prior') setCopiedFromId(null);
  }, [origin]);

  const priorCandidates = useMemo(() => {
    // Only production versions can be copy sources (scenario versions already filtered server-side).
    // Drafts may be copied too — a controller might want to fork an unsaved draft branch.
    return [...versions].sort((x, y) => {
      // Active versions first (by active_from desc), then drafts (by id desc)
      if (x.status !== y.status) return x.status === 'active' ? -1 : 1;
      if (x.status === 'active') {
        return (y.active_from ?? '').localeCompare(x.active_from ?? '');
      }
      return y.id - x.id;
    });
  }, [versions]);

  const handleSubmit = async () => {
    if (origin === 'copy_prior' && copiedFromId === null) {
      setError('Pick a version to copy from.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const detail = await chargingApi.createDistributionVersion({
        origin,
        copied_from_version_id: origin === 'copy_prior' ? copiedFromId : null,
        rationale: rationale.trim() || null,
      });
      onCreated(detail);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Create failed';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !submitting && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Create distribution version</DialogTitle>
          <DialogDescription>
            Stage 1 versions are effective-dated. Create a draft now, edit
            its edges, then activate when ready by setting an{' '}
            <span className="font-medium">active_from</span> date. Per{' '}
            <span className="font-mono">[F-S1-04]</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Origin picker — three sanctioned origins */}
          <fieldset className="space-y-2">
            <legend className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
              Origin
            </legend>
            <div className="grid grid-cols-1 gap-2">
              {ORIGIN_CHOICES.map((choice) => {
                const isSelected = origin === choice.value;
                const Icon = choice.icon;
                return (
                  <label
                    key={choice.value}
                    className={cn(
                      'flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors',
                      isSelected
                        ? 'border-primary bg-primary/5 dark:bg-primary/10'
                        : 'border-border hover:bg-accent',
                    )}
                  >
                    <input
                      type="radio"
                      name="origin"
                      value={choice.value}
                      checked={isSelected}
                      onChange={() => setOrigin(choice.value)}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm font-medium text-foreground">
                          {choice.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                        {choice.description}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {/* Copy-prior version picker */}
          {origin === 'copy_prior' && (
            <div className="space-y-1.5">
              <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Version to copy from
              </label>
              <Select
                value={copiedFromId === null ? '' : String(copiedFromId)}
                onValueChange={(v) => setCopiedFromId(Number(v))}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Pick a prior version…" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {priorCandidates.length === 0 ? (
                    <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                      No prior versions available.
                    </div>
                  ) : (
                    priorCandidates.map((v) => (
                      <SelectItem key={v.id} value={String(v.id)}>
                        <div className="flex items-center gap-2">
                          <span className="text-sm">
                            v{v.id} ·{' '}
                            {v.status === 'active'
                              ? `Active from ${formatVersionDate(v.active_from)}`
                              : v.active_from
                                ? `Draft scheduled ${formatVersionDate(v.active_from)}`
                                : 'Draft (unscheduled)'}
                          </span>
                          {v.id === inForceVersionId && (
                            <span className="text-[10px] text-primary">
                              · in force
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground">
                            · {originLabel(v.origin)}
                          </span>
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Copy-active preview hint */}
          {origin === 'copy_active' && inForceVersionId !== null && (
            <Card className="bg-accent/40 dark:bg-accent/20 p-3 border-border">
              <p className="text-[11px] text-muted-foreground">
                Edges will be copied from{' '}
                <span className="font-medium text-foreground">
                  v{inForceVersionId}
                </span>{' '}
                — the version currently in force.
              </p>
            </Card>
          )}
          {origin === 'copy_active' && inForceVersionId === null && (
            <Card className="border-amber-500/60 bg-amber-50 dark:bg-amber-900/20 p-3">
              <p className="text-[11px] text-amber-800 dark:text-amber-300">
                No active production version yet. "Copy from active" requires a
                resolved in-force version; switch to "Blank" or "Copy from prior".
              </p>
            </Card>
          )}

          {/* Rationale (optional at draft creation; required to activate later) */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Rationale{' '}
              <span className="font-normal normal-case text-muted-foreground/80">
                (optional now — required to activate)
              </span>
            </label>
            <Textarea
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="e.g. Infrastructure split re-agreed for 2026 following the H2 capacity review."
              rows={3}
              maxLength={4000}
              className="text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              First-class on every version per{' '}
              <span className="font-mono">[F-S1-05]</span>. Captures the “why”
              for audit and future reviewers.
            </p>
          </div>

          {error && (
            <Card className="border-red-500 bg-red-50 dark:bg-red-900/20 p-3 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
            </Card>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              submitting ||
              (origin === 'copy_prior' && copiedFromId === null) ||
              (origin === 'copy_active' && inForceVersionId === null)
            }
          >
            {submitting ? 'Creating…' : 'Create draft'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
