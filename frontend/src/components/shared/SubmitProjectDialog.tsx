import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { launchpadApi, referenceApi } from '@/api/endpoints';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function SubmitProjectDialog({ open, onOpenChange, onSuccess }: Props) {
  const navigate = useNavigate();
  const [lobs, setLobs] = useState<{ id: string; name: string }[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [lobId, setLobId] = useState('');
  const [startMonth, setStartMonth] = useState('2026-04');
  const [endMonth, setEndMonth] = useState('2027-03');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      referenceApi.getLobs().then((res) => setLobs(res.items));
    }
  }, [open]);

  function resetForm() {
    setName('');
    setDescription('');
    setLobId('');
    setStartMonth('2026-04');
    setEndMonth('2027-03');
  }

  async function handleSubmit() {
    if (!name.trim() || !lobId) return;
    setSubmitting(true);
    try {
      const created = await launchpadApi.createProject({
        name: name.trim(),
        description: description.trim() || undefined,
        lob_id: lobId,
        start_month: startMonth,
        end_month: endMonth || undefined,
      });
      onSuccess?.();
      resetForm();
      onOpenChange(false);
      navigate(`/workbench/new-project/${created.id}`);
    } catch {
      // Error handling — keep dialog open
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose(openState: boolean) {
    if (!openState) {
      resetForm();
    }
    onOpenChange(openState);
  }

  const isValid = name.trim().length > 0 && lobId.length > 0 && startMonth.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Project Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter project name"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Description</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief project description"
              rows={2}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Line of Business</label>
            <Select value={lobId} onValueChange={setLobId}>
              <SelectTrigger>
                <SelectValue placeholder="Select LoB" />
              </SelectTrigger>
              <SelectContent>
                {lobs.map((lob) => (
                  <SelectItem key={lob.id} value={lob.id}>
                    {lob.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Start Month</label>
              <Input
                type="month"
                value={startMonth}
                onChange={(e) => setStartMonth(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">End Month</label>
              <Input
                type="month"
                value={endMonth}
                onChange={(e) => setEndMonth(e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleSubmit}
              disabled={!isValid || submitting}
              className="flex-1"
            >
              {submitting ? 'Saving...' : 'Next: Resource Plan'}
            </Button>
            <Button
              variant="outline"
              onClick={() => handleClose(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
