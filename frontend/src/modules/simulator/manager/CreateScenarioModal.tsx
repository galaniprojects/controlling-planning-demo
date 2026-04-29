/**
 * v5 B2 — Create Scenario modal.
 *
 * v5 additions over v4:
 *  - Optional comma-separated tags (server stores as JSON list).
 *  - Backend defaults the anchor to the latest cycle when omitted —
 *    no explicit picker needed for the demo.
 *  - CC-Owner scope is applied server-side from the user's managed
 *    cost centre.
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import type { ScenarioListItem } from '@/types/api';
import { scenariosApi } from '../api/scenariosApi';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cloneCandidates: ScenarioListItem[];
  onCreated: (id: number) => void;
}

export function CreateScenarioModal({
  open,
  onOpenChange,
  cloneCandidates,
  onCreated,
}: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [cloneFrom, setCloneFrom] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setName('');
    setDescription('');
    setTagsText('');
    setCloneFrom('');
    setError('');
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const tags = tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const result = await scenariosApi.create({
        name: name.trim(),
        description: description.trim() || undefined,
        clone_from: cloneFrom ? Number(cloneFrom) : undefined,
        tags: tags.length > 0 ? tags : undefined,
      });
      reset();
      onOpenChange(false);
      onCreated(result.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create scenario');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-[460px]">
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
              Tags (comma-separated)
            </label>
            <Input
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="e.g., budget, q3-review"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">
              Clone From (optional)
            </label>
            <Select
              value={cloneFrom || 'none'}
              onValueChange={(v) => setCloneFrom(v === 'none' ? '' : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Start from scratch" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Start from scratch</SelectItem>
                {cloneCandidates.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            Anchor is set automatically to the latest forecast cycle. You can
            rebase later from the manager.
          </p>
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
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
