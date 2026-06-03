/**
 * Project-scope Session 3 — T2 external-cost editor: pure form logic.
 *
 * Extracted from `ExternalCostEditor.tsx` so the add/edit/validation rules are
 * unit-testable without a DOM (the repo's forecast-grid tests are pure-function
 * by convention). The component owns only React state + rendering and delegates
 * every decision (validate, diff, label) to these helpers.
 */
import type {
  ExternalCostLineCreateBody,
  ExternalCostLineItem,
  ExternalCostLineUpdateBody,
} from '../../api/scenariosApi';

export interface ExternalCostFormState {
  cost_type_id: string;
  vendor: string;
  description: string;
  capex_opex: string; // '' (unset) | 'capex' | 'opex'
}

export const EMPTY_EXTERNAL_COST_FORM: ExternalCostFormState = {
  cost_type_id: '',
  vendor: '',
  description: '',
  capex_opex: '',
};

export const CAPEX_OPEX_OPTIONS = [
  { value: 'capex', label: 'CapEx' },
  { value: 'opex', label: 'OpEx' },
] as const;

/** Display label for a line: the cost-type (category) name, falling back to its
 * id, then a generic "Uncategorised". Vendor is shown separately. */
export function externalLineLabel(item: ExternalCostLineItem): string {
  return item.cost_type_name ?? item.cost_type_id ?? 'Uncategorised';
}

/** Human label for a stored capex/opex value (null → no badge). */
export function capexLabel(value: string | null): string | null {
  if (value === 'capex') return 'CapEx';
  if (value === 'opex') return 'OpEx';
  return null;
}

function trimOrNull(s: string): string | null {
  const t = s.trim();
  return t === '' ? null : t;
}

function isValidCapex(v: string): boolean {
  return v === '' || v === 'capex' || v === 'opex';
}

export type CreateResult =
  | { ok: true; body: ExternalCostLineCreateBody }
  | { ok: false; error: string };

/** Validate + build the create body. Category (cost type) is required. */
export function validateExternalCostCreate(
  form: ExternalCostFormState,
): CreateResult {
  if (form.cost_type_id.trim() === '') {
    return { ok: false, error: 'Select a category (cost type).' };
  }
  if (!isValidCapex(form.capex_opex)) {
    return { ok: false, error: 'CapEx/OpEx is invalid.' };
  }
  return {
    ok: true,
    body: {
      cost_type_id: form.cost_type_id.trim(),
      vendor: trimOrNull(form.vendor),
      description: trimOrNull(form.description),
      capex_opex: form.capex_opex === '' ? null : form.capex_opex,
    },
  };
}

export type UpdateResult =
  | { ok: true; body: ExternalCostLineUpdateBody }
  | { ok: false; error: string };

/** Build a partial update carrying ONLY the fields that changed vs the current
 * item (empty string clears a field → null). Rejects a no-op edit. */
export function buildExternalCostUpdate(
  form: ExternalCostFormState,
  item: ExternalCostLineItem,
): UpdateResult {
  if (!isValidCapex(form.capex_opex)) {
    return { ok: false, error: 'CapEx/OpEx is invalid.' };
  }
  const body: ExternalCostLineUpdateBody = {};

  const cost = form.cost_type_id.trim();
  if (cost !== '' && cost !== (item.cost_type_id ?? '')) {
    body.cost_type_id = cost;
  }
  const vendor = form.vendor.trim();
  if (vendor !== (item.vendor ?? '')) {
    body.vendor = vendor === '' ? null : vendor;
  }
  const desc = form.description.trim();
  if (desc !== (item.description ?? '')) {
    body.description = desc === '' ? null : desc;
  }
  if (form.capex_opex !== (item.capex_opex ?? '')) {
    body.capex_opex = form.capex_opex === '' ? null : form.capex_opex;
  }

  if (Object.keys(body).length === 0) {
    return { ok: false, error: 'No changes to save.' };
  }
  return { ok: true, body };
}

/** Seed the edit form from an existing item. */
export function formFromItem(item: ExternalCostLineItem): ExternalCostFormState {
  return {
    cost_type_id: item.cost_type_id ?? '',
    vendor: item.vendor ?? '',
    description: item.description ?? '',
    capex_opex: item.capex_opex ?? '',
  };
}
