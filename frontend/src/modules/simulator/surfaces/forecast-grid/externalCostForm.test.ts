import { describe, it, expect } from 'vitest';
import type { ExternalCostLineItem } from '../../api/scenariosApi';
import {
  EMPTY_EXTERNAL_COST_FORM,
  buildExternalCostUpdate,
  capexLabel,
  externalLineLabel,
  formFromItem,
  validateExternalCostCreate,
  type ExternalCostFormState,
} from './externalCostForm';

const ITEM: ExternalCostLineItem = {
  line_key: 'external|ext-lic|',
  cost_type_id: 'ext-lic',
  cost_type_name: 'Software Licenses',
  vendor: 'Globex',
  description: 'Annual licence',
  capex_opex: 'opex',
  total_eur: 5000,
  origin: 'anchor',
};

describe('validateExternalCostCreate', () => {
  it('requires a category (cost type)', () => {
    const res = validateExternalCostCreate(EMPTY_EXTERNAL_COST_FORM);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/category/i);
  });

  it('trims fields and maps empty optionals to null', () => {
    const form: ExternalCostFormState = {
      cost_type_id: ' ext-cons ',
      vendor: '  ',
      description: ' Help ',
      capex_opex: '',
    };
    const res = validateExternalCostCreate(form);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.body).toEqual({
        cost_type_id: 'ext-cons',
        vendor: null,
        description: 'Help',
        capex_opex: null,
      });
    }
  });

  it('rejects a bogus capex/opex value', () => {
    const res = validateExternalCostCreate({
      ...EMPTY_EXTERNAL_COST_FORM,
      cost_type_id: 'ext-cons',
      capex_opex: 'bogus',
    });
    expect(res.ok).toBe(false);
  });

  it('passes a valid capex value through', () => {
    const res = validateExternalCostCreate({
      cost_type_id: 'ext-cons',
      vendor: 'Initech',
      description: '',
      capex_opex: 'capex',
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.body.capex_opex).toBe('capex');
  });
});

describe('buildExternalCostUpdate', () => {
  it('returns only the changed fields', () => {
    const form = formFromItem(ITEM);
    form.vendor = 'Umbrella';
    const res = buildExternalCostUpdate(form, ITEM);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.body).toEqual({ vendor: 'Umbrella' });
  });

  it('changes the cost-type grouping when edited', () => {
    const form = formFromItem(ITEM);
    form.cost_type_id = 'ext-cons';
    const res = buildExternalCostUpdate(form, ITEM);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.body).toEqual({ cost_type_id: 'ext-cons' });
  });

  it('clears a field to null when emptied', () => {
    const form = formFromItem(ITEM);
    form.description = '';
    const res = buildExternalCostUpdate(form, ITEM);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.body).toEqual({ description: null });
  });

  it('rejects a no-op edit', () => {
    const res = buildExternalCostUpdate(formFromItem(ITEM), ITEM);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/no changes/i);
  });

  it('does not re-send the cost_type when it is unchanged but blanked-then-same', () => {
    // cost_type_id stays 'ext-lic' (blank guard: empty cost is ignored on edit).
    const form = formFromItem(ITEM);
    form.cost_type_id = '';
    form.vendor = 'Hooli';
    const res = buildExternalCostUpdate(form, ITEM);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.body.cost_type_id).toBeUndefined();
      expect(res.body.vendor).toBe('Hooli');
    }
  });

  it('rejects a bogus capex on edit', () => {
    const form = formFromItem(ITEM);
    form.capex_opex = 'bogus';
    const res = buildExternalCostUpdate(form, ITEM);
    expect(res.ok).toBe(false);
  });
});

describe('display helpers', () => {
  it('labels a line by its cost-type name', () => {
    expect(externalLineLabel(ITEM)).toBe('Software Licenses');
  });

  it('falls back to cost_type_id then Uncategorised', () => {
    expect(externalLineLabel({ ...ITEM, cost_type_name: null })).toBe('ext-lic');
    expect(
      externalLineLabel({ ...ITEM, cost_type_name: null, cost_type_id: null }),
    ).toBe('Uncategorised');
  });

  it('maps capex/opex to a human badge label (null otherwise)', () => {
    expect(capexLabel('capex')).toBe('CapEx');
    expect(capexLabel('opex')).toBe('OpEx');
    expect(capexLabel(null)).toBeNull();
  });
});
