/**
 * SubmitProjectDialog — v5 lightweight intake dialog [A-BK-26] [A-DOI-04].
 *
 * Calls POST /api/intake/projects which lands the new project at DoI 0
 * (Proposed) and inserts it into the bottom of the ranked backlog.
 *
 * v4 routed callers to /workbench/new-project/{id} for the resource-plan
 * wizard; v5 routes to /backlog/{id} so the PL can iteratively complete the
 * Tech Navigator + master-data fields needed to advance through DoI gates.
 */

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
import { intakeProjectApi, referenceApi } from '@/api/endpoints';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type ProjectType = 1 | 2 | 3;
type CapexOpex = 'capex' | 'opex';

const PROJECT_TYPE_OPTIONS: { value: ProjectType; label: string }[] = [
  { value: 1, label: 'P1 — Business case' },
  { value: 2, label: 'P2 — Strategic' },
  { value: 3, label: 'P3 — Compliance / lifecycle (off-cutoff)' },
];

export function SubmitProjectDialog({ open, onOpenChange, onSuccess }: Props) {
  const navigate = useNavigate();
  const [lobs, setLobs] = useState<{ id: string; name: string }[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [lobId, setLobId] = useState('');
  const [startMonth, setStartMonth] = useState('2026-04');
  const [endMonth, setEndMonth] = useState('2027-03');
  const [projectType, setProjectType] = useState<ProjectType>(1);
  const [capexOpex, setCapexOpex] = useState<CapexOpex>('capex');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setProjectType(1);
    setCapexOpex('capex');
    setError(null);
  }

  async function handleSubmit() {
    if (!name.trim() || !lobId || !description.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await intakeProjectApi.create({
        name: name.trim(),
        description: description.trim(),
        lob_id: lobId,
        project_type: projectType,
        capex_opex: capexOpex,
        start_month: startMonth,
        end_month: endMonth || null,
      });
      onSuccess?.();
      resetForm();
      onOpenChange(false);
      // v5: go straight to the backlog detail so the PL can fill scoring fields.
      navigate(`/backlog/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create project');
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

  const isValid =
    name.trim().length > 0 &&
    description.trim().length > 0 &&
    lobId.length > 0 &&
    startMonth.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Project — DoI 0 (Evaluate)</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1">
          New projects land at DoI 0 (Proposed) and appear at the bottom of the
          backlog. Tech Navigator scores, budget, and gates are completed
          iteratively after creation.
        </p>
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
            <label className="text-sm font-medium text-foreground">
              Problem statement / Business driver / Expected outcome
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Briefly describe the problem, business driver, and expected outcome"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
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
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Project Type</label>
              <Select
                value={String(projectType)}
                onValueChange={(v) => setProjectType(Number(v) as ProjectType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={String(opt.value)}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">CapEx / OpEx</label>
              <Select
                value={capexOpex}
                onValueChange={(v) => setCapexOpex(v as CapexOpex)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="capex">CapEx</SelectItem>
                  <SelectItem value="opex">OpEx</SelectItem>
                </SelectContent>
              </Select>
            </div>
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

          {error ? (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : null}

          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleSubmit}
              disabled={!isValid || submitting}
              className="flex-1"
            >
              {submitting ? 'Creating…' : 'Add to Backlog'}
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
