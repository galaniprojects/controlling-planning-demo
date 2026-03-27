import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { scenariosApi } from '@/api/endpoints';
import type { ScenarioListItem } from '@/types/api';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scenarios: ScenarioListItem[];
  onCreated: (id: number) => void;
}

export function CreateScenarioModal({
  open,
  onOpenChange,
  scenarios,
  onCreated,
}: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [cloneFrom, setCloneFrom] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await scenariosApi.create({
        name: name.trim(),
        description: description.trim() || undefined,
        clone_from: cloneFrom ? Number(cloneFrom) : undefined,
      });
      setName('');
      setDescription('');
      setCloneFrom('');
      onOpenChange(false);
      onCreated(result.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create scenario');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create New Scenario</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">
              Name *
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., FY2026 Budget Pressure"
              autoFocus
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">
              Description
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the scenario objectives..."
              rows={3}
              className="resize-none"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">
              Clone From (optional)
            </label>
            <Select value={cloneFrom} onValueChange={setCloneFrom}>
              <SelectTrigger>
                <SelectValue placeholder="Start from scratch" />
              </SelectTrigger>
              <SelectContent>
                {scenarios.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || submitting}
          >
            {submitting ? 'Creating...' : 'Create Scenario'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
