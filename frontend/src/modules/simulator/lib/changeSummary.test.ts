/**
 * Unit coverage for the change-summary badge filter.
 *
 * The floating "Change summary" badge must count only the promotable diffs the
 * scenario carries against the live forecast — project-scope actions and the
 * cost-allocation surfaces. Metadata edits, lifecycle transitions (publish /
 * unpublish / archive / rebase), and the promote / apply workflow events are
 * recorded in the feed for context but are not diffs and must not inflate the
 * badge count.
 */
import { describe, expect, it } from 'vitest';

import { diffEntries, isPromotableKind } from './changeSummary';
import type { ChangeSummaryEntry, ChangeSummaryKind } from '../ScenarioContext';

function entry(kind: ChangeSummaryKind, id: string): ChangeSummaryEntry {
  return { id, kind, label: kind, timestamp: 0 };
}

describe('isPromotableKind — change-summary kind taxonomy', () => {
  it('treats action + every cost_allocation_* kind as promotable', () => {
    expect(isPromotableKind('action')).toBe(true);
    expect(isPromotableKind('cost_allocation_distribution')).toBe(true);
    expect(isPromotableKind('cost_allocation_btc')).toBe(true);
    expect(isPromotableKind('cost_allocation_to_business')).toBe(true);
  });

  it('treats metadata / lifecycle / promote / apply as non-promotable', () => {
    expect(isPromotableKind('metadata')).toBe(false);
    expect(isPromotableKind('lifecycle')).toBe(false);
    expect(isPromotableKind('promote')).toBe(false);
    expect(isPromotableKind('apply')).toBe(false);
  });
});

describe('diffEntries — change-summary badge filter', () => {
  it('keeps only promotable entries, in order', () => {
    const entries: ChangeSummaryEntry[] = [
      entry('action', 'a1'),
      entry('lifecycle', 'l1'),
      entry('cost_allocation_distribution', 'd1'),
      entry('lifecycle', 'l2'),
    ];
    const diffs = diffEntries(entries);
    expect(diffs).toHaveLength(2);
    expect(diffs.map((e) => e.id)).toEqual(['a1', 'd1']);
  });

  it('excludes metadata / promote / apply (workflow noise, not diffs)', () => {
    const entries: ChangeSummaryEntry[] = [
      entry('metadata', 'm1'),
      entry('promote', 'p1'),
      entry('apply', 'ap1'),
    ];
    expect(diffEntries(entries)).toHaveLength(0);
  });

  it('returns an empty array when only non-promotable events are present', () => {
    const entries: ChangeSummaryEntry[] = [
      entry('lifecycle', 'l1'),
      entry('metadata', 'm1'),
    ];
    expect(diffEntries(entries)).toHaveLength(0);
  });

  it('returns an empty array for no entries', () => {
    expect(diffEntries([])).toHaveLength(0);
  });
});
