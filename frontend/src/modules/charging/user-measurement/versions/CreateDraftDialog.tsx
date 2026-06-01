/**
 * Three-origin UM draft-creation modal per FD-2 / [F-UM-03].
 *
 * Mirrors `distribution/versions/CreateVersionDialog.tsx`:
 * - **Blank** — empty draft for (year, quarter).
 * - **Copy from active** — pre-fill from the currently active version for
 *   the chosen (year, quarter). 409 if no active version exists.
 * - **Copy from a prior version** — pick any historical version
 *   (year/quarter inherited from the source).
 *
 * On submit, returns the newly-created draft so the caller can navigate
 * straight into the matrix editor.
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
import { Card } from '@/components/ui/card';
import { AlertCircle, Copy, FileText, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import { userMeasurementApi } from '@/api/userMeasurement';
import type {
  UMVersionCreateOrigin,
  UMVersionDetailResponse,
  UMVersionSummary,
} from '@/types/userMeasurement';

interface OriginChoice {
  value: UMVersionCreateOrigin;
  label: string;
  description: string;
  icon: typeof FileText;
}

const ORIGIN_CHOICES: OriginChoice[] = [
  {
    value: 'copy_active',
    label: 'Copy from active',
    description:
      'Pre-fill from the current active version for the selected period. Most common — adjust a few cells, then activate.',
    icon: Copy,
  },
  {
    value: 'copy_prior',
    label: 'Copy from a prior version',
    description:
      'Pre-fill from any historical version. Use when reverting to an earlier shape.',
    icon: History,
  },
  {
    value: 'blank',
    label: 'Blank draft',
    description:
      'Empty draft, no cells. For a clean-room re-author of the (year, quarter) matrix.',
    icon: FileText,
  },
];

export interface CreateDraftDialogProps {
  open: boolean;
  onClose: () => void;
  /** All known UM versions for the copy_prior picker. */
  versions: UMVersionSummary[];
  defaultYear: number;
  defaultQuarter: number;
  onCreated: (detail: UMVersionDetailResponse) => void;
}

export function CreateDraftDialog({
  open,
  onClose,
  versions,
  defaultYear,
  defaultQuarter,
  onCreated,
}: CreateDraftDialogProps) {
  const [origin, setOrigin] = useState<UMVersionCreateOrigin>('copy_active');
  const [year, setYear] = useState<number>(defaultYear);
  const [quarter, setQuarter] = useState<number>(defaultQuarter);
  const [sourceVersionId, setSourceVersionId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setOrigin('copy_active');
      setYear(defaultYear);
      setQuarter(defaultQuarter);
      setSourceVersionId(null);
      setSubmitting(false);
      setError(null);
    }
  }, [open, defaultYear, defaultQuarter]);

  const priorCandidates = useMemo(() => {
    // Most recent first; active versions surface activated_at.
    return [...versions].sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      if (a.quarter !== b.quarter) return b.quarter - a.quarter;
      return b.id - a.id;
    });
  }, [versions]);

  const yearOptions = useMemo(
    () => Array.from({ length: 5 }, (_, i) => defaultYear - 1 + i),
    [defaultYear],
  );

  const handleSubmit = async () => {
    if (origin === 'copy_prior' && sourceVersionId === null) {
      setError('Pick a version to copy from.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const detail = await userMeasurementApi.createVersion({
        origin,
        year: origin === 'copy_prior' ? undefined : year,
        quarter: origin === 'copy_prior' ? undefined : quarter,
        source_version_id: origin === 'copy_prior' ? sourceVersionId : null,
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
          <DialogTitle>Create User Measurement draft</DialogTitle>
          <DialogDescription>
            UM is integer-valued and authored in VIPER per{' '}
            <span className="font-mono">[F-UM-01] [F-DIR-01]</span>. Create a
            draft, edit cells in-grid (or import a CSV), then activate to
            freeze the version per{' '}
            <span className="font-mono">[F-UM-02]</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Origin picker */}
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

          {/* Period selector — blank / copy_active */}
          {origin !== 'copy_prior' && (
            <div className="flex gap-3">
              <div className="space-y-1.5 flex-1">
                <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Year
                </label>
                <Select
                  value={String(year)}
                  onValueChange={(v) => setYear(Number(v))}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {yearOptions.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 flex-1">
                <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Quarter
                </label>
                <Select
                  value={String(quarter)}
                  onValueChange={(v) => setQuarter(Number(v))}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4].map((q) => (
                      <SelectItem key={q} value={String(q)}>
                        Q{q}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Copy-prior version picker */}
          {origin === 'copy_prior' && (
            <div className="space-y-1.5">
              <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Version to copy from
              </label>
              <Select
                value={sourceVersionId === null ? '' : String(sourceVersionId)}
                onValueChange={(v) => setSourceVersionId(Number(v))}
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
                        v{v.id} · {v.year}-Q{v.quarter} ·{' '}
                        {v.status === 'active' ? 'Active' : 'Draft'} ·{' '}
                        {v.cell_count} cell
                        {v.cell_count !== 1 ? 's' : ''}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* copy_active no-active-here hint (client-side; backend still authoritative) */}
          {origin === 'copy_active' && (
            <Card className="bg-accent/40 dark:bg-accent/20 p-3 border-border">
              <p className="text-[11px] text-muted-foreground">
                Cells will be copied from the active version for{' '}
                <span className="font-medium text-foreground">
                  {year}-Q{quarter}
                </span>{' '}
                — if there is no active version for that period the request
                returns 409.
              </p>
            </Card>
          )}

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
              (origin === 'copy_prior' && sourceVersionId === null)
            }
          >
            {submitting ? 'Creating…' : 'Create draft'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

