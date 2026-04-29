/**
 * ManualSnapshotDialog — controller-only "Take snapshot now" action per
 * `[C-FV-03]`. POSTs to `/api/projects/{id}/forecast/versions` with an
 * optional human-readable label which is stored in `cycle_label`.
 *
 * Cluster C / Session C2.
 */
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { workbenchApi } from '@/api/endpoints';
import { Camera } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** Called after a successful snapshot so the parent can reload versions. */
  onSnapshotCreated: () => void;
}

export function ManualSnapshotDialog({
  open,
  onOpenChange,
  projectId,
  onSnapshotCreated,
}: Props) {
  const [label, setLabel] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setLabel('');
    setError(null);
    setSubmitting(false);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await workbenchApi.createForecastVersion(projectId, label.trim() || undefined);
      onSnapshotCreated();
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Snapshot failed');
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-primary" />
            Take forecast snapshot
          </DialogTitle>
          <DialogDescription>
            Capture the current forecast as a new immutable version. Useful for
            recording an off-cycle baseline (e.g. after a major reorg). The
            snapshot is permanent and cannot be deleted per `[C-FV-07]`.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            Label <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Pre-quarter freeze, Mid-cycle review"
            maxLength={120}
            disabled={submitting}
          />
          <p className="text-xs text-muted-foreground">
            Stored in <code className="font-tabular">cycle_label</code>. Leave blank for an
            unlabelled manual snapshot.
          </p>
        </div>
        {error && (
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Creating…' : 'Create snapshot'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
