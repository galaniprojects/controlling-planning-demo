/**
 * v5 B2 — Shared catalogue ActionForm.
 *
 * Renders any `ActionDefinition` (see `catalogueDef.ts`) into a parameter
 * editor + project picker (when scope === 'project') + Apply button.
 * Submission goes through `useScenarioContext().applyAction`, which posts
 * to `POST /api/scenarios/:id/actions` and then refreshes detail + marks
 * the impact dashboard stale.
 *
 * Reference data (roles / locations / cost centres / cost types /
 * hierarchy nodes) is fetched lazily on first mount when at least one
 * field needs it. Reuses the existing `referenceApi` and
 * `adminApi.getActiveHierarchy()` endpoints.
 *
 * Submission sets `lever_category` + `tier` from the action definition,
 * which drives Promote routing (`services/scenario_promote.py`) and
 * Tier-3 redaction.
 */

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { adminApi, referenceApi } from '@/api/endpoints';
import { useScenarioContext } from '../useScenarioContext';
import type {
  ActionDefinition,
  CatalogueActionSubmission,
  FieldDefinition,
  FieldOption,
  ReferenceSource,
} from './types';

interface Props {
  action: ActionDefinition;
  onCancel?: () => void;
  /** Called after a successful submit. */
  onApplied?: () => void;
  /**
   * Optional pre-selected project id for project-scope actions. Overrides
   * the in-form project picker; useful when the catalogue is opened from
   * a project context (e.g. project tile in the sidebar).
   */
  presetProjectId?: string;
}

interface RefBundle {
  roles: FieldOption[];
  cost_centers: FieldOption[];
  locations: FieldOption[];
  cost_types: FieldOption[];
  hierarchy_nodes: FieldOption[];
  rate_tables: FieldOption[];
  project_types: FieldOption[];
  transformation_levels: FieldOption[];
}

const STATIC_OPTIONS: Partial<Record<ReferenceSource, FieldOption[]>> = {
  rate_tables: [
    { value: 'internal', label: 'Internal rates' },
    { value: 'external', label: 'External rates' },
  ],
  project_types: [
    { value: '1', label: 'Type 1 — Mandatory / regulatory' },
    { value: '2', label: 'Type 2 — Discretionary change' },
    { value: '3', label: 'Type 3 — Strategic transformation' },
  ],
  transformation_levels: [
    { value: 'T0', label: 'T0 — Run-the-business' },
    { value: 'T1', label: 'T1 — Optimise' },
    { value: 'T2', label: 'T2 — Transform' },
  ],
};

const EMPTY_BUNDLE: RefBundle = {
  roles: [],
  cost_centers: [],
  locations: [],
  cost_types: [],
  hierarchy_nodes: [],
  rate_tables: STATIC_OPTIONS.rate_tables ?? [],
  project_types: STATIC_OPTIONS.project_types ?? [],
  transformation_levels: STATIC_OPTIONS.transformation_levels ?? [],
};

export function ActionForm({
  action,
  onCancel,
  onApplied,
  presetProjectId,
}: Props) {
  const { applyAction, detail } = useScenarioContext();
  const [refs, setRefs] = useState<RefBundle>(EMPTY_BUNDLE);
  const [refLoaded, setRefLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string>(presetProjectId ?? '');
  const [params, setParams] = useState<Record<string, string>>(() =>
    seedDefaults(action.fields),
  );

  // Reset when the action changes.
  useEffect(() => {
    setParams(seedDefaults(action.fields));
    setProjectId(presetProjectId ?? '');
    setSubmitError(null);
  }, [action.id, action.fields, presetProjectId]);

  // Lazy reference-data fetch on first relevant field.
  useEffect(() => {
    if (refLoaded) return;
    const sources = collectSources(action);
    if (sources.size === 0) {
      setRefLoaded(true);
      return;
    }
    let cancelled = false;
    void loadReferences(sources).then((bundle) => {
      if (!cancelled) {
        setRefs((prev) => ({ ...prev, ...bundle }));
        setRefLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [action, refLoaded]);

  const projectOptions = useMemo<FieldOption[]>(() => {
    if (!action.requiresProject) return [];
    const states = detail?.project_states ?? [];
    return states.map((p) => ({
      value: p.project_id,
      label: p.project_name,
    }));
  }, [action.requiresProject, detail]);

  const visibleFields = useMemo(
    () => action.fields.filter((f) => isFieldVisible(f, params)),
    [action.fields, params],
  );

  const canSubmit = useMemo(() => {
    if (action.requiresProject && !projectId) return false;
    for (const f of visibleFields) {
      if (!f.required) continue;
      const v = params[f.key];
      if (v === undefined || v === null || v === '') return false;
    }
    return !submitting;
  }, [action.requiresProject, projectId, visibleFields, params, submitting]);

  const handleSubmit = async () => {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const submission = buildSubmission(action, params, projectId);
      const result = await applyAction(submission);
      if (result === null) {
        setSubmitError('Apply failed — see scenario error banner.');
        return;
      }
      // Reset form after success (keep project preselect).
      setParams(seedDefaults(action.fields));
      if (action.requiresProject && !presetProjectId) setProjectId('');
      onApplied?.();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Apply failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-foreground">{action.label}</h3>
        <p className="text-sm text-muted-foreground">{action.description}</p>
        <div className="flex flex-wrap gap-2 pt-1 text-xs">
          <Badge variant="outline" className="capitalize">{action.scope}</Badge>
          <Badge variant="outline">Tier {action.tier}</Badge>
          <Badge variant="outline" className="capitalize">
            {action.leverCategory.replace(/_/g, ' ')}
          </Badge>
          {action.informational && (
            <Badge
              variant="outline"
              className="border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400"
            >
              Informational
            </Badge>
          )}
        </div>
      </div>

      {action.requiresProject && !presetProjectId && (
        <FieldRow label="Project" required>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select a project…" />
            </SelectTrigger>
            <SelectContent>
              {projectOptions.length === 0 ? (
                <div className="px-2 py-1.5 text-sm text-muted-foreground">
                  No projects in scope.
                </div>
              ) : (
                projectOptions.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </FieldRow>
      )}

      {visibleFields.map((f) => (
        <FieldRow
          key={f.key}
          label={f.label}
          required={f.required}
          helpText={f.helpText}
        >
          {renderField(f, params, refs, (key, value) =>
            setParams((prev) => {
              const next = { ...prev, [key]: value };
              // Clear dependent values when their parent changes.
              for (const fd of action.fields) {
                if (fd.dependsOn?.field === key) {
                  delete next[fd.key];
                }
              }
              return next;
            }),
          )}
        </FieldRow>
      ))}

      {submitError && (
        <div
          role="alert"
          className="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {submitError}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        )}
        <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {action.informational ? 'Run gap analysis' : 'Apply action'}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function seedDefaults(fields: FieldDefinition[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    if (f.defaultValue !== undefined) out[f.key] = f.defaultValue;
  }
  return out;
}

function isFieldVisible(
  field: FieldDefinition,
  params: Record<string, string>,
): boolean {
  if (!field.dependsOn) return true;
  const v = params[field.dependsOn.field];
  return v !== undefined && field.dependsOn.equals.includes(v);
}

function collectSources(action: ActionDefinition): Set<ReferenceSource> {
  const out = new Set<ReferenceSource>();
  for (const f of action.fields) {
    if (f.referenceSource) out.add(f.referenceSource);
  }
  // Dependent multi-selects (Apply Escalation scope_values) need any of
  // role / cost_center / location depending on scope_type.
  const hasDependentMulti = action.fields.some(
    (f) => f.type === 'multi-select' && f.dependsOn,
  );
  if (hasDependentMulti) {
    out.add('roles');
    out.add('cost_centers');
    out.add('locations');
  }
  return out;
}

async function loadReferences(
  sources: Set<ReferenceSource>,
): Promise<Partial<RefBundle>> {
  const bundle: Partial<RefBundle> = {};
  const tasks: Promise<void>[] = [];

  if (sources.has('roles')) {
    tasks.push(
      referenceApi
        .getRoles()
        .then((res) => {
          bundle.roles = res.items.map((r) => ({ value: r.id, label: r.name }));
        })
        .catch(() => undefined),
    );
  }
  if (sources.has('cost_centers')) {
    tasks.push(
      referenceApi
        .getCostCenters()
        .then((res) => {
          bundle.cost_centers = res.items.map((c) => ({
            value: c.id,
            label: c.name,
          }));
        })
        .catch(() => undefined),
    );
  }
  if (sources.has('locations')) {
    tasks.push(
      referenceApi
        .getLocations()
        .then((res) => {
          bundle.locations = res.items.map((l) => ({
            value: l.id,
            label: l.city ?? l.id,
          }));
        })
        .catch(() => undefined),
    );
  }
  if (sources.has('cost_types')) {
    tasks.push(
      referenceApi
        .getCostTypes()
        .then((res) => {
          bundle.cost_types = res.items.map((t) => ({
            value: t.id,
            label: t.name,
          }));
        })
        .catch(() => undefined),
    );
  }
  if (sources.has('hierarchy_nodes')) {
    tasks.push(
      adminApi
        .getActiveHierarchy()
        .then((res) => {
          bundle.hierarchy_nodes = flattenHierarchy(res.entities ?? []);
        })
        .catch(() => undefined),
    );
  }
  await Promise.all(tasks);
  return bundle;
}

interface HierarchyNode {
  id: string;
  name: string;
  children?: unknown[];
}

function flattenHierarchy(entities: unknown[]): FieldOption[] {
  const out: FieldOption[] = [];
  const walk = (nodes: unknown[], depth: number) => {
    for (const raw of nodes) {
      const n = raw as HierarchyNode;
      out.push({
        value: n.id,
        label: `${'— '.repeat(depth)}${n.name}`,
      });
      if (Array.isArray(n.children) && n.children.length > 0) {
        walk(n.children, depth + 1);
      }
    }
  };
  walk(entities, 0);
  return out;
}

function renderField(
  field: FieldDefinition,
  params: Record<string, string>,
  refs: RefBundle,
  onChange: (key: string, value: string) => void,
) {
  const value = params[field.key] ?? '';

  if (field.type === 'select') {
    const opts = resolveOptions(field, refs);
    return (
      <Select value={value} onValueChange={(v) => onChange(field.key, v)}>
        <SelectTrigger className="h-9">
          <SelectValue placeholder={field.placeholder ?? 'Select…'} />
        </SelectTrigger>
        <SelectContent>
          {opts.length === 0 ? (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">
              No options available.
            </div>
          ) : (
            opts.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    );
  }

  if (field.type === 'multi-select') {
    const opts = resolveMultiSelectOptions(field, params, refs);
    const selected = new Set((value ? value.split(',') : []).filter(Boolean));
    const toggle = (v: string) => {
      const next = new Set(selected);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      onChange(field.key, Array.from(next).join(','));
    };
    return (
      <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto rounded-md border bg-background p-2">
        {opts.length === 0 ? (
          <span className="text-sm text-muted-foreground">
            Select a scope dimension above to populate options.
          </span>
        ) : (
          opts.map((o) => (
            <label
              key={o.value}
              className="flex items-center gap-2 text-sm text-foreground"
            >
              <Checkbox
                checked={selected.has(o.value)}
                onCheckedChange={() => toggle(o.value)}
              />
              {o.label}
            </label>
          ))
        )}
      </div>
    );
  }

  if (field.type === 'textarea') {
    return (
      <Textarea
        value={value}
        placeholder={field.placeholder}
        onChange={(e) => onChange(field.key, e.target.value)}
        rows={3}
      />
    );
  }

  // number / percent / currency / text / month
  const inputType =
    field.type === 'number' || field.type === 'percent' || field.type === 'currency'
      ? 'number'
      : 'text';
  return (
    <Input
      type={inputType}
      value={value}
      placeholder={field.placeholder}
      onChange={(e) => onChange(field.key, e.target.value)}
      min={field.min}
      max={field.max}
      step={field.type === 'percent' || field.type === 'number' ? 'any' : undefined}
    />
  );
}

function lookupRef(
  refs: RefBundle,
  source: ReferenceSource,
): FieldOption[] {
  switch (source) {
    case 'roles':
      return refs.roles;
    case 'cost_centers':
      return refs.cost_centers;
    case 'locations':
      return refs.locations;
    case 'cost_types':
      return refs.cost_types;
    case 'hierarchy_nodes':
      return refs.hierarchy_nodes;
    case 'rate_tables':
      return refs.rate_tables;
    case 'project_types':
      return refs.project_types;
    case 'transformation_levels':
      return refs.transformation_levels;
    case 'projects':
      // Projects come from `detail.project_states` via the project picker;
      // catalogue fields don't currently use this source directly.
      return [];
  }
}

function resolveOptions(field: FieldDefinition, refs: RefBundle): FieldOption[] {
  if (field.options) return field.options;
  if (field.referenceSource) {
    return lookupRef(refs, field.referenceSource);
  }
  return [];
}

function resolveMultiSelectOptions(
  field: FieldDefinition,
  params: Record<string, string>,
  refs: RefBundle,
): FieldOption[] {
  if (field.options) return field.options;
  if (field.referenceSource) return lookupRef(refs, field.referenceSource);

  // Implicit dependsOn-driven sources used by Apply Escalation.
  if (field.dependsOn?.field === 'scope_type') {
    const v = params['scope_type'];
    if (v === 'role') return refs.roles;
    if (v === 'cost_center') return refs.cost_centers;
    if (v === 'location') return refs.locations;
  }
  return [];
}

function buildSubmission(
  action: ActionDefinition,
  params: Record<string, string>,
  projectId: string,
): CatalogueActionSubmission {
  const parameters: Record<string, unknown> = {};
  for (const f of action.fields) {
    if (!isFieldVisible(f, params)) continue;
    const raw = params[f.key];
    if (raw === undefined || raw === '') continue;
    parameters[f.key] = coerceFieldValue(f, raw);
  }
  return {
    scope: action.scope,
    action_type: action.actionType,
    project_id: action.requiresProject ? projectId : undefined,
    parameters,
    lever_category: action.leverCategory,
    tier: action.tier,
  };
}

function coerceFieldValue(field: FieldDefinition, raw: string): unknown {
  if (field.type === 'multi-select') {
    return raw.split(',').filter(Boolean);
  }
  if (field.type === 'number' || field.type === 'percent' || field.type === 'currency') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw;
  }
  return raw;
}

interface FieldRowProps {
  label: string;
  required?: boolean;
  helpText?: string;
  children: ReactNode;
}

function FieldRow({ label, required, helpText, children }: FieldRowProps) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </label>
      {children}
      {helpText && <p className="text-xs text-muted-foreground">{helpText}</p>}
    </div>
  );
}
