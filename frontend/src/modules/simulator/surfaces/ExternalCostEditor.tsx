/**
 * Project-scope Session 3 — T2 external-cost line-item editor.
 *
 * Mounted as one child of `ForecastGridSurface`. Lists the project's external-
 * cost line items under the scenario (anchor + overlay resolved) and lets the
 * author add / edit / remove them — editing vendor, category (cost-type rollup),
 * description, and CapEx/OpEx (spec §3 item 5; the line item is the unit of
 * edit, category is a rollup grouping). Per-month € is entered on the forecast
 * grid itself; this surface manages line structure + metadata.
 *
 * Reads/writes flow through `useExternalCostEdits` → ScenarioContext T2
 * mutations (which mark the scenario stale + append a change-feed entry like the
 * cell path). Pure form logic lives in `externalCostForm.ts`.
 *
 * Write controls render only for the scenario author (backend also gates on
 * controller/executive ownership; viewers get the read-only list).
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { formatCurrencyDetailed } from '@/lib/formatters';
import { useScenarioContext } from '../useScenarioContext';
import { useExternalCostEdits } from './forecast-grid/useExternalCostEdits';
import {
  CAPEX_OPEX_OPTIONS,
  EMPTY_EXTERNAL_COST_FORM,
  buildExternalCostUpdate,
  capexLabel,
  externalLineLabel,
  formFromItem,
  validateExternalCostCreate,
  type ExternalCostFormState,
} from './forecast-grid/externalCostForm';
import type {
  ExternalCostLineItem,
  ExternalCostTypeOption,
} from '../api/scenariosApi';

interface Props {
  projectId: string;
  /** Bumped by the parent to refetch the grid after a structural change. */
  onStructureChange?: () => void;
}

const CAPEX_NONE = 'none';

interface LineFormProps {
  form: ExternalCostFormState;
  setForm: (f: ExternalCostFormState) => void;
  costTypes: ExternalCostTypeOption[];
  busy: boolean;
  submitLabel: string;
  onSubmit: () => void;
  onCancel: () => void;
}

function LineForm({
  form, setForm, costTypes, busy, submitLabel, onSubmit, onCancel,
}: LineFormProps) {
  return (
    <div className="rounded-md border border-border bg-muted/40 p-3 space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Category (cost type)</label>
          <Select
            value={form.cost_type_id || undefined}
            onValueChange={(v) => setForm({ ...form, cost_type_id: v })}
          >
            <SelectTrigger className="h-8">
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent>
              {costTypes.map((ct) => (
                <SelectItem key={ct.id} value={ct.id}>
                  {ct.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">CapEx / OpEx</label>
          <Select
            value={form.capex_opex || CAPEX_NONE}
            onValueChange={(v) =>
              setForm({ ...form, capex_opex: v === CAPEX_NONE ? '' : v })
            }
          >
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={CAPEX_NONE}>Not set</SelectItem>
              {CAPEX_OPEX_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Vendor</label>
          <Input
            className="h-8"
            value={form.vendor}
            placeholder="e.g. Globex"
            onChange={(e) => setForm({ ...form, vendor: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Description</label>
          <Input
            className="h-8"
            value={form.description}
            placeholder="Line item description"
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          <X className="mr-1 h-3.5 w-3.5" /> Cancel
        </Button>
        <Button size="sm" onClick={onSubmit} disabled={busy}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

export function ExternalCostEditor({ projectId, onStructureChange }: Props) {
  const { isOwner } = useScenarioContext();
  const {
    items, costTypes, loading, busy, error, clearError, add, edit, remove,
  } = useExternalCostEdits(projectId, onStructureChange);

  const [addOpen, setAddOpen] = useState(false);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [form, setForm] = useState<ExternalCostFormState>(EMPTY_EXTERNAL_COST_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const resetForms = () => {
    setAddOpen(false);
    setEditKey(null);
    setForm(EMPTY_EXTERNAL_COST_FORM);
    setFormError(null);
    clearError();
  };

  const openAdd = () => {
    clearError();
    setEditKey(null);
    setForm(EMPTY_EXTERNAL_COST_FORM);
    setFormError(null);
    setAddOpen(true);
  };

  const openEdit = (item: ExternalCostLineItem) => {
    clearError();
    setAddOpen(false);
    setForm(formFromItem(item));
    setFormError(null);
    setEditKey(item.line_key);
  };

  const submitAdd = async () => {
    const res = validateExternalCostCreate(form);
    if (!res.ok) {
      setFormError(res.error);
      return;
    }
    if (await add(res.body)) resetForms();
  };

  const submitEdit = async (item: ExternalCostLineItem) => {
    const res = buildExternalCostUpdate(form, item);
    if (!res.ok) {
      setFormError(res.error);
      return;
    }
    if (await edit(item.line_key, res.body)) resetForms();
  };

  return (
    <div className="rounded-lg border border-border p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium text-foreground">External costs</h4>
          <p className="text-xs text-muted-foreground">
            Add, remove, or edit external-cost line items (vendor, category,
            description). Per-month € is entered on the grid above.
          </p>
        </div>
        {isOwner && !addOpen && (
          <Button size="sm" variant="outline" onClick={openAdd} disabled={busy}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add line
          </Button>
        )}
      </div>

      {(error || formError) && (
        <p className="text-xs text-destructive">{formError ?? error}</p>
      )}

      {isOwner && addOpen && (
        <LineForm
          form={form}
          setForm={setForm}
          costTypes={costTypes}
          busy={busy}
          submitLabel="Add line"
          onSubmit={submitAdd}
          onCancel={resetForms}
        />
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading external costs…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No external-cost line items for this project.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) =>
            isOwner && editKey === item.line_key ? (
              <li key={item.line_key} className="py-2">
                <LineForm
                  form={form}
                  setForm={setForm}
                  costTypes={costTypes}
                  busy={busy}
                  submitLabel="Save changes"
                  onSubmit={() => submitEdit(item)}
                  onCancel={resetForms}
                />
              </li>
            ) : (
              <li
                key={item.line_key}
                className="flex items-center justify-between gap-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {externalLineLabel(item)}
                    </span>
                    {item.vendor && (
                      <span className="text-sm text-muted-foreground">
                        {item.vendor}
                      </span>
                    )}
                    {capexLabel(item.capex_opex) && (
                      <Badge variant="outline">{capexLabel(item.capex_opex)}</Badge>
                    )}
                    {item.origin === 'added' && (
                      <Badge variant="secondary">Added</Badge>
                    )}
                  </div>
                  {item.description && (
                    <p className="truncate text-xs text-muted-foreground">
                      {item.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm tabular-nums text-foreground">
                    {formatCurrencyDetailed(item.total_eur)}
                  </span>
                  {isOwner && (
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(item)}
                        disabled={busy}
                        aria-label="Edit line"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(item.line_key)}
                        disabled={busy}
                        aria-label="Remove line"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
