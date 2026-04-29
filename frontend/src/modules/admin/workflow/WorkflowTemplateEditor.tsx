import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Save, ToggleLeft, ToggleRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/shared/Skeleton';
import { adminD3Api } from '@/api/endpoints';
import type {
  WorkflowTemplateSummary,
  WorkflowTemplateDetail,
  WorkflowStepItem,
} from '@/types/api';

const ROLE_OPTIONS = [
  { value: '', label: 'Any / Not set' },
  { value: 'controller', label: 'Controller' },
  { value: 'cc_owner', label: 'CC Owner' },
  { value: 'project_lead', label: 'Project Lead' },
  { value: 'executive', label: 'Executive' },
  { value: 'system', label: 'System (automated)' },
];

const ESCALATION_OPTIONS = [
  { value: '', label: '— No escalation —' },
  { value: 'reminder', label: 'Send reminder' },
  { value: 'escalate_to_manager', label: 'Escalate to manager' },
  { value: 'auto_skip', label: 'Auto-skip step' },
  { value: 'auto_approve', label: 'Auto-approve' },
];

interface StepEditState {
  required: boolean;
  skippable: boolean;
  assigned_role: string;
  data_gates: string;
  notifications: string;
  time_constraint_days: string;
  escalation_action: string;
}

function stepToEdit(s: WorkflowStepItem): StepEditState {
  return {
    required: s.required,
    skippable: s.skippable,
    assigned_role: s.assigned_role ?? '',
    data_gates: (s.data_gates ?? []).join(', '),
    notifications: s.notifications ? JSON.stringify(s.notifications) : '',
    time_constraint_days: s.time_constraint_days != null ? String(s.time_constraint_days) : '',
    escalation_action: s.escalation_action ?? '',
  };
}

export function WorkflowTemplateEditor() {
  const [templates, setTemplates] = useState<WorkflowTemplateSummary[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<WorkflowTemplateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<Record<number, boolean>>({});
  const [edits, setEdits] = useState<Record<number, StepEditState>>({});
  const [savingStepId, setSavingStepId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const fetchTemplates = () => {
    setLoading(true);
    adminD3Api
      .getWorkflowTemplates()
      .then((res) => {
        setTemplates(res.items);
        if (!activeKey && res.items.length > 0) setActiveKey(res.items[0].key);
      })
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { fetchTemplates(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const fetchDetail = (key: string) => {
    setLoadingDetail(true);
    adminD3Api
      .getWorkflowTemplate(key)
      .then((res) => {
        setDetail(res);
        // Reset edits for fresh detail
        const e: Record<number, StepEditState> = {};
        for (const s of res.steps) e[s.id] = stepToEdit(s);
        setEdits(e);
      })
      .catch(() => setDetail(null))
      .finally(() => setLoadingDetail(false));
  };
  useEffect(() => { if (activeKey) fetchDetail(activeKey); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [activeKey]);

  const toggleExpand = (id: number) => setExpandedSteps((p) => ({ ...p, [id]: !p[id] }));

  const updateEdit = (stepId: number, patch: Partial<StepEditState>) => {
    setEdits((prev) => ({ ...prev, [stepId]: { ...prev[stepId], ...patch } }));
  };

  const stepIsDirty = (step: WorkflowStepItem): boolean => {
    const orig = stepToEdit(step);
    const cur = edits[step.id];
    if (!cur) return false;
    return JSON.stringify(orig) !== JSON.stringify(cur);
  };

  const saveStep = async (step: WorkflowStepItem) => {
    if (!detail) return;
    const e = edits[step.id];
    if (!e) return;
    setSavingStepId(step.id);
    setFeedback(null);
    try {
      const dataGates = e.data_gates.split(',').map((s) => s.trim()).filter(Boolean);
      let notifications: Record<string, string[]> | null = null;
      if (e.notifications.trim()) {
        try {
          const parsed = JSON.parse(e.notifications);
          if (parsed && typeof parsed === 'object') notifications = parsed;
        } catch {
          throw new Error('Notifications must be valid JSON object, e.g. {"on_start": ["controller"]}');
        }
      }
      await adminD3Api.updateWorkflowStep(detail.key, step.id, {
        required: e.required,
        skippable: e.skippable,
        assigned_role: e.assigned_role || null,
        data_gates: dataGates,
        notifications,
        time_constraint_days: e.time_constraint_days.trim() ? Number(e.time_constraint_days.trim()) : null,
        escalation_action: e.escalation_action || null,
      });
      setFeedback(`Saved step "${step.name}"`);
      fetchDetail(detail.key);
    } catch (err: unknown) {
      setFeedback(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingStepId(null);
    }
  };

  const toggleTemplateActive = async () => {
    if (!detail) return;
    try {
      await adminD3Api.setWorkflowTemplateActive(detail.key, !detail.is_active);
      fetchTemplates();
      fetchDetail(detail.key);
    } catch (e: unknown) {
      setFeedback(e instanceof Error ? e.message : 'Toggle failed');
    }
  };

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-foreground">Workflow Templates</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Six configurable workflows. Step sequence is fixed; touchpoints (required, role, data
          gates, notifications, time constraint, escalation) are editable per step.
        </p>
      </div>

      {/* Template tabs */}
      <div className="flex flex-wrap gap-1.5">
        {templates.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveKey(t.key)}
            className={
              'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border transition-colors ' +
              (activeKey === t.key
                ? 'bg-primary/10 text-primary border-primary'
                : 'bg-card text-muted-foreground border-border hover:bg-accent')
            }
          >
            <span>{t.name}</span>
            <Badge variant="outline" className="text-[10px] px-1 py-0">{t.step_count} steps</Badge>
            {!t.is_active && <Badge variant="outline" className="text-[10px] px-1 py-0">Inactive</Badge>}
          </button>
        ))}
      </div>

      {feedback && (
        <div className="rounded-md border border-border bg-accent px-3 py-2 text-xs text-foreground">
          {feedback}
        </div>
      )}

      {loadingDetail ? (
        <Skeleton className="h-64 w-full" />
      ) : !detail ? (
        <p className="text-sm text-muted-foreground">Select a template to view its steps.</p>
      ) : (
        <div className="space-y-3">
          {/* Template header card */}
          <div className="rounded-md border border-border bg-card px-4 py-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">{detail.name}</h3>
              {detail.description && (
                <p className="text-xs text-muted-foreground mt-0.5">{detail.description}</p>
              )}
              <p className="text-[11px] text-muted-foreground mt-1 font-mono">key: {detail.key}</p>
            </div>
            <Button variant="outline" size="sm" onClick={toggleTemplateActive}>
              {detail.is_active ? (
                <><ToggleRight className="h-4 w-4 mr-1.5 text-primary" />Active</>
              ) : (
                <><ToggleLeft className="h-4 w-4 mr-1.5" />Inactive</>
              )}
            </Button>
          </div>

          {/* Step cards */}
          <div className="space-y-2">
            {detail.steps.map((step, idx) => {
              const expanded = !!expandedSteps[step.id];
              const e = edits[step.id];
              const dirty = stepIsDirty(step);
              return (
                <div key={step.id} className="rounded-md border border-border bg-card">
                  <button
                    onClick={() => toggleExpand(step.id)}
                    className="w-full flex items-start justify-between gap-2 px-4 py-3 text-left hover:bg-accent/40 rounded-md"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold mt-0.5">
                        {idx + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-foreground">{step.name}</span>
                          <Badge variant="outline" className="text-[10px] px-1 py-0">{step.step_type}</Badge>
                          {!step.required && <Badge variant="outline" className="text-[10px] px-1 py-0">Optional</Badge>}
                          {step.skippable && <Badge variant="outline" className="text-[10px] px-1 py-0">Skippable</Badge>}
                          {dirty && <Badge className="text-[10px] px-1 py-0 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Unsaved</Badge>}
                        </div>
                        {step.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                        )}
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {step.assigned_role ?? 'Any role'}
                          {step.time_constraint_days != null && ` · ${step.time_constraint_days}d window`}
                          {step.escalation_action && ` · ${step.escalation_action}`}
                          {(step.data_gates?.length ?? 0) > 0 && ` · ${step.data_gates!.length} gate(s)`}
                          {step.notifications && Object.keys(step.notifications).length > 0 && ` · ${Object.keys(step.notifications).length} notification trigger(s)`}
                        </p>
                      </div>
                    </div>
                    {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground mt-1" /> : <ChevronRight className="h-4 w-4 text-muted-foreground mt-1" />}
                  </button>

                  {expanded && e && (
                    <div className="border-t border-border px-4 py-3 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <label className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={e.required}
                            onCheckedChange={(v) => updateEdit(step.id, { required: !!v })}
                          />
                          Required step
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={e.skippable}
                            onCheckedChange={(v) => updateEdit(step.id, { skippable: !!v })}
                          />
                          Skippable
                        </label>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-xs text-muted-foreground uppercase tracking-wide">Assigned role</label>
                          <Select value={e.assigned_role || 'any'} onValueChange={(v) => updateEdit(step.id, { assigned_role: v === 'any' ? '' : v })}>
                            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="any">Any / Not set</SelectItem>
                              {ROLE_OPTIONS.filter((r) => r.value).map((r) => (
                                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs text-muted-foreground uppercase tracking-wide">Time constraint (days)</label>
                          <Input
                            type="number"
                            value={e.time_constraint_days}
                            onChange={(ev) => updateEdit(step.id, { time_constraint_days: ev.target.value })}
                            placeholder="e.g. 7"
                            className="h-8 text-sm"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs text-muted-foreground uppercase tracking-wide">Data gates (comma-separated)</label>
                        <Input
                          value={e.data_gates}
                          onChange={(ev) => updateEdit(step.id, { data_gates: ev.target.value })}
                          placeholder="e.g. budget_set, milestones_baselined"
                          className="h-8 text-sm"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs text-muted-foreground uppercase tracking-wide">Notifications (JSON object — trigger ➜ recipients)</label>
                        <Input
                          value={e.notifications}
                          onChange={(ev) => updateEdit(step.id, { notifications: ev.target.value })}
                          placeholder='e.g. {"on_start": ["all_pls"], "on_overdue": ["controller"]}'
                          className="h-8 text-sm font-mono"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs text-muted-foreground uppercase tracking-wide">Escalation action</label>
                        <Select value={e.escalation_action || 'none'} onValueChange={(v) => updateEdit(step.id, { escalation_action: v === 'none' ? '' : v })}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">— No escalation —</SelectItem>
                            {ESCALATION_OPTIONS.filter((o) => o.value).map((o) => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {step.actions && step.actions.length > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Step actions</p>
                          <div className="flex flex-wrap gap-1">
                            {step.actions.map((a) => (
                              <Badge key={a.id} variant="outline" className="text-[10px]">{a.label}</Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex justify-end pt-1">
                        <Button
                          size="sm"
                          onClick={() => saveStep(step)}
                          disabled={!dirty || savingStepId === step.id}
                        >
                          <Save className="h-4 w-4 mr-1.5" />
                          {savingStepId === step.id ? 'Saving…' : 'Save step'}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
